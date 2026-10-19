# Předání CPU rozhodovacího checkpointu KEY-40

Vlastník `threading-01a15535-cpu-profile`,19.10.2026, worktree9b78, baseline b798e72b. Výstup: [evidence](../../performance/evidence/client-threading-cpu-profile-20261019/README.md), omezený diagnostický build a šest skutečných Edge capture, nikoli runtime worker feature.

Scope: vlastní `.cache/client-threading-cpu-profile-20261019/`, evidence, tento handoff a BMAD implementation artifact folder. Čtyři helper soubory převzaty podle explicitního předání podagenta; root Game/UI, cizí138 dirty paths a hrané snapshoty nezměněny. Nový grass worker WIP patří oddělenému tasku/agentovi a není součástí tohoto checkpointu.

Ověření: helper25/25 + scoped/full TypeScript + hidden-map build PASS; nezávislé review helper/analyzer []. Source586 a7 pinovaných SDK hashes beze změny po sběru,27 served files/map identities. Failure startup uchován, žádný readiness/timeout oslaben. Raw/session/map evidence hashováno70 položek.

Rozhodnutí: pouze tile-only worker experiment pod KEY-42. Tráva ve skutečné trase zatěžuje environment3,57/4,77ms, ale samotný placement čas není izolován; selection/batch zůstávají významné kandidáty. Render je větší zbývající obálka. Žádný FPS benefit ani odstranění osmivteřinových záseků se netvrdí. B6/physics/visibility worker odmítnuty jako první volba z důvodů v evidenci.

Procesy: vlastní previewPID25228 aAPIPID33672 ověřeny podle startUTC/path/command a ukončeny guarded stop.ps1. Měřicí tab2070823387 zavřen,4206/2601 volné. Uživatelova4203 zůstává otevřená. Frozen source/dist zachovány. Profilovací GPU práce je dokončena; root ještě používá rezervovaný cache adresář pro izolované cílené testy dalšího tasku. Rezervaci uvolní až po tomto dokončení a finálním předání; žádný dlouhožijící pomocný proces nyní neběží.

Integrace: čeká na samostatný dokumentační commit a koordinovanou integraci. Helper handoff není zde změněn. Celý KEY-40 cíl zůstává aktivní.
