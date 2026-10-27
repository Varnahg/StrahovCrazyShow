"""CPU-only native pilot. Run skeleton first, inspect, then --foliage.

Blender Z-up masters; exported glTF Y-up metres. Four isolated variants retain
source identities but are not connected to the legacy runtime catalogue.
"""
import os,sys,json,math,random,hashlib,struct,time
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2'
import bpy,numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(Path(__file__).parent))
from skeleton import own_skeleton,sample,unit,skeleton_audit
from mtree_adapter import build as mtree_build
from lod_geometry import wood_lod
CACHE=ROOT/'.cache/trees-pilot-20261025';INPUT=CACHE/'inputs';MODELS=ROOT/'public/models/vegetation/seasonal';MASTER=ROOT/'assets/blender/vegetation/seasonal'
for p in [CACHE/'renders',MODELS,MASTER]:p.mkdir(parents=True,exist_ok=True)
reference=json.loads((INPUT/'shared/data/tree-reconstruction.json').read_text())
targets={k:next(t for t in reference['trees']if t['id']==ident)for k,ident in [('broadleaf','ipr-crown-014'),('conifer','ipr-b6-north-conifer')]}
correction=json.loads((INPUT/'shared/data/cad-buildings/b06-tree-placement.json').read_text())
materials={};report={'schemaVersion':1,'coordinateSpace':'local Blender XYZ metres, Z up; glTF Y up','heightBasis':'source catalogue estimates, generic anatomy authored for realism, botanicalSpecies unknown','variants':[]}

