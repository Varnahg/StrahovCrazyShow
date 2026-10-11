"""Clean individual trees: IPR crowns guide silhouette, no copied source triangles.
Retains three levels in the editable Blender master. Fetch/reference first.
"""
import bpy, math, random, json, hashlib, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/vegetation/realistic';OUT.mkdir(parents=True,exist_ok=True)
SRC=ROOT/'assets/blender/vegetation';SRC.mkdir(parents=True,exist_ok=True)
DOCS=ROOT/'docs/vegetation';DOCS.mkdir(parents=True,exist_ok=True)
reference=json.loads((ROOT/'shared/data/tree-reconstruction.json').read_text(encoding='utf8'))
partial='--landmarks' in sys.argv
selected_trees=[t for t in reference['trees'] if not partial or t['appearance']!='broadleaf']
if partial:
    bpy.ops.wm.open_mainfile(filepath=str(SRC/'strahov-individual-trees.blend'))
    ids={t['id'] for t in selected_trees}
    for obj in list(bpy.data.objects):
        if obj.get('source_tree_id') in ids:bpy.data.objects.remove(obj,do_unlink=True)
    for collection in list(bpy.data.collections):
        if collection.name in ids:bpy.data.collections.remove(collection)
    for mesh in list(bpy.data.meshes):
        if mesh.users==0:bpy.data.meshes.remove(mesh)
else:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name, ident, alpha=False):
    existing=bpy.data.materials.get(name)
    if existing:return existing
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.85
    maps={}
    for channel in ['Color','NormalGL','Roughness']+(['Opacity'] if alpha else []):
        paths=list(OUT.glob(ident+'_*_'+channel+'.*'))
        if not paths:continue
        tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(paths[0]),check_existing=True)
        if channel!='Color':tex.image.colorspace_settings.name='Non-Color'
        maps[channel]=tex
    m.node_tree.links.new(maps['Color'].outputs['Color'],p.inputs['Base Color'])
    m.node_tree.links.new(maps['Roughness'].outputs['Color'],p.inputs['Roughness'])
    normal=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(maps['NormalGL'].outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    if alpha:
        m.node_tree.links.new(maps['Opacity'].outputs['Color'],p.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=False
    return m
bark=material('CC0 photographic bark — ambientCG Bark012','Bark012')
leaves=material('CC0 photographic green leaves — ambientCG LeafSet001','LeafSet001',True)
needles=material('CC0 photographic needle atlas — ambientCG LeafSet019','LeafSet019',True)
class Geometry:
    def __init__(self):self.vertices=[];self.faces=[];self.uvs=[]
    def tube(self, points, radius, end_radius, sides):
        travel=0;previous=None
        for i,point in enumerate(points):
            c=Vector(point);direction=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
            tangent=direction.cross(Vector((0,1,0)))
            if tangent.length<.01:tangent=direction.cross(Vector((1,0,0)))
            tangent.normalize();bitangent=direction.cross(tangent).normalized();r=radius+(end_radius-radius)*i/(len(points)-1)
            if i:travel+=(c-Vector(points[i-1])).length
            start=len(self.vertices)
            for j in range(sides):
                a=j*math.tau/sides;self.vertices.append(tuple(c+r*(tangent*math.cos(a)+bitangent*math.sin(a))));self.uvs.append((j/sides*max(.3,radius*math.tau),travel))
            if previous is not None:
                for j in range(sides):self.faces.append((previous+j,previous+(j+1)%sides,start+(j+1)%sides,start+j))
            previous=start
        self.faces.append(tuple(range(previous,previous+sides)))
    def card(self, center, width, height, rng):
        side=Vector((math.cos(rng.random()*math.tau),math.sin(rng.random()*math.tau),rng.uniform(-.5,.5))).normalized()
        normal=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(-.3,1))).normalized();up=normal.cross(side).normalized();n=len(self.vertices);c=Vector(center)
        for u,v in [(-.5,-.5),(0,-.5),(.5,-.5),(-.5,.5),(0,.5),(.5,.5)]:
            self.vertices.append(tuple(c+side*u*width+up*v*height+normal*(.06*width if u==0 else 0)));self.uvs.append((u+.5,v+.5))
        self.faces.extend([(n,n+1,n+4,n+3),(n+1,n+2,n+5,n+4)])
    def needle(self,c,d,length,width):
        d=Vector(d).normalized();side=d.cross(Vector((0,0,1)))
        if side.length<.01:side=Vector((1,0,0))
        side.normalize();start=len(self.vertices);c=Vector(c)
        self.vertices.extend([tuple(c-side*width/2),tuple(c+side*width/2),tuple(c+d*length)])
        self.uvs.extend([(0,0),(1,0),(.5,1)]);self.faces.append((start,start+1,start+2))
    def object(self,name,mat,collection):
        if not self.faces:return None
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(self.vertices,[],self.faces);mesh.update();mesh.uv_layers.new()
        for loop in mesh.loops:mesh.uv_layers.active.data[loop.index].uv=self.uvs[loop.vertex_index]
        for polygon in mesh.polygons:polygon.use_smooth=True
        obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.data.materials.append(mat);return obj
