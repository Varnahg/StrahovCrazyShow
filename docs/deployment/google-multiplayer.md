# Google přihlášení do multiplayeru

Produkční origin je `https://strahov.reomnik.com`. Veřejný úvod, sólo, počasí a agregát online se servírují i při nedostupnosti Google přihlášení. Runtime hlásí režim na `GET /api/auth/session`. V produkci smí být `google` nebo `closed`. Izolovaný lokální vývoj na loopbacku používá `local`.

## Nastavení Google

1. V [Google Auth Platform](https://console.cloud.google.com/auth/overview) založ nebo vyber produkční projekt. Nastav název Strahov Crazy Show, kontakt provozovatele, domovskou stránku, adresy `https://strahov.reomnik.com/privacy.html` a `https://strahov.reomnik.com/terms.html` a autorizovanou doménu `reomnik.com`. Ověř vlastnictví domény a Branding podle požadavku konzole.
2. Zvol publikum External a vytvoř OAuth klienta Web application s povoleným redirect URI `https://strahov.reomnik.com/api/auth/google/callback`. Hra používá `openid email` a serverový redirect.
3. Na Pi připrav `/etc/strahov-crazy-show/google` jako `root:1000`, mód `0750`. Vlož Client ID do souboru `client_id` a Client Secret do `client_secret`. Každý obsahuje jednu hodnotu, vlastník je `root:1000` a mód `0440`. Hodnoty zadávej na hostiteli skrytě a drž je mimo Git, logy a historii shellu.
4. Pod stejným zámkem jako updater instaluj ověřenou verzi `update.py` a Compose souborů podle stávajícího návodu na Pi. Provozní svazek `strahov-crazy-show-player-accounts` vytváří updater. Po spuštění nového obrazu musí `GET /api/auth/session` vrátit `{"mode":"google","account":null}` a anonymní `POST /api/session` se stejným Origin musí vrátit 401. Po nahrání přístupů do již běžícího kontejneru obnov jeho proces standardní cestou přes službu. Před přijetím otestuj živý callback s přihlášením přes Google.

## Provoz a návrat verze

- SQLite patří do samostatného externího volume. Zálohuj databázi konzistentně pomocí SQLite online backup nebo po zastavení herního procesu. Zálohy chraň stejnými přístupy jako produkční svazek. Po obnově starší zálohy smaž její serverové relace, aby se znovu neaktivovala odvolaná cookie.
- Pokud selže konfigurace nebo Google, klient dál nabídne sólo. Po první aktivaci brány vracej pouze na verze, které rozumí požadované autentizaci. Při nouzovém návratu před bránu nejprve uzavři multiplayerové HTTP a WebSocket cesty na ingressu.
- Docker smoke se spouští s výslovně izolovaným režimem `STRAHOV_AUTH_MODE=local STRAHOV_LOCAL_TEST_ONLY=1` a s bindem na loopback hostitele. Produkční Compose vynucuje Google a tuto testovací volbu vypíná.

[Google OAuth nastavení](https://support.google.com/cloud/answer/15544987) · [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
