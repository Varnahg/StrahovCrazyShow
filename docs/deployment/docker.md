# Docker: web a multiplayer / web and multiplayer

## Česky

Potřebuješ Git s Git LFS a běžící Docker s Linux kontejnery (na Windows Docker Desktop). Node.js, pnpm ani Blender na hostiteli nejsou pro sestavení image potřeba.

```sh
git lfs install
git clone https://github.com/Varnahg/StrahovCrazyShow.git
cd StrahovCrazyShow
git lfs pull
docker compose up -d --build
```

Otevři [http://localhost:8080](http://localhost:8080). Jediná služba `game` poskytuje web, API i WebSocket. GPU používá prohlížeč hráče. Všechny modely a textury jsou v image; veřejné assety mají přibližně 1,24 GB, proto první sestavení/přenos chvíli trvá. Chybějící LFS objekty build odmítne s návodem, místo publikování nefunkčních modelů.

```sh
docker compose ps
docker compose logs -f --tail=100 game
docker compose stop
docker compose start
docker compose down
```

`stop` korektně odpojí hráče; `start` obnoví kontejner s novým světem. `down` odstraní kontejner a jeho síť. Svět, zprávy, dočasné relace a vlastní demo akce jsou pouze v paměti. Žádný volume ani databáze se nevytváří. Spouštěj právě jednu repliku; více kontejnerů by vytvořilo nezávislé světy.

Pro aktualizaci nejprve aktualizuj čistou pracovní kopii a LFS objekty, pak opakuj `docker compose up -d --build`. Nový image nahradí původní kontejner a ukončí jeho dočasné relace. Hranou vývojovou/testovací verzi nepřestavuj uprostřed měření.

### Nastavení

| Proměnná       | Výchozí hodnota                              | Význam                                                   |
| -------------- | -------------------------------------------- | -------------------------------------------------------- |
| `HTTP_PORT`    | `8080`                                       | Publikovaný port hostitele                               |
| `BIND_ADDRESS` | `127.0.0.1`                                  | Adresa hostitele; `0.0.0.0` umožní přístup z okolní sítě |
| `HOST`         | Docker: `0.0.0.0`; lokální Node: `127.0.0.1` | Adresa serveru uvnitř kontejneru                         |
| `PORT`         | `2567`                                       | Port Node serveru; Compose jej drží na2567               |
| `STATIC_DIR`   | Docker: `/app/dist`; lokálně nenastaveno     | Absolutní adresář sestaveného webu                       |

`HTTP_PORT` a `BIND_ADDRESS` nastav v prostředí shellu nebo lokálním `.env` vedle Compose. Příklad obsahu:

```dotenv
HTTP_PORT=8081
BIND_ADDRESS=0.0.0.0
```

Tento soubor se nekopíruje do image. Lokální běh `pnpm start` spouští server bez watcheru; servírování webu zapne až explicitní `STATIC_DIR`. Docker build nastavuje klientovi `VITE_MULTIPLAYER_URL=/`; běžné `pnpm dev` a dosavadní preview dál používají proxy `/realtime`.

`/api/health` vrací200 až po vytvoření světa; při startu/vypínání vrací503. Lokální diagnostické/benchmark endpointy jsou v kontejneru vypnuté, protože server naslouchá na0.0.0.0. Počasí používá odchozí HTTPS; jeho nedostupnost nebrání spuštění hry. Výchozí renderer je WebGL2; experimentální WebGPU zůstává omezené na loopback.

### Server a HTTPS

Pro veřejnou doménu směruj existující HTTPS reverse proxy na127.0.0.1:8080. Musí předávat celý origin: web, `/api`, `/matchmake` a WebSocket cesty. Prefix `/realtime` se pro Docker build nepřepisuje. Následující příklad Nginx je konfigurace **vnějšího hostitele**, nikoli druhý kontejner této aplikace. TLS certifikát a doménu spravuje hostitel.

## English

Install Git/Git LFS and run a Linux Docker engine (Docker Desktop on Windows). Clone the repository, run `git lfs pull`, then `docker compose up -d --build`. Open [http://localhost:8080](http://localhost:8080). Host Node.js, pnpm, Blender and server GPU are unnecessary.

One `game` service serves the built website, API and multiplayer. Public assets currently total about1.24GB. The build rejects unresolved Git LFS pointers. Runtime uses a non-root Node process, includes its assets/dependencies, and needs no host mounts.

Use `docker compose logs -f --tail=100 game` for logs, `stop`/`start` for a graceful stop/new world, and `down` to remove the container/network. After updating a clean checkout and pulling LFS, repeat `up -d --build` to deploy a new image. Restart/update disconnects players and resets in-memory sessions, chat and player-created demo events. Run exactly one replica; no database or persistent volume is included.

Set `HTTP_PORT` (default8080) and `BIND_ADDRESS` (default127.0.0.1) in your shell or a local Compose `.env`. Use `0.0.0.0` only when network access is intended. Inside the container `HOST=0.0.0.0`, `PORT=2567` and `STATIC_DIR=/app/dist`. Standalone `pnpm start` keeps the local loopback/API-only defaults unless an absolute `STATIC_DIR` is supplied.

Only the Docker frontend build sets `VITE_MULTIPLAYER_URL=/`. Existing development/preview proxies keep working. Health returns200 only after the shared world is ready and503 during initialization/shutdown. Local diagnostics are disabled for the public bind. Weather uses outbound HTTPS but failure does not prevent startup. WebGL2 remains the default; experimental WebGPU remains loopback-only.

For a public domain, terminate HTTPS at your existing external reverse proxy and forward the **entire origin**, including WebSocket upgrades. Do not add a `/realtime` prefix/rewrite. Example Nginx configuration (TLS/domain managed by the host):

```nginx
# In the http context:
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# Inside your existing HTTPS server block:
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 90s;
}
```

CZ: Server nedůvěřuje libovolnému `X-Forwarded-For`. Za proxy proto připojení sdílejí adresní limit vydávání relací. Kontejner nepřidává skutečné účty ani přihlašování.
EN: The server does not trust arbitrary `X-Forwarded-For` headers. Clients behind a proxy share its session-issuance IP limit. Containerization adds no persistent accounts or authentication system.

## Ověření / Verification

`pnpm test:docker` requires local development dependencies, a running Docker engine and the test browser installed with `pnpm exec playwright install chromium` (Linux hosts may need `--with-deps`). These are verification prerequisites only; ordinary Docker startup does not need a host browser or Node.js.

The test uses a unique Compose project on 127.0.0.1:18080, builds/starts the image, checks real HTTP/assets/cache/guest boundaries and SDK movement/chat, then loads the compiled frontend in an isolated Chromium browser and verifies admission through its actual matchmaking and WebSocket URLs. It stops the container with connected clients, verifies graceful exit and new identities after restart, then removes only its own container/network. Set `STRAHOV_DOCKER_TEST_PORT` to choose another free port. It never attaches to an existing application container. The automated browser uses software rendering for the connection check; visual GPU acceptance remains separate.

For this repository's agent workflow, reserve heavy-validation, build and all test ports before running full checks. The current evidence and actual limitations are in [Docker verification](../verification-evidence/docker-20261019/README.md).

Reference: [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/), [pnpm Docker](https://pnpm.io/docker), [Colyseus shutdown](https://docs.colyseus.io/server/graceful-shutdown).
