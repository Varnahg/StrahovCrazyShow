# Řízené auto: omezené noční reflektory

Kontrola 11. října 2026 používá skutečné Babylon 9.30.0 světlo, transformace kořenů, shadow mapu a výběr casterů. Automatizovaná část běží v NullEngine: ověřuje stav a matematiku skutečných objektů enginu, **neměří GPU, výsledné pixely ani FPS celé hry**. Vizuální kontrolu integrované hry provádí hlavní proces samostatně.

## Poloha a simulované parametry

`VehicleLighting` vytváří jediný combined SpotLight pro řízené auto. Lokální původ je průměrem dvou `frontCentres` z kanonického [manifestu](../../shared/data/assets/vehicles-manifest.json), navíc o 0,025 m před směrem +Z. Tyto středy pocházejí ze skutečných source meshů předních lens a stejné normalizace jako karoserie. Průměr je přibližně `(0; 0,830676; 1,757757) m`; po odsazení z = 1,782757 m. Odsazení omezuje střet s vlastním povrchem lens, jde o herní interpretaci. Kořen obsahuje stejný výškový offset a polohu terénu jako vozidlo; světlo znovu nepřičítá výšku nad zemí.

Každý update transformuje tento bod a normalizovaný směr `(0; −0,1; +1)` celou aktuální world maticí vozidla, včetně rodiče, yaw a pitch. Světlo nemá vlastního rodiče, takže world transformace se neaplikuje dvakrát. Test používá nezávislé numerické očekávání pro 90° yaw, 30° pitch a kombinovaného rodiče s translací.

Kužel má úhel 0,8 rad, exponent 2, konečný dosah 32 m, teplou barvu `#fff2d4`, standardní Babylon falloff a intenzitu `1,6 × night`. **Intenzita, směr a dosah jsou výtvarné jednotky, nikoli změřené lumeny, kandely či homologovaná fotometrie potkávacích světel.** Jde o jeden souhrnný symetrický kužel, ne o plnou fyzikální simulaci dvou asymetrických automobilových světlometů. Samostatné skutečné lens materiály svítí přes car pack.

Ve dne, při zaparkování/vystoupení, pro `night ≤ 0,1` a pro nekonečný/neplatný vstup je světlo vypnuté, intenzita nulová a shadow pass zakázaný. Hodnota `night` je omezená na 0–1. Volání `setEnabled` proběhne jen při změně stavu: Babylon samotný může při jediné změně resynchronizovat mesh dvakrát, ale dalších 30 stejných update nezpůsobí další resynchronizaci scény.

## Stíny a výběr objektů

| Kvalita | Reflektor | Shadow mapa |
| --- | --- | --- |
| Low | konečný dosah 32 m | vypnutá; při prvním low update ani nevzniká generátor |
| Medium | konečný dosah 32 m | jeden PCF target 256 × 256 |
| High | konečný dosah 32 m | tentýž generátor, PCF target 512 × 512 |

Neznámá kvalita používá konzervativně low. Generátor vzniká až při prvním aktivním medium/high update a rovnou v požadované velikosti. Bias je 0,0007, normal bias 0,015; shadow clipping má near 0,1 m a far 32 m.

Původní implementace posílala do shadow passu všechny castery do 36 m, včetně objektů za autem a vedle kužele. Explicitní render list sám tento problém neřeší. Opravený postup má široký výběr pomocí skutečného world bounding sphere s 36 m dosahem a **při kreslení** přesný konzervativní test world AABB vůči aktuálním šesti rovinám shadow kamery. Velký objekt protínající kužel/far rovinu se ponechá, i když jeho střed leží mimo. Rezerva hran je 0,02 m, pro označenou wind geometrii dalších 0,5 m. Objekty za autem, stranou a za dosahem se odmítnou.

Široký seznam se obnovuje nejpozději po 250 ms, ihned po posunu světla přes 2 m, změně počtu meshů, návratu z neaktivního/low stavu a změně velikosti shadow mapy. Obsahuje také potenciální dočasně vypnuté LOD: okamžitý výběr ověřuje aktuální `shadowCasterKind`, takže nově zapnuté LOD nečeká čtvrt sekundy. Sky, metadata `depthCaster=false`/`shadowCaster=false`, průhledná skla, slabě viditelné/faded meshe a neoznačené libovolné custom shadery nevrhají plné černé stíny.

