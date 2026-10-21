# Výsledek celé A/B série a priority dalších optimalizací

**KEY-53 odstranil malou redundantní práci, ale zrychlení celé hry tato série neprokázala.** V baseline měl měřený scope `pruneUnused` v průměru přibližně 0,023–0,035 ms na update podle startu. Kandidát v ustálené kohortě nevolal prune. Celý transit update se zlepšil ve dvou ze tří párů; plain FPS nikoli. Další práce má mířit především na cenu renderu a její konkrétní CPU/GPU příčiny.

## Metoda a shoda obsahu

Úplná kampaň `key53-runtime-ab-20261021`, šest samostatných startů A1/B1/A2/B2/A3/B3, 36 přijatých intervalů, 0 neúspěšných pokusů. V každém startu profile 3×10 s a plain 3×10 s, po 20 s zahřátí. Dvě skutečné SDK relace doplnily lokálního hráče; tři různé avatary a 12 fikčních jízdních NPC mají stejné profily, LOD/projekce a zaznamenaný obsah. Jde o stacionární denní scénář u běžného multiplayerového spawnu, nikoli průjezd celým světem nebo dav 100 hráčů dav.

Skutečný GPU: Intel UHD 630 přes ANGLE/D3D11, **WebGL2**, medium. CSS 1280×720, DPR1,25, interně 1280×720/scaling 1; zaznamenaný default framebuffer má 4 MSAA vzorky. Čas 20. 10. 2026 13:25 UTC, bezvětrné jasné **syntetické QA počasí**, nikoli aktuální stanice. Všech osm comparability/inventory/health příznaků vyšlo true; vlastní přepočet ověřil všech 36 raw řad, stejné per-mode pořadí, 6 skutečných startId, jediný harness, sémantiku a základní fyzické podmínky.

A: source `f3b5b5c0ba9b2fb5158ee2e1ab17c8b622b86c36fe2150d36bb5d4324ed1034d`, 8557 souborů. B: `bc38843693a9ccf591e500657d9e506d7d64e4a1788ccb4a6f9571eefa78a8bd`, 8558. Rozdíl přesně `client/transit-renderer.ts` a `tests/transit-pool-pruning.test.ts`. Harness `6da478e74d450e354117a2e04a8e63956b017c2ee3b38e4141ff13c3ec3fc158`. Testovaný head 3ac77c7a / PR22 byl skutečně sloučen jako e9bc2f54; jeho následné [main CI](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577977) a [hygiene](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577922) skutečně prošly na e9bc2f54289e9f444f91f4c82b9e3abe3c9c16d3. PR CI 1864/1864, build a integrace prošly; samy výkonový přínos nedokládají.

## CPU: malý měřený scope versus celý update

Tabulka sdružuje tři raw profilovací intervaly každého startu. Prune je **vnořený** do update, časy se nesčítají. Jde o wall time včetně měřicího wrapperu a případného plánování, ne thread utilization ani přesně izolované vykonané CPU instrukce.

| Start | Update mean ms | Prune ms/update | Počet update / prune |
| --- | ---: | ---: | ---: |
| A1 | 0,7664 | 0,0354 | 813 /813 |
| B1 | 0,6428 | 0 | 815 /0 |
| A2 | 0,6354 | 0,0229 | 820 /820 |
| B2 | 0,6536 | 0 | 801 /0 |
| A3 | 0,6891 | 0,0307 | 805 /805 |
| B3 | 0,6475 | 0 | 805 /0 |

Párová změna celého update B−A je **−0,1236 / +0,0182 / −0,0416 ms**. Pooled mean 0,6968→0,6479 ms je popis tohoto souboru, ne robustně potvrzené 7% zrychlení: druhý pár se zhoršil. Měřený prune scope v A sečetl 72,3 ms přes 2438 update; v B nebyl volán. Průměr samotného nevolaného B prune je `null`, nikoli „nulově drahé volání“.

U 71,6 % A prune vzorků byl zaznamenaný čas 0; nejmenší kladný záznam je přibližně 0,1 ms. Mikrosekundové průměry tedy vznikají agregací kvantovaných měření. Bez kalibrace prázdného wrapperu se nemá celá hodnota vydávat za čistou cenu implementace. Odstranění práce při stejném obsahu je podložené; přesný čistý čas jednotlivého volání nebo zlepšení každého snímku nikoli.

## Plain FPS a dlouhé intervaly

