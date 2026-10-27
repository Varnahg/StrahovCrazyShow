# Obnovitelná výroba celého stromového katalogu

Task `trees-20261026-catalog-export`, dokončení 27. 10. 2026, baseline `8516c7b1`. Výroba původního source plánu **110 stromů je dokončena**. Po kontrolních modelech a výslovném povolení koordinátora vzniklo 104 dalších modelů; šest přijatých zdrojů bylo převzato přes pinované receipts. Všech 110 prošlo produkčním decoder auditem a katalog byl atomicky publikován. Herní aktivaci, GPU přejímku a integraci vlastní root. Historie rozhodnutí a vybraných běhů následuje níže; konečná čísla jsou v závěrečné části.

## Pevné podklady a rozdělení odpovědnosti

- Source plán SHA `97010582490d8c469d595543651eae3299741bcc4e8d67ee2cc4304f78d4db1d` zachovává všechny source ID, corrected roots, collision radii, nejistoty a nulovou znalost botanických druhů.
- Zdrojová banka 369 skutečných R6 medoidů: `public/models/vegetation/seasonal-r6-far/bank-source.json`, 544 094 B, SHA `df10633f0329e73162ddbe5fc47cbfc3183be68712f6eba2ca6d431bf03130e3`. Obsahuje čtyři původní MID rohy každého fotografického listu v definovaném UV pořadí; není to nový atlas.
- Runtime banka SHA `b6bd3a93c859b566b9fb18963441eee646389c9800242b4038e3c11a7f5339aa`, 474 603 B, zůstává neměnná. Kalibrace odvozené atlasové opacity je 0,20 podle samostatného FAR tasku; původní fotografické masky se neupravují.
- Původní B5 R6 a severní R5 conifer zůstávají neměnné vstupy. Finální B5 native package nově obsahuje nezměněné near/MID a přijatý kompletní FAR; severní conifer má novou plnou FAR odvozeninu. Jejich původní runtime near/MID bajty se nepřetvářejí. Podrobná skutečná přejímka těchto balíčků je níže.

## Konkrétní rozhodnutí o hustotě

Přijatý B5 má 82 100 fotografických částí a 5 760 nosných os. Prostý fit na skutečný 5m strom s původním minimem tří částí vytvořil 32 215 částí; vypnutí minima snížilo tento počet jen o 367. Listy LeafSet024 jsou dlouhé přibližně 123–129 mm, zatímco medián zmenšené nosné větve byl 126 mm. Problém není pouze minimum tří listů, ale zhuštěná celá hierarchie.

Zvolený nový postup vzorkuje skutečnou použitelnou délku osy (22–98 %) po 0,028 m u listnáče a 0,10 m u jehličnanu, bez vynuceného minima. Úzký horní limit 128 částí na větev chrání autorský výstup, není to měření skutečné rostliny. Listnatou populaci omezuje relativní plošný autorský rozpočet `82100 × (sx·sy + sx·sz + sy·sz)/3`. Nejde o botanickou hustotu; tento rozpočet zachovává rozdíl mezi malou širokou a vysokou úzkou korunou, který pouhá půdorysná plocha ztrácí.

Výběr zachová celé malé skupiny, nejprve extremální skupiny a potom prostorově rozložené skupiny v deterministickém cyklu. Nic neposouvá nebo nenafukuje k zakrytí mezery. Vybraným skupinám se jednou přidělí unikátní sezónní ranky. Fine wood pruning ponechá všechny jejich nosné osy a předky i hlavní osy depth≤2. Nevznikají oddělené větve. Metrická velikost, UV a původ fotografických částí se nezmění.

## Spustitelný postup

Všechny následující výrobní příkazy vyžadují dohodnuté `heavy-validation` okno; GPU ani browser nespouštějí. Jeden Blender proces postupně vyrábí jednotlivé stromy a mezi nimi uvolňuje scénu. Blender/Cycles, OpenMP, OpenBLAS a MKL jsou omezeny na dvě CPU vlákna.

```powershell
. .cache/trees-20261025/activate.ps1
node scripts/trees-20261026-catalog-export/prepare.mjs --create-run
# Použít přesnou cestu run.json vypsanou předchozím příkazem:
node scripts/trees-20261026-catalog-export/run.mjs --produce --run=.cache/trees-catalog-export-20261026/runs/RUN_ID/run.json --ids=4314257232,ipr-crown-074,ipr-b6-south-conifer,ipr-b6-north-bare --preview=yes
node node_modules/tsx/dist/cli.mjs scripts/trees-20261026-catalog-export/verify_runtime.ts --verify --run=.cache/trees-catalog-export-20261026/runs/RUN_ID/run.json --ids=4314257232,ipr-crown-074,ipr-b6-south-conifer,ipr-b6-north-bare
```

