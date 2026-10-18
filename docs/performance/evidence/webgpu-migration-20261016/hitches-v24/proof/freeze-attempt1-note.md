# První metadata freeze: neúspěšný zdrojový odkaz

Příkaz `node .cache/webgpu-migration-checks/define-memo-proof-20261018/freeze.mjs` skončil exit 1 při čtení `Materials/materialHelper.functions.pure.js`, který pinned package neobsahuje. Skutečný zdroj je `Materials/materialHelper.functions.js`; oba názvy byly omylem uvedené v doplňkovém seznamu zdrojů. Chyba z tool output:

```text
Error: ENOENT: no such file or directory, stat 'C:\Users\rezac\.codex\worktrees\webgpu-comparison\StrahovCrazyShow\.cache\webgpu-migration-checks\define-order-qa-20261018\dependencies\node_modules\@babylonjs\core\Materials\materialHelper.functions.pure.js'
    at Object.statSync (node:fs:1795:25)
    at file:///C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-migration-checks/define-memo-proof-20261018/freeze.mjs:46:135
```

Tato poznámka je výpis diagnostiky, nikoli znovu spuštěný test. Původní metadata script je zachován v `review-v1/freeze-metadata-attempt1.mjs`. Všechny measured source/log hashes již před touto chybou prošly; nevznikl ještě integrity output ani manifest. V1 source recovery se podařilo přesně dle původních SHA a další pokus ji jen ověří. Oprava vyřadila pouze neexistující zdrojový odkaz a umožnila opětovné ověření již existujících recovery souborů. Testy, měření ani runtime se neopakují a nemění.
