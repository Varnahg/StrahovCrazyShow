import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TreeAssetLoader, decodeTreePrototype, treePrototypeFoliageRanks } from "../../client/tree-asset-loader";
import { TreeRenderer } from "../../client/tree-renderer";
import { decodeTreeClusterGeometry } from "../../client/tree-cluster-geometry";
import { parseTreeClusterBank } from "../../shared/tree-cluster-types";
import { applyTreeSeasonGeometry } from "../../client/tree-season-geometry";
import { setTreeSeasonMaterialState } from "../../client/tree-season-material";
import { getRendererInfo } from "../../client/gpu-diagnostics";

const canvas = document.querySelector<HTMLCanvasElement>("#tree")!;
const run = document.querySelector<HTMLButtonElement>("#run")!;
const status = document.querySelector<HTMLElement>("#status")!;
const capture = document.createElement("canvas");
const context = capture.getContext("2d", { willReadFrequently: true })!;
const width = 2100, height = 2000;
capture.width = width; capture.height = height;
const focal = 798 / (2 * Math.tan(.85 / 2));

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let area = 0, missing = 0, added = 0, clipped = 0;
  for (let i = 0; i < width * height; i++) {
    const before = a[i*4+3] >= 128, after = b[i*4+3] >= 128;
    area += Number(before);
    missing += Number(before && !after);
    added += Number(!before && after);
    if ((before || after) && (i < width || i >= width*(height-1) || i%width === 0 || i%width === width-1)) clipped++;
  }
  if (area < 1000 || clipped) throw Error(`Neplatný snímek. Plocha ${area}, ořez ${clipped}.`);
  return { area, missing, added, missingRatio: missing/area, addedRatio: added/area,
    difference: Math.abs(missing-added)/area };
}

async function save(name: string) {
  const png = await new Promise<Blob>((resolve, reject) => capture.toBlob(blob =>
    blob ? resolve(blob) : reject(Error("Nelze vytvořit PNG")), "image/png"));
  const result = await fetch("/capture?name=" + name, { method: "POST", body: png });
  if (!result.ok) throw Error("Snímek se nepodařilo uložit");
}

async function readInput(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw Error("Chybí připnuté vstupy " + path);
  return response.json();
}

