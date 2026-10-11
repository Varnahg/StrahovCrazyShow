# Průchozí skutečná fotogrammetrie: fyzikální audit

Běh 2026-10-10T21:11:46.019Z; zdrojová kolize SHA-256 `88c247467579429c92dbec2886ebdb156cfc73d426bcd3472095947e905c2b0c`.

Použita jedna produkční `new Simulation(photoCollision)`, 3 949 797 nejpodrobnějších trojúhelníků. Původní DEM simulace se nepoužila. Žádná trasa neteleportuje, neskáče ani neupravuje kolize či toleranci. Čas provozu je deterministicky 0; jde o fyzikální audit zdrojového povrchu, nikoli GPU/FPS test.

**Výsledek: 4/9 průchodů PASS, 5 FAIL.** Stabilita souborů během běhu: beze změn.

| Trasa | Výsledek | Projitá / plánovaná délka | První problém |
|---|---|---:|---|
| parking-to-footgraph-connector | PASS | 23.32 / 23.41 m | — |
| spawn-east-10m | FAIL | 6.28 / 10.00 m | actual-kcc-blocked-no-progress-for-two-seconds při X=114.975, Y=-2.417, Z=11.998 |
| spawn-west-10m | FAIL | 5.93 / 10.00 m | actual-kcc-blocked-no-progress-for-two-seconds při X=104.328, Y=-2.131, Z=11.827 |
| spawn-north-10m | PASS | 9.89 / 10.00 m | — |
| spawn-south-10m | FAIL | 1.80 / 10.00 m | actual-kcc-blocked-no-progress-for-two-seconds při X=110.020, Y=-2.272, Z=13.785 |
| stadium191a | FAIL | 280.52 / 610.16 m | actual-kcc-blocked-no-progress-for-two-seconds při X=-94.713, Y=3.061, Z=39.269 |
| stadium191b | FAIL | 280.52 / 748.86 m | actual-kcc-blocked-no-progress-for-two-seconds při X=-94.713, Y=3.061, Z=39.269 |
| rko-east-public-approach | PASS | 106.38 / 102.32 m | — |
| b6-north-stairs-to-reception | PASS | 19.92 / 20.05 m | — |

První zaseknutí/propad, skutečné Rapier kontaktní body, normály, ID původních IPR uzlů, ray support, pomocná výška spawnu, waypointy a vzorky po 0,25 s jsou v přiloženém JSON. KCC má nezměněný produkční autostep 0,22 m a capsule 0,42/0,38 m. FAIL se nesmí považovat za průchod úspěšný na základě starších testů DEM.

Opakování:

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --label clean-source-20261010-c-repeat
```
