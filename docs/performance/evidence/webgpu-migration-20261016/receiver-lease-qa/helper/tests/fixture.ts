import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import { CarReceiverLeaseLight } from "../client/qa-receiver-lease";
import { StableLightState } from "../client/qa-stable-light-state";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";

// Same actual WGSL processor with NullEngine IO boundary as the accepted
// serialization fixture. No GPU device/driver/image is represented.
export class NativeCpuEngine extends NullEngine {
  programs = 0;
  constructor() { super(); this._isWebGPU = true; this._webGLVersion = 2; this._shaderPlatformName = "WEBGPU"; this.getCaps().standardDerivatives = true; this.getCaps().instancedArrays = true; }
  // NullEngine IO boundary only; no real instance GPU attributes exist here.
  unbindInstanceAttributes() {}
  override _getShaderProcessor(language: ShaderLanguage) { return this.isWebGPU ? new WebGPUShaderProcessorWGSL() : super._getShaderProcessor(language); }
  override _getShaderProcessingContext(language: ShaderLanguage) { return this.isWebGPU ? new WebGPUShaderProcessingContext(language) : super._getShaderProcessingContext(language); }
  override createShaderProgram(...args: Parameters<NullEngine["createShaderProgram"]>) { this.programs++; return super.createShaderProgram(...args); }
}
export function fixture(lease = true) {
  const engine = new NativeCpuEngine(), scene = new Scene(engine);
  scene.skipFrustumClipping = true;
  const camera = new FreeCamera("camera", new Vector3(0, 2, -10), scene); camera.setTarget(Vector3.Zero());
  const hemi = new HemisphericLight("sky", Vector3.Up(), scene);
  const args = ["car beam", new Vector3(0, 0, 0), new Vector3(1, 0, 0), .8, 2, scene] as const;
  const light = lease ? new CarReceiverLeaseLight(...args) : new SpotLight(...args);
  light.falloffType = Light.FALLOFF_STANDARD; light.range = 32; light.renderPriority = 10;
  light.shadowEnabled = false; light.metadata = { simulatedVehicleLight: true }; light.setEnabled(false);
  const policy = light instanceof CarReceiverLeaseLight ? light : undefined;
  policy?.configureStockVehicleLease({ kind: "vehicle", range: 32, movementReserveMetres: 8 });
  const stable = new StableLightState(scene);
  function box(name: string, x: number, pbr = false, size = 1) {
    const mesh = MeshBuilder.CreateBox(name, { size }, scene); mesh.position.x = x;
    mesh.metadata = { artStatic: true }; mesh.material = pbr ? new PBRMaterial(name, scene) : new StandardMaterial(name, scene);
    mesh.computeWorldMatrix(true); return mesh;
  }
  function gate() { if (policy) stable.markMeshesDirty(policy.prepareReceivers()); stable.update(); }
  async function render() {
    gate(); scene.render(); await new Promise<void>(resolve => setTimeout(resolve, 0));
    gate(); scene.render();
  }
  async function warm() { // Policy is intentionally bypassed for every original variant.
    for (const enabled of [false, true, false]) { light.setEnabled(enabled); await render(); await render(); }
  }
  function dispose() { stable.dispose(); scene.dispose(); engine.dispose(); }
  return { engine, scene, camera, hemi, light, policy, stable, box, gate, render, warm, dispose };
}
