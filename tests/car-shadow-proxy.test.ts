import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { Logger } from "@babylonjs/core/Misc/logger";
import { acquireCarPack, CAR_PACK_MANIFEST } from "../client/car-pack";
import { CinematicAtmosphere, shadowCasterKind } from "../client/cinematic";
import "../client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

const sources = Object.fromEntries(
  CAR_PACK_MANIFEST.lods.map((lod) => [
    lod.level,
    new Uint8Array(readFileSync("public" + lod.url)),
  ]),
);
function sceneSetup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  return { engine, scene };
}
const proxies = (root: { getChildMeshes(): any[] }) =>
  root
    .getChildMeshes()
    .filter((m) => m.metadata?.shadowProxy) as InstancedMesh[];
const visible = (root: { getChildMeshes(): any[] }) =>
  root
    .getChildMeshes()
    .filter((m) => m.metadata?.kind === "vehicle-part") as InstancedMesh[];
function geometryHash(mesh: Mesh) {
  const hash = createHash("sha256");
  for (const kind of ["position", "normal"]) {
    const data = new Float32Array(mesh.getVerticesData(kind)!);
    hash.update(new Uint8Array(data.buffer));
  }
  hash.update(new Uint8Array(new Uint32Array(mesh.getIndices()!).buffer));
  return hash.digest("hex");
}

test("five shared opaque far shadow geometries preserve all original render masters and refcount cleanup", async () => {
  const { engine, scene } = sceneSetup();
  const a = await acquireCarPack(scene, { assetSources: sources });
  const original = [...a.pack.templates.values()].flatMap((parts) =>
    [...parts.values()].map((p) => ({
      mesh: p.source,
      geometry: p.source.geometry,
      hash: geometryHash(p.source),
    })),
  );
  const b = await acquireCarPack(scene);
  const first = a.pack.createRig("shadow-a", "#aa3322"),
    second = b.pack.createRig("shadow-b", "#ededdf");
  try {
    assert.equal(a.pack, b.pack);
    assert.equal(visible(first.root).length, 26);
    assert.equal(proxies(first.root).length, 5);
    assert.equal(scene.geometries.length, 3 * 26 + 5);
    const geometryIds = (root: typeof first.root) =>
      proxies(root).map((p) => p.sourceMesh.geometry!.uniqueId);
    assert.deepEqual(geometryIds(first.root), geometryIds(second.root));
    const farOpaqueTriangles = [...a.pack.templates.get("far")!.values()]
      .filter(
        (p) =>
          p.source.material!.alpha >= 0.98 &&
          !p.source.material!.needAlphaBlendingForMesh(p.source) &&
          !p.source.material!.needAlphaTestingForMesh(p.source),
      )
      .reduce((sum, p) => sum + p.source.getTotalIndices() / 3, 0);
    assert.equal(
      proxies(first.root).reduce((sum, p) => sum + p.getTotalIndices() / 3, 0),
      farOpaqueTriangles,
    );
    for (const quality of ["low", "high", "medium", "low"])
      a.pack.setQuality(quality);
    for (const entry of original) {
      assert.equal(entry.mesh.geometry, entry.geometry);
      assert.equal(geometryHash(entry.mesh), entry.hash);
    }
    first.dispose();
    a.release();
    assert.ok(
      proxies(second.root).every(
        (p) => !p.isDisposed() && !p.sourceMesh.isDisposed(),
      ),
    );
  } finally {
    first.dispose();
    second.dispose();
    a.release();
    b.release();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.transformNodes.length, 0);
    assert.equal(scene.materials.length, 0);
    scene.dispose();
    engine.dispose();
  }
});

