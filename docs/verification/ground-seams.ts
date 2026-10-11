import type { Game as CurrentGame } from "../../client/game";
import { DEFAULT_AVATAR } from "../../shared/types";
import { MAP } from "../../shared/world";
import { groundHeight } from "../../shared/terrain";
import {
  LANDCOVER,
  pointInPolygon,
  surfaceElevation,
} from "../../shared/vegetation";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const sourceVariant =
  new URLSearchParams(document.location.search).get("source") === "j"
    ? "frozen-J-code-current-public-assets"
    : "working-code-current-public-assets";
const frozenGameUrl =
  "/.cache/performance-snapshot/faithful-world-repairs-20261011-j/client/game.ts";
const gameModule = sourceVariant.startsWith("frozen-J")
  ? await import(/* @vite-ignore */ frozenGameUrl)
  : await import("../../client/game");
const Game = gameModule.Game as {
  new (
    ...args: ConstructorParameters<typeof import("../../client/game").Game>
  ): CurrentGame;
};
const game = new Game(canvas, {
  nickname: "Kontrola styku podkladu",
  avatar: DEFAULT_AVATAR,
  interests: [],
  social: false,
  firstTime: false,
});
const select = document.querySelector<HTMLSelectElement>("#block")!;
const place = document.querySelector<HTMLButtonElement>("#place")!;
const report = document.querySelector<HTMLPreElement>("#report")!;
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const checkboxes = new Map(
  Array.from(
    document.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
    (input) => [input.id, input],
  ),
);
const enabled = (id: string) => checkboxes.get(id)!.checked;
const samples = {
  grass: { x: 65.37, z: -121.39, name: "CPU tráva / base, raw gap 2.4999mm" },
  road: { x: 70.37, z: -111.39, name: "CPU asfalt / tráva, raw gap 15.5000mm" },
  woods: { x: 146.37, z: -89.39, name: "CPU woods / base, raw gap 1.4999mm" },
  photo: {
    x: 87.37,
    z: 32.61,
    name: "CPU photo asphalt / tráva, raw gap 8.4999mm; units 0 / -1",
  },
};
let location: { x: number; z: number; name: string } | null = null;
let probe: { x: number; z: number } | null = null;
let nextReport = 0;
const pixels: { time: number; xy: number[]; rgba: number[]; bucket: string }[] =
  [];
const ground: { mesh: AbstractMesh; group: string }[] = [];
const grass: AbstractMesh[] = [];
const avatarRoots = new Set<TransformNode>();
const saved = new Map<
  PBRMaterial | StandardMaterial,
  {
    texture: PBRMaterial["albedoTexture"];
    color: Color3;
    flatColor: Color3;
    factor: number;
    units: number;
    bump?: boolean;
    unlit?: boolean;
    lighting?: boolean;
  }
