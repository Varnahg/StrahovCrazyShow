# Kandidátní běhy přípravy shaderů

## Aktuální řízený experiment

Po sestavení nového `candidateN` lze místo samotného `--serve` použít `--experiment run1` (také run2/run3 a jejich `-attemptN`). Nastav stejné `STRAHOV_SHADER_CANDIDATE` a `STRAHOV_PERF_WEATHER_FIXTURE` jako pro build/serve a navíc absolutní `STRAHOV_PERF_EXPERIMENT_PLAN` s JSON plánem. Staré buildy se po změně harnessu nepřestavují ani neservírují jako shodná identita.

Plán má šest neprázdných textů `problem`, `hypothesis`, `change`, `metric`, `correctness`, `acceptance`; `sourceHash` je přesné `inputs.sourceHash` z nového `build/identity.json`. Dále obsahuje `benchmarkCount` (0–30), `timeoutSeconds` (30–1800) a `systemTelemetry` (výchozí true). Nula benchmarků znamená pouze startup, nikdy FPS přejímku. Kritérium a počet opakování se stanoví před prvním během, ne až podle výsledku.

```powershell
$env:STRAHOV_SHADER_CANDIDATE='candidate8'
$env:STRAHOV_PERF_WEATHER_FIXTURE=(Resolve-Path '.cache/render-profile-20261102/weather.json').Path
$env:STRAHOV_PERF_EXPERIMENT_PLAN=(Resolve-Path '.cache/render-next-20261102/candidate8/plan-on1.json').Path
node docs/performance/evidence/render-next-20261102/harness/run.mjs --experiment run1
```

Existující serve ověří celý build a spustí API/preview. Monitor poté spustí stávající systémový sampler skrytě do `run/system` a ověřuje skutečný příchod diagnostiky správného klienta, presentation-rate a čerstvé systémové vzorky. Klienta otevři v Edge na vypsané URL s plánovanými query a skutečně vstup do hry. Monitor browser neovládá; časované FPS vzorky stále spouští skutečné UI. Je-li plánovaná hra se spoluhráči, po ready spusť stávající `--peers run1` a ověř skutečnou populaci před benchmarky.

Přírůstkově čtené JSONL zahrnují `.part-NNNN` soubory. Terminální chyba, chybějící/nesprávná identita, zastavení nebo zastarání sběru nesmějí vytvořit úspěšný výsledek. Po plánovaném výsledku či limitu monitor požádá vlastní run/sampler o STOP, čeká na cleanup a uloží `experiment-summary.json`. Stav `measurement-complete` potvrzuje dokončení měření a jeho kontrol; přijetí optimalizace vyžaduje samostatné porovnání podle plánu. Souhrn rozlišuje dobu startu, měřené intervaly a zbývající režii; vnořené časy se nesčítají. Neplatné pokusy a raw data zůstávají zachované.

Vypnutí systémové telemetrie musí být výslovné a výsledek označený jako omezený. Po běhu zavři pouze vlastní kartu a ověř ukončení vlastních procesů/portů. Žádná chyba tohoto nástroje neopravňuje měnit herní readiness nebo prodlužovat její timeouty.

## Historie kandidátů a společné podklady

Candidate7 přidává opt-in syntaktickou cache: v témže buildu `?renderBackend=webgpu&shaderSyntaxCache=0` versus `?renderBackend=webgpu&shaderSyntaxCache=1`. Zapnutí je pouze loopback; výchozí stav zůstává vypnutý do GPU přejímky. Oba režimy mají nativní přípravu bez dřívější fronty. Záznamy `shader-syntax-cache` musí potvrdit skutečné enabled/activityKnown a native počty, nikoli jen URL. Základní porovnání nepoužívá `profileStartupCpu` ani `profileEnvironment`. Instalované bytes a lock hash patche ověřuje root před novým buildem; staré buildy se nepřepisují.