test("only low quality enables proxy casters, with no duplicate visible-car casters or disabled-root leaks", async () => {
  const { engine, scene } = sceneSetup();
  const lease = await acquireCarPack(scene, { assetSources: sources });
  const rig = lease.pack.createRig("quality-car");
  try {
    for (const quality of ["low", "medium", "high", "low"]) {
      lease.pack.setQuality(quality);
      const selected = rig.root
        .getChildMeshes()
        .filter((m) => shadowCasterKind(m));
      if (quality === "low") {
        assert.equal(selected.length, 5);
        assert.ok(selected.every((m) => m.metadata.shadowProxy));
        assert.ok(
          visible(rig.root).every((m) => m.metadata.shadowCaster === false),
        );
      } else {
        assert.equal(selected.length, 23);
        assert.ok(selected.every((m) => m.metadata.kind === "vehicle-part"));
        assert.ok(proxies(rig.root).every((m) => !m.isEnabled()));
      }
    }
    rig.root.setEnabled(false);
    assert.equal(
      rig.root.getChildMeshes().filter((m) => shadowCasterKind(m)).length,
      0,
    );
    rig.root.setEnabled(true);
    assert.equal(
      rig.root.getChildMeshes().filter((m) => shadowCasterKind(m)).length,
      5,
    );
    const late = lease.pack.createRig("late-low-car");
    assert.equal(
      late.root.getChildMeshes().filter((m) => shadowCasterKind(m)).length,
      5,
    );
    late.dispose();
  } finally {
    rig.dispose();
    lease.release();
    scene.dispose();
    engine.dispose();
  }
});

test("shadow body and all four wheels inherit the exact actual root, steering, spin and suspension transforms", async () => {
  const { engine, scene } = sceneSetup();
  const lease = await acquireCarPack(scene, { assetSources: sources });
  const rig = lease.pack.createRig("pose-car");
  try {
    rig.root.position.set(113.25, -2.71, -17.4);
    rig.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
      1.8,
      0.12,
      -0.07,
    );
    for (const [index, wheel] of rig.wheels.entries()) {
      wheel.position.y = 0.25 + index * 0.04;
      wheel.rotationQuaternion = Quaternion.RotationYawPitchRoll(
        index < 2 ? 0.37 : 0,
        1.13 + index * 0.2,
        0,
      );
    }
    for (const proxy of proxies(rig.root)) {
      const index = proxy.metadata.wheelIndex;
      const parent = index === undefined ? rig.root : rig.wheels[index];
      assert.equal(proxy.parent, parent);
      assert.deepEqual(
        Array.from(proxy.computeWorldMatrix(true).asArray()),
        Array.from(parent.computeWorldMatrix(true).asArray()),
      );
      const expectedMin = new Vector3(Infinity, Infinity, Infinity),
        expectedMax = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const part of lease.pack.templates.get("far")!.values()) {
        if (
          part.wheel !== index ||
          part.source.material!.alpha < 0.98 ||
          part.source.material!.needAlphaBlendingForMesh(part.source)
        )
          continue;
        const positions = part.source.getVerticesData("position")!;
        for (let i = 0; i < positions.length; i += 3) {
          const point = Vector3.TransformCoordinates(
            Vector3.FromArray(positions, i),
            parent.getWorldMatrix(),
          );
          expectedMin.minimizeInPlace(point);
          expectedMax.maximizeInPlace(point);
        }
      }
      const positions = proxy.sourceMesh.getVerticesData("position")!;
      const actualMin = new Vector3(Infinity, Infinity, Infinity),
        actualMax = new Vector3(-Infinity, -Infinity, -Infinity);
      for (let i = 0; i < positions.length; i += 3) {
        const point = Vector3.TransformCoordinates(
          Vector3.FromArray(positions, i),
          proxy.getWorldMatrix(),
        );
        actualMin.minimizeInPlace(point);
        actualMax.maximizeInPlace(point);
      }
      assert.ok(
        Vector3.Distance(actualMin, expectedMin) < 1e-6 &&
          Vector3.Distance(actualMax, expectedMax) < 1e-6,
      );
    }
  } finally {
    rig.dispose();
    lease.release();
    scene.dispose();
    engine.dispose();
  }
});

