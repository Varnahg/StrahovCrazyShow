# Přesné sdílení odvozených shadow programů — izolovaný kandidát

19.10.2026. Source `c66b7c43d6c4702be1b06ce321b7482a31a4cca6d697bf83a3b78eda1bff8e7b`, současný clean F3 s jedinou změnou závislosti: ShadowDepthWrapper `bd2bfe313728751f375d613492e7210adb09733556dcb8e6f2d8e720b55f122c` → `f8a8c6091af9caa96ba897f28d7d490f3607d7856dee86b3a05321e1477aba29`. App source beze změny; source manifest585 zahrnuje původních576 souborů a zmrazený critical3 fixture/provenienci. Rozšířený konečný19case fixture je samostatně archivovaný pod helper/. **Nativní patch/lockfile v main se tímto QA commitem ještě nemění.**

## Doložený mechanismus a volba

Babylon9.30 dává ShadowDepthWrapper každému submesh/generator páru vlastní GUID. WebGPUEngine.createEffect používá token+defines jako klíč, takže stejné odvozené programy mohou znovu vytvářet moduly. Stejné defines nestačí k bezpečnému sdílení. Kandidát používá wrapper-local WeakMap originalEffect→jediný poslední descriptor+GUID; shoda zahrnuje celé derived vertex/fragment zdroje, jazyk, ordered attributes/uniforms/UBO/samplers a typované indexParameters. Neuchovává Effect ani novou cache programů, nepropojuje DrawWrapper contexts. Unsupported descriptor používá původní izolaci. WebGL větev zachovává historické chování.

WebGPU entry vlastní právě jeden acquire. Výměna nejdřív získá nový Effect, pak uvolní starý; mesh/base/wrapper cleanup uvolňuje jednou a pass aliasy neodečítají další reference. Ukončený wrapper se neobnovuje. FreshWebGpuShadowDepthWrapper v app zůstává beze změny. Metadata uchovávají signature shaderu po dobu života originálního Effectu, reset při wrapper disposal; žádné tvrzení o změřené paměťové úspoře.

Alternativa širší vehicle přípravy je menší zásah, ale samotná neřeší GUID násobení při nových LOD/submeshech mimo spawn a může později připravené efekty uvolnit. Proto nejdřív ověřen tento kandidát. Snížení stínů, světel nebo kvality by měnilo funkci/vzhled a nebylo použito. Zbývající coverage/retention vyžaduje další podklad, ne slepou cache.

## Ověření a skutečná selhání

- Helper **19/19 PASS** a čtyři samostatné original/candidate descriptor procesy pro WebGL/WebGPU: fullsource/options stejné mimo záměrně jiné tokeny. Skutečné pinned třídy a WebGPUEngine.createEffect/_releaseEffect/Effect.dispose na NullEngine CPU podkladu; samostatné skutečné draw/material contexts. Nejde o WGSL/GPU kompilátor. První helper fixture18/1 a chybějící descriptor outputs kvůli neimportovanému GLSL include jsou zachované; po opravě fixture se assertions neoslabily. Původní first descriptorParity=true bylo chybné při absenci outputs, finální runner vyžaduje všechny čtyři výstupy.
- Root copied critical3/3 PASS; **pnpm test1453/1453**, **pnpm build** včetně fullTS PASS; **izolované pnpm test:integration všechny4 scénáře PASS**, port2568 po dokončení volný.
- První root suite1439pass/6fail není přijetí: fs.cp zploštil Windows pnpm junctions, ztratily se transitive package identity; chyběly esbuild/colyseus timer a selhaly dva WGSL fixtures. Obnovených353 odkazů míří výhradně do vlastní QA kopie, zploštěné kopie zachované v ignored backup. Poté cílených38/38 a celá1453/1453 prošly. Žádné borrowed node_modules se nepřepisovaly.
- Kontrola **10860** Babylon core/loaders souborů proti původnímu fresh-install manifestu: původní strom nezměněn, v QA se liší právě uvedený modul. Loaders i app používají stejný vlastní core. QA je overlay existujícího pnpm checkpointu, **nikoli nový fresh-install proof nového produkčního patche**.
- Blind Hunter exact runtime/QA diff: žádný doložený nález; explicitně nepovažoval první selhanou sadu za přijatou. Konečné archivy/manifest jsou následný root předávací výstup, ne součást dřívějšího runtime review.

## Edge Medium první jízda

Skutečná relace11a715f3-b6ab-432e-95b1-f25c043e14b5,731souvislých záznamů odseq0; plain webgpu query, compatibilitytrue, native bezglslang/Tint. CSS/internal2040×986, Alex1actual, noc1792447200000, řízené počasí. Ready45,78s, benchmark87,45s od začátku; po30s ustálení S1900/E značka, benchmark/E/W8000/space2500. Car false→true,102,11m, po celý interval viditelná aktivní karta, přesně jedna shoda raw/UI intervalů. GTX1060/driver582.28 podle nvidia-smi;75→77°C,1493MHz před/po, cache/clock nebyly resetované/zamčené. Zátěž dopravy je podle skutečného času, END2bus/0passenger/1car; jiné transientní zátěže nejsou vyloučené.

| Výsledek | Kandidát |
| --- | ---: |
| Nové preparations/modules/sync pipelines | **6 /12 /7** |
| FPS /p95 /p99 | 48,8 /28,4ms /122,9ms |
| Maximum /intervaly≥100ms | **135,5ms /5** |
| GPU/render/asset errors, pending | 0 |

Dřívější plain Medium zachytil17/34/18 a diagnostický attribution také17/34/18. Počet požadavků u kandidáta tedy ukazuje praktické omezení násobení. **Jeden observační běh s jinou dopravou není FPS A/B, neprokazuje procentní zrychlení ani odstranění záseků.** Pět≥100ms intervalů přetrvává; KEY31/32 a default/full migrace nejsou přijaté. Bez attribution se šest zbylých requestů nevydává za přesně identifikované shaderové rodiny.

Po benchmarku prakticky prošlo vystoupení, svítilna, High a Low jízda, návrat na Medium, denní náhled, reset spawn, ukončení Game a všech šest editorových předloh se skutečnou preview readiness. Konzole finálně[], raw bez error/fault/device-loss i po těchto krocích. Screenshoty zachované. To je smoke, nikoli úplná obrazová, B6, multiplayerová, host isolation, lifecycle nebo quality performance přejímka.

Další krok: převést přesný přínosný modul a přenositelné regrese do projektového patche, prokázat fresh install a clean/combined checkpoint; poté řešit zbývající první programy a≥100ms hitches. Není hotová migrace. Vlastní4200/2595 a2568 procesy ukončeny, vlastní Edge karta zavřena/viewport resetován. Hrané4201/4199/starší a cizí WIP beze změny. [Manifest](artifact-manifest.json) zachovává110 raw/proof/source/test/log/image artefaktů s encoded/decodedSHA a délkami.
