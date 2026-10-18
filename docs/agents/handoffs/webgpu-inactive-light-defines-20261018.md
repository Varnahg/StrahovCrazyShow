# Předání: webgpu-inactive-light-defines-20261018

- Vlastník: `webgpu-inactive-light-native-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `15f9102`.
- Výsledek: přijatý třířádkový vendor hunk a dvě regrese přeneseny do nativních cest. Bez commitu; root provede čistý úplný snapshot, full test/build/integration a integraci. Žádný Game/Cinematic/kamera/prewarm přesun.
- Vstup: frozen QA manifest `1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac`. Původní QA prefix, V4, dependencies-v5, installed node_modules, hrané4193/4192/4188 i cizí WIP beze změny.

## Přesný rozsah a refaktoring

- `patches/@babylonjs__core@9.30.0.patch`: byte-identický QA patch, SHA `0811815a615a8e501c4542ee2fa38fcc5fdd1a4394fbc610cb0aa5a0ae62c578`. Zachovává starý patch a přidává pouze reset tří neaktivních LIGHT_FALLOFF flags.
- `pnpm-lock.yaml`: byte-identický QA lock, SHA `54bae00191e01af417fffb8f243917dd299987c614121c09840475ed2b1b9ca8`; pouze šest nahrazení patch SHA. Verze/package/workspace beze změny.
- `tests/inactive-light-defines-helper.test.ts`: odstraněny pouze dvě assertions závislé na názvu QA/V5 adresáře. Skutečný loader/core realpath comparison, malý binary GLB a PBRMaterial/Mesh instanceof zůstaly.
- `tests/inactive-light-defines-history.test.ts`: odstraněny nevyužité writeFile/hash/helper importy, SHA výpočet a probe metadata, prázdný hook registry/cleanup, unused stage/cleaned/limitations stav. Původní tvorba Hemi světla zůstává bez nepotřebného lokálního bindingu. Všechny assertion podmínky zachované; nové testy formátované projektovým Prettierem pouze v těchto dvou souborech.
- Vlastní cache `.cache/webgpu-migration-checks/inactive-light-defines-native-20261018/` a tento handoff. `owned.diff` zahrnuje také nové testy; `manifest.json` dává exact SHA a kontrolu nativních/staging bytes.

## Nové ověření nativního přenosu

Staging `candidate/` je pouze fyzický 10souborový import closure aktuálních nativních testů/zdrojů/configu, nikoli celý projekt. Má svůj node_modules junction pouze pro čtení frozen QA dependencies. Nepoužívá nativní installed node_modules a nic neinstaluje. Proto nejsou starší QA výsledky vydávány za nové nativní ověření.

- `TSX_DISABLE_CACHE=1 node candidate/node_modules/tsx/dist/cli.mjs --test --test-timeout=15000 candidate/tests/inactive-light-defines-history.test.ts candidate/tests/inactive-light-defines-helper.test.ts`: **16/16 PASS**, exit0, 10.113s; `targeted-tests.log`.
- `node types.mjs`: scoped TS **3134 souborů, 0 chyb**, noEmit; `scoped-types.log`.
- Manifest porovnává všechny staging soubory s aktuálními nativními soubory a vstupní QA manifest/helper SHA; žádné kopírované runtime zdroje se nevydávají za produkční změny.
- Původní QA16/16 + souvisejících77/77, celý6souborový vendor patch roundtrip a10860package hashů zůstávají doložené ve vstupním QA manifestu. Nyní se znovu nespouštěla celá starší sada ani GPU.

Testy zachovávají historii všech tří per-light falloff typů a globálních PBR režimů, opaque/alpha regular-instance PBR/Standard cesty, cap/disable/reactivation, scene OFF/ON, dirty no-op, capability clamp, frozen readiness/unfreeze a loader identity. Cap0 bug, explicitní Node light, fallback string canonicalization a starý stale-frozen draw hang zůstávají původní popsané hranice. Žádné oslabení material/Effect readiness.

## Stav přejímky a předání

Koordinátor doložil dva V4 Day piloty:0nových modulů/0sync, maxima137.9/155.3ms oproti V3 přibližně3.31/3.18s. Startup47.07/42.68s proti43.08/43.74s kolísá; nejde o statistickou přejímku celé migrace. Tyto GPU výsledky jsou vstup koordinátora, tento task žádný GPU běh neprovedl.

Všechny vlastní test/typecheck procesy skončily. Žádný port, server, install, fullsuite/build/integration ani další BMAD workflow. Nativní installed dependencies zůstávají původní; plná validace musí použít vlastní rootův snapshot s odpovídajícím opraveným dependency rootem. Po explicitním předání manifest SHA následuje release; registr dokládá čas. Root přebírá commit/integraci a aktualizaci stavů, release není Done celé migrace.
