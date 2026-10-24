"""Photo-informed B6 interiors on explicitly classified CAD room polygons.

Pure planning/mesh adapter: no bpy, files, random state or alternative building
geometry. CAD determines room/fixture locations; photographs inform the authored
3-D proportions and finishes. Unclassified rooms are deliberately not bedrooms.
"""
from collections import Counter
import heapq
import math

MATERIALS = frozenset({"b6_wood", "b6_fabric_cream", "b6_fabric_teal", "b6_fabric_blue",
    "b6_metal", "b6_chrome", "b6_ceramic", "b6_mirror", "b6_curtain",
    "b6_shower_curtain", "b6_radiator"})
PHOTO_ROOM = "user-photo-room-20261024"
PHOTO_BATH = "user-photo-bathroom-20261024"
EPS = 1e-8


def _cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def _distance(p, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    q = dx*dx+dy*dy
    t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)) if q else 0
    return math.hypot(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy)


def _edges(ring):
    return zip(ring, ring[1:]+ring[:1])


def _in_ring(p, ring):
    if any(_distance(p, a, b) < EPS for a, b in _edges(ring)):
        return True
    return sum((a[1] > p[1]) != (b[1] > p[1]) and
        p[0] < a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1])
        for a, b in _edges(ring)) % 2 == 1


def point_in_room(p, loops):
    return _in_ring(p, loops[0]) and not any(_in_ring(p, h) for h in loops[1:])


def _proper_cross(a, b, c, d):
    return _cross(a,b,c)*_cross(a,b,d) < -EPS and _cross(c,d,a)*_cross(c,d,b) < -EPS


def _segment_distance(a,b,c,d):
    if _proper_cross(a,b,c,d):return 0.
    return min(_distance(a,c,d),_distance(b,c,d),_distance(c,a,b),_distance(d,a,b))


def footprint_inside(footprint, loops):
    # Corners alone cannot detect a concave notch or a hole enclosed by a box.
    if not all(point_in_room(p, loops) for p in footprint):
        return False
    if any(_proper_cross(a,b,c,d) for a,b in _edges(footprint)
           for ring in loops for c,d in _edges(ring)):
        return False
    if any(_in_ring(h[0], footprint) for h in loops[1:]):
        return False
    return all(point_in_room(((a[0]+b[0])/2,(a[1]+b[1])/2), loops)
               for a,b in _edges(footprint))


def _overlap(a, b):
    # Convex rectangular item/clearance polygons: separating axis test.
    for polygon in (a,b):
        for p,q in _edges(polygon):
            axis = (q[1]-p[1], p[0]-q[0])
            aa=[v[0]*axis[0]+v[1]*axis[1] for v in a]
            bb=[v[0]*axis[0]+v[1]*axis[1] for v in b]
            if max(aa) <= min(bb)+EPS or max(bb) <= min(aa)+EPS:
                return False
    return True


def _validate_room(room):
    loops=room.get('loops')
    if not loops or any(len(r)<3 for r in loops):
        raise ValueError('Invalid room loops: '+str(room.get('id')))
    if not all(len(p)==2 and all(isinstance(n,(int,float)) and math.isfinite(n) for n in p)
               for ring in loops for p in ring):
        raise ValueError('Nonfinite room geometry: '+str(room.get('id')))
    if abs(sum(_cross((0,0),a,b) for a,b in _edges(loops[0]))) < 1e-5:
        raise ValueError('Degenerate room: '+str(room.get('id')))
    return loops


def _attached(opening, loops, room, distance=.38):
    if opening.get('levelKey') != room.get('levelKey'):
        return False
    a,b=opening.get('a',opening.get('hinge')),opening.get('b',opening.get('closedEnd'))
    if not a or not b:
        return False
    mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
    return min(_distance(mid,p,q) for ring in loops for p,q in _edges(ring)) <= distance


def _door_zone(door):
    a,b=door['hinge'],door['closedEnd']; length=math.dist(a,b)
    if length < .1:
        raise ValueError('Invalid door opening')
    u=((b[0]-a[0])/length,(b[1]-a[1])/length);v=(-u[1],u[0])
    # Protect the actual door-centre traversal: .60 m wide > 2*(.25+.02).
    # Expanding the whole aperture by another radius would incorrectly forbid
    # source basins beside a jamb, even when the capsule route stays clear.
    return [(a[0]+u[0]*x+v[0]*y,a[1]+u[1]*x+v[1]*y)
            for x,y in [(length/2-.30,-.74),(length/2+.30,-.74),(length/2+.30,.74),(length/2-.30,.74)]]


