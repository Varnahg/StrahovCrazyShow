# Předání: jantar-home-20261028-docker-browser

- Vlastník: `jantar-docker-ui-01a17fd8`; příjemce: koordinátor `/root`, relace `01a17fd8-017a-7852-87f9-cd1538e1bde2`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`, větev `codex/jantar-home`; výchozí commit `987bcd9242f747a6dd78c83a68b127a60ab90f19`.
- Výsledek: opraven zdrojový browser driver povinného Docker toku a doplněn automatický scénář skutečných UI interakcí. Typy a lehké CPU kontroly prošly. Skutečný browser/Docker scénář zde nebyl spuštěn; toto předání není jeho přijetí.
- Změněné verzované soubory: pouze `scripts/integration-docker.ts` a toto předání. Pomocné nástroje, extrahované helpery, testy, diff a logy jsou pouze v rezervované `.cache/jantar-home-20261028-docker-browser/`.
- Cizí WIP: při zahájení byly změněné `_bmad-output/implementation-artifacts/jantar-home-20261028/SPEC.md`, `client/i18n.ts`, `tests/i18n.test.ts` a existovaly nesledované root tasky/předání/evidence. Žádný takový soubor nebyl převzat, změněn, staged ani commitnut. Vlastní dirty `scripts/integration-docker.ts` a toto předání výslovně předávám root integrátorovi.

## Podklady a rozhodnutí

Dne 28. 10. 2026 byly přečteny aktuální AGENTS, BMAD policy, mapa architektury, koordinační pravidla, historický current-work, task a handoff template. Claim získán před prvním zápisem. Konkrétní subagent zadání neopakuje BMAD workflow.

Doložená příčina je v driveru na výchozím commitu: po `page.goto` hledal textbox, který se nyní montuje až na druhé stránce, a následně klikal odstraněné „Vstoupit do společného světa ↗“. Primární zdroje `client/welcome-screen.tsx` a `client/avatar-editor.tsx` určují skutečný tok „Pusť mě dovnitř“ → editor / „Jak ti budeme říkat?“ → „Vstoupit do hry“. `client/ui.tsx` vlastní jediný AI store; popup v `WelcomeScreen` pouze podmíněně montuje view. Zdroj `client/crazy-typka.tsx` určuje validaci session/reply, editaci draftu i během pending, disclosure, zdroje a reset revokaci. Byla přečtena i dřívější ruční fixture `.cache/jantar-home-20261028-research/flow-fixture.tsx`; nebyla měněna ani použita jako produkční vstup. Playwright API kontrakty byly ověřeny v připnutých lokálních `playwright-core/types/types.d.ts`.

Porovnané varianty:

1. Pouhá změna labelů by odstranila onboarding pád, ale nedodala požadovanou interakční regresi chatu.
2. Samostatná ruční fixture by ověřila komponenty, ale nebyla by součástí povinného Docker driveru ani kompilovaného skutečného klienta.
3. Zvolená malá browser-only API fixture zachytí `/api/ai/**` před navigací a ponechá skutečné UI, App store i multiplayer transport. Je deterministická, nevyžaduje provider, placené volání ani produkční změnu. Všechny neznámé AI požadavky uzavírá 404 a eviduje; nepoužívá `continue`/`fallback`.
4. Skutečný provider není pro popup regresi potřeba a přidal by externí závislost a náklady.

Produkční vzhled, API, cache ani renderer se nemění. Fixture existuje pouze v jedné zahazované browser page. Žádné změny render readiness, budgetů ani hraného serveru4278.

## Implementace a cílený refaktoring

- Driver nejprve provede chat scénář na home, potom otevře „Pusť mě dovnitř“, čeká na skutečný editor druhé stránky, vyplní přezdívku a klikne „Vstoupit do hry“.
- Popup scénář vyžaduje skutečně viditelný a povolený composer a `aria-expanded=true`; launcher s neúčinným `onClick` selže na čekání composeru.
- Skutečné kliknutí na close a skutečné `Escape` z composeru vyžadují skrytí popupu, `aria-expanded=false` a návrat fokusu na launcher. Draft se kontroluje po obou znovuotevřeních.
- Scénář odešle jedinou fake zprávu, zachytí skutečný request payload/sekvenci/locale, podrží odpověď, během pending zapíše další draft a zavře popup. Odpověď se uvolní během jeho nepřítomnosti; po otevření musí existovat právě jedna user i AI bublina, zachovaný nový draft a rozbalitelná citace s URL a datem.
- Privacy details se skutečně rozbalí a musí ukázat definici i OpenAI/soukromé zpracování. Kontrola počtů vyžaduje jednu AI session, jednu chat operaci a žádný DELETE při close/Escape. Testuje se skutečný App store; fake je pouze HTTP odpověď.
- Opakované open/closed DOM invarianty sdílejí malé lokální helpery. Lokální ES2022 `deferred` sdílí vytvoření slibů; `bounded` vyčistí časovač při úspěchu i chybě. Ve `finally` se uvolní případná zadržená odpověď a browser se vždy zavře. Žádné sleep ani pevné počty event-loop otočení.
- Zachován původní `canvas[data-network-stage="connected"]` gate a všechny HTTP/assets/cache/guest/diagnostics/matchmaking/SDK/lifecycle/root WebSocket asserty. Jejich přesnou shodu s baseline kontroluje lokální prepare-checks.

## Ověření

Kontroly byly provedeny přímo Node, bez package manageru, instalace, globálního tsc, browseru, serveru nebo Dockeru. Logy mají UTC čas a příkaz.

- `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --skipLibCheck --lib ES2022,DOM,DOM.Iterable --types node scripts/integration-docker.ts`: exit0, `.cache/jantar-home-20261028-docker-browser/targeted-types.log`.
- `node --import tsx --test .cache/jantar-home-20261028-docker-browser/fixture.test.ts`: 3/3 PASS, exit0, `fixture-cpu-tests.log`. Testy používají helpery extrahované AST z aktuálního driveru, ověřují zadržení odpovědi, skutečné shared validátory session/reply/source, neprůchodnost fake rout a odmítnutí no-op launcheru, jestliže composer zůstane nepřítomný. Jde o CPU kontrakty, nikoli browserovou přejímku.
- `node --import tsx --test tests/crazy-typka-compact.test.ts tests/crazy-typka-ui.test.ts tests/welcome-screen.test.ts`: 49/49 PASS, exit0, `targeted-ui-tests.log`. Existující default/compact/privacy/source/store testy zůstaly beze změn.
- `node .cache/jantar-home-20261028-docker-browser/prepare-checks.mjs`: exit0, `prepare-checks.log`; přesné baseline porovnání HTTP/SDK/lifecycle prefixu a tailu i root matchmaking/WS assertion bloku.
- `node node_modules/prettier/bin/prettier.cjs --check scripts/integration-docker.ts`: exit0, `format-check.log`. `git diff --check -- scripts/integration-docker.ts`: PASS.
- První cílený tsc odhalil chybějící `Promise.withResolvers` v projektovém ES2022 lib a následné ztracené typování payloadu. Opraveno lokálním helperem, žádná změna konfigurace. Původní výstup je zachován v `targeted-types-first.log`; pozdější PASS jej nepřepisuje.
- Opakovací lehký runner: `node .cache/jantar-home-20261028-docker-browser/run-checks.mjs`.

## Identita, procesy a další krok

Diff a SHA-256 manifest včetně pomocných testů a důkazů jsou `.cache/jantar-home-20261028-docker-browser/task.patch` a `files.sha256.json`. Neexistuje vlastní commit; integrátor převezme pouze výše vyjmenované soubory a ověří aktuální hash. Pomocné Node procesy doběhly; tento subagent nespouštěl žádný dlouhožijící proces a nevlastní port ani scénu. Žádné cizí procesy nebyly ukončeny.

Root musí v samostatně rezervovaném okně provést skutečný `--browser` harness proti izolovanému snapshotu/port4281 a následně celý Docker E2E podle svého process tasku. Bez toho není prokázána Playwright akčnost/rozvržení skutečného popupu ani kontejnerová přejímka. Existující network-connected gate není důkaz render-ready ani FPS benchmark.

Předání je připravené pro integrátora. Rezervace se uvolní po poslední kontrole a vytvoření manifestu; skutečný výsledek release potvrzuje závěrečná zpráva. Stav tasku a integraci mění pouze koordinátor.
