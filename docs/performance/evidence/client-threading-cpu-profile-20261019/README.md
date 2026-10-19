# KEY-40: produkční CPU profil a volba prvního worker experimentu

19. 10. 2026. Výsledek je rozhodovací měření, nikoli přijatá vícevláknová optimalizace. Navazuje na přijatou KEY-41. Implementace omezeného grass tile workeru pokračuje samostatně v KEY-42; výchozí cesta zůstává původní do prokázání přínosu.

## Identita a provedení

- Zmrazený produkční snapshot `59683809428a08c37d2c29633c987268306b973c506e3de3f244a80b4c1377e8`: current combined `1fbc05af…5752` plus čtyři přesně ověřené soubory lokálního CPU helperu. 586 source/test souborů, 27 servírovaných code/map souborů. Hrané buildy ani root Game se neměnily.
- Edge 155, nativní WebGPU, NVIDIA Pascal / GTX1060 dle předchozí systémové evidence. Tento browser export hlásí adapter `pascal/nvidia`, nikoli samostatné nové systémové měření modelu. CSS i render 1912×867, Medium, jedna skutečná multiplayerová relace s HUD a postavou.
- Vlastní aktivní karta/okno na4206, API2601. Browser state předává aktivní tab a focused window; session visibility zůstala visible. Uživatelova4203 zůstala otevřená. Obě vlastní služby i měřicí karta po sběru ukončeny, porty volné; frozen source/dist zůstávají.
- Sampler: existující SelfProfilerV2,16ms požadovaný interval, max2000 samples, jediný raw DOM export. Dokument povoluje js-profiling. Žádný nový per-frame wrapper v helperu. Lokální opt-in `profileCpu=1`; helper není přijatý runtime feature.

## Co bylo skutečně naměřeno

| Běh | Podmínky | FPS | p95 / p99 ms | Max interval ms | Environment mean ms | Render mean ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
|01|noc, environment + CPU diagnostika, mimo trávu|46,2|29,7 /34,7|85,7|0,47|18,30|
|02|stejná instrumentace, další severní chůze|54,6|24,4 /29,7|43,8|0,40|15,03|
|03|stejná instrumentace, další severní trasa|58,4|21,7 /25,6|40,5|0,41|13,18|
|04|den, samotný CPU sampler, chybný směr po resetu|32,0|39,1 /61,2|86,3|0,69|26,86|
|05|den, CPU sampler, vstup na trávník|34,4|35,9 /42,5|50,8|3,57|22,77|
|06|den, CPU sampler, pokračování po trávníku|36,4|35,7 /40,3|48,9|4,77|19,79|

**Nejde o srovnatelné FPS A/B.** Liší se trasy, světlo i instrumentace. Všech šest benchmarků má renderHealth valid, nulové render errors a na konci nulové pending render operations. GPU timing není dostupný. Osmisekundový gameplay zásek se v těchto krátkých benchmarkových intervalech nereprodukoval.

Běhy01–03 skončily mimo mapované travnaté polygony: grass instances i cache byly nula. To odpovídá zdrojovým bounds, nikoli důkazu lifecycle chyby. Run04 je zachovaný neúspěšný navigační pokus: „Vrátit se na start“ změnilo yaw zπ na0, takže S vedlo opačně. Následně bylo auto obejito běžnou klávesnicí, bez teleportu nebo změny app state.

Run05 prošel přibližně X105,6, Z13,79→55,81; run06 Z57,35→96,25. Na konci4007/5311 kořenů,195/586 cached tiles,130/188 pending tiles, jedna grass draw. Známý koridor odpovídá polygonům1315614179 a1316120376 i existujícím testům. Screenshot run06 dokládá skutečnou scénu.

## Atribuce a rozhodnutí

Nezávislá analýza všech raw stacků (přítomnost, nikoli čas):

| Funkce, inclusive samples |05|06|
|---|---:|---:|
|PhotographicGrass.update|47|38|
|advancePreparation|15|16|
|selectRoots|9|9|
|advanceTilePreparation|2|2|
|prepareTile|1|2|
|PhotoGrassBatch.flush|14|9|

Počty se překrývají. Ani počet×16ms neznamená CPU dobu. Intervaly nejsou pravidelné, chybějící stack není důkaz GPU/GC/idle. Source-map pozice jsou definice funkcí, ne instruction pointer. Environment3,57/4,77ms obsahuje také selection, transit, světla a uploady; nelze jej prohlásit za ušetřitelný tile CPU čas.

