# Předání: b6-photo-tree-20261024

- Vlastník `b6-photo-01a16b37-tree`, příjemce root koordinátor; cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `ed52896a`.
- Změněné soubory přesně: `shared/vegetation.ts`, `client/vegetation.ts`, nový `shared/data/cad-buildings/b06-tree-placement.json`, `tests/vegetation.test.ts`, `tests/vegetation-runtime.test.ts`, `docs/reality-pack/cad-buildings/b06/photo-tree.md`, tento handoff a vlastní ignorovaná `.cache/b6-photo-tree-20261024/`.
- Cizí WIP nebyl převzat ani přepsán. Žádný změněný stromový pack, zdrojový model, textury nebo jeho manifest. Nic nestagováno/commitováno.

## Výsledek, zdroje a volba

Původní conifer ID zůstává; pouze jeho evidovaná poloha se při aktivní CAD B6 opraví z−10.317/−94.077 na−10.5/−76.5±2m před všemi původními filtry. Nesprávný bod byl asfalt a ochranné pásmo chodníku. Nový bod projde nezměněným classifierem; nejde o whitelist stromu na cestě. Podrobné primární ortho/IPR/user-photo hashe, pixel/world převod, nejistota a kontrola komunikací jsou v JSON a photo-tree.md. Výška/crown data a veškeré modelové bytes zůstávají.

Alternativy: regenerace treepacku je zbytečná, bypass classifieru by oslabil ochranu cest, přičtení delta do vertex buffers by mohlo zdvojit transformaci. Přímá kontrola skutečných dat prokázala lokální pozice LOD0/1/2 a historickou node translation pouze v GLB. Vybrán jeden sdílený placement override + společný attach helper pro bootstrap i stream. Mesh local transform se nuluje, root určuje pozici a výšku, bounding info se obnoví i při zmrazené geometrii. Physics helper používá stejný aktuální bod.

Refaktoring odstranil duplicitní/potenciálně odlišná pravidla připojení LOD. `attachAuthoredTreeMesh` sjednocuje parent, identity local transform, update world/bounds a freeze. `applyTreeCrownShading` pracuje pouze s lokálními normal buffers, takže pořadí nevyžaduje starou node translation. Žádná nová persistentní cache, žádný další fetch, žádná změna abort/dispose, materiálů nebo shadow caster metadata. Tree group x/z a skutečné bounds jsou při změně rootu aktualizované dosavadním setTreeTransform/refreshTreeTransform.

## Skutečné ověření

- `pnpm exec tsx --test tests/vegetation.test.ts tests/vegetation-runtime.test.ts`: **11/11 PASS**, exit0,8.071s; `.cache/b6-photo-tree-20261024/targeted-tests-final.log`.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node,vite/client --esModuleInterop --resolveJsonModule shared/vegetation.ts client/vegetation.ts tests/vegetation.test.ts tests/vegetation-runtime.test.ts`: **PASS**, exit0; `typecheck.log`.
- Nová native fixture přes skutečný Babylon ImportMeshAsync načetla pouze tento publikovaný conifer bark/leaves LOD2 se skipMaterials, zkontrolovala původní translation a každý vertex po reparentu. Skutečné .tree bytes prošly produkčním startDetailLoads pro LOD0 a LOD1. Mezi jejich načtením se root přesunul a test prokázal správnou polohu pozdějšího LOD i již zmrazených obálek. Žádný vymyšlený metadata-only PASS.
- Všechny původní hash/geometry regrese stromových master/bootstrap/detail buffers zůstávají GREEN. Negativní building/path/bounds fixtures nový strom pořád odmítají.
- První nová fixture odhalila pouze chybu testu: spread Vector3 nepřenáší accessor x/y/z; opraveno explicitním čtením souřadnic. Původní `targeted-tests.log` je zachovaný; finální běh je samostatný.
- `source-manifest.json` a `changes.patch` ve vlastní cache zachycují přesnou identitu změn včetně testů a původních assetových manifestů. Žádná nová fotografie/CAD v Gitu.

## Integrace a omezení

Koordinátor přijme přesných sedm výše uvedených souborů a provede skutečnou herní/foto přejímku v rezervovaném validačním okně. CPU/NullEngine důkaz není GPU ani benchmark. Původní server2590/snapshot nebyl měněn. Neběžel Blender, build, server ani fullsuite.

Všechny vlastní pomocné procesy jsou ukončené. Po tomto GREEN předání je claim uvolněn a vlastní dirty WIP se výslovně předává rootovi k `--adopt-dirty`; release neznamená uživatelskou přejímku celé B6. Stav tasku/integraci eviduje koordinátor.
