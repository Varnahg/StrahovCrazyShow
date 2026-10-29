# Předání: rag-ui-20261029-viewport-loader

- Vlastník: `viewport-loader-20261029-agent`; příjemce: RAG/UI koordinátor `/root`, Linear KEY-69.
- Cwd: `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`, větev `codex/automated-document-rag`, pracovní HEAD `0484541ce3756c8ae0b7b118772021b2e3aae646`.
- Accepted base: main `8d3e69eccbce326ea198351507b5ea3a52e7cf82` po PR37. Před změnou `git diff <accepted> HEAD -- <šest existujících source/test cest>` byl prázdný; sedmý helper je nový.
- Výsledek: implementace a navazující oprava velmi nízkého viewportu předány; aktuální manifest a 21/21 CPU výsledky jsou v dodatku níže. Vizuální QA opravy, přijetí a integrace jsou u koordinátora. Žádný commit ani změna stavu tasku na done.

## Implementace

- Úvod a editor sdílejí pevný viewport shell s řádky navigace/obsahu/launcher. Editor má jediný vnitřní scroll v `.home-profile-scroll`; CTA zůstává mimo něj. Velikost dokumentu se obsahem editoru nezvyšuje. Velmi nízký úvod a loader mohou posouvat svůj obsah.
- Kořen dokumentu je tmavý. Dekorativní mapa vyplňuje oba rozměry kontejneru; využívá již existující SVG `preserveAspectRatio="xMidYMid slice"`. Barvy Jantar, font a obsah úvodu zůstávají.
- `useViewportHeight` drží pouze lokální ref a event listenery. Změny výšky/posunu visual viewport zapisuje přímo do dvou CSS proměnných, stejné hodnoty deduplikuje; žádný React state, polling ani frame smyčka. Při pinch zoom scale mimo 1 ponechá layout stabilní. Cleanup odstraní listenery i proměnné a odmítne opožděný callback; bez API používá window resize.
- Přechod na profil fokusuje nadpis, aby telefon automaticky neotevřel klávesnici. Prázdný nickname při submit stále fokusuje skutečný vstup. Nickname a chat textarea mají 16px font; chat používá dostupnou výšku shellu a sticky composer. Zoom není zakázaný.
- Loader sdílí Jantar tokeny a glass materiál, zobrazuje SCS/Strahov Crazy Show a lehkou světelnou geometrii. Aktuální skutečná fáze zůstává hlavní informace. Procenta ani nové readiness se nezavádějí. Error/ready/reduced-motion zastaví animovaný motiv. Návrat, feedback, compatibility notice a recovery zůstávají.
- Cílený refaktoring: barevné tokeny sdílené úvodem a loaderem; jednoduchý deduplikovaný viewport observer s jediným lifecycle. Globální CSS změna pouze tmavý kořen a vyloučení startup tlačítek z konkrétního in-world skinu. Herní canvas, renderer, `ui.tsx`, `game.ts` a startup runtime jsou beze změn.

## Ověření 29. 10. 2026

Přímý Node v24.22.1, bez pnpm synchronizace a bez instalace:

1. `node --import tsx --test tests/welcome-screen.test.ts tests/startup-progress.test.ts` — exit 0, **20/20 PASS**, žádný skip. Log `.cache/rag-ui-20261029-viewport-loader/targeted-tests.log`.
2. `node node_modules/typescript/bin/tsc --project .cache/rag-ui-20261029-viewport-loader/tsconfig.scoped.json --noEmit` — exit 0, strict TypeScript PASS. Log `scoped-ts.log` ve stejném adresáři. Config dědí projekt a zahrnuje tři upravené TS moduly a dva testy s jejich importy.
3. `git diff --check` — exit 0.

Nové testy ověřují keyboard resize/pan, deduplikaci, pinch zoom a návrat, fallback bez visualViewport, neplatné míry, cleanup všech listenerů/opožděných callbacků a nový mount. Loader testuje všechny fáze v CZ/EN, značku, absenci procent, fallback pořadí a ready. Zachované testy pokrývají deferred editor, presence, skutečné fáze, chybu a recovery.

Bez buildu, plné sady, integrace, browseru, GPU, serveru, API volání nebo měření výkonu. Vizuální chování a reálná mobilní klávesnice nejsou těmito CPU testy prokázané; koordinátor připravuje samostatnou produkční UI kontrolu s nedostupným GPU preview. Živé 4278/4280 zůstaly beze změn.

## Původní snapshot a vlastnictví

Manifest `.cache/rag-ui-20261029-viewport-loader/manifest.json`, SHA-256 `cc15259e65d2e0aed7d9374261da8ef5471ff91c3a413e18c67dca0963e3978c` (2026-10-29T11:39:22Z), zahrnuje všech sedm source/test výstupů:

