---
title: 'KEY-52: herní zpětná vazba s čistým snímkem'
type: feature
created: 2026-10-20
status: done
baseline_commit: b05a7c4e2d7332aeecfef2e3c2c7b14bcd592c13
route: dispatch
review_loop_iteration: 0
context: [docs/agents/bmad-policy.md]
---

<frozen-after-approval reason="uživatel výslovně schválil kompletní implementaci podle výzkumu KEY-51">

## Intent
Hráč odešle krátké hlášení nebo nápad přímo ze hry. Při otevření se automaticky pořídí fotografie bez HUD, po odeslání ji server trvale uloží a předá s popisem a technickým kontextem do Linear.

## Boundaries & Constraints
Vždy: host i multiplayer, úvodní obrazovka a chyba startu; CZ/EN, focus/klávesnice; minimum povinných polí; automatická fotografie s náhledem a odebráním, při nedostupnosti pravdivý důvod. Běžný end-frame canvas bez dalšího renderu, metadata stejného snímku. Bounded paměť, jedna komprese, storno při změně enginu; žádný automatický upload při otevření. Server potvrzuje až trvalé uložení a obnoví frontu po restartu, transport stejného reportId neduplikuje. Token pouze server, soukromý Linear, UUID reconciliation.
Nikdy: převzetí cizího WIP/claimu bez doloženého předání; změna frozen testů; veřejná multiplayerová data hostovi; celá obrazovka/HUD, trvalé preserveDrawingBuffer, průběžné video; označení skutečného vzdáleného toku hotové podle mocků.

## I/O & Edge-Case Matrix
| Stav | Akce | Výsledek |
|---|---|---|
| hra připravena | otevření | lze ihned psát, jedna fotografie běžného snímku |
| startup/selháníGPU | otevření | formulář s důvodem chybějícího obrazu |
| offline | odeslání | omezený persistentní browser outbox, čekání bez falešného potvrzení |
| stejnýPOST | opakování | stejné přijetí, jiný obsah stejnéhoID odmítnut |
| restart/timeoutLinear | obnova | pokračování etapy a dohledání uloženého issueUUID |
| quota/neplatnádata | příjem | jasná chyba, nesmazat dřívější potvrzená hlášení |

</frozen-after-approval>

## Code Map
- client/ui.tsx a world-dock.tsx: menu/loading/game návratové větve, modal stav, klávesnice.
- client/game.ts: scéna/kamera a engine endFrame; client/labels.ts renderuje HTML jmenovky mimo canvas. Integrace jen v čisté worktree nad main.
- client/render-engine.ts: WebGL preserveDrawingBuffer:false; WebGPU odevzdává v engine.endFrame.
- KEY-21: chráněný necommitovaný playtest-capture, diary a shared kontrakty ve worktree playtest-diary; pouze úzké předání nebo nezávislý společný adapter, nepřebírat diary upload automaticky.
- server/index.ts: HTTP route před generickýmAPI/CORS a uzavírací lifecycle; server/runtime.ts: STATIC_DIR.
- shared/feedback.ts: nový úzký kontrakt a allowlist.
- Výzkum: _bmad-output/planning-artifacts/research/technical-early-game-feedback-2026-10-20/research.md.

## Tasks & Acceptance
- [x] shared/feedback.ts a tests/feedback-contract.test.ts: validace obálky, limity, explicitní technický allowlist.
- [x] server/feedback*.ts + testy: multipart příjem, persistentní inbox/outbox, Linear upload/create/readback a obnova.
- [x] client/feedback.tsx, feedback.css, feedback-outbox.ts + testy: přístupný formulář a offline fronta.
- [x] client/rendered-frame-capture.ts + testy: sdílitelná jednorázová kopie/encode; reuse předání KEY-21 podle skutečné autorizace.
- [x] Game/UI/dock/buildidentity/serverindex/compose/docs: integrace, persistentní volume, samostatné nastavení.
- [x] scripts/feedback-browser.ts a evidence: skutečný celý tok a regresní přejímka; review a integrace do main.

