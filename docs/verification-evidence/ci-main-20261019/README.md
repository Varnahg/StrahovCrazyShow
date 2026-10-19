# KEY-44: povinná GitHub CI a ochrana main

Stav: implementace a příprava skutečného GitHub ověření, dosud nepřijato.

Baseline: `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`, samostatná větev `codex/ci-required-gates`, owner `ci-01a155b2-gates`, task `ci-required-gates-20261019`.

## Výzkum a rozhodnutí

GitHub API 19.10.2026 potvrdilo admin oprávnění, povolené Actions, žádný ruleset a nechráněný main. Jediný workflow byl source-secret hygiene. Testy vegetace parsují binární GLB a ověřují Blender SHA; LFS pointer není platná fixture. Existující lockfile má Babylon patch, který musí frozen install aplikovat.

Zvolen jeden úplný job před paralelizací: jeden download a instalace, stabilní název required check. Celý LFS checkout místo předčasné selekce zajišťuje skutečné vstupy. Zpočátku bez nové cache infrastruktury. Strict up-to-date místo loose chrání kombinaci PR se současným main; semantic regression nemusí mít textový konflikt. Ruleset bez bypassu, bez univerzálního lidského approval. Samostatné `project-acceptance` na head SHA vydává integrátor až po review a relevantní praktické přejímce.

Příčina chybějící brány je doložená konfigurací, nikoli počtem historických testů. Linuxová přenositelnost a délka CI jsou do prvního běhu otevřená měření. Výkon/vzhled/cache hry se nemění. Lifecycle ověření používá nový ephemeral GitHub-hosted runner a vlastní integrační server; žádné změny hraného lokálního buildu.

Podklady: `package.json`, `pnpm-workspace.yaml`, `.gitattributes`, `tests/vegetation-realistic-pack.test.ts`, `scripts/test-integration.mjs`, `.github/workflows/source-secrets.yml`, [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets), [checkout](https://github.com/actions/checkout), [pnpm CI](https://pnpm.io/continuous-integration).

## Ověření

- Task katalog před implementací: PASS, 222 tasků; vlastní claim získán před BMAD rendererem.
- BMAD 6.12.4 skutečný render: PASS, prefix `strahovcrazyshow-95e969760fc5`, snapshot `f484d4f55325390b3da8`.
- GitHub run, ruleset, nezávislé review a integrace: čekají na provedení. Plné testy nebyly zatím spuštěny; stará evidence se nevydává za výsledek tohoto tasku.
