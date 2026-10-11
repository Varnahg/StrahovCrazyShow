import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { parseGlb } from "../scripts/car-glb-reader.mjs";
import {
  acquireCarPack,
  CAR_PACK_MANIFEST,
  type CarRig,
} from "../client/car-pack";
import {
  CAR_PAINT_COLOR_BUFFER,
  CarPaintFallbackPlugin,
} from "../client/car-paint-instances";
import "../client/render-shaders";

const sources = Object.fromEntries(
  CAR_PACK_MANIFEST.lods.map((lod) => [
    lod.level,
    new Uint8Array(readFileSync("public" + lod.url)),
  ]),
);
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
type Draw = {
  source: string;
  indices: number;
  instances: number;
  colors: number[][];
  fallbackEntity?: string;
  attributes: string[];
  defines: string;
};

/** Only GPU upload/draw methods are captured. Scene activation, PBR binds,
 * native LOD selection and Babylon's instance buffer packing stay real. */
class DispatchEngine extends NullEngine {
  // NullEngine's public update signature still calls this handle WebGLBuffer;
  // its runtime create method supplies DataBuffer. Preserve identity either way.
  readonly uploads = new WeakMap<object, number[]>();
  readonly draws: Draw[] = [];
  source?: Mesh;
  fallbackColor = [1, 1, 1];
  fallbackEntity?: string;
  bound: Record<string, VertexBuffer> = {};
  attributes: string[] = [];
  defines = "";
  constructor(instancing = true) {
    super();
    this.getCaps().instancedArrays = instancing;
  }
  override createDynamicVertexBuffer(
    ...args: Parameters<NullEngine["createDynamicVertexBuffer"]>
  ) {
    const buffer = super.createDynamicVertexBuffer(...args);
    this.uploads.set(buffer, Array.from(args[0] as Float32Array));
    return buffer;
  }
  override updateDynamicVertexBuffer(
    ...args: Parameters<NullEngine["updateDynamicVertexBuffer"]>
  ) {
    this.uploads.set(args[0], Array.from(args[1] as Float32Array));
    super.updateDynamicVertexBuffer(...args);
  }
  override bindBuffers(
    ...args: [
      ...Parameters<NullEngine["bindBuffers"]>,
      overrides?: Record<string, VertexBuffer>,
    ]
  ) {
    // Geometry supplies user instance streams as the fourth override argument.
    // NullEngine ignores that GPU binding, so capture exactly what it receives.
    this.bound = { ...args[0], ...args[3] };
    this.attributes = args[2].getAttributesNames();
    this.defines = args[2].defines;
    super.bindBuffers(args[0], args[1], args[2]);
  }
  override unbindInstanceAttributes() {}
  override drawElementsType(
    ...args: Parameters<NullEngine["drawElementsType"]>
  ) {
    const material = this.source?.material as PBRMaterial | undefined;
    if (!material?.metadata?.vehiclePaint) return;
    const instances = args[3] ?? 1;
    const buffer = this.bound[CAR_PAINT_COLOR_BUFFER]?.getBuffer();
    const values = buffer ? this.uploads.get(buffer) : undefined;
    const colors =
      args[3] && values
        ? Array.from({ length: instances }, (_, i) =>
            values.slice(i * 4, i * 4 + 4),
          )
        : Array.from({ length: instances }, () => [
            ...(material.metadata.instancePaintTint
              ? this.fallbackColor
              : material.albedoColor.asArray()),
            1,
          ]);
    this.draws.push({
      source: this.source!.name,
      indices: args[2],
      instances,
      colors,
      fallbackEntity: args[3] ? undefined : this.fallbackEntity,
      attributes: [...this.attributes],
      defines: this.defines,
    });
  }
}

