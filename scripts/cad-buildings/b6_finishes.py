"""B6-only, photo-informed authored finishes, independent of bpy until packing.

Photographs identify appearance, not calibrated albedo, dimensions or all rooms.
No source photo pixels, CAD attachments, shadows or scan fragments are embedded.
Classifiers use the explicit room usage contract and model-local Blender metres:
(-CADY+originY, CADX-originX, height). Geometry is never moved by this module.
"""
from dataclasses import dataclass
from functools import lru_cache
import hashlib
import json
import math
import struct
import zlib


PROVENANCE = 'B6-photo-informed-authored'
SOURCES = {
    'corridor': ('79edd7ae4f162235d7f31ffd4769893122d2c38c99755caff3b2da81b89a3bec', 'user B6 reference, capture date unknown'),
    'room': ('a689950942d17ec2ebff17d77cbf45abe2df850aa73381d83ed0fb1963ca90e9', 'user B6 reference, capture date unknown'),
    'bathroom': ('8bd41d9646499d743bbcaee6f4e32e2c5acaac40c7dbb3d4e34c1a3bc891d126', 'user B6 reference, capture date unknown'),
    'b6-front': ('748bacdcf689e1ab8706ef9048505e85ef9acd71628c1e340e5a27cd0134366c', 'user B6 exterior reference, capture date unknown'),
    'b6-rear': ('0a4837870bf3cce7e21ead36ce6ce4f4780562de150d39226a602f4df00e3841', 'user B6 exterior reference, capture date unknown'),
    'b3-stair-typology': ('6e4913f3e1b8ec9a985874e2e2385c9936d8e3377aecebfa0a21e18f5fd69594', 'explicitly BLOK3 user photo20261011; typology only, not a B6 observation'),
}


@dataclass(frozen=True)
class FinishSpec:
    rgb: tuple
    roughness: float
    metallic: float = 0
    pattern: str = 'plain'
    period: tuple = (1., 1.)
    resolution: tuple = (128, 128)
    sources: tuple = ('room',)
    tile: tuple = (.2, .2)
    grout: float = .003
    lower_rgb: tuple = (160, 182, 194)
    band_height: float = 0
    alpha: float = 1


