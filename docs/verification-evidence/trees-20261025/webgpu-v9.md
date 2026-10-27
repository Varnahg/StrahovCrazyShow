# Výchozí WebGPU: opravený start celé hry

26. 10. 2026, source snapshot `81830a82b03828f03e02392f2c88606bbca4108b58a7b56853c9c6df2c0bd072`, 8 810 souborů včetně testů. Klient `sha256-46ecaa6180473f48b34130a6895619dd3310e1ef1b1de1a5c8fe477a2eacced5`. Produkční snapshot candidate-v9, bez HMR. URL bez parametru renderBackend: `http://127.0.0.1:4182/?terrainReview=b5-tree-near&treePilot=own`.

## Výsledek a příčina

Celá hra v Edge dosáhla `bootStage=ready`, `lightPreparation=complete`, `renderHealth=ready`, `renderErrorCount=0`. Všech 41 etap prošlo se zachovanými limity 30 s na kvalitu a 90 s celkem:

| Kvalita | Etap | Aktivní čas |
|---|---:|---:|
| low | 15 | 23,752 s |
| high | 13 | 25,903 s |
| medium, finální | 13 | 16,196 s |
| celkem | 41 | 65,851 s |

Původní opakované kompilace PCF stínů odstranila [oprava Fresh wrapperu](../../../client/webgpu-shadow-readiness.ts). Její CPU reprodukce (19 programů místo 3), následný úspěšný test a skutečné v8 WGSL porovnání jsou popsané v [předchozí evidenci](pilot-v5-webgpu-v6.md) a [výzkumu](../../trees/20261025/shadow-startup.md). V8 current-on přešel z 288 opakování shodných bajtů na 0, ale celá studená příprava s profilerem ještě překročila 30 s. Běžný v8 dokončil low za 27,38 s a high narazil na 30,245 s těsně před koncem.

V9 navíc využívá původní 4ms časový rozpočet kontrol: WebGPU má početní limit 512 místo 128. WebGL zůstává na 128. Žádná etapa, kontrola meshe, retry ani dvě potvrzení renderu nejsou vynechány. Nový skutečný Game test ověřuje pevný početní limit, časovou mez, nevykreslení nehotové fronty a celý průběh 800 meshů se stejnými 1 600 kontrolami a 3 rendery na etapu. Nezávislá čtecí review obou oprav nenašla další konkrétní problém.

## Ověření

- V9 **129/129 cílených testů PASS**, produkční build PASS. Logy `targeted-v9.log`, `build-v9.log` a `pipeline-v9.json` pod lokální `.cache/trees-validation-20261025/`.
- `v9-webgpu-startup-complete.json` pod `.cache/trees-gpu-20261025/` obsahuje přesný vybraný výsledek diagnostiky. Nativní WGSL: žádná GLSL→SPIR-V/tint konverze.
- Celá sada se stejným globem jako `pnpm test`, s runnerem omezeným na 2 workery, a následná izolovaná integrace byly spuštěny z téže zmrazené verze. Jejich rozdílné výsledky jsou uvedené níže; plná sada není označena za PASS.

### Dokončená regresní kontrola

Plná v9 sada skončila 26. 10. ve 12:13 UTC za 1 572,17 s: **2 227 PASS, 16 FAIL, 3 SKIP z 2 246 testů**. Původní log a exit 1 se zachovávají. Integrace byla následně spuštěna samostatně a ve 12:25 UTC skončila **PASS** (`integration-result-v9.json`).

Z šestnácti selhání:

