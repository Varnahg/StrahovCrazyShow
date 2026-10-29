# KEY-31: izolovaná diagnostika dlouhých snímků

Root drží task webgpu-hitch-validation-20261017 a původní GPU/heavy reservations. Oddělená QA4194/API2589, source C5 c4e22edd…be6f5; chráněná4193 obnovena totožná a nemění se. [Průzkum, evidence a omezení](../../performance/evidence/webgpu-migration-20261016/hitches-v1/README.md).

Předchozí QA služby včetně receiver kandidáta byly ukončeny výhradně podle vlastních runtime records. Nyní běží4194/API2589 z původní QA kopie `gpu-fence-pending`, snapshot3cf48f74ff65aac859d5fa8869abd8da775cee66f85d2df5ff5ac4428d54507b, run `fence-control-after-torch`. Game je po měření opuštěná, QA karta about:blank. Runtime record v `.cache/webgpu-hitch-validation-20261017/runs/fence-control-after-torch/runtime.json`; root nadále vlastní služby a porty, release neproběhl.

[Druhá evidence](../../performance/evidence/webgpu-migration-20261016/hitches-v2/README.md) uchovává4úplné gzip logy, zdrojové identity/diffy, přesné counter páry a testové/build logy. TimestampOFF zásek neodstranilo. První fence sonda používala nesprávnou aggregate-health eligibility a nic nezměřila; nová actual RenderHealth regrese chybu odhalila a22/22 + scopedTS3361/0 i fullTS/Vite build prošly. Nejde o výkonovou opravu ani finální přejímku.

Session8716d28a-7a9b-4bac-bb9f-71dd189ee073: prvníF na prahuB6, zónaoutside,1,586sGameCPU/56programů/796Effect změn, poté8,568sRAFgap a8,7252s post-submit completion latency. Raw+1/process+1, queuewait+8507,4ms/CPU+60,5ms; uvnitř běží síťovéJS aHTTPflush. Závěrečný cleanup:0render/asset errors, profilertracked0. PřesnéGPU/driver místo neníprokázané; fenceobsahujecompletion i callbackdelivery. TrasaobsahovalapřerušenýCUAvstup a skutečnýnávrat, nenímatchedA/B.

Root přijímá childfence předání pouze jako QA nástroj. Receiver kandidát byl po63 nativních/79 kombinovaných cílených testech, fullTS/build a GPU pilotu **nepřijat**: v téměř shodné b6:0 poloze zůstává6,18s proti6,34s kontroly a přibývá trvalý ON gate≈4,58ms/snímek. Experiment18701037dd3d8faae9b7bd1807ecfbf23e18aec4 je přesně vrácen db9018b8114770e0c71cd2e9b4000303d210b55e. [Třetí evidence](../../performance/evidence/webgpu-migration-20261016/hitches-v3/README.md) uchovává oba logy, zdrojový patch a skutečný CPU shadow proof. Plná sada/integrace tohoto zamítnutého kandidáta neběžely. Hraná4193/C5 se nepřepisuje.

Další sběr využije existující UI benchmark s compilation.start/end. Startup inventář nemá údaje o prvním F; zatím nelze z čísel programů odvozovat jeho depth-token podíl nebo identické WGSL/pipeline. Žádná nová cache ani runtime normalizace není tímto předáním přijata.


## Pokračování 18. 10.: startup async a produkční kontrola

Předchozí runtime stav výše je historický. GPU měření startupv1/v2, tři QA páry, prvníF a cancel/reentry jsou ukončené, raw zmrazené v [hitches-v5](../../performance/evidence/webgpu-migration-20261016/hitches-v5/README.md). Aktuální4194/API2589 běží z `.cache/webgpu-hitch-validation-20261017/async-production-v3`, snapshotec2802daf9426f63814054627adf5a18f04cd54eb2da20e800eb1a89feb6c563, run async-production-candidate1; QA karta je po měření about:blank. Runtime record zůstává pouze v ignorované cache; root drží porty a odpovědnost.4193/C5 c4e22…e6f5 zůstala beze změny.

Tři QA páry i produkční pár podporují startup změnu, nikoli finální FPS přejímku nebo vyřešené F. Native1296 a produkční1352 fulltest/build/integration PASS, main232cffb. PrvníF6197,4msgap/+80modulů/+59sync dál otevřené; příští kandidát smí vzniknout až po skutečném B6 presentation/layout proofu.

## Pozastavení a předání koordinátorovi KEY-44 — 19. 10. 2026

Tento dodatek nahrazuje historické údaje o živých službách výše. Na výslovný pokyn uživatele „ostatní relace klidně odstav“, ověřený v chatu 01a155b2-1927-7681-9a9e-090b6c7bd974, je další implementace relace 01a14497-e7d1-7571-b940-b31c359a50cf zastavená. Příjemcem je koordinátor KEY-44. Neproběhl commit, integrace, plné testy, build ani GPU práce; společný katalog, AGENTS a docs/verification.md nejsou měněné.

Pracovní kopie: C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow, větev codex/webgpu-migration, HEAD 278b0bfe297cd7cc12e9563084e27d25cb6ed6d6. Před odstavením nebyly tracked/staged změny. Nativní nepředaný source WIP nebyl nalezen; níže zachované kandidáty jsou již zmrazené experimenty. Root/BMAD/admin rezervace již této relaci při zahájení odstavení nepatřily; neobnovovat zastaralý desetipoložkový heartbeat-own.mjs.

