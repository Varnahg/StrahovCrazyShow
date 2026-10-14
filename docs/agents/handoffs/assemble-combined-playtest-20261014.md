# Předání: assemble-combined-playtest-20261014

**Společný source candidate sestaven; připraven k jediné root full pipeline. Bez testů/build/server/GPU v tomto tasku.**

- Vlastník `assemble-01a13624-combined-20261014`, příjemce `/root`. Ownership WT `C:/Users/rezac/.codex/worktrees/image-processing-ownership/StrahovCrazyShow`, HEAD `557eb880b6caff433f2d8e87211b20165baa4c12`. Aktuální task/registry/Git/worktree ověřeny, čistý vlastní claim před prvním zápisem. Žádný cizí WIP převzat.
- Nový candidate `.cache/combined-playtest-20261014/candidate/`, **snapshotId `1cddfe82303f6d7365df5470fc09f9a3fa71b4c4021150b3c67c131c3401562c`**;515 source/config/test souborů, z toho168 testových souborů. `source-manifest.json` obsahuje celý hash inventář včetně assetů, původ, šest overlay a dependency identitu.
- Základ je immutable IMAGE `d032be6510b1a94c9bbada421ad84da50ddfc97e0498df4bc4eb896f1145c19f`, již obsahující celý wave3 startup/diagnostiku/profiler, B6 transform fix, engine ownership patch a IMAGE. Všech513 původních source/config/test souborů bylo porovnáno před kopií, po kopii a znovu ve zdroji. Potom přesně6 overlay níže;0 odstranění, žádná jiná source změna. Výsledných515 hashů ověřeno z nové kopie.

| Overlay | SHA256 |
| --- | --- |
| `client/game.ts` z full wave4 | `b40a8a97a9100a0c872fda1771fcb9d9fd7fbaa8bc6e3d3278bdaa3208d07954` |
| `client/network-timeline.ts` z publication | `4ce6320632211ec23f19ac523cf56816cf6edf2ce46c8c8d66d1f10781851740` |
| `tests/game-interpolation.test.ts` z publication | `9365d519affe5310ec6685d7bc5fd28de922804a54222a70e2e8ce3abea976f9` |
| `tests/network-timeline.test.ts` z publication | `33d1fd90c4a4f81355c33532b651882107ab97ce08b9c4a2d02c362f82dec318` |
| `tests/room-callbacks.test.ts` z publication | `4052eddb48ba549c29edb2c7617bcac29346e4084b1e9b4a4a59080cc175cd73` |
| `tests/network-latency-recovery.test.ts` z publication4f41b37 | `828b40f57bce5be904d552f1e9de41a249c2a838c7a4da60c8d712fd9bbbd224` |

Publication `.cache/local-interpolation-publication/assembly-output.json` ověřen na SHA `f2bf323ca4d63ee036e635f5e20ec8e636a95ae7061c7795cf04c3a04fad4bfb`; všech5 jeho entries shodných před sestavením a assembly hash znovu po kopii. Síťová regression se shoduje také s Git blobem `4f41b37fb145e5a00414bf256fd431744b6ba462`. Overlay zdroje se po kopírování znovu hashovaly. Původní wave4/IMAGE/publication/main ani jejich logy se neměnily.

## Statický proof a závislosti

`assembly/ast-proof.json` používá skutečný TypeScript AST parser a printer (removeComments, LF), žádné ruční přepsání algoritmu, test runner ani type checking. Pro full Game proti publication Game potvrzuje:

-8 shodných členů: networkTimeline/networkPresentation, setLocalId, advanceSimulation, updateNetworkPresentation, interpolationAlpha, interpolateLocalPosition a interpolateDrivenCarPose; také shodný Timeline import.
- reconcile se liší pouze zachovanou full-Game diagnostickou značkou `if (modeChanged) this.pendingMeshDrawReason = "vehicle-mode-change";`.
- všech40 frame statements od `advanceSimulation(dt, frameStarted)` před `localView` je shodných, včetně obou skutečných interpolačních callsites.
- full Game oproti IMAGE baseline mění pouze4 původní phase metody a přidává5 phase členů. Ostatních183 členů a ostatní top-level statements zůstávají shodné; tím jsou zachovány původní constructor/startup/diagnostics/profiler části.
- `acceptAuthority` publication Timeline se AST shoduje s kvalifikovanou clock verzí Git4f41b37, SHA `b4bfa1aee25502fb0a90b6e486183052f564989c90c70cb7ef7bf1dafacb9d13`. Ostatní Timeline členy i API se shodují s původním full phase Timeline `c5007cac…`. Clock prevence se neztratila.

Nezávislý read-only review `review_epoch_contract` potvrdil stejné vztahy. B6 změna je v zachovaném `client/b6-reality.ts` SHA `942cc969…`, nikoli v Game; žádný B6 hunk se nepřepsal.

Assety používají nové junctiony na již známý immutable snapshot `f2705e4a74273d443dc2bb79f9be5ffd83efe7f54f54ef150b790c8978831410`,7897 asset/reference souborů. Ověřena identita jeho manifestu a skutečné cíle baseline public/assets odkazů. Velké assety se znovu nekopírovaly ani celé nehashovaly; inventář pochází ze zachovaného immutable manifestu. `node_modules` odkazuje na vlastní existující nezávislou ownership instalaci, použitou pouze ke čtení: Babylon9.30.0, schema5.0.36, oba patched JS hashy c97937b…/e45a4d…, patchf1bedab… a lock7afd005… ověřené proti IMAGE manifestu. Žádná instalace.

## Evidence a převzetí

`node .cache/combined-playtest-20261014/assembly/assemble.mjs`, exit0, přibližně7.1s včetně kopie/hash/AST. `assembly/assemble.log`, `ast-proof.json`, `assembly-result.json` a candidate `source-manifest.json` uchovávají přesný výsledek a čas. Skript záměrně odmítá existující candidate; nepřepisuje předchozí snapshot. Původní dist se nekopíroval, nový build ještě neexistuje. Vlastní helper skončil; žádný další proces, port nebo scéna nevznikly. Provozní PID zde není.

Zapisovalo se pouze do přiděleného nového candidate/assembly a tohoto handoffu. Žádný runtime vývoj, nový test, fullsuite/build/integrace/server/GPU, staging ani commit. Po předání následuje release; registry je autoritativní. Root může nyní spustit společnou plnou přejímku a teprve z jejího výsledku připravit preview4187/API2582. Tato assembly sama není důkaz FPS, pixelů, výsledku testů ani vydání uživateli.
