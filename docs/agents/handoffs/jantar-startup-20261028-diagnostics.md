# Předání: jantar-startup-20261028-diagnostics

- Vlastník `jantar-startup-helper-01a17fd8`, příjemce koordinátor `/root` a Game integrátor `/root/map_assets`.
- Cwd `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`, větev `codex/jantar-home`, výchozí commit `0d957a1ba0f53baeeef894b13791da857663d6fe`.
- Výsledek: opt-in číselná pozorování již prováděné přípravy. Samotný opakovaný startup timeout tím není opraven ani přijat. Game integrace a skutečný runtime záznam patří navazujícímu vlastníkovi.
- Vlastní verzované změny: pouze `client/light-preparation.ts`, `tests/light-preparation.test.ts` a toto předání. Pomocné nástroje, baseline source, diff a důkazy jsou v `.cache/jantar-startup-diagnostics-20261028/`.
- Task byl před clean claimem ověřen v jeho aktuálním zúženém rozsahu. Nový collector, strict-material/pipeline ani jejich testy nebyly změněny. Spec/katalog, cizí staged obsah, Game, hrané4278/4280 i D snapshot zůstaly pod svými vlastníky. Rozpracované parentovy spec/předání/tasky a trees koordinační změny nebyly převzaty.

## Podklady a volba

Přečteny aktuální AGENTS, BMAD policy, task, SPEC a research ve `_bmad-output/implementation-artifacts/jantar-home-20261028/startup-timeout/`. Jde o konkrétní delegaci projektu bez dalšího BMAD workflow. Zdroj přípravy a testy byly prozkoumány v předchozím čtecím auditu a znovu před změnou.

Reálný focused GL2 timeout provedl891ticků,95renderů a40732kontrol během30.020s, ale neukázal retry/frontu ani pre/post-draw false výsledek. Problém nelze napravovat zvýšením limitů nebo vynecháním gate. Varianty s novými readiness sondami/cache introspekcí, callbackem do externího observeru nebo odlišným schedulerem by přidaly chování a rizika. Zvolený malý opt-in souhrn počítá jen už známé booleany a délky interních front. Nemá externí callback, hodiny ani přístup k metadatům.

Přesné API bylo před Game integrací předáno rootovi a map_assets a root je výslovně schválil. Game collector zůstává lokální v Game od jiného zapisujícího agenta.

## API a implementace

Bez nového importu nebo factory. `LightPreparationOptions.diagnostics?: boolean` je aktivní pouze pro `=== true`. Export `LightPreparationReadiness`; `LightPreparationResult.stages[].readiness?` má přesně13číselných polí:

| Pole                                              | Význam                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `collections`                                     | Počet získání skutečné aktivní mesh fronty                                       |
| `queueLength`, `cursor`, `retryLength`            | Poslední stav právě zpracovávané fronty a retry před terminálním cleanup/restore |
| `queuePeak`, `retryPeak`                          | Největší pozorované délky v dané stage                                           |
| `retryPasses`                                     | Přechody na frontu meshů, které skutečná kontrola vrátila jako nepřipravené      |
| `meshFalse`                                       | Počet již provedených check výsledků false                                       |
| `batchYields`                                     | Nedokončené dávky předané další iteraci; bez nové klasifikační sondy času        |
| `effectsFalseBeforeDraw`, `effectsFalseAfterDraw` | Již provedený agregovaný effectsReady vrátil false před/po potvrzovacím draw     |
| `readyDraws`                                      | Aktuální počet po sobě potvrzených draw, maximálně2                              |
| `capped`                                          | Číselný0/1indikátor saturace některého pole                                      |

Všechny délky/čítače mají strop1000000; tvar a velikost výstupu jsou pevné. Jde o pozorování řetězce, nikoli identifikaci konkrétního shaderu nebo důkaz příčiny čekání. Aggregate `effectsReady` může zahrnovat více skutečných Game gate, které rozliší Game writer.

Výchozí vypnutý režim nevytváří stage readiness objekt ani jeho result property. Nové větve nepřidávají žádné check/effectsReady/render/clock volání. Snapshot čísel se při ukončení bere před cleanup/restore, ale původní časování saveStage a pořadí externích callbacků zůstávají stejné. Nová stage před prvním úspěšným collect nepřebírá frontu předchozí stage při apply chybě. Výstup obsahuje jen čísla, žádné mesh/effect/engine reference ani jejich jména, identity, metadata nebo pakety.

Cílený refaktoring sjednotil vytvoření číselného stage stavu, saturaci čítačů a snapshot. Původní retry/fronta, batch4ms/count cap, revision, dvě ready draw, timeout, visibility, dispose a restore zůstávají ve stejném řetězci. Ostatní formátování souborů bylo ponecháno; formátovány jsou jen přidané rozsahy.

## Ověření a důkazy

Přímý Node, bez package manageru. Logy finálních kontrol mají příkaz, UTC a exit code. Původní neúspěchy nejsou přepsané.

- RED: po přidání prvních5regresí před implementací18PASS/5FAIL, exit1, `targeted-first-red.log`. GREEN první implementace23/23PASS, exit0, `targeted-first-implementation.log`.
- Finální `node --import tsx --test tests/light-preparation.test.ts`: **24/24PASS**, exit0, `targeted-final.log`. Nových6testů pokrývá opt-in/off a explicitnítrue, shodný callback/clock trace, retry/yield/pre/post false, timeout/error/dispose/hidden/restore, nepřátelské name/material/metadata gettery, pevné13číselné pole/saturaci a apply chybu bez stale fronty.
- `node --import tsx .cache/jantar-startup-diagnostics-20261028/compare-baseline.mjs`: **9scénářů ×3režimy =27přesných porovnání PASS**, exit0, `baseline-trace.log`. Používá skutečný zdroj helperu z výchozího Git commitu a aktuální testové fixture vytažené AST. Porovnává úplné pořadí a počet externích callbacků včetně hodin, lifecycle a celý původní result včetně časů. Scénáře: complete, mesh retry, effects ztráta po draw, timeout, dispose, check chyba, restore chyba, hidden/resume, apply chyba. Opt-in result se porovnává po odebrání nového volitelného numeric pole; off result je beze změny.
- Scoped TypeScript pouze `client/light-preparation.ts tests/light-preparation.test.ts`, strict ES2022/Bundler/noEmit: exit0, `targeted-types.log`.
- Přímý Prettier nad přidanými rozsahy, idempotentní check: exit0, `added-format.log`. `git diff --check` vlastních souborů: PASS.
- Opakovací lehký runner: `node .cache/jantar-startup-diagnostics-20261028/run-verification.mjs`.

Diff `task.patch` a `files.sha256.json` identifikují oba vlastní soubory, testy, baseline a důkazy. Nemám vlastní commit a výslovně předávám tento vlastní dirty rozsah rootovi k integraci.

## Procesy, limity a rezervace

Všechny vlastní Node kontroly doběhly. Žádný server, port, browser, GPU, build, fullsuite nebo instalace nebyly spuštěny. Neměnil jsem runtime ani scope ostatních agentů. CPU parity není GPU důkaz ani oprava timeoutu. Root dokončí společné typy/review/build a následně na novém rezervovaném kandidátu skutečný multiplayerový záznam, podle něhož bude zvolena samostatná oprava.

Rezervace bude uvolněna po předání a posledním manifestu; skutečný výsledek release potvrzuje závěrečná zpráva. Stav tasku a přijetí mění koordinátor.
