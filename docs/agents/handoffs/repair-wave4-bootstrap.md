# Předání izolovaného výzkumného základu wave4

Vlastník/příjemce: `repairs-01a13624-bootstrap` / koordinátor root. Managed worktree `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`, větev `codex/playtest-repairs-wave4`, Git základ91ee88f0aaa902c79fad589aeb84bc086a66c9ea.

Před kopírováním byl nový checkout čistý. Katalog/AGENTS předal jejich globální koordinační vlastník; runtime soubory se kopírovaly až po úspěšném claimu. Vlastní dříve předaná práce je jednoznačně převzatá ze snapshotu0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248 (wave3), nikoli z neznámého dirty stromu. Hlavní checkout, původní preview snapshot a cizí vegetační WIP se neměnily.

Zkopírováno72 odlišných source/config/test vstupů. **Všech509 manifestových source/config/test souborů je byte/SHA shodných s wave3,0odchylek.** Seznam a kontrola v `.cache/wave4-bootstrap/parity.json`, reprodukce `bootstrap.mjs`, vstupní plán v hlavním checkoutu `.cache/playtest-repairs-validation/wave4-bootstrap-plan.json`. Ignorované Python bytecode je jen součást historického snapshotu, neobsahuje novou implementaci a nesmí se stageovat.

Git LFS checkout z již lokálně dostupných objektů materializoval12 přesně rezervovaných existujících souborů (1.2GB). `public/models/vegetation/runtime/far.glb` má76500488B, není LFS pointer. Není to regenerace modelů. Úplná nová asset/GPU přejímka se netvrdí. `node_modules` je junction na dosavadní uzamčenou instalaci vmain; závislosti jsou v tomto tasku pouze pro čtení, žádný install ani lockfile změna.

Pozdější glTF fastpath (runtimeSHA909d69632a7fe955c7cbdaa3e264aa032bc9198f5e0ed9feca9bcdcaa24248aa, testSHAdb8ba5e162dbebf14189de2b03178b5fbe02b678c94eb0f00e42606207e98136) je samostatně uložen pouze v `.cache/wave4-bootstrap/candidates/`. Není součástí tohoto runtime základu a jeho16/16cílených testů nenahrazuje novou celkovou přejímku.

Žádná nová oprava, build, test suite, GPU scéna, server ani port zde nebyly spuštěné. Kopírovací/LFS helpery skončily exit0. Předané změny zatím nejsou commitnuté; budoucí commity musí oddělit převzatý WIP od nových fixů a zahrnout jen vlastní konkrétní soubory/hunky. Další agent smí použít adopt-dirty jen pro výslovně přidělenou podmnožinu tohoto doloženého základu.

Další práce se řídí výslovným výzkumným postupem14.10: nejdřív mapa vazeb/variant a zdůvodněná volba, poté implementace/refaktor/ověření, samostatný commit a integrace do main. Frozen4176 se nesmí během uživatelského testu měnit. Root vlastní závěrečné rozhodnutí a průběžné aktualizace Linearu.
