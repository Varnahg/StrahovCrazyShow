"""Original articulated character surfaces. Blender 5.2; no scanned/copyrighted people.

The browser uses the exported vertex arrays synchronously, so distant hardware
instances and the existing IK rig do not wait for one GLB load per character.
The .blend and GLB are editable source/reference exports of these same surfaces.
"""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets/blender/characters'
OUT = ROOT / 'public/models/characters'
DATA = ROOT / 'client/data'
for path in [SRC, OUT, DATA]: path.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0

def lerp_profile(profile, y):
    for left, right in zip(profile, profile[1:]):
        if left[0] <= y <= right[0]:
            t = (y-left[0])/(right[0]-left[0])
            return tuple(a+(b-a)*t for a,b in zip(left[1:],right[1:]))
    return profile[0][1:] if y < profile[0][0] else profile[-1][1:]

def gaussian(x, y, cx, cy, sx, sy):
    return math.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)

profiles = {
 'torso': [(-.5,.36,.38,0),(-.36,.385,.40,0),(-.16,.41,.425,0),(.08,.475,.47,.012),(.26,.50,.45,.006),(.36,.485,.415,0),(.50,.32,.30,0)],
 'pelvis': [(-.5,.32,.35,0),(-.3,.435,.435,0),(-.1,.49,.48,0),(.22,.5,.49,0),(.50,.42,.42,0)],
 'limb': [(-.5,.30,.33,0),(-.39,.35,.375,0),(-.15,.43,.43,0),(.12,.5,.48,0),(.31,.48,.46,0),(.5,.39,.39,0)],
 'shoe': [(-.5,.41,.44,0),(-.32,.5,.5,0),(-.05,.485,.49,-.015),(.18,.43,.40,-.045),(.50,.32,.25,-.13)],
 'hand': [(-.50,.25,.31,.025),(-.40,.42,.37,.02),(-.06,.49,.41,0),(.18,.45,.40,0),(.50,.29,.36,-.018)],
 'head': [(-.50,.12,.25,.115),(-.43,.26,.32,.075),(-.33,.37,.385,.03),(-.19,.435,.415,.008),(-.04,.49,.45,-.008),(.11,.475,.46,-.018),(.24,.465,.46,-.028),(.36,.405,.415,-.035),(.45,.27,.30,-.035),(.50,.025,.035,-.035)],
}

def face_point(y, angle):
    xr,zr,zo = lerp_profile(profiles['head'], y)
    x = math.sin(angle)*xr; front = max(0, math.cos(angle))
    # Broad frontal planes, temporal hollow, cheeks, orbital hollows and a
    # continuous nasal bridge/tip. These are relief in one watertight surface.
    z = (front**.48 if front>0 else math.cos(angle))*zr+zo
    if front > 0:
        z += (.017*gaussian(x,y,0,.21,.34,.15)
             +.040*(gaussian(x,y,-.285,-.035,.13,.13)+gaussian(x,y,.285,-.035,.13,.13))
             -.035*(gaussian(x,y,-.225,.065,.11,.075)+gaussian(x,y,.225,.065,.11,.075))
             +.047*(gaussian(x,y,-.22,.145,.14,.055)+gaussian(x,y,.22,.145,.14,.055))
             +.105*gaussian(x,y,0,-.005,.075,.18)
             +.17*gaussian(x,y,0,-.14,.09,.065)
             +.044*(gaussian(x,y,-.07,-.16,.035,.04)+gaussian(x,y,.07,-.16,.035,.04))
             +.024*gaussian(x,y,0,-.285,.16,.025)
             +.027*gaussian(x,y,0,-.325,.155,.025)
             -.010*gaussian(x,y,0,-.305,.17,.018)
             +.032*gaussian(x,y,0,-.415,.20,.075))*front**2
    return (x,y,z)

