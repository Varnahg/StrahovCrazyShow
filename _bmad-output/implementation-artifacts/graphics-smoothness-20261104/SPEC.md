---
title: 'Odstranit opakované kontroly dat při načítání stromového detailu'
type: 'refactor'
created: '2026-11-04'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - 'AGENTS.md'
  - 'docs/agents/bmad-policy.md'
  - 'docs/performance/evidence/graphics-smoothness-20261104/research.md'
---

<frozen-after-approval reason="Uživatel výslovně zadal novou grafickou větev na D a pokračování v opravách záseků.">

## Intent

Snížit doloženou synchronní CPU práci při streamování stromových detailů při zachování stejných modelů, vizuálního výsledku a odmítnutí poškozených dat. Práce probíhá výhradně v D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104 na codex/graphics-smoothness-20261104. Původní C/main, cizí WIP a8080 se nemění.

Rawlogy obsahují opakované112–529ms skripty spojené s dokončením stromovýchGLB. Cílený profil skutečných crown032/033 ukázal decode183/131ms zcelkovéCPU přípravy248/165ms. Odstraníme opakované kontroly již ověřených accessorových dat uvnitř jediného synchronního decode. Veřejné API a jeho pozdější kontroly se zachovají. Tato změna neslibuje opravu samostatných4–7,5sGPU-process mezer ani vyššícelkovéFPS.

</frozen-after-approval>

## Implementation Notes

- Primární podklady a varianty: research.md; původní uživatelskýrecording aPR40A75 se seq/časy. Dosavadníepoch guard řeší redundantní serverreset, nepost-fetch CPU nebo driver. FAR45 a shadercache nejsou součástí změny.
- Code map: client/tree-asset-loader.ts readTreeGlb/accessor/validateGeometry/decodeTreePrototype; client/tree-renderer.ts loadDetail→createPilotMeshes; tests/tree-streaming.test.ts a nový tests/tree-asset-validation.test.ts. Jediný runtime soubor je tree-asset-loader.ts. Další výrobumeshů, indexové pořadí, cachebudgets, dva fetchsloty, season/materiály/shadery a abort se nemění.
- Zvolená varianta: soukromý synchronní decoder může držet malou mapu již ověřených typedarrayviews pouze po dobu jednoho volání. Expected type/componentType a strukturální/bounds guardy se kontrolují také při cachehitu. Geometrické shape/index-range guardy nesmí zmizet; finite scan se neopakuje jen když je právě stejný view vtomto synchronnímvolání již ověřený. Všechna metadata a nepoužitéaccessory se stále validují. Výstup nesmí držet mapu/celý parser closure.
- Veřejný readTreeGlb vrací mutable json/accessor a jeho volající mohou později změnit buffer či metadata. Zachovat dosavadní opakovanou kontrolu této veřejné cesty; cache optimalizace nesmí uniknout mimo privátní synchronousdecode. Např.private parser s interním opt-in flag a nezměněný public wrapper jsou přijatelné, veřejný cache přepínač není potřeba.
- Given validní GLB, when decode, then stejné názvy/role/lod/material i byte-identické pozice/normály/UV/indexy/barvy a stejné typy polí. Given cachehit pro nesprávný typ či componentType, then původní odmítnutí. Given NaN/Infinity i vnepoužitémaccessoru, chybnýbounds/index/unuseddata, then se model odmítne předmesh alokací. Given readTreeGlb následovanýmutací veřejného bufferu/json, when accessor, then stejnávalidacejako předzměnou. Existingstreaming/season/cache/disposal regrese zůstávají.
- Alternativy: counting-sort má menšíprofilovanýpodíl a risk65k průchodu u maléhoFAR; worker/yield řeší mainthread širšízměnou transferownership/abort/fronty, zatím nepřiměřenou. Žádná persistentcache, nováGPUresource nebo závislost. PřínosRAM se neslibuje.
- Předem přejímkaCPU: shodnéGLB/SHA a skutečnáfunkce, prvníběh zvlášť a7opakování. Medián decode musí na obouMID klesnout alespoň20%, celkový decode+createMeshes alespoň15%; malýFAR nesmí zdražit o více než max(10%,0,5ms). Nezapočítávat season podruhé do celku. NullEngine není GPUdůkaz.
- Praktickéověření: po byteparitě a cílenýchtestech stabilní produkčníbuild/test/SDK; jeden přesněidentifikovanýEdgeWebGPU průchod se skutečnýmpohybem aLOD načtením, HUD a různýmiSDKavatary. SDKpeers držet neutrální, protože předchozí Low A/B změnilo jejichLOD. Bez obecnéhoFPSclaimu zjednoho průchodu; číst uloženélogy avalidaci, nečekat nachybovouobrazovku. Výsledek může přijmoutCPU optimalizaci a zároveňnechatGPU-process příčinu otevřenou.
- Refaktoring zůstává lokální: sjednotit view konstrukci/validaci bez kopie celého parseru. Neoslabitintegritu, budgety ani API. Nezávisléreviewpřesnéhodiffu a pravdivýcheckpoint v rootpředání. Procesnízdroje drží root validačníclaim; implementátor provede pouze lehké cílenéCPU regrese.

- Stabilní implementace: privátníparseTreeGlb s per-call mapou jen pro synchronousdecode; publicwrapperfalse, guardy předcachehit. Nových7 regresí a původnístreamingtesty zachované. Leaf64/64PASS, po přidánílegacyNaNregrese7/7novýsouborPASS, scoped i celýTypeScriptPASS. Nezávisléblind-hunterreview[].
- ŠestprodukčníchGLB/12částí mají přesněshodnébytehashy i typyatributů. CPU kandidát stejnéfunkce/assety/7opakování: decode83,23/59,88ms proti183,37/130,97ms (−54,6/−54,3%); celádecode+createCPU151,22/91,00ms proti247,53/164,91ms (−38,9/−44,8%). MalýFAR6,60→4,07ms. PředemzapsanéCPUmeze splněny; seasonse nesčítá srodičem a nejde oFPS nebo4–7,5sdriverfix.
- D prostředí a pravdivýharnesscheckoutguard jsou samostatněcommitnuté613da4a0cfc62b97e9638a2b18d1843b29148e6c. Runtimecelku čeká na jedinoufullsuite, produkčnífrozenbuild, SDK a Edge.

- Final: celá sada3085/0/5, TypeScript, immutableproductionbuild, SDK a runtime review PASS. JedinýEdge startupready,4novéstromovéassety/43,94MB, healthvalid/0faults. GPU/FPSzisknetvrzen; celkovýgameplayINCONCLUSIVE a6,08s prodlevazachované. ScopedCPU přejímkasplněná; širšíKEY-5otevřený.

## Review Triage Log

Runtime blind-hunter: []. Datovýaudit potvrdil paritu aCPUmetriky, upřesnil že6,08smezeraneležívewalkingcompilationdelta a časovépokrytíglobálníhozáznamujevadné; report upraven beznovéhoběhu. TSCvýsledek má samostatnýreceipt místo nesprávného odkazunaVitelog.
