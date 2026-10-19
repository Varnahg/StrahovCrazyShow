# KEY-44: povinná GitHub CI a ochrana main

Stav: přijato a sloučeno přes PR #7, ruleset aktivní. Finální head `94e6481415eba8802d02d34f9e09c06e9bb65137`, merge `a9f1805808c653d2a9fb9cd81def446bfaead588`.

Baseline: `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`, samostatná větev `codex/ci-required-gates`, owner `ci-01a155b2-gates`, task `ci-required-gates-20261019`.

## Výzkum a rozhodnutí

GitHub API 19.10.2026 potvrdilo admin oprávnění, povolené Actions, žádný ruleset a nechráněný main. Jediný workflow byl source-secret hygiene. Testy vegetace parsují binární GLB a ověřují Blender SHA; LFS pointer není platná fixture. Existující lockfile má Babylon patch, který musí frozen install aplikovat.

Zvolen jeden úplný job před paralelizací: jeden download a instalace, stabilní název required check. Celý LFS checkout místo předčasné selekce zajišťuje skutečné vstupy. Zpočátku bez nové cache infrastruktury. Strict up-to-date místo loose chrání kombinaci PR se současným main; semantic regression nemusí mít textový konflikt. Ruleset bez bypassu, bez univerzálního lidského approval. Samostatné `project-acceptance` na head SHA vydává integrátor až po review a relevantní praktické přejímce.

Příčina chybějící brány je doložená konfigurací, nikoli počtem historických testů. Linuxová přenositelnost a délka CI jsou do prvního běhu otevřená měření. Výkon/vzhled/cache hry se nemění. Lifecycle ověření používá nový ephemeral GitHub-hosted runner a vlastní integrační server; žádné změny hraného lokálního buildu.

Podklady: `package.json`, `pnpm-workspace.yaml`, `.gitattributes`, `tests/vegetation-realistic-pack.test.ts`, `scripts/test-integration.mjs`, `.github/workflows/source-secrets.yml`, [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [checkout](https://github.com/actions/checkout), [pnpm CI](https://pnpm.io/continuous-integration).

## Ověření

- Task katalog před implementací: PASS, 222 tasků; vlastní claim získán před BMAD rendererem.
- BMAD 6.12.4 skutečný render: PASS, prefix `strahovcrazyshow-95e969760fc5`, snapshot `f484d4f55325390b3da8`.
- [GitHub CI 39319976491](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39319976491), head `f4948a5de72d66a0b63c06d7c4d4f780a795ce67`: SUCCESS, job 5m28s. Celá sada **1491/1491**, fail 0, přibližně 186 s; produkční typecheck/build PASS, Vite 4.90 s; všechny čtyři integrační scénáře PASS. Podrobné časy: [first-ci.json](first-ci.json).
- LFS checkout a `git lfs fsck` PASS; frozen install včetně Babylon patche PASS; katalog a 101 README odkazů PASS. Oba source-secret běhy pro kandidáta PASS.
- [Nezávislé review](review.md): všechny tři vrstvy `[]`. Žádné změny runtime hry; GPU/praktická herní přejímka pro tento CI task není relevantní a netvrdí se.
- [Ruleset 25433383](https://github.com/Varnahg/StrahovCrazyShow/rules/25433383) je aktivní; [vrácená konfigurace](ruleset.json) má strict checks, PR, nula požadovaných lidských approvals, zákaz deletion/non-fast-forward a prázdný bypass. Efektivní branch rules znovu přečteny. PR zůstává BLOCKED při pending `project-acceptance`.
- Runner použil Ubuntu 24.04 (`20261012.334.1`) a oznámil migraci ubuntu-latest na Ubuntu 26 od 19.10.2026. Finální workflow připíná již ověřenou řadu `ubuntu-24.04`; nové SHA musí znovu projít CI.

## Koordinace a provoz

Finální PR CI [39321039004](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39321039004) PASS (5m22s), [final-pr-ci.json](final-pr-ci.json). Po SHA-vázaném přijetí v Linear KEY-44 byl PR sloučen bez bypassu, [merge.json](merge.json). Skutečná CI samotného main [39321924235](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39321924235) PASS (5m6s), [main-ci.json](main-ci.json). Dodatečné nezávislé review Ubuntu pinu/evidence vrátilo `[]`.

Na výslovný dodatečný pokyn uživatele vlastníci odstavili všechny evidované preview/dev procesní rezervace. Potvrzení přišlo od relací buildings, sync, repairs, webgpu-migration, webgpu-01a15102 a threading-01a15535. Jejich snapshoty a nepřijatý WIP zůstaly zachované; deník a grass prototype zůstávají pod zdrojovými claims bez procesních prostředků. Žádný cizí proces nebyl ukončen podle samotného portu. Místní celé testy/build/GPU se při této CI přejímce nespouštěly.

HTTPS Git OAuth odmítl push workflow kvůli chybějícímu scope. Připojený GitHub konektor publikoval totožný tree přes API; původní místní commit je zachován na `codex/ci-required-gates-local`. Žádné přístupové údaje ani globální auth konfigurace se neměnily.
