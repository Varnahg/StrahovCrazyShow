# WebGPU: řazení neprůhledných objektů podle materiálu

18. 10. 2026. Uživatel přijal delší načítání a upřednostnil plynulé hraní. Předchozí profil ukázal průběžnou CPU cenu main draw bez nové kompilace. Zvolen jeden izolovaný kandidát: obloha první, ostatní opaque objekty podle materiálu. Původní near-to-far šetří overdraw, ale častěji střídá materiály; hrubé vzdálenostní pásy by přidaly další neověřený parametr. Materiálové řazení bylo nejmenším měřitelným kandidátem. Alpha-test, transparentní a shadow fronty se nemění.

Čisté čtení materiálu respektuje aktuální render pass a native MultiMaterial child. Nevolá SubMesh.getMaterial ani getSubMaterial, které mohou resetovat cache nebo vytvořit default materiál. Comparator nepřidává cache, observables, readiness/LOD dotazy ani změny transformací. Původní near-to-far zůstává pro WebGL2; runtime vybírá novou cestu pouze podle skutečného engine.isWebGPU. Backend default, kvality a vendor patch se tím nemění.

## Zdrojové a CPU důkazy

QA snapshot `dfbf5ce22ef3faf4cf90651439e0852591159bd2916d8d309106dbd377ddc747` mění přesně tři soubory nad kontrolou `205b4dda8028dd20b90dbd75177ba6ebd8d3fcf41d02cd97a8c44c42a6b9d05d`: opaque-sort, ArtLighting callsite a testy. [Manifest](qa-source-manifest.json), [kompozice](qa-composition.json), [přesný patch](qa-proof/candidate.patch), [cílené testy](qa-proof/targeted-01.log), [výzkum variant](qa-proof/analysis.md).

Původní čtyři testy zachované, šest nových skutečných Babylon regresí: 10/10, scoped TS2971/0. Actual PBR render má stejné draws/effects/defines/transforms, ale méně mustRebind. Pokryté MultiMaterial/pass override, nulové vedlejší účinky, alpha/transparent/shadow pořadí a instance/LOD. Full TS/produkční build QA prošel, [záznam](validation/opaque-order-v1-validation.json). Nezávislý review bez blokujících nálezů; GPU overdraw a koplanární obraz nelze odvozovat z NullEngine.

## Produkční Edge pilot A1/B1/A2

Jeden skutečný multiplayer klient Alex, WebGPU compatibility, medium100 %, řízené počasí a denní/noční náhled, bez `profileEnvironment`. A1 má CSS i render1514×644; B1 a A2 shodně1514×643. U startu je poloha identická, u B6 se liší12–17cm. Ambientní auta/NPC a koncové počty drawů se mírně liší. Adaptér se hlásí jako NVIDIA Pascal; přesný model/driver export neurčuje. Žádné souběžné buildy/testy/3D scény; hrané4195 a4193 byly v menu.

| Scénář | A1 kontrola | B1 kandidát | A2 opakovaná kontrola |
|---|---:|---:|---:|
| Start FPS / p95 ms |44,5 /28,2|50,5 /26,1|42,9 /29,3|
| B6 den FPS / p95 ms |26,9 /45,8|33,0 /40,6|21,6 /157,7|
| B6 noc, otevřený report FPS / p95 ms |22,4 /56,5|21,3 /161,9|neprovedeno|
| B6 noc, pouze HUD FPS / p95 ms |neprovedeno|28,6 /46,4|24,1 /52,7|

Main draw v prvním páru: start12,74→10,12ms, B6 den25,62→18,64ms. HUD-only noc A2→B1: main26,77→20,01ms, p99 89,2→63,7ms, maximum99,1→75,4ms; oba0nových modulů/pipeline. To podporuje úsporu hlavní render práce, nikoli dosažení celkového60FPS cíle. Active-mesh cena zůstává přibližně stejná.

