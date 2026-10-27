# Předání: trees-20261025-runtime

- Vlastník: `trees-loader-01a16b37`; příjemce: root koordinátor STROMY-20261025.
- Pracovní kopie: `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: implementovaný v1/v2 loader, centralizovaný tree lifecycle/LOD/sezóna, explicitní pilotní přepnutí a zachované grass/landcover chování. CPU checkpoint je připraven k integraci; vizuální/GPU přijetí pilotních modelů tím není dokončeno.
- Změněné soubory: `client/vegetation.ts`, `client/tree-asset-loader.ts`, `client/tree-renderer.ts`, `shared/tree-asset-types.ts`, `tests/vegetation-runtime.test.ts`, `tests/tree-asset-loader.test.ts`, `docs/trees/20261025/runtime.md`, tento handoff. Tasková cache `.cache/trees-runtime-20261025/` obsahuje logy, diagnostiky, checkpoint a neměnnou kopii přijatých own GLB. `tests/vegetation.test.ts` zůstává beze změny a je zahrnutý do evidence/regresí.
- Vlastnictví: claim získán před prvním zápisem bez adopt-dirty. Cizí materiálový checkpoint, season helpers, Game/UI/litter/flowers, modelářovy assety a hráčské snapshoty nebyly upraveny. Season autor sám přesunul svou `tests/tree-appearance.test.ts` fixture na reálný TreeRenderer; tento soubor nadále patří jeho tasku/integrátorovi.
- Podklady: KEY-62 spec/context, aktuální zdrojový runtime v1 a všechny skutečné v1 chunky, Babylon 9.30 primární glTF/PBR/Texture implementace, dohodnutý modelářův v2 manifest, neměnný materiálový manifest `3bd65af8559f874ca41ecb62b6bf8556417922dcdac5abfb0f83884c9fbdca60`. Druhy nejsou botanicky identifikované; runtime nepřidává nové polohy ani kolize.
- Refaktoring: načítání, per-tree roots, LOD výběr, aktivace po late load, cache a dispose mají jednoho vlastníka TreeRenderer. TreeAssetLoader sdružuje fetch/SHA/size/GLB/chunk validaci a vlastní abort. Neprobíhá per-frame generování geometrie. Legacy detaily mají tvrdých 32 položek/64 MiB včetně rozpracovaných rezervací; pilot má 96 MiB zdrojových GLB a sdílené fotografické mapy. Úspěšné binární buffery loader nedrží v duplicitní neomezené cache.
- Ověření: `node node_modules/tsx/dist/cli.mjs --test tests/tree-asset-loader.test.ts tests/vegetation-runtime.test.ts tests/vegetation.test.ts tests/tree-appearance.test.ts tests/tree-season-geometry.test.ts tests/tree-season-material.test.ts`: **33/33 PASS, 0 skipů, exit 0**, 20,36 s; `.cache/trees-runtime-20261025/targeted-final-v2.log`. Obsahuje actual GLB integrity/decode, actual v1 source identity, všechny byte-exact v1 detail atributy, B6 vertices/root/bounds, grass instance budgets, late winter/LOD, invalid input před alokací, částečný import cleanup, request coalescing/abort/cap, PBR map/rank/normal kontrakt a season helper draw lifecycle.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --pretty false`: **exit 0**, `.cache/trees-runtime-20261025/tsc-final-v2.log` bez diagnostik. `git diff --check` pro změněné tracked soubory exit 0. Předchozí vývojové neúspěchy a opravy jsou zaznamenány v `.cache/trees-runtime-20261025/development-diagnostics.md`; finální logy původní mezivýsledky nepřepisují.
- Snapshot: `.cache/trees-runtime-20261025/checkpoint-final.json`, source digest **`457141db422de58cd8fca158b651d67a3bb1896b356bdcf33059c78ff993da27`**, vytvořený `2026-10-25T18:39:18.000Z`. Zahrnuje vlastní kód, testy, runtime rozhodnutí, hashe čtených helperů a skutečných modelových vstupů. Handoff sám není součástí tohoto source digestu.
- Přijatý vstupní runtime-contract SHA: `390a82522840c68fc644fc91c59389b5fdf657a6fd3056fc6dd928647057ece4`. Own broadleaf SHA `f55d23bc5e28cc231c958c34590bb0fe7d8c5657650323ce3e6733ab3d2e8b34`, 55 612 472 B; own conifer SHA `d877b1a91707af991325fcb546c86ad714a2d2ed63bce9938faabeea6d4ddd15`, 30 760 460 B. Neměnné kopie jsou pod `.cache/trees-runtime-20261025/inputs/own-v2/`. Všechny čtyři tehdejší kandidáty dekodér přijal; pozdější MTree export vyžaduje nový actual asset gate.
- Procesy/zdroje: cílené Node testy a tsc skončily; žádný vlastní dlouho běžící pomocný proces, port, Blender, GPU, build ani instalace. `node_modules` pouze čten. Hrané verze 2592/4179 nebyly měněny.
- Omezení: skutečný geometrický index prefix je pouze pro v2. V1 při explicitní zimě může skrýt foliage a tónovat; bez season zachovává plné listí. Dnešní dvě pilotní identity stále potřebují 76 500 488 B legacy bootstrap; celková úspora bootstrapu se netvrdí. Own dvojice 86 372 932 B je přijata do CPU pilotu pod limitem 96 MiB, ale nikoli jako výkonově přijatá pro GTX1060. Statistiky zdrojových/atributových/sezónních bajtů nejsou měření VRAM; jejich části se překrývají. Kompletní katalog, vizuální volbu, browser/GPU/p95/p99 a společnou integraci provede root.
- Rezervace: po tomto předání vlastník provede `release`; necommitovaný výsledek přebírá výslovně root. Stav tasku a integrační/Linear evidenci mění koordinátor; release není Done.

