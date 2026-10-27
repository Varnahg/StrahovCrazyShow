# Fotografické materiály a listové komponenty · 25. 10. 2026

Task `trees-20261025-materials`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`. Realističnost větvení/listů má podle uživatele přednost před přesnou kopií všech korun. Tyto zdroje jsou generické materiály; žádný zde neurčuje botanický druh stromu na Strahově. Původní fotografie/CAD ani celé katalogové stromové modely se nekopírují.

## Volba a primární zdroje

- [ambientCG LeafSet024](https://ambientcg.com/view?id=LeafSet024), [API v3](https://ambientcg.com/api/v3/assets?id=LeafSet024&include=technique,dimensions,downloads,maps,url,title), [CC0 licence](https://docs.ambientcg.com/license/). Aktuální `technique=surface-photogrammetry`, atlas přibližně 40 × 40 cm. Devět zelených zaoblených listů, rozmanitá žilnatina a drobné přirozené poškození. Starší v2 `creationMethod` není použita jako autorita. Metadata v3 a licenční stránka jsou zachovány s hashi.
- [Poly Haven Fir Tree 01](https://polyhaven.com/a/fir_tree_01), [info API](https://api.polyhaven.com/info/fir_tree_01), [files API](https://api.polyhaven.com/files/fir_tree_01), [CC0 licence](https://polyhaven.com/license/). Pouze původní `twig_diff`, `twig_alpha`, `twig_nor_gl`, `twig_rough`. Rob Tuytel je uveden jako fotograf, Rico Cilliers jako modelář. Přesná snímací technika není zveřejněná a není domyšlená. Rozměr jednotlivé větvičky není doložen; rozměry celého katalogového modelu se k němu nevztahují.

Porovnané možnosti byly současné LeafSet001/019 (v3 `surface-approximated`), fotografické LeafSet022/024, sezónně smíšený LeafSet027 a komponenty z celých Poly Haven stromů. Pro první zelený pilot je zvolen LeafSet024; LeafSet027 není potřeba pro samotné napojení listu na větvičku a neimportuje se předčasně. Pro jehličnan stačí samostatné původní twig mapy, bez stovek MB geometrie. Původní Bark012 může modelář číst beze změny.

Pouhá JPEG maska je menší, ale přidává kompresní artefakty do rozhodnutí alpha-testu. Zvolená originální PNG opacity je získaná z původního PNG balíku, nikoli převodem JPEG. Převzorkování, přebarvení, skládání nového atlasu či úprava normal mapy nejsou provedené. Vyšší varianty 4K/8K by zvýšily data a paměť bez doloženého přínosu pilotu; 2K byly předem zvolené pro blízké posouzení.

## Přesný datový kontrakt

[Materiálový manifest](../../../shared/data/assets/tree-materials-manifest.json) obsahuje osm map, source/runtime cesty, skutečné hlavičkové rozměry, SHA-256, barevný prostor, původní URL a podle poskytovatele MD5 či archiv/member vazbu. Obsahuje také zachované metadata/licenční HTML a jejich SHA. Veřejné mapy a originály jsou byteově totožné.

| Rodina | Kanály | Zdrojová opacity | Původní runtime bajty |
|---|---|---|---:|
| LeafSet024 | Color/NormalGL/Roughness JPEG, Opacity PNG; vše 2048² | 8-bit grayscale | 9 045 736 |
| Fir twig | diffuse/normalGL/roughness JPEG, alpha PNG; vše 2048² | 16-bit RGB, stejné grayscale hodnoty ve třech kanálech | 4 698 932 |

`maps.*.sourceUrl` je původní síťový zdroj; `maps.*.url` je runtime URL. Albedo je sRGB, normály/roughness/opacity lineární. Opacity znamená **hodnotu grayscale mapy**, nikoli PNG alpha kanál. Runtime má použít alpha test s prahem 0,5; například Babylon opacityTexture vyžaduje odpovídající grayscale/RGB interpretaci. Do těchto map není zapečená nová sezónní změna. Data na disku nejsou měřením GPU paměti ani rychlosti.

[Komponenty](../../../shared/data/tree-leaf-components.json) jsou odvozená JSON metadata z originální opacity. Skript čte rastrové vstupy, nikdy je nezapisuje. Pole `atlases[].components` je úplná diagnostika větších 8-connected komponent; **pro pilot vybírat pouze `atlases[].parts`** a dohledat jejich `componentId`.

- LeafSet024: 9 použitelných listů; 1 743 195 nadprahových pixelů. Dva nepatrné odpojené ostrůvky mají celkem 13 pixelů.
- Fir: 15 větších raw komponent, ale pouze 7 výslovně vybraných twig částí. Raw komponenta 0 je dlouhý proužek kůry; další součásti atlasu jsou izolované fragmenty a nesmějí se náhodně rozsévat jako listí. Součet nadprahových pixelů celého atlasu je 988 832; pod velikostním prahem je dalších 24 komponent/60 pixelů.
- `boundsPixels=[x0,y0,x1,y1]` používá hrany pixelů, x doprava, y dolů, počátek **vlevo nahoře**. Výčet obsažených pixelů je polootevřený `[x0,x1) × [y0,y1)`.
- Blender UV má počátek dole: **u=x/W, v=1−y/H**. `*HullUvBlender` je explicitně CCW. Blender/glTF exporter může udělat vlastní převod V; modelář jej nesmí aplikovat dvakrát nebo tyto Blender UV vydávat bez kontroly za raw Babylon UV.
- `exactHullPixels` je přesný konvexní obal neprůhledných pixelových čtverců. `cutoutHullPixels` je konzervativní vnější obal z 12 podpůrných směrů s 1 px rezervou, omezený atlasem. Má nejvýše 12 vrcholů, neřeže původní neprůhledné pixely a nevyrábí masku. Průsvitné otvory uvnitř ponechává alpha testu.
- `parts[].attachmentPixel` a `axisTipPixel` jsou skutečné neprůhledné krajní pixely. Směr base/petiole dole → tip nahoře byl zvolen po zobrazení **originálních barevných map**. Jde o výtvarnou interpretaci orientace, nikoli měření botanické anatomie. Mapy zachovávají fotku; umístění geometrie se odečte od attachment UV, nikoli od náhodného středu koruny.
- `sampledOpaquePixels` zohledňuje i odpojené drobné ostrůvky uvnitř geometrického obalu. Fir části mají navíc 0–158 takových pixelů; žádná vybraná část nepřebírá sousední velký proužek kůry. U leaf-5 obal zahrnuje původních 13 drobných pixelů. `parts[].cutoutCoverage` popisuje skutečný vzorkovaný obsah: listy asi 80,7–90,3 %, větvičky asi 21,1–45,1 %. To není měření overdraw celé koruny.

Pro LeafSet024 se metry odvozují z **celého atlasu**: `widthMetres=(x1−x0)/2048×0,4`, obdobně výška. Výsledné listy jsou přibližně 8,81–9,75 cm široké a 12,32–12,89 cm vysoké. Stejný atlasový převod se použije na jednotlivé hull UV a attachment, nikoli 0,4 m na každý list. Fir `atlasMetres`, `sizeMetres` i `physicalLengthMetres` zůstávají null; případná délka 0,22–0,35 m v pilotu patří do modelářovy explicitní herní interpretace.

## Neměnné předání modeláři

Po úspěšných zdrojových kontrolách byly přímo předány koordinátorovi a `cad_b1_geometry_research`:

| Soubor | SHA-256 |
|---|---|
| `shared/data/assets/tree-materials-manifest.json` | `3bd65af8559f874ca41ecb62b6bf8556417922dcdac5abfb0f83884c9fbdca60` |
| `shared/data/tree-leaf-components.json` | `022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3` |

Modelář kopíruje tyto dva soubory a přesně manifestové mapy do své rezervované cache, ověří SHA a dále pracuje s kopií. Tyto datové vstupy se bez nové koordinace nemění. Není potřeba kopírovat ZIPy ani poskytovatelův celý model. Zdrojové ZIPy zůstávají pouze v `.cache/trees-materials-20261025/downloads/` (15 211 530 B JPG, 48 645 223 B PNG).

## Reprodukce a kontrola

Po aktivaci D prostředí, bez instalací:

```text
node scripts/import-tree-materials.mjs --download
python scripts/tree-leaf-components.py
node scripts/import-tree-materials.mjs --verify
python scripts/tree-leaf-components.py --check
node node_modules/tsx/dist/cli.mjs --test tests/tree-materials.test.ts
```

Python potřebuje Pillow a NumPy; byl použit existující bundled Python `C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`, Pillow 12.3.0, NumPy 2.3.5. Embedded Blender Python tyto knihovny nemá; nic se do něj neinstaluje a Blender se nespouští. `PYTHONDONTWRITEBYTECODE=1` zabraňuje dalším výstupům.

Import je explicitní, má timeout/velikostní mez, ověřuje ZIP CRC, provider MD5, hlavičky a původní piny. Odmítá nahradit jinými bajty existující originál/runtime mapu. Existující metadata a datum importu se znovu používají; ověřování nevyžaduje síť. ZIP čte pouze přesně pojmenované členy bez extrakce cest. Atlasová analýza používá dočasné scanline runs; žádný objekt pro každý neprůhledný pixel, globální cache ani frame-by-frame výpočet nepřibývá.

16-bit RGB Fir opacity je zvláštní IO hranice: Pillow ji vystaví jako horních 8 bitů; práh 128 je pro pevné 0,5 přesně ekvivalentní původnímu 16-bit prahu 32768. Nezávislý Node PNG decoder zachovává všech 16 bitů a flood-fill ověřuje počty, komponenty a obaly proti původním pixelům. Tím se nepřebírá neověřený výsledek pouhého `convert('L')`.

Testy ověřují původní bajty a mapové vazby, PNG CRC/16bit opacity, skutečné komponenty nezávislým flood-fill algoritmem, konzervativní obaly, jednotky, orientaci UV/kotev, odmítnutí bark stripu i poškozených ZIP vstupů. GPU materiál, vzhled koruny, sezónní průchody a výkon se zde netestovaly; patří navazujícímu pilotu a integrační přejímce.