>();
const actualGlBias: Record<string, unknown> = {};
const glFrame = new Map<AbstractMesh, number>();
const slopeMode = document.querySelector<HTMLSelectElement>("#slope-bias")!;
function relocate() {
  if (!location) return;
  const p = {
    x: location.x,
    z: location.z,
    y: groundHeight(location.x, location.z) + 0.9,
  };
  game.actor.setPosition(p);
  game.previousPosition.copyFromFloats(p.x, p.y, p.z);
  game.visualOffset.setAll(0);
  game.keys.clear();
  game.yaw = Math.PI / 2;
  game.pitch = 0.21;
  game.distance = 7;
  game.firstPerson = false;
  game.setUiModal(false);
  pixels.length = 0;
}
function prepare() {
  const building = MAP.buildings.find((b) =>
    b.name?.match(new RegExp("blok " + select.value + "$", "i")),
  );
  if (!building) throw Error("Mapped block missing");
  const xs = building.points.map((p) => p[0]),
    zs = building.points.map((p) => p[1]);
  const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
  const edgeXs: number[] = [];
  for (let i = 0; i < building.points.length; i++) {
    const a = building.points[i],
      b = building.points[(i + 1) % building.points.length];
    if (a[1] > midZ !== b[1] > midZ)
      edgeXs.push(a[0] + ((midZ - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  location = {
    x:
      Math.min(...(edgeXs.length ? edgeXs : xs)) +
      Number(document.querySelector<HTMLSelectElement>("#foot-offset")!.value),
    z: midZ,
    name: building.name!,
  };
  probe = { x: location.x, z: location.z };
  location.x =
    probe.x -
    Number(document.querySelector<HTMLSelectElement>("#probe-distance")!.value);
  relocate();
}
function apply() {
  if (!game.ready) return;
  pixels.length = 0;
  game.scene.shadowsEnabled = enabled("shadows");
  for (const node of avatarRoots) node.setEnabled(!enabled("hide-avatar"));
  for (const { mesh, group } of ground) {
    mesh.setEnabled(enabled(group));
    const material = mesh.material;
    if (
      !(material instanceof PBRMaterial) &&
      !(material instanceof StandardMaterial)
    )
      continue;
    let original = saved.get(material);
    if (!original) {
      const color = Color3.FromHexString(
        group === "terrain"
          ? "#315e45"
          : group === "roads"
            ? "#7e8791"
            : group === "photo"
              ? "#c58b43"
              : mesh.name.includes("#788268")
                ? "#a4ce44"
                : "#2a49a6",
      );
      const surface =
        material instanceof PBRMaterial
          ? {
              texture: material.albedoTexture,
              color: material.albedoColor.clone(),
              bump: material.disableBumpMap,
              unlit: material.unlit,
            }
          : {
              texture: material.diffuseTexture,
              color: material.diffuseColor.clone(),
              lighting: material.disableLighting,
            };
      original = {
        ...surface,
        flatColor:
          material instanceof PBRMaterial ? color.toLinearSpace() : color,
        factor: material.zOffset,
        units: material.zOffsetUnits,
      };
      saved.set(material, original);
    }
    material.zOffset = slopeMode.value === "zero" ? 0 : original.factor;
    material.zOffsetUnits = original.units;
    if (material instanceof PBRMaterial) {
      material.disableBumpMap =
        enabled("flat") || !enabled("normals") ? true : original.bump!;
      material.albedoTexture = enabled("flat") ? null : original.texture;
      material.unlit = enabled("flat") ? true : original.unlit!;
      material.albedoColor.copyFrom(
        enabled("flat") ? original.flatColor : original.color,
      );
    } else {
      material.diffuseTexture = enabled("flat") ? null : original.texture;
      material.disableLighting = enabled("flat") ? true : original.lighting!;
      material.diffuseColor.copyFrom(
        enabled("flat") ? original.flatColor : original.color,
      );
    }
  }
}
place.onclick = prepare;
slopeMode.onchange = apply;
document.querySelector<HTMLSelectElement>("#foot-offset")!.onchange = prepare;
quality.onchange = () => {
  game.setQuality(quality.value);
  apply();
};
for (const checkbox of checkboxes.values()) checkbox.onchange = apply;
document.querySelector<HTMLButtonElement>("#sample-place")!.onclick = () => {
  const sample =
    samples[
      document.querySelector<HTMLSelectElement>("#sample")!
        .value as keyof typeof samples
    ];
  location = {
    x:
      sample.x -
      Number(
        document.querySelector<HTMLSelectElement>("#probe-distance")!.value,
      ),
    z: sample.z,
    name: sample.name,
  };
  probe = { x: sample.x, z: sample.z };
  relocate();
};
game.setQuality(quality.value);
game.timeOverride = Date.parse("2026-10-11T10:00:00Z");
game.scene.onNewTransformNodeAddedObservable.add((node) => {
  if (node.name.startsWith("avatar ")) {
    avatarRoots.add(node);
    node.setEnabled(!enabled("hide-avatar"));
  }
});
game.scene.onBeforeRenderObservable.add(() => {
  if (!enabled("grass")) for (const mesh of grass) mesh.setEnabled(false);
  if (enabled("flat"))
    for (const [material, original] of saved) {
      if (material instanceof PBRMaterial)
        material.albedoColor.copyFrom(original.flatColor);
      else material.diffuseColor.copyFrom(original.flatColor);
    }
});

document.querySelector<HTMLSelectElement>("#probe-distance")!.onchange = () => {
  if (location && probe) {
    location.x =
      probe.x -
      Number(
        document.querySelector<HTMLSelectElement>("#probe-distance")!.value,
      );
    relocate();
  }
};
game.scene.onAfterRenderObservable.add(() => {
  if (!game.ready || !probe || !enabled("pixel")) return;
  const gl = canvas.getContext("webgl2");
  if (!gl || gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) return;
  const width = game.engine.getRenderWidth(),
    height = game.engine.getRenderHeight();
  const projected = Vector3.Project(
    new Vector3(probe.x, groundHeight(probe.x, probe.z) + 0.003, probe.z),
    Matrix.Identity(),
    game.scene.getTransformMatrix(),
    game.camera.viewport.toGlobal(width, height),
  );
  const x = Math.floor(projected.x),
    y = height - 1 - Math.floor(projected.y);
  if (
    x < 0 ||
    x >= width ||
    y < 0 ||
    y >= height ||
    projected.z < 0 ||
    projected.z > 1
  )
    return;
  const rgba = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  pixels.push({
    time: performance.now(),
    xy: [x, y],
    rgba: Array.from(rgba),
    bucket: Array.from(rgba.subarray(0, 3))
      .map((v) => Math.round(v / 8))
      .join(":"),
  });
  if (pixels.length > 128) pixels.shift();
});
game.engine.onBeginFrameObservable.add(() => {
  if (!game.ready) return;
  if (location && enabled("orbit"))
    game.yaw = Math.PI / 2 + Math.sin(performance.now() / 1400) * 0.055;
  if (performance.now() < nextReport) return;
  nextReport = performance.now() + 250;
  const p = game.actor.position;
  const layers = LANDCOVER.areas
    .filter((a) => pointInPolygon(p.x, p.z, a.points))
    .map((a) => ({
      id: a.osmId,
      kind: a.kind,
      surface: a.surface,
      offset: surfaceElevation(a),
    }));
  const gl = canvas.getContext("webgl2");
  report.textContent = JSON.stringify(
    {
      diagnosticOnly: true,
      sourceVariant,
      ready: game.ready,
      location,
      probe,
      position: p,
      cameraYaw: game.yaw,
      cameraPosition: game.camera.position.asArray(),
      viewMatrix: Array.from(game.camera.getViewMatrix().asArray()),
      projectionMatrix: Array.from(game.camera.getProjectionMatrix().asArray()),
      quality: game.quality,
      renderErrors: game.renderErrorCount,
      assetErrors: game.assetLoadErrorCount,
      depthBits: gl?.getParameter(gl.DEPTH_BITS),
      shadows: game.scene.shadowsEnabled,
      flat: enabled("flat"),
      normalMaps: enabled("normals"),
      slopeBias: {
        mode: slopeMode.value,
        unitsPreserved: true,
        productionGeometryChanged: false,
      },
      layers,
      groundMeshes: ground.map(({ mesh, group }) => ({
        name: mesh.name,
        group,
        enabled: mesh.isEnabled(),
        bias: mesh.material?.zOffset,
        units: mesh.material?.zOffsetUnits,
        originalBias:
          mesh.material &&
          saved.has(mesh.material as PBRMaterial | StandardMaterial)
            ? {
                factor: saved.get(
                  mesh.material as PBRMaterial | StandardMaterial,
                )!.factor,
                units: saved.get(
                  mesh.material as PBRMaterial | StandardMaterial,
                )!.units,
              }
            : undefined,
      })),
      actualGlBias,
      pixelProbe: {
        frames: pixels.length,
        quantizedColors: new Set(pixels.map((p) => p.bucket)).size,
        last: pixels.slice(-12),
        note: "Actual framebuffer sample of projected approximate ground point. Fog, grass, occlusion, camera pixel rounding and lighting may also change its color; not an automatic z-fighting diagnosis.",
      },
      cpuAudit: {
        path: ".cache/ground-layer-study/height-audit.json",
        samples: 70315,
        sourceStable: true,
        heightCrossingsFound: false,
        sameBiasSubLsbPairsInRecordedK3View: 0,
        limits:
          "1m grid misses narrow seams; K3 camera differs from this placed view; no GPU depth-readback proof",
      },
    },
    null,
    2,
  );
});
await game.start();
for (const node of game.scene.transformNodes)
  if (node.parent === null && node.name.startsWith("avatar "))
    avatarRoots.add(node);
for (const mesh of game.scene.meshes) {
  const group =
    mesh.name === "source-dmr5g-terrain"
      ? "terrain"
      : mesh.metadata?.vegetation === "mapped-surface"
        ? "landcover"
        : mesh.name.startsWith("mapped-surfaces:")
          ? "roads"
          : mesh.material?.name === "photo:central-asphalt"
            ? "photo"
            : null;
  if (group && mesh instanceof Mesh) {
    ground.push({ mesh, group });
    mesh.onAfterRenderObservable.add(() => {
      if (!enabled("pixel") || glFrame.get(mesh) === game.scene.getFrameId())
        return;
      glFrame.set(mesh, game.scene.getFrameId());
      const gl = canvas.getContext("webgl2");
      if (gl)
        actualGlBias[mesh.name] = {
          factor: gl.getParameter(gl.POLYGON_OFFSET_FACTOR),
          units: gl.getParameter(gl.POLYGON_OFFSET_UNITS),
          enabled: gl.isEnabled(gl.POLYGON_OFFSET_FILL),
          depthFunc: gl.getParameter(gl.DEPTH_FUNC),
        };
    });
  }
  if (mesh.metadata?.vegetation === "grass") grass.push(mesh);
}
apply();
place.disabled = false;
document.querySelector<HTMLButtonElement>("#sample-place")!.disabled = false;
prepare();
addEventListener("pagehide", () => game.dispose(), { once: true });
