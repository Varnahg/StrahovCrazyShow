# Převzetí source checkpointu

Root převzal výhradně doložené vlastní změny původního autora po release a novém claim `--adopt-dirty`. Rozhodující je manifest `efa737806c1ee9bda6fb1d90cef06bde7f3a0fb8fd01d9155c3773f90cc4f2d0`: 201/201 cílených CPU testů, scoped TS/UI/diff bez diagnostik, všech16 payload SHA ověřeno také rootem. Původní192/b91 checkpoint není finální.

Nezávislé čtecí review renderer peerem: otevřené nálezy `[]`. Předchozí konkrétní nálezy vedly k regresím a opravám exact self yaw/contact, známé remote LOD/presentation, společného vehicle deadline a kontinuálního remote20Hz pohybu přes50ms fence. Historický counterexample zůstal zachován a green používá skutečné Game/RenderStartup metody.

Příprava nyní přijímá vlastní on-foot authority jako render anchor a zachovává známý roster. Actor/authority queue/frontier/ack/replay/sampling zůstávají v původním UI drain. Remote presenter při dt0 před každým skutečným renderem vytvoří konzistentní submitted frame; následná validace ověřuje jeho actual root/rotation/LOD/visibility a živé owner/epoch/roster/profile/scene guards. Novější targety během fence se dál přijímají a převezme je další render či původní interpolace. Nejde o garanci nejnovější remote pose při release.

Původní90s quality budget a společný30s visible gate/handoff budget, GPU scopes/fence/readiness/health jsou zachované. Explicitní ready revalidation neopakuje preparing→ready přechod. Owned preload callback je zastaven před ručním gate; gameplay se spustí až po úklidu. Žádný nový normal-frame lease branch.

Toto je source/CPU checkpoint. GPU přijetí ještě chybí: wrapper záměrně stále obaluje původní `await g.start()`, takže startup receipt předchází UI drain/handshake. Ve skutečné hře musí být navíc původní loading-off a `preparationViewReleased=true`. Samotný startup resolved/ready nepřijímá celou migraci, FPS ani generic vehicle view. Native instance-buffer patch/lock je samostatný cizí WIP a do tohoto commitu nepatří.

Root staging zachovává také původní TAP failure výstupy s Node indentovanými prázdnými řádky; jejich raw SHA se kvůli whitespace nepřepisuje. Source/doc check používá command-local cr-at-eol a vyloučí pouze raw *.tap v tomto evidence prefixu. Child diff-check0 byl před stagingem untracked raw výstupů; nevydává se za kontrolu jejich verbatim obsahu.
