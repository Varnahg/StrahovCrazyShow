# Předání: webgpu-system-collector-helper-20261019

- Vlastník `webgpu-01a15102-system-collector`; příjemce `/root`.
- Cwd `C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow`, detached HEAD `fa6d04cd` při zadání. Nové samostatné externí měření OS; žádné přebírání Game/renderer WIP.
- Výsledek: nový `scripts/capture-system-gpu.ps1`, ověřený krátkým OS smoke po30s warmupu. Root vlastní review/integraci, analyzér i skutečný uživatelský capture. Žádná změna hrané verze, browseru, aplikace, nastavení GPU/driveru, instalace, build, server nebo GPU zátěž.
- Vlastní zápisy: tento jediný script, `.cache/webgpu-system-collector-helper-20261019/` a tento handoff. Žádný commit/staging. AGENTS/policy/task a koordinační podklady načteny; claim/heartbeat vlastní, bez dalšího BMAD rendereru/podagenta.

## Identita

- Script SHA-256 **`6ddb22c68e2d4b30fbf4734c346c0422545d78fcd81ccad5b62236594f3737fb`**.
- Frozen manifest `.cache/webgpu-system-collector-helper-20261019/manifest.json`, SHA-256 **`754b8ac07026a4e2e457fb21f588ef8a864aaf84dd4deb39670ababff2bb003f`**:41 artefaktů včetně všech čtyř pokusů, raw JSONL/NVIDIA, testů, source versions a cleanup receipts. Script se po posledním PASS smoke neměnil.
- `RESEARCH.md` zachovává prvotní CIM rozhodnutí; `FINAL-NOTES.md` jej výslovně nahrazuje doloženou volbou native PDH. `smoke-summary.json` odděluje všechny pokusy a startup/steady výsledky. Neúspěchy nejsou přepsané.

## Výzkum a výsledná architektura

Skutečný host má native CIM GPUPerformanceCounters, PDH GPU Engine/Process Memory/Adapter Memory a NVIDIA-SMI. Nejprve porovnáno CIM s pevnými class/properties proti Get-Counter/locale-dependent paths a single native stream. CIM volba byla měřením odmítnuta i po zúžení properties/active-only query. Nativní PDH byl poté rootem výslovně schválen; typeperf fixed CSV header nebyl zvolen kvůli riziku nových dynamických PID/instances.

