import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const maximum = values => { const valid = values.map(number).filter(x => x !== null); return valid.length ? Math.max(...valid) : null; };
const minimum = values => { const valid = values.map(number).filter(x => x !== null); return valid.length ? Math.min(...valid) : null; };
const rows = provider => ['ok', 'partial'].includes(provider?.status) && Array.isArray(provider.rows) ? provider.rows : [];
const countStatus = (records, name) => records.reduce((out, record) => { const status = record.providers?.[name]?.status ?? 'missing'; out[status] = (out[status] ?? 0) + 1; return out; }, {});

/** Celý engine není součet současně pracujících GPU enginů. */
export function summarizeSystem(records) {
  const samples = records.filter(r => r.recordType === 'sample');
  const processes = new Map(), devices = new Map();
  const timeline = samples.map((sample, index) => {
    const at = utc(sample.utc);
    if (at === null) throw new Error(`Neplatný UTC vzorku ${index}`);
    const identities = new Map();
    for (const p of sample.processes ?? []) {
      if (!Number.isSafeInteger(p.pid) || p.pid < 0) continue;
      // Chybějící creationTime nesmí spojit dvě různá použití stejného PID.
      const key = `${p.pid}:${utc(p.startUtc) ?? `unknown-at-${index}`}`;
      const item = processes.get(key) ?? { key, pid: p.pid, startUtc: p.startUtc ?? null, name: p.name ?? null, browserRole: p.browserRole ?? null, samples: 0, cpuOneCorePeakPercent: null, cpuSystemPeakPercent: null, gpuEnginePeakPercent: null, gpuEngines: {}, memoryByAdapter: {} };
      item.samples++;
      const user = number(p.cpuUserOneCorePercent), kernel = number(p.cpuKernelOneCorePercent);
      item.cpuOneCorePeakPercent = maximum([item.cpuOneCorePeakPercent, user !== null && kernel !== null ? user + kernel : null]);
      item.cpuSystemPeakPercent = maximum([item.cpuSystemPeakPercent, p.cpuSystemNormalizedPercent]);
      processes.set(key, item); identities.set(p.pid, item);
    }
    const engineRows = rows(sample.providers?.gpuEngine);
    for (const e of engineRows) {
      const p = identities.get(e.pid); if (!p) continue;
      const key = `${e.luid ?? 'unknown'}/${e.physicalAdapter ?? '?'}/${e.engine ?? '?'}/${e.engineType ?? '?'}`;
      p.gpuEngines[key] = maximum([p.gpuEngines[key], e.utilizationPercent]);
      p.gpuEnginePeakPercent = maximum([p.gpuEnginePeakPercent, e.utilizationPercent]);
    }
    for (const mem of rows(sample.providers?.gpuProcessMemory)) {
      const p = identities.get(mem.pid); if (!p) continue;
      const key = `${mem.luid ?? 'unknown'}/${mem.physicalAdapter ?? '?'}`;
      const old = p.memoryByAdapter[key] ?? {};
      p.memoryByAdapter[key] = { dedicatedPeakBytes: maximum([old.dedicatedPeakBytes, mem.dedicatedBytes]), sharedPeakBytes: maximum([old.sharedPeakBytes, mem.sharedBytes]), committedPeakBytes: maximum([old.committedPeakBytes, mem.committedBytes]) };
    }
    const gpus = rows(sample.providers?.nvidia).map(g => {
      const key = g.uuid ?? `index-${g.index}`;
      const d = devices.get(key) ?? { id: key, name: g.name ?? null, samples: 0, utilPeakPercent: null, memoryControllerPeakPercent: null, memoryUsedPeakMiB: null, memoryTotalMiB: null, memoryUsedFirstMiB: null, memoryUsedLastMiB: null, tempPeakC: null, graphicsMinMHz: null, graphicsMaxMHz: null, powerPeakW: null };
      d.samples++; d.utilPeakPercent = maximum([d.utilPeakPercent, g.utilGpuPercent]); d.memoryControllerPeakPercent = maximum([d.memoryControllerPeakPercent, g.utilMemoryPercent]);
      d.memoryUsedPeakMiB = maximum([d.memoryUsedPeakMiB, g.memoryUsedMiB]); d.memoryTotalMiB = maximum([d.memoryTotalMiB, g.memoryTotalMiB]);
      if (number(g.memoryUsedMiB) !== null) { d.memoryUsedFirstMiB ??= g.memoryUsedMiB; d.memoryUsedLastMiB = g.memoryUsedMiB; }
      d.tempPeakC = maximum([d.tempPeakC, g.tempC]); d.graphicsMinMHz = minimum([d.graphicsMinMHz, g.graphicsMHz]); d.graphicsMaxMHz = maximum([d.graphicsMaxMHz, g.graphicsMHz]); d.powerPeakW = maximum([d.powerPeakW, g.powerW]); devices.set(key, d);
      const provider=sample.providers.nvidia, queryFrom=utc(provider.startedUtc), queryTo=utc(provider.endedUtc), driverAt=utc(g.driverSampleUtc), receivedAt=utc(g.receivedUtc), anchor=driverAt??receivedAt;
      return { id: key, fromUTCms:anchor, toUTCms:anchor, timeBasis:driverAt!==null?'driver-timestamp':receivedAt!==null?'original-row-received-utc':'unknown', readFromUTCms:queryFrom,readToUTCms:queryTo,driverTimestampRaw:g.driverTimestampRaw??null, receivedUtc:g.receivedUtc??null, driverSampleUtc:g.driverSampleUtc??null, utilizationPercent: number(g.utilGpuPercent), memoryControllerPercent: number(g.utilMemoryPercent), usedMiB: number(g.memoryUsedMiB), totalMiB: number(g.memoryTotalMiB), tempC: number(g.tempC), graphicsMHz: number(g.graphicsMHz),memoryMHz:number(g.memoryMHz),powerW:number(g.powerW),throttleRaw:g.throttleRaw??null,throttleReasons:{idle:g.gpuIdleRaw??null,powerCap:g.swPowerCapRaw??null,softwareThermal:g.swThermalRaw??null,hardwareThermal:g.hwThermalRaw??null,powerBrake:g.hwPowerBrakeRaw??null} };
    });
    const brackets = Object.values(sample.providers ?? {}).map(p => [utc(p.startedUtc), utc(p.endedUtc)]).filter(([a,b]) => a !== null && b !== null && b >= a);
    return { index, seq: sample.seq, phase:sample.phase??'unknown',utc: sample.utc, fromUTCms: brackets.length ? Math.min(...brackets.map(x=>x[0])) : at, toUTCms: brackets.length ? Math.max(...brackets.map(x=>x[1])) : at, elapsedMs: number(sample.elapsedMs), periodMs: number(sample.periodMs), collectionMs: number(sample.collectionMs), gpus, systemCpu:rows(sample.providers?.systemCpu),adapterMemory:rows(sample.providers?.gpuAdapterMemory),gpuProcessEngineMaximumPercent: maximum(engineRows.map(e => e.utilizationPercent)), processCpuOneCoreMaximumPercent: maximum((sample.processes ?? []).map(p => number(p.cpuUserOneCorePercent) !== null && number(p.cpuKernelOneCorePercent) !== null ? p.cpuUserOneCorePercent + p.cpuKernelOneCorePercent : null)), loggerOneCorePercent: number(sample.logger?.oneCorePercent), loggerCpuMs: number(sample.logger?.intervalCpuMs), providerErrors: sample.errors ?? [] };
  });
  const warnings = [];
  for (let i = 1; i < timeline.length; i++) {
    const a=timeline[i-1], b=timeline[i];
    if (b.elapsedMs !== null && a.elapsedMs !== null && Math.abs((Date.parse(b.utc)-Date.parse(a.utc))-(b.elapsedMs-a.elapsedMs)) > 500) warnings.push(`Skok wall-clock mezi vzorky ${i-1}/${i}; časová korelace je nejistá.`);
  }
  const measuredCpu = timeline.map(x=>x.loggerCpuMs).filter(x=>x!==null);
  const steady=timeline.filter(x=>x.phase==='steady');
  return { sampleCount: samples.length, devices: [...devices.values()], processes: [...processes.values()], providerStatus: Object.fromEntries(['gpuEngine','gpuProcessMemory','gpuAdapterMemory','nvidia','systemCpu'].map(name=>[name,countStatus(samples,name)])), logger: { peakOneCorePercent: maximum(timeline.map(x=>x.loggerOneCorePercent)),steadySamples:steady.length,steadyPeakOneCorePercent:maximum(steady.map(x=>x.loggerOneCorePercent)), totalMeasuredCpuMs: measuredCpu.length ? measuredCpu.reduce((a,b)=>a+b,0) : null, maxCollectionMs: maximum(timeline.map(x=>x.collectionMs)) }, warnings, timeline };
}

