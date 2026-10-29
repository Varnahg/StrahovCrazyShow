# Předání: repair-startup-cause

- Vlastník `repairs-01a13624-startup`, příjemce `/root` / `repairs-01a13624-root`.
- Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: dokončený read-only audit v `docs/performance/repair-startup-cause.md`; runtime ani assety se v tomto tasku neměnily. KEY-8 samotné není opravené, navržené implementace/GPU přejímka pokračují koordinovaně.
- Zapsané soubory: přesně uvedený audit a toto předání. Žádný cizí WIP nepřevzat; původní runtime/logy/checkpointy zachované.

## Hlavní důkazy pro další krok

1. Skutečný production baseline, nikoli dev: UI pokračování s `new Game`5,380s, LoAF5,439s; mode-change→game-ready19,571s. Přesný dílčí podíl buildWorld/Engine/SkyWeather v souhrnném callbacku chybí. Staged world návrh uvádí explicitní job API, cancellation a parity testy a netvrdí, že pár yield mezi obřími funkcemi je hotové řešení.
2. Finální SurfacePack/cinematic/avatar se zakládají až po asset barrier. Skutečné requests jejich textur začínají40,907–40,910s u game-ready40,910s. První frame CPU2887ms, cinematic784,3ms a scene.render2042ms. Připravit finální prezentaci před preloadem je konkrétní kandidát odstranění přechodných variant a sériového odloženého načítání, ne pouhý posun ready markeru.
3. far.glb76 500 488B obsahuje67 850 872B textur (88,7%); dvě2048² RGB16 normal PNG37,83MB. GLB byl v produkčním logu opravdu přenesen za3,603s. Geometrie tvoří8 471 996B bufferViews. Návrh budoucího runtime texture derivátu vyžaduje zachování skutečných GPU texelů/vzhledu a zdrojové provenience, nejde o svévolné ubrání stromů.
4. **Nový glTF loader mechanismus:** instalovaný Babylon9.30 po loadu přepíše maxSimultaneousLights všech existujících materiálů na alespoň `scene.lights.length`, i při vypnutých lampách. Reálný in-memory `LoadAssetContainerAsync` fixture:43registrovaných/2enabled světel, existující Standard/PBR caps `[4,4] → [43,43]`. Není to43 aktivních per-pixel světel; jde o cap/define/variant invalidaci. Root informován, inventory rozšiřuje histogram caps. Static cap4 test bez loaderu tuto runtime vlastnost nedokazuje.
5. Avatar produkční chunk má15 025 561B decoded /4 710 875B encoded, načtený už v menu. Dev53MB JSON se nesmí vydávat za produkční URL. Startup části baseline jsou1280×720, zatímco pozdější benchmark2040×986 není start.

## Podklady a ověření

- Autoritativní baseline/source manifest `f2705e4a74273d443dc2bb79f9be5ffd83efe7f54f54ef150b790c8978831410`, accepted code/config/tests `d3ee76c2eb756a66f992fcd3e1f164c2f48a738932ef0f9603c11671e12a956a`.
- `baseline-session.jsonl` SHA256 `d098f70141cf91c074b67ced1f80d281c6bd1bcd538f52b5045832fea9027326` znovu vypočten. Audit uvádí přesné seq/times, odděluje překrývající se LoAF/frame/resource evidence a nevydává durations cache odpovědí300B za síťový download plných těl.
- Sedm produkčně relevantních zdrojů SHA porovnáno s baseline,7/7 stejné. Minifikované callback positions ověřeny přečtením konkrétních dist chunků, ne odhadem podle jejich názvu.
- GLB JSON, devět unikátních image bufferViews a image header rozměry/bitdepth přečteny bez dekódování/renderu/generování; hash GLB `a378eb7951da498e433d5b4ca2bf3e93b2fb0f8ec740e23c81f746879b94b729`.
- Jediný dynamický experiment byl malý NullEngine loader fixture bez geometrie/textur/serveru. Exit0 v21:54 Praha; všechny vytvořené container/scene/engine zdroje zrušeny. Není to GPU nebo výkonový benchmark.
- `git diff --check -- docs/performance/repair-startup-cause.md`: exit0. Žádné testy celého projektu, build, integration, GPU, Blender ani dlouhožijící procesy spuštěny nebyly. Read-only Node/PowerShell procesy skončily.
- Refaktoring runtime není relevantní pro tento pouze dokumentační task. Implementační návrhy v auditu výslovně vyžadují následný cílený refaktoring/cache/ownership/cancel testy společně se změnou.

## Výstup a stav

- Audit SHA256: **6ECF258BBAF35F8ECADAC573C0A6D89F902E1546F8C88DB36632A625139C534B**. V tomto tasku se žádné testy neměnily; snapshoty podkladů mají svoje testy v původních manifestech.
- Rezervace po odeslání předání uvolněna `release`; žádné procesy či porty se nepředávají.
- Root vybere explicitní navazující scopes pro final preload setup, staged world, glTF cap lifecycle a případné texture deriváty. Záznam neoznačuje všechny startup fáze za diagnostikované ani start za opravený. `docs/verification.md`, Linear stav a integrační test/GPU přejímku vlastní koordinátor.
