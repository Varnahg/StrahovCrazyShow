---
title: 'KEY-31: určit skutečný blokující gate multiplayer startupu'
type: 'bugfix'
created: '2026-10-28'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0d957a1ba0f53baeeef894b13791da857663d6fe'
context: ['{project-root}/AGENTS.md', '{project-root}/docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="přímý uživatelský požadavek opravit opakovaný timeout; diagnostický mezikrok">

## Intent

**Problem:** Skutečná hra opakovaně nedokončí světelné varianty ani při spolehlivé kadenci Edge/GTX1060. Běžný multiplayer neukazuje poslední blokující podmínku.

**Approach:** Nejprve zachytit omezené výsledky již prováděných kontrol v témže produkčním startupu. Podle tohoto důkazu následuje samostatně odůvodněná oprava; samotná diagnostika nesplní uživatelův cíl spustit hru.

## Boundaries & Constraints

**Always:** Explicitní lokální opt-in, anonymní serializovatelná data, pevné meze. Zachovat počet/pořadí skutečných readiness kontrol, renderů, variant, timeouty, batch budgety, restore, cancel a první hotový snímek. Stávající offline QA musí dál fungovat.

**Never:** Raw jména mesh/material/hráčů, session/player IDs, polohy, metadata či pakety; další isReady/compile/render probes, mutace cache za účelem pozorování, retenované renderer objekty, zvýšení limitů nebo vypnutí gate. Nezměnit hrané4278/4280 ani source mimo přidělení.

## I/O & Edge-Case Matrix

| Stav | Výsledek |
| --- | --- |
| Výchozí / neaktivní lokální recorder | Bez nových podrobných záznamů; stejný průchod a výsledky |
| Lokální explicitní profil + skutečný multiplayer | Bounded queue/retry/yield a pre/post-draw čekání, poslední gate a bezpečné kategorie |
| Timeout / výjimka / dispose / hidden | Pravdivý poslední stav; původní cleanup, restore a pozdní generace zachované |
| Nepřátelský název či getter / mnoho blockers | Žádný únik jmen ani změna booleanu; pevný cap a označení ořezu |

</frozen-after-approval>

## Code Map

- `client/game.ts` — `prepareLightingVariants`, současný `terrainReview&&!network` tracker a skutečné check/effects callbacky; reálný camera pass zachovat.
- `client/light-preparation.ts` —4ms/128GL2 batch, retry queue a dvojí ready draw; výsledky už jsou k dispozici.
- `client/strict-material-preparation.ts`, `client/webgpu-pipeline-preparation.ts` — čtecí podklad, v tomto checkpointu se nemění; nahradit nativní readiness algoritmus se nesmí.
- Omezený collector zůstane lokálně v `client/game.ts`, bez vlastnictví engine/mesh; nový soubor se nevytváří.
- `client/session-diagnostics.ts` — `isRecording` je omezené lokálním hostname; nový endpoint není potřeba.

## Tasks & Acceptance

**Execution:**
- [x] Task `jantar-startup-20261028-diagnostics`: pouze `client/light-preparation.ts` a `tests/light-preparation.test.ts`; volitelné counters, před Game napojením předat přesný interní API kontrakt.
- [x] Task `jantar-startup-20261028-game`: pouze `client/game.ts`, `tests/game-authored-light-preparation.test.ts`, `tests/game-light-preparation.test.ts`; collector a skutečné privacy/lifecycle fixtures.
- [ ] Root: nezávislé review, stabilní commit a samostatně rezervovaný produkční kandidát; skutečný Edge multiplayer záznam.

**Acceptance Criteria:**
- Given vypnutá diagnostika, when běží stejná fixture, then pořadí/počty kontrol, draw a výsledný stav odpovídají původnímu toku.
- Given opt-in lokální multiplayer, when kontrola vrací false, then record rozliší čekací gate a bounded retry/frontu bez osobních údajů a bez dalších readiness volání.
- Given přerušení či chybná diagnostická metadata, when příprava skončí, then výsledek/restore odpovídá původnímu kontraktu a žádný renderer objekt nepřežije kvůli logu.

## Implementation Notes

Baseline `0d957a1ba0f53baeeef894b13791da857663d6fe`. Všechen současný dirty obsah má doloženého vlastníka; žádné plošné staging/revert. Nový požadavek je přímý uživatelský bug report, běžná autorizovaná práce nepotřebuje další schvalovací checkpoint podle projektové policy. Výzkum a varianty jsou v `research.md`. Předané source paths a disjunktní tasky ověřil koordinátor; GPU/build/port se nepřebírají těmito tasky.

Koordinátor před child zápisem zúžil původní návrh na uvedených5source/test souborů. Nový diagnostický modul, strict-material/pipeline/Game-diagnostics/webgpu fixture se nemění. Helper navrhne `diagnostics?: boolean` a volitelné scalar stage counters; Game writer jej napojí až po potvrzení API. Původní přímá textová delegace s širším seznamem byla okamžitě opravena podle aktuálního task JSON.

API odsouhlaseno a integrované: pouze `diagnostics===true` přidává13saturovaných scalar fields do stage.readiness. Helper24/24CPU a27přesných baseline/off/on callback+clock/lifecycle shod; nezávislý source review[]. Game39/39CPU včetně skutečného privacy/offline/online, call sequence, hidden/terminal/payload a pevných budgetů. Anonymous samples max8, lokální WeakMap ordinaly max4096/stage, po settle zahozené; cache a metadata se nečtou. Pipeline detail nadále jen původní offline namedQA. Integrátor četl celý source/test diff, root celý TypeScript --noEmit exit0. Jde o diagnostický checkpoint; GPU záznam i skutečná oprava stále chybí.

## Design Notes

Preferovat existující `profileEnvironment` a `sessionDiagnostics.isRecording`; detail defaultně vypnout. Stage profil může dostat volitelné číselné counters. Anonymní lokální pořadový údaj není hráčská identita. Pozorování cache pouze z obyčejných datových polí; kandidáty výslovně neoznačovat za prokázaný blocker bez skutečného výsledku. Přesná interní API se před souběžnou integrací odsouhlasí koordinátorem.

## Verification

Přímý Node/tsx nad vlastními přidělenými testy: opt-in/off, bounded/sanitizace, shodná call sequence, false před/po draw, timeout/error/dispose/visibility/restore. Bez pnpm exec/run/install. Root po stabilním checkpointu provede relevantní celé kontroly a praktický Edge záznam na samostatném explicitně rezervovaném portu s source/dependency/build identitou. NullEngine ani samotný counter nejsou GPU důkaz a tento mezikrok se nevydává za opravu.
