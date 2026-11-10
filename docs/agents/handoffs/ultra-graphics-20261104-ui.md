# UI/shared Ultra — pracovní předání

Vlastník ultra-20261104-ui; D checkout codex/graphics-smoothness-20261104, base bf0a6550. Scope dle ultra-graphics-20261104-ui tasku. Root vlastní Game a telemetrii; renderer/browser/full testy neběží v leafu.

Před změnou: problém je chybějící řízení efektů a neoddělený draft/commit. Mechanismus: dnešní UI zapisuje localStorage a Game přímo při každém selectu, startup pozdě volá setQuality. Jediný celek: preferenceV2/resolver, manuální Ultra/Custom a společný panel s potvrzením. Hlavní metrika je zachování defaultů a cílené UI/lifecycle regrese, ne FPS. Správnost: interní3kvality, coldprefs před constructor loadem, žádný save před potvrzeným Game Apply, žádný nový GPU owner. Přijetí: migrace/draft/cancel/preset/custom a relevantní UI fixtures PASS; root ověří celkovou hru.

Varianty: čtvrtý detailový string by změnil fallbacky rendererů; zvolený preset resolver drží3kvality. Přímý per-checkbox setter by vytvářel opakované přípravy; zvolen jeden Apply. Společný formulář brání rozdílu předherního/ingame UI. Primární podklady: stávající render-quality/adaptive-quality/ui/welcome, SPEC a CONTRACT rootu.

## Výsledek a převod rootu

- Stabilní shared API odpovídá CONTRACT: RenderPreferencesV2, VisualFeatures, EffectiveVisualSettings, GraphicsApplicationState; create/parse/resolve/toCustom/same helpers. Interní kvality zůstávají3. Adaptive dostává preferences vconstructoru, setPreferences/getter a snapshot.features, bez resolveru v každém snímku.
- Jeden společný GraphicsSettingsPanel a předherní dialog, šest režimů, škála50–100%, pět voleb a volba základního detailu. Manuální změny jsou draft; volba presetu resetuje overrides. Apply je single-flight, cancel/close nedělá nový commit, pozdní continuations se ignorují. Modalní overlay používá stávající focus trap.
- App předává preference jako4.arg Game ještěpřed startem, odstranil pozdní setQuality/setTargetFps. onGraphicsState má owner guard. Persistovaný React preferences stav se mění jen po true z aktuální Game nebo před vstupem bezGame. StaráGame cleanup nepřepisuje novýgraphicsState. Welcome pouze vykresluje slot tlačítka, editor/scéna se otevřenímGrafiky nemountují.
- Cílený refaktor: jedenresolver, jedenformulář, ownershipaktuálníhoApply; žádná duplikace rendernílogiky ani novýGPUresource. Původníkoncovkyřádků všechsledovanýchsouborů zachované, žádné plošné formátování.
- Ověření: preference+adaptive21/21PASS; samotnýGraphicsPanel/actualApphandler7/7PASS. Rozšířená11souborová targeted sada měla157PASS/1FAIL (novéWelcome tlačítko nebylo napojené); opraveno a celýWelcome+Graphics21/21PASS. DodatečnáColdconstructor/retiredcallback regrese a zpřísněnéFakeGame late-setting guardy: game-render-engine17/17PASS. Předchozí actualRoom/startup kombinace70/70PASS. Žádné aserce nebyly odstraněné.
- Scoped TypeScript pro shared/adaptive/panel/welcome a novétesty+startupfixtures PASS. GlobálníTS/fulltest/build/GPU nebyly spuštěny; parent integrujeGame a leafy souběžně. Finální funkčníEdge/CSS kontrola patří rootovi. Gitdiffcheck vymezenýchtracked souborů PASS. Původní syntax chyba pomocnéhoWelcome testu byla opravena; netvrdíme,že prvnípokusbyl zelený.
- Upravených13source/test souborů je níže; ostatní rezervovanétesty nebylo třeba měnit. Toto předání je14.vlastnívýstup. Žádný staging ani commit. Vlastnítestovacíprocesy skončily; po předání uvolňuji claim.

## Review oprava modalního focusu — finální checkpoint

