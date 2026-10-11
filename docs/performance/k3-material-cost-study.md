# Lehká kontrola materiálových nákladů K3

Rozsah: pouze čtení benchmarků, JSON hlaviček skutečných runtime GLB a primární implementace Babylon 9.30.0. Nebyla spuštěna rekonstrukce scény, Blender, test ani prohlížeč; během GPU měření nevznikla změna produkčního kódu.

K3 snapshot `e91aa84ec7d77949b2db706091fa66c603777faa13daa8ed998ff0871b390c9b` při kvalitě low vykazuje v prvních dvou denních single-player měřeních 28,2 FPS, p95 přibližně 49,6/49,3 ms, 1 080 505 indexově počítaných trojúhelníků a 325 draw calls. J měl 1 730 944 a 395 draw calls. Menší indexový součet sám neurčuje úsporu GPU času: odstraněná geometrie patřila převážně levnějšímu depth průchodu 512px shadow mapy; hlavní PBR pohled zůstává podrobně vykreslený.

První K3 má poslední GPU vzorek 31,68 ms oproti J 34,05 ms. `frameWork.cpuMs` je poslední vzorek; jeho hodnotu nelze zaměnit za průměr. Součet průměrných položek `frameBreakdownMs` se naopak zlepšil z 10,83 ms J na 10,01 ms K3, průměr render položky z 9,52 na 8,75 ms. Krátké adaptivní dvousekundové okno vykazuje mírně vyšší CPU průměr 11,26 vs 10,62 ms. Tyto různé statistiky nedokládají jedinou trvalou CPU regresi.

## Transmission/refraction nebylo nalezeno

Audit `.cache/render-cost-study/runtime-material-headers.mjs` čte pouze JSON chunky 23 skutečných načítaných GLB:

- 17 modelů z kombinovaného B6/furniture manifestu;
- tři car LOD;
- oba autobusové modely;
- bootstrap vegetace.

Výsledek `.cache/render-cost-study/runtime-material-headers.json` obsahuje URL, délku GLB, délku a SHA-256 samotného JSON chunku a vlastnosti materiálů. SHA JSON chunku není hash celého GLB. V žádném není `KHR_materials_transmission`, volume nebo jiná refraction extension. Jedinou extension používají auta: `KHR_materials_clearcoat`.

Babylon `KHR_materials_transmission.pure.js` vytváří `TransmissionHelper` pouze při kladné transmission weight. Tato cesta se z těchto runtime GLB neaktivuje. V klientovi nebylo nalezeno ruční zapnutí refraction, SSR nebo prepass rendereru. Low `CinematicAtmosphere.configure` odstraňuje postprocessing pipeline; odrazová obloha je aktualizovaná malá raw cube textura, nikoli dodatečný render celé scény. Jde o kontrolu zdroje, nikoli runtime GPU pass capture.

## Konkrétní nulová clearcoat větev

Na všech třech automobilech mají materiály **black, chrome, interior, rubber a steel** extension s `clearcoatRoughnessFactor`, ale bez `clearcoatFactor`. Podle loaderu je jejich faktor přesně nula. Přesto:

1. `KHR_materials_clearcoat.pure.js` vždy volá `adapter.configureCoat()` a při chybějícím faktoru nastavuje weight 0.
2. `pbrMaterialLoadingAdapter.js` zapíná `clearCoat.isEnabled = true` jak v configure, tak při nastavení weight.
3. `pbrClearCoatConfiguration.js` zapíná shader define `CLEARCOAT` pouze podle `isEnabled`, nikoli podle nulové intensity.
4. `pbrBlockClearcoat.js` před násobením runtime intensity provádí další BRDF lookup, výpočet odrazového směru a sample reflection texture. Nulová uniform hodnota není compile-time konstanta.

Malý kandidát bez snížení geometrie nebo kladného coat vzhledu: po skutečném loadu deaktivovat clearcoat pouze u materiálu s přesnou nulovou intensity a bez coat textur. Kladný lak 0,55, lens 0,3/0,5 a sklo 0,15 zachovat. Asset/master není třeba přepisovat. Zisk zatím není změřený a tato kontrola nedokazuje, že nulový coat vysvětluje celý zbývající GPU čas.

## Pořadí opaque ploch může zvýšit fragment overdraw

`art-lighting.ts` zavádí vlastní opaque comparator kvůli prvnímu vykreslení sky. Pro libovolné dvě jiné submeshe vrací 0, což zachovává insertion order. `buildWorld` vytváří nejprve terrain, pak landcover a pavement a teprve potom budovy. PBR plochy země se tak mohou vybarvit dříve než jejich budoucí occludery. Výsledný obraz může být správný i při několika zbytečných shader vyhodnoceních stejného pixelu.

Kandidát k řízenému GPU A/B: zachovat sky pravidlo a pro ostatní opaque použít promyšlené front-to-back pořadí. Babylonův `RenderingGroup.frontToBackSortCompare` se nesmí pouze vložit jako náhrada: v 9.30.0 `_RenderSorted` předpočítává `_distanceToCamera` pouze pro transparentní frontu. U opaque by se musela použít správná skutečná vzdálenost a zohlednit velké sloučené plochy i hardware instancing. Druhá možnost je prostorové dělení přesných source trojúhelníků, popsané v J cost study. Zatím nejde o implementovanou ani změřenou optimalizaci.

## Steady dirty sync nebyl prokázán

Současný source proxy má receiver flag i metadata false. `AbstractMesh.receiveShadows` má equality guard a při nezměněné hodnotě neoznačí submeshe znovu za light-dirty. Běžné instance dědí stejnou hodnotu ze source; opravený cold smoke je bez opakovaných warningů. `Light.intensity` je prosté serializované pole a jeho průběžná změna sama nevolá resync všech meshů. `CarPack.setQuality` i `updateLighting` mají steady guard. Průměr environment položky je K3 přibližně 0,50 ms, tedy obdobný J.

Další rozhodnutí má vycházet ze samostatného A/B měření jedné změny se stejnou kamerou, okamžikem, backendem, rozlišením a počtem relací. Hodnoty výše neprokazují fragment overdraw měřený GPU čítačem, chybné LOD ani skryté refraction RTT.
