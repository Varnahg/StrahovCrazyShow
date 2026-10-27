"""Bounded coverage correction comparison; retains the original .5 evidence."""
import sys,json
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build
import bpy
def main():
 base=build.CACHE;prepared=json.loads((base/'prepared.json').read_text());assert prepared['summary']['parts']==82100
 value=.2 if '--cutoff020'in sys.argv else .35
 bpy.ops.wm.open_mainfile(filepath=str(build.NATIVE));cards=bpy.data.objects['R6 FAR cards'];shader=cards.data.materials[0].node_tree.nodes.get('Principled BSDF');cutoff=shader.inputs['Alpha'].links[0].from_node;assert cutoff.operation=='GREATER_THAN'
 cutoff.inputs[1].default_value=value;build.CACHE=base/('coverage020'if value==.2 else'coverage035');build.CACHE.mkdir(exist_ok=True)
 reference=bpy.data.objects['R6 crown__lod1__foliage'];exact=bpy.data.objects.get('R6 FAR exact fallback');wood=bpy.data.objects['R6 crown__lod2__wood']
 bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=0
 rows=build.compare(bpy.context.scene,reference,cards,exact,wood)
 report=json.loads((base/'native-report.json').read_text());report['renders']=rows;report['atlasAlphaCutoff']=value
 (build.CACHE/'native-report.json').write_text(json.dumps(report,indent=2)+'\n')
 import audit_images
 audit_images.CACHE=build.CACHE
 # The atlas was not regenerated, and bank metadata is a shared read-only input.
 (build.CACHE/'bank-blender.json').write_bytes((base/'bank-blender.json').read_bytes())
 audit_images.main()
if __name__=='__main__':main()