Given běžná hra, when hráč otevře feedback, then automatický image neobsahuje HUD/chat/minimapu/jmenovky a odpovídá uvedenému frame.
Given host/menu/offline, when odešle popis, then nepotřebuje multiplayer a stav odpovídá skutečnému přijetí.
Given screenshot+popis uložen, when Linear odpoví či ztratí odpověď, then jedno přiřazené issue a zobrazená privátní příloha po readbacku.
Given rapid reopen/leave/rejoin, when doběhne starý encode, then neovlivní nový draft a nic nevlastněného nezůstane.
Given ověřený checkpoint, when integrátor přijme, then vlastní commity jsou v main a cizí WIP zachován.

## Implementation Notes
- Přejímka 20Oct: cílené testy74/74, první produkční build a izolovaná integrace PASS. Reálný formulář→server→Linear vytvořil KEY-55; příloha z Linear má přesně shodné bajty a SHA jako lokální automatický snímek bez HUD. Visible IAB je ready/0errors; Edge timeout se opakuje i v historické baseline, bez prokázané příčiny. Native focus byl opraven a čeká na finální browser retest. Offline fronta při vypnutém serveru zachovala report i denní snímek; reload ještě čeká. Plná lokální Windows sada byla přerušena, přesný PR/main Linux CI je povinný.
- Publikační diff musí obsahovat pouze vlastní výzkum c713c2ae a feature a3e2ea82 plus vlastní přejímkové opravy. Původní baseline měla navíc nesouvisející commit analýzy issues, který není v remote main; před publikací se vlastní commity přenesou na čistý origin/main, bez cizího WIP.
- Předchozí autorizace nahrazuje opakované BMAD schválení podle projektové policy.
- Scope je jeden hráčský cíl napříč vrstvami; tasky mají disjunktní zápisy.
- Provozní vstupy byly doplněny uživatelem do soukromé ignorované konfigurace; skutečný Linear tok byl ověřen. KEY-21 poskytl úzké read-only předání, původní diary WIP ani jeho rezervace se nepřebírají.
- Preferovaná řešení a alternativy jsou v již dokončeném výzkumu. Pro příjem native FormData parser Node24 s pevným limitem těla; bez nové závislosti. Async disk spool na jednom procesu, persistentní volume.
- První testovací Linear issue bude explicitně označené jako přejímka KEY-52, aby nešlo o fingovaný uživatelský problém.

## Spec Change Log

## Review Triage Log

| Nález | Verdikt | Důkaz a postup |
|---|---|---|
| Blind B1 Docker harness | medium / patch | Nový named volume skutečně porušuje dosavadní nulový početmountů. Deployment author opraví přesnou namedvolume aserci a cleanup jen vlastního disposableprojektu. |
| Blind B2 Compose OAuth/status | medium / patch | Worker čte ACCESS_TOKEN/STATUS_ID a dokumentace je nabízí, Compose je nepředával. Doplněny pouze envnames. |
| Blind B3 standalone image | high / patch | Docker USERnode nemohl zapisovat výchozí/app/.cache. ENVFEEDBACK_DIR nyní používá připravenýnode-owned/data/feedback. |
| Edge E1 normalizace buildID | high / patch | WhitespaceclientBuildId projde původní rawtruthiness a uložíseprázdný, restartvalidace selže. Canonical hodnota musí být neprázdná a <=128 předaccept; regresnítest zahrnuje normalizaci aopakovanouvalidaci. |
| Edge E2 dočasné4xx | medium / patch |408/429 se původněblocked true. Client author opraví boundedretry/Retry-After uvnitř stávajícíchlimitů a přidáregrese. |
| Edge E3 timeoutenkodéru | medium / patch | Timeout původněfyzickýlockuvolnilpředcallbackem. Capture author ponechálockaždocallbacku, logickývýsledekvrátívčas, bitmapuuvolní. Při navždyzaseknutémnativeencoderu má stránka busy, nevznikají dalšíenkodéry. |
| Gap V1 nativeIDB | medium / patch | DosavadníreloadtestpoužívalMemoryStorage. Skutečnýručníbrowserflowjižprošel; novýCIbrowserharnesspřidábudoucíregresi blob+metadata napříčconnection/reload. |
| Gap V2 UIqueued/accepted | medium / patch | SSRnetestujesubmit. StejnýrealReactbrowserharnessmusípozorovatqueuedpřiofflineapřijetíažpomatchingreceipt. |
| Gap V3 Gameframecaller | medium / patch | Ručníčítačfixturebyneodhalilodstraněníincrement. RootdoplníběhovýtestskutečnéhorenderphasecallerusopravdovýmcaptureaIOseams, včetněrenderthrow. |
| Gap V4 HTTPregistrace | medium / patch | Samostatnéservice testynechránídispatchvserver/index. BěžnáisolatedintegracedostanetemporaryspoolaskutečnýPOST/dedup/conflict. |

