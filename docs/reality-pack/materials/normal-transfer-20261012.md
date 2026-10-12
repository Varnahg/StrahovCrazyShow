# Přenos NormalGL na povrchy — 12. října 2026

`SurfacePack` nyní převádí směr původních OpenGL normál do tangentového prostoru Babylonu: v pravotočivé scéně `invertNormalMapX=false`, `invertNormalMapY=true`. Před opravou zůstávaly obě hodnoty `false`, takže jemný reliéf reagoval opačně v obrazovém směru V. Oprava mění šest řádků centrální konverze materiálu; žádné původní pixely, UV, tinty, síly normál, roughness, geometrie ani kolize se nemění.

## Průzkum a primární podklady

Před úpravou byly přečtené předchozí [pilotní materiály](../../pilot-surfaces-20261011.md), [materiálová dokumentace](README.md), [styky komunikací](street-transitions.md), výtvarný směr, skutečná tvorba terénu/landcover/cest a `SurfacePack`/`CampusSurfaceArtPlugin`. Přímo prohlédnuté obrazové podklady:

- Původní [Asphalt033 Color](../../../public/textures/surfaces/Asphalt033_1K-JPG_Color.jpg) a [Grass001 Color](../../../public/textures/surfaces/Grass001_1K-JPG_Color.jpg); jde o generické CC0 rodiny, nikoli skeny Strahova. Všech **21 kanálů sedmi rodin** bylo znovu přečteno a porovnáno s SHA a délkami v [manifestu](../../../shared/data/assets/surfaces-manifest.json), bez neshod. Importy jsou z 10. 10. 2026. Rozměry JPG odpovídají 1024², beton 1024×512.
- [IPR jihozápadní](../../streets/inspect-sw.jpg) a [severozápadní](../../streets/inspect-nw.jpg) výřez ortofota z **8. 6. 2024**, © IPR Praha, CC BY 4.0 podle [georeference](../../streets/ortho-georeference.json). Viditelné jsou široké asfaltové dvory, odlišné pěší plochy a proměnlivé travní pásy. Letecký snímek nedokládá velikost jednotlivých zrn, přesné normály ani kalibrované albedo; letní světlo není totožné s aktuálním zataženým podzimem.
- Herní [travní detail](../../verification-evidence/photographic-grass-20261011/world-sparse-coverage-20261012.png) a již prohlédnuté [pohledy parkoviště](../../verification-evidence/remote-jump-20261012/review.json). Je na nich patrné ploché světlo i odlišnost půdního podkladu a jednotlivých listů. Samy neurčují, zda jde o chybu materiálu nebo běžnou reakci na osvětlení.

Znovu ověřené webové primární podklady 12. 10. 2026:

