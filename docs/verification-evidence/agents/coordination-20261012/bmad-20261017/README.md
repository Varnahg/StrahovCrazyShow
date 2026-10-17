# BMAD 6.12.4 — ověření KEY-38

Průzkum a provedené kontroly: **17. 10. 2026**. Základ integrační worktree: `b10194bb4bc8a433d87f1ce73241277914710cfa`. [Linear KEY-38](https://linear.app/gigeconomy/issue/KEY-38/zapojit-stabilni-bmad-do-projektoveho-workflow-codexu), [návod](../../../../agents/bmad.md), [projektová policy](../../../../agents/bmad-policy.md).

## Rozhodnutí a rozsah

Uživatel zvolil oficiální projektové nástroje a automatické použití podle velikosti změny. Porovnání:

| Varianta | Přínos | Náklad / riziko | Rozhodnutí |
| --- | --- | --- | --- |
| Pouze dokumentační metoda | Malý diff, původní workflow | Ruční náhrada bez oficiálních skills | Nedostačuje zvolenému zadání |
| Pin 6.12.4 core+BMM | Oficiální Codex skills, sparse přizpůsobení | Nutné propojit vlastnictví, výstupy a review | Zvoleno |
| V7 preview | Novější distribuční model | Upstream stále uvádí preview a změny rozhraní | Odloženo |
| GDS/TEA a další moduly | Další návrhové/testovací postupy | Překryv pravidel, samostatný lifecycle; Babylon specializace nebyla doložena | Přidat až pro konkrétní potřebu |

Žádná změna herního API, rendereru, cache hry, balíčkových závislostí nebo běžících preview. BMAD ukládá vlastní obsahově adresované rendery; jejich opakované použití je ověřeno níže. Není to měření výkonu hry ani tokenové účinnosti metody.

## Primární podklady

- [Vydání v6.12.4](https://github.com/bmad-code-org/BMAD-METHOD/releases/tag/v6.12.4), zdrojový commit `bab9082c3e884e0d72c759bcd1a6d90bcc01be84`; npm integrita je v [upstream.json](upstream.json).
- [Instalátor](https://github.com/bmad-code-org/BMAD-METHOD/blob/v6.12.4/tools/installer/core/installer.js), [Codex platforma](https://github.com/bmad-code-org/BMAD-METHOD/blob/v6.12.4/tools/installer/ide/platform-codes.yaml), [renderer](https://github.com/bmad-code-org/BMAD-METHOD/blob/v6.12.4/src/scripts/render_skill.py).
- [Kontrakt přizpůsobení](https://github.com/bmad-code-org/BMAD-METHOD/blob/v6.12.4/docs/customize/customize-bmad.md), [výchozí build handoff](https://github.com/bmad-code-org/BMAD-METHOD/blob/v6.12.4/src/bmm-skills/ship/bmad-build/customize.toml), [lokální skills v Codexu](https://learn.chatgpt.com/docs/build-skills).
- Skutečné místní instrukce, katalog, registr, instalované šablony a resolvery. Historická mapa architektury není tvrzení o funkčnosti dirty stromu.

## Provedené kontroly

| Kontrola | Skutečný výsledek | Evidence |
| --- | --- | --- |
| Instalace pinované verze | PASS; core+BMM 6.12.4, 29 Codex skills, bez shims | [úspěšný log](install-success.log) |
| Běžné `pnpm dlx` v tomto prostředí | FAIL; chybějící `fast-wrap-ansi` v globálním virtuálním store | [původní log](install-failed.log) |
| Izolovaný hoisted instalační režim | PASS; pouze jednorázové parametry, žádná změna konfigurace pnpm nebo dependencies hry | [předání instalace](../../../../agents/handoffs/bmad-install-20261017.md) |
| Oficiální resolver overrides | PASS; všech 27 přizpůsobitelných skills + centrální konfigurace, původní IDs/pořadí ostatních review vrstev zachováno | [předání overrides](../../../../agents/handoffs/bmad-overrides-20261017.md) |
| Kopie v jinak pojmenovaném adresáři s mezerou, bez osobních TOML | PASS; týmová čeština a projektové hodnoty se načtou bez osobní konfigurace | [portability/reinstall](portability-reinstall.json) |
| Reinstall stejné verze v této kopii | PASS; 251 chráněných souborů beze změny; žádné ponechané root zálohy | [log](reinstall.log), [výsledek](portability-reinstall.json) |
| Renderer build i build-auto v kopii | PASS; projektový handoff v nové absolutní cestě, opakování vrátí stejnou cache generaci | [výsledek](portability-reinstall.json) |
| Integrita vendor skills a skriptů | PASS; všech 219 souborů odpovídá původní instalaci | [SHA-256 manifest](vendor-files.json) |
| Koordinační CLI | PASS; 15/15 testů, žádný skipped; spouštěno `node --test tests/agent-tasks.test.ts` na Node 24.19.0 | [log](agent-tasks.log) |
| Source secret guard | PASS; 2961 rozpoznaných textových souborů, 0 kandidátních míst; omezený podporovaný vzor, nikoli úplný audit tajemství | [výstup](source-secrets.txt) |
| Dokumentační pilot | PASS; vlastní claim autora, 26 odkazů a čtyři finální hashy, skutečný renderovaný dispatch | [pilot](../../../../../_bmad-output/implementation-artifacts/bmad-pilot-20261017/README.md) |
| Nezávislé review pilotu | Tři vrstvy; jeden low nález opraven autorem, ostatní bez nálezů; review nenahrazuje spuštěné kontroly | [review](review.json) |
| Místní odkazy zapojení | PASS; všechny kontrolované cíle existují | [seznam a počet](local-links.json) |
| Skutečná discovery v novém kontextu | PASS; 29 BMAD skills v předaném katalogu ještě před čtením disku | [zjištění a limity](skill-discovery.json) |
| Smoke kontrola v main po merge | PASS; čeština, projektové jméno, renderer a katalog | [výsledek](main-smoke.json) |

`npx` nebylo na PATH. Úspěšný příkaz používá `pnpm --config.enable-global-virtual-store=false --config.node-linker=hoisted dlx bmad-method@6.12.4 install` s projektovými parametry z návodu. Kořenová příčina chyby pnpm nebyla prokázána; doložen je rozdíl výsledků těchto dvou režimů.

## Pilot, vlastnictví a integrace

Pilot použil skutečně renderovaný `bmad-build`, připravenou [specifikaci](../../../../../_bmad-output/planning-artifacts/bmad-pilot-20261017.md) a delegovaný task s vlastní rezervací. Tři nezávislé review vrstvy vedly k jedné opravě návodu: renderer používají build/build-auto, ostatní skills mají vlastní aktivaci. Autor opravu a dotčené kontroly dokončil; koordinátor ověřil konečné hashy a odkazy. Stav/specifikace nepřebíjí přijetí integrátorem.

Funkční celek byl přijat do main v samostatném commitu `f13cc3ac44669dcecf165f452de87df8b07a8e7c`. Fast-forward změnil přesně 297 ověřených cest; všech 132 původních dirty hashů a původní git status zůstaly shodné. [Integrační výsledek](integration.json), [předání](../../../../agents/handoffs/bmad-integrate-20261017.md). Historický `changes-manifest.json` popisuje funkční commit před tímto závěrečným doplněním metadat.

[main-before.json](main-before.json) zachycuje 132 původních dirty cest v hlavním checkoutu. [coordination-inputs.json](coordination-inputs.json) dokládá synchronizované koordinační vstupy: jejich cizí změny nejsou součástí BMAD commitů. Samostatný společný `docs/verification.md` drží jiný vlastník; tato evidence jej nepřepisuje.

Read-only kontrola již otevřené hry zjistila aktuální Edge tab `2070822960`, URL `http://127.0.0.1:4193/?renderBackend=webgpu` a klientský vstup `/assets/index-CtGFMOVW.js`. Nebyla provedena navigace, reload, změna vstupu ani spuštění další scény. [Pozorování a limity identity](playtest-observation.json). Historický handoff pro 4192 nebyl zaměněn za aktuální klienta.

## Limity

- Rezervace a BMAD policy jsou kooperativní; nejde o oprávnění souborového systému ani automatický scheduler.
- Upstream obsahuje obecné věty o stagingu dirty stromu a minimu review nálezů. Projektová policy a overrides je výslovně nahrazují; vendor soubory se kvůli tomu neupravují.
- Kontrola whitespace projektových úprav prošla. Celý vendored diff hlásí zachované whitespace ve třech upstream souborech; zdrojové bajty se plošně neformátují. [Přesný výsledek](diff-check.json) odlišuje tento nález od projektových změn a zachovává CRLF instalačních logů.
- Tento dokumentační/configurační celek nepoužil herní full suite, build, integraci ani GPU. Zůstávají mimo jeho důkazní rozsah.
- Automatická dostupnost skills v již běžící relaci vyžaduje načtení nové konfigurace; filesystem a skutečný renderer se ověřují samostatně od UI nabídky hostitele.
