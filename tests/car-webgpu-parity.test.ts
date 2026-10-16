import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import {
  acquireCarPack,
  CAR_PACK_MANIFEST,
  type CarPackOptions,
} from "../client/car-pack";
import { CAR_PAINT_COLOR_BUFFER } from "../client/car-paint-instances";

function readAssetSources() {
  // glTF accessors can be views into these bytes. CarPack's normal baking
  // mutates them, so each independent scene needs the original source again.
  return Object.fromEntries(
    CAR_PACK_MANIFEST.lods.map((lod) => [
      lod.level,
      new Uint8Array(readFileSync("public" + lod.url)),
    ]),
  );
}

/** Exercises Babylon's material language and per-pass instance-buffer paths.
 * This does not create a GPU device or prove converted shaders render. */
class BackendContractEngine extends NullEngine {
  constructor(webGPU: boolean, instancing: boolean) {
    super();
    this._isWebGPU = webGPU;
    this.getCaps().instancedArrays = instancing;
  }
}

async function inspectPack({
  webGPU,
  forceGLSL = false,
  instancing = true,
  paintInstancing,
}: {
  webGPU: boolean;
  forceGLSL?: boolean;
  instancing?: boolean;
  paintInstancing?: CarPackOptions["paintInstancing"];
}) {
  const previousForceGLSL = PBRBaseMaterial.ForceGLSL;
  PBRBaseMaterial.ForceGLSL = forceGLSL;
  const engine = new BackendContractEngine(webGPU, instancing);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  scene.texturesEnabled = false;
  try {
    const lease = await acquireCarPack(scene, {
      assetSources: readAssetSources(),
      paintInstancing,
    });
    const second = await acquireCarPack(scene);
    assert.equal(second.pack, lease.pack, "consumers share one scene pack");
    const colors = ["#aa3322", "#2266cc"];
    const rigs = colors.map((color, i) =>
      lease.pack.createRig(`backend-paint:${i}`, color, false),
    );
    try {
      const meshes = rigs.map(
        (rig) =>
          rig.root
            .getChildMeshes()
            .find(
              (mesh) => mesh.material?.metadata?.vehiclePaint,
            ) as InstancedMesh,
      );
      const enabled = !!meshes[0].material?.metadata?.instancePaintTint;
      const tint = meshes.map((mesh) =>
        enabled
          ? (mesh.instancedBuffers[CAR_PAINT_COLOR_BUFFER] as Color4).asArray()
          : [...(mesh.material as PBRMaterial).albedoColor.asArray(), 1],
      );
      assert.deepEqual(
        tint,
        colors.map((color) => [
          ...Color3.FromHexString(color).toLinearSpace().asArray(),
          1,
        ]),
      );
      assert.equal(meshes[0].sourceMesh === meshes[1].sourceMesh, enabled);
      const lods = [...lease.pack.templates].map(([level, parts]) => {
        const source = [...parts.values()].find(
          (part) => part.source.material?.metadata?.vehiclePaint,
        )!.source;
        const material = source.material as PBRMaterial;
        assert.equal(
          !!material.pluginManager?.getPlugin("CarPaintFallback"),
          enabled,
          `${level} plugin matches the dispatch path`,
        );
        if (enabled) {
          // Actual pinned Babylon packing, including WebGPU's separate VBO per
          // render pass. No mock of the color stream or packing implementation.
          source._processInstancedBuffers(meshes, false);
          const storage = source._userInstancedBuffersStorage;
          const buffer = webGPU
            ? storage.renderPasses![engine.currentRenderPassId][
                CAR_PAINT_COLOR_BUFFER
              ]
            : storage.vertexBuffers[CAR_PAINT_COLOR_BUFFER];
          assert.ok(buffer);
          assert.equal(buffer.byteStride, 16);
          assert.equal(buffer.getIsInstanced(), true);
          assert.deepEqual(
            Array.from(storage.data[CAR_PAINT_COLOR_BUFFER].subarray(0, 8)),
            tint.flat().map(Math.fround),
          );
          assert.equal(
            source.isVerticesDataPresent(CAR_PAINT_COLOR_BUFFER),
            true,
          );
        }
        const positions = source.getVerticesData("position")!;
        const normals = source.getVerticesData("normal")!;
        const indices = source.getIndices()!;
        return {
          level,
          language: material.shaderLanguage,
          geometry: createHash("sha256")
            .update(
              JSON.stringify({
                positions: Array.from(positions),
                normals: Array.from(normals),
                indices: Array.from(indices),
              }),
            )
            .digest("hex"),
          material: {
            albedo: material.albedoColor.asArray(),
            alpha: material.alpha,
            metallic: material.metallic,
            roughness: material.roughness,
            coat: material.clearCoat.intensity,
            coatRoughness: material.clearCoat.roughness,
            textured: !!material.albedoTexture,
          },
        };
      });
      const lodDistances = ["low", "medium", "high"].map((quality) => {
        lease.pack.setQuality(quality);
        return meshes[0].sourceMesh
          .getLODLevels()
          .map(({ distanceOrScreenCoverage, mesh }) => ({
            distance: distanceOrScreenCoverage,
            level: mesh?.metadata?.lod,
          }));
      });
      for (const levels of lodDistances) {
        assert.equal(levels.length, 2);
        assert.ok(levels.every(({ distance }) => Number.isFinite(distance)));
        assert.equal(new Set(levels.map(({ distance }) => distance)).size, 2);
      }
      lease.release();
      assert.equal(meshes[1].sourceMesh.isDisposed(), false);
      return { enabled, tint, lods, lodDistances };
    } finally {
      for (const rig of rigs) rig.dispose();
      lease.release();
      second.release();
      assert.equal(scene.meshes.length, 0);
      assert.equal(scene.materials.length, 0);
      assert.equal(
        scene.textures.filter(
          (texture) => texture !== scene.environmentBRDFTexture,
        ).length,
        0,
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
    PBRBaseMaterial.ForceGLSL = previousForceGLSL;
  }
}

test("explicit WebGPU GLSL keeps native paint colors, source geometry, PBR parameters and LOD thresholds identical to WebGL", async () => {
  const baseline = await inspectPack({ webGPU: false });
  const candidate = await inspectPack({
    webGPU: true,
    forceGLSL: true,
  });
  assert.equal(baseline.enabled, true);
  assert.deepEqual(candidate, baseline);
});

test("ordinary WebGPU WGSL preserves the per-color fallback even when paint instancing is requested", async () => {
  const pack = await inspectPack({ webGPU: true, paintInstancing: true });
  assert.equal(pack.enabled, false);
  assert.ok(pack.lods.every((lod) => lod.language === ShaderLanguage.WGSL));
});

test("explicit opt-out and missing instanced arrays retain the fallback on WebGPU GLSL", async () => {
  for (const options of [{ paintInstancing: false }, { instancing: false }]) {
    const pack = await inspectPack({
      webGPU: true,
      forceGLSL: true,
      ...options,
    });
    assert.equal(pack.enabled, false);
    assert.ok(pack.lods.every((lod) => lod.language === ShaderLanguage.GLSL));
  }
});