def _frame(loops, windows):
    points=loops[0]; xmin=min(p[0] for p in points);xmax=max(p[0] for p in points)
    ymin=min(p[1] for p in points);ymax=max(p[1] for p in points)
    if xmax-xmin <= ymax-ymin:
        u=(1,0); v=(0,1); origin=(xmin,ymin); width=xmax-xmin;depth=ymax-ymin
        if windows and sum((w['a'][1]+w['b'][1])/2 for w in windows)/len(windows)<(ymin+ymax)/2:
            v=(0,-1);origin=(xmin,ymax)
    else:
        u=(0,1);v=(1,0);origin=(xmin,ymin);width=ymax-ymin;depth=xmax-xmin
        if windows and sum((w['a'][0]+w['b'][0])/2 for w in windows)/len(windows)<(xmin+xmax)/2:
            v=(-1,0);origin=(xmax,ymin)
    return {'origin':origin,'u':u,'v':v,'width':width,'depth':depth}


def _at(frame, x, y):
    o,u,v=frame['origin'],frame['u'],frame['v']
    return (o[0]+u[0]*x+v[0]*y,o[1]+u[1]*x+v[1]*y)


def _rect(frame, bounds):
    x0,y0,x1,y1=bounds
    return [_at(frame,x,y) for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]


def _bedroom_frame(loops, windows):
    f=_frame(loops,windows);o,u,v=f['origin'],f['u'],f['v'];d=f['depth']
    ring=[((p[0]-o[0])*u[0]+(p[1]-o[1])*u[1],(p[0]-o[0])*v[0]+(p[1]-o[1])*v[1]) for p in loops[0]]
    # End bays widen at the window by 11 cm, whereas their long wall stays
    # narrower. Use the actual shared interior span past the door recess,
    # not the larger overall bounding box, for the bed/storage layout.
    ys=[1.5,d-.8]+[p[1]+e for p in ring for e in (-1e-5,1e-5) if 1.5<p[1]+e<d-.8]
    left=0.;right=f['width']
    for y in ys:
        hits=sorted(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]) for a,b in _edges(ring)
                    if (a[1]>y)!=(b[1]>y))
        spans=[(a,b) for a,b in zip(hits[::2],hits[1::2]) if a<=f['width']/2<=b]
        if not spans:return f
        left=max(left,spans[0][0]);right=min(right,spans[0][1])
    return {**f,'origin':_at(f,left,0),'width':right-left}


class _RoomPlan:
    def __init__(self,floor,room,base,doors):
        self.floor=floor;self.room=room;self.base=base;self.loops=_validate_room(room)
        self.zones=[_door_zone(d) for d in doors];self.items=[];self.rejected=[]
        self.aisle=None

    def add(self,label,frame,bounds,z0,z1,material,role,collision=False,shape='box',required=False,**extra):
        values=[*bounds,z0,z1]
        if not all(math.isfinite(v) for v in values) or bounds[2]<=bounds[0] or bounds[3]<=bounds[1] or z1<=z0:
            raise ValueError('Invalid furnishing dimensions: '+label)
        footprint=_rect(frame,bounds)
        reason=None
        if not footprint_inside(footprint,self.loops):reason='outside-room'
        elif z0 < 2.1 and any(_overlap(footprint,zone) for zone in self.zones):reason='door-clearance'
        elif collision and z0 < 1.8 and self.aisle and _overlap(footprint,self.aisle):reason='central-aisle'
        if reason:
            self.rejected.append({'item':label,'reason':reason,'required':required})
            return False
        if material not in MATERIALS:raise ValueError('Unknown furniture material '+material)
        self.items.append({'id':self.floor+':'+self.room['id']+':'+label,'floor':self.floor,
            'roomId':self.room['id'],'usage':self.room['usage'],'role':role,'material':material,
            'collision':bool(collision),'shape':shape,'frame':frame,'bounds':list(bounds),
            'bottom':self.base+z0,'top':self.base+z1,'footprintCad':footprint,
            'photoSource':PHOTO_ROOM if self.room['usage']=='bedroom' else PHOTO_BATH,
            'sourceRoomEntity':self.room.get('sourceEntity'),**extra})
        return True


