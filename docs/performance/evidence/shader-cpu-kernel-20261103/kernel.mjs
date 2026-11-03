import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as native from '@babylonjs/core/Engines/Processors/shaderProcessor.js';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js';
import { WebGPUShaderProcessingContext } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js';

export const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
export const cacheRoot = join(root, '.cache/shader-cpu-kernel-20261103');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function ownedPath(path) {
  const full = resolve(path);
  assert.ok(full.startsWith(cacheRoot + '/') || full.startsWith(cacheRoot + '\\'), 'output must be inside the reserved cache');
  return full;
}
const replaceOnce = (text, from, to) => {
  assert.equal(text.split(from).length, 2, 'pinned source anchor must occur exactly once: ' + from.slice(0, 100));
  return text.replace(from, to);
};
export async function instrumentedModule(directory) {
  directory = ownedPath(directory);
  await mkdir(directory, { recursive: true });
  const originalUrl = import.meta.resolve('@babylonjs/core/Engines/Processors/shaderProcessor.js');
  const original = await readFile(new URL(originalUrl), 'utf8');
  let code = original.replace(/from "(\.[^"]+)"/g, (_match, specifier) => 'from ' + JSON.stringify(new URL(specifier, originalUrl).href));
  code = replaceOnce(code, 'function BuildExpression(line, start) {', 'function BuildExpressionOriginal(line, start) {');
  code = replaceOnce(code, 'export function ProcessIncludes(sourceCode, options, callback) {', 'function ProcessIncludesOriginal(sourceCode, options, callback) {');
  code = replaceOnce(code, '    const rootNode = new ShaderCodeNode();\n    const cursor = new ShaderCodeCursor();',
    '    const parseStart = performance.now();\n    const rootNode = new ShaderCodeNode();\n    const cursor = new ShaderCodeCursor();');
  code = replaceOnce(code, '    cursor.lines = sourceCode.split("\\n");',
    '    const cursorStart = performance.now();\n    cursor.lines = sourceCode.split("\\n");\n    __kernelTotals.cursorMs += performance.now() - cursorStart;');
  code = replaceOnce(code, '    MoveCursor(cursor, rootNode, preProcessorsFromCode);',
    '    const moveStart = performance.now();\n    MoveCursor(cursor, rootNode, preProcessorsFromCode);\n    __kernelTotals.moveMs += performance.now() - moveStart;\n    __kernelTotals.parseMs += performance.now() - parseStart;\n    __kernelTotals.evaluations++;');
  code = replaceOnce(code, '    return rootNode.process(preprocessors, options, preProcessorsFromCode);',
    '    const walkStart = performance.now();\n    try { return rootNode.process(preprocessors, options, preProcessorsFromCode); }\n    finally { __kernelTotals.walkMs += performance.now() - walkStart; }');
  code += `
export const __kernelTotals = { includeMs: 0, includeCalls: 0, parseMs: 0, cursorMs: 0, moveMs: 0, expressionMs: 0, expressions: 0, walkMs: 0, evaluations: 0 };
let includeDepth = 0;
export function __kernelReset() { for (const key of Object.keys(__kernelTotals)) __kernelTotals[key] = 0; }
function BuildExpression(line, start) {
  const at = performance.now(); __kernelTotals.expressions++;
  try { return BuildExpressionOriginal(line, start); }
  finally { __kernelTotals.expressionMs += performance.now() - at; }
}
export function ProcessIncludes(sourceCode, options, callback) {
  const outer = includeDepth++ === 0, at = performance.now(); let callbackMs = 0;
  try { return ProcessIncludesOriginal(sourceCode, options, (...args) => {
    const before = performance.now();
    try { return callback(...args); }
    finally { callbackMs += performance.now() - before; }
  }); } finally {
    includeDepth--;
    if (outer) { __kernelTotals.includeCalls++; __kernelTotals.includeMs += performance.now() - at - callbackMs; }
  }
}
`;
  const path = join(directory, 'shaderProcessor.instrumented.mjs');
  await writeFile(path, code, { flag: 'wx' });
  return { module: await import(pathToFileURL(path).href), provenance: {
    original: fileURLToPath(originalUrl), originalSha256: sha256(original), instrumented: path,
    instrumentedSha256: sha256(code), transform: 'anchored additive timing only; relative imports resolve to the same installed modules' } };
}

const callbackNames = ['initializeShaders', 'preProcessShaderCode', 'varyingCheck', 'attributeProcessor',
  'varyingProcessor', 'uniformProcessor', 'textureProcessor', 'postProcessor', 'finalizeShaders'];
export function createKernel(processing = native, timed = false) {
  const processor = new WebGPUShaderProcessorWGSL();
  assert.equal(processor.pureMode, false, 'actual native engine default, not minimal pure fixture');
  const callbackMs = Object.fromEntries(callbackNames.map(name => [name, 0]));
  const callbackCalls = Object.fromEntries(callbackNames.map(name => [name, 0]));
  if (timed) for (const name of callbackNames) {
    const original = processor[name];
    if (typeof original !== 'function') continue;
    processor[name] = function (...args) {
      const at = performance.now(); callbackCalls[name]++;
      try { return original.apply(this, args); }
      finally { callbackMs[name] += performance.now() - at; }
    };
  }
  processing._FunctionContainer.loadFile = () => { throw Error('Corpus includes must already be registered; network fallback prohibited'); };
  const engine = { isNDCHalfZRange: true, useReverseDepthBuffer: false, useExactSrgbConversions: false,
    _features: { needShaderCodeInlining: false }, getCaps: () => ({ drawBuffersExtension: true }) };
  return {
    run(fixture) {
      const context = new WebGPUShaderProcessingContext(1, false);
      if (fixture.attributeKinds) Object.assign(context.vertexBufferKindToNumberOfComponents, fixture.attributeKinds);
      const options = { processor, processingContext: context, defines: fixture.defines.slice(),
        indexParameters: { ...fixture.indexParameters }, isFragment: false, shouldUseHighPrecisionShader: true,
        supportsUniformBuffers: true, shadersRepository: ShaderStore.GetShadersRepository(1),
        includesShadersStore: ShaderStore.GetIncludesShadersStore(1), version: '100', platformName: 'WEBGPU',
        isNDCHalfZRange: true, useReverseDepthBuffer: false, processCodeAfterIncludes: fixture.processCodeAfterIncludes };
      processing.__kernelReset?.();
      if (timed) for (const name of callbackNames) { callbackMs[name] = 0; callbackCalls[name] = 0; }
      let vertexCode, fragmentCode, result;
      const at = performance.now();
      processing.Initialize(options);
      processing.Process(fixture.vertex, options, value => { vertexCode = value; }, engine);
      assert.equal(typeof vertexCode, 'string', 'vertex processing must remain synchronous');
      options.isFragment = true;
      processing.Process(fixture.fragment, options, value => { fragmentCode = value; }, engine);
      assert.equal(typeof fragmentCode, 'string', 'fragment processing must remain synchronous');
      result = processing.Finalize(vertexCode, fragmentCode, options);
      const elapsedMs = performance.now() - at;
      return { elapsedMs, vertexCode: result.vertexCode, fragmentCode: result.fragmentCode,
        context: JSON.parse(JSON.stringify(context)),
        timings: timed ? { ...processing.__kernelTotals, callbackMs: { ...callbackMs }, callbackCalls: { ...callbackCalls } } : null };
    },
  };
}
export const outputIdentity = result => sha256(JSON.stringify([result.vertexCode, result.fragmentCode, result.context]));
