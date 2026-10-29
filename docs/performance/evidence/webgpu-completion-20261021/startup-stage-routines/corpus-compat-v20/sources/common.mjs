import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import ts from 'typescript';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const STARTUP_ROUTINE_TARGETS = Object.freeze(['first-medium-vehicle-0','first-low-day-1-on','first-high-day-1-on']);
const stageImport = 'virtual:webgpu-completion-startup-routines';
export function transformStartupSource(source,kind,target=null) {
  if(target===null)return source;
  if(!STARTUP_ROUTINE_TARGETS.includes(target)||!['game','light'].includes(kind)||source.includes(stageImport))throw Error('Startup transform target/drift');
  let text=source.replaceAll('\r\n','\n');
  const ast=ts.createSourceFile(kind+'.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  if(ast.parseDiagnostics.length)throw Error('Startup source parse');
  const unique=(a,b)=>{if(text.split(a).length!==2)throw Error('Startup exact marker: '+a.slice(0,45));text=text.replace(a,b);};
  if(kind==='game') {
    const klass=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Game');
    const method=klass?.members.find(n=>n.name?.getText(ast)==='prepareLightingVariants'),calls=[];
    const visit=n=>{if(ts.isCallExpression(n)&&n.expression.getText(ast)==='prepareLightVariants')calls.push(n);ts.forEachChild(n,visit);};
    if(method)visit(method);
    if(calls.length!==1||calls[0].arguments.length!==1||!ts.isObjectLiteralExpression(calls[0].arguments[0]))throw Error('Startup options AST drift');
    const options=calls[0].arguments[0],start=options.getStart(ast),end=options.end;
    text=text.slice(0,start)+'registerStartupOptions(this, '+text.slice(start,end)+')'+text.slice(end);
    text='import { registerStartupOptions } from "'+stageImport+'";\n'+text;
  } else {
    const fn=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='prepareLightVariants');
    if(fn.length!==1||fn[0].parameters.length!==1||fn[0].parameters[0].name.getText(ast)!=='options')throw Error('Startup function AST drift');
    unique('  const started = options.now();','  const started = options.now();\n  startupPassStarted(options, started);');
    unique('      stageStarted = options.now();','      stageStarted = options.now();\n      startupStageStarted(options, index, stages[index], stageStarted);');
    unique('        results.push({','        startupStageSaved(options, index, at, done);\n        results.push({');
    unique('      resolve({','      startupPassFinished(options, at, settledStatus);\n      resolve({');
    unique(`      const before = options.now();
      try {
        return callback();
      } finally {
        const elapsed = Math.max(0, options.now() - before);
        sample.totalMs += elapsed;
        sample.maxMs = Math.max(sample.maxMs, elapsed);
      }`, `      const before = options.now();
      const qaRender = sample === cpu.render ? startupRenderBegin(options, before) : null;
      let qaReturned = false;
      try {
        const result = callback();
        qaReturned = true;
        return result;
      } finally {
        const qaAfter = options.now();
        const elapsed = Math.max(0, qaAfter - before);
        sample.totalMs += elapsed;
        sample.maxMs = Math.max(sample.maxMs, elapsed);
        if (qaRender) startupRenderEnd(qaRender, qaAfter, qaReturned);
      }`);
    text='import { startupPassStarted, startupStageStarted, startupStageSaved, startupPassFinished, startupRenderBegin, startupRenderEnd } from "'+stageImport+'";\n'+text;
  }
  if(ts.createSourceFile(kind+'.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS).parseDiagnostics.length)throw Error('Transformed startup source parse');
  return text;
}
export const START_MARKER = '        await g.start();';
export const UI_IMPORT = 'import { observeStartup } from "virtual:webgpu-completion-qa";\n';
export function transformUI(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  if (normalized.includes('virtual:webgpu-completion-qa') || normalized.split(START_MARKER).length !== 2)
    throw new Error('Expected exactly one original Game.start injection point');
  return UI_IMPORT + normalized.replace(START_MARKER,
    '        await observeStartup(g, startupCanvas, () => g.start());');
}
export function transformLoading(source, variant = 'original') {
  if (!['original', 'translucent'].includes(variant)) throw new Error('Unknown loading variant');
  const blocks = [...source.matchAll(/(^|[\r\n])\.loading \{[^}]*\}/g)];
  if (blocks.length !== 1) throw new Error('Expected exactly one loading CSS block');
  const block = blocks[0][0], declaration = '  background: #eff3e6;';
  if (block.split(declaration).length !== 2) throw new Error('Loading background drift');
  if (variant === 'original') return source;
  const index = blocks[0].index + block.indexOf(declaration);
  return source.slice(0, index) + '  background: rgba(239,243,230,.96);' + source.slice(index + declaration.length);
}
export function inside(directory, path) {
  const root = resolve(directory), full = resolve(path), suffix = relative(root, full);
  if (!suffix || suffix.startsWith('..') || isAbsolute(suffix)) throw new Error('Expected strict child of owned directory');
  return full;
}
export async function verifySnapshot(directory) {
  const manifest = JSON.parse(await readFile(join(directory, 'source-manifest.json'), 'utf8'));
  if (sha256(JSON.stringify(manifest.files)) !== manifest.snapshotId) throw new Error('Snapshot manifest identity mismatch');
  for (const [file, entry] of Object.entries(manifest.files)) {
    const expected = typeof entry === 'string' ? entry : entry.sha256;
    if (sha256(await readFile(inside(directory, resolve(directory, file)))) !== expected)
      throw new Error('Frozen source differs: ' + file);
  }
  return manifest;
}
export async function directoryHashes(directory) {
  const files = {};
  async function walk(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), key + '/');
      else if (entry.isFile()) files[key] = sha256(await readFile(join(path, entry.name)));
      else throw new Error('Unexpected link in owned build: ' + key);
    }
  }
  await walk(directory);
  return files;
}
export const sourceFiles = ['common.mjs', 'startup-observer.mjs', 'attempt-queue.mjs', 'receipt.mjs', 'harness.mjs', 'qa-overlay.mjs',
  'transit-clock.mjs', 'browser-clock.mjs', 'server-bootstrap.mjs', 'weather-fixture.mjs', 'startup-latency.mjs',
  'shader-attribution.mjs', 'shader-lifetime.mjs', 'routine-cost-core.mjs', 'routine-cost.mjs', 'routine-cost.test.mjs', 'buffer-lifecycle-core.mjs', 'buffer-lifecycle.mjs', 'buffer-lifecycle.test.mjs', 'lifecycle-controls.mjs', 'lifecycle-controls.test.mjs', 'helper.test.mjs', 'clock.test.mjs', 'weather-latency.test.mjs', 'shader-attribution.test.mjs', 'shader-lifetime.test.mjs', 'shader-window.test.mjs', 'depth-inputs.test.mjs', 'preparation-summary.test.mjs', 'entry-render-cost.mjs', 'entry-render-cost.test.mjs', 'entry-routine-cost.mjs', 'entry-routine-cost.test.mjs', 'pipeline-input-window.mjs', 'pipeline-input-window.test.mjs', 'startup-stage-routines.mjs', 'startup-stage-routines.test.mjs', 'README.md'];