def _bedroom(plan, windows):
    f=_bedroom_frame(plan.loops,windows);w,d=f['width'],f['depth']
    if w<2.18 or d<5.3 or w>3.5 or d>8:
        return 'unsupported-bedroom-proportions'
    plan.aisle=_rect(f,(w/2-.30,.95,w/2+.30,d-.8))
    bed_width=.75; near=max(1.55,d-4.15);far=near+2.0
    if w-2*(bed_width+.05)<.60-EPS:return 'insufficient-bed-aisle'
    for side,x in enumerate((.05,w-.05-bed_width)):
        prefix=f'bed-{side+1}'; role='interior-furniture/bed'
        plan.add(prefix+'-frame',f,(x,near,x+bed_width,far),.08,.32,'b6_wood',role,True,required=True)
        plan.add(prefix+'-mattress',f,(x+.02,near+.02,x+bed_width-.02,far-.02),.32,.46,'b6_fabric_cream',role,True)
        fabric='b6_fabric_cream' if side==0 else 'b6_fabric_teal'
        plan.add(prefix+'-blanket',f,(x+.025,near+.06,x+bed_width-.025,far-.44),.46,.49,fabric,role)
        plan.add(prefix+'-pillow',f,(x+.09,far-.40,x+bed_width-.09,far-.09),.46,.57,'b6_fabric_cream',role,shape='ellipsoid')
        plan.add(prefix+'-headboard',f,(x,far-.025,x+bed_width,far+.025),.10,.91,'b6_wood',role)
        dx=.06 if side==0 else w-.81
        plan.add(f'desk-{side}-top',f,(dx,d-.68,dx+.75,d-.10),.72,.77,'b6_wood','interior-furniture/desk',True,required=True)
        for lx in (dx+.045,dx+.705):
            for ly in (d-.62,d-.16):
                plan.add(f'desk-{side}-leg-{lx:.3f}-{ly:.3f}',f,(lx-.014,ly-.014,lx+.014,ly+.014),.03,.72,'b6_metal','interior-furniture/desk')
        cx=dx+.375
        plan.add(f'chair-{side}-seat',f,(cx-.19,d-1.16,cx+.19,d-.79),.43,.49,'b6_fabric_blue','interior-furniture/seating',True)
        plan.add(f'chair-{side}-back',f,(cx-.19,d-1.18,cx+.19,d-1.13),.49,1.0,'b6_fabric_blue','interior-furniture/seating',True)
        plan.add(f'chair-{side}-stem',f,(cx-.03,d-.99,cx+.03,d-.93),.08,.43,'b6_metal','interior-furniture/seating')
        for offset in (-.14,.14):
            plan.add(f'chair-{side}-base-{offset}',f,(cx-.18,d-.96+offset-.018,cx+.18,d-.96+offset+.018),.055,.09,'b6_metal','interior-furniture/seating')
        plan.add(f'desk-{side}-monitor',f,(dx+.14,d-.35,dx+.60,d-.31),.84,1.15,'b6_metal','interior-furniture/desk')
        plan.add(f'desk-{side}-monitor-stand',f,(dx+.34,d-.39,dx+.40,d-.26),.77,.85,'b6_metal','interior-furniture/desk')
    # The photo's right-hand storage: open wooden shelves and one tall narrow
    # bookcase, not a fabricated full-width wardrobe blocking the entrance.
    bx=w-.43;by=far+.16
    plan.add('bookcase-back',f,(bx,by,w-.05,min(by+.60,d-1.30)),.05,1.45,'b6_wood','interior-furniture/storage',True)
    for h in (1.35,1.70,2.05):
        plan.add('wall-shelf-'+str(h),f,(w-.30,near+.65,w-.04,far+.45),h,h+.035,'b6_wood','interior-furniture/storage')
    plan.add('wall-cupboard',f,(w-.32,near+.55,w-.045,near+1.10),1.38,2.10,'b6_wood','interior-furniture/storage')
    plan.add('radiator',f,(w/2-.43,d-.10,w/2+.43,d-.04),.23,.77,'b6_radiator','interior-furniture/radiator',True)
    for i in range(12):
        x=w/2-.40+i*.071
        plan.add('radiator-fin-'+str(i),f,(x,d-.14,x+.025,d-.09),.27,.72,'b6_radiator','interior-furniture/radiator')
    for side,x in enumerate((.08,w-.25)):
        plan.add('curtain-'+str(side),f,(x,d-.10,x+.17,d-.045),.87,2.40,'b6_curtain','interior-furniture/curtain',shape='curtain')
    return None


