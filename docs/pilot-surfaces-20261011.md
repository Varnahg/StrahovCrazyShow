# Materiály prvního pilotu – 11. 10. 2026

Úprava drží skutečné polohy a velikosti zdrojovaného Strahova. Výtvarným cílem je klidnější současný studentský svět: tmavší neutrální asfalt, světlá dlažba a tlumená zeleň, jejichž drobná kresba nepřebíjí postavy. Filmová inspirace Hogwarts Legacy se vztahuje ke čitelnosti a náladě, nikoli k použití jeho assetů nebo k tvrzení o stejné kvalitě obrazu.

## Průzkum před úpravou

- Hlavní hra vytváří `SurfacePack` v `client/game.ts` po sestavení světa. Zachytává původní explicitně označené `StandardMaterial` z `terrain-renderer`, `streets-renderer`, `vegetation` a oprav země. Barvy, normály a výtvarný plugin už byly společně definované v `client/cinematic-art.ts`; nevzniká konkurenční paleta ani druhý materiálový renderer.
- Existující `PBRMaterial` se nepřepisují. Patří mezi ně samostatná zdrojovaná receptura schodů B6 a vlastní materiály modelů. Historický fotogrammetrický síťový model má vlastní textury; tento pass nepředstírá, že je plošně přebarvuje.
- Byly prohlédnuty původní JPG asfaltu, dlažby a trávy, předchozí skutečný GPU snímek `docs/reality-pack/art-style-evidence/day-high.png` a původní výtvarné zadání `docs/art-direction/ART_DIRECTION.md`. Dlažba obsahuje nápadné bílé drobné skvrny, tráva opakované listy; jejich kontrast lze ztišit bez změny geometrie nebo vymýšlení skutečných oprav cesty.

## Zdroje a původ

Původní assety, SHA-256 jednotlivých map, archivy a datum importu **10. 10. 2026** zůstávají v `shared/data/assets/surfaces-manifest.json`. JPG jsou nezměněné. Textury jsou generické ambientCG materiály pod CC0, nikoli skeny Strahova.

Primární podklady zkontrolované 11. 10. 2026:

