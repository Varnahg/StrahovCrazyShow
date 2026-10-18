import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';
import {WebGPUShaderProcessorWGSL} from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL';
import {WebGPUShaderProcessingContext} from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext';
export class NativeProcessingEngine extends NullEngine {
  readonly sources: { vertex: string; fragment: string }[] = [];
  constructor(native = true) {
    super();
    this._isWebGPU = native;
    this._webGLVersion = 2;
    this._shaderPlatformName = native ? "WEBGPU" : "WEBGL2";
    this.getCaps().standardDerivatives = true;
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
    this.sources.push({ vertex: args[1], fragment: args[2] });
    return super.createShaderProgram(...args);
  }
}
