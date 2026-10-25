# Předání: b6-door-server-20261024

- Vlastník: `b6-server-r2` (`/root/cad_b1_probe_review`); příjemce: `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, `codex/b6-photo-refinement-20261024`, baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Výsledek: autoritativní dveřní server adapter a zapojení do `StrahovRoom`, cílené skutečné Rapier/Actor testy a připravený veřejný SDK harness. Živá SDK/server integrace nebyla spuštěna; zdroj a port 2568 musí rezervovat root. Frozen2591 zůstává beze změny.

## Přesné vlastní změny

1. `server/door-interactions.ts` — nový bounded transport/tick adapter nad přijatým shared core.
2. `server/index.ts` — 52 přidaných řádků: room-owned instance, message handlers, tick flush, snapshot/revision a lifecycle.
3. `tests/cad-door-network.test.ts` — malé reálné Rapier/Actor fixtures, bez konstrukce celého světa/serveru.
4. `scripts/integration-cad-doors.ts` — připravený autentizovaný SDK test pouze pro `http://127.0.0.1:2568`.
5. Toto předání a ignorovaná `.cache/b6-door-server-20261024/`.

Shared core/Simulation/netcode/CAD metadata/UI/renderer mají jiné vlastníky. Nebyly upraveny. Nebyl upraven `scripts/test-integration.mjs`, package/lockfile ani žádný source CAD/model asset. Žádný staging/commit. Výchozí cizí dirty stav zachován.

## Průzkum, varianty a volba

Přečten skutečný `StrahovRoom`: autorizované `onAuth/onJoin`, connection map, input queue epoch, `actor.step → sim.tick`, authority/respawn cesta, `onLeave/onDispose`, obecná privátní HTTP hranice. Prohlédnuty SDK integrační harnessy a `ScriptTimelineClient`. Shared core předchozího tasku už doložil okamžitou změnu Rapier query při přepnutí dvou persistentních póz.

- Přímá změna ve websocket callbacku by neměla jednoznačnou fyzikální tick fázi a dovolila by jiné pořadí vůči predikci; odmítnuto.
- Zpracování před `actor.step` by bylo možné, ale používá jiný časový kontrakt a nemá vypočítané next kapsle. Root zvolil flush po všech Actor krocích, před řádným physics krokem.
- Zvolena bounded fronta autentizovaných požadavků, čtyři pending kopie na hráče, zachování pořadí přijetí napříč hráči. Shared store dál uplatňuje čtyři nové pokusy/s, revision, range, LOS a all-player sweep. Zpráva neobsahuje důvěryhodnou hráčskou polohu.

`server/door-interactions.ts` sdružuje queue/identity/guard/delta lifecycle; `server/index.ts` obsahuje jen zapojení existujících fází. Při idle bez pending požadavků se netvoří capsule list. Všechny požadavky jednoho ticku sdílí aktuální current/next list. Manager nealokuje collidery, nemá world.step a nevlastní physics dispose.

## API a důležitá fáze ticku

`new ServerDoorInteractions(sim, definitions, identity, {isCurrentConnection, sendResult, broadcastDelta})`.

- `receive(connection, authenticatedActorId, raw)` ověří aktuální connection/actor, uloží pouze bounded parsed copy; libovolný klientský actor/XYZ/eye je neplatný payload.
- `flush(tick, performanceNow)` běží **po všech `Actor.step`, před `sim.tick`**. Používá serverovou polohu, kanonické eye offset +0.6 m uvnitř stojící kapsle, vehicle flag a `sim.doorCapsules()`.
- Při úspěchu synchronně přepne fyziku a shared stav, jednou broadcastne `doorDelta`, potom odpoví `doorResult`. Následuje řádný physics tick a autoritativní pohyb.
- `doorResult` obsahuje identity, global `revision`, status, reason/requestId a případný současný door state; nepřenáší znovu delta.
- `snapshot(tick)`, `revision`, `identity`, `pendingCount`, `forgetActor(id)`, idempotentní `dispose()`.

**Replay:** delta tick T je výsledný stav po T. `Actor.step` pro T musí používat dveře z T−1, změnu T aplikovat až po vypočítání actor movement a před world.step. Přepnutí otevření už před `actor.step` T by vytvořilo jednoframový rozdíl vůči serveru. Koordinátor byl na tento konkrétní kontrakt upozorněn před integrací Game.

