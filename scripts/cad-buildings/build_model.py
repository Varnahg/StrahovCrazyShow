"""Sestaví samostatný editovatelný model z lokálně připravené CAD receptury.

Spouští se Blenderem. Původní výkresy se do modelu ani do exportu nebalí.
Konstrukční kolize vznikají z přesně stejného vyhodnoceného meshe jako GLB.
"""
import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

sys.path.insert(0,str(Path(__file__).resolve().parent))
from model_io import contained, publish_files, recover_pending
from model_geometry import BUILDING_OSM_IDS, building_identity, ceiling_clipped_faces, quantized_face, stair_profile, stair_levels, skew_stair, interactive_door_definition
from door_export_audit import validate_closed_door_export


MATERIALS = {
    "plaster": ((0.72, 0.70, 0.64, 1), 0.86, 0),
    "concrete": ((0.39, 0.40, 0.38, 1), 0.9, 0),
    "floor": ((0.47, 0.46, 0.42, 1), 0.68, 0),
    "roof": ((0.19, 0.21, 0.21, 1), 0.92, 0),
    "frame": ((0.47, 0.48, 0.46, 1), 0.47, 0.12),
    "gasket": ((0.025, 0.03, 0.03, 1), 0.8, 0),
    "glass": ((0.22, 0.35, 0.38, 0.28), 0.13, 0.05),
    "light-infill": ((0.68, 0.70, 0.67, 1), 0.48, 0.05),
    "door": ((0.30, 0.20, 0.105, 1), 0.66, 0),
    "metal": ((0.18, 0.20, 0.21, 1), 0.43, 0.7),
    "handrail": ((0.20, 0.095, 0.04, 1), 0.57, 0),
}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    source=parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--recipe", type=Path)
    source.add_argument("--from-blend", type=Path, help="Vyexportovat uložený editovaný master bez původních CAD souborů")
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--collision", type=Path, required=True)
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--texture-overrides", type=Path, help="Local authored texture manifest; images are packed in the native master")
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