- Původní P2: F8 otevřelo Feedback nad předherní Grafikou a ponechalo dva focus trapy. Stejný mechanismus platil pro přípravný overlay během živého Apply. Ověřeno čtením centrálního `openFeedback`, skutečných modalních komponent a jejich cleanupu.
- Zvolená změna: centrální otevření Feedback zavře předherní Grafiku. Během Apply se jeho overlay skryje pouze po dobu otevřeného Feedback. Formulář s pending Apply zůstává připojený, aby jeho cleanup nezrušil přípravu. Po zavření Feedback se overlay vrátí jen podle aktuálního stavu Game. Přerušení přípravy při F8 bylo zamítnuto, protože jde o změnu focusu, nikoli požadavek zrušit grafiku.
- Klávesové akce M/J/G během Apply nemění modalní stav a nemohou odpojit pending formulář. F8 zůstává dostupné. V režimu `restoring` jsou opakované Cancel i Escape neúčinné; tlačítko je disabled a zobrazuje „Obnovuji původní grafiku…“. Game a síťová příprava se touto opravou nemění.
- Regrese spouštějí skutečný App opener, skutečné JSX podmínky a skutečné modalní event listenery. Pokrývají oba konce Feedback/Apply, zachování vlastníka pending Apply, cleanup listenerů a disabled/handler chování obnovy.
- Ověření po poslední změně: `node --import tsx --test tests/feedback-ui.test.ts tests/graphics-settings.test.ts` — **13/13 PASS**. Scoped strict TypeScript pro panel a tyto dva testy — **PASS**. `git diff --check` těchto čtyř zdrojových/testových souborů — **PASS**. Předchozí dílčí běh bez M/J/G regrese měl 12/12 PASS; poslední výsledek jej nahrazuje.
- Metrikou této opravy je jediný modalní focus owner a zachování rozpracované transakce. Nejde o FPS měření. Nebyly spuštěny full testy, build, GPU ani server; žádné Game úpravy, staging ani commit. Vlastní procesy skončily. Změny a následující hashe se předávají rootovi a reviewerovi, claim bude uvolněn příkazem `release`.
- Pro review byl doložený vlastní scope znovu získán přes `claim --adopt-dirty`. Novým patnáctým vlastním výstupem je již dříve rezervovaný `tests/feedback-ui.test.ts`; ostatní soubory mimo původní implementaci a tuto opravu nebyly měněny.

## Navazující review: persistence a renderové přehrání

Checkpoint před změnou: scope znovu převzat s `--adopt-dirty`, nynější HEAD f32e274c. Root doplnil `tests/replay/browser-entry.ts` do stejného tasku. Problém: chybí přímá regrese skutečného localStorage efektu a synchronní replay volá nově transakční `Game.setQuality`. Doložený mechanismus: u připravené hry setter spouští `applyRenderPreferences`; `graphicsApplying` potom zastaví běžný render, zatímco replay bez čekání požaduje nový frame. Jediná změna chování: replay použije existující synchronní adaptive/render-only cestu, bez nového veřejného API. Hlavní metrika: skutečně vykonaný wrapper vykreslí každý vzorek a zachová přesné zaznamenané hardwareScaling; skutečný App efekt zapíše pouze potvrzené preference. Podmínky správnosti: žádná interaktivní transakce v replay, žádné samovolné Auto přenastavení, Ultra/Custom po reloadu identické, draft/rejected/stale nezapisují. Přijetí: cílené vykonatelné regrese a scoped TypeScript PASS. GPU ani FPS výsledek se netvrdí.

Varianty: čekání na interaktivní Apply by změnilo časování a rozsah renderového replay; pouhé odstranění setteru by ponechalo Auto a jeho příští revize by přepisovaly zaznamenaný stav. Zvolen je `adaptive.setMode` přes stávající `applyAdaptiveQuality`, poté již existující `applyRenderQuality` se zaznamenanou škálou. Persistence se nemění, pokud přímá regrese neprokáže chybu. Primární podklady: `client/game.ts` quality metody a frame gate, `client/adaptive-quality.ts`, skutečný replay wrapper a App preference loader/storage effect.

