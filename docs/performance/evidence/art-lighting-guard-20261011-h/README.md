# Oprava opakované CPU práce lamp — kandidát H

Živá změna je pouze v `client/art-lighting.ts`: `Light.setEnabled` se zavolá, jen pokud se změní požadovaný vlastní stav lampy. Počet lamp, dvě nejbližší noční lampy na medium/high, jejich intenzita, dosah, počasí, Slunce, Měsíc, simulace i kvalita modelů zůstávají stejné.

Babylon **9.30.0** má v `Lights/light.js:382–384` volání `_resyncMeshes()` také při opětovném nastavení stejné hodnoty; smyčka na řádcích 659–665 znovu navštíví každý registrovaný mesh. Equality guard v základním `Node.setEnabled` toto dodatečné volání Light override nezastaví. Před změnou tak 36 už vypnutých lamp ve scéně s 2 726 meshi vytvářelo 98 136 redundantních kontrol za snímek.

```ts
if (light.isEnabled(false) !== enabled) light.setEnabled(enabled);
```

Argument `false` porovnává vlastní požadovaný stav, nikoli efektivní stav pod případným vypnutým rodičem. Při skutečné změně se stále použije standardní Babylon API včetně jeho synchronizace světel.

[cpu-proof.json](./cpu-proof.json) je skutečně provedené porovnání nezměněného **zmrazeného G** se dvěma řádky kandidátního guardu. SHA-256 G source ID je `18312ddacd1191e512cfb5f0e1018f024e020fdad8d0075130657e4ea43a6684`; původní `art-lighting.ts` byl ověřen proti G manifestu před spuštěním. Živý opravený soubor přesně odpovídá hashované kandidátní kopii.

| Deset stabilních aktualizací | G | Opravený kandidát |
| --- | ---: | ---: |
| Volání resync světel | 360 | 0 |
| Návštěvy meshů | 981 360 | 0 |

Použito bylo **2 726 skutečně registrovaných prázdných Babylon Mesh a 36 skutečných PointLight**, nikoli celá vykreslená hra. Jde o přesný důkaz počtu CPU volání, **nikoli FPS, GPU, čas snímku nebo simulaci komplexity reálných modelů**. Uložený [zdroj tohoto běhu](./cpu-proof-source.txt) a [patch](./candidate.patch) umožňují kontrolu; v tomto workspace lze zopakovat `pnpm exec tsx .cache/patches/art-lighting-proof.ts` proti zachované kopii G.

Porovnání dále prošlo se shodným konečným stavem všech lamp/intenzit, barvami oblohy/mlhy, Sluncem a ambientním světlem: noc high dvě nejbližší, přesun k jiné dvojici, noc low bez lokálních lamp, den medium, vypnutý rodič a jeho opětovné zapnutí.

Trvalé regresní testy jsou v `tests/art-lighting-maintenance.test.ts`. Měří přímo skutečná volání `Mesh._resyncLightSource`, potvrzují chování současného Babylon override, nulové opakování v ustáleném dni i noci, stejné dvě nejbližší lampy, změny kvality a pohybu, automatické nasvícení dodatečně přidaného meshe a zachování stavu pod vypnutým rodičem.

- `pnpm exec tsx --test tests/art-lighting-maintenance.test.ts tests/weather.test.ts tests/graphics.test.ts`: **18/18 PASS**, exit 0, viz [úplný log](./targeted-tests.log). Zahrnuje stávající astronomii, fáze a orientaci Měsíce, meteorologické směry, teplotu a čerstvost zdrojů počasí, DST, mlhu i maskovaná noční okna.
- Cílený strict TypeScript pro `client/art-lighting.ts` a nový regresní test: **PASS**, exit 0; [log](./targeted-typescript.log) je prázdný, protože kompilátor nehlásil žádnou chybu.

SunCalc ve SkyWeather už před touto změnou běžel nejvýše jednou za sekundu změny skutečného UTC vstupu; Intl pro aktivitu nočních oken rovněž. Nebyly proto zpomalovány ani upravovány astronomické či meteorologické funkce. Podrobné read-only poznámky jsou také v `.cache/patches/environment-analysis.md`.

**Výkon celé hry po této změně zatím nebyl měřen.** Zachované G měření jednoho hráče vykazuje 32,1 FPS a průměr environment 10,267 ms, GPU kolem 21,855 ms. Oprava tohoto CPU opakování sama nedokládá dosažení 60 FPS. Neúplný G30 běh (29–30 přítomností a chybějící včasný GPU vzorek) se nevydává za validní třicetihráčový GPU benchmark. Tento subagent neprováděl další browser/FPS běh, full suite, build ani snapshot; finální H ověření a GPU měření patří nové zmrazené sestavě.
