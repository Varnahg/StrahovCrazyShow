# Mapa architektury a ověřování

Základ mapy odpovídá kódovému checkpointu `7712edb57cae1ab02841ec70519a7f371240a6b4` z 20. 10. 2026. Cílené doplnění úvodu, loaderu, veřejného agregátu a AI z 28. 10. vychází z `b494fe38ab6472c6cd683c22c7a0d9f89fe664f8` nad base `752e75fd41b455db7e22453b881eb5f62bc283f0`; nejde o potvrzení publikace. Skutečné výsledky, stav přejímky a identita testované verze patří do [ověření](../verification.md). Pracovní doplnění vektorového RAG z28.10. vychází z větve `codex/rag-sources-sh-suz`, čtecího checkpointu `9ed94e861651eb32547a6d0b677b3f54c03fd8dd` a navazujících review oprav; finální build/SDK/CI a main přijetí zatím čekají.

Pravidla určuje [AGENTS.md](../../AGENTS.md), rozsah task JSON a skutečné vlastníky společný koordinační registr podle [postupu](README.md). Tento dokument není druhý registr rezervací. [current-work.md](current-work.md) zůstává historickým bootstrap inventářem z 12. 10. 2026.

## Stack a vstupy

Jde o jednu privátní ESM aplikaci: [pnpm-workspace.yaml](../../pnpm-workspace.yaml) obsahuje jen `.`. [package.json](../../package.json) vyžaduje Node `>=24 <25`, pnpm `>=11 <12` a package manager `11.25.0`. Deklarace závislostí a skutečné zamčené verze rozlišuj podle [pnpm-lock.yaml](../../pnpm-lock.yaml); položka `latest` není pevná verze.

- Babylon.js core/loaders 9.30.0 vykreslují 3D; React/React DOM tvoří rozhraní; Vite sestavuje klienta.
- Colyseus core/SDK zajišťují autoritativní místnost a browserového klienta; Rapier compat sdílí fyziku klienta/serveru. [tsconfig.json](../../tsconfig.json) společně kontroluje klienta, server, shared, skripty a testy.
- [Git LFS pravidla](../../.gitattributes) zahrnují velké modely a originální textury. Pointer není načtený asset. [LFS preflight](../../scripts/check-lfs-assets.mjs) kontroluje pracovní soubory před CI instalací; lokální build nesmí nahrazovat chybějící podklady. Zachovat původní bajty/koncovky řádků, neformátovat plošně.
- `pnpm build` Blender nespouští. Modelovací skripty potřebují vlastní Blender/Python a rezervované vstupy i výstupy; runtime používá GLB v `public/models/`. Není doložen obecný minimální GPU/RAM profil.

## Runtime řetězec

`index.html` → [client/main.tsx](../../client/main.tsx) → [client/ui.tsx](../../client/ui.tsx). UI drží režim host/multiplayer, relaci, formuláře a vlastnictví rendereru. [client/render-engine.ts](../../client/render-engine.ts) vytváří společný asynchronní engine hry i avatar preview; [client/game.ts](../../client/game.ts) přebírá připravený engine a vlastní scénu, kameru, lokální simulaci, animace a úklid.

**Automatická volba preferuje WebGPU v Babylon compatibility mode.** Od27.10 uživatel výslovně požaduje kompatibilní fallback: bezpečně uklizené odmítnutí inicializace dovolí jeden WebGL2 pokus s novou React canvas generací. Skutečný režim je označený, preference platí jen pro stránku. Explicitní `renderBackend` query zůstává striktní; `webgpu-fast` je pouze loopback experiment. Abort, chyba úklidu, assetu, shaderu nebo běžící scény automatický přechod nevyvolá; zůstává explicitní kompatibilní akce. [Render policy](../../client/render-fallback.ts), [render-health](../../client/render-health.ts), [render-startup](../../client/render-startup.ts) a [strict-material-preparation](../../client/strict-material-preparation.ts) oddělují volbu, generaci, chyby a skutečný start. Uživatel27.10 převzal praktické herní testování; agent hru nespouští a nevydává offline kontroly za GPU/FPS důkaz.

