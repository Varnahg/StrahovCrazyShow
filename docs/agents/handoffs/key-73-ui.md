# Předání: key-73-ui

- Vlastník: crazy-typka-01a1a80f-ui; příjemce: root / KEY-73.
- Pracovní kopie: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow; větev codex/crazy-typka-scope-ui-20261104; baseline 6805bcd4396eeb6abd17f724914a054b06fa86bc.
- Checkpoint: core implementace a cílený refaktoring hotové, 53/53 cílených testů PASS. Shell welcome-screen.tsx / ui.tsx / welcome-screen.test.ts nevlastním; jejich zapojení a browserová přejímka zůstávají integrátorovi.

## Rozhodnutí před změnou

- Problém: composer neumí Enter, ruční resize a focus glow ruší; disclosure zabírá místo; odpovědi nelze cíleně citovat.
- Doložený mechanismus: textarea nemá key handler, CSS výslovně resize:vertical a tři globální :focus glow pravidla; provider ztrácí části a UI renderuje jediný text; close patří vnějšímu shellu.
- Jediný zkoušený celek: schválené KEY-73 chat UI + client reply store, veřejné block/ref rozhraní dodává root. Neprovádí se optimalizační ani GPU experiment.
- Hlavní metrika: průchod behaviorálních regresí composer/reply/lifecycle a následná browserová přejímka integrátora.
- Podmínky správnosti: žádný quote text v HTTP, přesný pending/replay, source-backed reply pouze vlastní aktivní relace, bezpečné textové vykreslení, zachované reset/abort a klávesnicová orientace.
- Přijetí: všechny cílené testy projdou; root ověří shell, klávesy/IME, focus, mobil a finální společnou pipeline. Samotné SSR není browserový PASS.

## Varianty a podklady

Zachovat serverové bloky je přesnější než dělit hotový text podle newline; serverové refs jsou bezpečnější než posílat klientský quote text. Jediný globální modality observer nahradí glow bez posluchačů na každém poli. Textarea měří pouze vlastní obsah a změnu šířky. Nativní informace jsou ovládané ikonou a klávesnicí, odstraněný footer neduplikuje disclosure.

Podklady: schválený _bmad-output/implementation-artifacts/key-73/SPEC.md, docs/agents/bmad-policy.md; současný crazy-typka store a jeho lifecycle testy; MDN KeyboardEvent.isComposing, HTMLFormElement.requestSubmit a :focus-visible ověřené 4.11.2026. Žádné informace z modelu se nevydávají za aktuální KB evidence.

## Výsledek a integrace

- Store: requestSeq/blocks v AI zprávě, draftReply, selectReply/clearReply, šest posledních podložených odpovědí; lokální nepodložená odpověď je nevytlačuje. HTTP posílá jen replyTo requestSeq/blockId, nikdy text citace. Pending operace drží přesný target i při obnově.
- Odpovědět se nabízí pouze u podložených bloků v aktuálním okně. Legacy odpověď zůstává textová. Quote je bezpečně escapovaný náhled; reply-unavailable potvrzuje pořadí, ruší target a obnoví původní draft pouze pokud uživatel mezitím nepíše jiný. Žádné automatické přeposlání. Reset/scope/session expiry/dispose ruší refs. Expirace vybraného targetu nesmí potichu vytvořit unquoted požadavek do nové session.
- Composer: Enter/form.requestSubmit, Shift+Enter newline, isComposing/keyCode229 bezpečné; automatická výška s CSS limity, overflow a cleanup ResizeObserver. Ruční resize je vypnutý. Typing indikátor jsou tři tečky s reduced-motion; status dostupnosti zůstává pravdivý při checking/error.
- Disclosure, soukromý status a upozornění jsou v exportovaném CrazyTypkaChatActions; tlačítko koše respektuje reset/cancel. Info používá native details, Escape a clickoutside, listenery uklízí. Footer a archive/current selector odstraněny, serverový archive kontrakt zachován.
- Modality observer instalovaný jednou v main.tsx, HMR uklízí listenery i atribut. Pointer a běžné psaní nemají glow, Tab má decentní obrys včetně vlastního color control wrapperu. Formulářová pravidla jsou globální, indikace navigace na odkazech/tlačítkách zachována.
- Shell zapojení: WelcomeScreen přidá assistantActions slot a obalí actions + existující close do div.home-chat-toolbar. App v menu předá CrazyTypkaChatActions, v herním AI panel-heading obalí actions + close do div.crazy-panel-actions. Nový App modality effect není potřeba.

