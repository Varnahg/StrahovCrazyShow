# Kontinuita kroků po O2 — 11. 10. 2026

Uživatel znovu upozornil na nesprávný pohyb nohou. Audit aktuálního produkčního rigu reprodukoval konkrétní skoky při rozběhu, zastavení a opětovném stisku pohybu během nedokončeného dosedání. Oprava je v `client/animation.ts`; zdrojové modely, váhy, proporce, rychlosti fyziky a `client/avatar-skinned.ts` se nemění. Samotný audit neurčuje všechny příčiny uživatelova vizuálního dojmu.

## Průzkum a příčina

- Pivots a délky končetin jsou z produkčního `client/avatar-renderer.ts`: stehno a holeň po 0,42 m, kotník 0,08 m, přizpůsobená výška a šířka presetů. Původní CC0 Blender Human Base Meshes a odvozené váhy zůstávají zachované; provenienci popisuje [anatomická zpráva](../skinned-anatomy/README.md).
- Babylon [Bones and Skeletons](https://doc.babylonjs.com/features/featuresDeepDive/mesh/bonesSkeletons) a skutečný instalovaný Babylon 9.30.0, `Bones/skeleton.js` / `prepare`, potvrzují kontrakt propojených TransformNodes: `linkTransformNode` přenáší lokální polohu, rotaci a měřítko do kostí. Testy proto měří skutečné FK matice chodidel a zachovávají samostatný test skutečné skinning palety; není třeba přepisovat váhy modelu ani nahrazovat rig.
- Původní první švih začínal uprostřed ideální dráhy, jejíž odraz nikdy neproběhl. Během přechodu na běh se navíc měnil zdvih už probíhajícího švihu.
- Po zastavení klesala délka/duty kroku, ale vzdálenostní fáze stála. To přepínalo nohu mezi podporou a švihem bez pohybu postavy. Dosedání zachovalo X/Z posledního kotníku, ale ignorovalo jeho Y a odval boty.
- Při krátkém opětovném stisku mohla stojná bota přeskočit ze špičky rovnou naplocho. Nová regrese tuto dodatečnou chybu nejprve zachytila (10,50 m/s vertikálně při 144 Hz), poté prošla s nezměněnou mezí.

## Integrovaná změna

Každý švih začíná v poslední skutečné poloze a úhlu boty; zdvih se stanoví jednou při odrazu. Mezera interpolace kratší než 60 ms nezakládá nový krok a nemění jeho délku. Po skutečném zastavení dosednutí zachová všechny tři souřadnice, natočení i odval a plynule přejde do klidového postoje. Podepřená noha udržuje dosažitelnou výšku pánve i během dosedání. Návrat do pohybu navazuje také na ještě nedokončený švih a odval.

Plán výšky budoucího nášlapu nyní vzorkuje stejný plochý bod podpory jako samotné přistání, před posunem kotníku pro odval paty. Dřívější rozdíl přibližně 1,4 cm v podélné souřadnici mohl na hraně schodu znamenat rozdíl 15 cm ve výšce. Kontroly schodů ani jejich tolerance se neuvolnily.

Cílený refaktoring sdílí skalární výpočet odvalu a předem připravený seznam dvou kontaktů; odstraňuje opakované malé objekty a `Object.values` v aktualizaci. Kostra, GPU geometrie a lifecycle avatarů zůstávají stejné. To není důkaz zlepšení FPS.

Volitelný `AvatarAnimationState.flashlight` nastaví pravou paži do plynulého držení a při `vehicle` se neuplatní. Držák používá `rig.rightElbow`, lokální úchop `(0, -0.275, 0.02)` a osu `-Y`. Vytvoření svítilny, zdroj světla a jeho likvidaci vlastní Game; levá paže a IK nohou se tím nemění.

## Reprodukovatelný CPU důkaz

`transition-audit.ts` používá skutečný rig a FK matice: 1 s klid, 2 s předepsané rovné dráhy, 3 s klid, podklad ve výšce nula. [Před opravou](transition-before-audit.json) a [po opravě](transition-after-audit.json) obsahují úplné SHA zdroje a všech devět kombinací. `fps` v těchto JSON znamená frekvenci aktualizace animace, nikoli změřené GPU FPS.

| Frekvence / pohyb | Max. vertikální rychlost kotníku při rozběhu O2 → oprava | Při zastavení O2 → oprava |
| --- | ---: | ---: |
| 60 Hz / 1,8 m/s | 7,16 → 2,30 m/s | 2,74 → 0,86 m/s |
| 60 Hz / 4,6 m/s | 6,58 → 2,95 m/s | 10,91 → 1,86 m/s |
| 60 Hz / 7 m/s | 9,68 → 3,84 m/s | 6,82 → 2,39 m/s |
| 144 Hz / 1,8 m/s | 18,29 → 2,27 m/s | 6,57 → 0,87 m/s |
| 144 Hz / 4,6 m/s | 17,76 → 3,90 m/s | 12,60 → 1,93 m/s |
| 144 Hz / 7 m/s | 17,52 → 4,56 m/s | 15,31 → 2,32 m/s |

Rychlost je zde ukazatel nespojitosti, nikoli tvrzení o správných biomechanických mezích. V původním běhu 4,6 m/s klesal kotník po zastavení o 18,2 cm za jedinou 1/60 s aktualizaci.

```text
node --import tsx docs/characters/locomotion-study/transition-audit.ts docs/characters/locomotion-study/transition-before-audit.json --baseline
node --import tsx docs/characters/locomotion-study/transition-audit.ts docs/characters/locomotion-study/transition-after-audit.json
node --import tsx --test tests/animation.test.ts tests/locomotion-quality.test.ts tests/skinned-avatar.test.ts
```

Poslední cílený běh: **25/25 PASS**, exit 0, 4,36 s. Nová regrese zahrnuje 27 kombinací rozběhu, zastavení v různých fázích a restartu po 150 ms, při 30/60/144 Hz, skutečné near→medium přepnutí a podporu do 3 mm. Samostatná regrese ověřuje krátkou mezeru interpolace a svítilnu bez změny nohou. Původní testy podrážek, švů, váhové palety, všech šesti postav, odvalu, sklonů a schodů zůstávají v platnosti.

Úplný [cílený testovací log](transition-targeted-tests.log) je zachovaný. Sémantická TypeScript kontrola pouze animace, tří příslušných testovacích souborů, preview a auditního skriptu (s cestami Vite `/client/*` a `/shared/*` mapovanými na skutečné zdroje) prošla s **0 diagnostikami**, exit 0. Runtime SHA256: `5ec9b2b31e1e7f07f28e4c2bad9ba8b0fd7eb22734fccd8f895ff70499d46f7e`. Současně bylo strojově ověřeno, že baseline odpovídá původní animaci kromě umístění type-importů a že výsledný audit odpovídá tomuto runtime SHA.

## Praktická kontrola a omezení

[Existující náhled](preview.html) nyní srovnává vlevo aktuální O2 baseline `animation-o2.ts` a vpravo produkční opravu. Kopie O2 mění pouze relativní type-importy kvůli svému umístění. Starší `animation-before.ts` a historické důkazy jsou zachovány, ale nejsou baseline této opravy.

Kontrola: Alex → Profil → Rozběh a zastavení → 25 % → Vrátit sekvenci na začátek. Potom Krátké rozběhy, Chůze → běh, near/medium, Eli a Sam, svah a schody. Pause a Jeden snímek umožní porovnat kotník, koleno a oporu při přechodech. Otáčení nyní mění skutečnou trasu, nejen natočení těla. DOM obsahuje GPU identitu, CSS i interní rozlišení, detail, rychlost přehrávání, chyby textur/shaderů a skutečné měřené rychlosti chůze. `pagehide` zastaví render loop a uvolní oba LODy/rigy/pool/scénu/engine; návrat BFCache znovu vytvoří stránku.

**GPU/obrazové posouzení této změny zatím neproběhlo.** Provádí ho hlavní úkol po koordinaci uživatelského benchmarku. Náhled je kinematické QA, bez celé hry, sítě a fyziky; není dokladem 60 FPS ani důkazem konečné přirozenosti pohybu. Animace nadále používá procedurální IK, nikoli mocap. Velmi prudké změny směru, neznámé vzdálené schody a všechny možné kolize nejsou touto úzkou opravou prohlášeny za vyřešené.
