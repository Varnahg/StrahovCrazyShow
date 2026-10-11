# Fyzicky kontrolované mapové trasy — 11. 10. 2026

`client/map-navigation.ts` a `client/navigation-physics.ts` poskytují jednu sdílenou navigaci pro malou a velkou mapu. Trasy vycházejí ze skutečných uzlů `STREET_FEATURES`, nikoli z automaticky propojených blízkých cest. Krátký úsek do 60 m může vést volným prostorem, pokud projde stejnou fyzikální kontrolou. Jde o herní pěší navádění, ne úplný navmesh, dopravní navigaci nebo tvrzení o reálném veřejném přístupu.

## Ověření podkladů a opravy

Průzkum zahrnul `shared/campus-routes.ts`, `streets.ts`, skutečné collider streamy `Simulation`, `Actor.step/createPhysics` a [primární dokumentaci Rapier 0.21 character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/). Rapier rozlišuje vlastní tvar, ochranný odstup, autostep, sklon a snap-to-ground; prostý paprsek ani zmenšená kapsle samy neprokazují chůzi. Produkční postava používá poloměr 0,42 m, půlvýšku 0,38 m, offset 0,02 m, autostep 0,22 m / 0,2 m a snap 0,25 m. Průchod se proto testuje skutečným `Actor.step` a `stepRigidWorld`, se stejnými nastaveními a bez posouvání postavy mezi body.

Opravené konkrétní vady původního helperu:

- Průběžné zkrácení ověřovalo spojení nové pozice s projekcí na trasu, ale potom projekci vynechalo a kreslilo jinou diagonálu přes roh. Výsledná polyline nyní tento ověřený bod zachovává.
- Stav „v cíli“ už nevznikne do 2 m přes neprůchodnou zeď a nezůstává po opuštění dosažitelného cíle.
- Graf respektuje `foot=no/private` a obecné `access=no/private`, s explicitním pěším override. Kontrola směrových hran se ukládá odděleně, protože schod nemusí být průchozí oběma směry.
- Dva body uprostřed stejného dlouhého mapového segmentu nemusí obcházet jeho koncové uzly. Stále se kontrolují spojnice i použitý podúsek.
- Výsledek si kopíruje X/Z; následná změna vstupní pozice ho nemůže potichu přepsat.
- Cíl i celý segment respektují finální sdílenou stadionovou uzávěru. Neznámý interiér se odmítá. B6 a známé koleje končí před venkovním přístupem; pojmenovaný nehotový interiér může skončit na blízké skutečné cestě mimo budovu, bez předstírání dokončené vnitřní trasy.

## Clearance a její rozsah

Stejný Rapier world poskytuje sweep kapsle o poloměru 0,43 m s query margin 0,01 m, tedy celkovou vodorovnou rezervu odpovídající produkčnímu poloměru a offsetu. Půlvýška 0,32 m a střed 0,98 m nad podkladem jsou výslovně zmenšený/zvýšený torso probe pro nízké stupně, nikoli kopie celé postavy. Prostor nad hlavou je konzervativní. Sweeps jsou nejvýše 1,5 m dlouhé; podpůrná výška se vzorkuje po nejvýše 0,15 m, aby 35cm hrana nevypadala jako pomyslná pozvolná rampa mezi vzdálenými endpointy. Horní krok je omezen na 0,22 m, dolní na 0,25 m; dlouhý sklon má konzervativní limit stoupání 0,62.

Terrain collidery se při torso sweepu filtrují a vyhodnocují přes výšku podkladu. Ostatní skutečné statické překážky se kontrolují tvarem. Postavy, pohyblivé auto a doprava se neukládají jako trvalá uzavírka grafu; hráč se jim musí v konkrétní situaci vyhnout. Výškově vrstvené vnitřní prostory nejsou dvourozměrným API vyřešené. Změna statického světa vyžaduje nového vlastníka `MapNavigator` / novou Game.

## Sdílená cache a postupné hledání

`PlanMapRoute` vrací `MapNavigation | Promise<MapNavigation>`. Produkční Game používá `planAsync(start,target)`; `plan(start,target)` zůstává synchronní adapter pro testy a offline audit. Obě metody odčerpávají **stejný generator** — včetně lazy vytvoření grafu, projekcí, A*, kontrol hran a clearance. Žádná kolizní kontrola se kvůli rozpočtu nevynechá.

