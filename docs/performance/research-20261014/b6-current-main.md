# KEY-16: úzká oprava B6 pivotu nad aktuálním main

Rozhodnutí před změnou runtime, 14. 10. 2026. Vlastník `repairs-01a13624-b6-current-implementation`; koordinátor `/root`. Výchozí integrační obsah odpovídá `main` `0607003a18bd835c95d3ea3a7ec7a11321094525`; oddělená pracovní kopie má historický HEAD `2c7aec9` a rootem předané změny KEY-17/KEY-7. Ty zůstávají read-only. Přijímá se přesný B6 runtime kandidáta `f63039b4067d57c8bdbe560ead5719cfc05cbb0d`, nikoli jeho větev.

## Doložená příčina a hranice důkazu

[Původní výzkum](b6-render.md) rozebírá produkční záznam `07c227f8…` a celý řetězec Game → B6 → editovatelný world-asset pivot → VehicleLighting → shadow list. B6 při chůzi vynucuje matici nezměněného rodiče kvůli světovému cíli jediného fill světla. Potomci ztratí synchronizaci; jejich následná nucená čtení ve svítilně opakovaně přepočítávají rodiče i sourozence. Reprodukce používá skutečné moduly a může selhat bez změny geometrie, viditelnosti, materiálu či shaderu. Nová kontrola před přijetím musí znovu selhat na současném main; staré výsledky se nevydávají za nové.

Autoritou je publikovaný Babylon **9.30.0**, konkrétně lokální `node_modules/@babylonjs/core/node.js` (`isSynchronizedWithParent`, `isSynchronized`) a `Meshes/transformNode.pure.js` (`computeWorldMatrix`, `freezeWorldMatrix`, `unfreezeWorldMatrix`). Online primární zdroje ověřeny 14. 10. 2026: [Node 9.30.0](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/node.ts), [TransformNode 9.30.0](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Meshes/transformNode.pure.ts). Synchronizace zahrnuje předky. Bezpodmínečné `force` mění revizi potomků, prosté `false` může ve stejném render ID vrátit starou matici. Zmrazený nedirty uzel vrací svou zachovanou matici i při `force`; oprava nesmí tuto engine sémantiku přepisovat.

Počet přepočtů je mechanismus, nikoli měření FPS. Z logu nelze připsat celé zpomalení na 6–8 FPS pouze této příčině. Obecná cena skutečně pohybovaného rootu, shaderové záseky na vstupu, viditelnost pater, geometrie, síťové korekce a red flashes jsou další otevřené oblasti.

## Zvažované možnosti a volba

| Možnost | Náklady, rizika a dopad | Volba |
| --- | --- | --- |
| Synchronizovat pouze B6 pivot podle skutečného stavu; vlastní scratch Matrix/Vector3 | Odstraňuje prokázaný statický spouštěč, zachová same-render změnu a engine freeze. Dva objekty na controller, bez per-update alokací a bez nové cache revizí. | Přijmout přesný runtime f63039b; přidat přímé parent-chain/freeze regrese. |
| Vždy číst matici bez force | Malý diff, ale doložená chybná same-render pozice. | Zamítnuto. |
| Cache inverse podle revize/identity | Ušetří i výpočet inverse, přidává invalidaci při reparent/edit/freeze; dosud nezměřený přínos. | Nepřidávat stav bez měření. |
| Obecný synchronizátor ve VehicleLighting | Může pomoci i pohyblivým rootům, širší kontrakty billboardů, kostí, instancí a invalidací. | Samostatný případ po profilu, mimo tento fix. |
| Zmrazit pivot/potomky | Poruší editovatelnost a může oddělit geometrii od společného modelu/kolizí. | Nezvoleno. Testujeme podporovaný freeze/unfreeze kontrakt, nezavádíme freeze. |
| Změnit detach/LOD/floor hysteresi, index stínů, slučovat geometrii či snížit obnovu stínů | Potenciálně sníží jinou práci, ale mění cache, bounds, viditelnost a timing stínů; potřebuje samostatný profil a obrazovou kontrolu. | Neřeší nutně doložený spouštěč, samostatné úkoly. |
| Prewarm, změnit světelné sloty/detail nebo výkon připsat recorderu/OS | Nulový shader churn v části incidentu prewarm nepodporuje; redukce detailu mění vzhled, OS contention není doložená příčina tohoto mechanismu. | Nepřibalovat. |

Úplný rozbor variant A–L a zdrojových vazeb zůstává v původním výzkumu. Rozhodnutí nepopírá jeho chybějící produkční přejímku: jde o samostatnou integraci ověřené lokální opravy, **nikoli uzavření celého KEY-16 ani tvrzení o FPS**.

## Dopady na jiné úkoly a bezpečnost

