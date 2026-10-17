# KEY-31: důkaz chybějící denní B6 přípravy

18.10.2026, omezený CPU proof před dalším QA experimentem. **Není to GPU měření ani oprava záseku.** Navazuje na [přijatý startup celek a stále neopravené první F](../hitches-v5/README.md).

[Podrobný výklad](analysis.md) rozlišuje skutečné pinned metody, nahrazené IO, zachované chybné pokusy a limity. Dva noční starty postrádají Directional variantu potřebnou pro denní B6. Osm částí dvou původních GLB je mimo B6 odpojených; hlavní efekty se po restore/reentry znovu použijí. Připravený wrapped leaf depth efekt během OFF zanikne a při dalším ON dostane nový token.

- [Probe](probe.ts), [souhrnný výpočet](summarize.mjs), [finální log](probe-final.log), [souhrnný log](summary.log).
- Úplný [report](report.json.gz) a [souhrn](summary.json.gz) jsou gzip. Deterministický16ms scheduler není wall/performance metrika.
- [Původní manifest](proof-manifest.json) popisuje220 byte-identických source/config kopií, dvě původní GLB, pinned dependency hashy a všechny finální i starší diagnostické artefakty.
- [Archivní manifest](archive-manifest.json) ověřuje uložené soubory i jejich obsah po dekompresi; [source bundle](runtime-sources.json.gz) obsahuje původní texty a SHA. Původní malé GLB jsou již v repozitáři pod cestami uvedenými v manifestu, nejsou zde duplikované. Dependencies zůstávají připnuté v původním lockfile/patches.

Pro zopakování rozbalit artefakty do vlastní rezervované pracovní cache, obnovit soubory ze source bundle a malé GLB podle manifestu, připojit odpovídající read-only dependencies a přesměrovat externí vstupní cesty v probe na vlastní frozen benchmark/snapshoty. Pak `TSX_DISABLE_CACHE=1 node --import tsx probe.ts` a `node summarize.mjs`. Archiv je evidence, nikoli automaticky samostatný instalační balík. Referenční benchmark je archivovaný v hitches-v5; jeho SHA718a947bf39e5a4a548dfce4c9f1fe899fca583df7a42bb66d263befe11f9f6a.

Výsledek dvou scénářů a summary assertions PASS. Nebyl proveden samostatný typecheck, fullsuite, build, integrace ani GPU. NullEngine používá GLSL a podporovaný POISSON shadow filter; neprokazuje WebGPU PCF, plnou B6 geometrii/occlusion, avatar/LOD ani obnovu celestial caster seznamu. Dalším krokem je pouze oddělený QA experiment dvou B6 denních etap s korektní prostorovou obnovou a měřením startupu i prvního F. Hrané buildy zůstávají beze změny.