Room identity je jeho `roomId` a společný `CAD_DOOR_DEFINITION_HASH`. `doorRequest` jen enqueuuje. `doorResync` posílá complete snapshot aktuálnímu připojení a má limit 2/s. Před welcome/first authority se posílá complete `doorSnapshot`, včetně všech zavřených dveří. Obecná resync a respawn autorita dostanou snapshot před sebou. Každá skutečně vyslaná authority v této třídě nese `doorRevision` a `doorWorldEpoch` (včetně přímé respawn větve).

Odpojení odstraní pending/dedupe/rate vlastní relace, nikoli světový stav dveří. Pozdější nový klient dostane aktuální snapshot. Stará connection je znovu odmítnuta i při flush. Manager dispose probíhá před Simulation dispose; nevytváří se žádná host/public HTTP cesta ke dveřím.

## Ověření 2026-10-25

`pnpm exec tsx --test tests/cad-door-network.test.ts`: **5/5 PASS**, exit0, poslední TAP duration5.32s; `.cache/b6-door-server-20261024/network-refactored.log`. Původní5/5 log `network-first.log` zachován.

Scénáře: queued požadavek nic nemění před tickem; přesně jeden delta broadcast a stejné timeline obou klientů; late join open snapshot; duplicate inertní; position spoof/foreign world/far request/old connection odmítnuty; current→next druhého skutečného Actoru blokuje open i close; oba klienti soupeří o jedinou revision; skutečná zeď blokuje server LOS; bounded queue/rate; reconnect/late flush a vlastnictví physics cleanup. Jde o transport adapter fixtures s reálnou fyzikou, nikoli o skutečné socketové připojení.

Targeted TypeScript check pro všechny čtyři TS soubory: **PASS exit0**, `.cache/b6-door-server-20261024/typecheck-final.log`. První pokus odhalil pouze generic inference `unknown` ve fixture transport callbacku; opraven explicitním `ServerDoorInteractions<Connection>`, původní log zachován. `git diff --check -- server/index.ts` PASS. Prettier formátoval jen vlastněné soubory; diff server/index je čistě nový integrační kód.

## Připravený SDK harness

Root na vlastním čerstvém izolovaném serveru2568:

```text
pnpm exec tsx scripts/integration-cad-doors.ts --boundary-only
pnpm exec tsx scripts/integration-cad-doors.ts --approach path/to/source-route.json
```

Volitelně `STRAHOV_CAD_DOOR_EVIDENCE` určuje JSON evidence výstup. Script sám server nespouští, nemá administrativní pozicový endpoint a nevytváří teleport. Vyžaduje publikovanou skutečnou native mainentry door definition; placeholder prázdné dveře nejsou PASS.

`--boundary-only` má explicitní evidence status `boundary-pass`, physicalPassageVerified=false. Ověří auth/protocol/guest/privateHTTP hranici, complete closed snapshot před welcome/authority, společnou identity, range/foreign-world rejection, nulový delta fanout a explicitní resync. Nepředstírá skutečný dveřní průchod.

Plný `--approach` režim očekává JSON `{schemaVersion:1, definitionHash, provenance, waypoints:[{x,z},...]}`; nejvýše100 finite bodů. Route začíná normálním SPAWN a končí před native mainentry přístupem. Body modelu, schodiště a poslední outside/inside body bere z `CAD_B6_ENTRY`. Použije pouze `ScriptTimelineClient` běžné vstupy, otevře E, ověří delta observeru/duplicate a dalšího late klienta v otevřeném stavu, projde dovnitř a ven, zavře a zkusí reálně projít zavřeným prahem. Teprve pak physicalPassageVerified=true.

Doložená veřejná SDK trasa z SPAWN110,12 k B6 nebyla v tomto úzkém tasku změřena; root ji musí dodat/ověřit. Existující native vstupní worldfixture začíná až severně od B6. Nebyly vymyšleny teleporty ani cesta přes cizí stavby. Harness vyžaduje čerstvý server/revision0; není určen k živému uživatelskému světu.

## Snapshot, procesy a předání

- `handoff-manifest.json` obsahuje SHA256 všech vlastních souborů včetně testu/scriptu/handoffu; readonly dependencies zachycují skutečný souběžný shared stav při předání.
- Žádné živé vlastní helpery, síťový server, port, Blender, GPU či build. Cílené CPU procesy skončily.
- Fullsuite/build/live SDK/full native world se z tohoto tasku nespouštěly. Root vlastní integrační a publikační rezervace.
- Po manifestu se rezervace uvolní příkazem release, potvrzení a SHA přijde koordinátorovi. Koordinátor přebírá přesné soubory a doplní skutečné integrační důkazy; release není konečné přijetí hry.
