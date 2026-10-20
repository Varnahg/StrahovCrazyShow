import bpy
import json
import pathlib
import sys

out = pathlib.Path(sys.argv[sys.argv.index('--') + 1])
rna = bpy.ops.export_scene.gltf.get_rna_type()
result = {
    'version': bpy.app.version_string,
    'version_tuple': list(bpy.app.version),
    'build_hash': bpy.app.build_hash.decode(),
    'binary_path': bpy.app.binary_path,
    'background': bpy.app.background,
    'export_properties': {},
    'action_strip_properties': list(bpy.types.ActionKeyframeStrip.bl_rna.properties.keys()),
    'action_channelbag_properties': list(bpy.types.ActionChannelbag.bl_rna.properties.keys()),
}
for prop in rna.properties:
    if prop.identifier in {'rna_type'}:
        continue
    entry = {'type': prop.type, 'description': prop.description}
    if prop.type == 'ENUM':
        entry['enum'] = [{'id': item.identifier, 'label': item.name} for item in prop.enum_items]
    result['export_properties'][prop.identifier] = entry
out.write_text(json.dumps(result, indent=2), encoding='utf-8')
print('RUNTIME_INSPECTION_OK', result['version'], result['build_hash'])
