import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { loadPhotogrammetry } from "../../client/photogrammetry";
import type { RenderQuality } from "../../shared/render-quality";

const canvas = document.querySelector<HTMLCanvasElement>("#scan")!;
const engine = new Engine(
  canvas,
  true,
  { powerPreference: "high-performance" },
  false,
);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.54, 0.72, 0.86, 1);
const camera = new ArcRotateCamera(
  "Inspection camera",
  Math.PI / 3,
  0.7,
  215,
  new Vector3(15, 0, -25),
  scene,
);
camera.minZ = 0.1;
camera.maxZ = 3000;
camera.lowerRadiusLimit = 3;
camera.upperRadiusLimit = 1200;
camera.wheelPrecision = 15;
camera.panningSensibility = 70;
camera.attachControl(canvas, true);
const loading = document.querySelector<HTMLElement>("#loading")!;
const error = document.querySelector<HTMLElement>("#error")!;
const output = document.querySelector<HTMLElement>("#photogrammetry-stats")!;
const select = document.querySelector<HTMLSelectElement>("#quality")!;
const views: Record<
  string,
  { target: [number, number, number]; camera: [number, number, number] }
> = {
  campus: { target: [15, 3, -25], camera: [145, 170, 155] },
  b6: { target: [-2, 8, -72], camera: [-32, 12, -107] },
  courts: { target: [22, -1, -4], camera: [95, 85, 80] },
  shops: { target: [105, 0, -68], camera: [137, 27, -27] },
  stadium: { target: [-137, 13, -30], camera: [-101, 5, -7] },
  "stadium-aerial": { target: [-286, 6, 18], camera: [-75, 270, 290] },
};
let lastStatus = -Infinity;
let controller: Awaited<ReturnType<typeof loadPhotogrammetry>> | undefined;
document
  .querySelectorAll<HTMLButtonElement>("[data-view]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const view = views[button.dataset.view!];
      camera.setTarget(Vector3.FromArray(view.target));
      camera.setPosition(Vector3.FromArray(view.camera));
      controller?.update(camera.target, select.value as RenderQuality);
    });
  });
window.addEventListener("resize", () => engine.resize());
window.addEventListener(
  "pagehide",
  () => {
    controller?.dispose();
    scene.dispose();
    engine.dispose();
  },
  { once: true },
);
engine.runRenderLoop(() => {
  controller?.update(camera.target, select.value as RenderQuality);
  scene.render();
  if (controller && performance.now() - lastStatus >= 300) {
    lastStatus = performance.now();
    const stats = controller.stats();
    output.textContent = JSON.stringify(
      {
        ...stats,
        viewTarget: camera.target.asArray(),
        viewPosition: camera.position.asArray(),
        actualGpu: engine.getGlInfo().renderer,
      },
      null,
      2,
    );
    loading.textContent =
      stats.loadingNodes || stats.queuedNodes
        ? `Originální detail: ${stats.visibleHighestNodes} nejvyšších dlaždic; načítám ${stats.loadingNodes + stats.queuedNodes}.`
        : `Načteno: ${stats.visibleHighestNodes} nejvyšších dlaždic, ${stats.visibleTriangles.toLocaleString("cs-CZ")} viditelných trojúhelníků.`;
    error.textContent = stats.errors.join(" · ");
  }
});
try {
  controller = await loadPhotogrammetry(scene, {
    initialPosition: camera.target,
  });
} catch (cause) {
  error.textContent = cause instanceof Error ? cause.message : String(cause);
  loading.textContent =
    "Zdroj se nepodařilo načíst; model nebyl nahrazen vymyšlenou geometrií.";
}
