# B5 FAR rankové skupiny · podklad pilotu

Task `trees-20261026-far-clusters`, owner `trees-far-clusters-01a16b37`, baseline `8516c7b1`. Tento krok identifikuje zdroje a připravuje čistý rozklad; nevytváří bitmapu, modelový export, změnu hry ani celý katalog. R5 full MID má plnou populaci, FAR zůstává subset. Rootův v9 snapshot a ověřování zůstávají nedotčené.

## Zdrojová vazba před implementací

- Source `ipr-crown-014`, prototype `own-broadleaf`, root X/Z `[-67.59,-60.96]`, radius `0.484 m`; botanický druh neznámý. Současný R5 full-coverage descriptor uvádí GLB `49 399 036 B`, SHA `9113d99327c52fc7de197cf8857b562a8ad25fa375db39905299a4722b433df7`. V tomto authoring kroku byla čtena GLB JSON hlavička, nikoli transformována celá produkční geometrie.
- Původní R4 `.cache/trees-pilot-20261025/r4-optimized/models/pilot-manifest.json`: `61 059 816 B`, SHA `8dc3f4554dc729d7baa67a54a5c78e7d524b0888d8ebdbe60fbae5ccf283f2f6`. `componentMetadata` uchovává rank, branchId, branchT, anchor, fotografický partId, supportRadius a původní attachmentDistance. ID řádku dává smysl pouze spolu s tímto hashem.
- Osy `.cache/trees-pilot-20261025/own-broadleaf-axes.json`: `2 664 919 B`, SHA `0351435a583ad136e09ad93a99bb2e997c48a67e36c99ca80eaa5e5b042147a8`. Větve jsou identifikované přes `id`, nikoli implicitním pořadím v poli. `sample(branch,t)` interpoluje podle indexů bodů, nikoli podle délky větve.
- R5 `.cache/trees-r5-authoring-20261025/prepared.json`: `13 550 114 B`, SHA `f1c66fb2fb8d392f0a6fb9f28a291d92930f37dac2dbe118d57adba91b484460`. Existující malý výhon rank32722 má šest listů na branch4120, parent4118. Větší konkrétní subtree4118/4119/4120 obsahuje44 listů v9rancích:1069,7034,10847,24933,28922,32722,36376,55396,57879.
- `shared/data/tree-leaf-components.json`, SHA `022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3`, definuje devět odlišných UV oblastí LeafSet024 a fyzické měřítko celého atlasu0.4m.

GLB obsahuje POSITION/NORMAL/TEXCOORD_0/COLOR_0, ale **nemá per-leaf ID ani branch accessor**. Celá ranková skupina není jeden list. `add_foliage.py` cykluje devět fotografických částí; rank sdílí nejvýše šest po sobě vložených listů. Bezpečný join je tedy connected component → raw uint16 rank + přesná UV footprint části → jediný řádek původního manifestu. Chybějící nebo víceznačná vazba znamená chybu; pořadí exportovaných vertexů se nepoužije jako identita listu.

Metadata/osové souřadnice jsou root-local Blender Z-up. GLB pozice se explicitně převádějí `[x,-z,y]`, UV `[u,1-v]`. R5 MID rohy0/1/5/4 pocházejí z původního zakřiveného near listu, nikoli z rovinného R4 MID. Vedle kontroly kotvy proti ose lze ověřit normu vzdálenosti vertexu od kotvy podle původního UV měřítka a bend funkce; tato kontrola **neprokazuje orientaci nebo roll**, ty zachovají původní pozice a indexy. Tolerance zohlední Float32 export.

## Volba malého podkladu

Porovnáno prosté sloučení ranku podle pořadí (odmítnuto: nedokládá jednotlivé kotvy), celá44listá karta (odmítnuto: slučuje9ranků), a explicitní komponentový join se skupinami stejného ranku. Zvolena poslední varianta. Skupiny dostanou dva deterministické návrhy: jednu projekční rovinu nebo nejvýše dvě roviny rozdělené podle orientace celých listů. Tentýž list nikdy nevstoupí do obou rovin; zdrojová geometrie, UV a rank se nemění. Projekční frame a jeho bounds jsou pouze instrukce pro pozdější bake, nikoli bitmapa či důkaz její siluety.

Čistý helper smí běžet na malých přenosných fixtures bez top-level čtení ignorované cache. Skutečný B5/subtree rozklad se spustí teprve po zprávě rootu o ukončení kolidujícího ověřování. Původní R4/R5, osy, mapy a dokumentace jiných tasků jsou read-only. Nový zdrojový manifest bude vyžadovat nový explicitní pin a prověření vazeb, nikoli tiché přijetí změněné cache.

## Následný celý B5 pilot a rozpočet

