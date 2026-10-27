"""Pure tube/photographic leaf construction, adapted from accepted pilot helpers.
No bpy, file IO or mutable authoring globals; support IDs are explicit.
"""
import math
import numpy as np

def unit(value):
    a=np.asarray(value,dtype=float);n=float(np.linalg.norm(a))
    if not math.isfinite(n) or n<1e-12:raise ValueError('Degenerate direction')
    return a/n

def sample(branch,t):
    u=t*(len(branch['points'])-1);i=min(int(u),len(branch['points'])-2);f=u-i
    a=np.asarray(branch['points'][i]);b=np.asarray(branch['points'][i+1])
    return a*(1-f)+b*f,unit(b-a),branch['radii'][i]*(1-f)+branch['radii'][i+1]*f

def resolve_wood_lod(branches,lod,required_ids=()):
    # Closest actual full-coverage transitions: near2m / MID6m / FAR75m.
    distance,diameter_pixels,deviation_pixels,max_sides=[(2,0,.35,24),(6,.5,.45,12),(75,.65,.5,10)][lod]
    focal=720/(2*math.tan(.85/2));epsilon=deviation_pixels*distance/focal
    lookup={b['id']:b for b in branches};kept={b['id']for b in branches if 2*max(b['radii'])*focal/distance>=diameter_pixels}
    if any(i not in lookup for i in required_ids):raise ValueError('Unknown required wood support')
    kept.update(required_ids)
    for axis in range(3):
        entries=[(p[axis],b['id'])for b in branches for p in b['points']]
        kept.update([min(entries)[1],max(entries)[1]])
    for ident in list(kept):
        parent=lookup[ident]['parent']
        while parent is not None:kept.add(parent);parent=lookup[parent]['parent']
    critical={i:{0.,1.}for i in kept}
    for b in branches:
        if b['id']in kept and b['parent']in kept:critical[b['parent']].add(b['attachmentT'])
    result=[];max_error=0.
    for b in branches:
        if b['id']not in kept:continue
        ts=sorted({i/(len(b['points'])-1)for i in range(len(b['points']))}|critical[b['id']]);pr=[sample(b,t)for t in ts]
        points=np.asarray([x[0]for x in pr]);radii=np.asarray([x[2]for x in pr]);required=sorted(i for i,t in enumerate(ts)if t in critical[b['id']]);selected=set(required)
        def simplify(a,c):
            nonlocal max_error
            if c-a<2:return
            line=points[c]-points[a];den=float(line@line);worst=0.;chosen=None
            for i in range(a+1,c):
                f=max(0,min(1,float((points[i]-points[a])@line)/den))if den else 0
                error=float(np.linalg.norm(points[i]-points[a]-f*line))+abs(float(radii[i]-(radii[a]*(1-f)+radii[c]*f)))
                if error>worst:worst=error;chosen=i
            if worst>epsilon:selected.add(chosen);simplify(a,chosen);simplify(chosen,c)
            else:max_error=max(max_error,worst)
        for a,c in zip(required,required[1:]):simplify(a,c)
        indices=sorted(selected);angle=math.acos(max(-1,min(1,1-epsilon/max(max(b['radii']),1e-9))));sides=max(3,min(max_sides,math.ceil(math.pi/max(angle,1e-3))))
        result.append({**b,'points':points[indices].tolist(),'radii':radii[indices].tolist(),'sides':sides})
    return result,{'sourceBranches':len(branches),'retainedBranches':len(result),'requiredSupports':len(set(required_ids)),'maximumCurveErrorMetres':max_error,'curveBudgetMetres':epsilon,'referenceDistanceMetres':distance}

def tube_geometry(branches,lod,required_ids=()):
    resolved,audit=resolve_wood_lod(branches,lod,required_ids);vertices=[];faces=[];loop_uv=[];ranges={}
    for b in resolved:
        points=np.asarray(b['points']);sides=b['sides'];base=len(vertices);face_start=len(faces);travel=0.;prior=0.;circumference=2*math.pi*b['radii'][0]
        for i,p in enumerate(points):
            direction=unit(points[min(i+1,len(points)-1)]-points[max(0,i-1)]);side=unit(np.cross(direction,[0,1,0])if abs(direction[1])<.95 else np.cross(direction,[1,0,0]));up=np.cross(direction,side)
            if i:travel+=float(np.linalg.norm(p-points[i-1]))
            for j in range(sides):
                a=j*math.tau/sides;vertices.append((p+b['radii'][i]*(side*math.cos(a)+up*math.sin(a))).tolist())
                if i:
                    faces.append((base+(i-1)*sides+j,base+(i-1)*sides+(j+1)%sides,base+i*sides+(j+1)%sides,base+i*sides+j));u=j/sides*circumference;v=(j+1)/sides*circumference
                    loop_uv.extend([(u,prior),(v,prior),(v,travel),(u,travel)])
            prior=travel
        cap0=tuple(base+j for j in reversed(range(sides)));cap1=tuple(base+(len(points)-1)*sides+j for j in range(sides));faces.extend([cap0,cap1])
        loop_uv.extend([(j/sides*circumference,0)for j in reversed(range(sides))]);loop_uv.extend([(j/sides*circumference,travel)for j in range(sides)])
        ranges[b['id']]={'vertices':[base,len(vertices)],'faces':[face_start,len(faces)]}
    return {'positions':vertices,'faces':faces,'loopUvs':loop_uv,'branches':resolved,'ranges':ranges,'audit':audit}

