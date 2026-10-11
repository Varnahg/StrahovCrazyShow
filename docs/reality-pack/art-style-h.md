# Strahov: střídmá filmová stylizace H

Cíl: poznat Strahov podle dispozic, architektury a členění povrchů; materiály mají čitelnou strukturu a hloubku jako v současné adventuře. Inspirace filmovou atmosférou není přebírání materiálů, modelů, názvů ani výtvarných děl z Hogwarts Legacy.

## Co je skutečně implementováno

- `client/cinematic-art.ts` sjednocuje výtvarné nastavení. ACES zůstává jediné tónování Standard/PBR materiálů, přidané jsou jemně teplé světlé části a chladnější stíny. Sytost je celkově snížena o 6 bodů; jde o výtvarný záměr, nikoli měření barev v areálu. Úsporná a vysoká kvalita sdílejí stejný grade.
- `client/surface-pack.ts` zachovává původní 1K CC0 kanály ambientCG, jejich deklarovanou gamma/linear interpretaci, fyzické UV měřítko i mapy drsnosti. Neutrálnější asfalt se odlišuje od světlejší dlažby a betonu; tráva má tlumenější žlutozelený tón. Autorské spáry dlažby i jejich původní barevný násobitel se zachovávají.
- PBR plugin přidává plynulé, stabilní rozdíly barvy a drsnosti v měřítku přibližně 3–17 m. Nejsou to údajně skutečné opravy vozovky. Neobsahují auta, stíny, stromové koruny nebo náhodné objekty z ortofota. Není zde displacement ani změna kolizí či výšek. Barva se liší maximálně přibližně ±10 % (tráva) nebo ±6,5 % (asfalt), drsnost asfaltu přibližně ±0,0275.
- Variace jsou spojité ve světových souřadnicích. Nevzniká znovu jiný náhodný vzor po načtení, pohybu kamery nebo změně kvality. Algoritmus nepotřebuje nové textury, další samplování textur, draw calls, světla nebo průhledné vrstvy. Přidává fragmentové výpočty; jejich cenu je nutné zahrnout do měření celé hry.
- Slunce, měsíc, meteodata, směr větru, sklon terénu, společné rozměry renderu/kolizí a zdrojové polohy objektů zůstávají řízeny původními systémy. Pokoje a jejich aktivita zůstávají simulované, nikoli záznamy skutečných obyvatel.

## Původ a interpretace

Identifikované dispozice, cesty a objekty pocházejí z již dokumentovaných OSM, ČÚZK DMR5G, fotografických předloh a IPR Praha 2023. Celý převzatý síťový model IPR je prostorová předloha. Žádný jeho poškozený vůz, strom nebo náhodný reliéf není součástí tohoto materiálového passu.

Generické mikrostruktury: původní soubory a SHA256 jsou v `shared/data/assets/surfaces-manifest.json`. Výškový a fotografický podklad neurčuje změřenou drsnost ani současný odstín každé plochy. Tónování, míra sytosti a makrovariace jsou výslovně výtvarná interpretace. Není přidán žádný údajně zaměřený obrubník, skvrna nebo oprava asfaltu.

## Ověření a meze

`pnpm exec tsx --test tests/cinematic.test.ts tests/cinematic-art.test.ts`: **9/9 PASS**. Ověřuje fyzické měřítko materiálových kanálů, nezměněné spáry a barevné násobitele, nemetalickou interpretaci drsnosti, návrat po dešti, lineární cubemap, stabilní projekci stínů a omezené prostředky pluginu. `pnpm exec tsc --noEmit`: **PASS**.

Samostatná studie: `docs/reality-pack/art-style-preview.html` (sedm typů povrchů, přepínače dne/noci a kvality). Jde o ověření materiálu a kompilace shaderu, nikoli FPS měření celé hry. Produkční GPU měření s HUD a skutečnými multiplayerovými relacemi musí uvést finální zdrojový hash. Test NullEngine není důkaz vzhledu ani GPU rychlosti.

Skutečné WebGL ověření 11. 10. 2026: ANGLE / Intel UHD Graphics 630 / Direct3D11, den a noc ve vysoké i úsporné kvalitě, **9/9 aktivních fragmentových efektů obsahuje `campusArtVariation`, ready=true, errors=[]** ve všech čtyřech variantách. Snímky i DOM výsledky jsou v `docs/reality-pack/art-style-evidence/{day,night}-{high,low}.{png,json}`. První pokus na sdíleném vývojovém portu 5182 narazil na neaktuální Vite dynamic-import cache; ověření proto proběhlo na dočasném portu 5186 s vlastní cache. To nebyla shaderová chyba pluginu. Diagnostika preview byla opravena z chybného volání API na veřejný `Effect.fragmentSourceCode` před uložením úspěšných důkazů. Samostatná studie má také cílenou kontrolu TypeScriptu **PASS**. Dočasný server a karta jsou po ověření zavřené.

Známé meze: stylizované generické materiály nenahrazují fotografický audit každého modelu. Tento pass nepřidává SSAO, volumetrickou mlhu, motion blur, DOF ani screen-space odrazy. Scéna může být za zatažené oblohy přirozeně plošší; její slunce či počasí se kvůli efektu nepřesouvá. Vlastní leaf/sky shadery mají již display-space výstup a nejsou druhým gamma průchodem ani Standard/PBR křivkami zpracovány znovu.