def _fixture_frame(spec):
    center=spec['centerCad'];v=spec['facingCad'];length=math.hypot(*v)
    if not all(math.isfinite(x) for x in [*center,*v]) or length<.5:
        raise ValueError('Invalid sanitary fixture placement')
    v=(v[0]/length,v[1]/length);u=(v[1],-v[0])
    return {'origin':tuple(center),'u':u,'v':v}


def _source_corner_boxes(plan, frame, bounds, minimum_fraction):
    """Cut a rectangular shower shell only at actual orthogonal room notches.

    Does not move the measured source centre, walls or clearance. This handles
    N06's column corner within the drawn first shower, with an explicit audit.
    """
    if footprint_inside(_rect(frame,bounds),plan.loops):return [bounds]
    x0,y0,x1,y1=bounds;o,u,v=frame['origin'],frame['u'],frame['v']
    points=[((p[0]-o[0])*u[0]+(p[1]-o[1])*u[1],(p[0]-o[0])*v[0]+(p[1]-o[1])*v[1])
            for ring in plan.loops for p in ring]
    xs=sorted({x0,x1,*[x for x,y in points if x0+EPS<x<x1-EPS]})
    ys=sorted({y0,y1,*[y for x,y in points if y0+EPS<y<y1-EPS]})
    cells=[(a,c,b,d) for a,b in zip(xs,xs[1:]) for c,d in zip(ys,ys[1:])
           if footprint_inside(_rect(frame,(a,c,b,d)),plan.loops)]
    area=sum((b-a)*(d-c) for a,c,b,d in cells)
    if area < (x1-x0)*(y1-y0)*minimum_fraction:return []
    # Adjacent boxes merge only if their union is exactly another rectangle.
    changed=True
    while changed:
        changed=False
        for i,a in enumerate(cells):
            for j in range(i+1,len(cells)):
                b=cells[j];union=(min(a[0],b[0]),min(a[1],b[1]),max(a[2],b[2]),max(a[3],b[3]))
                union_area=(union[2]-union[0])*(union[3]-union[1])
                total=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])
                if abs(union_area-total)<EPS and footprint_inside(_rect(frame,union),plan.loops):
                    cells[i]=union;cells.pop(j);changed=True;break
            if changed:break
    return cells if len(cells)<=8 else []


