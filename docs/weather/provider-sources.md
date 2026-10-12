# Počasí: podklady a ověření poskytovatele

Ověřeno 12. 10. 2026 pro souřadnice Strahova 50.08065° N, 14.39175° E. Implementace: `server/weather.ts`, datový kontrakt a parser stanice: `shared/weather.ts`. Astronomie má samostatný UTC čas; čas měření počasí ji neřídí.

## Primární podklady

- [Open-Meteo – oficiální Forecast API](https://open-meteo.com/en/docs), sekce Current Weather, Hourly Parameter Definition, Pressure Level Variables a JSON Return Object: `current` podporuje také hodinové proměnné, tedy vrstvy oblačnosti, dohlednost a vítr na tlakových hladinách. Jde o meteorologický model. Čas `current.time` označuje platnost hodnot, nikoli čas inicializace modelu. Úhrny se vztahují k `current.interval`; převod na hodinovou intenzitu je `3600 / interval`.
- Stejná dokumentace rozlišuje oblačnost do 3 km, 3–8 km a nad 8 km. Hra používá reprezentativní vítr v 850/500/300 hPa, přibližně 1,5/5,6/9,2 km nad mořem. Jsou to modelové hladiny s proměnlivou výškou, nikoli zaměřené základny oblaků. Původní 700/500 hPa pro střední/vysokou vrstvu neodpovídaly těmto pásmům.
- [Silicon Hill – stránka vlastní stanice](https://weather.sh.cvut.cz/weather/): skutečné HTML identifikuje Davis Vantage Pro2 Plus a kódování Windows-1250. Parser čte označené řádky aktuálních hodnot a pražský čas. Ikona předpovědi není měření oblačnosti. Denní maximum větru není aktuální náraz; jako takový se neparsuje.
- Open-Meteo uvádí srážky jako vodní ekvivalent v mm, sněžení v cm a kódy počasí WMO. Skupenství v aplikaci vychází z modelového sněžení, kapalných úhrnů a těchto kódů, nikoli samotné přízemní teploty.

## Rozlišení měření, modelu a odhadu

Čerstvá stanice vlastní `temperature`, `wind`, `windDirection` a `rain`. Její validní vlhkost má přednost. Model doplňuje oblačnost, proudění ve výšce, dohlednost, nárazy, sněžení a odhad skupenství; při chybějící vlhkosti také vlhkost. Každý doplňkový údaj má v `fieldSources` svůj původ (`station`/`model`), čas platnosti a příznak zastarání. `status: live` tedy neprohlašuje všechny doplňky za naměřené.

`rain` nadále znamená intenzitu srážek v mm/h (u modelu včetně vodního ekvivalentu sněhu). `snowfall` je cm/h; `liquidPrecipitation` je modelový součet deště a přeháněk v mm/h. Tyto hodnoty se nesčítají. `precipitationType` může být `none`, `rain`, `snow`, `mixed`, `freezing-rain`, `hail` nebo `unknown`. Při hlášených srážkách stanice a suchém modelu zůstane intenzita stanice a skupenství se označí `unknown`. Stanice sama neposkytuje spolehlivé měření skupenství. Chybějící údaj o sněhu zůstává neznámý, ne nula.

Věk se kontroluje i při čtení pětiminutové cache: stanice nejvýše 30 minut, model nejvýše 60 minut, tolerance budoucího času 5 minut. Doplňky stárnou podle vlastních časů. Neúspěšná obnova označí ponechané hodnoty jako zastaralé. Nově stažené starší údaje nenahrazují novější uložené hodnoty. Neplatné volitelné hodnoty nebo jednotky se nepoužijí; neúplný vektor větru ve výšce se celý nahradí označeným orientačním povrchovým vektorem.

Prohlížeč při stávající minutové obnově kontroluje stáří i lokálně přes `client/weather-freshness.ts`. HTTP chyba, výpadek spojení nebo dvacetisekundový timeout označí ponechané údaje jako zastaralé; čas i původ jednotlivých hodnot zachová. Probíhá nejvýše jeden požadavek a odpojení komponenty jej zruší. Hodiny náhledu osvětlení na stáří dat nemají vliv. HUD používá `sourceKind`, proto stará stanice zůstává označená jako stanice i se stavem `fallback`; zastaralý model oblačnosti uvádí odděleně v popisu zdroje.

## Praktické ověření

Skutečný `createWeatherProvider()` s produkčními URL skončil **2026-10-12T11:17:31.528Z**. Oba poskytovatelé vrátili HTTP 200:

| Údaj | Výsledek | Původ / platnost UTC |
| --- | --- | --- |
| Teplota, přízemní vítr, vlhkost | 11,7 °C; 0,9 m/s od západu; 67 % | stanice, 11:17:10 |
| Oblačnost celkem; nízká/střední/vysoká | 90 %; 85/80/0 % | model, 11:15:00 |
| Vítr 850/500/300 hPa | 6,12 / 12,76 / 29,88 m/s | model, 11:15:00 |
| Směr ODKUD v 850/500/300 hPa | 294° / 327° / 349° | model, 11:15:00 |
| Dohlednost; nárazy | 39 940 m; 6 m/s | model, 11:15:00 |
| Srážky | stanice 0 mm/h; model sníh 0 cm/h; skupenství `none` | oddělené zdroje výše |

`pnpm exec tsx --test tests/weather-provider.test.ts tests/core.test.ts`: **15/15 prošlo**. Osm nových případů ověřuje skupenství nezávislé na teplotě, jednotky a neznámé hodnoty, reprezentativní výškový vítr, sloučení stanice/modelu s původem, rozporné srážky, staré/budoucí časy, stárnutí cache bez mutace předchozích odpovědí, spojení souběžných požadavků a zotavení po výpadku. Živý síťový pokus není součást deterministických testů.

Po následné kontrole klienta `pnpm exec tsx --test tests/weather-freshness.test.ts tests/hud-status.test.ts tests/weather-provider.test.ts`: **14/14 prošlo**. Čtyři nové případy ověřují oddělené stárnutí stanice/modelu v prohlížeči, nezměněné předchozí odpovědi, ztrátu a obnovení čerstvosti, zachování původu staršího protokolu a správné české/anglické označení skutečně zastaralé stanice i starších modelových mraků. Testují stav a vykreslený HUD; nesimulují síťový výpadek v živém prohlížeči.

Cílený refaktoring sjednotil stáří hodnot do `isWeatherStale`, čtení a kontrolu modelových jednotek, seznam tlakových hladin i doplňkových proměnných. Pražský formátovač času se znovu používá. Cache vrací stejný objekt, dokud se nemusí změnit stav stáří; při změně kopíruje dotčená metadata a nepoškozuje předchozí odpovědi. Dokončený požadavek vždy uvolní `pending`.

Jde o kontrolu datového toku; nevypovídá o FPS, GPU ani přesné poloze konkrétních mraků. Viz souhrn integračního a vizuálního ověření v `../verification.md`.
