import { Game } from "../../client/game";
import { createGameEngine } from "../../client/render-engine";
import { mappedDormEntrances } from "../../shared/landmark-reality";
import { buildingBaseHeight, groundHeight } from "../../shared/terrain";
import { DEFAULT_PROFILE } from "../../shared/types";
import { BUILDINGS } from "../../shared/world";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const canvas = document.querySelector("canvas")!;
const status = document.querySelector("output")!;
const view = document.querySelector<HTMLSelectElement>("#view")!;
const terrain = document.querySelector<HTMLInputElement>("#terrain")!;
const shadows = document.querySelector<HTMLInputElement>("#shadows")!;
const textures = document.querySelector<HTMLInputElement>("#textures")!;

async function start() {
  const game = new Game(canvas, DEFAULT_PROFILE, await createGameEngine(canvas));
  game.timeOverride = Date.parse("2026-06-20T10:00:00Z");
  game.setQuality("low");
  window.addEventListener("pagehide", () => game.dispose(), { once: true });
  await game.start();

  const porch = mappedDormEntrances(BUILDINGS, (b) => buildingBaseHeight(b.points)).find((e) => e.block === 5)!;
  const positions = {
    menza: [[82, 137], [83, 150.52], 1.1],
    "menza-side": [[70, 142], [83, 150.52], 1.1],
    "menza-south": [[127.99, 189], [127.99, 181.91], 0.12],
    b5: [[-86, -51], [-73, -51], 0.15],
    "b5-entry": [[porch.x + porch.nx * 8 + porch.nz * 3, porch.z + porch.nz * 8 - porch.nx * 3], [porch.x + porch.nx * 2, porch.z + porch.nz * 2], 0.2],
    b4: [[68, 31], [78.64, 40.45], 2.1],
    "b4-far": [[73, -36], [81.8, 40.4], 4.6],
    roof: [[69, 27], [83, 51], 18],
    "slope-roof": [[-248, 319], [-268, 324.29], 0.02],
    b1: [[-96.8, 100.26], [-94.29, 100.26], 10],
    b6: [[-2, -61], [-0.96, -69.93], 16],
    stadium: [[-116, 19], [-150, 18], 24],
    b8: [[145, 57], [156.65, 57], 0.9],
    "menza-far": [[68, 62], [94, 150.26], 2],
  } as const;
  const ground = game.scene.getMeshByName("source-dmr5g-terrain");
  if (!ground) throw new Error("Chybí zdrojový terén herní scény.");
  const elevatedCameras: Record<string, { cameraY: number; targetY?: number }> = {
    roof: { cameraY: 27 },
    "slope-roof": { cameraY: 15 },
    b1: { cameraY: 12.5, targetY: 10.82 },
    b6: { cameraY: 18, targetY: 17 },
    stadium: { cameraY: 29 },
  };
  let reportFrame = true;
  let roofObserver: ReturnType<typeof game.scene.onBeforeCameraRenderObservable.add> | undefined;
  function apply() {
    const [[x, z], [tx, tz], targetHeight] = positions[view.value as keyof typeof positions];
    const y = groundHeight(x, z);
    game.actor.setPosition({ x, y: y + 0.9, z });
    game.previousPosition.copyFromFloats(x, y + 0.9, z);
    game.visualOffset.setAll(0);
    game.firstPerson = true;
    game.yaw = Math.atan2(tx - x, tz - z);
    game.pitch = (y + 1.7 - groundHeight(tx, tz) - targetHeight) / Math.hypot(tx - x, tz - z);
    if (roofObserver) {
      game.scene.onBeforeCameraRenderObservable.remove(roofObserver);
      roofObserver = undefined;
    }
    const elevated = elevatedCameras[view.value];
    if (elevated)
      roofObserver = game.scene.onBeforeCameraRenderObservable.add((camera) => {
        if (camera !== game.camera) return;
        game.camera.position.set(x, elevated.targetY === undefined ? y + elevated.cameraY : elevated.cameraY, z);
        game.camera.setTarget(new Vector3(tx, elevated.targetY ?? groundHeight(tx, tz) + targetHeight, tz));
      });
    ground!.isVisible = terrain.checked;
    game.scene.shadowsEnabled = shadows.checked;
    game.scene.texturesEnabled = textures.checked;
    status.textContent = "Čeká na potvrzený snímek…";
    reportFrame = true;
  }
  for (const input of [view, terrain, shadows, textures]) input.addEventListener("change", apply);
  game.engine.onEndFrameObservable.add(() => {
    if (!reportFrame || !game.ready || canvas.dataset.renderHealth !== "ready") return;
    reportFrame = false;
    const id = ({ roof: "53929057", "b4-far": "53929057", b4: "53929057",
      "slope-roof": "49379066", b1: "53929063", b6: "53929071" } as Record<string, string>)[view.value] ?? "8111356";
    const meshes = game.scene.meshes.filter((mesh) => mesh.metadata?.sourceId === id && mesh.isEnabled());
    const lod = meshes.find((mesh) => mesh.metadata?.lod)?.metadata.lod;
    const cad = meshes.find((mesh) => mesh.metadata?.renderGlbSha256)?.metadata.renderGlbSha256;
    status.textContent = [import.meta.env.VITE_SOURCE_SNAPSHOT_ID, view.value,
      `WebGL ${game.engine.webGLVersion}`, cad ? `GLB ${id} ${cad}` : `LOD ${id} ${lod}`, `stíny ${game.scene.shadowsEnabled}`, `terén ${ground.isVisible}`,
      `textury ${game.scene.texturesEnabled}`, `${canvas.clientWidth}×${canvas.clientHeight} / ${game.engine.getRenderWidth()}×${game.engine.getRenderHeight()}`].join(" · ");
  });
  apply();
}

start().catch((error) => { status.textContent = String(error); });
