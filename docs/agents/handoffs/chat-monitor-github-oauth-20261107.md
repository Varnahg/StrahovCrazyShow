# Ověření skutečného přihlášení GitHub

Vlastník `key75-oauth-20261107-root`. Kanonický `main`, přehled z `45db37f0`. Na veřejné doméně aktuálně vrací `/admin` 404. V osobním účtu GitHub byla před testem prázdná sekce OAuth Apps.

1. Uživatel chce reálný průchod OAuth ve stejných HTTPS podmínkách jako v produkci.
2. Přehled vyžaduje důvěryhodné HTTPS, přesný callback a povolené číselné GitHub ID. Lokální HTTP ukázka má simulované poskytovatele.
3. Oddělený loopback proces zpřístupní pouze `/admin` přes dočasnou HTTPS adresu. Použije soukromou zkušební databázi a sběr 0.
4. Přijetí vyžaduje vydání správcovské relace přes skutečné GitHub API a auditované otevření jedné syntetické konverzace.
5. Před registrací se ověří HTTPS a uzavřená trasa. Soukromé údaje zůstávají v lokální konfiguraci.
6. Výsledek se oddělí od stavu nasazení skutečné veřejné domény.

Izolovaný HTTPS přehled je připravený na `https://organizations-qualifying-shown-revised.trycloudflare.com/admin`. Kořen vrací HTTP 404 a přehled HTTP 503 s informací o chybějící konfiguraci, bez cache. Ve stejné izolované instanci PostgreSQL jako lokální zkouška má tento test vlastní databázi, roli a jeden syntetický přepis. Server PID 64620 poslouchá jen na `127.0.0.1:4282`. Dočasný HTTPS tunel PID 43148 má lokální metriky na rezervovaném portu 4283. PIDs, logy a stav jsou v `.cache/chat-monitor-github-oauth-20261107/`.

V Edge je vyplněná registrace `Strahov Crazy Show OAuth test` s jediným přesným callbackem `https://organizations-qualifying-shown-revised.trycloudflare.com/admin/oauth/callback`. Registrace čeká na potvrzení vytvoření OAuth aplikace a přístupových údajů. Při návratu k práci nejprve ověř, že se dočasný origin nezměnil. Sběr je v tomto testu vypnutý. Při ukončení testu ověř vlastnictví procesů a uvolni rezervaci až po jejich zastavení.