test("actual Babylon normal camera rejects layerMask0 while explicit shadow renderer dispatches the five proxies", async () => {
  const { engine, scene } = sceneSetup();
  // CPU dispatch contract only. No textures are sampled and no GPU exists.
  scene.texturesEnabled = false;
  const lease = await acquireCarPack(scene, { assetSources: sources });
  const rig = lease.pack.createRig("dispatch-car");
  lease.pack.setQuality("low");
  const camera = new FreeCamera("main", new Vector3(0, 2, 7), scene);
  camera.setTarget(new Vector3(0, 0.65, 0));
  scene.activeCamera = camera;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
  sun.position.set(5, 10, 5);
  const generator = new ShadowGenerator(128, sun);
  const map = generator.getShadowMap()!;
  map.renderList = scene.meshes.filter((m) => shadowCasterKind(m));
  const shadowDraws: string[] = [];
  generator.onBeforeShadowMapRenderMeshObservable.add((mesh) =>
    shadowDraws.push(mesh.name),
  );
  try {
    for (let i = 0; i < 3; i++) {
      scene.render();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    shadowDraws.length = 0;
    scene.render();
    const active = scene
      .getActiveMeshes()
      .data.slice(0, scene.getActiveMeshes().length);
    assert.ok(active.some((m) => m.metadata?.kind === "vehicle-part"));
    assert.ok(active.every((m) => !m.metadata?.shadowProxy));
    assert.equal(map.forceLayerMaskCheck, false);
    assert.equal(map.renderList.length, 5);
    assert.equal(shadowDraws.length, 5);
    assert.ok(
      shadowDraws.every((name) => name.startsWith("car shadow template:")),
    );
    assert.ok(map.renderList.every((m) => m.layerMask === 0));
  } finally {
    generator.dispose();
    rig.dispose();
    lease.release();
    scene.dispose();
    engine.dispose();
  }
});

test("actual Cinematic caster selection keeps proxy source receivers disabled without instance setter warnings", async () => {
  // NullEngine has no raw-cube uploader. This explicitly replaces only that
  // resource allocation, not Cinematic's real selection or mesh setters.
  class CpuAtmosphereEngine extends NullEngine {
    override createRawCubeTexture(
      ...args: Parameters<NullEngine["createRawCubeTexture"]>
    ) {
      const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
      texture.isCube = true;
      texture.width =
        texture.height =
        texture.baseWidth =
        texture.baseHeight =
          args[1];
      texture.isReady = true;
      return texture;
    }
  }
  const engine = new CpuAtmosphereEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  const lease = await acquireCarPack(scene, { assetSources: sources });
  const rig = lease.pack.createRig("receiver-car");
  lease.pack.setQuality("low");
  const camera = new FreeCamera("main", new Vector3(0, 2, 7), scene);
  camera.setTarget(new Vector3(0, 0.65, 0));
  scene.activeCamera = camera;
  const sun = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
  sun.intensity = 1;
  const atmosphere = new CinematicAtmosphere(scene, camera, sun);
  const warnings: string[] = [];
  const originalWarn = Logger.Warn;
  Logger.Warn = (message) => {
    warnings.push(String(message));
  };
  try {
    for (let i = 0; i < 12; i++) {
      atmosphere.update({
        dt: 0.1,
        player: { x: 0, y: 0, z: 0 },
        quality: "low",
        cloud: 0.4,
        daylight: 1,
      });
      for (const proxy of proxies(rig.root)) {
        assert.equal(proxy.sourceMesh.metadata.receiveShadows, false);
        assert.equal(proxy.sourceMesh.receiveShadows, false);
        assert.equal(proxy.metadata.receiveShadows, false);
        assert.equal(proxy.receiveShadows, false);
      }
    }
    assert.ok(
      atmosphere.stats.selectionMeshVisits > scene.meshes.length * 2,
      "exercise repeated real broad-phase selection",
    );
    assert.deepEqual(warnings, []);
    assert.equal(
      sun
        .getShadowGenerator()!
        .getShadowMap()!
        .renderList!.filter((mesh) => shadowCasterKind(mesh)).length,
      5,
    );
  } finally {
    Logger.Warn = originalWarn;
    atmosphere.dispose();
    rig.dispose();
    lease.release();
    scene.dispose();
    engine.dispose();
  }
});
