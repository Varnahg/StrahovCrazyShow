# Průchozí skutečná fotogrammetrie: fyzikální audit

Běh 2026-10-10T20:50:00.662Z; zdrojová kolize SHA-256 `d313d45b158fd67bb65bac3b12a4f63360646527de8386c52543544ab53cd434`.

Použita jedna produkční `new Simulation(photoCollision)`, 3 949 772 nejpodrobnějších trojúhelníků. Původní DEM simulace se nepoužila. Žádná trasa neteleportuje, neskáče ani neupravuje kolize či toleranci. Čas provozu je deterministicky 0; jde o fyzikální audit zdrojového povrchu, nikoli GPU/FPS test.

**Výsledek: 3/3 fyzikálních spawn sond PASS, 0 FAIL.** Stabilita souborů během běhu: beze změn.

| Trasa | Výsledek | Projitá / plánovaná délka | První problém |
|---|---|---:|---|

## Samostatné sondy spawnu

| X,Z | Hráč | Auto yaw0 / yaw90 | Nejmenší radiální odstup | Source výška | Foot graph do10m |
|---|---|---|---:|---:|---|
| 113,12 | PASS | PASS / PASS | 2.442m | -3.160m | nespojen |
| 110,16 | PASS | PASS / PASS | 7.561m | -3.130m | nespojen |
| 113,16 | PASS | PASS / PASS | 3.345m | -3.209m | nespojen |

První zaseknutí/propad, skutečné Rapier kontaktní body, normály, ID původních IPR uzlů, ray support, pomocná výška spawnu, waypointy a vzorky po 0,25 s jsou v přiloženém JSON. KCC má nezměněný produkční autostep 0,22 m a capsule 0,42/0,38 m. FAIL se nesmí považovat za průchod úspěšný na základě starších testů DEM.

Opakování:

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --spawn-probes-only --label car-candidates-20261010-a-repeat
```