def mat(name,channels):
    if name in bpy.data.materials:return bpy.data.materials[name]
    m=bpy.data.materials.new(name);m.use_nodes=True;bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.8
    for semantic,path in channels.items():
        image=bpy.data.images.load(str(path),check_existing=True)
        if semantic!='color':image.colorspace_settings.name='Non-Color'
        node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
        if semantic=='normalGL':
            normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45
            m.node_tree.links.new(node.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
        else:m.node_tree.links.new(node.outputs['Color'],bsdf.inputs[{'color':'Base Color','roughness':'Roughness','opacity':'Alpha'}[semantic]])
    m.surface_render_method='DITHERED';m.use_backface_culling=False;return m

def setup_materials():
    old=json.loads((INPUT/'public/models/vegetation/realistic/texture-manifest.json').read_text());bark=next(a for a in old['assets']if a['id']=='Bark012')
    materials['wood']=mat('source Bark012', {k:INPUT/('public'+bark['channels'][v]['url'])for k,v in [('color','color'),('normalGL','normalgl'),('roughness','roughness')]})
    for a in json.loads((INPUT/'shared/data/assets/tree-materials-manifest.json').read_text())['assets']:
        kind='broadleaf' if a['id']=='LeafSet024' else 'conifer'
        materials[kind]=mat('source '+a['id'],{k:INPUT/v['runtimePath']for k,v in a['maps'].items()})

def objmesh(name,vertices,faces,uvs,role,kind,lod,rank=None,loop_uvs=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='sourceUV')
    for loop in mesh.loops:uv.data[loop.index].uv=loop_uvs[loop.index] if loop_uvs is not None else uvs[loop.vertex_index]
    if rank is not None:
        c=mesh.color_attributes.new(name='seasonDropRank',type='FLOAT_COLOR',domain='POINT')
        for row,r in zip(c.data,rank):row.color=(1,1,1,r/65535)
        mesh.color_attributes.active_color=c;mesh.color_attributes.render_color_index=0
    # Leaves remain disconnected components. Smooth their own shallow bend,
    # never average against a whole crown or duplicate every fan triangle.
    for p in mesh.polygons:p.use_smooth=True
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(materials['wood' if role=='wood' else kind])
    obj['role']=role;obj['materialKey']='Bark012' if role=='wood' else ('LeafSet024' if kind=='broadleaf' else 'fir_tree_01')
    obj['lod']=lod;obj['botanicalSpecies']='unknown';obj['rankEncoding']='COLOR_0.a normalized uint16; disable vertex alpha' if role=='foliage' else ''
    return obj

def tube_geometry(branches,lod):
    branches,audit=wood_lod(branches,lod)
    vs=[];fs=[];uv=[];loop_uv=[]
    for b in branches:
        points=np.array(b['points']);rr=b['radii']
        # The LOD resolver has retained junction knots and bounded curve error.
        keep=list(range(len(points)))
        sides=b['sides'];base=len(vs);travel=0;prior_travel=0
        for n,i in enumerate(keep):
            d=unit(points[min(i+1,len(points)-1)]-points[max(0,i-1)]);side=unit(np.cross(d,[0,1,0]) if abs(d[1])<.95 else np.cross(d,[1,0,0]));up=np.cross(d,side)
            if n:travel+=float(np.linalg.norm(points[i]-points[keep[n-1]]))
            for j in range(sides):
                a=j*math.tau/sides;vs.append((points[i]+rr[i]*(side*math.cos(a)+up*math.sin(a))).tolist());uv.append((j/sides*2*math.pi*rr[0],travel))
                if n:
                    fs.append((base+(n-1)*sides+j,base+(n-1)*sides+(j+1)%sides,base+n*sides+(j+1)%sides,base+n*sides+j))
                    circumference=2*math.pi*rr[0];u=j/sides*circumference;u2=(j+1)/sides*circumference
                    loop_uv.extend([(u,prior_travel),(u2,prior_travel),(u2,travel),(u,travel)])
            prior_travel=travel
        cap0=tuple(base+j for j in reversed(range(sides)));cap1=tuple(base+(len(keep)-1)*sides+j for j in range(sides))
        fs.extend([cap0,cap1]);loop_uv.extend([uv[i]for i in cap0]);loop_uv.extend([uv[i]for i in cap1])
    return vs,fs,uv,loop_uv,audit

def fit_skeleton(sk,t):
    bs=sk['branches'];p=np.array([p for b in bs for p in b['points']]);scaleXY=(t['crownDiameter']-.25)/max(np.ptp(p[:,0]),np.ptp(p[:,1]));scaleZ=(t['height']-.15)/p[:,2].max();rscale=t['trunkRadius']/bs[0]['radii'][0]
    for b in bs:b['points']=(np.array(b['points'])*[scaleXY,scaleXY,scaleZ]).tolist();b['radii']=[r*rscale for r in b['radii']]
    return sk

def mtree_axes(data,target):
    p=data['positions'];a=data['attributes'];groups={}
    for i,(stem,radius)in enumerate(zip(a['stem_id'],a['radius'])):groups.setdefault((int(stem),round(float(radius),7)),[]).append(i)
    centres={key:p[indices].mean(0)for key,indices in groups.items()}
    sxy=(target['crownDiameter']-.25)/max(np.ptp(p[:,0]),np.ptp(p[:,1]));sz=(target['height']-.15)/p[:,2].max()
    # One affine transform preserves the native manifold. Do not move each
    # radius-group centre independently: equal-radius branch junctions can
    # otherwise tear into artificial spikes. Trunk radius is calibrated below.
    fitted=p*[sxy,sxy,sz];stems={}
    for key,indices in groups.items():
        c=centres[key];nc=c*[sxy,sxy,sz]
        stems.setdefault(key[0],[]).append((float(key[1]*max(sxy,sz)),nc))
    axes=[]
    for stem,rows in stems.items():
        rows.sort(key=lambda x:-x[0]);depth=int(round(float(a['hierarchy_depth'][np.where(a['stem_id']==stem)[0][0]])))
        if len(rows)<2:continue
        axes.append({'id':stem,'parent':None,'depth':depth,'points':[x[1].tolist()for x in rows],'radii':[x[0]for x in rows]})
    return fitted,axes

def build_skeletons():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);setup_materials()
    for kind,t in targets.items():
        for generator in ['own','mtree']:
            key=generator+'-'+kind;axes=[];objects=[]
            if generator=='own':
                sk=fit_skeleton(own_skeleton(kind),t);anatomy=skeleton_audit(sk);axes=sk['branches']
                anatomy['lods']=[]
                for lod in range(3):
                    g=tube_geometry(axes,lod);objects.append(objmesh(key+f'__lod{lod}__wood',*g[:3],'wood',kind,lod,loop_uvs=g[3]));anatomy['lods'].append(g[4])
            else:
                source_radius=t['trunkRadius'];calibration=[]
                for iteration in range(8):
                    raw=mtree_build(kind,CACHE/'deps/mtree-core',source_radius)
                    sx=(t['crownDiameter']-.25)/max(np.ptp(raw['positions'][:,0]),np.ptp(raw['positions'][:,1]))
                    actual=source_radius*sx;calibration.append({'iteration':iteration,'sourceRadius':float(source_radius),'fittedRootRadius':float(actual)})
                    if abs(actual-t['trunkRadius'])<.0001:break
                    source_radius=float(source_radius*t['trunkRadius']/actual)
                assert abs(actual-t['trunkRadius'])<.001,calibration
                p,axes=mtree_axes(raw,t)
                # Native joined wood remains intact in all comparator LODs;
                # report this cost rather than silently severing fine branches.
                for lod in range(3):
                    objects.append(objmesh(key+f'__lod{lod}__wood',p.tolist(),raw['faces'].tolist(),None,'wood',kind,lod,
                      loop_uvs=raw['uv'][raw['uvLoops'].reshape(-1)].tolist()))
                anatomy={'nativeStemAxes':len(axes),'rootCalibration':calibration,'fit':'single affine transform; native joints preserved','source':'MTree 5.6.0 ManifoldMesher radius/stem attributes; no global addon','woodLodPolicy':'retained native manifold wood; foliage LOD reduces separately'}
            for o in objects:o['archetypeId']=key;o['sourceTreeId']=t['id'];o.hide_render=o['lod']!=0
            origin=correction['position'] if kind=='conifer' else {'x':t['x'],'z':t['z']}
            info={'id':key,'kind':kind,'generator':generator,'sourceTreeId':t['id'],'sourceRootXZ':[origin['x'],origin['z']],
              'nominalHeight':t['height'],'nominalCrownDiameter':t['crownDiameter'],'trunkRadius':t['trunkRadius'],'sourcePositionUncertaintyMetres':2 if kind=='conifer' else 2.5,'anatomy':anatomy,'axes':axes}
            (CACHE/(key+'-axes.json')).write_text(json.dumps(info));report['variants'].append({k:v for k,v in info.items()if k!='axes'})
    bpy.ops.wm.save_as_mainfile(filepath=str(CACHE/'bare-pilots.blend'),compress=True)
    (CACHE/'skeleton-report.json').write_text(json.dumps(report,indent=2)+'\n')

