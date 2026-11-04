import assert from 'node:assert/strict';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js';
import { WebGPUShaderProcessingContext } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js';
import { hash } from './stage.mjs';

export function runner(processing, cacheOptions) {
  const processor = new WebGPUShaderProcessorWGSL();
  assert.equal(processor.pureMode, false);
  const cache = cacheOptions ? processing.CreateShaderSyntaxCache(processor, cacheOptions) : undefined;
  processing._FunctionContainer.loadFile = () => { throw Error('No network in shader syntax CPU fixture'); };
  const engine = { isNDCHalfZRange: true, useReverseDepthBuffer: false, useExactSrgbConversions: false,
    _features: { needShaderCodeInlining: false }, getCaps: () => ({ drawBuffersExtension: true }) };
  return { cache, processor,
    run(fixture) {
      const context = new WebGPUShaderProcessingContext(1, false);
      if (fixture.attributeKinds) Object.assign(context.vertexBufferKindToNumberOfComponents, fixture.attributeKinds);
      const options = { processor, processingContext: context, defines: fixture.defines.slice(),
        indexParameters: { ...fixture.indexParameters }, isFragment: false, shouldUseHighPrecisionShader: true,
        supportsUniformBuffers: true, shadersRepository: ShaderStore.GetShadersRepository(1),
        includesShadersStore: fixture.includes ?? ShaderStore.GetIncludesShadersStore(1), version: '100', platformName: 'WEBGPU',
        isNDCHalfZRange: true, useReverseDepthBuffer: false, processCodeAfterIncludes: fixture.processCodeAfterIncludes };
      let vertexCode, fragmentCode;
      const at = performance.now();
      processing.Initialize(options);
      processing.Process(fixture.vertex, options, value => { vertexCode = value; }, engine);
      assert.equal(typeof vertexCode, 'string'); options.isFragment = true;
      processing.Process(fixture.fragment, options, value => { fragmentCode = value; }, engine);
      assert.equal(typeof fragmentCode, 'string');
      const result = processing.Finalize(vertexCode, fragmentCode, options), elapsedMs = performance.now() - at;
      return { elapsedMs, vertexCode: result.vertexCode, fragmentCode: result.fragmentCode, context: JSON.parse(JSON.stringify(context)) };
    },
    dispose() { cache?.dispose(); },
  };
}
export const identity = result => hash(JSON.stringify([result.vertexCode, result.fragmentCode, result.context]));
export function uniqueEffects(corpus) {
  return [...new Map(corpus.map(item => [item.shader + '@' + item.defines.join('\n'), item])).values()];
}
