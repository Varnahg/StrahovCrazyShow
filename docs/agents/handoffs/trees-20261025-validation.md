# Průběžné předání ověřovacího okna R4

Root `trees-validation-01a16b37`, D worktree `codex/trees-realism-20261025`, základ `8516c7b1`. Vlastní evidence a snapshoty zůstávají rootovi; toto není dokončení KEY-62 ani main přejímka.

Candidate-v1 kompletní `pnpm test` byl po doloženém public import selhání a neurčených selháních nezměněných autodev fixture ukončen jako zastaralý známý neúspěšný snapshot. Logy a konkrétní ukončené vlastní procesy jsou zachované v `interrupted-v1.json`. Žádný cizí nebo herní server nebyl tímto ukončen. Public import byl opraven přes shodný source Bark012 descriptor; původní meziběh s převodem formátu data je zachován, finální guard/loader18/18 PASS.

Candidate-v2: 188/188 zasažených CPU testů PASS; build našel chybějící typové zúžení v nové regresi. Candidate-v3 s jedinou testovou opravou má loader12/12 PASS, produkční build PASS, izolovanou integraci PASS. Všechny frozen source obsahují testy; identita v3 `7feab98cdcec6752ae78a2a2fb80b31dda93dfd68e519d119b59be6519e9a018`. Přímé čtecí záznamy skutečných Edge benchmarků a fotografie jsou popsány v `docs/verification-evidence/trees-20261025/pilot-v3.md`.

R4 obrazová kontrola neakceptovala hromadný katalog: zřetelný pokles hustoty LOD1, nákladná near geometrie a nevhodná far kamera zakrytá stadionem. MTree zůstává řidší srovnávací varianta. B6 evergreen nezmizel při zimním preview. GPU celkové výsledky nejsou plná multiplayerová/celoroční přejímka a takty grafiky se měnily.

Build/test/integrační procesy skončily. Port2568 je volný. Vlastní NVIDIA sampler byl ukončen po ověření PID a command line. Edge testovací karta byla převedena na about:blank a viewport override resetován; nedrží běžící 3D scénu. Nový immutable server4180 zůstává pod samostatným preview-port claimem. Staré buildy4179/2592 nebyly změněny, jejich procesy zanikly při obnovení aplikační relace a dosud neběží.

Root nyní odděluje evidence ownership od procesního okna: validation task zůstane bez resources, nový resource-only `trees-20261025-validation-window` bude vyžadovaný před dalším fullsuite/build/integrací/GPU měřením. Heavy-validation se skutečně uvolní a R5 modeler jej může získat vlastním bake claimem. Před další vlastní editací evidence se root vrací do stejného claimu s doloženým adopt-dirty. Kompletní test suite, další GPU/backend/LOD kontrola, commity a main integrace zůstávají otevřené.

## Navazující v9 a předání okna R6 · 26. 10. 2026

V9 source `81830a82b03828f03e02392f2c88606bbca4108b58a7b56853c9c6df2c0bd072`: 129/129 targeted, build, izolovaná integrace PASS; skutečný default WebGPU start všech 41 etap a medium benchmark bez chyb. Úplná sada 2227 PASS /16 FAIL /3 SKIP z2246 není přeznačená na PASS. Všech16 dotčených případů následně prošlo izolovaně nebo po přesných opravách tří fixture souborů; společná nová cílená sada84/84 a celý TypeScript PASS. SHA audit8810 původních vstupů prokázal změnu pouze těch tří testů, runtime/assety beze změny. Podrobnosti v `docs/verification-evidence/trees-20261025/webgpu-v9.md` a aktuální sekci `docs/verification.md`.

Rootovy test/build/integration/sampler procesy skončily, port2568 je volný a Edge2070824464 je about:blank. Immutable server4182 v9 běží pod samostatným port claimem (PID42932, parent48076, worldId2WkKs2p); původní user buildy se nemění. Root skutečně uvolnil `trees-20261025-validation-window`. Heavy-validation nyní drží `trees-20261026-r6-shape` pro samostatný CPU nativní pilot. Root během něj nepouští build/fullsuite/GPU/Blender; GPU claim dál chrání prázdné testovací okno. Main integrace ani konečný modelový katalog nejsou dokončené.

