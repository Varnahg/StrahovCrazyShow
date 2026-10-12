import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { drapeTriangles } from "../shared/terrain";
import { SurfacePack } from "../client/surface-pack";

// The real draper emits increasing X/Z UVs and upward DMR normals, with its
// existing winding. Derivatives below are from the actual Babylon projection,
// not a glTF proxy or an assumption about which world axis is screen-right.
function terrainFrame(scene: Scene) {
  const data = drapeTriangles(
    [
      [108, 10],
      [112, 10],
      [112, 14],
      [108, 14],
    ],
    [0, 1, 2, 0, 2, 3],
    0.011,
  );
  const ids = data.indices.slice(0, 3),
    p = ids.map((id) => Vector3.FromArray(data.positions, id * 3)),
    uv = ids.map((id) => Vector2.FromArray(data.uvs, id * 2)),
    n = ids
      .reduce(
        (sum, id) => sum.addInPlace(Vector3.FromArray(data.normals, id * 3)),
        Vector3.Zero(),
      )
      .normalize(),
    centre = p
      .reduce((sum, v) => sum.addInPlace(v), Vector3.Zero())
      .scale(1 / 3),
    camera = new UniversalCamera(
      "surface transfer",
      centre.add(new Vector3(2, 5, -4)),
      scene,
    );
  camera.setTarget(centre);
  const viewProjection = camera
      .getViewMatrix()
      .multiply(camera.getProjectionMatrix()),
    projected = p.map((v) => Vector3.TransformCoordinates(v, viewProjection)),
    a = projected[1].subtract(projected[0]),
    b = projected[2].subtract(projected[0]),
    area = a.x * b.y - a.y * b.x;
  assert.ok(Math.abs(area) > 1e-6);
  const edgeA = p[1].subtract(p[0]),
    edgeB = p[2].subtract(p[0]),
    uvA = uv[1].subtract(uv[0]),
    uvB = uv[2].subtract(uv[0]),
    dpdx = edgeA
      .scale(b.y)
      .subtract(edgeB.scale(a.y))
      .scale(1 / area),
    dpdy = edgeB
      .scale(a.x)
      .subtract(edgeA.scale(b.x))
      .scale(1 / area),
    duvdx = uvA
      .scale(b.y)
      .subtract(uvB.scale(a.y))
      .scale(1 / area),
    duvdy = uvB
      .scale(a.x)
      .subtract(uvA.scale(b.x))
      .scale(1 / area);
  // Native Babylon 9.30 bumpFragmentMainFunctions.cotangent_frame operations.
  const dp2perp = Vector3.Cross(dpdy, n),
    dp1perp = Vector3.Cross(n, dpdx),
    tangent = dp2perp.scale(duvdx.x).add(dp1perp.scale(duvdy.x)),
    bitangent = dp2perp.scale(duvdx.y).add(dp1perp.scale(duvdy.y)),
    invmax =
      1 /
      Math.sqrt(Math.max(tangent.lengthSquared(), bitangent.lengthSquared()));
  tangent.scaleInPlace(invmax);
  bitangent.scaleInPlace(invmax);
  return { data, n, tangent, bitangent, area };
}

test("original NormalGL relief keeps its physical light direction on real DMR UVs and Babylon winding", () => {
  for (const rightHanded of [true, false]) {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = rightHanded;
    scene.useDelayedTextureLoading = true;
    const frame = terrainFrame(scene),
      mesh = new Mesh("actual draped asphalt", scene),
      vertex = new VertexData(),
      source = new StandardMaterial("asphalt", scene);
    Object.assign(vertex, frame.data);
    vertex.applyToMesh(mesh);
    source.metadata = { surfaceKind: "asphalt", uvMetresPerRepeat: 4 };
    mesh.material = source;
    const pack = new SurfacePack(scene);
    try {
      pack.update(1, "medium", 0);
      const material = mesh.material as PBRMaterial;
      assert.equal(
        material.sideOrientation ?? mesh.sideOrientation,
        rightHanded ? 0 : 1,
      );
      assert.equal(
        frame.area < 0,
        rightHanded,
        "native visible winding in the actual projection",
      );
      const u = new Vector3(1, 0, 0)
          .subtract(frame.n.scale(frame.n.x))
          .normalize(),
        v = new Vector3(0, 0, 1).subtract(frame.n.scale(frame.n.z)).normalize();
      // A raised height profile falling toward image +V has a +V world normal.
      // OpenGL stores upward-image green, so that slope is encoded with G<0.5.
      const perturb = (red: number, green: number) => {
        const strength = material.bumpTexture!.level,
          normalX = red * 2 - 1,
          normalY = green * 2 - 1,
          normalZ = Math.sqrt(1 - normalX * normalX - normalY * normalY);
        return frame.tangent
          .scale(normalX * strength * (material.invertNormalMapX ? -1 : 1))
          .add(
            frame.bitangent.scale(
              normalY * strength * (material.invertNormalMapY ? -1 : 1),
            ),
          )
          .add(frame.n.scale(normalZ))
          .normalize();
      };
      const slopeV = perturb(0.5, 0.25),
        slopeU = perturb(0.75, 0.5),
        positiveVLight = frame.n.add(v).normalize(),
        negativeVLight = frame.n.subtract(v).normalize();
      assert.ok(
        Vector3.Dot(slopeV, v) > 0.05,
        "NormalGL south-facing slope must face increasing terrain Z, not north",
      );
      assert.ok(
        Vector3.Dot(slopeU, u) > 0.05,
        "NormalGL red slope must face increasing terrain X",
      );
      assert.ok(
        Vector3.Dot(slopeV, positiveVLight) >
          Vector3.Dot(slopeV, negativeVLight),
        "directional light must illuminate the physically facing slope",
      );
      assert.ok(perturb(0.5, 0.5).equalsWithEpsilon(frame.n, 1e-9));
      const textureCount = scene.textures.length,
        visitCount = pack.stats.meshVisits,
        dry = material.albedoColor.clone();
      for (const quality of ["low", "medium", "high"]) {
        pack.update(0.1, quality, 2);
        assert.ok(material.roughness! < 1);
        assert.ok(perturb(0.5, 0.25).equalsWithEpsilon(slopeV, 1e-9));
        pack.update(0.1, quality, 0);
        assert.ok(material.albedoColor.equals(dry));
      }
      assert.equal(scene.textures.length, textureCount);
      assert.equal(pack.stats.meshVisits, visitCount);
      const updates = pack.stats.materialUpdates;
      pack.update(0.1, "high", 0);
      assert.equal(pack.stats.materialUpdates, updates);
      pack.dispose();
      assert.equal(mesh.material, source);
      assert.equal(scene.textures.length, textureCount - 3);
    } finally {
      pack.dispose();
      scene.dispose();
      engine.dispose();
    }
  }
});
