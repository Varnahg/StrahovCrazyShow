# Garment checkpoint — izolovaná integrace

Root port task `webgpu-garment-init-integration-20261019`, owner `webgpu-01a15102-garment-init-integration`, resource2568. QA task držel heavy-validation/workspace-build; při testech neběžela GPU scéna.

- Clean source `06754993e63049552768a7114f7a7fb8233cae0c2770a23336e9e071df8bc220`:1474/1474, pnpm build a pnpm test:integration exit0.
- Known combined source `c29a7da7dd9e66024a8ae59db803ef1b0e16a74d62ab0e533d8ac2821c49fe58`:1534/1534, pnpm build a pnpm test:integration exit0.
- Šest přesných příkazů/UTC/sha/logů v `.cache/webgpu-garment-init-qa-20261019/checkpoint-progress.json`, jejich raw kopie v QA evidenci. Oba test:integration příkazy používají stávající čtyři izolované scénáře; původní deps zůstaly beze změny.
- Po dokončení i po GPU smoke OS ověřeno: na2568 neposlouchá žádný proces. Nepoužito ukončování cizího procesu podle portu. Vlastní QA4200/2595 také ukončeny odděleným PID/start/path/command guardem.

Tato port rezervace a integrační PASS nejsou GPU/FPS/migrační přejímka. CelkovéKEY31/32 zůstávají otevřené. Po předání lze tento port task uvolnit.