## Přesné soubory

client/crazy-typka.tsx; client/crazy-typka.css; client/welcome-screen.css; client/style.css; client/input-modality.ts (nový); client/main.tsx; tests/input-modality.test.ts (nový); tests/crazy-typka-ui.test.ts; tests/crazy-typka-compact.test.ts; tento handoff; .cache/key-73-ui/ (logy a manifest).

Výchozí cizí WIP: neversionované handoffy main-consolidation/main-private-preservation a three-worktrees-cache JSON zůstaly beze změny. Souběžné root/scope/KB změny nebyly převzaty ani upraveny. Změny shared kontraktu dodal root.

## Refaktoring a ověření

Společné canSend a form submit drží stejné podmínky pro klávesy i tlačítko. Odstraněné nevyužité footer/privacy/knowledge/reset CSS; žádné raw HTML či nová závislost. Reply buffer je bounded, pozdní requesty i rušení zůstávají pod generací stávajícího store. Resize observer nereaguje opakovaně na pouhou změnu výšky.

- `node --import tsx --test tests/input-modality.test.ts tests/crazy-typka-ui.test.ts tests/crazy-typka-compact.test.ts`: exit 0, 53 PASS, 0 FAIL; poslední běh 4.11.2026, 840.651 ms. Log `.cache/key-73-ui/targeted-tests.log`.
- `git diff --check -- <vlastní soubory>`: exit 0.
- Jedna read-only `tsc --noEmit --pretty false`: exit 2, nikoli PASS. V okamžiku kontroly pouze tři současně rozpracované serverové fixtures (`tests/crazy-typka.test.ts:470,1428,1526`) postrádaly nové DecisionRouter.classifySegments. UI diagnostiky nebyly vypsané. Log `.cache/key-73-ui/typescript-check.log`; plnou typovou kontrolu root zopakuje jednou nad stabilním checkpointem. Proces skončil.
- Manifest přesných devíti UI zdrojů a testů: `.cache/key-73-ui/manifest.json`, SHA-256 je uložený uvnitř. Nejde o full application build ani GPU snapshot.
- Formátování pouze přidělených změněných chat/modality souborů a testů přímým lokálním Prettier CLI.

## Procesy, omezení, další krok

Žádné vlastní síťové procesy, buildy ani GPU scény; vlastní tsc session 5893 již skončila. Nebyl spuštěn live OpenAI, browser ani plná pipeline. Přímé IME/klávesy, skutečné computed styles, mobilní rozložení a info/trash/close musí ověřit root po shell integraci. SSR a helper test nejsou browserovým PASS. Žádný commit/staging; integruje root. Rezervace byla po core předání uvolněna.

## Příprava shell patche při graphics rezervaci

Core task byl znovu rezervován původním vlastníkem přes --adopt-dirty pouze pro doložené vlastní soubory a tento handoff. Core zdrojový kód se při přípravě patche dále neměnil. Obsazené shell zdroje zůstaly beze změny.

