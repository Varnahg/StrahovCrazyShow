# K3: opravená kola, rezerva stínů a skutečný výkon

**K3 prošel 346/346 testy, buildem a izolovanou integrací, ale nesplnil grafické výkonové cíle.** Sedm platných GPU vzorků celé hry na Intel UHD 630 ukazuje 28,2 FPS pro jednoho hráče ve dne a 25,0–27,9 FPS pro 30 avatarů. Noční síťový běh má 58 authority resync flagů; stabilní noc, dokončená fotogrammetrie ani kvalita Hogwarts Legacy se netvrdí.

## Zmrazený zdroj a technická přejímka

SHA-256 snapshotu **`e91aa84ec7d77949b2db706091fa66c603777faa13daa8ed998ff0871b390c9b`**, **8062 souborů**. Pipeline začala 11. 10. 2026 v 07:33:08.615UTC a skončila 07:34:58.687UTC. Následná SHA kontrola v 08:19:54.149UTC prošla pro **8062 živých + 8062 zmrazených souborů, 0 neshod**. Pozdější změny pracovního stromu nejsou zpětně výsledkem tohoto snapshotu.

| Příkaz nad K3 | Výsledek | Wall time |
| --- | --- | ---: |
| `pnpm test` | 346 PASS, 0 FAIL/skipped/cancelled/todo | 53,2766 s; runner 52,1150 s |
| `pnpm build` | TypeScript a produkční Vite build PASS | 33,7204 s |
| `pnpm test:integration` | izolovaný server, skutečné SDK/HTTP scénáře PASS | 23,0267 s |

Publikované [výsledky](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/results.json), [pipeline](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-results.json), [source manifest](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/source-manifest.json), [SHA audit](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/source-check.json) a úplné [testové](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-test.log), [buildové](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-build.log) a [integrační logy](../verification-evidence/shadow-reserve-wheel-repair-20261011-k3/pipeline-test-integration.log) jsou neměnným důkazem této přejímky.

K3 opravuje medium/far kola geometrickým weldem před decimací a zachováním uzavřených komponent. **Všech 32 skutečně exportovaných wheel částí** je uzavřených a bez degenerovaných trojúhelníků. Nejvyšší near/master i všechny J body/PBR/obrázky zůstaly byte-identické; [wheel audit a omezení](../vehicles/wheel-repair.md). Low používá pět sdílených far stínových geometrií pro tělo a čtyři wheel pivots. Viditelné modely zůstávají samostatné. Počet vykázaných trojúhelníků má scope **`all-render-passes`**: jde o indexové průchody včetně stínů, nikoli inventář unikátních modelových ploch nebo čistě hlavní obraz.

## Celá produkční hra na GPU

Všechny následující vzorky používají **Intel UHD Graphics 630**, ANGLE/Direct3D11, WebGL 2, kvalitu **low**, CSS **1920×1080**, interní render **1476×830**, skutečný HUD a celý svět. Každý trvá přibližně 10 s a má **0 shaderových a 0 asset chyb**. Třicetičlenné vzorky obsahují browserovou relaci a 29 pohybujících se SDK klientů s reálným motion přenosem a různými avatary. Nejde o 30 paralelních grafických browserů.

| Platný vzorek | Avataři | FPS | p95 ms | p99 ms | Indexové trojúhelníky / draw calls |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Den1](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-1-low-day-intel-1.json) | 1 | 28,2 | 49,6 | 50,8 | 1080505 /325 |
| [Den2](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-1-low-day-intel-2.json) | 1 | 28,2 | 49,3 | 51,0 | 1080505 /325 |
| [Den3](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-1-low-day-intel-3.json) | 1 | 28,2 | 49,5 | 51,1 | 1080505 /325 |
| [Den30/1](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-30-low-day-intel-1.json) | 30 | 25,0 | 52,9 | 58,1 | 1286223 /397 |
| [Den30/2](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-30-low-day-intel-2.json) | 30 | 26,5 | 41,3 | 47,2 | 1163237 /364 |
| [Den30/3](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-30-low-day-intel-3.json) | 30 | 27,3 | 44,2 | 50,3 | 1201647 /375 |
| [Noc30/1](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-30-low-night-intel-1.json) | 30 | 27,9 | 41,7 | 54,1 | 1048021 /333 |

[Strojové shrnutí](evidence/shadow-reserve-wheel-repair-20261011-k3/summary.json) potvrzuje validní kohortová okna. Kamera je na stejné zaznamenané trase u `(110,12)m`, yawπ, pitch0,28, FOV0,85; přesné view/projection matice jsou v každém záznamu. Světelný náhled dne je **11. 10. 2026 12:00 Praha**, `1791712800000`; noc **12. 10. 2026 00:00 Praha**, `1791756000000`. To je jiný okamžik než samostatná astronomická/řidičská regrese **11. 10. 2026 02:00 Praha**. Herní náhledový čas se nesměšuje s UTC časem pořízení benchmarku.

