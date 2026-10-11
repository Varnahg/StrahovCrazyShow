import "/client/render-shaders.ts";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  AvatarPrimitivePool,
  createAvatarRig,
  type AvatarRig,
} from "/client/avatar-renderer.ts";
import { AvatarAnimator } from "/client/animation.ts";
import { AvatarAnimator as BeforeAnimator } from "./animation-p3.ts";
import { AvatarLodController } from "/client/avatar-lod.ts";
import { SceneTextureDiagnostics } from "/client/texture-diagnostics.ts";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { AVATAR_PRESETS, applyAvatarPreset } from "/client/avatar-presets.ts";
import { DEFAULT_AVATAR } from "/shared/types.ts";
import { groundHeight } from "/shared/terrain.ts";
import { FIXED_DT } from "/shared/netcode.ts";
import {
  createJumpClip,
  type JumpClip,
  type JumpClipFrame,
} from "../../../tests/helpers/jump-animation-fixture.ts";

const canvas = document.querySelector("canvas")!,
  engine = new Engine(canvas, true, {
    powerPreference: "high-performance",
    stencil: false,
  }),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
const textures = new SceneTextureDiagnostics(scene);
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
let groundMeshes: Mesh[] = [];
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
  if (jumpClip && pose === "jump") {
    const xs = jumpClip.frames.map((f) => f.position.x),
      zs = jumpClip.frames.map((f) => f.position.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
      cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const mesh = MeshBuilder.CreateGround(
      "canonical ground under Rapier clip",
      {
        width: Math.max(...xs) - Math.min(...xs) + 6,
        height: Math.max(...zs) - Math.min(...zs) + 6,
        subdivisions: 36,
        updatable: true,
      },
      scene,
    );
    const positions = Array.from(
      mesh.getVerticesData(VertexBuffer.PositionKind)!,
    );
    for (let i = 0; i < positions.length; i += 3)
      positions[i + 1] = groundHeight(cx + positions[i], cz + positions[i + 2]);
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, mesh.getIndices()!, normals);
    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    mesh.refreshBoundingInfo();
    mesh.position.set(cx, 0, cz);
    mesh.material = groundMaterial;
    groundMeshes.push(mesh);
    return;
  }
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
let before: AvatarRig,
  after: AvatarRig,
  beforeAnim: BeforeAnimator,
  afterAnim: AvatarAnimator,
  beforeLod: AvatarLodController,
  afterLod: AvatarLodController,
  preset = 0,
  pose = "idle",
  travel = 0,
  travelX = 0,
  travelZ = 0,
  yaw = 0,
  paused = false,
  time = 0,
  shaderError: string | null = null,
  frames = 0,
  poseTime = 0,
  playback = 1,
  level = "near";
let jumpClip: JumpClip | undefined,
  jumpIndex = -1,
  jumpTime = 0,
  jumpPlayhead = 0,
  jumpLoading = false,
  jumpRequest = 0,
  jumpError: string | null = null;
let jumpFrame: JumpClipFrame | undefined;
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
  beforeLod?.dispose();
  afterLod?.dispose();
  before?.root.dispose();
  after?.root.dispose();
  const config = applyAvatarPreset(preset, DEFAULT_AVATAR);
  before = createAvatarRig(scene, config, pool, "before");
  after = createAvatarRig(scene, config, pool, "after");
  before.root.parent = beforeDisplay;
  after.root.parent = afterDisplay;
  beforeAnim = new BeforeAnimator(before);
  afterAnim = new AvatarAnimator(after);
  beforeLod = new AvatarLodController(scene, pool, before, config);
  afterLod = new AvatarLodController(scene, pool, after, config);
  pool.pruneUnused();
  for (const m of scene.materials)
    m.onError = (_, e) => {
      shaderError = e;
    };
  resetHistory();
  frames = 0;
  travel = 0;
  travelX = travelZ = 0;
  time = 0;
  yaw = 0;
  if (jumpClip && pose === "jump") {
    jumpIndex = -1;
    seekJump(jumpTime);
  }
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
  ["Krátké rozběhy", "pulse"],
  ["Chůze → běh", "shift"],
  ["Zamávání", "wave"],
])
  button("#actions", label, () => {
    const wasJump = pose === "jump";
    pose = key;
    if (wasJump) {
      buildGround();
      build();
    }
    paused = false;
    time = 0;
    resetHistory();
  });