[client/world-renderer.ts](../../client/world-renderer.ts) skládá kanonické továrny světa. `shared/` drží společné prostorové/datové kontrakty, fyziku a manifesty; není obecným odkladištěm pomocníků. Změna rozměru nebo polohy se posuzuje současně pro obraz, kolize, navigaci a generované exporty. Souřadnice jsou metry, +X východ, +Z jih; kamera Babylon je pravotočivá. Historický sloučený IPR scan je referenční vrstva, ne druhá herní scéna.

[server/index.ts](../../server/index.ts) vytvoří právě jednu `StrahovRoom`; matchmaking zveřejňuje `joinById`. Dočasné relace a komunitní stav žijí v paměti. Host multiplayerovou relaci nedostane. Výslovně schválenou veřejnou výjimkou je `GET /api/presence`: [public-presence](../../server/public-presence.ts) vrací pouze agregát `{ online }` podle připojených hráčských relací, bez identit, pozic a zpráv; AI ani NPC se nezapočítávají. Odpověď se necachuje a nedostupnost se nesmí vydávat za nulu. `/api/health` nadále vrací stav připravenosti bez populace a `/api/weather` adaptované počasí.

[shared/netcode.ts](../../shared/netcode.ts) deklaruje **protokol 11** a **60 Hz**. [shared/input-timeline.ts](../../shared/input-timeline.ts), [client/network-timeline.ts](../../client/network-timeline.ts) a serverové fronty používají plánované tick/epoch vstupy; legacy `InputQueue` v netcode slouží regresním srovnáním. Server posílá motion/authority 20 Hz; [motion-codec](../../shared/motion-codec.ts) přenáší komprimovaný pohyb. [shared/simulation.ts](../../shared/simulation.ts) je společná fyzika autority i predikce. Změna fyziky může vyžadovat společné nasazení/protokol i bez změny tvaru paketu.

## Úvod, načítání a soukromý AI kanál

[WelcomeScreen](../../client/welcome-screen.tsx) drží přístupný CZ/EN úvod, veřejný počet a explicitní otevření editoru. Výchozí úvod nemountuje editor ani herní canvas; editor se připojí až po explicitním otevření. Import editoru zůstává statický. [LoadingScreen](../../client/loading-screen.tsx) a [startup-progress](../../client/startup-progress.ts) zobrazují skutečné milníky pro konkrétní generaci canvasu; cancel-safe double-rAF před synchronní konstrukcí dovoluje vykreslit stav. Nemění se Game readiness ani bezpečný renderer fallback a helper sám není důkazem rychlejšího startu.

[client/crazy-typka.tsx](../../client/crazy-typka.tsx) spravuje jeden AI store v App pro úvod i samostatný AI pohled herního chatu. Crazy Typka je označená AI; konverzace se neposílá ostatním hráčům ani do lidského kanálu. Lidské DM/event vstupy používají společný `openHumanChat`. Reset a expirace ukončují relaci; nejisté doručení dovoluje explicitně obnovit stejnou operaci bez automatické smyčky placených pokusů.

[shared/crazy-typka.ts](../../shared/crazy-typka.ts) definuje kontrakt. [Serverová služba](../../server/crazy-typka.ts) odděluje dočasné AI relace, limity, monotónní `requestSeq`, reset, timeout a shutdown od multiplayeru. Pamatuje jen poslední terminální výsledek pro přesný replay; jiné znění stejného pořadí je konflikt a staré či přeskočené pořadí se odmítne. Místní první čistý pozdrav má přesnou podmínku a neobchází vypnutou službu. [Provider](../../server/crazy-typka-provider.ts) vlastní OpenAI volání a moderaci, serverový klíč se nepřenáší klientovi. Strop generování platí pro běh procesu, není trvalým finančním limitem.