- [ambientCG Grass001](https://ambientcg.com/a/Grass001): poskytovatel uvádí procedurální materiál, vydaný 28. 3. 2021, přibližně 1,4 × 1,4 m. Je použit jako rodina zemního povrchu, ne jako důkaz skutečných strahovských rostlin.
- [ambientCG PavingStones112](https://ambientcg.com/view?id=PavingStones112): fotografie povrchu / photogrammetry, vydaná 20. 2. 2022. Stránka neuvádí měřítko. Dosavadní repeat 2,4 m zůstává výslovně výtvarnou aproximací v manifestu.
- [ambientCG Asphalt033](https://ambientcg.com/a/Asphalt033): původní identifikace, hash a rozměr 2,5 m jsou zachované z manifestu importu 10. 10. 2026; nový webový pokus v tomto auditu selhal, proto netvrdíme nové ověření jeho stránky.
- [ČVUT – Exteriéry kolejí Strahov](https://media.cvut.cz/cs/foto/20240620-exteriery-koleji-strahov): Jiří Ryszawy, datum fotografie 20. 6. 2024. Galerie a dříve zdokumentované konkrétní záběry v referenčním atlasu určují typologii a barevnou interpretaci staveb. Tyto fotografie nejsou nově kopírované do hry ani použité jako naměřená odrazivost povrchů.
- [Babylon Material Plugins](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/materialPlugins/): dokumentace hooků a uniformů, ověřeno spolu s instalovanými shaderovými zdroji Babylon **9.30.0**. Nový výpočet používá již existující `vEyePosition`, `vPositionW` a lineární `vAlbedoColor`.

Mapové druhy cest, IPR interpretované plochy a DMR5G výšky se nemění. Tónování, síla normál, kontrast detailu, makrovariace a barvy trsů jsou výtvarné odhady. Nejde o zaměření povrchů, skvrn, oprav nebo obrubníků.

## Integrovaná úprava

Původní metrické UV, gamma/linear rozlišení a roughness mapy zůstávají. Detail albeda se jemně přibližuje vlastnímu průměru zdrojové mapy. Průměr je násoben aktuálním albedem materiálu, takže se i za deště vzdálený povrch ztmaví stejně jako blízký. Zachované autorské spáry mají faktor 1 v celém rozsahu; jejich mapy se k průměru cizí dlažby nemíchají.

| Rodina | Lineární průměr původní mapy RGB | Detail blízko / daleko | Síla normály před → po |
|---|---|---|---|
| Asphalt033 | 0,092028 / 0,082484 / 0,061540 | 0,90 / 0,64 | 0,32 → 0,26 |
| Concrete034 | 0,490326 / 0,490326 / 0,490326 | 0,94 / 0,82 | 0,27 → 0,27 |
| Plaster001 | 0,687218 / 0,661026 / 0,638101 | 0,94 / 0,82 | 0,18 → 0,18 |
| Grass001 | 0,057231 / 0,108110 / 0,018593 | 0,80 / 0,55 | 0,40 → 0,28 |
| PavingStones112 | 0,216666 / 0,219948 / 0,200163 | 0,88 / 0,76 | 0,43 → 0,35 |
| PavingStones036 | 0,299795 / 0,310090 / 0,247003 | 0,88 / 0,76 | 0,48 → 0,40 |
| Gravel012 | 0,262178 / 0,240306 / 0,193940 | 0,82 / 0,64 | 0,35 → 0,29 |

Průměr je výpočet nad existujícími JPG, nikoli fotografické měření areálu: každý osmý pixel od souřadnice 4 v obou osách, 16 384 vzorků pro 1024² mapy, 8 192 pro beton 1024 × 512. Každý sRGB kanál je nejprve převeden `pow(channel / 255, 2.2)`, odpovídající stávající výchozí shaderové konverzi Babylon, a pak zprůměrován. Kontrast plynule přechází od `fineMetres` (3,2–4,8 m) po čtyřnásobek `coarseMetres` (44–68 m), pomocí druhé mocniny skutečné vzdálenosti ke kameře. Není zde skok mezi LOD. Mipmapy stále vybírají frekvenci detailu; úprava sama není další filtrování textury.

Jedna plynulá makrovariace nahrazuje původní dvě oktávy: **4 místo 8 hash výpočtů na fragment**. Nepřibývá žádný sampler, textura, draw call, světlo nebo geometrie. Přibylo míchání detailu a několik uniformových hodnot. Toto je strukturální údaj, **nikoli změřené zrychlení GPU**. Samostatné animované trsy mají menší rozdíl mezi kořenem, špičkou a sousedními trsy; vítr, rozložení, počet a vzdálenost vykreslení se nemění.

## Cílený refaktoring a regrese

`SurfacePack` nyní používá jedinou tabulku aliasů a index manifestu. Kanonická vybraná rodina řídí texturu i mokrou odezvu; dříve například `compacted` použil Gravel012, ale vyhlazoval se jako dlažba, a neznámý override mohl vypnout mokro na platné záložní trávě. Zpětná mapa obnovuje materiály při likvidaci v konstantním vyhledávacím čase a rekurzivně obnoví i vnořené `MultiMaterial`. Převzaté autorské textury se nelikvidují. Klidný snímek beze změny deště/kvality nyní ani nevytváří iterátor materiálů.

Ověřeno cíleně:

```powershell
pnpm exec tsx --test tests/surface-pilot.test.ts tests/cinematic.test.ts tests/cinematic-art.test.ts tests/render-maintenance.test.ts
```

**17/17 PASS**: metrické UV, kanály a nekovová roughness, zachování autorských spár, aliasy a návrat suchých barev na všech třech kvalitách, klidový počet mesh návštěv a material updates, vnořené sdílené materiály, zdroje pluginu a životní cyklus. NullEngine je zde důkaz datové/životní logiky; není důkaz shaderové kompilace, vizuální kvality ani FPS.

## Praktická GPU kontrola v integračním auditu

Koordinuje hlavní agent, aby souběžné scény neznehodnotily měření. V celé produkční hře ověřit B6 vstup a schody, centrální asfalt proti navazující dlažbě a trávě, blízké metrické spáry a vzdálené povrchy za pohybu. Zkontrolovat nízkou/střední/vysokou kvalitu, den/noc a suchý/mokrý stav. Fragmentové efekty převedených povrchů mají obsahovat `campusDetailFade` a úspěšně kompilovat; vlastní PBR modely tuto značku záměrně nemají. Samostatný existující náhled `docs/reality-pack/art-style-preview.html` může pomoci se shaderem, ale neslouží jako výkonový důkaz.

V této dílčí práci neběželo GPU měření, Blender, plná testovací sada, build ani integrace. Jejich konečné skutečné výsledky, zdrojový hash, GPU, obě rozlišení, FPS a p95/p99 patří po stabilním checkpointu do hlavního `docs/verification.md`. Bez tohoto měření nelze tvrdit zvýšení FPS ani srovnání s jinou hrou.
