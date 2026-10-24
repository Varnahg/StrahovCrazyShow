# Source13: oprava provenance a rozhodnutí před další implementací

24. 10. 2026, runtime `e05dd4c668c3364612e49d311aad17afacf27a58`, immutable source `2f1b68d0c3581922f7bfb88ecfb08119d7434926842282e741135d3d758a28a0`, build `4f72c7993280b9bce8fefa22ef2a40cbc057aec867c657d99c648b425fecf529`.

## Oprava zveřejněné interpretace

Původní source13 README/root-review a navazující root sdělení chybně označily první F jako Medium. Přímé `before` **i** `after` všech tří původních compiler oken dokládají **Auto / Low, revision 23, hardwareScaling 2, interně 1020 × 493, CSS 2040 × 986**. Samostatné stavy před i po F to potvrzují. Během předchozí chůze Auto měnilo kvalitu i rozlišení; startup-ready už má Auto/Medium/scaling 1,2. Nelze tvrdit stabilní Medium ani interní 2040 × 986 pro tento celý průchod.

Původní raw soubory, receipts a 107členná evidence zůstávají beze změny. Tato datovaná oprava nahrazuje chybnou interpretaci, nikoli původní měření. [Strojový důkaz](source13-rendering-erratum.json) obsahuje plné hashe oken, přímé rendering state, 32 uložených stavů a ověřené srovnání všech čtyř shaderových vstupů. `SHADOWLOWQUALITY0` samo render kvalitu nedokládá; rozhodující jsou skutečné rendering state. Díky nezávislému CPU autorovi byla chyba odhalena před další produktovou změnou.

První Mia F stále zachytilo 3 PBR + 1 nepřiřazený derived shadow požadavek, první Robin F 1 shadowMap, opakování 0. **Všechny tři PBR mají přesně stejné vertex/fragment/defines/contextName SHA jako Mia record 1/2/3 ve V15.** Třetí glass receptura se liší od omezeného okna V16, nikoli od celé historie. Nová je přesnější vazba na B6 sink/window glass. Nepřítomnost starého FAR stadium požadavku v tomto okně sama nedokládá zlepšení.

## Doložený řetězec a meze

- Game `prepareLightingVariants` uvolní Authored lease při každé nové etapě (`client/game.ts`, apply kolem 2704), ale získá jej jen pro `vehicle && !refreshOnly` (2737). Původní player-ON etapy proto nemají zaručenou aktivaci deklarovaných B6/road přijímačů. To je přímá mezera pokrytí; neprokazuje, že shodný shader key nemohl vzniknout jinou etapou.
- Game completion gate sleduje aktivní kreslení, dvě stabilní ready kola a pending pipelines. Počet nepokrytých deklarovaných přijímačů z helperu sám completion neblokuje. CPU helper fixture dokládá native instancing lane konkrétního vybraného zdroje; nedokládá všechny reálné B6 vazby v celé hře.
- Produkční Low politika vypíná stíny auta, baterka je má i v Low. Po opravě skutečné kvality jde o relevantní kandidát rozdílné receptury. Rozdíl musí ukázat skutečné výrobní controllery a native defines, nikoli ručně sestavené očekávané flags.
- Normální B6/road producenti nepodporují hypotézu, že jejich kořen musí být běžně disabled. Stejně tak není podpořen rozdílný falloff: příslušná světla používají STANDARD. To nevylučuje konkrétní odmítnutý receiver během skutečného begin, jehož výběr zatím chybí v runtime záznamu.
- Authored release mění pouze vlastní enabled/registraci/alwaysSelect stav; nevolá material/Effect disposal ani engine cache clear. Obecná cesta draw cache disposal může snížit referenci Effect na nulu, ale startup→F trace pro tyto konkrétní efekty zatím chybí. Cache retention oprava proto nemá doloženou příčinu.
- Nativní `checkNonFloatVertexBuffers` může znovu zpracovat **existující Effect** při změně vertex typů. Počet `_preparePipelineContextAsync` tedy není automaticky počet nově vytvořených Effectů. Skutečný spouštěč na těchto receiverech není změřen. [Pinovaný primární kód Babylon 9.30.0](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Buffers/buffer.nonFloatVertexBuffers.ts).
- Mesh používá `useMonoDataStorageRenderPass = !engine.isWebGPU`. NullEngine má jinou instanced storage cestu než skutečné WebGPU. Pouhé `routing.isWebGPU=true` v Game fixture nemění Scene engine na WebGPU. Mono `world0` atributy se nesmějí omylem vydávat za doloženou WebGPU regresi. [Pinovaný primární Mesh](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Meshes/mesh.pure.ts).

