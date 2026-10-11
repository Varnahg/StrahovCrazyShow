# Šité studentské oděvy — 11. 10. 2026

Produkční `createAvatarRig` používá samostatné šité panely mikiny/svetru, trička nebo prošívané bundy a kalhot. Tvar už nevzniká obarvením přiléhavé anatomie. Nové oděvy sdílejí původní třináctikostní rig, IK, gesta a nastavení barev. Soubor anatomie, hlavy a vlasů se nezměnil: SHA256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`.

## Původ a úpravy

Oficiální [MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) mají [licenci CC0](https://static.makehumancommunity.org/about/license.html). Použité originály `male_casualsuit02`, `male_casualsuit06` a `male_casualsuit05`, MakeHuman basemesh, rig a původní malované váhy jsou uložené v `assets/sources/characters/makehuman-clothes`. `source.json` obsahuje čas získání, odkazy, velikosti a SHA256 každého souboru. Původní licence jsou také přímo v OBJ/MHCLO a JSON vahách. Archiv 280,7 MB je v místní cache; potřebné nezměněné zdroje jsou samostatně zachované v projektu.

Generátor provede skutečný MHCLO barycentrický fit, převede původní malované váhy na třináct herních kostí a přepózuje panely do herní soustavy. Krk, manžety a otvory trička registruje k nezměněné anatomii zvlášť pro mužský a ženský základ. U otvorů přebírá i váhy sousední původní kůže, aby rukáv při zamávání neodjížděl od ruky. Modelovací odhad: 12mm překrytí manžety, 25mm překrytí trička a nejméně 6mm vůle otvoru nad průřezem kůže. Nejde o fotogrammetrii skutečného studenta.

Používají se původní UV, bitově shodné CC0 normal/AO mapy a vlastní jednolitá barva z editoru. Zdrojové diffuse obrázky s potiskem nejsou herní textury. Vlastní bodové ztmavení sleduje geodetickou vzdálenost k lemu a průramku. Materiály jsou neprůhledné PBR, bez alpha testu; normálová a AO data nejsou sRGB.

`assets/blender/characters/student-garments.blend` je editovatelný master s původními zdrojovými modely, upravenými panely, původními UV, váhami, PBR materiály, rigem, ženskými fity a srovnávací předchozí anatomií. Nejvyšší editovatelný subdivision zůstává zachovaný. Runtime JSON obsahuje odvozené near/medium modely; medium tričko redukuje pouze interiér s chráněnými šitými otvory. Nejvyšší původní zdroj se nepřepisuje.

## Integrace a ověření

Factory vytváří rovnou nové oděvy a původní ruce; u trička navíc původní holé paže. Staré anatomické shirt/trousers, clothed sleeves a primitivní kapuce/kapsy/zipy se v produkční cestě vůbec nevytvoří. Přechod na medium proto nemá žádnou maskovanou starou vrstvu, kterou by mohl znovu zapnout. Kosmetický odznak se pokládá podle průsečíku se skutečným novým panelem. Životnost sdílených geometrií, materiálů a kostry je navázaná na vlastníky i při vyřazení vzdálených částí z `scene.meshes`.

Interaktivní `preview.html` používá stejnou produkční factory, animator a LOD jako hra. Historický `../skinned-anatomy/preview.html` má výslovný `studentGarments:false` pouze pro srovnání starého vzhledu. Herní a vytvářecí obrazovky používají nové oblečení standardně. Samostatný renderer registruje stejné statické shadery jako hra.

Ověřeno finálním cíleným během `pnpm exec tsx --test tests/student-garments.test.ts tests/skinned-avatar.test.ts tests/animation.test.ts tests/avatar-lod.test.ts`: **31/31 PASS**. Při skutečném výpočtu Babylon bone matic během 120 snímků zamávání činil největší rozdíl středů odpovídajících otvorů **25,343 mm**; limit testu je 40 mm. To není měření největší mezery mezi povrchy ani záruka všech extrémních póz.

Dodatečný browser review správně odhalil, že samotná shoda středů nestačí: původně aplikované rozšíření malého zápěstního otvoru se rozprostřelo po celém předloktí a vytvořilo nepůvodní zvonový tvar. Nový test se starými daty selhal na Eli near s radiálním rozměrem předloktí **1,967×** vůči nezměněné CG anatomii. Oprava omezuje pouze toto dodané škálování na posledních 45 mm u otvoru, ponechává zdrojový střih zbytku předloktí a zachovává fit původního zápěstí. Nový test pro mužský/ženský základ, mikinu/bundu, oba LODy a přechod idle→wave měří vedle polohy také radiální rozsah a axiální překrytí: nejvyšší poměr otvoru vůči kůži **1,081×**, předloketního pásu vůči zdrojové anatomii **1,299×**. Limity jsou 1,55× a 1,65×; koncový prstenec nesmí axiálně odjet do mezery. Výsledky jsou ve `cuff-fit-correction.json`.

Testy ověřují šest presetů, barvy, hlavu/vlasy, neměnnou výšku očí, sdílení GPU bufferů, jednotkové normály, normalizované váhy, přechod 20→100→0→20 metrů, žádné znovuaktivování starých oděvů, konečné matice při chůzi/gestu a likvidaci zdrojů. `tsc --noEmit` při kontrole této fáze našel jedinou chybu mimo avatar scope v `client/vehicle-lighting.ts:153` (`undefined` oproti `Nullable`); konečný společný běh zajišťuje integrující agent.

Skutečný browser WebGL review integrujícího agenta: Alex čelně a při gestu, Sam s tričkem čelně a Mia ze tří čtvrtin; scéna hlásila ready a 0 chyb shaderů. Zachycené snímky jsou `root-review/alex-front.png`, `alex-wave.png`, `sam-tee-front.png`. Není to měření FPS celé hry.

Po opravě manžet integrující agent znovu vizuálně porovnal skutečný GPU renderer: Eli medium idle, near wave a medium wave byly ready s `shaderError:null`; obří zvonový tvar předloktí zmizel při porovnání ze stejného úhlu. Finální snímky: `root-review/eli-medium-idle-cuff-corrected.png`, `eli-near-wave-cuff-corrected.png`, `eli-medium-wave-cuff-corrected.png`. Drobný ven vyhnutý lem manžety zůstává viditelný; je to zbývající kvalitativní omezení, nikoli dokonalý AAA oděv.

Blender Cycles CPU srovnání před poslední opravou škálování manžet: `evidence/previous-three-quarter.png`, `previous-wave.png`, `sweatshirt-front.png`, `sweatshirt-three-quarter.png`, `sweatshirt-profile.png` a `sweatshirt-wave.png`. Stejná kamera a osvětlení ukazují odstranění původního hrbolatého ramene/rozbitého průramku. Poslední gesto používá vynucený CPU denoiser. Původní automatický denoiser po pěti pohledech skončil OOM; finální master byl úspěšně uložen přes `--save-only` i po opravě škálování manžet. Čtyři zbývající tee/jacket Blender snímky jsou ještě starší průběžné náhledy a nejsou označené za konečný důkaz. Studio používá zjednodušené referenční boty a oči; finální vizuální posouzení aktuální geometrie patří browser review.

## Aktivní geometrie

Čísla pocházejí ze skutečně vytvořených a zapnutých produkčních částí ve strukturální kontrole Babylon NullEngine. Nesčítají vypnuté LODy. Nejde o GPU FPS ani naměřené draw calls.

| Preset | Near trojúhelníky / části | Medium trojúhelníky / části | Far trojúhelníky / části |
| --- | ---: | ---: | ---: |
| Alex | 26 130 / 17 | 10 896 / 7 | 192 / 1 |
| Robin | 26 850 / 18 | 10 896 / 7 | 192 / 1 |
| Eli | 33 938 / 17 | 13 020 / 7 | 192 / 1 |
| Sam | 26 720 / 19 | 15 074 / 9 | 204 / 1 |
| Mia | 27 150 / 18 | 11 140 / 7 | 192 / 1 |
| Niki | 26 130 / 17 | 10 896 / 7 | 192 / 1 |

Z toho skutečně skinnované části jsou 3 na mikině/bundě a 4 na tričku. Samotné near/medium vršky: mikina 9 632/2 408, tričko 5 456/3 000, bunda 17 136/4 284 trojúhelníků. Kalhoty mají 1 712 trojúhelníků. Celá hra, multiplayer a 30 různých avatarů vyžadují samostatné měření produkčního sestavení v uživatelově prohlížeči na skutečné GPU.

## Reprodukce a omezení

Generování: `blender --background --threads 2 --python scripts/create-student-garments.py`. PBR studio a uložení masteru bez renderování: `blender --background --threads 2 --python scripts/review-student-garments-blender.py -- --save-only`. Pro úplné studiové pohledy vynechat `--save-only`; review se spouští po novém generování masteru. CPU render není FPS test.

Zlepšení není dokončená kvalita Hogwarts Legacy. Mikina má nyní crewneck střih, kapuce není v těchto CC0 oděvech. Vlasy, tváře, vousy a obuv se v této fázi neměnily. Nejsou přidané animované prsty, obličejový rig, mocap ani simulace látky; třináct kostí nemá produkční korektivní tvary pro všechny extrémní pózy. Drobné průniky manžety jsou úmyslné skryté překrytí, nikoli fyzikální simulace. Původní geometrie a master dovolují další kvalitativní úpravy bez ztráty zdroje.
