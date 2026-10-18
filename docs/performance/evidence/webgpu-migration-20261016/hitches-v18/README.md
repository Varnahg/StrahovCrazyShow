# KEY-31: duplicitní Effecty kvůli pořadí defines

18. 10. 2026. **16/16 CPU testů a čtecí review PASS.** V jednom enginu je doložené, že shodné koncové shaderové přepínače v jiném pořadí vytvářejí další Effect. Omezený counterfactual tuto duplicitu odstraní. **GPU/startup přínos ani univerzální kompatibilita libovolných callbacků tím prokázané nejsou; native hra se nemění.**

[Podrobná analýza](analysis.md), [původní handoff](leaf-handoff.md), [leaf manifest](leaf-manifest.json) SHA `96eb1c7cc96c2a97d3c6eccc03d6c82714dcf5401a3b6b234b959ff4a50af355`. [Archivní manifest](archive-manifest.json) ověřuje27 převzatých souborů včetně rozbalených gzip.24vstupů a15předchozích B6proof výstupů zůstalo byte-identických.

## Ověřený mechanismus

Dvě stejně nastavené skutečné materiálové větve sdílejí engine, geometrii a finální S,P,D,H layout, ale light slot3 vznikne před nebo po LIGHTCOUNT/MAXLIGHTCOUNT. Původní cache key obsahuje celý defines string. Baseline vytvoří4programy:3-light, dvě jinak seřazené4-light varianty a skutečnou hodnotovou změnu. Counterfactual vytvoří3, protože identické4-light varianty sdílejí Effect. Hodnotová změna zůstává jiným Effectem.

Deset actual větví: PBR, Standard, CampusSurfaceArt, PhotogrammetryNight, TreeWind, Car regular instancing s instanceColor, PhotoGrass regular a thin s photoGrassFade, Grass thin, StudentHairTint. PhotogrammetryNight je testovaný dostupný plugin; jeho aktivita v produkčním benchmarku není doložená. Malá geometrie ověřuje plugin/attribute cestu, nikoli všechny modely, LOD a avatary.

Používá se skutečný pinned WGSL processor, původní native readiness/draw a layout/binding metadata. Po odebrání pouze přesně zachyceného generated-constant prefixu je veškerý další vertex/fragment text byte-exact shodný; prefix má stejné řádky/hodnoty v jiném pořadí. Attribute/varying, uniform/buffer, texture/sampler, binding metadata a plugin uniform hodnoty souhlasí. Není zde falešná material/Effect readiness. Pipeline frontend je ale stále NullEngine včetně explicitního GPU-only instance unbind no-op, nikoli skutečný driver.

## Konzervativní counterfactual

`canonical-result.ts` nejprve nechá originální toString číst původní hodnoty ve stejném pořadí. Teprve hotový flat block do32768znaků/1024řádků zcela ověří jako unikátní jednoduché ASCII defines s prázdnou boolean hodnotou nebo celým konečným decimal literálem. Potom řádky seřadí podle jména; spelling zůstane. Jakákoli unknown/directive/expression/duplicate/comment/nevhodný linebreak/reserved-name větev vrací byte-identický původní blok. Nejsou změněné `_keys`, clone/reset/equality, getter reads/throw ani pozdější hodnoty; nepřibývá persistentní cache.

Hotový parser neumí odlišit dvě čisté literal definice vzniklé z jedné multiline property od dvou properties. Kontrakt je flat block, nikoli blanket odmítnutí všech multiline hodnot. Číselné strings skutečného PBR0/0.5 jsou podporované. Microbench2000transformací3073znaků trval146,202 ms, průměr73,101 µs; tento lokální CPU údaj se nesmí přepočítat na úsporu startupu nebo FPS.

**Negativní test je podstatný:** vlastní preProcessor rozhodující podle pořadí LIGHT3/LIGHTCOUNT skutečně změní jiný WGSL kód. Syntaktický guard tento hook nerozpozná. Proto proof není doporučením neomezeného globálního Babylon patch pro libovolná rozšíření. Primární kontext: [WGSL scope](https://www.w3.org/TR/WGSL/#declaration-and-scope), [GLSL preprocessing](https://registry.khronos.org/OpenGL/specs/gl/GLSLangSpec.4.60.html#preprocessor); kompatibilitu Babylon hooks dokládá jen konkrétní matrix.

## Zachovaný neúspěšný baseline a další rozhodnutí

`proof-mirror-red.test.ts`/`report-mirror-red.json.gz`/`run-mirror-red.log`: oddělený mirrored car fallback, **0/1 RED při canonical:false**. Po16 skutečných draw má instance/source S,P,D,H, ale camera-pass defines zůstávají LIGHTCOUNT3. Nejde o srovnatelný koncový stav, není započítán do pozitivních větví ani „opraven“ ručním dirty flagem. Není to doložená canonicalizer regrese nebo atribuce produkčního auta; zůstává samostatný neověřený limit.

Zvolen následující **samostatný projektový QA kandidát** `webgpu-define-order-qa-20261018`: fyzicky izolovaná core/loaders kopie a čistá serializační úprava pro doložené současné default processor/plugin cesty, beze změny Game15etap/readiness/timeout. Zatím žádná native integrace. Případný WebGPU-only cache-key zásah je širší změna reuse: potřeboval by disjunktní raw/canonical namespace, eligibility obou stran hitu a lifecycle důkaz; jednoduchý zákaz custom injection callbacku by odmítl i vestavěné PBR/Standard plugin cesty. Proto se tento jiný mechanismus nyní neimplementuje.

Root změří celý vstup, první Golden/F a samostatně B6 prvníF/outward/exit v Edge bez podrobného profileru. Bez přínosu nebo při regresi se kandidát nepřijme. Hrané4193/4192/4188 a cizí WIP zůstávají stejné; KEY-31 a celá migrace otevřené.