Runtime se mění pouze v `client/b6-reality.ts`. Shared polohy, vstupy, kolize, material/light membership, prop loading, quality, instance provenance, připojování/odpojování meshů a původní early-return při stojícím hráči zůstávají stejné. KEY-7/KEY-12 netcode a pohyb se tím neopravují ani nemění; KEY-17 patch i závislosti zůstávají byte-exact. KEY-3/KEY-4/KEY-13/KEY-14 vyžadují své světelné, barevné a GPU ověření. Úspora práce u svítilny nedokazuje opravu jejich vzhledu.

Žádné nové vstupy, síť, soubory za běhu, oprávnění, eval nebo závislosti. Dva scratch objekty patří controlleru; nejsou sdílené globálně, nezavádějí callbacky ani nový dispose zdroj. Nulová scale má stávající engine inverse sémantiku; nezavádí se nový kontrakt pro singulární transformace. Neprovádí se změna obecného VehicleLighting, root ownership ani veřejného API.

## Ověřovací plán

1. Přenést původní čtyři regrese f63039b a zachovat skutečný red log nad původním runtime.
2. Přenést přesný runtime a zopakovat čtyři testy. Přidat nejméně dvě přímé regrese: same-render editace dvou předků a frozen → mutation → unfreeze, s nezávislými scalar S/R/T výsledky pro geometrii i world-space fill.
3. Spustit cílené B6/world-asset/vehicle-lighting/physics/surface testy a úzký TypeScript program. Neměnit stávající testy ani jejich assertions.
4. Předat rootovi přesný diff, hash a raw logy. Celý pipeline/build/integraci a push provádí root pod svou rezervací. Vlastní helper procesy musí skončit.

GPU/browser není v této relaci dostupný (root ověřil prázdný inventory a nedostupné otevření IAB). NullEngine není náhrada. Hrané preview zůstává neměnné; jeho skutečné identity a praktické limity eviduje koordinátor. Produkční trasa vstup → obě schodiště, FPS/p95/p99 a vizuální přejímka zůstávají otevřené v KEY-16.

## Provedená implementace a výsledky

14. 10. 2026, 19:58–20:02 UTC. Před změnou runtime byl byte-exact ověřen proti rodiči f63039b: SHA-256 `b483b6304949d5dff2ca5b60ad07547fc9023e00aca38414ffc4731b57a8de09`. Původní čtyři testy nyní reprodukovaly **1 FAIL / 3 PASS**: tři kroky hráče způsobily **405 root + 402 child** přepočtů místo 0/0. Log zůstává v `.cache/b6-current-main-feature/red-original.log`, metadata v `red-original.json`. První obal testu navíc ohlásil nesoulad očekávaného TAP footeru s automatickým Node spec reporterem; původní raw výsledek i exit 1 jsou zachované, chyba obalu je popsána v `runner-note.txt`. Další běhy explicitně používají TAP.

Přesný runtime f63039b má SHA-256 `942cc969ebf9b4249086353c08090630720758fc3c63cbca648e72fb7b0bb422`; původní testy po přenosu **4/4 PASS**, včetně 0/0 statických přepočtů. Refaktoring zůstává součástí tohoto malého diffu: jeden Vector3 pro světový cíl a jedna Matrix pro inverse, oba vlastněné controllerem, používají `invertToRef` a `TransformCoordinatesToRef`. Nepřibyla dlouhodobá inverse cache.

Původní čtyři testy jsou bajtově zachované. Nové dvě regrese používají scalar S → yaw → T oracle bez inverse/Babylon matrix skládání očekávaného výsledku. První mění dva předky a poté pouze prarodiče při stejném render ID; ověří aktuální pivot a fill ještě před svítilnou, která by mohla stale root zakrýt. Druhá drží zmrazený pivot přes editaci, ověří zachování frozen matice a nulové root přepočty, pak unfreeze a další editaci ve stejném render ID. Zachová world-space fill i geometrii. Výsledný test SHA-256: `b36fe3975d118d58c3b7399f50b52d638b77d295adf709bf7dba42397426f212`.

Finální cílená sada: `node --import tsx --test --test-concurrency=1 --test-reporter=tap tests/b6-render-lifecycle.test.ts tests/b6-reality.test.ts tests/b6-exterior-concrete.test.ts tests/world-asset-identity.test.ts tests/vehicle-lighting.test.ts tests/physics.test.ts tests/surface-transitions.test.ts` → **49/49 PASS**, exit 0, 33,2 s; raw log `targeted-final.log` a čas/příkaz `targeted-final.json` v uvedeném cache. Typový program se skutečným tsconfig a kořeny runtime + lifecycle test: **0 diagnostik**, 3 143 souborů v import closure, exit 0 (`types-final.log/json`). Jde o cílenou typovou kontrolu, nikoli celý build.

Nebyl spuštěn server, GPU scéna, install ani build. Všechny vlastní test/typecheck procesy skončily. Původní runtime early-return stojícího hráče, obecná VehicleLighting cesta a ostatní WIP se neměnily. Root přebírá čtyři zdrojové/dokumentační cesty a cache důkazy k samostatnému full pipeline, kontrole, commitu a integraci. Celková herní přejímka KEY-16 zůstává otevřená.
