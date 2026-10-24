# Srovnatelný transit scénář v reálném multiplayeru

21Oct2026, primární podklad je skutečný server/index, shared/Simulation, TimelineSimulationClock, NetworkTimeline a Game v aktuálním přijatém řetězci. Bez změny produkčních hodin. Toto je rozhodnutí pro volitelný QA helper, nikoli výkonový výsledek.

Server odvozuje fyziku z TimelineSimulationClock(time), který řídí i Authority/Motion a recovery/respawn. MP klientská predikce i replay volají Simulation.tick(step.time) z authority.time+(seq−ack)/60. Game.trafficInstant na MP řídí render a používá Date.now+transport offset; samotné přepsání této metody proto nesjednotí kolizní vozidla. timeOverride mění světlo, nikoli dopravu. Původní stacionární KEY53 helper není tímto důkazem pro pohyb.

V Simulation.tick(now) se argument používá pouze pro transit refresh při≥33ms nebo návratu času, sampleTransitVehicles, trafficAt a kinematickou extrapolaci. Rigidní world, actor step a fixedtimestep zůstávají nezávislé. Obě render/physics sampling větve čtou stejná GTFS/ambient vozidla; ambient fáze závisí na absolutní UTC a135s periodě. Shodný endpoint počet vozidel není shodný workload.

## Varianty a volba

Ponechat volný skutečný UTC umožňuje funkční smoke, nikoli kauzální backend FPS gain. Guest preview mění relaci/kameru a nesplňuje1/3MP. Globální Date/Timeline/packet patch by změnil transport/autoritu a je odmítnutý. Freeze jen renderu nesjednotí fyziku. Nový arm-control endpoint by odstranil čekání, ale přidal lifecycle a další API, které nyní nepotřebujeme.

Volba: defaultoff, explicitní čistá mapa v hashed per-run configu se scenarioEpochUTC E0 a předem stanoveným budoucím armAtUTC A. map(t)=E0+max(0,t−A). Všechny předarm/replay časy se tak stále mapují na stejné E0; po A jde transit reálnou rychlostí. A se během jednoho běhu neposouvá. Pokud skutečný ready/peer settling nestihne deadline, uložit neplatný pokus a založit nový čerstvý běh; neprovést tichý rebase existující Simulation.

Server QA bootstrap obalí přesnou snapshot Simulation.prototype.tick před importem jejího server/index. Stejný explicitní hashed Vite QA module obalí tutéž browser Simulation před Game.start a mapuje původní Game.trafficInstant pro render. Původní receiver/return/throw zůstanou zachované. Mapa se nesmí použít podruhé na packet time ani NetworkTimeline. Skutečné physics/render hook calls, original/mapped čas a config ID se zaznamenají; nula observed physics calls je neplatná konfigurace, ne důkaz správné modulové identity.

Odlišný QA server na rootově2597 a preview4213 mají vlastní procesní/source/helper/config identity. Baseline4211/API2596 se nemění. Root drží porty/heavy/GPU, dítě pouze implementuje a lehce testuje helper. Žádný nový produkční endpoint, Game přes window, browser injection, dependency install nebo server spuštěný dítětem.

Jednorázové plánované spuštění existujícího10s Game.startBenchmark může použít předem dané benchmarkAtUTC>A; skutečný start a lateness se uloží. Tolerance lateness musí být předem vconfigu a nesmí se zvyšovat po výsledku. Zablokovaný/pozdní callback nepředstírá validní interval. Toto není nová herní smyčka ani automaticky srovnatelná ručně řízená trasa.

## Kontroly před GPU

Čistá mapa: E0, A−1/A/A+tick/+10s, starší replay a odmítnutí neplatného/nového arm. Skutečný Simulation s původními server/replay timestamps a mapou musí mít stejné kinematické překážky/cache/extrapolaci/create/remove jako reference volaná přímo mapovanými časy. Render vehicle IDs/pozice/yaw/speed na stejných UTC souhlasí s physics sampling. Authority/Motion tick/time, inputEpoch, ack a recovery se nemění.

Snapshot, helper, clock config a bundle SHA se vážou před/po build. Původních14helper regresí a defaultoff cesta musí zůstat platné. Plain interval neobsahuje periodické snapshoty; původní Game benchmark profiling se výslovně přiznává. Pohyb, kamera, preset kohorta, počasí, rozměry, cold/warm a thermal/clock podmínky zůstávají samostatné přejímací brány. Mapa nezaručuje shodný draw list, LOD/hysterezi ani door/wheel sampling při rozdílném FPS.
