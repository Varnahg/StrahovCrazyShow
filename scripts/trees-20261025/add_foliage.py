"""Attach immutable photographic components, export rank-audited pilot GLBs."""
import bpy,sys,json,math,random,struct,hashlib,time
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import build_pilot as pilot
from skeleton import sample,unit
ROOT=pilot.ROOT;CACHE=pilot.CACHE;INPUT=pilot.INPUT;MODELS=pilot.MODELS;MASTER=pilot.MASTER

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def glb_audit(path):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);binary=raw[28+n:]
    def accessor(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];kind={5126:'f4',5125:'u4',5123:'u2'}[a['componentType']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.frombuffer(binary,dtype='<'+kind,count=a['count']*size,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,size)
    rows=[]
    for node in j['nodes']:
        if 'mesh'not in node:continue
        role=node.get('extras',{}).get('role');mesh=j['meshes'][node['mesh']]
        for p in mesh['primitives']:
            pos=accessor(p['attributes']['POSITION']);indices=accessor(p['indices']).reshape(-1,3)
            row={'name':node['name'],'role':role,'vertices':len(pos),'triangles':len(indices),'bounds':[pos.min(0).tolist(),pos.max(0).tolist()]}
            assert np.isfinite(pos).all() and not j.get('images'), 'geometry-only export required'
            if role=='foliage':
                a=j['accessors'][p['attributes']['COLOR_0']];assert a['componentType']==5123 and a.get('normalized') and a['type']=='VEC4'
                colors=accessor(p['attributes']['COLOR_0']);assert (colors[:,:3]==65535).all()
                ranks=colors[:,3];tr=ranks[indices];assert (tr[:,0]==tr[:,1]).all()and(tr[:,0]==tr[:,2]).all(),'component spans ranks'
                assert ranks.min()>0 and ranks.max()<65535
                assert (np.diff(tr[:,0].astype(np.int64))>=0).all(),'indices must already be sorted by whole-component rank'
                unique,counts=np.unique(tr[:,0],return_counts=True);row['components']=[{'rank':int(r),'indexCount':int(c)*3}for r,c in zip(unique,counts)]
                row['componentCount']=len(unique);row['rankAccessor']=p['attributes']['COLOR_0']
            rows.append(row)
    return {'file':path.name,'sha256':sha(path),'bytes':path.stat().st_size,'meshes':rows,'embeddedImageCount':len(j.get('images',[]))}

def attach(info):
    key=info['id'];kind=info['kind'];axes=info['axes'];rng=random.Random(62831)
    atlas=next(a for a in json.loads((INPUT/'shared/data/tree-leaf-components.json').read_text())['atlases']if a['id']==('LeafSet024' if kind=='broadleaf'else'fir_tree_01'))
    parts=atlas['parts'];components={c['id']:c for c in atlas['components']}
    wood=bpy.data.objects[key+'__lod0__wood'];bvh=BVHTree.FromObject(wood,bpy.context.evaluated_depsgraph_get())
    leaves=[];rejected=0;max_distance=0.
    for branch in axes:
        if info['generator']=='own':
            if branch['depth']<(3 if kind=='broadleaf'else 2):continue
        elif branch['depth']<2 or max(branch['radii'])>.045:continue
        length=sum(np.linalg.norm(np.array(a)-np.array(b))for a,b in zip(branch['points'],branch['points'][1:]))
        count=max(3,min(22,int(length/(.028 if kind=='broadleaf'else .10))))
        group_index=0;group_count=0;group_lo=None;group_hi=None
        for i in range(count):
            t=.22+.76*(i+.35)/count;anchor,tangent,radius=sample(branch,t)
            nearest=bvh.find_nearest(Vector(anchor));distance=float(nearest[3])if nearest[0]is not None else math.inf
            if distance>max(.008,radius+.005):rejected+=1;continue
            max_distance=max(max_distance,distance)
            if kind=='broadleaf':
                next_lo=anchor if group_lo is None else np.minimum(group_lo,anchor)
                next_hi=anchor if group_hi is None else np.maximum(group_hi,anchor)
                if group_count==6 or np.linalg.norm(next_hi-next_lo)>.39:
                    group_index+=1;group_count=0;next_lo=anchor;next_hi=anchor
                group_lo=next_lo.copy();group_hi=next_hi.copy();group_count+=1
            part=parts[len(leaves)%len(parts)];component=components[part['componentId']]
            u0=np.array(part['attachmentUvBlender']);tip=np.array(part['axisTipUvBlender']);axis2=unit(np.r_[tip-u0,0])[:2];side2=np.array([axis2[1],-axis2[0]])
            scale=.4 if kind=='broadleaf'else rng.uniform(.22,.35)/float(np.linalg.norm(tip-u0))
            angle=i*2.399963+rng.random()*.4
            basis=unit(np.cross(tangent,[0,0,1])if abs(tangent[2])<.9 else np.cross(tangent,[0,1,0]));basis2=np.cross(tangent,basis)
            radial=basis*math.cos(angle)+basis2*math.sin(angle)
            axis3=unit(tangent*.45+radial*.75+np.array([0,0,.12 if kind=='broadleaf'else-.12]))
            side3=unit(np.cross(axis3,[0,0,1])if abs(axis3[2])<.9 else np.cross(axis3,[0,1,0]));normal3=np.cross(side3,axis3)
            roll=rng.uniform(-.7,.7);side3=side3*math.cos(roll)+normal3*math.sin(roll);normal3=np.cross(side3,axis3)
            hull=np.array(component['cutoutHullUvBlender']);middle=hull.mean(0)
            if kind=='broadleaf':
                # Two curved quad strips retain the photographed leaf's exact
                # UV extent and scale. Original alpha cuts its silhouette.
                lo=hull.min(0);hi=hull.max(0)
                uv=np.array([[x,y]for y in [lo[1],(lo[1]+hi[1])/2,hi[1]]for x in [lo[0],hi[0]]])
                local_faces=[(0,1,3),(0,3,2),(2,3,5),(2,5,4)]
            else:
                uv=np.vstack([middle,hull]);local_faces=[(0,1+j,1+(j+1)%len(hull))for j in range(len(hull))]
            positions=[]
            physical_length=float(np.linalg.norm(tip-u0))*scale
            for point in uv:
                delta=(point-u0)*scale;x=float(delta@side2);y=float(delta@axis2)
                bend=.015*physical_length*math.sin(math.pi*max(0,min(1,y/physical_length)))
                positions.append((anchor+side3*x+axis3*y+normal3*bend).tolist())
            lower_uv=None;lower_positions=None
            if kind=='broadleaf':
                lo=hull.min(0);hi=hull.max(0)
                lower_uv=np.array([[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]])
                lower_positions=[]
                for point in lower_uv:
                    delta=(point-u0)*scale;lower_positions.append((anchor+side3*float(delta@side2)+axis3*float(delta@axis2)).tolist())
            leaves.append({'anchor':anchor.tolist(),'branchId':branch['id'],'branchT':t,'partId':part['id'],'positions':positions,'uv':uv.tolist(),'faces':local_faces,
              'groupKey':(branch['id'],group_index if kind=='broadleaf'else i),
              'lowerPositions':lower_positions,'lowerUv':lower_uv.tolist()if lower_uv is not None else None,'attachmentDistance':distance,'supportRadius':radius,'lengthMetres':physical_length})
    candidate_count=len(leaves)
    groups=sorted({leaf['groupKey']for leaf in leaves})
    assert 0<len(groups)<=65534,'split small shoots into a second mesh rather than truncate canopy density'
    permutation=[1+round(i*65533/max(1,len(groups)-1))for i in range(len(groups))];rng.shuffle(permutation)
    group_ranks=dict(zip(groups,permutation))
    for leaf in leaves:leaf['rank']=group_ranks[leaf['groupKey']]
    group_anchors={}
    for leaf in leaves:group_anchors.setdefault(leaf['groupKey'],[]).append(leaf['anchor'])
    group_span=max(float(np.linalg.norm(np.ptp(np.asarray(points),axis=0)))for points in group_anchors.values())
    leaves.sort(key=lambda x:x['rank'])
    # Retain extremal components in lower LODs without moving/enlarging anything.
    centres=np.array([l['anchor']for l in leaves]);extreme_indices=set(int(np.argmin(centres[:,i]))for i in range(3))|set(int(np.argmax(centres[:,i]))for i in range(3))
    extreme_groups={leaves[i]['groupKey']for i in extreme_indices}
    lods=[]
    for lod,stride in enumerate([1,2,5]):
        vs=[];fs=[];uv=[];ranks=[];included=[]
        for i,leaf in enumerate(leaves):
            # Independent stable selection, not an active-season rank cutoff.
            group=leaf['groupKey']
            if group not in extreme_groups and (group[0]*2654435761+group[1]*2246822519)%stride:continue
            simple=lod>0 and leaf['lowerPositions']is not None
            points=leaf['lowerPositions']if simple else leaf['positions'];coords=leaf['lowerUv']if simple else leaf['uv']
            n=len(vs);vs.extend(points);uv.extend(coords);ranks.extend([leaf['rank']]*len(points));included.append(leaf['rank'])
            if simple:fs.extend([(n,n+1,n+2),(n,n+2,n+3)])
            else:fs.extend(tuple(n+j for j in face)for face in leaf['faces'])
        o=pilot.objmesh(key+f'__lod{lod}__foliage',vs,fs,uv,'foliage',kind,lod,ranks)
        unique=sorted(set(included))
        o['archetypeId']=key;o['sourceTreeId']=info['sourceTreeId'];o['componentCount']=len(unique);o['photographicPartCount']=len(included);o.hide_render=lod!=0
        lods.append({'lod':lod,'components':len(unique),'photographicParts':len(included),'triangles':len(fs),'ranks':unique,
          'retainedAtFractions':{str(f):sum(r<=math.floor(f*65535)for r in unique)for f in [.25,.5,.75]},
          'retainedPartsAtFractions':{str(f):sum(r<=math.floor(f*65535)for r in included)for f in [.25,.5,.75]},
          'outline':('source-hull bounding rectangle'if lod>0 else 'two curved source-bbox quad strips')if kind=='broadleaf'else 'source conservative 12-vertex hull'})
    return {'allComponentCount':len(groups),'photographicPartCount':len(leaves),'anatomicalCandidateCount':candidate_count,
      'rankGrouping':'at most 6 adjacent leaves on a small shoot; one photographed twig per conifer group','maximumPartsPerGroup':6 if kind=='broadleaf'else 1,
      'maximumGroupAnchorSpanMetres':group_span,
      'anchorSource':'actual branch axis; photographic base pixel at attachment; no volume scatter',
      'maxAnchorToWoodDistanceMetres':max_distance,'rejectedNonAttachedCandidates':rejected,'componentLengthRange':[min(x['lengthMetres']for x in leaves),max(x['lengthMetres']for x in leaves)],
      'physicalScaleBasis':'LeafSet024 40cm full atlas calibration'if kind=='broadleaf'else'authored .22-.35m twig length; provider scale unavailable',
      'componentMetadata':[{'rank':l['rank'],'branchId':l['branchId'],'branchT':l['branchT'],'anchor':l['anchor'],'partId':l['partId'],
        'attachmentDistance':l['attachmentDistance'],'supportRadius':l['supportRadius']}for l in leaves],'lods':lods}

def main():
    reuse_renders='--reuse-identical-renders'in sys.argv
    previous={p.name:sha(p)for p in MODELS.glob('*.glb')}if reuse_renders else {}
    bpy.ops.wm.open_mainfile(filepath=str(CACHE/'bare-pilots.blend'))
    pilot.setup_materials()
    report=json.loads((CACHE/'skeleton-report.json').read_text())
    for info in report['variants']:
        full=json.loads((CACHE/(info['id']+'-axes.json')).read_text());info['foliage']=attach(full)
        bpy.ops.object.select_all(action='DESELECT')
        for o in bpy.context.scene.objects:
            if o.get('archetypeId')==info['id']:
                o.location=(0,0,0);o.select_set(True);bpy.context.view_layer.objects.active=o
        path=MODELS/(info['id']+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
          export_extras=True,export_materials='NONE',export_vertex_color='ACTIVE',export_all_vertex_colors=True)
        info['export']=glb_audit(path)
        if reuse_renders:assert previous.get(path.name)==info['export']['sha256'],'reuse requires byte-identical geometry, UVs, ranks and extras'
    report['rankContract']={'semantic':'COLOR_0.a','componentType':5123,'normalized':True,'rgb':[1,1,1],'runtimeHasVertexAlpha':False,
      'materialAlpha':1,'selection':'index prefix sorted by full-range small-shoot group rank; no mixed-rank triangles','sameRankAcrossLods':True}
    report['inputs']=json.loads((INPUT/'manifest.json').read_text())
    report['generatorSha256']={p.name:sha(p)for p in Path(__file__).parent.glob('*.py')}
    report['mtreeDependency']={'version':'5.6.0','artifactSha256':'2de83eeeaafccf1818e665a61c1975bdc9e16a59cc1f78b0bfdb94c8b0241103','coreLicense':'MIT','addonLicense':'GPL-3.0-or-later; not registered or distributed'}
    report['renderParameters']={'engine':'Cycles CPU','threads':2,'samples':12,'summerLeafAmount':1,'bareLeafAmount':0,
      'springRenderProduced':False,'studioComparison':'own left, MTree right; fixed orthographic camera; not in-game performance'}
    if reuse_renders:report['renderParameters']['reuseBasis']='all four source GLBs byte-identical to last completed renders'
    text=bpy.data.texts.new('pilot-provenance.json');text.write(json.dumps({k:v for k,v in report.items()if k!='variants'},indent=2))
    for image in bpy.data.images:
        if image.source=='FILE' and image.size[0]>0:image.pack()
    # Editable master contains separated variants. Export above was root-local;
    # these studio offsets are deliberately not part of runtime placement.
    for o in bpy.context.scene.objects:
        if o.get('role')in ['wood','foliage']:
            o.hide_set(o['lod']!=0)
            o.location.x={'own-broadleaf':-22,'mtree-broadleaf':0,'own-conifer':16,'mtree-conifer':25}[o['archetypeId']]
    master=MASTER/'tree-pilots.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(master),compress=True)
    report['nativeMaster']={'file':str(master.relative_to(ROOT)).replace('\\','/'),'bytes':master.stat().st_size,'sha256':sha(master)}
    (MODELS/'pilot-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    if not reuse_renders:
        for kind in ['broadleaf','conifer']:pilot.render(kind,False)
        for kind in ['broadleaf','conifer']:pilot.render(kind,True,lod=2,suffix='bare-lod2')
    print('FOLIAGE_EXPORT_COMPLETE',flush=True)

if __name__=='__main__':main()
