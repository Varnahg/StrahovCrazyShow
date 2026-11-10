# Zbylé záseky po resync opravě · 4.11.2026

Předchozí epoch guard odstraňuje redundantní reset serverové fronty. Neodstraňuje dlouhé synchronní klientské úlohy ani čekání vGPU procesu. Nová práce je na výslovně zadané D větvi z6805bcd4.

## Doložená místa

- Původní uživatel, seq3123/3125/3137: ipr-crown-032/lod1.glb19 173 756B končí365590,7ms; následuje501ms stromový loader scope a579,7ms snímek. V celé relaci16 obdobných post-ready LoAF112–529ms. Minifikovaný scope není přesný call tree.
- A75, seq958–961:186,1ms loader po dokončení12 628 392B přenosu; přiřazení crown033/lod1 je inference z velikosti včetně300B režie. Seq967 při chůzi571,6ms, předchozí callback568,2ms/render556,7ms.
- A75 seq973 a993:4 041,6/5 299,9ms, ale předchozí callback15,5/20,3ms. LoAF blocking0 a čekání před renderStart4 024,6/5 278,2ms. GPU proces během mezer používá přibližně jedno CPU jádro, NVIDIAutil0–6%; rendererCPU téměř ustane. Server droppedTotal se nemění. Jde o hypotézu pipeline/driver/buffer čekání, nikoli prokázaný decoder spike.
- High A75 seq1097→1110:2 630,6+7 539,5ms; první obsahuje environment1 349,5/render1 255,6ms, pozdější837,6ms loader. Celou mezeru loader nevysvětluje. Původní uživatel seq5845 má6 661,6ms při callback1 017,5ms, další5 642,5ms před renderStart.

Původní raw data: ../gameplay-frame-cost-20261103/user-playtest-20261104/recording.jsonl.gz a ../low-tree-lod-20261102/pr40-20261104/baseline-recording.jsonl.gz, systémbaseline-system.jsonl.gz. Nové kopie původních logů se netvoří.

## Lokální atribuce

[Reprodukovatelný měřič](tree-cpu-profile.mts) načte přesné katalogovéGLB před časováním; první pokus odděleně, sedm opakování. Používá skutečné decodeTreePrototype, createTreeSeasonGeometryPlan a private createPilotMeshes nadNullEngine. GPUupload/driver aFPS nejsou měřené. Časseason je uvnitřcreateMeshes; součet je pouze decode+createMeshes.

[Baseline](tree-cpu-baseline.json): crown032 MID decode183,37ms, standaloneSeason31,31ms, createMeshesčetněseason61,21ms, celkem247,53ms. Crown033:130,97/15,75/35,07/celkem164,91ms. MalýFAR GLB032:4,98/0,45/1,40/celkem6,60ms; v4FAR má navícclusterovéčásti, proto nejde o celouFARkorunu. Oddělený instrumentovaný sort scope19,31/10,58ms z42,40/20,48ms season; nesčítá se srodičem.

## Varianty a volba

| Varianta | Dopad / riziko | Rozhodnutí |
| --- | --- | --- |
| Lokální již validované accessor views v synchronním decode | Odstraní opakované finite scany největšího CPU scope. Malá per-call cache, žádnédrženíassetů mezi loady. Nutno zachovattyp/bounds/index/unused-data guardy a veřejnýreadTreeGlb kontrakt při pozdější mutaci dat. | Vybráno podle skutečného profilu. |
| Stabilní counting sort ranků1–65534 | Přesné pořadí lze zachovat, ale sort je jen menší část problému a65k scan může zdražit maléFAR. | Odloženo; nesmí zakrýt neuzavřený decoder kandidát. |
| Worker / dávkovaná instalace | Může uvolnit mainthread, ale přidávátransferownership,abort/staleresults/fronty/bytebudgets; mesh/GPU instalace zůstane na main. | Nyní nepřiměřené proti doloženéduplicitě. |
| Retence High postprocess/shadow pipeline | Source opravdu ruší a znovu tvoří prostředky; mohlo by souviset sGPUprocessstally. | Samostatná hypotéza vyžadující přesnějšíGPU-process stack/API atribuci. |

Primárnípodklady: aktuální pinned9.30 kód tree-asset-loader.ts/tree-renderer.ts/tree-season-geometry.ts a výše identifikované rawlogy. Alternativy: [TypedArray.sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/sort), [skutečná task hranice scheduler.yield](https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield), [transfer ownership bufferů](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects), načteno4.11.2026. Samotnéawait jižsplněnéPromise nezajistí vykreslení mezi chunkami.