Postupná varianta po přibližně 3 ms předá řízení další úloze. Jedna jednotka je jeden malý fyzikální úsek nebo drobný krok grafu; končí-li právě nativní dotaz, JIT či GC, nejde jej přerušit uprostřed. `chunkProfile` proto přiznaně měří také `maxUnitMs`; 3 ms nejsou tvrdou zárukou délky browser frame ani důkazem 60 FPS.

Obě mapy sdílejí stejný pending Promise pro stejný cíl. Pohyb během hledání aktualizuje poslední známý start a hotová trasa se před předáním podle potřeby zkrátí. Jiný cíl zruší starý generator; zrušený Promise bezpečně vrátí `unavailable`, který starý UI effect ignoruje. `cancel()` a idempotentní `dispose()` zruší naplánované pokračování. Game musí zavolat `dispose()` před uvolněním Rapier světa. Pouhé zavření jedné ze dvou map není důvod pro globální cancel.

## Skutečné testy a profil

Závěrečný příkaz `node --import tsx --test tests/map-navigation.test.ts tests/minimap.test.ts`: **17/17 PASS**, exit 0, 4,371 s. CPU okno profil + testy bylo 21:15:19.498–21:15:26.800 CEST. Úzká sémantická TS kontrola runtime helperů a navigačních testů: **0 diagnostik**, exit 0, 21:12:48.678–21:12:52.216 CEST. [Úplný log](verification-evidence/map-navigation-20261011/targeted-tests.log) obsahuje všechny případy i skutečné KCC úseky.

| Cíl ze SPAWN | Délka trasy | Skutečné KCC ticků včetně počátečního ustálení | Výsledek |
| --- | ---: | ---: | --- |
| Sport | 20,00 m | 349 | dosaženo do 0,1 m |
| Rko – venkovní přístup | 98,89 m | 1 377 | dosaženo do 0,1 m |
| B6 – venkovní přístup | 292,26 m | 3 933 | dosaženo do 0,1 m |
| Stadion Strahov 191 A – venku | 536,61 m | 7 111 | dosaženo do 0,1 m |
| Volný waypoint `(118,6)` | 10,00 m | 219 | dosaženo do 0,1 m |

Postava nebyla po počátečním vytvoření teleportována; všechny tickové pozice byly konečné a mimo stadionovou uzávěru. Dále skutečný Actor/KCC potvrdil odmítnutí 1,55m stropu, 0,87m mezery, 35cm stupně a svahu se stoupáním 1,25; prošel 1,9m strop, 0,94m mezera, 15cm stupeň a sklon 12 %. To jsou reprezentativní kontrolované případy, nikoli důkaz každé možné kolize světa.

Regrese ověřují také shodu async/sync tras, dvě mapy a poslední pozici hráče během pending, zrušení cíle, opakované dispose a **žádný další Rapier dotaz po `sim.dispose()`**, průběžný corner connector, pravidla zdroje a projekci mapy ve všech natočeních.

[Samostatný CPU profil](verification-evidence/map-navigation-20261011/profile.json), reprodukovatelný pomocí [map-navigation-profile.ts](verification/map-navigation-profile.ts), porovnává první hledání s cache a 120 polohami postupu. Pro každý cíl 600 opakovaných stojících požadavků vyvolalo **0 nových clearance dotazů a 0 hledání**; 240 volání obou map během postupu vyvolalo pouze 60/120 levných zkrácení a **0 nových hledání**. Počet kontrol první trasy je shodný s následným synchronním referenčním výpočtem: 1 / 53 / 190 / 372.

Poslední profil měl u B6 a stadionu nejdelší chunk 3,10 / 3,04 ms, zatímco následný synchronní referenční výpočet zabral 41,95 / 85,16 ms v jednom volání. U prvních studených dotazů sport/Rko byly chunky 5,17 / 5,34 ms; v dřívějším běhu se objevil i 10,31ms chunk s 8,31ms jedinou jednotkou. Měřenou příčinou části těchto překročení je nedělitelný fyzikální úsek; JIT/GC a souběžný browser nebyly izolovaným profilem jednotlivě prokázané. Výsledky neskrývají outliery ani nesrovnávají zahřátí jako údajné zrychlení CPU. Delší trasa se zobrazí po dokončení postupného hledání, zatímco UI může průběžně vykreslovat.

SHA souborů v profilu pokrývá uvedené navigační a důležité fyzikální vstupy, nikoli úplný herní checkpoint. **GPU kontrolu mapy, skutečné uživatelské ovládání a výkon celé hry provádí hlavní úkol; tento CPU audit nedokládá GPU FPS ani definitivní optimálnost tras.**
