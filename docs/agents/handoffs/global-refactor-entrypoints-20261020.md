# Předání: global-refactor-entrypoints-20261020

- Vlastník: `refactor-01a15658-entrypoints`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`; HEAD při převzetí `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`.
- Výsledek: obě přidělené extrakce, cílený refaktoring a přesné task ověření dokončeny, připraveno k nezávislému review/integraci. Žádný staging, commit, task/spec edit nebo rekurzivní BMAD.
- Změněné cesty: `client/game.ts`, `client/ui.tsx`, `tests/room-callbacks.test.ts` a toto předání. Do `client/session-diagnostics.ts` se nezapisovalo.

## Vstup, převzetí WIP a průzkum

Task a aktuální `spec-maintenance.md` byly před zahájením znovu načteny. Přesné předání `_bmad-output/implementation-artifacts/global-refactor-20261020/entrypoints-transfer.json` má SHA-256 `cca7afb482fbbf0359e7e64ab2a9b30f2e7894862820e94b47b105265be145bc`, sender `refactor-01a15658-audit`, receiver přesně `refactor-01a15658-entrypoints`. Odkazuje na přijaté předání runtime binding cleanupu; primary checkout WIP je výslovně vyloučený.

Čerstvý proof před claimem potvrdil všechny tři vstupní hashe:

| Cesta | SHA-256 vstupu |
| --- | --- |
| client/game.ts | dc0e1adb323e5d5c3b42b3688da0c4b98b20ad6f549f3fda1b4a12e166f2f842 |
| client/ui.tsx | 3a008a9cc997c3a9c68b32d351ef17a0872e2532dc42643be9936fae42c284ee |
| tests/room-callbacks.test.ts | 4cf87fe16a29b010ccb7ed274f5e3b91d0d3530966794a3e18e5eefadcc9588d |

Read-only společný registr neměl kolizi. `claim --task global-refactor-entrypoints-20261020 --owner refactor-01a15658-entrypoints --adopt-dirty` uspěl a převzal právě dvě doložené dirty cesty Game/UI; room-callbacks byl čistý. Cizí rozpracované změny nebyly převzaty ani upraveny. Předaný runtime cleanup zůstává součástí výsledku, jeho původ si tento task nepřivlastňuje.

Předchozí objednaný read-only audit prošel celé Game/UI/SessionDiagnostics a relevantní callery/testy. Před implementací zde znovu ověřeno skutečné aktuální AST: **dva shodné pose bloky a pět shodných reset trojic**, po původním import cleanupu. Dočteny skutečné VM memberlisty v room-callbacks, actual Game interpolation/recovery/replay fixtures a reset lifecycle NetworkProbe/NetworkTimeline. Žádná hypotetická startup oprava ani změna limitů.

## Varianty a vlastní delta

Game: ponechání duplicit znamená dvě místa údržby téže hranice interpolace. ToRef/pool/reuse by změnil vlastnictví a historii póz, externí helper by zbytečně otevíral API. Zvolen privátní `capturePreviousCarPose()` ve stejném Game souboru. Obsahuje přesné původní `const carPose = this.sim.car.getVisualPose()` a přiřazení nového objektu se `new Vector3` a `new Quaternion`. Dva původní bloky nahrazeny voláním přesně na jejich místech: po `previousPosition.set` v reconcile a po `previousPosition.copyFromFloats`, před `actor.step` v applyStep. Zůstává jedno čtení getVisualPose a **tři čerstvé výsledné objekty na každé zachycení**, žádná normalizace/cache/reuse. Cena je jedno volání privátní metody navíc; zrychlení se netvrdí.

UI: velký společný reset všech sítových bufferů by porušil odlišné pořadí bootstrap/authority/sender větví, sloučení efektů by zasáhlo dependency/timer lifecycle. Zvolen lokální `resetConnectionDiagnostics()` v App pouze pro přesnou trojici `networkProbeRef.current?.reset()` → `game.current?.networkTimeline.resetRttSelection()` → `game.current?.resetDiagnosticContext()`. Volá se na pěti původních místech: timer cleanup, bind, současný onLeave, změna identity před bind a explicitní leave. Každý krok znovu čte současný ref; žádný objekt se nezachycuje ani necachuje. Ostatní resety, pořadí vůči nim, efekty, dependency pole a timery zůstaly. Lokální helper přidává jednu closure při běhu App a jedno delegované volání na reset; nemění vlastnictví prostředků.

Vlastní testová delta: skutečné AST helpery doplněny do VM memberlistů a callbackNames, přidáno osm kontraktních testů. Zachované původní aserce a limity. Veřejné Game API, validace, řízení, rendering i celý předaný import/parametr cleanup se neměnily.

## Důkazy a skutečné ověření

1. Před produkční změnou přidáno sedm behaviorálních kontraktů nad **původními skutečnými bloky**. Příkaz:

   ```text
   node --import tsx --test --test-name-pattern='captures one detached fresh|resets probe, timing confidence' tests/room-callbacks.test.ts
   ```

   Exit 0, **7 PASS / 0 FAIL / 0 SKIP**, 1574.886 ms. Dva pose testy vykonávají celé skutečné metody reconcile/advanceSimulation přes AST. Ověřují pořadí `pose → actor.step → sim.tick → input-frame`, respektive `actor.restore → pose`, aktuální previousPosition v okamžiku čtení, konkrétní neznormalizované složky rotace, nezávislost na dalších mutacích zdroje a tři odlišné reference při opakovaném zachycení. Pět UI testů vykonává skutečné callbacks/efekt a ověřuje probe→timeline→context; identity-change přirozeně obsahuje dvě trojice, protože následuje bind.

2. Po extrakci jsou v obou VM selektorech skutečný privátní `capturePreviousCarPose`, v callbackNames skutečný lokální reset helper. Osmý test mění game ref uvnitř probe resetu a znovu uvnitř timeline resetu; kontext se musí resetovat na nejnovějším vlastníkovi, nikoli na zachyceném starém objektu. Následný null ref reset je no-op.

3. Nezávislý AST proof: nové definice helperů se odstranily a jejich skutečná těla se rozbalila zpět do **2 + 5** callsiteů. Kanonický tisk celých zdrojů (bez komentářů) má přesně stejné SHA před/po:

   | Zdroj | SHA-256 kanonického AST před a po rozbalení |
   | --- | --- |
   | Game | 9048ef27f7cebfd70e291db6dedcb80eb4bacdcec79dff4f6aa4370d757550eb |
   | UI | cfeec0ddef8858c37716dfc704de1256f479aeb0c7ad9c4297311f0a7421e2cd |

   Exit 0. To dokládá čistou extrakci proti skutečně předanému vstupu včetně zachování binding cleanupu, všech ostatních deklarací, validací a efektů; nejde o ručně přepsaný oracle algoritmus.

4. Přesný task příkaz, 20. 10. 2026:

   ```text
   node --import tsx --test tests/game-interpolation.test.ts tests/client-recovery.test.ts tests/prediction-replay.test.ts tests/room-callbacks.test.ts
   ```

   Exit 0, **72 PASS / 0 FAIL / 0 SKIP**, **22205.6496 ms**. Zahrnuje osm nových kontraktů i původní fixed-step/interpolation při 60/144 Hz, skutečnou Rapier recovery/replay, stale authority, same-identity frontier, source telemetry ownership, current/stale room callbacks, timer cleanup a startup success/failure/cancel scénáře. Kompaktní koncový stdout:

   ```text
   tests 72
   suites 0
   pass 72
   fail 0
   cancelled 0
   skipped 0
   todo 0
   duration_ms 22205.6496
   ```

5. `git diff --check -- client/game.ts client/ui.tsx tests/room-callbacks.test.ts`: exit 0. Žádný testový limit nebyl změněn.

## Identita předaného výsledku

Manifest zahrnuje celý aktuální zdrojový/testový payload, jehož předané runtime cleanup řádky zůstávají zachované. SHA-256 `JSON.stringify` pole objektů `{path,sha256}` v následujícím pořadí: **`328faa4f8d7edf6c8649e0e49c9731e991d571d4f141db7490a36c7bb01eeffc`**. Toto vlastní sebereferenční předání je mimo manifest.

| Soubor | SHA-256 výsledku |
| --- | --- |
| client/game.ts | 531462762b4b0cc48a67c56fc7133fb6e8936d26dba35702a9fe3152215845e8 |
| client/ui.tsx | 77c02c8b01fdaa628b64481dd3aebf93d0d1c883e127d8c031c241343446d50b |
| tests/room-callbacks.test.ts | 3981d4cc082981e0c41cc25056dbdac3fd0a892141e49269b2842e14bddf0491 |

## Procesy, limity a integrace

Vlastní procesy byly pouze ukončené CLI (rezervace, AST kontroly a dva CPU test runnery); žádný vlastní server/port/browser/GPU/Blender nezůstává. Testy nepouštějí skutečnou hru; GPU/FPS závěry se z nich nevyvozují. Plná sada, build, integrace ani nový produkční walkthrough zde neběžely, jsou odpovědností koordinátora nad stabilním checkpointem. Koordinátor má samostatné dřívější PR13/frozen browser důkazy; tento task je nevydává za nové praktické ověření své změny.

Výsledek je předáván příjemci `refactor-01a15658-audit` k nezávislému review, ověření manifestu, společnému checkpointu a samostatnému commitu/integraci. Task stav se zde nemění. Po doručení následuje standardní CLI release, jeho skutečný čas/výsledek potvrdí závěrečná zpráva a registr; poté se do scope již nebude zapisovat.
