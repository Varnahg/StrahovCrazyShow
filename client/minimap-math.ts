export type MapPoint = { x: number; z: number };
export type MapBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
export type MapViewport = { width: number; height: number };
export type MapCamera = MapPoint & { scale: number; rotation: number };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** +X east, +Z south. Rotation is clockwise on the displayed map, in radians. */
export function mapToScreen(
  point: MapPoint,
  camera: MapCamera,
  size: MapViewport,
) {
  const dx = point.x - camera.x,
    dz = point.z - camera.z,
    c = Math.cos(camera.rotation),
    s = Math.sin(camera.rotation);
  return {
    x: size.width / 2 + (dx * c - dz * s) * camera.scale,
    y: size.height / 2 + (dx * s + dz * c) * camera.scale,
  };
}

export function screenToMap(
  point: { x: number; y: number },
  camera: MapCamera,
  size: MapViewport,
): MapPoint {
  const dx = (point.x - size.width / 2) / camera.scale,
    dz = (point.y - size.height / 2) / camera.scale,
    c = Math.cos(camera.rotation),
    s = Math.sin(camera.rotation);
  return { x: camera.x + dx * c + dz * s, z: camera.z - dx * s + dz * c };
}

export function fitMapScale(bounds: MapBounds, size: MapViewport) {
  return Math.min(
    size.width / (bounds.maxX - bounds.minX),
    size.height / (bounds.maxZ - bounds.minZ),
  );
}

/** Pan remains bounded after zoom, resize, rotation or a world-bound expansion. */
export function clampMapCamera(
  camera: MapCamera,
  bounds: MapBounds,
  size: MapViewport,
): MapCamera {
  const c = Math.abs(Math.cos(camera.rotation)),
    s = Math.abs(Math.sin(camera.rotation)),
    halfX = (size.width * c + size.height * s) / (2 * camera.scale),
    halfZ = (size.width * s + size.height * c) / (2 * camera.scale);
  return {
    ...camera,
    x:
      halfX * 2 >= bounds.maxX - bounds.minX
        ? (bounds.minX + bounds.maxX) / 2
        : clamp(camera.x, bounds.minX + halfX, bounds.maxX - halfX),
    z:
      halfZ * 2 >= bounds.maxZ - bounds.minZ
        ? (bounds.minZ + bounds.maxZ) / 2
        : clamp(camera.z, bounds.minZ + halfZ, bounds.maxZ - halfZ),
  };
}

/** Keep the geographic point beneath the cursor fixed while zooming. */
export function zoomMapAt(
  camera: MapCamera,
  anchor: { x: number; y: number },
  scale: number,
  size: MapViewport,
): MapCamera {
  const before = screenToMap(anchor, camera, size),
    next = { ...camera, scale },
    after = screenToMap(anchor, next, size);
  return {
    ...next,
    x: next.x + before.x - after.x,
    z: next.z + before.z - after.z,
  };
}

export function panMapBy(camera: MapCamera, dx: number, dy: number): MapCamera {
  const c = Math.cos(camera.rotation),
    s = Math.sin(camera.rotation);
  return {
    ...camera,
    x: camera.x - (dx * c + dy * s) / camera.scale,
    z: camera.z + (dx * s - dy * c) / camera.scale,
  };
}

/** Offscreen objectives stay at the map edge; never move the actual target. */
export function mapEdgeIndicator(
  point: { x: number; y: number },
  size: MapViewport,
  inset = 15,
) {
  const dx = point.x - size.width / 2,
    dy = point.y - size.height / 2,
    halfX = Math.max(1, size.width / 2 - inset),
    halfY = Math.max(1, size.height / 2 - inset),
    factor = Math.min(
      1,
      halfX / (Math.abs(dx) || 1),
      halfY / (Math.abs(dy) || 1),
    );
  return {
    x: size.width / 2 + dx * factor,
    y: size.height / 2 + dy * factor,
    offscreen: factor < 1,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
  };
}

export function mapHeading(yaw = 0) {
  return Math.PI - yaw;
}
