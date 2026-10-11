# CPU profil konstrukce rozšířeného areálu

Byly nalezeny a opraveny dva konkrétní startup hotspoty: opakovaný úplný scan hran silničních polygonů a úplné procházení překážek při generování trávy. **Tato čísla měří CPU konstrukci geometrie, nikoli FPS ani výkon GPU.** NullEngine pouze umožnil vytvořit skutečné Babylon meshe bez grafického kontextu; textury z canvasu a GPU kompilace se tímto postupem neověřují.

## Podmínky a zdroj

Dva samostatné procesy `node --import tsx --cpu-prof` spustily stejný `.cache/profile-geometry.mts`. Rozšířený podklad obsahoval 380 silničních prvků, 143 mapových budov, 120 budov po filtru viditelného areálu, 130 ploch, 48 mapových stromů a 106 výsledných stromových umístění. Herní hranice byly X −500…440 m, Z −270…340 m.

V každém procesu se před měřením a po něm shodovaly hashe všech zahrnutých souborů `client` a `shared` včetně JSON podkladů. Jde o **profilovací hash této sady souborů**, nikoli hash kompletního produkčního snapshotu:

- Před opravou: `def5f19631151335384af9623a105dbffeb62601adc9d08b47dad272da4eba5f`.
- Po opravě: `8db1cacfc296829b232ead4d354a81ba5777817268e74bb796706374d8e142ca`.

Při měření nebyl podle koordinace spuštěn build ani test; celkové vytížení systému však činilo 37,1 % a 37,9 %. Stroj tedy nebyl zcela nečinný. Procesní CPU časy potvrzují náklady konkrétních funkcí, ale absolutní wall časy nejsou laboratorní minimum. Importy přes Node/tsx nejsou obdobou importů produkčního browserového bundlu. Celá sekvence navíc opakuje některé geometrické výpočty, takže její součet se nevydává za dobu načítání hry.

## Naměřené konstrukční časy

| Fáze | Před, ms | Po, ms |
|---|---:|---:|
| Samotné drapování asfaltu včetně Earcut | 1272 | 1208 |
| Kompletní `streetVertexData`, asfalt | 14174 | 2103 |
| `buildStreets`, všechny povrchy/lampy/přechody | 14556 | 3058 |
| `createGrassPatches` | 11054 | 601 |
| `createMappedTrees` | 21 | 9 |
| `buildTerrain` | 218 | 219 |
| `buildLandcover` | 653 | 651 |
| `buildArchitectureReality` | 239 | 257 |
| `buildLandmarkReality` | 175 | 170 |
| Konstrukce Rapier `Simulation` | 757 | 865 |

Úpravy snížily zaznamenaný čas celého stavění ulic přibližně **4,8×** a generování trávy **18,4×** v profilovacích bězích. Samostatný ověřovací běh bez CPU profileru potvrdil trávu 9763 → 660 ms. Nezměněné fáze přirozeně kolísaly; výsledek nedokládá zrychlení Rapieru, fasád ani terénu.

CPU profil přímo ukázal řetězce `ringContains → streetPolygonContains → streetVertexData` a `ringContains → streetPolygonContains → streetSurfaceAt → createGrassPatches`. Jen přímé vzorky `ringContains` v prvním samostatném street wrapperu představovaly přibližně 11,8 s. U generování trávy šlo přibližně o 6,35 s, další čas spotřebovávaly úplné seznamy překážek. Earcut samotného asfaltu přitom trval jen 19,5 ms.

## Oprava a zachování geometrie

- `shared/streets.ts`: 16m index kandidátních polygonů zachovává původní pořadí materiálů. Pro stažené statické prstence se předpočítají hrany ve 8m řádcích. Konečný ray casting a numerická tolerance `1e-7` zůstávají stejné; index pouze vynechává hrany, které nemohou zasáhnout. Cizí mutable polygony používají původní predicate bez cache.
- `shared/vegetation.ts`: 16m kandidátní index pro mapové plochy, budovy a úseky cest. Index obsahuje maximální příslušné okrajové vzdálenosti; následné přesné testy hranic, vzdáleností a povrchů jsou zachované. Nejde o rasterizovanou aproximaci terénu.
- Materiálový agent v `client/streets-renderer.ts` odstranil redundantní opakované testování původního polygonu po Earcut a konvexním DEM clippingu. Ponechal kontrolu budov a konzervativní fallback při nevyhovující area deviation. Podrobné geometrické testy této změny přebírá vlastník rendereru.

Celý JSON všech výsledných travních umístění je před a po opravě **byte-for-byte shodný**: 599 dlaždic, 80 736 trsů, SHA-256 `624fd4d67386277f0c0fb5d106fbb93fd4cb1e55a0aaf58c8108f6c2a978748d`. Žádné náhodné semeno, poloha, rozměr ani hustota se nezměnily.

Před/po se shodovaly také počty všech stavěných geometrií: ulice 517 746 vrcholů / 173 270 trojúhelníků; terén 53 401 / 76 153; landcover 134 880 / 44 960; architektura 246 040 / 123 020; orientační stavby 46 823 / 21 527; Rapier 8114 colliderů a 25 rigid bodies. **Samotná shoda počtů není důkaz shody všech street vertex array hodnot**; jejich přesné porovnání a produkční GPU audit jsou oddělené navazující ověření.

Nové čtyři testy `tests/vegetation-index.test.ts` prošly: původní exhaustive edge oracle včetně hran otvorů a záporných hranic buněk, mutable cizí polygon, původní exhaustive classifier pro trávu/les/mapové i odhadované stromy a otisk celé travní sady. Širší testy a build provádí hlavní integrační běh.

## Raw evidence a reprodukce

Lokální evidence zůstává v `.cache`: `profile-geometry-results.json`, `profile-geometry-after.json`, `geometry-before.cpuprofile`, `geometry-after.cpuprofile`, `profile-geometry-callstacks.json`, `profile-geometry-rings.json`, `profile-grass-before.json`, `profile-grass-before-summary.json`, `profile-grass-after-summary.json`. Obsahuje jednotlivé wall/CPU časy, zdrojové manifesty, počty a vytížení systému. Profiler lze zopakovat příkazem:

```powershell
pnpm exec node --import tsx --cpu-prof --cpu-prof-dir=.cache --cpu-prof-name=geometry-new.cpuprofile .cache/profile-geometry.mts new
```

Další optimalizace mají vycházet z nového browserového profilu: tato oprava řeší dlouhou synchronní konstrukci při vstupu do světa. Nevysvětluje sama o sobě trvalý pokles FPS po dokončení načítání, konkrétní GPU bottleneck ani dosažení 60/144 FPS.
