# KEY-31: převzetí konečné startup práce do Game

Vlastník webgpu-completion-01a15a3e-wiring, příjemce kořenový koordinátor této relace. Pracovní kopie .cache/player-feedback-20261020, větev codex/webgpu-completion-20261021. Základ runtime main9341bcef; společný default kandidát bbc50815 zůstává lokální. Žádný cizí WIP není převzatý.

## Přesný rozsah

Tento task vlastní client/game.ts, tests/game-preparation-scheduler.test.ts a toto předání. Doplňkový guard-test task vlastní pouze tests/game-light-preparation.test.ts. Doložená předání startup-loop a startup-verdict pokrývají ostatní disjunktní soubory; root po jejich release převzal konkrétní zdroje/testy přes --adopt-dirty a ověřil přesné SHA. Žádné hromadné stage nebo cizí procesy.

## Výsledek, rozhodnutí a refaktoring

Game po zastavení původního asset preload loop vytvoří jediný StartupPreparationLoop. Předá jej přes oba soukromé prepareLighting/prepareLightingVariants vstupy, ve všech kvalitách stejný. Původní3.argument options inner helperu je zachovaný; nový loop je4.argument. Stávající přímé testové hosty zůstávají kompatibilní. Run/stop jdou přes skutečný synchronní verdict; render líně otevře úplný frame. Bez nových variant, světel, shaderů, cache nebo změny kvality a30/90s rozpočtů.

Poslední light tick resolve svůj výsledek před koncem GPU fence. Proto se po uloženém complete výsledku výslovně čeká na health-guarded loop.waitForIdle(), až pak přebírá snímky původní waitForRenderStartup. Ten dál ověřuje skutečné active meshes/effects, pipeline a submit. Jediný finally ukončí loop i pipeline owner i při výjimce jednoho úklidu. Ready a původní gameplay RAF vzniknou až po celém řetězci. Editor, finální gate a OnDemandRender samotné nejsou přepsány.

Výzkum a srovnání variant v docs/performance/evidence/webgpu-completion-20261021/research/startup-scheduling-decision.md. Nízký browser RAF není označen jako vysvětlený nebo opravený. Scheduler odděluje konečnou práci od prezentace; skutečný čas startu a hraní teprve ověří GPU pilot.

## Skutečné kontroly

První cílená Game sada měla68/69PASS: jediný fail byl původní regex vyžadující přesně dva prepareLighting argumenty. Behavior testy prošly. Guard test nyní vyžaduje aktuální třetí loop argument a stále kontroluje await, pořadí players/preloadstop/ready, outcome log a cancel před scene disposal; není přeskočený ani oslabený.

Po doplnění poslední fence bariéry byly spuštěné tests/game-preparation-scheduler.test.ts + tests/game-light-preparation.test.ts:24/24PASS,0FAIL/SKIP/CANCELLED, exit0, runner2744,2794ms. Nové testy vykonávají skutečný post-loader blok Game.start z AST, nejen jeho text: jediný owner až přes final gate; timeout log před fault; konstrukční/fence/gate výjimky; čekání na pozdní fence před final gate; skutečný quality sequencer předává tutéž loop všemi3kvalitami i WebGL referencí. CPU/fixture není GPU důkaz.

Navazující helpery: light verdict39/39PASS; startup adapter po opravě priority původní chyby39/39PASS a strictTS bez diagnostik. Konkrétní source/test hashy všech7vstupů jsou v research/startup-candidate-source.json. První neměnný snapshot40a363 je před poslední priority opravou, jeho probíhající celá sada se uchová odděleně; nesmí se označit za konečný checkpoint.

## Procesy a další přejímka

Vlastní cílené CPU příkazy skončily. Žádný vlastní server/GPU proces v tomto tasku. Rootvalidation samostatně drží skutečnou celou sadu/build/integraci/porty a GPU. Po samostatném lokálním commitu se tyto source scopes uvolní; task status a Linear Done až po skutečném převzetí.

Zbývá: nový immutable source/test/asset snapshot po poslední opravě, cílené/plné testy, build/integrace a skutečný nový start hry/editoru, obrazová/lifecycle/1a≥3MP a výkonová matice. Žádný FPS přínos, splněný60FPS cíl nebo publikovaný default toto předání netvrdí.
