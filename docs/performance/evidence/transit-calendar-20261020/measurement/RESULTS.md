# KEY-53: výsledek produkčního A/B

Kandidát odstraňuje opakovaný úklid NPC poolu při nezměněné kohortě. Doložený přínos je úzký: původní profilovaná rutina představovala průměrně **0,029655 ms na aktualizaci**; kandidát ji v této stabilní scéně nevolal. To není tvrzení o stejném čistém zrychlení celého snímku, protože měření rutiny zahrnuje profilovací režii.

**Zvýšení FPS ani odstranění záseků se neprokázalo.** Celý dopravní update měl nižší souhrnný průměr, ale zlepšení se neopakovalo ve všech třech párech. Výsledek proto neopravňuje k tvrzení o univerzálním 7% zrychlení rendereru.

| Metrika | Baseline | Kandidát |
| --- | ---: | ---: |
| Prune volání v 9 CPU intervalech | 2 438 | 0 |
| Profilovaná cena prune na update | 0,029655 ms | 0 ms; rutina nevolána |
| Průměr celé update rutiny, včetně vnořeného prune | 0,696801 ms | 0,647914 ms |
| Plain FPS ze všech původních frame intervalů | 26,530877 | 26,269343 |
| Plain frame p95 | 47,6 ms | 49,1 ms |
| Plain frame p99 | 65,3 ms | 65,3 ms |

Cena update a prune se **nesčítá**. Nulová amortizovaná cena kandidátního prune znamená vynechanou práci; průměr doby jednoho volání je při nule volání nedefinovaný, nikoli naměřených 0 ms. Časy jsou monotónní CPU wall time, nikoli thread CPU time ani GPU čas. Jednotlivé krátké vzorky podléhají kvantizaci časovače; uvedené průměry shrnují stovky skutečných volání.

## Opakování a variabilita

| Dvojice | A prune / update (ms) | A celý update (ms) | B celý update (ms) | A FPS | B FPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| A1/B1 | 0,035424 | 0,766421 | 0,642822 | 26,317103 | 25,937577 |
| A2/B2 | 0,022927 | 0,635366 | 0,653558 | 26,658866 | 26,156287 |
| A3/B3 | 0,030683 | 0,689068 | 0,647453 | 26,616654 | 26,714573 |

Ve všech třech nezávislých baseline startech byla měřená práce prune nenulová; u kandidáta odpadla. U celého update jsou párové rozdíly B−A −0,123599 / +0,018192 / −0,041615 ms. Souhrnných −7,016 % proto není stabilní párový důkaz celkového zrychlení. Plain FPS se souhrnně změnilo o −0,986 %, se smíšeným směrem párových rozdílů; tato data sama neurčují kauzální regresi. Zůstaly zachované i dlouhé snímky, žádné outliery nebyly odstraněné.

## Podmínky a úplnost

- Kampaň `key53-runtime-ab-20261021`: A1/B1/A2/B2/A3/B3, šest samostatných serverových/Game startů. Každý má CPU profil 3×10 s a samostatné plain FPS 3×10 s: celkem 36 intervalů.
- Plná produkční hra, HUD, fyzika a skutečný server. Hlavní UI relace a dvě Colyseus SDK relace s různými avatary,12 dopravních NPC. Hlavní hráč vstupoval první.
- Stejný medium, cílových 60 FPS, skutečných 1280 × 720 CSS i interního rozlišení, DPR 1,25, WebGL2/ANGLE D3D11 na Intel UHD 630. Ovladač dle Windows 31.0.101.2140, i7-8750H. Host metadata před/po jsou samostatně zachovaná.
- Stejná kamera a běžný spawn, pevný QA okamžik 20. 10. 2026 13:25 UTC v platném feedu a výslovně simulované QA počasí. Globální ani serverové hodiny se nepřepisují.
- Po přepnutí scénáře nejméně 20 s warmupu v každém startu; poté CPU 3 × 10 s a plain 3 × 10 s. QA panel při měření sbalený, běžný HUD zachovaný. Periodický koordinační heartbeat, modeloví workeři, buildy a Blender během timed částí neběžely; rezervace se obnovovaly mezi starty.
- Všech 36 intervalů přijatých;0 failed measurement attempts. Všech 8 mezistartových a obsahových kontrol prošlo. Po každém startu potvrzené odpojení peerů, exit API a zavření preview bez cleanup chyb.
- Jedno počáteční čekání CUA během startupu A1 narazilo na timeout automatizačního rozhraní. Hra následně řádně dokončila startup před přípravou či registrací prvního intervalu. Žádný měřený pokus tím nebyl odstraněn.

## Identita zdrojů

