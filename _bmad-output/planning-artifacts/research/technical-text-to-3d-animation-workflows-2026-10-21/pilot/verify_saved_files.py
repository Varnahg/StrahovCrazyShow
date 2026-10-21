"""Read the saved files again; verify native editability and unchanged mesh streams."""
import bpy
import hashlib
import json
import pathlib
import struct
import sys

out = pathlib.Path(sys.argv[sys.argv.index('--') + 1]).resolve()


def actions():
    result = {}
    for action in bpy.data.actions:
        curves = [[fc.data_path, fc.array_index,
                   [[float(k.co.x), float(k.co.y), k.interpolation] for k in fc.keyframe_points]]
                  for layer in action.layers for strip in layer.strips
                  for bag in strip.channelbags for fc in bag.fcurves]
        result[action.name] = hashlib.sha256(json.dumps(curves, sort_keys=True).encode()).hexdigest()
    return result


def mesh_streams():
    result = {}
    for obj in bpy.data.collections['Star_Lantern_Asset'].objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        data = bytearray()
        for vertex in mesh.vertices:
            data.extend(struct.pack('<3f', *vertex.co))
        for polygon in mesh.polygons:
            data.extend(struct.pack('<III?', polygon.loop_start, polygon.loop_total,
                                    polygon.material_index, polygon.use_smooth))
        for loop in mesh.loops:
            data.extend(struct.pack('<I', loop.vertex_index))
        for layer in mesh.uv_layers:
            data.extend(layer.name.encode() + b'\0')
            for uv in layer.data:
                data.extend(struct.pack('<2f', *uv.uv))
        data.extend(json.dumps([m.name for m in mesh.materials]).encode())
        result[obj.name] = hashlib.sha256(data).hexdigest()
    return result


results = {}
for label, filename in [('source', 'star-lantern-source.blend'), ('revised', 'star-lantern-revised.blend')]:
    bpy.ops.wm.open_mainfile(filepath=str(out / filename), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    results[label] = {
        'actions': actions(), 'mesh_stream_sha256': mesh_streams(),
        'render_engine': scene.render.engine, 'cycles_device': scene.cycles.device,
        'threads_mode': scene.render.threads_mode, 'threads': scene.render.threads,
        'resolution': [scene.render.resolution_x, scene.render.resolution_y],
        'samples': scene.cycles.samples,
        'panel_names': sorted(o.name for o in bpy.data.collections['Star_Lantern_Asset'].objects
                              if o.name.startswith('Panel_') and o.name.count('_') == 1),
    }
checks = {
    'all_59_mesh_streams_unchanged': results['source']['mesh_stream_sha256'] == results['revised']['mesh_stream_sha256'],
    'all_7_original_actions_preserved': all(results['revised']['actions'].get(name) == value
                                          for name, value in results['source']['actions'].items()),
    'revision_extra_action_exists': len(results['revised']['actions']) == len(results['source']['actions']) + 1,
    'cpu_render_saved': all(r['render_engine'] == 'CYCLES' and r['cycles_device'] == 'CPU'
                            and r['threads_mode'] == 'FIXED' and r['threads'] == 4 for r in results.values()),
    'six_separate_panels': len(results['source']['panel_names']) == 6,
}
receipt = {'status': 'passed' if all(checks.values()) else 'failed', 'checks': checks, 'files': results,
           'mesh_stream_scope': 'little-endian vertex positions, polygon spans/material/smooth flags, loop indices, UV coordinates/layer names, material slot names'}
(out / 'saved-files-verification.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
if not all(checks.values()):
    raise AssertionError(checks)
print('SAVED_FILES_VERIFIED', json.dumps(checks))