function visibilityFor(records, from, to, data) {
  const states = records.filter(r=>r.kind==='browser-state' && number(r.atMs)!==null).sort((a,b)=>a.atMs-b.atMs);
  const prior = states.filter(r=>r.atMs<=from).at(-1);
  const changed = states.some(r=>r.atMs>from && r.atMs<=to);
  if (data.afterVisibilityChange || data.visibility==='transition' || changed) return 'transition';
  if (data.visibility==='hidden' || prior?.data.visibility==='hidden') return 'hidden';
  if (!prior) return 'unknown';
  return prior.data.visibility==='visible' && prior.data.focused===true ? 'foreground' : 'unfocused';
}

/** Querybracket překryv je korelace hrubého vzorku, nikdy důkaz příčiny snímku. */
export function correlateGame(batches, timeline) {
  const grouped = new Map();
  for (const batch of batches) {
    const id=batch.sessionId; if (typeof id!=='string') throw new Error('Herní dávka nemá sessionId.');
    const g=grouped.get(id)??{sessionId:id,sources:new Set(),records:[]}; g.sources.add(batch.source?.buildSnapshotId??null); g.records.push(...(batch.records??[])); grouped.set(id,g);
  }
  return [...grouped.values()].map(g=>{
    const unique = new Map(), conflictingSequences=[];
    for(const record of g.records){if(!Number.isSafeInteger(record.seq)||record.seq<0)throw new Error('Neplatná herní sekvence.');const old=unique.get(record.seq);if(old&&JSON.stringify(old)!==JSON.stringify(record))conflictingSequences.push(record.seq);else if(!old)unique.set(record.seq,record);}
    const records=[...unique.values()].sort((a,b)=>a.seq-b.seq), gaps=[];
    for(let i=1;i<records.length;i++)if(records[i].seq!==records[i-1].seq+1)gaps.push([records[i-1].seq,records[i].seq]);
    const start=records.find(r=>r.kind==='session-start'), origin=number(start?.data?.timeOrigin);
    if(origin===null)return{sessionId:g.sessionId,sources:[...g.sources],error:'Chybí session-start.timeOrigin; server receivedAtUTC se nepoužije.',gaps,conflictingSequences,events:[]};
    const events=[];
    for(const r of records){if(!['frame-window','frame-hitch'].includes(r.kind))continue;const d=r.data??{},from=number(r.kind==='frame-hitch'?d.intervalStartMs:d.fromMs),to=number(r.kind==='frame-hitch'?d.intervalEndMs:d.toMs);if(from===null||to===null||to<from)continue;
      const a=origin+from,b=origin+to,overlap=timeline.filter(s=>s.toUTCms>=a&&s.fromUTCms<=b);
      const previous=r.kind==='frame-hitch'?d.previousFrame:undefined;
      const nearby=timeline.filter(s=>s.toUTCms>=a-2000&&s.fromUTCms<=b+2000);
      const gpuOverlaps=g=>number(g.fromUTCms)!==null&&number(g.toUTCms)!==null&&g.toUTCms>=a&&g.fromUTCms<=b;
      const gpuSamples=timeline.filter(s=>s.gpus.some(gpuOverlaps));
      events.push({seq:r.seq,kind:r.kind,fromUtc:new Date(a).toISOString(),toUtc:new Date(b).toISOString(),visibility:visibilityFor(records,from,to,d),frameMs:number(d.frameMs),summary:r.kind==='frame-window'?d.summary??null:null,previousCpuWallMs:number(previous?.cpuMs),currentCpuWallMs:number(d.currentCpuMs),systemSamples:overlap.map(s=>s.index),gpuSystemSamples:gpuSamples.map(s=>s.index),nearbySystemSamples:nearby.map(s=>s.index),gpuPeakPercent:maximum(gpuSamples.flatMap(s=>s.gpus.filter(gpuOverlaps).map(x=>x.utilizationPercent))),note:'systemSamples značí sběr všechproviderů. gpuSystemSamples preferuje driverUTCbod, jinak původníčas přijetí konkrétníhořádku; chybějícíčas jeunknown. Hodnota agreguje předchozíperiodu. nearby jsou pouze okolnívzorky±2s. Prázdnýpřekryv není důkaz nulovéhoGPU.'});
    }
    return{sessionId:g.sessionId,sources:[...g.sources],timeOrigin:origin,records:records.length,gaps,conflictingSequences,events};
  });
}