| Soubor | SHA-256 |
| --- | --- |
| `client/style.css` | `5fbe186d0045d897a2c4a10b01c315b427fbca708ef26e28dbfc8db39ca8fa29` |
| `client/welcome-screen.css` | `dadad07b9885ec1f5b371646f80f5661942227f47da32f2e36b52e9cc21d3595` |
| `client/welcome-screen.tsx` | `ab881a33047efc3b44bfa0c734212651d7862115b54ec1b02107a17475a63a56` |
| `client/loading-screen.tsx` | `766f69d2abbe74b168461cfdaeedc3ab35099bb0578172db319bd5af1969a60c` |
| `client/use-viewport-height.ts` | `fa5855231d777307b1f82e69ff94c0a664241fc71f56fd3423c7f76bb750ab37` |
| `tests/welcome-screen.test.ts` | `d467edb8c677fa953f218f38fc1d9354ab75c0f2666989522237ccf43dc8f27c` |
| `tests/startup-progress.test.ts` | `0afba07219535011abbcd2383a059c31e89239517c5cfda0e7d1d4442dd5cf20` |

Cizí WIP byl jen přečten ve statusu, nic nebylo převzato nebo měněno. Vlastními dalšími výstupy jsou tento handoff a uvedená cache s konfigurací/logy/manifestem. Žádný dlouhožijící pomocný proces ani port nevznikl; CPU procesy skončily. Podklady: stávající kód a průzkum tasku; [Chrome viewport behavior](https://developer.chrome.com/blog/viewport-resize-behavior/) a [W3C CSS Values](https://www.w3.org/TR/css-values/), čteno 29. 10. 2026. Změna je návrh UI bez tvrzení o výkonové optimalizaci.

Rezervace bude uvolněna bezprostředně po zapsání předání; převzetí, vizuální QA, přijetí a integraci eviduje koordinátor. Dirty soubory nadále patří tomuto předanému celku.

Integrátor převzal přesný source diff po release pod `rag-ui-integrator-01a17e9d`. Skutečné QA candidate2 uzavřelo i nízký viewport: přezdívka vyplněna a CTA dosažena při390×244 a844×200. Pinch scale2, reduced-motion a loader recovery PASS, žádné pageerror. Úzké re-review původní P2 uzavřelo bez dalších nálezů. Úplná evidence a omezení GPU preview jsou v `rag-ui-validation-20261029.md`; main přijetí ještě vyžaduje CI přesného exportu.

## Dodatek: oprava nízkého visual viewportu, 29. 10. 2026 11:48 UTC

Koordinátor doložil na neměnném candidate1 při 390×244 a 844×200, že pevný header/CTA/launcher smršťují vnitřní scroller editoru k nule. Screenshoty jsou v `.cache/rag-ui-validation-20261029/snapshot-candidate1/screenshots/` (`390x244-short-profile.png`, `844x200-short-profile.png`). Ostatní kontrolované běžné viewporty dle koordinátora prošly; tento agent prohlédl oba uvedené snímky, browser nespouštěl. Candidate1 nebyl změněn.

Původní autor znovu získal stejný task přes `--adopt-dirty` s tímto handoffem. Oprava je pouze ve třech přidělených souborech: `client/use-viewport-height.ts`, `client/welcome-screen.css`, `tests/welcome-screen.test.ts`.

- Při skutečné dostupné výšce ≤420 CSS px observer nastaví `data-compact-viewport`. Tato mez ponechává běžný onboarding beze změny a přepne keyboard/nízký viewport do přirozeného toku.
- Celý bounded `.welcome-screen` je v tomto režimu jediný scroller; navigace, celá karta, CTA a launcher mají přirozenou výšku a jsou dosažitelné posuvem. Vnitřní editorový scroller už nemá omezenou výšku. Pozadí a otevřený chat zůstávají ukotvené v aktuálním viewportu. Dokument sám neroste.
- Atribut se mění v již deduplikovaném event callbacku. Pinch zoom nemění zvolený layout; cleanup odstraní atribut. Žádný nový observer, timer, React state ani veřejné API.
- Nový test drží layout/window výšku 900 a snižuje pouze visualViewport na 420/244/200; ověřuje režim, mez 421, pinch zoom a cleanup. Test nelze nahradit media max-height, které zde neodpovídá dostupné výšce.

Opakované `node --import tsx --test tests/welcome-screen.test.ts tests/startup-progress.test.ts`: exit 0, **21/21 PASS**, log `targeted-tests-low-viewport.log` ve vlastní cache. Stejný scoped strict TS: exit 0, log `scoped-ts-low-viewport.log`. `git diff --check`: exit 0. Nový skutečný vizuální průchod čeká u koordinátora; v tomto režimu je třeba posouvat `.welcome-screen`.

Aktuální úplný manifest sedmi source/test cest je `.cache/rag-ui-20261029-viewport-loader/manifest-low-viewport.json`, SHA-256 **`ae49e0f7f1abf4c3452b846b88b380addf9873d56d432c286a3d33f569e8af27`**, čas 2026-10-29T11:47:58Z. Oproti původní tabulce se změnily pouze tyto hashy:

| Soubor | Aktuální SHA-256 |
| --- | --- |
| `client/welcome-screen.css` | `7360e3a08b7e9bcbdbed03a97d8f689e21d35a0108bdfe66d867beb09d35103e` |
| `client/use-viewport-height.ts` | `8f5afe92b5d4d9f036ad529d3718a47ea0b4093da65f8af3848f785aca7d00fa` |
| `tests/welcome-screen.test.ts` | `235fa2c3aacd57573aaf1842f1bc87d76eeed1a48f2a81f93b13fa5f331d0757` |

Vlastní procesy skončily; žádný port, GPU ani build. Po tomto dodatku autor opět uvolňuje rezervaci a předává stabilní source koordinátorovi.
