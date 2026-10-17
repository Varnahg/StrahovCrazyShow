---
title: 'KEY-31: odstranit dlouhé čekání po změně světel a materiálů'
type: 'bugfix'
created: '2026-10-17'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '86e0b6460514231b97d3159b640e85a7f2337c1f'
baseline_worktree: 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/agents/tasks/webgpu-hitch-validation-20261017.json'
---

<frozen-after-approval reason="Uživatel17.10 výslovně zadal řešit osmivteřinové záseky, chránit hraný build a průběžně integrovat">

## Intent

**Problém:** Po přepnutí F, času a při odchodu z B6 vzniká přibližně sekundová přestavba materiálů a potom6–8sekund bez herního snímku. Síťové callbacky během dlouhé mezery fungují. Uživatel musí dostat plynulou změnu stejného herního obrazu.

**Přístup:** Změřit příčinnou hranici existujícím rawRAF/engine profilem, porovnat rozumné opravy, zvolit nejmenší doložený zásah a ověřit celý přechod i startup. Hraná4193/C5 a starší4192/4188 zůstanou neměnné; měření používá samostatnou4194/API2589.

## Boundaries & Constraints

**Vždy:** stejné světlo, stíny, materiály, geometrie a profily. Oddělit JS CPU, chybějící RAF a GPU dokončení. Zachovat úplnou readiness, timeouty, failure ownership a disposal; měřit source/backend/quality/rozlišení/polohy/počasí.

**Nikdy:** falešné ready, vypnutí validace či stínů, prodloužení watchdogu, vynucení webgpu-fast, cache či profiler bez důkazu. Žádný cizí WIP v commitu ani změna hraného dist.

## I/O & Edge-Case Matrix

| Stav | Vstup | Očekávání | Selhání |
|---|---|---|---|
| První F | medium/B6:0, venkovní start | Souvislé snímky a správné světlo | Vadná pipeline zůstane explicitní fault |
| Čas/quality/LOD | Noc, návrat ven, jiný pass | Aktuální správná varianta bez globálního churnu | Stale efekty se nepřijmou |
| Vlastnictví | Změna během přípravy, odchod/device loss | Poslední požadavek, cleanup starých zdrojů | Žádný pozdní submit |
| Evidence | raw RAF versus Game/engine cadence | Identifikovaná hranice prodlevy | Hypotéza není příčinný důkaz |

</frozen-after-approval>

## Code Map

- C5 session4ecc6280-d257-4858-ada1-3ab856ce4691, safety-v16 evidence:849/907/1098. Po55/53/56 nových programech následuje8,001/6,564/7,075s mezera; probe callbacky, HTTP flush a server tick běží uvnitř ní.
- `client/game.ts`: frame, applyAdaptiveQuality, prepareLighting, updateEnvironment. Warmup používá aktuální kvalitu/pozici a camera-active meshe; low venkovní start není důkaz medium/B6/F pokrytí.
- `client/webgpu-frame-lifecycle-profile.ts`, `webgpu-compilation-profile.ts`: existující lokální opt-in měří whole frame, queue-to-process a rawRAF. Zároveň zapíná inventář s režií; nejde o FPS přejímku.
- Pinned9.30 `abstractEngine.pure.js`: begin→render→end→queue bez await. `webgpuEngine.pure.js`: end/flush/encoder.finish/submit a pipeline/bindgroup cache. Sync handle neprokazuje dokončenou GPU kompilaci.
- `client/flashlight.ts`, `client/art-lighting.ts`: lokální light enabled/membership. Pinned Light.canAffectMesh nekontroluje range; ten platí až ve shaderu. Omezení vyžaduje důkaz nulového příspěvku a konzervativní bounds.
- C5 již obsahuje cizí persistent cinematic pipeline; nekopírovat čistý WT přes tuto práci. Runtime main odpovídá native-v16, fyzický strom C5 plus pozdější test-only regrese.

## Tasks & Acceptance

**Execution:**
- [x] Rekonstruovat tři hitch řetězce a ověřit sémantiku časů, souběžnou síť a server.
- [x] Baseline4194: stávající profil a skutečný B6/F přechod; uložit source a raw data.
- [ ] Po profilu uzavřít varianty a přesně přidělit runtime/test soubory. Spec zůstává draft do technického rozhodnutí; lidské oprávnění nechybí.
- [ ] Implementace, cílený refaktor, regrese, samostatný commit a integrace; nový kandidát a srovnatelný důkaz.

**Acceptance Criteria:**
- Given stejný problémový přechod, when kandidát opakuje F/čas/quality/B6, then zkrátí celou prodlevu bez chybného obrazu či přesunu nepřiznané pauzy do startupu.
- Given nový checkpoint, when se uvádí přínos, then důkaz zahrnuje stejné podmínky, zdravou generaci, startup a frame intervaly; profiler není finální FPS.

## Implementation Notes

