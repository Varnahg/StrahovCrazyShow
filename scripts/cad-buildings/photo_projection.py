"""Conservative, CPU-only IPR image projection primitives; no Blender/CAD imports.

All geometric arrays use game XYZ metres (+Y up). I3S UVs address the original
JPEG from its top left; Blender UV conversion is (u, 1-v), exactly once.
"""
import hashlib
import heapq
import math
from pathlib import Path
import struct
import zlib

import numpy as np


def checked_array(value, shape_end, name):
    result = np.asarray(value, dtype=np.float64)
    if result.ndim < len(shape_end) or result.shape[-len(shape_end):] != shape_end or not np.isfinite(result).all():
        raise ValueError('Invalid ' + name)
    return result


def rotation_y(yaw):
    if not math.isfinite(yaw):
        raise ValueError('Invalid yaw')
    c, s = math.cos(yaw), math.sin(yaw)
    return np.array(((c, 0, s), (0, 1, 0), (-s, 0, c)), dtype=float)


def placement_arrays(placement):
    translation = placement['translation']
    return rotation_y(placement['yaw']), checked_array([translation[k] for k in ('x', 'y', 'z')], (3,), 'translation')


def local_to_world(points, placement):
    rotation, translation = placement_arrays(placement)
    return checked_array(points, (3,), 'points') @ rotation.T + translation


def world_to_local(points, placement):
    rotation, translation = placement_arrays(placement)
    return (checked_array(points, (3,), 'points') - translation) @ rotation


def verified_source_path(source_root, relative, digest):
    root = Path(source_root).resolve()
    path = (root/'public'/relative.lstrip('/')).resolve()
    if not path.is_relative_to(root/'public'):
        raise ValueError('Source path escapes public directory')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Source SHA-256 mismatch: ' + str(path))
    return path, data


def load_i3s(node, manifest, source_root):
    """Read original L16 triangles/UVs, preserving identity and vertical scale."""
    if node['level'] != manifest['highestDetailLevel'] or node.get('children'):
        raise ValueError('Only original highest-detail leaf tiles are allowed')
    _, data = verified_source_path(source_root, node['geometry'], node['geometrySha256'])
    if len(data) < 8:
        raise ValueError('Truncated I3S header')
    count, features = struct.unpack_from('<II', data)
    if count != node['vertices'] or count % 3 or len(data) != 8 + count*20 + features*16:
        raise ValueError('Unsupported I3S layout')
    p = np.frombuffer(data, dtype='<f4', count=count*3, offset=8).reshape(-1, 3).astype(float)
    uv = np.frombuffer(data, dtype='<f4', count=count*2, offset=8+count*12).reshape(-1, 3, 2).astype(float)
    if not np.isfinite(p).all() or not np.isfinite(uv).all() or (uv < 0).any() or (uv > 1).any():
        raise ValueError('Invalid I3S coordinates/UV')
    factor = manifest['metresPerMercatorUnit']
    local_factor = manifest.get('localPositionScale', factor)
    if not math.isfinite(factor) or factor <= 0 or not math.isfinite(local_factor) or local_factor <= 0:
        raise ValueError('Invalid Mercator scale')
    c, origin = node['center'], manifest['mercatorOrigin']
    xyz = np.column_stack(((c[0]-origin['x'])*factor + p[:, 0]*local_factor,
                           c[2]-manifest['worldHeightReference'] + p[:, 2],
                           -(c[1]-origin['y'])*factor - p[:, 1]*local_factor))
    return xyz.reshape(-1, 3, 3), uv


def triangle_normals(triangles):
    triangles = checked_array(triangles, (3, 3), 'triangles')
    cross = np.cross(triangles[..., 1, :]-triangles[..., 0, :], triangles[..., 2, :]-triangles[..., 0, :])
    lengths = np.linalg.norm(cross, axis=-1)
    if (lengths <= 1e-12).any():
        raise ValueError('Degenerate source triangle')
    return cross/lengths[..., None], lengths/2