26.10.2026 pokračování: root archivoval pouze bajtově shodné duplicitní dist soubory v6/v7/v8 proti zachovaným immutable public zdrojům; receipts dist-duplicate-archive.json. Vlastní proces24315 ukončen před další verzí, další potvrzený výstup nebyl. Všechny původní zdroje/testy/assety, compiled klient, logy i chráněné user buildy zachované. Heavy okno nyní výslovně předává agentovi far_r6_design pro celý R6 FAR fit/bake; root GPU nepouští.

26.10 po dokončení v12 produkčního buildu: root čeká na Edge foreground a předává heavy okno agentovi catalog_rollout_plan pro vybrané čtyři native geometrie (BlenderCPU2), nikoli celou populaci. Runtime server10692 na4182 zůstává neměnný, sampler neběží, žádný GPU benchmark není aktivní. Root bude pokračovat GPU až po vrácení okna.

26.10 po v12 Edgepřejímce: defaultCM FAR/sezóny prošly,19.5FPS není60FPSakceptace. FastNCM timeout se synchronním shaderModuleCPU zůstává otevřený a není default. Vlastní GPU sampler63180 skončil v10min limitu, Edge testová karta je blank. Ověřené immutable hardlink reuse v6/v7/v8/v9 uvolnilo místo; D18.3GB. Root vrací heavy katalogovému agentovi pro finální B5native paket,severníFAR a skutečnou pause/resume hranici. Hromadná produkce naváže pouze po těchto kontrolách a explicitním root pokynu.

## Pokračování27.10: úplný katalog a v13

Katalogový autor dokončil110/110, audit a atomickou publikaci. Root převzal release a zdrojový scope, aktivoval Game a vytvořil immutable v13 `d381c244f9e667ebfe85c420133effbca0fa0c4b9326d27f8593cd148a13a9f7`,9444vstupů. Přesné accepted cesty v `docs/trees/20261025/catalog-release.json`; nestagovat celé katalogové adresáře (16nepřijatých cest).

Build/TSC PASS. Celá sada2345:2337PASS/5FAIL/3SKIP,1156,25s. Všech5selhání byla chybějící statická fixture `catalog-release.json`/`.gitattributes` v testu snapshotu. Opravený celý soubor5/5PASS; stejná oprava také5/5PASS ze samostatného immutable korekčního snapshotu. Audit9444původních vstupů potvrzuje pouze tento testový rozdíl (`7d317af5c4708a66cb366e245ffc482e5771e071d4f4cbe5001666eefcfa46ce`), runtime/assety identické. Izolovaná integrace v13 PASS, exit0. Původní failure log se nemění. Veškeré tyto procesy skončily.

Dva Edge/GTX1060 starty na pevném B5 hero pohledu skončily timeoutem při přibližně1Hz RAF během světel. Druhý byl spuštěný browserovým AX ovládáním a před render loopem naměřil59,9Hz, které příprava neudržela. Žádné navýšení timeoutů ani odstranění kontrol; GPU přijetí není dokončené. Samplery47492/53520 ukončeny po ověření identity. Uživatel má čekající žádost o ponechání Edge skutečně v popředí.

Živý neměnný server: PID60528, port4182, receipt `.cache/trees-diagnostic-server-20261026/server-v13-catalogue-01.json`. Edge browser1/tab2070824671 je znovu v hlavní nabídce na `http://127.0.0.1:4182/?terrainReview=b5-tree-hero` a ponechaný pro navazující uživatelské potvrzení. Jen avatarový náhled; druhá herní scéna ani Blender neběží. GPU a port claim chrání toto připravené okno; heavy okno se po úklidu uvolní. Před dalším GPU znovu získat heavy a zkontrolovat skutečný stav procesů/URL.

