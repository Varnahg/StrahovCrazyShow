# Předání: fps-cinematic-cost

- Vlastník: `fps-render-20261013`; příjemce: root koordinátor aktuálního FPS auditu.
- Pracovní kopie a větev: `/workspace/StrahovCrazyShow`, `main`; výchozí commit `a381cf637b607b364e85b1e44a8e57566b3c9a0d`.
- Výsledek: připraveno k integraci. Odrazy oblohy používají jednou integrované báze horního a horizontálního zbarvení; aktualizace nemá 6 144 nových vektorů, výpočet normalizace/solid angle ani integraci SH pro každý pixel. Šest upload polí a výsledný polynomial vlastní konkrétní instance a opakovaně je používá. Postprocess se připojí jednou po nastavení finálních parametrů, včetně opakovaného přechodu low → medium.
- Změněné soubory: `client/cinematic.ts`, nový `client/sky-reflection.ts`, `tests/cinematic.test.ts`, nový `tests/sky-reflection.test.ts`, toto předání. Žádné assety, geometrie, cíle FPS nebo render rozpočty nebyly měněny.
- Cizí rozpracované změny: scope byl při claimu čistý. Paralelní změny trávy, B6, transitu, úkolů a root evidence nebyly upravovány ani přebírány.
- Podklady: původní kvadratura `skyReflectionData`; instalovaný Babylon 9.30.0 `Maths/sphericalPolynomial.pure.js` (SH linearita, prescale a polynomial cache), `PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.pure.js` (`automaticBuild`, `prepare`, config observable a lifecycle). Kontrolováno 13. 10. 2026. Číselný výsledek je porovnán s původní přímou kvadraturou, nikoli s očekáváním odvozeným z nového algoritmu.
- Refaktoring: oddělen čistý vlastněný sampler; žádná globální cache ani akumulace zdrojů mezi scénami. Zachovaný samostatný `skyReflectionData()` vrací nezávislý snapshot pro existující volající. Babylon při PBR bindu mění SH prescale in-place, proto každá nová paleta přepíše všech devět koeficientů a resetuje příznak `preScaled`. Při rekonstrukci pipeline se stav synchronizuje veřejným config observable ještě se zakázaným automatickým buildem; zabráněno skrytému druhému připojení pipeline.
- Ověření: `pnpm exec tsx --test tests/sky-reflection.test.ts tests/cinematic.test.ts tests/render-maintenance.test.ts` **15/15 PASS**, exit 0, finální běh 13. 10. 2026 14:47 UTC, 2.860 s. Přesné RGBA bajty pro velikosti 1/3/8/32 a den/noc/západ/HDR palety; polynomial i předškálované PBR SH do tolerance 1e-10; opakovaný návrat palety; izolované vlastnictví; 1 připojení pipeline/aktivaci, beze změny při medium ↔ high, skutečný teardown low. Předchozí 14/15 běh odhalil neshodu Babylon configu při druhé aktivaci; ta je opravena a finální běh již nehlásí opakované používání postprocessu.
- Typová kontrola: `pnpm exec tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop client/sky-reflection.ts tests/sky-reflection.test.ts client/cinematic.ts tests/cinematic.test.ts` exit 0. `git diff --check -- client/cinematic.ts tests/cinematic.test.ts` exit 0.
- Snapshot/diff: root vlastní zdrojový freeze a výsledný commit. SHA-256 předaných implementací/testů: cinematic `7ad7e26e49ec0c86f11b429ddf57fe3054e1fcda6aca357d0012e59df23a21f7`; sky-reflection `af0ae394f32e7fc07015b441fc69e26055df200276ffa8f6711521ff33ab810a`; sky-reflection.test `4e2f95b7a51d710e6bc9013d5b7cc6faa023cc1daba3a4f4338623c9d2d16af0`; cinematic.test `56d1a7dec0c53760201e3f90f740fb73accbe29004e0475815356ffda15964cf`.
- Procesy a zdroje: pouze dokončené cílené CPU testy/tsc. Žádný browser, server, GPU, Blender ani dlouhožijící proces nebyl spuštěn.
- Omezení: NullEngine lifecycle test není GPU/FPS důkaz. Aktualizace skutečné cube textury stále provádí upload/mipmap na GPU. První konstrukce sampleru integruje dvě báze a může být dražší než jedna původní integrace; pravidelné aktualizace tento výpočet již nepotřebují. Praktický celý herní profil a společný build/testy/integraci provádí root.
- Rezervace: uvolněna po dokončení předání; root přebírá konkrétní vyjmenované soubory. Integrátor změní status tasku po ověření.

## Opakovatelný dílčí CPU profil pro koordinátora

Následující driver uložit do rootem vlastněné evidence nebo `.cache/fps-drops/sky-cpu.mjs`; spouštět bez souběžného těžkého měření nad absolutní cestou baseline snapshotu a final snapshotu. Každá varianta vlastní samostatný proces. Report není GPU měření ani příčinný důkaz p95 celé hry. Inicializace a zahřáté update jsou reportované zvlášť. Candidate používá tutéž životní cestu jako `CinematicAtmosphere`, samostatný snapshot helper záměrně nepoužívá cache mezi voláními.

```js
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(process.argv[2]);
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const { Color3 } = await load("node_modules/@babylonjs/core/Maths/math.color.js");
const candidate = existsSync(resolve(root, "client/sky-reflection.ts"));
const module = await load(candidate ? "client/sky-reflection.ts" : "client/cinematic.ts");
const palettes = [
  [new Color3(0.5, 0.7, 0.9), new Color3(0.8, 0.85, 0.9)],
  [new Color3(0.015, 0.025, 0.07), new Color3(0.03, 0.04, 0.06)],
];
const started = performance.now();
const sampler = candidate ? new module.SkyReflectionSampler() : null;
const update = (index) => sampler
  ? sampler.update(...palettes[index % 2])
  : module.skyReflectionData(...palettes[index % 2]);
update(0);
const firstUpdateIncludingSetupMs = performance.now() - started;
for (let i = 0; i < 30; i++) update(i);
const samples = [];
let checksum = 0;
for (let i = 0; i < 300; i++) {
  const t = performance.now();
  const data = update(i);
  samples.push(performance.now() - t);
  checksum += data.faces[2][(16 * 32 + 16) * 4] + data.polynomial.xx.x;
}
samples.sort((a, b) => a - b);
const percentile = (fraction) => samples[Math.ceil(samples.length * fraction) - 1];
console.log(JSON.stringify({ root, candidate, samples: samples.length,
  firstUpdateIncludingSetupMs, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  p99Ms: percentile(0.99), maxMs: samples.at(-1), checksum,
  scope: "CPU sky update only; no texture upload, GPU, scene, or FPS measurement" }, null, 2));
```

Příkaz z kořene checkoutu: `node --import tsx .cache/fps-drops/sky-cpu.mjs /absolute/source/snapshot`.
