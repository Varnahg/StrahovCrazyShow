# Oddělená studie texturované trávy

Studie z 11. 10. 2026 je pouze v `.cache/grass-realism-study` a v této dokumentační složce. **Produkční K, terén, komunikace, umístění trávy ani hlavní vegetační shader se nemění.** Náhled se musí nejprve vizuálně porovnat a teprve potom rozhodnout o integraci a odvozených distance LOD.

## Primární zdroj

[Poly Haven Grass Medium 02](https://polyhaven.com/a/grass_medium_02), autor Rico Cilliers, [CC0](https://polyhaven.com/license). Jde o obecný travní asset, nikoli scan Strahova, konkrétního trávníku nebo určení botanického druhu. [Oficiální API](https://api.polyhaven.com/files/grass_medium_02) poskytuje přesné soubory a MD5.

Původní `source/grass_medium_02_4k.gltf`, binární geometrie a tři 4k glTF mapy zůstávají byte-identické. Původní `fetch-source.mjs`, `download-audit.json` a `official-files.json` nebyly přepsané. Doplněný originální 4k Blender master a všechny jeho referencované mapy mají samostatný `master-download-audit.json`; celkem 53 421 403 B. Původní master se neredukuje a nepřepisuje. V cache se zachovává také suchá barevná varianta a originální EXR kanály, ačkoli je první zelená studie nepoužívá.

### Proč bylo nutné doplnit alpha mapu

Původní glTF deklaruje `BLEND`, ale jeho diffuse je JPEG bez alfa kanálu. Atlas má černé pozadí a samostatně vyfotografovaná zelená i suchá stébla. Bez skutečné masky by obdélníky nesly černé plochy a běžná průhlednost by situaci neopravila.

Stažený **originální 4k Alpha PNG** má 896 528 B, oficiální MD5 `bb3f83490d62203fa840a4cc8e733f42`, SHA256 `f218f51125b15064ea0bd6064c9aa3439bad127368eca1aeae7f605c89fb8ac8`. `alpha-download-audit.json` eviduje přesný URL a integritu. Maska se používá přímo jako lineární grayscale opacity; diffuse zůstává původní sRGB JPEG. Žádné pixely se nepřemalovávají, negenerují, nekombinují do nové fototextury ani nepřepékají.

Babylon PBR používá `ALPHATEST`, cutoff 0,45, `opacityTexture.getAlphaFromRGB=true`, `gammaSpace=false`; nejde o alpha blending. NormalGL a ARM jsou původní lineární kanály. Osvětlení je skutečné PBR se společným Sluncem a hemisférou pro obě kontrolní plochy; materiál trávy sám nevyzařuje světlo.

## Nejdetailnější geometrie a výška

| Původní trs | Zachované trojúhelníky | Původní výškový rozsah | Uniformní měřítko | Modelový rozsah studie | Viditelný vršek nad rovinou |
| --- | ---: | ---: | ---: | ---: | ---: |
| a | 714 | 156,93 mm | 0,637225 | 100 mm | 98 mm |
| b | 1760 | 179,56 mm | 0,668285 | 120 mm | 118 mm |
| c | 1215 | 231,66 mm | 0,604330 | 140 mm | 138 mm |
| d | 2489 | 260,38 mm | 0,614495 | 160 mm | 158 mm |
| e | 1664 | 403,24 mm | 0,471188 | 190 mm | 188 mm |

**Celkem 7842 původních trojúhelníků.** Změna používá pouze uniformní měřítko a posun spodního bodu. Zachovává původní zakřivení, indexy, UV a normály každého trsu. Nejde o zploštění pouze ve svislém směru ani náhradu nově vymyšlenými trojúhelníky. Výšky 10–19 cm jsou modelový odhad pro studii sečeného trávníku, nikoli změřené výšky strahovské trávy.

Kořeny jsou zapuštěné **2 mm** pod společnou kontrolní rovinu. Derivát má minimum Y přibližně −0,002 m a maximum 0,098–0,188 m. V náhledu je fyzická 30cm stupnice s ryskami po **10 cm**, která umožní kontrolu měřítka a kontaktu se zemí. Skutečná integrace na nativní DMR/TIN a u chodníků se zatím netvrdí: studie používá dva stejné rovné dvoumetrové záhony a žádný produkční placement nepřepisuje.

## Soubory a browserový náhled

- `.cache/grass-realism-study/source`: kompletní původní soubory, oddělené MD5/SHA audity.
- `.cache/grass-realism-study/derived/grass-mowed-study.blend`: pět originálních geometrických předloh v skryté kolekci a pět přizpůsobených nejdetailnějších trsů, původní mapy a explicitní alpha cutoff.
- `.cache/grass-realism-study/derived/grass-mowed-study.json`: skutečné runtime vertex/normal/UV/index buffery pro tento náhled.
- `.cache/grass-realism-study/geometry-audit.json`: skutečné výšky, měřítka, počty a hashe derivátu.
- `.cache/grass-realism-study/baseline-source-audit.json`: SHA zachycené produkční 16stéblové geometrie a PBR/wind materiálu. Porovnávací baseline se extrahuje ze skutečného kódu, nevymýšlí se horší náhradní geometrie; upravuje se pouze import shaderů/export factory pro oddělený bundle.

Náhled: **http://127.0.0.1:4196/** při spuštěném cache serveru. Levý záhon používá zachycenou produkční geometrii a PBR, pravý původní texturovaný asset. Rozmístění je pouze kontrolní grid, nikoli nový herní trávník. Obě strany sdílejí stejnou zem, světlo a demonstrační vítr. Tlačítka ukazují celkový pohled, detail stébla, kontakt s půdou a odstup 6 m.

Vítr představuje demonstračních 0/2/4/8 m/s od západu k východu; není to údaj živé stanice. PBR plugin ukotví spodní body a ohýbá vršky podle normalizované výšky. UV a obrazové kanály se pohybem nemění. Noční volba používá skutečný okamžik 11. 10. 2026 02:00 Europe/Prague a stejný `sampleArtLighting` jako hra, samostatně od aktuálního herního počasí.

Zobrazený JSON uvádí připravenost skutečných textur/shaderů, chyby, alpha test, počet instancí a rozpočty. První náhled má **121 baseline instancí** a **121 nejdetailnějších zdrojových instancí**; na jednu baseline připadá 64 trojúhelníků, na zdrojovou 714–2489 podle trsu. Potenciální nejdetailnější geometrie celého kontrolního záhonu je tak **7744 baseline / 188 922 zdrojových trojúhelníků**; to jsou počty podle index bufferů, nikoli engine frame counter nebo změřený výkon. Čtyři původní 4k kanály mají 5 267 566 komprimovaných bajtů; tento síťový objem není velikostí jejich dekódovaných GPU textur. Tento rozpočet je vizuální studie, **nikoli přijatý produkční rozpočet** pro celý areál. Source highest se kvůli předběžnému FPS nepoškozuje.

## Stav ověření

Generátor úspěšně vytvořil `.blend` a odvozené buffery za 4,8 s s nejvýše dvěma CPU vlákny, bez CPU renderu. Kontrola potvrzuje konečné hodnoty, platné indexy a žádné degenerované trojúhelníky, původních 7842 trojúhelníků, kontaktní výšky a nezměněné SHA původních glTF/JPEG/bin souborů. Původní alpha PNG prošlo oficiálním MD5 a SHA auditem.

**Skutečné znovuotevření uloženého `.blend` PASS**, bez renderu a bez změny souboru. `blender-reopen-audit.json` ověřuje všech 7842 trojúhelníků, skutečné UV, rozměry, zapuštění kořenů, linky originálních textur, cutoff a lineární alpha. Původní glTF/JPEG/bin soubory zůstaly byte-identické.

**První skutečné highest GPU review proběhlo, ale nebylo vizuálně přijato.** Rootův [detail](root-review/first-detail-dark.png) a [stav rendereru](root-review/first-report.json) mají `ready=true`, 0 shader/texture chyb, přesto ukazují tmavé řídké drátovité trsy. Technická připravenost tedy nebyla zaměněna za vyhovující vzhled. [Unlit diagnostika](root-review/unlit-detail.png) stále ukazuje řídké suché jemné stonky; [bez NormalGL](root-review/no-normal-detail.png) je porost světlejší, ale nadále neodpovídá přesvědčivému hlavnímu sečenému trávníku. Přenos světla podle původního autora, oprava mip filtru, ARM, obrácený front-face a opačné V nepřinesly potřebné zlepšení. Medium 02 se zachovává jako možný okrajový porost, **není schválený k integraci ani LOD**.

Read-only `channel-uv-audit.json` v cache potvrzuje původní barvy: opaque pixely atlasu mají medián RGB142/148/95 a60,2 % je zeleně dominantních. Nejde o černou texturu. Původní glTF V zasahuje bílou alpha v85,9–95,6 % geometrické plochy, zatímco opačné V jen 19,4–41,8 %. Runtime albedo faktor byl skutečně `[1,1,1]`; produkční zelený materiál se do fotografického RGB podruhé nenásobí. ARM má roughness v G (medián 154/255), metalness v B (medián 0). Původní obrázky se kvůli diagnostice nemění.

`mip-filter-audit.json` dokládá dílčí black-edge ztmavení při minifikaci černého atlasu: neprůhledně přijaté RGB klesá na úrovni 7 přibližně z148/147/100 na95/98/65. Volitelná shaderová korekce dělí filtrovanou barvu skutečným alpha coverage; nepřemalovává pixely. GPU review ukázalo jen slabý efekt, takže nejde o hlavní řešení nevhodné morfologie.

Inspekce neměnného originálního `.blend` v `original-material-audit.json` našla autorův Translucent/Principled mix s intenzitou 0,30, který standardní glTF nepřenáší. Jeho samostatná PBR diagnostika bez refraction/MRT stále nedala přesvědčivý trávník. Skutečná [nativní glTF GPU reference](root-review/medium02-native-wind0.png) se stejným větrem0 má [ready=true, 0 shader/texture chyb a UV/normal error0](root-review/medium02-native-report.json) pro všech5 tvarů. Vzhled je prakticky stejný jako manuální; přenos TBN tedy není prokázanou příčinou chybného vzhledu. Ground má originální grayscale roughness s mediánem 138/255 a nulový metal; oproti prvotnímu lesklému náhledu byl jeho specular faktor opraven na produkčních 0,27, bez změny bitmap.

Read-only Blender audit `normal-source-audit.json` porovnal JPEG NormalGL se skutečnými float hodnotami originálního EXR v UV nejdetailnějších trojúhelníků. Při správné orientaci jsou RMSE kanálů R/G/B přibližně 0,012–0,015 / 0,007–0,008 / 0,006–0,009. Opačné V dává R/G chybu přibližně 0,17–0,18 / 0,13–0,16. JPEG tedy není doloženě chybně gamma převedený nebo otočený proti originálnímu EXR; rozdíly odpovídají jeho ztrátovému přenosu. Žádný obrázek se při testu nepřepisoval. Původní glTF ani manuální geometrie nemají TANGENT atribut, používají shaderový derivovaný TBN. Manuální CCW front-face a `invertNormalMapY=true` odpovídají skutečné implementaci Babylon glTF loaderu v pravotočivé scéně. Tato kontrola sama neprokazuje správný hotový GPU obraz; reference proto stále porovnává i skutečné materiály a nastavení textur loaderu.

V cache jsou zvlášť stažené původní 4k glTF/alpha kanály kandidátů [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) a [Grass Bermuda 01](https://polyhaven.com/a/grass_bermuda_01), podle oficiálních MD5. Jejich originální atlasy byly skutečně prohlédnuté; mají širší zelená listová stébla a Medium 01 také malé husté trávníkové shluky. Bermuda označuje původ knihovního assetu, nikoli prokázaný botanický druh Strahova.

## Druhý highest kandidát: přirozeně nízký Medium 01

[Grass Medium 01](https://polyhaven.com/a/grass_medium_01), autoři Rico Cilliers a Rob Tuytel, je obecná CC0 předloha. Nejde o fotografii nebo druhové určení strahovského trávníku. Kompletní originální **8k Blender master, glTF, binární geometrie a všechny jejich mapy** jsou neměnně v `candidates/grass_medium_01/source-highest`. `highest-master-download-audit.json` ověřuje všech deset souborů podle oficiálního MD5/velikosti a vlastního SHA256; dohromady 281 848 568 B, včetně zachovaných EXR a suché varianty. Originální master `.blend` SHA256 je `62ac1b9f9d8196c6dfc295387fe2d8a9716d811e69e4b873b7b3632121bebcb7`.

Z celkových 17 původních autorských LOD0 variant (24 730 trojúhelníků) studie vybírá sedm přirozeně nízkých malých/středních/velkých tvarů. Název LOD0 je původní autorské označení nejdetailnější varianty; **žádný nový distance LOD nebo decimace se nedělá**. Geometrie se nezmenšuje: měřítko je přesně 1, mění se jen posun minimálního bodu 2 mm pod kontrolní půdu.

| Původní varianta | Zachované trojúhelníky | Původní výška |
| --- | ---: | ---: |
| small_a | 833 | 140,43 mm |
| large_b | 4626 | 169,26 mm |
| mid_b | 1257 | 177,72 mm |
| small_b | 653 | 99,90 mm |
| mid_c | 1466 | 144,64 mm |
| large_a | 6422 | 146,69 mm |
| large_c | 5945 | 142,35 mm |

Celkem **21 202 trojúhelníků** v sedmi vybraných masterech. Náhled **http://127.0.0.1:4196/?asset=grass_medium_01** používá původní nejvyšší 8192×8192 Color, Alpha PNG, NormalGL a ARM. Albedo faktor je bílý, NormalGL má původní sílu 1, alpha zůstává lineární cutoff 0,45. Nejde o přemalovanou zelenou náhradní texturu. Stejných 121 kontrolních instancí představuje potenciálně **365 893 trojúhelníků**, baseline nadále 7744. Tento nejdetailnější rozpočet není změřený produkční výkon ani schválená konfigurace pro celý areál. Původní Medium 02 zůstává přístupný přes volbu zdroje nebo `?asset=grass_medium_02`.

**Skutečné znovuotevření druhého `.blend` PASS**: `candidates/grass_medium_01/blender-reopen-audit.json` potvrzuje všech 17 originálů, sedm vybraných tvarů, původní trojúhelníky, UV chybu 0, maximální chybu uložené souřadnice 5,92×10⁻⁹ m, kořeny −2 mm, čtyři skutečné 8192² mapy a neměnné hashe obou originálních balíčků. `.blend` má SHA256 `a58950355744267600b6f5bea98f31f17782d759abe52f26f31d8232d43d6769`. Krátký Blender save/reopen používá nejvýše dvě CPU vlákna a žádný render. Samostatná TypeScript kontrola náhledu a bundle prošly, všechny ověřené HTTP cesty vrací200. Read-only `candidates/grass_medium_01/channel-uv-audit.json` navíc potvrzuje v původních8k mapách90,1–98,0% area-weighted alpha coverage v UV centroidech vybraných trojúhelníků, zelené RGB mediány82–94/94–101/33–40 a ARM G127–133/B0. Není to odhad pokrytí celého trávníku. **Skutečný nejdetailnější GPU review proběhl a zatím nebyl vizuálně schválený:** [PBR](root-review/medium01-pbr-detail.png), [bez normalu](root-review/medium01-no-normal-detail.png), [unlit](root-review/medium01-unlit-detail.png), [renderer report](root-review/medium01-pbr-report.json). Ready=true a0 shader/texture chyb potvrzují technickou připravenost; pravidelné řídké trsy a tmavý PBR stále neodpovídají hlavnímu trávníku. Integrace ani distanceLOD nejsou schválené.

K3 a K4 měření nebyla rušená: po požadavcích HOLD se Blender/CPU/GPU práce pozastavila až do výslovného RELEASE. Nový master a bundle vznikly až po uvolnění K4 měření. Kontakt na všech skutečných herních plochách a shader stínové masky potřebují vlastní integrační ověření před případným převzetím do produkce. Hlavní runtime nadále zůstává nedotčený.

## Reprodukce

```powershell
node .cache/grass-realism-study/fetch-alpha.mjs
node .cache/grass-realism-study/fetch-master.mjs
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python .cache/grass-realism-study/build-study.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python .cache/grass-realism-study/audit-study.py
node .cache/grass-realism-study/prepare-preview.mjs
node .cache/grass-realism-study/serve-preview.mjs 4196
```

Reprodukce přirozeného druhého kandidáta před spuštěním stejného náhledového serveru:

```powershell
node .cache/grass-realism-study/fetch-candidates.mjs
node .cache/grass-realism-study/fetch-candidate-highest.mjs
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python .cache/grass-realism-study/build-candidate-study.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python .cache/grass-realism-study/audit-candidate-study.py
node .cache/grass-realism-study/prepare-preview.mjs
```

Původní `fetch-source.mjs` se ponechává bez změny. Cache podklady nejsou součástí K produkčního manifestu; tato studie zatím nevydává nový herní pack ani nesplnění výkonového cíle nepřekrývá komponentovým FPS.


## Krátký souvislý highest kandidát a konkrétní autorský materiál

Nový náhled pro review: **http://127.0.0.1:4196/?asset=grass_medium_01&profile=short&distribution=lawn&shading=author-material**. Stejný předchozí grid i medium01 tvary zůstávají přístupné; nové srovnání mění pouze cache kontrolní záhony.

Uživatelem dodaný snímek `codex-clipboard-ba3dcf49-2f38-42c4-aec5-f7c20a1a66cb.png` byl znovu prohlédnutý: travnaté pásy u kolejí tvoří souvislý nízký koberec, nikoli pravidelné oddělené vysoké trsy. Snímek není měření výšky ani botanického druhu. Pracovní typologie4–6cm je modelová interpretace. Read-only oficiální PolyHaven katalog v `official-model-catalogue.json` nabídl jen tři travní modely; samostatný krátký lawn model zde nebyl nalezen. Proto studie využívá **čtyři původní krátké LOD0 tvary medium01**: tiny_b28tri/60,21mm, tiny_d32tri/47,83mm, tiny_e62tri/49,45mm a tiny_f60tri/47,07mm. Jde o jinou původní morfologii, **nikoli distanceLOD, decimaci nebo zmenšení medium trsu**. Všechny mají scale1, původní UV/normály/indexy a původní8k bitmapy. Nejvyšší všechny17 původní varianty i master zůstávají zachované. Nový derivát má zvláštní `derived/grass-short-study.blend`/`.json`, předchozí medium derivát nepřepisuje.

Původní autorský shader medium01 byl skutečně otevřený read-only a evidovaný v `candidates/grass_medium_01/original-material-audit.json`. Má vlastní translucency0,4, Specular IOR Level0,5, IOR1,45, NormalStrength1, HSVValue1, Wetness0 a DeadAmount0; roughness čte přímo původní EXR. AO textura ani AO link se v jeho grafu nenachází, stejně jako standardní glTF neobsahuje `occlusionTexture`. Předchozí manuální režim naopak přidával ARM red jako AO (R mediány146–172/255), což je konkrétní dodatečné ztmavení. Samostatný režim **PBR dle autorského grafu** tento nedoložený AO faktor vypíná. `author-material-recipe.json` mapuje fyzický F0=((IOR−1)/(IOR+1))²×2×SpecularLevel=0,03373595 na Babylon metallicF0Factor0,84339873/specularIntensity1 a zdrojovou translucency0,4. RGB tint zůstává bílý, zdrojové pixely se nemění. Babylon thin-leaf translucency není totožný Blender BSDF; tloušťka1mm je explicitní studijní odhad. Tato oprava sama ještě nedokládá schválený vzhled.

Krátký `.blend` má skutečně převzatý specifický originální medium01 materiálový graf s původními EXR/Color/Alpha/Dry mapami; přidaný AlphaTest0,45 vstup zachovává požadovanou neprůhlednou masku. **Actual reopen PASS** v `short-blender-reopen-audit.json` ověřuje17 originálů/4 krátké tvary,182 trojúhelníků, UVerror0, největší chybu souřadnice1,77×10⁻⁹m, scale1, kořeny−2mm, původní autorskou translucency/specular a pět skutečných8192² bitmapových linků. Originální master/bitmapy zůstaly SHA identické. Derivát SHA256 `c4ee80ed878a2a62af73826ca2384b4f9ca16491bb99284c24e1d6083a0e4827`.

`scatter.ts` používá deterministický xorshift32 seed5351094 a prostorově indexované blue-noise odmítání příliš blízkých kořenů. Střed ani otočení nemají pravidelnou mřížku, původní tvar se neškáluje. `scatter-audit.json` ověřuje reprodukovatelnost, změnu při jiném seedu, platné polohy/úhly a skutečné minimální vzdálenosti. Krátký záhon má3500 instancí, minimální kořenovou vzdálenost23,0006mm, největší vzdálenost k nejbližšímu kořenu v kontrolní45mm síti28,33mm, potenciálně159958 zdrojovýchtri/224000 baseline tri. Stejný pointset pro oba záhony má SHA256 `a5ea6c950c844b4d28f5ac22d0f9c459cd2194a3ff8eca811fb6eedb071487dd`. Nejde o důkaz skutečného blade coverage nebo GPU výkonu. Medium continuous má512 instancí/1507507 zdrojovýchtri a vlastní audit. **Krátký původní highest/autorský režim prošel skutečným GPU posouzením, ale nebyl přijat:** [obrázek](root-review/short-lawn-author-material.png), [report](root-review/short-lawn-author-report.json). Ready=true/0 chyb nezměnilo šedou suchou větvenou siluetu. Report zaznamenává starší přenos bílého přímého backlightu, který další iterace opravuje. Hlavní runtime, terén a placements zůstávají nedotčené.

Reprodukce krátké studie:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python .cache/grass-realism-study/inspect-candidate-master.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' .cache/grass-realism-study/export-author-recipe.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python .cache/grass-realism-study/build-candidate-study.py -- --profile=short
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python .cache/grass-realism-study/audit-candidate-study.py -- --profile=short
pnpm exec tsx .cache/grass-realism-study/audit-scatter.ts
node .cache/grass-realism-study/prepare-preview.mjs
```


## Opravený přenos barvy a editovatelný highest listový derivát

Aktuální oddělený náhled: **http://127.0.0.1:4196/?asset=grass_medium_01&profile=authored&distribution=lawn&shading=author-material**. Zatím čeká skutečné GPU posouzení; technická připravenost ani autorský popis nejsou vizuální schválení.

### Vlastní kritická kontrola a skutečné nalezené příčiny

Šedé větvené stonky na posledním short GPU snímku byly skutečně prohlédnuté a nepovažují se za hotový sečený trávník. Jeden [bounded Cycles CPU render původního short Blender materiálu](blender-reference/original-short-cycles.png) rovněž ukazuje řídké větvené stonky. [Render report](blender-reference/original-short-cycles.json) eviduje původní graf/SHA, přesnou detail kameru a seed3500 instancí,640×360,2CPU vlákna,16samples maximum,18s sampling limit a23,77s wall včetněBVH/map. Denoising se nepoužil. Cycles integrovaná obloha není přesný ekvivalent Babylon Hemi, takže srovnání prokazuje nevhodnou morfologii, nikoli totožný pixelový jas. Render se neopakuje a master se nepřepisuje.

Read-only inspekce skutečného Babylon9.30 shaderu odhalila konkrétní přenosovou chybu. `useAlbedoToTintTranslucency` ovlivňuje pouze IBL `refractionIrradiance`; přímé `diffuseTransmissionBase` se do výsledku přičítá samostatně. Při původním bílém tintColor tak přímý backlight bělel listy navzdory tomuto příznaku. Nový společný `source-material.ts` používá **stejný původní fotografický albedo atlas také jako `translucencyColorTexture`**, takže transmittance BRDF získá barvu pro přímé i nepřímé světlo. Druhé IBL albedo tintování je vypnuté. Nejde o změnu RGB, zesvětlení emisí ani novou bitmapu; F0/translucency0,4/AOoff zůstávají doložené konkrétním autorským grafem. `study-contract-audit.json` eviduje hashe relevantního skutečného shaderového kódu a testuje skutečný materiálový stav.

Opraven byl také vlastní numerický audit: originální Alpha PNG jsou16bit `I;16`. Původní Pillow `convert('L'/'RGB')` klipoval celočíselné hodnoty nad255, takže coverage a RGB statistiky zahrnovaly část průhledného paddingu. Toto se netýkalo původních bitmap nebo browser shaderu. **Dřívější CPU coverage/RGB čísla byla přepočítána** přes společný read-only `source_image_sampling.py`, který dělí65535; staré reporty jsou zachované jako `*-superseded-16bit-clipped.json`. `mask-normalization-audit.json` ověřuje reálný původní vzorek3341→0,05098, který chybná konverze měnila na255/255. Čísla v předchozích odstavcích nyní uvádějí opravené výsledky. Normal EXR↔JPEG audit touto alpha chybou ovlivněný nebyl.

### Nejdetailnější model a fotografické UV reference

`green-blade-regions.json` používá skutečně normalizovanou původní16bit masku a identifikuje tři neprůhledné zelené listové pásy původního8192² atlasu. Každý má17 konkrétních UV řádků a kontrolu původních barev; medianG−R je11–15 aG−B61–64. Výběr zachovává mikrofotografickou kresbu a nepřemalovává pixely. Samostatný audit původních tiny tvarů ukázal, že tiny_e má pouze9,84% zeleně dominantních vzorků a mediánRGB131/114/61; malá výška proto nebyla důkazem zdravé listové siluety.

`build-authored-lawn.py` vytváří tři nové **editovatelné autorské** trsy12/14/16 krátkých zakřivených listů. Listy mají modelově přibližně3,1–5,4cm, šířku4,5–9mm,16 podélných segmentů a příčný přehyb se třemi vrcholy. Každý list má vlastní vertex group v Blenderu a explicitní referenci na původní fotografický UV pás. Mírně široké konce vyjadřují sečený list; nejde o scan Strahova nebo převzetí původní rostlinné geometrie. Původní všech17 variant, highest master a jeho bitmapy zůstávají neměnné. Nová geometrie má samostatné `grass-authored-study.blend`/`.json`; žádný distanceLOD/decimace zatím nevznikl.

Highest master geometrie má768/896/1024, celkem2688 trojúhelníků. Stejný seed v kontrolním continuous záhonu dává3500 instancí/potenciálně3139200 trojúhelníků; jde o nejdetailnější vizuální studii, nikoli přijatý výkonový rozpočet areálu. **Actual `.blend` reopen PASS** (`authored-reopen-audit.json`) potvrzuje UV/vrcholy, editovatelné listové skupiny, kořeny−2mm, původní autorský materiál, rozlišení/linky a SHA původních podkladů. Maximální chyby jsou1,76×10⁻⁹m ve vrcholu a2,97×10⁻⁸ v UV. Derivát SHA256 je `ed96d049c0c433cc6994b91c3d50f86e3bb49360d3b27e24532d060d4270bc32`.

### Refaktoring a cílené ověření

`source-material.ts` sjednocuje PBR/alpha/linear-channel/transmission přenos; `source-geometry.ts` vytváří stejné metre-space buffery a porovnává nativní UV/normály bez velkých dočasných polí. Náhled už neduplikuje tyto recepty v běžných i nativních materiálech. Variants/counts se počítají jednou při načtení, při opuštění stránky se zastaví loop/timer a uvolní scéna/engine. Sdílené mapy zůstávají ve vlastnictví scény/callera, materiál jejich kopie nevytváří. Atomic bundler píše nejprve kompletní `.next` a teprve pak mění aktivní bundle; server4196 se nezastavoval.

`study-contract.test.ts` PASS kontroluje skutečné NullEngine buffery, fotomapový přenos přímého světla, nulovou emisi/bílý RGB faktor, správné mapy a likvidaci zdrojů. Tři trsy používají čtyři společné fotografické mapy a jedinou scénovou BRDF lookup texturu; po jejich uvolnění nezůstávají textury. Cílený TypeScript náhledu PASS, bundle/HTTP200. **NullEngine zde není GPU důkaz.** Nativní původní glTF reference je pro nový autorský derivát vypnutá, protože původní glTF tuto novou geometrii neobsahuje. Hlavní runtime/vegetace/terén/placements a K5 produkce nejsou změněné.

## Highest v2 v odděleném worktree — po skutečném review v1

Root GPU review v1 potvrdilo souvislý nízký zelený porost a čitelnou fotografickou texturu, ale listy stále působily jako široké lesklé pásky. V1 není označený jako finálně přijatý. Zůstává beze změn pro A/B; v2 má vlastní `derived/grass-authored-v2-study.blend` a `.json`, nikoli přepsaný master. Veškerá nová práce probíhá ve worktree `visual-quality-jump`; primary `main` se nemění.

Náhled v2: **http://127.0.0.1:4196/?asset=grass_medium_01&profile=authored-v2&distribution=lawn&shading=author-material**. V1 používá stejné URL s `profile=authored`. Oba profily sdílejí původní 8k fotokanály, autorský PBR přenos, seed 5351094, počet instancí, kameru i ovládání světla a větru. U v2 jsou pouze nově modelované užší listy, měkký pětiřadý příčný profil, mírná prostorová křivost a kombinace úzkých sečených/intaktních konců. Rozměry a proporce sečení jsou přiznaná výtvarná interpretace, nikoli zaměření či botanické určení.

| V2 varianta | Listy / sečené konce | Skutečné délky | Skutečné největší šířky | Nejvyšší bod nad půdou | Highest trojúhelníky |
| --- | ---: | ---: | ---: | ---: | ---: |
| mown-a | 12 / 9 | 30,25–42,74 mm | 2,56–3,79 mm | 39,90 mm | 1536 |
| mixed-b | 14 / 7 | 38,56–52,66 mm | 2,92–4,57 mm | 47,38 mm | 1792 |
| edge-c | 16 / 6 | 42,37–59,70 mm | 3,30–5,44 mm | 53,45 mm | 2048 |

Všechny mají 16 podélných segmentů a kořeny skutečnou nejnižší plochou na −2 mm. První build se zastavil na kontaktovém assertu ještě před uložením: prostorově natočený průřez měl nižší kraj než nominální střed kořene. Generátor nyní zarovnává skutečné minimum celého trsu; toto není tichá změna měřítka. Následný jediný souběžný Blender proces se dvěma CPU vlákny uložil a skutečně znovu otevřel v2, bez renderu. `authored-v2-reopen-audit.json`: **PASS**, maximum chyby vrcholu 1,86×10⁻⁹ m a UV 2,97×10⁻⁸, originální master/fotokanály i v1 SHA beze změny. V2 `.blend` SHA256 `8e77733387a9b991ea779f8c0b6f658cb0fe04cb2bffe2fbe8f1fc9613c8bf61`; geometry JSON `f56cbf7bd5762e476d816c8007c30faa2c3c9a26a8178d47e924e11b815f43a6`.

Opraven je i konkrétní chybný popisek původního srovnání. Skutečná Babylon RH kamera s α=−π/2 při interním 1280×720 promítla baseline do X=955,81 a fotografický kandidát do X=324,19: statické „vlevo/vpravo“ tedy opravdu byly prohozené. `bed-projection.ts` nyní po skutečném `scene.render()` používá stejnou `scene.getTransformMatrix()`, viewport i převod do CSS. Popisky sledují své záhony při otočení kamery a mimo výřez se skryjí. `v2-contract-audit.json` ověřuje skutečné matice při obou opačných natočeních, vertex/UV buffery, původní transmisní fotomapu, nulovou emisi a správné uvolnění materiálů/textur. **Nejde o GPU/FPS důkaz.**

V2 má celkem 5376 highest trojúhelníků a v hustém srovnávacím záhonu přibližně 6,28 milionu potenciálních trojúhelníků. To není rozpočet pro areál. Po skutečném vizuálním přijetí se z neporušeného masteru odvodí samostatné 8/4/2segmentové reprezentace se zachovanými kořeny, konci, identitami listů a původními UV; původní 8k zdroje se zachovají, provozní textury mohou použít původní nižší rozlišení od poskytovatele. Zatím nevznikl nový distance LOD ani produkční runtime.

Root následně provedl skutečné GPU review a **přijal v2 jako highest kandidáta pro integraci, nikoli jako hotovou celoherní/FPS přejímku**. [Detail](root-review/authored-v2-detail.png), [odstup 6 m](root-review/authored-v2-six-metres.png) a [noc](root-review/authored-v2-night.png) ukazují užší rozpoznatelné listy, nižší porost a neemitující noční materiál. [Report](root-review/authored-v2-report.json) má `ready=true`, 0 shaderových a texturových chyb, původní 8k kanály a skutečný Intel UHD 630 kontext. Mezery mezi růžicemi ještě vyžadují kontrolu pokrytí a podkladu v celé hře; toto přijetí je neprohlašuje za vyřešené.

Před integrací zbývá přenos do stejného DMR/TIN a zdrojových výluk cest. Dosavadní produkční 1m normalizovaný trs se škáluje faktorem 0,09–0,19 a má přibližně jeden kandidátní kořen na m². Tento faktor se na v2 nesmí znovu použít: nové listy už jsou v metrech a vyžadují explicitní omezené vzorkování blízkých povrchů. Přenos musí mít vlastní kontrolu okrajů vozovek, styků terénu, alpha masky/stínů, životního cyklu a skutečný celoherní rozpočet. Samostatný jump checkpoint zatím drží runtime vegetace beze změn.

### Připravený omezený integrační kandidát

Původní návrh 0,62/1,10/1,59 milionu trojúhelníků pouze pro trávu byl odmítnut jako příliš drahý výchozí režim. Nový kandidát má tvrdé stropy **60k / 140k / 280k trojúhelníků a 8 / 12 / 16 draw calls** pro low/medium/high. Výběr LOD vychází z vnitřního rozlišení, FOV a projektované velikosti listu; vzdálené podpixelové listy i instance mohou řídnout. Highest master se tím nemění. Počet trojúhelníků není vydáván za naměřené FPS.

Pouhé rovnoměrné vynechávání řádků mělo sice malou prostorovou chybu, ale až 119pixelovou interpolovanou odchylku v původním 8k UV atlasu. Nový export volí řádky podle tvaru **i průběhu fotografického pásu**. Samostatný společný blok tří variant má highest 5376/42 listů, near **1140/42**, medium **222/21**, far **80/11** trojúhelníků/listů. Největší odchylky tvaru near/medium/far jsou 0,58/1,26/2,26 mm; UV odchylky 3,99/8,83/11,28 px v 8k. Všechny vrstvy používají stejné původní fotografické pixely. Celé listy jsou pouze posunuté tak, aby kořeny rovnoměrněji vyplnily 78mm buňku, nikoli všechny shluknuté do tří růžic. Tři varianty sdílejí jeden buffer a materiál v každém LOD; netvoří tři draw calls na dlaždici.

Původní poskytovatelovy 1k/2k Color/Alpha/NormalGL/ARM mapy byly stažené a ověřené podle oficiálního MD5 i místního SHA256, celkem osm souborů / 11 214 004 B. Žádné pixely se nepřemalovávají ani lokálně nepřevzorkovávají. Konzervativní RGBA8+mip odhad čtyř společných map je 21,33 / 85,33 MiB; nejde o změřenou GPU alokaci. Read-only bilineární vzorkování skutečných LOD trojúhelníků přijalo 100 % testovaných alfa vzorků při cutoff 0,45 v obou rozlišeních. To není důkaz GPU mip filtru ani plošného zakrytí půdy. Současný půdní Grass001 je podle manifestu **procedurální CC0 materiál ambientCG**, nikoli fotografie; fotografické listy a půdní podklad mají rozdílnou provenienci.

Cache kontrakty mají **4/4 PASS**: limity při stovce blízkých kandidátních dlaždic, jedna PBR sada/four mapy a sdílené buffery mezi dvěma vlastníky, bezpečné uvolnění klonů i selhání načítání, skutečné světové metry/normály/výšky na osmi reálných travnatých dlaždicích, výluky vozovek a determinismus po vyprázdnění omezené 128položkové cache. Příprava není vydaná integrace. `persistent-package` obsahuje skutečné kopie deseti původních 8k souborů, v1/v2 `.blend` a geometrie, audity a přenositelné generátory (283 281 696 B základních zdrojů/masterů); není závislý na zdrojové junction. Export z tohoto připraveného balíčku znovu prošel. Do repo `assets/client/public/scripts/tests` se balíček přenese až po samostatném runtime freeze a ověří v celé hře.

### První produkční integrace ve worktree a opravná kontrola

Po odděleném zmrazení a ověření P5 byl kandidát přenesen do skutečného `loadVegetation` v pracovním stromu `visual-quality-jump`. Primary `main` a běžící P5 na 4179 zůstávají beze změny. `client/photographic-grass.ts` spravuje omezený kamerový výběr 1m dlaždic; `photo-grass-placement.ts` používá stejný DMR/TIN, normály a zdrojový klasifikátor ploch/výluk jako dosavadní vegetace. Každá dlaždice má nejvýše 160 stabilních kořenových bloků, jeden společný LOD buffer a jeden draw. Pořadí při omezení počtu je prostorově promíchané a deterministické. Tvrdé stropy 60k/140k/280k platí pro odesílanou geometrii; nejsou měřením FPS ani důkazem souvislého pokrytí.

Původní 8k soubory, editovatelné v1/v2 mastery a audity už jsou trvalými soubory v [`assets/sources/vegetation/grass_medium_01`](../../../assets/sources/vegetation/grass_medium_01/README.md), bez junction závislosti. [`scripts/build-photographic-lawn-highest.py`](../../../scripts/build-photographic-lawn-highest.py) uchovává generátor a skutečný save/reopen postup. [`scripts/export-photographic-lawn.mjs`](../../../scripts/export-photographic-lawn.mjs) exportuje zvláštní kandidát do cache a nepřepisuje automaticky publikované podklady. Public sada obsahuje čtyři LOD geometrie a osm původních 1k/2k map; největší zdrojový soubor má 92 543 549 B, méně než limit 100 MiB na soubor. Nezávislý audit ověřil všech 18 stažených souborů podle SHA/MD5/velikosti i aktuálních dat poskytovatele, 15 skutečných Blender image linků a čtyři glTF URI. Původní pixely/mastery zůstávají zachované.

**První celoherní posouzení nebylo vizuálně přijato.** Na skutečné pozici x=110,924, z=34,649 při medium/day ukázaly [běžná kamera](../../verification-evidence/photographic-grass-20261011/first-world-approach.png) a [pohled dolů](../../verification-evidence/photographic-grass-20261011/first-world-first-person.png) převážně plochý podklad, bez přesvědčivých listů. Následná kontrola našla chybu nativních obálek: po zmrazení matice byly nové `BoundingInfo` vytvořené s identitou, takže světové obálky zůstávaly u počátku. Oprava předává skutečnou světovou matici přímo při vytvoření obálky. Regrese čte `minimumWorld/maximumWorld/centerWorld` ještě před renderem nebo nucenou aktualizací transformací.

Nezávislá kontrola navíc doložila a opravy pokryly sdílenou připravenost textur v cache (včetně společného selhání), odmítnutí opožděné 2k sady po high→low, odstranění scene-dispose observerů při běžném uvolnění, platné kořeny v dlaždici s vyloučeným středem a lokální rozpočet bez změny všech sousedních prefixů při jediném LOD přechodu. Další skutečný Babylon API test prokázal menší zachovaný submesh při LOD upgradu: 666 vykreslovaných indexů proti 3420 indexům nové geometrie. Před změnou geometrie se nyní staré submeshe uvolní, aby vznikl celý nový rozsah. Test opakuje interní rozlišení 360→1440→360→1440 a ověřuje přímo draw index/vertex rozsahy.

Aktuální cílená sada [`tests/photo-grass.test.ts`](../../../tests/photo-grass.test.ts) má **11/11 PASS** (2,14 s). TypeScript kontrola prošla po předchozích opravách; celá sada, build, izolovaná integrace a nové celoherní GPU posouzení přísluší až stabilnímu společnému checkpointu. Tyto CPU regrese neopravňují označit první neúspěšný obraz za přijatý. Ještě se hodnotí skutečná viditelnost, návaznost na půdní materiál, lokální přechody hustoty a chování při pohybu.

### Stabilita runtime a omezené pokrytí — 12. října 2026

Navazující oprava přiřazuje GPU mesh podle skutečného ID dlaždice. Změna pořadí podle vzdálenosti už nepřehazuje zachované dlaždice mezi sloty ani znovu neposílá jejich instance buffery. Každý slot má vlastní 150ms časové zobrazení/skrytí s deterministickým ditherem instancí. Při výměně dlaždice, LOD nebo instance prefixu se původní geometrie nejdříve skryje, pak se v témže draw slotu vymění a objeví nová. Druhý souběžný LOD draw nevzniká. Změna jednoho slotu neupravuje fade sousedů; původní globální fade odvozený od nejvzdálenější dlaždice byl odstraněn. Snížení zvolené kvality omezí počet slotů a jejich kvótu ihned, aby ani během přechodu nepřekročilo menší rozpočet.

Sdílený Babylon PBR materiál dostává lokální viditelnost přes `hardBindForSubMesh`, který podle skutečného Babylon 9.30 API běží i při opakovaném použití materiálu bez běžného rebindu. Přechod doběhne i se stojící kamerou. Údaj `submittedLeaves` označuje listy v odesílaných instancích před alfou/ditherem a nativním GPU cullingem; dřívější `visibleLeaves` nebyl důkaz viditelných pixelů a byl odstraněn. Zůstávají opravy světových obálek, kompletních submesh rozsahů, asynchronní připravenosti a životního cyklu prostředků.

Cílená sada nyní ověřuje **15/15 testů**: navíc stabilní identitu dlaždic, skutečné indexy po dokončení lokálního přechodu, průběžné rozpočty při 180 krocích pohybu a změně kvality, spojité obrácení fade a volání nativního plugin manageru pro dvě různě viditelné dlaždice. Tyto NullEngine testy nejsou GPU důkaz. Samostatná TypeScript kontrola dotčeného runtime a testů prošla.

[Reprodukovatelný CPU audit](../../verification-evidence/photographic-grass-20261011/runtime-culling-coverage.ts) zkoumá pozici hráče x=110,527748 / z=33,884926 ve čtyřech výslovně diagnostických natočeních, při 1280×720, medium a výšce oka 1,65 m. Kamera není vydávána za rekonstrukci posledního screenshotu. [Výsledek s hashi](../../verification-evidence/photographic-grass-20261011/runtime-culling-coverage-20261012.json) prokázal nulový počet nativně vyřazených vybraných obálek a všechny zkontrolované vrcholy nad sdíleným terénem. Součet skutečných horizontálních ploch trojúhelníků listů však činí jen **1,75–4,32 % na 1m² dlaždici**, při 103 608–138 384 odesílaných trojúhelnících. Jde o horní mez geometrického pokrytí shora: překryvy a průhledné texely skutečné sjednocené pokrytí dále sníží, šikmý pohled může ukázat jinou siluetu. Toto číslo není post-alpha GPU měření ani FPS.

**Souvislý trávník tedy ještě není hotový.** Uvedená oprava stabilizuje runtime, ale malou geometrickou plochu sama nenahradí. Následuje skutečné celoherní posouzení a levnější fotografická reprezentace krytí v zachovaných rozpočtech, při zachování původních fotografických map i editovatelného highest masteru. V této opravě se žádný nový asset, bake ani zvýšení rozpočtu neprovedly.

Root při následné [celoherní kontrole](../../verification-evidence/photographic-grass-20261011/world-sparse-coverage-20261012.png) stále viděl řídké trsy a ostrou prostorovou hranici detailního porostu. Lokální časový přechod neskrývá geometrický limit rozlohy: medium vybírá nejvýše 12 samostatných 1m² dlaždic. **Hustota ani prostorová návaznost nejsou vizuálně přijaté.** Snímek je vývojové QA, nikoli přejímka výkonu. Seskupení více dlaždic podle LOD a případná fotografická cluster reprezentace patří do navazujícího srovnání; současný nejvyšší master zůstává zachovaný.

### Jednotlivé fotografické listy a tři společné LOD batche — 12. října 2026

Čtyři projekční karty celého 42listového clustru byly prakticky **odmítnuty pro blízký a střední pohled**: vytvářely tmavé pravidelné ostrůvky a ploché kříže. Následný první samostatný leaf atlas také neprošel, protože příčný PCA fit upřednostnil ohyb středové osy před skutečnou šířkou listu a některé listy promítl téměř hranou. Ani jeden problém se neskrýval přebarvením nebo zvýšením hustoty.

Přijatý komponentový kandidát v2 bere příčný směr ze skutečných zdrojových průřezů. Kořen a špička každého původního listu zůstávají na stejných místech. Flat má **84 tri / 42 listů**, bent **168 tri / 42 listů**, odvozený far **22 tri / 11 celých listů**. Zdrojový highest má nadále 5376 tri a originální editovatelný master i 8k fotografie jsou beze změny. [Trvalý balíček a reprodukce](../../../assets/sources/vegetation/grass_medium_01/derived/leaf-planes-v2/README.md) popisují skutečný CPU bake a normálový přenos.

Root prohlédl [blízký bent](leaf-planes-v2/root-bent-close.jpg), [nízký otočený pohled](leaf-planes-v2/root-bent-low-rotated.jpg), [flat](leaf-planes-v2/root-flat-close.jpg) a [noc](leaf-planes-v2/root-bent-night.jpg). [Komponentové rozhodnutí](leaf-planes-v2/root-component-review.json) potvrzuje lepší samostatné listy, ready=true a nulové chyby na Intel UHD 630, 1280×720. Přijetí platí pro integračního kandidáta, nikoli pro hotový celý svět nebo 60 FPS.

[CPU perspektivní diagnostika](leaf-planes-v2/perspective-alpha-mip-audit.json) použila skutečné Babylon matice kamer, 1280×720 a stejné transformace všech 160 makrokořenů. Bez mipů měla eye kamera skutečný alpha union 37 396 px pro highest, 37 150 pro flat a 37 736 pro bent; close 374 843 / 374 173 / 376 907 px. To jsou booleovská sjednocení maskovaných pixelů, nikoli součty ploch. Model čtyř anisotropních vzorků naznačil u eye další ztrátu přibližně 10–11 % proti highest; model není záznam hardwarového filtru, MSAA ani FPS. Krytí se nekompenzovalo změnou alfa cutoff nebo barvy.

Runtime nyní udržuje **tři společné meshe podle LOD**. Jednometrová dlaždice slouží pouze jako cache zdrojových kořenů a neomezuje rozsah vykreslení počtem drawů. Každý kořen má stabilní světové ID, metrickou transformaci a původní terénní/cestní výluky. Přechodový čas se vyhodnocuje ve shaderu; při stojící kameře se fade buffery nepřepisují každý snímek. Pevný prostorový fade se vztahuje ke vzdálenosti od úsečky kamera–hráč, takže zahrne i nejbližší trávu v pohledu třetí osoby. Celkové stropy **60k/140k/280k** počítají také odcházející instance a nikdy se nezvyšují dočasným zdvojením LOD. Atlas **1024×512** je skutečně stejný pro všechny kvality.

První cílená kontrola batche má **18/18 PASS** (grass, vegetation a dokončený benchmark snapshot) a scoped TypeScript PASS. Testuje skutečné uploadované počty, nativní matice/obálky po kompakci, více než 12 aktivních zdrojových dlaždic při nejvýše třech drawech, přechod high→low, sdílenou připravenost, oddělený wind stav vlastníků, dispose a scene-owned BRDF. Tato CPU kontrola neprokazuje GPU vzhled.

Profil čistého CPU selectoru odhalil thrash původní 128položkové cache. Pro širší pracovní set je cache stále omezená na **256 dlaždic**; ve stejném high průchodu klesly missy 708→57 a celkový čas 2019,7→334,4 ms. **Studený synchronní začátek zůstává známé omezení**: přibližně 265 ms při prvním medium výběru a 181 ms při přepnutí high. Následuje první celoherní obraz a rozložení studeného generování před výkonovou přejímkou. Žádný závěr o FPS se neodvozuje pouze z počtu trojúhelníků.
