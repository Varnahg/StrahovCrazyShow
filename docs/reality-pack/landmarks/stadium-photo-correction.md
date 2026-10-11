# Východní stadionový pavilon: oprava podle uživatelských fotografií

Kontrola 10. 10. 2026. Tento balík je **vlastní model podle fotografických předloh a mapového půdorysu**, nikoli fotogrammetrie. Případný import skutečného IPR fotogrammetrického meshe je samostatná práce integrátora; tento soubor netvrdí, že jej obsahuje.

## Prohlédnuté podklady

Byly skutečně prohlédnuty tři uživatelem dodané screenshoty Google Street View: `codex-clipboard-3b764a8e-0dab-477d-9ea5-6c341efd6e2f.png`, `codex-clipboard-6d5aac8c-c02e-43f0-9795-57617c3635c0.png` a `codex-clipboard-7e2949f1-8c17-4ae9-97ab-8eabbb2a2ec9.png`. První dva ukazují hlavní východní pavilon z Vaníčkovy z opačných směrů, třetí protější chodník, zastávku a koleje. Datum pořízení panoramatu z obrázků nelze doložit; copyrightový rok není datum snímkování. Snímky se nekopírují do textur, meshe ani exportovaných modelů.

Půdorys a výška 20 m zůstávají odvozené z [OSM části 480849465](https://www.openstreetmap.org/way/480849465), uvnitř [stadionové relace 1515034](https://www.openstreetmap.org/relation/1515034). Frontální lomená čára je převzata ze skutečných souřadnic katalogu, ne z pravoúhlého náhradního kvádru. Pozice krytého středního průjezdu odpovídá [OSM service way 873110981](https://www.openstreetmap.org/way/873110981), která je značena `covered=yes`. Výškový základ používá stejný ČÚZK DMR 5G jako render a Rapier.

## Opravená silueta

Předchozí model opakoval tři shodné okenní pásy. Nyní obsahuje hlavní vykonzolovaný modrošedý prosklený objem, nestejně vysoké řady jeho rámování, široký betonový pás nad ním a úzké horní prosklení pod přesahem střechy. Tmavý spodní líc a ustoupené podpory dávají horní hmotě skutečnou hloubku. Níže leží samostatný vodorovný plechový pás ochozu; pod ním zůstává otevřená sloupová konstrukce a průhledy. Generický stadionový parapet se za tímto čelem už nepřekrývá s prosklením.

Hlavní pavilon byl navíc dříve kotvený na medián celého stadionového obvodu, tedy i západního svahu. Vlastní půdorys dává základ Y **3.17977 m**, místo Y **6.16315 m** celé mísy. Oprava rozdílu **2.98338 m** používá skutečný zdrojový terén. Případný zadaný posun celého stadionového modelu se stále zachovává.

U středního průjezdu je vlastní interpretace dvojice vyložených schodišťových ramen: betonové stupně, zaobleně zeslabené boční nosníky, otevřený prostor pod horní částí a úzké tmavé zábradlí. Jejich vazba na průjezd vychází z mapy; rozměry, počet 28 stupňů na rameno, přesná křivka a rytmus jsou **proporční interpretace fotografií**, které musí být srovnány s přesnějším zdrojovým meshem nebo zaměřením. Nejde o nově nalezený stavební výkres.

## Materiály a úrovně detailu

Modrošedé sklo, starší rámy, matné plechové obložení, tmavý spodní líc a černé zábradlí mají oddělené PBR materiály. Jemné odchylky skleněných tabulí jsou vlastní vrcholové barvy, nikoli vzorky Google snímků. Beton používá existující materiálový systém s původem textur v jeho manifestu; není označený za sken konkrétního stadionového betonu.

Plný blízký zdroj obsahuje padesát rámovaných polí, nestejné vodorovné řady a tenké zábradlí. Samostatná vzdálená geometrie redukuje hustotu svislých rámů a jemné části; ponechává skleněné pásy, betonový pás, přesah, sloupy i schodišťovou siluetu. Render i kolize používají `buildLandmarkPlan`, včetně otevřeného průjezdu. B1 a společné kolejní vstupy se funkčně nemění.

| Rozsah                           | Blízké trojúhelníky | Vzdálené trojúhelníky |
| -------------------------------- | ------------------: | --------------------: |
| Samotný stadion                  |              16 620 |                 9 686 |
| Celý balík B1 + vstupy + stadion |              26 741 |                13 215 |

Celý balík má 14 336 kolizních trojúhelníků. Stadion má 13 materiálových/LOD meshů, z nichž je současně zapnuto nejvýše 10 v blízkém a 8 ve vzdáleném provedení. Jde o počet dávkovaných meshů; **skutečné draw calls včetně stínových průchodů a FPS musí měřit celá hra**, nikoli tento počet nebo NullEngine.

## Ověření a předání

`tests/stadium-photo-reality.test.ts` kontroluje zachování půdorysu, samostatné výškové kotvení, členění zasklení bez třetího falešného patra, vrcholové barvy a LOD, skutečný krytý průjezd a rozpočet dávek. Skutečná produkční kapsle bez teleportu projde 35 m pod pavilonem a samostatně vystoupá po obou nových ramenech na společný ochoz. Původní `tests/landmark-reality.test.ts` nadále pokrývá otevřenou stadionovou plochu, B1, vstupy a společnou kolizní geometrii.

```powershell
pnpm exec tsx --test tests/landmark-reality.test.ts tests/stadium-photo-reality.test.ts
```

Komponentový WebGL komparátor: `/docs/reality-pack/landmarks/stadium-photo-correction-preview.html?view=south`; další pohledy `north`, `portal`, `campus`, `aerial`. V tomto subagentu vrátil inventář Cua prázdný seznam prohlížečů a existující kořenový prohlížeč nebyl dostupný. Proto se zde nevydává NullEngine za ověřené WebGL ani za měření FPS; vizuální kontrolu v kořenovém prohlížeči provádí integrátor.

Editovatelný zdroj: `assets/blender/landmarks/great-strahov-stadium.blend`; exporty `public/models/landmarks/great-strahov-stadium.glb` a `great-strahov-stadium-far.glb`. Exportovaná data pocházejí ze stejného sdíleného numerického plánu. Skleněný GLB obsahuje skutečný atribut `COLOR_0`, ověřený přímo v glTF. Počty a SHA-256 jsou v `public/models/landmarks/manifest.json` a v navazujícím `stadium-photo-correction-audit.json`.

Zůstává nezaměřené současné poškození, jednotlivé nápisy, vnitřní zázemí a přesné schodišťové proporce. Snímky opravují zjevně chybný vzhled; nedokládají dokončenou rekonstrukci celého stadionu.
