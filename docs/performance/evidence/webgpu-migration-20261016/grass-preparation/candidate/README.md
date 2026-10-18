# KEY-31: příprava skutečné FAR trávy před hraním

18. 10. 2026. Navazuje na [CPU proof](../README.md). Cíl je odstranit jednu doloženou kompilaci během první jízdy, nikoli prohlásit celou migraci či všechny záseky za dokončené.

## Mechanismus a rozhodnutí

Ready textury ani neinstancovaný source mesh nepřipravily skutečnou thin-instance variantu. Matrix a `photoGrassFade` atributy vznikají až při flush nenulového batch. Ve spawn scéně žádný takový batch není. CPU proof současně prokázal, že okamžité zahození pomocného mesh uvolní poslední Effect při odloženém úklidu, a že obyčejný clone sdílí Geometry a mohl by přepsat živé instance buffery.

Zvolen je jeden vlastněný FAR batch s `makeGeometryUnique()`, skutečným počtem 1, fade 0 a vlastním wind stavem. Aktivuje se jen v již existujících WebGPU přípravných etapách a kvalitách; po přípravě se vypne. PhotographicGrass jej drží do výměny resources či dispose a uvolní před starými resources. Nemění live roots, selection, statistiky, actor, fyziku, síť ani kameru. Není přidaná cache mapa, frame observer nebo práce v běžné frame smyčce.

Cena není nulová: jeden mesh, unique FAR Geometry a držené draw/effect vazby; minimálně 64 matrix/fade položek = 5120 B CPU typed arrays plus odpovídající GPU data a režie. Počet přípravných etap zůstává 41 a limity 30 s na průchod / 90 s celkem. WebGL helper nepoužívá.

## Produkční pilot A1 / B1 / A2

Edge, Nvidia Pascal, WebGPU compatibility, jedna skutečná relace Alex, celý svět s HUD. Low 77 %, interní 1175×500, noční preview `1792360800000`, řízené počasí. CSS A1 1528×651, B1/A2 1528×650. Vstup do auta, W 8 s, ruční brzda 2,5 s; žádná souběžná těžká kontrola. Konce trajektorií nejsou přesně shodné, proto souhrnné FPS není čistý izolovaný efekt změny.

| První jízda | A1 | B1 | A2 |
|---|---:|---:|---:|
| FPS | 45,7 | 48,2 | 42,2 |
| p95 / p99 ms | 21,3 / 189 | 20,8 / 34,2 | 27,2 / 188,4 |
| Maximum ms | 829,3 | 728,8 | 895,8 |
| Nové programy: vstup / FAR / světla 3→2 | 3 / 1 / 4 | 3 / 0 / 3 | 3 / 1 / 4 |
| Nové moduly / sync pipeline | 16 / 21 | 12 / 19 | 16 / 21 |
| Lighting příprava s | 44,842 | 47,029 | 46,466 |
| Vstup→ready s | 60,921 | 65,041 | 63,788 |

Kontroly A1/A2 mají při první trávě nový program varianty `50786aba:3525` (`photographic leaves · shared flat PBR`) a mezery 78,3+189 / 84,6+188,4 ms. A2 seq1419: CPU 80,7/render 75,7 ms; seq1423 potvrzuje 384 FAR instancí / 8448 trojúhelníků.

B1: mezi contextAt105455,1 (0 instancí) a106465,2 ms již vzniká 1536 instancí / 33792 trojúhelníků, tedy 22 na instanci. Souvislý úsek103399,7→107356,9 ms má **nulu nových programů**; okna kolem první trávy mají maximum 22,3 a25 ms. Přesný hash této varianty se do omezených hitch detailů B1 nedostal. Důkaz je skutečný FAR draw bez nové kompilace, nikoli samotná absence hashe v omezeném seznamu.

Všechny běhy mají 41 kompletních etap (13+13+15), health ready/valid na obou koncích benchmarku, pending0 a render/asset errors0. B1 přidává jeden registrovaný mesh a jednu geometrii; materiálů je stále222. Helper není v úplném aktivním inventáři255meshů (`detailsOmitted=0`), běžný FAR batch ano. Snímek ukazuje normální noční scénu s autem, světly a HUD. To nedokládá úplnou obrazovou přejímku všech LOD a kvalit.

**Omezení:** v B1 zůstaly 3 programy při vstupu a3 při změně světel, následné mezery728,8 a668,4 ms. Druhý odstraněný program při3→2 současná omezená evidence přesně nepřiřazuje. Následná mezera není změřený GPU čas. Jeden B mezi dvěma A není finální benchmark migrace. Startup má dodatečnou cenu; uživatel upřednostňuje plynulost hraní.

## Implementace, review a ověření

Šest souborů: Game aktivace a revision/cleanup, PhotoGrassPreparation helper, PhotographicGrass lifecycle, Vegetation delegace a dva testové soubory. Native pět souborů je byte-exact copied V2; přípravná metoda Game je exact V2 a její inverse obnoví celý původní native soubor. Původní combined rozdíly jsou zachované.

V1 prošla cílenými28/28 a souvisejícími5/5, ale full TypeScript odhalil TS2769 v novém testu: DataArray může být ArrayBuffer. V2 jedinou změnou explicitně ověřuje Float32Array před Array.from a zachovává hodnotové assertion. V2 owner7/7; nativní přenos owner7/7 + related5/5 bez skipů. Nezávislé review původního owneru, Game wiring i finálního native přenosu bez konkrétní vady. CPU fixture používá explicitní NullEngine thin capability a syntetické TextureIO; nejde o WGSL/pixel důkaz.

Clean snapshot `8cf63e20cdf754648e48ba845031902da1cce5b3135fc9f453f65b88839f40ef`; combined/GPU snapshot `4a968ff7e2fe262bd2dec98bd771f705eb7682418e2dd975f8bf33ae436bee61`. Clean: 1403/1403 testů, combined: 1463/1463, žádné skipy; oba úplný TypeScript/build a izolovaná integrace PASS. Runtime commit `213a887a4a31f88eb346f4268543ed3891ed9b72` → main `cb236094bf1679a6dd735a7dfe73dea7233816c8`. Integrátor zachoval jeden cizí Game překryv a133 dalších pracovních cest. Před i po každé fázi ověřeny celé source/test a připnuté dependency bajty; sdílená metadata beze změny. Hrané4197/4196/4195 a starší snapshoty beze změny.

## Evidence

- [Strojový souhrn](pilot-summary.json), tři benchmarky, celé session a screenshoty v `runs/`.
- [Manifest archivace](initial-archive-manifest.json) uvádí původní i uložené SHA; velké JSON/logy jsou gzip.
- `copied/`: V2 manifest, handoff a dotčený rerun; `native/`: přesný přenos, vstupy a cílené výsledky.
- `validation/`: zachované V1 selhání, V2 build a oba úplné source manifesty včetně testů.

Přijímá se jen příprava FAR trávy. KEY-31 a migrační cíl zůstávají otevřené.