Baseline je skutečný main `c3454da45b22ad9726c257d3d481d45f6243ec04`, source snapshot `f3b5b5c0ba9b2fb5158ee2e1ab17c8b622b86c36fe2150d36bb5d4324ed1034d` (8 557 souborů). Kandidát je commit `3ac77c7abf8fca43e6380f382aba306502ab86d6`, snapshot `bc38843693a9ccf591e500657d9e506d7d64e4a1788ccb4a6f9571eefa78a8bd` (8 558 souborů). Liší se pouze `client/transit-renderer.ts` a `tests/transit-pool-pruning.test.ts`.

Oba buildy používají stejný harness `6da478e74d450e354117a2e04a8e63956b017c2ee3b38e4141ff13c3ec3fc158`. Byly ověřeny úplné before/after/frozen hashe a u baseline všech 12 LFS souborů také proti Git LFS OID. Starší smoke 5a123c5c a předběžný 4654f71c s 10 autorskými LFS pointery nejsou součástí finálních statistik; originály a neúspěšný parity doklad zůstávají v odděleném cache.

## Důkazy a reprodukce

[Baseline](baseline.json.gz), [kandidát](candidate.json.gz) a [porovnání](comparison.json) obsahují úplné raw, manifesty, přesné pořadí i inventář. Gzip je bezztrátový; [archivní manifest](raw-archives.json) váže původní i komprimované bajty. Původní JSON se obnoví bez přepisu odlišných existujících souborů, potom lze [doplňkový výpočet](analysis.json) zopakovat bez změn:

```powershell
node docs/performance/evidence/transit-calendar-20261020/measurement/materialize-raw.mjs
node docs/performance/evidence/transit-calendar-20261020/measurement/analyze-ab.mjs --stdout
```

Archivní kontrola bez zápisu: `node docs/performance/evidence/transit-calendar-20261020/measurement/materialize-raw.mjs --verify`. Aktuální checkout ponechává oba původní JSON beze změny jako odvozené ignorované soubory. Komprese nic nefiltruje a nemění hodnoty ani pořadí. Snímky: [A1](A1-scene.jpg), [B1](B1-scene.jpg), [A2](A2-scene.jpg), [B2](B2-scene.jpg), [A3](A3-scene.jpg), [B3](B3-scene.jpg). Jsou to původní JPEG bajty, bez překódování.

Obnova nejprve zapíše a synchronizuje vlastní dočasný soubor, potom jej výhradně publikuje bez přepisu cíle. Přerušení zápisu proto nezanechá částečný cílový JSON. Retry dokončí pouze úklid vlastních staging hardlinků ke stejnému ověřenému souboru; odlišná data a jiné aliasy zachová a odmítne. Opuštěné partial staging soubory zůstávají oddělené a neblokují nový pokus. Skutečné filesystem regrese přerušení, opakování a ochrany cizího souboru/aliasu:4/4 PASS.

Kvantil je `sorted[min(n-1,floor(n*p))]`. Pooled čísla jsou deskriptivní; devět intervalů není devět nezávislých experimentů, protože jsou sdružené do tří startů. Tato jediná stacionární scéna a jedno GPU neprokazují zrychlení všech herních situací. Přechody, odstranění, sdílené prostředky a chyby lifecycle dokládá 27 cílených testů včetně 12 nových; celý kandidát prošel 1 864 testy, buildem a integrací v PR CI.

Použit byl tentýž IAB prohlížeč. Konkrétní browser/build verze ani průběžné systémové takty a teploty nebyly zachycené; neodvozují se ze staršího Edge testu. `frameWork.cpuMs`, `gpuMs` a draw/triangle counters v původním Game exportu jsou endpoint/poslední dostupná čtení, nikoli intervalové průměry. Zde uvedené FPS a kvantily proto vycházejí výhradně z úplných raw frame intervalů; samostatné CPU série z uložených duration polí. Nezávislý přepočet celé kampaně a vizuální kontrola všech šesti snímků JPEG potvrdily výše uvedené hodnoty a úzké omezení závěru.

Průchod řadiče: `key-53-776f5f92725b`, [PR #22](https://github.com/Varnahg/StrahovCrazyShow/pull/22). Po zelené CI se správně zastavil na `EXTERNAL_ACCEPTANCE_PENDING`. Přejímka se omezuje na odstranění doložené redundantní práce v této rutině. Stejný `resume` provedl chráněný merge `e9bc2f54289e9f444f91f4c82b9e3abe3c9c16d3` a počkal na [zelené main CI](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577977). [Důkaz](controller-proof.json) potvrzuje jeden implementační pokus, jeden PR a nezměněný checkpoint po dalších dokončených `run`/`resume`. Parent KEY-5 zůstává otevřený.

Propojení GitHub–Linear automaticky změnilo stav issue na Done už při merge. Koordinátor jej při čekajícím main CI vrátil na In Progress; řadič provedl finální Done až po zeleném main CI. Tato externí automatizace není vlastním `setState` účinkem řadiče a není zatajena do tvrzení o idempotenci.