# RGB values are authored neutral-light interpretations, not sampled photometric
# measurements. Metric tile/joint dimensions and band heights are explicit estimates.
FINISHES = {
    'b6_corridor_floor': FinishSpec((36, 47, 48), .52, pattern='corridor-rows', period=(1.2, 1.2),
        resolution=(512, 512), sources=('corridor',), tile=(.15, .15), grout=.0025, lower_rgb=(66, 119, 132)),
    'b6_bedroom_floor': FinishSpec((140, 115, 84), .6, pattern='linoleum', period=(.8, .8),
        resolution=(512, 512), sources=('room',)),
    'b6_bath_floor': FinishSpec((218, 214, 205), .4, pattern='tiles', period=(.8, .8),
        resolution=(512, 512), sources=('bathroom',), tile=(.2, .2), grout=.003),
    'b6_corridor_wall': FinishSpec((231, 229, 217), .86, pattern='paint-band', period=(1.2, 8.),
        resolution=(192, 1280), sources=('corridor',), lower_rgb=(194, 169, 133), band_height=1.35),
    'b6_bath_wall': FinishSpec((230, 226, 220), .34, pattern='tile-band', period=(.8, 8.),
        resolution=(256, 2048), sources=('bathroom',), tile=(.2, .2), grout=.003,
        lower_rgb=(160, 180, 191), band_height=.9),
    'b6_white_paint': FinishSpec((232, 231, 222), .88, pattern='paint', sources=('room', 'bathroom')),
    'b6_facade_ivory': FinishSpec((220, 217, 200), .86, pattern='paint', sources=('b6-front', 'b6-rear')),
    'b6_facade_service': FinishSpec((157, 162, 145), .86, pattern='panel-joints', period=(3., 3.),
        resolution=(512, 512), sources=('b6-front', 'b6-rear'), tile=(3., 3.), grout=.012),
    'b6_frame_bronze': FinishSpec((92, 71, 49), .38, .35, sources=('b6-front', 'b6-rear')),
    'b6_frame_white': FinishSpec((218, 219, 208), .43, .03, sources=('room',)),
    'b6_door_beige': FinishSpec((190, 163, 129), .62, pattern='paint', sources=('corridor',)),
    'b6_stair_terrazzo': FinishSpec((170, 167, 155), .76, pattern='terrazzo', period=(.8, .8),
        resolution=(512, 512), sources=('b3-stair-typology',)),
    'b6_handrail_wood': FinishSpec((112, 72, 46), .43, pattern='wood', sources=('b3-stair-typology',)),
    'b6_exterior_concrete': FinishSpec((159, 161, 153), .85, pattern='mineral', sources=('b6-front', 'b6-rear')),
    'b6_exterior_rail': FinishSpec((180, 185, 178), .46, .5, sources=('b6-front', 'b6-rear')),
    'b6_wood': FinishSpec((153, 117, 77), .52, pattern='wood', sources=('room',)),
    'b6_fabric_cream': FinishSpec((211, 208, 184), .94, pattern='fabric', period=(.2, .2), sources=('room',)),
    'b6_fabric_teal': FinishSpec((37, 165, 180), .91, pattern='fabric', period=(.2, .2), sources=('room',)),
    'b6_fabric_blue': FinishSpec((31, 67, 108), .91, pattern='fabric', period=(.2, .2), sources=('room',)),
    'b6_metal': FinishSpec((40, 46, 48), .46, .65, sources=('room', 'b3-stair-typology')),
    'b6_ceramic': FinishSpec((234, 231, 225), .2, sources=('bathroom',)),
    'b6_mirror': FinishSpec((200, 207, 206), .1, 1, sources=('bathroom',)),
    'b6_curtain': FinishSpec((199, 164, 131), .94, pattern='fabric', period=(.2, .2), sources=('room',)),
    'b6_shower_curtain': FinishSpec((190, 178, 206), .88, pattern='curtain-circles', period=(.6, .6),
        resolution=(256, 256), sources=('bathroom',)),
    'b6_chrome': FinishSpec((214, 219, 216), .13, .97, sources=('bathroom',)),
    'b6_radiator': FinishSpec((222, 215, 195), .56, .08, sources=('room', 'bathroom')),
}


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _normal(points):
    n = [0., 0., 0.]
    for a, b in zip(points, points[1:]+points[:1]):
        for i, value in enumerate(_cross(a, b)):
            n[i] += value
    length = math.sqrt(sum(v*v for v in n))
    if length < 1e-12:
        raise ValueError('Degenerate finish face')
    return tuple(v/length for v in n)


def _inside_ring(x, y, loop):
    inside = False
    for a, b in zip(loop, loop[1:]+loop[:1]):
        dx, dy = b[0]-a[0], b[1]-a[1]
        length = math.hypot(dx, dy)
        if length and abs(dx*(y-a[1])-dy*(x-a[0])) <= 1e-7*length and min(a[0], b[0])-1e-7 <= x <= max(a[0], b[0])+1e-7 and min(a[1], b[1])-1e-7 <= y <= max(a[1], b[1])+1e-7:
            return True
        if (a[1] > y) != (b[1] > y) and x < a[0]+(y-a[1])*dx/dy:
            inside = not inside
    return inside


def _inside(x, y, loops):
    return bool(loops and _inside_ring(x, y, loops[0]) and
                not any(_inside_ring(x, y, ring) for ring in loops[1:]))


def _bounds(loops):
    p = [point for loop in loops for point in loop]
    return min(q[0] for q in p), min(q[1] for q in p), max(q[0] for q in p), max(q[1] for q in p)