Výsledek: runtime persistence změnu nepotřebovala. Dvě nové regrese spouštějí skutečný `readRenderPreferences`, App `useEffect` s fake localStorage a skutečný Apply callback. Ultra i Custom se uloží a načtou včetně všech polí; nehotový Apply, draft, odmítnutí a pozdní výsledek staré Game nezapisují. Výběr efektu je nezávislý na formátování zdroje.

V `tests/replay/browser-entry.ts` je setter nahrazen jedním synchronním voláním existující adaptive cesty; původní render-only override nadále zachovává zaznamenané hardwareScaling. Regrese vykonává skutečný wrapper, skutečné quality metody Game, skutečný adaptive controller a skutečnou adaptive/frame-gate část běžného snímku. Pět vzorků zahrnuje přechody Low/High/Medium i změnu rozlišení uvnitř stejné kvality. Každý vykreslí nový fixture snímek se správnou škálou, bez interaktivního Apply. Negativní kontrola spustí původní skutečný `setQuality` a doloží, že frame gate snímek zadrží. Jde o kontrolu toku; GPU, fyzika a síť nejsou tímto testem pokryty.

Ověření: celý `tests/graphics-settings.test.ts` **10/10 PASS**; nová skutečná replay regrese přes `--test-name-pattern="actual replay frame"` **1/1 PASS**. Po drobném odstranění závislosti selektoru efektu na whitespace znovu pouze dvě dotčené storage regrese **2/2 PASS**. Scoped strict TypeScript obou testových souborů **PASS**; následný finální scoped check Graphics testu **PASS**. `git diff --check` vymezených změn **PASS**. Nebyl spuštěn celý replay test, který vytváří fixture checkout mimo rezervovaný rozsah, ani full suite/build/GPU. Žádné změny veřejného API či Game, žádný commit. Vlastní procesy skončily a root přebírá zdroje, testy a níže uvedené hashe; po předání claim uvolňuji.

## SHA256 stabilního checkpointu

- shared/render-quality.ts: 9a509fd687ccc76e6cb6c4ef5af074bd5ef2fa3be395553baac77fcc7b946428
- client/adaptive-quality.ts: ee7b794c0f28961759bae48788796195e97aa2ddca5b47be23c30d774f94552f
- client/graphics-settings.tsx: 02fb572c09593f1942a96313b5ba2119e0a287444256c81b295a711d564cf6dd
- client/graphics-settings.css: c5e1eaced2c503b0207e8bb058f50a296d5f86359482d043d347d995892ccc1c
- client/ui.tsx: e75976520c1779070c8a50c8eee6162698c080effb8ff8a0320855f7b09afd02
- client/welcome-screen.tsx: ca3308e5ca47bd4ea866577b1e3802bc8a2228ad9f82f288021cac88b95f4a4a
- client/i18n-messages.ts: 7c257f6e4b962a9cf614e83e7579c8d3fad1af0f7e4c4527c9b31e233be0a3f3
- tests/adaptive-quality.test.ts: fed72102c32071603a7b6d524e6fec4e2b1d68a55c07d0d40ecafd2a608d3aa5
- tests/render-preferences.test.ts: f5ab858ba821e6c3c14d89dd78b9e30cc191b28774bd24d06303fe2f64e82674
- tests/graphics-settings.test.ts: 3e0612335e1136bb6214514849bc5ccded81e811a884286b93387909855a8624
- tests/replay/browser-entry.ts: 2f7f7f902de6d6f9c046a7c5b89f179eceee6dc13811e8c632e3c0f5102ff2d9
- tests/recorded-walkthrough-replay.test.ts: 7a176fc2876a5659ba4980a25837ebdbafe2cfc86754ee12e0bc47a2de98feae
- tests/feedback-ui.test.ts: c2003f600d7097997628d0297ea39a8bb43803b02b89aeda64fd519ebdcaadc3
- tests/welcome-screen.test.ts: ba4b6ef0ee78549c955f48f1de600759e8e787f99b758b54d0eae0214c663443
- tests/game-render-engine.test.ts: cb02aecced3a938f4657ed0978d420ec809dbd911c32becbc87dfef863042474
- tests/room-callbacks.test.ts: e2e5af7dce7811394a407999869a7d6ea1e691c649c287e78aceb66afc9d9250
