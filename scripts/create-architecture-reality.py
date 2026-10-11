"""Original Strahov facade modules and seamless textures, Blender 5.2.
Run: blender --background --python scripts/create-architecture-reality.py
No downloaded imagery is embedded. Dimensions are photo-proportion interpretations.
Runtime Babylon batches the same numeric window specification from facade-reality.json.
"""
import bpy, math, json, random, os
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/models/architecture'
BLEND = ROOT / 'assets/blender/architecture'
TEXTURE = OUT / 'textures'
for p in [OUT, BLEND, TEXTURE]: p.mkdir(parents=True, exist_ok=True)
data = json.loads((ROOT / 'shared/data/facade-reality.json').read_text(encoding='utf8'))
size = 256

def image(name, pixels, color_space='sRGB'):
    im = bpy.data.images.new(name, width=size, height=size, alpha=False)
    im.colorspace_settings.name = color_space
    im.pixels.foreach_set(pixels)
    im.filepath_raw = str(TEXTURE / (name + '.png')); im.file_format = 'PNG'; im.save()
    return im

def tex(kind, rgb):
    rng = random.Random(519 + len(kind))
    heights=[]; colors=[]
    for y in range(size):
        for x in range(size):
            # Periodic octaves keep all texture borders seamless.
            noise = sum(math.sin(2*math.pi*(x*f/size)+math.cos(2*math.pi*y*f/size))*a for f,a in [(1,.65),(4,.2),(16,.07)])
            fine = rng.random()-.5
            board = (x % 64 < 1 or y % 128 < 1) if kind=='concrete' else False
            tile = (x % 64 < 2 or y % 64 < 2) if kind=='tile' else False
            wood = math.sin(x*.55+math.sin(y*.025)*1.2)*.08 if kind=='wood' else 0
            h = .5 + fine*.06 + noise*.028 + wood - (0.12 if board or tile else 0)
            heights.append(h)
            grain = fine*.022 + noise*.025 + wood*.13 - (.055 if board else .08 if tile else 0)
            colors.extend([max(0,min(1,c+grain)) for c in rgb]+[1])
    normal=[]
    for y in range(size):
        for x in range(size):
            dx=(heights[y*size+(x-1)%size]-heights[y*size+(x+1)%size])*.9
            dy=(heights[((y-1)%size)*size+x]-heights[((y+1)%size)*size+x])*.9
            v=Vector((dx,dy,1)).normalized()
            normal.extend([v.x*.5+.5,v.y*.5+.5,v.z*.5+.5,1])
    image(kind+'-color',colors); image(kind+'-normal',normal,'Non-Color')

for kind,rgb in [('plaster',(.73,.72,.66)),('concrete',(.43,.45,.41)),('roof',(.27,.31,.29)),('wood',(.19,.115,.067)),('tile',(.62,.54,.32))]: tex(kind,rgb)

def material(name,color,roughness=.7,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=roughness;p.inputs['Metallic'].default_value=metal
    return m

def box(name,location,dimensions,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location);o=bpy.context.object;o.name=name;o.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    if bevel:
        modifier=o.modifiers.new('Small real edge bevel','BEVEL');modifier.width=bevel;modifier.segments=1
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=modifier.name)
    return o

manifest=[]
def module(name,width,height,panes,depth,concrete=False):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    plaster=material('Gray concrete' if concrete else 'Pale mineral plaster',(.43,.45,.41) if concrete else (.73,.72,.66))
    timber=material('Dark brown frame',(.13,.075,.04),.44)
    glass=material('Opaque reflective demo glass',(.17,.27,.30),.16,.24)
    aluminum=material('Pale aluminum sill',(.5,.53,.5),.4,.3)
    border=.13; frame=.045
    # Blender +Y back, -Y exterior; export Y-up gives runtime +Z exterior.
    for x in [-width/2-border/2,width/2+border/2]: box('Side reveal',(x,depth/2,height/2),(border,depth,height+.26),plaster,.005)
    for z in [-border/2,height+border/2]: box('Head and base reveal',(0,depth/2,z),(width,depth,border),plaster,.005)
    for x in [-width/2+frame/2,width/2-frame/2]:box('Frame vertical',(x,depth-.015,height/2),(frame,.055,height),timber,.005)
    for z in [frame/2,height-frame/2]:box('Frame horizontal',(0,depth-.015,z),(width,.055,frame),timber,.005)
    for i in range(1,panes):box('Mullion',(-width/2+width*i/panes,depth-.025,height/2),(.036,.065,height-.06),timber,.004)
    box('Glass',(0,depth+.008,height/2),(width-.065,.012,height-.065),glass)
    box('Projecting aluminum sill',(0,depth/2-.045,-.025),(width+.1,depth+.15,.035),aluminum,.005)
    triangles=sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons)
    blend=BLEND/(name+'.blend');glb=OUT/(name+'.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend));bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',export_yup=True,export_apply=True)
    manifest.append({'id':name,'url':'/models/architecture/'+name+'.glb','blend':'assets/blender/architecture/'+name+'.blend','width':width,'height':height,'revealDepth':depth,'panes':panes,'triangleCount':triangles,'byteLength':glb.stat().st_size,'usage':'Editable source module; optimized game geometry generated from the same specification','dimensionProvenance':'photo-proportion-interpretation-not-measured','sourceIds':['ctu-exterior','b6-pano']})

s=data['dimensions']['standard'];p=data['dimensions']['endPair']
module('strahov-four-pane-window',s['windowWidth'],s['windowHeight'],4,s['revealDepth'])
module('strahov-small-concrete-window',p['windowWidth'],p['windowHeight'],1,p['revealDepth'],True)
(OUT/'manifest.json').write_text(json.dumps({'schemaVersion':1,'generatedBy':'scripts/create-architecture-reality.py','textures':'Original periodic procedural diffuse/normal maps, not photographic scans','source':'shared/data/facade-reality.json','assets':manifest},indent=2),encoding='utf8')
print('ARCHITECTURE_REALITY_OK',json.dumps(manifest))