- Patch: `.cache/key-73-ui/shell.patch`, 4403 bajtů, SHA-256 `6c5dd602339452053b1b6c4c3b22c56f20ab35010cdf044cd3c0816a3d09e98a`.
- Obsahuje pouze `client/welcome-screen.tsx`, `client/ui.tsx`, `tests/welcome-screen.test.ts`: prop/toolbar, skutečné intro+game action komponenty a test nemountovaného slotu při zavřeném chatu.
- `git apply --check .cache/key-73-ui/shell.patch`: PASS nad aktuálními nezměněnými shell soubory. Patch nebyl aplikovaný; aplikace musí počkat na vlastní claim key-73-shell po release graphics a znovu ověřit source drift.
- `ts.transpileModule` se syntax diagnostikami nad třemi drafty: bez errors; nejde o plnou typovou ani browserovou kontrolu. Příbuzné source/AST testy nevyžadují další writePaths.
- `.cache/key-73-ui/shell-patch-manifest.json` uchovává předchozí/následné hashe souborů a applied:false. `.cache/key-73-ui/browser-qa.md` obsahuje konkrétní CZ/EN desktop/mobil, shell, reply, IME, focus a reset scénáře.
- Po předání patche se core rezervace znovu uvolňuje. Žádné vlastní procesy neběží; patch ani drafty nejsou kopie Git checkoutu.

## P2 info na úzkém viewportu — rozhodnutí před opravou

- Problém: nezávislé review doložilo ořez informačního panelu na 320/360px.
- Doložený mechanismus: absolutní info je ukotvené k vnitřnímu .crazy-chat-actions před close. Na 320px je popup 288px, pravý okraj tohoto vnitřního obalu je přibližně 238px a šířka info 260px, tedy levý okraj −22px při overflow:auto.
- Jediná změna: ukotvit info ke společnému toolbaru včetně close. Welcome toolbar již positioned je; přesunout position:relative z vnitřního actions na herní .crazy-panel-actions. Žádný nový offset, textová změna, JS ani shell zásah.
- Hlavní metrika: statické horizontální meze info při 320/360/1280px a existující cílené UI/lifecycle testy.
- Podmínky správnosti: obsah info v mezích popupu/panelu; stejné ikony, pořadí, width/max-height, Escape, focus a cleanup; desktop zůstane pravostranně ukotvený ke společné hlavičce.
- Přijetí: numerická containment kontrola a cílené testy PASS; root následně ověří skutečné Edge 320/360px. Statický výpočet není browserový PASS.

Alternativy: zmenšit width o šířku close by zbytečně zužovalo text; záporný right offset by duplikoval rozměry tlačítka a gapu. Zvolený společný containing block odstraní příčinu bez takových konstant a současně sjednotí intro/game.

Výsledek: změněn pouze `client/crazy-typka.css` — position:relative nyní vlastní .crazy-panel-actions; vnitřní .crazy-chat-actions je static. Na úvodu je nejbližší positioned ancestor již existující .home-chat-toolbar, ve hře společný .crazy-panel-actions. Pravý okraj info tedy zahrnuje close místo konce předchozí skupiny. Šířka, ikony, JS, Escape a focus se neměnily.

- Statická kontrola `.cache/key-73-ui/info-layout-check.mjs`: PASS po korektním sloučení CSS kaskády; výsledek `.cache/key-73-ui/info-layout-check.json`. První verze samotného kontrolního parseru přečetla jen první z více shodných selector pravidel a byla opravena; nešlo o nové UI selhání.
- 320px: popup 288px, info 260px, left/right 18/278px (původně left −22px).
- 360px: popup 328px, info 280px, left/right 38/318px (původně left −2px).
- 1280px: popup 350px, info 280px, left/right 60/340px; panel zůstává pod společnou pravou hlavičkou.
- Cílené testy `node --import tsx --test tests/input-modality.test.ts tests/crazy-typka-ui.test.ts tests/crazy-typka-compact.test.ts`: exit 0, 53 PASS, 0 FAIL, 757.3102 ms; log `.cache/key-73-ui/info-layout-targeted-tests.log`.
- `git diff --check -- client/crazy-typka.css`: PASS. Nový SHA-256 CSS `e3e0db14e06e164d0af5b3fcad551ba8b3b77649539415f267899f697da666c0`; původní UI manifest výše popisuje předchozí checkpoint.
- Bez shell změn, tsc, buildu, browseru, API nebo GPU. Skutečné Edge 320/360px musí doplnit root; statické meze se nevydávají za screenshotový důkaz. Rezervace se po předání opět uvolňuje.