Zvolen je nejmenší vratný **tile-only worker prototyp**, nikoli předem slíbená oprava všech záseků. Stejný deterministický generator, hlavní FIFO cache1536, transferable matice, nejvýše dva in-flight výsledky, bounded apply a fallback. Výběr kořenů, přechody a GPU upload zůstanou na hlavním vlákně. Prototyp se přijme pouze pokud reálné A/B ukáže čistý přínos; řídká placement přítomnost je důvod očekávat omezený možný zisk a měřit ho, ne vydávat celý environment za potenciální úsporu.

Další varianty byly porovnány v [decision input](../../../../_bmad-output/implementation-artifacts/client-threading-cpu-profile-20261019/worker-decision-input.md). B6 skenuje6209 položek při pohybu, ale celý enclosing world byl jen0,16–0,18ms; worker není úměrný. Active-mesh evaluation činilo5,55–6,14ms, ovšem zahrnuje Scene/LOD/skeleton/dispatch. Pro statický předvýběr by synchronní konzervativní index pravděpodobně měl menší riziko než worker; samotná jeho query cena dosud není doložená. Physics kolem0,5ms také není prioritou. Celý renderer worker pouze přesune stále sériový scene.render a vyžaduje širší bridge.

Konkrétní hitches: run01 85,7ms měl předchozí CPU80,5/render74,6ms, stacky material defines/light defines/PBR binding. Run04 66,9ms obsahuje tree detail-cache disposal → submesh light dirty a navazující render. Run05 50,8ms má environment11,1/render37,8ms; tři samples ukazují cinematic caster/world matrices, uniform binding a draw, **žádný prepareTile**. Run06 nemá ≥50ms hitch. Žádný capture neobsahuje environment-work event; dřívější dlouhý transit bracket se nepodařilo znovu zachytit.

## Neúspěšné starty a ověření

První start session3ec5d045 selhal seq772 na původním30s limitu světelné přípravy Low/day-1-off. CPU sampler ještě neběžel. Shader inventory mělo550 modulů,3764,9ms souhrnné CPU práce, max86,5ms a19 258 518 retained code units; jde o režii celého inventory, nikoli dokázanou příčinu timeoutu. Warm reentry ve stejné session uspělo. Nová stránka bez profileEnvironment (session62205a6e) uspěla, lighting preparation59 658,6ms celkem přes kvality. Žádný limit, timeout ani readiness podmínka se neměnily.

Helper:25/25 cílených testů, scoped types i úplný Game TypeScript PASS; minifikovaný hidden-map build PASS. Review helperu a finálního analyzeru bez nálezů. Nezávisle ověřeno586 sources,27 served hashes,5 použitých maps a164 embedded application sources. Znovu nebyla spouštěna celá nezměněná sada1524 testů/integrace: tento overlay není produkční feature. Při první full typecheck cestě `pnpm exec` proběhla hláška kontroly závislostí; následně ověřeny source/lock a7 pinovaných SDK runtime hashů beze změny, další příkazy používaly přímý Node.

Recorder timeOrigin je odhad Date.now−performance.now, sampler používá performance.timeOrigin; rozdíly+0,5/−0,2ms jsou zdokumentované. Brackety se neposouvají: oba používají přímý performance.now clock. Benchmark-start se shoduje se sampler startem do0,6ms. Hitch interval je intervalStartMs–intervalEndMs s previousFrame, nikoli okamžik emitování eventu.

## Reprodukce a archiv

`manifest.json` obsahuje70 položek včetně referencí na dvě session a SHA uložených i rozbalených bajtů. Raw benchmarky, CPU traces, celé session včetně failure, matching použité JS/maps, helper/test provenance a test/build logy jsou gzip. Skripty v reproduction zachovávají původní postup. `reproduction/analyze.mjs` běží nad owncache rootem s dist-manifest, build-identity, snapshot/dist a run-NN/{cpu-profile,benchmark,session}; gzip soubory je nutné rozbalit do této struktury. Neprovádět profiler proti jinému buildu. Top30 ranking je jen prezentace; raw export dovoluje úplné přepočítání.

KEY-40 zůstává In Progress. Výzkumný checkpoint není splnění cíle, migrace ani výkonové přejímky. KEY-42 vlastní implementaci a další skutečné testy.