def _sanitary(plan, specs):
    if not specs:return 'missing-source-sanitary-fixtures'
    for index,spec in enumerate(specs):
        kind=spec['kind'];f=_fixture_frame(spec);name=f'{kind}-{index}'
        role='interior-sanitary/'+kind
        if not spec.get('sourceEntities'):raise ValueError('Sanitary fixture needs source handles')
        extra={'sourceEntities':list(spec['sourceEntities']),
               'sourceFixtureCenterCad':list(spec['centerCad']),
               'sourceFixtureBoundsCad':spec.get('boundsCad')}
        def add(label,b,z0,z1,mat='b6_ceramic',collision=False,shape='box',required=False):
            return plan.add(name+'-'+label,f,b,z0,z1,mat,role,collision,shape,required,**extra)
        def shower_box(label,b,z0,z1,required=False):
            boxes=_source_corner_boxes(plan,f,b,.90 if label=='tray' else .70)
            if not boxes:return add(label,b,z0,z1,collision=True,required=required)
            clipped=len(boxes)!=1 or tuple(boxes[0])!=tuple(b)
            for part,box in enumerate(boxes):
                plan.add(name+'-'+label+('' if part==0 else '-clip-'+str(part)),f,box,z0,z1,
                    'b6_ceramic',role,True,'box',required,
                    sourceClipping='source room column notch; authored tray/side termination' if clipped else None,**extra)
        if kind=='shower':
            width,depth=spec.get('size',[.78,.78]);width=min(width,.86);depth=min(depth,.90)
            # Source equipment is sub-mm; room loops are rounded to 1 mm.
            # A 2 mm perimeter inset keeps the exact source centre and avoids
            # embedding a sanitary shell in that quantized wall boundary.
            width-=.004;depth-=.004
            x0,x1=-width/2,width/2;y0,y1=-depth/2,depth/2
            shower_box('tray',(x0,y0,x1,y1),.015,.055,required=True)
            for side,x in enumerate((x0+.015,x1-.015)):
                shower_box('side-'+str(side),(x-.012,y0,x+.012,y1),.055,2.0)
            # Gathered curtains leave a real central opening, as in the photo.
            for side,x in enumerate((x0+.025,x1-.075)):
                add('curtain-'+str(side),(x,y1-.03,x+.05,y1-.005),.10,1.92,'b6_shower_curtain',shape='curtain')
            add('rail',(x0,y1-.03,x1,y1-.01),1.97,2.0,'b6_chrome')
            add('mixer',(-.12,y0+.015,.12,y0+.07),1.0,1.045,'b6_chrome')
            add('pipe',(-.012,y0+.035,.012,y0+.06),1.02,1.70,'b6_chrome')
            add('head',(-.05,y0+.03,.05,y0+.15),1.69,1.74,'b6_chrome',shape='ellipsoid')
        elif kind in ('basin','service-sink'):
            width,depth=spec.get('size',[.56,.43]);width=min(width,.64);depth=min(depth,.48)
            width-=.004;depth-=.004
            add('bowl',(-width/2,-depth/2,width/2,depth/2),.61,.84,collision=True,shape='basin',required=True)
            add('drain',(-.035,-.04,.035,.04),.40,.64,'b6_chrome')
            add('tap-stem',(-.025,-depth/2+.035,.025,-depth/2+.085),.83,1.0,'b6_chrome')
            add('tap-spout',(-.025,-depth/2+.06,.025,.04),.975,1.01,'b6_chrome')
            add('mirror',(-.25,-depth/2+.006,.25,-depth/2+.018),1.12,1.81,'b6_mirror')
        elif kind=='toilet':
            width,depth=spec.get('size',[.352,.50])
            width-=.004;depth-=.004
            add('pedestal',(-width*.38,-depth*.30,width*.38,depth*.36),.015,.33,collision=True,shape='ellipsoid')
            add('bowl',(-width/2,-depth*.30,width/2,depth/2),.24,.45,collision=True,shape='basin',required=True)
            add('tank',(-width/2,-depth/2,width/2,-depth*.30),.43,.86,collision=True)
        elif kind=='urinal':
            width,depth=spec.get('size',[.3473,.2565])
            width-=.004;depth-=.004
            add('body',(-width/2,-depth/2,width/2,depth/2),.40,.94,collision=True,shape='basin',required=True)
            add('flush',(-.018,-depth*.43,.018,-depth*.30),.93,1.16,'b6_chrome')
        else:raise ValueError('Unknown sanitary fixture kind '+kind)
    if plan.room['usage']=='bathroom':
        f=_frame(plan.loops,[]);w,d=f['width'],f['depth']
        plan.add('ventilation-duct',f,(w-.35,.30,w-.20,d-1.10),2.32,2.52,
                 'b6_radiator','interior-sanitary/ventilation')
        for i in range(2):
            x=.25+i*max(.6,w-1.0)
            plan.add('ventilation-grille-'+str(i),f,(x,d-1.10,min(x+.32,w-.05),d-1.07),2.20,2.35,
                     'b6_metal','interior-sanitary/ventilation')
    return None


