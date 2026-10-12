# Samostatné venkovní dominanty · 2026-10-12

## Podklady a rozlišení přesnosti

**Růžový traktor — První punkový pomník.** Primární identifikace je [katalog Galerie hlavního města Prahy / Umění pro město, SVP-0770](https://umenipromesto.eu/katalog/detail/1798/62?v=list): autor David Černý, kov, rok 2022, osazení 22. 6. 2022, Vaníčkova. Fotografie Ondřeje Surového z července 2022 byla skutečně prohlédnuta; zachycuje traktor postavený přídí vzhůru, růžové zadní pneumatiky, otevřený rám kabiny a kovový visací zámek místo jednoho předního kola. Rozměry a azimut jsou interpretací fotografie, nikoli zaměřením. Model není generické vozidlo otočené střechou dolů.

Poloha používá [OSM node 13482792171](https://www.openstreetmap.org/node/13482792171), verzi 4 z 2026-07-07: 50.081671 N, 14.390167 E. Bod GHMP (50.081729, 14.390208) se liší asi o 7,1 m. Zachována je explicitně mapová poloha OSM, bez sloučení dvou bodů nebo tvrzení o centimetrové přesnosti. OSM je © přispěvatelé OpenStreetMap, ODbL. Místní souřadnice: **X −113,08; Z −113,66 m**. Výška se odvozuje ze stejného `groundHeight` jako ostatní svět; fotografie neurčuje nadmořskou výšku.

**Petřínská rozhledna.** [Oficiální provozovatel Prague City Tourism](https://prague.eu/cs/objevujte/petrinska-rozhledna/) uvádí 58,70 m k nejvyššímu bodu původní konstrukce (přeměření 2021), úhlopříčku základového osmiúhelníku 21,65 m a podlaží 20 a 51 m. Provozovatelův odkaz na trasu obsahuje 50.083543041143 N, 14.395043251282 E. Jeho fotografie byla prohlédnuta; datum pořízení neuvádí, adresář uploadu má 2024/03. Šířky vyšších pater, průřezy prutů a jejich rytmus jsou interpretované. OSM way 7645353 byl stažen jako podpůrný identifikátor; jeho zaokrouhlená výška 60 m nepřepisuje novější údaj provozovatele.

Provozovatel uvádí nadmořskou výšku základny 324 m, bez explicitního vertikálního CRS. V modelu je to interpretováno jako Bpv s přiznanou tolerancí ±2 m: **Y = 324 − 326,392 = −2,392 m**, kde 326,392 m je stávající referenční výška terénu ČÚZK. Nejde o nový výškový průzkum. Místní poloha **X 235,25; Z −322,05 m** je severně od herní hranice Z −270 m i terénu Z −288 m. Rozhledna zůstává vzdálenou dominantou; nepřidáváme pod ni vymyšlený park ani neprodlužujeme mapu. Současný anténní nástavec nad původní konstrukcí je vynechán, protože jeho ověřené rozměry nejsou k dispozici.

## Geometrie a integrace

`shared/outdoor-landmarks.ts` poskytuje `OUTDOOR_LANDMARKS` pro mapu a `buildOutdoorLandmarkPlan()` pro renderer a fyziku. Návratová hodnota odpovídá `OutdoorArtifactPlan`, včetně `audit` s omezeními. Zdrojové fotografie jsou pouze dokumentační reference, nikoli herní textury.

- Traktor: 4 184 trojúhelníků v pěti materiálových částech; tři růžové pneumatiky, náboje se šrouby, široký šípový dezén, otevřená kabina, zkosený kryt motoru s větracími štěrbinami a kruhový zámek s obloukem. Čtyři vykreslená tělesa jádra motoru/podvozku/zadní desky používají totožné rozměry a transformace jako boxové kolize; zkosený plášť krytu leží okolo užšího kolizního jádra. Křivé pneumatiky, rám a zámek jsou dekorativní: jejich obrys nemá samostatnou kolizi. Základna používá nižší ze dvou vzorků terénu pod zadními pneumatikami, aby nevisela nad svahem; protější pneumatika se může mírně zabořit, bez vymyšleného soklu a bez naklonění kolizí.
- Rozhledna: 10 368 trojúhelníků v pěti materiálových částech; osmipaprsková příhradová konstrukce, osm patek, centrální tubus, dvě šroubovice schodišť a prosklené ochozy. Nemá kolizi ani přístupný interiér.

Cílený refaktoring soustředil transformace, normály, winding, hranoly, pruty a pneumatiky do jednoho lokálního builderu. Sinus a kosinus natočení se počítají jednou na objekt. Prvky se dávkují podle identity a materiálu; žádná per-frame generace nebo globální cache scénových objektů. Základové rozpětí a výškové úrovně se čtou přímo ze společných zdrojových konstant.

## Ověření

`pnpm exec tsx --test tests/outdoor-landmarks.test.ts`: **6/6 PASS**. Testy kontrolují geografické umístění a severní hranici, zdrojovou výšku a datum základny, charakteristickou polohu pneumatik a zámku, shodu všech rohů kolizí s vykreslenými tělesy, ukotvení na svahu, konečné hodnoty, nenulové trojúhelníky, orientaci normál a determinismus. První běh odhalil základové pruty pod úrovní patky; jejich spodní konce byly opraveny na vrchol patek a testy zopakovány. Po kontrole produkčního snímku integračním agentem byly zpřesněny kryt motoru, dezén a ukotvení traktoru; aktuální testy byly spuštěny znovu.

Toto jsou kontroly CPU geometrie, nikoli GPU důkaz. Praktický průchod, výsledný obraz, celá testovací sada, build, izolovaná integrace a případné produkční měření patří do souhrnného `docs/verification.md` hlavního integračního checkpointu.

## Uložené reference

`landmarks-ghmp-source.html`, `landmarks-pct-source.html`: odpovědi primárních stránek při kontrole 2026-10-12. `landmarks-tractor-ghmp-202207.jpg`: GHMP / Ondřej Surový, 07/2022. `landmarks-tower-pct.jpg`: fotografie poskytnutá provozovatelem, datum expozice neznámé. Obrázky zůstávají pod autorskými právy uvedených poskytovatelů; nejsou vydávány za naše fotografie či otevřenou texturovou knihovnu. `landmarks-tractor-osm.json`, `landmarks-tower-osm.json`: odpovědi OSM API. `landmarks-source-summary.json`: adresy, data kontroly, modelové údaje a SHA-256 uložených podkladů i testovaného zdrojového souboru.
