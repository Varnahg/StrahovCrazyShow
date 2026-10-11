import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { buildArchitectureReality } from "../../../client/architecture-reality";
import { BUILDINGS } from "../../../shared/world";
import { B6_REALITY_BOXES } from "../../../shared/b6-interior";
const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const engine = new Engine(canvas, true),
  scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0.53, 0.65, 0.72, 1);
const camera = new ArcRotateCamera(
  "review",
  0,
  1.35,
  40,
  Vector3.Zero(),
  scene,
);
camera.minZ = 0.1;
camera.maxZ = 1200;
camera.attachControl(canvas, true);
const sun = new DirectionalLight("sun", new Vector3(-0.4, -0.65, 0.7), scene);
sun.intensity = 1.1;
const ambient = new HemisphericLight("sky", Vector3.Up(), scene);
ambient.intensity = 0.65;
ambient.groundColor.set(0.36, 0.4, 0.3);
const ground = MeshBuilder.CreateGround(
  "review ground",
  { width: 1200, height: 1200 },
  scene,
);
ground.position.y = -0.03;
const groundMat = new StandardMaterial("quiet review ground", scene);
groundMat.diffuseColor = Color3.FromHexString("#899276");
groundMat.specularColor.setAll(0);
ground.material = groundMat;
const reality = buildArchitectureReality({
  scene,
  buildings: BUILDINGS.filter((b) =>
    [
      "53929057",
      "53929071",
      "53929068",
      "8111356",
      "53921168",
      "7645350",
    ].includes(b.id),
  ),
});
// Shared traversable room partitions keep this comparison from showing an
// empty shell through the new B6 transparent windows. Exterior faces/glass
// come exclusively from the architecture module.
for (const kind of ["floor", "wall", "stair"] as const) {
  const material = new StandardMaterial("comparison shared B6 " + kind, scene);
  material.diffuseColor = Color3.FromHexString(
    kind === "floor" ? "#978d7b" : kind === "stair" ? "#a1a69a" : "#d1cbbb",
  );
  material.specularColor.setAll(0.02);
  const meshes = B6_REALITY_BOXES.filter(
    (b) => b.kind === kind && b.role !== "shell",
  ).map((b) => {
    const mesh = MeshBuilder.CreateBox(
      "shared B6 partition",
      { width: b.w, height: b.h, depth: b.d },
      scene,
    );
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.y = b.yaw ?? 0;
    mesh.material = material;
    return mesh;
  });
  if (meshes.length)
    Mesh.MergeMeshes(meshes, true, true, undefined, false, true);
}
const views = [
  {
    id: "rko",
    name: "Potraviny / R-ko · východní štít",
    eye: [158, 2.8, -69],
    target: [138.9, 1.8, -64],
    reference:
      "https://mapy.com/cs/zakladni?q=Recharging%20bar&source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&ds=2&z=17&ovl=8",
    text: "Mapy.com / Cyclomedia · 1. 6. 2023. Čtyři malé horní otvory, spodní zamřížované ventilace a kulatý kouřovod. Barevné plochy jsou vlastní náznak malované fasády; přesné dílo neznámého autora nekopírujeme. Vchod R-ka zde není prokázaný.",
  },
  {
    id: "b6-north",
    name: "B6 · severní čelo",
    eye: [1, 5, -116],
    target: [8, 8, -88],
    reference:
      "https://www.google.com/maps/@?api=1&map_action=pano&pano=gWCshoWQgiJdy1QWcqe1eQ&heading=178.82123&pitch=20&fov=90",
    text: "Google Street View · září 2025. Blank betonové pilíře, úzký pás schodiště, malé páry oken. Interiérový shell B6 je zatím přibližný a bez zaměřeného pootočení OSM.",
  },
  {
    id: "b6-long",
    name: "B6 · dlouhá fasáda a špalety",
    eye: [39, 4, -49],
    target: [16, 5, -57],
    reference:
      "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=5",
    text: "ČVUT Jiří Ryszawy · 20. 6. 2024, snímek 6. Čtyřdílné hnědé rámy, parapety a vertikální pilastry. Sdílená typologie; snímek sám neprokazuje číslo tohoto bloku ani přesné rozměry.",
  },
  {
    id: "b6-entry",
    name: "B6 · otevřený průchod recepce",
    eye: [-19, 2.2, -81],
    target: [-6.9, 1.7, -73],
    reference: "https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg",
    text: "Vrátnice v západním rizalitu podle wiki plánu a panoramatu. Průchod 2,4 m zůstává otevřený pro fyziku. Přesné schody, nadmořská výška a interiér se ověřují samostatně.",
  },
  {
    id: "b4",
    name: "B4 · betonový štít a číslo",
    eye: [67, 6, 20],
    target: [85, 9, 43],
    reference:
      "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=0",
    text: "ČVUT · snímky 1, 2 a 8. Oddělené betonové štítové a omítkové dlouhé fasády. Malá okna patří komunikačnímu jádru; nejde o kolejní okna na všech plochách.",
  },
  {
    id: "b7",
    name: "B7 · jižní čelo a 007",
    eye: [86, 4, 1],
    target: [62, 7, -26],
    reference:
      "https://www.google.com/maps/@?api=1&map_action=pano&pano=2UCXwe4UgzW5bAoI5ZFssA&heading=348.27243&pitch=12&fov=90",
    text: "Google Street View · květen 2024. Klub 007 je u jihovýchodního schodiště, odděleně od recepce. Výběr souřadnice má nejistotu přibližně 4 m; portál je dekorativně zavřený.",
  },
  {
    id: "b12",
    name: "B12 · nižší třípodlažní typ",
    eye: [340, 4, 39],
    target: [306, 4, 44],
    reference:
      "https://commons.wikimedia.org/wiki/File:Strahov,_studentsk%C3%A1_kolej_%C4%8D.12.JPG",
    text: "Ondrej.konicek · 6. 10. 2009, CC BY-SA 3.0. Úzká vysoká okna s příčkou, pouze tři podlaží dle OSM. Historické poškození není vydáváno za současný stav.",
  },
  {
    id: "menza",
    name: "Menza · prosklení a obklad",
    eye: [99, 6, 112],
    target: [100, 4, 140],
    reference:
      "https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov#lg=1&slide=8",
    text: "ČVUT · snímek 9. Kovové členění vysoké prosklené fasády a světlý obklad. Výběr severního čela orientovaného do areálu je interpretace, rozsah vstupní části není zaměřen.",
  },
];
const buttons = document.querySelector("#views")!;
for (const view of views) {
  const button = document.createElement("button");
  button.textContent = view.name;
  button.dataset.view = view.id;
  button.onclick = () => select(view.id);
  buttons.appendChild(button);
}
function select(id: string) {
  const view = views.find((v) => v.id === id)!;
  camera.setTarget(Vector3.FromArray(view.target));
  camera.setPosition(Vector3.FromArray(view.eye));
  reality.update({ x: view.target[0], z: view.target[2] }, "high");
  document.querySelector("#caption")!.textContent = view.text;
  document.querySelector("#evidence")!.textContent = view.text;
  (document.querySelector("#reference") as HTMLAnchorElement).href =
    view.reference;
  for (const button of document.querySelectorAll("button[data-view]"))
    button.setAttribute(
      "aria-pressed",
      String((button as HTMLElement).dataset.view === id),
    );
}
let night = false;
document.querySelector("#night")!.addEventListener("click", () => {
  night = !night;
  document.querySelector("#night")!.setAttribute("aria-pressed", String(night));
  scene.clearColor = night
    ? new Color4(0.055, 0.095, 0.145, 1)
    : new Color4(0.53, 0.65, 0.72, 1);
  sun.intensity = night ? 0.035 : 1.1;
  ambient.intensity = night ? 0.32 : 0.65;
  for (const m of scene.materials) {
    if (
      m.metadata?.nightWindows &&
      m instanceof StandardMaterial &&
      m.emissiveTexture
    )
      m.emissiveTexture.level = night ? 0.65 : 0;
  }
});
document.querySelector("#metrics")!.textContent = JSON.stringify(
  {
    ...reality.metrics,
    browser: {
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      internalWidth: engine.getRenderWidth(),
      internalHeight: engine.getRenderHeight(),
      gl: engine.getGlInfo(),
    },
  },
  null,
  2,
);
select("b6-north");
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
