import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/ShadersWGSL/pbr.vertex";
import "@babylonjs/core/ShadersWGSL/pbr.fragment";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import {
  Initialize,
  Process,
  Finalize,
} from "@babylonjs/core/Engines/Processors/shaderProcessor";
import type { _IProcessingOptions } from "@babylonjs/core/Engines/Processors/shaderProcessingOptions";
import { TreeWindPlugin } from "../client/tree-wind";
import { GrassWindPlugin } from "../client/grass-material";
import {
  PhotoGrassWind,
  createPhotoGrassWindState,
} from "../client/photo-grass-wind";
import { GRASS_FADE_SECONDS } from "../client/photo-grass-transition";

function fixture(language: ShaderLanguage) {
  const engine = new NullEngine();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU =
    language === ShaderLanguage.WGSL;
  const scene = new Scene(engine);
  const previous = PBRBaseMaterial.ForceGLSL;
  PBRBaseMaterial.ForceGLSL = false;
  const material = new PBRMaterial("native wind contract", scene);
  PBRBaseMaterial.ForceGLSL = previous;
  const mesh = MeshBuilder.CreateBox("wind owner", {}, scene);
  mesh.material = material;
  assert.equal(material.shaderLanguage, language);
  return {
    engine,
    scene,
    material,
    mesh,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}

function recordBuffer() {
  const calls: unknown[][] = [];
  const buffer = {
    updateFloat3: (...args: unknown[]) => calls.push(args),
    updateFloat4: (...args: unknown[]) => calls.push(args),
  } as unknown as UniformBuffer;
  return { buffer, calls };
}

test("both shader languages keep identical vegetation UBO layouts and live tree/grass values", () => {
  for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
    const f = fixture(language);
    try {
      const treeState = { time: 0, x: 2, z: -3 };
      const tree = new TreeWindPlugin(f.material, treeState);
      const treeWrites = recordBuffer();
      f.material.freeze();
      tree.hardBindForSubMesh(
        treeWrites.buffer,
        f.scene,
        f.engine,
        f.mesh.subMeshes[0],
      );
      treeState.time = 3;
      treeState.x = -4;
      tree.hardBindForSubMesh(
        treeWrites.buffer,
        f.scene,
        f.engine,
        f.mesh.subMeshes[0],
      );
      assert.deepEqual(treeWrites.calls, [
        ["cleanTreeWind", 0, 2, -3],
        ["cleanTreeWind", 3, -4, -3],
      ]);
      assert.deepEqual(
        tree.getUniforms(language).ubo,
        tree.getUniforms(ShaderLanguage.GLSL).ubo,
      );
      assert.equal(tree.registerForExtraEvents, true);
      if (language === ShaderLanguage.WGSL)
        assert.equal(tree.getUniforms(language).vertex, undefined);
    } finally {
      f.dispose();
    }
    const g = fixture(language);
    try {
      const state = {
        time: 1,
        windX: 2,
        windZ: 3,
        playerX: 4,
        playerY: 5,
        playerZ: 6,
        range: 7,
      };
      const grass = new GrassWindPlugin(g.material, state);
      const writes = recordBuffer();
      grass.bindForSubMesh(writes.buffer);
      state.time = 9;
      state.playerY = 11;
      grass.bindForSubMesh(writes.buffer);
      assert.deepEqual(writes.calls, [
        ["grassWind", 1, 2, 3],
        ["grassViewer", 4, 5, 6, 7],
        ["grassWind", 9, 2, 3],
        ["grassViewer", 4, 11, 6, 7],
      ]);
      assert.deepEqual(
        grass.getUniforms(language).ubo,
        grass.getUniforms(ShaderLanguage.GLSL).ubo,
      );
      if (language === ShaderLanguage.WGSL) {
        assert.equal(grass.getUniforms(language).vertex, undefined);
        assert.equal(grass.getUniforms(language).fragment, undefined);
      }
    } finally {
      g.dispose();
    }
  }
});

