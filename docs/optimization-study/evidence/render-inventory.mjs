// Run from the repository root with: node --import tsx docs/optimization-study/evidence/render-inventory.mjs
// Topology inventory only. NullEngine results are NOT GPU/browser benchmarks.
import { NullEngine, Scene, MeshBuilder, StandardMaterial, Vector3, HemisphericLight, DirectionalLight } from '@babylonjs/core';
import { Game } from '../../../.cache/optimization-study-snapshot/client/game.ts';
import { BUILDINGS, MAP, B6_BOXES, BOUNDS, GROUND_RECTS, blockNumber, PLACES } from '../../../.cache/optimization-study-snapshot/shared/world.ts';

let windows = 0, paths = 0;
for (const b of BUILDINGS) {
  const number = blockNumber(b.name);
  if (!number || number === 6) continue;
  for (let i = 1; i < b.points.length; i++) {
    const [a, z] = b.points[i - 1], [x, k] = b.points[i];
    const length = Math.hypot(x - a, k - z);
    if (length < 8) continue;
    for (let y = 1.5; y < b.height - .4; y += 3)
      for (let t = 2; t < length - 1; t += 2.7) windows++;
  }
}
for (const path of MAP.paths) {
  for (let i = 1; i < path.points.length; i++) {
    const [a, z] = path.points[i - 1], [b, nz] = path.points[i];
    const x = (a + b) / 2, cz = (z + nz) / 2;
    if (x >= BOUNDS.minX && x <= BOUNDS.maxX && cz >= BOUNDS.minZ && cz <= BOUNDS.maxZ) paths++;
  }
}

const engine = new NullEngine(), scene = new Scene(engine);
scene.useRightHandedSystem = true;
const game = Object.create(Game.prototype);
Object.assign(game, { engine, scene, materials: new Map(), staticMeshes: new Map(), clouds: [], lights: [], huntMeshes: [] });
game.ambient = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
game.sun = new DirectionalLight('sun', new Vector3(-1, -1, .2), scene);
game.label = function (_text, x, y, z, width = 4) {
  const mesh = MeshBuilder.CreatePlane('label', { width, height: width / 4 }, scene);
  mesh.position.set(x, y, z);
  mesh.material = new StandardMaterial('sign', scene);
  return mesh;
};
game.buildWorld();
const result = {
  method: 'Snapshot buildWorld under NullEngine; canvas text generation stubbed; no car/avatar construction, no render call, no actual draw-call or GPU-time measurement.',
  geometryInventory: {
    buildings: BUILDINGS.length, paths: MAP.paths.length, renderedPathSegments: paths,
    b6Boxes: B6_BOXES.length, b6Windows: 144, otherWindows: windows,
    labels: BUILDINGS.filter(b => blockNumber(b.name) && blockNumber(b.name) !== 6).length + 6 + 3 + PLACES.filter(p => !['club6', 'b6'].includes(p.id)).length,
    groundRects: GROUND_RECTS.length
  },
  meshes: scene.meshes.length,
  subMeshes: scene.meshes.reduce((sum, mesh) => sum + mesh.subMeshes.length, 0),
  triangles: scene.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
  solids: scene.meshes.filter(mesh => mesh.metadata?.solid).length,
  materials: scene.materials.length,
  multiMaterials: scene.multiMaterials.length,
  lights: scene.lights.length,
  largestMeshes: scene.meshes.map(mesh => ({
    name: mesh.name,
    triangles: mesh.getTotalIndices() / 3,
    subMeshes: mesh.subMeshes.length,
    aabbExtentHalfSizeMeters: mesh.getBoundingInfo().boundingBox.extendSize.asArray(),
    lights: mesh.lightSources.map(light => ({ name: light.name, x: light.position?.x }))
  })).sort((a, b) => b.triangles - a.triangles).slice(0, 8)
};
console.log(JSON.stringify(result, null, 2));
engine.dispose();
