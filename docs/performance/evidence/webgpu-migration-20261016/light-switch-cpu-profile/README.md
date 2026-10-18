# Funkční CPU stacky zbývajících světelných přechodů

19.10.2026 Europe/Prague (capture18.10.22:09UTC). Jde o přijatý diagnostický výstup, nikoli další opravu plynulosti. KEY-31 a celá migrace zůstávají otevřené.

## Co měření rozhodlo

Skutečné stacky v obou dlouhých přechodech potvrzují cestu `PBRBaseMaterial.isReadyForSubMesh → _prepareEffect → _prepareDefines`, přípravu světel a serializaci MaterialDefines; samostatně se objevují WebGPU bind-group cache a upload UBO. Nejde jen o novou shaderovou kompilaci: během desetisekundového okna nebyl žádný nový program/modul ani synchronní pipeline. Samotné stacky ještě neprokazují, která z těchto funkcí spotřebovala nejvíce CPU času.

| Vzorek | Dokončené pokusy | Příprava | Bind/draw | Celý main draw | Stack samples v širší obálce |
|---|---:|---:|---:|---:|---:|
| Reference |321|5,1ms|9,4ms|17,7ms|58|
| Nastoupení + změna světel |500|90,6ms|29,1ms|125,5ms|43|
| Další změna světel |432|74,7ms|24,4ms|101,7ms|10|

Všechny3/3 mesh vzorky jsou kompletní, omitted/errors/unknown/incomplete/abandoned0; souhrnmax8pokusů. Příprava je interval beforeRender→beforeBind, ne čistá kompilace; bind/draw zahrnuje CPU submission a případná čekání driveru, ne samotný GPU čas. Stacková obálka začíná před MeshDrawProfile.beginFrame a končí po exportu vzorku, tedy je širší než main draw i jednotlivá příprava.

V prvním dlouhém snímku jsou například v relativních časech33,21ms `_prepareDefines`,78,33ms `_prepareEffect`,94,42ms `MaterialDefines.toString`;62,27/110,72/127,72ms `getBindGroups`. Druhý přechod obsahuje `_prepareEffect`36,92ms a `PrepareDefinesForLights`45,47ms. Jsou to okamžiky pozorovaných stacků, nikoli naměřené délky těchto funkcí. Kompletní časové řady i mapované stacky jsou v [souhrnu](run-01/cpu-summary.json.gz).

## Podmínky a identita

Source `52abcad629baf06f8abec6c6037179f6000b8b84f4bec333d06a743c688f4796`,629manifestovaných vstupů včetně testů. Podklad: native909ebf8a + pouze existující bounded mesh overlay26878bbf; navíc copied standardní CPU sampler a přesné Game hooky. Nativní runtime v main ani foreign29fa WIP se neměnily.

Edge155, WebGPU compatibility, browser NVIDIA Pascal; místní inventář NVIDIA GTX1060/driver32.0.15.8228 (také Intel UHD630). CSS1528×650, interně1175×500, manualLow77%, jedna skutečná relace/Alex,0ambientních aut/autobusů/cestujících. Řízená původní weather fixture, noční náhled1792447200000; jiné datum než předešlý pilot, takže nejde o jeho A/B opakování. Foreground ověřen před benchmarkem; jiné herní karty v Edge nebyly otevřené. Vlastní4200/API2595 po sběru ukončeny.

Session `26acd4f2-f749-4e3c-b65f-a3eb39394e27`:448souvislých záznamů seq0–447, game-ready306, benchmark-start368, summary397, dispose439. CPU origin1792361291104 a zaokrouhlený session origin1792361291104,1 odpovídají. Jeden sampler ID1, start87473,7ms/stop97516,6ms,637vzorků, reasonbenchmark-end; buffer2000nebyl naplněný. Healthvalid,0chyb/pending. Benchmark56,7FPS/p9521,6/p9929/max149,5ms,2intervaly≥100ms je pouze kontext diagnostiky s její režií. Není důkazem nového zrychlení ani splněním Medium/2040×986/multiplayer cíle.

