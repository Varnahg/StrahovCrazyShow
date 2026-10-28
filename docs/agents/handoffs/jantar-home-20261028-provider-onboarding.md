# Předání: jantar-home-20261028-provider-onboarding

- Vlastník/integrátor: jantar-provider-01a17fd8 / jantar-root-01a17fd8; KEY-66.
- Kopie C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow, codex/jantar-home; základ62ba8c870082b1a3897d8f580d81dbd4005ca481 (rodiče bd8174d3 + přijatý main86e4dd60).
- Výsledek: jediná obsahová vazba provider instrukce nyní odpovídá schválenému Jantar toku. Jediný multiplayer CTA otevře jméno/postavu a potvrzení vstoupí do společného světa. Odstraněna neexistující nabídka sólo vstupu.
- Vlastní změny: server/crazy-typka-provider.ts (jedna instrukční věta), tests/crazy-typka-provider.test.ts (asserty skutečně dodaných instructions), toto předání a ignorovaný cache log. Původní RAG vlastník soubory výslovně předal po release; žádný jeho WIP převzat nebyl.
- Podklady/varianty: audit přijatého main a aktuální WelcomeScreen; pouhé skrytí tlačítka nestačí pro AI radu, změna guest API není potřeba. Výběr zaznamenán v docs/home-design/20261028/decision.md před implementací.
- Refaktoring: zůstává jediná sdílená definice a stávající fake provider fixture. Žádný další stav, cache, timer, transport ani změna SQL/moderace/citací/lifecycle. Runtime UI popisy nejsou duplikované v novém API.
- Ověření28.10.2026: přímý `node --import tsx --test tests/crazy-typka-provider.test.ts` exit0,7/7; `.cache/jantar-home-20261028-provider-onboarding/tests-01.log`. Po formátování společná contract sada exit0,62/62; `.cache/jantar-home-20261028-validation/combined-contract-tests-01.log`. Prettier a scoped diff check prošly. Žádná placená služba se nevolala.
- Současně navazující samostatný chat scope přidal test skutečného client validatoru a compact renderu pro dvě nové SÚZ/SHerna citace. Není to další serverová změna tohoto tasku.
- Procesy: žádné vlastní pomocné procesy nezůstávají; nepoužit GPU/port/build/fullsuite. Staré candidate02/build03/4276/4182 nedotčeny.
- Omezení: kombinovaný build/CI a plná 3D přejímka patří validačnímu tasku;7 provider regresí nejsou jeho přijetím. SHA konkrétního zdrojového commitu je doložen následným Git checkpointem integrátora, nikoli vlastním odkazem v tomto souboru.
- Rezervace se uvolňuje po tomto předání/commitnutí. Stav katalogu a přijetí integrace aktualizuje koordinátor.
