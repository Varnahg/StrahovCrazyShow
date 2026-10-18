# Předání: webgpu-opaque-order-qa-20261018

- Vlastník `webgpu-opaque-order-01a14497-child`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, výchozí HEAD `7a8f988`.
- Výsledek: izolovaný material-first A/B kandidát dokončen, actual Babylon targeted kontroly PASS. **GPU/frame-time a obrazové přijetí neprovedeno; žádný produkční default se nezměnil.** Žádný build/fullsuite/integration/GPU/server/install/staging/commit.
- Vlastní zápisy pouze `.cache/webgpu-opaque-order-20261018/` a tento handoff. Vstup frozen quality-combined-v1 `205b4dda8028dd20b90dbd75177ba6ebd8d3fcf41d02cd97a8c44c42a6b9d05d`; hrané4195/4193/4192/4188, main/WT runtime a všechny dependencies read-only.
- Copied root pro root assembler: `.cache/webgpu-opaque-order-20261018/candidate/`. Přesné3behavior delty:
  - `client/opaque-sort.ts`: `cd9701bac29087517634545db62ca71b16ef0029cc0f985aafc4de9ad54074ff`.
  - `client/art-lighting.ts`: `88e8542359a2108037e9cc4edf1444600134ff377baea248a9877c96f94c4983`.
  - `tests/opaque-sort.test.ts`: `17b0684aef8c27df7bceadb3a32bb98fca78ea9fc2c288041e99da759a91fea5`.
- Ostatních9copied vstupů z celkem12file closure je beze změny. `inputs.json` obsahuje všechny source SHA, původní3bytes jsou v `preimages/`; `candidate.patch` a finální manifest stanovují přesný přenos. Toto je testová closure, nikoli celý nový herní build.

## Výzkum, volba a kontrakt

Před implementací přečteny primární AGENTS/policy, task/registr a aktuální opaque sekce BMAD spec. `analysis.md` rozlišuje steady CPU wall data od snapshot inventáře a shader startupu. Varianty: near-to-far s menším overdraw, material-first s menšími možnými bind přepnutími, coarse depth buckets s dalším neověřeným parametrem. Vybrán jeden copied material-first kandidát; úspora není předem tvrzena.

Nový samostatný `createSkyFirstMaterialComparator(scene, sky)` ponechá sky-first, potom řadí podle current-pass materiálu, rendering mesh identity, materialIndex a indexStart. Čte jen veřejný render-pass lookup a native MultiMaterial.subMaterials. Nevolá SubMesh.getMaterial(false), který v9.30 může resetDrawCache; nevolá ani getSubMaterial, který pro neplatný index vytváří default material. Známý native child se přečte přímo, null/invalid/custom případ použije stabilní deklarovanou container identity. To není tvrzení o neznámém custom effective bindingu; jeho renderer se nemění.

Nová větev nevytváří mapy, cache, observables, readiness/LOD dotazy ani world transforms. Sdílený `drawableTie` sjednotil původní tři stabilní tie-break operace; původní near-to-far factory/API/body zůstávají pro kontrolu. ArtLighting vybere nový export přímo pouze vcopiedQA souboru; žádný query gate ani změna kvality. Alpha-test, transparent a shadow fronty se nepřepínají.

## Ověření

- Scoped Prettier pouze3copied files; `node validate.mjs 01` v task prefixu: **10/10PASS**, exit0,2141,99ms. Původní4test bodies zachované;6nových actual Babylon testů. Přesné UTC/args/source hashes/log SHA v `targeted-01.json`.
- Strict scoped TypeScript **2971souborů/0diagnostik**, `types-01.log`. Roots: copied opaque-sort, art-lighting a test. Dependency runtime je readonly junction do stejného quality snapshotu; core/loaders mají jednu ověřenou fyzickou core identitu.
- Skutečný Scene render s PBR mění kontrolní A/B/A pořadí na A/A/B, snižuje reálný mustRebind, zachovává draw membership, stejné ready Effects/defines a transforms. Nejde o microbenchmark ani GPU FPS důkaz.
- Native MultiMaterial/current-camera-pass override skutečně renderuje podle child materiálů. Samostatná dosud neinicializovaná comparator cesta má traps na getMaterial/getLOD/readiness/world/bounds a nulový resetDrawCache/default-material allocation. Null/invalid child fallback deterministický.
- Skutečný shadow pass běží před i po změně se shodnou draw posloupností; alpha-test/transparent posloupnosti a sky-first zachované. Native instance/LOD draw membership a custom selector callback count zůstávají stejné; bez dalších pose změn. Dvacet comparator factories nepřidá observer/cache a nemění authored alpha/depth-write/zOffset/zOffsetUnits.
- Freeze ověřil beze změny původní near-to-far body a všechny4původní test bodies, ostatní copied inputs a identity. První metadata freeze skončil na příliš přísném očekávání exit0 u no-index Git checku (exit1 s LF/CRLF warning). Nešlo o runtime/test failure; samostatná whitespace Git kontrola nebyla po začátku root GPU okna opakována a není vydávána za PASS. Scoped Prettier výše proběhl. Nebyl spuštěn umělý baseline s chybějícím exportem: skutečný kontrolní algoritmus se vykresluje uvnitř nových A/B assertions.

## Limity a root přijetí

NullEngine prokazuje skutečný dispatch/binding a cache ownership, nikoli pixely, driver timing nebo overdraw. Per-draw lights/world/bones u unfrozen materiálů nadále běží; menší mustRebind neslibuje konkrétní celohrovou úsporu. Opaque material-first může zvýšit overdraw a změnit výsledek vzájemně koplanárních ploch při stejné hloubce. Test pouze zachovává depth offset/state, **neprohlašuje pixelovou ekvivalenci**. Root má porovnat stejné actual full-game pohledy včetně povrchových vrstev a oken, health a FPS/p95/p99; horší whole frame odmítá kandidáta i při lepším bind CPU.

Všechny vlastní procesy skončily, žádná služba/port. Runtime/test freeze výše; vlastní claim se uvolní po předání. Root vlastní finální readonly review, QA build/GPU A/B a případné další runtime tasky. Tento handoff ani release neznamená KEY-31 Done nebo schválení produkční změny.