def _walk_evidence(plan,doors,windows):
    """Conservative planar candidate tour; NEVER a game-controller PASS.

    Circles/segments must stay radius+skin inside the actual room and clear
    coarse furniture. Root still checks support, walls and movement in 3-D.
    """
    radius=.27
    obstacles=[i['footprintCad'] for i in plan.items if i['collision'] and
               i['top']>plan.base+.22 and i['bottom']<plan.base+1.60]
    def clear(a,b):
        if not point_in_room(a,plan.loops) or not point_in_room(b,plan.loops):return False
        if any(_segment_distance(a,b,c,d)<radius-1e-7 for ring in plan.loops for c,d in _edges(ring)):return False
        return not any(_in_ring(a,p) or _in_ring(b,p) or
            any(_segment_distance(a,b,c,d)<radius-1e-7 for c,d in _edges(p)) for p in obstacles)
    nodes=[];entry=[];targets=[];extra_targets=[]
    def node(cad,label,height=None,**extra):
        if not clear(cad,cad):return None
        index=len(nodes);nodes.append({'cad':list(cad),'height':plan.base if height is None else height,'label':label,**extra})
        return index
    for door in doors:
        a,b=door['hinge'],door['closedEnd'];length=math.dist(a,b)
        midpoint=((a[0]+b[0])/2,(a[1]+b[1])/2);normal=(-(b[1]-a[1])/length,(b[0]-a[0])/length)
        candidates=[(midpoint[0]+normal[0]*sign*.45,midpoint[1]+normal[1]*sign*.45) for sign in (-1,1)]
        inside=[p for p in candidates if point_in_room(p,plan.loops)]
        for p in inside:
            index=node(p,'door-inside',sourceDoorId=door['id'])
            if index is not None:entry.append((len(inside),index))
    f=_bedroom_frame(plan.loops,windows) if plan.room['usage']=='bedroom' else _frame(plan.loops,[])
    w,d=f['width'],f['depth']
    for x,y in [(w/2,d/2),(w/2,d*.25),(w/2,d*.75),(w*.25,d/2),(w*.75,d/2)]:
        node(_at(f,x,y),'aisle-helper')
    if plan.room['usage']=='wc' and len(plan.room.get('sanitaryFixtures',[]))<=2:
        # Tight source WC/service closets need a bend around the sink lip.
        # Only their actual obstacle corners are candidates; no campus grid.
        seen=set()
        for obstacle in obstacles:
            for corner in obstacle:
                for dx,dy in [(-.29,-.29),(-.29,.29),(.29,-.29),(.29,.29)]:
                    p=(corner[0]+dx,corner[1]+dy);key=tuple(round(v,5) for v in p)
                    if key not in seen:node(p,'fixture-corner');seen.add(key)
    desired=[]
    if plan.room['usage']=='bedroom':
        desired=[('entrance-turn',_at(f,w/2,1.15),plan.base),
                 ('between-beds',_at(f,w/2,max(1.55,d-4.15)+1.0),plan.base),
                 ('before-desks',_at(f,w/2,d-.90),plan.base)]
    else:
        for index,spec in enumerate(plan.room.get('sanitaryFixtures',[])):
            sf=_fixture_frame(spec);depth=spec.get('size',[.6,.45])[1]
            front=depth/2+(.44 if spec['kind']=='shower' else .30)
            candidates=[_at(sf,side,front+forward) for forward in (0,.10) for side in (0,.15,-.15)]
            target=next((p for p in candidates if clear(p,p)),candidates[0])
            desired.append((spec['kind']+'-front-access-'+str(index),target,plan.base))
            if spec['kind']=='shower':
                extra_targets.append({'cad':list(spec['centerCad']),'height':plan.base+.055,
                    'label':'shower-interior-'+str(index),'sourceEntities':spec['sourceEntities'],
                    'reason':'tray centre is not a claimed route: source partition neck must be checked by actual controller'})
    blocked=[]
    for label,cad,height in desired:
        index=node(cad,label,height)
        if index is None:blocked.append({'target':label,'reason':'insufficient-static-capsule-clearance','cad':list(cad)})
        else:targets.append(index)
    if not entry:return {'walkPath':[],'walkPathUnresolved':[{'reason':'no-clear-native-door-start'},*blocked],
        'walkPathStatus':'candidate-only','walkPathRadius':radius,'walkExtraTargets':extra_targets,'requiresActualController':True}
    start=min(entry)[1];edges=[[] for _ in nodes]
    for i,a in enumerate(nodes):
        for j in range(i+1,len(nodes)):
            b=nodes[j]
            if clear(a['cad'],b['cad']):
                length=math.dist(a['cad'],b['cad']);edges[i].append((j,length));edges[j].append((i,length))
    path=[start];cursor=start
    for target in [*targets,start]:
        distances={cursor:0.};previous={};queue=[(0.,cursor)]
        while queue:
            cost,current=heapq.heappop(queue)
            if current==target:break
            if cost>distances[current]+EPS:continue
            for nxt,weight in edges[current]:
                total=cost+weight
                if total<distances.get(nxt,math.inf):
                    distances[nxt]=total;previous[nxt]=current;heapq.heappush(queue,(total,nxt))
        if target not in distances:
            blocked.append({'target':nodes[target]['label'],'reason':'no-clear-static-route','cad':nodes[target]['cad']});continue
        segment=[];p=target
        while p!=cursor:segment.append(p);p=previous[p]
        path.extend(reversed(segment));cursor=target
    return {'walkPath':[nodes[i] for i in path],'walkPathUnresolved':blocked,
        'walkPathStatus':'candidate-only','walkPathRadius':radius,'walkExtraTargets':extra_targets,'requiresActualController':True}