FPS je počet raw snímků dělený součtem jejich dob. P95/p99 níže jsou z celých tří raw 10s intervalů příslušného startu, nikoli průměr HUD FPS nebo průměr percentilů. Všech 18 jednotlivých plain intervalů a 18 profilovacích intervalů zůstává v [CSV](key53-final-independent.csv).

| Start | FPS | p95ms | p99ms | Max ms |
| --- | ---: | ---: | ---: | ---: |
| A1 | 26,32 | 49,6 | 68,8 | 78,7 |
| B1 | 25,94 | 49,8 | 68,0 | 74,0 |
| A2 | 26,66 | 46,5 | 66,3 | 85,8 |
| B2 | 26,16 | 51,9 | 67,2 | 182,0 |
| A3 | 26,62 | 47,0 | 64,1 | 113,4 |
| B3 | 26,71 | 46,9 | 61,5 | 67,7 |

Pooled plain: **26,5309→26,2693 FPS**, p95 47,6→49,1 ms, p99 65,3→65,3 ms. Obě varianty mají jeden interval ≥100 ms; žádný outlier nebyl odstraněn. Párové FPS rozdíly jsou −0,3795 / −0,5026 / +0,0979. Přibližně −0,99 % souhrnného FPS neprokazuje kauzální regresi, stejně jako drobné lokální zlepšení neprokazuje celkový gain. Tři páry nejsou robustní test statistické významnosti. Cíl 60 FPS splněný není a tato Intel série není přejímkou výkonu GeForce GTX 1060.

## Aktuální podklad pro větší zásahy

Explorační výpis používá **všech devět plain intervalů každé varianty**. `Game` exportuje `frameBreakdownMs` a `engineCpuBreakdownMs` jako součty dělené počtem benchmarkových snímků; níže jsou z nich frame-weighted means. [Celý výpis a scope](key53-current-phases.json).

| Scope | A mean ms/frame | B mean ms/frame |
| --- | ---: | ---: |
| simulation | 1,060 | 1,110 |
| world | 0,111 | 0,114 |
| avatarsAndCamera | 0,274 | 0,291 |
| environment | 1,230 | 1,199 |
| **render wall** |**22,421**|**22,890**|
| labels | 0,052 | 0,053 |

Uvnitř renderu je active-mesh scope 5,966/6,046 ms, main draw 13,271/13,590 ms a render targets 2,954/3,020 ms. Jsou vnořené a mohou se překrývat; nesčítat je s renderem ani automaticky navzájem. Main draw může zahrnovat nativní driver/čekání, není to měření čistého JS. Labels také nejsou celý React/DOM layout/compositing.

Na všech 18 plain koncích bylo 864 draw calls a 3 278 920 hlášených trojúhelníků **včetně render passů**. Jsou to endpoint čítače, ne intervalové průměry nebo unikátní geometrie světa. Poslední dostupné GPU vzorky měly 31,4–38,8 ms; zdrojový kód drží GPU údaj nejvýše 500 ms. To není průměr/p95 GPU celé série. `frameWork.cpuMs` je poslední dokončený CPU snímek, ne průměr benchmarku. CPU/GPU se překrývají a nesmí se sečíst na délku snímku.

Kompilační profil hlásí backend `other`: jde o WebGPU hooks, takže jejich nuly **neprokazují nulové WebGL kompilace**. Chybí aktuální sampled CPU stacky, GPU distribuce/pass atribuce a systémová frekvenční/teplotní řada. Vlastní [hardware snapshot](hardware-post-campaign.json) byl zjištěn až po kampani. Následně přijatý [snapshot producenta před/po](../transit-calendar-20261020/measurement/hardware.json), 20. 10. 21:56:56 UTC a 21. 10. 00:00:39 UTC, dokládá stejné CPU, GPU, ovladače a OS; nenahrazuje průběžné takty/teploty. Browser build ani UA během intervalů nebyly zachycené. Tyto meze nezakrývají data, ale brání silnějšímu kauzálnímu závěru.

## Priorita dalšího výzkumu a varianty

