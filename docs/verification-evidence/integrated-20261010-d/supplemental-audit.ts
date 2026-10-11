import { writeFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ContactShadows } from "../../../.cache/performance-snapshot/integrated-20261010-d/client/contact-shadows";
import { Game } from "../../../.cache/performance-snapshot/integrated-20261010-d/client/game";

const engine = new NullEngine(), scene = new Scene(engine);
const shadows = new ContactShadows(scene);
const rig = new TransformNode("guest rig", scene);
shadows.set("guest", { x: 22, y: 0, z: -14 }, 0.95, 0.65, 0, true);
const fakeGame = {
  localId: "guest", avatars: new Map([["guest", { root: rig, target: { emote: "" } }]]),
  localPlayer: { id: "guest", emote: "" }, contactShadows: shadows, network: false, localEmoteUntil: 0,
};
const start = performance.now();
Game.prototype.setEmote.call(fakeGame as unknown as Game, "guest", "👋");
const soloEmote = {
  canonical: fakeGame.localPlayer.emote, target: fakeGame.avatars.get("guest")!.target.emote,
  expiresInMs: fakeGame.localEmoteUntil - start,
};
Game.prototype.setLocalId.call(fakeGame as unknown as Game, "new-player-id");
const orphanGuestShadows = scene.meshes.filter(mesh => mesh.name === "contact guest" && mesh.isEnabled()).length;
const resourcesBeforeDispose = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length };
shadows.dispose();
const resourcesAfterShadowDispose = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length };
scene.dispose(); engine.dispose();
const result = {
  sourceSnapshot: "integrated-20261010-d",
  snapshotId: "6bac5a55ce9f8a07885fd07de125fca0299ef7b2e4b893ded45bbc0eb962d062",
  recordedAt: new Date().toISOString(),
  method: "Actual frozen Game.prototype methods invoked against a minimal state and real Babylon NullEngine ContactShadows. No runtime sources changed; no GPU/FPS claim.",
  soloEmote, oldRigDisposed: rig.isDisposed(), localIdAfterChange: fakeGame.localId,
  orphanGuestShadows, resourcesBeforeDispose, resourcesAfterShadowDispose,
};
writeFileSync(new URL("supplemental-audit.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
