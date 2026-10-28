---
title: 'KEY-66: Jantar úvod a skutečný vstup do společného světa'
type: 'feature'
created: '2026-10-28'
status: 'done'
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
- [x] Vlastní handoffy, cílený refaktoring, nezávislé source review, stabilní test/build/integrace a nová produkční4278 — příslušné samostatné claims; původní4276 retired se zachovanými důkazy.

**Acceptance Criteria:**
- Given úvod, when první render, then je vidět jediný multiplayer CTA, online bublinka a launcher AI; žádný editor/canvas, demo ani duplicitní název.
- Given druhá obrazovka, when změním jméno/předlohu a vstoupím, then hra použije aktuální App profil; návrat/selhání joinu jej neztratí.
- Given otevřený chat, when píšu, zavřu/otevřu a přejdu do hry, then konverzace zůstává soukromá a zachová původní ochrany i dostupné zdroje.
- Given background, when měním viewport/reduced-motion, then mapa zachová geometrii a rovnoběžné bloky, není focusovatelná/ovladatelná a motion respektuje preferenci.
- Given desktop i mobil, when ovládám klávesnicí v CZ/EN, then text/akce nejsou oříznuté a dialog/close/back vrací smysluplný fokus.

## Implementation Notes

Finální funkční obsah odpovídá `0d957a1ba0f53baeeef894b13791da857663d6fe`: skutečný produkční4280 má source manifest6bfb508e6361023bbe3e1cccbfbdb6f89de0714908e8c3da4788ce780e3ebcba/9494souborů a clientIDsha256-efca68de0348122b8183a0b2b7b1e68953bf3b45a77b9c8006856f5a150c90c6.148/148cílených testů, plný build, SDK a následný bytecheck dependencies PASS. Celý Docker03 na0d prošel popup/focus/draft/pending/citacemi, skutečným profilem/admission, HTTP/SDK/lifecycle/restartem a cleanupem. CI0d:2597PASS/0FAIL/1SKIP, build/integrace/secret checks SUCCESS. Uživatel výslovně potvrdil, že na běžné4280 vše funguje, a požádal dokončit pouze novou stránku. Publikační head má po b67ec21e zdroje/testy/build vstupy opět shodné s0d; zbývající commit je evidence. Přesná main přejímka je samostatný dokladPR33, lokální done ji nenahrazuje.

Ověřený checkpoint987bcd92 nad přijatým86e4 má izolovaný source64e0678…/9494files a dependency8782a45…/16288files/0links0hardlinks. CI2596PASS/0FAIL/1SKIP, vlastní fyzické testy138/138, build a quiet SDK PASS. Praktický IAB je jen doplňkový; následný skutečný Edge/NVIDIA GTX1060 WebGL2 retry dokončil všech9lighting stages a původní game-ready gates. W/A/D reagují v testovaném natočení. Studený Edge timeout zůstává známé omezení bez renderer změny, žádný FPS benchmark se netvrdí. Podrobnosti a skutečné původní neúspěchy jsou v verification.md a handoffech. Po source review opravách je kanonický zdroj f57076ca; nový Docker E2E, izolovaný runtime4280 a integrační doklad teprve následují. Linear ani project-acceptance nejsou dosud Done/success.

2026-10-28: Checkpoint ready-for-dev přijat na základě výslovného uživatelského schválení implementace Jantaru; následně in-progress. Baseline ověřen Git HEAD. Dvě oddělené implementační větve práce mají vlastní souborové rezervace.

## Spec Change Log

- Uživatel následně výslovně ukončil rozšíření do diagnostiky startupu: původní goal je nová stránka a na4280 vše funguje. Diagnostický commit e819288559d896c7431859b0c8ef9866da61bd5f byl celý revertován b67ec21e6d3c319a7ebb89737857f431ca6333c4, bez přepisu historie. Všechny3startupclaims byly uvolněné,4282nevzniklo. Výsledný scope zachovává původní zákaz rendererových změn; historické timeouty nejsou vydávané za opravené.

- Formální review vyžaduje dvě další přesně přidělené navazující plochy: canonical locale/title publisher + jeho storage regrese a existující Docker browser konzument nového home/profile toku + popup interakční regrese. Nejde o nový produktový záměr ani veřejné API; metadata-only App workaround se odstraní ve vlastním UI scope. Tasky i procesní port4281/finální výstup4280 přidělil koordinátor. Současná hraná4278 se nepřepisuje.

- Přijatý upstream RAG main86e4dd603ca1b91e3eaa5f84573f9481be410a29 byl koordinovaně sloučen do62ba8c870082b1a3897d8f580d81dbd4005ca481. Zmrazený produktový záměr se nemění. Původní technický předpoklad bez serverových editací doplnil nový explicitně přidělený task jantar-home-20261028-provider-onboarding: jediná persona instrukce a regrese musí přestat nabízet odstraněný sólo vstup. Žádná změna serverového guest kontraktu nebo RAG architektury. Původní vlastník předal oba soubory a uvolnil scope.
- Kombinovaný client transport/compact test nově prochází SÚZ/SHerna citacemi přes skutečný shared validátor. Starý bundle se k novému backendu nepřipojuje; následující checkpoint dostane vlastní fyzické dependencies, aby se nepozměnil původní immutable snapshot.