def plan_b06_furnishings(recipe, *, walk_paths=True):
    if recipe.get('buildingId')!='b06':raise ValueError('B6 furnishings require the B6 recipe')
    items=[];rooms=[];skipped=[]
    for floor in recipe.get('floors',[]):
        for room in floor.get('rooms',[]):
            usage=room.get('usage')
            if usage not in ('bedroom','bathroom','wc'):continue
            if not (room.get('usageBasis') or room.get('sourceBasis')):
                raise ValueError('Room usage lacks provenance: '+room['id'])
            if usage=='bedroom' and floor['id'] not in {'n01','n02','n03','n04','n05','n06'}:
                skipped.append({'floor':floor['id'],'roomId':room['id'],'reason':'bedroom-outside-supported-storeys'});continue
            loops=_validate_room(room)
            doors=[d for d in floor.get('doors',[]) if d.get('openingClassification') not in
                   ('facade-opening-unconfirmed-access','fixed-paired-door-leaf') and _attached(d,loops,room)]
            windows=[w for w in floor.get('windows',[]) if _attached(w,loops,room,.45)]
            level=room.get('levelKey','').split('.')[-1]
            base=floor.get('levelElevations',{}).get(level,floor.get('elevation'))
            if not isinstance(base,(int,float)) or not math.isfinite(base):raise ValueError('Missing room elevation')
            plan=_RoomPlan(floor['id'],room,base,doors)
            if usage=='bedroom':
                reason='missing-native-bedroom-door-or-window' if not doors or not windows else _bedroom(plan,windows)
            else:reason=_sanitary(plan,room.get('sanitaryFixtures',[]))
            if reason or any(r['required'] for r in plan.rejected):
                skipped.append({'floor':floor['id'],'roomId':room['id'],'reason':reason or 'required-furniture-clearance','rejected':plan.rejected});continue
            items.extend(plan.items)
            rooms.append({'floor':floor['id'],'roomId':room['id'],'usage':usage,'sourceEntity':room.get('sourceEntity'),
                'usageBasis':room.get('usageBasis',room.get('sourceBasis')),'doorIds':[d['id'] for d in doors],
                'windowIds':[w['id'] for w in windows],'doorClearanceCad':plan.zones,
                'aisleCad':plan.aisle,'minimumAisle':.60 if plan.aisle else None,
                'sanitaryFixtureCounts':dict(Counter(s['kind'] for s in room.get('sanitaryFixtures',[]))),
                'sourceAdaptations':[{'itemId':i['id'],'basis':i['sourceClipping'],
                    'sourceEntities':i['sourceEntities'],'sourceCenterCad':i['sourceFixtureCenterCad'],
                    'sourceBoundsCad':i['sourceFixtureBoundsCad']} for i in plan.items if i.get('sourceClipping')],
                'itemCount':len(plan.items),'omittedOptional':plan.rejected,
                **(_walk_evidence(plan,doors,windows) if walk_paths else {})})
    untreated=Counter(room.get('usage','unclassified') for floor in recipe.get('floors',[])
        for room in floor.get('rooms',[]) if room.get('usage') not in ('bedroom','bathroom','wc'))
    return {'items':items,'rooms':rooms,'skipped':skipped,'unfurnishedUsageCounts':dict(untreated)}


def _profile_mesh(item, profile, segments=12):
    x0,y0,x1,y1=item['bounds'];cx=(x0+x1)/2;cy=(y0+y1)/2
    rx=(x1-x0)/2;ry=(y1-y0)/2;bottom=item['bottom'];height=item['top']-bottom
    vertices=[];rings=[];faces=[]
    for scale,z in profile:
        ring=[]
        for i in range(1 if scale==0 else segments):
            angle=2*math.pi*i/segments;p=_at(item['frame'],cx+rx*scale*math.cos(angle),cy+ry*scale*math.sin(angle))
            ring.append(len(vertices));vertices.append((*p,bottom+z*height))
        rings.append(ring)
    for a,b in zip(rings,rings[1:]):
        for i in range(segments):
            j=(i+1)%segments
            if len(a)==1:faces.append([a[0],b[j],b[i]])
            elif len(b)==1:faces.append([a[i],a[j],b[0]])
            else:faces.append([a[i],a[j],b[j],b[i]])
    return vertices,faces