Všechny tři vrstvy byly spuštěny před čtením výsledků; žádný nález nebyl vynechán. Opravy zachovávají již schválený intent a nemění veřejný kontrakt. Nativefocus z praktické přejímky je přímá lokální oprava, nikoli nový schvalovací krok.


## Verification
Cílené CPU testy průběžně. Nad stabilním checkpointem pnpm test, pnpm build, pnpm test:integration pod zdroji heavy-validation/workspace-build/2568. Skutečný izolovaný server a browser pod gpu/2592/4207. Ověřit obrázek, retry/restart, host, startup, CZ/EN, keyboard a nezduplikované vzdálené issue. Profilovat celé hraní včetně HUD s hash/testy, CSS/internal rozlišením, GPU a FPS/p95/p99; žádný mock nebo NullEngine nevydávat za GPU důkaz.

## Checkpoint po review

85/85 cílených testů PASS, kompletní tsc --noEmit PASS. Všechny runtime opravy a testové moduly jsou připravené. Nový skutečný browser CI a finální plná CI/integrace zatím čekají; tato specifikace není označena done.

Publikační rozhodnutí: GitHub odmítl nový workflow kvůli chybějícímu OAuth workflow scope. Test běží místo něj v normální pnpm test sadě přes tests/feedback-browser.test.ts a existující verify job. Oficiální Ubuntu24.04 runner obsahuje Chrome (https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md); Playwright podporuje chrome channel (https://playwright.dev/docs/browsers). Širší credential nebyl vyžádán ani použit. Mimo Linux CI se browser regrese spouští explicitně, běžné CPU testy a samostatná praktická GPU přejímka zůstávají oddělené.

První úplná CI nad7da1ab62:1830 testů,1829 PASS,1 FAIL,0skip. Skutečný native browser test prošel za14,6s. Jediné selhání byl historický test HUD očekávající7tlačítek místo nových8. Oprava zachovává explicitní počet a doplňuje CZ/ENlabel+F8asercí; odvozování počtu z implementačního seznamu by tuto regresi nechránilo. Cílený HUD test2/2PASS, plná CI se opakuje nad novým přesným head. Původní log se uchovává.

## Přejímka po Docker opravě a novém base

Docker skutečně prošel image buildem, node/healthy/namedvolume, HTTP202 a přesným diskovým reportem, compiled frontend admission přes CUA, HTTP/SDK scénáři, SIGTERM/exit0, restartem a totožným reportem/receipt/replay. Vlastní kontejnery, ověřený volume, procesy a karty byly uklizené. Pnpm diagnostika přesně potvrdila Patches were modified; narrow fix má8cílených testů, negativní CLI kontrolu a nezávislý review bez nálezů.

Přijatý b05a main byl připojen do d47380559f09d2098b91d0026d03f3f174ee818d. Porovnání client/server/shared/package/lock/workspace/vite/Docker/Compose vůči již ověřenému7c70e4ee bylo prázdné; nový base přidává podpůrný řadič a testy, nikoli Game runtime. Praktické důkazy aktuálního clientBuildId86ce14d1 proto zůstávají použitelné; celá nová kombinace dostává vlastní finální CI. Záznam přijetí a mainmerge bude v PR19/KEY52, dokud není ověřený, celek není Done.

## Konečné přijetí

PR19 byl přijat a sloučen do main jako c3454da45b22ad9726c257d3d481d45f6243ec04. Přesný PR head c0098509 i skutečný main prošly 1852/1852 testy bez fail/skip, produkčním buildem a izolovanou integrací; oba povinné hygiene checky jsou zelené. Main run39509508150 a hygiene39509507863. Doklad: https://github.com/Varnahg/StrahovCrazyShow/pull/19#issuecomment-6303340329 . KEY-52 i přejímkové KEY-55/56/57 jsou Done až po tomto ověření. Výše uvedené čekající kroky jsou historické checkpointy. Všechny vlastní pomocné procesy jsou ukončené. Následná úplná parity kontrola deseti autorských LFS pointerů je výslovně uvedená v evidence README; původní performance4654 není úplná A/B baseline a není důkazem optimalizace.
