# Koordinační předání WebGPU → vícevláknový výzkum

Uživatelský souhlas s koordinací obou vláken byl přímo ověřen v nové relaci. Příjemce je vlákno01a15535-be83-7be2-94c5-595287555490, worktree9b78. Původní WebGPU cíl zůstává v relaci01a15102-92ff-7250-a7a5-b7ec6305e1c4. Worker architekturu zde souběžně neimplementujeme.

## Připravený úkol

`C:\Users\rezac\.codex\worktrees\9b78\StrahovCrazyShow\docs\agents\tasks\client-threading-research-20261019.json` obsahuje požadovaných pět writePaths a resources[]. Je zatím nezarezervovaný: nový vlastník získá vlastní claim z9b78. Obsah cizíhoWIP nebyl převzat. Další runtime/renderer/GPU změny potřebují samostatný disjunktní task.

## Administrativní slot

Původní admin claim je v`C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, owner`webgpu-01a15102-admin`. Po tomto předání jej původní vlastník uvolní; před claim ověř skutečný registry. V původní worktree je přesně sedm pending taskJSONů, žádný další dirty admin-scope soubor. Jejich úplné cesty, SHA-256, délky a bezeztrátové zálohy jsou v`admin-adopted-handoff.json`. Všechny zůstaly byte-exact. Nové vlákno je jejich výslovným příjemcem pro ochranu a následnou koordinační správu, nikoli pro libovolné přepsání či označení Done.

Nejjednodušší krátký admin claim proveď z této původní worktree pod svým ownerem a`--adopt-dirty` jen po kontrole těchto sedmi otisků. Nepoužívej`--adopt-dirty` v9b78 na všechny copied cizí tasky. Po vlastních metadata změnách admin slot opět uvolni. Nekopíruj celý starý katalog do nové worktree; definice nového výzkumného úkolu je pouze v9b78.

## Uvolňované zdroje

manual-01 je stopped,617vzorků,cleanupErrors[]; collector a jeho vlastníNvidiahelpery již neexistují. Root po zapsání předání uvolní`webgpu-system-telemetry-20261019` (heavy-validation/gpu/system-gpu-telemetry) a dokončený`webgpu-system-collector-helper-20261019`. Uvolnění ověř v živém registru; staré taskready samo nic nerezervuje. Neznamená to dokončenou migraci.

## Zachované živé buildy

4201/2596,4202/2597,4203/2598 zůstávají pod původními serveclaims. Jejich zdroje, dist, dependencies a procesy se nepřepisují ani neukončují. SDKf8`.cache/webgpu-shadow-share-native-qa-20261019/clean/node_modules` je readonly vstup živé4202/4203; jiný SDKexperiment potřebuje izolovanou kopii. Starší4188/4192 a další hrané verze zůstávají chráněné i při neaktivnímportu.

## Přesná data posledního testu

Frozen raw data jsou v`C:\Users\rezac\.codex\worktrees\29fa\StrahovCrazyShow\.cache\webgpu-system-telemetry-20261019\manual-analysis-01`.`input-manifest.json` váže OS52,5MB SHA`cdd4367fe10c103dae1cd4a1bc26fce61018efdbccda8917fb952aa5b8ff4de0` a herní2,65MB SHA`8c2fea5401289b1465b35aae9154f1365ab8ef8413ca2933c5a39e2d90229a88`.`derive.mjs` reprodukuje`derived.json`; exportované souhrny jsou vedle tohoto handoffu.

182 plněforeground/readyOSvzorků: GTX1060median31%,p9539%,max47%; VRAMpeak3420/6144MiB, poGame.dispose732MiB a konec803MiB. Thermal/powercap/brake0active. Pravděpodobný herníEdge renderer CPUmedian105,6%jednoho logicalCPU, GPUprocess47,6%; PID není přímo svázán s tabem. Medium8761frames48,67FPS,p9531,2/p9943,7/max1071,9ms; High7578frames44,06FPS,p9538,1/p9946,1/max216,9ms. Render má~89–90% GameCPUwall; wall neníCPU runningtime.

Dva druhy záseků:208,2ms s previousCPU207,1/render186,4ms, ale1071,9ms s previousCPU42,9ms. Druhý typ má neobjasněnou mezeru předRAF; driver/scheduling není rozlišen. Žádné okno nemělovehicle=true, prvníjízda tím není přijata. Qualitybloky nejsou matchedA/B.

## Hranice další práce

Původní vlákno dále řeší prokázaný cached shadow-pass baseEffect mismatch a lifetime:`docs/agents/handoffs/webgpu-shadow-pass-state-helper-20261019.md`, frozen helpermanifest eceb2f51c9a2258c1b24d98af72c92ed385aefecd2eb7ef76fce5ae137ca29c6. Neopravovat workerem nesprávný výběr efektu; současně tento RED neprokazuje příčinu všech1s mezer. Výzkum workerů může běžet nezávisle, přípravu společných runtime souborů a GPUoken dál koordinujeme.

Sedm pendingJSONů má také verzovanou bezeztrátovou zálohu v adopted-pending/; otiskycompressed i original jsou v manifestu. Připravený nový taskJSON v9b78 je výslovně předán novému koordinátorovi k vlastní metadata publikaci. Před každým pozdějším GPU měřením je stále nutné ověřit skutečné běžící scény; volný registry resource neznamená, že prohlížeče a cizí aplikace GPU nepoužívají.
