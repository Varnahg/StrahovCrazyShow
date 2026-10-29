# Wave3: příčiny zbývající práce

14. 10. 2026, navazující read-only analýza předaného lokálního updatu. Snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`, relace `371d306e-a801-41f0-917b-9ea7d832325d`. Oba původní JSONL díly jsou zachované v `.cache/playtest-repairs-validation/wave3-session/`. Doručených3195 událostí seq0–3194 je souvislých; chybějící session-end znemožňuje tvrdit úplné doručení konce.

## Render a svítilna

Reprodukovatelný výběr a vstupní SHA jsou v [wave3-render-analysis.json](wave3-render-analysis.json); lokální výpočet `.cache/playtest-repairs-validation/analyze-wave3-render.mjs`. Výběr40 periodických mesh vzorků t100–300s je po přepnutí noci94.3s a před první svítilnou310.9s; manual medium, GTX1060/2040×986, jeden stojící skutečný multiplayerový avatar. Nejde o celou frame distribuci ani GPU intervaly.

- Průměr mainDraw20.5225ms; dokončené observer řetězce15.805ms (příprava4.1875, bind/draw11.6175), nepřiřazeno4.7175ms. 15640 pokusů,0abandoned/ambiguous a0source-top8 omission.
- Dokončené intervaly podle zdroje: architecture3.9175ms/100calls, outdoor1.42/52, tree1.075/30, mapped-surface0.56/13. Největší skupina8.3075ms/183calls stále `unclassified`. Známá technická jména v inventáři zahrnují terén, cesty, základy, B6, vozidla a avatara. Inventář není časování; jednotlivým skupinám nelze z jejich počtu připsat čas. Detailní inventář má limit512 položek, nesmí se vydávat za všechny aktivní meshe.
- První ON: interval1149.4ms; mainDraw1047.6ms, shaderCreation CPU notification22.7ms/32programů. Mesh profil dokončil144/393 pokusů,85.8ms (příprava55.9/bind29.9);218abandoned/31ambiguous. Zbývajících961.8ms není poctivě přiřazeno konkrétnímu materiálu. Early-return readiness je možné vysvětlení, nikoli důkaz celé příčiny.
- Následující OFF/ON/OFF pořád mají mainDraw130.4/99.0/103.6ms. Samotná příprava nového shaderu proto nevysvětluje všechny opakované náklady; sledovat dirty/readiness/binding i po warmup.

## Hlídání světelných limitů

Počítadlo `writes=inflationRepairs=4638` je stejné ve všech588 herních frame-window kontextech t34.019–610.391s. `loaderStarts=loaderReady=23`, `ownerChanges=0`. Tyto zápisy vznikly během startu, nikoli při pozdějším záseku svítilny.

`visits` ovšem stouplo až na6004713. V úseku36.899–159.326s je beze změny278 materiálů/42 registrovaných světel/2 enabled/0loaderů, přesto1421414 dalších návštěv =5113 úplných průchodů. Primární kód: `scene.onBeforeRenderObservable -> GltfLightBudget.update -> materials`. Callback běží před active-mesh/draw intervaly, jeho režie tedy patří do zbytku celkového render času, nikoli mainDraw. Nový navazující patch smí vynechat nečinný scan, musí zachovat forced owner/load/update a deferred frozen/error recovery. Změna se nepřenáší do právě vydaného snapshotu. Přínos FPS dosud nezměřen.

Babylon9.30 setter maxSimultaneousLights vyvolává material light dirty scan přes scene.meshes/subMeshes/drawWrappers (`material.pure.js`). Startup4638 oprav mohou stát čas, ale jejich podíl není samostatně změřen. Nepoužíváme plošné blokování dirty mechanismu ani úpravy prototypů/node_modules.

## Síť

Tři klientem vyžádané resyncy jsou doložené místními záseky:

| t | Důvod | Důkaz |
|---|---|---|
|33.895s|stale-authority po startu|Kotva stará~633ms po595ms dlouhé úloze; odpověď34.082s.|
|312.065s|prediction-budget po svítilně|ON310.914s,1137ms longtask/render1077.5ms; přes32ticků, odpověď312.400s.|
|350.210s|prediction-budget při editoru|Editor349.447s; target2293 protiack2258=35ticků, RTT jen7.4ms; odpověď350.691s.|

Další resyncy: join a server-clock-drop531.270s, skutečně vynechaný1tick/16.667ms při nejdelším callback intervalu149.77ms. Všech5posunů0m. 291probe odpovědí,272přijatých/19kontaminovaných; raw291.7ms s275ms blokace nezměnilo čistý predictionRTT83.2ms. 0probe timeoutů a0latency-budget čekání. Sloučeno946 běžných authority;16reconcile/18sender resetů/0tvrdých korekcí. Všech34130vyrobených vstupů odesláno, maxfronta8,0overflow/discard/send-error. Server115late/13old-epoch/0ahead/duplicate/invalid; finálnílead6, vzorky6–9.

Všech588 frame kontextů ale stojí na stejné pozici s vehicle:false. **Žádný důkaz opravené jízdy/korekcí za pohybu.** Render/editor záseky se nemají maskovat jako problém čistého RTT.

## Startup

Konstruktor37.5ms (1mesh/2materiály), kompletní game-start22595.6ms. Street asphalt maxoperace30.3ms, B6structure3.2ms; zbývá architecture819.2ms atomicky, outdoor389ms, landcover226.5ms, campus-plan216.3ms. Static-collisions630.9ms, final-visual-setup642.5ms. Asset wall times car2997.1ms,vegetation10138.1ms,B612477.7ms jsou souběžné: **nesčítat**. Nový startup není přijatý jako rychlý ani jako splnění4ms maxima.

## Další důkazy

Aktuální uživatelský test běží nad frozen wave3. Nepouštět vedle něj fullsuite/build/GPU ani druhou herní scénu. Po jeho ukončení vybrat skutečnou herní relaci a vyhodnotit řízení, korekce, světlo, editor i log continuity. Nové runtime patche potřebují nový source checkpoint a praktické GPU ověření; tento dokument žádnou zbývající issue neuzavírá.