Rozlišujeme tři dosud neuzavřené příčiny: přesný recept nebyl připraven; připravený Effect byl legitimně uvolněn; stejný Effect byl znovu zpracován. Post-ready compiler okna je sama nerozliší. [Pinovaný WebGPU cache/release kód](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Engines/webgpuEngine.pure.ts) je podklad mechanismu, nikoli důkaz konkrétní eviction.

## Rozumné varianty před zásahem

| Varianta | Přínos | Náklady, rizika a lifecycle | Současné rozhodnutí |
| --- | --- | --- | --- |
| Vybrat přijímače také pro existující player-ON etapy | Přímé pokrytí skutečné baterky včetně Low shadow varianty | Další výběr/draw práce; při zachování všech car příjemců může duplikovat přípravu. Musí zachovat přesné own lease restore i scene disposal. | Kandidát po reprodukci |
| Rozdělit stávající receiver skupiny mezi car a player-ON etapy | Může přesunout nové B6/road/stadium do relevantní varianty bez nových etap | Nutné doložit, které car recepty zůstávají pokryté; riziko regrese původního Standard/outdoor pokrytí. Dopad na cold cache a dobu startup není zatím znám. | Kandidát po reprodukci |
| Držet Effect/cache reference déle | Pomůže jen při prokázaném uvolnění potřebného klíče | Paměť, vlastnictví, device-loss cleanup; problém neřeší, pokud recept nikdy nevznikl nebo jde o reprocess. | Nezvoleno bez eviction důkazu |
| Zvýšit light budget, vytvořit proxy, přesouvat kameru či přidat etapy/timeout | Může vynutit jinou kompilaci | Mění shader/lights, vzhled, práci a pravidla přejímky; bez příčiny může pouze skrýt problém. | Nezvoleno |
| Malá CPU reprodukce původních metod, producentů a material rozhodování | Levně rozliší selekci, actual instanced batch a car/torch define recepty | GLSL/NullEngine neposkytne skutečný WGSL hash, GPU výkon ani důkaz absence v runtime cache. Storage adapter musí být explicitní. | **Zvoleno jako nejbližší krok, task330** |

Task330 používá omezený skutečný sink GLB se zachováním BLEND materiálu, původní B6 instance placement a road producer, původní Game metody a VehicleLighting/PlayerFlashlight/StableLightState/GltfLightBudget. Technický calibration caster je výslovně označený, není náhradou přijímače ani tvrzením o geografii světa. Oba storage módy jsou označené; test nemá uměle vždy-ready cestu ani ručně zadané shader flags. Zachová skutečné RED. Produktové soubory se během probe nemění.

Původní startup dokončil 76 etap za 80,6776 s, Medium přípravná část za 29,805 s. Rezerva 195 ms vůči původnímu 30s limitu nedovoluje bez měření přidávat další práci. Původní 30/90 limity se nemění. Source13 má 142 cílených CPU PASS, fresh 39 pinů, TypeScript/build/izolovanou integraci a exact runtime CI PASS; to není praktické přijetí baterky ani finální GPU výkon.

Vlastní GPU karta a služby byly ukončeny, zdroje vráceny CAD před 01:37 UTC. Do dalšího explicitního okna běží jen lehká CPU reprodukce. Finální CM/NCM/GL série, jednotná funkční matice, výchozí WebGPU a integrace do main zůstávají otevřené.
