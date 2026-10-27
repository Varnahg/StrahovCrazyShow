# Předání: trees-20261025-phenology

- Vlastník: `trees-phenology-01a16b37` (`weather_sky_fixes`); příjemce: root.
- Cwd: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`; větev `codex/trees-realism-20261025`; baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Rezervace získána bez adopt-dirty. Původní cizí WIP: rootovy task/spec/research podklady a souběžná materiálová práce; nic nebylo převzaté ani přepsané.
- Výsledek: samostatný regionální sezónní model, dokumentované parametry a skutečná kompozice sezonního/astronomického preview, připravené pro navazující Game/UI/renderer integraci. Nejde o hotové vykreslené stromy nebo GPU přejímku.

## Soubory

Nové: `shared/tree-season.ts`, `shared/data/tree-phenology.json`, `client/season-preview.ts`, `tests/tree-season.test.ts`, `tests/season-preview.test.ts`, `docs/trees/20261025/phenology.md`, tento handoff. Vlastní cache `.cache/trees-phenology-20261025/` obsahuje osm raw CSV, reprodukční odvození/zdrojový souhrn, logy a manifest. Žádné změny Game, UI, lighting-preview, GroundFlowers, rendereru, generátoru nebo assetů jiného vlastníka.

## Zdroje a interpretace

ČHMÚ wood_species CSV stažené 25.10.2026, soubory aktualizované v červnu2026, zpracované roky2014–2025. [Oficiální licence](https://www.chmi.cz/o-chmu/produkty-a-sluzby/data-a-vyhodnoceni): CC BY4.0, atribuce a popis změn jsou v datech i dokumentaci. Použité Mšecké Žehrovice/Benešov/Doksany mají jiné nadmořské výšky a jsou36–44km od Strahova. Mediany lípy/břízy/habru tvoří generický listnatý profil; modřín pouze oporu schopnosti opadavého jehličnanu. Není to místní druhové určení, třicetiletý normál ani aktuální měření. Missing a444 nejsou datum; chybějící kombinace se neimputují. Osm vstupních SHA256 a66 dílčích souhrnů je ve verzovaných datech.

Mezilehlá smoothstep interpolace, ±4denní seed odchylka, jarní/pozdní bloom a ground retention jsou výslovné umělecké parametry. Žádné GDD z dnešní stanice, nový sníh podle měsíce ani změna weather/fieldSources. Podrobná volba variant a omezení: `docs/trees/20261025/phenology.md`.

## Přesný runtime kontrakt

```ts
type TreeFamily = "deciduous-broadleaf" | "evergreen-conifer"
  | "deciduous-conifer" | "reference-bare";
