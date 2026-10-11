# Studie texturovaných vlasů — 11. 10. 2026

Jde o samostatný lokální prototyp ve `.cache/hair-realism-study`, nikoli změnu produkčních postav. Runtime anatomie, hlavy, oděvy, modelové zdroje a produkční TypeScript zůstávají nedotčené. Celý anatomický JSON stále má SHA256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`.

## Zdroj a účesy

Primární [oficiální tabulka MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) uvádí `short02` a `bob01` jednotlivě jako CC0. Dne 11. 10. 2026 byl stav znovu ověřen spolu s [licenční stránkou vydavatele](https://static.makehumancommunity.org/about/license.html). Nezměněné OBJ, MHCLO a MHMAT mají vlastní výslovnou CC0 hlavičku z roku 2020. Zdroje pocházejí z dříve ověřeného oficiálního archivu se SHA256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`; lokální `source.json` obsahuje čas studie a velikosti/hash každého původního souboru.

Zachované původní soubory jsou v `.cache/hair-realism-study/sources/hair`. Žádný originál ani bitmapa se nepřepisují. Studie obsahuje krátký vrstvený `short02`, asymetrické pramenné mikádo `bob01`, krátký uhlazený `short04` a dlouhý `long01`. Všechny čtyři jsou jednotlivě uvedené v primárním CC0 seznamu; u nových dvou byla licence znovu ověřena 11. 10. 2026. Jde o licencované texturované sheet/card meshe, nikoli jednotlivá fyzikální vlasová vlákna nebo fotogrammetrii konkrétní osoby. Mikádo má již ve zdroji dlouhou ofinu zakrývající jedno oko; není vhodnou univerzální náhradou všech šesti účesů.

`short02` používá původní RGBA difuzi 2048×2048 a původní normal mapu. `bob01` má původní RGBA difuzi 2048×2048, dodanou normal mapu nemá. Normálový obrázek se čte jako Non-Color: 65 536 vzorků má medián délky dekódovaného vektoru 1,0000, p05 0,9971, p95 1,0030 a žádné záporné Z. Nevydáváme chybějící normal mapu mikáda za hotovou.

## Fit a rendering

Původní MHCLO barycentrický fit se přenáší do metrového hlavového rámce a registruje společným robustním posunem skalpu. Dlouhé ofiny se nestáčejí podle normály nejbližšího bodu obličeje — tato dřívější pokusná varianta deformovala směr pramenů a byla odmítnuta. Zachovává se zdrojová UV orientace a pád pramenů. Lokální kolizní korektivy upravují pouze průniky viditelných kartiček do původní hlavy. Nejvyšší původní model zůstává vedle fitu v editovatelném `.cache/hair-realism-study/hair-prototypes.blend`; medium je samostatný odvozený decimate s chráněnými okraji a následnou kontrolou skalpu.

Interaktivní `preview.html` skutečně vytváří původní herní rig a obě hlavy přes `createAvatarRig`. Prototyp je dítě původního `AvatarRig.head`, používá jeho transform, výšku rootu a přesně stejné šířkové měřítko `.173 + config.face * .016`, vertikálu `.235` a hloubku `.195`. Nejde o posunutý nezávislý objekt vedle postavy. Ovládání mění skutečný head pivot, nabízí šest presetových hlav, near/medium, pohledy a alpha cutoff. Ostatní části těla jsou v tomto detailovém náhledu skryté.

PBR používá **alpha test**, nikoli blendování: cutoff 0,42, zápis hloubky, oboustranné osvětlení a vypnutý backface culling. To zabraňuje třídicím problémům průhledných pramenů, ale tvrdý cutoff může při pohybu a mipování ztrácet nejjemnější vlasy. Budoucí integrace musí prověřit coverage mipů a MSAA na cílové GPU. Zdrojová RGB barva se zatím zachovává; barvení podle palety editoru není integrované.

## Geometrie a limity důkazů