def barycentric(point, triangle, tolerance=1e-7):
    p = checked_array(point, (3,), 'point')
    triangle = checked_array(triangle, (3, 3), 'triangle')
    a, b, c = triangle
    u, v, q = b-a, c-a, p-a
    uu, uv, vv = np.dot(u, u), np.dot(u, v), np.dot(v, v)
    denominator = uu*vv - uv*uv
    if denominator <= 1e-20:
        return None
    beta = (np.dot(q, u)*vv - np.dot(q, v)*uv)/denominator
    gamma = (np.dot(q, v)*uu - np.dot(q, u)*uv)/denominator
    weights = np.array((1-beta-gamma, beta, gamma))
    normal = np.cross(u, v)
    if np.min(weights) < -tolerance or abs(np.dot(q, normal)) > tolerance*np.linalg.norm(normal):
        return None
    return weights


def interpolate_uv(point, triangle, uv, tolerance=1e-7):
    weights = barycentric(point, triangle, tolerance)
    if weights is None:
        return None
    value = weights @ checked_array(uv, (3, 2), 'triangle UV')
    if (value < -1e-7).any() or (value > 1+1e-7).any():
        return None
    return np.clip(value, 0, 1)


def sample_jpeg_rgb(pixels, uv):
    """Bilinear sampling of ungraded sRGB bytes, v=0 at the JPEG top edge."""
    pixels = np.asarray(pixels)
    if pixels.ndim != 3 or pixels.shape[2] < 3 or min(pixels.shape[:2]) < 1:
        raise ValueError('Invalid image dimensions')
    uv = checked_array(uv, (2,), 'UV')
    if uv.ndim != 1 or (uv < 0).any() or (uv > 1).any():
        raise ValueError('UV outside original atlas')
    x, y = uv*np.array((pixels.shape[1]-1, pixels.shape[0]-1))
    x0, y0 = int(math.floor(x)), int(math.floor(y))
    x1, y1 = min(x0+1, pixels.shape[1]-1), min(y0+1, pixels.shape[0]-1)
    dx, dy = x-x0, y-y0
    return ((1-dy)*((1-dx)*pixels[y0, x0, :3]+dx*pixels[y0, x1, :3]) +
            dy*((1-dx)*pixels[y1, x0, :3]+dx*pixels[y1, x1, :3]))


def fit_rigid_y(local, world, weights=None):
    """Weighted point correspondences, no scale/reflection; evidence must be supplied."""
    local, world = checked_array(local, (3,), 'local controls'), checked_array(world, (3,), 'world controls')
    if local.ndim != 2 or local.shape != world.shape or len(local) < 3:
        raise ValueError('At least three paired controls are required')
    weights = np.ones(len(local)) if weights is None else np.asarray(weights, dtype=float)
    if weights.shape != (len(local),) or not np.isfinite(weights).all() or (weights <= 0).any():
        raise ValueError('Invalid control weights')
    weights = weights/weights.sum()
    a, b = np.average(local, axis=0, weights=weights), np.average(world, axis=0, weights=weights)
    x, y = local-a, world-b
    if np.linalg.matrix_rank(x[:, [0, 2]]) < 2:
        raise ValueError('Horizontal controls must not be collinear')
    angle = math.atan2(np.sum(weights*(x[:, 2]*y[:, 0]-x[:, 0]*y[:, 2])),
                       np.sum(weights*(x[:, 0]*y[:, 0]+x[:, 2]*y[:, 2])))
    translation = b-rotation_y(angle)@a
    placement = {'yaw': angle, 'translation': dict(zip(('x', 'y', 'z'), translation.tolist()))}
    residuals = np.linalg.norm(local_to_world(local, placement)-world, axis=1)
    return {'placement': placement, 'scale': 1, 'rmsMetres': float(np.sqrt(np.dot(weights, residuals**2))),
            'maxResidualMetres': float(residuals.max()), 'residualsMetres': residuals.tolist()}


