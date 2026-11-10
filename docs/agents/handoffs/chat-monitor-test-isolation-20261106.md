# Předání chat-monitor-test-isolation-20261106

Vlastník `chat-monitor-20261106-isolation`, příjemce `/root`. Kanonický checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, výchozí commit `20fb1d104f0fcc2860e6ea88d868b4c96ad3d303`.

## Plán ověření

- Problém. Integrační server může při startu zahájit údržbu produkčního archivu, pokud zdědí jeho konfiguraci.
- Mechanismus. Launcher předává serveru a pomocným procesům stejné prostředí sestavené jedním sanitizérem.
- Změna. Doplnit `CHAT_MONITOR_` do existujícího filtru prefixů bez rozlišování velikosti písmen. Tím se odebere i budoucí nastavení ve stejném namespace. Seznam jednotlivých klíčů by vyžadoval údržbu při každém rozšíření konfigurace.
- Metrika. Výsledné prostředí pro start integračního serveru.
- Správnost. Zachovat původní vyhrazené hodnoty pro server, test URL, feedback a běžné proměnné procesu.
- Přijetí. Cílený test prokáže odstranění `CHAT_MONITOR_` v různých velikostech písmen a zachování očekávaného prostředí.

## Výsledek a ověření

- Změněny `scripts/test-integration.mjs`, `tests/feedback-deployment.test.ts` a toto předání. Filtr používá stejnou cestu pro hlavní server i všechny integrační podprocesy. Úprava nemění počet průchodů filtrem ani lifecycle procesů. Cizí WIP nebyl převzat.
- Dne 6. 11. 2026 v 23:04 UTC `node --import tsx --test --test-name-pattern='isolated integration' tests/feedback-deployment.test.ts` skončil s kódem 0, prošel 1 z 1. `git diff --check` pro oba změněné soubory prošel.
- SHA-256 launcheru je `f62496874beae6b55f787ae6f5e4e5fe59712ff0fe0eaac56052dab1ab97cc0b` a testu `9cb2548b13412fa85840873ca8a69dfdd10c899a07d7e5ca397797d1a5c346b3`.
- Test pracuje s fiktivními hodnotami prostředí bez připojení k databázi. Nebyly spuštěny žádné pomocné služby ani obsazené porty. Plnou integraci a commit zajišťuje koordinátor.
