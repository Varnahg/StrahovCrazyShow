# Ověření skutečného přihlášení GitHub

Vlastník `key75-oauth-20261107-root`. Kanonický `main`, přehled z `45db37f0`. Na veřejné doméně aktuálně vrací `/admin` 404. V osobním účtu GitHub byla před testem prázdná sekce OAuth Apps.

1. Uživatel chce reálný průchod OAuth ve stejných HTTPS podmínkách jako v produkci.
2. Přehled vyžaduje důvěryhodné HTTPS, přesný callback a povolené číselné GitHub ID. Lokální HTTP ukázka má simulované poskytovatele.
3. Oddělený loopback proces zpřístupní pouze `/admin` přes dočasnou HTTPS adresu. Použije soukromou zkušební databázi a sběr 0.
4. Přijetí vyžaduje vydání správcovské relace přes skutečné GitHub API a auditované otevření jedné syntetické konverzace.
5. Před registrací se ověří HTTPS a uzavřená trasa. Soukromé údaje zůstávají v lokální konfiguraci.
6. Výsledek se oddělí od stavu nasazení skutečné veřejné domény.

Izolovaný HTTPS přehled je na `https://organizations-qualifying-shown-revised.trycloudflare.com/admin`. Ve zkušební instanci PostgreSQL má vlastní databázi, roli a jeden syntetický přepis. Server PID 8252 poslouchá na `127.0.0.1:4282`. Dočasný tunel PID 43148 má lokální metriky na rezervovaném portu 4283. Sběr je vypnutý.

Po potvrzení uživatele byla zaregistrována aplikace `Strahov Crazy Show OAuth test` s ID registrace `3999415` a jediným přesným callbackem `https://organizations-qualifying-shown-revised.trycloudflare.com/admin/oauth/callback`. Uživatel ověřil passkey. Server přijal tajemství jednorázovým místním formulářem a drží ho v paměti. Formulář po použití vrací HTTP 404.

V Edge prošlo přihlášení skutečným GitHub OAuth jako `Varnahg`. GitHub zobrazil přístup pouze k veřejným údajům. Po návratu přes HTTPS byla vydána správcovská relace a detail zobrazil syntetický dotaz i odpověď. V oddělené databázi vznikl přesně jeden audit čtení s očekávaným GitHub ID. Nepřihlášená navigace vrátila HTTP 401 bez cache a bez CORS a požadavek mimo navigaci HTTP 403. Produkční `https://strahov.bandportal.cz/admin` při stejném ověření vrátil HTTP 404.

V Edge zůstala otevřená karta s přihlášeným detailem. Důkazy bez tajných údajů jsou v `.cache/chat-monitor-github-oauth-20261107/real-auth-http.json` a `real-auth-db.json`. Při ukončení testu ověř vlastní PIDs, zastav pouze tyto procesy a uvolni rezervaci až po jejich zastavení.
