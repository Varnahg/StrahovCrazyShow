# PR40: uzavření kandidáta Low FAR45 · 4. 11. 2026

**FAR45 se nepřijímá jako výchozí nastavení. Publikovaný runtime se vrací na FAR75.** Ostatní grafické a síťové změny zůstávají. Nižší geometrie je prokázaná, vyšší FPS nikoli; srovnání má zásadní rozdíl v detailu pohyblivých spoluhráčů. Nejde o důkaz, že FAR45 způsobuje horší FPS, ani o dokončení obecné plynulosti KEY-5.

## Předem zapsané rozhodnutí

Plán je v [předání](../../../../agents/handoffs/low-tree-lod-20261102-root.md). Jediná zkoušená změna: Low/full-coverage 75 → 45 normalizovaných metrů. Před daty zvoleno A75/B45, po 3 × 10 sekundách, stejná kamera/čas/rozlišení/kvalita, HUD a dvě skutečné SDK relace. Pro úzké přijetí musel kandidátní medián FPS dosáhnout alespoň nejhoršího baseline FPS a mediány p95/p99 nepřekročit nejhorší odpovídající baseline. Geometrie měla klesnout, bez chyb a nepřijatelného obrazového přechodu. Po selhání těchto mezí se další kandidátní vizuální průchod nespouštěl.

## Identita a podmínky

- Výchozí commit: 12d81aa908684c20dfb5f1d33eb3ebbc19912b4d; kanonický checkout main. Publikační větev je výslovně autorizovaná výjimka; žádný worktree ani kopie projektu.
- A75 source/tests: ff52249dd131007c02ba8899545bc135564e08c3478c1c8b81c9d8a50d1fab44; B45: 31a14cdda855eef4486ac82c63778db13d2f614676c88bb22dbd104d6da99827. [A manifest](baseline-identity.json.gz), [B manifest](candidate-identity.json.gz). Z 979 vstupních souborů se lišila pouze konstanta v client/tree-renderer.ts. Testy zůstaly při A/B totožné, včetně očekávání experimentální45; A build není samostatný průchod těchto testů.
- Public content SHA256: 45f088a91dbdc53456e8cfebb6fc50a2d3cd6914e9eba8ed197a946e947d2416; 8064 souborů, 5 010 386 262 B. Server/shared, harness, závislosti a skutečné asset bajty shodné.
- Edge, WebGPU compatibility mode, NVIDIA GTX1060 6GB, ovladač582.28; skutečný adaptér Pascal/NVIDIA z klienta, model/ovladač ze systémového sampleru. CSS1280×720, Low backbuffer984×553, cíl60FPS. Identita prohlížeče je v raw browser-capabilities.
- Označené uložené QA počasí; UI day + autumn, okamžik1792490400000 =20.10.2026 10:00UTC. Všech šest kamer, FOV a view/projection matic jsou přesně shodné. Drobný rozdíl polohy hráče je pod0,000002m.
- Tři skutečné relace, rozdílné avatary. Existující scripts/performance-network.ts posílal dvěma SDK klientům skutečné kruhové vstupy. **A mělo avatar LOD near1/medium2, B near3/medium0.** Přes stejnou populaci tedy není cena avatarů izolovaná; toto A/B nelze použít pro příčinný FPS závěr o stromech.
- Vlastní aktivní okno Edge ověřené před startem a po měření. Během časovaných intervalů žádný DOM/AX, screenshot, build nebo test. Systémová telemetrie běžela samostatně po2s. Původní8080 zůstal nedotčený.

## Výsledky

| Varianta/vzorek | FPS | p95 ms | p99 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| A75/1 | 41,7 | 30,4 | 81,8 | 240,6 |
| A75/2 | 45,6 | 28,7 | 39,7 | 49,8 |
| A75/3 | 45,8 | 29,4 | 38,1 | 46,2 |
| B45/1 | 22,6 | 61,3 | 126,3 | 379,1 |
| B45/2 | 42,4 | 29,8 | 42,8 | 51,3 |
| B45/3 | 26,6 | 50,6 | 59,3 | 62,8 |

[Strojové srovnání](comparison.json) obsahuje celé scény a raw odvozené metriky. Mediány A/B:45,6/26,6FPS; p9529,4/50,6ms; p9939,7/59,3ms. Předem zvolená podmínka FPS a p95 nesplněna; p99 splněna. Tento výsledek se nevydává za průkaz zhoršení způsobeného FAR45.