audit=[a for a in json.loads((OUT/'manifest.json').read_text(encoding='utf8'))['lods'] if a['treeId'] not in {t['id'] for t in selected_trees}] if partial else []
for tree_index,t in enumerate(selected_trees):
    collection=bpy.data.collections.new(t['id']);bpy.context.scene.collection.children.link(collection)
    height=t['height'];radius=t['crownDiameter']/2;appearance=t['appearance'];theta=t['crownAzimuth'];radial=t['radialOutline'];offset=t['crownOffset']
    def envelope(angle,extent=1):
        scale=radial[int(angle/math.tau*16)%16]
        x=math.cos(angle)*radius*scale*extent;z=math.sin(angle)*radius*t['crownMinorRatio']*scale*extent
        return Vector((x*math.cos(theta)-z*math.sin(theta)+offset[0],-(x*math.sin(theta)+z*math.cos(theta)+offset[1]),0))
    for lod in range(3):
        rng=random.Random(t['seed']);wood=Geometry();foliage=Geometry();sides=[12,8,6][lod]
        lean=Vector((rng.uniform(-.22,.22),rng.uniform(-.22,.22),0))*height*.08
        trunk_top=height*(.88 if appearance=='conifer' else .68)
        trunk=[(0,0,-.04),tuple(lean*.25+Vector((0,0,height*.18))),tuple(lean*.6+Vector((0,0,height*.39))),tuple(lean+Vector((0,0,trunk_top)))]
        wood.tube(trunk,t['trunkRadius'],t['trunkRadius']*.18,sides)
        endpoints=[]
        count=26 if appearance=='conifer' else 7 if appearance=='bare' else 19
        for i in range(count):
            angle=(i*2.39996+rng.uniform(-.35,.35))%math.tau
            if appearance=='conifer':
                fraction=i/count;start_z=height*(.18+.72*fraction);extent=(1-fraction)*rng.uniform(.8,1.08);end_z=start_z+height*.02
            else:
                fraction=(i%7)/6;start_z=height*(.29+.33*fraction);extent=rng.uniform(.55,1);end_z=height*(.52+.4*fraction)+rng.uniform(-.03,.03)*height
            start=lean*(start_z/height)+Vector((0,0,start_z));end=envelope(angle,extent)+Vector((0,0,end_z));middle=start.lerp(end,.55)+Vector((0,0,height*.07))
            curve=[start]
            bend=Vector((rng.uniform(-.035,.035)*height,rng.uniform(-.025,.025)*height,height*.055))
            secondary=Vector((rng.uniform(-.012,.012)*height,rng.uniform(-.012,.012)*height,0))
            for k in range(1,6):
                fraction=k/6;point=start.lerp(end,fraction)+bend*math.sin(fraction*math.pi)+secondary*math.sin(fraction*math.tau)
                curve.append(point)
            curve.append(end)
            wood.tube(curve,t['trunkRadius']*(.36 if appearance=='conifer' else .57),.012,[8,6,4][lod]);endpoints.append(end)
            for j in range(5):
                a=(angle+rng.uniform(-.55,.55))%math.tau;twig=end+envelope(a,rng.uniform(.12,.24))+Vector((0,0,height*rng.uniform(.025,.11)))
                twig.z=min(height*.97,twig.z)
                if j<[5,3,1][lod]:wood.tube([middle.lerp(end,.7),end.lerp(twig,.55),twig],.025,.004,[5,4,3][lod])
                endpoints.append(twig)
        if appearance!='bare':
            high_cards=round(min(4800,max(2200,radius*radius*math.pi*32)))
            cards=round(high_cards*[1,.25,.08][lod]) if appearance=='broadleaf' else [1700,650,165][lod]
            leaf_rng=random.Random(t['seed']+121)
            for i in range(cards):
                endpoint=endpoints[leaf_rng.randrange(len(endpoints))];scatter=radius*[.18,.21,.25][lod]
                c=endpoint+Vector((leaf_rng.uniform(-scatter,scatter),leaf_rng.uniform(-scatter,scatter),leaf_rng.uniform(-scatter*.65,scatter*.65)))
                if appearance=='broadleaf' and leaf_rng.random()<.8:
                    angle=leaf_rng.random()*math.tau;reach=math.sqrt(leaf_rng.random())*.95
                    c=envelope(angle,reach)+Vector((0,0,height*(.7+math.sqrt(1-reach*reach)*leaf_rng.uniform(-.28,.28))))
                c.z=min(height,c.z);c.z=max(height*.3,c.z)
                if appearance=='conifer':
                    width=leaf_rng.uniform(.85,1.2)*[1,1.65,3.2][lod]
                    foliage.card(c,width,width*leaf_rng.uniform(.82,1.15),leaf_rng)
                else:
                    width=leaf_rng.uniform(.68,.94)*[1,1.9,3.5][lod]
                    foliage.card(c,width,width*leaf_rng.uniform(.82,1.15),leaf_rng)
        for kind,geo,mat in [('bark',wood,bark),('leaves',foliage,needles if appearance=='conifer' else leaves)]:
            obj=geo.object('tree__'+t['id']+'__lod'+str(lod)+'__'+kind,mat,collection)
            if obj:
                obj.location=(t['x'],-t['z'],0);obj['source_tree_id']=t['id'];obj['detail_level']=lod;obj['appearance']=appearance
        audit.append({'treeId':t['id'],'lod':lod,'vertices':len(wood.vertices)+len(foliage.vertices),'triangles':sum(sum(len(f)-2 for f in geo.faces) for geo in [wood,foliage]),'appearance':appearance})
    if tree_index%15==0:print('Authored tree',tree_index+1,'/',len(reference['trees']),flush=True)
