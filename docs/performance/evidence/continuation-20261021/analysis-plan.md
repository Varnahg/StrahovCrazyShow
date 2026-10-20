# Vyhodnocení před převzetím výsledků KEY-53

Zapsáno21Oct2026 před získáním finálních A/B raw dat. Cílem není najít libovolně zelené číslo, ale odlišit cenu stabilního pool sweepu od zbytku dopravního rendereru a vlivu na skutečné snímky celé hry. Vlastní optimalizace se zde neimplementuje.

## Vstup a rozhodující podmínky

Převzít jedinou úplnou kampaň od koordinátora, nikoli ručně vybrané zdařilé intervaly. Očekávání z jeho aktuální metodiky: A1/B1/A2/B2/A3/B3, v každém startu jedna skupina profile3×10s a jedna plain3×10s. Oba módy stejného slotu patří ke stejnému startId. To je36 přijatých intervalů, nikoli36 nezávisle randomizovaných pokusů. Neúspěšné/partial/recovered/start failures uchovat s důvody, nezařazovat do přijatých výkonových statistik.

Nejprve ověřit hashe skutečných build/source/test/asset vstupů a kompletní manifest. Runtime rozdíl smí být pouze `client/transit-renderer.ts`, plus příslušné testy; helper/scénář musí být stejný. Kandidát PR22/head3ac77c7a/basec3454 prošel CI1864/1864, buildem a integrací, ale CI nenahrazuje tuto přejímku.

Zkontrolovat všechny comparability/method/health příznaky, skutečné GPU/backend/CSS/backbuffer/DPR, kvalitu, stejné UTC/počasí, kameru a polohu, minimálně3reálné avatary s profily a12NPC s LOD. Přesné hashe podmínek a tolerance v `conditions.mjs` mají odlišný scope; nesplněný příznak nesmí zmizet změnou filtru po zhlédnutí dat. Pool/scene počty i sémantické transit vstupy musí odpovídat stejnému obsahu. Bez této shody není FPS rozdíl přijatý A/B důkaz.

## Samostatná CPU a FPS interpretace

- **Profile:** z původních `profile.updateMs` a `pruneMs` uvést počet, součet, průměr a p95 každého intervalu. Prune je vnořený do update a obsahuje wrapper; nikdy je nesčítat. `sum(pruneMs)/updates` vyjadřuje amortizovanou cenu sweepu na update, nikoli průměr samotného volání při jiném počtu volání. Zachovat obě veličiny i čítače.
- **Plain:** FPS počítat jako `1000/mean(rawFrameMs)`, nikoli průměrovat vyhlazené HUD hodnoty. Uvést všech18 intervalů po variantách, jejich p95/p99, maxima a počty≥50/100ms. Profilované FPS nepřimíchávat do plain a nevydávat je za běh bez dodatečné instrumentace.
- **Kvantily:** primární reprodukce použije přesný aktuální assembler index `sorted[min(n−1,floor(n·p))]`. Volitelný souhrn všech raw snímků jasně odlišit od mediánu jednotlivých percentilů. P95 z deseti sekund neslibuje chování vzácného několikasekundového záseku.
- **Opakování:** zachovat pořadí a jednotlivé hodnoty; pro tři sousední páry A1/B1,A2/B2,A3/B3 uvést rozdíl i směr změny. Souhrn po startu a celkové vážené FPS uvést vedle celého rozpětí. Se třemi páry neprohlašovat robustní statistickou významnost nebo univerzální zrychlení. Změny taktů/teplot či jiné zátěže uvést, pokud jsou dostupné; chybějící telemetrii přiznat.
- **Rozlišení časovače:** u krátkých CPU volání uvést také podíl nul a nejmenší kladnou pozorovanou hodnotu. Minimum vzorku není měření skutečné hardwarové přesnosti. Prázdná řada nevolaného prune má průměr `null`; amortizované0 na update z ní nedělá „nulově drahé volání“. Zaokrouhlení nebo kvantování nesmí být interpretováno jako přesný mikrosekundový zisk.

## Rozhodnutí a další atribuce

Pokud v B ustálený sweep zmizí, ale celková CPU/FPS změna není odlišitelná od kolísání, výsledek říká odstranění práce bez prokázaného celkového zrychlení. Pokud update čas klesne při shodném obsahu, vyčíslit tento skutečný scope; neoznačit jím cenu create/dispose, shaderů ani celé hry. Případnou regresi, záporný výsledek nebo neplatné podmínky zachovat.

Podle velikosti potvrzeného zbytku aktualizovat prioritu mezi průběžným render/submission, scene-owned tvorbou/rušením, UV invalidací, čistým grass tile CPU kernelem a modelovou geometrií. Dřívější stacky a nový statický GLB inventář jsou kandidáti pro další měření, nikoli automatické pořadí oprav. Po přijetí zkontrolovat skutečný merge SHA a push/main CI; měřený kandidát nesmí být zaměněn za jiný HEAD.

Výsledek se opře o předané raw a aktuálně přečtený assembler/scénář, bez restartování či úprav koordinátorových běhů. Tento plán a následná interpretace patří pouze tomuto tasku. Vlastní heavy/GPU experiment se současně nespouští.
