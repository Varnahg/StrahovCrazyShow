"""Blender CPU ray projection into a separate packed CAD candidate, never a scan overlay.

Run only in the coordinator's heavy-validation reservation. Uses explicit exterior
patches from photo-alignment.json, original hash-verified I3S triangles/UV/JPEG,
and no Cycles/GPU bake. Unknown/occluded texels retain the original solid colour.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from photo_projection import (admissible_photo_hit, blend_photo_with_fallback, confidence_edge_weights,
                              eligible_face, interpolate_uv, load_i3s, local_to_world, patch_basis,
                              patch_coordinates, png_rgb_bytes, rasterize_patch_triangles,
                              rotation_y, sample_jpeg_rgb, triangle_normals, verified_source_path)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def normalize_cli_paths(args):
    """Freeze command-line paths against process cwd before Blender opens a file."""
    for name in ('alignment', 'source_root', 'model', 'output', 'report'):
        setattr(args, name, getattr(args, name).expanduser().resolve())
    return args


def game_point(point):
    return (point.x, point.z, -point.y)


def geometry_digest(objects):
    """Topology, transforms, corner normals and identity; excludes permitted UV/material edits."""
    rows = []
    for obj in sorted(objects, key=lambda o: o.name):
        mesh = obj.data
        mesh.calc_loop_triangles()
        rows.append({'id': obj.name, 'matrix': [list(row) for row in obj.matrix_world],
                     'vertices': [list(v.co) for v in mesh.vertices],
                     'faces': [list(p.vertices) for p in mesh.polygons],
                     'cornerNormals': [list(n.vector) for n in mesh.corner_normals],
                     'metadata': {key: obj.get(key) for key in ('buildingId', 'floorId', 'role', 'collision')}})
    return hashlib.sha256(json.dumps(rows, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def load_source(manifest, node_ids, source_root):
    import bpy
    from mathutils.bvhtree import BVHTree
    triangles, uvs, owners, sources, images = [], [], [], [], {}
    nodes = {str(n['id']): n for n in manifest['nodes']}
    for identifier in node_ids:
        node = nodes[str(identifier)]
        positions, uv = load_i3s(node, manifest, source_root)
        path, _ = verified_source_path(source_root, node['texture'], node['textureSha256'])
        image = bpy.data.images.load(str(path.resolve()), check_existing=False)
        try:
            # Treat decoder output as sRGB-encoded data. Output PNG tags sRGB once.
            image.colorspace_settings.name = 'Non-Color'
            width, height = image.size
            values = np.empty(width*height*4, dtype=np.float32)
            image.pixels.foreach_get(values)
            images[str(identifier)] = np.clip(np.rint(values.reshape(height, width, 4)[::-1, :, :3]*255), 0, 255).astype(np.uint8)
        finally:
            bpy.data.images.remove(image)
        triangles.append(positions)
        uvs.append(uv)
        owners.extend((str(identifier), index) for index in range(len(positions)))
        sources.append({key: node[key] for key in ('id', 'geometrySha256', 'textureSha256')})
    triangles, uvs = np.concatenate(triangles), np.concatenate(uvs)
    normals, _ = triangle_normals(triangles)
    tree = BVHTree.FromPolygons(triangles.reshape(-1, 3).tolist(),
                               np.arange(len(triangles)*3).reshape(-1, 3).tolist(), all_triangles=True)
    return tree, triangles, uvs, normals, owners, images, sources


def select_faces(objects, patch, already_selected):
    selected, target_triangles = [], []
    for obj in objects:
        if obj.name not in patch['partIds']:
            continue
        if obj.modifiers:
            raise ValueError('Apply modifiers before photo transfer: ' + obj.name)
        mesh = obj.data
        points = np.array([game_point(obj.matrix_world@v.co) for v in mesh.vertices])
        normal_matrix = obj.matrix_world.inverted().transposed().to_3x3()
        indices = []
        for polygon in mesh.polygons:
            normal = game_point((normal_matrix@polygon.normal).normalized())
            if not eligible_face(points[list(polygon.vertices)], normal, obj.get('role'), obj.name, patch):
                continue
            key = (obj.name, polygon.index)
            if key in already_selected:
                raise ValueError('Overlapping target photo patches: ' + str(key))
            already_selected.add(key)
            indices.append(polygon.index)
        if indices:
            mesh.calc_loop_triangles()
            included = set(indices)
            target_triangles.extend(patch_coordinates(points[list(triangle.vertices)], patch)[:, :2]
                                    for triangle in mesh.loop_triangles if triangle.polygon_index in included)
            selected.append((obj, indices, points))
    return selected, np.array(target_triangles)


def project_patch(patch, placement, target_triangles, source, pixels_per_metre, max_dimension, feather_metres):
    from mathutils import Vector
    tree, triangles, uvs, normals, owners, images, _ = source
    origin, u, v, normal, bounds = patch_basis(patch)
    extent = bounds[2:]-bounds[:2]
    resolution = np.maximum(1, np.ceil(extent*pixels_per_metre).astype(int))
    resolution = np.maximum(1, np.ceil(resolution*min(1, max_dimension/max(resolution))).astype(int))
    width, height = map(int, resolution)
    target_mask = rasterize_patch_triangles(target_triangles, bounds, width, height)
    photo = np.zeros((height, width, 3), dtype=np.uint8)
    accepted = np.zeros((height, width), dtype=bool)
    used_tiles = set()
    rejected = {'noHit': 0, 'distanceNormalOrMask': 0, 'uv': 0}
    outward = rotation_y(placement['yaw'])@normal
    direction = Vector(-outward)
    reach = patch.get('maxDistanceMetres', .45)
    projection_patch = dict(patch)
    if patch.get('sourceTriangleIds') is not None:
        projection_patch['sourceTriangleIds'] = frozenset(patch['sourceTriangleIds'])
    if not 0 < reach <= 1:
        raise ValueError('Projection reach must be in (0,1] metres; larger mismatches need registration work')
    for row, column in zip(*np.where(target_mask)):
        a = bounds[0]+(column+.5)*extent[0]/width
        b = bounds[3]-(row+.5)*extent[1]/height
        point = local_to_world(origin+u*a+v*b, placement)
        hit, _, index, _ = tree.ray_cast(Vector(point+outward*reach), direction, 2*reach)
        if index is None:
            rejected['noHit'] += 1
            continue
        tile, triangle_id = owners[index]
        if not admissible_photo_hit(point, outward, hit, normals[index], f'{tile}:{triangle_id}', projection_patch):
            rejected['distanceNormalOrMask'] += 1
            continue
        # Blender BVH returns float32 coordinates, while I3S transform is float64.
        uv = interpolate_uv(hit, triangles[index], uvs[index], tolerance=2e-4)
        if uv is None:
            rejected['uv'] += 1
            continue
        photo[row, column] = np.clip(np.rint(sample_jpeg_rgb(images[tile], uv)), 0, 255).astype(np.uint8)
        accepted[row, column] = True
        used_tiles.add(tile)
    target_count = int(target_mask.sum())
    weights = confidence_edge_weights(target_mask, accepted, extent/np.array([width, height]), feather_metres)
    return photo, accepted, weights, {'resolution': [width, height], 'targetTexels': target_count,
                             'acceptedTexels': int(accepted.sum()),
                             'coverage': float(accepted.sum()/target_count) if target_count else 0,
                             'featherMetres': feather_metres,
                             'featheredTexels': int(np.count_nonzero((weights > 0) & (weights < 1))),
                             'sourceTileIds': sorted(used_tiles),
                             'rejected': rejected}


def apply_patch_images(selected, patch, photo, accepted, weights, output_dir, textures, source_provenance):
    import bpy
    _, _, _, _, bounds = patch_basis(patch)
    for obj, polygon_ids, points in selected:
        mesh = obj.data
        layer = mesh.uv_layers.get('UVMap')
        if layer is None or mesh.uv_layers[0] != layer:
            raise ValueError('Target UVMap must exist as first UV set for TEXCOORD_0')
        mesh.uv_layers.active = layer
        layer.active_render = True
        groups = {}
        for index in polygon_ids:
            groups.setdefault(mesh.polygons[index].material_index, []).append(index)
        for material_index, ids in groups.items():
            original = mesh.materials[material_index]
            shader = original.node_tree.nodes.get('Principled BSDF') if original.use_nodes else None
            if shader is None or shader.inputs['Base Color'].is_linked or shader.inputs['Alpha'].is_linked:
                raise ValueError('Unsupported pre-textured target material: ' + original.name)
            if shader.inputs['Alpha'].default_value < .999:
                raise ValueError('Transparent target material must remain untouched: ' + original.name)
            pixels = blend_photo_with_fallback(photo, accepted, weights, list(shader.inputs['Base Color'].default_value)[:3])
            name = f'{obj.name}-{patch["id"]}-{material_index}'.replace(':', '_')
            png = png_rgb_bytes(pixels)
            path = output_dir/(name+'.png')
            path.write_bytes(png)
            image = bpy.data.images.load(str(path.resolve()), check_existing=False)
            image.name = name
            image.colorspace_settings.name = 'sRGB'
            image.pack()
            image.filepath = ''
            image['derivedPhotogrammetry'] = True
            packed_sha = hashlib.sha256(bytes(image.packed_file.data)).hexdigest()
            if packed_sha != hashlib.sha256(png).hexdigest():
                raise ValueError('Packed PNG bytes differ from the derived atlas')
            image['imageSha256'] = packed_sha
            image['attribution'] = 'datový podklad © IPR Praha'
            for key, value in source_provenance.items():
                image[key] = value
            material = original.copy()
            material.name = original.name+' / IPR / '+patch['id']
            nodes, links = material.node_tree.nodes, material.node_tree.links
            new_shader = nodes.get('Principled BSDF')
            uv_node = nodes.new('ShaderNodeUVMap')
            uv_node.uv_map = 'UVMap'
            texture = nodes.new('ShaderNodeTexImage')
            texture.image = image
            texture.extension = 'EXTEND'
            texture.interpolation = 'Linear'
            links.new(uv_node.outputs['UV'], texture.inputs['Vector'])
            links.new(texture.outputs['Color'], new_shader.inputs['Base Color'])
            new_shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
            material['photogrammetryPatch'] = patch['id']
            for key, value in source_provenance.items():
                material[key] = value
            mesh.materials.append(material)
            assigned = len(mesh.materials)-1
            for index in ids:
                polygon = mesh.polygons[index]
                polygon.material_index = assigned
                for loop_index in polygon.loop_indices:
                    point = points[mesh.loops[loop_index].vertex_index]
                    uv = (patch_coordinates(point, patch)[:2]-bounds[:2])/(bounds[2:]-bounds[:2])
                    layer.data[loop_index].uv = uv
            textures.append({'image': image.name, 'sha256': image['imageSha256'], 'width': image.size[0],
                             'height': image.size[1], 'partId': obj.name, 'patch': patch['id'],
                             'faces': len(ids), 'packed': bool(image.packed_file), 'material': material.name})


def main():
    import bpy
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--alignment', required=True, type=Path)
    parser.add_argument('--building', choices=('b01', 'b06'), required=True)
    parser.add_argument('--source-root', required=True, type=Path)
    parser.add_argument('--model', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--pixels-per-metre', type=float, default=16)
    parser.add_argument('--max-dimension', type=int, default=2048)
    parser.add_argument('--feather-metres', type=float, default=0,
                        help='Optional confidence edge inside accepted target texels only, maximum0.15m; default0 preserves baseline')
    args = normalize_cli_paths(parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []))
    if args.model.resolve() == args.output.resolve() or args.output.exists():
        raise ValueError('Use a new candidate output; never replace the input/master')
    if not 0 < args.pixels_per_metre <= 64 or not 1 <= args.max_dimension <= 4096:
        raise ValueError('Invalid atlas resolution')
    if not math.isfinite(args.feather_metres) or not 0 <= args.feather_metres <= .15:
        raise ValueError('Feather must stay in [0,0.15] metres')
    config = json.loads(args.alignment.read_text(encoding='utf-8'))
    building = config['buildings'][args.building]
    patches = building['patches']
    if not patches:
        raise ValueError('No identified exterior patches for this building')
    if len({patch['id'] for patch in patches}) != len(patches):
        raise ValueError('Duplicate patch ID')
    manifest_path = args.source_root/config['source']['manifestPath']
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if digest(manifest_path) != config['source']['manifestSha256']:
        raise ValueError('Source manifest changed')
    model_sha = digest(args.model)
    expected_sha = building.get('sourceBlendSha256')
    if expected_sha and model_sha != expected_sha:
        raise ValueError('Target model differs from patch calibration source')
    bpy.ops.wm.open_mainfile(filepath=str(args.model.resolve()))
    objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if not objects or any(obj.get('buildingId') != args.building for obj in objects):
        raise ValueError('Foreign/non-CAD mesh in target model')
    if any(material.get('provenance') == 'IPR2023-derived' for obj in objects for material in obj.data.materials):
        raise ValueError('Use an unbaked master or explicitly revise its photo materials')
    before = geometry_digest(objects)
    source = load_source(manifest, building['sourceTileIds'], args.source_root)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output_dir = args.report.parent/(args.building+'-derived-textures')
    output_dir.mkdir(exist_ok=False)
    report = {'schemaVersion': 1, 'buildingId': args.building, 'sourceBlendSha256': model_sha,
              'alignmentSha256': digest(args.alignment), 'sourceManifestSha256': digest(manifest_path),
              'source': config['source'], 'placement': building['placement'], 'registration': building['registration'],
              'status': 'candidate; requires native UV/image audit and visual comparison before publication',
              'transferOptions': {'pixelsPerMetre': args.pixels_per_metre, 'maxDimension': args.max_dimension,
                                  'featherMetres': args.feather_metres,
                                  'featherDomain': 'accepted target texels only; metric geodesic distance to rejected target texels; no crossing holes',
                                  'blendSpace': 'linear light; valid core and invalid fallback bytes preserved'},
              'patches': [], 'textures': [], 'sources': source[-1], 'geometryBeforeSha256': before,
              'method': 'first-hit normal/distance gated CPU texture projection, original CAD geometry only',
              'lighting': 'captured summer-2023 illumination remains in BaseColor; no invented albedo or normal/detail displacement'}
    selected_keys = set()
    for patch in patches:
        selected, triangles = select_faces(objects, patch, selected_keys)
        if not selected:
            report['patches'].append({'id': patch['id'], 'status': 'no matching target faces'})
            continue
        photo, accepted, weights, metrics = project_patch(patch, building['placement'], triangles, source,
                                                          args.pixels_per_metre, args.max_dimension, args.feather_metres)
        record = {'id': patch['id'], **metrics, 'targetFaces': sum(len(row[1]) for row in selected)}
        if metrics['coverage'] < patch.get('minimumCoverage', .5):
            record['status'] = 'coverage rejected; original material retained'
        else:
            used_sources = [row for row in source[-1] if str(row['id']) in metrics['sourceTileIds']]
            provenance = {'provenance': 'IPR2023-derived', 'photoPatchId': patch['id'],
                          'sourceManifestSha256': report['sourceManifestSha256'],
                          'sourceIds': json.dumps(metrics['sourceTileIds']),
                          'sourceHashes': json.dumps(used_sources, sort_keys=True),
                          'sourceCapture': manifest['capture'], 'featherMetres': args.feather_metres}
            apply_patch_images(selected, patch, photo, accepted, weights, output_dir, report['textures'], provenance)
            record['status'] = 'candidate applied; unmatched texels retain original colour'
        report['patches'].append(record)
        print(json.dumps(record), flush=True)
    after = geometry_digest(objects)
    if before != after:
        raise ValueError('Photo transfer changed CAD topology, transforms, normals or identity')
    report['geometryAfterSha256'] = after
    if not report['textures']:
        report['status'] = 'no textures met acceptance; candidate not saved'
    else:
        roots = {obj.parent for obj in objects}
        if len(roots) != 1 or None in roots:
            raise ValueError('Missing common building root')
        root = next(iter(roots))
        root['photogrammetryProvenance'] = json.dumps({k: report[k] for k in ('source', 'sourceBlendSha256', 'alignmentSha256', 'sources', 'placement', 'registration', 'textures', 'method', 'lighting', 'transferOptions')}, ensure_ascii=False)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True)
        report['candidateBlendSha256'] = digest(args.output)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'report': str(args.report), 'textures': len(report['textures']), 'geometryUnchanged': before == after}), flush=True)


if __name__ == '__main__':
    main()