`RUN_ID` je záměrný zástupný symbol, nikoli skutečná složka. Historické batch ID jsou `8b60d5845e72d3b0` (první tři modely), `9181e80f6beaf299` (bare API oprava) a `7a24e4627ac58dcc` (opravená orientace obou listnáčů). Pro další výrobu vytvořit nový recipe run; do starého zmrazeného běhu se novým generátorem nezapisuje. `--ids=all` a následné `publish.mjs --publish --run=...` jsou implementované, ale zatím nejsou spuštěné ani přijaté.

`prepare.mjs` vytváří neměnný recipe hash zahrnující vstupní soubory a implementaci výrobních skriptů. Připraví source-local fitted axes, metrické skupiny, density audit a parent-closure výběr. Původní katalogový helper zůstává read-only.

`build_native.py` staví skutečné wood tubes. Jeho `native_geometry.py` přebírá doložený projektový algoritmus LOD, ale doplňuje povinné podpěry near/MID a jejich parent knots. MID reference 6 m odpovídá nejbližšímu novému přechodu. Každá kotva se kontroluje proti **vlastní větvi**, takže blízké sousední dřevo nemůže skrýt chybu. Fotografické near/MID komponenty se vytvářejí z téhož seznamu a ranků. Listnatý MID používá stejné rohy 0/1/5/4 jako near. Nový jižní conifer má své FirTree01 hull detaily a plnou stejnou populaci metrických quadů ve FAR; do listnaté banky se neposílá.

`fit_far.mjs` fituje nové skutečné MID skupiny rigidně ke **stejné** zmrazené bance. Zachovává part sequence, mean pivot a scale=1; maximální chyba 0,15 m a RMS 0,07 m jsou převzatými hranicemi FAR banky. Chybějící pattern nebo nadlimitní fit má přesnou MID fallback skupinu. Rank nikdy není vynechán. Výstupem jsou původní 32B záznamy, nikoli 110 nových atlasů.

`finalize_native.py` vytváří také skutečné editovatelné FAR cards a přesnou fallback geometrii uvnitř native souboru. Materiály odkazují relativně na jednu packed `materials.blend` knihovnu. Původní fotografie v ní jsou byteově ověřené a sdílené. Native je uložen, znovu otevřen a porovnán s deterministickými rohy. GLB export používá raw Float32 corner normals, ne standardní glTF zaokrouhlení; zachovává winding, UV a normalized uint16 rank. Near/MID musí po operaci FAR zůstat byteově stejné jako před ní.

`complete.json` potvrzuje skutečný uložený native a všechny tři soubory LOD, jejich SHA, reopen a vlastní geometrické kontroly. Dokončený strom se při resume nevyrábí znovu. Nedokončené či odlišné výstupy nejsou tiše přepisovány. Publikace nejdříve ověří všech 110 identit, všechny completion receipts, zdrojové bajty a současný 96MiB rezidentní limit; teprve posledním atomickým zápisem vytvoří celý runtime manifest. Aktivaci ve hře nadále vlastní root.

## Průběžné ověření a limity

Pět malých JS testů PASS (0 fail/skip) ověřilo metrické skupiny, chybějící podpěry, prostorový výběr, rigidní reuse/exact fallback skutečným runtime decoderem a odmítnutí částečného katalogu. Samostatný malý Python fixture bez Blenderu prošel pro tube UV, junction knots, required MID supports, root radius, metrické listy a společné near/MID komponenty. Úzký TypeScript check PASS. Python AST kontrola nejprve našla tři chybějící mezery u `else`; log je zachovaný, následná kontrola prošla. První skutečný Blender start odhalil chybějící script-directory `sys.path`; po doplnění vznikl nový recipe run, původní neúspěšný log zůstal zachovaný.

## Skutečné vybrané modely a nalezená orientační regrese

První listnaté výstupy měly příliš mnoho exact FAR fallbacků: 5m strom 8 504 z 9 278 částí, 24m strom 73 893 z 75 669. Nešlo o chybějící UV pattern. Nová funkce použila přímo sousední FNV hashe pro azimut; jejich rozdíl často činí právě `0x01000193`, takže listy postupovaly pouze o ±0,02454428 rad místo původního golden-angle kroku. Stejná fáze navíc řídila roll. Vznikaly téměř souběžné vějíře a fit ke skutečným původním skupinám selhával.

