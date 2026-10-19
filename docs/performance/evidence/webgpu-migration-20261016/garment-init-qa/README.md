# Méně opakovaných průchodů scénou při vytváření oblečení

19. 10. 2026. Oprava je v **main `145cbe952d6bfa1a5b3d51852e7b637a7fb02ee3`** (WT `089964296a6fc677ea41e83db3f6e602d6ca6bf5`). Přijato je dávkování počáteční konfigurace nového materiálu. Celkové FPS, zbývající záseky, KEY-31/32 a přepnutí výchozího rendereru zůstávají otevřené.

## Příčina a volba řešení

Produkční CPU profil `uv-dirty-profile/` zachytil řetězec Material dirty → decorator setter → `avatar-garments.materialFor` → install → createAvatar → TransitRenderer.update. UV identity notifikace v tom průjezdu nenastala. Stack prokazuje volaný řetězec, nikoli jeho podíl na celém záseku.

`materialFor` při cache miss vytvořil nový PBR materiál a nastavoval jeho vlastnosti jednotlivě. Dirty settery opakovaně procházejí již existující scene/submesh/pass wrappers, přestože nový materiál zatím nemá vlastní zveřejněné meshe. Oprava obaluje **stejné settery ve stejném pořadí** veřejným `atomicMaterialsUpdate`, ještě před vlastním zápisem do cache a přiřazením meshům. Textury, barvy, sheen, metadata, geometrie, cache hit, počty vlastníků a disposal zůstávají stejné.

Podle [připnutého zdroje Babylon9.30](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/material.pure.ts) veřejná metoda obnovuje dirty mechanismus ve `finally`; jeho obnovení volá `markDirty(false)`. Použití je zde omezené na nový materiál bez zkompilovaných vlastních submesh defines. Není to obecná náhrada úplné invalidace již používaných materiálů. Současné projektové scene-added observery nevytvářejí synchronně vlastní zkompilované meshe před tímto blokem.

Zamítnuté alternativy: globální blokování scény by umlčovalo i cizí aktualizace; další cache by měnila paměť a refcount; indexování v SDK vyžaduje širší render-pass/MultiMaterial lifecycle. Veřejné dávkování je nejmenší zásah do doložené cesty. `helper/RESEARCH.md.gz` uvádí celý průzkum.

## Co je skutečně změřené

Actual Babylon reproduktor ve stejné scéně s16 cizími meshi a skutečnými draw wrappers ověřil všech šest presetů:

| Kontrola | Původní | Oprava |
| --- | ---: | ---: |
| Volání cizích getMaterial při instalaci dvou materiálů |352|32|
| Volání při cache hit |0|0|
| Konečné materiály/textury/metadata/geometrie |shodné|shodné|

Oprava ponechává jeden závěrečný průchod na nový materiál místo jedenácti. Je to důkaz **menšího množství CPU práce v této funkci**, nikoli procentní zrychlení celé hry nebo GPU. Red originál selže na traversal regresi; green projde. A/P reporty pro6presetů mají stejné konečné hodnoty a potvrzují sdílení near/medium i dalších rigů, poslední uvolnění právě jednou, zachování rodinných map a nové vytvoření materiálu. Přenositelný běžný `.test.ts` prošel2/2 bez env či QA loaderu a je součástí runtime commitu.

První helper assembler nezvládl rozdílné LF/CRLF a vyrobil prázdný config blok. Tento early payload root nepřevzal ani nebuiltnul; je zachovaný jako odmítnutý incident. Následné import/classidentity neúspěchy fixture jsou rovněž oddělené od finálního důkazu. Finální runtime `068dc194…`, test `a8817fe6…`, manifest SHA `d1c36201247f87a008584879bd5785b0e75672ff2004e7a50124bc29014fd63b` mají ověřený přesný inverse a zachované ordered statements. Neúspěšné pokusy se nezapočítávají jako přijetí.

## Úplné checkpointy a produkční kontrola

- Clean source `06754993e63049552768a7114f7a7fb8233cae0c2770a23336e9e071df8bc220`,582 souborů včetně testů: **1474/1474**, full TypeScript/pnpm build a4 izolované integrační scénáře PASS.
- Known combined source `c29a7da7dd9e66024a8ae59db803ef1b0e16a74d62ab0e533d8ac2821c49fe58`,595 souborů: **1534/1534**, full TypeScript/pnpm build a4 integrace PASS.
- Předchozí cílený QA běh8/8, typy a minifikovaný build PASS. Instalované frozen SDWf8/MD3cc/f27 dependencies beze změny, app/loaders používají jediný fyzický core. Pro změnu aplikace nebyl opakován package install.
- Nezávislé review runtime, přenosné regrese a sestavení checkpointů bez nálezů. Explicitní staging pouze2 souborů;133 cizích pracovních cest v rootu i main zachováno, výsledné stromy shodné a indexy prázdné.

Skutečný Edge na GTX1060/driver582.28 ověřil **combinedc29**: všech6 hotových předloh editoru se zobrazeným oblečením, postavu v denní hře, první noční nástup/jízdu a návrat do hotového editoru bez reloadu. Uloženo11 obrazů, selected/ready metadata a public benchmark. Žádné render/asset/browser errors, health valid/pending0. To je omezená obrazová a funkční kontrola; přesné pixelové A/B ani celá lifecycle/multiplayer přejímka se netvrdí.

Průjezd: Medium CSS/render2040×986, Alex,1 skutečná relace, noc1792447200000; session `b6e89a6c-a5fb-428f-a9e2-017d83ad95ee`,809 souvislých seq0–808, UI/raw1:1, potvrzené auto a pozorované minimum89,6m. Během měření žádné jiné testy, snímky ani další 3D scéna. **38,4FPS, p95 34,5ms, p99 183,4ms, max303,2ms,6 intervalů≥100ms;9 nových programů/18 modulů/10 sync pipeline.** Provoz0busy/8simulovanýchpasažérů/1auto, GPU83→84°C a1797→1569MHz. Předem editor6presetů, D550 setup, ready idle podle raw protokolu. Jiný combined/provoz/takty/teplota oproti předchozím clean či instrumentovaným běhům: **není to FPS A/B a záseky zůstávají**.

Po testu vlastní karta zavřena, viewport reset a pouze vlastní4200/2595 ukončeny přes task/cwd/PID/start/path/command guard.2568 bez listeneru. Hrané snapshoty neměnné. Nová [verze4202](http://127.0.0.1:4202/?renderBackend=webgpu) servíruje samostatnou fyzickou kopii tohoto již ověřeného combined buildu; HTTP/source a21 codeSHA jsou v sousedním `garment-user-build-4202/`. Její serve claim zůstává aktivní.

`artifact-manifest.json` uvádí původní i komprimované SHA256 a velikosti raw logů, testů, zdrojů, helper incidentů, obrazů a integračního receiptu. Nejsou přibalené živé PID ani1,3GB distribuce. `docs/verification.md` nebyl přepsán kvůli cizímu WIP.
