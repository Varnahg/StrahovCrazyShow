# KEY-41: počáteční nastavení materiálů postav

Nový, dosud nesdílený PBR materiál se nyní nastaví v jednom veřejném `atomicMaterialsUpdate` bloku před vložením do existující cache. Zůstávají stejné hodnoty a pořadí setterů, textury, hair plugin, cache identity i prune/dispose. Cílený refaktoring odděluje `cached` od nové `const material`. Nevznikla další cache ani globální potlačení invalidace.

## Doložený přínos a jeho hranice

Skutečný pinovaný Babylon 9.30 procházel při jednom cache miss 4–11krát cizí mesh/submesh/draw wrappers. Test má 16 cizích meshů po dvou draw wrapperech: RED 128–352 volání původního `getMaterial`, GREEN 32 pro všech 13 povrchů, cache hit 0. Veřejné API obnovuje dirty mechanismus ve finally; pozdější změna sdíleného materiálu znovu invaliduje oba skutečné spotřebitele. Původní RED, GREEN, 34 cílených kontrol, zdrojový průzkum a pinované SHA jsou uložené pod `cpu-*`.

Toto dokládá odstranění redundantní CPU práce. **Nedokládá získaná FPS ani odstranění všech transit záseků.** Produkční transit interval 26,8–86,9 ms dosud není rozdělený mezi sampler, tvorbu/rušení NPC, LOD, raycasty a další práci. Worker pro jízdní řád tyto materiálové průchody sám neodstraní. Širší KEY-40/KEY-5 zůstávají otevřené.

## Stabilní ověření

| Checkpoint | Zdroj | Výsledek |
| --- | --- | --- |
| Clean, main 9f1127f4 + pouze tento runtime/test | `ced7586d5ad54cefa3dc789a337e7788c1062e149deefb2f12745712d4a797c0`, 586 souborů | 1 491/1 491; build včetně plného TS; izolovaná integrace PASS |
| Combined, frozen 65d028 + pouze tento runtime/test | `1fbc05af4154cafb1fd6834748d86dde6d10c539d5431c3fda6323b430ba5752`, 583 souborů | 1 524/1 524; build včetně plného TS; izolovaná integrace PASS |

První doslovný `pnpm test` na clean měl 1 489/1 491: dvě existující WGSL readiness kontroly překročily 4s deadline při default souběhu. Nezměněný focused běh měl 7/7 a následný celý běh `pnpm exec tsx --test --test-concurrency=4 tests/*.test.ts` 1 491/1 491; oba původně pomalé testy ~0,21 s. Combined používá stejný omezený souběh. Žádný timeout ani readiness kontrola se neuvolnily. Původní failure i úspěšné logy jsou zachované. Builds používají `pnpm build`, integrace `pnpm test:integration` se samostatným serverem na 2568. Známá Vite upozornění na velké chunky a neúčinné dynamické importy zůstávají; nešlo o build failure.

Nezávislé read-only review konkrétního runtime/test diffu: bez nálezů. Nové testy ověřují první defines, parametry všech povrchů, textury/pluginy, cache/prune/recreate/dispose a následnou invalidaci. NullEngine nemaří tvrzení o skutečném driveru: jeho schopnosti a texture readiness jsou v CPU fixture výslovně upravené a nepočítají se jako GPU důkaz.

## Skutečná Edge kontrola

Vlastní plain produkční kandidát 4205/API2600, přesných 17 servírovaných code SHA a embedded source ověřeno; žádné HMR ani shader inventory. GTX 1060, 6 144 MiB; před celou hrou při editoru GPU 0 %, VRAM 1 035 MiB. Původní hraná 4203 zůstala v menu a její soubory/procesy/SDK beze změny. Měřicí karta byla aktivní ve vlastním okně.

- Všech šest presetů v editoru skutečně vykresleno a uloženo jako obrázky. Navíc detail očí, brýle, vousy a změna barvy vlasů.
- Celá multiplayer scéna s jednou skutečnou relací, Medium a 1 912 × 867 CSS i interně, denní náhled označený jako demo, chůze a nový editor po Game.dispose.
- Dva úspěšné Game ready a dva disposal bez reloadu, obnova editoru a další vstup do světa. Při kliknutí na opuštění dvakrát timeoutoval ovládací příkaz prohlížeče; následný DOM i raw log potvrdily dokončený návrat, příkaz se neopakoval naslepo.
- Relace `e0a7fc0c-6986-4a75-8904-8f4d3fc2b69a`: 1 333 souvislých records, 0 error/failure událostí. Raw SHA-256 `32d5cfd795c59d882c3bdd2f8915ed908979f3232b99d6a0e7da17de9d09e929`, gzip archiv zachovaný. Console error výběr také prázdný.
- Kontrolní benchmark po chůzi má rendererHealth valid, errorCount 0, pending 0, asset/render errors 0. Jeho 50,6 FPS/p95 26,7 ms je **jediný health/visual smoke v jiné scéně a čase, nikoli srovnatelné A/B**; procento FPS zlepšení se neuvádí.

Omezení: neproveden pixelový rozdílový test, test tří skutečných GPU relací ani přejímka worker architektury. Šest presetů je ověřeno v editoru; druhý herní snímek má vzhled dřívější postavy, a proto nedokládá přenos změněného presetu do multiplayeru při rejoin. Synchronizace profilu se tímto úzkým materiálovým testem nepřijímá. Obrázky jsou vizuální smoke, CPU testy dokládají přesnou paritu hodnot/defines. Žádná vícevláknová architektura se zde nezapnula.

## Reprodukce a provoz

`prepare.mjs`, `prepare-serve.mjs`, `run-check.ps1` a `archive-evidence.mjs` jsou kopie skutečného harnessu z `.cache/client-threading-validation-20261019/`; cesty předpokládají toto umístění, nikoli spouštění přímo z archivu. Source manifesty zahrnují testy; dependency junctiony byly readonly a nový dist neměl spojení do hraného dist. `evidence-manifest.json` váže archivované výstupy SHA-256. Při úspěšném tichém cíleném TS podagenta samostatný textový log nevznikl; oba pozdější plné builds tento TS stav znovu ověřily.

Vlastní QA karta/okno i oba servery byly ukončeny s PID/start/path/command kontrolou; porty 4205, 2600 a 2568 jsou volné. Cizí WIP, hráčské snapshoty i sdílené SDK se neměnily. `docs/verification.md` zůstává pod cizím WIP; toto je samostatná předatelná evidence pro jeho vlastníka.
