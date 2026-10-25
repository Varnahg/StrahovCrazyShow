"""Small dependency-free construction operations, in CAD metres and Z-up."""
import math
import struct


BUILDING_OSM_IDS = {'b01': '53929063', 'b06': '53929071'}


def building_identity(building_id):
    if building_id not in BUILDING_OSM_IDS:
        raise ValueError('Unsupported reserved CAD building: ' + str(building_id))
    return 'building:osm:way:' + BUILDING_OSM_IDS[building_id]


def signed_mesh_volume(points, triangles):
    """Double-precision tetrahedra about a nearby origin, including tiny parts.

    mathutils cross/dot uses float32: a centimetre handle 30m from the origin
    can acquire a negative signed volume from catastrophic cancellation.
    Translation does not alter a closed mesh's true signed volume.
    """
    if not points:return 0.0
    origin=tuple(map(float,points[0]))
    local=[tuple(float(p[i])-origin[i] for i in range(3)) for p in points]
    def tetrahedron(triangle):
        a,b,c=(local[i] for i in triangle)
        return (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    return math.fsum(tetrahedron(triangle) for triangle in triangles)


def interactive_door_definition(origin, floor, door):
    """Native closed leaf and a functional quarter-turn, in game Y-up metres.

    CAD swing direction is evidence; a partially drawn swing is not a usable
    open passage. Keep its original angle as provenance instead of claiming
    that the functional 90-degree stop was measured.
    """
    hinge, end, opened = door['hinge'], door['closedEnd'], door['openEnd']
    dx, dy = end[0]-hinge[0], end[1]-hinge[1]
    width = math.hypot(dx, dy)
    if width < .3:
        raise ValueError('Invalid native door width: '+door['id'])
    offset = door.get('normalOffset', 0)
    a = [hinge[0]-dy/width*offset, hinge[1]+dx/width*offset]
    b = [end[0]-dy/width*offset, end[1]+dx/width*offset]
    def model(p, height):
        return {'x': -(p[1]-origin[1]), 'y': height, 'z': -(p[0]-origin[0])}
    # CAD XY -> game XZ reverses handedness; yaw rotates +X towards -Z.
    cx, cz = -dy, -dx
    ox, oz = -(opened[1]-hinge[1]), -(opened[0]-hinge[0])
    angle = math.atan2(cz*ox-cx*oz, cx*ox+cz*oz)
    if abs(angle) < .01:
        raise ValueError('Door has no evidenced swing: '+door['id'])
    bottom, top = door['bottom']+.015, door['top']-.02
    thickness = .10 if door.get('leafMaterial') == 'glass' else .038
    return {
        'id': 'b06:'+door['id'], 'buildingId': 'b06', 'floor': floor,
        'sourceDoorId': door['id'], 'renderPartIds': [], 'collisionPartIds': [],
        'hingeModel': model(a, bottom),
        'closedPose': {'position': model([(a[0]+b[0])/2, (a[1]+b[1])/2], (bottom+top)/2),
                       'rotationY': math.atan2(-cz, cx)},
        'collider': {'halfExtents': {'x': width/2, 'y': (top-bottom)/2, 'z': thickness/2}},
        'openAngle': math.copysign(math.pi/2, angle), 'measuredSourceAngle': angle,
        'openAngleBasis': 'CAD swing direction; functional 90-degree open stop is a gameplay interpretation',
        'handleModel': model([b[0]-dx/width*.12, b[1]-dy/width*.12], door['bottom']+1.0025),
        'defaultOpen': False,
    }


def stair_levels(floors, routes, additional_anchors=None):
    """Resolve explicit floor levels and weighted intermediate L landings."""
    levels = {}
    for floor in floors:
        explicit_levels = floor.get('levelElevations')
        if explicit_levels is None:
            explicit_levels = {'main': floor['elevation']}
            if 'wingElevation' in floor:
                explicit_levels.update({side + 'Wing': floor['wingElevation'] for side in ['west', 'east']})
        if not explicit_levels or 'main' not in explicit_levels or explicit_levels['main'] != floor['elevation']:
            raise ValueError('Inconsistent explicit floor levels: ' + floor['id'])
        for name, value in explicit_levels.items():
            key = floor['id'] + '.' + name
            if not name or '.' in name or key in levels:
                raise ValueError('Invalid or repeated floor level: ' + key)
            levels[key] = value
    if not all(math.isfinite(value) for value in levels.values()):
        raise ValueError('Invalid floor elevation')
    for key,value in (additional_anchors or {}).items():
        if key in levels or not math.isfinite(value):
            raise ValueError('Invalid or repeated explicit exterior anchor: '+key)
        levels[key]=value
    explicit = set(levels)
    for route in routes:
        segments = route['segments']
        if not segments:
            raise ValueError('Empty staircase route: ' + route['id'])
        keys = [segments[0]['lowerLevelKey']] + [part['upperLevelKey'] for part in segments]
        if keys[0] != route['lowerLevelKey'] or keys[-1] != route['upperLevelKey']:
            raise ValueError('Route endpoints disagree with segments: ' + route['id'])
        if any(left['upperLevelKey'] != right['lowerLevelKey'] for left,right in zip(segments,segments[1:])):
            raise ValueError('Disconnected staircase levels: ' + route['id'])
        if keys[0] not in explicit or keys[-1] not in explicit:
            raise ValueError('Unknown route endpoint elevation: ' + route['id'])
        anchors = [i for i,key in enumerate(keys) if key in explicit]
        for first,last in zip(anchors,anchors[1:]):
            low, high = levels[keys[first]], levels[keys[last]]
            counts = [len(segment['riserPositions']) for segment in segments[first:last]]
            if high <= low or min(counts) < 2:
                raise ValueError('Invalid ascending staircase route: ' + route['id'])
            completed = 0
            for i,count in enumerate(counts[:-1],start=first+1):
                completed += count
                value = low + (high-low)*completed/sum(counts)
                if keys[i] in levels and abs(levels[keys[i]] - value) > 1e-8:
                    raise ValueError('Inconsistent shared landing: ' + keys[i])
                levels[keys[i]] = value
    return levels


def stair_profile(length, low, high, steps=None, riser_positions=None, max_riser=0.22):
    """Step section with either an estimated run or measured front edges.

    A complete measured run includes its terminal riser at the upper landing:
    N front edges give N rises and N-1 horizontal intervals. Vertical rise is
    still an explicit model interpretation, never a measurement from XY.
    """
    if not all(math.isfinite(v) for v in [length, low, high]) or length <= 0 or high <= low:
        raise ValueError('Invalid staircase extent')
    if riser_positions is None:
        count = steps if steps is not None else math.ceil((high - low) / 0.16 - 1e-9)
        if isinstance(count, bool) or not isinstance(count, int) or count < 1:
            raise ValueError('Invalid riser count')
        positions = [i * length / count for i in range(count)]
    else:
        if steps is not None:
            raise ValueError('Specify either riser positions or estimated step count')
        positions = list(riser_positions)
        if len(positions) < 2 or not all(math.isfinite(v) for v in positions):
            raise ValueError('Invalid measured riser positions')
        if abs(positions[0]) > 0.001 or abs(positions[-1] - length) > 0.001:
            raise ValueError('Measured front edges must span the complete run')
        positions[0], positions[-1] = 0.0, length
        if any(b <= a for a,b in zip(positions, positions[1:])):
            raise ValueError('Riser positions must ascend along the run')
        count = len(positions)
    rise = (high - low) / count
    ends = positions[1:] + [length]
    surfaces = [{'start': start, 'end': end, 'height': low + (i+1)*rise}
                for i,(start,end) in enumerate(zip(positions,ends)) if end - start > 1e-8]
    min_going = min(item['end'] - item['start'] for item in surfaces)
    if not math.isfinite(max_riser) or not 0 < max_riser <= 0.24:
        raise ValueError('Invalid explicit riser limit')
    if rise > max_riser + 1e-9 or min_going < 0.20 - 1e-9:
        raise ValueError(f'Unusable step: rise={rise}, minimum going={min_going}')
    profile = [(0, low-0.20), (0, low)]
    for i,(start,end) in enumerate(zip(positions,ends)):
        if end-start <= 1e-8:
            continue
        profile.extend([(start,low+(i+1)*rise),(end,low+(i+1)*rise)])
    # With measured front edges the terminal rise is the front of the upper
    # landing. Giving it zero horizontal length inside this closed flight
    # would retrace a vertical edge and create a self-overlapping profile.
    # End this solid at the final actual tread and let the landing supply its
    # riser. Keep at least .20m waist below that tread at the upper end.
    soffit_end = high - (rise if riser_positions is not None else 0) - 0.20
    profile.append((length,soffit_end))
    profile = [point for i,point in enumerate(profile) if not i or point != profile[i-1]]
    return {'profile':profile,'positions':positions,'surfaces':surfaces,'steps':count,
            'riser':rise,'tread':length/len(surfaces),'minimumGoing':min_going,
            'terminalRiserOnLanding':riser_positions is not None,
            'soffit':[[0,low-0.20],[length,soffit_end]]}


def skew_stair(edges, low, high, max_riser=0.22):
    """Closed flight between actual parallel CAD front edges, including skew.

    Exterior B1 stairs use a parallelogram rather than a rectangle: rotating
    a constant-width flight would move every front edge away from the plan.
    Small measured width variations are retained independently at each edge.
    The upper landing supplies the last rise, as for stair_profile.
    """
    if len(edges)<2:
        raise ValueError('A measured staircase needs at least two front edges')
    if any(len(edge)!=2 or any(len(p)!=2 or not all(math.isfinite(v) for v in p) for p in edge) for edge in edges):
        raise ValueError('Invalid measured front edge')
    centers=[tuple((a[i]+b[i])/2 for i in range(2)) for a,b in edges]
    direction=[centers[-1][i]-centers[0][i] for i in range(2)]
    distance=math.hypot(*direction)
    if distance<0.2:
        raise ValueError('Degenerate staircase direction')
    direction=[v/distance for v in direction]
    oriented=[];positions=[0.0];widths=[]
    for i,(a,b) in enumerate(edges):
        width=math.dist(a,b)
        if width<0.5:
            raise ValueError('Unusable stair width')
        if direction[0]*(a[1]-b[1])-direction[1]*(a[0]-b[0]) < 0:
            a,b=b,a
        oriented.append((tuple(a),tuple(b)))  # left, right when ascending
        widths.append(width)
        if i:
            delta=[centers[i][j]-centers[i-1][j] for j in range(2)]
            if sum(delta[j]*direction[j] for j in range(2))<=0:
                raise ValueError('Front edges do not ascend in plan')
            left,right=oriented[i-1]
            cross=abs((left[0]-right[0])*delta[1]-(left[1]-right[1])*delta[0])/widths[i-1]
            if cross<0.20-1e-6:
                raise ValueError('Measured perpendicular going is too short')
            positions.append(positions[-1]+math.hypot(*delta))
    section=stair_profile(positions[-1],low,high,riser_positions=positions,max_riser=max_riser)
    rise=section['riser'];faces=[]
    def point(index, side, height):
        x,y=oriented[index][side]
        return (x,y,height)
    for i in range(len(edges)-1):
        top=low+(i+1)*rise
        bottom0=low+i*rise-0.20;bottom1=bottom0+rise
        faces.append([point(i,1,top),point(i+1,1,top),point(i+1,0,top),point(i,0,top)])
        faces.append([point(i,0,bottom0),point(i+1,0,bottom1),point(i+1,1,bottom1),point(i,1,bottom0)])
        if i:
            # Split the side at the previous tread height so the riser and
            # adjacent side share whole edges, not geometric T junctions.
            faces.append([point(i,1,bottom0),point(i+1,1,bottom1),point(i+1,1,top),point(i,1,top-rise)])
            faces.append([point(i,1,top-rise),point(i+1,1,top),point(i,1,top)])
            faces.append([point(i,0,bottom0),point(i,0,top-rise),point(i+1,0,top),point(i+1,0,bottom1)])
            faces.append([point(i,0,top-rise),point(i,0,top),point(i+1,0,top)])
        else:
            faces.append([point(i,1,bottom0),point(i+1,1,bottom1),point(i+1,1,top),point(i,1,top)])
            faces.append([point(i,0,bottom0),point(i,0,top),point(i+1,0,top),point(i+1,0,bottom1)])
        if i:
            faces.append([point(i,0,top-rise),point(i,1,top-rise),point(i,1,top),point(i,0,top)])
        section['surfaces'][i]['centerCad']=[(centers[i][j]+centers[i+1][j])/2 for j in range(2)]
    faces.append([point(0,0,low-0.20),point(0,1,low-0.20),point(0,1,low+rise),point(0,0,low+rise)])
    last=len(edges)-1
    faces.append([point(last,1,high-rise-0.20),point(last,0,high-rise-0.20),
                  point(last,0,high-rise),point(last,1,high-rise)])
    return {'faces':faces,'edges':oriented,'centers':centers,'widths':widths,**section}


def clip_polygon(ring, value):
    """Clip a convex XY ring to value(point) >= 0; preserve winding."""
    result = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        va, vb = value(a), value(b)
        if va >= 0:
            result.append(a)
        if (va < 0 < vb) or (vb < 0 < va):
            t = va / (va - vb)
            result.append(tuple(a[i] + t * (b[i] - a[i]) for i in range(2)))
    return result


def face_area_vector(face):
    """Twice the oriented area; translation-stable triangle fan."""
    total = [0.0, 0.0, 0.0]
    a = face[0]
    for b, c in zip(face[1:], face[2:]):
        u = [b[i] - a[i] for i in range(3)]
        v = [c[i] - a[i] for i in range(3)]
        for i in range(3):
            total[i] += u[(i + 1) % 3] * v[(i + 2) % 3] - u[(i + 2) % 3] * v[(i + 1) % 3]
    return total


def quantized_face(points):
    """Normalize topology after Blender's final float32 coordinate precision."""
    unique = []
    for point in points:
        if len(point) != 3 or not all(math.isfinite(v) for v in point):
            raise ValueError('Invalid mesh coordinate')
        value = tuple(struct.unpack('<f', struct.pack('<f', float(v)))[0] for v in point)
        if value not in unique:
            unique.append(value)
    if len(unique) < 3 or sum(v * v for v in face_area_vector(unique)) <= 1e-20:
        return []
    return unique


def ceiling_clipped_faces(triangles, bottom, top, plane):
    """Closed footprint prisms below z = ax + by + c, including holes.

    Source constrained triangles already exclude footprint holes. Each triangle
    is split where the plane meets top/bottom; its flat or sloping roof is then
    planar. Shared interior faces can be cancelled by the caller's mesh batch.
    This preserves walls below a known stair soffit without erecting their
    nominal full-height projection through the staircase.
    """
    if not all(math.isfinite(x) for x in [bottom, top, *plane]) or top <= bottom:
        raise ValueError('Invalid clipped wall height/plane')
    if len(plane) != 3:
        raise ValueError('A ceiling plane needs three coefficients')
    a, b, c = plane
    height = lambda p: a * p[0] + b * p[1] + c
    for triangle in triangles:
        if len(triangle) != 3 or not all(len(p) == 2 and all(math.isfinite(x) for x in p) for p in triangle):
            raise ValueError('Invalid footprint triangle')
        ring = [tuple(p) for p in triangle]
        cross = (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0])
        if abs(cross) < 1e-12:
            raise ValueError('Degenerate footprint triangle')
        if cross < 0:
            ring.reverse()
        ring = clip_polygon(ring, lambda p: height(p) - bottom)
        if len(ring) < 3:
            continue
        # Equality belongs to the flat side only when the complete ring is
        # coplanar, avoiding a doubled solid for a constant plane at top.
        values = [height(p) - top for p in ring]
        if min(values) >= -1e-12:
            pieces = [(ring, lambda p: top)]
        elif max(values) <= 1e-12:
            pieces = [(ring, height)]
        else:
            pieces = [(clip_polygon(ring, lambda p: height(p) - top), lambda p: top),
                      (clip_polygon(ring, lambda p: top - height(p)), height)]
        for polygon, roof in pieces:
            if len(polygon) < 3:
                continue
            lower = [(p[0], p[1], bottom) for p in polygon]
            upper = [(p[0], p[1], max(bottom, min(top, roof(p)))) for p in polygon]
            if max(p[2] - bottom for p in upper) <= 1e-10:
                continue
            faces = [upper, list(reversed(lower))]
            for i in range(len(polygon)):
                j = (i + 1) % len(polygon)
                faces.append([lower[i], lower[j], upper[j], upper[i]])
            for face in faces:
                # Zero-height wedge ends collapse an edge; never emit a
                # duplicate vertex or a collinear Blender face.
                unique = []
                for point in face:
                    if point not in unique:
                        unique.append(point)
                if len(unique) >= 3 and math.sqrt(sum(v * v for v in face_area_vector(unique))) > 1e-10:
                    yield unique
