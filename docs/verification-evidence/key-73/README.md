# KEY-73 — evidence AI chatu

Implementace vznikla v kanonickém checkoutu na `codex/crazy-typka-scope-ui-20261104`. [PR42](https://github.com/Varnahg/StrahovCrazyShow/pull/42) směřuje do main podle následného výslovného zadání uživatele. Runtime i herní HUD byly ověřené; konečné dokumentační změny ještě musí před merge projít kontrolami PR.

## Prokázané výsledky

| Oblast | Výsledek a hranice důkazu |
|---|---|
| KB | Sedm ověřených V3 jednotek, seed revision3, 152bundles. Původních145 zachováno. [Import](isolated-db-import.json) prošel v odděleném skutečném pgvectoru s nulou embedding volání. |
| Embeddingy | [Sedm skutečných vstupů](campus-embeddings.json), 2868tokenů, 2.677s. Existující cache ani komunitní zdroje nebyly přepsány. |
| Retrieval | [8/8 českých scénářů](retrieval.json) našlo potřebnou jednotku mezi původními top4, distance cutoff0.60 beze změny. SQL revize a skutečné distance jsou uložené. |
| Scope D | [Nezávislá zamčená sada48 případů](holdout-d-analysis.json):16/16 hlavních místních dotazů,6/6 oddělených mixed projekcí,2/2 bezpečné clarification pro nerozdělitelný mix,22/22 režimů. [Labels](holdout-d-labels.json) a [jednotlivé výsledky](holdout-d-results.ndjson) jsou inspectovatelné; [lineage](holdout-d-lineage.json) uvádí odstranění provider request IDs. Starý decoder měl jeden známý named-refusal protocol error; D2 jej opravil pouze na denial a potvrdil usage. Viz [scope předání](../../agents/handoffs/key-73-scope.md) a [výzkum](../../home-ai/20261104/key-73-kb-research.md). |
| Skutečná služba | [R3:12/12 dotazů](live-chat-r3.json) přes skutečné moderation/Decisions/embedding/pgvector/generování prošlo. Hostelská sezona, registrátor jako první krok, roleSH/SÚZ, přehled aktivit rozdělený do6částí, přesné menza hodiny a výluka17.11, nákup i bezpečný odkaz na Agátu. Matematika/sex/objectifying měly jen2 provider události a žádnou embedding/generation; neukotvené pokračování0. |
| Replay a hranice | [R3](live-boundaries-r3.json) odhalil nevhodné upřesnění ve zbytku mixed odpovědi. [R4 skutečný průchod](live-boundaries-r4.json) po opravě: místní večeře do19:30, neutrální odmítnutí zbytku, biology mask a pokračování odmítnuty, vlastní citace funguje, přesný replay0 provider událostí. [Samostatné vyhodnocení](live-boundaries-r4-evaluation.json) opravuje pouze chybný regex harnessu; původní raw false zůstává uložený, modely nebyly opakovány. |
| Jednotkové kontroly |52scope/adapter,113server/provider/contract/evidence,53UI/store/modality a115shell/sourceUI kontrol prošlo v odpovídajících checkpointech. Poslední čistě textová oprava zbytku mixed zprávy:93cílených server/scope testů PASS. Počty se nesčítají, sady se částečně překrývají. |
| Build | Neměnný R3 snapshot `3f1cc5c7ce50ac8f3ceba3329cd92e81a6fca72a2c12bb7a070930147c67a209`,9575ověřených souborů včetně testů. `tsc --noEmit` a Vite produkční build PASS, Vite58.07s. Sdílený node_modules junction má původní patch-root metadata, proto striktní pnpm snapshot build správně odmítl změněnou cestu patchedDependencies; žádná instalace nebyla provedena, použity přímo stejné zamčené Node CLI. CI níže má čistý frozen install a skutečný pnpm build. |
| Integrace | Lokální `pnpm --config.verifyDepsBeforeRun=error test:integration` PASS na izolovaném2568, včetně12SDK hráčů, soukromí hosta, řízení, recovery a feedback hranic. |
| Usage a latence | [Měřené API fáze R3/R4](provider-usage.json) obsahují počty volání, tokeny a wall time odděleně pro moderaci, Decisions, embedding a generátor. Jsou to syntetické přejímkové průchody; účtovaná měnová částka není v odpovědích provideru a netvrdí se. |
| Plná CI | [První CI](ci-first.json) na335750f0:3167testů,3165PASS,0FAIL,2SKIP. [Konečný runtime d885fc4f](ci-runtime-final.json):3168testů,3166PASS,0FAIL,2SKIP; skutečný pgvector, pnpm build a izolovaná integrace PASS. Feedback browser i source-secret-hygiene green. Zbývající dokumentační head musí před merge také projít kontrolami PR42. |

## Skutečná Edge kontrola

Klient byl produkční build `sha256-05c1790ea19bc6f8604d00eb969bb56e2f8110f8be43e3e445ae68a787d086cd` na vlastním `http://127.0.0.1:4180/?renderBackend=webgl2`, API2571 a oddělená fixture DB5439.

- Enter odeslal přesně jednu zprávu; další Enter na prázdném poli nic nepřidal. Shift+Enter vytvořil skutečný newline.
- Automatická výška se zvětšila na140px s vnitřním scrollováním a po odeslání vrátila na42px; computed `resize:none`.
- Pointer focus měl `box-shadow:none`, `outline:none`. Tab vrátil jemný solid outline0.8px; psaní samo nepřepíná pointer modalitu.
- Zavření a znovuotevření zachovalo rozepsaný text. Popelnice smazala vlastní syntetickou konverzaci a draft.
- Info/Escape fungovalo; na320/360px nebyl levý ořez. [320px snímek](edge-mobile-320-info.jpg) a [360px snímek](edge-mobile-360-info.jpg) dokládají rozložení, nikoli GPU výkon.
- U přehledu bylo pět skutečných tematických Reply tlačítek. Výběr sportovní části vložil právě tuto část jako quote; po odeslání byla viditelná v uživatelské bublině a odpověď řešila členství v posilovnách.
- Přepnutí doEN změnilo všechny akce/input hinty a nový modelový dotaz odpověděl anglicky. Ověřeny oba přesné Agáta odkazy.
- OSIME ani fyzická mobilní klávesnice nebyly ověřovány: isComposing/keyCode229 guard je krytý cílenými testy, mobilní rozměry jsou Edge viewport override, vždy obnovený před zavřením vlastní karty.

## Herní HUD a historické omezení

R3 se ve skutečné multiplayerové relaci připojil, renderer byl skutečný WebGL2 na NVIDIA GeForce GTX1060. Následná příprava materiálů při automatickémMedium vypršela ve starém30s `current-off`:30013ms, paused0, queue872/cursor128, readyRenders1. Telemetrie potvrdila visible/focusedtrue. První finální herní snímek nebyl prokázán a tento průchod se neoznačuje jako hratelný ani jako přijatá herní kontrola AI panelu.

R4 v samostatném aktivním a fokusovaném Edge okně na `http://127.0.0.1:4180/?renderBackend=webgpu` dosáhl skutečného multiplayerového game-ready. [Readiness](edge-hud-r4-readiness.json): NVIDIA pascal, automatické Medium; materiály complete79.312s, low32.407s/high33.265s/medium13.639s, původní limity60/180 beze změny. R4 server snapshot `dcd8e2758cc80c4a6a34d8582b866610ca39f743b7bb1cdf46a1f4bcb58f3f6f` používá [shodný neměnný klient](derived-client-r4.json) z R3. [Opakovaný import](isolated-db-import-r4.json) stejných152bundles prošel bez placeného embeddingu.

Ve skutečném HUD prošly Enter, Shift+Enter (ověřený newline), resize:none a automatická výška, pořadí info–popelnice–zavřít, skrytí soukromí pod info, dvě podložené části registrační odpovědi, citovaná reakce na blok3, zachování draftu/citace při zavření a smazání. [Citovaná odpověď v běžící scéně](edge-hud-r4.jpg), [prázdný panel po smazání](edge-hud-r4-reset.jpg). HUD zobrazoval přibližně25–38FPS; systémový/NVIDIA sampler neběžel a FPS ani celková hratelnost se touto kontrolou nepřijímají.

Vlastní karta, viewport override, API77316, preview a ephemeralDB R4 byly uklizené; validační/snapshot rezervace uvolněné. Porty2568/2571/4180/5439 volné, původní8080 a produkční DB zachované. [Úklid](cleanup-r4.json). PR41 není závislost této změny. OSIME zůstává omezením ručního ověření popsaným výše.

Historické A/B/C modelové kandidáty nebylo možné přijmout a jejich neúspěšná data nejsou přepsaná úspěchem. Podrobná metodika, zdrojové hashe a kalibrace zůstávají ve výše odkazovaných předáních a JSON důkazech.