class Geometry:
    """Jedna editovatelná síť na podlaží/roli/materiál, nikoli objekt na každý šroub."""
    def __init__(self, origin, finishes=None, interactive_doors=False):
        self.origin = origin
        self.finishes = finishes
        self.groups = {}
        self.counts = defaultdict(int)
        self.interactive_doors = {} if interactive_doors else None
        self.active_door_id = None

    def at(self, point, height):
        return (-(point[1] - self.origin[1]), point[0] - self.origin[0], height)

    def face(self, key, points, uv_frame=None, material_override=None):
        if self.active_door_id is not None:
            key = (*key, self.active_door_id)
        points = quantized_face(points)
        if not points:
            self.counts['removedCollapsedFaces'] += 1
            return
        group = self.groups.setdefault(key, {"vertices": [], "faces": [], "faceMaterials": [], "faceUVFrames": [], "lookup": {}, "faceLookup": {}})
        indices = []
        for point in points:
            if point not in group["lookup"]:
                group["lookup"][point] = len(group["vertices"])
                group["vertices"].append(point)
            indices.append(group["lookup"][point])
        if len(set(indices)) >= 3:
            identity=tuple(sorted(indices))
            prior=group['faceLookup'].get(identity)
            if prior is not None:
                previous=group['faces'][prior]
                def cycle(face):
                    start=face.index(min(face))
                    return tuple(face[start:]+face[:start])
                if cycle(previous)==cycle(list(reversed(indices))):
                    group['faces'][prior]=None
                    del group['faceLookup'][identity]
                    self.counts['removedInternalFaces']+=2
                else:
                    self.counts['removedDuplicateFaces']+=1
                return
            group['faceLookup'][identity]=len(group['faces'])
            group["faces"].append(indices)
            group['faceMaterials'].append(material_override or (self.finishes.face_material(key[0],key[1],points,key[2]) if self.finishes else key[2]))
            group['faceUVFrames'].append(uv_frame)

    def solid(self, floor, spec):
        bottom, top = spec["bottom"], spec["top"]
        if top <= bottom:
            raise ValueError("Neplatná výška " + spec["id"])
        role = spec["role"]
        key = (floor, role, spec["material"], bool(spec.get("collision", True)))
        if 'ceilingPlane' in spec:
            for face in ceiling_clipped_faces(spec['triangles'], bottom, top, spec['ceilingPlane']):
                self.face(key, [self.at(point[:2], point[2]) for point in face])
            self.counts[role] += 1
            return
        for triangle in spec["triangles"]:
            area = sum(triangle[i][0] * triangle[(i+1) % 3][1] - triangle[(i+1) % 3][0] * triangle[i][1] for i in range(3))
            if abs(area) < 1e-10:
                continue
            triangle = triangle if area > 0 else list(reversed(triangle))
            if 'topSurfacePartitions' not in spec:
                self.face(key, [self.at(p, top) for p in triangle])
            self.face(key, [self.at(p, bottom) for p in reversed(triangle)])
        for partition in spec.get('topSurfacePartitions', []):
            for triangle in partition['triangles']:
                area = sum(triangle[i][0]*triangle[(i+1)%3][1]-triangle[(i+1)%3][0]*triangle[i][1] for i in range(3))
                if abs(area) < 1e-10:
                    continue
                triangle = triangle if area > 0 else list(reversed(triangle))
                points = [self.at(p, top) for p in triangle]
                # Same physical slab, one surface. Material role affects only
                # the top face, never the collision shape or floor height.
                material = self.finishes.face_material(floor, partition.get('role', role), points, partition['material']) if self.finishes else partition['material']
                self.face(key, points, material_override=material)
        for ring_index, ring in enumerate(spec["loops"]):
            if ring[0] == ring[-1]:
                ring = ring[:-1]
            area = sum(ring[i][0] * ring[(i+1) % len(ring)][1] - ring[(i+1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
            if (area > 0) != (ring_index == 0):
                ring = list(reversed(ring))
            for a, b in zip(ring, ring[1:] + ring[:1]):
                self.face(key, [self.at(a, bottom), self.at(b, bottom), self.at(b, top), self.at(a, top)])
        self.counts[role] += 1

    def prism(self, key, a, b, width, bottom, top):
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dy)
        if min(length, width, top-bottom) <= 0:
            raise ValueError("Neplatný hranol " + str(key))
        nx, ny = -dy / length * width / 2, dx / length * width / 2
        ring = [(a[0]-nx, a[1]-ny), (b[0]-nx, b[1]-ny), (b[0]+nx, b[1]+ny), (a[0]+nx, a[1]+ny)]
        self.face(key, [self.at(p, bottom) for p in reversed(ring)])
        self.face(key, [self.at(p, top) for p in ring])
        for p, q in zip(ring, ring[1:] + ring[:1]):
            self.face(key, [self.at(p, bottom), self.at(q, bottom), self.at(q, top), self.at(p, top)])

    def beam(self, key, a, b, width, depth=None):
        a, b = Vector(a), Vector(b)
        direction = b-a
        if direction.length < 1e-7:
            return
        direction.normalize()
        side = direction.cross(Vector((0, 0, 1)))
        if side.length < 0.01:
            side = direction.cross(Vector((0, 1, 0)))
        side.normalize()
        up = side.cross(direction).normalized()
        side *= width/2
        up *= (depth or width)/2
        p = [a-side-up, a+side-up, a+side+up, a-side+up,
             b-side-up, b+side-up, b+side+up, b-side+up]
        for face in [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
            self.face(key, [p[i] for i in reversed(face)])

    def glazed_panel(self, floor, a, b, bottom, top, prefix='window', lower_infill=0, glass_collision=True):
        """Rámovaná sestava; spodní světlá výplň není automaticky čiré sklo."""
        direction = Vector((b[0]-a[0], b[1]-a[1]))
        length = direction.length
        if length < 0.12 or top-bottom < 0.2:
            raise ValueError("Příliš malá prosklená sestava")
        if not math.isfinite(lower_infill) or lower_infill<0 or (0<lower_infill<0.10) or lower_infill>top-bottom-0.15:
            raise ValueError('Výplň přesahuje prosklenou sestavu')
        direction.normalize()
        def inset(distance):
            return [a[0]+direction.x*distance, a[1]+direction.y*distance]
        frame = (floor, prefix+"-frame", "frame", False)
        glass = (floor, prefix+"-glass", "glass", glass_collision)
        gasket = (floor, prefix+"-gasket", "gasket", False)
        trim = 0.045
        for start, end in [(a, inset(trim)), (inset(length-trim), b)]:
            self.prism(frame, start, end, 0.10, bottom, top)
        for z in [bottom, top-trim]:
            self.prism(frame, a, b, 0.10, z, z+trim)
        self.prism(gasket, inset(trim), inset(length-trim), 0.018, bottom+trim, bottom+trim+0.012)
        self.prism(gasket, inset(trim), inset(length-trim), 0.018, top-trim-0.012, top-trim)
        if lower_infill:
            split=bottom+lower_infill
            self.prism((floor,prefix+'-infill','light-infill',True),inset(trim),inset(length-trim),
                       0.018,bottom+trim,split)
            self.prism(frame,a,b,0.075,split-0.018,split+0.018)
        else:
            split=bottom+trim
        self.prism(glass, inset(trim), inset(length-trim), 0.008, split, top-trim)
        if length > 1.6:
            middle = length/2
            self.prism(frame, inset(middle-0.018), inset(middle+0.018), 0.075, bottom+trim, top-trim)

    def window(self, floor, window):
        a,b=window['a'],window['b'];bottom,top=window['bottom'],window['top']
        plane_offset=window.get('windowPlaneNormalOffset',0)
        if plane_offset:
            direction=Vector((b[0]-a[0],b[1]-a[1])).normalized()
            a=[a[0]-direction.y*plane_offset,a[1]+direction.x*plane_offset]
            b=[b[0]-direction.y*plane_offset,b[1]+direction.x*plane_offset]
        self.glazed_panel(floor,a,b,bottom,top,lower_infill=window.get('lowerInfillHeight',0))
        if 'sill' in window:
            if window['sill'] is not None:
                self.solid(floor, {**window['sill'], 'id':window['id']+'-sill', 'role':'window-sill', 'material':'concrete', 'collision':True})
            self.counts['windows'] += 1
            return
        direction=Vector((b[0]-a[0],b[1]-a[1])).normalized()
        sill_depth = min(0.65, max(0.2, window.get("depth", 0.38)+0.1))
        offset=window.get('normalOffset',0)
        sill_a=[a[0]-direction.y*offset,a[1]+direction.x*offset]
        sill_b=[b[0]-direction.y*offset,b[1]+direction.x*offset]
        self.prism((floor, "window-sill", "concrete", False), sill_a, sill_b, sill_depth, bottom-0.035, bottom)
        self.counts["windows"] += 1

    def door(self, floor, door):
        hinge, end, opened = door["hinge"], door["closedEnd"], door["openEnd"]
        bottom, top = door["bottom"], door["top"]
        direction = Vector((end[0]-hinge[0], end[1]-hinge[1]))
        width = direction.length
        if width < 0.3:
            raise ValueError("Neplatné dveře " + door["id"])
        direction.normalize()
        # Zárubeň sedí v ostění, nezužuje CAD otvor o další násobek tloušťky.
        frame = (floor, "door-frame", "frame", False)
        depth = max(0.04, door.get("depth", 0.13))
        offset=door.get('normalOffset',0)
        jamb_a=[hinge[0]-direction.y*offset,hinge[1]+direction.x*offset]
        jamb_b=[end[0]-direction.y*offset,end[1]+direction.x*offset]
        before = [jamb_a[0]-direction.x*0.035, jamb_a[1]-direction.y*0.035]
        after = [jamb_b[0]+direction.x*0.035, jamb_b[1]+direction.y*0.035]
        if door.get('frameOwnership') == 'recipe-solids':
            if not door.get('frameSolidIds'):
                raise ValueError('Dveře nemají konstrukčního vlastníka zárubně: '+door['id'])
        elif door.get('frameOwnership') is not None:
            raise ValueError('Neznámé vlastnictví zárubně: '+door['id'])
        else:
            self.prism(frame, before, jamb_a, depth, bottom, top+0.045)
            self.prism(frame, jamb_b, after, depth, bottom, top+0.045)
            self.prism(frame, before, after, depth, top, top+0.045)
        if door.get('openingClassification')=='facade-opening-unconfirmed-access':
            # CAD používá dveřní oblouky, IPR2023 ale ukazuje uzavřené prosklené
            # výplně bez balkonů. Viditelná výplň je zároveň skutečnou kolizí.
            self.glazed_panel(floor,jamb_a,jamb_b,bottom,top,prefix='facade')
            self.counts['fixedFacadeGlazing']+=1
            self.counts['doors']+=1
            return
        if door.get('openingClassification')=='fixed-paired-door-leaf':
            self.prism((floor,'fixed-door-leaf','door',True),jamb_a,jamb_b,.038,bottom+.015,top-.02)
            self.counts['fixedBedroomLeaves']+=1
            self.counts['doors']+=1
            return
        if self.interactive_doors is not None:
            definition = interactive_door_definition(self.origin, floor, door)
            self.interactive_doors[definition['id']] = definition
            self.active_door_id = definition['id']
            hinge, opened = jamb_a, jamb_b
        if door.get('leafMaterial')=='glass':
            # An open glazed leaf follows the same measured hinge/open end as
            # the other doors. It is not a fixed panel across the passage.
            self.glazed_panel(floor,hinge,opened,bottom+0.015,top-0.02,
                              prefix='door-leaf',glass_collision=False)
        else:
            self.prism((floor, "door-leaf", "door", False), hinge, opened, 0.038, bottom+0.015, top-0.02)
        leaf = Vector((opened[0]-hinge[0], opened[1]-hinge[1])).normalized()
        handle = [opened[0]-leaf.x*0.12, opened[1]-leaf.y*0.12]
        normal = [-leaf.y, leaf.x]
        for sign in [-1, 1]:
            h1 = [handle[0]+normal[0]*sign*0.032, handle[1]+normal[1]*sign*0.032]
            h2 = [h1[0]-leaf.x*0.11, h1[1]-leaf.y*0.11]
            self.prism((floor, "door-handle", "metal", False), h1, h2, 0.016, bottom+0.99, bottom+1.015)
        self.active_door_id = None
        self.counts["doors"] += 1

    def landing(self, floor, identifier, loops, triangles, height, minimum_riser=0, material='concrete'):
        # The landing front is the terminal riser of a measured flight.
        # Its construction must reach the final tread even for a 21–22cm rise.
        thickness = max(0.20, minimum_riser)
        if not math.isfinite(thickness) or minimum_riser < 0 or minimum_riser > 0.24 + 1e-9:
            raise ValueError('Neplatná návazná výška podesty '+identifier)
        self.solid(floor,{'id':identifier,'role':'stair-landing','material':material,
                         'loops':loops,'triangles':triangles,'bottom':height-thickness,'top':height,'collision':True})

    def flight(self, floor, flight_id, a, b, width, low, high, steps=None, handrail_material='handrail', riser_positions=None):
        """Uzavřená zalomená deska se stupni a šikmým podhledem; průchozí pod ní."""
        if high <= low:
            raise ValueError("Rameno musí být zadáno vzestupně")
        length = math.dist(a, b)
        section = stair_profile(length, low, high, steps, riser_positions)
        steps, rise, tread = section['steps'], section['riser'], section['tread']
        direction = Vector((b[0]-a[0], b[1]-a[1])).normalized()
        normal = Vector((-direction.y, direction.x))
        profile = section['profile']
        vectors = [Vector((u,z,0)) for u,z in profile]
        triangles = tessellate_polygon([vectors])
        key = (floor, "stair", "concrete", True)
        def at(u, z, side):
            point = [a[0]+direction.x*u+normal.x*side, a[1]+direction.y*u+normal.y*side]
            return self.at(point,z)
        for triangle in triangles:
            self.face(key,[at(vectors[i].x,vectors[i].y,-width/2) for i in reversed(triangle)])
            self.face(key,[at(vectors[i].x,vectors[i].y,width/2) for i in triangle])
        for p,q in zip(profile,profile[1:]+profile[:1]):
            self.face(key,[at(*p,-width/2),at(*q,-width/2),at(*q,width/2),at(*p,width/2)])
        for side in [-1,1]:
            rail = (floor, "stair-handrail", handrail_material, True)
            rail_low = low + 1.0 + (rise if riser_positions is not None else 0)
            rail_high = high + 1.0
            p=at(0,rail_low,side*(width/2-0.055));q=at(length,rail_high,side*(width/2-0.055))
            self.beam(rail,p,q,0.05,0.045)
            supports = [(u,low+i*rise) for i,u in enumerate(section['positions'])]
            if riser_positions is not None:
                supports = [(u,low+(i+1)*rise) for i,u in enumerate(section['positions'])]
            elif supports[-1][0] < length:
                supports.append((length,high))
            for i,(u,z) in enumerate(supports):
                if i%2 and i!=len(supports)-1:continue
                rail_z = rail_low + (rail_high-rail_low)*u/length
                self.beam((floor,"stair-baluster","metal",True),at(u,z,side*(width/2-0.055)),at(u,rail_z-0.02,side*(width/2-0.055)),0.025)
        self.counts["stairFlights"] += 1
        return {"id":flight_id,"floor":floor,"a":a,"b":b,"width":width,"bottom":low,"top":high,
                "steps":steps,"riser":rise,"tread":tread,"surfaces":section['surfaces'],
                "riserPositions":section['positions'],"measuredRiserPositions":riser_positions is not None,
                "terminalRiserOnLanding":section['terminalRiserOnLanding'],"soffit":section['soffit'],
                "heightProvenance":"modelářský odhad; půdorys CAD"}

    def edge_flight(self, floor, flight_id, edges, low, high, handrail_material='metal', max_riser=0.22):
        section=skew_stair(edges,low,high,max_riser)
        for face in section['faces']:
            self.face((floor,'stair','concrete',True),[self.at(point[:2],point[2]) for point in face])
        for side in [0,1]:
            points=[]
            for i,edge in enumerate(section['edges']):
                start=Vector(edge[side]);inward=(Vector(edge[1-side])-start).normalized()
                point=start+inward*0.055
                z=low+(i+1)*section['riser']
                points.append(self.at(point,z+1.0))
                if i%2==0 or i==len(section['edges'])-1:
                    self.beam((floor,'stair-baluster','metal',True),self.at(point,z),self.at(point,z+0.98),0.025)
            for a,b in zip(points,points[1:]):
                self.beam((floor,'stair-handrail',handrail_material,True),a,b,0.05,0.045)
        self.counts['stairFlights']+=1
        return {'id':flight_id,'floor':floor,'a':section['centers'][0],'b':section['centers'][-1],
                'width':min(section['widths']),'bottom':low,'top':high,'steps':section['steps'],
                'riser':section['riser'],'tread':section['tread'],'surfaces':section['surfaces'],
                'riserPositions':section['positions'],'measuredRiserPositions':True,'terminalRiserOnLanding':True,
                'frontEdgesCad':section['edges'],'riserPositionBasis':'distance along measured edge centers',
                'maxRiserHeight':max_riser,
                'heightProvenance':'modelářský odhad; přesné půdorysné hrany CAD'}


def make_material(name, building_id):
    color, roughness, metallic = MATERIALS.get(name, MATERIALS["plaster"])
    material = bpy.data.materials.new(building_id.upper() + " / " + name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Alpha"].default_value = color[3]
    material.diffuse_color = color
    material.use_backface_culling = True
    if color[3] < 1:
        material.surface_render_method = 'DITHERED'
        material.use_transparency_overlap = False
    material["provenance"] = "Autorská PBR interpretace; zdrojové fotografie nejsou texturou"
    return material


def create_meshes(geometry, root):
    building_id = root['buildingId']
    building_identity(building_id)
    materials = {name:make_material(name, building_id) for name in MATERIALS}
    if geometry.finishes:materials.update(geometry.finishes.create_materials())
    collections = {}
    objects = []
    for key, group in geometry.groups.items():
        floor, role, material, collision = key[:4]
        door_id = key[4] if len(key)>4 else None
        collection = collections.get(floor)
        if collection is None:
            collection = bpy.data.collections.new(building_id.upper() + " / " + floor)
            bpy.context.scene.collection.children.link(collection)
            collections[floor] = collection
        mesh = bpy.data.meshes.new(f"{building_id}:{floor}:{role}:{material}" + (':'+door_id if door_id else ''))
        faces=[(face,material_key,uv_frame) for face,material_key,uv_frame in zip(group['faces'],group['faceMaterials'],group['faceUVFrames']) if face is not None]
        mesh.from_pydata(group["vertices"], [], [face for face,_,_ in faces])
        mesh.update(calc_edges=True)
        if mesh.validate(verbose=False):
            raise ValueError("Blender musel opravit geometrii: " + mesh.name)
        obj = bpy.data.objects.new(mesh.name, mesh)
        collection.objects.link(obj)
        obj.parent = root
        obj["buildingId"] = building_id
        obj["floorId"] = floor
        obj["role"] = role
        obj["collision"] = collision
        if door_id:
            obj['doorId'] = door_id
            geometry.interactive_doors[door_id]['renderPartIds'].append(obj.name)
        slots=list(dict.fromkeys(material_key for _,material_key,_ in faces))
        slot_indices={key:index for index,key in enumerate(slots)}
        for material_key in slots:mesh.materials.append(materials.get(material_key,materials['plaster']))
        uv = mesh.uv_layers.new(name="UVMap")
        for polygon in mesh.polygons:
            material_key=faces[polygon.index][1]
            polygon.material_index=slot_indices[material_key]
            normal = polygon.normal
            axis = max(range(3),key=lambda i:abs(normal[i]))
            pair = [(1,2),(0,2),(0,1)][axis]
            points=[mesh.vertices[index].co for index in polygon.vertices]
            mapped=geometry.finishes.uv_for_face(floor,role,points,material_key,uv_frame=faces[polygon.index][2]) if geometry.finishes else None
            for corner,loop in enumerate(polygon.loop_indices):
                v = mesh.vertices[mesh.loops[loop].vertex_index].co
                uv.data[loop].uv = mapped[corner] if mapped is not None else (v[pair[0]]/1.5,v[pair[1]]/1.5)
            polygon.use_smooth = role=="column" and abs(normal.z)<0.01
        objects.append(obj)
    return objects


def audit_interactive_doors(objects, recipe):
    """Native geometry and physical metadata must agree before any publication.

    The explicit identity-matrix restriction prevents an edited master from
    silently exporting stale hinge/pose metadata while moving static geometry.
    """
    definitions = recipe.get('interactiveDoors')
    if definitions is None:return None
    depsgraph = bpy.context.evaluated_depsgraph_get()
    parts=[]
    for obj in objects:
        part={'id':obj.name,'doorId':obj.get('doorId'),'floor':obj.get('floorId'),
              'role':obj.get('role'),'collision':obj.get('collision')}
        if obj.get('doorId'):
            evaluated=obj.evaluated_get(depsgraph)
            mesh=evaluated.to_mesh()
            try:
                mesh.calc_loop_triangles()
                vertices=[]
                for vertex in mesh.vertices:
                    point=evaluated.matrix_world@vertex.co
                    vertices.append([point.x,point.z,-point.y])
                part.update(positions=vertices,indices=[i for tri in mesh.loop_triangles for i in tri.vertices],
                            matrixLocal=[list(row) for row in obj.matrix_local])
            finally:evaluated.to_mesh_clear()
        parts.append(part)
    return validate_closed_door_export(definitions,parts,[list(row) for row in objects[0].parent.matrix_world])


def export_collision(objects, recipe, stairs):
    audit_interactive_doors(objects, recipe)
    building_id = recipe['buildingId']
    identity = building_identity(building_id)
    parts = []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # Blender po reopen vrací databázi objektů v jiném pořadí než při tvorbě.
    # Stejný master musí dát stejné kolizní vstupy i jejich obsahový hash.
    for obj in sorted(objects,key=lambda item:item.name):
        if not obj.get("collision"):continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            vertices=[]
            for vertex in mesh.vertices:
                p=evaluated.matrix_world@vertex.co
                vertices.extend([round(p.x,6),round(p.z,6),round(-p.y,6)])
            indices=[index for tri in mesh.loop_triangles for index in tri.vertices]
            parts.append({"id":obj.name,"floor":obj["floorId"],"role":obj["role"],"positions":vertices,"indices":indices})
        finally:
            evaluated.to_mesh_clear()
    terrain_cutouts=[]
    origin=recipe['cadOrigin']
    root_matrix=objects[0].parent.matrix_world
    cutouts=recipe.get('exteriorVoids',[])+recipe.get('terrainCutouts',[])
    if len({void['id'] for void in cutouts})!=len(cutouts):
        raise ValueError('Opakovaný terénní výřez')
    for void in cutouts:
        loops=[];bottoms=[];tops=[]
        for ring in void['loops']:
            loop=[]
            for x,y in ring:
                bottom=root_matrix@Vector((-(y-origin[1]),x-origin[0],void['bottom']))
                top=root_matrix@Vector((-(y-origin[1]),x-origin[0],void['openAbove']))
                loop.append([round(bottom.x,6),round(-bottom.y,6)])
                bottoms.append(bottom.z);tops.append(top.z)
            loops.append(loop)
        terrain_cutouts.append({'id':void['id'],'loops':loops,'bottom':min(bottoms),'openAbove':max(tops),
                                'coordinateSpace':'model local XZ metres','provenance':void['provenance'],
                                'terrainValidationPending':void.get('terrainValidationPending',True)})
    result={"schemaVersion":1,"id":building_id,"identity":identity,"coordinateSystem":"metres; +X east, +Y up, +Z south; local CAD origin, placement pending game integration","cadOrigin":recipe["cadOrigin"],"status":"model-candidate-not-integrated","floors":floor_metadata(recipe),"stairs":stairs,"terrainCutouts":terrain_cutouts,"parts":parts}
    preserved=[]
    for region in recipe.get('terrainPreservationAreas',[]):
        loops=[]
        for ring in region['loops']:
            loop=[]
            for x,y in ring:
                point=root_matrix@Vector((-(y-origin[1]),x-origin[0],0))
                loop.append([round(point.x,6),round(-point.y,6)])
            loops.append(loop)
        preserved.append({**{k:v for k,v in region.items() if k!='loops'},'loops':loops,
                          'coordinateSpace':'model local XZ metres'})
    if preserved:result['terrainPreservationAreas']=preserved
    if recipe.get('heightModel') is not None:result['heightModel']=recipe['heightModel']
    doors=door_metadata(recipe)
    if doors is not None:result['doors']=doors
    if recipe.get('roomWalkPaths') is not None:result['roomWalkPaths']=recipe['roomWalkPaths']
    if recipe.get('interactiveDoors') is not None:
        result['interactiveDoors'] = recipe['interactiveDoors']
        result['doorDefinitionHash'] = hashlib.sha256(json.dumps(recipe['interactiveDoors'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return result


def floor_metadata(recipe):
    fields = {'id','elevation','wingElevation','floorWingOffset','heightRationale',
              'ceilingElevation','wingCeilingElevation','wingRegions','levelKind','roofHeadFootprint',
              'levelElevations','levelCeilings','levelRegions'}
    return [{key:value for key,value in floor.items() if key in fields} for floor in recipe['floors']]


def door_metadata(recipe):
    if 'doors' in recipe:return recipe['doors']
    if not any('doors' in floor for floor in recipe['floors']):return None
    fields={'id','hinge','closedEnd','openEnd','bottom','top','depth','normalOffset','sourceEntities',
            'openingClassification','accessConfirmed','fixedGlazing','classificationBasis','levelKey','levelBasis',
            'approachBoundaryCad','approachBasis','accessClassification','leafMaterial',
            'outsideSupportId','outsideSupportTop','outsideStepEstimate','outsideTraversalStatus','outsideHeightBasis',
            'pairedDoorId','pairedDoorRole','roomSourceEntity'}
    return [{key:value for key,value in door.items() if key in fields}|{'floor':floor['id']}
            for floor in recipe['floors'] for door in floor.get('doors',[])]


def add_stairs(geometry, recipe):
    """Build each physical route once from the accepted per-floor CAD plans."""
    stairs=[]
    floors={floor['id']:floor for floor in recipe['floors']}
    interior=recipe.get('interiorStairPlans');exterior=recipe.get('exteriorStairRoutes')
    if not isinstance(interior,list) or not interior or not isinstance(exterior,list):
        raise ValueError('Chybí přijaté jednotlivé schodišťové trasy; nelze opakovat univerzální rameno')
    routes=interior+exterior
    anchors=recipe.get('exteriorLevelAnchors',{})
    derived_levels=stair_levels(recipe['floors'],routes,anchors)
    levels={**recipe.get('interiorStairLevelEstimates',{}),**anchors,**recipe.get('exteriorLevelEstimates',{})}
    if set(levels)!=set(derived_levels) or any(not math.isfinite(levels[key]) or abs(levels[key]-value)>1e-6
                                              for key,value in derived_levels.items()):
        raise ValueError('Rozporné společné hladiny schodišť, dveří a podest')
    seen_flights=set();seen_landings={}
    incoming_risers={}
    for route in routes:
        for segment in route['segments']:
            key=segment['upperLevelKey']
            rise=(levels[key]-levels[segment['lowerLevelKey']])/len(segment['riserPositions'])
            incoming_risers[key]=max(incoming_risers.get(key,0),rise)

    def landing(floor, identifier, loops, triangles, height, material='concrete', minimum_riser=0):
        if floor not in floors:
            raise ValueError('Neznámé podlaží podesty '+identifier)
        spec={'id':identifier,'role':'stair-landing','material':material,
              'loops':loops,'triangles':triangles,'bottom':height-max(0.20,minimum_riser),'top':height,'collision':True}
        identity=json.dumps([floor,spec],sort_keys=True)
        if identifier in seen_landings:
            if seen_landings[identifier]!=identity:
                raise ValueError('Rozporná společná podesta '+identifier)
            return
        seen_landings[identifier]=identity
        geometry.landing(floor,identifier,loops,triangles,height,minimum_riser,material)

    for route in routes:
        for index,segment in enumerate(route['segments']):
            identifier=segment['id']
            if identifier in seen_flights:
                raise ValueError('Dvakrát postavené fyzické rameno '+identifier)
            seen_flights.add(identifier)
            floor=segment['ownerFloor']
            if floor not in floors:
                raise ValueError('Neznámé podlaží ramene '+identifier)
            low,high=levels[segment['lowerLevelKey']],levels[segment['upperLevelKey']]
            if segment.get('frontEdgesCad'):
                flight=geometry.edge_flight(floor,identifier,segment['frontEdgesCad'],low,high,
                                           max_riser=segment.get('maxRiserHeight',0.22))
            else:
                flight=geometry.flight(floor,identifier,segment['a'],segment['b'],segment['width'],low,high,
                                       riser_positions=segment['riserPositions'])
            flight.update({'sourcePlanId':route['id'],'sourceFloor':route['sourceFloor'],
                           'sourceEntities':segment['sourceEntities'],'routeId':route['id'],
                           'routeIndex':index,'routeSegmentCount':len(route['segments']),
                           'lowerLevelKey':segment['lowerLevelKey'],'upperLevelKey':segment['upperLevelKey'],
                           'riserCountInterpretation':segment['riserCountInterpretation']})
            if segment.get('sourceFrontsMeasured') is False:
                flight.update({'measuredRiserPositions':False,'riserPositionBasis':segment['planBasis'],
                               'heightProvenance':segment['verticalBasis'],'sourceKind':segment['sourceKind'],
                               'sourceManifestSha256':segment['sourceManifestSha256']})
            if route.get('upperSupportSolidId'):flight['upperSupportSolidId']=route['upperSupportSolidId']
            if route.get('accessPath'):
                flight['routeAccessPath']=route['accessPath']
            if route.get('terrainValidationPending'):
                flight['terrainValidationPending']=True
            stairs.append(flight)
        for item in route['landings']:
            landing(item['ownerFloor'],item['id'],item['loops'],item['triangles'],levels[item['levelKey']],
                    minimum_riser=incoming_risers.get(item['levelKey'],0))
    # Stejná zdrojová hranice zón určuje desky, otvory i čelo střešního zlomu.
    transitions=recipe.get('roofTransitions')
    if not isinstance(transitions,list):raise ValueError('Chybí doložené styky střešních úrovní')
    for transition in transitions:
        lower=levels[transition['lowerLevelKey']];upper=levels[transition['upperLevelKey']]
        thickness=transition['thickness']
        if not all(math.isfinite(v) for v in [lower,upper,thickness]) or upper<=lower or thickness<=0:
            raise ValueError('Neplatný střešní zlom')
        floor=transition.get('ownerFloor','n04')
        if floor not in floors:raise ValueError('Neznámé podlaží střešního zlomu '+floor)
        geometry.prism((floor,'roof-step-wall','plaster',True),transition['a'],transition['b'],thickness,lower,upper)
    # Střešní nástavba již má vlastní strop v n04 solids; nepřidávat druhou desku.
    return stairs


def add_exterior_signs(geometry, recipe):
    """Legible source-identified venue names, authored closed mesh lettering."""
    for sign in recipe.get('exteriorSigns',[]):
        floor=sign.get('floor','n01');a,b=sign['a'],sign['b'];bottom,top=sign['bottom'],sign['top']
        geometry.prism((floor,'venue-sign-board','b6_white_paint',False),a,b,.025,bottom,top)
        along=(Vector(geometry.at(b,0))-Vector(geometry.at(a,0))).normalized()
        up=Vector((0,0,1));normal=along.cross(up)
        center=(Vector(geometry.at(a,0))+Vector(geometry.at(b,0)))/2
        # The photographed banner hangs on the outer deck guard; its frame
        # does not extend down through the lower club entrance.
        for fraction in (0,.5,1):
            point=[a[i]+(b[i]-a[i])*fraction for i in range(2)]
            geometry.beam((floor,'venue-sign-guard','b6_exterior_rail',True),
                geometry.at(point,bottom-.25),geometry.at(point,top+.05),.035)
        geometry.beam((floor,'venue-sign-guard','b6_exterior_rail',True),
            geometry.at(a,top+.05),geometry.at(b,top+.05),.04)
        row_height=(top-bottom)/len(sign['lines'])
        for row,label in enumerate(sign['lines']):
            curve=bpy.data.curves.new('temporary venue lettering','FONT')
            curve.body=label;curve.align_x='CENTER';curve.size=1;curve.extrude=.006;curve.resolution_u=4
            obj=bpy.data.objects.new('temporary venue lettering',curve);bpy.context.scene.collection.objects.link(obj)
            bpy.context.view_layer.update()
            evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
            try:
                xs=[v.co.x for v in mesh.vertices];ys=[v.co.y for v in mesh.vertices]
                scale=min(math.dist(a,b)*.90/(max(xs)-min(xs)),row_height*.73/(max(ys)-min(ys)))
                baseline=top-row_height*(row+.5)-(max(ys)+min(ys))*scale/2
                points=[center+along*(v.co.x*scale)+up*(baseline+v.co.y*scale)+normal*(.014+v.co.z*scale) for v in mesh.vertices]
                for polygon in mesh.polygons:
                    geometry.face((floor,'venue-sign-lettering','b6_metal',False),[points[i] for i in polygon.vertices])
            finally:
                evaluated.to_mesh_clear();bpy.data.objects.remove(obj,do_unlink=True);bpy.data.curves.remove(curve)
        geometry.counts['venue-signs']+=1


def create_from_recipe(path, texture_overrides=None):
    recipe=json.loads(path.read_text(encoding="utf-8"))
    building_id=recipe.get('buildingId')
    identity=building_identity(building_id)
    if recipe.get("schemaVersion")!=1:
        raise ValueError("Neplatné schéma CAD receptury")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    root=bpy.data.objects.new(identity,None)
    scene.collection.objects.link(root)
    root["buildingId"]=building_id;root["osmId"]=BUILDING_OSM_IDS[building_id]
    provenance=dict(recipe.get("sourceProvenance",{}))
    # Rozpiska patří pouze do ignorovaného lokálního průzkumu, ne do masteru.
    provenance['files']=[{k:v for k,v in item.items() if k in {'file','name','sha256','bytes','sourceVersion'}} for item in provenance.get('files',[])]
    root["sourceProvenance"]=json.dumps(provenance,ensure_ascii=False)
    root["sourceRecipeSha256"]=hashlib.sha256(path.read_bytes()).hexdigest()
    root["dimensionsMeasured"]=False
    root["modelStatus"]="candidate; native reopen and visual acceptance required"
    root["cadOrigin"]=recipe["cadOrigin"]
    finishes=None
    if building_id=='b06':
        from b6_finishes import B6Finishes
        finishes=B6Finishes(recipe, texture_overrides=texture_overrides)
    geometry=Geometry(recipe["cadOrigin"],finishes,interactive_doors=building_id=='b06')
    for floor in recipe["floors"]:
        for spec in floor["solids"]:geometry.solid(floor["id"],spec)
        for window in floor.get("windows",[]):geometry.window(floor["id"],window)
        for door in floor.get("doors",[]):geometry.door(floor["id"],door)
    stairs=add_stairs(geometry,recipe)
    if finishes:
        from b6_furnishings import add_b06_furnishings
        furnishing_audit=add_b06_furnishings(geometry,recipe)
        recipe['roomWalkPaths']=furnishing_audit['rooms']
        root['furnishingsAudit']=json.dumps(furnishing_audit,ensure_ascii=False)
        root['roomWalkPaths']=json.dumps(recipe['roomWalkPaths'],ensure_ascii=False)
        dependencies=['build_model.py','model_geometry.py','b6_finishes.py','b6_furnishings.py']
        root['authoringDependenciesSha256']=json.dumps({name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest() for name in dependencies})
        add_exterior_signs(geometry,recipe)
        root['exteriorSigns']=json.dumps(recipe.get('exteriorSigns',[]),ensure_ascii=False)
    root['floorMetadata']=json.dumps(floor_metadata(recipe),ensure_ascii=False)
    root['heightModel']=json.dumps(recipe.get('heightModel'),ensure_ascii=False)
    root['stairAnnotations']=json.dumps(stairs,ensure_ascii=False)
    root['exteriorVoids']=json.dumps(recipe.get('exteriorVoids',[]),ensure_ascii=False)
    root['terrainCutoutsCad']=json.dumps(recipe.get('terrainCutouts',[]),ensure_ascii=False)
    if recipe.get('terrainPreservationAreas'):
        root['terrainPreservationAreasCad']=json.dumps(recipe['terrainPreservationAreas'],ensure_ascii=False)
    root['doorAnnotations']=json.dumps(door_metadata(recipe),ensure_ascii=False)
    root['initialBuildCounts']=json.dumps(dict(geometry.counts))
    objects=create_meshes(geometry,root)
    if geometry.interactive_doors is not None:
        recipe['interactiveDoors'] = sorted(geometry.interactive_doors.values(), key=lambda item:item['id'])
        root['interactiveDoors'] = json.dumps(recipe['interactiveDoors'],ensure_ascii=False)
    # Výchozí editor ukáže celý nový model. Native export existujícího masteru
    # tuto uživatelovu pracovní konfiguraci ani pohled nepřepisuje.
    bpy.context.view_layer.update()
    points=[obj.matrix_world@Vector(corner) for obj in objects for corner in obj.bound_box]
    low=Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high=Vector(tuple(max(point[i] for point in points) for i in range(3)))
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type!='VIEW_3D' or space.region_3d is None:continue
                space.region_3d.view_location=(low+high)/2
                space.region_3d.view_distance=max(high-low)*1.35
                space.region_3d.view_rotation=Vector((-58,76,-52)).to_track_quat('-Z','Y')
                space.region_3d.view_perspective='PERSP';space.lens=35;space.clip_end=2000
                space.shading.type='SOLID';space.shading.color_type='MATERIAL'
                space.shading.show_cavity=True;space.shading.cavity_type='BOTH'
                space.overlay.show_floor=False
    return root,objects,recipe,stairs,dict(geometry.counts)


def open_master(path):
    """Herní export čte skutečný uložený model, nikoli znovu původní půdorysy."""
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()))
    roots=[obj for obj in bpy.data.objects if obj.get('buildingId') in BUILDING_OSM_IDS
           and obj.name==building_identity(obj.get('buildingId'))]
    if len(roots)!=1:
        raise ValueError('Master musí obsahovat právě jednu rezervovanou identitu B01/B06')
    root=roots[0]
    for key in ['cadOrigin','floorMetadata','stairAnnotations']:
        if key not in root:raise ValueError('Master nemá exportní metadata '+key)
    objects=[obj for obj in bpy.data.objects if obj.type=='MESH']
    for obj in objects:
        if obj.parent!=root or any(key not in obj for key in ['floorId','role','collision']):
            raise ValueError('Část nemá vlastníka/podlaží/roli: '+obj.name)
        if obj.modifiers:
            raise ValueError('Před exportem aplikujte geometrické modifikátory v masteru: '+obj.name)
    metadata={'buildingId':root['buildingId'],'cadOrigin':list(root['cadOrigin']),'floors':json.loads(root['floorMetadata']),
              'exteriorVoids':json.loads(root.get('exteriorVoids','[]')),
              'terrainCutouts':json.loads(root.get('terrainCutoutsCad','[]')),
              'terrainPreservationAreas':json.loads(root.get('terrainPreservationAreasCad','[]')),
              'heightModel':json.loads(root.get('heightModel','null'))}
    if 'doorAnnotations' in root:metadata['doors']=json.loads(root['doorAnnotations'])
    if 'roomWalkPaths' in root:metadata['roomWalkPaths']=json.loads(root['roomWalkPaths'])
    if 'interactiveDoors' in root:metadata['interactiveDoors']=json.loads(root['interactiveDoors'])
    stairs=json.loads(root['stairAnnotations'])
    return root,objects,metadata,stairs,{}


def main():
    args=parse_args()
    workspace=Path(__file__).resolve().parents[2]
    targets=[contained(path,workspace) for path in [args.blend,args.glb,args.collision,args.audit]]
    staging=contained(args.audit.parent/'staging',workspace)
    staging.mkdir(parents=True,exist_ok=True)
    recover_pending(staging,workspace,targets)
    overrides=json.loads(args.texture_overrides.read_text(encoding='utf-8')) if args.texture_overrides else None
    if args.from_blend and overrides:
        raise ValueError('Texture overrides belong to initial authoring; native re-export preserves packed images')
    root,objects,recipe,stairs,counts=create_from_recipe(args.recipe,overrides) if args.recipe else open_master(args.from_blend)
    collision=export_collision(objects,recipe,stairs)
    transaction=Path(tempfile.mkdtemp(prefix=root['buildingId']+'-',dir=staging))
    staged_blend=transaction/args.blend.name
    staged_glb=transaction/args.glb.name
    staged_collision=transaction/args.collision.name
    staged_audit=transaction/'build-audit.json'
    # Uložený master obsahuje jen model; kamery/pozadí přidává samostatná QA scéna.
    if args.from_blend:
        shutil.copy2(args.from_blend,staged_blend)
    else:
        bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend))
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(staged_glb),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
    collision["glbSha256"]=hashlib.sha256(staged_glb.read_bytes()).hexdigest()
    collision["blendSha256"]=hashlib.sha256(staged_blend.read_bytes()).hexdigest()
    staged_collision.write_text(json.dumps(collision,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
    audit={"status":"created-not-yet-accepted","buildingId":root['buildingId'],"sourceMode":"native-blend" if args.from_blend else "initial-recipe","recipeSha256":root.get("sourceRecipeSha256"),"blendSha256":collision["blendSha256"],"glbSha256":collision["glbSha256"],"counts":counts,"objects":len(objects),"collisionParts":len(collision["parts"]),"collisionTriangles":sum(len(p["indices"])//3 for p in collision["parts"]),"stairs":stairs}
    audit['builderSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    # Reopen a úplná kontrola proběhnou PŘED výměnou předchozí sady souborů.
    check_path=Path(__file__).with_name('audit_model.py')
    module_spec=importlib.util.spec_from_file_location('cad_model_verification',check_path)
    verifier=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(verifier)
    verifier.audit(SimpleNamespace(blend=staged_blend,glb=staged_glb,collision=staged_collision,output=transaction/'verification.json'))
    audit['prePublicationVerification']='passed'
    staged_audit.write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    publish_files(list(zip([staged_blend,staged_glb,staged_collision,staged_audit],targets)),transaction,workspace)
    print(json.dumps({k:v for k,v in audit.items() if k!='stairs'},ensure_ascii=False))


if __name__=='__main__':main()
