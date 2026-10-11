import { Game } from "../../client/game";
import { DEFAULT_AVATAR } from "../../shared/types";
import { groundHeight } from "../../shared/terrain";
import { buildRoadDetailPlan } from "../../shared/road-details";
import { nearestStreet } from "../../shared/streets";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
const report = document.querySelector<HTMLPreElement>("#report")!;
const view = document.querySelector<HTMLSelectElement>("#view")!;
const light = document.querySelector<HTMLSelectElement>("#light")!;
const weather = document.querySelector<HTMLSelectElement>("#weather")!;
const quality = document.querySelector<HTMLSelectElement>("#quality")!;
const plan = buildRoadDetailPlan();
const game = new Game(canvas, {
  nickname: "Kontrola ulic",
  avatar: DEFAULT_AVATAR,
  interests: [],
  social: false,
  firstTime: false,
});
let pose = { camera: new Vector3(), target: new Vector3() };
const point = (x: number, z: number, elevation: number) =>
  new Vector3(x, groundHeight(x, z) + elevation, z);
function apply() {
  game.timeOverride = Date.parse(
    light.value === "night" ? "2026-10-11T00:00:00Z" : "2026-10-11T10:00:00Z",
  );
  game.setQuality(quality.value);
  game.setWeather({
    temperature: 12,
    wind: 1.8,
    windDirection: 270,
    rain: weather.value === "wet" ? 2 : 0,
    cloud: weather.value === "dry" ? 0.2 : 1,
    observedAt: null,
    fetchedAt: game.timeOverride,
    source: "Kontrolované podmínky náhledu; nejsou pozorované počasí",
    cloudSource: "Kontrolované podmínky náhledu",
    stale: true,
    status: "fallback",
  });
  if (view.value === "corridor")
    pose = { camera: point(-119, -29, 1.75), target: point(-124, 65, 1.3) };
  if (view.value === "bike") {
    const center = (row: (typeof plan.paint)[number]) => row.points.reduce(
      (sum,p)=>({x:sum.x+p[0]/row.points.length,z:sum.z+p[1]/row.points.length}),{x:0,z:0});
    const nearestGlyph=plan.paint.filter(p=>p.kind==='bicycle').sort((a,b)=>{
      const ca=center(a),cb=center(b);return Math.hypot(ca.x+126,ca.z+26)-Math.hypot(cb.x+126,cb.z+26);
    })[0];
    const glyph=center(nearestGlyph);
    pose={camera:point(glyph.x+6,glyph.z-2,15),target:point(glyph.x,glyph.z,0)};
  }
  if (view.value === "crossing")
    pose = { camera: point(-121.7, 26, 1.8), target: point(-124.5, 43, 0.35) };
  if (view.value === "surfaces")
    pose = { camera: point(-114, 68, 2.7), target: point(-121, 95, 0.2) };
  if (view.value === "parking") {
    const sign = plan.signs.find((s) => s.kind === "parking")!;
    const normal = new Vector3(-Math.sin(sign.yaw), 0, -Math.cos(sign.yaw));
    pose = {
      camera: point(sign.x + normal.x * 5, sign.z + normal.z * 5, 2.4),
      target: point(sign.x, sign.z, 2.2),
    };
  }
  if (view.value.startsWith("bus-")) {
    const sign = plan.signs.find((s) => s.id === "road-sign:stop:U981Z1P")!;
    const direction = view.value === "bus-front" ? 1 : -1;
    const normal = new Vector3(
      -Math.sin(sign.yaw) * direction,
      0,
      -Math.cos(sign.yaw) * direction,
    );
    pose = {
      camera: point(sign.x + normal.x * 3.3, sign.z + normal.z * 3.3, 2.35),
      target: point(sign.x, sign.z, 2.35),
    };
  }
  if (!game.ready) return;
  const road = nearestStreet(pose.target.x, pose.target.z, true)!;
  const x = road.x,
    z = road.z;
  const position = { x, y: groundHeight(x, z) + 0.9, z };
  game.actor.setPosition(position);
  game.previousPosition.copyFromFloats(position.x, position.y, position.z);
  game.visualOffset.setAll(0);
  game.keys.clear();
  game.setUiModal(true);
}
for (const select of [view, light, weather, quality])
  select.addEventListener("change", apply);
let nextReport = 0;
game.scene.onBeforeRenderObservable.add(() => {
  if (game.ready) {
    game.camera.position.copyFrom(pose.camera);
    game.camera.setTarget(pose.target);
  }
});
game.scene.onAfterRenderObservable.add(() => {
  if (performance.now() < nextReport) return;
  nextReport = performance.now() + 1000;
  const textures = game.scene.textures.filter(
    (t) =>
      t instanceof DynamicTexture &&
      (t.name.includes("road stencil") ||
        plan.signs.some(
          (s) => t.name === s.kind + ":" + s.name + ":" + s.routes,
        )),
  );
  report.textContent = JSON.stringify(
    {
      ready: game.ready,
      renderer: game.engine.getGlInfo().renderer,
      canvas: {
        css: [canvas.clientWidth, canvas.clientHeight],
        internal: [canvas.width, canvas.height],
      },
      view: view.value,
      instant: new Date(game.timeOverride!).toISOString(),
      weather: weather.value,
      quality: game.quality,
      renderErrorCount: game.renderErrorCount,
      assetLoadErrorCount: game.assetLoadErrorCount,
      paint: {
        lines: plan.paint.filter((p) => p.kind === "line").length,
        bicycles: plan.paint.filter((p) => p.kind === "bicycle").length,
        bus: plan.paint.filter((p) => p.kind === "bus").length,
        separateMeshes: game.scene.meshes
          .filter((m) => m.metadata?.roadPaint)
          .map((m) => m.name),
      },
      signs: plan.signs,
      canvasTextures: textures.map((t) => ({
        name: t.name,
        ready: t.isReady(),
        invertY: (t as DynamicTexture).invertY,
      })),
      materials: game.scene.materials
        .filter(
          (m) =>
            m instanceof PBRMaterial &&
            ["asphalt", "paving", "grass", "sett"].includes(
              m.metadata?.surfaceKind,
            ),
        )
        .map((m) => ({
          name: m.name,
          kind: m.metadata.surfaceKind,
          tint: (m as PBRMaterial).albedoColor.asArray(),
          roughness: (m as PBRMaterial).roughness,
          specular: (m as PBRMaterial).specularIntensity,
          metallic: (m as PBRMaterial).metallic,
        })),
      camera: {
        position: game.camera.position.asArray(),
        target: pose.target.asArray(),
      },
      note: "Real whole-world renderer in a controlled static view; this is not a multiplayer FPS result. Signs and paint dimensions are interpreted, not surveyed.",
    },
    null,
    2,
  );
});
apply();
await game.start();
apply();
addEventListener("pagehide", () => game.dispose(), { once: true });