def _usage(room):
    usage = room.get('usage', 'other')
    if usage not in ('bedroom', 'corridor', 'bathroom', 'wc', 'other'):
        raise ValueError('Unknown explicit B6 room usage: ' + str(usage))
    return 'bathroom' if usage == 'wc' else usage


class B6Finishes:
    def __init__(self, recipe):
        if recipe.get('buildingId') != 'b06':
            raise ValueError('B6 finishes must not change another building')
        self.origin = tuple(recipe['cadOrigin'])
        self.floors = {floor['id']: floor for floor in recipe['floors']}
        self.rooms, self.cells, self.envelopes = {}, {}, {}
        self.cell_size = 4.
        self._materials = None
        # The cache belongs to this recipe instance. A class-level decorated
        # bound method would retain recipes from previous native build runs.
        self._room_at = lru_cache(maxsize=32768)(self._find_room)
        for floor in recipe['floors']:
            identifier = floor['id']
            self.envelopes[identifier] = [solid['loops'][0] for solid in floor.get('solids', [])
                                         if solid['role'] == 'slab' and solid.get('loops')]
            records = []
            for room in floor.get('rooms', []):
                if not room.get('loops'):
                    continue
                key = room.get('levelKey', identifier+'.main').split('.')[-1]
                levels = floor.get('levelElevations', {'main': floor['elevation']})
                if key not in levels:
                    raise ValueError('Room has no explicit level elevation: '+room['id'])
                base = levels[key]
                ceiling = floor.get('levelCeilings', {}).get(key, floor.get('ceilingElevation'))
                if ceiling is None:
                    x0, y0, x1, y1 = _bounds(room['loops'])
                    roof_bottoms = [solid['bottom'] for solid in floor.get('solids', [])
                                    if solid['role'] == 'slab' and solid['bottom'] > base and
                                    _inside((x0+x1)/2, (y0+y1)/2, solid['loops'])]
                    ceiling = min(roof_bottoms) if roof_bottoms else max(levels.values())
                if not all(math.isfinite(v) for v in (base, ceiling)) or ceiling <= base:
                    raise ValueError('Invalid room vertical interval')
                record = {'id': room['id'], 'usage': _usage(room), 'base': base, 'ceiling': ceiling,
                          'loops': room['loops'], 'bounds': _bounds(room['loops']), 'level': key}
                index = len(records)
                records.append(record)
                x0, y0, x1, y1 = record['bounds']
                for cx in range(math.floor(x0/self.cell_size), math.floor(x1/self.cell_size)+1):
                    for cy in range(math.floor(y0/self.cell_size), math.floor(y1/self.cell_size)+1):
                        self.cells.setdefault((identifier, cx, cy), []).append(index)
            self.rooms[identifier] = records

    def _find_room(self, floor, x, y, z):
        candidates = self.cells.get((floor, math.floor(x/self.cell_size), math.floor(y/self.cell_size)), [])
        matches = []
        for index in candidates:
            room = self.rooms[floor][index]
            x0, y0, x1, y1 = room['bounds']
            if (x0-1e-7 <= x <= x1+1e-7 and y0-1e-7 <= y <= y1+1e-7 and
                    room['base']-.04 <= z <= room['ceiling']+.04 and _inside(x, y, room['loops'])):
                matches.append(room)
        # Overlapping main/mezz rooms at different heights must not silently
        # borrow another floor's finish. The closest containing floor wins.
        if not matches:
            return None
        nearest = min(abs(z-room['base']) for room in matches)
        matches = [room for room in matches if abs(abs(z-room['base'])-nearest) < 1e-6]
        # Historic source polygons can overlap at the same level (P01 s122 /
        # s193). Ordering their records is not evidence for a finish. Keep an
        # ambiguous overlap neutral until preparation resolves the source.
        if len({room['usage'] for room in matches}) != 1:
            return None
        return matches[0]

    def _at(self, floor, point):
        x, y = point[1]+self.origin[0], self.origin[1]-point[0]
        return self._room_at(floor, round(x, 6), round(y, 6), round(point[2], 6))

    def _inside_envelope(self, floor, point):
        x, y = point[1]+self.origin[0], self.origin[1]-point[0]
        return any(_inside_ring(x, y, ring) for ring in self.envelopes.get(floor, []))

    def _context(self, floor, points, normal):
        center = tuple(sum(p[i] for p in points)/len(points) for i in range(3))
        # Inset samples catch a large face crossing unlike room usages without
        # treating a boundary vertex as an adjacent room's entire floor finish.
        samples = [center]+[tuple(.2*center[i]+.8*p[i] for i in range(3)) for p in points]
        facing = []
        for sample in samples:
            found = None
            for distance in (0, .03, .12, .28, .55):
                found = self._at(floor, tuple(sample[i]+normal[i]*distance for i in range(3)))
                if found:
                    break
            if found:
                facing.append(found)
        if len(facing) == len(samples) and len({(room['usage'], room['base']) for room in facing}) == 1:
            front = facing[0]
        else:
            front = None
        back = None
        for distance in (.03, .12, .28, .55):
            back = self._at(floor, tuple(center[i]-normal[i]*distance for i in range(3)))
            if back:
                break
        exterior = front is None and not self._inside_envelope(floor, tuple(center[i]+normal[i]*.06 for i in range(3)))
        if self.floors[floor].get('levelKind') == 'roof':
            exterior = front is None
        return front, back, exterior, center

    def face_material(self, floor, role, points_blender, default_material):
        if default_material in FINISHES:
            return default_material
        if floor not in self.floors:
            raise ValueError('Unknown B6 floor: '+floor)
        points = [tuple(map(float, point)) for point in points_blender]
        normal = _normal(points)
        front, back, exterior, center = self._context(floor, points, normal)
        if default_material == 'roof' or role.endswith('-glass') or role.endswith('-gasket'):
            return default_material
        if role == 'floor-finish':
            if normal[2] < .9 or front is None:
                return default_material
            return {'bedroom': 'b6_bedroom_floor', 'corridor': 'b6_corridor_floor',
                    'bathroom': 'b6_bath_floor'}.get(front['usage'], default_material)
        if role == 'slab':
            # Full slab triangles can cross room boundaries. Exact per-room,
            # noncolliding finish faces are supplied by the preparation/builder.
            if default_material=='floor' and abs(normal[2])<.3:
                levels=self.floors[floor].get('levelElevations',{})
                if any(abs(max(p[2] for p in points)-base)<.001 for base in levels.values()):
                    # Slab thickness is below the room's interval. Probe the
                    # same face just above it for the adjacent facade finish;
                    # never expose the grey generic floor material as a band.
                    raised=[(p[0],p[1],p[2]+.24) for p in points]
                    _,above_back,above_exterior,_=self._context(floor,raised,normal)
                    if above_exterior:
                        return 'b6_facade_service' if above_back and above_back['usage'] in ('bathroom','other') else 'b6_facade_ivory'
            return 'b6_white_paint' if normal[2] < -.7 else default_material
        if role in ('stair', 'stair-landing'):
            if not self._inside_envelope(floor, center):
                return 'b6_exterior_concrete'
            if normal[2] > .7:
                return 'b6_corridor_floor' if role == 'stair-landing' else 'b6_stair_terrazzo'
            if role == 'stair' and abs(normal[2]) < .2 and max(p[2] for p in points)-min(p[2] for p in points) <= .23:
                return 'b6_stair_terrazzo'
            return 'b6_white_paint'
        if role in ('handrail', 'baluster', 'stair-handrail', 'stair-baluster'):
            if not self._inside_envelope(floor, center):
                return 'b6_exterior_rail'
            return 'b6_handrail_wood' if role.endswith('handrail') else 'b6_metal'
        if role == 'door-frame' and any(room and room['usage'] in ('bedroom', 'corridor', 'bathroom') for room in (front, back)) and not exterior:
            return 'b6_frame_white'
        if role.endswith('-frame'):
            return 'b6_frame_white' if front and front['usage'] == 'bedroom' else 'b6_frame_bronze'
        if role in ('door-leaf','fixed-door-leaf'):
            if front and front['usage'] == 'bathroom':
                return 'b6_white_paint'
            if any(room and room['usage'] in ('bedroom', 'corridor') for room in (front, back)):
                return 'b6_door_beige'
            return default_material
        if role in ('wall', 'column', 'infill', 'window-infill', 'roof-step-wall', 'parapet'):
            if front:
                if abs(normal[2]) > .3:
                    return 'b6_white_paint'
                return {'corridor': 'b6_corridor_wall', 'bathroom': 'b6_bath_wall'}.get(front['usage'], 'b6_white_paint')
            if exterior:
                # Service/bathroom end faces differ from the long bedroom body
                # in both B6 exterior references. Roof heads stay ivory.
                service = back and back['usage'] in ('bathroom', 'other') and self.floors[floor].get('levelKind') != 'roof'
                return 'b6_facade_service' if service else 'b6_facade_ivory'
            return 'b6_white_paint'
        return default_material

    def uv_for_face(self, floor, role, points_blender, material_key):
        points = [tuple(map(float, point)) for point in points_blender]
        normal = _normal(points)
        spec = FINISHES.get(material_key)
        if spec is None:
            # Let the root keep its established UV path for unchanged roof/IPR,
            # glazing and any original material not owned by this module.
            return None
        base = 0.
        if spec.band_height:
            front, _, _, _ = self._context(floor, points, normal)
            if front is None:
                raise ValueError('Banded finish has no unambiguous room level')
            base = front['base']
            if min(p[2]-base for p in points) < -.04 or max(p[2]-base for p in points) >= spec.period[1]:
                raise ValueError('Banded wall exceeds its single, floor-relative atlas interval')
        if abs(normal[2]) > .7:
            return [(point[0]/spec.period[0], point[1]/spec.period[1]) for point in points]
        length = math.hypot(normal[0], normal[1])
        u = (-normal[1]/length, normal[0]/length, 0)
        v = _cross(normal, u)
        return [(sum(point[i]*u[i] for i in range(3))/spec.period[0],
                 ((point[2]-base) if spec.band_height else sum(point[i]*v[i] for i in range(3)))/spec.period[1])
                for point in points]

    def create_materials(self):
        """Create packed PNG/PBR materials; Blender is imported only on demand.

        Image.pack(data=...) embeds generated PNG bytes directly, never source
        attachments or temporary external paths. Root performs native readback.
        """
        if self._materials is not None:
            return self._materials
        import bpy
        import numpy as np
        result = {}
        for key, spec in FINISHES.items():
            material = bpy.data.materials.new('B6 / '+key)
            material.use_nodes = True
            shader = material.node_tree.nodes.get('Principled BSDF')
            color = srgb_to_linear(np.asarray(spec.rgb)/255)
            shader.inputs['Base Color'].default_value = (*color, spec.alpha)
            shader.inputs['Roughness'].default_value = spec.roughness
            shader.inputs['Metallic'].default_value = spec.metallic
            shader.inputs['Alpha'].default_value = spec.alpha
            material.diffuse_color = (*color, spec.alpha)
            material.use_backface_culling = True
            metadata = material_provenance(key)
            for name, value in metadata.items():
                material[name] = value
            if spec.pattern != 'plain':
                pixels = texture_pixels(key)
                packed = png_bytes(pixels)
                image = bpy.data.images.new(key+'-authored.png', width=pixels.shape[1], height=pixels.shape[0], alpha=False)
                image.pack(data=packed, data_len=len(packed))
                image.source = 'FILE'
                image.file_format = 'PNG'
                image.reload()
                image.colorspace_settings.name = 'sRGB'
                image.filepath = ''
                for name, value in metadata.items():
                    image[name] = value
                image['imageSha256'] = hashlib.sha256(packed).hexdigest()
                if not image.packed_file or hashlib.sha256(bytes(image.packed_file.data)).hexdigest() != image['imageSha256']:
                    raise ValueError('Authored PNG did not pack byte-identically')
                uv = material.node_tree.nodes.new('ShaderNodeUVMap')
                uv.uv_map = 'UVMap'
                texture = material.node_tree.nodes.new('ShaderNodeTexImage')
                texture.image = image
                texture.extension = 'REPEAT'
                texture.interpolation = 'Linear'
                material.node_tree.links.new(uv.outputs['UV'], texture.inputs['Vector'])
                material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
                shader.inputs['Base Color'].default_value = (1, 1, 1, spec.alpha)
            result[key] = material
        self._materials = result
        return result