V pracovní větvi KEY-65 nahrazuje původní textový retrieval [asynchronní evidence backend](../../server/rag-evidence-backend.ts): OpenAI query embedding → [pgvector úložiště](../../server/rag-vector-store.ts) → ověřené podklady pro generátor. Výchozí profil je `text-embedding-3-large` s 3072 rozměry, nejvýše čtyři podklady a cosine distance do 0,60 podle [malé skutečné evaluace](../home-ai/20261028/research/vector-evaluation.md). PostgreSQL 17 / pgvector 0.8.7 používá parametrizované přesné cosine SQL; nejde o ANN index ani doloženou výkonovou optimalizaci. Profil generativního modelu je nezávislý na profilu embeddingů.

[Embedding adaptér](../../server/rag-embeddings.ts), [import](../../server/rag-ingest.ts), [administrativní CLI](../../scripts/rag-import.ts) a [SQL schéma](../../server/rag-schema.sql) oddělují přípravu dokumentů od runtime. Trvalá cache se klíčuje profilem a hashem přesného vstupu tvořeného názvem dokumentu, lokátorem a textem. Změna kontrolních metadat nevyvolává nové embeddingy, změna těchto vstupních polí ano. Import průběžně ukládá dokončené dávky a kompletní revizi s veřejným headem publikuje atomicky; nejasné předchozí pokusy vyžadují explicitní opakování. Kurátorované JSON soubory jsou importní vstup. Běžící služba používá aktivní SQL revizi bez JSON/BM25 fallbacku; archivní metadata se neembedují ani nevracejí jako aktuální evidence.

Backend skládá dotaz jen z aktuální zprávy a omezeného bezpečného USER kontextu. Po moderaci ověří DB revizi a shodu profilu před query embeddingem; readiness sama nepotvrzuje čerstvost všech zdrojů. SQL filtruje veřejnost, aktuálnost, profil a časovou platnost, výsledky procházejí znovu [zdrojovými guardy](../../server/crazy-typka-retrieval.ts). Chat sémanticky hledá v celém takto platném veřejném corpusu bez NLP odvozování filtrů instituce nebo tématu. SQL API podporu explicitních authority/topics filtrů zachovává pro své samostatné použití a testy. Snapshot a všechny vybrané zdrojové závislosti se používají k ověření publikace i replay; přesný replay znovu nemoderuje, neembeduje a negeneruje. Query embeddingy se do DB neukládají. Reset a shutdown zachovávají vlastní abort/cleanup hranice, oddělené procesní limity embeddingů a generací nejsou trvalou finanční kvótou. Aktuální stav review hran a dosud čekající společné přijetí uvádí [ověření](../verification.md). Runtime crawler ani načítání uživatelských URL nevzniká.

AI namespace má vlastní HTTP dispatcher před CORS wrapperem pinovaného Colyseus; přesné povolené origins určuje `CRAZY_TYPKA_ALLOWED_ORIGINS`. Ostatní HTTP requesty a WebSocket upgrade zachovávají původní handler. Chybějící či vadná AI konfigurace vypne pouze volitelnou AI službu. [compose.ai.yaml](../../compose.ai.yaml) obsahuje volitelný AI override, [compose.rag.yaml](../../compose.rag.yaml) přidává pgvector a explicitní administrativní import. Zapnutá vektorová služba vyžaduje `RAG_DATABASE_URL`, odpovídající profil a publikovanou DB revizi; tajné hodnoty dodává provozovatel. Izolovaná integrace odstraňuje zděděná `OPENAI_`, `CRAZY_TYPKA_`, `RAG_`, `LINEAR_` a `FEEDBACK_` nastavení, takže nepoužije skutečný provider ani neodešle reálné hlášení.

## Mapa oblastí

Hranice v tabulce pomáhají připravit přesný task; nedávají právo zapisovat do celého řádku. Integrační soubory a generované vstupy/výstupy rezervuj výslovně.

