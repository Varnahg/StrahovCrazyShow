# Ověření vydání

Herní runtime vychází z commitu `c82c6b33872c42174b351df47677adc40741c474`. Následný commit `a4d17194` zpřesnil audit a jeho potvrzení bez změny obsahu, sourceVersion IDs nebo embeddingových vstupů. Commit `d05c893e6bbdd557e19f4ceb351b6de60b9aa002` opravuje pouze bootstrap a jeho testy. Proto se používá přesně otestovaný game image c82 a opravený tools image d05.

| Kontrola | Skutečný výsledek |
|---|---|
| Frozen instalace a build | PASS; zdroje exportované z pevného Git commitu, LFS ověřené SHA/velikostí |
| Úplná testovací sada runtime artefaktu | 2 903 testů: **2 896 PASS, 5 SKIP, 2 FAIL** |
| Přesné izolované opakování obou selhání | **2/2 PASS**, bez změny aplikace, testů nebo timeoutů |
| Izolovaná integrace | PASS, včetně multiplayeru, network/input backlog, respawnu a feedbacku |
| Skutečné PostgreSQL regrese | 20 PASS; migrace, původní revize/cache, atomické publikování, ACL a expirace |
| Fresh/upgrade/opakovaný bootstrap | PASS, stejné cílové heady, opakování unchanged, 0 API volání |
| Oprava bootstrapu po expiraci | Reprodukce FAIL → 22/22 PASS + tsc + nezávislé review; 22/22 také ve finálním Linux image bez sítě |
| Skutečný PostgreSQL po expiraci | Zachovaný head při třech kontrolních hranicích, bez vrácení prošlé evidence a bez API volání |
| Praktický AI klient | Skutečné dotazy i rozbalené zdroje; 0 canvasů a 0 konzolových chyb |
| Konečný Linux game image | Healthy, AI enabled a správná odpověď s novou oficiální kurací pod omezeným readerem |
| Závěrečné hashe | Všech 21 810 runtime a 172 tools zdrojových souborů po kontrolách shodných |
| Původní vstupy | Všech 245 souborů, včetně 180 HTML, beze změny |

Úplný první běh se nevydává za zelený. Jedno selhání způsobilo vyčerpání 15s čekání při přípravě nezměněné `autodev-adapters` fixture; vlastní ochrana proti souběžnému reviewerovi nebyla porušena. Druhé bylo omezení dlouhých cest Windows Git v dočasném repozitáři testu `recorded-walkthrough-replay`. Oba testy následně prošly na stejném artefaktu s `--test-concurrency=1` a procesním `core.longpaths=true`; systémové nastavení se neměnilo. Originální logy i stacky jsou zachované v neveřejné validační cache.

Bootstrap po vypršení termínu nepřijímá prošlé current kurace jako nové upserts. Již uložené verze a cache zachová; runtime je po termínu nepoužije. Všechny seed bundles se nejprve validují, budoucí či chybné údaje se nezamlčují a původní pending guardy zůstávají. Při neuzavřeném checkpointu přes hranici expirace je konflikt stále výslovně odmítnut, bez smazání checkpointu či automatického placeného retry.

Samostatné PostgreSQL testy použily pouze injekci `Date.now` v odděleném procesu, nikoli změnu hodin počítače nebo databáze. Při 10. 11. 2026, 3. 12. 2026 a 1. 2. 2027 existující snapshot ponechal všech 145 dokumentů a stejný head. Fresh databáze po první hranici publikovala 104 způsobilých dokumentů, pozdější expirace jí revizi neměnily. Dotaz pro 2. 2. 2027 v obou případech vrátil nula prošlých podkladů; cache zůstala 245, placená volání nula.

Game image ID: `sha256:73a983eae229181a5d42ebb632d1957b54af6a57ca0f601a2fdf559c3a442edf`.

Tools image ID: `sha256:5697d2cc4ad2aa1daba16fdd3d57076d69348775377a693a07f3f3bcc5958ece`.

Runtime manifest SHA: `a087f53fcdcb2bcad70ad9e6dfe95998da3cb6d33f4cb093ae624de93518f78c`. Tools manifest SHA: `e35b4b567491bc2aca52ead4ad9dad3197688c6fe4a5b69f2955ccdeb9fa7d03`.

## Produkční výsledek

Vlastník běžící verze provedl přepnutí 3. 11. 2026 ve 12:18:34–12:18:43 UTC, po potvrzení nulového počtu hráčů. Starou hru zastavil před migrací. Nový game je healthy, původní DB kontejner zůstal zachovaný, bootstrap i secrets helper skončily s exit0. Root nezávisle potvrdil HTTP health a `AI enabled`.

Schema je 3. Public head je `b0c9aaf79a6868ce9d6a7ac037c607885186f545a65cbd2bbbdee96abe97661c`, public-documents `8fc2afc10a92f41e05e3e630b1efe15d834818eac47eff78fef1a4fed8dd1096`. Přesné sourceVersion IDs všech 145 dokumentů souhlasí se seedem. Aktivních je 200 dokumentových a 45 legacy chunků; cache má 245 položek. Všech 35 původních legacy sourceVersion IDs, původní dokument a staré ready revize zůstaly zachované. Všech 101 původních cache řádků má stejný hash textu i vektoru.

Nasazení nepoužilo nový build, pull ani importní embeddingové volání. Původní čtyři named volumes a secret mount jsou stejné. Jediný syntetický produkční dotaz k závadám při převzetí pokoje prošel HTTP200 za 8,183 s a vrátil dvě nové kurátorované citace; testovací relace byla poté zrušena. Health, AI readiness, HTML a nový klientský bundle mají HTTP200.

Přepnutí je doložené commitem `2b11a56324095440cf18c8f54a524e240bae5ad6` a [produkčním handoffem](../../agents/handoffs/discord-kb-20261103-production-switch.md). Port8080 nadále spravuje původní provozní vlastník. Testovací procesy a validační rezervace jsou uvolněné; stage volume, staré image a zálohy jsou zachované.

## Obnovení stejného vydání

Trvalá verzovaná kopie přesného produkčního override je [compose-release.yaml](compose-release.yaml). Z kořene projektu použít původní konfiguraci/prostředí a tento soubor jako poslední override:

```text
docker compose --project-name strahovcrazyshow-main-20261027 -f compose.full.yaml -f docs/rag-ingestion/20261103-discord/compose-release.yaml up -d --no-build --pull never --wait game
```

Použitý cache override při prvním switchi se zachovává kvůli historii Compose. Trvalá kopie má stejné bajty a odstraňuje závislost budoucího příkazu na pracovních artefaktech. Původní `:local` tagy stále odkazují na starší vydání; nepoužívat je proti schema3 bez nového ověření. Starý runtime se nesmí slepě vracet pouhým přepsáním migration markerů. Pro další vydání vytvořit nové ověřené image a odpovídající override.

Podrobná integrační evidence je v [handoffu](../../agents/handoffs/discord-kb-20261103-validation.md), obsahové limity a jednotlivé odpovědi v [kontrole generování](generation-review.md).
