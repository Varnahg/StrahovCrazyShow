---
title: 'KEY-31: doložit nepoužité WGSL konstanty před optimalizací startupu'
type: 'feature'
created: '2026-10-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd0a0f98044216638fbfc425999ae5e0dded1bf38'
baseline_worktree: 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow'
workflow_project_commit: '955d13470a8ae5f4c4fb847d6dc07a2348764ce8'
inherited_existing_changes: true
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/agents/tasks/webgpu-bmad-continuation-20261017.json'
---

<frozen-after-approval reason="Záměr výslovně schválený uživatelem v implementačním plánu17.10.2026">

## Intent

**Problém:** WebGPU pilot celé hry startoval45,7s proti32,4s u WebGL2. V13 zachytil662 známých raw/body shaderů bez přesných duplicit. Chybí důkaz, zda odlišnosti vytvářejí pouze nepoužité generované konstanty; samotná cache zatím nemá doložený přínos.

**Přístup:** Dokončit jeden omezený observační experiment v existujícím profileru, vyhodnotit skutečnou produkční scénu a uzavřít hypotézu. Je to dílčí krok původní migrace KEY-22, nikoli náhrada jejího výkonového cíle.

## Boundaries & Constraints

**Vždy:** oba přepínače inventáře musí být zapnuté; Game je zapne pouze přes existující loopback `profileEnvironment=1`. Zachovat skutečný zdroj shaderu, pořadí volání, receiver, return/throw/Promise, validaci, vlastnictví generace a disposal. Výsledky jsou diagnostičtí kandidáti, nikoli cache hits nebo důkaz sémantické ekvivalence.

**Nikdy:** transformace runtime WGSL, nová cache, prodloužení timeoutu, oslabení readiness, shaderové texty v logu, zásah do cizího WIP. Hrané4188/4192 a aktuální uživatelský4193 zůstanou neměnné. Během ručního testu žádné testy, TS, build nebo GPU experiment.

## I/O & Edge-Case Matrix

| Stav | Vstup | Výsledek | Nejasnost |
|---|---|---|---|
| Vypnuto | Chybí jeden opt-in | Bez processor hooks/textové práce nové vrstvy | Původní profilování pokračuje |
| Doložený původ | Vlastní convert→post→finalize→Effect prefix | Přesná odvozená rovnost s ponechanými novými řádky | Unknown při nejednoznačné tabulce |
| Konstanty | Nepoužitý uppercase bool nebo decimal0..2147483647 | Vynechání pouze ze srovnávacího pohledu | Použité, unsafe a tranzitivní závislosti zůstávají |
| Syntaxe/limity | Komentáře, Unicode, accessor, kolize, plná kapacita | Konzervativní keep/unknown; hash není důkaz rovnosti | Explicitní počty ztráty evidence |
| Lifecycle | Změna processora/device, dispose | Obnovit jen vlastní hooks, uvolnit texty | Staré výsledky nesmějí ovlivnit novou generaci |

</frozen-after-approval>

## Code Map

