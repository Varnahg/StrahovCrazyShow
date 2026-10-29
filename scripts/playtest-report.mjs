/** Offline diary archive/report. Run with node --import tsx; never controls a game. */
import { readFile, writeFile, mkdir, readdir, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, resolve, relative, isAbsolute, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { summarizeDiagnosticFiles } from "./diagnostics-report.mjs";
import {
  PLAYTEST_STATIONS, PLAYTEST_SCENARIO_VERSION, PLAYTEST_CAPTURE_PHASES,
  PLAYTEST_LIFECYCLE_CHECKS, createPlaytestMatrix, playtestStationReached,
} from "../shared/playtest-scenarios.ts";
import { copyPlaytestFrameSample, copyPlaytestInputSample, copyPlaytestIdentity } from "../shared/playtest-diary.ts";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const logName = /^[a-f0-9-]{36}(?:\.part-\d{4,})?\.jsonl$/i;
const serial = (value) => JSON.stringify(value, null, 2) + "\n";
const identityKey = (value) => [value.sessionId, value.runId, value.gameInstanceId].join("/");
const trialKey = (step) => [step.stationId, step.trial?.lightingMode, step.trial?.view, step.trial?.qualityMode].join(":");
const MAX_LOG_BYTES = 256 * 1024 * 1024;
const MAX_RECORDS = 500000;

export async function readPlaytestRecords(files) {
  const records = new Map(), warnings = [], sources = [], originals = [];
  let bytesRead = 0;
  for (const filename of files) {
    const bytes = await readFile(filename);
    bytesRead += bytes.length;
    if (bytesRead > MAX_LOG_BYTES) throw Error("Selected logs exceed 256 MiB; select one retained session.");
    originals.push({ path: resolve(filename), bytes, sha256: digest(bytes) });
    let lineNumber = 0;
    for (const line of bytes.toString("utf8").split(/\r?\n/)) {
      lineNumber++;
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { warnings.push(`${basename(filename)}:${lineNumber}: malformed or incomplete JSONL row`); continue; }
      if (row.source) sources.push(row.source);
      if (row.type !== "batch" || !Array.isArray(row.records)) continue;
      for (const record of row.records) {
        if (!Number.isSafeInteger(record?.seq) || !finite(record.atMs) || !record.data || typeof record.kind !== "string") {
          warnings.push(`${basename(filename)}:${lineNumber}: invalid diagnostic record`); continue;
        }
        const key = row.sessionId + ":" + record.seq;
        const previous = records.get(key);
        const next = { ...record, sessionId: row.sessionId };
        if (previous && JSON.stringify(previous) !== JSON.stringify(next)) {
          warnings.push(`Conflicting record ${key}; chronology cannot be certified`);
          previous.ambiguous = true;
        } else if (!previous) records.set(key, next);
        if (records.size > MAX_RECORDS) throw Error("Selected logs exceed 500000 records; archive sessions separately.");
      }
    }
  }
  const ordered = [...records.values()].sort((a, b) => String(a.sessionId).localeCompare(String(b.sessionId)) || a.seq - b.seq);
  let previous;
  for (const row of ordered) {
    if (previous?.sessionId === row.sessionId && row.seq !== previous.seq + 1)
      warnings.push(`Sequence gap ${row.sessionId}: ${previous.seq + 1}..${row.seq - 1}`);
    if (!previous || previous.sessionId !== row.sessionId) {
      if (row.seq !== 0) warnings.push(`Missing session prefix ${row.sessionId}: 0..${row.seq - 1}`);
    }
    previous = row;
  }
  return { records: ordered, warnings, sources: [...new Map(sources.map((source) => [JSON.stringify(source), source])).values()], originals };
}

/** Paths are server-authored relative keys. Reject traversal, absolute paths,
 * alternate Windows streams and symlinks escaping the explicitly selected root. */
export async function resolveArtifactPath(root, storageKey) {
  if (typeof storageKey !== "string" || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/.test(storageKey))
    throw Error("Invalid artifact storageKey");
  const base = await realpath(root), target = await realpath(resolve(base, storageKey));
  const inside = relative(base, target);
  if (!inside || inside === ".." || inside.startsWith(".." + sep) || isAbsolute(inside)) throw Error("Artifact escapes selected root");
  if (!(await stat(target)).isFile()) throw Error("Artifact is not a file");
  return target;
}

function captureData(record) {
  if (!/(?:^|-)capture-saved$/.test(record.kind)) return null;
  const { metadata, receipt } = record.data;
  if (!metadata || !receipt || !copyPlaytestIdentity(metadata) || metadata.artifactId !== receipt.artifactId) return null;
  return { metadata, receipt, recordSeq: record.seq, integrity: "unverified", href: null };
}
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function sampleTime(sample) { return sample.renderCompletedAtMs ?? sample.atMs; }

function analyzeStep(step, media) {
  const reasons = [], descriptor = step.descriptor;
  const poses = [...new Map(step.poses.map((frame) => [frame.frameId, frame])).values()].sort((a, b) => a.renderCompletedAtMs - b.renderCompletedAtMs);
  const actions = [...step.actions.values()];
  const captures = media.filter((item) => item.metadata.refs?.stepId === step.stepId && identityKey(item.metadata) === step.identity);
  if (!descriptor || !step.started) reasons.push("step-start missing");
  if (descriptor?.scenarioVersion !== PLAYTEST_SCENARIO_VERSION) reasons.push("unknown scenario version");
  if (!PLAYTEST_STATIONS.some((entry) => entry.id === descriptor?.stationId)) reasons.push("unknown station");
  if (descriptor?.traversal !== "normal-input") reasons.push("normal-input traversal not declared");
  if (step.status !== "completed") reasons.push(`step ended ${step.status ?? "without terminal result"}`);
  if (step.gaps) reasons.push("trace contains a recording gap or ambiguous record");
  if (poses.length < 2) reasons.push("insufficient rendered pose trace");
  let travelled = 0, discontinuities = 0;
  for (let index = 1; index < poses.length; index++) {
    const before = poses[index - 1], after = poses[index], dt = (after.renderCompletedAtMs - before.renderCompletedAtMs) / 1000;
    const moved = distance(before.position, after.position);
    travelled += moved;
    // A conservative detector, not a proof about unsampled physics frames.
    if (!(dt > 0) || dt > 2 || moved > (before.vehicle || after.vehicle ? 80 : 15) * dt + 1) discontinuities++;
  }
  if (discontinuities) reasons.push("pose trace is discontinuous or has >2s gaps");
  const normalInputs = step.inputs.filter((input) => input.source === "input" && ["offline", "prediction"].includes(input.execution) && Math.hypot(input.x, input.z) > 0.01);
  if (!normalInputs.length || travelled < 0.15) reasons.push("observed movement with normal input missing");
  const arrived = poses.some((frame) => playtestStationReached(descriptor?.stationId, frame.position));
  if (!arrived) reasons.push("target station/height not reached in recorded trace");
  const phaseCaptures = Object.fromEntries(PLAYTEST_CAPTURE_PHASES.map((phase) => [phase, captures.filter((item) => item.metadata.phase === phase && item.integrity === "verified").sort((a, b) => a.metadata.capturedAtMs - b.metadata.capturedAtMs)]));
  const before = phaseCaptures["off-before"][0], on = phaseCaptures.on[0], after = phaseCaptures["off-after"][0];
  for (const phase of PLAYTEST_CAPTURE_PHASES) if (!phaseCaptures[phase].length) reasons.push(`verified ${phase} image missing`);
  const confirmed = actions.filter((action) => action.result?.status === "applied" && action.request?.action === "flashlight");
  const onAction = confirmed.find((action) => action.result.after?.flashlight === true &&
    before && on && before.metadata.capturedAtMs <= action.request.atMs && action.result.atMs <= on.metadata.capturedAtMs &&
    on.metadata.refs?.actionId === action.actionId);
  const offAction = confirmed.find((action) => action.result.after?.flashlight === false &&
    on && after && on.metadata.capturedAtMs <= action.request.atMs && action.result.atMs <= after.metadata.capturedAtMs &&
    after.metadata.refs?.actionId === action.actionId);
  if (!onAction) reasons.push("confirmed ON action between before/on images missing");
  if (!offAction) reasons.push("confirmed OFF action between on/after images missing");
  if (before && on && after) {
    if (!(before.metadata.capturedAtMs < on.metadata.capturedAtMs && on.metadata.capturedAtMs < after.metadata.capturedAtMs)) reasons.push("image phase order invalid");
    const frames = [before, on, after].map((capture) => copyPlaytestFrameSample(capture.metadata.frame));
    if (frames.some((frame) => !frame)) reasons.push("capture frame context missing or invalid");
    else {
      if (frames[0].flashlight || !frames[1].flashlight || frames[2].flashlight) reasons.push("captured flashlight states disagree with phase");
      if (frames.some((frame) => !playtestStationReached(descriptor?.stationId, frame.position))) reasons.push("image captured outside station");
      const first = frames[0];
      if (frames.some((frame) => distance(frame.camera.position, first.camera.position) > 0.12 ||
        frame.camera.viewMatrix.some((value, index) => Math.abs(value - first.camera.viewMatrix[index]) > 0.02) ||
        frame.camera.projectionMatrix.some((value, index) => Math.abs(value - first.camera.projectionMatrix[index]) > 0.0001))) reasons.push("camera changed within image comparison");
      if (frames.some((frame) => frame.lighting.mode !== descriptor.trial?.lightingMode ||
        frame.rendering.qualityMode !== descriptor.trial?.qualityMode ||
        frame.camera.firstPerson !== (descriptor.trial?.view === "first"))) reasons.push("captured trial differs from declared conditions");
      if (frames.some((frame) => frame.rendering.renderWidth !== first.rendering.renderWidth || frame.rendering.renderHeight !== first.rendering.renderHeight || frame.rendering.quality !== first.rendering.quality)) reasons.push("render budget changed within comparison");
      if (first.lighting.mode !== "real" && frames.some((frame) => frame.lighting.instantUtcMs !== first.lighting.instantUtcMs)) reasons.push("fixed lighting instant changed within comparison");
    }
  }
  return { ...step, actions, poses, inputs: undefined, identity: step.identity,
    trialKey: descriptor ? trialKey(descriptor) : null, captures: captures.map((item) => item.metadata.artifactId),
    evidence: { status: reasons.length ? "incomplete" : "complete", reasons, arrived, travelledMetres: travelled, normalInputSamples: normalInputs.length, discontinuities,
      scope: "Observed sampled normal-input traversal and confirmed action/image sequence; not proof of unsampled movement or visual correctness." } };
}

export function buildPlaytestReport(records, options = {}) {
  const scope = options.scope ?? "pilot", games = new Map(), warnings = [...(options.warnings ?? [])];
  const media = options.media ?? records.map(captureData).filter(Boolean);
  for (const record of records) {
    const data = record.data, identity = copyPlaytestIdentity(data) ?? copyPlaytestIdentity(data?.metadata);
    if (!identity) continue;
    const key = identityKey(identity), refs = data.refs ?? data.metadata?.refs ?? {};
    let game = games.get(key);
    if (!game) games.set(key, game = { ...identity, key, steps: new Map(), incidents: new Map(), timeline: [], gaps: 0, source: null });
    game.timeline.push({ seq: record.seq, atMs: record.atMs, kind: record.kind, refs, data });
    if (record.kind === "playtest-game-start") game.source = data.info?.source ?? data.run?.source ?? data.source ?? null;
    if (record.kind === "playtest-game-end") game.ended = true;
    if (record.kind === "playtest-gap" || record.ambiguous) game.gaps++;
    const stepId = data.step?.stepId ?? refs.stepId;
    let step;
    if (stepId) {
      step = game.steps.get(stepId);
      if (!step) game.steps.set(stepId, step = { stepId, identity: key, poses: [], inputs: [], actions: new Map(), gaps: 0, descriptor: null });
      if (record.kind === "playtest-step-start") { step.started = record.atMs; step.descriptor = data.step; }
      if (record.kind === "playtest-step-end") { step.ended = record.atMs; step.status = data.status; step.reason = data.reason; step.descriptor ??= data.step; }
      if (record.kind === "playtest-gap" || record.ambiguous) step.gaps++;
      if (record.kind === "playtest-pose-window") step.poses.push(...(data.samples ?? []).map(copyPlaytestFrameSample).filter(Boolean));
      if (record.kind === "playtest-input-window") step.inputs.push(...(data.samples ?? []).map(copyPlaytestInputSample).filter(Boolean));
      if (refs.actionId && ["playtest-action-request", "playtest-action-result"].includes(record.kind)) {
        const action = step.actions.get(refs.actionId) ?? { actionId: refs.actionId };
        action[record.kind.endsWith("request") ? "request" : "result"] = data.request ?? data.result ?? data;
        step.actions.set(refs.actionId, action);
      }
    }
    const incidentId = data.incidentId ?? refs.incidentId;
    if (incidentId && record.kind.startsWith("playtest-incident-")) {
      const incident = game.incidents.get(incidentId) ?? { incidentId, before: [], after: [] };
      if (record.kind === "playtest-incident-start") incident.start = data;
      if (record.kind === "playtest-incident-end") incident.end = data;
      if (record.kind === "playtest-incident-frames" && ["before", "after"].includes(data.phase)) incident[data.phase].push(...(data.samples ?? []).map(copyPlaytestFrameSample).filter(Boolean));
      game.incidents.set(incidentId, incident);
    }
  }
  const resultGames = [...games.values()].map((game) => ({ ...game,
    steps: [...game.steps.values()].map((step) => analyzeStep(step, media)), incidents: [...game.incidents.values()],
  }));
  if (warnings.some((warning) => /gap|conflict|malformed|missing session prefix/i.test(warning)))
    for (const game of resultGames) for (const step of game.steps) {
      step.evidence.status = "incomplete"; step.evidence.reasons.push("source log continuity is not certified");
    }
  const steps = resultGames.flatMap((game) => game.steps), matrix = createPlaytestMatrix(scope).map((trial) => {
    const matching = steps.filter((step) => step.trialKey === trial.id);
    return { ...trial, status: matching.some((step) => step.evidence.status === "complete") ? "complete" : matching.length ? "incomplete" : "missing", attempts: matching.length };
  });
  const confirmedActions = resultGames.flatMap((game) => game.steps.flatMap((step) => step.actions)).filter((action) => action.result?.status === "applied");
  return { schemaVersion: 1, createdAtUTC: new Date().toISOString(), scenarioVersion: PLAYTEST_SCENARIO_VERSION, scope,
    diary: resultGames.length ? "available" : "unavailable", games: resultGames, media, stations: PLAYTEST_STATIONS, matrix,
    lifecycle: PLAYTEST_LIFECYCLE_CHECKS.map((id) => ({ id, observed: confirmedActions.some((action) => action.request?.action === id) })),
    coverage: { expected: matrix.length, complete: matrix.filter((trial) => trial.status === "complete").length, photographed: media.length },
    warnings, legacy: options.legacy ?? [], sources: options.sources ?? [],
    limitations: ["Completeness is evidence coverage, not a visual approval or a performance pass.", "Sampled poses cannot prove every unsampled movement; screenshots require visual review.", "Burst images are forward captures. Missing pre-action pixels are never synthesized.", "Raw diagnostic percentiles come from original frame intervals; sampled incident frames are not substituted."],
  };
}

async function selectLogs(input) {
  const path = resolve(input), info = await stat(path);
  if (info.isFile()) {
    // Include retained rotated parts only when the filename identifies a session.
    const match = /^([a-f0-9-]{36})(?:\.part-\d{4,})?\.jsonl$/i.exec(basename(path));
    if (!match) return [path];
    return (await readdir(dirname(path))).filter((name) => logName.test(name) && name.startsWith(match[1])).sort().map((name) => resolve(dirname(path), name));
  }
  const files = (await readdir(path)).filter((name) => logName.test(name)).sort().map((name) => resolve(path, name));
  if (!files.length) throw Error("No diagnostic JSONL sessions found");
  return files;
}

export async function createPlaytestArchive(input, output, options = {}) {
  const files = await selectLogs(input), loaded = await readPlaytestRecords(files);
  const legacy = [];
  for (const session of new Set(loaded.records.map((record) => record.sessionId))) {
    const names = files.filter((file) => basename(file).startsWith(session));
    if (names.length) legacy.push(await summarizeDiagnosticFiles(names));
  }
  const media = loaded.records.map(captureData).filter(Boolean), mediaFiles = [], warnings = [...loaded.warnings];
  const seenArtifacts = new Map();
  for (const item of media) {
    const { receipt, metadata } = item, key = metadata.runId + "/" + metadata.artifactId;
    const previous = seenArtifacts.get(key);
    if (previous && JSON.stringify(previous.receipt) !== JSON.stringify(receipt)) {
      item.integrity = previous.integrity = "conflict"; warnings.push("Conflicting artifact receipt " + key); continue;
    }
    seenArtifacts.set(key, item);
    if (!options.artifactRoot) { item.integrity = "missing-root"; continue; }
    try {
      if (!/^[a-f0-9]{64}$/.test(receipt.sha256) || !Number.isSafeInteger(receipt.bytes) || receipt.bytes <= 0) throw Error("invalid receipt digest/size");
      if (!receipt.storageKey.startsWith(metadata.runId + "/") || !basename(receipt.storageKey).startsWith(metadata.artifactId + ".")) throw Error("receipt identity does not match storageKey");
      const path = await resolveArtifactPath(options.artifactRoot, receipt.storageKey), bytes = await readFile(path);
      if (bytes.length !== receipt.bytes || digest(bytes) !== receipt.sha256) throw Error("artifact SHA-256/size mismatch");
      item.integrity = "verified"; item.href = "media/" + receipt.storageKey;
      if (!previous) mediaFiles.push({ path, bytes, relative: item.href, sha256: receipt.sha256 });
      const sidecar = path.replace(/\.[^.]+$/, ".json");
      try {
        const actual = await realpath(sidecar), root = await realpath(options.artifactRoot), location = relative(root, actual);
        if (location.startsWith("..") || isAbsolute(location)) throw Error("sidecar escapes artifact root");
        const data = await readFile(actual), parsed = JSON.parse(data.toString("utf8"));
        if (JSON.stringify(parsed.metadata) !== JSON.stringify(metadata) || JSON.stringify(parsed.receipt) !== JSON.stringify(receipt)) throw Error("sidecar differs from logged receipt");
        if (!previous) mediaFiles.push({ path: actual, bytes: data, relative: item.href.replace(/\.[^.]+$/, ".json"), sha256: digest(data) });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        warnings.push(`Artifact sidecar absent: ${key}; log metadata retained`);
      }
    } catch (error) { item.integrity = "invalid"; item.href = null; warnings.push(`Artifact ${key}: ${error.message}`); }
  }
  const report = buildPlaytestReport(loaded.records, { ...options, media, warnings, legacy, sources: loaded.sources });
  const target = resolve(output);
  // Exclusive directory allocation is the publication boundary. No old archive is overwritten.
  await mkdir(dirname(target), { recursive: true });
  await mkdir(target, { recursive: false });
  const manifest = { schemaVersion: 1, createdAtUTC: report.createdAtUTC, kind: "immutable-playtest-evidence", files: [], sourceLogsStable: false };
  async function save(name, bytes, origin = null) {
    const path = resolve(target, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
    manifest.files.push({ path: name, sha256: digest(bytes), bytes: Buffer.byteLength(bytes), origin });
  }
  try {
    for (const original of loaded.originals) await save("raw/" + basename(original.path), original.bytes, original.path);
    for (const entry of mediaFiles) await save(entry.relative, entry.bytes, entry.path);
    // Detect recording still appending or source replacement; retain the failed archive for diagnosis.
    for (const original of loaded.originals) if (digest(await readFile(original.path)) !== original.sha256) throw Error("Source log changed while archiving; finish/flush the recording first");
    manifest.sourceLogsStable = true;
    await save("report.json", serial(report));
    await save("index.html", renderPlaytestHtml(report));
    manifest.archiveId = digest(JSON.stringify(manifest.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }))));
    await writeFile(resolve(target, "manifest.json"), serial(manifest), { flag: "wx" });
    return { directory: target, report, manifest };
  } catch (error) {
    await writeFile(resolve(target, "archive-error.json"), serial({ error: error.message, partial: true, manifest }), { flag: "wx" });
    throw error;
  }
}

