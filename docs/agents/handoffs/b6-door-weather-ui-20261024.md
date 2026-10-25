# Předání: b6-door-weather-ui-20261024

- Vlastník: `b6-ui-r2` (`/root/cad_b1_probe_review`); příjemce: `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Výsledek: UI napojení connection-owned dveřní timeline a jednoznačně označených ukázek počasí. Vlastní cílené testy a typecheck prošly; společná starší AST fixture vyžaduje doplnění nových dependencies mimo tento scope. Live multiplayer/GPU ani frozen2591 nebyly ovládány.

## Vlastní soubory

- `client/ui.tsx`
- `client/i18n-messages.ts`
- `client/door-connection.ts` (nový)
- `tests/door-connection.test.ts` (nový)
- `tests/weather-preview-ui.test.ts` (nový)
- toto předání
- Ignorovaná evidence `.cache/b6-door-weather-ui-20261024/`.

Žádné změny Game, shared weather/core/CAD, serveru, rendereru, CSS, package/lockfile či cizích testů. Root souběžně vlastní společnou integraci; cizí WIP zachován. Nic nestagováno/necommitováno.

## Podklady, varianty a rozhodnutí

Přečteny skutečné UI `bind/connect/disconnectRoom/onLeave/startup`, currentRoomCallbacks, authority buffer, live weather fetch/age effect, HUD a lighting preview. Dveřní core a server mají explicitní identity/revision a snapshot-before-welcome. Root potvrdil `Game.attachDoorTimeline(sameInstance)` okamžitě synchronizující hotovou hru a ukládající referenci před startem; timeline vlastní UI, Game ji nesmí dispose. Weather API `setWeatherPreview(id|null)` a `effectiveWeather` vlastní root.

- Držet dveře až v Game by ztrácelo snapshot/delty během asynchronního načítání; odmítnuto.
- Držet neomezený raw packet buffer by zbytečně duplikovalo shared historii a nemělo spolehlivý gap kontrakt; odmítnuto.
- Zvolena jedna `DoorConnection` pro jedno autentizované připojení s bounded `CadDoorTimeline` (128tick/1024events), dostupná i před vytvořením Game. Přímé instance se mezi reconnecty/guestem nesdílí.
- Přepsání live Weather demo scénářem by zaměnilo zdroj/freshness a ztratilo nový provider update; odmítnuto. UI drží pouze preview ID+startupref a dál publikuje původní live weather do Game/HUD.

## Dveře a lifecycle

`DoorConnection` přijímá snapshot/delta jako unknown, kontroluje validní identity, shodný model hash a epoch připnutý prvním snapshotem. Neúplný baseline neodhadne closed stav. Ordered delty se ukládají i během dlouhého Game startupu; při připojení hotové scény se předá aktuální reference, nikoli první zastaralý snapshot.

Gap a Game recovery sdílí throttled request maximálně1/s. Platný nesouhlas model hash/epoch detachne/dispose historii, ukáže jediné sdělení o obnovení stránky a odešle nanejvýš jeden recovery request; další tickové requesty jsou v takto nekompatibilní relaci odmítnuty, nevzniká nekonečný resync provoz. Malformed identity se od stale model hash rozlišuje a může se zotavit platným snapshotem.

UI registruje doorSnapshot/doorDelta/doorResult přes currentRoomCallbacks a další owner check. `onTimeline` se volá i po přijaté deltě stejné instance. Existující guest Game během připojování multiplayeru nic nepřebírá; startup attach je pod `g.network`. Generic onAction nyní vyžaduje aktuální networkGame, multi mode, room a connected state; reward zůstává lokální. Game doorResync směřuje přes společný throttle helperu.

Při explicitním disconnect, room leave, reconnect a App teardown se helper odpojí a dispose. Starý helper callback nesmí detachnout nového vlastníka. DoorResult pouze vypíše lokalizované odmítnutí (obsazeno, vzdálenost, změněný stav, LOS apod.); nikdy nemění doorstate místo autoritativní delty. Stale revision vyžádá obnovu. Všechny nové důvody mají CZ/EN texty, včetně Game E hintů a guest occupied zprávy.

Root byl upozorněn, že server doorResync původně posílal pouze snapshot. Pro obnovu již spotřebované authority je potřeba snapshot **a čerstvá resync authority**, například přes existující `sendAuthority(c,true,"client-request")`, která už snapshot posílá první. Server převzal root, tento task do něj nezapisuje.

## Ukázky počasí

Za lighting preview v Nastavení je samostatný selector: výchozí `Skutečné počasí` a všech26 aktuálních `WEATHER_SCENARIOS`, včetně nového `cloud-breaks`. Popisky a popisy jsou produktové CZ/EN texty; interní rychlosti vrstev/proof metadata nejsou součástí běžných ovladačů.

Každá zapnutá ukázka má viditelný DEMO popis a tlačítko návratu. Mimo Nastavení zůstává trvalý DEMO badge s názvem a návratem jedním klikem. Vedle původního HudWeather je při preview výslovně uvedeno `Údaje o skutečném počasí`; HudWeather stále dostává původní objekt `weather`, včetně originálního zdroje, času/freshness a teploty. Live polling/aging effect nebyl změněn a dál pokračuje během preview. Selection ref se přečte před startem Game a umožňuje změnu během asynchronního načítání; návrat k real nesahá na live cache.

## Cílené ověření 2026-10-25

`pnpm exec tsx --test tests/door-connection.test.ts tests/weather-preview-ui.test.ts tests/i18n.test.ts`: **20/20 PASS**, exit0, TAP1.69s; `.cache/b6-door-weather-ui-20261024/tests-final.log`. Z toho11 nových vlastníků a9 stávajících i18n regresí.

Testy prokazují:301delt během startupu při bounded historii, gap+throttle+recovery, stalehash/epoch fail-closed a one-shot recovery, malformed vs incompatible data, complete baseline, žádný fake state z acknowledgement, retained callback isolation/dispose, skutečný UI owner/network attach callback a skutečný startup guard. Weather test vykonává skutečnou stateless React UI komponentu v obou jazycích, skutečné select/exit handlers, skutečnou UI změnu+startup assignment+live publish, persistent badge, HudWeather data prop a skutečné Game setWeather/setWeatherPreview/effectiveWeather metody vyjmuté přes AST. Žádná kopie produkční logiky, GPU ani Game constructor.

Targeted tsc pro všech5 vlastních TS/TSX souborů **PASS exit0**, log `typecheck-final.log`. Původní první pokus eviduje opravené self-reference/generic fixture chyby a tehdy rozpracované cizí `setDoorStates`/duplicate cloud API; další typecheck byl čistý. První render test zachytil chybějící nový cloud-breaks překlad; doplněn a všechny26scénářů PASS.

### Konkrétní otevřená integrační regrese

Záměrně zkontrolován existující `pnpm exec tsx --test tests/room-callbacks.test.ts`: **4/47 PASS,43 FAIL**, exit1, `.cache/b6-door-weather-ui-20261024/room-callbacks-current.log`. Tato hand-maintained AST fixture vykonává skutečný UI/Game kód, ale její env neobsahuje nové `doorConnectionRef` a její Game fake nemá `pruneDoorPrediction`. To jsou dvě skutečně hlášené příčiny. Test nebyl upraven, je mimo task writePaths; koordinátor byl průběžně upozorněn. Je nutné doplnit actual DoorConnection/CAD defs/ref, weatherPreviewRef, Game attach/setWeatherPreview a nové reconcile dependencies, potom fixture znovu spustit. Výsledek nelze vydávat za celé zelené UI/fullsuite.

## Refaktoring, snapshot a předání

Nový helper centralizuje validaci identity, recovery throttle a disposal, bez duplicitního UI doorstate. Stateful reconnect logika zůstává v původním owner flow. Weather selector/popis jsou jedna stateless komponenta a úplná typed map scénářů; startup ref je nutný pro async Game, nevytváří druhý meteorologický snapshot. Helper/testy formátovány samostatně, žádné plošné formátování UI či nesouvisejícího WIP. `git diff --check` nad vlastními tracked soubory PASS.

`handoff-manifest.json` zachycuje SHA256 všech vlastních souborů včetně testů/této evidence a readonly společných vstupů. Vlastní příkazy skončily, žádné živé procesy/porty, GPU, Blender, build nebo server. Rezervace se uvolní po manifestu a potvrdí koordinátorovi. Root přebírá původní integrační regresi, následné SDK/GPU i vizuální ověření rozložení HUD. Release není finální přijetí hry.
