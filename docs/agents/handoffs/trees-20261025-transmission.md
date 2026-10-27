# Předání: trees-20261025-transmission

- Vlastník: `trees-transmission-01a16b37`; příjemce: root koordinátor STROMY-20261025 / KEY-62.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, výchozí i aktuální HEAD `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Předání vyhotoveno 25. 10. 2026 kolem 21:24 UTC. Implementace a CPU ověření jsou hotové; skutečná GPU a vizuální přejímka zůstává koordinátorovi. Toto není označení celého KEY-62 Done.

## Výsledek a přesný rozsah

`TreeSeasonMaterialPlugin` nově přijímá `{ tintDirectTranslucency: true }`. Výchozí false zachovává legacy. Opt-in barví pouze přímou akumulaci `diffuseTransmissionBase` aktuálním fotografickým/sezónním `surfaceAlbedo` právě jednou. Neměnný define `STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT` odlišuje Effect cache; vlastní shader text zůstává totožný pro oba vlastníky. Root již samostatně připojil true jen v pilotní factory `TreeRenderer`; tento agent renderer neměnil.

Změněné a předávané soubory:

- `client/tree-season-material.ts`
- `tests/tree-season-material.test.ts`
- `tests/tree-effect-identity.test.ts`
- `tests/wgsl-vegetation.test.ts`
- `docs/trees/20261025/transmission.md`
- `docs/agents/handoffs/trees-20261025-transmission.md`
- vlastní evidence `.cache/trees-transmission-20261025/`

Čtyři existující source/test WIP soubory byly převzaty výhradně z rootem doloženého převodu v `docs/agents/handoffs/trees-20261025-season-rendering.md`. Claim s `--adopt-dirty` uspěl po zúžení root rezervace. Ostatní dirty soubory nebyly převzaty, formátovány ani stagingovány. Změny nyní přebírá zpět root koordinátor k integraci; nejsou volným neidentifikovaným WIP.

## Výzkum, volba a refaktoring

Primární zdroj: aktuální pinovaný Babylon 9.30.0 v `node_modules`, GLSL i WGSL `pbrBlockSubSurface`, `pbrDirectLightingFunctions`, `lightFragment`, `pbrBlockFinalUnlitComponents`, plugin manager a base defines. `useAlbedoToTintTranslucency` barví jen IBL; přímá transmise bez zdrojové mapy byla bílá a přičítala se po albedu. Podrobný mechanismus, porovnání variant a meze důkazů jsou v [transmission.md](../../trees/20261025/transmission.md).

Zvolena násobící korekce pouze při akumulaci přímé transmise. Další mapový sampler by zdvojil vzorkování a bez dalšího tónování nechal zelený podzimní průsvit. Globální albedo/světlo, AO i přepis atlasu jsou mimo rozsah. Barevná legacy transmise se znovu nenásobí.

Refaktoring sjednocuje jeden regex/shader snippet pro GLSL/WGSL a obě opt-in varianty. Stable define tvoří veřejně ověřovanou identitu shaderu. Nové buffery, textury, samplery, UBO fields, observery či cache nevznikají. Sezóna dál používá existující per-mesh binding bez rekompilace frozen materiálu. Shadow factor, alpha discard, normály a opadové indexy se nemění.

## Skutečné ověření

Aktivace prostředí: `. ./.cache/trees-20261025/activate.ps1`.

```text
node node_modules/tsx/dist/cli.mjs --test tests/tree-season-material.test.ts tests/tree-effect-identity.test.ts tests/wgsl-vegetation.test.ts tests/tree-season-geometry.test.ts tests/tree-asset-loader.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Závěrečný cílený checkpoint: **28/28 PASS**, exit 0, **8,183 s**, `.cache/trees-transmission-20261025/targeted-checkpoint.log` (21:23 UTC). Závěrečný TypeScript nad společnou živou kopií včetně root integrace: **PASS**, exit 0, prázdný `typecheck-final.log`. Délka typechecku nebyla samostatně měřena. Vlastní textový whitespace audit a tracked `git diff --check` PASS.

- Actual PBR Effect: jeden aktivní light slot obsahuje jednu skutečnou guardovanou regex substituci; legacy ponechá source transmisní mapu, pilot opt-in a stávající IBL přepínač. Fotografie ani alpha nejsou nahrazené.
- Native WGSL: skutečný processor rozbalí PBR include a vybere právě jednu správnou větev; nevyskytne se `$0` ani nezpracovaný feature guard. Rank a alpha-test podmínka zůstávají.
- Actual Effect cache: pilot/default v obou pořadích mají různé efekty; opakované stejné varianty sdílejí Effect s vlastními UBO. Změna frozen sezony nezmění program.
- Actual odvozený ShadowDepthWrapper Effect je ready a zachovává alpha discard bez VERTEXALPHA. Stávající geometry draw test potvrdil nezávislé prefixy v hlavním i shadow průchodu.
- Nezávislé čistě čtecí review `/root/tree_material_research/transmission_read_review`: bez doložených nálezů. Reviewer kontroloval celý omezený source/test rozsah proti stejnému primárnímu Babylonu; žádné vlastní spuštění ani zápis.

Zachované meziběhy: `targeted-first.log` 11/13, `targeted-second.log` 11/13, `targeted-third.log` 12/13, `targeted-fourth.log` 13/13; dále první kombinovaný `targeted-final.log` 28/28 (11,055 s). Neúspěchy byly diagnostikované testové fixtures: RawTexture v NullEngine nemá upload-ready completion; native ruční defines postrádaly DEBUGMODE 0; native ALPHATESTVALUE je konstanta. První `typecheck.log` měl dvě vlastní TS18049 kvůli nullable depth Effect assertion; opraveno explicitním existence assertion. Materiálový mechanismus se při těchto opravách neměnil a alpha test nebyl oslaben.

## Checkpoint

`.cache/trees-transmission-20261025/checkpoint.json` hashuje všech pět vlastních source/test/decision souborů a odděleně šest čtených validačních vstupů včetně root `tree-renderer.ts`, stávající geometry/asset-loader testů a lockfile. Handoff sám se nehashuje do sebe.

- Source digest: `d890b06e62ffd7aa010a42c3739a8441bd1da6af3ec8e537985c020d8775cfdd`
- SHA-256 checkpoint manifestu: `117b6f35cc3207642e3316b31fad0b40efa9c4bc6233b649d7bf64055ada609c`

Nejde o identitu celého budoucího GPU buildu; tu vytvoří root po všech změnách. Žádný commit nebyl vytvořen, aby zůstala integrace jednotlivého ověřeného celku pod rootem.

## Procesy, rezervace a další krok

Vlastní testy a oba typecheck procesy skončily; žádný živý pomocný proces, port ani GPU zdroj nevznikl. Agent nespustil Blender, build, plnou sadu ani integraci. Souběžná root scéna byla pouze vizuální QA zmrazeného candidate-v3; tento agent nedodává FPS nebo skutečnou GPU kompilaci.

Po uložení tohoto předání následuje `release --task trees-20261025-transmission --owner trees-transmission-01a16b37`; úspěch release bude potvrzen přímo rootovi. Root přebírá konkrétní soubory, samostatný commit/integraci a záznam do společného ověření. Pro GPU přejímku zbývá source-identifikovaný backlight pohled léto/podzim, alpha/shadow a oba render backendy. Dosavadní screenshoty samy nedokládají velikost vizuálního přínosu.
