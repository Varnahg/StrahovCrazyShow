# Průchozí skutečná fotogrammetrie: fyzikální audit

Běh 2026-10-10T20:47:27.526Z; zdrojová kolize SHA-256 `d313d45b158fd67bb65bac3b12a4f63360646527de8386c52543544ab53cd434`.

Použita jedna produkční `new Simulation(photoCollision)`, 3 949 772 nejpodrobnějších trojúhelníků. Původní DEM simulace se nepoužila. Žádná trasa neteleportuje, neskáče ani neupravuje kolize či toleranci. Čas provozu je deterministicky 0; jde o fyzikální audit zdrojového povrchu, nikoli GPU/FPS test.

**Výsledek: 2/3 fyzikálních spawn sond PASS, 1 FAIL.** Stabilita souborů během běhu: beze změn.

| Trasa | Výsledek | Projitá / plánovaná délka | První problém |
|---|---|---:|---|

## Samostatné sondy spawnu

| X,Z | Hráč | Auto yaw0 / yaw90 | Nejmenší radiální odstup | Source výška |
|---|---|---|---:|---:|
| 95,12 | FAIL | FAIL / FAIL | 0.344m | -2.669m |
| 110,12 | PASS | PASS / PASS | 5.434m | -3.069m |
| 130,12 | PASS | PASS / PASS | 5.226m | -3.591m |

První zaseknutí/propad, skutečné Rapier kontaktní body, normály, ID původních IPR uzlů, ray support, pomocná výška spawnu, waypointy a vzorky po 0,25 s jsou v přiloženém JSON. KCC má nezměněný produkční autostep 0,22 m a capsule 0,42/0,38 m. FAIL se nesmí považovat za průchod úspěšný na základě starších testů DEM.

Opakování:

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --label spawn-candidates-20261010-a-repeat
```


Dodatečný read-only findCampusWalkRoute([x,z],191A/B,10): všechny tři body jsou bez přípojky do10m, proto samy o sobě nejsou vhodným napojeným spawnem. Tento dotaz nemění ani neopakuje fyziku.