test("native photographic grass keeps per-rendering-mesh ownership, fallback and thin instance attributes", () => {
  const f = fixture(ShaderLanguage.WGSL);
  try {
    const fallback = createPhotoGrassWindState();
    const plugin = new PhotoGrassWind(f.material, fallback);
    const second = MeshBuilder.CreateBox("second owner", {}, f.scene);
    second.material = f.material;
    f.mesh.metadata = {
      photoGrassWind: {
        ...fallback,
        time: 2,
        windX: 3,
        windZ: -4,
        viewerX: 5,
        viewerY: 100,
        viewerZ: 6,
        focusX: 7,
        focusZ: 8,
        fadeStart: 9,
        fadeEnd: 10,
      },
    };
    second.metadata = {
      photoGrassWind: {
        ...fallback,
        time: 11,
        windX: -12,
        viewerX: 13,
        viewerZ: 14,
      },
    };
    const writes = recordBuffer();
    f.material.freeze();
    plugin.hardBindForSubMesh(
      writes.buffer,
      f.scene,
      f.engine,
      f.mesh.subMeshes[0],
    );
    plugin.hardBindForSubMesh(
      writes.buffer,
      f.scene,
      f.engine,
      second.subMeshes[0],
    );
    second.metadata = null;
    fallback.time = 17;
    plugin.hardBindForSubMesh(
      writes.buffer,
      f.scene,
      f.engine,
      second.subMeshes[0],
    );
    assert.deepEqual(writes.calls, [
      ["photoGrassWind", 2, 3, -4],
      ["photoGrassView", 5, 6, 9, 10],
      ["photoGrassFocus", 7, 8, GRASS_FADE_SECONDS],
      ["photoGrassShape", .06, .001, 0],
      ["photoGrassWind", 11, -12, 0],
      ["photoGrassView", 13, 14, 6, 9],
      ["photoGrassFocus", 0, 0, GRASS_FADE_SECONDS],
      ["photoGrassShape", .06, .001, 0],
      ["photoGrassWind", 17, 0, 0],
      ["photoGrassView", 0, 0, 6, 9],
      ["photoGrassFocus", 0, 0, GRASS_FADE_SECONDS],
      ["photoGrassShape", .06, .001, 0],
    ]);
    const attributes: string[] = [];
    plugin.getAttributes(attributes, f.scene, f.mesh);
    assert.deepEqual(attributes, []);
    f.mesh.thinInstanceSetBuffer(
      "matrix",
      new Float32Array(Matrix.Identity().asArray()),
      16,
      true,
    );
    plugin.getAttributes(attributes, f.scene, f.mesh);
    assert.deepEqual(attributes, ["photoGrassFade"]);
    assert.deepEqual(
      plugin.getUniforms(ShaderLanguage.WGSL).ubo,
      plugin.getUniforms(ShaderLanguage.GLSL).ubo,
    );
    assert.equal(plugin.getUniforms(ShaderLanguage.WGSL).vertex, undefined);
  } finally {
    f.dispose();
  }
});

/** Run the real plugin manager's UBO and shader injection hooks, then the real
 * native PBR WGSL source processor. No GLSL conversion or fake WGSL compiler. */
