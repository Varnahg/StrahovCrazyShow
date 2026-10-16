import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import {
  configureStudentHairMaterial,
  StudentHairTintPlugin,
} from "../client/avatar-hair";
import calibration from "../client/data/student-hair-calibration.json";
import {
  acquireCarPack,
  CAR_PACK_MANIFEST,
  type CarRig,
} from "../client/car-pack";
import {
  CAR_PAINT_COLOR_BUFFER,
  CarPaintFallbackPlugin,
} from "../client/car-paint-instances";

type PaintDraw = {
  indices: number;
  colors: number[][];
  instances: number;
  defines: string;
  entity?: string;
};

/** Babylon scene/LOD/material/buffer work remains real. NullEngine replaces
 * device compilation and draw submission, so this is CPU dispatch evidence. */
class ProcessingEngine extends NullEngine {
  readonly shaderSources: { vertex: string; fragment: string }[] = [];
  readonly uploads = new WeakMap<object, number[]>();
  readonly draws: PaintDraw[] = [];
  source?: Mesh;
  fallbackColor = [1, 1, 1];
  fallbackEntity?: string;
  bound: Record<string, VertexBuffer> = {};
  defines = "";
  constructor(native = true) {
    super();
    this._isWebGPU = native;
    this._webGLVersion = 2;
    this._shaderPlatformName = native ? "WEBGPU" : "WEBGL2";
    this.getCaps().instancedArrays = true;
    this.getCaps().standardDerivatives = true;
    // WebGPU exposes float textures; exercise the same bone-texture path as
    // the production avatar, not NullEngine's WebGL1 uniform fallback.
    this.getCaps().textureFloat = true;
    // Model a sufficient uniform budget; NullEngine's default 16 vectors is
    // deliberately WebGL1-sized and cannot represent the native avatar path.
    this.getCaps().maxVertexUniformVectors = 1024;
  }
  override _getShaderProcessor(language: ShaderLanguage) {
    return this.isWebGPU
      ? new WebGPUShaderProcessorWGSL()
      : super._getShaderProcessor(language);
  }
  override _getShaderProcessingContext(language: ShaderLanguage) {
    return this.isWebGPU
      ? new WebGPUShaderProcessingContext(language)
      : super._getShaderProcessingContext(language);
  }
  override createShaderProgram(
    ...args: Parameters<NullEngine["createShaderProgram"]>
  ) {
    this.shaderSources.push({ vertex: args[1], fragment: args[2] });
    return super.createShaderProgram(...args);
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
    this.bound = { ...args[0], ...args[3] };
    this.defines = args[2].defines;
    super.bindBuffers(args[0], args[1], args[2]);
  }
  override unbindInstanceAttributes() {}
  override drawElementsType(
    ...args: Parameters<NullEngine["drawElementsType"]>
  ) {
    if (!this.source?.material?.metadata?.vehiclePaint) return;
    const instances = args[3] ?? 1;
    const buffer = this.bound[CAR_PAINT_COLOR_BUFFER]?.getBuffer();
    const values = buffer ? this.uploads.get(buffer) : undefined;
    const colors =
      args[3] && values
        ? Array.from({ length: instances }, (_, i) =>
            values.slice(i * 4, i * 4 + 4),
          )
        : [[...this.fallbackColor, 1]];
    this.draws.push({
      indices: args[2],
      instances,
      colors,
      defines: this.defines,
      entity: args[3] ? undefined : this.fallbackEntity,
    });
  }
}

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const arithmetic = (code: string) =>
  code
    .replace(/\bvec([234])f\b/g, "vec$1")
    .replace(/\btoLinearSpaceVec3\b/g, "toLinearSpace")
    .replace(/\b(?:let|var|float|vec[234])\s+(?=\w+\s*=)/g, "")
    .replace(/\s+/g, "");

