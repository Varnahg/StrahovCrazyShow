# Produkční měření J — Intel UHD 630

Zmrazený zdroj **J**, SHA-256 **`cd44b8d901261fc8a67c7080aa014595f3655f08153982418ba406ad574d2a33`**, obsahuje **8050 souborů**. Všechny zde uvedené browserové vzorky nesou toto stejné zdrojové ID. **Výkonový cíl na měřeném Intelu není splněný:** ani 60 FPS, ani přísné přijetí 30 avatarů s průměrem alespoň 30 FPS a p95 nejvýše 33,3 ms. Noční průměr 30,0 FPS nepřeváží nevyhovující p95 36,1 ms.

J je neměnný technický checkpoint. Následující práce K na stínových reprezentacích, LOD a modelových opravách vyžaduje nový zdrojový manifest a nové měření. Tento protokol se na K automaticky nepřenáší.

## Zdroj a technické kontroly

| Kontrola stejného zmrazeného J | Výsledek |
| --- | --- |
| Testy | **335/335 PASS**, 0 failed/skipped/cancelled/todo; příkaz 51,7324 s, test runner 50,7256 s |
| Produkční build | Striktní TypeScript i Vite PASS, 35,5009 s |
| Izolovaná SDK/HTTP integrace | PASS, 17,9821 s |
| Následná kontrola SHA | **8050 živých + 8050 zmrazených souborů**, **0 neshod**, 11. 10. 2026 06:37:44 UTC |

[Výsledky](../verification-evidence/faithful-world-repairs-20261011-j/results.json), [přesné příkazy](../verification-evidence/faithful-world-repairs-20261011-j/pipeline-results.json), [zdrojový manifest](../verification-evidence/faithful-world-repairs-20261011-j/source-manifest.json), [následný SHA audit](../verification-evidence/faithful-world-repairs-20261011-j/source-check.json). Hash audit dokládá shodu v uvedeném okamžiku; pozdější autorizované změny živého projektu pro K nemění zmrazený J.

Předchozí I se 330/334 PASS a čtyřmi selháními je zachovaný odděleně. Dvě chyby byly zastaralé početní kontrakty vůči nové B6 spojce a šestému kurtu, další dvě fingerprint vegetace a zabalení licence anatomické základny. Nový 335. test je vyčerpávající regrese 35cm odstupu trávy od povrchů; licenční test už existoval a byl opravený. Neúspěšný I se zpětně nepřejmenovává na PASS.

## Podmínky skutečného browserového měření

- Celá produkční hra se skutečným `Game`, HUD, relacemi, různými avatary, mapou, materiály, vegetací a fyzikou. Nejde o NullEngine, komponentový náhled ani jediné HUD číslo.
- **Low**, CSS viewport **1920×1080**, interní WebGL render **1476×830** ve všech sedmi vzorcích. Výsledky nejsou měřením nativního 1080p backbufferu.
- Skutečný renderer: **ANGLE — Intel UHD Graphics 630, Direct3D11, WebGL 2.0**. User Chrome/Edge s GeForce není tímto vzorkem změřený.
- Kamera: pozice přibližně **(110; −2,3239; 12) m**, yaw **π**, pitch **0,28**. Stejný záběr pro opakování; nejde o automatický průměr všech ulic a interiérů.
- Denní osvětlení: `1791712800000` = **2026-10-11 10:00 UTC / 12:00 Europe/Prague**.
- Noční osvětlení: `1791756000000` = **2026-10-11 22:00 UTC / 2026-10-12 00:00 Europe/Prague**. Tento náhled není regresní QA **11. 10. 02:00 Praha**; oba okamžiky zůstávají oddělené.
- Všechny vzorky mají **0 shaderových a 0 asset chyb**. Délka vzorku je 10,01–10,04 s. Počítají se celé skutečné snímky a jejich p95/p99, bez převodu CPU časů na údajné GPU FPS.

Úplný strojový index je [summary.json](evidence/faithful-world-repairs-20261011-j/summary.json). Jednotlivé JSON obsahují i další stav scény, geometrie, rendereru a populací.

## Jednotlivé platné vzorky