Counterfactual na 120 skutečných skupinách každého stromu zachoval všechny kotvy, části, UV, měřítko, banku i chybové meze. Změnil pouze azimut na `i×2.399963+jitter≤0.4` a nezávislý promíchaný roll. Fit vzorku vzrostl z 9,61/2,17 % na 100/100 %. Původní helper byl následně obnoven do `frozen-source/native_geometry.py` a jeho SHA `c66e5c61c25959f3c482213148d36e89b70a0d37e26e5b376d7c81aff7f2928c` se shoduje s původním pinem. Replay ukládá nový výstup, nepřepisuje původní důkaz.

Po této doložené opravě byly znovu vytvořeny pouze dva listnáče. Conifer a bare zůstaly podle pokynu koordinátora nezměněné přijaté vstupy. Plné výsledky:

| Zdroj | Foto částí | Bankou pokryto | Exact částí | FAR GLB + placements |
|---|---:|---:|---:|---:|
| 5m `4314257232` | 9 278 | 99,741 % | 24 | 25 372 + 85 728 = 111 100 B |
| 24m `ipr-crown-074` | 75 669 | 98,681 % | 998 | 231 992 + 482 496 = 714 488 B |
| jižní conifer | 12 258 | samostatná plná Fir geometrie | — | 2 184 712 B, 24 516 foliage tri |
| referenčně holý B6 | 0 | wood-only | — | původní vlastní wood geometrie |

U listnáčů zůstaly osy, kotvy, ranky a part ID přesně stejné. Maximální odchylka párových rozměrů listových rohů způsobená Float32 byla 0,673 µm / 3,173 µm. Každý z 9 278 / 75 669 / 12 258 zdrojových listů či větévek prošel vlastní near i MID branch podporou, vždy 0 fail. Uložené native soubory byly znovu otevřeny; ordered corners, UV a ranky se shodují s příslušnými GLB. Produkční parser a dekodéry všech čtyř zdrojů prošly včetně úplné listnaté FAR rank coverage. Snímky byly skutečně prohlédnuty; root přijal oba opravené listnaté geometrické směry pro pokračování katalogu.

Přijaté snímky jsou v `runs/7a24e4627ac58dcc/{4314257232,ipr-crown-074}/native-preview.png`, conifer v `runs/8b60d5845e72d3b0/ipr-b6-south-conifer/native-preview.png`, bare v `runs/9181e80f6beaf299/ipr-b6-north-bare/native-preview.png` pod taskovou cache. Jde o native CPU authoring, nikoli herní či GPU důkaz. Větší studio má při stejné energii světla slabší osvětlení; snímek 24m stromu proto nedokládá jiné texely.

## Dokončení, pauza a bounded cleanup pro další výrobu

`complete.json` nyní obsahuje malý source/density audit, FAR descriptor i SHA regenerovatelných mezisouborů. Resume nejprve ověřuje autoritativní `.blend`, sdílenou material library a GLB/placements. Není potřeba přítomnost `prepared.json`, `base.blend` nebo rozbalených arrays a dokončený strom se vůbec neposílá znovu do Blenderu.

Nová volba `--compact=yes` po dokončení zdroje ověří všechny autoritativní soubory a celý přesný delete set před prvním `unlink`. Odstraňuje jen osm povolených názvů regenerovatelných mezisouborů uvnitř daného source adresáře. Nekoná žádné rekurzivní mazání; symlinky a path escape odmítá. Malý audit a SHA odstraněných dat zůstanou v `compact-plan.json`/`compacted.json`. Všechny dosavadní evidence/counterfactual runy včetně `7a24e4627ac58dcc` jsou výslovně chráněné. Před výrobou skutečný malý filesystem fixture ověřil ochranu native souborů, odmítnutí poškozeného transientu před smazáním i opakované resume. Následující hromadný běh provedl cleanup u všech 104 nových zdrojů.

```powershell
node scripts/trees-20261026-catalog-export/control.mjs --pause --run=CESTA_RUN_JSON
node scripts/trees-20261026-catalog-export/control.mjs --resume --run=CESTA_RUN_JSON
```

