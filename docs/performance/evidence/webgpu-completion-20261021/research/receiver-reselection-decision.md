# Opakovaný výběr přijímačů po skutečném instanced draw

24. 10. 2026; navazuje na [source13 provenance a varianty](source13-receiver-chain-decision.md) a konečný reprodukční task330. Před produktovou změnou; praktické GPU přijetí zůstává otevřené.

Sonda původních Game etap se skutečnými B6 sink/road producenty ukázala konkrétní RED ve dvou explicitních storage režimech: první Low `vehicle-0` vybere čtyři přijímače a všechny skutečně projdou native hardware instanced batch. Následující `vehicle-1` už vybere nulu a čtyři označí unsupported; pozdější car etapy se opakují stejně. Celých 76 etap přesto ohlásí complete. Přesný konečný výsledek a hashe přebírá root až z předání task330.

## Doložený mechanismus

Helper čte `Mesh.getVerticesDataKinds()` a `getVertexBuffer(kind)` bez bypassu instance dat a odmítne jakýkoli nenulový divisor. První původní draw vytvoří automatické `world0…world3` instance matrix buffery. Native `_bindDirect` kopíruje i **per-pass** buffery do společného `_userInstancedBuffersStorage.vertexBuffers`. Další helper begin proto zamění normální engine matrix atributy za nepodporované vlastní instancování.

Předchozí předpoklad, že jde pouze o NullEngine mono artefakt, byl neúplný: root nezávisle ověřil tento copy krok v lokálním pinovaném `mesh.pure.js:1591` i [oficiální 9.30.0 implementaci](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Meshes/mesh.pure.ts#L2086). Sonda stále používá NullEngine/GLSL; shodná source větev není náhradou skutečné WebGPU přejímky.

Po deferred cleanup jsou ve fixture tři původní přípravné Effects stále živé a ve stejné cache. To nepodporuje eviction jako příčinu tohoto konkrétního CPU selhání, ani nevylučuje eviction v původní celé GPU hře. Pozdější skutečně kreslící sink/road pohledy oddělují první torch požadavek od opakovaného off/on se stejným full GLSL key/Effect/context. Žádné z těchto čísel není WGSL hash či GPU výkon.

## Porovnání zásahů

| Varianta | Dopady | Rozhodnutí |
| --- | --- | --- |
| Číst geometrické atributy přes existující `bypassInstanceData=true` | Oddělí stabilní geometry ABI od engine matrix dat. Zachová zákaz vlastních `instancedBuffers` i skutečně instancovaných geometry atributů. Nemění světla, source geometrii, draw cestu, lease ledger, cache ani lifecycle. | **Nejmenší zvolený zásah po převzetí konečné RED sondy** |
| Whitelist automatických `world*` názvů | Váže pomocníka na názvy/počet interních bufferů; může omylem propustit cizí atribut stejného jména. | Nezvoleno |
| Ignorovat všechny nenulové divisory | Oslabí výslovný unsupported kontrakt pro vlastní instancování. | Nezvoleno |
| Cacheovat první výběr/layout přes další etapy | Může skrýt změněné materiály/light členství, disposal, producer takeover a reentry. Přidává stav a invalidaci. | Nezvoleno |
| Přidat Low player-ON forced leases či přesouvat car receivery | Může řešit samostatnou coverage mezeru, ale ne příčinu odmítání při opakovaném begin. Přidá práci nebo ztratí car shadow-OFF pokrytí. | Odloženo do výsledku opravené stejné sondy |
| Držet Effects nebo prodloužit timeout | S tímto doloženým odmítnutím nesouvisí. | Nezvoleno |

Zásah má jen změnit čtení geometrických atributů; vlastní instanced buffer a geometry-divisor negativní kontroly musejí zůstat RED. Nová regrese musí provést **skutečný první native draw**, uvolnit lease a znovu jej získat v mono i per-pass větvi. Původní fixture330 pak musí projít všemi car etapami; nové torch recepty se porovnají se sjednocením všech původních přípravných kvalit. Bez takového důkazu nelze tvrdit, že další player-ON práce není potřeba.

Původní 19 etap/pass a 30/90s limity se nemění. Oprava obnoví skutečnou práci, která byla dříve chybně přeskočená, takže startup může být dražší; je nutné nové praktické měření. Low 27,8931 s a Medium 29,805 s ze source13 nejsou záruka nového času. GPU/cache/image/performance/main/default se tímto výzkumem ani CPU GREEN neuzavírají.

## Převzatý finite výsledek

Root ověřil původní41souborový seal bez driftu a převzal přesný task330 scope po release autora. Změnil pouze oba geometry getters a komentář. Dvě nové regrese skutečně provedou native draw→release→reacquire v mono/per-pass větvi; třetí zachovává odmítnutí genuine geometry `world0` s divisorem1. Původní public custom-instanced kontrola zůstala. Testové vstupy RED/GREEN jsou totožné: **22PASS/4FAIL → 26PASS/0FAIL**, širší cílený celek **69PASS/0FAIL/0SKIP**. Pět explicitních TypeScript roots/alltransitives3206 má0diagnostics a5syntax0; nejde o celoprojektový build.

Ve stejné nezměněné sondě nyní všech24car etap vybere4/unsupported0 a všechny4 projdou původním hardware batch. Cílové ON full GLSL keys odpovídají skutečně vykreslenému car sjednocení: sink Medium/High keyed1/2, road Low keyed0. Proto teď **nepřidáváme další player-ON leases**. První Low frontON ale stále přidá jeden agregovaný program u sink a jeden u road, bez atribuce; opakovanéON přidá0. Nejde o tvrzení nulové kompilace ani skutečného WebGPU cache přínosu.

[Veřejné root důkazy](../receiver-stage-chain/reselection/root-acceptance.json) zachovávají původní RED, GREEN, širší běh, raw JSON.gz, typy a dva finální code review bez nálezů. Původní omyl root runneru v exportní cestě/reporter summary je zachován zvlášť a není vydáván za zamýšlený coverage RED. Native39 a helper36 zůstaly stabilní. Přijatý je úzký source/CPU celek; nový immutable14 a skutečný GPU/startup test následují v koordinovaném okně.
