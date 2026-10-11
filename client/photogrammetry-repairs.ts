import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { photogrammetryEntranceRepair } from "../shared/photogrammetry-repairs";
export function buildPhotogrammetryEntranceRepair(scene: Scene) {
  const p = photogrammetryEntranceRepair(),
    mesh = new Mesh("B6 photo source approach repair", scene),
    data = new VertexData(),
    normals: number[] = [];
  VertexData.ComputeNormals(p.positions, p.indices, normals, {
    useRightHandedSystem: true,
  });
  data.positions = p.positions;
  data.indices = p.indices;
  data.normals = normals;
  data.uvs = [0, 0, 4.2, 0, 0, 0.7, 4.2, 0.7, 0, 0.7, 4.2, 0.7, 0, 5, 4.2, 5];
  data.applyToMesh(mesh);
  const material = new StandardMaterial(
    "photo repair concrete approach",
    scene,
  );
  material.diffuseColor = Color3.FromHexString("#92958d");
  material.specularColor.setAll(0.025);
  material.metadata = { surfaceKind: "concrete", uvMetresPerRepeat: 1 };
  mesh.material = material;
  mesh.sideOrientation = 1;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  mesh.metadata = {
    sourcePack: "documented-photo-repairs",
    depthCaster: false,
  };
  mesh.freezeWorldMatrix();
  return mesh;
}
