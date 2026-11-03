# KEY-72: skutečné produkční přepnutí

- Vlastník `discord-kb-switch-01a189a0`; příjemce koordinátor KEY-72 v chatu `01a19e0f-821c-7d01-b0dd-9dbcd006444f`. Kanonický checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, výchozí HEAD `3cef7b4ee60600e25f397c18d4e0cb4edd87dd2b`.
- Oprávnění: uživatelem schválený plán KEY-72 výslovně zahrnuje aktivaci po ověření a koordinaci provozních vlastníků; text plánu byl v této relaci ověřen přímo čtením původního chatu. Konkrétní READY předání obsahovalo přesné image, scope a nulový embedding budget.
- Výsledek: **produkční přepnutí PASS** dne 3.11.2026. Starý game byl prokazatelně zastaven před migrací. Compose switch začal `2026-11-03T12:18:34.7727375Z` a skončil `12:18:43.8566067Z`, exit0; nejde o přesné měření délky HTTP výpadku.

## Použitý checkpoint a příkaz

Game `strahov-crazy-show:git-c82c6b33`, IID `sha256:73a983eae229181a5d42ebb632d1957b54af6a57ca0f601a2fdf559c3a442edf`, OCI revision `c82c6b33872c42174b351df47677adc40741c474`. Tools `strahov-rag-tools:git-d05c893e`, IID `sha256:5697d2cc4ad2aa1daba16fdd3d57076d69348775377a693a07f3f3bcc5958ece`, OCI revision `d05c893e6bbdd557e19f4ceb351b6de60b9aa002`. Identita byla ověřena před i po spuštění; žádný build ani pull neproběhl.

Z kanonického checkoutu byl použit původní Compose projekt a implicitní konfigurace převedena na explicitní `--env-file .env` beze změny hodnot. Merged game environment se přesně shodoval se starým kontejnerem. Před `up` proběhlo `stop game` se stejnými Compose argumenty a kontrola `Running=false`.

```powershell
docker compose -p strahovcrazyshow-main-20261027 --env-file .env -f compose.full.yaml -f .cache/discord-kb-20261103/validation/release/compose-images.yaml up -d --no-build --pull never
```

Poslední override musí být zachován i při budoucím `up`: `local` tagy byly ponechány původní, samotný základní compose tedy není správný příkaz k obnovení tohoto vydání. Starý tools c82 ani schema2 runtime se po migraci nesmějí naslepo vracet. Žádné migration markery se neupravovaly.

## Preflight a ochrana původních dat

- Původní game IID `sha256:8b9e42b4f3228ffaba67645326ae08b36eaa098ca2d9ccc622a11083b89ac91a`, healthy; schema2, oba původní heady a všech18 tabulkových počtů shodné s baseline manifestem. Aktuální online0 znovu ověřeno bezprostředně před zastavením.
- SHA256 obou allowlisted SQL záloh z `validation/production-baseline` znovu shodné s manifestem. Zálohy, původní image i checkpointy zůstaly zachované. Žádné role, hesla, syrové Discord zprávy nebo feedback nebyly exportovány touto prací.
- Všechny čtyři named volumes beze změny: `strahovcrazyshow-main-20261027_` + `rag-data`, `rag-owner-credentials`, `rag-reader-credentials`, `feedback-data`.
- Původní DB kontejner `da6c0315dac72be8ce1b34efc68a820e7d6142f46dd61eba9151f3dc1ff3edd6` nebyl nahrazen. Secret mount stále vede z `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/secrets/openai_api_key.txt` do `/run/secrets/openai_api_key`; hodnoty se nevypsaly.

## Postflight

- Nový game kontejner `1800e89ee46596e9c338fc55a88492a1465fa22e7b8c0b1be915d58406e3f330` a původní DB healthy; bootstrap a rag-secrets exit0. Log bootstrapu potvrzuje published u obou headů.
- Schema3 se třemi migračními záznamy; žádné pending bootstrap checkpointy. Public head `b0c9aaf79a6868ce9d6a7ac037c607885186f545a65cbd2bbbdee96abe97661c`; public-documents head `8fc2afc10a92f41e05e3e630b1efe15d834818eac47eff78fef1a4fed8dd1096`.
- Přesný set všech145 document sourceVersion IDs i aktivních dokumentových ID souhlasí s neměnným tools seedem: původní extracted dokument a144 nových kurací. Všech35 původních legacy sourceVersion IDs i původní ready revize zachované.
- 145 document versions,200 document chunks,200 aktivních document membership řádků,45 aktivních legacy chunks,245 cache položek. Historické membership řádky zůstávají; globální součet membership není aktivní počet.
- Všech101 původních cache klíčů má po přepnutí shodný hash původního input textu a vektoru. Bootstrap měl explicitní budget0 inputs/0 bytes, `rag_embedding_attempts` zůstává0. Nové144 vektory pocházejí z připravené schválené cache.
- Health200/ok:true, AI status200/enabled:true, presence200/online0, hlavní HTML200 a nový klient `/assets/index-DPaSDupe.js`200/6026825B.
- Jeden autorizovaný syntetický dotaz k závadám při převzetí pokoje: HTTP200 za8183ms, dvě nové `knowledge-curation` citace (`908fad522d98853c6db354832edc96706de5faa25583e636ab5991464e8d49ac`, `478796bb2007fe7c07f84675440af0f2a386056e88a15b1b0f152307b9c3fbf2`). Relace po testu zrušena DELETE204; token nebyl uložen ani vypsán. Po dotazu stále schema3/cache245/embedding_attempts0. Tento modelový dotaz je oddělený od nulových bootstrap embeddingových volání.

## Evidence, rozsah a lifecycle

Vlastní `.cache/discord-kb-20261103/production/` obsahuje `before-db.json`, `after-db.json`, `before-containers.json`, `after-containers.json`, `deploy.log`, `bootstrap.log`, `http-checks.json`, `asset-check.json`, `synthetic-chat.json`, `after-chat-counts.json` a reprodukční `capture-db.mjs`/`smoke-chat.mjs`. Capture používá read-only repeatable-read transakci. Chatový smoke se automaticky neopakuje.

Změněné verzované soubory jsou pouze toto předání a aktualizace vlastního `docker-main-20261030-serve.md`. Cizí render WIP zůstal nedotčený; nebyl do nasazení sestaven ani commitnut. Refaktoring není relevantní pro tento provozní switch. `docs/verification.md` drží jiný aktivní vlastník, proto tuto evidenci převezme koordinátor bez přepsání jeho práce.

Nevznikl nový full-suite/GPU běh. Převzaté omezení přejímky zůstává:2896PASS/5SKIP/2setupFAIL, přesné izolované reruny2/2PASS, integrationPASS, retrieval49/52 a20guardů bez kritického porušení; původní Wi-Fi fail-closed výsledek se nemaže. Tento handoff nepřeznačuje celou historickou sadu na PASS.

Vlastní pomocníci skončili. Po commitu a předání se uvolňuje `discord-kb-20261103-production-switch`/heavy-validation. Provozní `port:8080` zůstává pod `docker-main-01a189a0-serve` a aktualizovaným serve handoffem, protože hra má dál běžet. Koordinátor KEY-72 přijímá důkazy a teprve poté uzavírá task i celou issue.
