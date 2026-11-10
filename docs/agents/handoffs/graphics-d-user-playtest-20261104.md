# Uživatelský test na D · 4.11.2026

Vlastník graphics-d-user-play-20261104; chráněný checkout D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, větev codex/graphics-smoothness-20261104. Hraný runtime odpovídá bf0a6550 a source/tests3fe11a12ebd947e03581444e08f1b15b707f34abd6ec827badcb236841ef6132. Existující immutable candidate1/build/dist se nepřestavuje.

Problém: uživatel chce sám otestovat zbývající záseky. Hypotézy nejsou změnoukódu; jediný zásah je spuštění vlastního serve run2 a logování. Metrika je skutečný rawprůběh jeho hraní/CPU/GPU/síť. Správnost: správnáURL/identita/viditelnost a nová session vuloženémcollectorovi. Přijetí spuštění vyžadujeGame.ready a průchoddiagnostiky; není přijetímcelkovéplynulosti.

URL http://127.0.0.1:4179/?renderBackend=webgpu, API2568. Žádnéprofilovacíquery, viewportoverride aniSDKboti; uloženýprofilhráče a vlastníovládání. Počasí je explicitněoznačenýQAfixture. Původní8080/kartyzachované. Běhemhraní žádnédalšíbuildy/testy/3Dscény ani změnychráněnýchzdrojů/assetů.

Launcher .cache/graphics-d-user-playtest-20261104/launch.mjs používá existujícíserve, systémovýsampler60min aheartbeatkaždých10min. Servermá90minlimit. ProvozníPID/časyjsou jen v launcher.json a run2/runtime.json, ne vcommitu. STOP: .cache/render-next-20261102/candidate1/runs/run2/STOP. Po skutečnémukončeníserveru/sampleru auloženémAPIcleanup launcher uvolní svůjclaim; release neznamená přijetítestu.

Hernílogy .cache/game-diagnostics/<session>.jsonl a případné .part-NNNN. API/benchmarky v .cache/render-next-20261102/candidate1/runs/run2/. Systém v .cache/graphics-d-user-playtest-20261104/system/. Po uživatelském hotovo nejprve načíst logy včetněrotací a ověřitGame.dispose; nezahajovat automaticky další běh. Snímkypřekryvy/délkynesmějí být skryté ani vydané za zelenou přejímku.

Ukončení a převzetí4.11: uživatel dokončil hraní a schválil implementaciUltra. Game.dispose doložen; STOP API + launcher + sampler čistěukončené, inputsRevalidated=true. Nezávislýarchiv celýchrawlogů aidentity sroundtripSHA je v docs/performance/evidence/ultra-graphics-20261104/user-playtest/. Celkováplynulost aničasovépokrytínení vydánozaPASS.
