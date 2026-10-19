# Přijetí externího GPU/CPU loggeru

19.10.2026: přijat nástroj mimo aplikaci, nikoli dokončená výkonová přejímka hry. Hraný4203source65d028 ani starší buildy se nemění. Postup je v [návodu](../../../system-gpu-telemetry.md).

Sampler `6ddb22c68e2d4b30fbf4734c346c0422545d78fcd81ccad5b62236594f3737fb` používá nativníPDHwildcardarrays, GetProcessCPU a dlouhožijícíNVIDIA-SMI.16pure/faultkontrol, PowerShellparser, nativeC#marshal/layoutcompilePASS. Root12/12parser/correlationtestsPASS. ActualCLI nad20smokevzorky a3starými herními relacemi správně nevytvořil žádný časovýpřekryv.

Přijatý smoke04:15warmup+5steadyvzorků při2s, konec16:36:09UTC. Vlastní ustálený CPUčas loggeru0,841–4,390%jednoho logickéhoCPU, průměr2,596%; NVIDIAhelper0–0,786%. ProtectedWmiPrvSECPU/starttime nedostupné, nikoli0. Bezoverruns, vlastníhelperyukončeny/cleanupErrors[]. VyššístartupCPU85,8% je zachován, novýručnítestzačne až po30swarmup. Krátkýidlehostsmoke nedokazuje nulovou režii při jiné zátěži.

Předchozí tři pokusy zůstávají odmítnuté:01CIM67–111%onecore+chybnýNVIDIAargument,02CIM19–68%+cleanupidentitymismatch,03nativnícold83→21%+nullmodulepathcleanup. Recovery ukončily pouze doložené vlastníprocessy. Finální pathfallback využívá přesnýtrustedStartProcessFilePath astartticks; žádné ukončování podle samotného jména čiPID.

Nezávisléreview našlo4opravitelnéchyby analýzy: agregovanýproviderbracket, přílišpozdnílimitvelikostisouboru, timezone-lessUTC a přeznačení staréhoNVIDIAřádku aktuálnímčasem. Všeopravené sregresemi, posledníreview[]. Neznáméhodnoty, konfliktysekvencí, PIDreuse, focuspřechody a rozdíl previous/currentCPU zůstávajíexplicitní.

`manifest.json` váže44artefaktů. Rawkomprese je bezeztrátová a má uloženépůvodníhashy. Aktivní operationalruntime/PIDfiles se nepublikují. Nic zde ještě neurčuje, zda konkrétní uživatelský zásek způsobiloCPU, ovladač, VRAM čiGPU; k tomu slouží následující společný záznam skutečného hraní. Celéhernípnpmtest/build/integration se pro nezměněnouherníčást nespouštělo.