function observePaintBinds(scene: Scene, engine: DispatchEngine) {
  for (const mesh of scene.meshes) {
    if (!(mesh instanceof Mesh)) continue;
    mesh.onBeforeBindObservable.add(() => {
      engine.source = mesh;
    });
  }
  for (const material of scene.materials) {
    const plugin = material.pluginManager?.getPlugin(
      "CarPaintFallback",
    ) as CarPaintFallbackPlugin | null;
    if (!plugin) continue;
    const bind = plugin.hardBindForSubMesh.bind(plugin);
    plugin.hardBindForSubMesh = (buffer, scene, renderer, subMesh) => {
      const update = buffer.updateFloat3;
      buffer.updateFloat3 = (name, r, g, b) => {
        if (name === "carPaintFallback") {
          engine.fallbackColor = [r, g, b];
          engine.fallbackEntity = subMesh.getEffectiveMesh().metadata.entityId;
        }
        update.call(buffer, name, r, g, b);
      };
      try {
        bind(buffer, scene, renderer, subMesh);
      } finally {
        buffer.updateFloat3 = update;
      }
    };
  }
}

function paintMesh(rig: CarRig) {
  return rig.root
    .getChildMeshes()
    .find((m) => m.material?.metadata?.vehiclePaint) as InstancedMesh;
}
const colorKey = (c: number[]) => c.map(Math.fround).join(",");

async function capture(instancedPaint: boolean, mirrored: boolean) {
  const engine = new DispatchEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  scene.texturesEnabled = false;
  const camera = new FreeCamera("camera", new Vector3(0, 2, -8), scene);
  camera.setTarget(new Vector3(0, 1, 50));
  camera.maxZ = 150;
  scene.activeCamera = camera;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const handle = await acquireCarPack(scene, {
    assetSources: sources,
    paintInstancing: instancedPaint,
  });
  handle.pack.setQuality("low");
  const rigs: CarRig[] = [];
  for (const z of [0, 18, 60])
    for (const [i, color] of ["#aa3322", "#dddddd"].entries()) {
      const rig = handle.pack.createRig(`paint:${z}:${i}`, color, false);
      rig.root.position.set(i ? 1.4 : -1.4, 0, z);
      rigs.push(rig);
    }
  if (mirrored)
    for (const [i, color] of ["#2266cc", "#44aa55"].entries()) {
      const rig = handle.pack.createRig(`mirror:${i}`, color, false);
      rig.root.position.set(i ? 3.5 : -3.5, 0, 5);
      rig.root.scaling.x = -1;
      rigs.push(rig);
    }
  observePaintBinds(scene, engine);
  try {
    for (let i = 0; i < 4; i++) {
      scene.render();
      await turn();
    }
    const frame = () => {
      engine.draws.length = 0;
      scene.render();
      const selection = rigs.map((rig) => {
        const mesh = paintMesh(rig),
          lod = mesh.getLOD(camera);
        return { entity: rig.root.name, level: lod?.metadata?.lod };
      });
      return {
        selection,
        draw: engine.draws.map((row) => ({
          ...row,
          colors: row.colors.map((c) => [...c]),
        })),
      };
    };
    const initial = frame(),
      transitions = [];
    if (mirrored) {
      rigs.at(-2)!.root.scaling.x = 1;
      rigs.at(-1)!.root.scaling.x = 1;
      for (const quality of ["medium", "high"]) {
        handle.pack.setQuality(quality);
        scene.render();
        await turn();
        transitions.push(frame());
      }
      rigs.at(-2)!.root.scaling.x = -1;
      rigs.at(-1)!.root.scaling.x = -1;
      camera.position.z = -35;
      camera.setTarget(new Vector3(0, 1, 50));
      handle.pack.setQuality("low");
      scene.render();
      await turn();
      transitions.push(frame());
    }
    return { ...initial, transitions };
  } finally {
    for (const rig of rigs) rig.dispose();
    handle.release();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.materials.length, 0);
    assert.equal(
      scene.textures.filter(
        (texture) => texture !== scene.environmentBRDFTexture,
      ).length,
      0,
    );
    scene.dispose();
    engine.dispose();
  }
}