## Integrační API

```ts
loadVegetation(scene, {
  treePilot: {
    manifestUrl: "/models/vegetation/seasonal/runtime-contract.json",
    selections: {
      "ipr-crown-014": "own-broadleaf",
      "ipr-b6-north-conifer": "own-conifer",
    },
  },
});
```

Toto je příklad explicitní volby, nikoli schválený default. Root může pro férové A/B zvolit `mtree-broadleaf`/`mtree-conifer` se stejným letním UTC okamžikem. Bez options zůstane v1. `VegetationInput.season?: TreeSeasonState` už je zapojené a `flowerBloom: input.season?.ground.flowerBloom` se předává autorovu PhotographicGrass hooku. Litter zůstává integračnímu tasku.

`TreePilotOptions`/v1/v2 typy jsou v `shared/tree-asset-types.ts`. Materiály mají alpha 1, vertexAlpha false a source opacity v samostatné mapě. V2 normály mají guard `treeNormalSource='authored-local'`. Sezóna se aplikuje na všechny LOD před enable a také uvnitř 0,15s LOD cadence. `legacyTreeInstances` versus `rankEnabledTreeInstances` musí zůstat viditelné v technické přejímce; pilot není hotový sezónní katalog.

## Root převzetí a následné opravy

Root `trees-runtime-integrator-01a16b37` převzal původní soubory po předání a release. Vlastní následné změny zahrnují sdílení map/source pro opad, Vegetation lifecycle/prewarm, skutečnou benchmark identitu sezóny a opravu glTF orientace. Tyto změny i jejich testy patří rootovi a opravňují opětovný claim při úpravě rezervace.

První kompletní snapshot odhalil zakázaný statický import legacy texturového manifestu z `public/`. Přejímací pravidlo vyžaduje zdrojová metadata v `shared/`; root proto přidává úzký `shared/data/assets/tree-bark-material.json` jako přesný Bark012 záznam a regresi shody s původním veřejným manifestem. Nemění žádné obrazové pixely, modelové vstupy ani jejich hashe. Dynamické fetchování celého manifestu by přidalo další síťový/lifecycle stav jen kvůli již připnutému malému záznamu; přepis pevného modelového input manifestu by zbytečně invalidoval R4.

## Převod pro streamování jednotlivých LOD

Root předává své aktuální WIP v `client/tree-renderer.ts`, `client/tree-asset-loader.ts`, `shared/tree-asset-types.ts` a `tests/tree-asset-loader.test.ts` agentovi tasku `trees-20261025-streaming` (`trees-streaming-01a16b37`). Součástí převodu jsou root opravy orientace, Bark source descriptor import, litter borrowing a metadata i nový explicitní pilot-only `tintDirectTranslucency` hook; příjemce je zachová. Shader/litter/Game/Vegetation mají nadále jiné přesné vlastníky. Převod je doložené přijetí cizího WIP, nikoli převzetí podle stáří rezervace. Root zmrazí v3 předchozí GPU snapshot beze změny.