Pause je levný marker; nehashuje velké modely. Probíhající strom se dokončí a batch skončí před dalším zdrojem. Nepoužívá zabití Blenderu nebo částečného exportu a nevydává pauzu za hotový batch. Pokud je pauza požadovaná, odloží také nepovinný cleanup a vrátí heavy okno rychleji. Další spuštění stále vyžaduje řádné převzetí rezervace. Fixture ověřil skutečné marker/archive operace; následně byl proveden i skutečný Blender stop/resume na hranici B5/North, popsaný níže.

## Finální native B5 a severní conifer: skutečně provedené balíčky

Původní native reference B5 ukazovala na crown `.blend` se starým řídkým FAR. To bylo opraveno samostatným `b5_package.py`: připojí právě čtyři přijaté near/MID objekty a tři přijaté kompletní FAR objekty (wood/exact/cards), nikoli starý sparse FAR. Neprobíhá geometrická regenerace, nový bake ani změna banky. Sedm objektů, jejich používané rohy/ranky, původní packed obrázky a materiálové grafy prošly přesnou kontrolou před uložením a po reopen. Nový `.blend` má 104 359 382 B, SHA `f2df37256b65d09549e3e92a1a0c94abe8b56476d268acd99d1fbcaec4d7f703`, run `7c98b4b39684797d`. FAR pokrývá všech 16 019 ranků (15 947 cards +72 exact). Runtime GLB/placements zůstaly původní přijaté soubory.

Skutečný B5/North batch se po dokončení B5 zastavil před North, skončil Blender a controller oznámil `paused`, 1/2 completed. Po explicitním resume se B5 podle hashů přeskočil. North první pokus odhalil, že `libraries.load` mění předaný seznam názvů na seznam Objectů; předání kopie odstranilo tuto API chybu. Původní failure log zůstal zachovaný.

`north_conifer.py` následně skutečně převzal všech 18 138 původních R5 větévek (oproti původním 3 631 ve FAR), ověřil jejich source rank/part/branch kotvy a použil stejnou mapu UV + sinusového prohnutí jako R5. Vytvořil konzervativní metrický quad každé větévky bez nového atlasu nebo orientace. Near/MID runtime URL/bajty, native rohy i jejich původní materiálové grafy zůstaly stejné. Finální package obsahuje 2/2/2 objekty pro near/MID/full FAR, tedy nejde o FAR-only soubor.

Severní `.blend` má 55 903 514 B, SHA `7cdb589793ea6e0ab67709bd78532361041a3786365806eb40aed48159b0e820`; run `d9b9b4518aad4eab`. Nový FAR má 36 276 foliage tri +1 992 wood tri, GLB 3 398 992 B. Maximum odchylky source fitu 0,699 µm, kotvy 0,838 µm; původní fyzické délky větévek 0,2200066–0,3499819 m. Skutečný FAR preview byl prohlédnut agentem i rootem. Produkční dekodéry všech šesti hotových zdrojů prošly, včetně plného conifer FAR rank setu.

Časy byly změřeny v plánovaných bězích, bez zvláštního experimentu: B5 prepare 1,64 s +package 16,93 s =18,57 s; North prepare 1,47 s +native/export 23,53 s =25,00 s. Nezahrnují procesní startup/pin checks a nejsou odhadem běžné výroby ostatních stromů.

## Řízená výroba zbývajících 104 zdrojů

Root výslovně povolil zbývající výrobu. Stabilní run `17d138291328bad0` dědí šest přijatých receipts; žádný z těchto modelů se znovu nevyrábí. Jeden Blender CPU2 proces zpracovává ostatní zdroje s původní bankou, limity, skutečným preview a `--compact=yes`. Po každém zdroji se uloží malý progress ledger. Nově přijatá data se ověří jednou; další progress čtení nehashuje znovu celý rostoucí katalog.

Ledger průběžně odlišuje unikátní FAR source bytes, logickou celkovou velikost katalogu, nová trvalá data tohoto runu a skutečný scratch. Při překročení 96MiB FAR source-byte limitu, nedostatku scratch místa, support nebo integrity chybě proces skončí před dalším zdrojem, nic se automaticky neuvolňuje z validačních mezí. Cleanup nyní odděleně uvádí planned /already missing /removed now /confirmed absent, takže pokračování po přerušení nevydává již nepřítomná data za nově odstraněná.

První nový zdroj dokončil celý postup za 36,08 s; další první modely měly 36–42 s. První skutečný cleanup uvolnil 62,74 MB regenerovatelných dat a ponechal native/GLB i malé důkazy. Celý běh následně dokončil 104 nových zdrojů a skončil exit 0, bez podpůrné, integrity nebo rozpočtové chyby.