| Účes | Near | Medium | Zdrojová alpha transparentní / částečná |
| --- | ---: | ---: | ---: |
| short02 | 3 534 trojúhelníků | 1 942 trojúhelníků | 57,94 % / 4,38 % |
| bob01 | 8 474 trojúhelníků | 7 880 trojúhelníků | 42,84 % / 3,17 % |
| short04 | 1 158 trojúhelníků | 1 158 trojúhelníků | Viz audit atlasu |
| long01 | 4 108 trojúhelníků | 3 764 trojúhelníků | 20,14 % / 23,44 % |

Každý zobrazený účes používá jednu geometrii a jeden materiál. Při nasazených brýlích se použije zvláštní odvozená geometrie se zachovanou původní texturou. Cutoff 0,42 ponechává 40,38 % texelů krátkého atlasu a 55,44 % atlasu mikáda. To není procento skutečně pokrytých pixelů obrazovky ani měření overdraw.

`geometry-alpha-audit.json` obsahuje nejvyšší a odvozený LOD, fit posuny, normálový audit i alpha-aware kontrolu skutečně viditelných středů trojúhelníků. U obou LODů a účesů je **0 vzorkovaných opaque středů uvnitř hlavy nad 1 mm** podle většinové parity tří paprsků. Samotný signed nearest-face údaj je u konkávního ucha a otevřeného spodního krku zavádějící; oba údaje se proto uvádějí. Centroidový audit nepokrývá každý fragment, každou mip úroveň ani celý rozsah morfologie — není důkazem dokonalého nulového průniku.

CPU srovnání z Blenderu je v `evidence/short02-comparison.png` a `bob01-comparison.png`: vlevo původní pevná silueta, vpravo texturovaný prototyp. Materiály a osvětlení studia nejsou totožné s browserem. Aktuální finální GPU posouzení provede integrující agent samostatně; z této komponenty se neuvádějí FPS ani výkonnostní záruky celé hry.

## Lokální spuštění a další práce

Zdrojový náhled přes existující Vite server: `/docs/characters/hair-realism-study/preview.html`. Samostatný offline bundle je `.cache/hair-realism-study/offline-preview`; lokální server spustí `node .cache/hair-realism-study/serve-offline.mjs` a vypíše adresu. Bundle má lokální JS i bitmapy a nepotřebuje vzdálený CDN. Prohlížeče vyžadují lokální HTTP server pro ES moduly, nejde o obcházení jejich zabezpečení.

Reprodukce: `blender --background --threads 2 --python .cache/hair-realism-study/create-prototypes.py`, omezené dva CPU srovnávací pohledy přes `render-prototypes.py`, izolované sestavení přes `pnpm exec vite build --config .cache/hair-realism-study/vite.config.ts` a strukturální kontroly přes `pnpm exec tsx --test .cache/hair-realism-study/hair-study.test.ts`. Tyto operace nemění produkční balíček.

Skutečný výsledek této fáze: strukturální testy **4/4 PASS**, izolovaný offline build PASS a lokální HTTP kontroly aktuálního HTML/JS PASS. CPU srovnávací pohledy jsou uložené ze stejného ortografického úhlu; zdrojový náhled také používá ortografickou A/B kompozici, aby rozdílná poloha dvou hlav neměnila porovnávaný úhel. Přenositelný archiv `.cache/hair-realism-study/offline-preview.zip` obsahuje aktuální bundle a lokální bitmapy. SHA256 prototypu, editovatelného masteru, zdrojů a důkazů jsou v `prototype-audit.json`. Žádný z těchto CPU/NullEngine výsledků se nevydává za GPU test.

Před integrací zbývá skutečný GPU review aktualizovaných čtyř modelů zepředu/zezadu/profilu, shader readiness, alpha okraje při otočení, medium přechody, brýle a oko pod asymetrickou ofinou, návaznost na límec/ramena, paleta barvení, zbývající dva rozdílné zdrojové účesy, kamerová viditelnost a výkon v celé hře. Zdrojové RGB mapy navíc obsahují část vpečeného lesku; není to nově vytvořená neutrální PBR sada. Bob není hotová univerzální náhrada. Cíl studie je prokazatelně čitelnější pramenná textura a silueta, nikoli označení modelu za AAA nebo dokončenou produkční implementaci.

