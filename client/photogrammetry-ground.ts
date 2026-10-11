import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { getPhotogrammetryGroundPatchGeometry } from "../shared/photogrammetry-ground";

/** Small derived pedestrian patches, never a second global terrain overlay. */
export function buildPhotogrammetryGroundRepairs(scene: Scene) {
  const geometry = getPhotogrammetryGroundPatchGeometry(),
    meshes: Mesh[] = [],
    materials: StandardMaterial[] = [];
  for (const part of geometry.parts) {
    const mesh = new Mesh("derived photo ground:" + part.material, scene),
      data = new VertexData();
    data.positions = part.positions;
    data.normals = part.normals;
    data.indices = part.indices;
    data.uvs = part.uvs;
    data.applyToMesh(mesh);
    const material = new StandardMaterial(
      "derived footway repair:" + part.material,
      scene,
    );
    material.diffuseColor = Color3.FromHexString(
      part.material === "asphalt"
        ? "#717371"
        : part.material === "paving"
          ? "#aaa79d"
          : part.material === "sett"
            ? "#8f918b"
            : "#9b9484",
    );
    material.specularColor.setAll(0.025);
    material.backFaceCulling = false;
    // Deterministic raster priority where a repaired source edge and its local
    // fill meet. Geometry heights remain identical for native/render support.
    material.zOffset = -1;
    material.zOffsetUnits = -1;
    material.metadata = {
      surfaceKind: part.material,
      uvMetresPerRepeat: 4,
      sourcePack: "derived-photogrammetry-ground-repair",
      sourceMeasured: false,
      textureProvenance:
        "generic existing surface-pack family, not extracted IPR pixels",
    };
    mesh.material = material;
    mesh.sideOrientation = 1;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.metadata = {
      depthCaster: false,
      derivedRepair: true,
      sourceWayPatchIds: part.patchIds,
    };
    mesh.freezeWorldMatrix();
    meshes.push(mesh);
    materials.push(material);
  }
  return {
    meshes,
    geometry,
    stats: {
      patchCount: geometry.patchCount,
      areaSquareMetres: geometry.areaSquareMetres,
      triangles: geometry.indices.length / 3,
      meshBatches: meshes.length,
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose(false, true);
    },
  };
}
