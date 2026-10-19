# Systémové měření GPU při ručním testu

Nástroj běží mimo prohlížeč a nemění herní build, renderer ani nastavení GPU. Samostatně měří celou kartu, její paměť a jednotlivé procesy. Raw JSONL zůstává k dispozici; nedostupný údaj je `null`/chyba, nikoli nula.

## Co zaznamenáváme

- NVIDIA: vytížení GPU a paměťového řadiče, obsazenou/celkovou VRAM vMiB, takty, teplotu, příkon a podporované příznaky omezení taktů. Aktivita paměťového řadiče není procento obsazené VRAM.
- Windows: GPUenginy podle PID/LUID/typu, dedicated/shared/committed paměť procesů a adaptérů, CPUuser/kernel čas procesů. Identita procesu je PID+časvytvoření, role EdgeGPU/renderer je pomocná; plnécommandlines se neukládají.
- Procesní CPUprocenta jednoho logického procesoru mohou přesáhnout100% při vícevláknové práci. Podíl celého stroje se uvádí odděleně. Celkové GPUvytížení není součet paralelních enginů; procesní GPUmaximum je maximum enginů. Sdílené alokace se mohou objevit uvíceprocesů, jejich paměť se proto nesčítá do fyzické VRAM.
- Skutečné UTC/monotonic časy, začátky/konce dotazů, provider chyby a režii loggeru. Zpožděný vzorek se nevydává za přesný okamžik shaderové kompilace.

## Spuštění

Z kořene repozitáře v PowerShellu:

```powershell
pwsh -NoProfile -File scripts/capture-system-gpu.ps1 -OutputDirectory C:/cesta/novy-gpu-test -DurationSeconds 1800 -IntervalSeconds 2 -WarmupSeconds 30
```

Výstupní adresář musí být nový. `samples.jsonl` obsahuje metadata, systémové vzorky a závěrečné shrnutí; `runtime.json` identifikuje pomocné procesy. Prvních30sekund je označeno `warmup` a zachováno vrawdatech. Hraní začíná až po ustálení; CPUrežie se uvádí zvlášť pro `steady`. Sběr má časový limit. Zastaví se také vytvořením prázdného souboru `STOP` uvnitř výstupního adresáře. Staré záznamy se nepřepisují. Sampler nepoužívá elevaci a nemění napájecí plán či ovladač.

## Další ruční test

Použije se stejný neměnný build [4203](http://127.0.0.1:4203/?renderBackend=webgpu), source `65d028c6e4c61555c7ae56e89b3b25268bc1a5abbd4b7a8dabe19213edc71e60`. Před předáním koordinátor spustí systémový sběr a ověří skutečné vzorky. Jeho automatické3Dscény/buildy/zátěžovétesty zůstanou vypnuté.

1. Přibližně20sekund menu jako výchozí stav.
2. Vstoupit do hry a počkat na dokončení načítání. Začít se střední kvalitou.
3. Přibližnědvě minuty obvyklé trasy, svítilna, první nástup do auta a jízda. Při záseku nic nemačkat pro export; automatické herní logy už běží.
4. Zopakovat stejný úsek na vyšší kvalitě. Při porovnávání zachovat velikost okna a kameru; změna kvality se vherním kontextu zaznamená.
5. Vrátit se do menu a ponechat přibližně20sekund. Zavřít herní kartu a ponechat ještě20sekund pro porovnání paměti po ukončení. Napsat koordinátorovi „hotovo“.

Přepnutí do Správce úloh je dovolené, ale log bude daný úsek označovat jako bezfokusu/skrytý. Nebude se míchat s aktivním hraním. Původní hratelné snapshoty a ostatní aplikace se automaticky nezavírají.

## Vyhodnocení

Po zastavení sběru:

```powershell
node scripts/analyze-system-gpu.mjs --telemetry C:/cesta/novy-gpu-test/samples.jsonl --game-log-dir C:/cesta/hraný-snapshot/.cache/game-diagnostics --out C:/cesta/novy-gpu-report
```

Nový adresář dostane `report.json` a `summary.md`. Herní UTC kotva je session-start.timeOrigin, nikoli čas přijetí dávky serverem. Pro zásek se použije intervalStartMs/endMs. Jeho previousFrameCPU patří do předchozího intervalu; currentCPU popisuje následující snímek. Focus/visibility přechody a mezery sekvencí jsou výslovné. Pro NVIDIA se preferuje čas driverového řádku převedený doUTC; čas jeho pozdějšího přečtení se zachová zvlášť. Driver stále agreguje předchozí období. Zpráva ukáže vlastní GPUčasovébody/brackets a zvlášť okolní vzorky±2s, nikoli automatickou kauzalitu.

Původní CIMvarianta byla zamítnuta kvůli režii. Přijatá varianta čte přímo nativní PDH counterarrays sEnglishnázvy a dynamickými instancemi; invalidníCStatus jeunknown. NVIDIA používá jeden dlouhožijícíproces. Pět skutečných ustálených2svzorků po30swarmup mělo0,84–4,39%jednoho logickéhoCPU pro samotný logger, bezpřekročeníperiod. Pomocné/providerprocesy jsou měřené zvlášť a tato krátká kontrola není univerzální garance nulového vlivu při hraní. Naměřená maximaVRAM/vytížení jsou maxima vzorků; kratší špičky mohou uniknout.

Vysoké celkové GPUvytížení při dlouhých snímcích podporuje podezření na grafickou zátěž. VRAM blízko kapacity a rostoucí shared memory podporují podezření na paměťový tlak; bez údajů o evikcích nejde o jistý důkaz. Nízké GPU při vysokém CPUčasu procesu může ukazovat nedostatek odesílané práce. Herní CPUwalltime ovšem zahrnuje i preempci a synchronní čekání. Pro definitivní rozlišení CPUrunning/ready/driverwait je potřeba scheduler/stacktrace.

Na tomto stroji jeWPR sGPU/CPUprofilem, ale aktuální relace nemá potřebnou administrátorskou privilegii; WPA/xperf/GPUView nebyly nalezené. Tento nástroj ETW nespouští. Pokud čítače problém nezúží dostatečně, naváže konkrétní krátký trace s odpovídajícím oprávněním.

Primární podklady: [Microsoft GPU čítače a sdílená paměť](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/), [NVIDIA-SMI a jednotky](https://docs.nvidia.com/deploy/nvidia-smi/index.html), [Microsoft CPU Usage Precise](https://learn.microsoft.com/en-us/windows-hardware/test/wpt/cpu-analysis), [postup GPU/CPU trace](https://learn.microsoft.com/en-us/windows/apps/develop/performance/power).