Primární zdroje: installed CIM class metadata/Get-Counter listsets/NVIDIA --help-query-gpu a Microsoft docs [formatted wildcard arrays](https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhgetformattedcounterarrayw), [creating a query](https://learn.microsoft.com/en-us/windows/win32/perfctrs/creating-a-query). Pinned code nevyužívá ETW/WPR, profiling hry, elevaci ani nastavení driveru.

Finální script má jeden persistentní native PDH query s12 English wildcard handles, GetFormattedCounterArray se2-call buffer sizing a3 bounded retries, CStatus0/1 valid jinak null,16MiB buffer a4096rows/group. Buffer se vždy uvolní, query/handles se zavřou. Dynamické instances se berou z nových arrays, nikoli startup CSV headeru. Nativní projekce/filter před PowerShellem zachovává raw per-instance values, counterStatus/missingFields a počet vynechaných nulových GPU engine instancí. Dynamic instance design je podložen API a měnícími se raw rows, nikoli samostatným spuštěním nového GPU rendereru během testu.

Sběr obsahuje whole-GPU NVIDIA util/memorycontroller util/memory/clocks/temp/power/reasons, raw per-PID engine a dedicated/shared/local/nonlocal/committed memory, global adapter memory a CPU/DPC/interrupt `_Total`. Per-process user/kernel jsou native GetProcess TimeSpan100ns delty pod PID+native start identity; first/reused/inaccessible je null. Browser role je pevný enum z transient WMI CommandLine, cache obnovena maximálně1x/5s a spojena s PID+start. Plné argumenty/URL/profile/credentials se nikdy nezapisují. Scope procesů je explicitní GPU/browser/collector/NVIDIA/WMI/node/shell/Blender; není to globální top-CPU ranking.

NVIDIA běží v jednom hidden read-only loop procesu, helper help také hidden. PID/native start ticks/path guard dovoluje ukončit pouze vlastního helpera. Nový proces může mít ještě null MainModule; v tom případě identity.path použije přesný trusted executable skutečně předaný Start-Process, označený pathSource. Cleanup stále porovnává pozorovanou aktuální path+exact ticks. Chybný cleanup se nikdy nevydává za runtime stopped.

## CLI a JSONL dohoda s root

Parametry: explicitní `-OutputDirectory`, `-DurationSeconds` default1200/max3600, `-IntervalSeconds` default2, `-WarmupSeconds` default0, `-MaxSamples` default0, `-StopFile` defaultSTOP uvnitř outputu. Existující samples/runtime se odmítnou a JSONL se otevírá exkluzivně. Duration zahrnuje warmup; in-flight native call/cleanup může doběhnout po deadline. StopFile se kontroluje při čekání do250ms a poté po aktuálním vzorku.128MiB output cap ukončuje sběr s viditelným důvodem. Žádné catch-up bursts po pomalém provideru.

Pevné názvy `samples.jsonl` (metadata/sample/summary, případně terminal error), `runtime.json`, oddělené NVIDIA stdout/stderr. SchemaVersion1, sample má `utc`, `endedUtc`, `seq`, `phase`, `elapsedMs`, `periodMs`, `collectionMs`, `intervalOverrun`, `providers.*.rows`, `processes`, `logger`. Windows provider má raw counterStatus, missingFields, providerIntervalMs, errors a activeOnly. Chybějící provider nebo invalid hodnota není0; GPU engine nuly jsou explicitně filtrovány. Engine percentages ani perPID memory se nesčítají do wholeGPU/VRAM.

CPU oneCore100%=jeden logical core, může přes100. System-normalized je oddělené dělení zaznamenaným logicalProcessors (.NET process-visible count; při omezené affinity nemusí být celý host). PDH `_Total` je samostatná systémová metrika. First CPU interval neznámý. `logger.oneCorePercent` je jen vlastní proces; další helper/service CPU není automaticky přiřazen collectorovi.

NVIDIA má driverTimestampRaw, receivedUtc a driverSampleUtc pouze při jednoznačném invariant localtime převodu; invalid/ambiguous DST vrací null. Metadata má local timezone/offset, row driver offset. Driver sampling window není collector period/read timestamp. UTC a provider read brackets zůstávají oddělené; nelze z nich vyvozovat přesné GPU instrukce nebo driver stack.

Pro30 minut skutečného testu po warmupu:

`capture-system-gpu.ps1 -OutputDirectory <fresh-own-path> -DurationSeconds 1830 -IntervalSeconds 2 -WarmupSeconds 30 -StopFile STOP`

Root spustí nový hidden PowerShell proces, počká na warmup před předáním URL a stopne vytvořením tohoto vlastního STOP. MaxSamples počítá steady vzorky; všechny warmup vzorky zůstanou v logu. Steady phase vyžaduje, aby celé minulé logger CPU delta okno začínalo až po warmupu. Není to skryté odmazání startupu.

## Ověření a neúspěšné pokusy

- PS parser PASS; native C# compile PASS; PDH layout value16/item24 ověřen na64bit hostu bez native query. První checker vybral chybný PowerShell Marshal.SizeOf overload; opravena pouze testovací Type-overload invokace, incident zapsán (nikoli přepsán jako runtime bug).
-16/16 pure/mocked checks PASS: unknown vs0, numeric units, PID/adapter parse, role privacy, PID reuse refusal, exited helper, provider missing/null, first/reused CPU delta a100ns one-core100/system25, úspěšný matching identity cleanup.
- smoke01,5vzorků1s: **odmítnuto**,1–2.1s collection a67–111%one-core; NVIDIA malformed loop argument exit2. Raw/source zachované.
- smoke02,5vzorků2s: **odmítnuto**, zúžená CIM projekce už malá, ale samotné queryengine278–293ms +systemCPU269–279ms, vlastní19–68%one-core. NVIDIA metriky již validní. Cleanup selhal na null initial path; vlastní PID37628 následně ověřen přes přesný prior start/path+own query/window a ukončen. Recovery receipt odděleně, raw runtime nepřepsán.
- smoke03,5vzorků native2s: všechny providers validní a synchronous collection22–43ms steady, ale cold startup CPU stále vysoké83→21%. Opět null initial module path; vlastní PID21568 následně ověřen exact recorded startticks+trusted binary path a ukončen. Root cause/fix doložený a recovery receipts zachované. Runtime správně cleanup-failed.
- Root výslovně autorizoval poslední smoke04 po30s warmupu. **15 warmup +5 steady** vzorků, závěr2026-10-19T16:36:09.2147049Z, exit0, oba vlastní NVIDIA helpery ukončeny, cleanupErrors[], runtime stopped. Žádný GPU workload.

Naměřený smoke04 steady vlastní CPU: **0.841–4.390%one-core**, mean**2.596%**, median2.508%; všech5 pod5%. Period1989–2005ms, žádné overruns; collection20–161ms (delší kvůli5s role metadata). Raw warmup obsahuje85.8%one-core, proto se nesmí hrát během startup warmupu. NVIDIA helper observed0–0.786%one-core. Dva WmiPrvSE procesy byly native-access inaccessible, CPU/start null, **nikoli0**. Není prokázán celý WMI/provider CPU náklad ani univerzální≤5% při každé herní zátěži; jde o5 idle-host steady vzorků.

## Procesy, hranice a převzetí

Všechny vlastní sampler/helper procesy jsou ukončené. Starší cleanup failures byly vyřešeny jen nad doloženými vlastními PID; žádný cizí proces podle jména/portu se neukončoval. Raw chyby zůstávají. External hard kill nemůže garantovat spuštění finally; root má používat vlastní StopFile/duration a zkontrolovat runtime/helpers.

Nespouštěna hra/build/integrace/celá sada/instalace/GPU load, neprováděny GPU settings ani browser actions. Poslední skutečný OS sampler skončil v16:36:09UTC, pak pouze offline summary/hash/dokumentace. Další capture spustí root až po review. Rezervace držena do tohoto předání, poté release a potvrzení parentovi. Release neznamená uzavření širších performance issues; root aktualizuje task/Linear a integruje pouze vlastní script společně se svým analyzérem.
