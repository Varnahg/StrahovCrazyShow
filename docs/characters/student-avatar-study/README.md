# Oči a vzhled studentských postav — cache studie, 11. 10. 2026

Tato fáze **nemění produkční hru**. Původní anatomický JSON má stále SHA256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`; původní CC0 source `.blend` má `3c121505651140ceb4d69fd1d8923f7788ffadd81672f5be14845a5f2c75c137`. Oděvy ani původní rig se zde nepřepisují. Náhled importuje aktuální ověřenou animaci SHA256 `43264dc5539afee8705edac45040d2d7017ff1cc3a28fa5989b4bb27321dda81`. Studie není dokončený avatar ani fotogrammetrický model skutečného studenta.

## Skutečná příčina ztracených očí

`eye-occlusion-probe.json` reprodukuje dva samostatné problémy aktuálního rendereru: při otočení hlavy ±0,65 rad zakrývá duhovku skutečná přední plocha tváře; při medium LOD se všechny staré oční vrstvy vypínají jako micro detail. Rodičovský transform očí je správný.

Původní hypotéza, že generátor chybně uzavřel oční otvory, byla **vyvrácena měřením původního source `.blend`**. `source-head-boundaries.json` ukazuje u muže po řezu jednu neck boundary, u ženy dvě neck-plane části; žádné oční boundary. Hlava se proto neopravuje neodůvodněným novým řezem/capem. `source-head-components.json` prokazuje konkávní sférické důlky (face sets 2/3), poloměr 13,31 mm, RMS 0,207–0,212 mm, normal dot radial přibližně −0,9992. Staré ploché oční vrstvy používají dno této konkávní plochy, duhovka je přibližně 21 mm za správným apexem oční koule.

## Licencovaný oční povrch a fit

Nezměněné MakeHuman system eyes pocházejí ze stejného oficiálního CC0 archivu jako dřívější oděvy/vlasy (SHA256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`). [Oficiální tabulka](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) uvádí high-poly, low-poly i jednotlivé oční materiály jako CC0; [licenční stránka](https://static.makehumancommunity.org/about/license.html) popisuje licenci. Původní OBJ/MHCLO/MHMAT mají vlastní explicitní CC0 hlavičky. Čas získání pro tuto studii a byte SHA všech souborů jsou v `.cache/student-avatar-study/eyes-source.json`. Originály i bitmapy jsou zachované ve `sources/eyes`; starý renderer/head/generator je archivovaný v `audit-before`.

High-poly source má 490 transparentních corneal quadů mapovaných do modrého průhledného UV ostrůvku. Tyto quady se v odvozeném opaque povrchu nebarví neprůhledně modře. Editovatelný původní OBJ zůstává celý, produkční průhledný shell se zde nenavrhuje. Odvozený povrch má 530 opaque quadů (**1 060 tri near**), **172 tri medium**, původní UV/RGB atlas a jeden PBR clear-coat materiál. Zdrojová sclera se similarity fituje do změřených CG socket spheres s radiální vůlí 0,15 mm. Near fit používá posterior spherical sclera mimo záměrnou přední iris recess (RMS 0,147 mm); low-poly je sférický s RMS 0,00183 mm. Nejde o libovolné vysunutí ploché duhovky.

Pupil landmarks se čtou z původní černé pupil masky atlasu a barycentricky přenášejí přes původní UV. Atlas nemá střed duhovek přesně v quarter/three-quarter souřadnicích, proto se tato poloha nehádá. `corrected-eye-occlusion.json` obsahuje 72 skutečných Babylon geometrických ray měření: 6 presetů × near/medium × yaw 0/±0,65 × 2 oči. Paprsek vždy první zasáhne oční povrch místo kůže. Nejde o GPU pixelové ani FPS měření.

## Náhled a cache refaktoring

`http://127.0.0.1:4198/docs/characters/student-avatar-study/preview.html` je zdrojový Vite náhled. Vlevo je původní produkce, vpravo fitované oči. Volitelné checkboxy přidávají čtyři vlasové prototypy a jemný autorský skin materiál. Rámování nabízí detail/celou postavu, front/3⁄4/profile/back, near/medium přes skutečný `AvatarLodController`, idle/walk/run/wave přes skutečný `AvatarAnimator`.

Osvětlení používá stejné `applyArtLighting`, Campus grade, ACES exposure a weather-matched sky reflection jako hra, pevný okamžik 11. 10. 2026 13:00 UTC a autorskou oblačnost 30 %. Rovina pod postavami je jasně izolovaný review podklad, nikoli zmapovaný Strahov. Počty v náhledu zahrnují pouze zapnuté skutečné meshe a trojúhelníky. Náhled není výkonnostním důkazem celé hry.

`appearance-resources.ts` sjednocuje opakovanou logiku geometrií, materiálů a textur pro oči/vlasy/skin. Geometrie se sdílejí mezi postavami, materiály mají refcount a uvolní se s posledním vlastníkem, omezená sada atlasů se sdílí ve scéně a uvolní se při dispose scény. Regrese opakuje 4 rebuild cykly se dvěma avatary a ověřuje nulové zbylé meshe/materiály/geometrie. Skin preview používá byte-identickou geometrii v study-owned Mesh: Babylon ignoruje reassignment materiálu na původním InstancedMesh, změna source materiálu by navíc porušila A/B izolaci.

Vlastní skin materiál používá původní CG UV v rozsahu 2×3 UDIM tiles, nemění souřadnice hlavy ani původní source. Pore gradient je autorské analytické pole v metrech, nikoli fotografie nebo změřená lidská kůže. Regionální roughness a jemná cheek tint jsou interpretované výtvarné parametry. `authored-skin-audit.json` dokládá 64 334 pokrytých texelů, roughness 0,4745–0,5922 a maximální tangent tilt 0,03882. Na vzdálenějších postavách se neočekává čitelnost jednotlivých pórů. Skutečné GPU posouzení tohoto materiálu zatím chybí.

## Výsledky a zásadní omezení

`pnpm exec tsx --test .cache/student-avatar-study/eye-regression.test.ts .cache/student-avatar-study/appearance-regression.test.ts`: **7/7 PASS**. Týká se integrity zdrojů, geometrie, skutečného LOD, očí při natočení, materiálového režimu, skin bounds a lifecycle. Izolovaný Vite build prošel pro předchozí oči+vlasy checkpoint; aktuální skin rozšíření je ověřené targeted testy a zdrojovým náhledem, poslední offline bundle není aktuálním release balíčkem. Při freeze se nezaměňuje za hotovou produkční integraci.

Vlastní dva bounded CPU obrázky `evidence/eyes-turn-near.png` a `eyes-turn-medium.png` byly vizuálně prohlédnuté: vpravo jsou oční povrchy usazené do víček a čitelné při otočení, vlevo prázdné důlky. Materiály/CPU studiové světlo těchto snímků nejsou identické s browserem. Skutečný GPU shader/alpha/whole-body review provádí integrující agent odděleně; do této chvíle nebyl této fázi potvrzen.

**Long01 whole-body prototyp není vhodný pro integraci.** Nový head→torso skin blend přes původních 13 bones omezuje rigidní pohyb konců při otočení hlavy, ale neřeší rest fit vlasů na oděv. `longhair-garment-audit.json` používá skutečně deformované Babylon vertices, přesné triangle/triangle průsečnice a 9 bilineárních alpha vzorků na segment: všech 16 případů Eli/Mia × idle-left/idle-right/wave/walk × near/medium má 510–1 427 viditelných segmentů průniku do horního oděvu. Nejde o procento pixelů ani dosud o GPU vizuální závažnost; je to konkrétní nedodělaný fit, který se nesmí zakrýt pouhým tvrzením o dokončené fyzice. Před integrací vyžaduje odvozený rest fit na konkrétní garment envelope a nové pózové/GPU ověření. Původní vlasy/oděvy se nepřepisují.

Čtyři texturované účesy nepokrývají šest jedinečných předvoleb, barvení podle palety zatím není integrované, bob zdrojově zakrývá jedno oko a source RGB obsahuje část baked highlights. Hlava je stále společná obecná neutrální anatomie s šířkovou úpravou, nikoli dokončených šest mladých individuálních tváří. Mrkání, pohled očí, mimika a fyzikální vlasové prameny chybějí. Moderní tlumená paleta a skutečně střižené oděvy jsou současná produkční verze; tato fáze neprohlašuje novou oděvní geometrii ani kvalitu Hogwarts Legacy.

Na žádost parent agenta se po zapsání auditu tato cache/docs fáze zmrazuje pro checkpoint a předání současné ověřené produkční verze. Bez výslovné integrace rootem se nic z této studie automaticky nedostává do hry.