## Review Triage Log

Formální tři vrstvy nad finálním scoped diffem vůči přijatému main86e4 doběhly před triage; edge-case vrstva vrátila []. Spec nebyla součástí společného diffu a claims načítala jen edge vrstva podle instrukce.

| Nález | Verdikt a důkaz | Route |
| --- | --- | --- |
| Blind B1: stejný locale při storage události vrátí starý title | low: publishLocale přepíše title před next===locale guardem, bez notify; App efekt závisí jen na locale. Staticky reálné, kosmetické. Přímá korekce kanonického publisheru a odstranění duplicitního efektu nevyžadují novou veřejnou surface/guard. | patch |
| Verification G1: nový profile submit bez automatického interakčního guardu | medium: SSR výchozího stavu a API SDK neprovádějí nový formulář; odstranění enter by nezachytily. Manuální proof současného chování není průběžná automatická regrese. | patch |
| Verification G2: popup open/close/Escape/focus jen manuálně | medium: přímé compact SSR neprovádí parent chatOpen. Launcher no-op by běžné testy nezachytily. Potřeba skutečného browser scénáře, bez placeného AI. | patch |
| Verification Other D1: Docker browser driver hledá odstraněný tok | medium: původní scripts/integration-docker.ts po goto hledal hned nickname a starý CTA; test-docker.mjs jej povinně spouští s --browser. Nový home nickname nemountuje. Doložený zastaralý konzument před opravou f57076ca. | patch |

G1+D1 tvoří společný kořen zastaralého browserového konzumenta nového vstupu. G2 je samostatný kořen chybějící popup regrese, byť může využít tentýž driver. B1 je samostatná metadata korekce. Žádné intent_gap/bad_spec/defer podle těchto zjištění; původní cold renderer limit zůstává oddělená známá okolnost, nikoli nový kódový nález těchto vrstev.

Závěrečné ověření patches: skutečný browser odhalil hidden-launcher atributový read vtestu;0d957a1b jej opravil přes DOM bez změnyUI či očekávání, nový kontrakt RED→GREEN4/4 a nezávislý review[]. Třetí celý Docker harness pak PASS/exit0 včetně celého popup/onboarding scénáře. B1/G1/G2/D1 jsou vyřešené; žádný otevřený podložený nález ve výsledném Jantar diffu. Startup diagnostika byla na přímý pokyn uživatele vyřazená, nikoli vydaná za fix.

Opravy B1/G1/G2/D1 jsou source-fixed:25dff25b přesouvá trvalý title do kanonického publisheru a ověřuje skutečné storage události (RED2FAIL→GREEN10/10); f57076ca aktualizuje skutečný dvoukrokový Docker browser vstup a doplňuje popup open/close/Escape/focus/draft/pending/reopen/citation regrese. Všechny AI adresy přebírá lokální fixture bez provider volání. Scoped tsc,49/49UI a3/3fixture kontrakty PASS. Následný nezávislý source review bez dalších konkrétních nálezů. Skutečný Docker E2E zatím pending; lehké testy jej nenahrazují.

- Čtecí source review /root/review_home_flow: opraven prioritní fokus composeru před close a CSS span náhledu; kontrola oprav bez dalších doložených chyb. Vnější chat wrapper je transparentní, aby se neskládaly dvě .93 vrstvy. Samostatný přezkum compact/map kontraktů bez nových nálezů. Praktická browser přejímka987 proběhla; přijetí finálního patchovaného zdroje čeká na nové ověření.

## Design Notes

Vybrána lokální kompozice WelcomeScreen a opt-in compact view; ne přesun celého toku do App. CSS-only skin nestačí. Interaktivní MapView by i pod overlayem držel nepotřebné handlery; nové SVG má cached společně transformovanou geometrii. Detailní porovnání nákladů/lifecycle je v rozhodnutí.

Kontrakt: `WelcomeMap()` bez props, třídy `home-map-art/roads/buildings/dormitories/stadium`; `/fonts/manrope/Manrope-Variable.ttf`; `/ui/crazy-typka.svg`. Chat dědí `--home-text:#fff3e4`, `--home-muted:#cfbfb2`, `--home-accent:#ffcf92`, `--home-button-ink:#49301d`, `--home-tint:243,200,156`, `--home-panel:rgba(37,27,26,.93)`. Parent vlastní zavření popupu a ponechá místo vpravo v hlavičce compact view.

## Verification

Cílené welcome/map/compact a dosavadní AI/preview lifecycle testy. Potom pod validation claimem `pnpm test`, `pnpm build`, `pnpm test:integration`, identity snapshotu včetně testů a skutečný browser: home/profile/back/join/failure/chat/CZ-EN/mobile/fokus. GPU teprve po kontrole scén. Živou kvalitu AI ani FPS bez měření netvrdit. Finální stabilní produkční server a karta mají vlastní serve/playtest claims.