for (const [label, alpha] of [
  ["Profil", 0],
  ["Čelně", Math.PI / 2],
  ["Záda", -Math.PI / 2],
  ["Tři čtvrtiny", 0.8],
] as const)
  button("#views", label, () => {
    // Arc alpha runs from +X toward +Z; rig yaw turns +Z toward +X.
    camera.alpha = alpha - (pose === "jump" ? (jumpFrame?.yaw ?? 0) : 0);
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
document.querySelector("#restart")!.addEventListener("click", () => {
  if (pose === "jump" && jumpClip) {
    paused = true;
    seekJump(jumpClip.frames[0].time);
  } else build();
});
document.querySelector("#playback")!.addEventListener("change", (event) => {
  playback = Number((event.target as HTMLSelectElement).value);
});
document.querySelector("#lod")!.addEventListener("change", (event) => {
  level = (event.target as HTMLSelectElement).value;
});
document.querySelector("#step")!.addEventListener("click", () => {
  paused = true;
  animate(1 / 60);
  render();
});
async function loadJump(mode: "standing" | "run") {
  const request = ++jumpRequest;
  jumpLoading = true;
  jumpError = null;
  paused = true;
  document.querySelector("#jump-status")!.textContent =
    "Připravuji skutečnou Rapier trajektorii…";
  try {
    const clip = await createJumpClip({ mode, jumpTick: 94 });
    if (disposed || request !== jumpRequest) {
      clip.dispose();
      return;
    }
    jumpClip?.dispose();
    jumpClip = clip;
    pose = "jump";
    jumpTime = clip.frames[Math.max(0, clip.takeoff - 15)].time;
    (document.querySelector("#before") as HTMLInputElement).checked = false;
    const slider = document.querySelector("#jump-time") as HTMLInputElement;
    slider.max = String(clip.frames.at(-1)!.time);
    slider.disabled = false;
    buildGround();
    build();
    camera.alpha = -(jumpFrame?.yaw ?? 0);
    camera.beta = 1.4;
    camera.radius = 4.5;
  } catch (error) {
    jumpError = String(error);
  } finally {
    if (request === jumpRequest) {
      jumpLoading = false;
      updateJumpControls();
    }
  }
}
function updateJumpControls() {
  const slider = document.querySelector("#jump-time") as HTMLInputElement;
  slider.value = String(jumpTime);
  document.querySelector("#jump-time-value")!.textContent =
    `${jumpTime.toFixed(3)} s`;
  document.querySelector("#jump-status")!.textContent =
    jumpError ??
    (jumpLoading
      ? "Připravuji trajektorii…"
      : jumpFrame
        ? `Rapier po kroku ${jumpIndex + 1}: ${jumpFrame.grounded ? "na zemi" : "ve vzduchu"}, vy=${jumpFrame.vertical.toFixed(2)} m/s`
        : "Zvol skok z klidu nebo běhu.");
}
function seekJump(time: number, controls = true) {
  if (!jumpClip) return;
  const target = Math.max(
    0,
    Math.min(jumpClip.frames.length - 1, Math.round(time / FIXED_DT) - 1),
  );
  if (target < jumpIndex || jumpIndex < 0) {
    beforeAnim.reset();
    afterAnim.reset();
    jumpIndex = -1;
  }
  for (let index = jumpIndex + 1; index <= target; index++) {
    const frame = jumpClip.frames[index];
    for (const [rig, animator] of [
      [before, beforeAnim],
      [after, afterAnim],
    ] as const) {
      rig.root.position.set(
        frame.position.x,
        frame.position.y,
        frame.position.z,
      );
      animator.update(
        {
          ...frame,
          groundHeight: (x, z) => jumpClip!.floorHeight(x, z, frame.position.y),
        },
        FIXED_DT,
      );
    }
  }
  jumpIndex = target;
  jumpFrame = jumpClip.frames[target];
  jumpTime = jumpFrame.time;
  jumpPlayhead = time;
  yaw = jumpFrame.yaw;
  frames = target + 1;
  poseTime = jumpTime;
  camera.target.set(
    jumpFrame.position.x,
    jumpFrame.position.y + 0.9,
    jumpFrame.position.z,
  );
  if (controls) updateJumpControls();
}
button("#jump-actions", "Skok z klidu", () => {
  void loadJump("standing");
});
button("#jump-actions", "Skok z běhu", () => {
  void loadJump("run");
});
for (const [label, key] of [
  ["Odraz", "takeoff"],
  ["Vrchol", "apex"],
  ["Doskok", "landing"],
] as const)
  button("#jump-events", label, () => {
    if (jumpClip) {
      paused = true;
      seekJump(jumpClip.frames[jumpClip[key]].time);
    }
  });
document.querySelector("#jump-time")!.addEventListener("input", (event) => {
  paused = true;
  seekJump(Number((event.target as HTMLInputElement).value));
});
document.querySelector("#steady")!.addEventListener("click", () => {
  for (let i = 0; i < 240; i++) animate(1 / 60);
  hist.before = [];
  hist.after = [];
  poseTime = 4;
  paused = false;
});
function displayLayout() {
  const comparison = (document.querySelector("#before") as HTMLInputElement)
    .checked;
  for (const [node, side] of [
    [beforeDisplay, -1],
    [afterDisplay, 1],
  ] as const)
    node.position.set(
      comparison ? side * 0.7 * Math.sin(camera.alpha) : 0,
      0,
      comparison ? -side * 0.7 * Math.cos(camera.alpha) : 0,
    );
}
function animate(dt: number) {
  if (pose === "jump" && jumpClip) {
    const nextTime = Math.min(jumpClip.frames.at(-1)!.time, jumpPlayhead + dt);
    seekJump(nextTime, false);
    if (nextTime >= jumpClip.frames.at(-1)!.time) paused = true;
    return;
  }
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
            ? time % 6 >= 0.75 && time % 6 < 3
              ? 4.6
              : 0
            : pose === "pulse"
              ? (time % 2 >= 0.5 && time % 2 < 0.95) ||
                (time % 2 >= 1.1 && time % 2 < 1.65)
                ? 4.6
                : 0
              : pose === "shift"
                ? time % 6 < 2
                  ? 1.8
                  : time % 6 < 4
                    ? 4.6
                    : 7
                : 0;
  yaw = pose === "turn" ? 0.7 * Math.sin(time * 0.8) : 0;
  travel += speed * dt;
  travelX += Math.sin(yaw) * speed * dt;
  travelZ += Math.cos(yaw) * speed * dt;
  if (travel > (terrain === "stairs" ? 18 : 800)) {
    travel = 0;
    travelX = travelZ = 0;
    beforeAnim.reset();
    afterAnim.reset();
    resetHistory();
  }
  displayLayout();
  for (const [rig, anim, key] of [
    [before, beforeAnim, "before"],
    [after, afterAnim, "after"],
  ] as const) {
    const position = { x: travelX, y: floor(travelX, travelZ), z: travelZ };
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
  camera.target.set(travelX, floor(travelX, travelZ) + 0.85, travelZ);
  frames++;
}
buildGround();
build();
let last = performance.now(),
  next = 0;
function render() {
  before.root.setEnabled(
    (document.querySelector("#before") as HTMLInputElement).checked,
  );
  for (const [rig, lod] of [
    [before, beforeLod],
    [after, afterLod],
  ] as const)
    lod.update({
      distance: level === "near" ? 0 : 20,
      quality: "low",
      position: rig.root.position,
      yaw,
    });
  scene.render();
}
function jumpFk(rig: AvatarRig) {
  rig.root.computeWorldMatrix(true);
  const inverse = Matrix.Invert(rig.root.getWorldMatrix());
  const local = (node: AvatarRig["hips"]) => {
    node.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(
      node.getAbsolutePosition(),
      inverse,
    ).asArray();
  };
  return {
    root: rig.root.position.asArray(),
    pelvis: local(rig.hips),
    left: {
      hip: local(rig.left),
      knee: local(rig.leftKnee),
      ankle: local(rig.leftFoot),
    },
    right: {
      hip: local(rig.right),
      knee: local(rig.rightKnee),
      ankle: local(rig.rightFoot),
    },
  };
}
engine.runRenderLoop(() => {
  const now = performance.now(),
    dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) animate(dt * playback);
  displayLayout();
  render();
  if (now > next) {
    next = now + 200;
    if (pose === "jump") updateJumpControls();
    const range = (s: number[]) =>
      s.length ? Math.max(...s) - Math.min(...s) : 0;
    document.querySelector("#metrics")!.textContent = JSON.stringify(
      {
        ready: scene.isReady(),
        pose,
        terrain,
        preset: AVATAR_PRESETS[preset].name,
        lod: afterLod.level,
        playback,
        paused,
        frames,
        poseTime,
        gpu: engine.getGlInfo().renderer,
        shaderError,
        textureLoadErrors: textures.count,
        canvasCss: { width: canvas.clientWidth, height: canvas.clientHeight },
        canvasInternal: {
          width: engine.getRenderWidth(),
          height: engine.getRenderHeight(),
        },
        afterGait: afterAnim.gait,
        afterSpeed: afterAnim.speed,
        jump:
          pose === "jump"
            ? {
                time: jumpTime,
                frame: jumpIndex,
                grounded: jumpFrame?.grounded,
                vertical: jumpFrame?.vertical,
                aligned: true,
                loading: jumpLoading,
                error: jumpError,
                before: jumpFk(before),
                after: jumpFk(after),
              }
            : null,
        travel,
        transientHeadRangeBefore: range(transient.before),
        transientHeadRangeAfter: range(transient.after),
        steadySamples: hist.after.length,
        steadyHeadRangeBefore: range(hist.before),
        steadyHeadRangeAfter: range(hist.after),
        baseline:
          "P3 before jump repair; animation-p3.ts (type imports relocated only)",
        source:
          "live production rig + AvatarAnimator; jump uses recorded actual Rapier Actor/KCC with aligned post-step state; no GPU FPS proof",
      },
      null,
      2,
    );
  }
});
const resize = () => engine.resize();
addEventListener("resize", resize);
let disposed = false;
addEventListener(
  "pagehide",
  () => {
    if (disposed) return;
    disposed = true;
    jumpRequest++;
    jumpClip?.dispose();
    engine.stopRenderLoop();
    removeEventListener("resize", resize);
    camera.detachControl();
    beforeLod.dispose();
    afterLod.dispose();
    before.root.dispose();
    after.root.dispose();
    textures.dispose();
    pool.dispose();
    scene.dispose();
    engine.dispose();
  },
  { once: true },
);
addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
