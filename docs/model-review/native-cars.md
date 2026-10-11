# Samostatné nativní modely aut

Skutečný loader je `client/assets.ts`; `client/environment-models.ts` v této pracovní kopii neexistuje. Auta používají jediný původní projektový model `/models/strahov-compact.glb`, nikoli část surové fotogrammetrie nebo společný mesh prostředí.

## API pro Game

```ts
const models = await loadCar(scene); // sourceParking: true je výchozí
models.car;          // TransformNode: campus-car:driving
models.parked;       // TransformNode: campus-car:parked
models.parkingRoots; // ReadonlyMap<slot.id, TransformNode>, aktuálně 24 aut
models.updateWheels(vehicleState);
models.dispose();    // idempotentní, zavolat před scene.dispose()
```

`car` a `parked` jsou dvě vizuální reprezentace stejné fyzikální entity `metadata.entityId = "campus-car"`; Game nadále řídí jejich společnou polohu a viditelnost ze stavu simulace. Výchozí řízená reprezentace je skrytá, zaparkovaná viditelná. Volba `{sourceParking:false}` nevytvoří žádná další parkovaná auta. `{assetSource: Uint8Array}` slouží pro ověření skutečného GLB bez prohlížeče nebo testovacího HTTP serveru.

Každé auto ze zdrojových parkovacích pozic má samostatný kořen s `root.id = slot.id`, stejným `metadata.entityId`, provenance zdroje a `simulatedOccupancy:true`. Obsazenost a šest barevných variant jsou demonstrační; nejde o současné skutečné majitele nebo inventář vozidel. Kořeny a jejich potomci nemají zamrzlé world matrices. Změna jediného kořene se proto skutečně projeví na jeho vlastních částech. Případnou budoucí změnu parkovací polohy musí vlastník simulace provést i ve sdílených kolizních datech; loader sám fyzické překážky nepřemisťuje.

Sdílených 13 geometrií karoserie a kol leží v neveřejném skrytém banku mimo všechny kořeny vozidel. Vozidla obsahují vlastní instance těchto částí. Pohyb karoserie ani otáčení nebo zavěšení kol řízeného auta nemění ostatní auta. Lak sdílí šest materiálových variant; guma, slitina a skla zůstávají sdílené. Žádná část auta není připojená k budově, stromu nebo terénu.

## Materiály, skla a DMR

Lak má jemnou PBR clear-coat vrstvu. Skla jsou tmavá neprůhledná dielektrická zasklení (`metallic=0`, roughness 0,16, IOR 1,52), která přebírají odlesky prostředí. Model nemá interiér vozidla; neprůhledné tónování zabrání pohledu do prázdné kabiny. Nejde o transparentní simulaci čelního skla ani výrobní model konkrétního auta.

Všechny parkovací kořeny používají přesně stejné pozice `PARKING_SLOTS`, výšku `groundHeight - 0,0112 m` a `groundRotation` jako nativní kolize. Nezávislý kontrolní vzorek u všech 96 spodních bodů pneumatik naměřil mezeru vůči DMR **0,001871–0,015064 m**. Jedná se o souhlas s použitým DMR modelem, nikoli o přesnost geodetického zaměření.

Při prvním zaparkovaném stavu bez raycast kontaktů se použije původní 0,32m zavěšení z modelu. Starý neinitializovaný stav 0,25 m zvedal kola o 7 cm; tento vizuální problém loader odstraňuje. Po skutečném fyzikálním kontaktu se znovu používá úplný stav zavěšení a otáčení kol.

Generátor `scripts/create-car.py` nově definuje jediný editable `StrahovCompactAsset` root s asset ID a deterministickými ID částí, exportuje extras a nepřidává animace. Zároveň používá uvedené materiálové nastavení. Aktuální GLB nebyl kvůli této úpravě přegenerován: jeho původní samostatná geometrie je zachována a potřebné materiálové nastavení aplikuje loader. Syntaxe generátoru a podporované exportní volby byly ověřené přímo v nainstalovaném Blenderu 5.2.2 bez renderu nebo zápisu modelu.

## Ověření

`pnpm exec tsx --test tests/native-car-models.test.ts`: **5/5 PASS**. Testy načítají skutečné publikované GLB do Babylon NullEngine, ověřují 24 samostatných identit, vlastní metrové bounds, sdílených 13 geometrií, efektivní přesun jednoho kořene bez změny ostatních, nezávislou animaci kol, fyzické umístění vůči DMR, šest barev, skla, přepínání viditelnosti a úplný idempotentní úklid. Po `dispose()` nezůstaly meshe, geometrie, materiály ani transformační uzly loaderu.

Samostatný strict TypeScript check nového testu prošel. NullEngine zde ověřuje loader, transformy, aktivní meshe a materiálový kontrakt; nejde o screenshot, GPU měření nebo důkaz cílového FPS.

Následný skutečný nativní KCC průchod ze současného startu (110; 12) je odděleně uložen v `authored-walks-native-20261011-a.json` a `.md`: obě 191, přístup před R-kem a severní recepce B6 prošly se všemi 109 kmeny, 24 zaparkovanými auty a pěti oplocenými hřišti. Jeden krátký fyzický detour vedl kolem parkovaného auta po existujícím asfaltu; žádná kolize se nevypnula. Praktické vykreslení a výkonnost celé hry ověřuje root zvlášť.