Přísná přejímka 30 avatarů vyžaduje současně průměr≥30 FPS a p95≤33,3 ms v každém platném vzorku. **Všechny čtyři platné 30-avatarové intervaly ji nesplnily; 60 FPS ani 144 FPS nebylo naměřeno.** Jediné noční opakování nestačí k doložení noční stability.

### Výslovně vyloučený přechod

[browser-transition-30-ended-low-night-intel.json](evidence/shadow-reserve-wheel-repair-20261011-k3/browser-transition-30-ended-low-night-intel.json) zaznamenal po deadline denní kohorty **pouze 1 avatara**, 30,3 FPS a p95 35,3 ms. **Není a nikdy nebyl započítán jako 30-avatarový důkaz.** Platný noční vzorek výše pochází až z nově vydaného 180 s síťového okna. Název souboru ani zamýšlená kohorta nejsou náhradou skutečného počtu avatarů.

## Síť, odpojení a noční incident

| Skutečný běh K3 | Délka | Motion řádky min/max | Pohybující se SDK relace | Tick/motion Hz podle summary | Authority resync | Transportní chyby |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| [Den](evidence/shadow-reserve-wheel-repair-20261011-k3/network-29-gpu-day.json) | 600,011 s | 30/30 | 29 | 60,000 /19,988 | 0 | 0 |
| [Obnovená noc](evidence/shadow-reserve-wheel-repair-20261011-k3/network-29-gpu-night.json) | 180,003 s | 30/30 | 29 | 59,949 /19,961 | **58** | 0 |

Oba harnessy skončily důvodem `deadline`. Denní GPU intervaly leží uvnitř denní kohorty, platný noční uvnitř obnovené noční. Nula transportních chyb není nula resynchronizací. Harness počítá přijaté **`authoritative.resync` flagy**, nikoli počet kolizí nebo prokázaných prediction divergencí.

[Vyšetření reconnectu](network-rejoin-study/README.md) **nepotvrdilo ghost collidery držené 30 minut po odpojení**: nezměněný K3 `onLeave` okamžitě volá `Simulation.remove`; tři praktické Rapier cykly po odstranění 29 aktérů vracely počty těl/colliderů/controllerů na základní stav a původní handles už neexistovaly. Uchovaná dočasná relace/savedState není živé fyzikální tělo. Rozsah tohoto důkazu je lifecycle skutečné simulace a kontrola serverového zdroje, nikoli kompletní internetový soak test všech reconnect situací.

Noční GPU okno **08:08:31,84–08:08:41,85UTC** obsahovalo serverový zásek. Telemetry zaznamenala event-loop maximum **218,759 ms**, motion mezera347 ms a následné dohánění.58 flagů odpovídá dvěma globálním oznámením pro 29 klientů. Časová korelace a zachovaný catch-up limit osmi kroků podporují vysvětlení **dvěma globálními cap drop událostmi**, ale jde o **inference**: raw harness nezaznamenává důvod a čas každého resync callbacku. GC, plánování Windows a dlouhý callback se těmito daty nerozlišily. **Noční běh se nevydává za bezchybný ani stabilní** a incident nebyl zakryt vypnutím resync flagů.

## Historie a další kandidát

[J](faithful-world-repairs-20261011-j.md) zůstává ověřeným historickým srovnáním: jeden hráč ve dne 25,7–26,0 FPS proti K3 třikrát 28,2 FPS. J třicetičlenný den měl 23,9–24,7 FPS a jedinou noc 30,0 FPS/p95 36,1 ms. Podmínky počasí a běhu nebyly přísně izolovanou GPU A/B jedné změny; tyto rozdíly neprokazují samostatnou kauzalitu proxy, shaderu ani čistý GPU zisk. Menší součet shadow indexů sám není úměrný ušetřenému času hlavního PBR obrazu.

Neúspěšné checkpointy zůstávají publikované: [K](../verification-evidence/shadow-reserve-wheel-repair-20261011-k/results.json) má opakovaný `receiveShadows` warning a neprovedený build/integraci; [K2](../verification-evidence/shadow-reserve-wheel-repair-20261011-k2/results.json) skončil 345/346 PASS kvůli chybějícímu `docs` weld auditu ve snapshotu. K3 balí byte-identický kanonický audit s asset sources; původní neúspěšný log se nemaže.

**NVIDIA/GeForce v uživatelově Chrome/Edge zatím nemá doručený měřený záznam.** Intel IAB vzorky se za GeForce nevydávají; [GPU diagnostika](gpu-selection.md). Kandidát **K4** právě řeší vypnutí přesně nulového clearcoat a pořadí opaque ploch podle [zdrojové nákladové studie](k3-material-cost-study.md). K4 zatím nemá vlastní publikované měření nebo kompletní přejímku. Vizuální věrnost všech míst, near vnitřní car fold, oddělené far body/arch vady, vlasy/animace a výkonové cíle zůstávají otevřené; celkový úkol není prohlášen za dokončený.
