# Čitelnost ulic a dopravní značení

Implementace přidává vodorovné a svislé značení do stávajícího samostatně modelovaného světa. Polohy silnic, chodníků, terénu ani vegetace tímto krokem nemění. Vodorovná barva je drapovaná na stejné trojúhelníky terénu jako vozovka; fyzickou překážku nevytváří.

## Co je podložené

- OSM `cycleway:both=lane`, `cycleway:left/right=lane|soft_lane` určují výskyt cyklopruhů na Vaníčkově. Pravá strana odpovídá směru zdrojového way; levý pruh má opačně otočený piktogram. Šířka původního way 7 m je v podkladu výslovně odhad podle třídy komunikace, nikoliv měření.
- Tři snímky dodané uživatelem ukazují přerušovanou středovou čáru a hranice cyklopruhů, souvislé vnější čáry, cyklopiktogramy, bílé orámování BUS, modré značky přechodu, parkování P a červenobílé označníky. Originály jsou beze změny v [archivu referencí](../../assets/reference/road-details/manifest.json), včetně SHA-256 a omezení použití. Nejsou použité jako bitmapy hry. Datum fotografování ani přesný původní Street View odkaz není z dodaných snímků prokazatelný.
- Přechod `54283786` u Kolejí Strahov měl legacy `crossing=uncontrolled`; [oficiální OSM dokumentace](https://wiki.openstreetmap.org/wiki/Tag:crossing=uncontrolled) jej vykládá jako označený přechod bez světel. Explicitní `crossing:markings=no` má přednost. Tím se opravuje jeho dřívější vynechání, nepřidává nový svévolný přechod.
- [Praha 6, 18. 8. 2022](https://www.praha6.cz/dopravni-omezeni/dopravni_omezeni_180_61934.html) potvrzuje stavební úpravy tohoto přechodu a zastávky. Zpráva neobsahuje použitý detailní stavební výkres, a proto není vydávána za zaměření značek.
- Pět označníků vychází z poloh zastávek zachycených v lokálním [PID GTFS](../../shared/data/transit.json). GTFS souřadnice je kotva zastávky, nikoliv přesně zaměřený sloupek: uvedená nejistota je ±3 m. Zobrazené linky jsou pouze linky 143/149 přítomné v demonstračním feedu, nikoliv úplný seznam všech linek na Strahově.
- Dvě značky přechodu mají polohu interpretovanou kolem mapového přechodu, s nejistotou ±2 m; jedna značka P je odvozená od okraje OSM parkoviště `155743959` a fotografie, s nejistotou ±6 m. Její skutečný sloupek není zaměřený.

Rozteče čar 3/9 m a 1/2 m, šířka barvy 12 cm, cyklopiktogram 0,75 × 1,20 m a BUS 1,80 × 3,20 m jsou zveřejněné herní interpretace typologie fotografie. Nejde o projekt schváleného dopravního značení. Souvislé vnější čáry se nevymýšlejí po celé mapě; jsou omezené na fotograficky doložený stadionový koridor. Značky jsou samostatné kořeny s odděleným sloupkem, neprůhlednými zády a přední deskou. Textury piktogramů jsou nově kreslené symboly. Deska má před neprůhlednými zády mezeru 1 mm, včetně kontroly skutečných světových transformací.

[DPP, 5. 10. 2026](https://www.dpp.cz/spolecnost/pro-media/tiskove-zpravy/detail/278_3476-v-praze-vznika-dalsi-nova-tramvajova-trat-malovanka-strahov) popisuje budoucí tramvajovou trať s provozem předpokládaným v roce 2028. Budoucí rozšíření Vaníčkovy není přenesené do této mapy referenčního stavu. Mapa tedy není živá replika nynějších dopravních omezení.

## Materiály

Originální CC0 textury ambientCG jsou neměněné. Audit jejich albeda ve 256px zmenšení dává průměrnou lineární luminanci asfaltu 0,085, dlažby 0,212 a travnatého podkladu 0,091 před násobením stávajícím materiálovým tintem. Asfalt a tráva jsou podobně tmavé, ale mají různou barvu a strukturu; dlažba má vyšší odrazivost. Toto není měření materiálů přímo na Strahově a neprokazuje samo o sobě čitelnost výsledného renderu. Roughness mapy se čtou jako lineární skalární data, ne jako sRGB barva. Značení ani povrchy nepoužívají emisní barvy.

## Kontrola

Na běžícím lokálním klientu otevři [kontrolní náhled](./road-details-preview.html), například `http://127.0.0.1:5182/docs/roads/road-details-preview.html`. Používá skutečný Game, skutečné PBR materiály a astronomii pro 11. 10. 2026 12:00/02:00 Praha, kontrolované sucho/zataženo/déšť a statickou kameru. Nabízí oba směry ulice, cyklopiktogramy shora, přechod, označník z čela a zezadu, P a styk povrchů. DOM `#report` zveřejňuje připravenost, chyby, GPU, rozlišení, čas, skutečné materiály a `invertY` generovaných textur. Statická kontrola není důkaz FPS ani praktického řízení.

Šest cílených testů prošlo: výklad legacy přechodu, absence barvy na trávníku/chodníku, drapování na sdílený terén, orientace obou cyklopruhů, skutečné instanciované polohy a projekce UV čela značek. Poslední regrese zachytila zrcadlený text a průnik sloupku před desku; oprava obrací pouze U čela a posouvá celý průřez sloupku za neprůhledná záda. Správný `invertY` zůstává zachovaný.

Root provedl kvalitativní GPU kontrolu skutečného Game na Intel UHD 630: [cyklopiktogramy](evidence/gpu-review/bicycle.png), [opravené čelo označníku](evidence/gpu-review/bus-front-after.png), [neprůhledná záda](evidence/gpu-review/bus-back-after.png), [02:00 Praha](evidence/gpu-review/bus-front-night.png) a [styk povrchů](evidence/gpu-review/surface-join.png). Doprovodné JSON soubory obsahují DOM údaje o kameře, materiálech a chybách; všech pět pohledů mělo `ready=true`, 0 renderových a 0 asset chyb. Zachovaný [snímek před opravou](evidence/gpu-review/bus-front-before.png) dokládá původní chybu. Jde o statické kvalitativní pohledy, nikoli FPS benchmark, ověření celé mapy nebo průchod s fyzikou. Celou pipeline uvádí [přejímka publikované verze](../releases/demo-2026-10-11.md).

Zbývá zaměřit přesné sloupky, aktuální zastávkové zálivy, dopravní ostrůvek a úplný inventář značení ostatních ulic. Vyobrazené symboly jsou zjednodušené, nejsou certifikovanými tiskovými předlohami značek.
