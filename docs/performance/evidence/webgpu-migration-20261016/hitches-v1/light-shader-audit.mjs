import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const sources = [];
const read = path => { const full = 'node_modules/@babylonjs/core/' + path; sources.push({ path, sha256: sha(full) }); return readFileSync(full, 'utf8'); };
const checks = [];
for (const language of ['Shaders', 'ShadersWGSL']) {
  const standard = read(`${language}/ShadersInclude/lightsFragmentFunctions.js`);
  const pbr = read(`${language}/ShadersInclude/pbrDirectLightingFalloffFunctions.js`);
  const light = read(`${language}/ShadersInclude/lightFragment.js`);
  const direct = read(`${language}/ShadersInclude/pbrDirectLightingFunctions.js`);
  assert.ok(standard.includes('max(0.,1.0-length(direction)/range)'));
  assert.ok(pbr.includes('return max(0.,1.0-length(lightOffset)/range);'));
  assert.ok(pbr.includes('return 1.0/maxEps(lightDistanceSquared);'));
  assert.ok(pbr.includes('saturate(1.0-factor*factor)'));
  assert.ok(light.includes('#elif defined(LIGHT_FALLOFF_STANDARD{X})'));
  assert.ok(light.includes('computeDistanceLightFalloff_Standard(preInfo.lightOffset,light{X}.vLightFalloff.x)'));
  assert.ok(direct.includes('info.attenuation*info.NdotL*lightColor'));
  assert.ok(light.includes('#elif defined(LIGHTMAP) && defined(LIGHTMAPEXCLUDED{X})'));
  assert.ok(light.includes('diffuseBase+=lightmapColor.rgb*shadow;'));
  checks.push({ language, ordinaryStandardPointSpotFiniteRangeClamped: true,
    explicitPbrStandardOverridesMaterialFallback: true, pbrPhysicalFallbackHasNoFiniteCutoff: true,
    gltfFiniteRangeClamped: true, specialLightmapShadowOnlyCustomBranchesRequireSeparateProof: true });
}
const helper = read('Materials/materialHelper.functions.js');
assert.ok(helper.includes('case LightConstants.FALLOFF_STANDARD:'));
assert.ok(helper.includes('defines["LIGHT_FALLOFF_STANDARD" + lightIndex] = true;'));
const report = JSON.parse(readFileSync('report.json', 'utf8'));
assert.ok(report.scenarios.every(s => s.rows.every(row => row.defines.LIGHT_FALLOFF_STANDARD1 === true)));
const summary = report.scenarios.map(s => ({ light: s.light, far: s.far,
  byMaterial: ['PBR', 'Standard'].map(kind => {
    const rows = s.rows.filter(row => row.kind === kind && row.far);
    return { kind, rows: rows.length, dirty: rows.filter(r => r.dirtyAfterEnable).length,
      definesChanged: rows.filter(r => r.definesChanged).length, effectsChanged: rows.filter(r => r.effectChanged).length,
      immediateReady: rows.filter(r => r.immediateReady).length, settledReady: rows.filter(r => r.ready).length };
  }) }));
const numericalExamples = [12, 24].map(range => {
  const distance = range * 2;
  return { range, distance, standard: Math.max(0, 1 - distance / range),
    gltfAttenuation: Math.max(0, 1 - (distance * distance / (range * range)) ** 2) ** 2,
    physical: 1 / (distance * distance) };
});
writeFileSync('shader-audit.json', JSON.stringify({ atUTC: new Date().toISOString(), checks, sources, summary,
  numericalExamples, scope: 'Source/define inspection and CPU evaluation of explicit formulas; not shader execution or image equivalence. Production special/custom/frozen/truncated and deformed/instanced bounds remain conditional.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ checksPassed: checks.length, summary, numericalExamples }));
