# Průchozí skutečná fotogrammetrie: předběžný fyzikální audit

**Náhrada:** použij běh raw-source-20261010-b. Původní mapování Rapier featureId na sourceNode bylo chybné a bylo odstraněno; samotné fyzikální kontakty a neúspěšné průchody zůstávají skutečné.

Běh 2026-10-10T20:40:48.593Z; zdrojová kolize SHA-256 `d313d45b158fd67bb65bac3b12a4f63360646527de8386c52543544ab53cd434`.

Použita jedna produkční `new Simulation(photoCollision)`, 3 949 772 nejpodrobnějších trojúhelníků. Původní DEM simulace se nepoužila. Žádná trasa neteleportuje, neskáče ani neupravuje kolize či toleranci. Čas provozu je deterministicky 0; jde o fyzikální audit zdrojového povrchu, nikoli GPU/FPS test.

**Výsledek: 2/8 průchodů PASS, 6 FAIL.** Stabilita souborů během běhu: beze změn.

| Trasa | Výsledek | Projitá / plánovaná délka | První problém |
|---|---|---:|---|
| spawn-east-10m | PASS | 10.03 / 10.00 m | — |
| spawn-west-10m | PASS | 10.10 / 10.00 m | — |
| spawn-north-10m | FAIL | 9.80 / 10.00 m | actual-kcc-blocked-no-progress-for-two-seconds při X=22.147, Y=-0.208, Z=-23.712 |
| spawn-south-10m | FAIL | 2.26 / 10.00 m | actual-kcc-blocked-no-progress-for-two-seconds při X=22.812, Y=-0.100, Z=-12.499 |
| stadium191a | FAIL | 0.53 / 503.14 m | actual-kcc-blocked-no-progress-for-two-seconds při X=21.931, Y=-0.051, Z=-14.241 |
| stadium191b | FAIL | 0.53 / 641.85 m | actual-kcc-blocked-no-progress-for-two-seconds při X=21.931, Y=-0.051, Z=-14.241 |
| rko-east-public-approach | FAIL | 0.53 / 160.85 m | actual-kcc-blocked-no-progress-for-two-seconds při X=21.931, Y=-0.051, Z=-14.241 |
| b6-north-stairs-to-reception | FAIL | 3.17 / 20.05 m | actual-kcc-blocked-no-progress-for-two-seconds při X=-4.850, Y=0.622, Z=-81.831 |

První zaseknutí/propad, skutečné Rapier kontaktní body, normály, ID původních IPR uzlů, ray support, pomocná výška spawnu, waypointy a vzorky po 0,25 s jsou v přiloženém JSON. KCC má nezměněný produkční autostep 0,22 m a capsule 0,42/0,38 m. FAIL se nesmí považovat za průchod úspěšný na základě starších testů DEM.

Opakování:

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --label raw-source-20261010-a-repeat
```