export function renderPlaytestHtml(report) {
  const traces = report.games.flatMap((game) => game.steps.map((step) => ({ label: step.stepId, poses: step.poses })));
  const points = [...report.stations.map((station) => station.target), ...traces.flatMap((trace) => trace.poses.map((pose) => pose.position))];
  const minX = Math.min(...points.map((point) => point.x)) - 20, maxX = Math.max(...points.map((point) => point.x)) + 20;
  const minZ = Math.min(...points.map((point) => point.z)) - 20, maxZ = Math.max(...points.map((point) => point.z)) + 20;
  const width = maxX - minX, height = maxZ - minZ;
  const svg = `<svg role="img" aria-label="Recorded movement and source station positions, east right and south down" viewBox="${minX} ${minZ} ${width} ${height}">${traces.map((trace) => `<polyline fill="none" stroke="#71c9c2" stroke-width="1.3" points="${trace.poses.map((pose) => `${pose.position.x},${pose.position.z}`).join(" ")}"><title>${esc(trace.label)}</title></polyline>`).join("")}${report.stations.map((station, index) => `<g><circle cx="${station.target.x}" cy="${station.target.z}" r="4" fill="#ffc576"/><text x="${station.target.x + 6}" y="${station.target.z}" font-size="8" fill="#fff">${index + 1}</text><title>${esc(station.label)}</title></g>`).join("")}</svg>`;
  const mediaById = new Map(report.media.map((item) => [item.metadata.artifactId, item]));
  const picture = (item) => !item ? "<p>Missing image</p>" : `<figure>${item.href && /^media\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(webp|png|jpe?g)$/.test(item.href) ? `<a href="${esc(item.href)}"><img loading="lazy" src="${esc(item.href)}" alt="${esc(item.metadata.phase ?? item.metadata.reason)}"></a>` : `<p>Image ${esc(item.integrity)}</p>`}<figcaption>${esc(item.metadata.phase ?? item.metadata.reason)} · frame ${esc(item.metadata.frame?.frameId)} · ${esc(item.metadata.capturedAtUTC)}<br>${esc(item.receipt.sha256)}</figcaption></figure>`;
  const comparison = report.games.flatMap((game) => game.steps.map((step) => `<article id="step-${esc(step.stepId)}"><h3>${esc(step.stepId)} · ${esc(step.evidence.status)}</h3><p>${esc(step.evidence.reasons.join("; ") || "Required evidence recorded; visual assessment pending.")}</p><div class="comparison">${PLAYTEST_CAPTURE_PHASES.map((phase) => picture(step.captures.map((id) => mediaById.get(id)).find((item) => item?.metadata.phase === phase))).join("")}</div><p>Observed movement ${step.evidence.travelledMetres.toFixed(2)} m; ${step.evidence.normalInputSamples} normal input samples.</p></article>`)).join("");
  const timeline = report.games.flatMap((game) => game.timeline.filter((row) => !/-(pose|input)-window$/.test(row.kind)).map((row) => `<tr><td>${esc(game.gameInstanceId)}</td><td>${esc(row.atMs.toFixed(1))}</td><td>${esc(row.kind)}</td><td>${esc(row.refs.stepId)}</td><td><details><summary>Evidence #${row.seq}</summary><pre>${esc(JSON.stringify(row.data, null, 2))}</pre></details></td></tr>`)).join("");
  const bursts = [...new Set(report.media.map((item) => item.metadata.burstId).filter(Boolean))].map((id) => `<article><h3>${esc(id)}</h3><div class="gallery">${report.media.filter((item) => item.metadata.burstId === id).sort((a, b) => a.metadata.burstIndex - b.metadata.burstIndex).map(picture).join("")}</div></article>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Strahov playtest diary</title><style>body{margin:0;background:#111922;color:#e7edf3;font:16px/1.55 system-ui,sans-serif}main{max-width:1250px;margin:auto;padding:32px}a{color:#9de4df}h1,h2,h3{line-height:1.2}h2{margin-top:48px}nav{display:flex;gap:18px;flex-wrap:wrap}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #34414d;vertical-align:top}article{padding:18px;margin:20px 0;border:1px solid #34414d;border-radius:10px}svg{width:100%;max-height:600px;background:#172733;border-radius:10px}.comparison,.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}img{display:block;max-width:100%;height:auto}figcaption{font-size:12px;overflow-wrap:anywhere;color:#afc1d1}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.muted{color:#afc1d1}.warning{border-left:4px solid #ffc576;padding:10px 18px;background:#27303a}@media(max-width:700px){main{padding:16px}.comparison,.gallery{grid-template-columns:1fr}table{display:block;overflow:auto}}</style><main><h1>Strahov playtest diary</h1><p>${esc(report.createdAtUTC)} · ${esc(report.scope)} · diary ${esc(report.diary)}</p><p>${report.coverage.complete}/${report.coverage.expected} trial evidence sets complete; ${report.coverage.photographed} saved capture references.</p><nav><a href="#route">Route</a><a href="#coverage">Coverage</a><a href="#comparison">Comparisons</a><a href="#bursts">Bursts</a><a href="#timeline">Timeline</a><a href="#performance">Performance</a><a href="report.json">Full JSON</a><a href="manifest.json">Archive manifest</a></nav>${report.warnings.map((warning) => `<p class="warning">${esc(warning)}</p>`).join("")}<p class="muted">${report.limitations.map(esc).join(" ")}</p><h2 id="route">Source stations and observed route</h2>${svg}<p class="muted">Metres, +X east/right, +Z south/down. This is a trace diagram, not a surveyed basemap. Source station definitions are from ${esc(report.scenarioVersion)}; recorded runtime source identity is separate.</p><ol>${report.stations.map((station) => `<li>${esc(station.label)} (${station.target.x.toFixed(2)}, ${station.target.z.toFixed(2)}) · ${esc(station.source)}<br><span class="muted">${esc(station.provenance)}</span></li>`).join("")}</ol><h2 id="coverage">Explicit coverage</h2><table><thead><tr><th>Station</th><th>Lighting</th><th>View / quality</th><th>Status / attempts</th></tr></thead><tbody>${report.matrix.map((trial) => `<tr><td>${esc(trial.stationId)}</td><td>${esc(trial.lightingMode)}</td><td>${esc(trial.view)} / ${esc(trial.qualityMode)}</td><td>${esc(trial.status)} / ${trial.attempts}</td></tr>`).join("")}</tbody></table><h3>Lifecycle observations</h3><ul>${report.lifecycle.map((item) => `<li>${esc(item.id)}: ${item.observed ? "confirmed action observed" : "not established"}</li>`).join("")}</ul><h2 id="comparison">OFF → ON → OFF comparisons</h2>${comparison || "<p>No step/capture evidence available in this recording.</p>"}<h2 id="bursts">Incident capture sequences</h2>${bursts || "<p>No image bursts recorded. Numeric incident samples are available in the full JSON.</p>"}<h2 id="timeline">Actions and events</h2><table><thead><tr><th>Game</th><th>Monotonic ms</th><th>Event</th><th>Step</th><th>Details</th></tr></thead><tbody>${timeline}</tbody></table><h2 id="performance">Original diagnostic summaries</h2>${report.legacy.map((summary) => `<article><h3>${esc(summary.sessionId)}</h3><pre>${esc(JSON.stringify({ performance: summary.performance, excludedVisibilityPerformance: summary.excludedVisibilityPerformance, warnings: summary.warnings, sources: summary.sources }, null, 2))}</pre></article>`).join("")}<h2>Provenance</h2><pre>${esc(JSON.stringify(report.sources, null, 2))}</pre></main></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = (flag) => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; };
  if (args.includes("--help") || !args[0]) console.log("node --import tsx scripts/playtest-report.mjs LOG_OR_DIRECTORY --out NEW_ARCHIVE [--artifacts ARTIFACT_ROOT] [--scope pilot|full]\nArchives exact source JSONL/media and creates index.html/report.json. Never overwrites an archive. Finish recording and flush before archival.");
  else {
    try {
      const output = value("--out"), scope = value("--scope") ?? "pilot";
      if (!output || !["pilot", "full"].includes(scope)) throw Error("Expected --out NEW_ARCHIVE and scope pilot|full");
      const result = await createPlaytestArchive(args[0], output, { scope, artifactRoot: value("--artifacts") });
      console.log(JSON.stringify({ directory: result.directory, archiveId: result.manifest.archiveId, coverage: result.report.coverage, warnings: result.report.warnings }));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
