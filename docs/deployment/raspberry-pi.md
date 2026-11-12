# StrahovCrazyShow na Raspberry Pi

Veřejný origin je `https://strahov.reomnik.com`. Na Pi obsluhuje jeden Compose projekt web, multiplayer a Crazy Typku na `127.0.0.1:8081`. Stávající tunel `rezacworks` směruje nový hostname na tento port. RezacWorks používá vlastní projekt na `127.0.0.1:8080`.

## Vydání

GitHub Actions vydává obrazy pro `linux/arm64` z aktuálního GitHub `main` po úspěchu CI, kontroly zdrojových tajemství a testů formuláře. Po ověření kontejnerů zveřejní v soukromém GHCR jediný produkční manifest s plným SHA commitu a neměnnými digesty hry, nástrojů RAG a PostgreSQL. V přehledu Actions lze dohledat, proč se vydání nevytvořilo. Pi vyhledává nový manifest každou minutu.

Chybějící název balíčku nejdřív dostane pouze prázdný iniciační záznam. Pokud GitHub nový balíček z veřejného repozitáře založí jako veřejný, release se zastaví před nahráním obrazu nebo skutečného manifestu. V nastavení dotčeného balíčku nastav `Private` a spusť `gh workflow run raspberry-release.yml --ref main`. Vydání pak znovu ověří všechny tři kontroly přesného SHA.

Na Pi používej účet pro čtení soukromých balíčků a token GitHub (classic) pouze s `read:packages`. Přihlašovací údaje patří do `/etc/strahov-crazy-show/docker`, který vlastní `root` a má mód `0700`. Vlož token do `docker login ghcr.io --username UZIVATEL --password-stdin` přímo přes standardní vstup pod účtem správce s nastaveným `DOCKER_CONFIG`. OpenAI klíč je v samostatném souboru `/etc/strahov-crazy-show/openai_api_key` s vlastníkem `root:1000` a módem `0440` v adresáři správce s módem `0700`. Skupina 1000 je skupina neprivilegovaného uživatele `node` v kontejneru. Soubor potřebuje jen hra a bootstrap. [Oprávnění GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry)

Na Pi nainstaluj ORAS stejným skriptem jako na runneru. Skript ověří SHA-256 archivu pro ARM64.

```sh
oras_stage=$(mktemp -d)
RUNNER_TEMP="$oras_stage" GITHUB_PATH="$oras_stage/path" bash scripts/pi-deploy/release/install-oras.sh
sudo install -m 0755 "$oras_stage/strahov-oras/oras" /usr/local/bin/oras
rm -f "$oras_stage/strahov-oras/oras" "$oras_stage/path"
rmdir "$oras_stage/strahov-oras" "$oras_stage"
oras version
sudo docker --host unix:///var/run/docker.sock --config /etc/strahov-crazy-show/docker compose version
```

Soubory hostitele jsou v [adresáři nasazení](../../scripts/pi-deploy/host/). Nainstaluj `update.py`, `compose.pi.yaml` a kořenové `compose.yaml` a `compose.full.yaml` do `/opt/strahov-crazy-show`. Nainstaluj jednotky do `/etc/systemd/system` a obnov konfiguraci příkazem `sudo systemctl daemon-reload`. Po zveřejnění produkčního manifestu a nastavení obou přístupů spusť `sudo systemctl enable --now strahov-crazy-show.service strahov-crazy-show-update.timer`. První přepnutí můžeš spustit `sudo systemctl start strahov-crazy-show-update.service`.

## Provoz a obnova

Hra má na Pi vlastní Compose projekt i Docker volumes. PostgreSQL nemá publikovaný port. První start naplní znalostní bázi z vydaného seedu. Při změně, která vyžaduje bootstrap, zachová updater původní databázi a spustí kandidáta nad její kopií. Kandidát se stane aktivní až po úspěšné kontrole hry a Crazy Typky. Při chybě se vrátí původní obraz i jeho databáze.

Updater před stažením ponechává nejméně 2 GiB volného místa. Počítá s komprimovanými i rozbalenými vrstvami Dockeru. Pokud má Pi málo místa, další vydání počká a aktivní hra dál běží. Úspěšné přepnutí krátce odpojí hráče a vytvoří nový dočasný svět. Po restartu Pi použije ověřený místní stav i při výpadku registru.

```sh
sudo systemctl status strahov-crazy-show.service strahov-crazy-show-update.timer
sudo journalctl -u strahov-crazy-show.service -u strahov-crazy-show-update.service -n 80
curl -fsS http://127.0.0.1:8081/api/health
curl -fsS -H 'Origin: https://strahov.reomnik.com' http://127.0.0.1:8081/api/ai/status
```

Přejímka vyžaduje porovnat běžící digesty s manifestem a zvenčí ověřit HTTPS, model ze scény, připojení dvou hráčů přes WebSocket, výměnu zpráv i jednu odpověď Crazy Typky s citací. U plánovaného restartu ověř také původní RezacWorks.
