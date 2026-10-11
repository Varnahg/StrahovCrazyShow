# Povrchy a skutečné styky komunikací

Aktualizace 10. 10. 2026. Tato část doplňuje původní čtyři materiálové rodiny. Nejde o nové náhodné pásy silnic nebo zvýšené obruby: rozložení nadále pochází ze společných polygonů `shared/data/streets.json` a výšky z rozšířeného DMR 5G.

## Průzkum a doložení

Před implementací byly přímo prohlédnuté nezmenšené severozápadní a jihozápadní výřezy [IPR ortofota z 8. 6. 2024](../../streets/strahov-ortho-2024.jpg). Ukazují souvislé asfaltové komunikace a parkovací dvory, užší odlišné pěší pásy, diagonály mezi bloky a skutečné styky těchto ploch. Snímky samy neurčují přesnou výšku obrub ani druh každé dlaždice. Souřadnice, datum, licence CC BY 4.0 a SHA podkladu jsou v [georeferenci](../../streets/ortho-georeference.json).

Jemný povrch je určen tagem OSM tam, kde existuje. `surfaceProvenance=class-inferred-not-measured` dál označuje původní odhad podle typu komunikace. Tento odhad není novou texturou povýšen na zaměření. B6/007/R-ko panoramatické předlohy a data snímkování zůstávají v [panoramatickém průzkumu](../../world-architecture/panorama-survey.json). V této aktualizaci nebylo dostupné připojení k prohlížeči subtasku, takže další prohlídka živých panoramat ani nová tvrzení o výškách obrub nejsou vydávána za provedené.

Aktuální síť pochází z dnešního oficiálního OSM API výřezu s hranicemi x −500 až 440 m, z −270 až 340 m. Má 380 zdrojových úseků a 19 parkovacích ploch. Původní ortofoto pokrývá menší centrální část; jeho fotografické doložení se automaticky nepřenáší na rozšíření mapy. Materiálové hrany se vždy generují z právě načtených společných polygonů.

## Materiály

