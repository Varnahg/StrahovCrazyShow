# Předání: repair-network-cause

- Vlastník: `repairs-network-cause-01a13624`; příjemce: koordinátor `/root`, `repairs-01a13624-root`.
- Pracovní kopie a větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: dokončený přidělený kauzální průzkum, **oprava hry zatím není dokončena**. Zjištěna závislost UI fronty na samostatném timeru a reprodukován nesoulad příkazového ack s fyzikálním časem auta. Dodán wire/lead/rebase návrh, minimální reprodukce a testovací kontrakt. Root výslovně rozhodl rozdělit pokračování na kompatibilní transport/telemetrii a následnou úplnou změnu časového protokolu.
- Změněné soubory: pouze `docs/performance/repair-network-cause.md` a tento handoff. Žádný runtime, task katalog, test ani cizí soubor se nezměnil.
- Cizí rozpracované změny: počáteční dirty stav je v registru; runtime `game.ts`, `ui.tsx` a diagnostiku vlastní root, `server/index.ts` měl předaný WIP. Nebyly převzaty ani přepsány. Pro případné navazující úpravy je nutný samostatný claim s doloženým převzetím.
- Podklady: zmrazený uživatelský JSONL z 13. 10. 2026, přímé čtení skutečných klient/server/shared zdrojů a relevantních testů, HTML Standard a oficiální Rapier dokumentace. Přesné zdroje a rozlišení důkazu od hypotézy jsou v analýze.
- Refaktoring: task neimplementuje runtime. Návrh sjednocuje vlastnictví input bufferu, neutral filler a časovou identitu; odmítá opravu pomocí libovolně většího bufferu/threshold. Lifecycle senderu musí kopírovat room lifecycle.
- Ověření: `pnpm exec tsx --test tests/netcode.test.ts tests/input-backlog.test.ts tests/prediction-replay.test.ts` dokončeno 13. 10. 2026 kolem 20:26 Europe/Prague, exit0, **17/17**, 15,658 s. To jsou současné úzké CPU testy; žádný z nich nepokrývá zjištěnou idle-tick identitu, a proto jejich zelený výsledek není důkazem opravy.
- Reprodukce: dva skutečné Rapier světy, 180 shodných kroků = max rozdíl pozice i rychlosti0. Prázdná serverová queue/auto14m/s = při stejném ack po1/2/3 krocích rozdíl0,232903/0,465406/0,697518m. Skutečný `Game.reconcile` přes existující fixture = korekce0,233183/0,465771/0,697787m. Skripty šly přímo přes stdin, nevytvořily soubory ani síťový listener.
- Očekávaně neúspěšná regrese: TypeScript/JavaScript blok uložený v analýze vytažen regulárním výrazem a spuštěn `node --import tsx --input-type=module`. Poslední běh exit1 s `AssertionError: same ack 1 has state distance 0.46540623794739977 m`. První pokus měl non-null assertion ve stdin JS; syntaxe byla opravena a příčinový fail poté samostatně ověřen. Nejde o nevyřešenou syntaktickou chybu předaného bloku.
- Snapshot/diff: původní JSONL SHA256 `30f15b76b579f872d127c61bbdd4821e8779a6082fffb18001878391d2215f6d`. Níže je úzký zdrojový/testový manifest po průzkumu; nesmí být vydáván za produkční identitu celé hry. Aktuální root mezitím mění své integrační soubory.
- Procesy a zdroje: pouze synchronní CPU/CLI běhy; všechny potvrzeně skončily. Žádný pomocný server, port, GPU ani heavy-validation spuštěn. Existující dev/preview zůstaly původním vlastníkům.
- Omezení a další krok: přesný browser scheduler/timer interval, server timing a ack u starých incidentů nejsou v původním logu. Nemůžeme tvrdit, že všechny420 opravy jsou stejný mechanismus. Root má přidat kompatibilní měření a frame sender, po baseline implementovat tick epoch protokol, update všech SDK producerů, a provést stabilní produkční praktickou přejímku. Podrobný contract v analýze zahrnuje initial lead gap filler a rebase po dlouhém stall.
- Rezervace: po předání bude uvolněna příkazem `release`; stav tasku mění koordinátor, nikoli autor této analýzy.
- Integrátor: převzetí, Linear a zápis do `docs/verification.md` provede koordinátor. Tento task sám nesmí označit KEY-6/7 jako opravené.

## Úzký manifest 2026-10-13T18:28:15.116Z

SHA256 JSON.stringify následujícího uspořádaného pole objektů `{path,sha256}`: `a3973719b19e1c19391f8b3946dde122dd22f48a7763d4a2448c290b650a3b5f`.

| Soubor | SHA256 |
|---|---|
| shared/netcode.ts | 99a53e5f356fd9111100ce07fa4067cb4842ddd2090f76ce902f2ae63b12883f |
| shared/simulation.ts | 11f6016a254b33b7b042ee1c225027b78c1b17b5913753c42d065ee8162d9ea5 |
| shared/vehicle.ts | 9cdb914602a99e23f68ab607f9be5226ecdb1f1850c83e2177ccfea458562703 |
| server/index.ts | 1e43a4ac39a4b5e33968da5ee7070eb3f47386066037065210167141b478fb8e |
| tests/netcode.test.ts | 3306794c3d323aaa73ea70fd44312cad9d745efdeaf1957d684b718b13bec621 |
| tests/input-backlog.test.ts | 28780156695aa7bbf89f1948bdf1034e595c0b871cf65719f070ffa18c40d093 |
| tests/prediction-replay.test.ts | 235efbc5d1867ae92dc0bd805641a0e7366624e1cfcfa94683994e625518aae9 |
| tests/helpers/prediction-replay-fixture.ts | f62e82e17e3c679bb7191ec997efca1774068da3cdd756b5bb38e08dd0a82aa0 |
| docs/performance/repair-network-cause.md | e06a9819b462e102ca3544a7a5efe0cf8de50875c12a98fa3b04fd703851db52 |
