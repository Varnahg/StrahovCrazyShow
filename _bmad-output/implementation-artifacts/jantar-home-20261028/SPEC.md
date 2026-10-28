---
title: 'KEY-66: Jantar úvod a skutečný vstup do společného světa'
type: 'feature'
created: '2026-10-28'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md', '{project-root}/docs/agents/bmad-policy.md', '{project-root}/docs/home-design/20261028/decision.md']
base_revision: 'de6f87a2efbf8596bb03efae863e8d6763e22774'
baseline_commit: 'e09d60fa24419a93b26f15e21c862e95e44aff2f'
---

<frozen-after-approval reason="Uživatel schválil Jantar a výslovně požádal o implementaci a spuštění celé hry">

## Intent

**Problém:** Současný světlý úvod neodpovídá schválenému návrhu. Uživatel chce soustředěný herní vstup s menším soukromým AI chatem.

**Přístup:** Implementovat tmavý Jantar/Manrope/glass: uprostřed název a jediné „Pusť mě dovnitř“, samostatná malá bublinka skutečného online počtu; potom jméno a živý editor postavy. Mapa je nepopsané, zarovnané, lehce zamlžené pozadí. Crazy Typka se rozbaluje z portrétu se štítkem AI.

## Boundaries & Constraints

**Vždy:** CZ/EN, pravdivé stavy počtu, přístupná klávesnice, odložený skutečný editor, společný App profil a jediný AI store. Zachovat soukromí, dostupnost, citace, pending/retry/expiry/reset/cancel, původní in-game AI a startup CSS. Font lokálně s licencí; původ mapy v O projektu. Motion vypnout při reduced-motion.

**Nikdy:** Demo badge, slogany, rohové logo, kompas, šipka na prvním CTA, herní screenshot místo editoru, interaktivní mapa na úvodu, vymyšlený počet či AI odpověď. Žádná změna serveru/RAG/rendereru/fyziky nebo rušení serverového guest kontraktu. Chráněnou verzi 4182 neměnit.

## I/O & Edge-Case Matrix

| Stav / akce | Výsledek | Chyba |
| --- | --- | --- |
| První úvod → CTA | Druhá obrazovka, mount editoru, fokus přezdívky | Žádný předčasný join ani GPU preview |
| Zpět / opět otevřít | Návrat fokusu, profil zůstává, preview se uklidí | Pozdní preview se nesmí vrátit |
| Potvrdit postavu | Pouze existující `enter("multi")` | Failed join ponechá profil/editor a zobrazí error |
| Presence 0 / chyba | Skutečná nula / pomlčka s dostupným vysvětlením | Chyba není 0 |
| Otevřít / zavřít AI během reply | Tentýž store a draft; obnovit fokus | Zavření nesmí volat reset/dispose ani nový placený dotaz |

</frozen-after-approval>

## Code Map

- `client/ui.tsx`: vlastní profil, `useCrazyTypka`, enter a renderer; změnit jen welcome sloty.
- `client/welcome-screen.tsx`: zachovat presence poller; lokální home/profile, popup a native dialog.
- `client/avatar-editor.tsx`: pouze číst; nativní přezdívka, předlohy, fallback a cleanup již existují.
- `client/crazy-typka.tsx`: pouze opt-in prezentace, transport/store beze změny.
- `shared/data/{map,streets,building-catalog}.json`: pouze čtené primární geometrie.

## Tasks & Acceptance

**Execution:**
- [x] `client/welcome-map*.tsx/ts`, `tests/welcome-map.test.ts`, `public/fonts/manrope/`, `public/ui/crazy-typka.svg` — cache geometrie, lokální font/licence, původní vektorový portrét; task assets.
- [x] `client/crazy-typka.tsx/css`, `tests/crazy-typka-compact.test.ts` — `variant?: "default" | "compact"`, původní default zachovat; task chat.
- [x] `client/welcome-screen.tsx/css`, `client/ui.tsx`, `index.html`, `tests/welcome-screen.test.ts` — schválený tok a Jantar; task ui.
- [ ] Vlastní handoffy, cílený refaktoring, review, stabilní test/build/integrace a produkční port 4276 — příslušné samostatné claims.

**Acceptance Criteria:**
- Given úvod, when první render, then je vidět jediný multiplayer CTA, online bublinka a launcher AI; žádný editor/canvas, demo ani duplicitní název.
- Given druhá obrazovka, when změním jméno/předlohu a vstoupím, then hra použije aktuální App profil; návrat/selhání joinu jej neztratí.
- Given otevřený chat, when píšu, zavřu/otevřu a přejdu do hry, then konverzace zůstává soukromá a zachová původní ochrany i dostupné zdroje.
- Given background, when měním viewport/reduced-motion, then mapa zachová geometrii a rovnoběžné bloky, není focusovatelná/ovladatelná a motion respektuje preferenci.
- Given desktop i mobil, when ovládám klávesnicí v CZ/EN, then text/akce nejsou oříznuté a dialog/close/back vrací smysluplný fokus.

## Implementation Notes

2026-10-28: Checkpoint ready-for-dev přijat na základě výslovného uživatelského schválení implementace Jantaru; následně in-progress. Baseline ověřen Git HEAD. Dvě oddělené implementační větve práce mají vlastní souborové rezervace.

## Spec Change Log

## Review Triage Log

- Čtecí source review /root/review_home_flow: opraven prioritní fokus composeru před close a CSS span náhledu; kontrola oprav bez dalších doložených chyb. Vnější chat wrapper je transparentní, aby se neskládaly dvě .93 vrstvy. Samostatný přezkum compact/map kontraktů bez nových nálezů. Praktická browser přejímka a finální workflow review dosud čekají.

## Design Notes

Vybrána lokální kompozice WelcomeScreen a opt-in compact view; ne přesun celého toku do App. CSS-only skin nestačí. Interaktivní MapView by i pod overlayem držel nepotřebné handlery; nové SVG má cached společně transformovanou geometrii. Detailní porovnání nákladů/lifecycle je v rozhodnutí.

Kontrakt: `WelcomeMap()` bez props, třídy `home-map-art/roads/buildings/dormitories/stadium`; `/fonts/manrope/Manrope-Variable.ttf`; `/ui/crazy-typka.svg`. Chat dědí `--home-text:#fff3e4`, `--home-muted:#cfbfb2`, `--home-accent:#ffcf92`, `--home-button-ink:#49301d`, `--home-tint:243,200,156`, `--home-panel:rgba(37,27,26,.93)`. Parent vlastní zavření popupu a ponechá místo vpravo v hlavičce compact view.

## Verification

Cílené welcome/map/compact a dosavadní AI/preview lifecycle testy. Potom pod validation claimem `pnpm test`, `pnpm build`, `pnpm test:integration`, identity snapshotu včetně testů a skutečný browser: home/profile/back/join/failure/chat/CZ-EN/mobile/fokus. GPU teprve po kontrole scén. Živou kvalitu AI ani FPS bez měření netvrdit. Finální stabilní produkční server a karta mají vlastní serve/playtest claims.