Všechny neúspěšné či smíšené výsledky zůstaly zachované. B1 noční report měl18intervalů nad100ms hlavně v první přibližně5s; druhá část už měla maximum52ms. Příčina není prokázaná. UI memoizuje JSON podle výsledku, takže nejde o doložené stringify při každém HUD update; otevřený velký text však může zatěžovat layout/paint/DOM čtení. HUD-only kontrola proto zavřela nastavení a během10s nečetla DOM/AX ani screenshot. Ani vysoké A2 denní p95 se nezamlčuje. Jde o omezený pilot, ne tři finální backend páry či multiplayer přejímku.

První F u B6 stále není vyřešené: A1 maximum2097,3ms a18nových shader modulů/15sync pipeline; B1 maximum1321,3ms a16/14. Různé počty a ambient znemožňují vydávat tento rozdíl za čistý účinek sortingu. Třiquality×13 přípravných stupňů pokrývá spawn pohled; B6 prostorový výběr a nové varianty zůstávají následujícím problémem KEY-31. Runtime přijetí sortingu není uzavření této issue.

## Reprodukovatelnost a omezení

[Souhrnná data](comparison.json) shrnují metriky původních UI exportů, polohy, rozlišení, quality, CPU fáze, ambient a compilation delty. Původní exporty včetně jednotlivých snímkových intervalů jsou v `benchmarks/`; denní/noční screenshoty v `images/`. [Manifest artefaktů](artifact-manifest.json) uvádí jejich SHA.

Souvislé raw session logy mají dokončený start i disposal a0render/asset chyb:

- [A1](runs/a1.jsonl.gz), [souhrn](runs/a1-summary.json), raw SHA `f7a225cd115b1516f7cacd0e859a3d3324e9479e586f422e5ba49bb3cbf6a233`.
- [B1](runs/b1.jsonl.gz), [souhrn](runs/b1-summary.json), raw SHA `a1868245d65c085a7d36a7d40e7ae478a282661bd62f9f8660ab7d6cbf2312d1`.
- [A2](runs/a2.jsonl.gz), [souhrn](runs/a2-summary.json), raw SHA `b6b464e7f9e6ebd272740be409f84612f73a7f7eb11a96e84dd1c23faf22e846`.

Startup60,06 /58,70 /60,31s je přiznaná přijatá cena. Hraná lokální verze4195 zůstala nezměněná. QA4194/API2589 byly po každém běhu ukončené podle identity vlastních procesů. Celkový WebGPU default a funkční/výkonová matrix zůstávají otevřené.

## Runtime přijetí a nový build

Finální změna má navíc skutečný backend gate a dvě actual ArtLighting initializer regrese. [Manifest native důkazů](runtime-proof/manifest.json) uchovává také původní neúspěchy fixture/TS a finální RED1/2→GREEN12/12, related8/8, scopedTS2981/0. Nezávislé review finálních SHA bez nálezů.

- [Čistá validace](validation/opaque-native-v1.json): snapshot `fdf50207c9d3cdd86d8f7f5050d9f273ee99dfa5b2a91f9230e7011180c98ceb`, 1375/1375, fullTS/build/integration PASS, bez skipů.
- [Kombinovaná validace](validation/opaque-combined-v1.json): snapshot `5d247248f50a762877e9079bb4fcd65280e959e8014eb3f65b2662e397c518cb`, 1435/1435, fullTS/build/integration PASS, bez skipů.
- WT `03d4480019366e8586ecc4c94b4541dddecaac0a` → main `a1d954221c1585800f84c1e5dfdb46c3bb36a798`. [Receipt integrace](runtime-main-integration.json): přesně tři soubory, dalších134workingpaths zachováno.

[Nový frozen build4196](http://127.0.0.1:4196/?renderBackend=webgpu), API2591, běžné počasí. [Identita](delivered-build-identity.json), [UI smoke export](delivered-smoke.json), [obraz](delivered-build.png), [raw log](delivered-session.jsonl.gz), [souhrn](delivered-session-summary.json). Skutečný vstup57,83s, jeden Alex, auto medium77 %/interně1164×494 při CSS1514×643:52,1FPS,p9524,4ms,p9927,5ms, healthvalid/pending0/chyby0. Tento smoke není matched performance pár. Vlastní hráč odešel do menu, služby a uživatelská karta zůstávají dostupné;4195 a starší buildy se nemění. KEY-31 a migrační cíl zůstávají aktivní.
