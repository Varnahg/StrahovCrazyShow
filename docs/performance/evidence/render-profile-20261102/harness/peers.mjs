import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { root, origin, apiOrigin, buildDir, json, saveNew, runDirectory, exists, delay, stopController, bindSignals } from "./common.mjs";
import { joinWithDeadline, closePendingRoom } from "./join.mjs";

/** Actual SDK clients with neutral scheduled inputs. No actor/camera pose injection. */
export async function runPeers(name) {
  const run = runDirectory(name), runtime = await json(join(run, "runtime.json"));
  const identity = await json(join(buildDir, "identity.json"));
  if (runtime.name !== name || runtime.apiOrigin !== apiOrigin || runtime.sourceHash !== identity.inputs.sourceHash)
    throw new Error("Run/build identity mismatch");
  if (await exists(join(run, "STOP")) || await exists(join(run, "cleanup.json"))) throw new Error("Run already stopped");
  const status = await fetch(apiOrigin + "/api/diagnostics/status", { headers: { Origin: origin }, signal: AbortSignal.timeout(5000) });
  const collector = await status.json();
  if (!status.ok || collector.enabled !== true || collector.sourceSnapshotId !== runtime.sourceHash) throw new Error("Owned API source identity not confirmed");
  const control = stopController([join(run, "STOP"), join(run, "PEERS_STOP")]), unbind = bindSignals(control);
  const peers = []; let failure = null, readyAt = null, pulse, closing = false, ownsRun = false;
  const pendingRooms = new Set();
  const errors = [];
  const intentionalStop = () => /^(?:STOP:|SIGINT$|SIGTERM$|90-minute-limit$)/.test(control.reason ?? "");
  const confirmStop = () => { if (!intentionalStop() || errors.length) throw new Error("Peer stop failure: " + control.reason); };
  try {
    await saveNew(join(run, "peers-start.json"), { name, pid: process.pid, sourceHash: runtime.sourceHash,
      startedAt: new Date().toISOString(), method: "Wait for one existing browser connection, then join two distinct synthetic profiles; neutral scheduled inputs only" });
    ownsRun = true;
    const { Client } = await import("@colyseus/sdk"), { tsImport } = await import("tsx/esm/api");
    const load = path => tsImport(pathToFileURL(join(root, path)).href, import.meta.url);
    const [{ ScriptTimelineClient }, { MotionDecoder }, { PROTOCOL_VERSION }, { DEFAULT_PROFILE, DEFAULT_AVATAR }, { applyAvatarPreset }] = await Promise.all([
      load("scripts/timeline-client.ts"), load("shared/motion-codec.ts"), load("shared/netcode.ts"), load("shared/types.ts"), load("client/avatar-presets.ts"),
    ]);
    const waitDeadline = performance.now() + 5 * 60 * 1000;
    while (!control.signal.aborted) {
      const response = await fetch(apiOrigin + "/api/presence", { signal: AbortSignal.any([control.signal, AbortSignal.timeout(3000)]) });
      const presence = await response.json();
      if (!response.ok || !Number.isInteger(presence.online)) throw new Error("Invalid presence response");
      if (presence.online === 1) break;
      if (presence.online > 1) throw new Error("Expected only the browser before peers join");
      if (performance.now() > waitDeadline) throw new Error("Browser-first admission timeout (5 minutes)");
      await delay(250);
    }
    if (control.signal.aborted) { confirmStop(); return; }
    for (const preset of [1, 2]) {
      const profile = { ...structuredClone(DEFAULT_PROFILE), nickname: "Profile peer " + preset,
        avatar: applyAvatarPreset(preset, structuredClone(DEFAULT_AVATAR)) };
      const response = await fetch(apiOrigin + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "multiplayer", profile }), signal: AbortSignal.any([control.signal, AbortSignal.timeout(5000)]) });
      if (!response.ok) throw new Error("Synthetic session refused: " + response.status);
      const session = await response.json();
      const room = await joinWithDeadline(Client, apiOrigin, session.worldId,
        { token: session.token, protocol: PROTOCOL_VERSION }, control.signal, pendingRooms);
      const peer = { id: session.id, worldId: session.worldId, profile, room, lastRows: 0, position: null,
        firstPosition: null, maxHorizontalDrift: 0, commands: 0, resyncs: 0, lastMotionAt: 0, closed: false };
      peer.inputs = new ScriptTimelineClient({ send: batch => room.send("inputs", batch), onSend: batch => { peer.commands += batch.length; } });
      peers.push(peer); pendingRooms.delete(room); const decoder = new MotionDecoder();
      room.onMessage("*", () => {});
      room.onMessage("motion", wire => {
        const packet = decoder.decode(wire);
        if (!packet) { errors.push("motion-decode-rejected"); control.stop("motion-decode-rejected"); return; }
        peer.lastRows = packet.rows.length; peer.lastMotionAt = performance.now();
      });
      room.onMessage("authoritative", authority => {
        if (!peer.inputs.acceptAuthority(authority)) return;
        peer.position = { ...authority.state.position }; peer.firstPosition ??= { ...peer.position };
        peer.maxHorizontalDrift = Math.max(peer.maxHorizontalDrift, Math.hypot(peer.position.x - peer.firstPosition.x, peer.position.z - peer.firstPosition.z));
        if (authority.resync) peer.resyncs++;
      });
      room.onError((code, message) => { errors.push(`${code}: ${message}`); control.stop("SDK error"); });
      room.onLeave(() => { peer.closed = true; if (!closing) control.stop("SDK left unexpectedly"); });
    }
    if (peers[0].worldId !== peers[1].worldId) throw new Error("Peers joined different worlds");
    function pump() {
      if (control.signal.aborted) return;
      try { for (const peer of peers) peer.inputs.step({ x: 0, z: 0, yaw: peer.inputs.authority?.state.yaw ?? 0,
        jump: false, run: false, vehicle: false }); }
      catch (error) { errors.push(String(error)); control.stop("Input pump failed"); return; }
      pulse = setTimeout(pump, 1000 / 30);
    }
    pump();
    const readyDeadline = performance.now() + 15000;
    while (!control.signal.aborted && peers.some(peer => !peer.inputs.authority || peer.lastRows !== 3 || !peer.commands)) {
      if (performance.now() > readyDeadline) throw new Error("Three-player authenticated motion/idle input readiness timeout");
      await delay(100);
    }
    if (control.signal.aborted) { confirmStop(); return; }
    readyAt = new Date().toISOString();
    await saveNew(join(run, "peers-ready.json"), { readyAt, protocol: PROTOCOL_VERSION, sourceHash: runtime.sourceHash,
      expectedPopulation: 3, peers: peers.map(peer => ({ id: peer.id, profile: peer.profile, worldId: peer.worldId, position: peer.position })) });
    console.log(JSON.stringify({ status: "peers-ready", name, expectedPopulation: 3, readyAt }));
    while (!control.signal.aborted) {
      if (peers.some(peer => peer.lastRows !== 3 || performance.now() - peer.lastMotionAt > 5000))
        throw new Error("Population or authenticated motion freshness changed");
      await appendFile(join(run, "peers-samples.jsonl"), JSON.stringify({ at: new Date().toISOString(),
        peers: peers.map(peer => ({ id: peer.id, rows: peer.lastRows, position: peer.position, commands: peer.commands,
          resyncs: peer.resyncs, maxHorizontalDrift: peer.maxHorizontalDrift, ack: peer.inputs.authority?.ack })) }) + "\n");
      let timer;
      await Promise.race([new Promise(done => { timer = setTimeout(done, 5000); }), control.stopped]).finally(() => clearTimeout(timer));
    }
    confirmStop();
    if (errors.length || peers.some(peer => peer.closed)) throw new Error("Peers ended with SDK errors");
  } catch (error) { if (!control.signal.aborted || !intentionalStop() || errors.length) failure = String(error); if (failure) throw error; }
  finally {
    closing = true; clearTimeout(pulse); control.dispose(); unbind();
    const cleanupErrors = [];
    for (const room of pendingRooms) try { closePendingRoom(room); } catch (error) { cleanupErrors.push(String(error)); }
    pendingRooms.clear();
    await Promise.all(peers.map(async peer => {
      peer.inputs.dispose();
      if (!peer.closed) try {
        let timer;
        await Promise.race([peer.room.leave(true), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("SDK leave timeout")), 5000);
        })]).finally(() => clearTimeout(timer));
      } catch (error) { cleanupErrors.push(String(error)); peer.room.connection?.close(); }
    }));
    if (ownsRun) await saveNew(join(run, "peers-cleanup.json"), { finishedAt: new Date().toISOString(), readyAt,
      reason: control.reason, failure, errors, cleanupErrors, peers: peers.map(peer => ({ id: peer.id, closed: peer.closed,
        commands: peer.commands, position: peer.position, maxHorizontalDrift: peer.maxHorizontalDrift })) });
    if (cleanupErrors.length) throw new Error(cleanupErrors.join("; "));
  }
}