export async function jsonLines(file, maxBytes=256*1024*1024) {
  const stream=createReadStream(file,{encoding:'utf8',highWaterMark:64*1024});let bytes=0,pending='',line=0;const records=[];
  const accept=text=>{line++;if(!text.trim())return;try{records.push(JSON.parse(text));}catch{throw new Error(`Neúplný/neplatnýJSON ${file}:${line}; znovu analyzovat po dokončení zápisu.`);}};
  try{for await(const chunk of stream){bytes+=Buffer.byteLength(chunk,'utf8');if(bytes>maxBytes)throw new Error(`Soubor překračuje limit ${maxBytes} bajtů: ${file}`);pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){accept(pending.slice(0,end));pending=pending.slice(end+1);}}if(pending)accept(pending);}finally{stream.destroy();}return records;
}

async function main(args) {
  const flags={};for(let i=0;i<args.length;i+=2){if(!['--telemetry','--game-log-dir','--out'].includes(args[i])||!args[i+1])throw new Error('Použití: node scripts/analyze-system-gpu.mjs --telemetry samples.jsonl --game-log-dir cesta --out nový-adresář');flags[args[i]]=args[i+1];}
  if(!flags['--telemetry']||!flags['--game-log-dir']||!flags['--out'])throw new Error('Chybí --telemetry, --game-log-dir nebo --out.');
  const samples=await jsonLines(resolve(flags['--telemetry']));
  if(samples.some(r=>r.schemaVersion!==1||!['metadata','sample','summary','error'].includes(r.recordType)))throw new Error('Neznámé systémové schéma nebo typ záznamu.');
  if(!samples.some(r=>r.recordType==='sample'))throw new Error('Systémový záznam neobsahuje žádný vzorek.');
  const game=[];for(const f of (await readdir(flags['--game-log-dir'])).filter(x=>/\.jsonl$/.test(x)).sort())game.push(...await jsonLines(join(flags['--game-log-dir'],f)));
  const system=summarizeSystem(samples),sessions=correlateGame(game,system.timeline),report={createdUTC:new Date().toISOString(),system,sessions,limits:['Per-process GPU paměť se nesčítá do fyzické VRAM; sdílené alokace se počítají vícekrát.','GPU engine utilization perPID je maximum, nikoli součet paralelních enginů.','CPU walltime herního snímku zahrnuje preempci a synchronní čekání; není procesorový CPUtime.','Sekundové čítače a querybrackets neurčují přesnou příčinu krátkého záseku; driver vyžaduje stack/scheduler trace.','Browser GPU proces může obsluhovat více karet; herní log neobsahuje PID.','UTC kotva hry nemá korekci pozdější změny systémových hodin.']};
  const output=resolve(flags['--out']);await mkdir(output);await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  const summary=['# Systémový GPU záznam',`Vzorků: ${system.sampleCount}.`,...system.devices.map(g=>`- ${g.name??g.id}: GPU maximum ${g.utilPeakPercent??'nedostupné'} %, VRAM maximum ${g.memoryUsedPeakMiB??'nedostupné'} / ${g.memoryTotalMiB??'nedostupné'} MiB; začátek/konec ${g.memoryUsedFirstMiB??'?'} / ${g.memoryUsedLastMiB??'?'} MiB.`),`Identit procesů: ${system.processes.length}. Herních relací: ${sessions.length}.`,`Režie samotného loggeru: maximum včetněstartup ${system.logger.peakOneCorePercent??'nedostupné'} % jednoho logického CPU; ustálené maximum ${system.logger.steadyPeakOneCorePercent??'nedostupné'} % (${system.logger.steadySamples} steadyvzorků).`,...report.limits.map(x=>'- '+x),...system.warnings.map(x=>'- '+x)];await writeFile(join(output,'summary.md'),summary.join('\n\n')+'\n');console.log(JSON.stringify({output,samples:system.sampleCount,sessions:sessions.length,devices:system.devices,limits:report.limits}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
