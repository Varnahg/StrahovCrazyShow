# Zadání: od textu k hezkému 3D modelu a animaci

Uživatel chce vytvářet i původní vymyšlené objekty a postavy bez skutečné předlohy a ovládat tvorbu jejich animací textem. Meshy je příklad kandidáta, nikoli předem vybraný vítěz. Součástí je editovatelný Blender soubor a použitelnost ve hře, současně další výkonová analýza v samostatném tasku.

## Rozhodnutí a požadavky

Vybrat vhodná **celá workflow podle druhu výsledku**, nikoli prohlásit jeden modelový generátor za univerzální animátor. Tři rozhodovací situace: stylizovaná humanoidní postava; původní nehumanoidní tvor s neobvyklými končetinami; neživý objekt s rigidním/kloubovým pohybem nebo deformací. Příklad animací je chůze a gesto, pohyb šestinohého tvora a rozložení fiktivního mechanického předmětu.

Pevné brány: skutečná 3D geometrie a animace, nikoli jen video; doložený export/import do Blenderu; možnost opravit materiály, rig a keyframes; jasná licence a podmínky relevantního tarifu. Modelování podle reálné předlohy není podmínkou. Chybějící rozpočet řešíme výzkumem bez placeného generování nebo instalací, nikoli předpokladem neomezených kreditů.

Pracovní preference pro srovnání: vizuální kvalita a umělecká kontrola35 %, textové ovládání animace a skutečné pokrytí daného typu25 %, editovatelnost a interoperabilita20 %, čas/ruční opravy10 %, cena/soukromí/odchod10 %. Váhy jsou transparentní pracovní předpoklad; nejde o měřenou kvalitu. Výsledky se posuzují samostatně pro každý typ objektu. Nedostatek veřejného důkazu se nevyplňuje vymyšleným skóre.

## Plán a hranice

Technický výzkum, select/explore kombinace, breadth-first: tři oddělené dimenze geometry, motion a Blender/LLM. Standard: tři výzkumníci, nejvýše8 skutečně přečtených zdrojů za dimenzi/kolo, nejvýše2 kola; zastavení po pokrytí nebo vyčerpání nových důkazů. Očekávání30–60 minut podle dostupnosti primárních zdrojů; rozpory a nedoložená tvrzení mají přednost před rozšiřováním seznamu nástrojů. Normal verification, red-team vypnutý; nezávislá sémantická kontrola zásadních citací a doc review na závěr. Zdrojové plochy: dostupné web nástroje, oficiální produktové/API dokumentace, ceníky/podmínky, Blender dokumentace a originální veřejné repozitáře/papers. Žádný externí výzkumný účet ani nový chat není potřeba.

Plán vychází z výslovně zadaného pokračujícího cíle a jeho právě potvrzeného upřesnění. Projektová policy dovoluje navázat autonomně; nevyžadujeme opětovné schválení běžného výzkumu. Tvrzení vendorů o kvalitě z galerie zůstávají vendor tvrzení, dokud není srovnatelný praktický pilot. Kompatibilitu, cenu, komerční práva a privátnost ověřit k datu přístupu; mezery přiznat. Technická fakta jen z primárních zdrojů. Přímý upload neveřejných projektových podkladů ani API klíčů není součástí výzkumu.

Výstupy: průběžné citované digests, stručný report, porovnání a konkrétní doporučená workflow, cena a práce na jednom použitém výsledku místo pouhé ceny pokusu, pilotní plán s estetickou i technickou přejímkou, integrační audit současného projektu oddělený od externích tvrzení. Nenárokovat testování exportu nebo FPS, pokud neproběhlo.

## Oddělená výkonová práce

Navázat na koordinátora KEY-53 a skutečné main c3454da4. Jeho úplná baseline f3b5b5c0… má8557 souborů, před/po/frozen shodu a12 materializovaných LFS souborů. Původní4654 snapshot s10 autorskými pointery není úplná A/B baseline. Nespouštět souběžné GPU/Blender/build procesy; pro další vlastní praktický pilot nejdřív domluvit potřebné zdroje. Výstupní výkonové doporučení se musí opírat o srovnatelné skutečné profily a uvádět chybějící měření.
