# UI/grass fixtures · důkazy před opravou

Task `trees-20261026-ui-grass-fixtures`, owner `trees-ui-grass-fixtures-01a16b37`, baseline `8516c7b1`. Rozsah je testový; Game/UI/Room/Vegetation runtime se nemění. Root poskytl cílené CPU okno po ukončení dvou izolovaných autodev kontrol.

## Doložený řetězec

Frozen `.cache/trees-validation-20261025/full-tests-v9.log` uvádí12 neúspěšných Room startup případů a grass helper ownership chybu `RangeError: Array buffer allocation failed` po116939.5286ms. Původní log zůstává neměnný.

UI lifecycle získává inicializovaný engine, vytváří Game, nastavuje hooky a před `g.start()` přebírá `seasonPreviewRef.current.instant`. VM fixture ale poskytuje pouze starý `lightingPreviewRef`, takže vznikne ReferenceError před startem. UI jej korektně obslouží jako startup failure; test potom vidí starts0 nebo odmítne deferred start promise, na kterou už nikdo nečeká. Factory-error případy před chybějícím bindingem nadále procházejí. Nejde o důkaz regresí transportního cleanup.

Grass test bezprostředně po konstrukci porovnává `vegetation.grassPreparationRevision` s `grass.shaderPreparationRevision`. Aktuální skutečný getter však vrací stabilní obálku `{grass,litter}`, zatímco druhý vrací `GrassResources`. Tato identity assertion nutně selže. Primární Node24 `internal/assert/assertion_error` při strictEqual objektů používá `inspectValue` s depth1000, maxArrayLengthInfinity a getters:true; formátuje tak rozsáhlý Babylon/Scene graf i s vlastní chybovou zprávou. To silně vysvětluje následný OOM; log bez stacku neprokazuje konkrétní vnitřní alokaci.

Čtení konstruktoru `VegetationController(...,{skipLegacyGrass:true})` vylučuje hypotézu eager stromového katalogu v tomto fixture: nevytváří patches, vytvoří malý16blade master (96vertexů/64tri), materiál a prázdný `TreeRenderer`; `loadTrees`, litter ani flowers se nevolají. Původní OOM se záměrně nebude opakovat jen pro RED důkaz.

## Porovnání a volba

Změna runtime tak, aby znovu vracel přímý grass token, by rozbila současnou litter přípravu. Nahrazení controlleru přes `Object.create` by skrylo skutečné vlastnictví. Zvýšení paměťového limitu by nechalo nepravdivou assertion. Zvolená oprava zachová skutečný controller a ověří `.grass`, nepřítomné `.litter`, stabilitu composite identity, aktivaci a disposal. Reference porovná přes boolean identity s konkrétní zprávou, aby selhání nevyžadovalo inspekci celé scény.

UI fixture dostane oba preview refs v jednom sdíleném místě, s reálným `selectSeasonPreview` a pevným UTC. Úspěšný existující lifecycle případ navíc použije zimní DEMO s jiným okamžikem než lighting-only ref a ověří předání přesného season instant. Původní assertions Room generation/cancel/cleanup/error se zachovají.

## Výsledek

VM refs jsou nyní ve společném `fixture()`; oba startup harnessy z něj přebírají skutečný `seasonPreviewRef`. Existující success případ používá `selectSeasonPreview("winter", ...)` a přímo ověřuje `game.timeOverride`; ostatní lifecycle outcome očekávání jsou zachovaná.

Grass test nadále konstruuje skutečný `VegetationController`. Před assertions registruje cleanup, ověřuje `.grass` token, nepřítomné `.litter` a stabilitu composite identity. Identitní porovnání používají boolean s konkrétní zprávou, ne rozsáhlý objektový diff. Testový guard případného `TreeRenderer.load()` úmyslně selže, takže test nemůže potichu začít produkční stromové IO; v úspěšném běhu má0volání. Skutečné constructor/dispose cesty nejsou nahrazené.

`node node_modules/tsx/dist/cli.mjs --test tests/room-callbacks.test.ts tests/photo-grass-preparation.test.ts`: **54/54 PASS,0fail,0skip**, exit0,5.493s. Původně neúspěšný grass případ skončil za **14.386ms** a ověřil skutečný dispose. Log `.cache/trees-ui-grass-fixtures-20261026/targeted-first.log`. Výsledek podporuje odlišení chybného assertion kontraktu od hypotézy eager katalogu; samotný původní OOM nebyl znovu vyvolán ani profilován.

Nezávislý čtecí review přesného diffu potvrdil zachování assertions a žádné oslabení lifecycle/ownership ani únik testových mocků. Reviewer cílené testy znovu nespouštěl. Runtime nebyl upraven; plnou sadu, build a integraci vlastní root.

Cílený TypeScript projekt pouze pro dva změněné testy (s jejich skutečnými importy, `extends` původního tsconfig): `node node_modules/typescript/bin/tsc --project .cache/trees-ui-grass-fixtures-20261026/tsconfig-targeted.json --pretty false`, exit0. `typecheck-targeted.log` je prázdný. `git diff --check` obou testů exit0. Nejde o znovuspuštění celého projektového tsc nebo fullsuite.