Stromy A/B: LOD [0,3,107] → [0,1,109], aktivní trojúhelníky2 527 289 →2 251 443 (−275 846, −10,9%), pending loads0. Jde o povolenou stromovou geometrii, nikoli přesný počet frustem viditelných trojúhelníků nebo celé GPU práce. Všech šest benchmarků: render/asset errors0, raw interval counts a kvantily souhlasí. Úplný renderHealth objekt serverový export neobsahuje; dodatečně se nedoplňuje. Žádný claim o RAM/VRAM úspoře.

## Záseky, obraz a omezení

Původní A75 během skutečné chůze zachytil571,6ms; po zastavení4 041,6 a5 299,9ms. Přepnutí na High zaznamenalo7 539,5ms a další dlouhé mezery. Celková hra tedy nesplňuje plynulost. Změna Low prahu není příčinou prokázanou pro tyto události. Všechny události zůstávají v [A raw záznamu](baseline-recording.jsonl.gz); [B raw záznam](candidate-recording.jsonl.gz) také není oříznut na dobré vzorky.

A má seq0–1268 bez děr; tři frame windows mimo benchmarky mají nesoulad délky a součtu intervalů při změnách kvality. Seq úplnost není globální časová úplnost. [A systém](baseline-system.jsonl.gz) a [B systém](candidate-system.jsonl.gz) zachovávají takty, teploty, GPU/CPU a paměť; neřízené takty a pohybliví peers omezují interpretaci. A okna začala74,7/118,5/152,6s po ready, B103,2/165,1/194,3s; warmup tedy nebyl přesně časově spárovaný. Takty A911–1050MHz, B835–1404MHz, teploty A81–82°C a B80–84°C; thermal/power-cap flags neaktivní. B má seq0–1275 a systém196 vzorků bez sekvenčních děr/chyb. Součty intervalů B1/B3 se od deklarované délky liší+15/−19,2ms; raw data i toto omezení jsou zachované.

[Snímek A](baseline-spawn.png) a [snímek B](candidate-spawn.png) dokládají scénu/HUD; další baseline snímky zachovávají skutečnou chůzi, zoom a Low/High. Některé koruny jsou u horní hrany a zoom/High míří převážně na avatar/zem: **nejde o důkaz absence poppingu ani přijatou obrazovou kvalitu FAR45**. CSS/backbuffer dokazují benchmarky, nikoli černé okraje náhledu screenshotu. B vizuální trasa byla po nesplnění kritéria vynechána, ne označená PASS.

## Úklid a navazující změna

Obě browserové relace ukončeny přes UI, oba peers procesy skončily exit0 s authenticatedConnectionsStillOpen0. Samplery zastaveny vlastními STOP soubory; viewport resetován a vlastní testovací okno zavřeno. API PID95044/97860 a posluchače2568/4179 po ukončení nepřítomné.

Starší Low harness na Windows při ukončení nenapsal vlastní cleanup.json; tento nedostatek se nezamlčuje. [Nezávislá následná kontrola](post-run-input-revalidation.json) byte-hashovala všechny assety, zdroje/testy a ověřila server/harness/dependency identity bez chyb. [A externí cleanup](baseline-external-cleanup.json) zachovává původní limit. Nejde o úspěšnou přejímku starého shutdown mechanismu.

Vrácený runtime má stejnou konstantu75 jako právě hranáA; další rozdíl je pouze vysvětlující komentář. Zachovány a upraveny projekční, boundary a pending-MID/cache regrese. Výsledek experimentu je **zamítnutý aktivní kandidát45**, nikoli údajně optimalizovaná hra. CI a nezávislé review finálního publikačního commitu budou zapsány na přesné head SHA PR40. Historické zelené CI head12d81aa9 není automaticky zelenou přejímkou nového headu.

Finální lokální kontroly:36/36 cílených regresí PASS, nezávislé source/test/evidence review[] a git diff --check PASS. [Validace obnoveného defaultu](restored-default-validation.json) a [finální source/test manifest](final-source-manifest.json.gz); source SHA28641aff1da225430e1fed6e2821783941cc1d229ba7ea7109578289dc3b7a31. PublikačníCI a project-acceptance mají záznam na [PR40](https://github.com/Varnahg/StrahovCrazyShow/pull/40).
