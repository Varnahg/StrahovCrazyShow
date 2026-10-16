# Předání: webgpu-migrate-surfaces-wgsl-20261016

- Vlastník: `webgpu-mig-01a14497-surfaces`; příjemce: koordinátor `webgpu-migration-01a14497-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí commit `d46b3d327256514f7d763595f73f59ffecdc707f`.
- Rozpracované změny `client/cinematic-art.ts` a `client/photogrammetry-lighting.ts` vytvořil výhradně tento vlastník po úspěšném claimu. Žádný cizí WIP nepřevzal. Tento dokument vznikl v témže přiděleném scope.
- Koordinátor 16. 10. 2026 požádal o dočasné uvolnění rezervace pro přidání dvou existujících regresí (`tests/cinematic-art.test.ts`, `tests/photogrammetry-lighting.test.ts`) do tasku. Obě dosud vyžadují WGSL vracet null. Po změně katalogu původní vlastník převezme svůj zde doložený WIP pomocí `--adopt-dirty`.
- Koordinátor rozšířil katalog commitem `3460e8e`; původní vlastník úspěšně reclaimnul scope s doloženým `--adopt-dirty`. Finální verzovaný rozsah: dva uvedené runtime soubory, `tests/cinematic-art.test.ts`, `tests/photogrammetry-lighting.test.ts`, nový `tests/wgsl-surface-materials.test.ts` a tento handoff. Žádné cizí změny nejsou součástí commitu.
- Implementace: samostatné WGSL recipes zachovávají GLSL referenci. Campus noise používá per-invocation `var<private>` mezi main/albedo a reflectivityBlock/roughness; UBO a world-position přístupy jsou převzaté z Babylon 9.30. Photogrammetry geometrická derivace je ve WGSL MAIN_BEGIN před discard, maska/emise dál ve final composition. Žádná změna kalibrací, atlasů, UV, geometrie ani zapojení fotogrammetrie do světa.
- Primární průzkum: lokální pinned Babylon 9.30 `ShadersWGSL/pbr.fragment`, `pbrBlockReflectivity`, `pbrBlockAlbedoOpacity`, `pbrUboDeclaration`, `sceneUboDeclaration`, `materialPluginManager` a `webgpuShaderProcessorsWGSL`; [W3C WGSL](https://www.w3.org/TR/WGSL/) a [Babylon Material Plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/).
- Varianty rozhodnuté před implementací: zachovat GLSL konverzi (nesplní nativní migraci), dvakrát počítat noise (zbytečné čtyři další hashe/fragment), patchovat podpis PBR funkce (křehká vazba), nebo nativní recipes s per-invocation private hodnotou (zvoleno). Žádný nový runtime resource/cache.
- Linear: průzkum a rozhodnutí zapsány do [KEY-26](https://linear.app/gigeconomy/issue/KEY-26/webgpu-portovat-povrchove-a-fotograficke-materialy-na-wgsl). Issue není Done.
- Refaktoring: immutable Campus recipes jsou sdílené mezi materiály pro oba jazyky; detail-only cesta stále nevytváří noise/hash ani roughness výpočty. Jednotné rozhodování podle podporovaného shaderového jazyka a explicitní návratový kontrakt hooků. Photo UBO layout/bind, facade-set defines, material cache, fictional occupancy a disposal zůstávají beze změny; GLSL/WGSL mask arithmetic porovnává test pro všech 15 původních fasád.

## Cílené CPU ověření

Vlastní kopie `.cache/webgpu-migration-checks/surfaces/` obsahuje potřebné klientské/shared vstupy a testy; `node_modules` je read-only junction na `.cache/webgpu-comparison/frozen/node_modules`. Do tohoto cíle nebyla prováděna instalace ani editace závislostí.

- Finální manifest `source-manifest.json`: **`afdbc2ad8dd7bb678a9a8ae69c648980219072d8bb3977206c9a3bf938088ae6`**, 89 vstupních souborů včetně testů, package/lock a TS konfigurace. Nejde o úplný produkční snapshot.
- `node node_modules/tsx/dist/cli.mjs --test tests/cinematic-art.test.ts tests/photogrammetry-lighting.test.ts tests/wgsl-surface-materials.test.ts`: **PASS 12/12, exit 0**, 16. 10. 2026 17:00 CEST, `targeted-v3.log`. Předchozí stejný běh `targeted-v2.log` také 12/12 PASS.
- Cílený strict TS: `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --types node tests/cinematic-art.test.ts tests/photogrammetry-lighting.test.ts tests/wgsl-surface-materials.test.ts`: **PASS, exit 0**, `types-v2.log`.
- Zachován `types-v1.log`: první typová kontrola správně odhalila odlišné tvary návratových WGSL/GLSL hook objektů a testový přístup k volitelnému hooku. Oprava explicitního `Record<string, string> | null` odstranila chybu bez změny runtime recipe.
- Nové testy skutečně vytvoří nativní WGSL PBR materiály, aplikují plugin manager, shader store/includes a Babylon `WebGPUShaderProcessorWGSL`. NullEngine nahrazuje pouze GPU program; výsledné celé WGSL zdroje se kontrolují na UBO scope, jediné noise vyhodnocení, private cross-function stav a derivace před PBR alpha discard. **To není driver WGSL kompilace ani GPU měření.**
- Ověřeno: shodné skutečné Float32 UBO hodnoty pro všech sedm povrchů a preserve-detail obě větve, nezměněný albedo faktor/roughness (včetně faktoru vlhkosti), shodná authored arithmetic obou jazyků, chybějící noise u omítky, stabilní effect reuse, různé effect cache identity různých facade sets, původní textury/UV/provenience a existing ownership/lifecycle regrese.

## Incident izolace CPU nástroje

První příkaz `pnpm exec tsx ...` ve vlastní check kopii neočekávaně spustil pnpm workspace bootstrap do nadřazeného worktree `node_modules`, namísto spuštění testů. Log `targeted-v1.log` zůstává zachován; nejde o testový výsledek. Vlastní session byla ihned přerušena Ctrl+C (exit 1), další běžící vlastní pnpm proces nebyl zjištěn.

Read-only kontrola prokázala vznik samostatného `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/node_modules` (creation 16:57:22 CEST, last write 16:57:50). Žádná tracked změna package/lockfile se neobjevila. Check junction stále mířil na původní frozen dependencies; adresář cíle měl nezměněný last-write 14:49:15 (to samo není úplný bajtový důkaz). Incident byl okamžitě předán koordinátorovi, který přebírá kontrolu hashů chráněných snapshotů a rozhodnutí o novém kořenovém adresáři. Vlastník jej nemazal, neupravoval ani nepoužil; všechny následné testy běžely přímým `node` přes existující CLI v povolené junction. Žádný další install neproběhl.

## Převzetí

- GPU, build, plná sada a server nebyly tímto taskem spuštěny. Žádný vlastní pomocný proces nezůstává.
- Samostatný commit obsahuje jen šest vyjmenovaných verzovaných souborů; SHA je ve finálním předání. Po commitu se rezervace uvolní; release neznamená kompletní GPU přijetí.
- Koordinátor musí převzít diff, provést společnou pipeline a skutečnou WGSL driver kompilaci i obrazy den/noc, mokro/sucho, detail distance. Původní fotogrammetrickou vrstvu nepřipojovat zpět do hlavní hry. Linear KEY-26 se neoznačuje Done podle CPU výsledku.