Test skutečně reprodukoval ještě cache chybu Babylonu: nově vytvořený mesh přesunutý ve stejném render ID měl při obyčejném `computeWorldMatrix()` starý bounding sphere v počátku. Oprava vynutí přepočet pouze pro `!mesh.isSynchronized()`; zmrazená statická scéna se násilně nepřepočítává. Nové objekty a přesun vozidla o 100 m se nyní projeví ihned. Callback se znovu naváže také po resize targetu 256↔512, který render target vytváří znovu.

Označený alpha-test wind shader může získat vlastní `ShadowDepthWrapper` se stejným remapováním proměnných jako cinematic pass. Již existující wrapper se přebírat ani rušit nesmí. `dispose()` uvolní vlastní shadow generátor, světlo a vlastní wrappery právě jednou; pokud vlastnost materiálu mezitím převzal jiný vlastník, nevymaže ji. Po dispose jsou další update nečinné.

## Přesná noc a ověření

Okamžik `2026-10-11T00:00:00Z` je **02:00 Europe/Prague**. Sdílená astronomie dává Slunce přibližně −43,9162°, Měsíc −50,2433° a osvětlenou frakci Měsíce přibližně 0,254 %. `applyArtLighting` vrací nulové sluneční i měsíční světlo a skutečně vypne nulový celestial key. S nejvýše dvěma aktivními pouličními lampami se do skutečných čtyř PBR light slotů vejde hemisphere, obě lampy a reflektor auta. Test kontroluje skutečný `mesh.lightSources`; nespoléhá na `renderPriority` jako záruku pořadí při pozdějším incremental enable.

Za soumraku a za měsíční noci zůstává nenulový celestial key. Game proto předává `headlightRequested = car.isEnabled()` a `extraPracticalLightSlots` ze skutečně zapnutého a nenulového B6 fillu. `applyArtLighting` rezervuje před výběrem ulic jeden slot pro hemisphere, další pro aktivní celestial key, pro auto pouze při `night > 0,1` a oznámené ostatní lokální zdroje. Kapacita ulic je `min(qualityLow ? 1 : 2, max(0, 4 - 1 - celestial - headlight - extra))`. Změna této kapacity okamžitě přepočítá nejbližší světla, i když neuběhlo 0,5 s; pravidelný timer a setEnabled transition guard zůstávají zachované. Pod osvětleným Měsícem a v autě zbývá jedna ulice; s B6 fill navíc žádná. Po vystoupení se uvolněná kapacita vrací v témže update. Materiály stále používají čtyři světla. Budoucí nový lokální zdroj musí svůj slot oznámit stejným vstupem.

Ověřeno 11. října 2026:

- `pnpm exec tsx --test tests/art-lighting-budget.test.ts tests/vehicle-lighting.test.ts tests/night-lighting.test.ts tests/art-lighting-maintenance.test.ts tests/cinematic.test.ts tests/weather.test.ts`: **36/36 PASS**, z toho 7 testů automobilového světla a 5 nových testů rezervace slotů. Novová noc, skutečný úplněk `2026-10-26T04:12Z`, skutečný soumrak `2026-10-11T16:10Z`, parkování/jízda/vystoupení, B6, low, nulové zdroje, steady-state resync a půlsekundový nearest timer jsou zahrnuté.
- `pnpm exec tsc --noEmit`: **PASS**, celý aktuální workspace, exit 0 v `2026-10-11T05:25:51.0719246Z`. Dřívější dva nesouvisející typy `BaseTexture.uScale/vScale` v testu B6 byly mezitím opravené jeho vlastníkem.
- Transformace, aktivace/vypnutí, 256/512/low, změna targetu, současné frustum i crossing bounds, cache/teleport/nové objekty, wrapper ownership a idempotentní disposal jsou ověřené na skutečných objektech Babylonu.
- Výsledné GPU stíny, tenké legitimní stíny plotů/sloupů, aliasing nízkého rozlišení a výkon celé hry vyžadují integrované browser QA. Tato oprava nezvyšuje noční globální ambient ani nevrací podhorizontní Měsíc.

Záznam příkazů a TypeScript výsledek: [headlights-tests.log](./headlights-tests.log), [headlights-typescript.log](./headlights-typescript.log).