| Oblast | Hlavní zdroje a vazby | Vhodné ověření |
| --- | --- | --- |
| Relace a komunita | `server/index.ts`, `server/community.ts`, `server/session-lifecycle.ts`; `client/room-callbacks.ts` a UI | Netcode, motion codec, lifecycle/callback testy; skutečné SDK/HTTP scénáře `scripts/integration*.ts` |
| Pohyb, kamera, vozidlo | `shared/simulation.ts`, `shared/physics-step.ts`, `shared/controls.ts`, `shared/vehicle.ts`, `shared/quaternion.ts` (čistá matematika); Game, local-avatar-presentation, labels | Quaternion, fyzika/predikce/recovery/controls a skutečná projekce A/D, jízda, schody, vstupy, kamera |
| Budovy, terén a cesty | `shared/world.ts`, `shared/b6-*.ts`, `shared/terrain-entities.ts`, data/manifesty; světové továrny a world-renderer | Geometrie, B6, střechy, povrchy a navigace; porovnání předlohy a herní průchod |
| Avataři a modely aut | `client/avatar-skinned.ts`, `avatar-garments.ts`, `avatar-hair.ts`, `avatar-eyes.ts`, editor/preview, modelové loadery | Numerické/asset regrese a společná vizuální přejímka editoru, hry, LOD a úklidu |
| Obloha, počasí a vegetace | `shared/astronomy.ts`, `shared/weather.ts`, `server/weather.ts`; sky-weather, art-lighting, weather-particles, tráva/stromy | UTC/směr větru/freshness a geometrie; GPU kontrola den/noc/počasí |
| UI, mapa a obsah | `client/ui.tsx`, `client/i18n*.ts`, minimapa/mapa/deník; shared události, profil a transit | Oprávnění, CZ/EN, formuláře, vstupní zkratky a mapa ve skutečném klientu |
| Výkon a lokální diagnostika | `client/render-cost.ts`, `benchmark-render-profile.ts`, `gpu-diagnostics.ts`; `server/local-benchmarks.ts`, `shared/local-benchmark.ts` | Whitelist/serializace/health a plná produkční hra; [metodika](../performance/README.md) |

Přesné existující testy vyber z `tests/` podle změněného kontraktu. Úspěch NullEngine/CPU regrese není důkaz GPU/FPS nebo kompletní vizuální věrnosti.

## Skripty, autodev, Docker a CI

- `scripts/` obsahuje získávání dat, reprodukční modelování/exporty, audity, integrační a výkonové harnessy. Generované katalogy často ukládají hash přesného seznamu zdrojů; změna helperu může vyžadovat i rezervaci generátoru a jeho výstupu.
- [scripts/autodev.mjs](../../scripts/autodev.mjs) nabízí `run` / `status` / `resume` pro jedno explicitní zadání. `scripts/autodev/engine.mjs` drží postup, `store.mjs` stav/manifesty, `process.mjs` a `supervisor.mjs` lifecycle, `source.mjs` kontrolu zdrojů/scope a `adapters.mjs` kontrolní/integrační kroky se zachovanými veřejnými reexporty; `codex.mjs`, `github.mjs`, `linear.mjs` externí rozhraní. Provozní stav je v Git common directory, ne ve verzované dokumentaci. [Návod řadiče](bmad-controller.md) a [BMAD policy](bmad-policy.md) určují hranice; řadič nevybírá neobjednaný backlog.
- [server/runtime.ts](../../server/runtime.ts) čte `HOST` (default `127.0.0.1`), `PORT` (2567) a volitelný absolutní `STATIC_DIR`. Bez `STATIC_DIR` server neobsluhuje klientský build. Statické soubory se revalidují, protože veřejné modely mají stabilní názvy; readiness přejde do ready až po vytvoření světa a při shutdown do stopping.
- [Dockerfile](../../Dockerfile) sestaví klienta s `VITE_MULTIPLAYER_URL=/`, provede runtime asset preflight a spouští neprivilegovaný Node proces s `HOST=0.0.0.0` a `STATIC_DIR=/app/dist`. [compose.yaml](../../compose.yaml) mapuje výchozí `127.0.0.1:8080` na 2567. Jedna replika = jeden dočasný svět. [Deployment návod](../deployment/docker.md).
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) má LFS checkout/preflight, Node 24, pnpm 11.25.0, frozen install, katalog, README linky, plnou sadu, build a izolovanou integraci. [source-secrets.yml](../../.github/workflows/source-secrets.yml) samostatně testuje a spouští source secret scanner. CI není automaticky praktická GPU přejímka. [Podmínky integrace](ci.md).

