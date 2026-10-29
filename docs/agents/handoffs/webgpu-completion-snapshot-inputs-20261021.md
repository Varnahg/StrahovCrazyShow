# Předání: webgpu-completion-snapshot-inputs-20261021

- Vlastník `webgpu-completion-01a15a3e-snapshot-inputs`; příjemce `/root`.
- Pracovní kopie `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/webgpu-completion-20261021`, převzatý HEAD `fc2f3eb94e0119b2ad57cba7fdfbab3fd5d1d7a0`. Před zápisem přečten task/spec/context/AGENTS/BMAD policy, stav/worktrees/registr a získán claim. Přímý podagent bez dalšího BMAD nebo delegace.
- Výsledek: opravena úplnost budoucích source/test snapshotů; nikoli runtime rendering ani již existující frozen kopie. Rootův fullsuite40a363 s1912PASS/9FAIL/2SKIP zůstává původní důkaz, tato dílčí oprava jej nepřejmenovává na PASS.
- Vlastní změny pouze `scripts/performance-snapshot.mjs`, `tests/performance-snapshot.test.ts` a toto předání. Žádný staging/commit; všechny cizí runtime/config/asset změny ponechány vlastníkům. Dockerfile/compose/JSONL jsou pouze čtené vstupy, jejich bajty nejsou upravené.

## Průzkum, varianty a volba

Skutečný `tests/diagnostics-report.test.ts:590` čte přesný sousední `docs/performance/evidence/diagnostic-identity-20261020/input.jsonl` před původním plain Node CLI testem. `tests/feedback-deployment.test.ts:28/196/213` čte root Dockerfile a compose.yaml pro zmrazený build command a shodné nastavení writable feedback cesty; tyto kontroly nespouštějí skutečný Docker. Původní freezer kopíroval samotné testy/scripts, ale žádný z těchto tří vstupů neměl v explicitním entries. Tím je ENOENT mechanismus doložený zdrojem; nejde o WebGPU/render failure.

Vybrány pouze tři přesné entries. Projdou existujícím společným before/after/frozen SHA ověřením a originálním copy/manifest lifecycle. Varianta kopírovat celou docs/performance/evidence nebo všechny docs by zahrnula živé reporty, rozšířila zápisové/vstupní vlastnictví a zbytečně rozkolísala source identity; není potřeba. Přesun fixture nebo oslabení/skipping consumer testů by změnily ověřovaný kontrakt. Žádná změna cache, hrané kvality, balíčků nebo runtime lifecycle; zvýší se pouze explicitní snapshot vstup o5635B těchto tří nynějších souborů.

Refaktoring testu sjednotil duplicitní seznam vyloučených mutable/local souborů. Mini-fixture používá skutečné aktuální bajty tří consumer vstupů. Parametrizovaná původní during-copy mutace teď ověřuje i všechny tři nové vstupy; žádné rozšíření produkčního freezer algoritmu nad explicitní whitelist nebylo potřeba.

## Skutečné ověření

- Před opravou scriptu nové targeted regrese nad původním freezerem: **0/2PASS,2FAIL,exit1**. Manifest neobsahoval tři soubory a chybějící consumer fixture nebyl odmítnut; původní výstup v tool chunk `ec187a`.
- Konečný příkaz `pnpm --config.verify-deps-before-run=false exec tsx --test tests/performance-snapshot.test.ts` dne21Oct2026 přibližně09:44UTC: **9/9PASS,0FAIL/skip/cancel,exit0**, duration6421.466ms, stdout tool chunk `ba7781`.
- Skutečné Node CLI mini-fixture případy ověřily přesné kopie a SHA všech inputs včetně tří reálných souborů; změnu source identity každého static prerequisite; odmítnutí přepisu existujícího snapshot jména; before/after drift každého ze tří nových souborů a AGENTS při copy; missing-input odmítnutí s absencí published manifestu/node_modules; zachování předchozích bajtů a manifestu; původní read-only IPR reuse i refusal při jiných bajtech.
- Sousední `live-report.json` a `unrelated.jsonl` ve stejné fixture evidence složce zůstaly vyloučené spolu s původní mutable dokumentací/cache/backupy. Tím se ověřuje přesný soubor namísto broad directory copy.
- Scoped strict TypeScript: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --lib ES2022,DOM,DOM.Iterable tests/performance-snapshot.test.ts` → **exit0,0diagnostik**, chunk `8c44b6`.
- `git diff --check -- scripts/performance-snapshot.mjs tests/performance-snapshot.test.ts` → exit0 bez diagnostik. Rozsah diffu6řádků runtime whitelistu a relevantní testový refaktoring/regrese; žádný nový runtime API.

Identita konečných bajtů v09:44:26.795UTC:

| Soubor | Bajtů | SHA-256 |
|---|---:|---|
| scripts/performance-snapshot.mjs |7136|34416f3c636fa1a313f4cba28799dbdd3fc38b6057c9dd5d1a8b0c2a2b3fc864|
| tests/performance-snapshot.test.ts |13503|fe01821936622950b48c5b73ee74850b65e9951a96e5b54f90afaa195e0854b7|

SHA256 JSON objektu cest s `{sha256,bytes}` v uvedeném pořadí: `76b81b3feddac78b22aa0d3ce2bc7b6005314ecad107524c4c7a86f781f0d9b0` (předání mimo self-hash).

Původní pouze čtené vstupy: Dockerfile2031B/SHA `379ad675c4bef625af18b8c0c7bc31eea4797735fcfc6f32ca99e24640517786`; compose.yaml658B/SHA `75bc97d3c4ba76cbff6baf78c2edc71ce254ed77e5e6b5cd34fee9ddea6c098a`; JSONL2946B/SHA `4056d5f4cb396a9b0dfd92d2cc915a7bda3ed1f8146fbfa99873f15e52dd96c6`.

Procesy a zdroje: pouze dokončené lehké Node/tsx/tsc procesy. Mini CLI kopírovalo malé vlastní `tmpdir()/strahov-freezer-*` fixtures a t.after je uklidilo v ověřeném prefixu; žádný velký source/assets snapshot, port/server/build/GPU/fullsuite nebo dependency install. Žádný vlastní helper proces nezůstává. Žádná starší frozen kopie není změněná.

Omezení/další krok: root musí vytvořit nový kompletní source/test/asset snapshot a zopakovat plnou sadu. Ostatních šest původních VM startup fixture chyb vlastní samostatný task; tímto úzkým předáním se jejich oprava netvrdí. Stejně tak se netvrdí browser/GPU/performance nebo Docker runtime acceptance.

Rezervace: konkrétní tři cesty předány rootovi a následně uvolněny pomocí agent-tasks release. Stav tasku/integrační commit určuje root.