def material_provenance(key):
    spec = FINISHES[key]
    sources = [{'id': name, 'sha256': SOURCES[name][0], 'basis': SOURCES[name][1]} for name in spec.sources]
    return {'provenance': PROVENANCE, 'finishKey': key,
            'sourceIds': json.dumps(list(spec.sources)), 'sourceHashes': json.dumps(sources, sort_keys=True),
            'sourceManifestSha256': hashlib.sha256(json.dumps(SOURCES, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'sourcePixelsEmbedded': False, 'dimensionsMeasured': False,
            'finishSpecification': json.dumps({'pattern': spec.pattern, 'periodMetres': spec.period,
                'tileMetres': spec.tile if spec.pattern in ('corridor-rows', 'tiles', 'tile-band', 'panel-joints') else None,
                'groutMetres': spec.grout if spec.pattern in ('corridor-rows', 'tiles', 'tile-band', 'panel-joints') else None,
                'bandHeightMetres': spec.band_height, 'colorsSRGB': spec.rgb, 'lowerColorsSRGB': spec.lower_rgb,
                'roughness': spec.roughness, 'metallic': spec.metallic,
                'interpretation': 'authored reconstruction from reference appearance; no baked photograph/shadow, not a surveyed finish schedule'}, sort_keys=True)}


def srgb_to_linear(values):
    import numpy as np
    return np.where(values <= .04045, values/12.92, ((values+.055)/1.055)**2.4)


def texture_pixels(key):
    """Deterministic authored sRGB texels. Does not read any photograph."""
    import numpy as np
    spec = FINISHES[key]
    width, height = spec.resolution
    # PNG rows run top-to-bottom; texture v grows bottom-to-top in Blender/glTF.
    x = (np.arange(width)+.5)*spec.period[0]/width
    y = (height-np.arange(height)-.5)*spec.period[1]/height
    xx, yy = np.meshgrid(x, y)
    pixel_x, pixel_y = np.meshgrid(np.arange(width, dtype=np.uint32), np.arange(height, dtype=np.uint32))
    def hash_grid(a, b):
        value = a.astype(np.uint32)*np.uint32(374761393)+b.astype(np.uint32)*np.uint32(668265263)+np.uint32(2654435769)
        value = (value ^ (value >> 13))*np.uint32(1274126177)
        return value ^ (value >> 16)
    noise = (hash_grid(pixel_x, pixel_y) & 255).astype(float)/255-.5
    color = np.broadcast_to(np.array(spec.rgb, dtype=float), (height, width, 3)).copy()
    if spec.pattern in ('corridor-rows', 'tiles', 'tile-band', 'panel-joints'):
        if spec.pattern == 'corridor-rows':
            blue = (np.floor(yy/spec.tile[1]).astype(int) % 2) == 1
            color[blue] = spec.lower_rgb
        if spec.pattern == 'tile-band':
            color[yy < spec.band_height] = spec.lower_rgb
        edge_x = np.minimum(xx % spec.tile[0], spec.tile[0] - xx % spec.tile[0])
        edge_y = np.minimum(yy % spec.tile[1], spec.tile[1] - yy % spec.tile[1])
        # Analytic texel coverage preserves the stated metric joint width even
        # when it is narrower than a pixel; do not inflate it to two hard pixels.
        coverage_x = np.clip((spec.grout/2+spec.period[0]/width/2-edge_x)/(spec.period[0]/width), 0, 1)
        coverage_y = np.clip((spec.grout/2+spec.period[1]/height/2-edge_y)/(spec.period[1]/height), 0, 1)
        coverage = 1-(1-coverage_x)*(1-coverage_y)
        grout_color = (126, 130, 125) if spec.pattern == 'corridor-rows' else (157, 159, 153)
        if spec.pattern == 'tile-band':
            grout_color = (191, 194, 189)
        if spec.pattern == 'panel-joints':
            grout_color = (177, 179, 165)
        color += noise[..., None]*2
        color = color*(1-coverage[..., None])+np.asarray(grout_color)*coverage[..., None]
    elif spec.pattern == 'paint-band':
        color[yy < spec.band_height] = spec.lower_rgb
        color += noise[..., None]*3
    elif spec.pattern in ('paint', 'mineral'):
        color += noise[..., None]*(3 if spec.pattern == 'paint' else 9)
    elif spec.pattern == 'wood':
        grain = np.sin(xx*140 + np.sin(yy*7)*2)*3 + np.sin(xx*410)*2
        color += grain[..., None] + noise[..., None]*3
    elif spec.pattern == 'fabric':
        weave = ((pixel_x % 2).astype(float)-(pixel_y % 2).astype(float))*2
        color += weave[..., None]+noise[..., None]*2
    elif spec.pattern == 'linoleum':
        # Smooth periodic variation avoids a false woven/diagonal grid in a
        # linoleum finish. Its neutral mottling is authored, not photo detail.
        gx, gy = xx/spec.period[0]*32, yy/spec.period[1]*32
        ix, iy = np.floor(gx), np.floor(gy)
        fx, fy = gx-ix, gy-iy
        fx, fy = fx*fx*(3-2*fx), fy*fy*(3-2*fy)
        def cell(dx, dy):
            return (hash_grid((ix+dx) % 32, (iy+dy) % 32) & 65535)/65535
        cells = (cell(0, 0)*(1-fx)+cell(1, 0)*fx)*(1-fy)+(cell(0, 1)*(1-fx)+cell(1, 1)*fx)*fy-.5
        flecks = (hash_grid(pixel_x+np.uint32(917), pixel_y) & 1023) < 110
        color += cells[..., None]*18 + noise[..., None]*20
        color[flecks] += np.array((15, 12, 8))
    elif spec.pattern == 'terrazzo':
        chips = ((pixel_x*np.uint32(1103515245) ^ pixel_y*np.uint32(12345)) & 1023)
        color += noise[..., None]*7
        color[chips < 35] = (103, 103, 97)
        color[(chips > 970)] = (208, 205, 190)
    elif spec.pattern == 'curtain-circles':
        dx = (xx+.03) % .15-.075
        dy = (yy+.02) % .15-.075
        circle = np.sqrt(dx*dx+dy*dy) < .026
        color += noise[..., None]*3
        color[circle] = (205, 202, 214)
    return np.clip(np.rint(color), 0, 255).astype(np.uint8)


def png_bytes(pixels):
    import numpy as np
    if pixels.dtype != np.uint8 or pixels.ndim != 3 or pixels.shape[2] != 3:
        raise ValueError('Expected authored RGB uint8 raster')
    height, width = pixels.shape[:2]
    def chunk(kind, data):
        return struct.pack('>I', len(data))+kind+data+struct.pack('>I', zlib.crc32(kind+data)&0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))+
            chunk(b'sRGB', b'\0')+chunk(b'IDAT', zlib.compress(b''.join(b'\0'+row.tobytes() for row in pixels), 6))+chunk(b'IEND', b''))
