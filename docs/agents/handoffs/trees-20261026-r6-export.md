# Předání: trees-20261026-r6-export

- Vlastník `trees-r6-export-20261026-agent`; příjemce root KEY-62. Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Výsledek: přesný B5 runtime export všech tří LOD, v2 whole a v3 streamed kontrakty. Ready pro rootovo zapojení nové QA cesty; žádná změna Game/shared typů/v9 serveru, žádný commit/staging. Conifer odkazuje na původní R5 data bez modelové kopie. Celková herní/GPU přejímka není dokončená tímto taskem.
- Vlastní soubory: `scripts/trees-20261026-r6-export/{extract.py,package.mjs,publish.mjs,verify_native.py,verify-decoder.ts}`, `tests/tree-r6-export.test.ts`, `docs/trees/20261025/r6-export.md`, tento handoff, `public/models/vegetation/seasonal-r6/{own-broadleaf.glb,runtime-contract.json,export-evidence.json}`, `public/models/vegetation/seasonal-r6-streamed/{own-broadleaf-lod0.glb,own-broadleaf-lod1.glb,own-broadleaf-lod2.glb,runtime-contract.json}` a `.cache/trees-r6-export-20261026/` s mezipodklady, logy, audity a manifestem. Žádné cizí WIP nebylo převzaté.
- Zdroje: přijatý crown native SHA `1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c`, accepted39-file manifest SHA `14c084ca29849eef593ff10e68ee70a9415992246c95b4a5b6f8c95671eea0a7`. R5 whole contract SHA `e17bc7f691fb3b59ff119cdbb74671ea46b137bf8cba87b5570ef3e32d509db6`, R5 streamed contract SHA `9dc0b48ada20c9662e30628f985555d7ea30ce2bdd7113bb63f7019217551535`. Source delta/osy a ostatní piny jsou v exportní evidenci. Původní R4/R5/R6 podklady neměnné.
- Výzkum/volba: standardní instalovaný Blender 5.2 exporter zaokrouhluje corner normals na4desetinná místa. Pro přesné zadání zvolen úzký raw native corner packer, nikoli následný patch zaokrouhlených/deduplikovaných dat. Čte skutečné loop triangles a raw Float32 corner normals, používá bitovou deduplikaci úplného záznamu; GLB encoding a split jsou původní čisté helpery. Srovnání variant a zdrojová implementace doloženy v `r6-export.md`.
- Refaktoring/lifecycle: čistý `package.mjs` bez IO, explicitní `publish.mjs --publish`, samostatný native extractor a nezávislý reopen oracle. Audit neopakuje pouze výstupní hash: čte znovu nativní rohy a porovnává je s indexovaným GLB. Původní helpery pouze čteny/importovány se zakázaným pycache. Žádná instalace, runtime cache nebo vedlejší síťový proces.
- Native parity **PASS**: všech 6 meshů má bitově stejné expandované POSITION/NORMAL/UV/COLOR po `[x,z,-y]` a `[u,1-v]`, stejné ordered triangle corners/winding, source identity/root/radius. Žádné zaokrouhlení nebo renormalizace native normál; max původní Float32 délková odchylka `1.79e-7`. Reopen potvrdil původních18meshů a14packedimages beze změny. `native-roundtrip.json` / `native-roundtrip.log`.
- Rank/LOD: normalized uint16 `COLOR_0`, bílé RGB65535, alpha1..65534, žádný mixed-rank triangle. Near/MID 82 100 listů a16 019ranků; FAR16 383/3 214. Full-coverage MID zachovaný. Position bounds přepočtené podle skutečných nových dat; nominal estimates se nevydávají za nové měření.
- Split **27/27 accessor byte+metadata PASS** pro B5, dalších27/27 pro nezměněný R5 conifer. V3 nemá unused accessors/BIN ani nové materiály/textury. `export-evidence.json`.
- Testy: **4/4 PASS**,0skip/fail,1.54s, `tests.log`; fixture testy jsou přenosné, bez ignorované cache. Úzký TypeScript obou nových TS souborů a JS syntax check exit0. Produkční parser+decoder nad skutečnými výstupy: **8assetů/24primitiv PASS**, `decoder-report.json` / `decoder.log`.
- Nezávislý read-only audit `crown_lod_audit`: bez materiálního nálezu; navíc ověřil aktuální SHA exportů/source delta/native zdroje a nezměněné conifer reference proti evidenci. Nic neměnil ani nespouštěl GPU.
- Whole B5: `public/models/vegetation/seasonal-r6/own-broadleaf.glb`,49 398 860B,SHA `7c699d67bf12e4b54b76d147f9db92f7628cab7090361bd159c36ed67c960e98`.
- Stream B5 LOD0/1/2:30 827 004 /15 671 144 /2 901 116B; SHA `d5e3f12ec51ccca625085896ad0bbb08481ba41abb7f8593a167529a0cd472e1`, `681bcd75bcf04bf7899e36f96b9f942096c3d564e70dd6c9bec775cde4cc1a59`, `cf317cb3549da9c3c688d66b2bb300feac25f9c2eddfafc6ff7bbd395912664e`.
- Kontrakty: `/models/vegetation/seasonal-r6/runtime-contract.json` SHA `e3122361447d63c32dbf8460fa227feb18f25216d2c2a0b9f3412d7073594757`; `/models/vegetation/seasonal-r6-streamed/runtime-contract.json` SHA `5491f9ea14e2ecd3d314f5e3a591b5c70e15a08029395c063d63ceb16e5981ea`. Stable prototype `own-broadleaf`, source `ipr-crown-014`, root `[-67.59,-60.96]`, radius `.484`. Root zapojí QA.
- Conifer: whole stále `/models/vegetation/seasonal-r5/own-conifer.glb`,22 078 712B,SHA `61511d8b276c30a5b70d1cada34052ba8c2abed4436011cae3ffe4bdbf241c3b`; v3 původní tři `/models/vegetation/seasonal-r5-streamed/own-conifer-lod*.glb` descriptors přesně zachované. Žádný nový jehličnatý model.
- Neúspěch: první publish odmítl chybně ručně přepsaný SHA pin (znak navíc) před zápisy. Opraven jen pin na skutečně dříve změřený hash; log `publish-failed1-pin-typo.log` zachován. Finální publish/extract/reopen/decoder exit0.
- Checkpoint: `.cache/trees-r6-export-20261026/artifact-manifest.json` zahrnuje generátory, test, dokumentaci, nové public assety i důkazy. SHA manifestu v předávací zprávě; dirty celý checkout není identita exportu.
- Procesy: vlastní Blender background CPU2 extrakce a readback ukončeny, žádný port/GPU proces. `Get-CimInstance` po dokončení neukazuje Blender. Claim/heavy-validation se uvolní po předání; release není integrace.
- Omezení: dvě pilotní identity, původně řídký FAR a původní pruning nižšího dřeva zůstávají. Žádný build/fullsuite/integrace/GPU obraz nebo FPS; root provede skutečnou novou QA přejímku a doplní Linear/společnou evidenci po převzetí.

Reprodukce vyžaduje stejný cwd a vlastní `heavy-validation` claim:

```powershell
. .cache/trees-20261025/activate.ps1
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python scripts/trees-20261026-r6-export/extract.py
node scripts/trees-20261026-r6-export/publish.mjs --publish
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python scripts/trees-20261026-r6-export/verify_native.py
node node_modules/tsx/dist/cli.mjs --test tests/tree-r6-export.test.ts
node node_modules/tsx/dist/cli.mjs scripts/trees-20261026-r6-export/verify-decoder.ts
```

Příkazy přepisují pouze nové exportní výstupy; před opakováním uchovat předaný checkpoint. Původní native/GLB/kontrakty jsou pouze čtené.