## Kapacita a zbývající přejímka

Všechny zachované pokusy při posledním součtu zabíraly přibližně 979 MB: native 199 MB, public 173 MB, malé důkazy 7 MB a přechodná rozbalená data 601 MB. Nic z těchto důkazů se nemaže. Pro 107 listnáčů vychází jednoduchá interpolace dvou naměřených zdrojů nad horní plánovanou populací 4 180 353 částí na asi 1,78 GB native + 3,06 GB public. Po přidání knihovny/jehličnanů je pracovní odhad zhruba **5 GB trvalých výstupů + 0,3–0,5 GB průběžného scratch** s cleanup po zdrojích. Není to naměřený celý katalog; build `dist` a další snapshot jsou mimo tento odhad a mají používat ověřené immutable reuse.

Nejnovější cílené kontroly mají 10/10 JS PASS (včetně native-package a unikátního budget účetnictví), malý Python geometric/source-map fixture PASS a úzký TypeScript PASS. Celá regresní sada, build ani integrace v tomto tasku neběžely. GPU/mipmap matice, FPS a aktivace ve hře zůstávají odpovědností koordinátora.

## Dokončený katalog 110 zdrojů — 27. 10. 2026

Run `17d138291328bad0` skončil se 110/110 completion receipts: 107 listnáčů, dva jehličnany a jeden holý strom. Produkční audit ověřil skutečný v4 parser, GLB dekodér a FAR cluster dekodér, stejné kořeny a kolizní poloměry, shodné near/MID ranky a úplnou FAR populaci. Výsledek **110 PASS**, exit 0; log `.cache/trees-catalog-export-20261026/runtime-all-110-resumed.log`, audit `runs/17d138291328bad0/runtime-audit-all-4c6cf8495993.json`. Přerušení relace nastalo až po úspěšné výrobě; původní audit nezanechal dokončený výstup ani běžící proces. Zopakován byl pouze tento audit, nikoli výroba nebo Blender.

Atomický publisher skončil exit 0. Runtime manifest `public/models/vegetation/seasonal-catalog/17d138291328bad0/runtime-contract.json` má 215 400 B, SHA `2d108559f64f6596d995ab5d8796d90aa9e94ed850144abc38e836826bcaeae7`. Sousední `native-catalog.json` odkazuje na všech 110 skutečných editovatelných modelů. Plný FAR má 49 516 882 unikátních source bajtů proti limitu 100 663 296 B; jde o přenosová data, nikoli odhad VRAM.

U 104 nových listnáčů je 3 892 568 fotografických částí; 48 996 částí zůstává přesným FAR fallbackem, ostatní využívají původní banku. Near/MID podpůrné kontroly mají 0 selhání. Součet skutečných plánovaných fází je 300,76 s přípravy +6 104,69 s native/export =6 405,45 s. Nezahrnuje veškeré procesní starty, hash kontroly, pauzy či následnou validaci a není herním výkonovým měřením. U 104 zdrojů bylo bezpečně odstraněno 832 regenerovatelných mezisouborů, celkem 12 810 889 900 B. Původní neúspěšné/counterfactual výstupy zůstaly na disku.

Poslední ledger: nová trvalá data 4 737 208 487 B, logický katalog 5 227 971 383 B, cache po průběžném cleanup 76 037 348 B, největší dokončený transient 275 845 222 B; na D zbývalo 13 323 493 376 B. Tyto naměřené hodnoty nahrazují výše uvedený pracovní odhad.

Přesný seznam pro staging/snapshot je `.cache/trees-catalog-export-20261026/accepted-release-files.json`: 588 unikátních souborů, celkem 5 275 059 351 B včetně fotografických map a malých společných/provenienčních podkladů. Zahrnuje 110 native, čtyři sdílené native knihovny, 330 runtime LOD GLB a 107 cluster placements. U všech 108 linkovaných native byl bez Blenderu rozbalen skutečný soubor a ověřen uložený `//../materials.blend` i jeho rozřešení na zahrnutou knihovnu. Pouze B5 a North jsou podle ověřených receipts self-contained packed balíčky. `nativeDependencies` uvádí tento rozdíl pro každý zdroj. Vadné předchozí listnáče, previews, cache arrays a nepoužité historické exporty v release seznamu nejsou.