- [Babylon — Normal Maps](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/normalMaps/): rozlišuje OpenGL/DirectX směr zeleného kanálu a transformaci tangentového prostoru. Rozhodující kontrola níže používá přímo instalované zdroje **Babylon 9.30.0**, nejen analogii s glTF.
- [ambientCG Grass001](https://ambientcg.com/view?id=Grass001): **procedurální** materiál, přibližně 1,4×1,4 m, vydaný 28. 3. 2021, CC0. Není označen za fotografický travník. Stránka Asphalt033 byla při novém webovém pokusu nedostupná; jeho původní URL, SHA a přibližný rozměr 2,5 m zůstávají doložené existujícím importním manifestem.
- [ČVUT — Exteriéry kolejí Strahov](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov): galerie potvrzuje datum 20. 6. 2024 a autora Jiřího Ryszawého. V této iteraci se znovu ověřila metadata galerie, nikoli všechny jednotlivé fotografie. Žádný snímek ČVUT se nestahoval jako herní textura.

## Co je chyba a co není doložené

Původní kód načítá NormalGL s `invertY=false`, stejně jako barevné a roughness mapy. Obrazové soubory tedy mají vzájemně shodnou orientaci; pouhé převrácení obrázku by jejich motivy rozpojilo. Babylonův nativní `bumpFragmentMainFunctions.cotangent_frame` používá `vTangentSpaceParams`; `pbrBaseMaterial` je odvozuje z `invertNormalMapX/Y`. Jeho glTF loader pro nezměněné NormalGL používá X = !RH / Y = RH. Fotografické listy už mají pro projektové RH správnou konvenci, ale půdní povrchy ji dosud neměly.

Nová regrese ověřuje **skutečný `drapeTriangles`**, nikoli cizí glTF quad: DMR pozice a normály, UV X/4 a Z/4, existující winding, transformaci Babylon kamery a nativní cotangent výpočet. OpenGL normála svahu obráceného k +Z musí přijímat více světla z +Z než z −Z. Původní konverze tuto podmínku nesplní; opravená ji splní v RH i kontrolním LH. Rovinná normála, směr X a viditelná orientace trojúhelníku zůstávají správné. Jde o analytickou kontrolu přenosu; shaderový/GPU obraz stále vyžaduje samostatnou kontrolu.

Metrický přenos UV nadále dává asfalt 2,5 m, Grass001 1,4 m a obdélníkový beton 1,1×0,55 m. Barevné mapy se dekódují jako sRGB, normal/roughness zůstávají lineární; grayscale roughness nevyvolává kovovost. Nebyla nalezena opora pro změnu těchto parametrů. `CampusSurfaceArtPlugin` ani jeho tint/detail/normal síly se neupravují.

Zatažené osvětlení v existujícím `art-lighting` tlumí přímý klíč a zesiluje hemisférické světlo, takže menší kontrast reliéfu je očekávaný. Oprava směru normál **není tvrzením, že sama vyřeší homogenní asfalt, hustotu trávníku nebo barevnou shodu listů a půdy**. Nepřidává náhodné opravy vozovky, patinu ani kalibrovanou barvu odvozenou z nekalibrované fotografie.

## Náklad a životní cyklus

Znaménka se nastaví pouze při vytvoření převáděného PBR materiálu. Používají již existující uniform a shaderové násobení; nepřibývá textura, sampler, průchod, observer, cache ani stav aktualizovaný po snímcích. Jediné nové metadata označuje konvenci. Společná konverze obsluhuje všechny příslušné materiály, proto nevznikla opakovaná logika v jednotlivých rendererech.

Kontrola cache/životního cyklu zachovala tři sdílené kanály, původní iterátory aktualizací a obnovu materiálu při likvidaci. Nový test navíc projde low/medium/high, mokro→sucho, nečinný update bez dalšího zápisu a dispose se stejným počtem zdrojů. Existující testy dál kontrolují autorské spáry, vnořené MultiMaterial a převzaté textury. Již PBR modely a samostatná receptura schodů B6 jsou mimo konverzi a touto opravou se nepřepisují.

## Výsledky a GPU porovnání

- [Původní orientace](normal-transfer-20261012/before.log): **0/1**, selhání správného směru NormalGL svahu na skutečném DMR trojúhelníku.
- [Finální cílené kontroly](normal-transfer-20261012/targeted-tests.log): **18/18 PASS**, nový test a existující surface/cinematic/render-maintenance regrese.
- [Scoped TypeScript](normal-transfer-20261012/typecheck.log) včetně runtime, testu a připraveného náhledu: **exit 0**. První kontrola našla pouze chybějící typové zúžení `BaseTexture`→`Texture` ve statistikách náhledu; [původní log](normal-transfer-20261012/typecheck-initial-preview.log) zůstává zachovaný.
- [Zdrojové otisky, audit kanálů a přesný rozsah](normal-transfer-20261012/results.json). Plná pipeline ani FPS měření v této dílčí práci neběžely.

Root následně provedl GPU porovnání v připraveném náhledu `http://127.0.0.1:5190/.cache/surface-normal-qa/index.html` a scénu zavřel. Jedna scéna držela stejnou DMR geometrii/kameru; viditelná tlačítka přepínala původní/opravenou/vypnutou normálu a směry světla. Použité byly skutečné zdrojové mapy asfaltu, dlažby a Grass001. Světlo je výslovně komponentová diagnostika, nikoli skutečné počasí. [Archiv HTML](normal-transfer-20261012/preview.html.txt) a [zdroj náhledu](normal-transfer-20261012/preview.ts.txt) zachovávají původní umístění importů a nejsou samostatným přemístěným buildem.

[Protokol sedmi skutečných stavů](normal-transfer-20261012/gpu/states.json), zachycený 12. 10. 2026 v 07:51:42.438 UTC, uvádí **Intel UHD 630 / ANGLE D3D11**, CSS i render **1280×720**, RH, totožnou kameru/cíl a 12 trojúhelníků. Všech sedm stavů má `ready=true`, prázdné `errors`; omezený dotaz rootu do browser konzole nevrátil warning/error. Archiv zachovává originální obrazové bajty a SHA, bez koláže nebo retuše:

| Povrch a světlo | Kontrolované varianty |
| --- | --- |
| Asfalt, sever | [Opravená](normal-transfer-20261012/gpu/asphalt-corrected-north.jpg), [původní](normal-transfer-20261012/gpu/asphalt-legacy-north.jpg) |
| Dlažba, sever | [Opravená](normal-transfer-20261012/gpu/paving-corrected-north.jpg), [původní](normal-transfer-20261012/gpu/paving-legacy-north.jpg) |
| Dlažba, jih | [Opravená](normal-transfer-20261012/gpu/paving-corrected-south.jpg) |
| Procedurální Grass001, jih | [Opravená](normal-transfer-20261012/gpu/grass-corrected-south.jpg), [bez normály](normal-transfer-20261012/gpu/grass-no-normal-south.jpg) |

Všechny originály byly při archivaci znovu prohlédnuté: motivy zůstávají zarovnané, bez nové viditelné trhliny či geometrického artefaktu; odezva normál je jemná. Správný fyzikální směr reliéfu dokládá analytická regrese na skutečném UV/TBN, nikoli samotný screenshot jako texelový audit. Aktuální runtime/test/preview SHA při archivaci stále odpovídaly kontrolovaným zdrojům. Barevný a výtvarný styl celého areálu není touto opravou prohlášen za dokončený. Následné srovnání celé hry při stejném počasí, mokrém/suchém stavu, produkční pipeline a FPS/GeForce přejímka zůstávají samostatné.
