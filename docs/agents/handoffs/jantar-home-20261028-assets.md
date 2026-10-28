# Předání: jantar-home-20261028-assets

- Vlastník: `jantar-assets-01a17fd8` (`/root/map_assets`); příjemce: koordinátor `jantar-root-01a17fd8` (`/root`). Linear KEY-66.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`; větev `codex/jantar-home`; baseline `e09d60fa24419a93b26f15e21c862e95e44aff2f` nad přijatým main `de6f87a2efbf8596bb03efae863e8d6763e22774`.
- Výsledek: implementace, cílený refaktoring a lehké ověření připravené k převzetí. Nejde o přijetí celé stránky nebo integraci do main.
- Změněné soubory: `client/welcome-map.tsx`, `client/welcome-map-geometry.ts`, `tests/welcome-map.test.ts`, `public/fonts/manrope/Manrope-Variable.ttf`, `public/fonts/manrope/OFL.txt`, `public/fonts/manrope/FONTLOG.txt`, `public/ui/crazy-typka.svg`, `docs/home-design/20261028/assets.md` a toto předání. Ignorovaná evidence: `.cache/jantar-home-20261028-assets/test.log`, `artifact-manifest.json`.
- Cizí WIP: při aktivaci existovaly rodičovské podklady `_bmad-output/implementation-artifacts/jantar-home-20261028/`, `docs/home-design/` a setup handoff. Při předání přibývá souběžný UI/chat/task WIP ostatních vlastníků; žádný jeho soubor nebyl upraven ani stagován. Neproběhl commit.

## Kontrakt a podklady

`WelcomeMap()` má pojmenovaný i výchozí export, žádné props. Sedm statických SVG pathů: čtyři materiály cest, stadion, běžné budovy a koleje. Třídy `home-map-art`, `home-map-roads roads`, `home-map-stadium stadium`, `home-map-buildings buildings` a `home-map-buildings buildings home-map-dormitories dormitories`. Obě varianty tříd byly výslovně domluveny s rodičem během implementace.

Geometrie vychází pouze z `shared/data/map.json`, `streets.json` a `building-catalog.json`. Všech 143 budov a 227 prstenců cest plus oba prstence stadionu dostávají jedinou rigidní transformaci `+1.690770010257384°` podle nejdelší hrany B6. Všechny vrcholy se zachovávají, serializace má chybu pod 1 mm. Díry zůstávají pomocí `evenodd`. Normalizace směru oběhu budov zachovává výplň při sloučení subpathů a nemutuje zdroj. Žádné source JSON nebylo změněno.

Mapa nemá popisky, značky, fokus ani ovládání. SVG je `aria-hidden`, `focusable=false`, `pointer-events=none`, `viewBox="-610 -310 980 610"`, `preserveAspectRatio="xMidYMid slice"`; ořez podle poměru viewportu nezkreslí půdorysy. Rodič vlastní rozměry, barvy, blur a reduced-motion. Rodič také ponechává původ dat v O projektu.

Oficiální lokální Manrope je původní TTF 164700 B, váhy 200–800, latin/latin-ext; licence OFL 1.1 a FONTLOG jsou přiložené v původních bajtech. Runtime URL `/fonts/manrope/Manrope-Variable.ttf`, bez Google CDN. Portrét `/ui/crazy-typka.svg` je původní fiktivní vektor s projektovými barvami, žádná fotografie nebo screenshot avataru. Původ, data, přesné URL a SHA všech vstupů dokumentuje `docs/home-design/20261028/assets.md`.

## Refaktoring a lifecycle

Jedna čistá funkce rotace a jedna serializace obsluhují všechny vrstvy; trigonometrii, finální cesty a React strom vytváří modul jen jednou. Komponenta neudržuje stav, listener, timer, síťovou cache, canvas ani engine. Čtyři cestní pathy zůstávají samostatné kvůli překrytí materiálů; jejich sloučení pod jediný `evenodd` by změnilo výplň. Výkonové zlepšení nebylo měřeno a netvrdí se.

## Ověření

Vše dne 28. 10. 2026 v uvedené pracovní kopii, pouze lehké CPU kontroly:

- `node --import tsx --test tests/welcome-map.test.ts` — exit 0, 6/6 prošlo. Log `.cache/jantar-home-20261028-assets/test.log`; poslední měřený běh 357,5761 ms. B6 vertikála, plochy/vzdálenosti, každý vrchol, uzavření a díry, nemutace, statický neinteraktivní SSR strom, font a licence.
- `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --types node,vite/client client/welcome-map.tsx client/welcome-map-geometry.ts tests/welcome-map.test.ts` — exit 0, bez diagnostiky. Jde o cílený check těchto tří souborů, ne celý projekt.
- `node node_modules/prettier/bin/prettier.cjs --check client/welcome-map.tsx client/welcome-map-geometry.ts tests/welcome-map.test.ts` — exit 0.
- `git diff --check` — exit 0. Zdrojové JSON a package/lockfile beze změny; TTF nemá LFS filter.

Nebyl spuštěn build, full suite, integrace, server, GPU scéna ani Blender. Finální kontrast, mobilní ořez, font/portrét v browseru a reduced-motion musí ověřit rodič pod příslušnými validation claims. Jednotkové testy nenahrazují praktickou přejímku celé hry.

## Identita předaného payloadu

Manifest `.cache/jantar-home-20261028-assets/artifact-manifest.json` zahrnuje osm implementačních/podkladových souborů včetně testu (bez tohoto předání, aby nevznikla kruhová identita). SHA-256 manifestu: `dc14c9a9b304acefecbbc676d41477e3aa8d895799fb76a4e159d98573fe5dff`.

| Soubor | SHA-256 |
| --- | --- |
| `client/welcome-map.tsx` | `3bb92c50f6ef64ecfd713834cfbcaaffe90e2d1ba866805b99c58f13f969f838` |
| `client/welcome-map-geometry.ts` | `b4389702645ca2b3eb61249ca091a17cfff78805b2bd64175bc5b0fdf83d40f2` |
| `tests/welcome-map.test.ts` | `fa9a48bb47ea6ed362c1ca44c5330225ac214da5deea8cf92b6f0afe40188f7f` |
| `public/fonts/manrope/Manrope-Variable.ttf` | `3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6` |
| `public/fonts/manrope/OFL.txt` | `58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b` |
| `public/fonts/manrope/FONTLOG.txt` | `b6b54bcc1dbd1b18d5afd087ec0b578097644b1c9ec3e0a642d4df7808f449c2` |
| `public/ui/crazy-typka.svg` | `9d76a5f5ef5dc496720a7bfc933faa6a416013373f01cb6754745474181f5f72` |
| `docs/home-design/20261028/assets.md` | `98b62259a70da8b6c7158f264d076808b49d5a3404b57491ff52e294d5fcd320` |

## Procesy, rozsah a převzetí

První pokus přes `pnpm exec prettier ...; pnpm exec tsx ...` překvapivě spustil obnovu 152 závislostí. Na pokyn rodiče byl ukončen pouze vlastní exec session 33345 přes Ctrl+C (exit 1); následná CIM kontrola už neukázala žádný jeho pnpm/node proces. PID nebyl před ukončením zachycen. Package/lockfile zůstaly čisté. Koordinátor byl ihned informován, znovu rezervoval setup a přebral kontrolu `node_modules`. Další příkazy používají přímo lokální `node`; žádný další install nebyl spuštěn.

Žádné vlastní dlouhotrvající pomocné procesy nezůstávají. Porty ani GPU/heavy resources nebyly použity. Claim `jantar-home-20261028-assets` se uvolňuje bezprostředně po zapsání tohoto předání; úspěch release je předán koordinátorovi závěrečnou zprávou. Uvolnění není označení tasku Done. Koordinátor převezme konkrétní soubory, doplní integraci/centrální ověření a stav tasku.