| Další krok | Proč / co měřit | Varianty a dopad před případnou implementací |
| --- | --- | --- |
| **1. Render a submission** | Aktuální render wall ≈22,4–22,9 ms; main draw ≈13,3–13,6 ms. Zachytit matching CPU stack/driver trace a skutečné GPU intervaly/passy při stejném obrazu. | Porovnat odstranění opakovaného bind/dirty/submission s měřeným batchingem. Nová cache potřebuje bounded kapacitu, vlastnictví scény/device a invalidaci; draw count sám není čas. |
| **2. Active-mesh práce** | Přibližně 6 ms v konkrétním stock scope; odlišit culling, matice, skeleton a dispatch. | Porovnat méně kandidátů/konzervativní index s worker query. Freeze nebo vynechání dynamických dat mění chování; nejdřív prokázat správnost při pohybu/LOD/lifecycle. |
| **3. Cold a změnové záseky** | Tato stacionární série nevyřešila B6/jízdu/první světlo/změnu kvality. Navázat čerstvým trace na současném main, ne starými čísly jiného GPU. | Rozlišit první versus pozdější UV dirty výpočet, create/dispose a skutečné kompilace. Porovnat úzkou ochranu, eager přípravu a index; žádný globální bypass správnosti. |
| **4. Asset workflow** | Vlastní GLB má 25 přesných nadbytečných mesh definic; animace jen 1,49 % BIN. | Pro velikost zkusit sdílení geometrie, statické sloučení a LOD; pro draw calls teprve skutečné runtime instancing měření. Pivoty a editovatelnost zachovat, GPU/VRAM gain dosud neměřený. |
| **5. Worker/širší migrace až podle atribuce** | Malý schedule/pool scope nevysvětluje dominantní render a dostupné GPU vzorky. | Celý renderer worker neparalelizuje GPU automaticky; má cenu bridge, serializace a nového lifecycle. Fyzika ≈1,1 ms není z tohoto místa první kandidát přepisu. Změna rozlišení/MSAA může být diagnostický experiment, nikoli skryté snížení kvality. |

Pořadí je podklad pro **další měření**, ne hotové rozhodnutí o implementaci nejlepší opravy. Nejprve znovu vytvořit přesný přijatý main a oddělit potvrzující A/B od exploračního hledání. Zachovat stejný obsah, kvalitu, cache/startup podmínky a životní cyklus; větší zásah přijímat až s vlastním srovnáním.

## Reprodukce a důkazy

[Původní úplné vstupy](raw-sources/manifest.json) jsou zachované jako gzip kopie se shodnými dekomprimovanými SHA, bez filtrace. [Přepočet](key53-final-independent.json), [reprodukce přímo z archivů](key53-reproduced-from-archives.json) a jejich CSV mají stejné výsledky. První kódová verze je v commitu d505adec; pozdější verze jen přidává gzip vstupy. Zdroje producenta ani raw nebyly upravované. Všech šest obrazů bylo prohlédnuto; původní `.png` soubory jsou podle magic skutečné JPEG, vlastní kopie mají `.jpg` bez překódování.

```powershell
uv run python docs/performance/evidence/continuation-20261021/analyze-campaign.py docs/performance/evidence/continuation-20261021/raw-sources/baseline.json.gz docs/performance/evidence/continuation-20261021/raw-sources/candidate.json.gz docs/performance/evidence/continuation-20261021/raw-sources/comparison.json.gz docs/performance/evidence/continuation-20261021/new-reproduction
```

Nástroj odmítne neúplnou/neshodnou kampaň a přepsání předchozího výstupu. Kamerové/populační toleranční gates zachovává z přečtené validace producenta; samostatně přepočítává raw statistiky, zdrojový diff, počty, pořadí, source/harness identitu a základní zaznamenané podmínky. Toto není nová nezávislá 3D kampaň. Osmifile harness je už verzovaný v přijatém PR20, commit f260d6afea9b7ca6eebeb9a317083a78ac2c9292; vlastní přepočet jeho identity v tomto checkoutu dává shodné SHA. [Důkaz identity](harness-identity.json). [Nezávislá čtecí kontrola](final-verification.json) skončila bez nálezů; neopakovala GPU kampaň ani CI. Závěrečná publikace vlastní evidence se zaznamená v hlavním [reportu](README.md).

Finální dataset producenta je přijatý commit d274e013a65518bf94b8e4e765866d9bc02d0197, všech 39 Git-blob SHA bylo ověřeno a při integraci zachováno. Jeho [report](../transit-calendar-20261020/measurement/RESULTS.md) a vlastní nezávislý přepočet se shodují. Oba konkrétní nálezy obnovovacího helperu/testu jsou uzavřené; [čtecí přejímka a skutečný clean-replica výsledek](publication-review.json). Závěrečná publikační přejímka, aktuální head/base a main CI se evidují v [PR21](https://github.com/Varnahg/StrahovCrazyShow/pull/21), aby tento neměnný kandidát nemusel obsahovat hash svého budoucího merge.