bpy.context.scene['reference_only']='IPR 2023/2024 crowns guide original clean skeletons; no imported mesh geometry.'
bpy.context.scene['tree_count']=len(reference['trees'])
bpy.context.scene.render.engine='BLENDER_EEVEE'
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'strahov-individual-trees.blend'))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(OUT/'strahov-individual-trees.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_image_format='AUTO')
glb=OUT/'strahov-individual-trees.glb';blend=SRC/'strahov-individual-trees.blend'
pack={'schemaVersion':1,'units':'m','license':'Original authored tree geometry; CC0 photographic materials; IPR CC BY reference interpretation.','reference':'shared/data/tree-reconstruction.json','editable':'assets/blender/vegetation/strahov-individual-trees.blend','geometry':'/models/vegetation/realistic/strahov-individual-trees.glb','geometrySha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'editableSha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'trees':len(reference['trees']),'lods':audit,'sourceTrianglesCopied':0,'rootLocalHeight':-.04,'notes':['Separate tapering trunks, limbs and photographic alpha-tested leaf clusters.','Every source ID has separately authored branch topology and all three retained detail levels.','Bare/conifer only where silhouette is separately annotated; no unverified botanical species.']}
(OUT/'manifest.json').write_text(json.dumps(pack,indent=2)+'\n',encoding='utf8')
(DOCS/'realistic-pack-geometry-audit.json').write_text(json.dumps(pack,indent=2)+'\n',encoding='utf8')
print('Exported',len(reference['trees']),'unique trees;',glb.stat().st_size,'bytes',flush=True)
