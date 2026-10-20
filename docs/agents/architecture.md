# Mapa architektury a ověřování

Mapa odpovídá kódovému checkpointu `7712edb57cae1ab02841ec70519a7f371240a6b4` z 20. 10. 2026. Popisuje odpovědnosti a vazby jeho souborů. Skutečné výsledky, stav přejímky a identita testované verze patří do [ověření](../verification.md).

Pravidla určuje [AGENTS.md](../../AGENTS.md), rozsah task JSON a skutečné vlastníky společný koordinační registr podle [postupu](README.md). Tento dokument není druhý registr rezervací. [current-work.md](current-work.md) zůstává historickým bootstrap inventářem z 12. 10. 2026.

## Stack a vstupy

Jde o jednu privátní ESM aplikaci: [pnpm-workspace.yaml](../../pnpm-workspace.yaml) obsahuje jen `.`. [package.json](../../package.json) vyžaduje Node `>=24 <25`, pnpm `>=11 <12` a package manager `11.25.0`. Deklarace závislostí a skutečné zamčené verze rozlišuj podle [pnpm-lock.yaml](../../pnpm-lock.yaml); položka `latest` není pevná verze.

- Babylon.js core/loaders 9.30.0 vykreslují 3D; React/React DOM tvoří rozhraní; Vite sestavuje klienta.
- Colyseus core/SDK zajišťují autoritativní místnost a browserového klienta; Rapier compat sdílí fyziku klienta/serveru. [tsconfig.json](../../tsconfig.json) společně kontroluje klienta, server, shared, skripty a testy.
- [Git LFS pravidla](../../.gitattributes) zahrnují velké modely a originální textury. Pointer není načtený asset. [LFS preflight](../../scripts/check-lfs-assets.mjs) kontroluje pracovní soubory před CI instalací; lokální build nesmí nahrazovat chybějící podklady. Zachovat původní bajty/koncovky řádků, neformátovat plošně.
- `pnpm build` Blender nespouští. Modelovací skripty potřebují vlastní Blender/Python a rezervované vstupy i výstupy; runtime používá GLB v `public/models/`. Není doložen obecný minimální GPU/RAM profil.

## Runtime řetězec

`index.html` → [client/main.tsx](../../client/main.tsx) → [client/ui.tsx](../../client/ui.tsx). UI drží režim host/multiplayer, relaci, formuláře a vlastnictví rendereru. [client/render-engine.ts](../../client/render-engine.ts) vytváří společný asynchronní engine hry i avatar preview; [client/game.ts](../../client/game.ts) přebírá připravený engine a vlastní scénu, kameru, lokální simulaci, animace a úklid.

**WebGL2 je default.** `renderBackend=webgpu` / `webgpu-fast` jsou explicitní QA volby pouze na loopbacku. Engine při nedostupném požadovaném backendu chybu nezamění za tichý fallback. [render-health](../../client/render-health.ts), [render-startup](../../client/render-startup.ts) a [strict-material-preparation](../../client/strict-material-preparation.ts) sledují generaci rendereru, chyby, nedokončenou přípravu a skutečný start snímků. Podrobnosti a praktická přejímka: [WebGPU workflow](../performance/webgpu-migration.md).

[client/world-renderer.ts](../../client/world-renderer.ts) skládá kanonické továrny světa. `shared/` drží společné prostorové/datové kontrakty, fyziku a manifesty; není obecným odkladištěm pomocníků. Změna rozměru nebo polohy se posuzuje současně pro obraz, kolize, navigaci a generované exporty. Souřadnice jsou metry, +X východ, +Z jih; kamera Babylon je pravotočivá. Historický sloučený IPR scan je referenční vrstva, ne druhá herní scéna.

[server/index.ts](../../server/index.ts) vytvoří právě jednu `StrahovRoom`; matchmaking zveřejňuje `joinById`. Dočasné relace a komunitní stav žijí v paměti. Host multiplayerovou relaci nedostane; veřejné HTTP nevydává multiplayerovou přítomnost. `/api/health` vrací stav připravenosti bez populace a `/api/weather` adaptované počasí.

[shared/netcode.ts](../../shared/netcode.ts) deklaruje **protokol 11** a **60 Hz**. [shared/input-timeline.ts](../../shared/input-timeline.ts), [client/network-timeline.ts](../../client/network-timeline.ts) a serverové fronty používají plánované tick/epoch vstupy; legacy `InputQueue` v netcode slouží regresním srovnáním. Server posílá motion/authority 20 Hz; [motion-codec](../../shared/motion-codec.ts) přenáší komprimovaný pohyb. [shared/simulation.ts](../../shared/simulation.ts) je společná fyzika autority i predikce. Změna fyziky může vyžadovat společné nasazení/protokol i bez změny tvaru paketu.

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