def mesh_data(name, vertices, faces, uvs, colors=None):
    # Store positions in browser coordinates. Blender's scene is Z-up.
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([(x,-z,y) for x,y,z in vertices],[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    for face in mesh.polygons: face.use_smooth=True
    layer=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops: layer.data[loop.index].uv=uvs[loop.vertex_index]
    if colors:
        layer=mesh.color_attributes.new(name='authored subtle skin tint',type='FLOAT_COLOR',domain='POINT')
        for i,c in enumerate(colors):layer.data[i].color=(*c,1)
    # Export averaged vertex normals from exactly the Blender mesh used by GLB.
    normals=[]
    for vertex in mesh.vertices:
        n=vertex.normal; normals.extend((round(n.x,6),round(n.z,6),round(-n.y,6)))
    payload={
      'positions':[round(v,6) for p in vertices for v in p],
      'normals':normals,
      'uvs':[round(v,6) for uv in uvs for v in uv],
      'indices':[i for f in faces for i in f],
    }
    if colors:payload['colors']=[round(v,5) for c in colors for v in (*c,1)]
    return obj,payload

def closed_form(name, segments=12, rings=8):
    if name=='head':segments,rings=40,34
    elif name=='torso':segments,rings=20,12
    elif name in ['pelvis','hand']:segments,rings=16,10
    elif name=='shoe':segments,rings=16,8
    vertices=[];uvs=[];colors=[];faces=[]
    for row in range(rings):
        y=-.5+row/(rings-1)
        for col in range(segments):
            angle=col/segments*math.tau
            if name=='head':point=face_point(y,angle)
            else:
                xr,zr,zo=lerp_profile(profiles[name],y)
                # Millimetre-scale broad folds change the silhouette under
                # light. No independent decorative fold meshes/draw batches.
                fold=0 if name in ['shoe','hand'] else .007*math.sin(y*37+math.sin(angle*3))*math.sin(angle*4+.3)
                point=(math.sin(angle)*(xr+fold),y,math.cos(angle)*(zr+fold)+zo)
            vertices.append(point);uvs.append((col/segments,row/(rings-1)))
            x,yy,z=point
            warmth=(gaussian(x,yy,-.27,-.10,.15,.14)+gaussian(x,yy,.27,-.10,.15,.14))*max(0,math.cos(angle))
            lips=gaussian(x,yy,0,-.30,.16,.035)*max(0,math.cos(angle))
            colors.append((1,1-.035*warmth-.16*lips,1-.045*warmth-.13*lips))
    for row in range(rings-1):
        for col in range(segments):
            a=row*segments+col;b=row*segments+(col+1)%segments;c=a+segments;d=b+segments
            # Browser RH outward winding; Blender conversion preserves handedness.
            faces.extend([(a,b,c),(b,d,c)])
    for row,up in [(0,False),(rings-1,True)]:
        center=len(vertices);y=-.5+row/(rings-1)
        vertices.append((0,y,profiles[name][row and -1 or 0][3]));uvs.append((.5,.5));colors.append((1,1,1))
        for col in range(segments):
            a=row*segments+col;b=row*segments+(col+1)%segments
            faces.append((center,a,b) if up else (center,b,a))
    return mesh_data(name,vertices,faces,uvs,colors if name in ['head','hand'] else None)

def hair(name):
    style=name.removeprefix('hair-');segments=36;rings=16
    vertices=[];faces=[];uvs=[]
    for row in range(rings):
        t=row/(rings-1)
        for col in range(segments):
            angle=col/segments*math.tau;front=max(0,math.cos(angle));side=abs(math.sin(angle))
            boundary=.16*front-.13*(1-front)
            if style in ['crop','wave']:
                boundary=(.22+.10*side+.025*math.sin(angle*2+1))*front**2-.13*(1-front**2)
            if style in ['long','bob']:
                opening=max(0,min(1,(front-.66)/.20));opening=opening*opening*(3-2*opening)
                boundary=(-1.12 if style=='long' else -.59)*(1-opening)+(.22 if style=='long' else .17)*opening
            if style=='close':boundary=.20*front-.06*(1-front)
            y=boundary+(.51-boundary)*math.sin(t*math.pi/2)
            xr,zr,zo=lerp_profile(profiles['head'],min(.499,y))
            volume={'close':.013,'crop':.035,'wave':.055,'long':.042,'bob':.055,'curls':.075}[style]
            if style=='curls':volume+=.030*math.sin(angle*11+t*32)*math.sin(angle*7-t*23)
            elif style=='wave':volume+=.025*math.sin(angle*3+t*8)
            else:volume+=.004*math.sin(angle*18+t*4)
            if style in ['long','bob'] and y<.1:
                xr=max(xr,.475);zr=max(zr,.46)
            # The cap follows the same flattened forehead as the face; using
            # an unrelated ellipsoid would leave bald strips at the temples.
            x,_,z=face_point(min(.499,y),angle)
            if style in ['long','bob'] and y<.1:
                x=math.sin(angle)*xr
                z=(front**.48 if front>0 else math.cos(angle))*zr+zo
            x+=math.sin(angle)*volume
            z+=math.cos(angle)*volume
            y+=volume*.8+(.012*math.cos(angle-1.0) if style in ['crop','wave'] else 0)
            vertices.append((x,y,z));uvs.append((col/segments,t))
    for row in range(rings-1):
        for col in range(segments):
            a=row*segments+col;b=row*segments+(col+1)%segments;c=a+segments;d=b+segments
            faces.extend([(a,b,c),(b,d,c)])
    # Closed scalp cap: underside is inside the head, not an alpha hair card.
    center=len(vertices);vertices.append((0,.02,-.04));uvs.append((.5,0))
    for col in range(segments):faces.append((center,(col+1)%segments,col))
    center=len(vertices);vertices.append((0,max(p[1] for p in vertices),-.03));uvs.append((.5,1))
    for col in range(segments):
        a=(rings-1)*segments+col;b=(rings-1)*segments+(col+1)%segments
        faces.append((center,a,b))
    return mesh_data(name,vertices,faces,uvs)

def beard():
    vertices=[];faces=[];uvs=[];rows=10;cols=25
    for depth in [0,.014]:
        for row in range(rows):
            for col in range(cols):
                angle=-1.40+col/(cols-1)*2.8
                top=-.37+.26*abs(math.sin(angle))**1.4
                y=-.49+row/(rows-1)*(top+.49)
                x,yy,z=face_point(y,angle)
                vertices.append((x*(1+depth),yy,z+depth));uvs.append((col/(cols-1),row/(rows-1)))
    layer=rows*cols
    for row in range(rows-1):
        for col in range(cols-1):
            a=row*cols+col;b=a+1;c=a+cols;d=c+1
            faces.extend([(a,c,b),(b,c,d),(a+layer,b+layer,c+layer),(b+layer,d+layer,c+layer)])
    boundary=list(range(cols))+[r*cols+cols-1 for r in range(1,rows)]+list(range(layer-2,layer-cols-1,-1))+[r*cols for r in range(rows-2,0,-1)]
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):faces.extend([(a,b,a+layer),(b,b+layer,a+layer)])
    return mesh_data('beard',vertices,faces,uvs)

geometry={};objects={}
for name in profiles:
    objects[name],geometry[name]=closed_form(name)
for style in ['close','crop','wave','long','bob','curls']:
    name='hair-'+style;objects[name],geometry[name]=hair(name)
objects['beard'],geometry['beard']=beard()

# Keep the source organized as a surface library, plus an assembled neutral study.
for index,(name,obj) in enumerate(objects.items()):
    obj.location=(index%4*1.5,index//4*1.5,1)
    material=bpy.data.materials.new(name+' source');material.diffuse_color=(.46,.31,.22,1) if name in ['head','hand'] else (.055,.04,.03,1) if name.startswith('hair') or name=='beard' else (.17,.24,.19,1)
    material.use_nodes=True;p=material.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=material.diffuse_color;p.inputs['Roughness'].default_value=.58
    if name in ['head','hand']:
        attribute=material.node_tree.nodes.new('ShaderNodeVertexColor');attribute.layer_name='authored subtle skin tint'
        multiply=material.node_tree.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[1].default_value=material.diffuse_color
        material.node_tree.links.new(attribute.outputs['Color'],multiply.inputs[2]);material.node_tree.links.new(multiply.outputs[0],p.inputs['Base Color'])
    obj.data.materials.append(material)
    obj['purpose']='Original fictional character form, shared by hardware instances in browser'

payload={'schema':1,'authoredAt':'2026-10-10','coordinateSystem':'+Y up, +Z face, metres after rig scaling','forms':geometry}
text=json.dumps(payload,separators=(',',':'))
(DATA/'character-geometry.json').write_text(text,encoding='utf-8')
(OUT/'geometry-manifest.json').write_text(json.dumps({'license':'CC0-1.0 original authored geometry; no source photographs','script':'scripts/create-avatar-reality.py','runtime':'client/data/character-geometry.json','sha256':hashlib.sha256(text.encode()).hexdigest(),'triangles':{name:len(g['indices'])//3 for name,g in geometry.items()}},indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'avatar-reality.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'avatar-surface-library.glb'),export_format='GLB',export_yup=True,export_apply=True,export_vertex_color='ACTIVE')
print('AVATAR_REALITY', {name:len(g['indices'])//3 for name,g in geometry.items()})