export function parseBuildOptions(args) {
  const value = { loading: 'original', clockFile: undefined, weatherFile: undefined, startupLatency: false, shaderAttribution: false, routineCost: false, bufferLifecycle:false, lifecycleControls: false, startupRoutines: null };
  let loadingSeen = false;
  const assigned = new Set();
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if(token==='--startup-routines'){if(assigned.has(token))throw Error('Duplicate startup target');assigned.add(token);const target=args[++index];if(!STARTUP_ROUTINE_TARGETS.includes(target))throw Error('Unknown/missing startup target');value.startupRoutines=target;continue;}
    if (['original', 'translucent'].includes(token) && !loadingSeen && index === 0) {
      value.loading = token; loadingSeen = true; continue;
    }
    const diagnosticKeys = { '--startup-latency': 'startupLatency', '--shader-attribution': 'shaderAttribution', '--routine-cost': 'routineCost', '--buffer-lifecycle': 'bufferLifecycle', '--lifecycle-controls': 'lifecycleControls' };
    if (Object.hasOwn(diagnosticKeys, token)) {
      if (assigned.has(token)) throw new Error('Duplicate diagnostic flag');
      assigned.add(token); value[diagnosticKeys[token]] = true; continue;
    }
    if (token === '--weather' || token === '--clock') {
      const key = token === '--weather' ? 'weatherFile' : 'clockFile', path = args[++index];
      if (assigned.has(token) || value[key] !== undefined || !path || path.startsWith('--')) throw new Error('Duplicate/missing explicit path: ' + token);
      assigned.add(token); value[key] = path; continue;
    }
    // Retain the original positional clock argument after loading. New fixture
    // flags never consume this position or reinterpret it as a weather path.
    if (loadingSeen && value.clockFile === undefined && typeof token === 'string' && !token.startsWith('--') && isAbsolute(token)) {
      value.clockFile = token; continue;
    }
    throw new Error('Unknown/ambiguous build option: ' + token);
  }
  return Object.freeze(value);
}
export function previewPort(value = '4211') {
  if (typeof value !== 'string' || !/^[1-9]\d{3,4}$/.test(value) || Number(value) < 1024 || Number(value) > 65535 || Number(value) === 2596)
    throw new Error('Expected explicit preview port1024..65535 distinct from API2596');
  return Number(value);
}
export function backendPort(value = '2596') {
  if (typeof value !== 'string' || !/^[1-9]\d{3,4}$/.test(value) || Number(value) < 1024 || Number(value) > 65535)
    throw new Error('Expected explicit API port1024..65535');
  return Number(value);
}
export async function helperIdentity(directory) {
  const files = {};
  for (const file of sourceFiles) files[file] = sha256(await readFile(join(directory, file)));
  return { sha256: sha256(JSON.stringify(files)), files };
}
const buildKeys = ['sourceSnapshotId', 'helperSha256', 'label', 'loading', 'transforms', 'clock', 'weather', 'startupLatency', 'shaderAttribution', 'routineCost', 'bufferLifecycle', 'lifecycleControls', 'dependencies'];
export function canonicalJSON(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
  throw new Error('Unsupported canonical build input');
}
export function canonicalBuildInput(value) {
  if (!value || buildKeys.some(key => !Object.hasOwn(value, key))) throw new Error('Missing explicit canonical build input');
  const startup=value.transforms?.startupRoutines;
  if(startup!==undefined&&(!startup||Object.getPrototypeOf(startup)!==Object.prototype||!Object.hasOwn(startup,'target')||(startup.target!==null&&!STARTUP_ROUTINE_TARGETS.includes(startup.target))))throw Error('Invalid canonical startup target');
  for (const key of ['sourceSnapshotId', 'helperSha256', 'label'])
    if (typeof value[key] !== 'string' || !value[key]) throw new Error('Invalid canonical build identity field');
  if (!['original', 'translucent'].includes(value.loading) || typeof value.startupLatency !== 'boolean' || typeof value.shaderAttribution !== 'boolean' || typeof value.routineCost !== 'boolean' || typeof value.bufferLifecycle!=='boolean' || typeof value.lifecycleControls !== 'boolean' ||
      !value.transforms || Object.getPrototypeOf(value.transforms) !== Object.prototype ||
      !value.dependencies || Object.getPrototypeOf(value.dependencies) !== Object.prototype)
    throw new Error('Invalid canonical build mode/transforms');
  for (const key of ['clock', 'weather']) if (value[key] !== null && (!value[key] || Object.getPrototypeOf(value[key]) !== Object.prototype))
    throw new Error('Expected explicit object/null build input: ' + key);
  return canonicalJSON(Object.fromEntries(buildKeys.map(key => [key, value[key]])));
}
export const buildDigest = value => sha256(canonicalBuildInput(value));
export function browserBuildIdentity(value) {
  const buildId = buildDigest(value);
  return { label: value.label, sourceSnapshotId: value.sourceSnapshotId, helperSha256: value.helperSha256,
    loading: value.loading, clock: value.clock, weather: value.weather, startupLatency: value.startupLatency, shaderAttribution: value.shaderAttribution, routineCost: value.routineCost,bufferLifecycle:value.bufferLifecycle, lifecycleControls: value.lifecycleControls,
    dependencies: value.dependencies, startupRoutines: value.transforms.startupRoutines?.target ?? null, buildId };
}
export function resolveBuildOverlay(template, value) {
  const marker = '__WEBGPU_COMPLETION_IDENTITY__';
  if (template.split(marker).length !== 2) throw new Error('Expected exactly one browser build identity marker');
  return template.replace(marker, JSON.stringify(browserBuildIdentity(value)));
}
