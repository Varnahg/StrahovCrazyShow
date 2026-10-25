# Předání: b6-game-door-validation-20261025

- Vlastník: `b6-game-test-r2` (`/root/cad_b1_probe_review`); příjemce: `/root`.
- Cwd: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`; baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Výsledek: opravená společná AST fixture se zachovanými původními assertions a nové testy skutečných metod Game nad malým skutečným Rapier/Actor světem. Dvě runtime chyby doloženy RED; root je opravil ve svém Game scope a výsledná sada je **56/56 PASS**.

## Vlastní soubory a rozsah

- `tests/room-callbacks.test.ts`: doplněny skutečné nové dependencies, pouze27 přidaných/3 nahrazené řádky. Actual DoorConnection, jedna explicitní malá door definition a její hash, owner ref, snapshot/delta/result payloady, Game attach/weather preview dependencies a skutečný pruneDoorPrediction. Dvě assertions počtu transport listeners nyní očekávají16 místo13, protože přibyly právě3 dveřní subscriptions. Žádná původní kontrola nebyla odstraněna ani oslabena.
- `tests/cad-game-doors.test.ts`: nový9testový harness skutečných Game metod/door field initializers/startup statement; fyzika je pravý Rapier a produkční Actor, render sink pouze zaznamenává shared stavy bez GPU.
- Toto předání a `.cache/b6-game-door-validation-20261025/`.

Nebyl změněn production Game, core, UI, server, model ani cizí WIP. Root byl informován okamžitě při konkrétním riziku a po jeho RED reprodukci. Žádný staging/commit. Frozen2591 neovládán.

## Průzkum a provedení

Přečtena skutečná posloupnost Game.reconcile/advanceSimulation/interact/attachDoorTimeline/applyDoorSnapshot, source field initializers, cache v CadDoorTimeline a původní AST fixture. Přijatá varianta testování: vykonat přesné production AST tělo bez grafického constructoru, k tomu skutečný Actor a malé floor/door collidery. Druhý controller ani kopie door/replay algoritmu nevznikly. Planner fixture explicitně dodává seznam pending kroků; tím izoluje testované Game pořadí a rozhodnutí exact/replay. Existující rozsáhlé NetworkTimeline testy tím nejsou nahrazeny.

Legacy car/frame fixture bez CAD colliderů používá explicitně prázdný CAD seznam v jediném frame-order případě. UI callback fixture používá skutečnou jednu door definition a všechny nové message handlers, nové Game testy vždy skutečný door collider. To zachovává původní účel malých fixture a zároveň neobchází novou produkční záruku.

## Doložené chyby a root opravy

Původní `client/game.ts` uložen před opravami do ignorované `game-before-guard-fixes.ts`. `CAD_GAME_SOURCE` umožní stejné nové testy spustit proti tomuto přesnému souboru. Log `doors-red.log`:6/8PASS, **2FAIL**.

1. `advanceSimulation` ignoroval false návrat `restoreDoorTick` pro vyřazený předchozí tick. Timeline už měla úplný baseline tick10 a žádný revision gap, local seq0 ale stále zavolal planner/Actor pro tick1 pod jinou kolizí. Root přidal před advance preflight `revisionAt(doorInputTickBase + seq) !== null`, jinak vynuluje accumulator a vyžádá resync bez posunu planneru/aktéra.
2. Exact ACK pose + shodný ACK door revision dovolil přeskočit replay i tehdy, když dosud nepotvrzený seq2 byl predikován s door rev0, zatímco skutečná timeline pro něj již měla rev1. Root doplnil shodu predictionDoorRevisions pro každý replay seq proti skutečné POST-tick revision. Jinak Game obnoví actor a přehraje kroky; test s odpovídajícími revision současně potvrzuje zachovaný exact fast path.

Root opravy nevznikly v tomto scope. Current source v `tests-fixed.log` dokládá GREEN obou regresí. Normální advance i reconciliation používají POST(T−1) pro Actor.step a POST(T) před stejným world.step; test pozoruje skutečný aktivní collider při obou voláních.

## Další pokrytí

- Skutečné Game.interact (E cesta) začíná se zavřenou guest kolizí, otevře/zavře obě shared reprezentace a neodesílá multiplayer request. Další skutečný Actor v oblouku křídla změnu zabrání.
- Network E pošle desired state/revision/identity a samo kolizi nemění; až complete snapshot/delta ji synchronizuje s render sinkem.
- Timeline připojená před Game ready se uplatní stejným statementem z reálného startupu. Reconnect clearuje staré prediction revisions; nové baseline převezme přesný stav, původní UI timeline Game nedisponuje.
- Samostatná guest Game ignoruje připojenou multiplayer timeline a zůstává ve vlastním zavřeném světě.
- Chybějící baseline/revision gap zastaví normální pohyb i authority; recovery je throttled, bez odhadnutého stavu.
-1000 `revisionAt` dotazů nematerializuje pole stavů. Snapshoty stejné revision sdílí immutable array i immutable položky. Cache je omezena retenčním rozsahem, vyčistí se při novém baseline/resync a dispose.
- Všech47 původních room callback/startup assertions opět prochází, včetně zrušených joins, stale owners, synchronních leave callbacks, bootstrap authority, order input/reconcile a původního car-pose lifecycle.

## Ověření 2026-10-25

`pnpm exec tsx --test tests/room-callbacks.test.ts tests/cad-game-doors.test.ts`: **56/56 PASS**, exit0, TAP3.09s, `.cache/b6-game-door-validation-20261025/tests-fixed.log`.

Targeted TypeScript check pro obě fixture: **PASS exit0**, `typecheck-final.log`. `git diff --check -- tests/room-callbacks.test.ts`: PASS.

Uchovány předchozí logy: `room-first.log`46/47 (druhý starý fixed listener count), `doors-red.log`2 skutečné runtime RED na uloženém původním zdroji, `tests-current.log`53/55 před root fixem. Nový samostatný reconnect/guest test přidán následně, výsledný počet je56.

## Refaktoring, snapshot a převzetí

Nový harness sdružuje skutečnou AST extrakci, malý physics lifecycle a řízenou časovou frontu na jednom místě. Production initializers/startup statement se čtou přímo; pro experiment se nepřepisuje production Game. V legacy fixture přibyly potřebné skutečné závislosti, bez plošného formátování souboru. Nový testový soubor samostatně formátován.

Manifest v own cache zahrnuje SHA256 obou testů a tohoto handoffu, read-only production dependencies a uložený původní Game pro RED. Dirty společný strom není identita finální hry; root musí celý integrovaný checkpoint stále ověřit svými prostředky.

Žádný server/port/GPU/Blender/fullsuite/build. Všechny vlastní CPU procesy skončily. Nejde o GPU, plný model ani živý socket důkaz. Po manifestu release; jeho výsledek a hash budou předány koordinátorovi. Integraci a stav tasku dokončuje root.
