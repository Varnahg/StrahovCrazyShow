---
title: 'KEY-31/32: systémové GPU a procesové logy při ručním testu'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Doplnit skutečné logování celé GPU, grafické paměti a jednotlivých procesů a připravit další test StrahovCrazyShow. Uživatel chce vědět, zda hra čeká na CPU, ovladač nebo grafiku a zda nehospodárně používá6GBVRAM. Hraný build4203 i starší verze zůstanou beze změny. Samostatný systémový nástroj propojí čítače s existujícími herními logy podle skutečného času; nedostupná měření nesmí být vydávána za nulovou zátěž ani za jistou příčinu problému.

</frozen-after-approval>

## Implementation Notes

- Jediný soudržný diagnostický celek, vratný, bez nejasné uživatelské volby. Renderer úspěšně vytiskl existující snapshot fe8292081bd751763aeb; aktuální policy a kroky1/2 načtené. Root claim vlastní korelátor, testy, docs/evidence/spec a prostředky heavy/GPU/system-gpu-telemetry. Helper má samostatný claim na PowerShell sampler/cache/handoff. Starý mediumvehicle QA claim uvolněn po ukončení měřicích procesů; živé4201/4202/4203 zůstávají vlastněné serveclaims. CizíWIP není součástí změny.
- Podklady: client/session-diagnostics.ts, shared/session-diagnostics.ts a server/session-diagnostics.ts; skutečná session59bbedc2 source65d028 měla31kframe samples a0platných GPU timestamps. NVIDIA-SMI už byl read-onlyověřen, WindowsCIM GPUPerformanceCounters třídy jsou dostupné. Microsoft GPU Task Manager dokumentuje nejvytíženější engine a zdvojené sdílené alokace; NVIDIA utilization znamená podíl času práce, memoryutil aktivitu řadiče, nikoli obsazenouVRAM.
- Varianty: měnit renderer kvůli nové diagnostice by změnilo hraný build; odmítnuto. PDHGet-Counter je dostupný, ale používá lokalizované cesty. Zvolen stabilní CIM provider GPU Engine/GPU Process Memory/GPUAdapterMemory a uživatelský/kernel CPUčas dlePID+creationTime; NVIDIA-SMI bude jediný dlouhožijící proces s periodickýmCSV, nikoli spawn každou sekundu. Rawprovider timestamps/frequency a skutečné querybrackets zachovat. CPUrežie loggeru se změří; vysokárežie vede kdelšímuintervalu, nikoli kezkreslenému FPSdůkazu.
- WPR10.0.26100 má GPU/CPUprofily sDXGI/DxgKrnl a schedulerstacks. Aktuální proces není elevated a nemáSeSystemProfilePrivilege; WPA/xperf/GPUView nebyly nalezené. Žádnýtrace, instalace neboelevace se neprovádí. Čítače mohou podpořit hypotézu CPU/GPU/memorytlaku; rozlišení driverwait versusCPUrunning/ready definitivně vyžaduje odpovídající stacktrace. Chybějící schopnost nesmí vypadat jako potvrzení driverchyby.
- scripts/capture-system-gpu.ps1: boundedOutputDirectory/DurationSeconds/IntervalSeconds/StopFile, metadata/sample/summaryJSONLschema1, wholeGPUutil/memorycontrollerutil/used/totalVRAM/clocks/temp/power/throttling pokudpodporované. PerPIDengine/LUID/paměť a CPUuser/kernel percent jednoho logickéhoCPU, normalizovanéstrojovéprocento zvlášť. Nikdy nelogovat plnécommandlines; rolebrowser/GPU/renderer pouze enum. PIDreuse identifikovatstartUTC. Stop/failure/timeout musí ukončit pouze vlastní pomocný procesověřenýPID+start+path, bez ztráty jižuloženýchvzorků.
- scripts/analyze-system-gpu.mjs: stream/read omezenéhoJSONL, validovatčas a schéma, agregovatperPIDengine MAX nikolisoučet. ProcessGPUmemory zůstane peradapter/perPID a nesčításejako fyzickáVRAM. KorelaceUTC= session-start.data.timeOrigin+herníatMs; batch.receivedAtUTC nenahradí čas události. Hitchpoužívá intervalStart/end a previousFrameCPU, currentCPU je následujícíframe. Hranicefocus/visibility/transition označit; sekundovýOSvzorek není důkaz příčiny150mszáseku. GPUtimestampsnull a providererrors zůstanouunknown.
- tests/system-gpu-telemetry.test.mjs ověříUTCkotvu, překryvyintervalů, změnyfocus, PIDreuse, souběžnéenginy a missing/null. Krátký skutečný5sampleOSsmoke ověříproviderdata, náklady loggeru, stop a ukončeníchild. Dále nezávisléBMADreview a vlastnícommit/mainintegrace jen nástrojů/evidence. Herníbuild/testfullsuite se nespouští, protože herníruntime nezměněn.
- docs/performance/system-gpu-telemetry.md předá reprodukovatelnécommands a krátký test: klid předhrou, start/načtení, stejnýprůjezd, auto/svítilna, případněvyššíkvalita, návratdomenu a klidpo ukončení. Uživatel použije stejnýneměnný4203; systémovýcapture se spustí ažporeview/ověření na30min a mávlastníruntime/stop. Cílmigrace/KEY31/32zůstaneotevřený, dokudneprojdecelápřejímka.
- První skutečný5sampleCIM smoke odmítnut:1–2s query/projection a67–111%jednohoCPU; NVIDIAargumentchyba. Druhýúzkýrefaktor snížilprojekci, aleCIMqueries zůstaly~280ms každé a19–68%jednohoCPU. Oba zachované; žádný z nich není userready. OwnNvidiahelper po identitymismatch bezpečněukončen po ověřeníPID/startTicks/path/commandlinepouzevownscope. Vybranávarianta se proto mění na přímý nativníPDHwildcardarray sEnglishcounterpaths aGetProcessCPU; stejnéexterníJSONschema a žádnýhernízásah. Cílem je skutečná nízká režie, ne pouze delšíperioda nad drahýmproviderem.
- Přijata finální varianta capture6ddb22c68e2d4b30fbf4734c346c0422545d78fcd81ccad5b62236594f3737fb,16helperkontrol/PSparser/nativecompilePASS. Smoke04 zachoval15warmup+5steady při2s: ownCPU0,841–4,390%, NVIDIAhelper0–0,786%, WmiPrvSEinaccessibleunknown. Všichni ownhelperspo testuukončení, cleanupErrors[]. Startup85,8%zůstávávraw; živýtestse předáváažposteadywarmup30s. Root12/12testůPASS aactualCLIanalýza20OSsamples+3starýchherníchrelací správněnemáčasovýpřekryv.
- Nezávisléreview sampleru/analýzy/evidence: čtyřidoloženéparser/correlationnálezyopravené, poslednírecheck[]. Celýhernípnpmtest/build/integration se nespouštěl: runtime hry/buildy se neměnily. Done znamenáhotový externí nástroj a postup; výsledky příštího ručního testu, KEY31/32 a celámigrace zůstávajíotevřené.

## Review Triage Log

- medium/patch: sloučenýbracketvšechproviderů nesmípřiřadit NVIDIAhodnotuke zpožděnémuCPUdotazu. GPUkorelace nyní používávlastníNVIDIAbracket, collectionoverlapodděleně; regressionPASS.
- medium/patch: limit256MiB ažporeadFile by neomezilvstupníalokaci. JSONL nyníčteboundedstream s limitem běhemčtení, zachovánoodmítnutítruncatedtail; regressionPASS.
- medium/patch: Date.parsebezčasovézóny může tišeposunoutUTC. Vyžaduje se explicitníZ/offset; regressionPASS.10/10cílenýchparser/correlationtestůPASS.
- medium/patch: cachedNVIDIAřádekbezdriverUTC nesmídostatčasnovéhočtení. Fallbackpoužívápůvodnírow.receivedUtc, jinakunknown; aktuálníreadbracketjeninformativní. RegressionPASS; finálně12/12 a nezávislýrecheck[].
