/** Two real, authenticated SDK peers for the isolated renderer comparison. */
import { Client, type Room } from "@colyseus/sdk";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_PROFILE } from "../shared/types";
import { PROTOCOL_VERSION } from "../shared/netcode";
import { applyAvatarPreset } from "../client/avatar-presets";
import { MotionDecoder } from "../shared/motion-codec";
import { ScriptTimelineClient, type ScriptAuthority } from "./timeline-client";

const endpoint = process.argv[2];
const stopFile = resolve(process.argv[3] ?? ".cache/webgpu-companions.stop");
if (endpoint !== "http://127.0.0.1:2586") throw new Error("Use only the reserved isolated API2586.");
const sdk = new Client(endpoint.replace("http:", "ws:"));
const rooms: Room[] = [];
const worlds = new Set<string>();
const producers: {timeline: ScriptTimelineClient; x: number; start: number}[] = [];
let failed = false;
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
try {
  for (const preset of [1, 4]) {
    const profile = { ...DEFAULT_PROFILE, nickname: `GPU QA ${preset}`, avatar: applyAvatarPreset(preset, DEFAULT_PROFILE.avatar) };
    const response = await fetch(endpoint + "/api/session", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({mode: "multiplayer", profile}) });
    if (!response.ok) throw new Error(`Session HTTP${response.status}`);
    const session = await response.json() as {worldId: string; token: string};
    worlds.add(session.worldId);
    const room = await sdk.joinById(session.worldId, {token: session.token, protocol: PROTOCOL_VERSION});
    rooms.push(room);
    const timeline = new ScriptTimelineClient({send: (batch) => room.send("inputs", batch)});
    producers.push({timeline, x: preset === 1 ? -1 : 1, start: performance.now()});
    room.onMessage("authoritative", (authority: ScriptAuthority) => timeline.acceptAuthority(authority));
    const decoder = new MotionDecoder();
    let maximum = 0;
    room.onMessage("*", () => {});
    room.onMessage("motion", (wire: unknown) => {
      const packet = decoder.decode(wire);
      if (packet && packet.rows.length > maximum) {
        maximum = packet.rows.length;
        console.log(JSON.stringify({event: "population", preset, players: maximum, worldId: session.worldId}));
      }
    });
    room.onError((code, message) => {failed = true; console.error(JSON.stringify({event: "sdk-error", code, message}));});
    console.log(JSON.stringify({event: "joined", preset, worldId: session.worldId}));
  }
  if (worlds.size !== 1) throw new Error("Peers did not join the same world.");
  console.log(JSON.stringify({event: "companions-ready", count: rooms.length, protocol: PROTOCOL_VERSION}));
  const deadline = Date.now() + 30 * 60_000;
  while (!stopping && !failed && Date.now() < deadline) {
    try {await access(stopFile); break;} catch {}
    for (const peer of producers) {
      const x = performance.now() - peer.start < 1500 ? peer.x : 0;
      peer.timeline.step({x, z: 0, yaw: Math.PI, jump: false, run: false, vehicle: false});
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 / 30));
  }
} finally {
  for (const peer of producers) peer.timeline.dispose();
  await Promise.allSettled(rooms.map((room) => room.leave()));
  console.log(JSON.stringify({event: "companions-stopped", failed}));
}
if (failed) process.exitCode = 1;