Runtime pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`; níže uvedené runtime cesty jsou vůči ní. BMAD artefakty patří primárnímu checkoutu, žádná reinstalace BMAD.

- `client/webgpu-compilation-profile.ts`: bounded inventář, exact equality, generace a GPU pozorování; rozšířit existující mechanismus.
- `client/game.ts`: autorizovaný opt-in a etapy; jediný nový option pod stejnou podmínkou.
- `tests/webgpu-compilation-profile.test.ts`, `tests/game-light-preparation.test.ts`: skutečný pinned processor a skutečné Game AST zapojení.
- `docs/agents/handoffs/webgpu-shader-inventory-20261016.md`: průzkum, primární zdroje a vlastnictví; `docs/performance/evidence/webgpu-migration-20261016/inventory-v13/`: původní662shadery a limity důkazu.

## Tasks & Acceptance

**Execution:**
- [x] Profiler a jeho test: dokončit a refaktorovat omezený lexer/provenance/region comparison; vlastní task `webgpu-shader-inventory-20261016` a owner `webgpu-mig-01a14497-unused-20261017`.
- [x] Game a integrační fixture: zapojit oba flags shodným gate; rootovy rezervace `webgpu-migrate-root-20261016` a `webgpu-migrate-frame-fixture-20261016`.
- [x] Nezávislé review přesného vlastního diffu; opravy jen ve vlastněných souborech, poté cílené testy a scoped TS.
- [ ] Root po uživatelském testu vytvoří nový označený immutable checkpoint a jeden skutečný Edge sběr. Vyhodnotí počty, unknown/limity a režii; bez přínosu experiment uzavře bez cache.
- [ ] Samostatné commity a integrace pouze po relevantním ověření; aktualizovat KEY-31/32 a předání. Celá migrace zůstává otevřená do své funkční/výkonové přejímky.

**Acceptance Criteria:**
- Given skutečné pinned vstupy, when se liší pouze nepoužitý safe define, then odvozená rovnost je přesně potvrzená a oba runtime výsledky zůstanou byte-identické s originálem.
- Given použitý či unsafe define nebo nejasnou provenance, when se analyzuje shader, then se deklarace zachová nebo je výsledek unknown; validace se nikdy nevynechá.
- Given vypnutou diagnostiku nebo veřejný hostname, when vznikne Game, then nové processor hooks nejsou instalované.
- Given invalidaci generace či disposal, when doběhne staré volání, then neovlivní nového vlastníka a nezůstane neomezená textová/GPU reference.
- Given skutečný GPU export, when se předává výsledek, then obsahuje source ID, skutečné pokrytí a omezení; CPU PASS se nevydává za výkonový přínos.

## Implementation Notes

Převzetí17.10: existující změny nejsou zahájeny znovu. Před BMAD byly27testů PASS, následně31/32 a1TSdiagnostic; opravy očekávaného hashe/fixture a pozdější statické zpřísnění zatím znovu neověřené kvůli ručnímu testu. Rootovo Game zapojení má22cílených PASS v izolovaných dependencies-v5. Nezávislé statické review probíhá; stav není přijato ani Done.

Checkpoint specifikace: nejsou otevřené otázky záměru ani nevratná změna. Pokračování je již výslovně autorizované zprávou „PLEASE IMPLEMENT THIS PLAN“ a následným požadavkem použít BMAD. Projektová policy vyžaduje využít existující souhlas; nepřidává se opakované schvalování. Zvolen dispatch kvůli netriviálnímu provenance/lexer/lifecycle rozsahu a již disjunktně přidělené implementaci.

BMAD krok03 převzal již existující implementaci; `baseline_commit` je skutečný HEAD implementační pracovní kopie, `workflow_project_commit` identifikuje oddělený primární checkout s instalací BMAD. Review diff smí obsahovat pouze profiler, jeho test/handoff a rootovo Game zapojení s fixture. Dokončení testové matice a skutečný GPU sběr zatím chybí, proto se krok03 ani celá migrace nepovažují za hotové.

Po výslovném dokončení uživatelského testu17.10 proběhlo33/33 cílených testů a scopedTS2957/0 bez další změny source/test freeze, proto původní statické review platí. Root přijal CPU celek a vytvořil samostatné commity `cad8b4f45f0d88c2613ccf3828ae468b27b407f1` (inventář) a `5cdb14e25afbdf83a9f5fa0707b31fed5caea184` (Game gate). Native-v14 snapshot `ecb77e181ed33b8777755cdd426636e0d7a9eb98334df9301d33e353bafadb09` obsahuje8451inputů a prošel1216/1216/fullbuild/TypeScript/izolovanouintegrací. GPU sběr a integrace do main ještě nejsou přijaté. Ruční C4 test odhalil nezávislou existující chybu světelných UBO a zastaveného renderu (KEY-39); tento inventář v C4 neběžel.

## Spec Change Log

## Review Triage Log

17.10: nezávislé předběžné statické review pěti vlastních cest vrátilo `[]`. Diff SHA256 `A4D6A6BCB0197D2877AAE4CC2CCDC5F05871B0C3EA5C8FBB5240EAF24E1D7375`; zdroj profileru `991C3FF5EC2B09C3CAE4CC715343582B2688DC8B8332C776663244B392DD9499`. Reviewer ověřil pinned provenance, lexer, závislosti, přesnou rovnost, limity, lifecycle/accessors/privacy a Game gate. Nespouštěl testy/TS/build/GPU. Jde o statický výsledek, nikoli splnění testové matice nebo předčasný přechod do dokončeného BMAD kroku04.

## Design Notes

Přesná raw cache ani odstranění vnějšího prefixu nemají vev13 naměřené shody. Obecné mazání konstant/komentářů by mohlo skrýt referenci či validační chybu (`1/0`, `1 + Missing`). Proto porovnat pouze prokázanou generovanou tabulku, ponechat unsafe dependencies a všechny WGSL line breaks/nested comments zpracovat konzervativně. Kapacity se nezvyšují; metadata/provenance sdílejí původní textový budget. Režie je explicitní a pouze opt-in.

## Verification

- Po dokončení uživatelského testu: izolované `node --import tsx --test tests/webgpu-compilation-profile.test.ts` a tři Game přípravné/lifecycle fixtures; očekává se bez selhání.
- Scoped `node typecheck.mjs` v existujícím vlastním stagingu: nula diagnostics, žádná reinstalace dependencies.
- Regrese: pinned chain, použité a tranzitivní reference, unsafe initializer/jméno, všechny WGSL line breaks, nested comments, skutečná hash kolize, accessor/unknown, limits, generační ownership/dispose a skutečný privacy sanitizer/server validator.
- Nový produkční checkpoint: source/test/assets manifest a build tag, jeden Edge startup s lokálním inventářem; žádné přepisování4193 během testu. Plná native/combined pipeline a finální neprofilované páry zůstávají povinností nad následným stabilním kandidátem.
