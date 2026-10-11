import "/client/render-shaders.ts";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "/client/avatar-renderer.ts";
import { AvatarAnimator } from "/client/animation.ts";
import { AvatarAnimator as BeforeAnimator } from "./animation-before.ts";
import { AVATAR_PRESETS, applyAvatarPreset } from "/client/avatar-presets.ts";
import { DEFAULT_AVATAR } from "/shared/types.ts";

const canvas = document.querySelector("canvas")!,
  engine = new Engine(canvas, true, {
    powerPreference: "high-performance",
    stencil: false,
  }),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.19, 0.24, 0.27, 1);
const camera = new ArcRotateCamera(
  "locomotion review",
  0,
  1.4,
  5.5,
  new Vector3(0, 0.85, 0),
  scene,
);
camera.fov = 0.6;
camera.minZ = 0.03;
camera.attachControl(canvas, true);
const hemi = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.9;
hemi.groundColor = new Color3(0.23, 0.22, 0.2);
const sun = new DirectionalLight("sun", new Vector3(-0.6, -1, -0.8), scene);
sun.intensity = 1.8;
sun.diffuse = new Color3(1, 0.92, 0.82);
const groundMaterial = new StandardMaterial("matte pavement", scene);
groundMaterial.diffuseColor = new Color3(0.26, 0.29, 0.3);
groundMaterial.specularColor = Color3.Black();
let groundMeshes: any[] = [];
let terrain = "flat";
function floor(x: number, z: number) {
  return terrain === "slope"
    ? 0.12 * z
    : terrain === "stairs"
      ? 0.15 * Math.floor(Math.max(0, z) / 0.35)
      : 0;
}
function buildGround() {
  for (const m of groundMeshes) m.dispose();
  groundMeshes = [];
  if (terrain === "stairs") {
    for (let i = 0; i < 60; i++) {
      const b = MeshBuilder.CreateBox(
        "tread " + i,
        { width: 8, depth: 0.35, height: 0.15 * i + 0.2 },
        scene,
      );
      b.position.set(0, (0.15 * i) / 2 - 0.1, (i + 0.5) * 0.35);
      b.material = groundMaterial;
      groundMeshes.push(b);
    }
  } else {
    const b = MeshBuilder.CreateGround(
      "road",
      { width: 8, height: 1000 },
      scene,
    );
    b.position.z = 400;
    if (terrain === "slope") {
      b.rotation.x = -Math.atan(0.12);
      b.position.y = 48;
    }
    b.material = groundMaterial;
    groundMeshes.push(b);
  }
}
const pool = new AvatarPrimitivePool(scene);
let before: any,
  after: any,
  beforeAnim: any,
  afterAnim: any,
  preset = 0,
  pose = "idle",
  travel = 0,
  yaw = 0,
  paused = false,
  time = 0,
  shaderError: string | null = null,
  frames = 0,
  poseTime = 0;
const beforeDisplay = new TransformNode("before display offset only", scene),
  afterDisplay = new TransformNode("after display offset only", scene);
const hist = { before: [] as number[], after: [] as number[] };
const transient = { before: [] as number[], after: [] as number[] };
function resetHistory() {
  hist.before = [];
  hist.after = [];
  transient.before = [];
  transient.after = [];
  poseTime = 0;
}
function build() {
  before?.root.dispose();
  after?.root.dispose();
  const config = applyAvatarPreset(preset, DEFAULT_AVATAR);
  before = createAvatarRig(scene, config, pool, "before");
  after = createAvatarRig(scene, config, pool, "after");
  before.root.parent = beforeDisplay;
  after.root.parent = afterDisplay;
  beforeAnim = new BeforeAnimator(before);
  afterAnim = new AvatarAnimator(after);
  pool.pruneUnused();
  for (const m of scene.materials)
    m.onError = (_, e) => {
      shaderError = e;
    };
  resetHistory();
  frames = 0;
  travel = 0;
  time = 0;
  yaw = 0;
}
function button(container: string, label: string, fn: () => void) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = fn;
  document.querySelector(container)!.append(b);
}
for (const [label, key] of [
  ["Klid", "idle"],
  ["Chůze 1,8 m/s", "walk"],
  ["Běh 4,6 m/s", "run"],
  ["Sprint 7 m/s", "sprint"],
  ["Otáčení", "turn"],
  ["Rozběh a zastavení", "stop"],
  ["Zamávání", "wave"],
])
  button("#actions", label, () => {
    pose = key;
    paused = false;
    time = 0;
    resetHistory();
  });
