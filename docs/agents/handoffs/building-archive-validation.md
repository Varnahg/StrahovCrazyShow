# Předání: building-archive-validation

- Vlastník/příjemce: `buildings-01a12b28-root`, worktree `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, větev `codex/building-models`.
- Základ: převzatý stabilní weather/outdoor commit `7dac0a4985bff5503019107ae88c9380d53e025f`. Main runtime ani jeho procesy nebyly v tomto tasku změněné.
- Výsledek: **121 nejvyšších samostatných stavebních archivů skutečně vygenerováno; GLB i native reopen PASS**. Herní build/GPU je další fáze, ne součást tohoto PASS.

## Vstupy a soubory

Převzatý vlastní code-ready WIP z [building-archive-export](building-archive-export.md), skutečný kit [B4](building-b4-export.md), původní window/market kity a zmrazená runtime integrace 24/24+TypeScript. Stabilní B4 near SHA `6513ff48c1628eaace4705cd69e6e1f5f946a39ef9d08aa1b83bb6e5f4a790a6`, highest SHA `f0d9209d47056d5bd5138c896fc52fd243b9c097fb2c6694ebe1efe19cf78019`.

Změněné root soubory: `.gitattributes` (jediný nový LFS řádek pro source plan), `scripts/{export-building-assets.ts,create-building-assets.py,audit-building-assets.ts,audit-building-blender.py,building-archive-transfer.ts}`, `tests/building-archive-transfer.test.ts`, `assets/blender/buildings/`, `public/models/buildings/`, evidence/README v `docs/reality-pack/separate-assets/` a tento handoff. Žádné fotografie se nepřenášejí do textur; původní zdroje a konstrukční odhady zůstaly popsané.

## Skutečný export a přejímka 12. 10. 2026

- Source export B3: 121 modelů, **2 905 224 trojúhelníků**, **379 878 281 B**; source plan používá Git LFS.
- Blender 5.2.2 LTS, CPU 2 threads, B3 export exit 0: všech 121 `.blend` a GLB. Součet geometrických GLB **206 118 812 B**; sdílených 15 obrazů **6 020 118 B**.
- `pnpm exec tsx scripts/audit-building-assets.ts`: **PASS**, 4 399 324 skutečných GLB vertexů, 0 nulových trojúhelníků, všechny identity/transformace/počty/polohy/UV/normály/tinty a authored PNG bytes ověřené. Bounds rozdíl max 13,793 µm. Zdrojové hashe platné.
- `blender --background --threads 2 --python scripts/audit-building-blender.py`: **PASS**, 121 skutečných otevření uložených souborů, přibližně 3 min 39 s. Přesná topologie a UV, linked materiály, 8 715 672 normal corners / 7 554 954 color corners. Zdrojové plovoucí normály max chyba 2,981×10⁻⁸; vertex max 15,137 µm; nativní shading max 0,218142° proti limitu 0,25°.
- B6: všech 19 stair skupin a 3 976 kanonických boxových částí zachováno. Maximum runtime/source pozic schodů 4,884×10⁻⁷ m a boxů 4,706×10⁻⁷ m; foundation jednou. Modelových 35 pokojů na úrovních 0–5 zůstává simulovaný inventář, nikoli realita.
- Původní lehké transfer testy 3/3 a scoped TypeScript PASS; nové native/GLB audity přidávají přímý důkaz celého přenosu.
- `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check`: PASS. Windows CRLF v byte-preserved generovaných JSON se nenormalizují po hashování. Obyčejný diff check hlásil pouze tyto CR konce jako whitespace; skutečné whitespace kontroly zůstaly zapnuté.

## Oprava nalezené ztráty normál

První full export B1 byl skutečný, ale následný audit selhal: Blenderovo nativní short2/trig uložení změnilo některé velmi jemné normály. Přímý native probe potvrdil na marketu až 0,1158°. In-memory pokusy s kompenzací a sharp fans nepřinesly zlepšení; nikdy nebyly uložené do mastery. Negativní logy a reprodukovatelné diagnostiky jsou zachované.

Finální řešení zachovává plnou zdrojovou normálu v `_SOURCE_NORMAL` POINT/FLOAT_VECTOR v kanonických osách. Lokální primární glTF exporter tyto vektory netransformuje. Po exportu se accessor použije jako standardní NORMAL; živé reference se nejprve spočítají napříč všemi primitive a až poté se odstraní nepoužité accessory/views. Indexy, UV, barvy a textury se nemění. Guard odmítá další transformace, morph/skins/animation i rozšířenou komprimovanou geometrii. Tangenty jsou v aktuálním exportéru vypnuté a audit jejich nepřítomnost vynucuje.

GLB kontrola **nepovolila svůj limit 2×10⁻⁴**. Její maximum je hranice vůči prvnímu odpovídajícímu zdrojovému rohu u případných shodných pozic; native přesný atribut se ověřuje nezávisle pod 10⁻⁶. Nativní Blender shading se měří odděleně přes atan2(cross,dot), s konkrétním nejhorším dílem v auditu. Data nejsou zaměnitelná se shaderovou shodou mezi renderery. `_SOURCE_NORMAL` se po ruční změně geometrie automaticky neobnoví; je nutný zdrojový workflow a další audit.

## Refaktoring, procesy a hranice

Převod os/normál/zaokrouhlení je společný helper, source JSON se zapisuje po modelech a atomicky, přesné atributy používají explicitní vlastnictví a sdílené materiály mají bílé backfill barvy. Orphan mesh buffery předchozí budovy se uvolňují, texture SHA audit se cachuje. Architektonické PNG se přenášejí i bez browser DOM; SurfacePack override a původní B6 tint mají zachovanou prioritu.

Procesy root: B1 source session75157; B1 Blender session56846/PID31044; B3 source+Blender session20348/PID6884; GLB audit session56847; native audit session60013; všechny skončily exit0 kromě výslovně zachovaného B1 audit failure. Diagnostické native sessions43266/37658/97127 skončily exit0 bez přepsání modelů. Žádný Blender, vlastní server či GPU scéna po předání nezůstává. Weather preview4179/API2570 zůstává pod svým předaným vlastníkem.

Přesné logy B1/B2/B3 a aktuální audity jsou v `docs/reality-pack/separate-assets/`; úplný manifest tohoto předání je `building-archive-validation-manifest.json` (obsahuje také testy, vylučuje `.blend1/.blend2` zálohy). Po uložení manifestu se heavy-validation/claim uvolní. Následuje stabilní snapshot, plné testy/build/izolovaná integrace a skutečné herní JPEG záběry + GPU měření. Žádné tvrzení o GeForce nebo 60 FPS z těchto CPU výsledků.

## M2 — B4 material correction after actual B1 gameplay

The B1 north-facade screenshot exposed the StandardMaterial/PBR lighting mismatch. The separately tested B4 factory now decodes the shared sRGB shade exactly, uses roughness0.84, metallic0 and scene environment0.7, with no invented texture or emission. Geometry-buffer hashes of all120 buildings are unchanged. Factory `client/b4-panel-material.ts` was added to the explicit archive source-hash list.

All121 source models and Blender/GLB archives were refreshed and rechecked in the `*-20261012-m2.log` run, exit0 with actual success markers. GLB audit and all121 native reopens PASS again;2,905,224 triangles and206,118,812 GLB bytes unchanged. Source plan is379,878,381 bytes. Native source-normal precision, maximum native shading angle and B6 invariants remain identical to B1. Prior B1 audits were copied to immutable `building-export-audit-20261012-b1.json` and `blender-reopen-audit-20261012-b1.json` before the new report was written.

The actual combined B4 GLB was additionally compared with the actual unchanged highest panel-kit GLB: linear factor `[0.3662526011,0.3864294291,0.3712376952,1]`, roughness0.83999997, metallic0, no maps/emission, opaque/backface culled PASS. Evidence: `b4-combined-material-20261012-m2.json`, runnable `audit-b4-combined-material.mjs`.

Pipeline session84166 and all Blender children completed; no own process remains. No new GPU or full game pipeline was run in this archive phase. Root will freeze B2 with all tests and compare the actual game appearance before publishing another implementation change. The old main B1 remains available.