Procesní cleanup ověřen 2026-10-19T20:26:29Z: 12 živých vlastních Node procesů ukončeno až po přesné shodě uloženého PID, startUTC, executable path, task/owner a očekávaného příkazu. Poslední dva QA procesy byly již ukončené. Všech 14 vlastních portů je bez listeneru; žádné ukončování podle samotného čísla portu. Historická znovu použitá PID z jiných běhů byla rozpoznána jako cizí a ponechána. Operační PID a přesné command/cwd identity zůstávají pouze v ignorovaných receipts `.cache/webgpu-hitch-validation-20261017/shutdown-20261019/before.json` a `after.json`, nepatří do commitu. Provozní logy/runtime records ani snapshoty nebyly mazány nebo přepisovány. Prohlížeč jako sdílený proces nebyl ukončen.

Předané rezervace určené k uvolnění po tomto zápisu:

| Task | Owner | Porty |
| --- | --- | --- |
| webgpu-profile-preview-20261016 | webgpu-migration-01a14497-profile-preview | 4193 / 2588 |
| webgpu-hitch-validation-20261017 | webgpu-hitch-validation-01a14497 | 4194 / 2589 |
| webgpu-day13-user-build-20261018 | webgpu-day13-user-build-01a14497 | 4195 / 2590 |
| webgpu-opaque-user-build-20261018 | webgpu-opaque-user-build-01a14497 | 4196 / 2591 |
| webgpu-low-vehicle-user-build-20261018 | webgpu-low-vehicle-user-build-01a14497 | 4197 / 2592 |
| webgpu-grass-user-build-20261018 | webgpu-grass-user-build-01a14497 | 4198 / 2593 |
| webgpu-image-processing-user-build-20261018 | webgpu-image-processing-user-build-01a14497 | 4199 / 2594 |

Uvolnění procesních rezervací není Done migračního úkolu. Stav zdrojových a procesních rezervací dále určuje živý registr; tato relace neponechává skrytou vlastní implementaci. Záznam prvních šesti release je v ignorovaném `shutdown-20261019/releases-before-final.json`; hitch claim bude uvolněn poslední po dokončení předání. Žádný restart bez nové rezervace.

### Obnovitelné výstupy, které se nesmějí smazat

- Sedm necommitnutých dvojic task JSON + handoff s prefixy: webgpu-authored-fog-proof-20261018, webgpu-authored-light-candidate-20261018, webgpu-authored-light-coverage-proof-20261018, webgpu-light-switch-profile-20261018, webgpu-preparation-baseline-candidate-20261018, webgpu-standard-ibl-define-proof-20261018, webgpu-standard-lod-define-proof-20261018. Každý má `.cache/<task>/manifest.json`; nic z toho se během odstavení nepřepisovalo. Necommitovat automaticky všechny experimenty jako přijatou implementaci.
- 44 souborů necommitnuté evidence `docs/performance/evidence/webgpu-migration-20261016/authored-light-coverage/`. Výchozí hash inventář všech 58 untracked souborů je v ignorovaném `shutdown-20261019/before.json`.
- Poslední nearchivovaný sběr: `.cache/webgpu-hitch-validation-20261017/runs/light-switch-profile-1/` (`session.jsonl`, `first-car.json`, `first-car.jpg`, `mesh-profile-summary.json`, runtime/logy). Source 26878bbf37f9ad983272081a7466c6a9309cff7405c9e3e3bde1ba6cd1b523fb, session fb25342a-057b-4fb8-ae0c-b0900f8b67c9. Tři úplné vzorky: při vstupu do auta příprava 123,7 ms + bind/draw 44,1 ms; další přechod 64,8 + 28,5 ms. Diagnostická CPU data, nikoli další optimalizace nebo čisté FPS A/B.
- Kandidát `.cache/webgpu-light-switch-profile-20261018/candidate/` a QA `.cache/webgpu-hitch-validation-20261017/light-switch-profile-v1/`. Cílené 14/14 a scoped TS; QA full TS/build již dříve PASS. Žádný přenos diagnostiky do main během odstavení.
- Všechny user-build snapshoty 4193 a 4195–4199, zejména `image-processing-native-v2`, `image-processing-combined-v2`, `.cache/webgpu-image-processing-user-build-20261018/`, jejich dependency kopie/junction targets, přípravné a startovací skripty. U 4193 je poslední runtime `webgpu-migration/runs/combined-v5-preserved-20261017-1816/runtime.json`; 4195 používá runtime-v2/snapshot-v2, nikoli původní runtime. Build 4199 source 3d405db9a4430e266bf390f1e029d46c6d71ddc64b77a5118ae146f4adedc82f zůstává zachován, jen služby jsou vypnuté.

Historické přijaté runtime změny a důkazy jsou již v main; tato relace během odstavení nepřebírá ani neposuzuje novější práci dalších relací. KEY-31, úplná přejímka a default migrace nejsou tímto předáním dokončené. Další krok a případné převzetí obnovitelných kandidátů určí koordinátor KEY-44.