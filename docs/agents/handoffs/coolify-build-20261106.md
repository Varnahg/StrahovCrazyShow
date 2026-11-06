---
title: 'Oprava Docker buildu pro Coolify (KEY-74)'
type: 'bugfix'
created: '2026-11-06'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: ['{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval>

## Záměr

Coolify nedokončí produkční image, protože Node vyčerpá haldu během kontroly TypeScriptu. Oprava má umožnit dokončení stejné kontroly a produkčního bundlu s rozpočtem omezeným na build stage.

</frozen-after-approval>

## Implementační poznámky a předání

Koordinátor `coolify-20261106-root`, kanonický checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, základ `6614cb9b1c2222772a5ad3c4750245ea2eedf779`. Tři původní nesledované soubory z konsolidace jsou mimo rozsah.

## Plán ověření

1. **Problém.** Coolify po stažení `6614cb9b` z `vojtech-stehlik/StrahovCrazyShow:main` úspěšně ověřilo 8 064 runtime assetů, ale nevytvořilo nový image. Chat #42 je v této revizi, grafický draft #41 v ní chybí. Starší #40 je předkem.
2. **Mechanismus.** V kroku `tsc --noEmit && vite build` vyčerpal V8 kolem 2 GiB haldy a proces skončil 134 před prvním výstupem Vite (přiložený log, ř. 651–674 a 965). Týž commit prošel GitHub CI i lokálním Docker buildem s jiným prostředím. Skutečný limit RAM/cgroup produkčního builderu v logu chybí. Velké importované JSONy jsou jedním pravděpodobným zdrojem nákladů typechecku. Nový RAG seed se čte za běhu a není takovým importem.
3. **Jediná změna.** Nastavit `NODE_OPTIONS=--max-old-space-size=3072` těsně před závěrečným příkazem samostatného Docker build stage. Zachovat pnpm frozen install a jeho cache, preflight, plný typecheck, produkční Vite i jeho same-origin konfiguraci. BuildKit zneplatní tento krok a odvozené kopie. Runtime stage nepřebírá proměnnou.
4. **Hlavní metrika.** Exit code Docker sestavení na stejných vstupech s přibližně původní a navýšenou haldou. Zaznamenat dokončení obou fází a čas. Nejde o měření startu hry ani FPS.
5. **Podmínky správnosti.** Linux Node 24, stejný checkout, bez změny assetů a herního kódu. Smoke v novém dočasném kontejneru bez publikace portu či zásahu do služby na 8080. Kontrolovat HTTP health, frontendový bundle, běh jako neprivilegovaný uživatel a nepřítomnost build limitu v runtime.
6. **Přijetí.** Lokální kandidát dokončí plný Docker build a smoke. Produkční přejímka vyžaduje úspěšnou Coolify revizi s opravou a běžící nový image. Samotné HTTP 200 na veřejném serveru neurčuje revizi.

## Varianty

- Malá změna u konkrétního Docker příkazu řeší doložený limit a zachovává existující kontroly, bundling, vzhled, cache závislostí i runtime lifecycle. 3 GiB je první ověřovaná rezerva proti ~2 GiB. Celková potřebná paměť je vyšší než samotný V8 old space.
- Přidat konfigurovatelný build argument dává smysl pro doložené odlišné kapacity více builderů. Zatím by přidal rozhraní a potřebu konfigurace bez potvrzeného požadavku. Nastavení na úrovni Coolify má smysl jako provozní varianta, vyžaduje jeho správce a přesunulo by opravu mimo verzovaný build.
- Vyřadit kontroly, zmenšit scope `tsc` nebo přesunout sestavení do CI s registry by měnilo záruky nebo architekturu nasazení. Dělení TS projektu či typování velkých dat má širší riziko pro datové kontrakty a vyžaduje vlastní profil. Při prokázaném nedostatku fyzické paměti bude potřeba víc RAM nebo vhodný build server.

Použité primární podklady jsou [Node 24 CLI](https://github.com/nodejs/node/blob/v24.x/doc/api/cli.md#--max-old-space-sizesize-in-mib), [Docker build variables](https://docs.docker.com/build/building/variables/), [Coolify Dockerfile](https://coolify.io/docs/applications/builds/dockerfile) a [CI forku na 6614cb9b](https://github.com/vojtech-stehlik/StrahovCrazyShow/actions/runs/42253717334).

## Ověření a převzetí

- Lokální Docker použil stejný základ `node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9` jako Coolify. S 2048 MiB se při typechecku reprodukoval V8 OOM a exit 134. S 3072 MiB začalo Vite po 47,60 s, zpracovalo 1 674 modulů a celý build krok skončil po 88,3 s. Výsledný Docker build má exit 0 a image `sha256:66ca7fb5fde5b7b590afaa0d388493f30c5d4df164d9ce0f7cf3ed42248dbb29`.
- Vlastní kontejner bez externí sítě, publikovaného portu, RAG a produkčních credentials vrátil HTTP 200 pro health, úvodní stránku i `/assets/index-MjYQhBc8.js` (6 038 799 bajtů). Běžel pod UID 1000 bez `NODE_OPTIONS`. Všech 13 vrstev jeho runtime se shodovalo s předchozím místním image pro `6614cb9b`. Kontejner byl zastaven a odstraněn. Služba na 8080 dál používá svůj image.
- Příkaz `pnpm --config.verifyDepsBeforeRun=error exec tsx --test tests/feedback-deployment.test.ts tests/docker-game-entrypoint.test.ts` prošel 13/13. Nezávislý BMAD blind review Dockerfile vrátil prázdný seznam nálezů. Rozsah změny je pouze Docker build konfigurace a její evidence. Změna nemá vlastní herní refaktoring a nemění formát artefaktů, závislosti ani životní cyklus runtime.
- Sestavení běželo v kanonickém checkoutu na základu uvedeném výše včetně původních testů. Git blob ověřeného `Dockerfile` je `4e4545195a9ae69e25d36d0543ea8154fa814c3e`. Místní záznamy `baseline.log`, `candidate.log` a `smoke.log` jsou v `.cache/coolify-build-20261106/`. SHA-256 v témže pořadí jsou `1cfad355feaea6c55a70c541bae29fc3aa6259d1cdef0b1353efb83e57c0115f`, `fe192be8f64f77179285f694daad3352ab01774695198cb6f3b9cd25e4730895` a `8a465274be1e7103b534904b254d3eb81b9cadb6eb710b1ac466cd38b34bfb55`.
- Změněné soubory jsou `Dockerfile`, `docs/verification.md`, tento handoff a `docs/agents/tasks/coolify-build-20261106.json`. Cizí WIP se nepřebíral. Po lokálním commitu a ukončení vlastního buildu a smoke se uvolní obě rezervace této relace.

## Stav produkce

Veřejný [web](https://strahov.bandportal.cz/) servíroval `/assets/index-BN9j88gp.js` s vloženým klientským hashem `sha256-b00c0c3cec215aa0621f2d48947b87da8f6b5ddfe223a8d718f5baa84acb2ca0`. Stejný hash veřejných vstupů vychází z Git stromů `9341bcef`, `e9bc2f54` a `3ac77c7a` z 21. října. Přesný serverový commit z tohoto otisku určit nelze. Novější chat #42 a grafika #41 nejsou v aktuálním veřejném klientovi. Starší grafické změny #40 patří do neúspěšně sestavované revize `6614cb9b`.

Oprava je ověřená pro místní sestavení. [Upstream GitHub ruleset](https://github.com/Varnahg/StrahovCrazyShow/rules/25433383) vyžaduje PR a jeho kontroly bez bypassu. Práce má zůstat na `main` podle zadání. Coolify sleduje [fork](https://github.com/vojtech-stehlik/StrahovCrazyShow/tree/main), kam má aktuální účet přístup pro čtení. [KEY-74](https://linear.app/gigeconomy/issue/KEY-74/opravit-pad-docker-buildu-pri-nasazeni-do-coolify) eviduje otevřené produkční nasazení a neznámý skutečný limit paměti Coolify builderu.
