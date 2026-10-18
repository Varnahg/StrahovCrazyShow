# KEY-31: omezené memo má CPU přínos, produkční vlastnictví ještě chybí

18. 10. 2026. Izolovaný experiment s explicitním testovým vlastníkem prokázal zrychlení celého synchronního warm render řetězce. Nezměnil hru, vendor patch, lockfile ani fyzické dependencies. Není to měření FPS ani přijetí produkční cache.

[Report a předání](proof/handoff.md) a [rozhodnutí před implementací](proof/decision.md) zachovávají podmínky i negativní výsledky. Leaf manifest má SHA `a475e6f75f1f511f59ae149cab3749446505eb260145ef871edf95b432e4deae`; nezávislé review skončilo bez nálezů. [Archivní manifest](archive-manifest.json) uchovává 161 ověřených artefaktů včetně původních neúspěchů. Krátký výchozí commit `17bc0c2` z leaf manifestu byl v [root přejímce](define-memo-proof-root-acceptance.json.gz) rozveden na `17bc0c2e595b77194e218f21bd348e9434fda4a4`; původní manifest nebyl přepsán.

## Mechanismus a výsledky

Původní property loop vždy dokončí reads a případné throws. Teprve celý hotový raw text slouží jako klíč FIFO mapy string→string. Ukládají se jen změněné kanonické výsledky; unknown, fallback, již seřazené a nadlimitní vstupy se neukládají. Limit je 64 položek a 262144 kombinovaných UTF-16 code units klíčů a hodnot. To není záruka velikosti heapu. Dispose mapu vyprázdní a další volání použije čistou referenci.

Šest proložených procesů A/M/M/A/A/M, 36 skutečných submeshes, na materiál 48 warm a 48 nezměněných snímků. Mediány celého synchronního budget/order/render řetězce:

| Materiál | Reference A | Memo M | Změna |
|---|---:|---:|---:|
| PBR | 8,74455 ms | 5,57915 ms | −36,20 % |
| Standard | 6,23860 ms | 4,54430 ms | −27,16 % |
| PBR + CampusSurfaceArt | 8,70680 ms | 5,52245 ms | −36,57 % |

Každý memo process median je nižší než každý referenční pro daný materiál. Vnořené scopes se nesčítají. Warm stále provede původních 36 Effect změn, cache hitů, událostí a resetů, s nulou nových programů. Skutečná změna varianty vytvoří jeden program. Nejde o násobitelnou úsporu na každý produkční Effect event.

Smíšený corpus obsahuje 50 baseline stavů deseti materiálových/plugin/regular/thin větví a 28 unikátních textů. Warm full serializer zrychlil z 92,758 na 23,798 µs/volání. Cold znamená vyprázdnění před každým sweepem 50 stavů, tedy 28 misses a 22 hits, nikoli miss-only; výsledek 91,814 → 73,545 µs. Při 129 unikátních variantách a nulových hits se naopak zhoršil z 98,351 na 105,967 µs (**+7,74 %**). Peak byl 44 položek / 262106 code units. Malé unique misses a unknown fallback také přidávají režii.

Actual capture zachoval pořadí 2953 volání, 9 raw textů a 0 omitted. Jde o homogenní fixture, nikoli produkční hitrate. Deterministické pořadí mixed corpus je testové. Původní pořadí neaktivních `_keys` nelze rekonstruovat z define textu.

## Ověření a meze

- Functional **10/10**, reference i memo **18/18** původních regresí.
- Šest warm procesů po **5/5**, šest micro procesů exit 0; **54/54 snapshotů exact** pro WGSL, defines, layout, uniforms, Effect identity, refcounts a lifecycle události.
- Scoped TypeScript **3172 souborů / 0 chyb**; neověřuje JS loader typovým systémem.
- Freeze ověřil **278 přesných kontrol**, včetně 51 vstupů, tří povolených importních adaptací a measured receipts. Shared dependencies zůstaly stejné.
- V1 namespace assertion správně selhala kvůli testovým exportům (5 PASS / 1 FAIL). Controller se přesunul mimo core, assertion zůstala. V1 zdroje i chyby analýzy/freeze jsou zachované.

NullEngine proof má vypnuté stíny. Neověřuje browser driver, GPU paměť, celou scénu, relace, HUD ani produkční startup. Testový owner není engine/device generation a automaticky neopravňuje modulovou cache.

## Navazující QA rozhodnutí

[Výzkum vlastnictví](engine-memo-ownership-research.md) vybral explicitní interní adapter pro PBR a Standard callsites, které znají engine. Veřejné `toString()` zůstane čisté; custom metody dostanou původní receiver a nula argumentů. Soukromý owner musí být vázaný na konkrétní engine/device, vyprázdnit se při loss/dispose a odmítnout zastaralý callback či reentry lease. Factory používá `doNotHandleContextLost:true`, proto samotné engine observables nestačí. Jde o samostatný izolovaný task `webgpu-define-memo-owner-qa-20261018`, dosud nepřijatý runtime.

[Rozbor ustáleného B6](steady-b6-selection-research.md) odděluje cenu výběru objektů od 823 main draws. Existující `staticFrustum` se teprve porovnává na nezměněném V6; tento archiv neobsahuje jeho pozdější GPU výsledky. Hrané verze i native/main renderer zůstávají stejné. KEY-31, výchozí WebGPU a migrační cíl jsou otevřené.
