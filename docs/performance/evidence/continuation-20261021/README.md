# Navazující výkonová analýza

Stav 21. 10. 2026: **úplná A/B kampaň je převzatá, nezávisle přepočítaná a čtecí review nemá nálezy.** [Finální výsledky a priority](results.md): 6 startů / 36 intervalů celé produkční hry se třemi skutečnými klienty a HUD. KEY-53 odstranil redundantní malý scope, ale nárůst FPS tato série neprokázala. Render wall přibližně 22,4–22,9 ms je důvod dále přiřadit konkrétní CPU/GPU příčiny. [KEY-5](https://linear.app/gigeconomy/issue/KEY-5/plynulost-cele-hry-rendering-cpugpu-startup-a-lifecycle) zůstává otevřený.

Přijatý runtime [PR22](https://github.com/Varnahg/StrahovCrazyShow/pull/22) je v main jako e9bc2f54289e9f444f91f4c82b9e3abe3c9c16d3; skutečné main [CI](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577977) a [hygiene](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577922) prošly. Vlastní činnost zde je analýza předaných raw dat a statický asset audit; žádná nová runtime změna nebo další GPU experiment.

[Úplné archivované raw vstupy](raw-sources/manifest.json), [přepočet](key53-final-independent.json), [reprodukce z gzip](key53-reproduced-from-archives.json), [CSV](key53-final-independent.csv) a [nezávislá kontrola](final-verification.json) zachovávají zdrojové identity, všechny outliery i omezení. Následující části zachycují průzkum a rozhodovací rámec **před** převzetím finálních výsledků; jejich tehdejší stav čekání je historický. Aktuální závěr určuje výsledkový report.

## Výchozí základ před kampaní

Main c3454da45b22ad9726c257d3d481d45f6243ec04 má ověřené push CI1852/1852, build/integraci/hygiene. Koordinátor KEY-53 vytvořil úplnou baseline8557 souborů source ID `f3b5b5c0ba9b2fb5158ee2e1ab17c8b622b86c36fe2150d36bb5d4324ed1034d`: live-before/live-after/frozen shoda a12 LFS checksumů shodných s OID. Manifest byl přímo přečten; původní4654 s10 autorskými pointery není úplná baseline. Žádný výkonový přínos z přípravy baseline neplyne.

KEY-53 run key-53-776f5f92725b začal22:52:51UTC na přesné base c3454da4 a ještě není dokončený. Zkoumá úzký pool cleanup v `TransitRenderer.update`, ne celý rendering a ne kalendářní cache. Nová přejímka má měřit skutečné CPU intervaly a celou hru/HUD/stejné různorodé relace. Closing docs PR21 je zatím držený před merge, aby se běhu nezměnila přesná base. Tento task do jeho zdrojů, výstupů ani procesů nezapisuje.

## Co už skutečné profily dokládají

| Důkaz | Pozorování | Přenos na současný main |
| --- | --- | --- |
| [Původní transit rozhodovací profil19Oct](../client-threading-20261019/README.md) | Vybrané dlouhé transit.update26,8–86,9ms; vegetace v těchto událostech0–0,3ms. | Hypotéza pro atribuci scene-owned NPC práce; není to dnešní podíl konkrétního prune ani FPS A/B. |
| [CPU sampler19Oct](../client-threading-cpu-profile-20261019/README.md) | Grass update přítomný v47/38 inclusive samples běhů05/06, ale prepareTile jen1/2; rendering a dirty/binding stacky v hitches. | Sample counts nejsou časy; celý environment3,57/4,77ms není ušetřitelná tile-only CPU práce. Odlišný source/trasa/světlo/instrumentace. |
| [Medium first-drive CPU profil](../webgpu-migration-20261016/medium-cpu-profile/README.md) | Čtyři stacky uvnitř dlouhého renderu vedou přes getTextureMatrix→markAllMaterialsAsDirty→submesh dirty scan. | Mechanismus pozorovaný na příslušném starším buildu, nikoli nový důkaz, že současný main stále obsahuje neopravenu tutéž větev. První vs pozdější UV výpočet zde nebyl odlišen. |
| [Manuální fáze](../../client-threading/manual-phases.json) |184Medium oken/8761frames: render mean15,989ms proti simulation0,340ms, world0,117ms, environment1,109ms. | Historická agregace vlastního výběru; maxima různých fází nepatří nutně témuž snímku. Není důvod přepsat fyziku bez nového profilu. |

Důkazy mají vlastní zdrojové hash, GPU a instrumentaci v odkazovaných souborech. Tabulka neslučuje jejich FPS a neudává dnešní procenta výkonu. Nový profil musí zkontrolovat, které mechanismy už přijaté opravy odstranily.

## První rozhodovací priority, před novými výsledky

1. Dokončit srovnatelnou aktuální KEY-53 A/B a zachovat i nulový nebo záporný výsledek. Změna počtu sweepů sama o sobě nepředstavuje FPS zisk.
2. Na aktuálním main odlišit průběžný render/active-mesh/submit čas od krátkého scene-owned creation/disposal a nových shader/pipeline variant. Pro konkrétní nález měřit self/total time a vlastní scope; nesčítat vnořené časy.
3. Krátké hitch okno dohledat v raw trace včetně GC, scheduling a změn scénových zdrojů; neoznačit chybějící sampler stack za GPU nebo GC.
4. Teprve podle dnešního podílu porovnat menší opravu lifecycle/dávkování/indexu s workerem. Worker jen pro čistý měřitelný CPU kernel má jiný přínos a integrační náklady než přesun celého scene.render na jiné vlákno.

Jde o pořadí dalšího zjišťování, nikoli autorizovanou produkční implementaci. Definitivní seznam priorit se doplní po nových měřeních; cílových 60 FPS a plná WebGPU přejímka jsou stále otevřené.

## Nové čtecí ověření současného mechanismu

[Hashovaný inventář](current-mechanism-hashes.json) váže aktuální main c3454da4, patch a skutečně instalovaný Babylon 9.30.0. `client/transit-renderer.ts:428` stále volá pool pruning po běžné update smyčce; očekávaný kandidát KEY-53 se v tomto základním buildu nepředstírá jako už přijatý.

Ve skutečném `texture.pure.js:435` první výpočet vytváří cache matice a následně porovnává `_cachedIdentity3x2`; při změně a zapnutém `optimizeUVAllocation` volá `scene.markAllMaterialsAsDirty` s predikátem `hasTexture`. `scene.pure.js:5259` projde materiály a předá dirty značku, `material.pure.js:1376` skenuje scene meshes/submeshes/draw wrappers a ověřuje materiál i materialContext pro jednotlivý pass. Tato konkrétní větev nepoužívá `useMaterialMeshMap`. Současný patch neobsahuje větev `hadCachedMatrix`. Jde o **přítomný mechanismus**, nikoli nové měření, kolikrát se při dnešní jízdě vykoná nebo kolik CPU ušetří změna.

Další cílené měření má oddělit první výpočet od skutečné pozdější změny UV identity, najít konkrétní textury a jejich životní cyklus a časovat vlastní dirty scan mimo vnořený render čas. Teprve pak porovnat omezenou initial-cache ochranu s eager inicializací, reverse indexem nebo širší změnou dirty mechanismu. Late clones, render passy, MultiMaterial a instances jsou podmínky správnosti; globální vypnutí UV optimalizace či freeze není ekvivalentní drobná oprava. Žádný z těchto kandidátů se v tomto tasku neimplementoval.

## Nový statický podklad pro modelovací workflow

Skutečný původní animovaný GLB z KEY-58 má SHA `bf307ba534b25f4fe0905457d323d0fe13327e4bbd188e06d2222186f6c575c1`. [Nezávislý čtecí audit](pilot-geometry-inventory.json), reprodukovaný [malým skriptem](audit-pilot-geometry.py), potvrdil 1 097 032 B, 59 mesh definic, 65 primitives, 47 472 trojúhelníků, 27 875 POSITION prvků, 3 materiály a 0 textur. Porovnání skutečných attribute/index bajtů a materiálových odkazů našlo **34 přesně odlišných mesh definic a 25 nadbytečných shodných definic**, mimo transformace uzlů.

To je konkrétní vstup pro následný test sdílení geometrie/exportní deduplikace. Nejde o provedenou deduplikaci ani zisk FPS či přesný odhad ušetřené paměti; počet primitives také není naměřený počet draw calls. Pohyblivé díly musí zachovat své pivoty a animaci, takže libovolné sloučení všech částí není stejné řešení. Srovnat nejdřív sdílení shodné geometrie, sloučení pouze statických dílů stejného materiálu, LOD a redukci hustých klíčů. Každé má jiný dopad na editovatelnost, culling a update zdrojů. Rozhodnutí pro hru vyžaduje svůj skutečný cílový scénář a profil.

[Rozšířený čtecí inventář](pilot-geometry-inventory-v2.json) zachoval všechny původní počty a shodné duplicate groups. Sjednocení skutečných intervalů bajtů BIN bufferu ukázalo 1 027 120 B geometrie a 15 488 B animačních dat; dohromady přesně 1 042 608 B celého BIN chunku. Animation payload tak představuje 1,49 % BIN. JSON popis a kontejnér mají další prostor mimo tuto kategorii. Vstup i samotný analyzátor mají zaznamenané SHA.

Pro zmenšení **tohoto konkrétního souboru** je proto první kandidát geometrické sdílení, nikoli předpoklad, že většinu přenosu zabírají klíče animace. Přesná velikost výsledku po deduplikaci nebyla změřena. Velikost payloadu také neurčuje CPU cenu interpolace či GPU skinningu; tuto prioritu nelze bez profilu přenášet na herní frametime nebo jiný model s kostrou/texturami.

## Primární metodické zdroje přečtené21Oct2026

[Chrome Performance reference](https://developer.chrome.com/docs/devtools/performance/reference) rozlišuje Self Time, Total Time, Bottom-up a Call tree; pro nový záznam je potřeba uchovat skutečný výběr intervalu a matching source maps. [Babylon scene optimization](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene) dokumentuje samostatné render/active-mesh/compilation/GPU čítače a omezení GPU timer extension. Z toho neplyne měření dostupného GPU času v naší konkrétní relaci. Stejná dokumentace uvádí změny chování při freeze a performance priority; bez aktuální obrazové/lifecycle přejímky je nelze doporučit jako automaticky bezpečnou optimalizaci.

## Záznam přípravy přejímky před převzetím výsledků

KEY-53 řadič dokončil 27/27 cílených kontrol a tři review; skutečný [PR22](https://github.com/Varnahg/StrahovCrazyShow/pull/22) má head `3ac77c7abf8fca43e6380f382aba306502ab86d6`, base c3454da4 a zelené verify/hygiene. V tomto checkpointu ještě není přijatý do main: koordinátor připravuje přesný produkční kandidát a vlastní srovnatelnou A/B. Úplná zdrojová baseline f3b5… zůstává výše identifikovaná. Tento report nepřevádí úspěch CI nebo počet sweepů na výkonový přínos; nové raw výsledky a jejich interpretace jsou dosud otevřený další krok.

Finální PR verify39513321459 bylo nezávisle přečtené: 1864/1864 PASS, 0 fail/skip, produkční build i izolovaná integrace PASS. Zdrojový diff baseline→candidate mění jen plánování pool sweepu na membership dirty flag a přidává test; dokumentační řadičové artefakty nejsou vykreslovací změna. Controller skončil očekávaným EXTERNAL_ACCEPTANCE_PENDING. Koordinátor potvrdil úspěšný candidate-runtime-1792538661071 build a zahájení šesti startů; zámek nebo chybějící starý controller PID nebyly vydávány za důkaz selhání a nic nebylo restartované.

[Nezávislý plán interpretace](analysis-plan.md) byl zapsaný před převzetím finálních raw. Zachovává úplnou kampaň, oddělení CPU/Plain, přesný kvantilový index, párové rozdíly, vnořené scopes a rozlišení časovače. Snímky ani outliery nebudou dodatečně vybírané podle toho, zda vycházejí lépe.
