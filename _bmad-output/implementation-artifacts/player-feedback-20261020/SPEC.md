---
title: 'KEY-52: herní zpětná vazba s čistým snímkem'
type: feature
created: 2026-10-20
status: in-progress
baseline_commit: c713c2aedcafdb02358f05e4c9c51b607edeebc4
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
- [ ] shared/feedback.ts a tests/feedback-contract.test.ts: validace obálky, limity, explicitní technický allowlist.
- [ ] server/feedback*.ts + testy: multipart příjem, persistentní inbox/outbox, Linear upload/create/readback a obnova.
- [ ] client/feedback.tsx, feedback.css, feedback-outbox.ts + testy: přístupný formulář a offline fronta.
- [ ] client/rendered-frame-capture.ts + testy: sdílitelná jednorázová kopie/encode; reuse předání KEY-21 podle skutečné autorizace.
- [ ] Game/UI/dock/buildidentity/serverindex/compose/docs: integrace, persistentní volume, samostatné nastavení.
- [ ] scripts/feedback-browser.ts a evidence: skutečný celý tok a regresní přejímka; review a integrace do main.

Given běžná hra, when hráč otevře feedback, then automatický image neobsahuje HUD/chat/minimapu/jmenovky a odpovídá uvedenému frame.
Given host/menu/offline, when odešle popis, then nepotřebuje multiplayer a stav odpovídá skutečnému přijetí.
Given screenshot+popis uložen, when Linear odpoví či ztratí odpověď, then jedno přiřazené issue a zobrazená privátní příloha po readbacku.
Given rapid reopen/leave/rejoin, when doběhne starý encode, then neovlivní nový draft a nic nevlastněného nezůstane.
Given ověřený checkpoint, when integrátor přijme, then vlastní commity jsou v main a cizí WIP zachován.

## Implementation Notes
- Předchozí autorizace nahrazuje opakované BMAD schválení podle projektové policy.
- Scope je jeden hráčský cíl napříč vrstvami; tasky mají disjunktní zápisy.
- Provozní vstupy: serverový Linear credential není v process/user/machine. Uživatel požádán o konfiguraci. Capture předání zatím čeká; nezávislé server/UI moduly mohou pokračovat.
- Preferovaná řešení a alternativy jsou v již dokončeném výzkumu. Pro příjem native FormData parser Node24 s pevným limitem těla; bez nové závislosti. Async disk spool na jednom procesu, persistentní volume.
- První testovací Linear issue bude explicitně označené jako přejímka KEY-52, aby nešlo o fingovaný uživatelský problém.

## Spec Change Log

## Review Triage Log

## Verification
Cílené CPU testy průběžně. Nad stabilním checkpointem pnpm test, pnpm build, pnpm test:integration pod zdroji heavy-validation/workspace-build/2568. Skutečný izolovaný server a browser pod gpu/2592/4207. Ověřit obrázek, retry/restart, host, startup, CZ/EN, keyboard a nezduplikované vzdálené issue. Profilovat celé hraní včetně HUD s hash/testy, CSS/internal rozlišením, GPU a FPS/p95/p99; žádný mock nebo NullEngine nevydávat za GPU důkaz.