type TreeSeasonSource = "regional-model" | "demo";
type TreePhenology = Readonly<{
  leafAmount: number; maturity: number;
  senescence: number; litterPotential: number;
}>;
getTreeSeasonState(instant: number, source?: TreeSeasonSource): TreeSeasonState;
phenologyForTree(state: TreeSeasonState, family: TreeFamily, seed?: number): TreePhenology;
```

`TreeSeasonState` obsahuje `model`, `source`, UTC minutový `sampledAt`, deterministický `revision`, `year`, normalizovaný `phaseDay`, `groups: Readonly<Record<TreeFamily,TreePhenology>>` a `ground:{provenance:"authored-seasonal-model",flowerBloom,litterRetention}`. Všechny hodnoty0..1. `leafAmount` řídí viditelnost; zralost/vybarvení jsou vlastnosti sezonní kohorty a dobíhají samostatně. Evergreen má vždy leafAmount1, reference-bare vše0. `litterPotential × ground.litterRetention` je pouze vhodná vstupní intenzita pro lokální bounded litter renderer, nikoli naměřený podíl země zakrytý listím.

Cache: nejvýše8 minutových/source stavů, na stav nejvýše4×17 seed slotů, výchozí seed0 neutrální. Stejný frame/minuta vrací totožné immutable objekty bez Date či per-tree alokací. Staré stavy se z Map vyhazují; jejich soukromé seed sloty mají weak vlastnictví. Cache neobsahuje žádné Babylon resources. `phenologyForTree` přijímá factory stav přímo; pro jiný proces serializovat instant/source a znovu vyhodnotit. NaN/Infinity/out-of-Date/source/family/seed chyby mají RangeError, bez fallbacku Date.now.

## Preview a požadované propojení rootem

Exporty: `SEASON_PREVIEWS`, `SeasonPreviewMode`, `SeasonPreviewSelection`, `isSeasonPreviewMode`, `selectSeasonPreview(mode, baseLighting: LightingPreviewSelection, now?)`.

Výsledek: `{mode, instant:number|null, source, lighting:LightingPreviewSelection}`. `instant=null` znamená běžící čas; **každý nenulový instant má source demo**, i při season real a původním full-moon/day preview. Základní fenologická metoda zůstává vždy regionální model.

Při explicitní volbě sezóny/lighting:

1. Uchovat původní `baseLighting` (výsledek stávajícího selectLightingPreview nad skutečným nyní) a season mode samostatně.
2. Spočítat `effective = selectSeasonPreview(seasonMode, baseLighting, realNow)`; astronomický solver se spouští pouze při UI volbě.
3. Effective `.lighting` použít pro readout/fallback, nepřepsat jím historii base instantu. Jinak návrat na season real nemá původní datum.
4. V Game použít **jeden** `effective.instant ?? realNow` pro astronomii i `getTreeSeasonState(instant,effective.source)`; model sám pouze vzorkuje tuto hodnotu do explicitního sampledAt.
5. Ground hooks napojí root zvlášť; tento task GroundFlowers nemění. Aktuální station data zůstanou oddělená.

Kotvy:20.4/15.7/20.10/15.1 aktuálního UTC roku. Lighting real zachová UTC čas dne, ostatní režimy se řeší znovu nad kotvou; úplněk smí posunout datum, které pak stejně převezme fenologie. Neplatné či nekonzistentní preview vrací real/null. Čtyřciferné omezení1000..9999 platí jen pro skládání existujícího lighting ISO solveru, aby nepřemapoval historický/expanded year; samotný season model podporuje celý platný Date rozsah.

## Refaktoring a ověření

Společné bounded ramp/tenth/window funkce, jediná správa kalendáře/cache, společný preview fallback a jeden zdroj dat/provenience; žádné duplicitní UTC nebo astronomické řešení. Raw CSV nejsou runtime závislost ani síťový request při hraní.

```text
node node_modules/tsx/dist/cli.mjs --test tests/tree-season.test.ts tests/season-preview.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

**13/13 PASS**, exit0, **383,246ms** — `.cache/trees-phenology-20261025/targeted-tests.log`. TypeScript **PASS**, exit0 — `typecheck.log`. Předchozí12/12 běh před round-trip/invalid-calendar doplněním zůstává v `targeted-tests-first.log`. Kontroly pokrývají celý přestupný rok po hodinách, rok0/99/1900/2000/2100/2400, krajníDate, midnight/yearwrap, monotonicitu, oddělenou barvu/opad/retenci, zdroje, cache eviction/identity/immutability a2000seedů. Preview test počítá skutečnou solar altitude/full-Moon illumination pro všechny čtyři sezóny, ne pouze očekávání názvu či regex. Metadata test znovu agreguje doložené dílčí souhrny.

Manifest `.cache/trees-phenology-20261025/checkpoint.json`:6source/doc/test souborů, digest **`3f697eb91aad6cace3104a37659d63ea7e8b6119a7aafc779ccccb6804884773`**, SHA256 manifestu **`ba95d6a93b2317d29a57603e834bf8bfddcb3c4b625d7798fe27ce7e7e1efe68`**. Handoff je vyloučen z vlastního hash cyklu.

## Předání

Všechny vlastní HTTP/test/typecheck procesy skončily. Žádná instalace, Blender, server, GPU, build, fullsuite, staging ani commit. Hrané4179/2592 se nezměnily. Root přebírá integraci, překlady labels, renderer preview a celkové testy/GPU nad neměnným checkpointem. Hodnoty/CPU testy nejsou hotová obrazová přejímka, fyzický model ani změřené zrychlení. Po oznámení výsledku rootovi bude claim uvolněn; stav tasku a přijetí určuje integrátor.