test("native paint dispatch merges two colors at each LOD and uploads exact linear color rows", async () => {
  const baseline = await capture(false, false),
    candidate = await capture(true, false);
  assert.deepEqual(candidate.selection, baseline.selection);
  assert.deepEqual(
    new Set(candidate.selection.map((s) => s.level)),
    new Set(["near", "medium", "far"]),
  );
  assert.equal(baseline.draw.length, 6);
  assert.equal(candidate.draw.length, 3);
  const workload = (draw: Draw[]) =>
    draw.reduce((sum, d) => sum + d.indices * d.instances, 0);
  assert.equal(workload(candidate.draw), workload(baseline.draw));
  assert.deepEqual(
    candidate.draw.flatMap((d) => d.colors.map(colorKey)).sort(),
    baseline.draw.flatMap((d) => d.colors.map(colorKey)).sort(),
  );
  assert.ok(candidate.draw.every((draw) => draw.instances === 2));
  for (const draw of candidate.draw) {
    assert.ok(draw.attributes.includes("instanceColor"), draw.source);
    assert.match(draw.defines, /#define INSTANCESCOLOR/);
    assert.match(draw.defines, /#define INSTANCES\b/);
  }
  console.log(
    "Native paint dispatch (CPU, no GPU timing)",
    JSON.stringify({
      before: baseline.draw.map(({ defines, attributes, ...row }) => row),
      after: candidate.draw.map(({ defines, attributes, ...row }) => row),
    }),
  );
});

test("native mirrored determinant fallback retains each color after and between hardware batches", async () => {
  const baseline = await capture(false, true),
    candidate = await capture(true, true);
  assert.deepEqual(candidate.selection, baseline.selection);
  const rows = (draw: Draw[]) =>
    draw
      .flatMap((d) => d.colors.map((c) => `${d.indices}:${colorKey(c)}`))
      .sort();
  assert.deepEqual(rows(candidate.draw), rows(baseline.draw));
  assert.equal(candidate.transitions.length, 3);
  candidate.transitions.forEach((frame, i) => {
    assert.deepEqual(frame.selection, baseline.transitions[i].selection);
    assert.deepEqual(rows(frame.draw), rows(baseline.transitions[i].draw));
  });
  for (const [i, colour] of ["#2266cc", "#44aa55"].entries()) {
    const fallback = candidate.draw.find(
      (d) => d.fallbackEntity === `mirror:${i}`,
    );
    assert.ok(
      fallback,
      "real regular draw must bind the mirrored entity's fallback uniform",
    );
    assert.doesNotMatch(fallback.defines, /#define INSTANCES\b/);
    assert.equal(
      colorKey(fallback.colors[0]),
      colorKey([...Color3.FromHexString(colour).toLinearSpace().asArray(), 1]),
    );
  }
});

test("paint instances preserve source PBR parameters, independent tints and shared lease cleanup", async () => {
  const engine = new DispatchEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  const before = parseGlb(
    readFileSync("public/models/vehicles/campus-hatchback-near.glb"),
  ).json;
  const expectedPaint = before.materials.find(
    (m: { name: string }) => m.name === CAR_PACK_MANIFEST.paintMaterial,
  );
  const a = await acquireCarPack(scene, { assetSources: sources }),
    b = await acquireCarPack(scene);
  const red = a.pack.createRig("red", "#aa3322"),
    same = b.pack.createRig("same", "#AA3322"),
    original = b.pack.createRig("original");
  try {
    assert.equal(a.pack, b.pack);
    assert.equal(paintMesh(red).sourceMesh, paintMesh(same).sourceMesh);
    assert.notEqual(
      paintMesh(red).instancedBuffers.instanceColor,
      paintMesh(same).instancedBuffers.instanceColor,
    );
    const beforeMove = paintMesh(same).computeWorldMatrix(true).clone();
    red.root.position.x += 3;
    red.wheels[0].rotation.x = 0.7;
    assert.deepEqual(
      paintMesh(same).computeWorldMatrix(true).asArray(),
      beforeMove.asArray(),
    );
    const sourcePositions = [...a.pack.templates.values()].map((parts) =>
      Array.from(parts.get("Body:paint")!.source.getVerticesData("position")!),
    );
    a.pack.setQuality("high");
    a.pack.updateLighting(1);
    assert.deepEqual(
      [...a.pack.templates.values()].map((parts) =>
        Array.from(
          parts.get("Body:paint")!.source.getVerticesData("position")!,
        ),
      ),
      sourcePositions,
    );
    assert.deepEqual(
      (paintMesh(original).instancedBuffers.instanceColor as Color4).asArray(),
      [...expectedPaint.pbrMetallicRoughness.baseColorFactor.slice(0, 3), 1],
    );
    const serialized: unknown[] = [];
    for (const parts of a.pack.templates.values()) {
      const material = parts.get("Body:paint")!.source.material as PBRMaterial;
      assert.deepEqual(material.albedoColor.asArray(), [1, 1, 1]);
      assert.equal(material.alpha, 1);
      assert.equal(
        material.clearCoat.intensity,
        expectedPaint.extensions.KHR_materials_clearcoat.clearcoatFactor,
      );
      assert.equal(
        material.clearCoat.roughness,
        expectedPaint.extensions.KHR_materials_clearcoat
          .clearcoatRoughnessFactor,
      );
      assert.equal(
        material.metallic,
        expectedPaint.pbrMetallicRoughness.metallicFactor,
      );
      assert.equal(
        material.roughness,
        expectedPaint.pbrMetallicRoughness.roughnessFactor,
      );
      assert.ok(material.albedoTexture);
      serialized.push(
        JSON.parse(
          JSON.stringify(material.serialize(), (key, value) => {
            if (key === "uniqueId") return undefined;
            // Binary glTF imports receive distinct random data: UUID locators;
            // embedded base64 image bytes and every sampler field remain compared.
            if (
              key === "url" &&
              typeof value === "string" &&
              /^data:[^#]+#image\d+$/.test(value)
            )
              return value.replace(/^data:[^#]+/, "data:LOD");
            return typeof value === "string"
              ? value.replace(
                  /campus-hatchback-(near|medium|far)/g,
                  "campus-hatchback-LOD",
                )
              : value;
          }),
        ),
      );
    }
    assert.deepEqual(serialized[1], serialized[0]);
    assert.deepEqual(serialized[2], serialized[0]);
    red.dispose();
    a.release();
    assert.ok(!paintMesh(same).sourceMesh.isDisposed());
  } finally {
    red.dispose();
    same.dispose();
    original.dispose();
    a.release();
    b.release();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.materials.length, 0);
    scene.dispose();
    engine.dispose();
  }
});

test("source LOD PBR definitions, samplers and image bytes justify replacing the previous shared near paint clone", () => {
  const glbs = CAR_PACK_MANIFEST.lods.map((lod) =>
    parseGlb(readFileSync("public" + lod.url)),
  );
  const signature = (glb: ReturnType<typeof parseGlb>) => ({
    materials: glb.json.materials,
    textures: glb.json.textures,
    samplers: glb.json.samplers,
    images: glb.json.images.map((image: { bufferView: number }) => {
      const view = glb.json.bufferViews[image.bufferView];
      return createHash("sha256")
        .update(
          glb.bin.subarray(
            view.byteOffset ?? 0,
            (view.byteOffset ?? 0) + view.byteLength,
          ),
        )
        .digest("hex");
    }),
  });
  assert.deepEqual(signature(glbs[1]), signature(glbs[0]));
  assert.deepEqual(signature(glbs[2]), signature(glbs[0]));
});