def render(kind,bare,lod=0,suffix=None):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.cycles.max_bounces=4;scene.cycles.transparent_max_bounces=16
    for o in scene.objects:
        if o.get('role')in ['wood','foliage']:
            o.hide_render=not(kind in o.name and o['lod']==lod and(not bare or o['role']=='wood'))
            o.location.x=(-1 if o.name.startswith('own')else 1)*(10 if kind=='broadleaf' else 4.5)
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.82,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for name,location,power,size in [('key',(-10,-10,20),2200,10),('fill',(10,5,16),1300,8)]:
        o=scene.objects.get(name)
        if not o:
            light=bpy.data.lights.new(name,'AREA');o=bpy.data.objects.new(name,light);scene.collection.objects.link(o)
        o.location=location;o.rotation_euler=(Vector((0,0,6))-o.location).to_track_quat('-Z','Y').to_euler();o.data.energy=power;o.data.shape='DISK';o.data.size=size
    camera=scene.objects.get('pilot-camera')
    if not camera:
        camera=bpy.data.objects.new('pilot-camera',bpy.data.cameras.new('pilot-camera'));scene.collection.objects.link(camera)
    camera.location=(0,-46,9);camera.rotation_euler=(Vector((0,0,6.4))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=39 if kind=='broadleaf'else 18
    scene.camera=camera;scene.render.resolution_x=1800 if kind=='broadleaf'else 1100;scene.render.resolution_y=820;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.render.filepath=str(CACHE/'renders'/f'{kind}-{suffix or ("bare" if bare else "summer")}.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    build_skeletons()
    for kind in targets:render(kind,True)
    print('SKELETON_STAGE_COMPLETE',flush=True)