Byteově ověřený read-only reuse v13 public→dist zachoval obsah a uvolnil5,01GB duplicit; D přibližně7,9GB volných. Budoucí LFS staging potřebuje až6,25GB, proto kapacitu ověřit před zápisem. `.cache/trees-validation-20261025/owned-stage-plan.json` je pouze předběžný seznam vlastních změn; po dalších úpravách jej znovu sestavit. Žádný commit, PR, project-acceptance ani main integrace této etapy zatím nevznikly. BMAD pokračuje ve fázi03; konečná praktická přejímka chybí.

## Dočasné předání starých cache k úklidu · 28. 10. 2026

Koordinátor `trees-validation-01a16b37` předává operace nad starými neměnnými statickými kopiemi v `.cache/terrain-validation-20261025/` a `.cache/trees-validation-20261025/` koordinátorovi `cleanup-01a17fe0`, chat „Smaž neaktivní chaty a větve“ (`01a17fe0-11ea-7401-ae77-9ff148a83282`). Přímá lidská autorizace „Ano, domluv předání a ukliď“ byla ověřena čtením tohoto chatu; zadání výslovně zachovává aktivní práci a neintegrované změny. Přesný rozsah a omezení určuje `docs/agents/tasks/d-cache-cleanup-20261028.json`.

**Chráněný prefix:** `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025/.cache/trees-validation-20261025/candidate-v13/` je zcela vyloučený jako zdroj i cíl. Chráněné zůstávají D main, pracovní zdroje/assety/WIP, node_modules, Git/LFS a existující servery. Nesmějí se měnit obsah ani atributy inode sdíleného s v13/main. Neměnné soubory dříve propojené hardlinkem vyžadují ověření skutečné identity, nikoli jen názvu. Další starý prefix v uvedených cache nevyžaduje samostatnou fyzickou kopii, pokud zůstane původní cesta a bajtově shodný obsah a jsou splněné všechny ochrany tasku.

Povolena je pouze nově ověřená náhrada samostatné statické duplicity hardlinkem mezi starými neměnnými kopiemi. Jedinečné soubory, source/testy, compiled JS, logy, manifests a receipts zůstávají zachované; rekurzivní mazání snapshotů je zakázané. Příjemce si sám získá claim `d-cache-cleanup-20261028` z D worktree a zapíše vlastní výsledek do svého cleanup handoffu. Vlastní plán úklidu ani jeho dokončení se tímto předáním nepotvrzují.

Původní root při tomto předání nespouští validační pomocníky, nic nededuplikuje a po zápisu tohoto předání uvolňuje pouze `trees-20261025-validation`. Běžící v13 spadá pod oddělenou rezervaci portu; ta ani GPU/ostatní claims se neuvolňují. Do celého původního validačního scope se root vrátí až po oznámení výsledku a release cleanup tasku. Vlastní změna tohoto handoffu je doložený rootův WIP pro pozdější převzetí, nikoli cizí změna.

## Přijetí úklidu a návrat validačního scope · 28. 10. 2026

Koordinátor cleanup-01a17fe0 předal dokončený úklid v docs/agents/handoffs/d-cache-cleanup-20261028.md a skutečně uvolnil rezervaci. Root ověřil SHA-256 evidence-manifest.json (4b44f14516fc25cdd9494bd1ae35d429704a01fa585ead514d4c379986b2e589) i všech 13 připnutých důkazních souborů, status PASS a počty v verification.json; znovu nepouštěl celý asset audit. Doklad autora zahrnuje 3921 zachovaných cest/nových immutable hardlinků, 43483 nezměněných chráněných souborů v13/main, 34 původních WIP souborů a shodný HTTP klient. Pozorovaný fyzický nárůst volného místa D je 26888486912 B, konečné volno přibližně 27,6 GB.

Čistý main zůstává de6f87a2efbf8596bb03efae863e8d6763e22774. Původní root znovu získal trees-20261025-validation pod trees-validation-01a16b37 s doloženým převzetím své jediné změny tohoto handoffu. Cleanup task je administrativně done. Nové sdílené archivní assety jsou read-only; před budoucí editací oddělit vlastní writable kopii, nikdy nezapisovat skrz sdílený inode. Žádný build, GPU, browser, server ani placené API root při převzetí nespouštěl.
