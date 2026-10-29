---
title: 'KEY-49: opakovat oba uživatelské průchody pouze v testech'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: 'ab39b7185d0c9fb5e393c654818f43de82e07886'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/docs/agents/bmad-policy.md'
---
<frozen-after-approval reason="Přímé zadání uživatele a výslovný výběr obou průchodů">
## Intent
Převést uživatelský průchod B6 ze 17. 10. a venkovní trasu s autem z 18. 10. na opakovatelné renderové regresní scénáře. Všechny nástroje jsou pouze v tests; produkční klient, server, API a fyzika se nemění.
Záznamy obsahují vzorkované pozice/kameru a explicitní akce, nikoli úplné tickové vstupy. Test přehrává pozorované stavy a pořadí změn. Výsledek nesmí tvrdit deterministický replay řízení, kolizí, sítě ani přesnou obnovu chybějících mezisnímků.

## Boundaries & Constraints
Vždy: skutečný produkční renderer se světem a UI; vlastní izolovaný build a GPU rezervace; zachovat zdroje i původní snapshoty. Extrahované fixtures obsahují pouze technický kontext s provenance SHA, zvoleným úsekem a známými mezerami. Test má konečný timeout, uvolní zdroje a selže při renderové chybě.
Nikdy: úprava produktových souborů, druhý render kvůli screenshotu, tvrzení výkonnostního zlepšení, vydávání nastavování zaznamenané pozice za test průchodnosti. KEY-21 a jeho rezervace zůstávají nedotčené.

## I/O & Edge-Case Matrix
| Vstup | Výsledek | Selhání |
|---|---|---|
| JSONL dávky, nebo gzip | Kanonické vzorky a explicitní akce s původním seq/relativním časem | Chybný SHA, duplicita/gap/nesprávná session se odmítne |
| 18.10 agent smoke + lidská hra | Pouze lidský game-ready 1014 až disposal 1695; vstup od636 v provenance | Smíšená hra nesmí projít jako jedno přehrání |
| 17.10 hra a dlouhý čas po pádu | Renderové vzorky po ready259 do posledního skutečného frame; post-crash/menu se nepřehrává | Původní chyby se zachovají jen jako historické důkazy |
| Nový renderer fault nebo nedokončený replay | Report se skutečným místem a limitem | Žádný falešný PASS ani FPS přijetí |
</frozen-after-approval>

## Code Map
- client/game.ts: advanceSimulation, updateCameraFollow a veřejné quality/weather/flashlight funkce; pouze čtecí závislost. Testový bootstrap zachytí instanci přes existující metodu, bez hooku v produkčním bundlu.
- shared/simulation.ts: Actor.setPosition/setVehicle umožní testové přehrání pozorovaného stavu; bypass pohybové fyziky se výslovně označí.
- client/main.tsx/ui.tsx a vite.config.ts: původní aplikace a konfigurace, beze změny; testovací Vite plugin nahradí pouze HTML bootstrap.
- docs/performance/evidence/webgpu-migration-20261016/user-4196-20261018/: veřejná technická evidence a gzip záznam 1717records.
- Původní B6 JSONL v cache webgpu-comparison: SHA CB15DB6A0EE7905EDE9DEBDD7435556C165799BCC0D3931246122D97403E46C2, 5297records. Fixture necommitne celou soukromou relaci.

## Tasks & Acceptance
- [x] tests/replay/recording.mjs, fixtures a recording regrese: streamy převést do jednoho omezeného schématu, ověřit výběr a provenance.
- [x] tests/replay/replay.mjs a replay regrese: zachovat pořadí/čas, interpolovat jen označené vzorkované pozice a krátký oblouk kamery; neodhadovat neznámé akce.
- [x] tests/replay/browser-entry.ts, run.mjs, README: implementovaný testový bootstrap a report; skutečné dokončení obou scénářů čeká na externí viditelnost panelu a není tímto checkboxem přijato.
- [ ] Evidenci, cílený refaktoring, review, test/build/integraci a samostatný commit/přijetí dokončit pod taskovými rezervacemi.
AC: Given ověřené záznamy, when extrakce, then obě fixtures pokrývají správnou lidskou relaci a žádný smoke/menu.
AC: Given testovací build, when běží oba scénáře, then renderer zpracuje trasu/nastavení a report zachytí chybu či dokončení bez falešné fyzikální/FPS záruky.
AC: Given failure/cancel/timeout, when cleanup, then vlastní engine/browser/server skončí a nezůstane testový hook v produkční aplikaci.