## Nepravidelné vzorkování a primární podklady

Constructor na skutečné lokální stránce s `Document-Policy: js-profiling` uspěl a vrátil interval16ms; bezpolicy NotAllowedError. Pozitivní/negativní DOM výstupy jsou zachované. Žádné browser flags/origintrial/worker API. [Specifikace](https://wicg.github.io/js-self-profiling/) definuje best-effort stack samples; [Chromium implementace](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/timing/profiler_group.cc) dokládá policy, Windows interval a synchronní práci při stop před vrácením Promise. Proto se stop volá až po hotových metrikách, serializace v Promise pokračování.

Skutečné mezery mezi637vzorky mají minimum0,01ms, medián16,085ms a maximum31,675ms;199mezer je pod8ms. V referenční obálce25,5ms je58vzorků. **Počet vzorků ani počet×16ms se nesmí vydávat za CPU dobu nebo její podíl.** Aktuální [V8 CPU profiler](https://github.com/v8/v8/blob/main/src/profiler/cpu-profiler.cc) má další netimerové/deopt stacky (`AddDeoptStack`, `AddCurrentStack` s update_stats=false); [profile-generator](https://github.com/v8/v8/blob/main/src/profiler/profile-generator.cc) je může ukládat bez zvyšování self ticks. [Blink export](https://chromium.googlesource.com/chromium/src/third_party/+/refs/heads/main/blink/renderer/bindings/core/v8/profiler_trace_builder.cc) je v základním API neoznačuje. Konkrétní původ zdejší husté skupiny ani přesná shoda této aktuální implementace s Edge155 buildem nejsou prokázané.

Analyzér počítá pouze přítomnost/frekvenci a ukládá skutečné timestampy, žádné procento CPU času. Prázdný stack není důkaz GC/GPU/idle. [Node SourceMap.findEntry](https://nodejs.org/docs/latest-v24.x/api/module.html#sourcemapfindentrylineoffset-columnoffset) používá zero-based souřadnice; převod line/column−1 a všech6použitých JS/map párů nezávisle ověřeny. Minifikace zachovaná, pouze hidden maps; jejich přesné bajty jsou archivované.

## Ověření a další rozhodnutí

Helper11/11+scopedTS. V1zapojení28/28/fullTS/buildPASS; blindreview nalezlo únik sampleru při výjimce po odebrání benchmark state. Nový genuine RED11PASS/1FAIL potvrzuje CPUstop[]; V2 finally přes celé dokončování zachovává původníerror a stop jednou. V2 **29/29 + full TypeScript + produkční build PASS**, re-review bez dalšího nálezu. Původní logy i V1manifest zachované. Celá sada/integrace se pro tuto soukromou instrumentaci znovu nespouštěly; přijatý native/combined runtime zůstává byteově stejný a má své předchozí plné kontroly.

Další volba se zúžila na cenu PBR define/effect přípravy versus createEffect cache lookup, serializace, bind groups a upload. Nejlevnější další rozlišovací krok jsou omezené vnořené wall-time čítače těchto konkrétních rutin jen během stejných tří vzorkovaných přechodů, s odečtem vnořené práce a cleanup. Široké cache, trvalé light sloty nebo další warm etapy zatím nemají dostatečný důkaz; mohou změnit binding/shadow/GPU náklady a lifecycle. Tento výstup jejich implementaci nepřijímá.

Hraný4199ověřen před/po:17/17 původních code souborů a servírovanéHTML přesně odpovídají přijatému3d405db9. Starší služby se nepřestavovaly. Operativní PID/start identity zůstávají jen v ignorovaném runtime, archiv obsahuje projekci bez nich. [Artifact manifest](artifact-manifest.json) má SHA gzipu i původních bajtů; dekomprese všech položek kontrolovaná. Nezávislý audit potvrdil source/clock/seq/maps i pravdivé limity výkladu.
