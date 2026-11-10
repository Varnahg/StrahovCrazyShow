# Zkušební provoz Crazy Typky a /admin

Vlastník `key75-playtest-20261107-root`, kanonický checkout na `main`, herní základ `45db37f0bbea41baee7376df9f1c079a7f74f970`.

1. Hráč potřebuje místní rozhraní pro praktický průchod od dotazu k přepisu.
2. Neměnný klient z přejímky KEY-75 odpovídá aktuálnímu klientskému otisku. Existující backend potřebuje privátní PostgreSQL a OAuth poskytovatele.
3. Spustit jeden loopback test s oddělenou PostgreSQL v tmpfs a lokální náhradou poskytovatelů v `.cache/chat-monitor-playtest-20261107/`.
4. Praktický výsledek je nová výměna viditelná v /admin a stav HTTP 200.
5. Použít výhradně syntetické údaje a porty 4278 a 5548. Podmínky v klientu mají zástupný odkaz. Produkční klíče se nepoužívají.
6. Po zkoušce ponechat ověřený běh pro uživatele pod původní rezervací.

V Edge prošel nový syntetický dotaz přes klienta, uložení a detail přepisu. Při ověření byly v databázi dvě výměny a jeden audit čtení. Číslo klienta je `sha256-952892f15789002070176ce76fd46fa9929d1e94860b8fc316163f6dbca614df`. Obě karty zůstaly otevřené.

- Hra běží na `http://127.0.0.1:4278/` a přehled na `http://127.0.0.1:4278/admin`. Tlačítko „Přihlásit se v testu“ dokončí místní zkušební přihlášení.
- Ověřený PID 102240 spustil `.cache/chat-monitor-playtest-20261107/serve.mjs` z kanonického checkoutu. PostgreSQL na portu 5548 je kontejner `strahov-key75-user-playtest` s vlastníkem `key75-playtest-20261107-root`. Identita a logy jsou v uvedené cache.
- Zkušební odpovědi a GitHub jsou simulované. Databáze je dočasná a po zastavení vlastního kontejneru se ztratí. Uživatel má oba procesy k dispozici. Rezervaci uvolnit až po jejich ověřeném ukončení.
