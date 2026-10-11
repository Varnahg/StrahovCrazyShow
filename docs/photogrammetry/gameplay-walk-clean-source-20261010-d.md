# Průchozí skutečná fotogrammetrie: fyzikální audit

Běh 2026-10-10T21:13:07.655Z; zdrojová kolize SHA-256 `88c247467579429c92dbec2886ebdb156cfc73d426bcd3472095947e905c2b0c`.

Použita jedna produkční `new Simulation(photoCollision)`, 3 949 797 nejpodrobnějších trojúhelníků. Původní DEM simulace se nepoužila. Žádná trasa neteleportuje, neskáče ani neupravuje kolize či toleranci. Čas provozu je deterministicky 0; jde o fyzikální audit zdrojového povrchu, nikoli GPU/FPS test.

**Výsledek: 0/1 průchodů PASS, 1 FAIL.** Stabilita souborů během běhu: beze změn.

| Trasa | Výsledek | Projitá / plánovaná délka | První problém |
|---|---|---:|---|
| stadium191a | FAIL | 280.52 / 610.16 m | actual-kcc-blocked-no-progress-for-two-seconds při X=-94.713, Y=3.061, Z=39.269 |

První zaseknutí/propad, skutečné Rapier kontaktní body, normály, ID původních IPR uzlů, ray support, pomocná výška spawnu, waypointy a vzorky po 0,25 s jsou v přiloženém JSON. KCC má nezměněný produkční autostep 0,22 m a capsule 0,42/0,38 m. FAIL se nesmí považovat za průchod úspěšný na základě starších testů DEM.

Opakování:

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --label clean-source-20261010-d-repeat
```
