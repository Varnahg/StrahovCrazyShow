# KEY-73 — evidence AI chatu

Implementace vznikla v kanonickém checkoutu na `codex/crazy-typka-scope-ui-20261104`. [PR42](https://github.com/Varnahg/StrahovCrazyShow/pull/42) směřuje do main podle následného výslovného zadání uživatele. Tento přehled rozlišuje naměřené výsledky a zbývající herní přejímku.

## Prokázané výsledky

| Oblast | Výsledek a hranice důkazu |
|---|---|
| KB | Sedm ověřených V3 jednotek, seed revision3, 152bundles. Původních145 zachováno. [Import](isolated-db-import.json) prošel v odděleném skutečném pgvectoru s nulou embedding volání. |
| Embeddingy | [Sedm skutečných vstupů](campus-embeddings.json), 2868tokenů, 2.677s. Existující cache ani komunitní zdroje nebyly přepsány. |
| Retrieval | [8/8 českých scénářů](retrieval.json) našlo potřebnou jednotku mezi původními top4, distance cutoff0.60 beze změny. SQL revize a skutečné distance jsou uložené. |
| Scope D | [Nezávislá zamčená sada48 případů](holdout-d-analysis.json):16/16 hlavních místních dotazů,6/6 oddělených mixed projekcí,2/2 bezpečné clarification pro nerozdělitelný mix,22/22 režimů. [Labels](holdout-d-labels.json) a [jednotlivé výsledky](holdout-d-results.ndjson) jsou inspectovatelné; [lineage](holdout-d-lineage.json) uvádí odstranění provider request IDs. Starý decoder měl jeden známý named-refusal protocol error; D2 jej opravil pouze na denial a potvrdil usage. Viz [scope předání](../../agents/handoffs/key-73-scope.md) a [výzkum](../../home-ai/20261104/key-73-kb-research.md). |
| Skutečná služba | [R3:12/12 dotazů](live-chat-r3.json) přes skutečné moderation/Decisions/embedding/pgvector/generování prošlo. Hostelská sezona, registrátor jako první krok, roleSH/SÚZ, přehled aktivit rozdělený do6částí, přesné menza hodiny a výluka17.11, nákup i bezpečný odkaz na Agátu. Matematika/sex/objectifying měly jen2 provider události a žádnou embedding/generation; neukotvené pokračování0. |
| Replay a hranice | [R3 skutečné hraniční průchody](live-boundaries-r3.json): biology mask i následné pokračování odmítnuty, vlastní serverová citace fungovala a přesný replay měl0nových provider událostí. Původní celkový bool bylfalse kvůli textu zbytku mixed odpovědi; místní část i vyloučení matematiky byly správné. Oprava neutrálního pevného zbytku má samostatný regresní test, další skutečný průchod patří finální přejímce. |
| Jednotkové kontroly |52scope/adapter,113server/provider/contract/evidence,53UI/store/modality a115shell/sourceUI kontrol prošlo v odpovídajících checkpointech. Poslední čistě textová oprava zbytku mixed zprávy:93cílených server/scope testů PASS. Počty se nesčítají, sady se částečně překrývají. |
| Build | Neměnný R3 snapshot `3f1cc5c7ce50ac8f3ceba3329cd92e81a6fca72a2c12bb7a070930147c67a209`,9575ověřených souborů včetně testů. `tsc --noEmit` a Vite produkční build PASS, Vite58.07s. Sdílený node_modules junction má původní patch-root metadata, proto striktní pnpm snapshot build správně odmítl změněnou cestu patchedDependencies; žádná instalace nebyla provedena, použity přímo stejné zamčené Node CLI. CI níže má čistý frozen install a skutečný pnpm build. |
| Integrace | Lokální `pnpm --config.verifyDepsBeforeRun=error test:integration` PASS na izolovaném2568, včetně12SDK hráčů, soukromí hosta, řízení, recovery a feedback hranic. |
| Plná CI | [První CI](ci-first.json) na335750f0:3167testů,3165PASS,0FAIL,2SKIP; skutečný pgvector, pnpm build a izolovaná integrace PASS. Feedback browser i source-secret-hygiene green. Po navazující integraci ještě musí před merge projít plná CI pro finální head; její záznam patří doPR42. |

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

## Herní omezení a navazující okno

R3 se ve skutečné multiplayerové relaci připojil, renderer byl skutečný WebGL2 na NVIDIA GeForce GTX1060. Následná příprava materiálů při automatickémMedium vypršela ve starém30s `current-off`:30013ms, paused0, queue872/cursor128, readyRenders1. Telemetrie potvrdila visible/focusedtrue. První finální herní snímek nebyl prokázán a tento průchod se neoznačuje jako hratelný ani jako přijatá herní kontrola AI panelu.

Po tomto omezeném pokusu jsou vlastní karty/scéna, API, preview i fixture DB ukončené a validační zdroje předané PR41. Původní8080 a produkční DB zachované. Po ověřené integraci grafiky bude následovat krátká přejímka nového AI panelu na prokazatelnémLow/Ultra prvním snímku; limity vAI úkolu nejsou prodlužované. Nové uživatelské zadání WebGL260s řeší samostatně PR41.

Historické A/B/C modelové kandidáty nebylo možné přijmout a jejich neúspěšná data nejsou přepsaná úspěchem. Podrobná metodika, zdrojové hashe a kalibrace zůstávají ve výše odkazovaných předáních a JSON důkazech.
