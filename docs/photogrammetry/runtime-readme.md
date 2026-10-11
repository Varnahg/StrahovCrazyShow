# Skutečná fotogrammetrie Strahova

Venek lze vykreslit z původní texturované trojúhelníkové sítě **IPR Praha, léto 2023**. Jde o skutečné letecké fotogrammetrické snímkování, včetně odlišných korun stromů, fasád, stadionu, hřišť, komunikací a zachycených automobilů. Geometrie ani JPEG atlasy nebyly přegenerovány, zmenšeny nebo nahrazeny opakovaným modelem stromu.

Zdrojový [veřejný Scene Service IPR](https://www.arcgis.com/home/item.html?id=92d2d376599c4fd2b6600ed46db7402e) deklaruje **CC BY**. Uváděná atribuce: **datový podklad © IPR Praha**. Metadata položky a vrstvy jsou uložená vedle tohoto dokumentu. Jejich údaj o textuře přibližně 5 cm/pixel není zárukou pěti centimetrů na každé zakryté fasádě nebo spodní straně stromu.

## Původní zdroj

- Rozsah hry: X −500…440 m, Z −270…340 m.
- Archiv: 3 518 zdrojových uzlů úrovní 12–16, celkem 498 525 388 bajtů geometrie a JPEG.
- Nejvyšší původní úroveň: 2 588 dlaždic, **3 955 667 trojúhelníků**.
- Originály: `public/models/photogrammetry/ipr2023/`; manifest obsahuje SHA-256 každého souboru. Nižší zdrojové úrovně jsou oddělené soubory, nepřepisují nejvyšší úroveň.
- Souřadnice XY: EPSG:3857; středy i lokální XY offsety se převádějí do metrů přes cos(50,08065°). Výška je Baltic 1957/Bpv v metrech a pouze se odčítá reference **326,392 m**. Výška se Mercatorovým koeficientem nenásobí.

Čistý decoder `shared/photogrammetry.ts` čte deklarovaný I3S buffer: UInt32 počty, Float32 pozice/UV, UInt64 ID a inkluzivní rozsahy trojúhelníků. Rozložení vychází z [primární specifikace Esri pro geometryPosition](https://github.com/Esri/i3s-spec/blob/master/docs/1.9/geometryPosition.cmn.md) a [defaultGeometrySchema](https://github.com/Esri/i3s-spec/blob/master/docs/1.9/defaultGeometrySchema.cmn.md). Nepodporované nebo neúplné buffery odmítne. Transformace east/north/up → east/up/south zachovává orientaci zdrojových trojúhelníků.

## Integrace do hry

```ts
const scan = await loadPhotogrammetry(scene, {
  initialPosition: player,
  // Volitelné společné predicate pro herní úpravu vstupu/interiéru B6:
  excludeTriangle: excludesPlayablePorch,
  sourceRegion: classifyScannedB6Envelope,
  regionVisible: (region, player) =>
    region !== "b6-shell" || !isInsidePlayableB6(player),
});
// Na každém snímku; LOD plán se sám aktualizuje nejvýše pětkrát za sekundu.
scan.update(player, quality);
scan.setLighting(daylightFactor); // 0…1; explicitní denní/noční zabarvení
const diagnostic = scan.stats();
// Při ověření zvolené scény lze počkat na aktuální frontu.
await scan.whenSettled();
// Při opuštění hry:
scan.dispose();
```

`loadPhotogrammetry` vrátí úspěšný controller až po načtení všech 19 základních zdrojových uzlů. Potom průběžně načítá nejvyšší originální úroveň okolo hráče. Nejvyšší detail je zachován u hráče při všech kvalitách; jeho okruh činí 84/60/40 m pro high/medium/low. Tyto okruhy nejsou zmenšením originálních textur.

Rodičovská dlaždice se skryje až při kompletním pokrytí všemi potomky dané větve. Chybějící geometrie nebo JPEG proto nechává viditelný rodičovský zdroj. Nejvýše čtyři uzly se načítají souběžně. Původní soubory zůstávají v archivu; LRU uvolňuje pouze neviditelné GPU prostředky. Kořeny a aktuálně viditelné pokrytí zůstávají připnuté. Výchozí cache 384 MiB je měkký limit: pokud samotný viditelný originální detail limit překročí, `stats().cacheBudgetExceeded` to přizná a viditelný model se nezahodí. Odhad paměti zahrnuje skutečné rozměry atlasů, mipmapy a vertex/index buffery, není měřením celé paměti ovladače.

Volitelný `sourceRegion(a,b,c,node)` rozdělí pouze indexové rozsahy. B6 shell tak může být venku viditelný a uvnitř skrytý. Všechny regiony uzlu sdílejí jednu původní GPU geometrii a jeden atlas. `regionVisible(region,player)` se vyhodnocuje na každém snímku. Výřez pro průchozí porch musí používat stejný predikát jako fyzikální zdroj; jeho odstranění je přiznaná herní adaptace. Nejvyšší originální soubory tím zůstávají nedotčené.

## Kontrola

Při spuštěném klientu otevři `/docs/photogrammetry/preview.html`. Obsahuje samostatné pohledy na koleje, severní vstup B6, sportoviště, Potraviny/R-ko, průčelí stadionu ve Vaníčkově a celý stadion. Stav dlaždic je čitelný v `#photogrammetry-stats`; inspekční náhled není měřením výkonu kompletní hry.

`pnpm exec tsx --test tests/photogrammetry.test.ts`: **13/13 PASS**. Testy kontrolují existenci/velikost všech originálů, SHA vzorků všech úrovní, dekódování skutečných bin dat, zachování UV a windingu, metriku/výšku, skutečný sedmdesátimetrový obrys B6, celistvost stromu LOD, atomické přepínání při chybě potomka, LRU bez děr, regionové indexy a gamma materiál. NullEngine kontroluje pouze kontrakt materiálu; neposkytuje důkaz FPS ani vizuální správnosti. Vizuální a GPU ověření celé hry se předává samostatně v `docs/verification.md`.

## Meze skutečného podkladu

Je to historický letecký mesh, nikoli dokonalý dnešní sken. Vegetace má individuálně zachycený tvar a barvu v roce 2023, ale koruny nejsou samostatné botanické modely, listy nejsou fyzicky oddělené a nefoukají ve větru. Zakryté průchody, spodní strany stromů, skla a jemné detaily u země mohou obsahovat deformace nebo chybějící data. Zachycená auta jsou statickou součástí skenu. Interiéry pokojů ve zdroji nejsou.

Atlasy obsahují původní denní osvětlení a stíny. PBR materiál je proto `unlit`, s původním gamma atlasem a zachovanými UV; nepřičítá druhé nesouvisející slunce. Noční tint nemůže odstranit stíny zachycené v létě 2023 ani samostatně rozsvítit skutečné pokoje. Procedurální stromy, silnice nebo fasády se nemají položit přes stejné části skenu, protože by vznikaly dvojité povrchy a nepravdivá geometrie.
