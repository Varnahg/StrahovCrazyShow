# Předání: grass-cold-audit

- Vlastník: `fps-20261013-grass`; příjemce: koordinátor FPS optimalizací.
- Pracovní kopie: `/workspace/StrahovCrazyShow`, větev `work`, výchozí commit `a381cf6`.
- Výsledek: aktuální runtime stále obsahuje synchronní studenou cestu popsanou historickým auditem. Read-only průzkum hotový; nový CPU profil zatím nebyl spuštěn.
- Soubory: toto předání a `docs/verification-evidence/agents/grass-cold-audit/profile.ts`. Žádné převzetí cizích změn; výchozí Git byl čistý.
- Primární podklady: současné `photographic-grass.ts`, `photo-grass-{placement,budget,batch,resources,transition}.ts`, `shared/{terrain,vegetation}.ts`, `tests/photo-grass.test.ts`, Babylon 9.30 `thinInstanceMesh.pure.js`. Historická studie: `docs/vegetation/grass-realism-study/README.md`, závěrečný oddíl.

## Příčina a navržená oprava

`update()` při změně kvality nebo každých 150 ms po pohybu volá `selectRoots()` pro celý viditelný prostor. Každý chybějící 1m tile synchronně klasifikuje 169 kandidátů; každý platný kandidát kontroluje pět bodů vůči mapovaným plochám, budovám, ulicím a terénním povrchům. Následují normály terénu a matice až 160 kořenů. Ve stejném snímku proběhne enumerace všech kandidátů, úplné řazení, rozpočet, vytvoření všech chybějících instancí a upload. Cache je omezená na 256 tile, ale studenou práci neomezuje.

Historických ~265 ms medium / ~181 ms high nelze vydávat za současné měření. Zahřátý výběr má pouze cache lookup, ale stále prochází a řadí celou množinu. GPU cenu listů a uploadu NullEngine neprokáže.

Navržené přesné writePaths pro navazující fix: `client/photographic-grass.ts`, `client/photo-grass-placement.ts`, `tests/photo-grass.test.ts`, vlastní předání/evidence. Pomocný selector/heap modul přidat pouze po explicitním rozšíření koordinátorem, pokud ho konečný návrh potřebuje.

Rozložit generování dlaždic a enumeraci kandidátů do omezených dávek s limitem jednotek práce i časovým rozpočtem. Zachovat zobrazené kořeny až do dokončení nového deterministického výběru; ostře změněná kamera/kvalita ruší zastaralou práci. Dokončené kandidáty zpracovat podle stejného score a ID, zachovat LOD hysterézi, všechny výluky a stropy 60k/140k/280k včetně odcházejících kořenů. Také plnění velkého počtu instancí rozdělit, aby se pouze nepřesunul náraz do commit snímku. Dispose musí vyprázdnit rozpracované fronty a reference na matice.

## Ověření a hranice

Existující testy pokrývají determinismus po eviction, geometrii a výluky, rozpočty při pohybu a high→low, identitu kořenů, nulové zbytečné uploady při stání a disposal během načítání. Nové regrese mají přidat omezené množství studené práce na update, stejný konečný výsledek jako synchronní výběr, dokončení při pohybu, zrušení zastaralého cíle a dispose uprostřed přípravy. Časové limity CI nenahrazují strukturální kontrolu práce.

Reprodukce CPU: `pnpm exec tsx docs/verification-evidence/agents/grass-cold-audit/profile.ts <output.json>` v rezervovaném `heavy-validation` okně. Driver používá stejnou reálnou trávu, terén, kameru a rozpočty v Babylon NullEngine: cold medium, zahřátý pohyb, high, low a přesun do nového okolí. Ukládá jednotlivé časy, p95/p99/max, první snímek, konečné kořeny a zdrojové SHA včetně testů. Je to CPU komponentový důkaz, nikoli FPS celé produkční hry.

Procesy: žádný server, GPU, Blender, build ani profil nespouštěn. Cílené testy a skutečné baseline/candidate měření následují pod koordinátorem; zápis auditních souborů byl ověřen `git diff --check`. Rezervace bude uvolněna po předání.
