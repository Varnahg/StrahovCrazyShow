# Předání: feedback-deployment-regressions-20261020

- Vlastník: `feedback-deploy-01a15a3e-server`; příjemce: root koordinátor KEY-52.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/player-feedback-20261020`, baseline `7b6d02d69cff3de7e8f99041a9a0299dceda46f6`.
- Výsledek: upraveny disjunktní integrační/Docker harnessy a doplněn skutečný HTTP feedback scénář do běžné izolované integrace. Lokálně pouze lehké testy a syntax check; skutečnou integraci, Docker a úplnou verifikaci spouští koordinátor pod vlastní rezervací.
- Změněné soubory: `scripts/test-docker.mjs`, `scripts/test-integration.mjs`, `scripts/integration-feedback.ts`, `tests/feedback-deployment.test.ts`, toto předání. Bez stagingu a commitů podagenta.
- Cizí WIP: na vstupu root-owned Dockerfile, specifikace, klient/UI testy, tasky a evidence. Nic z toho nebylo převzato ani měněno. Root během práce doplnil Dockerfile/Compose ENV podle svého zadání; test je pouze čte.
- Rezervace získána před prvním zápisem; žádné `--adopt-dirty`, protože přidělené soubory nebyly rozpracované.

## Průzkum, varianty a volba

Přečteny živé `git status`, worktree/registry, nový task, stávající Docker/integration harness, integrační scénáře, server/index registrace feedbacku, shared kontrakt, spool formát a aktuální Dockerfile/Compose. Doložený problém byl tvrdý `inspect.Mounts.length === 0` po přidání nutného persistentního volume a izolovaný integrační server dědící produkční FEEDBACK_DIR/Linear konfiguraci. Běžná integrační sada navíc vůbec neověřovala skutečnou registraci feedback route.

Primární Docker podklady znovu načteny 20. 10. 2026: [Compose volumes](https://docs.docker.com/reference/compose-file/volumes/) (project-scoped názvy a ownership labels; `name` může scoping obejít), [compose down](https://docs.docker.com/reference/cli/docker/compose/down/) (výchozí down volume nemaže, `--volumes` má širší rozsah).

U Docker cleanup porovnány možnosti ponechat testovací volume, použít `down --volumes`, nebo smazat přesně jeden doložený prostředek. Zvoleno poslední: po úspěšném down lze odstranit pouze `<unique-test-project>_feedback-data`, s ověřenými Compose labels, lokálním driverem a bez driver options umožňujících host bind. Globální prune ani produkční data se nepoužívají. U integrace zvoleno mkdtemp v OS tmp místo společného `.cache/feedback`; odmítnuta závislost na skutečném Linear credentialu. Existující NODE_OPTIONS a ostatní potřebné runtime prostředí se zachovávají.

## Změny

- Docker inspect nyní vyžaduje přesně jeden zapisovatelný `Type=volume` s přesným projektovým názvem a cílem `/data/feedback`. Host binds, jiné názvy/cíle a další mounty selžou.
- Docker test překryje známé Linear credential/target/status proměnné i origin prázdnými hodnotami, aby se nechtěná konfigurace nepropašovala z prostředí/Compose `.env`.
- Po `compose down` se kontroluje existence pouze přesného jedinečného testovacího volume. Před `volume rm <exact-name>` se ověří jméno, `com.docker.compose.project`, `com.docker.compose.volume`, driver a options. Pokud build/up volume vůbec nevytvořil, nic se nemaže.
- Izolovaná integrace vytvoří vlastní `strahov-integration-feedback-*` tmp adresář a pro server i integrační děti odfiltruje všechny case-insensitive `LINEAR_*`/`FEEDBACK_*` hodnoty. Nastaví vlastní FEEDBACK_DIR, loopback host, port 2568 a testovací URL. NODE_OPTIONS se zachová.
- Spool se odstraní až po skutečném ukončení vlastního serveru a po kontrole absolutní cesty přímo pod tmp kořenem s vlastním prefixem. Nečte ani nemaže produkční spool.
- Default integrační sada spustí nový `integration-feedback.ts`: skutečný multipart POST přes `server/index.ts`, guest bez room; kontrola 202/no-store/minimální matching receipt a přesného persisted reportu; stejný retry vrací stejný receipt a jediný report; jiný obsah stejného ID vrací 409; whitespace-only clientBuildId vrací 400 bez publikace dalšího reportu. Delivery skončí v pending-config, protože nejsou předány credentialy. Script nikdy nepotřebuje Linear a vyžaduje prázdný vlastní spool.
- Malý refaktor CLI entry pointů do guarded main umožňuje importovat a testovat čisté bezpečnostní kontrakty bez spuštění Dockeru/serveru. Logika ostatních scénářů se nemění; větší část textového diffu je odsazení existujícího main těla.

## Ověření a identita

20. 10. 2026 přibližně 21:24 UTC:

- `node --check scripts/test-integration.mjs`: exit 0.
- `node --check scripts/test-docker.mjs`: exit 0.
- `pnpm exec tsx --test tests/feedback-deployment.test.ts`: exit 0, **7/7 pass**. Testy pokrývají odfiltrování zděděné konfigurace a zachování NODE_OPTIONS, cleanup path guard, přesný named-volume kontrakt, odmítnutí cizího/bind-backed volume, shodu Dockerfile/Compose ENV včetně OAuth/status, běh HTTP scénáře proti řízenému fake transportu a detekci chybného persisted obsahu.

Skutečný integrační server, Docker, build, úplná sada a GPU nebyly spuštěny. Mock transport dokládá funkční assertions scénáře; skutečný POST přes server/index musí ověřit root běžnou integrační sadou. Žádné aktuální credentialy nebyly čteny.

| Soubor | SHA-256 |
|---|---|
| scripts/test-docker.mjs | D90A4E01971E83167F29FBFFB739D00995F4628EEE77F8F4642CCA2F97537A31 |
| scripts/test-integration.mjs | 795E5FC3C4880CF284E5AE36821417149F0DEB39478A819CB5850323589B5444 |
| scripts/integration-feedback.ts | DF75888EB3713D0D1F0EC17743769295EDD29BA4DA8698D2951245B43BBCEC9C |
| tests/feedback-deployment.test.ts | 06B0F78B79D3F08DED9D62831151C951C3AD4259D3CE23DB3C2266E7387402DC |

- Procesy/zdroje: pouze ukončené lehké CPU testy/formatter/syntax check. Žádný port, server, Docker, GPU ani pomocný proces nezůstává. Vlastní testovací tmp adresáře odstraněny v finally.
- Omezení/další krok: root spustí typovou kontrolu a běžnou izolovanou integraci; Docker lifecycle dle dostupnosti svého vyhrazeného Docker engine/portu. Subset přepínače zachovávají svůj původní výběr; nový feedback scénář patří výchozí celé integrační sadě.
- Rezervace: uvolněna při předání 20. 10. 2026 21:25 UTC; release není integrace ani stav Done.
- Integrátor: root; přijetí, commit, skutečné výsledky integrace/Docker a Linear/docs/verification doplní až podle vlastní evidence.
