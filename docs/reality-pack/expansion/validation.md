# Rozšíření areálu a pěší dostupnost linky 191

Kontrola 10. 10. 2026. Toto je ověření mapové topologie a skutečné herní fyziky, nikoli měření GPU výkonu nebo potvrzení bezbariérovosti reálného areálu.

## Podklady a rozsah

- Komunikace: stažené objekty [OpenStreetMap](https://api.openstreetmap.org/api/0.6/map?bbox=14.3842,50.07725,14.3985,50.0834), uložené v `shared/data/streets.json`. Pěší graf používá původní identifikátory uzlů a cest. Dvě geometricky blízké cesty se nespojují, pokud nemají společný uzel OSM. Silniční osy a cesty s `foot=no`, `foot=private` nebo nepřepsaným `access=no/private` nejsou pěší zkratkou.
- Nástupiště: [oficiální PID GTFS](https://data.pid.cz/PID_GTFS.zip), SHA-256 `650f8f1fe506145437d06c32c48b448f1a754edce25f50d3bcb3415ef092ff1b`; místní objekty OSM přiřazené přes `ref:PID`. Linka [191](https://pid.cz/zastavkove-jizdni-rady/?cid=191&from=1787954400&type=bus) obsluhuje A (`U699Z1P`) směrem Vypich / Letiště a B (`U699Z2P`) směrem Na Knížecí. Poloha bodu GTFS a značníku OSM se mírně liší; herní pěší cíl používá místní bod OSM. Nejde o geodetické zaměření.
- Výšky: stávající skutečný ČÚZK DMR 5G a shodná interpolace renderu/fyziky. Rozšířená mřížka 4 m pokrývá X −520…460 m, Z −288…360 m. Herní hranice X −500…440 m, Z −270…340 m ponechávají oba cíle uvnitř terénu i vnějších zábran.
- Souřadnice: metry od projektového počátku 50.08065 N, 14.39175 E; +X východ, +Z jih.

| Cíl                   | Bod OSM [X, Z] m  | OSM nástupiště | GTFS [X, Z] m     |
| --------------------- | ----------------- | -------------- | ----------------- |
| Stadion Strahov 191 A | −241.879, 254.400 | 1222786635     | −243.379, 256.927 |
| Stadion Strahov 191 B | −281.968, 273.747 | 249527783      | −279.597, 274.292 |

## Trasy

`shared/campus-routes.ts` staví pěší graf jednou při první žádosti. Dijkstra se spouští při výběru cíle, nikoli každý snímek. Začátek a konec se promítají na nejbližší existující pěší segment nejvýše 4 m od vybraného bodu. Tyto krátké spojníky jsou ve výsledku samostatně označené a nevytvářejí novou komunikaci. Pokud jsou nejbližší cesty odpojené, helper vrátí chybějící trasu. Neopravuje mapu domnělým mostem přes trávník nebo vozovku.

Od běžného spawn bodu `[22, −14]` je trasa na A dlouhá **503.142 m**, na B **641.847 m**. Počáteční spojník měří 1.580 m, koncové spojníky 0.418 m a 0.182 m. Trasa B jde přes mapované pěší přechody jižně od otočky, nikoli přímo přes autobusové zálivy. Délka je půdorysná a zahrnuje spojníky.

- A: OSM cesty `785663896`, `573681963`, `25920432`, `106402081`, `1219495683`, `408313961`, `1219495685`.
- B: první společné cesty `785663896`, `573681963`, `25920432`, `106402081`, `1219495683`, dále `1219495684`, `437247893`, `1561361283`, `374233872`, `408510603`, `479784159`, `434329306`, `320586063`, `408313962`.

`tests/campus-expansion.test.ts` ověřuje trasu po 0.5 m proti stejným spojeným povrchovým polygonům, které používá renderer: A 1 043 vzorků, B 1 337 vzorků. Kontroluje také přístupová omezení, skutečné propojení uzlů a nepřidávání zkratek mezi nespojenými cestami.

## Nepřerušovaná fyzická procházka

Test vytváří skutečný `Simulation`, tedy Rapier terén, budovy, B6, nové stadionové konstrukce a společné fyzické překážky. Z běžného spawn bodu řídí tutéž postavu po uzlech bez přesazování. `actor.setPosition` je po vytvoření přepsáno selháním, takže jakýkoli teleport nebo záchrana po pádu test ihned ukončí. Každý tick hlídá výšku nad terénem, plynulý krok a hranice; každých 90 ticků provede skutečný Rapier paprsek proti podpůrnému terénu. Čas simulace je pevný, aby průběh nezávisel na právě projíždějícím plánovaném autobusu. Ověření proto není testem průchodu mezi jedoucími vozidly.

Výsledky běhu jsou v `continuous-walk-results.json`; příkaz pro opakování:

```powershell
pnpm exec tsx --test tests/campus-expansion.test.ts
```

Souřadnice, spojníky, výšky a kapsle jsou ověřené v herním modelu. Šířky některých cest a plynulé nahrazení nezaměřených venkovních schodů terénem stále nejsou přesným stavebním modelem. Fyzický test není důkaz vzhledu dlažby, aktuální polohy značek či vizuální shody celého stadionu; ty řeší samostatné referenční a renderovací kontroly. Linka 191 zde přidává přístupné orientační cíle, ne simulovaný jízdní řád ani živé polohy vozidel.