for (const [label, alpha] of [
  ["Profil", 0],
  ["Čelně", Math.PI / 2],
  ["Záda", -Math.PI / 2],
  ["Tři čtvrtiny", 0.8],
])
  button("#views", label, () => {
    camera.alpha = alpha;
    camera.beta = 1.4;
    camera.radius = 5.5;
  });
for (const [i, p] of AVATAR_PRESETS.entries()) {
  const o = document.createElement("option");
  o.value = String(i);
  o.textContent = p.name;
  document.querySelector("#preset")!.append(o);
}
document.querySelector("#preset")!.addEventListener("change", (e) => {
  preset = Number((e.target as HTMLSelectElement).value);
  build();
});
document.querySelector("#terrain")!.addEventListener("change", (e) => {
  terrain = (e.target as HTMLSelectElement).value;
  buildGround();
  build();
});
document
  .querySelector("#pause")!
  .addEventListener("click", () => (paused = !paused));
document.querySelector("#step")!.addEventListener("click", () => {
  paused = true;
  animate(1 / 60);
  scene.render();
});
document.querySelector("#steady")!.addEventListener("click", () => {
  for (let i = 0; i < 240; i++) animate(1 / 60);
  hist.before = [];
  hist.after = [];
  poseTime = 4;
  paused = false;
});
function displayLayout() {
  for (const [node, side] of [
    [beforeDisplay, -1],
    [afterDisplay, 1],
  ] as const)
    node.position.set(
      side * 0.7 * Math.sin(camera.alpha),
      0,
      -side * 0.7 * Math.cos(camera.alpha),
    );
}
function animate(dt: number) {
  time += dt;
  poseTime += dt;
  const speed =
    pose === "walk" || pose === "turn"
      ? 1.8
      : pose === "run"
        ? 4.6
        : pose === "sprint"
          ? 7
          : pose === "stop"
            ? time % 8 < 4
              ? 4.6
              : 0
            : 0;
  travel += speed * dt;
  if (travel > (terrain === "stairs" ? 18 : 800)) {
    travel = 0;
    beforeAnim.reset();
    afterAnim.reset();
    resetHistory();
  }
  yaw = pose === "turn" ? 0.7 * Math.sin(time * 0.8) : 0;
  displayLayout();
  for (const [rig, anim, key] of [
    [before, beforeAnim, "before"],
    [after, afterAnim, "after"],
  ] as const) {
    const position = { x: 0, y: floor(0, travel), z: travel };
    rig.root.position.set(position.x, position.y, position.z);
    anim.update(
      {
        position,
        yaw,
        grounded: true,
        groundHeight: floor,
        emote: pose === "wave" ? "👋" : undefined,
      },
      dt,
    );
    rig.head.computeWorldMatrix(true);
    const list = poseTime < 3 ? transient[key] : hist[key];
    list.push(rig.head.getAbsolutePosition().y - position.y);
    if (list.length > 600) list.shift();
  }
  before.root.setEnabled(
    (document.querySelector("#before") as HTMLInputElement).checked,
  );
  camera.target.set(0, floor(0, travel) + 0.85, travel);
  frames++;
}
buildGround();
build();
let last = performance.now(),
  next = 0;
engine.runRenderLoop(() => {
  const now = performance.now(),
    dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) animate(dt);
  displayLayout();
  scene.render();
  if (now > next) {
    next = now + 200;
    const range = (s: number[]) =>
      s.length ? Math.max(...s) - Math.min(...s) : 0;
    document.querySelector("#metrics")!.textContent = JSON.stringify(
      {
        ready: scene.isReady(),
        pose,
        terrain,
        preset: AVATAR_PRESETS[preset].name,
        paused,
        frames,
        poseTime,
        gpu: engine.getGlInfo().renderer,
        shaderError,
        afterGait: afterAnim.gait,
        afterSpeed: afterAnim.speed,
        travel,
        transientHeadRangeBefore: range(transient.before),
        transientHeadRangeAfter: range(transient.after),
        steadySamples: hist.after.length,
        steadyHeadRangeBefore: range(hist.before),
        steadyHeadRangeAfter: range(hist.after),
        baseline: "archived animation before change",
        source:
          "live production rig + AvatarAnimator; kinematic preview, no multiplayer/physics/HUD/FPS proof",
      },
      null,
      2,
    );
  }
});
addEventListener("resize", () => engine.resize());
