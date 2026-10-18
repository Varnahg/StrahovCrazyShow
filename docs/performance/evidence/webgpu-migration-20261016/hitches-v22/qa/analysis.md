# Native day coverage: rozhodnutí před implementací

18. 10. 2026, owner `webgpu-native-day-qa-01a14497`, přímý podúkol roota; bez rekurzivního BMAD. Zápisy pouze tento cache prefix a vlastní handoff. Hrané buildy, native source a všechny dependencies jsou vstupy jen ke čtení.

## Doložený řetězec

Native snapshot `2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584` má devět current/night/restore etap. `Game.prepareLighting` používá actual actor/spawn presentation, původní plný camera frustum, skutečný PlayerFlashlight a stávající mapped lamps. Aktuální čas není záruka pokrytí jiných denních kombinací DIR/HEMI/POINT/SPOT. Native smoke Golden/F má +82 WGSL modulů/+57 sync pipelines a maximum6265ms. Canonical define-order patch neopravuje chybějící variantu, pouze sjednocuje identickou plochou literal serializaci.

Primární zdroje: native Game2340–2479/light-preparation a jejich testy; QA define-order-v6 Game2604–2789/light-preparation. Actual async helper (6c7e6e…709b), strict-material-preparation, render-startup, render-health a shadow-readiness jsou mezi native a QA byte-identické. Scheduler se v QA liší pouze výběrem dalších etap. Zachovat pending/new Effect bariéry, dvě skutečně dokončená ready vykreslení, final submitted-frame gate, ObjectRenderer retry, retire/abort/disposal a třicetisekundový visible deadline.

Evidence cíleně přečtená: hitches-v8 actual avatar/entry proof; v9 chybějící Day0; v10 negativní Day pilot a inactive-falloff příčina; v11 vendor oprava; v14 světové Day1 varianty a zachované limity; v15 zamítnutý far-only; v19 define-order piloty. Hitches-v8 dokládá, že existing spawn day1 apply připraví actual avatarové materiály; samostatný avatarový renderer/pohled není nutný. V5 far-only vynechal světové varianty a znovu kompiloval při Golden/F. B6 vyžaduje samostatný clipped orbit/spatial refresh a do tohoto kandidáta nepatří.

## Varianty a volba

- Ponechat9: nejmenší změna, ale neřeší doložený první denní přechod.
- Jen Day1,11etap: užší pokrytí Golden/avatara, nechává doloženou Day0 mezeru. Není zvoleno.
- Day0/Day1 OFF/ON,13etap: zvoleno jako nejmenší již podložený světelný coverage experiment. Stávající apply, full frustum, actor/requested state beze změny. Žádná nová cache/observer/renderer, seznam se vytvoří jednou na přípravu.
- Převzít všech15: přidává B6 camera/lifecycle a startup cenu nesouvisející s prvním spawn Golden/F. Odloženo na samostatný experiment.
- Užší frustum/far-only: již zamítnuté GPU důkazem. Cache nebo stabilní globální slots by měnily širší kontrakt a nejsou součástí tohoto přenosu.

## Startup tradeoff a neznámé

Native devět etap20.1074s proti V6 všech patnáct21.3658s není srovnání ceny jedné etapy. Stejných devět jmen ve V6 trvá14.2356s: current-off2.8465/.7527s; celkem10654/10619 readiness checks,96/67 render callbacků, CPU v renderu12.5938/7.3695s. Night OFF/ON mají1176/1180 checks v obou, nikoli důkaz stejných identit meshů. Native preload dělá budget/stable/render; C5 navíc dříve updatePreloadVisuals. To dokládá různou historii, ne příčinu celého rozdílu. Nepřenášet cizí preload/startContent/world/UI/pipeline retention.

QA Day0+Day1 dohromady4.36–4.67s je naměřená cena v těch bězích, nikoli zaručený native přírůstek. Native pod30s zbývá9.89s, ale nová kombinace může limit překročit. Root musí změřit celý input→ready na stejné nativní scéně a při timeoutu/regresi kandidáta odmítnout; limit/readiness se nezvyšuje ani nezkracuje. Bez slibu odstranění všech82modulů, B6 záseků nebo zlepšení steady FPS.

Read-only root výpočty `.cache/webgpu-hitch-validation-20261017/native-day13-preflight-comparison.json` a `native-smoke-timeline-audit.json` obsahují vstupní SHA a časování. Golden předcházel nativnímu benchmarku; samotné F uvnitř okna má797ms CPU a následný6265ms interval se síťovými callbacky. Celý interval se nepřipisuje JS ani driver execution. Tyto podklady se tímto úkolem nemění.

## Přesný scope a inventory

Pouze copied `client/game.ts`, `client/light-preparation.ts`, `client/webgpu-compilation-profile.ts` a jejich tři odpovídající testy (`game-light-preparation`, `light-preparation`, `webgpu-compilation-profile`). Game změna jen profiler options a prepareLighting. Native Game/UI/cinematic/camera/default i patch/lock/package zůstávají stejné.

Opt-in:13prep labels včetněrestore +construction/assets/submitted-frame/ready =17Game jmen; inventory vždy začíná `unassigned`, tedy18položek +overflow => explicit19. Povolit již QA ověřený bounded hardcap21 při nezměněném default16, pouze pro maxStages; ostatní limity nezměnit. Game nastaví19 jen při existujícím lokálním environmentProfile. Nejde o novou diagnostickou vrstvu. Bez tohoto nastavení by restore/submitted-frame/ready spadly dooverflow.

## Ověření před předáním

Nejprve stejné nové assertions nad původními třemi runtime soubory (RED), pak copied candidate (GREEN). Přímý Node/tsx, TSX_DISABLE_CACHE=1, frozen QA core/loaders se shodnou identitou. Původní assertions zachovat; dvě nově přesné očekávané konfigurace mohou doplnit nové schválené cap chování. Testovat13/9 pořadí, skutečné světelné membership, aktuálnírig/settings restore, pending/hotswap/timeout/retired a inventory default/19/21/clamp/overflow/privacy/release. Scoped TS plus stávající related Game startup/lifecycle/render-engine beze změny. Žádný fullsuite/build/GPU/install/commit. CPU okno koordinovat s rootem kvůli časovanému nezávislému proofu.
