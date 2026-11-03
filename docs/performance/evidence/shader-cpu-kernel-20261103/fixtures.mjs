import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import '@babylonjs/core/ShadersWGSL/default.vertex.js';
import '@babylonjs/core/ShadersWGSL/default.fragment.js';
import '@babylonjs/core/ShadersWGSL/pbr.vertex.js';
import '@babylonjs/core/ShadersWGSL/pbr.fragment.js';
import '@babylonjs/core/ShadersWGSL/shadowMap.vertex.js';
import '@babylonjs/core/ShadersWGSL/shadowMap.fragment.js';

/** Actual pinned material/shadow define generation; only final Effect creation
 * is intercepted. NullEngine textures assert readiness without image/GPU IO.
 * This captures representative contracts, not the game's complete inventory. */
export async function captureCorpus() {
  const engine = new NullEngine();
  engine._isWebGPU = true;
  Object.defineProperty(engine, 'supportsUniformBuffers', { value: true });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera('CPU fixture', new Vector3(0, 2, -8), scene);
  camera.setTarget(Vector3.Zero()); scene.activeCamera = camera;
  const mesh = MeshBuilder.CreateBox('native material input', {}, scene);
  mesh.receiveShadows = true;
  const hemi = new HemisphericLight('ambient', Vector3.Up(), scene);
  const sun = new DirectionalLight('sun', new Vector3(-.5, -1, .2), scene);
  const points = [0, 1].map(i => new PointLight('point' + i, new Vector3(i + 1, 4, 2), scene));
  const spot = new SpotLight('torch', new Vector3(0, 3, 0), Vector3.Down(), .8, 2, scene);
  const shadow = new ShadowGenerator(512, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.addShadowCaster(mesh);
  const originalCreate = engine.createEffect;
  const oldForce = [StandardMaterial.ForceGLSL, PBRBaseMaterial.ForceGLSL];
  StandardMaterial.ForceGLSL = PBRBaseMaterial.ForceGLSL = false;
  const cases = []; let label;
  engine.createEffect = (base, options) => {
    assert.equal(options.shaderLanguage, 1, 'native WGSL must be selected');
    const name = typeof base === 'string' ? base : base.vertex;
    const store = ShaderStore.GetShadersStore(1);
    const vertex = typeof base === 'object' && base.vertexSource || store[name + 'VertexShader'];
    const fragment = typeof base === 'object' && base.fragmentSource || store[(typeof base === 'object' ? base.fragment : name) + 'PixelShader'];
    assert.equal(typeof vertex, 'string', 'registered vertex source: ' + name);
    assert.equal(typeof fragment, 'string', 'registered fragment source: ' + name);
    assert.equal(options.processFinalCode, undefined, 'fixture has no custom final callback');
    cases.push({ name: label, shader: name, vertex, fragment, defines: options.defines.split('\n'),
      indexParameters: { ...options.indexParameters }, attributes: [...options.attributes],
      uniforms: [...options.uniformsNames], samplers: [...options.samplers],
      shaderLanguage: options.shaderLanguage, processCodeAfterIncludes: options.processCodeAfterIncludes });
    return { isReady: () => true, getEngine: () => engine, dispose() {}, _wasPreviouslyReady: false,
      _wasPreviouslyUsingInstances: false, _bonesComputationForcedToCPU: false };
  };
  try {
    await shadow._initShaderSourceAsync(false);
    for (const kind of ['standard', 'pbr']) for (const alpha of [false, true]) {
      const material = kind === 'standard' ? new StandardMaterial(kind, scene) : new PBRMaterial(kind, scene);
      mesh.material = material; material.maxSimultaneousLights = 4;
      const texture = new Texture(null, scene);
      texture.isReady = texture.isReadyOrNotBlocking = () => true;
      texture.hasAlpha = alpha;
      if (kind === 'standard') { material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = false; }
      else { material.albedoTexture = texture; material.metallic = .2; material.roughness = .65;
        material.transparencyMode = alpha ? PBRMaterial.PBRMATERIAL_ALPHATEST : PBRMaterial.PBRMATERIAL_OPAQUE; }
      for (const count of [0, 1, 2]) for (const torch of [false, true]) {
        points.forEach((light, index) => light.setEnabled(index < count)); spot.setEnabled(torch);
        scene.incrementRenderId(); material.markDirty(true);
        label = `${kind}-${alpha ? 'alpha' : 'opaque'}-points${count}-torch${Number(torch)}`;
        const before = cases.length;
        assert.equal(material.isReadyForSubMesh(mesh, mesh.subMeshes[0], false), true);
        assert.equal(cases.length, before + 1, 'one actual Effect contract per fixture');
      }
      for (const bias of [false, true]) {
        shadow.normalBias = bias ? .02 : 0;
        label = `shadow-${kind}-${alpha ? 'alpha' : 'opaque'}-bias${Number(bias)}`;
        const before = cases.length;
        assert.equal(shadow.isReady(mesh.subMeshes[0], false, false), true);
        assert.equal(cases.length, before + 1, 'native shadow Effect contract');
      }
    }
    engine.createEffect = originalCreate;
    Object.defineProperty(cases, 'dispose', { value: () => { scene.dispose(); engine.dispose(); } });
    return cases;
  } catch (error) {
    scene.dispose(); engine.dispose(); throw error;
  } finally {
    engine.createEffect = originalCreate;
    [StandardMaterial.ForceGLSL, PBRBaseMaterial.ForceGLSL] = oldForce;
  }
}