function processNativePbr(
  kind: "tree" | "grass" | "photo",
  thin: boolean,
  tangent: boolean,
) {
  const f = fixture(ShaderLanguage.WGSL);
  const ubo = new UniformBuffer(f.engine);
  try {
    const plugin =
      kind === "tree"
        ? new TreeWindPlugin(f.material, { time: 1, x: 2, z: 3 })
        : kind === "grass"
          ? new GrassWindPlugin(f.material, {
              time: 1,
              windX: 2,
              windZ: 3,
              playerX: 4,
              playerY: 5,
              playerZ: 6,
              range: 7,
            })
          : new PhotoGrassWind(f.material, createPhotoGrassWindState());
    if (thin)
      f.mesh.thinInstanceSetBuffer(
        "matrix",
        new Float32Array(Matrix.Identity().asArray()),
        16,
        true,
      );
    const callback = (
      f.material as unknown as {
        _callbackPluginEventGeneric(id: number, data: unknown): void;
      }
    )._callbackPluginEventGeneric;
    callback(8, { ubo });
    const event = {
      defines: {},
      fallbacks: {},
      fallbackRank: 0,
      attributes: [] as string[],
      uniforms: [] as string[],
      samplers: [] as string[],
      uniformBuffersNames: [] as string[],
      mesh: f.mesh,
      indexParameters: {
        maxSimultaneousLights: 0,
        maxSimultaneousMorphTargets: 0,
      },
      customCode: undefined as _IProcessingOptions["processCodeAfterIncludes"],
    };
    callback(128, event);
    assert.ok(event.customCode);
    const context = new WebGPUShaderProcessingContext(ShaderLanguage.WGSL);
    const options: _IProcessingOptions = {
      defines: [
        "#define NORMAL",
        "#define UV1",
        "#define METALLICWORKFLOW",
        "#define NUM_BONE_INFLUENCERS 0",
        ...(tangent ? ["#define TANGENT"] : []),
        ...(thin ? ["#define INSTANCES", "#define THIN_INSTANCES"] : []),
      ],
      indexParameters: event.indexParameters,
      isFragment: false,
      shouldUseHighPrecisionShader: true,
      supportsUniformBuffers: true,
      shadersRepository: "",
      includesShadersStore: ShaderStore.IncludesShadersStoreWGSL,
      processor: new WebGPUShaderProcessorWGSL(),
      processingContext: context,
      version: "100",
      platformName: "WEBGPU",
      isNDCHalfZRange: true,
      useReverseDepthBuffer: false,
      processCodeAfterIncludes: event.customCode,
    };
    let output: { vertexCode: string; fragmentCode: string } | undefined;
    Initialize(options);
    Process(ShaderStore.ShadersStoreWGSL.pbrVertexShader, options, (vertex) => {
      options.isFragment = true;
      Process(
        ShaderStore.ShadersStoreWGSL.pbrPixelShader,
        options,
        (fragment) => {
          output = Finalize(vertex, fragment, options);
        },
      );
    });
    assert.ok(output);
    const names = plugin
      .getUniforms(ShaderLanguage.WGSL)
      .ubo.map((entry) => entry.name);
    for (const name of names) {
      assert.equal(
        context.leftOverUniforms.filter((entry) => entry.name === name).length,
        1,
        `${name} has exactly one native UBO field`,
      );
      assert.ok(event.uniforms.includes(name));
    }
    assert.match(output.vertexCode, /@vertex/);
    assert.match(output.fragmentCode, /@fragment/);
    assert.doesNotMatch(
      output.vertexCode + output.fragmentCode,
      /uniform vec[234]|varying vec[234]|attribute vec[234]|gl_Position|gl_FragColor|\.[xyzw]{2,4}\s*\+=/,
    );
    if (kind === "tree") {
      assert.match(output.vertexCode, /normalUpdated\s*=\s*normalize/);
      assert.equal(
        output.vertexCode.includes("tangentUpdated = vec4f(normalize"),
        tangent,
      );
    } else {
      const varying =
        kind === "grass" ? "vCampusGrass" : "vPhotoGrassVisibility";
      assert.match(
        output.vertexCode,
        new RegExp(`vertexOutputs\\.${varying}\\s*=`),
      );
      assert.match(
        output.fragmentCode,
        new RegExp(`fragmentInputs\\.${varying}`),
      );
    }
    if (kind === "photo") {
      assert.equal(
        context.availableAttributes.photoGrassFade !== undefined,
        thin,
      );
      assert.equal(event.attributes.includes("photoGrassFade"), thin);
    }
  } finally {
    ubo.dispose();
    f.dispose();
  }
}

test("all native vegetation plugins traverse actual PBR WGSL processing with regular/thin instances and tangent branches", () => {
  for (const kind of ["tree", "grass", "photo"] as const)
    for (const thin of [false, true])
      for (const tangent of [false, true])
        processNativePbr(kind, thin, tangent);
  // This checks native generation/bind contracts, not WebGPU validation, image
  // parity or GPU timing. The complete game still needs real-driver acceptance.
});