| Scéna | Doba s | Průměr FPS | p95 ms | p99 ms | Původní vzorek |
| --- | ---: | ---: | ---: | ---: | --- |
| Den / 1 avatar / opakování 1 | 10,01 | **25,8** | 41,8 | 52,4 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-1-low-day-intel-1.json) |
| Den / 1 avatar / opakování 2 | 10,01 | **25,7** | 43,3 | 53,4 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-1-low-day-intel-2.json) |
| Den / 1 avatar / opakování 3 | 10,01 | **26,0** | 40,4 | 45,0 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-1-low-day-intel-3.json) |
| Den / 30 avatarů / opakování 1 | 10,01 | **23,9** | 57,1 | 60,6 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-30-low-day-intel-1.json) |
| Den / 30 avatarů / opakování 2 | 10,02 | **24,4** | 56,4 | 57,6 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-30-low-day-intel-2.json) |
| Den / 30 avatarů / opakování 3 | 10,04 | **24,7** | 55,5 | 56,6 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-30-low-day-intel-3.json) |
| Noc / 30 avatarů / jediné opakování | 10,02 | **30,0** | **36,1** | 38,7 | [JSON](evidence/faithful-world-repairs-20261011-j/browser-30-low-night-intel-1.json), [snímek](evidence/faithful-world-repairs-20261011-j/browser-30-low-night-intel.png) |

Přísný 30-avatarový limit nesplnil **žádný ze čtyř** platných 30-avatarových vzorků. Výsledky mezi scénami nebo opakováními se neprůměrují tak, aby skryly nevyhovující běh. Noc má pouze jedno opakování, takže nedokládá opakovatelnost tří nočních běhů. Všech sedm vzorků je také pod cílem 60 FPS; 120 ani 144 FPS nebylo naměřeno.

## Skutečné síťové pokrytí třiceti avatarů

[600s síťový záznam](evidence/faithful-world-repairs-20261011-j/network-29-gpu-day.json) má stejné source ID, **29 pohybujících se SDK relací a browserovou relaci**, motion minimum/maximum **30/30 řádků**, **60,001 Hz** simulace a **19,998 Hz** motion. Po dobu měření bylo **0 resync a 0 chyb**. [Profily relací](evidence/faithful-world-repairs-20261011-j/network-29-gpu-day.json.profiles.json) jsou uložené samostatně.

Všechny čtyři desetisekundové 30-avatarové GPU intervaly leží celé uvnitř tohoto skutečného síťového běhu; index je označuje `validCohortWindow=true`. Nejde o třicet lokálních dekorativních NPC nebo ručně nastavené číslo avatarů. Harness trval **600 006,476 ms** a skončil zadaným důvodem **`deadline`**. Po skončení byly SDK relace odpojené a nezůstalo otevřené spojení. Síťový výsledek je PASS, grafický přejímkový výsledek FAIL.

## Meze a další ověření

NVIDIA měření zatím chybí. Uživatel uvádí GeForce v Chrome/Edge, ale z tohoto prohlížeče nebyl odevzdaný platný benchmarkový záznam. Seznam nainstalovaných karet ani `high-performance` požadavek WebGL nenahrazuje skutečný renderer zaznamenaný v konkrétním vzorku.

Starší **H** naměřil při jednom hráči **39,4 FPS** na Intelu v obdobném low rozlišení. Obsahoval jiná schodiště, avatary a modely; není výsledkem J, NVIDIA ani kontrolovaným A/B důkazem příčiny rozdílu. [Původní H vzorek](evidence/authored-social-pilot-20261011-h/browser-1-low-day-a.json) zůstává historickou evidencí.

J neurčuje jediného viníka GPU nákladů. Nejdetailnější zdroje a oddělené objekty se zachovávají, další K zkoumá stínové reprezentace a LOD a musí prokázat vlastní výsledek. Přímé stíny, prototypové vlasy, některé přechody detailu, drobná vada vnitřního trimu auta a neúplné fotografické doložení světa zůstávají kvalitativní prací. Úspěšný build a nulová shaderová chyba nejsou prohlášením o dokonalém prostředí nebo fotogrammetrické kvalitě každého stromu.