def photographic_part(part,atlas,lod):
    source=next(p for p in atlas['parts']if p['id']==part['partId']);component=next(c for c in atlas['components']if c['id']==source['componentId'])
    u0=np.asarray(source['attachmentUvBlender']);tip=np.asarray(source['axisTipUvBlender']);axis2=(tip-u0)/np.linalg.norm(tip-u0);side2=np.array([axis2[1],-axis2[0]])
    broad=atlas['id']=='LeafSet024';physical_scale=.4 if broad else part['physicalLengthMetres']/float(np.linalg.norm(tip-u0));anchor=np.asarray(part['anchor']);tangent=unit(part['tangent'])
    phase=part['orientationSeed']/0xffffffff
    angle=part['componentOrdinal']*2.399963+part['angularJitter']*.4 if broad else phase*math.tau
    basis=unit(np.cross(tangent,[0,0,1])if abs(tangent[2])<.9 else np.cross(tangent,[0,1,0]));radial=basis*math.cos(angle)+np.cross(tangent,basis)*math.sin(angle)
    axis3=unit(tangent*.45+radial*.75+np.array([0,0,.12 if broad else -.12]));side3=unit(np.cross(axis3,[0,0,1])if abs(axis3[2])<.9 else np.cross(axis3,[0,1,0]));normal3=np.cross(side3,axis3)
    roll=(part['independentRoll']-.5)*1.4 if broad else (phase-.5)*1.4;side3=side3*math.cos(roll)+normal3*math.sin(roll);normal3=np.cross(side3,axis3)
    hull=np.asarray(component['cutoutHullUvBlender']);lo=hull.min(0);hi=hull.max(0)
    if broad:
        uv=np.array([[x,y]for y in [lo[1],(lo[1]+hi[1])/2,hi[1]]for x in [lo[0],hi[0]]]);faces=[(0,1,3),(0,3,2),(2,3,5),(2,5,4)]
        if lod>0:uv=uv[[0,1,5,4]];faces=[(0,1,2),(0,2,3)]
    else:
        # Same photographed twig at physical scale, conservative hull in all
        # detailed LODs; FAR uses its metric alpha rectangle, not enlarged cards.
        uv=np.vstack([hull.mean(0),hull])if lod<2 else np.array([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]])
        faces=[(0,1+j,1+(j+1)%len(hull))for j in range(len(hull))]if lod<2 else [(0,1,2),(0,2,3)]
    length=float(np.linalg.norm(tip-u0))*physical_scale;positions=[]
    for point in uv:
        delta=(point-u0)*physical_scale;x=float(delta@side2);y=float(delta@axis2);bend=.015*length*math.sin(math.pi*max(0,min(1,y/length)))if broad else 0
        positions.append((anchor+side3*x+axis3*y+normal3*bend).tolist())
    return {'positions':positions,'uvs':uv.tolist(),'faces':faces,'lengthMetres':length}

def foliage_geometry(groups,atlas,lod):
    positions=[];faces=[];uv=[];ranks=[];components=[]
    for group in groups:
        for part in group['parts']:
            item=photographic_part(part,atlas,lod);base=len(positions);positions.extend(item['positions']);uv.extend(item['uvs']);faces.extend([tuple(base+i for i in face)for face in item['faces']]);ranks.extend([group['rank']]*len(item['positions']))
            components.append({**part,'rank':group['rank'],'vertexStart':base,'vertexCount':len(item['positions']),'physicalLengthMetres':item['lengthMetres']})
    return {'positions':positions,'faces':faces,'uvs':uv,'ranks':ranks,'components':components}

def fir_quad_from_source(source_positions,source_uv,part,component,expected_anchor):
    """Same UV/base/sine-bend mapping used by accepted R5 Fir polygon authoring.
    Fit the actual native eight corners, then evaluate its conservative rectangle.
    No new rotation, scale, rank, photo pixels or source attachment is invented.
    """
    position=np.asarray(source_positions,dtype=float);uv=np.asarray(source_uv,dtype=float)
    if position.shape!=(8,3)or uv.shape!=(8,2)or not np.isfinite(position).all()or not np.isfinite(uv).all():raise ValueError('Expected eight original R5 Fir corners')
    base=np.asarray(part['attachmentUvBlender']);tip=np.asarray(part['axisTipUvBlender']);axis=(tip-base)/np.linalg.norm(tip-base)
    def features(coords):
        coords=np.asarray(coords);phase=np.clip((coords-base)@axis/np.linalg.norm(tip-base),0,1)
        return np.column_stack([coords,np.ones(len(coords)),np.sin(math.pi*phase)])
    coefficients,_,rank,_=np.linalg.lstsq(features(uv),position,rcond=None)
    if rank!=4:raise ValueError('Degenerate source photographic mapping')
    error=float(np.max(np.linalg.norm(features(uv)@coefficients-position,axis=1)))
    anchor_error=float(np.linalg.norm((features([base])@coefficients)[0]-expected_anchor))
    if error>2e-5 or anchor_error>2e-5:raise ValueError('Source Fir mapping/attachment changed')
    hull=np.asarray(component['cutoutHullUvBlender']);lo=hull.min(0);hi=hull.max(0);corners=np.array([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]])
    points=features(corners)@coefficients;length=float(np.linalg.norm((features([tip])@coefficients)[0]-(features([base])@coefficients)[0]))
    if not .21998<=length<=.35002:raise ValueError('Original Fir twig physical length changed')
    return {'positions':points.tolist(),'uvs':corners.tolist(),'faces':[(0,1,2),(0,2,3)],'sourceFitErrorMetres':error,'anchorErrorMetres':anchor_error,'physicalLengthMetres':length}