def fit_plane_registration(local, source_points, source_normals, initial, weights=None, huber=.2, iterations=25):
    """Robust 4-DOF fit to explicitly associated photo planes, never automatic ICP.

    Caller identifies corresponding source facade/roof patches. Full-rank planes
    in all directions are mandatory; one roof cannot claim a horizontal fit.
    """
    local = checked_array(local, (3,), 'local controls')
    points, normals = checked_array(source_points, (3,), 'source points'), checked_array(source_normals, (3,), 'source normals')
    if local.ndim != 2 or local.shape != points.shape or local.shape != normals.shape or len(local) < 4:
        raise ValueError('At least four paired plane controls are required')
    lengths = np.linalg.norm(normals, axis=1)
    if (lengths < 1e-9).any() or huber <= 0:
        raise ValueError('Invalid plane controls')
    normals = normals/lengths[:, None]
    weights = np.ones(len(local)) if weights is None else np.asarray(weights, dtype=float)
    if weights.shape != (len(local),) or not np.isfinite(weights).all() or (weights <= 0).any():
        raise ValueError('Invalid plane weights')
    _, translation = placement_arrays(initial)
    angle = initial['yaw']
    for _ in range(iterations):
        c, s = math.cos(angle), math.sin(angle)
        rotation = rotation_y(angle)
        delta_yaw = np.column_stack((-s*local[:, 0]+c*local[:, 2], np.zeros(len(local)),
                                     -c*local[:, 0]-s*local[:, 2]))
        residuals = np.sum(normals*(local@rotation.T+translation-points), axis=1)
        jacobian = np.column_stack((np.sum(normals*delta_yaw, axis=1), normals))
        robust = weights*np.minimum(1, huber/np.maximum(np.abs(residuals), 1e-12))
        weighted = jacobian*np.sqrt(robust[:, None])
        if np.linalg.matrix_rank(weighted) < 4:
            raise ValueError('Plane fit is underconstrained')
        update = np.linalg.lstsq(weighted, -residuals*np.sqrt(robust), rcond=None)[0]
        if abs(update[0]) > .25 or np.linalg.norm(update[1:]) > 5:
            raise ValueError('Fit step exceeds the local registration search')
        angle += update[0]
        translation += update[1:]
        if np.linalg.norm(update) < 1e-8:
            break
    placement = {'yaw': angle, 'translation': dict(zip(('x', 'y', 'z'), translation.tolist()))}
    residuals = np.sum(normals*(local_to_world(local, placement)-points), axis=1)
    return {'placement': placement, 'scale': 1, 'planeRmsMetres': float(np.sqrt(np.average(residuals**2, weights=weights))),
            'planeMedianAbsoluteMetres': float(np.median(np.abs(residuals))), 'planeResidualsMetres': residuals.tolist(),
            'status': 'candidate fit to supplied associations; residual is not survey accuracy'}


def patch_basis(patch):
    origin = checked_array(patch['origin'], (3,), 'patch origin')
    u, v, normal = (checked_array(patch[key], (3,), 'patch '+key) for key in ('u', 'v', 'normal'))
    basis = np.stack((u, v, normal))
    if basis.shape != (3, 3) or not np.allclose(basis@basis.T, np.eye(3), atol=1e-7) or not np.allclose(np.cross(u, v), normal, atol=1e-7):
        raise ValueError('Patch basis must be orthonormal and outward oriented')
    bounds = checked_array(patch['bounds'], (4,), 'patch bounds')
    if bounds.shape != (4,) or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
        raise ValueError('Invalid patch extent')
    return origin, u, v, normal, bounds


def patch_coordinates(points, patch):
    origin, u, v, normal, _ = patch_basis(patch)
    return (checked_array(points, (3,), 'patch points')-origin) @ np.stack((u, v, normal)).T