- Dva nezměněné autodev případy samostatně prošly: live reviewer za 20,80 s a external commit za 5,65 s. Původní první chyba byla 15s fixture wait, druhá pád child Node s exit 3221226505. Samostatné PASS podporují závislost na prostředí/souběhu, samy neurčují přesnou příčinu pádu.
- Dvanáct Room/UI případů poskytovalo starý `lightingPreviewRef`, ale aktuální UI čte složený `seasonPreviewRef`. Fixture nyní používá skutečný selector a ověřuje odlišný zimní okamžik; původní lifecycle/cancellation/Room assertions zůstaly.
- Grass fixture porovnávala nový composite revision přímo s původním resource objektem. Rozbalení obrovského Babylon grafu při assertion diffu je doložený kandidát příčiny `Array buffer allocation failed`; původní native alokaci bez stacku nelze přesně přiřadit. Nová kontrola zachovává skutečný controller a porovnává identity bez rozbalování celé scény. Produkční tree loader se nespouští.
- Historický wind oracle nyní explicitně povoluje pouze původně zamýšlenou změnu identity pluginu a `STRAHOV_TREE_WIND`. Jeho původní archiv, shaderová těla, UBO a metadata jsou beze změny; kontrola pokrývá všech pět stavů.

Po převzetí oprav společná cílená sada včetně FAR helperu: **84/84 PASS**, celý `tsc --noEmit` PASS. Čtecí SHA audit všech 8 810 původních v9 vstupů našel pouze změny těchto tří testových souborů a žádnou změnu herních zdrojů či assetů. Nové soubory FAR authoringu jsou samostatně testované a nejsou součástí herního rendereru. Logy `corrected-fixtures-v9.log`, `corrected-types-v9.log`, `autodev-isolated-v9.json`, `v9-input-comparison.json`. Celá sada po těchto testových opravách nebyla znovu spuštěna; finální CI přesného head zůstává otevřené.

## První skutečný herní benchmark

`v9-webgpu-own-b5-near-summer-medium-01.json`: UTC dokončení 11:40:31.663, 10,03 s / 231 snímků, **23 FPS, p95 50,6 ms, p99 56 ms**. Edge, WebGPU compatibilityMode=true, 1528 × 650 CSS i interně, medium, pevný pohled B5 v režimu hosta, jeden avatar a celý HUD. Letní den 15. 7. 2026, clear DEMO. Browser hlásí nvidia/pascal; místní `nvidia-smi` inventář GTX 1060 / driver 582.28. Veřejné UI nezná přesný název adaptéru a pravdivě to uvádí.

1 207 draw calls, 2 446 831 trojúhelníků včetně všech průchodů, 685 425 aktivních trojúhelníků stromů. CPU render 40,49 ms, mainDraw 32,38 ms (inkluzivní interval scény, nikoli izolované předávání GPU příkazů). Render health platný po celý interval, asset/render errors 0. ShaderPreparation 704 a asyncPipeline 878 zůstaly mezi start/end beze změny; stálý pohled již znovu nekompiluje.

Screenshot `v9-webgpu-own-b5-near-summer-medium.png` byl vizuálně prohlédnut. Je to průzkumný R5 pilot, nikoli přijetí realistického katalogu: 2 nové zdrojové stromy, 108 legacy. Horní HUD překrývá kus koruny; známý drift nehybného Actoru z −85 na −84,860 m je zachovaný bez teleportu. Není to pixelově přesné A/B ani multiplayerová přejímka.

Clock soubor `v9-webgpu-medium-clocks.json` má čas 11:40:46–58 UTC, tedy **až po benchmarku**. Je to následný hardwarový vzorek, nikoli důkaz taktů během tohoto intervalu. Nebylo prokázáno 60 FPS ani přesné zrychlení proti WebGL2; starší GL2 záznamy mají jiné rozlišení a takty. Příprava 65,85 s a CPU náklad vykreslení nadále vyžadují práci.

## Navazující práce

Výchozí cesta zůstává normální WebGPU; `webgpu-fast` je explicitní lokální experiment. Čtecí audit zjistil riziko opakovaného použití jeho render bundles po změně indexového prefixu listí/opadu; před jeho přijetím je nutná skutečná sezonní, LOD a dynamická parita. Samotný statický FPS pilot nestačí. FAR skupiny se zachovanými ranky a poté všech 110 stromů zůstávají otevřené. Samostatné commity, finální review a integrace do main ještě neproběhly.
