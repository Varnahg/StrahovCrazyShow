# UI ownership po terminálním startup failure

Výchozí HEAD589b098cb60fc716247b8ebb3cc42bff7645588e, 21. 10. 2026. Toto je výzkum a rozhodnutí před implementací, nikoli důkaz opraveného browseru.

## Doložený řetězec

Client/ui.tsx connect po HTTP session a úspěšném joinById předá joinedRoom přes bind do room.current. Connect finally zavře pouze room, který nepřevzal aktuální UI vlastník. Game useEffect po await g.start() v catch uklidí engine/Game a zobrazí původní chybu, ale neukončí Room, nezruší pokusy o spojení a ponechá connected stav. Game.dispose síť nevlastní. Aktuální currentRoomCallbacks zneškodní ponechané SDK listenery teprve změnou room.current.

Skutečný uživatelský NCM start skončil řízeným light timeoutem, error screen přetrval asi dvě minuty a další první join po reloadu dostal obecný onAuth reject. Konkrétní onAuth branch není doložená: server/index.ts vrací stejný text pro chybějící session, expired session i connections.has(id). Chybějící UI teardown je přímo doložený kódem, duplicateconnection je pouze kompatibilní hypotéza. Žádný token nebyl čten ani uložen do tohoto výzkumu.

Instalovaný Colyseus core0.18.9 bez onDrop volá aplikační onLeave i pro neconsented close; aplikace nemá allowReconnection. OnLeave odstraní server connections/actor/presence. SDK0.18.5 consented leave čeká na serverový handshake a ponechává listenery, takže UI musí zneplatnit ref před jeho voláním. Reload nemá aplikační Room pagehide teardown a přirozené browserové zavření socketu není synchronní bariéra před následujícím joinem. Ověřené zdroje: aktuální UI/Game/server/session-lifecycle a node_modules/@colyseus/{core, sdk}/build; oficiální https://docs.colyseus.io/room/lifecycle a https://docs.colyseus.io/room/reconnection.

## Varianty

| Varianta | Přínos | Náklad / riziko / rozhodnutí |
| --- | --- | --- |
| Ponechat relaci až do Opustit demo nebo reloadu | Žádná změna | Neopraví doloženou přítomnost bez živého Game; zamítnuto. |
| Přesunout Room do Game.dispose | Jedno viditelné místo cleanupu | Překračuje současné UI síťové vlastnictví, Guest/rejoin a dependency hranice; zamítnuto. |
| V catch zavolat celé leave() | Znovu použije cleanup | Vynutí návrat na menu, směšuje síť s navigací a chybu startupu; není nutné. |
| Duplikovat cleanup jen do catch | Malý okamžitý diff | Další lifecycle cesta a drift buffer/callback resetů; zamítnuto ve prospěch společného úzkého helperu. |
| Sdílený UI disconnect s expected Room/attempt, oddělený od navigace | Jediné teardown vlastnictví, okamžité zneplatnění callbacků a send gates | Vybráno: lokální capture startup connection; starý callback nesmí ukončit novou relaci. Error screen a původní chyba zůstávají. |
| Oslabit onAuth, rotovat token nebo automaticky opakovat obecný reject | Může skrýt symptom | Nedoložená příčina a bezpečnostní/identitní dopad; mimo scope. |
| Přidat obecný unload/reconnect framework | Širší pokrytí | Nezaručí server ACK při zániku dokumentu, neřeší vlastníka v době error screen; mimo tuto opravu. |

## Zvolený kontrakt

Při aktuálním MP startup failure uvolnit pouze Room a connection attempt zachycené daným effectem. Nejprve zneplatnit ref a connected/send stav, vyčistit pending input/authority/probe a odvozenou presence/chat/social cache, potom jednou consented leave bez čekání na síť. Late close/leave promise ani starý startup nesmějí změnit nového vlastníka. Guest chyby nesmějí odpojit nesouvisející MP relaci. Explicitní leave sdílí tentýž síťový teardown a dále provádí původní návrat na menu. Bez nové cache nebo GPU práce; protokol, server, tokeny, entity a Game scene/engine vlastnictví zůstávají původní. Případný Room leave reject/throw nesmí nahradit původní startup error.

Zachovat přesný QA marker osm mezer + await g.start(); i stávající vnější error flow. Cílené regrese vykonají skutečný UI effect a callbacks přes existující TypeScript AST fixture: factory/start failure, přesný leave count, ref/connected/buffer/send cleanup, aktuální a stará generace, pending leave/rejoin, Guest a zachování původních testů. Root drží skutečnou GPU/pipeline přejímku; tento task ji nenahrazuje.

## Upřesnění po implementaci a regresích

Sdílený disconnect kontroluje přesnou identitu Room. Ruší zachycený connection attempt pouze tehdy, pokud stále platí: nový pending join smí doběhnout i během řádného odpojení starého Room. Starý startup effect vlastní jen svůj konkrétní Game; catch i cleanup uvolní tento objekt, nikoli libovolný pozdější game.current. Late factory rejection pozná náhradního vlastníka i bez již vytvořeného Game. Síťový onAction callback má stejnou kontrolu Game identity jako původní onInput, aby starý callback nemohl poslat akci novou Room. Nezavádí se nový ready gate pro původní startup resync.

Skutečná red regrese nad původním UI vykonala factory i Game.start failure a v obou našla0 volání leave místo požadovaného jednoho consented leave. Po opravě prošlo64 cílených UI/room/input testů. Stará obecná onAuth větev tím není zpětně prokázána ani opravována. Bezpečné navázání po rejoin testuje nového vlastníka Room; automatický restart rendereru při souběžném manuálním reconnectu zůstává existujícím UI flow a není novou funkcí této opravy.