async function review(input: any) {
  let engine: Engine | undefined;
  let scene: Scene | undefined;
  let renderer: TreeRenderer | undefined;
  const extraMaterials = new Map<string, import("@babylonjs/core/Materials/PBR/pbrMaterial").PBRMaterial>();
  const loader = new TreeAssetLoader();
  try {
    engine = new Engine(canvas, true, { alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false, stencil: true });
    if (engine.webGLVersion !== 2) throw Error("Ověření vyžaduje WebGL2");
    engine.setSize(width, height);
    scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new FreeCamera("Kontrolní kamera", Vector3.Zero(), scene);
    camera.minZ = .05; camera.maxZ = 200;
    scene.activeCamera = camera;
    const sun = new DirectionalLight("Slunce", new Vector3(-.8, -1, -.4), scene);
    sun.position.set(12,22,6); sun.intensity = 2.1;
    sun.shadowFrustumSize = 36; sun.shadowMinZ = .1; sun.shadowMaxZ = 80;
    sun.autoCalcShadowZBounds = false;
    const sky = new HemisphericLight("Obloha", new Vector3(0,1,0), scene);
    sky.intensity = .9;
    const shadow = new ShadowGenerator(2048, sun);
    shadow.usePercentageCloserFiltering = true;
    const ground = CreateGround("Zem", { width: 33, height: 28 }, scene);
    const earth = new StandardMaterial("Povrch", scene);
    earth.diffuseColor = new Color3(.24,.23,.21); earth.specularColor.setAll(0);
    ground.material = earth; ground.receiveShadows = true; ground.setEnabled(false);
    renderer = new TreeRenderer(scene);
    // Reuse the actual production mesh, material and wind paths in isolation.
    const trees = renderer as any;
    const family = input.prototype.family;
    await Promise.all([family === "evergreen-conifer" ? "fir_tree_01" : "LeafSet024", "Bark012"].map(key => trees.pilotMaterial(key)));
    const stage = { materials: extraMaterials, textures: new Map() };
    let midCards;
    if (input.mid.midCluster) {
      const bank = parseTreeClusterBank(await loader.jsonAsset(input.bank));
      await trees.clusterMaterial({ key: "reference-mid", file: input.bank, bank }, stage);
      midCards = decodeTreeClusterGeometry(await loader.asset(input.mid.midCluster.placements), bank,
        { groupCount: input.mid.midCluster.groupCount, exactRanks: [] });
    }
    if (input.textures) {
      const near = await trees.materialFromMaps("Detailní atlas", input.textures, true, {});
      near.bumpTexture.level = .45;
      stage.materials.set("candidate", near);
    }
    if (input.midTextures) {
      const mid = await trees.materialFromMaps("Atlas středního detailu", input.midTextures, true, {});
      mid.bumpTexture.level = 1;
      stage.materials.set("candidate-mid", mid);
    }
    const seasons = family === "deciduous-broadleaf" ? [["winter",0,0],["autumn",.5,16],["full",1,0]] as const : [["full",1,0]] as const;
    const measurements = [], shadowChecks = [];
    for (const row of input.rows.filter((row: {lod:number}) => !input.calibration || row.lod === 1)) {
      const lod: 0 | 1 = row.lod;
      const materialKey = lod === 1 && input.midTextures ? "candidate-mid" : "candidate";
      const candidateMaterial = stage.materials.get(materialKey);
      const zoom = lod === 1 ? input.midZoom ?? 1 : 1;
      camera.fov = 2 * Math.atan(height / (2 * focal * zoom));
      if (candidateMaterial) candidateMaterial.alphaCutOff = lod === 1 ? input.cutoff : .5;
      status.textContent = `Připravuji LOD${lod}`;
      const source = lod === 0 ? input.prototype : input.mid;
      const candidate = { ...input.prototype, lods: input.prototype.lods.map((value: unknown, index: number) =>
        index === lod ? row.descriptor : value) };
      const exact = decodeTreePrototype(await loader.asset(input.prototype.lods[lod]), input.id, input.prototype, lod);
      const base: any[] = lod === 0 ? exact.slice() :
        decodeTreePrototype(await loader.asset(source.lods[lod]), input.id, source, lod);
      if (lod === 1 && midCards) base.push({ ...midCards, name: "Původní skupiny listů", lod, role: "foliage",
        materialKey: "LeafSet024", clusterKey: "reference-mid" });
      const reduced = decodeTreePrototype(await loader.asset(row.descriptor), input.id, candidate, lod);
      if (JSON.stringify(treePrototypeFoliageRanks(reduced)) !== JSON.stringify(treePrototypeFoliageRanks(base))) {
        throw Error("Sezónní skupiny se liší");
      }
      const model = reduced.map(part => candidateMaterial && part.role === "foliage" ? { ...part, clusterKey: materialKey } : part);
      const arms = [base,model].map(parts => {
        const group = trees.createGroup(input.prototype.sourceTreeId);
        group.root.position.setAll(0);
        return { group, meshes: trees.createPilotMeshes(group, parts, stage.materials) as any[] };
      });
      const all = arms.flatMap(arm => arm.meshes);
      const exported = arms.map(arm => arm.meshes.reduce((sum, mesh) => sum+mesh.getTotalIndices()/3,0));
      if (exported[1] !== row.after || exported[1] > Math.floor(exported[0]/4) ||
          (row.budget !== undefined && exported[1] > row.budget)) throw Error("Neplatný rozpočet");
      const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
      for (const part of exact) for (let i=0;i<part.positions.length;i++) {
        low[i%3] = Math.min(low[i%3],part.positions[i]); high[i%3] = Math.max(high[i%3],part.positions[i]);
      }
      const target = new Vector3(...low.map((value,i)=>(value+high[i])/2) as [number,number,number]);
      function pixels() {
        context.clearRect(0,0,width,height); context.drawImage(canvas,0,0);
        return context.getImageData(0,0,width,height).data;
      }
      async function render(arm: number, leaves: number, speed: number) {
        for (const mesh of all) mesh.setEnabled(false);
        Object.assign(trees.treeWind,{ x:speed,z:0,time:1.75 });
        let visibleTriangles = 0;
        for (const mesh of arms[arm].meshes) {
          const plan = trees.plans.get(mesh);
          if (plan) {
            setTreeSeasonMaterialState(mesh,family,{
              leafAmount:leaves,maturity:1,senescence:1-leaves,litterPotential:0,
            });
            applyTreeSeasonGeometry(mesh,plan,leaves);
          }
          mesh.setEnabled(true);
          visibleTriangles += mesh.subMeshes.reduce((sum: number, sub: any) => sum+sub.indexCount/3,0);
        }
        await scene!.whenReadyAsync();
        scene!.render(); scene!.render();
        return visibleTriangles;
      }
      scene.shadowsEnabled = false;
      for (const [view,[yaw,pitch,distance]] of row.samples.entries()) {
        camera.position.copyFrom(target).addInPlaceFromFloats(
          Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance,
        );
        camera.setTarget(target);
        for (const [name,leaves,wind] of seasons) {
          if (input.calibration) {
            if (leaves === 0) continue;
            const originalTriangles = await render(0,leaves,wind), original = pixels();
            for (const cutoff of [.5,.3,.2,.1]) {
              candidateMaterial!.alphaCutOff = cutoff;
              const candidateTriangles = await render(1,leaves,wind);
              measurements.push({lod,view,leaves,wind,cutoff,exported,
                seasonTriangles:[originalTriangles,candidateTriangles],...compare(original,pixels())});
            }
            continue;
          }
          status.textContent = `LOD${lod} · pohled ${view+1}/6 · ${name}`;
          const frames = [], seasonTriangles = [];
          for (const arm of [0,1]) {
            seasonTriangles.push(await render(arm,leaves,wind));
            frames.push(pixels());
            if ((!input.batch || input.capture) && view === 0) await save(`lod${lod}-${name}-${arm ? "candidate" : "original"}`);
          }
          measurements.push({ lod, view, leaves, wind, zoom, cutoff:candidateMaterial?.alphaCutOff ?? .5,
            exported, seasonTriangles, ...compare(frames[0],frames[1]) });
        }
      }
      if (input.calibration) {
        for (const {group} of arms) group.root.dispose(false,false);
        continue;
      }
      const first = measurements.filter(row => row.lod === lod && row.view === 0);
      for (const arm of [0,1]) if (seasons.length === 3) {
        const [winter,autumn,full] = first.map(row => row.seasonTriangles[arm]);
        if (!(winter < autumn && autumn < full && full === exported[arm])) throw Error("Chybný sezónní rozsah indexů");
      }
      scene.shadowsEnabled = true;
      ground.setEnabled(true);
      camera.position.copyFromFloats(18,19,19); camera.setTarget(new Vector3(2,3,0));
      for (const arm of [0,1]) {
        shadow.getShadowMap()!.renderList = arms[arm].meshes;
        ground.receiveShadows = true;
        await render(arm,1,6);
        const withShadow = pixels();
        if (!input.batch || input.capture) await save(`lod${lod}-shadow-${arm ? "candidate" : "original"}`);
        ground.receiveShadows = false;
        await render(arm,1,6);
        const plain = pixels();
        let darker = 0;
        for (let i=0;i<plain.length;i+=4) if (plain[i]-withShadow[i]>12) darker++;
        if (darker < 100) throw Error("Chybí vržený stín");
        shadowChecks.push({lod,arm,darker});
      }
      ground.setEnabled(false);
      shadow.getShadowMap()!.renderList = [];
      for (const {group} of arms) group.root.dispose(false,false);
    }
    const payload = { id:input.id, webglVersion:engine.webGLVersion, gpu:getRendererInfo(engine),
      css:[canvas.clientWidth,canvas.clientHeight], dimensions:[engine.getRenderWidth(),engine.getRenderHeight()],
      focus:document.hasFocus(), visibility:document.visibilityState,
      calibration:!!input.calibration, textures:input.textures, midTextures:input.midTextures,
      hashes:input.rows.map((row: any)=>row.descriptor.sha256), measurements, shadowChecks };
    const result = await fetch("/receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if (!result.ok) throw Error("Výsledek se nepodařilo uložit");
    status.textContent = `Uloženo ${measurements.length} porovnání a ${shadowChecks.length} kontrol stínu.`;
  } finally {
    for (const material of extraMaterials.values()) material.dispose(false, false);
    loader.dispose(); renderer?.dispose(); scene?.dispose(); engine?.dispose();
  }
}

run.onclick = async () => {
  run.disabled = true;
  try {
    const input = await readInput("/review-data");
    if (!input.ids) return await review(input);
    let completed = 0;
    const failures: string[] = [];
    for (const id of input.ids) {
      try {
        if (document.visibilityState !== "visible" || !document.hasFocus()) throw Error("Edge musí být v popředí");
        status.textContent = `${id} · ${completed + 1}/${input.ids.length}`;
        await review(await readInput("/review-data/" + encodeURIComponent(id)));
        completed++;
      } catch (error) {
        failures.push(`${id} ${String(error)}`);
        await fetch("/failure", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, error: String(error).slice(0,1500), phase: status.textContent?.slice(0,200) ?? "" }) });
        if (document.visibilityState !== "visible" || !document.hasFocus()) break;
      }
    }
    status.textContent = `Uloženo ${completed}/${input.ids.length} stromů. ${failures.join(" · ")}`;
  } catch (error) {
    status.textContent = "Chyba: " + String(error);
  }
};