def eligible_face(points, normal, role, part_id, patch):
    """Whole polygon acceptance only. Never alters topology to fit a photo mask."""
    if role not in ('wall', 'slab', 'canopy', 'parapet', 'parapet-cap', 'roof-step-wall') or part_id not in patch['partIds']:
        return False
    _, _, _, outward, bounds = patch_basis(patch)
    normal = checked_array(normal, (3,), 'face normal')
    if np.dot(normal, outward) < patch.get('targetNormalCosine', .995):
        return False
    coords = patch_coordinates(points, patch)
    if coords.ndim != 2 or len(coords) < 3 or np.max(np.abs(coords[:, 2])) > patch.get('planeToleranceMetres', .02):
        return False
    return bool(np.all(coords[:, :2] >= bounds[:2]-1e-6) and np.all(coords[:, :2] <= bounds[2:]+1e-6))


def admissible_photo_hit(target, outward, hit, hit_normal, source_id, patch):
    """Evaluate the FIRST unfiltered source hit: rejected occluders stay rejected."""
    allowed = patch.get('sourceTriangleIds')
    if allowed is not None and source_id not in allowed:
        return False
    displacement = np.asarray(hit)-np.asarray(target)
    return bool(np.linalg.norm(displacement) <= patch.get('maxDistanceMetres', .45)+1e-7 and
                np.dot(hit_normal, outward) >= patch.get('sourceNormalCosine', .94))


def linear_to_srgb(values):
    values = np.clip(np.asarray(values, dtype=float), 0, 1)
    return np.where(values <= .0031308, values*12.92, 1.055*values**(1/2.4)-.055)


def srgb_to_linear(values):
    values = np.clip(np.asarray(values, dtype=float), 0, 1)
    return np.where(values <= .04045, values/12.92, ((values+.055)/1.055)**2.4)