def corridor_ceiling_fixtures(recipe):
    """Photographic fluorescent housings; spacing is an authored estimate.

    Only long, explicitly identified main corridors receive repeated fixtures.
    Source polygon containment protects stair apertures and room boundaries.
    """
    result=[]
    for floor in recipe['floors']:
        for room in floor.get('rooms',[]):
            if room.get('usage')!='corridor':continue
            points=room['loops'][0]
            xmin,xmax=min(p[0] for p in points),max(p[0] for p in points)
            ymin,ymax=min(p[1] for p in points),max(p[1] for p in points)
            if xmax-xmin<20:continue
            level_key=room['levelKey'].split('.')[-1]
            ceiling=floor.get('levelCeilings',{}).get(level_key,floor.get('ceilingElevation'))
            if ceiling is None:continue
            y=(ymin+ymax)/2
            count=max(1,int((xmax-xmin)/4.5))
            for index in range(count):
                x=xmin+(index+.5)*(xmax-xmin)/count
                footprint=[[x-.11,y-.63],[x+.11,y-.63],[x+.11,y+.63],[x-.11,y+.63]]
                if not footprint_inside(footprint,room['loops']):continue
                result.append({'floor':floor['id'],'roomId':room['id'],'sourceEntity':room['sourceEntity'],
                    'a':[x,y-.6],'b':[x,y+.6],'ceiling':ceiling,
                    'basis':'user corridor photo; authored 1.2m housing and approximately 4.5m spacing, not surveyed'})
    return result


def add_b06_furnishings(geometry, recipe):
    plan=plan_b06_furnishings(recipe)
    for item in plan['items']:
        key=(item['floor'],item['role'],item['material'],item['collision'])
        f=item['frame'];x0,y0,x1,y1=item['bounds'];bottom,top=item['bottom'],item['top']
        if item['shape']=='box':
            geometry.prism(key,_at(f,x0,(y0+y1)/2),_at(f,x1,(y0+y1)/2),y1-y0,bottom,top)
        elif item['shape']=='curtain':
            # Small pleated sheet, hanging to the sides, never across the view.
            for i in range(8):
                xa=x0+(x1-x0)*i/8;xb=x0+(x1-x0)*(i+1)/8
                ya=y0 if i%2 else y1;yb=y0 if (i+1)%2 else y1
                a=_at(f,xa,ya);b=_at(f,xb,yb)
                # Closed 2mm fabric strips remain visible from both sides and
                # retain the native signed-volume check without a collidable curtain.
                geometry.prism(key,a,b,.002,bottom,top)
        else:
            profile=([(0,0),(.7,.12),(1,.43),(.94,.88),(.84,1),(.67,.87),(.28,.41),(0,.38)]
                     if item['shape']=='basin' else [(0,0),(.71,.15),(1,.5),(.71,.85),(0,1)])
            vertices,faces=_profile_mesh(item,profile)
            reverse=f['u'][0]*f['v'][1]-f['u'][1]*f['v'][0]<0
            for face in faces:
                geometry.face(key,[geometry.at(vertices[i][:2],vertices[i][2]) for i in (list(reversed(face)) if reverse else face)])
    fixtures=corridor_ceiling_fixtures(recipe)
    for item in fixtures:
        floor=item['floor'];ceiling=item['ceiling']
        geometry.prism((floor,'interior-ceiling-fixture','b6_radiator',False),item['a'],item['b'],.20,ceiling-.11,ceiling-.025)
        geometry.prism((floor,'interior-ceiling-diffuser','b6_ceramic',False),item['a'],item['b'],.145,ceiling-.12,ceiling-.11)
    counts=Counter(r['usage'] for r in plan['rooms'])
    if hasattr(geometry,'counts'):
        for usage,count in counts.items():geometry.counts['furnished-'+usage]+=count
        geometry.counts['furnishing-items']+=len(plan['items'])
    return {'roomCount':len(plan['rooms']),'itemCount':len(plan['items']),'byUsage':dict(counts),
        'rooms':plan['rooms'],'skipped':plan['skipped'],'materialKeys':sorted({i['material'] for i in plan['items']}),
        'unfurnishedUsageCounts':plan['unfurnishedUsageCounts'],'corridorCeilingFixtures':fixtures,
        'basis':'CAD room/fixture placement; photo-informed authored 3D proportions, not surveyed furniture dimensions'}