## Příkazy a lifecycle

| Příkaz / zdroj | Význam |
| --- | --- |
| `pnpm dev` | Vite + server s HMR; `pnpm dev:client` / `pnpm dev:server` lze spustit zvlášť. |
| [vite.config.ts](../../vite.config.ts) | Klient běžně 5173, API/WS proxy pevně na 2567. Samotná změna `PORT` proxy nezmění. Vite může vybrat jiný klientský port; ověř skutečný výstup. |
| `pnpm start` | Server bez watcheru; statický klient jen s explicitním `STATIC_DIR`. |
| `pnpm test` | Celá aktuální sada `tsx --test tests/*.test.ts`; počet nepřebírat z historie. Cíleně např. `pnpm exec tsx --test tests/controls.test.ts`. |
| `pnpm build` | TypeScript a klientský `dist/`, bez spuštění serveru nebo Blenderu. |
| `pnpm test:integration` | [Vlastní server a cleanup](../../scripts/test-integration.mjs) na pevném 2568; podmnožina není celý integrační běh. |
| `pnpm test:docker` | [Izolovaný Docker harness](../../scripts/test-docker.mjs); nejde o součást každého běžného buildu. |
| `pnpm check:readme` | [Kontrola obou kořenových README](../../scripts/check-readme-links.mjs); nevaliduje všechny dokumenty. |
| [performance-snapshot](../../scripts/performance-snapshot.mjs) | Hashuje/kopíruje runtime, assety, testy a explicitní dokumentační fixtures. Nová fixture mimo seznam vyžaduje vědomou úpravu snapshotu. |
| [performance-preview](../../scripts/performance-preview.mjs) | Výchozí 4175/API 2570, explicitně přenastavitelné; strict port, nepouští vlastní API server. Čísla nejsou důkazem běžícího preview. |

Full suite, build, integrace a zátěž používají `heavy-validation`; build `workspace-build`, GPU práce `gpu`, síťový proces `port:<číslo>`. Před startem ověř registr i skutečné procesy; cizí PID/port neopravňuje k ukončení. Hraný snapshot zůstává neměnný. Vite ignoruje změny dokumentace, cache, autorovacích zdrojů a exportovaných modelů, proto po změně assetu nelze předpokládat HMR načtení.

## Důkazy a otevřené přijetí

[Ověření](../verification.md) soustřeďuje současné výsledky a odděluje je od původních datovaných záznamů. Refaktoring KEY-48 má [závěrečný záznam](../refactoring/20261020/final-validation.json) s identitou zdrojů, testy a praktickou přejímkou. D2, protokol 9, P5 a preview 4179 patří historii; mapu kódu nelze použít jako důkaz právě běžícího buildu nebo GPU výkonu.

Jeden společný svět, izolace hosta, dočasné relace, jasně simulované aktivity/NPC, zachovaná provenience a společná fyzika zůstávají závazné. Úplná fotografická věrnost, všechny povolené interiéry a denní/davová GeForce 60 FPS přejímka zůstávají otevřené podle [přejímky](../acceptance.md). Kapacita jednoho procesu a síťový objem všech vůči všem jsou konečné.