## Implementation Notes
CPU příprava je hotová (20/20 cílených, TS/build a4 SDK scénáře PASS). Tři GPU starty byly neplatné před trasou: skrytý panel, queued otevření chatu, přibližně1Hz RAF a timeout přípravy. Cílová GPU přejímka čeká na odpověď uživatele a aktivní panel; review kódu může proběhnout nezávisle. Stav in-review není dokončení ani přijetí main. Lokální plná Windows sada byla výslovně zrušena jako neúplná; konečný full PASS musí dodat CI finálního head. První testový build odhalil ENOBUFS při příliš širokém Git inventáři; opraveno konkrétními pathspecy bez zvýšení neomezeného bufferu.
Kontrakt fixture: {schemaVersion:1,id,source:{sessionId,sha256,buildSnapshotId,fromSeq,toSeq,readySeq,recordCount},durationMs,limitations:string[],timeline:[{atMs,seq,type:'sample',state:{position,camera,vehicle,speed,flashlight,rendering,lightingInstant,lightingPreview,weather}} | {atMs,seq,type:'event',kind,data}]}. Časy jsou relativní k vybranému game-ready. Export compileRecording(bytes, options) přijímá nekomprimované Buffer/Uint8Array, options={id,sessionId,sha256,fromSeq,toSeq,readySeq}. Vzorky berou jen frame-window a čas contextAtMs; explicitní události action/quality-change/lighting-change/camera-change. Omitnout neznámé volitelné údaje, zachovat chybějící data v limitations. Timeline má stabilní časové pořadí a původní seq; validace kontinuity se dělá nad úplným logem. Fixtures b6-20261017.json a outdoor-car-20261018.json; před implementací knihovny se vyhnout node I/O v čistém compileRecording kromě SHA.
Základ je čistý main ab39b7185d0c9fb5e393c654818f43de82e07886 v izolované worktree; tři tasky vznikly před rendererem BMAD. Žádné nevratné produktové operace ani nevyřešené otázky záměru. Produkční scope je nulový.
## Spec Change Log
## Review Triage Log
| Nález | Verdikt a důkaz | Postup |
|---|---|---|
| Blind B1: počasí | medium; App po60s volá setWeather i při neúspěšném refreshi, původní fetchedAt guard jej neobnovil | patch: vlastněný snapshot obnovovat podle reference i nového vzorku |
| Blind B2: terminální scéna | medium; published vracelo originalFrame a dispose bylo až při pagehide | patch: ukončit vlastní Game po návratu aktuálního endFrame |
| Edge E1: počasí | medium; stejný doložený řetězec jako B1 | stejná patch skupina |
| Edge E2: cleanup | medium; timeout i complete zrušily watchdog bez uvolnění enginu | stejná patch skupina jako B2 |
| Edge E3: hidden start | medium; visibilitychange před startedAt se ignorovala, první frame nekontroloval hidden | patch: odmítnout hidden v každém přehrávaném snímku |
| Edge E4: změna fixture | medium; middleware četlo živé bytes pod starým sourceHash | patch: SHA-ověřená kopie obou fixture při startu, test změny dat |
| Edge E5: časný signál | medium; signal handlers byly až po API/preview readiness, SIGTERM mohl zanechat child | patch: instalovat stop/abort před spawn a mít cleanup ve finally |
| Edge E6: health headers | medium; fetch nemělo timeout, takže retry počet neomezoval dobu čekání | patch: deadline a AbortSignal timeout/stop pro každý health request |
| Verification V1: skutečné nastavení | medium; odstranění timeOverride by nechalo cursor testy i původní complete projít | patch: odečíst skutečné vstupy oblohy/svítilny, porovnat čas/kvalitu/scaling/počasí; CPU negativní mutace a browser omitLightingOverride |
| Verification V2: počasí | medium; potvrzen stejný60s spotřebitel jako B1 | stejná patch skupina |
| Verification V3: cleanup | medium; engine po reportu běžel až do pagehide | stejná patch skupina jako B2 |
| Blind B3, druhé review: finální submit | medium; health se snímalo před posledním endFrame a published blokovalo pozdější fail | patch: post-frame health recheck, WebGPU submitted-work fence s timeoutem, čerstvá kontrola před dispose; CPU pozdní fault/timeout regrese |

Všechny opravy zůstaly v plánované testové vrstvě a nepřidaly produktové API. Původní zadání ani frozen intent se nemění. Datový implementátor tyto root soubory nevlastnil; scoped opravy provedl přímo koordinátor. GPU negativní varianty jsou připravené, ale jejich praktické provedení nadále čeká na externí podmínku.

Druhé review potvrdilo původních11 nálezů jako opravené. Blind hunter navíc doložil B3; scoped oprava a25/25 cílených kontrol zachovávají render loop až do aktuálního endFrame, potom ho zastaví a před dispose ověří dokončení submitted práce. Queue/guard kontrakt vychází z existujícího client/render-startup.ts a pinovaného WebGPUEngine9.30. Praktická GPU přejímka stále není potvrzená.
## Design Notes
Varianty: přesný input replay vyžaduje chybějící ticková data; waypoint autopilot by přidal neověřené řízení a jinou kameru; přímé vzorkované renderové přehrání nejlépe cílí KEY-39/31 a lze je celé izolovat v testech. Volba má omezenou paměť jedné fixture a žádnou dlouhodobou runtime cache. Čas interpolovaných mezisnímků není historické měření. Automatickou efektivní kvalitu lze v QA vynutit podle pozorování, ale neporovnává se tím algoritmus adaptace.
## Verification
- Cílené recording/replay testy a skutečná extrakce obou zdrojů.
- Stabilní pnpm test, pnpm build a izolované pnpm test:integration.
- Produkční browser replay obou fixture; health, snímky, časový průběh a korektní úklid. Bez tvrzení výkonového A/B.