Malý subtree44/9 ověří join a dělení; k přijetí vzhledu je potřeba celý B5. Reference plnýR5MID, negativní kontrola dnešníFARsubset, kandidát celá koruna rankových skupin. Porovnat75/135/175m při720px/FOV0.85, čelní/45°/60°/90° a zvýšený pohled, léto/50%opad/zima. Studio šestilistého výhonu768² není důkaz FAR chyby při175m.

Horní počet bez bitmapové optimalizace:16 019 ranků znamená16 019–32 038 rovin a32 038–64 076 trojúhelníků. Při4vertex/rovinu a raw POSITION+NORMAL+UV+uint16COLOR jde o160B vertexů plus12/24B indexů na rovinu; celkově přibližně2.75–5.90MB před GLB metadaty. To je výpočet pro jednu B5 korunu, nikoli řešení96MiB limitu110stromů. Proto před produkčním atlasem změřit i variantu sdílené roviny s transformacemi/ranky a skutečný atlasový pool+mipy. Ten by vyžadoval samostatný runtime kontrakt. Žádné procento FPS ani VRAM se z těchto počtů neodvozuje.

Navržené obrazové cíle: plocha celé masky±5%, chybějící/přidaná plocha mimo1px toleranci každá≤5%, samostatně vnitřní mezery, kvadranty a blikání. Zima bez listí, dřevo oddělené, žádný skok rankového opadu. Každý atlasový mip musí mít vlastní coverage/padding kontrolu. Celý FAR source-byte základ+cache+rezervace≤100663296B; nové textury a rozbalené buffery se evidují zvlášť.

## Připravený helper a explicitní adapter

`scripts/trees-20261026-far/rank-clusters.mjs` poskytuje čistý `buildRankClusterPlan`. Přijímá oddělené source geometry/rank arrays, metadata řádky s jejich skutečným `sourcePartIndex`, osy a fotografické UV definice. Najde souvislé komponenty přes indexy, jednoznačně spojí rank+UV s metadaty, ověří fyzické měřítko/kotvu a vytvoří stabilně seřazené skupiny. Jednorovinná a dvourovinná varianta odkazují na stejné kompletní komponenty, bez duplikace listů. Dvourovinný kandidát používá nejvzdálenější dvě normálové orientace, přičemž protilehlé normály považuje za tutéž oboustrannou rovinu. Výchozích35° je pouze zkoušený autorský práh, nikoli přijatá projekční chyba.

`prepare.mjs` má explicitní SHA piny pěti vstupů. Před joinem ověří celý R5/R4 GLB a byteovou identitu R5 near accessorů s původním R4. Potom kompaktuje pouze devět vybraných ranků z plného R5 MID. Zachová tabulku původních vertex/triangle indexů a indexy accessorů, takže lokální výstupní reference lze vrátit do přesného souboru. Převod souřadnic a UV je v JSON výslovný. Výstup bude pouze malý source plan, limitovaný1MiB, zapisovaný s `wx` bez přepsání předchozího důkazu.

Koordinátor po skončení svého kolidujícího ověřování a převzetí tasku může spustit:

```powershell
. .cache/trees-20261025/activate.ps1
node scripts/trees-20261026-far/prepare.mjs --sample
```

Očekávaný výstup `.cache/trees-far-clusters-20261026/b5-subtree-4118.json`:44 fotografických listů,9rankových skupin,176 původních MID vertexů,88 původních trojúhelníků,9–18 návrhových rovin,18–36 návrhových trojúhelníků. Počet dvojitých rovin není předem prohlášený za změřený. Konkrétní SHA výstupu vypíše až skutečný běh. Tento authoring task **production probe nespustil** podle výslovné zprávy rootu; jeho úspěch ani konkrétní obraz se zde netvrdí. Chybějící nebo změněný pinovaný vstup je chyba a vyžaduje nové rozhodnutí.

## Ověření tohoto kroku

`node node_modules/tsx/dist/cli.mjs --test tests/tree-far-clusters.test.ts`: **8/8 PASS,0skip,0fail**, exit0,0.63s; `.cache/trees-far-clusters-20261026/fixtures-adapter.log`. Fixtures mají3 skutečné syntetické listové komponenty ve2rancích. Ověřují plnost a unikátnost, nezávislost na pořadí vertexů/metadat, frame bounds, zachování vstupních polí, source near vs full MID, poškozené/nejednoznačné vstupy, převod glTF souřadnic/UV a původní accessor reference. Dva moduly lze importovat v prázdném pracovním adresáři bez cache a bez zápisů; explicitní probe tam správně selže.

`node --check` pro oba nové `.mjs` a úzký TypeScript check pouze nového testu (`--noEmit --strict --skipLibCheck --target ES2023 --module ESNext --moduleResolution Bundler --types node tests/tree-far-clusters.test.ts`) skončily exit0. Log `.cache/trees-far-clusters-20261026/typecheck-targeted.log` je prázdný. Nebyl spuštěn celý projektový tsc, fullsuite, build, integrace, Blender, GPU nebo produkční B5 transformace.