Archivní candidate3 používá tentýž build se dvěma explicitními loopback URL: `?renderBackend=webgpu` pro dosavadní frontu a `?renderBackend=webgpu&startupShaderScheduling=native` pro nativní přípravu. Druhá možnost vypíná pouze shader admission adaptér; zachovává material guard, pipeline/health/submission gates i původní timeouty. V logu musí odpovídat `shaderScheduling.inert=true`; remote host tento parametr ignoruje. Nejde o přijatou optimalizaci. Starší baseline režim po přijatých RAG změnách správně odmítá rozdílný server/shared kód; nepovolovat je dodatečně ani nevydávat starý archiv za shodný nový checkpoint.

Od candidate4 je po zamítnutí regrese výchozí nativní cesta; frontu zapne pouze výslovné loopback `startupShaderScheduling=queued`. Pro další úzkou diagnostiku použít `?renderBackend=webgpu&profileStartupCpu=1` bez`profileEnvironment`: měří createEffect/WGSL processing bez inventáře textů. Výsledky jsou v`startup-cpu-profile` (preparation-start/startup-end); startup-end může při úspěchu zahrnovat i submitted-frame gate. Profiler je pouze lokální, nikdy nevynechává readiness.

Oba režimy používají pro retry pomocných targetů stejný levný `WebGpuCompilationProfile.shaderPreparationCompletions` signál z nativní vrstvy. Samotné vypnutí fronty by jinak odstranilo její completion čítač: RTT postprocess může při pending Effectu vrátit `null` ještě před pipeline draw a spotřebovat jednorázový refresh. Skutečné Babylon apply/finalize/refresh metody jsou kryté regresí; native kontrola s původním čítačem ji reprodukovaně nesplní. Completion signál není náhradou readiness ani validačních gates.

Stejný produkční build/serve/peers postup jako [původní harness](../../render-profile-20261102/harness/README.md). Jeho soubory ani buildy se nemění. Nové výstupy jsou pouze `.cache/render-next-20261102/candidate1/`; pro další neměnný kandidát nastav `STRAHOV_SHADER_CANDIDATE=candidate2` (stejně při buildu, serve i peers). Nikdy se nepřepisuje existující build/run.

`node docs/performance/evidence/render-next-20261102/harness/run.mjs --build baseline` sestaví aktuální main. Název CLI `baseline` je převzatý build příkaz, nikoli tvrzení, že kandidát je původní verze hry. Před serve nastav původní explicitní `STRAHOV_PERF_WEATHER_FIXTURE`, potom `--serve run1` a po skutečné browser readiness `--peers run1`. Porty2568/4179 a všechny procesy stále vlastní root rezervace. STOP je v příslušném `candidateN/runs/runN/`.

`common.mjs` sdílí původní parser/hash/STOP helpery; `join.mjs` sdílí původní ověřený SDK lifecycle. Identita navíc zahrnuje bajty tohoto adresáře a hash celého původního harnessu. Řídicí kód run/peers je převzatý z původního runneru; run navíc ukládá níže popsaný režim ověření a odmítá přestavět archiv. Nejde o kopii projektu ani DEV bootstrap. Assety se servírují read-only z ověřeného main.

Pro následný kontrolní návrat A/B/A lze nastavit `STRAHOV_SHADER_CANDIDATE=baseline` a pouze `--serve run1`. Použije přesně původní již existující compiled dist (nikoli novou source kopii). Původní manifest musí odpovídat SHA z commitnutého reportu; bundle, všechny public bajty, dependencies, původní harness a všechny source/test soubory kromě výslovně vyjmenovaných klientských/testovacích změn shader/material přípravy a její diagnostiky musí souhlasit. Server, shared a scripts musí zůstat stejné. Runtime metadata přiznávají starý compiled-client hash, současný checkout hash i přesný seznam rozdílů; netvrdí shodu celého aktuálního checkoutu. Jakákoli další runtime změna tento režim odmítne. Baseline nelze build příkazem přepsat. To umožňuje kontrolovat vliv zahřáté browser/driver cache po kandidátním měření.