def confidence_edge_weights(target_mask, accepted_mask, pixel_size, feather_metres=0):
    """Fade only valid photo texels near rejected *target* texels, never across holes.

    Eight-neighbour metric propagation stays on target geometry; diagonal steps
    require both orthogonal neighbours to exist. Non-target pixels are neither
    rejection seeds nor routes to another component. Reach is unchanged.
    """
    target = np.asarray(target_mask, dtype=bool)
    accepted = np.asarray(accepted_mask, dtype=bool)
    step = np.asarray(pixel_size, dtype=float)
    if target.ndim != 2 or accepted.shape != target.shape or np.any(accepted & ~target):
        raise ValueError('Invalid target/accepted mask')
    if step.shape != (2,) or not np.isfinite(step).all() or (step <= 0).any():
        raise ValueError('Invalid metric texel size')
    if not math.isfinite(feather_metres) or not 0 <= feather_metres <= .15:
        raise ValueError('Feather must stay in [0,0.15] metres')
    weights = accepted.astype(float)
    if feather_metres == 0 or not accepted.any():
        return weights
    rejected = target & ~accepted
    if not rejected.any():
        return weights
    height, width = target.shape
    distance = np.full(target.shape, np.inf)
    distance[rejected] = 0
    # Limit heap seeds to rejected cells beside accepted cells, not the whole void.
    adjacent = np.zeros(target.shape, dtype=bool)
    offsets = [(dy, dx, math.hypot(dx*step[0], dy*step[1]))
               for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    for dy, dx, _ in offsets:
        y0, y1 = max(0, -dy), min(height, height-dy)
        x0, x1 = max(0, -dx), min(width, width-dx)
        adjacent[y0:y1, x0:x1] |= accepted[y0+dy:y1+dy, x0+dx:x1+dx]
    queue = [(0., int(row), int(column)) for row, column in np.argwhere(rejected & adjacent)]
    heapq.heapify(queue)
    while queue:
        length, row, column = heapq.heappop(queue)
        if length > distance[row, column]:
            continue
        for dy, dx, cost in offsets:
            y, x = row+dy, column+dx
            if not (0 <= y < height and 0 <= x < width) or not accepted[y, x]:
                continue
            if dy and dx and not (target[row, x] and target[y, column]):
                continue
            candidate = length+cost
            if candidate >= feather_metres or candidate >= distance[y, x]:
                continue
            distance[y, x] = candidate
            heapq.heappush(queue, (candidate, y, x))
    band = accepted & (distance < feather_metres)
    weights[band] = distance[band]/feather_metres
    return weights


def blend_photo_with_fallback(photo, accepted_mask, weights, fallback_linear):
    """Linear-light confidence mix; exact bytes for the valid core and fallback."""
    photo = np.asarray(photo)
    accepted = np.asarray(accepted_mask, dtype=bool)
    weights = np.asarray(weights, dtype=float)
    fallback = checked_array(fallback_linear, (3,), 'fallback colour')
    if (photo.dtype != np.uint8 or photo.ndim != 3 or photo.shape[2] != 3 or
            photo.shape[:2] != accepted.shape or weights.shape != accepted.shape or
            not np.isfinite(weights).all() or (weights < 0).any() or (weights > 1).any() or
            np.any(weights[~accepted] != 0)):
        raise ValueError('Invalid photo confidence arrays')
    fallback_bytes = np.rint(linear_to_srgb(fallback)*255).astype(np.uint8)
    result = np.broadcast_to(fallback_bytes, photo.shape).copy()
    core = accepted & (weights == 1)
    result[core] = photo[core]
    band = accepted & (weights > 0) & (weights < 1)
    if band.any():
        confidence = weights[band, None]
        linear = srgb_to_linear(photo[band]/255)*confidence + np.clip(fallback, 0, 1)*(1-confidence)
        result[band] = np.clip(np.rint(linear_to_srgb(linear)*255), 0, 255).astype(np.uint8)
    return result


def rasterize_patch_triangles(triangles, bounds, width, height):
    """Rasterize existing CAD triangles only; empty window/door pixels stay empty."""
    triangles = checked_array(triangles, (3, 2), 'patch triangles')
    bounds = checked_array(bounds, (4,), 'bounds')
    if width < 1 or height < 1 or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
        raise ValueError('Invalid raster extent')
    mask = np.zeros((height, width), dtype=bool)
    step = (bounds[2:]-bounds[:2])/np.array((width, height))
    for triangle in triangles:
        low = np.maximum(0, np.floor((triangle.min(axis=0)-bounds[:2])/step-.5).astype(int))
        high = np.minimum([width-1, height-1], np.ceil((triangle.max(axis=0)-bounds[:2])/step-.5).astype(int))
        if (low > high).any():
            continue
        xx, yy = np.meshgrid(bounds[0]+(np.arange(low[0], high[0]+1)+.5)*step[0],
                             bounds[1]+(np.arange(low[1], high[1]+1)+.5)*step[1])
        a, b, c = triangle
        u, v = b-a, c-a
        denominator = u[0]*v[1]-u[1]*v[0]
        if abs(denominator) < 1e-16:
            continue
        beta = ((xx-a[0])*v[1]-(yy-a[1])*v[0])/denominator
        gamma = (u[0]*(yy-a[1])-u[1]*(xx-a[0]))/denominator
        mask[low[1]:high[1]+1, low[0]:high[0]+1] |= (beta >= -1e-8)&(gamma >= -1e-8)&(beta+gamma <= 1+1e-8)
    # Patch v increases upward; PNG rows increase downward.
    return mask[::-1].copy()


def png_rgb_bytes(pixels):
    """Lossless derived atlas, top-down sRGB bytes; no raw source atlas copying."""
    pixels = np.asarray(pixels)
    if pixels.dtype != np.uint8 or pixels.ndim != 3 or pixels.shape[2] != 3:
        raise ValueError('Expected RGB uint8 pixels')
    height, width = pixels.shape[:2]
    if not width or not height:
        raise ValueError('Empty image')
    def chunk(kind, data):
        return struct.pack('>I', len(data))+kind+data+struct.pack('>I', zlib.crc32(kind+data) & 0xffffffff)
    scanlines = b''.join(b'\0'+row.tobytes() for row in pixels)
    return (b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))+
            chunk(b'sRGB', b'\0')+chunk(b'IDAT', zlib.compress(scanlines, 6))+chunk(b'IEND', b''))