test("native hair tint uses the local PBR albedo scope, exact gamma helper and unchanged alpha/calibration", async () => {
  for (const style of ["short02", "short04"] as const)
    for (const gamma of [false, true]) {
      const engine = new ProcessingEngine(),
        scene = new Scene(engine);
      new FreeCamera("camera", new Vector3(0, 1, -5), scene);
      const mesh = MeshBuilder.CreateBox("hair shader", {}, scene);
      const material = new PBRMaterial("hair", scene);
      const albedo = RawTexture.CreateRGBATexture(
        new Uint8Array([121, 73, 45, 160]),
        1,
        1,
        scene,
      );
      albedo.gammaSpace = gamma;
      albedo.hasAlpha = true;
      albedo.level = calibration.styles[style].luminanceScale;
      albedo.uOffset = 0.125;
      albedo.vOffset = 0.25;
      const normal =
        style === "short02"
          ? RawTexture.CreateRGBATexture(
              new Uint8Array([128, 128, 255, 255]),
              1,
              1,
              scene,
            )
          : undefined;
      configureStudentHairMaterial(material, style, { albedo, normal });
      material.albedoColor.set(0.3, 0.12, 0.04);
      mesh.material = material;
      try {
        const plugin = material.pluginManager!.getPlugin(
          "StrahovStudentHairTint",
        ) as StudentHairTintPlugin;
        const glsl = plugin.getCustomCode("fragment", ShaderLanguage.GLSL)!;
        const wgsl = plugin.getCustomCode("fragment", ShaderLanguage.WGSL)!;
        assert.equal(
          arithmetic(wgsl.CUSTOM_FRAGMENT_UPDATE_ALBEDO),
          arithmetic(glsl.CUSTOM_FRAGMENT_UPDATE_ALBEDO),
        );
        assert.equal(plugin.getCustomCode("vertex", ShaderLanguage.WGSL), null);
        assert.equal(
          plugin.getCustomCode("fragment", 9 as ShaderLanguage),
          null,
        );
        assert.equal(
          plugin.getCustomCode("fragment", ShaderLanguage.WGSL),
          wgsl,
          "immutable recipe reused",
        );
        await material.forceCompilationAsync(mesh);
        const source = engine.shaderSources[0].fragment;
        assert.equal(material.shaderLanguage, ShaderLanguage.WGSL);
        const begin = source.indexOf(
          "var studentHairSource = albedoTexture.rgb",
        );
        assert.ok(begin > source.indexOf("fn albedoOpacityBlock("));
        assert.ok(begin < source.indexOf("fn main("));
        assert.equal(
          source.includes(
            "studentHairSource = toLinearSpaceVec3(studentHairSource)",
          ),
          gamma,
        );
        assert.match(source, /\* albedoInfos\.y, 0\.45, 1\.55/);
        assert.match(source, /vAlbedoColor\.rgb \* studentHairShade/);
        assert.match(source, /alpha\*=albedoTexture\.a/);
        assert.match(source, /const ALPHATESTVALUE = 0\.42;/);
        assert.match(source, /if \(alpha<ALPHATESTVALUE\)\s*\{\s*discard;/);
        assert.doesNotMatch(
          wgsl.CUSTOM_FRAGMENT_UPDATE_ALBEDO,
          /textureSample|uniforms\./,
        );
        assert.equal(material.albedoTexture, albedo);
        assert.equal(material.bumpTexture, normal ?? null);
        assert.equal(albedo.level, calibration.styles[style].luminanceScale);
        assert.equal(albedo.uOffset, 0.125);
        assert.equal(albedo.vOffset, 0.25);
        assert.equal(material.alphaCutOff, 0.42);
        assert.equal(material.roughness, 0.76);
        assert.equal(material.twoSidedLighting, true);
        assert.equal(material.backFaceCulling, false);
        assert.equal(material.forceDepthWrite, true);
        assert.equal(material.metadata.originalAtlasAlpha, true);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }
});

test("all six native avatar presets retain independent skeletons, hair LODs and bounded material ownership", async () => {
  const engine = new ProcessingEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  scene.texturesEnabled = false;
  const camera = new FreeCamera("camera", new Vector3(0, 2, -8), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const pool = new AvatarPrimitivePool(scene);
  const errors: unknown[] = [];
  engine.onEffectErrorObservable.add((error) => errors.push(error));
  try {
    for (const hair of ["#211e1d", "#d4b77b"]) {
      const entries = Array.from({ length: 6 }, (_, preset) => {
        const config = {
          ...applyAvatarPreset(preset, DEFAULT_AVATAR),
          hair,
          glasses: true,
          beard: true,
        };
        const rig = createAvatarRig(scene, config, pool, `native:${preset}`);
        const lod = new AvatarLodController(scene, pool, rig, config);
        rig.root.position.x = (preset - 2.5) * 0.8;
        return { rig, lod, preset };
      });
      try {
        const skeletons = entries.map(
          ({ rig }) =>
            rig.root.getChildMeshes().find((mesh) => mesh.skeleton)?.skeleton,
        );
        assert.ok(skeletons.every(Boolean));
        assert.equal(new Set(skeletons).size, 6);
        assert.ok(
          skeletons.every((skeleton) => skeleton?.isUsingTextureForMatrices),
        );
        for (let i = 0; i < 4; i++) {
          scene.render();
          await turn();
        }
        assert.equal(errors.length, 0);
        assert.ok(
          scene.materials.every(
            (material) => material.shaderLanguage === ShaderLanguage.WGSL,
          ),
        );
        for (const { rig, lod, preset } of entries) {
          const strands = rig.head
            .getChildMeshes()
            .filter((mesh) => mesh.metadata?.avatarHair);
          assert.equal(strands.length, [0, 3].includes(preset) ? 2 : 0);
          for (const distance of [0, 20, 100, 0]) {
            lod.update({
              distance,
              quality: "low",
              position: { x: 0, y: 0, z: 0 },
              yaw: 0,
            });
            const visible = strands.filter((mesh) => mesh.isEnabled());
            assert.equal(
              visible.length,
              strands.length && distance !== 100 ? 1 : 0,
            );
            for (const mesh of visible)
              assert.equal(
                mesh.metadata.avatarBodyLod,
                distance === 20 ? "medium" : "near",
              );
          }
        }
      } finally {
        for (const { rig } of entries) rig.root.dispose();
        pool.pruneUnused();
      }
      assert.equal(scene.skeletons.length, 0);
      assert.equal(
        scene.materials.filter((material) => material.metadata?.hairTint)
          .length,
        0,
      );
      assert.equal(
        scene.textures.filter((texture) =>
          texture.name.includes("student-hair/"),
        ).length,
        3,
      );
    }
    assert.ok(
      engine.shaderSources.some(({ vertex }) => /boneSampler/.test(vertex)),
      "native skinned vertex variants were generated",
    );
  } finally {
    pool.dispose();
    assert.equal(
      scene.textures.filter((texture) => texture.name.includes("student-hair/"))
        .length,
      0,
    );
    scene.dispose();
    engine.dispose();
  }
});

function observePaint(scene: Scene, engine: ProcessingEngine) {
  for (const mesh of scene.meshes)
    if (mesh instanceof Mesh)
      mesh.onBeforeBindObservable.add(() => {
        engine.source = mesh;
      });
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

async function captureCars(native: boolean) {
  const engine = new ProcessingEngine(native),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  scene.texturesEnabled = false;
  const camera = new FreeCamera("camera", new Vector3(0, 2, -8), scene);
  camera.setTarget(new Vector3(0, 1, 50));
  camera.maxZ = 150;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const lease = await acquireCarPack(scene, {
    assetSources: Object.fromEntries(
      CAR_PACK_MANIFEST.lods.map((lod) => [
        lod.level,
        new Uint8Array(readFileSync("public" + lod.url)),
      ]),
    ),
  });
  lease.pack.setQuality("low");
  const rigs: CarRig[] = [];
  for (const z of [0, 18, 60])
    for (const [i, color] of ["#aa3322", "#dddddd"].entries()) {
      const rig = lease.pack.createRig(`paint:${z}:${i}`, color, false);
      rig.root.position.set(i ? 1.4 : -1.4, 0, z);
      rigs.push(rig);
    }
  for (const [i, color] of ["#2266cc", "#44aa55"].entries()) {
    const rig = lease.pack.createRig(`mirror:${i}`, color, false);
    rig.root.position.set(i ? 3.5 : -3.5, 0, 5);
    rig.root.scaling.x = -1;
    rigs.push(rig);
  }
  observePaint(scene, engine);
  const errors: unknown[] = [];
  engine.onEffectErrorObservable.add((error) => errors.push(error));
  try {
    for (let i = 0; i < 4; i++) {
      scene.render();
      await turn();
    }
    const frame = () => {
      engine.draws.length = 0;
      scene.render();
      return {
        draws: [...engine.draws],
        lods: rigs.map((rig) => {
          const mesh = rig.root
            .getChildMeshes()
            .find(
              (mesh) => mesh.material?.metadata?.vehiclePaint,
            ) as InstancedMesh;
          assert.equal(
            mesh.material!.shaderLanguage,
            native ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
          );
          return mesh.getLOD(camera)?.metadata?.lod;
        }),
      };
    };
    const frames = [frame()];
    for (const quality of ["medium", "high", "low"]) {
      rigs.at(-2)!.root.scaling.x *= -1;
      rigs.at(-1)!.root.scaling.x *= -1;
      lease.pack.setQuality(quality);
      scene.render();
      await turn();
      frames.push(frame());
    }
    assert.equal(errors.length, 0);
    return { frames, sources: [...engine.shaderSources] };
  } finally {
    for (const rig of rigs) rig.dispose();
    lease.release();
    assert.equal(scene.meshes.length, 0);
    assert.equal(scene.materials.length, 0);
    scene.dispose();
    engine.dispose();
  }
}

test("native car paint matches GLSL dispatch across all LODs, mirrored draws and quality changes", async () => {
  const baseline = await captureCars(false),
    native = await captureCars(true);
  const workload = (draws: PaintDraw[]) =>
    draws
      .flatMap((draw) =>
        draw.colors.map(
          (color) => `${draw.indices}:${color.map(Math.fround).join(",")}`,
        ),
      )
      .sort();
  native.frames.forEach((frame, i) => {
    assert.deepEqual(frame.lods, baseline.frames[i].lods);
    assert.deepEqual(workload(frame.draws), workload(baseline.frames[i].draws));
    assert.equal(frame.draws.length, baseline.frames[i].draws.length);
    for (const draw of frame.draws) {
      if (draw.entity) assert.doesNotMatch(draw.defines, /#define INSTANCES\b/);
      else assert.match(draw.defines, /#define INSTANCESCOLOR\b/);
    }
  });
  assert.deepEqual(
    new Set(native.frames[0].lods),
    new Set(["near", "medium", "far"]),
  );
  for (const [i, color] of ["#2266cc", "#44aa55"].entries()) {
    const draw = native.frames[0].draws.find(
      (draw) => draw.entity === `mirror:${i}`,
    );
    assert.ok(draw);
    assert.deepEqual(
      draw.colors[0].map(Math.fround),
      [...Color3.FromHexString(color).toLinearSpace().asArray(), 1].map(
        Math.fround,
      ),
    );
  }
  assert.ok(
    native.sources.some(({ vertex }) =>
      /vertexOutputs\.vColor\*=vertexInputs\.instanceColor/.test(vertex),
    ),
  );
  assert.ok(
    native.sources.some(({ fragment }) =>
      /surfaceAlbedo\*=fragmentInputs\.vColor\.rgb/.test(fragment),
    ),
  );
  assert.ok(
    native.sources.some(({ fragment }) =>
      /surfaceAlbedo \*= uniforms\.carPaintFallback/.test(fragment),
    ),
  );
});