## Oprava skutečného GPU nálezu ucha a brýlí

Root skutečně zkontroloval původní dva účesy v prohlížeči: ready=true, žádné chyby shaderů, lepší textura/silueta. Současně screenshoty `root-review/short02-profile-near.png` a `short02-turn-medium.png` prokázaly černé kartičky ve viditelné konše. Starý centroidový audit tento problém minul: dutina ucha není uvnitř pevné tkáně a průnik malé části trojúhelníku nemusí zasáhnout jeho střed. Nešlo o důkaz dokončené postavy.

Oprava mění pouze odvozené vlasy. Krátké účesy mají skutečný polygonový výřez podle laterální aurikuly původní CG hlavy (72 referenčních vertexů na každé straně, projekce do YZ, convex hull, interpretační vůle 2,5 mm). Nové okraje zůstávají v rovině původní kartičky a interpolují původní UV; bitmapa ani ucho se nepřekreslují. Stejný výřez se aplikuje znovu po zjednodušení medium. Kryjící delší účesy používají plynulý vnější obal aurikuly místo zasouvání pramenů do konchy.

Varianta s brýlemi odečítá úzký prostor kolem přesných původních CG cest straniček, s 2,9mm radiálním obalem oproti původní 1,65mm poloměru rámu. Originální brýle zůstávají neměnné. Náhled má skutečný přepínač brýlí a volí odpovídající geometrii; neřeší problém skrytím brýlí.

Nezávislá Node kontrola reprodukuje v původním GPU vadném modelu 0,003102719 m² celé geometrické plochy v prostoru aurikuly a 0,000383951 m² v obalech straniček. Nejsou to plochy skutečně neprůhledných pixelů. Opravené plain/glasses modely v near i medium mají celý překryv pod 1e-8 m², včetně geometrie s nulovou texturovou alphou; zbylé nanometrové odchylky vznikají float/roundingem. Test tak neignoruje část trojúhelníku mimo centroid.

Navíc se kontrolují skutečné ne-koplanární triangle/triangle průsečnice proti nezměněné hlavě a sedm bilineárních alpha vzorků podél každého segmentu. Plošný audit má 16 barycentrických bodů včetně hran každého trojúhelníku. Všech 4×2×2 variant má 0 viditelných alpha průsečnic a 0 opaque plošných vzorků uvnitř nad 1 mm. Nejde o GPU důkaz všech mipů nebo každého fragmentu; finální profil/turn/ear alpha review patří rootu.

Zjednodušování nyní chrání tvar skalpu a zdrojových hran. Proto je medium mikádo blíž near kvalitě, krátký `short04` ponechává levných 1 158 trojúhelníků. Není zde předstíraná redukce za cenu průniku. S brýlemi mají near/medium: short02 3 585/1 993, bob01 8 775/8 132, short04 1 342/1 342, long01 4 361/4 028 trojúhelníků.

Přesné CPU před/po záběry stejného původního ucha a stejné textury: `evidence/short02-ear-profile-near.png` a `short02-ear-profile-medium.png`. Koncha zůstává prázdná a kožní v obou LOD, původní černé kusy jsou viditelné vlevo. Aktualizovaný offline bundle nabízí čtyři účesy a přepínač brýlí; dlouhý účes se automaticky vejde do záběru. Vlasy jsou stále připojené k původnímu head pivotu; u dlouhého účesu zbývá celopostavové ověření ramen/oděvů a případný blend na torso/sekundární pohyb před produkční integrací.

Čtyři vlasové prototypy nejsou dokončený avatar. Nejnovější požadavek na mladší studentské tváře, správně čitelné oči při natočení, sladěnou moderní siluetu oděvů a fyzické herní světlo pokračuje jako další oddělená cache studie. Aktuální hlavní hra a původní anatomický JSON se tímto nemění.
