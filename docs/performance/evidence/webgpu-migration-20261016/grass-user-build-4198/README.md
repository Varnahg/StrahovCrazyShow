# Frozen WebGPU build4198

Samostatná uživatelská verze: http://127.0.0.1:4198/?renderBackend=webgpu, API2593. Source/test snapshot `4a968ff7e2fe262bd2dec98bd771f705eb7682418e2dd975f8bf33ae436bee61`, runtime main `cb236094`; stejné frozen dist/packages jako přijatý grass kandidát,583source/test a17dist souborů. Běžné počasí, žádné HMR, žádný nový copied program-attribution profiler. Hrané4197/4196/4195 a starší verze zůstaly beze změny.

[Runtime a plná validace](../grass-preparation/candidate/README.md): clean1403/combined1463 + oba TypeScript/build/integrace PASS. Tento build zpřístupňuje odstranění prvního FAR shluku; světelné/NPC záseky dosud nejsou opravené.

První pokus byl v neaktivní kartě:30ticks/30s v prvnívehicle etapě, timeout a zobrazená chyba. Původní raw log/snímek zachovány a nevydávají se za úspěch. Po přesunu pouze vlastní4198 do samostatného aktivního okna a reloadu proběhlo41etap complete (lighting64,096s), ready seq438 →dispose923,941záznamů, bez startup/render/asset chyb.

Krátký stacionární smoke:58,1FPS, p9522,5/p9932,2/max38,9ms, CSS1528×650, interní1053×448, automatická low69 %. Nejde o srovnání s předchozími benchmarky ani o průjezdový důkaz. Health na začátku i konci ready/valid/pending0/errors0. Uživatel má kartu v menu, služby běží; procesní PID/rezervace zůstávají pouze v lokálnícache. Snapshot se nebude přestavovat.
