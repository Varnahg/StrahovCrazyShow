"""Projection-bounded wood LOD, preserving all retained parent junctions.

Reference distances match the closest legacy quality transitions (22/75 m).
This is a geometric error budget, not a claim about measured game performance.
"""
import math
import numpy as np
from skeleton import sample

PROFILE=[{'distance':2.,'diameterPixels':0.,'deviationPixels':.35,'maxSides':24},
         {'distance':22.,'diameterPixels':.5,'deviationPixels':.45,'maxSides':12},
         {'distance':75.,'diameterPixels':.65,'deviationPixels':.5,'maxSides':10}]
FOCAL=720/(2*math.tan(.85/2))

def wood_lod(branches,lod):
    profile=PROFILE[lod];epsilon=profile['deviationPixels']*profile['distance']/FOCAL
    lookup={b['id']:b for b in branches};kept=set()
    for b in branches:
        if 2*max(b['radii'])*FOCAL/profile['distance']>=profile['diameterPixels']:kept.add(b['id'])
    # Preserve the extreme silhouette paths even when their final twig is thin.
    for axis in range(3):
        for reverse in [False,True]:
            items=[(p[axis],branch['id'])for branch in branches for p in branch['points']]
            kept.add((max(items)if reverse else min(items))[1])
    for ident in list(kept):
        parent=lookup[ident].get('parent')
        while parent is not None:
            kept.add(parent);parent=lookup[parent].get('parent')
    critical={ident:{0.,1.}for ident in kept}
    for b in branches:
        if b['id']in kept and b.get('parent')in kept:critical[b['parent']].add(float(b['attachmentT']))
    result=[];max_error=0
    for b in branches:
        if b['id']not in kept:continue
        ts=sorted(set(i/(len(b['points'])-1)for i in range(len(b['points'])))|critical[b['id']])
        pr=[sample(b,t)for t in ts];points=np.array([x[0]for x in pr]);radii=np.array([x[2]for x in pr])
        required=sorted(i for i,t in enumerate(ts)if t in critical[b['id']]);selected=set(required)
        def simplify(a,c):
            nonlocal max_error
            if c-a<2:return
            line=points[c]-points[a];den=float(line@line)
            worst=0;chosen=None
            for i in range(a+1,c):
                u=max(0,min(1,float((points[i]-points[a])@line)/den))if den else 0
                error=float(np.linalg.norm(points[i]-points[a]-u*line))+abs(float(radii[i]-(radii[a]*(1-u)+radii[c]*u)))
                if error>worst:worst=error;chosen=i
            if worst>epsilon:
                selected.add(chosen);simplify(a,chosen);simplify(chosen,c)
            else:max_error=max(max_error,worst)
        for a,c in zip(required,required[1:]):simplify(a,c)
        indices=sorted(selected);radius=max(b['radii']);angle=math.acos(max(-1,min(1,1-epsilon/max(radius,1e-9))))
        sides=max(3,min(profile['maxSides'],math.ceil(math.pi/max(angle,1e-3))))
        result.append({**b,'points':points[indices].tolist(),'radii':radii[indices].tolist(),'sides':sides})
    return result,{'referenceDistance':profile['distance'],'verticalFov':.85,'viewportHeight':720,'minimumDiameterPixels':profile['diameterPixels'],
      'curveDeviationBudgetMetres':epsilon,'maxAcceptedCurveErrorMetres':max_error,'sourceBranches':len(branches),'retainedBranches':len(result),'junctionsPreserved':True}
