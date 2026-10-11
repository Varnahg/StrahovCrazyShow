import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { loadPhotogrammetry } from "../../client/photogrammetry";
import { createPhotogrammetryLighting } from "../../client/photogrammetry-lighting";
import manifestRaw from "../../shared/data/photogrammetry.json";
import type { PhotogrammetryManifest } from "../../shared/photogrammetry";

const canvas = document.querySelector<HTMLCanvasElement>("#night-scan")!;
const daylightInput =
  document.querySelector<HTMLInputElement>("#night-daylight")!;
const enabledInput =
  document.querySelector<HTMLInputElement>("#night-enabled")!;
const diagnostics = document.querySelector<HTMLElement>("#night-diagnostics")!;
const errorOutput = document.querySelector<HTMLElement>("#night-errors")!;
const engine = new Engine(
  canvas,
  true,
  { powerPreference: "high-performance" },
  false,
);
const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.018, 0.029, 0.055, 1);
scene.imageProcessingConfiguration.toneMappingEnabled = true;
scene.imageProcessingConfiguration.toneMappingType = 1;
const camera = new ArcRotateCamera(
  "Night source inspection",
  -0.2,
  1.3,
  36,
  new Vector3(14, 9, -55),
  scene,
);
camera.setPosition(new Vector3(43, 10, -60));
camera.minZ = 0.1;
camera.maxZ = 2500;
camera.lowerRadiusLimit = 1;
camera.upperRadiusLimit = 1000;
camera.wheelPrecision = 18;
camera.panningSensibility = 80;
camera.attachControl(canvas, true);
const manifest = manifestRaw as PhotogrammetryManifest;
const sourceIndex = new Map(manifest.nodes.map((node) => [node.id, node]));
const lighting = createPhotogrammetryLighting(scene, {
  manifest,
  lampLights: true,
});
const attached = new WeakSet<PBRMaterial>();
const shaderErrors: string[] = [];
const views: Record<string, { target: number[]; camera: number[] }> = {
  b6east: { target: [14, 9, -55], camera: [43, 10, -60] },
  b6west: { target: [-1, 9, -48], camera: [-28, 10, -51] },
  b5: { target: [-37, 10, -58], camera: [-13, 12, -70] },
  b10: { target: [276, 3, 80], camera: [300, 5, 75] },
  campus: { target: [30, 7, 1], camera: [180, 150, 175] },
};
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    const view = views[button.dataset.view!];
    camera.setTarget(Vector3.FromArray(view.target));
    camera.setPosition(Vector3.FromArray(view.camera));
  }),
);
// This inspection page does not edit the production loader. Every new source
// material is attached before the next render's material readiness/compilation.
scene.onBeforeRenderObservable.add(() => {
  for (const material of scene.materials) {
    if (!(material instanceof PBRMaterial) || attached.has(material)) continue;
    const id = /^IPR 2023 original mesh (\d+)$/.exec(material.name)?.[1];
    const node = id && sourceIndex.get(id);
    if (!node) continue;
    attached.add(material);
    material.onError = (_effect, message) => shaderErrors.push(message);
    lighting.attach(material, node);
  }
});
let controller: Awaited<ReturnType<typeof loadPhotogrammetry>> | undefined;
let lastDiagnostics = -Infinity;
const instant = Date.parse("2026-10-10T19:00:00Z");
engine.runRenderLoop(() => {
  const daylight = Number(daylightInput.value);
  controller?.setLighting(daylight);
  lighting.update({
    daylight: enabledInput.checked ? daylight : 1,
    player: camera.target,
    quality: "high",
    instant,
  });
  controller?.update(camera.target, "high");
  scene.clearColor.set(
    0.018 + daylight * 0.45,
    0.029 + daylight * 0.62,
    0.055 + daylight * 0.77,
    1,
  );
  scene.render();
  if (performance.now() - lastDiagnostics > 500) {
    lastDiagnostics = performance.now();
    diagnostics.textContent = JSON.stringify(
      {
        lighting: lighting.stats(),
        source: controller?.stats(),
        camera: camera.position.asArray(),
        target: camera.target.asArray(),
        actualGpu: engine.getGlInfo().renderer,
        shaderErrors,
        measuredGameFps: false,
      },
      null,
      2,
    );
    errorOutput.textContent = [
      ...shaderErrors,
      ...(controller?.stats().errors ?? []),
    ].join(" · ");
  }
});
window.addEventListener("resize", () => engine.resize());
window.addEventListener(
  "pagehide",
  () => {
    lighting.dispose();
    controller?.dispose();
    scene.dispose();
    engine.dispose();
  },
  { once: true },
);
try {
  controller = await loadPhotogrammetry(scene, {
    manifest,
    initialPosition: camera.target,
  });
} catch (error) {
  errorOutput.textContent =
    error instanceof Error ? error.message : String(error);
}
