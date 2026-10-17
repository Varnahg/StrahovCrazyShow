# KEY-31: nepřijatý receiver kandidát a důkaz shadow lifecycle

**Výsledek: receiver optimalizace se do main nepřijímá.** Omezuje změny Effectů, ale neodstraňuje dlouhé čekání a přidává měřitelnou práci při každém zapnutém snímku. Nativní pokus je zachován v commitu `18701037dd3d8faae9b7bd1807ecfbf23e18aec4` a přesně vrácen commitem `db9018b8114770e0c71cd2e9b4000303d210b55e`. Strom po revertu je totožný s výchozím `d82eb6342541c7216d395b9d8fe5c89c4b02beeb`; žádný cizí WIP ani hraná4193/C5 se tím nezměnily.

## Kandidát a kontrola

QA4194/API2589, Edge, WebGPU compatibility, timestamp measurements OFF stejně jako v [předchozím důkazu](../hitches-v2/README.md). Kontrola používá původní snapshot `3cf48f74ff65aac859d5fa8869abd8da775cee66f85d2df5ff5ac4428d54507b`; kandidát `97561841da34e834ad1d3a3d07458d4f14df0f81c4d7124ad52f64ff38cb0ec6`. Nejde o výchozí produkční vypnutí timestamp dotazů — tato změna je jen společná QA podmínka obou kopii.

Oba první F proběhly v `b6:0`, medium/manual, denní náhled, stejný avatar a řízené počasí, jedna skutečná multiplayer relace,1512×642 CSS i interní rozlišení. WebGPU hlásí nvidia/pascal; [následná hostitelská kontrola](host-gpu.json) ukázala jedinou NVIDIA GeForce GTX1060, driver32.0.15.8228, vedle Intel UHD630. Přiřazení odpovídá metadatům prohlížeče, není to GPU execution trace. Kandidát stál na x−4,81909/z−76,91221, kontrola na x−4,82912/z−76,94763: rozdíl3,681cm. Kamera měla stejný směr a parametry. Historie a čas od game-ready se liší:246,897 versus420,092s. Je to jeden téměř shodný průzkumný pár, **nikoli statisticky přijaté A/B měření**.

| První F | Kandidát | Původní kontrola |
|---|---:|---:|
| Celá Game CPU |1102,9ms |1229,7ms |
| Nové programy / změny Effectů |38 /524 |40 /795 |
| Následující frame gap |6179,5ms |6344,2ms |
| Post-submit completion latency |6297,0ms |6443,7ms |

Rozdíl jedné cold mezery je164,7ms. Nelze z něj vyhlásit zrychlení ani odhad dlouhodobé úspory. Dřívější8568ms výsledek byl navíc na prahu se zónououtside, proto jej nelze použít jako přímou kontrolu tohoto interiérového kandidáta.

Nejlépe srovnatelné časné ON úseky,10–30s po fence completion, mají shodně0busů/0cestujících/1auto,3813source meshes a984active meshes:

| Metrika | Kandidát,548snímků | Kontrola,603snímků |
|---|---:|---:|
| Příprava světel, vážený průměr |4,405ms |0,015ms |
| Celá Game CPU, průměr |32,737ms |29,726ms |
| Frame p50 /p95 /p99 |33,7 /41,0 /45,2ms |30,4 /39,3 /42,8ms |

Celé ustálené ON má u kandidáta4,576ms přípravy světel na snímek přes9489snímků, kontrola0,018ms přes4342snímků. Zahřáté OFF kandidáta0,0165ms, následné ON4,5491ms. Nový průběžný náklad tedy není jen cold shader burst. `lightOrdering` zahrnuje budget/receivers/order a je již vnořené do render CPU; nesmí se k němu přičítat podruhé.

Pozdější úseky mají rozdílný ambient, včetně busu a cestujících u kandidáta. Celý rozdíl CPU/FPS proto nepřipisujeme pouze změně. [Reprodukovatelné výpočty](comparison.json) používají celá okna, vážené součty fáze a nearest-rank percentily **jednotlivých** uložených frame/CPU vzorků. Rozsahy, seq a kontexty jsou v obou `*-summary.json`; rawJSONL jsou bezeztrátově gzipované.

Teplé opakované ON nevytvořilo nové programy v žádném běhu. Kandidát měl jednorázový138,3ms interval/522Effect změn, kontrola164,1ms/791změn. Tento jediný vzorek není důkaz stabilního zlepšení. Startup entry marker→game-ready byl47,438s versus45,364s; odlišné zahřátí a historie nedovolují kauzální závěr. Oba běhy skončily bez render/asset chyb a se všemi profilerovými zdroji uvolněnými.

## Ověření a uchování pokusu

Nativní společný checkpoint prošel63/63 cílenými testy. Kombinovaná QA kopie prošla79/79, fullTypeScript a produkčním Vite buildem s `configLoader native`. Samostatné části měly28/28 + scopedTS2997/0 a13/13 + scopedTS2954/0. První kombinovaný test odhalil nepřipravenou QA Proxy fixture pro fence cleanup; doplnění explicitního absent tokenu nezměnilo renderer. Merge zachoval C5 failure guards, průběžné načítání a celé diagnostické try/finally; oba overlay audity bez nálezů.

**Nová plná sada ani integrace tohoto kandidáta neproběhly:** výkonový pilot jej před přijetím zamítl. Dřívější native/C5 plné testy se nevydávají za ověření tohoto pokusu. [Historie experimentu](experiment-history.json), [patch](receiver-native.diff), [provenience QA](candidate-composition.json), logy a původní handoffy zachovávají skutečný rozsah. `assemble-candidate.mjs` je auditní kopie helperu z `.cache/webgpu-hitch-validation-20261017/`; jeho relativní cesty patří k původnímu umístění, ne k této složce evidence.

## Co nově prokázal shadow proof

Samostatný [CPU proof](shadow-variant-proof/analysis.md) používá skutečné C5 PBR listí, TreeWindPlugin, FreshWebGpuShadowDepthWrapper, dva ShadowGenerator a skutečný OFF Scene.render. ON main Effect3 se znovu použije, ale návrat OFF zruší připravené ON depth4/5. Další ON vytvoří depth8/9 s jinými RandomGUID tokeny, přestože vertex source a defines mají stejné SHA. Kontrolní ShaderMaterial zachová svou identitu.

Jde o důkaz vlastnictví na NullEngine/GLSL, bez instancing a jednoduchých filtrů. **Není to důkaz GPU úspory ani atribuce prvního produkčního F.** Ukazuje, proč prosté přepnutí celé scény při asynchronní přípravě může připravenou budoucí shadow variantu zahodit. Žádná nová variantová cache ani engine patch tímto proofem nevznikly.

Existující GPU archivy mají inventář pouze na konci startupové přípravy:556/620 shader-module calls,0raw/body opakování bez dosažení limitů; odvozené odstranění nepoužitých defines ukazuje29/28skupin,45/32opakování. Tyto upravené texty nejsou nasazené identické WGSL. Pro prvníF chybí před/po inventář a propojení depth tokenů s moduly. **Další sběr může využít existující uživatelský benchmark**, který již ukládá `compilation.start/end`, bez nové diagnostické vrstvy. Teprve jeho výsledky rozhodnou o bezpečné normalizaci generated defines nebo přesném budoucím variantovém/async postupu. Šest pevných shaderových slotů je zatím širší, nezměřená alternativa.