Původní4193 procesy při pokračování neběžely; obnoven totožný frozenC5, žádný rebuild. QA task má vlastní porty/cache. Oficiální BMAD renderer použil týmové overrides. Produkční oprava zatím není zvolená.

Dokončený baseline profil nevysvětlil několikasekundové mezery synchronním endFrame/flush (max1,7ms). Jeho globální raw maxima patří startupu, proto vznikla jen QA kopie cadence: dvě bodová volání existujícího snapshotu při rawFrameMs>=250, bez nové diagnostické vrstvy či hooků.9/9 actual Game testů a fullTS/build PASS. F3755,6ms:raw+1/process+1/queue3699,1ms/CPU56,5ms; noc4049,7ms:raw+1/process+1/queue4002,4ms/CPU47,3ms. Generace/epochy/host shodné, bezcap/background/errors. Prodleva tedy leží v doručení rendering opportunity; GPU příčina zůstává hypotéza.

Kontrolní QA-only timestamp-query OFF před Game/Scene zásek neodstranilo. Snapshot02cbf7ad…feb0af, session199a3381-ff90-48b2-8b30-a0279f182a51: první F má948,4ms CPU burst a poté3472,1ms interval; raw+1/process+1/queue3418,6ms/CPU53,5ms. Requested feature zůstává dostupná, engine timing flag je false. FullTS/Vite build PASS. Jeden běh nedokazuje rychlostní rozdíl; OFF se nepřijímá jako produkční oprava. Factory per-pass queries přidávají resolve/copy/submit/mapAsync, ale nejsou nutnou podmínkou této reprodukce. Clustered lighting bylo odmítnuto jako úzká oprava: nepodporuje aktuální shadow/STANDARD falloff a mění binding/lifecycle.

Následuje QA-only fence po skutečném endFrame submit. Pinned pořadí potvrzuje test skutečných WebGPUEngine.endFrame+flushFramebuffer; právě jeden pending observer/Promise, bez await či flush v herní smyčce.17/17 actual Game testů a scopedTS3361/0 PASS; nezávislé read-only review nemá blokující nález. Raw epoch se zapisuje, ale není součástí fence guardu: při korelaci RAF musí být shodný. Completion latency zahrnuje dřívější GPU frontu i doručení callbacku; není čistým časem GPU. Kód existuje pouze v oddělené QA cache.

Výzkum a probe je průběžně commitnutý WT3258d49 → main221edc8. Při cadence buildu pnpm11 ověřovací default install přepsal31 instalačních metadat/bin shim souborů ve sdílené závislostní složce; kontrolovaných6 core/patch hashů zůstalo shodných, C5 source/dist se nepřepisovaly. Další QA build přešel na přímý Node tsc + Vite configLoader native;31metadata hashů, root entries a .vite-temp mtime před/po jsou shodné. Žádná neznámá metadata se nevracela odhadem.

## Spec Change Log

## Review Triage Log

## Design Notes

Porovnat přesnou async pipeline přípravu, omezený předstih pro B6, konzervativní membership, stabilní sloty s nulovou intenzitou a dávkování. Širší warmup může zhoršit startup, stabilní sloty spotřebovat light budget, dynamické membership vytvořit churn, obecný async helper minout texture/instance/pass descriptor. Absence slow API logu nevylučuje pozdější GPU čekání. Nejdříve existující profil.

Read-only audit pinned9.30: convenience createRenderPipelineAsync používá geometry buffers/override=null/textureState=0 a nemá úplný render state, proto není bezpečný drop-in. Přesné vstupy jsou až v _draw před getRenderPipeline. Existující preWarmPipeline používá správný zachycený cache token, ale nemá pending dedup ani generation/disposal guard před vložením výsledku. Startup-only sběr musí navíc pokrýt vlastní clear cache a timestamp submit cesty. Živé F není pouze async přepínač: ShadowDepthWrapper při změně base Effectu disponuje dosavadní depth efekty a vytváří nové náhodné tokeny. Připravit ON a během čekání obnovit/renderovat OFF může zrušit právě připravovaný výsledek. Široký engine patch zatím není zvolený; nejprve dokončit fence důkaz a porovnání variant.

Primární zdroje: [W3C LoAF](https://www.w3.org/TR/long-animation-frames/), [GPUWeb GPUDevice](https://gpuweb.github.io/types/interfaces/GPUDevice.html#createrenderpipelineasync), pinned Babylon9.30 a [Edge Performance](https://learn.microsoft.com/en-us/microsoft-edge/devtools/performance/reference). Konkrétní GPU/driver příčina ještě není prokázaná.

## Verification

Cílené pinned CPU reprodukce a strictTS. Stabilní native i combined `pnpm test`, `pnpm build`, izolované `pnpm test:integration` podle runtime rozsahu. GPU série na odděleném checkpointu;4193 se nepřepisuje. Neprovedené scénáře zůstanou UNVERIFIED.
