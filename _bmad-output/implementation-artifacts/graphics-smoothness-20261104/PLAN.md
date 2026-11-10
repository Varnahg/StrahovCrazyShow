# Rozlišení zbylého stromového CPU záseku

1. Problém: uživatelský záznam má opakované112–529ms post-fetch skripty stromového loaderu; současnáA75 má186ms loader a571ms render při chůzi. Zvlášť existují4–7,5s mezery mimoJS, pro ně není stejná příčina doložená.
2. Mechanismus/hypotéza: synchronní decode/duplicitní finite validace, sezónní callback sort a instalace meshů po await. Raw LoAF neodděluje tyto podfáze.
3. Jediná zkoušená změna tohoto kroku: žádný runtime zásah; oddělené měření stávajících funkcí na přesných crown032/033 MID a malémFAR. První výsledek a7 zahřátých opakování; data načtená před časováním. NullEngine pro skutečnouCPU instalaci, neGPU.
4. Hlavní metrika: decodeMs, standaloneSeasonMs, createPilotMeshesIncludingSeasonMs a součetdecode+create (season se podruhé nepřičítá). Oddělený instrumentovaný sort scope je podmnožinouseason.
5. Správnost: shodnéGLB bajty/SHA a pinované9.30závislosti, žádné render/asset/config změny, samostatnáheavyreservation; všechny mesh/scene/engine po každém případě uklidit. Metadata/časovánínejsougameplay/FPSdůkaz.
6. Přijetí rozhodnutí: vybrat jediný významný opakovatelnýCPU náklad; porovnat counting-sort, lokálníaccessor cache a worker/yield. Pokudprofilnepodpoří zásah, nezaměnit hypotézuzaopravu. Následnáimplementace musí mít byteparitu, stejnéodmítnutí vadnýchdat a relevantníEdgeověření. NejdelšíGPU-process mezery zůstávají samostatnýnevyřešenýproblém.

## Plán praktické kontroly stabilního kandidáta

- Problém: poCPUfixu je třeba ověřit produkčnínačtení/obraz/lifecycle a zachovat podklady pro nezávisléGPU-process mezery.
- Hypotéza: stejné výstupníbajty zachovají scénu a chůze načte novéMID bez asset/render chyb; početnovýchshader/pipeline nelzeodvoditzGPUprocent.
- Jediná runtime změna: privátnídecoderreuse. Existující profileFrameLifecycle=1 je označená instrumentace samostatného pozorování, ne dalšíoptimalizace.
- Metrika: rawdiagnostika/resource completion/health a dva10s benchmarky před/po skutečné chůzi; úplnéDOMreporty mimo měřenýinterval zachovají compilation.start/end a čítače. Serverovýwhitelistcompilationvynechává, proto se nedostatek dat nevyložíjako nula.
- Podmínky: WebGPU CM, Medium, cíl60, CSS1280×720 a zaznamenanýbackbuffer, pevnéday/autumn+QAweather, HUD a2skutečnéSDKneutrálnípeers; žádnételeportace. PředstartemověřitURL/snapshot/fokus; žádnýbuild/test/screenshot/DOMběhemčasovanéhovzorku. Změnykvality nejsoučástítohoto jednorázovéhoověření.
- Přijetí tohotoúzkéhoCPUcelku: validníready, skutečnépost-readyLODnačtení, nepoškozenýobraz a nulovéasset/renderfaults, aktuálnícílené/full/TS/build/SDK. FPSčíslabudoujeninstrumentovanýsamostatnývzorek, nikoliGPUA/Bzisk. Celkovýgameplaygate vyhodnotit zvlášťsnezměněnýmiprahy. Pipeline deltapřed/pochůzi je diagnostika; kladnádelta sama nedokazuje celou4–7,5sdriverpauzu.
- Běh: jedenstart a uloženývýsledek; po selhání nejprvelogy. ManualSTOPpřesstávajícíserveharness po úklidupeerů aGame.dispose, žádnýOSsignal původníhostaréhoLowharnessu.
