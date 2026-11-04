# Předání: key-73-shell

- Vlastník: crazy-typka-01a1a80f-shell; příjemce: root / KEY-73.
- Pracovní kopie: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow; větev codex/crazy-typka-scope-ui-20261104; baseline 6805bcd4396eeb6abd17f724914a054b06fa86bc.
- Checkpoint: shell integrace hotová, připravený patch aplikován po úspěšném claim a novém git apply --check; 115/115 cílených welcome/sourceUI testů PASS.

## Rozhodnutí před změnou

- Problém: close patří shellu, ale informace a mazání chatu musejí být vedle něj na úvodu i ve hře.
- Doložený mechanismus: WelcomeScreen vlastní home-chat-close a App vlastní herní panel-heading; CrazyTypkaChatActions již implementuje pouze info/reset bez close.
- Jediná změna: assistantActions slot a společný toolbar na úvodu, stejná komponenta v herním AI panelu před existujícím close. Není potřeba nový App effect ani nový store.
- Hlavní metrika: cílené welcome/sourceUI regrese; praktickou browserovou přejímku provede root.
- Podmínky správnosti: akce nemountovat v zavřeném úvodním chatu, nezobrazovat v lidském kanálu či jiných panelech; close pouze zavírá, reset vlastní AI store; mapClose ref zůstává zachován.
- Přijetí: patch beze source driftu a všechny cílené testy PASS; browser a plná pipeline se nepředstírají.

## Varianty a podklady

Schválený SPEC _bmad-output/implementation-artifacts/key-73/SPEC.md a core handoff key-73-ui.md. Vlastní ReactNode slot je menší a bezpečnější než předávat AI store do WelcomeScreen nebo přesouvat akce absolutním CSS přes cizí DOM. CSS obou toolbarů je součástí předaného core. Připravený patch SHA-256 6c5dd602339452053b1b6c4c3b22c56f20ab35010cdf044cd3c0816a3d09e98a.

## Výsledek a refaktoring

- WelcomeScreen přijímá optional assistantActions ReactNode a mountuje jej jen uvnitř skutečně otevřeného privátního chatu. Info/reset a původní close tvoří jeden home-chat-toolbar.
- App předává shodný CrazyTypkaChatActions se stávajícím jediným AI store na úvod i herní AI kanál. V herní hlavičce jej podmínka panel===chat && aiChatActive nezobrazuje lidskému kanálu ani jiným panelům.
- Close zůstává původní closeChat / setPanel callback, nic nemaže; mapClose ref i focus/lifecycle vlastnictví zůstávají zachované. Žádné duplikované close tlačítko, další AI store nebo posluchače. Modality z core main.tsx se neopakuje.
- Test zavřeného úvodního chatu nyní kontroluje také nemountovaný action slot. Příbuzné AST/sourceUI testy zůstaly beze změny a prošly nad skutečným aktualizovaným App zdrojem.
- Změněné soubory: client/welcome-screen.tsx, client/ui.tsx, tests/welcome-screen.test.ts a tento handoff. Žádné core/shared/server/KB změny nebyly převzaty. Výchozí dirty obsah těchto tří souborů nebyl přítomen.

## Ověření

`node --import tsx --test tests/welcome-screen.test.ts tests/feedback-ui.test.ts tests/game-render-engine.test.ts tests/room-callbacks.test.ts tests/door-connection.test.ts tests/weather-preview-ui.test.ts tests/recorded-walkthrough-replay.test.ts`: 4.11.2026, exit 0, 115 PASS, 0 FAIL, 6127.2195 ms. Ověřeno i reálné App source AST pro startup, room ownership, feedback, počasí a replay.

`git apply --check .cache/key-73-ui/shell.patch` před implementací: exit 0. `git diff --check -- client/welcome-screen.tsx client/ui.tsx tests/welcome-screen.test.ts` po změnách: exit 0.

SHA-256 tří zdrojů a testů odpovídají `.cache/key-73-ui/shell-patch-manifest.json` afterSha256:

- client/welcome-screen.tsx: `f4b3f1ebd6e6b5da02a7dc272c1824d37298c651cf1858e1000f5b3fcc5380ac`.
- client/ui.tsx: `1f5faeda5460244adae7bb68dc5451c847dd47aa2b7341617c71c4d1bd01a61c`.
- tests/welcome-screen.test.ts: `02c704bcbe1277761c626c3d6e0ede9c020a31f4feabebcad249b723ed888608`.

Patch výše má deterministický hash a obsahuje přesný 30 insertions / 18 deletions diff. Patch manifest applied:false popisuje okamžik přípravy; skutečná aplikace je doložená tímto handoffem a aktuálním diffem. Cache není součástí této shell rezervace, proto se původní manifest nepřepisoval.

## Omezení a další krok

Žádný vlastní server, browser, build, tsc ani GPU proces. Core/shared/server soubory se neměnily. Tohle není browserový ani plný build PASS. Root provede produkční úvod/herní chat, CZ/EN, desktop/mobil, skutečné focus/IME a finální společnou pipeline; připravené scénáře jsou `.cache/key-73-ui/browser-qa.md`. Žádný commit/staging; integruje root. Rezervace se uvolňuje bezprostředně po předání.