| Herní třída           | Původní CC0 rodina                                         | Opakování   | Co je doložené / odhad                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asfalt                | [Asphalt033](https://ambientcg.com/a/Asphalt033)           | 2,5 × 2,5 m | Přibližný rozměr uvádí poskytovatel; konkrétní opotřebení Strahova není skenované.                                                                                                      |
| Čtvercová pěší dlažba | [PavingStones112](https://ambientcg.com/a/PavingStones112) | 2,4 × 2,4 m | Vizuálně zkontrolované šedé čtvercové desky. Poskytovatel rozměr neuvádí. Pět dlaždic na opakování dává přibližně 48 cm; jde o výtvarné měřítko, nikoli zaměřenou dlaždici na kolejích. |
| Kamenná dlažba / sett | [PavingStones036](https://ambientcg.com/a/PavingStones036) | 2 × 2 m     | Vizuálně zkontrolované menší kamenné bloky s přirozenými spárami. Rozměr a stupeň zvětrání jsou reprezentativní odhad, ne inventář údržby areálu.                                       |
| Nezpevněný povrch     | [Gravel012](https://ambientcg.com/a/Gravel012)             | 2 × 2 m     | Vizuálně zkontrolované kamenivo a zhutněný podklad. OSM agreguje gravel/compacted/ground; nejsou předstírané samostatně zaměřené směsi.                                                 |

Nové tři rodiny mají 1K původní **color, NormalGL a roughness** JPG. Nevznikla upravená kopie Google/Mapy/ČVUT snímku. Celá sada má sedm rodin a 21 originálních kanálů; licence CC0, zdrojové archivy, metadata SHA, data importu a přesné označení odhadovaného měřítka jsou v `public/textures/surfaces/manifest.json`.

Původní renderer kreslil jednoduchou mřížku do 128px textury a na dlažbu i kostky aplikoval normálu hladkého betonu. Nyní albedo, normála a roughness pocházejí ze stejné příslušné rodiny. PBR materiály se vytvářejí odděleně od ostatních objektů stejné paletové barvy. Fasádní atlasy a okenní masky se nadále nepřepisují. Výslovné `preserveAuthoredPavingJoints=true` zůstává pro záměrně autorský povrch, běžné mapované cesty používají originální PBR mapy.

Déšť mírně ztmavuje asfalt, dlažbu a kámen a snižuje jejich roughness. Tráva a nezpevněný podklad reagují méně leskle. Suchý odstín se uchovává samostatně a po skončení deště se přesně obnoví; každým snímkem se nezačíná od bílé. Nejde o simulaci louží nebo odvodnění. Normálové mapy nemění fyzické kolize.

## Návaznosti

`streetTransitionSegments()` vytvoří 16m prostorový index **hraničních segmentů**. Porovnává jen blízké hrany různých materiálů, ověřuje kolinearitu, skutečný délkový překryv a materiály na obou stranách. Tolerance 20 mm odpovídá milimetrovému JSON a 12mm offline GIS simplifikaci; nepřeklenuje travnaté pásy. Souvislé intervaly se spojí, stejné hrany se neduplikují. Další kontrola vyřadí nejednoznačné malé GIS zbytky.

Výsledkem je 35mm rovinná vizuální spára pouze na doloženém rozhraní dvou povrchových polygonů. Neobjeví se mezi pokračujícími asfaltovými úseky, kolem prázdného otvoru budovy ani přes mezeru mezi cestami. Ústí pěší cesty dostane styk jen přes svou skutečnou šířku. Spáry používají stejné `drapeTriangles` a stejné DMR vrcholy jako okolní plocha; jejich milimetrové oddělení slouží pouze depth bufferu. Nepřidávají zvýšený obrubník, schod, blokující kolizi ani novou pochozí trasu.

Aktuální CPU audit má **816 segmentů, 2 965 trojúhelníků a jeden dodatečný mesh**. Výběr trval přibližně 199 ms a sestavení geometrie 207 ms při konkrétním zachyceném běhu. Jde o jednorázovou práci při startu a geometrii, nikoli GPU/FPS měření. Výstup se cachuje pro další scénu. Povrchové meshe stíny přijímají, samy netvoří výškové cast shadows.

Zvýšené obruby vyžadují společný export přesných linií, profilu, výšky a provenience a odpovídající kolize. Současný zdroj nemá dostatečný inventář `kerb` linií; přesné fyzické obruby nejsou tímto výstupem dokončené.

## Ověření a náhled

Sedm materiálových/cinematic testů a pět přechodových testů prošlo. Testy kontrolují odlišné rodiny a shodu jejich kanálů, roughness/gamma, návrat suchého odstínu, obrácené orientace hran, T křižovatku, prázdné otvory, stejné materiály, mezery, determinismus skutečné rozšířené sítě, kopírování DMR a trojúhelníky mimo budovy. Hash zdrojů a CPU geometrie jsou v `street-audit.json`; starší `browser-qa.json` se vztahuje k původnímu snapshotu se čtyřmi rodinami.

[Nový GPU kontrolní náhled](http://127.0.0.1:5173/docs/reality-pack/materials/street-preview.html) vybírá skutečné hrany z aktuální sítě. Má denní materiálový režim, skutečný čas a výslovně demonstrační mokrý přepínač. Diagnostika uvádí načtené kanály, source SHA, DMR, GPU a CSS/interní rozlišení. Náhled ukazuje terén, povrchy a svítidla; není kontrolou fasád nebo měřením FPS celé produkční hry.

GPU ověření nové aktualizace čeká na integrační prohlížeč hlavního tasku. Subtask má prázdný Cua inventář a jeho otevření browseru bylo pouze zařazené do fronty skrytého tasku. Starší screenshoty se nepoužívají jako důkaz nových materiálů.

```powershell
pnpm exec tsx --test tests/cinematic.test.ts tests/surface-transitions.test.ts
pnpm exec tsx docs/reality-pack/materials/audit.ts
pnpm exec tsx docs/reality-pack/materials/street-audit.ts
```
