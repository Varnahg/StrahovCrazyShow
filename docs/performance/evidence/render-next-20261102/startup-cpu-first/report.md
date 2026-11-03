# První přímé rozlišení CPU přípravy shaderů

Candidate5 doložil významný náklad synchronního WGSL zpracování: **12 227,6 ms při390 dvojicích vertex/fragment** během přípravného scope. Nejde o GPU execution time ani o samotné parsování. Celá hra stále skončila timeoutem Low po31 236,8 ms, ve12. variantě; Game.ready ani FPS přejímka nevznikly.

Snapshoty jsou ze stejné generace1. Oba skutečně prošly klientským privacy filtrem i serverovým uložením. Žádný interval nepřekročil microtask hranici, nebyl nejednoznačný či vynechaný a observerErrors/invalidClocks/generationChanges byly0. Nejvýše jeden kontext byl současně rozpracovaný.

| Měření | Před přípravou | Při ukončení startupu | Rozdíl |
| --- | ---: | ---: | ---: |
| createEffect volání | 2 039 | 11 892 | 9 853 |
| createEffect inkluzivní CPU wall | 329,5 ms | 13 261,9 ms | 12 932,4 ms |
| Synchronní WGSL dvojice | 20 | 410 | 390 |
| Synchronní WGSL CPU wall | 357,2 ms | 12 584,8 ms | 12 227,6 ms |

Řádky CPU se nesčítají. Při načtených Standard/PBR shaderech zahrnuje createEffect také WGSL zpracování; první asynchronní import může WGSL spustit až po návratu createEffect. Proto ani prostý rozdíl obou součtů není přesným rozkladem každého volání. Scope končí při ukončení startupu a obsahuje obnovu nastavení; při budoucím úspěchu by zahrnoval také submitted-frame gate.

Původní plošná fronta odkládala až nativní přípravu pipeline contextu, tedy za tímto WGSL úsekem. Toto měření vysvětluje, proč samotné omezení přísunu modulů neřeší veškeré synchronní blokování. Zbývající čas navíc může být v dalších callback/metodách a dosud nepokrytých GPU API.

Další rozlišení proto měří jednotlivé skutečné WGSL metody (initialize, preProcessShaderCode, postProcessor, finalize). Nepřítomný preProcessor se nevytváří. Ani zbytek mezi jejich časy nebude automaticky nazvaný parsováním: obsahuje také includes, vyhodnocení podmínek, konverzi a callbacky. Cache AST, jiné opakované transformace nebo worker se mohou vybírat až podle těchto podkladů a odpovídajícího profilu.

## Identita a zachovaný neúspěch diagnostiky

Candidate5 source/test SHA `b0c4a119159b67dc38bedd00b7046e37ec76f5bc18f61823f1290740101510f4`, session `4f940985-2499-4ab8-916e-5c469e240573`, bundly game-CZGMiWM9/index-DDg5KF_e. Použitý query`renderBackend=webgpu&profileStartupCpu=1`, výchozí nativní cesta, vypnutý textový inventář. Edge156, GTX1060, CSS1280×720, aktivní vlastní karta a předherní cadence59,9Hz; ostatní vlastní buildy/testy/3D scény neběžely.

Candidate4 source/test SHA `2b196a411f0a9ab1dacdbe06472d564f710753914651100622b02f5939d7f79e`, session `1b26f970-d6f0-4c7a-bd44-c532cc111a76`, selhal také timeoutem. Jeho CPU snapshoty se **ztratily při sanitizaci** pod rezervovaným klíčem`profile`; v raw logu zůstaly jen stage/rendererId. Z tohoto pokusu se nevyvozuje CPU náklad. Zachovaný raw log prokazuje problém, ne zpětně doplněná čísla.

Oprava přejmenovala pouze technické pole na`timing`. Privacy pravidlo zůstalo nedotčené. Regrese použila skutečný profiler s nenulovým7ms čítačem a oba filtry: původní RED, výsledná sada88/88 PASS, TypeScript PASS a neměnný build PASS. Předchozí samostatný profiler měl12/12 cílených testů a produkční build před drobnou opravou transportního pole prošel. Nové GPU spuštění ověřilo přítomnost čítačů v uloženém logu, nikoli dokončení hry.

[Úplné podklady](summary.json) obsahují před/po snapshoty, původní chyby obou pokusů, raw logy, systémové vzorky, build manifesty a cleanup s hashi gzip i původních bajtů. Candidate4 cleanup13:50:29.778UTC a candidate5 cleanup14:03:17.296UTC: inputsRevalidated=true, API ukončené, bez cleanup chyb. Samplery skončily, vlastní karty zavřené a viewport resetovaný. Produkční8080 zůstal zachovaný.
