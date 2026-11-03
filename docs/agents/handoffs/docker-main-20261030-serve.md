# Předání: docker-main-20261030-serve

## Aktuální služba po KEY-72 dne3.11.2026

Tato aktualizace nahrazuje níže uvedenou původní identitu image z30.10. Provozní vlastník i port8080 zůstávají stejné. Přijatý koordinovaný switch je doložen v [produkčním předání KEY-72](discord-kb-20261103-production-switch.md).

Game je nyní `strahov-crazy-show:git-c82c6b33`, IID `sha256:73a983eae229181a5d42ebb632d1957b54af6a57ca0f601a2fdf559c3a442edf`, kontejner `1800e89ee46596e9c338fc55a88492a1465fa22e7b8c0b1be915d58406e3f330`. Tools `strahov-rag-tools:git-d05c893e`, IID `sha256:5697d2cc4ad2aa1daba16fdd3d57076d69348775377a693a07f3f3bcc5958ece`. DB je schema3, původní DB kontejner, všechny4volumes a secret C mount zachované. Hra i DB healthy, AI enabled; skutečný syntetický dotaz se2novými kurátorovanými citacemi PASS.

Budoucí `up` z kanonického checkoutu musí použít `-p strahovcrazyshow-main-20261027 --env-file .env -f compose.full.yaml -f .cache/discord-kb-20261103/validation/release/compose-images.yaml` a `up -d --no-build --pull never`. Override je nyní provozní závislost: chránit jej před úklidem a nenahrazovat starými local tagy/schema2 runtime. Bootstrap má budget0/0. Portový claim není uvolněný; po skončení deploy kontroly nezůstává rezervované heavy-validation.

## Historické spuštění30.10.2026

- Vlastník/integrátor `docker-main-01a189a0-serve`, kanonický C checkout na `main`. Přímé zadání30.10.2026: zapnout hlavní main přes Docker.
- Docker Desktop byl vypnutý. `docker desktop start --detach` obnovil existující projekt; následný kompletní Compose build/start použil aktuální zdroj `1b7d2413bc4d1a32b14f593f3d67543340fa2204` a skončil0. Hra běží na `http://localhost:8080/`, mapování pouze `127.0.0.1:8080 -> 2567`.
- Název Compose projektu `strahovcrazyshow-main-20261027` je zachován kvůli identitě dat. Game a bootstrap nyní používají kanonický C checkout; secret bind je `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/secrets/openai_api_key.txt`. Obsah klíče nebyl vypsán. DB kontejner zůstal původní, jeho historický working-directory label není závislost na staré kopii; používá named volumes.
- Game kontejner `8a1cd3df93ef25222e86b7da202a1a2e6538fcbb3064afeaf4a9656ad63ff1e5`, image `sha256:8b9e42b4f3228ffaba67645326ae08b36eaa098ca2d9ccc622a11083b89ac91a`. DB kontejner `da6c0315dac72be8ce1b34efc68a820e7d6142f46dd61eba9151f3dc1ff3edd6` zachován; oba jsou healthy. Jednorázové rag-secrets a rag-bootstrap skončily0.
- Všechny čtyři named volumes zachované. Bootstrap: public i public-documents `action: unchanged`; nedošlo k nové publikaci dodaných podkladů. Metadata před/po, HTTP výsledky a závěr jsou v `.cache/docker-main-20261030-serve/{before,after,http-checks,verification-summary}.json`.
- Praktické ověření: `/api/health`200/ok:true, `/api/ai/status`200/enabled:true, `/api/presence`200/online:0, hlavní HTML200 a `/assets/index-Cd89_BZ6.js`200 (6019211B). In-app browser skutečně vykreslil hlavní obrazovku, počet0 a ovladač Crazy Typky; uživatelská karta ponechána otevřená.
- Omezení: nebyla odeslána placená chatová otázka ani spuštěn3D/GPU test. enabled:true potvrzuje konfiguraci a RAG readiness, nikoli nové ověření modelové odpovědi. Chybějící Linear credentials ve feedback službě nejsou změnou této práce.
- Žádná změna runtime kódu ani refaktoring; pouze provozní spuštění a evidence. Build/helper procesy skončily. Docker aplikace zůstává na přání uživatele běžet, proto claim `port:8080` zůstává držený; release až po koordinovaném zastavení služby.
- Administrativní převzetí katalogu: předchozí koordinátor `main-consolidation-01a189cd` skončil a uvolnil claims podle svého handoffu a chatu. Tento koordinátor převzal jen opatrování katalogu; existující necommitnutý `main-lfs-index-recovery-20261030.json` zachoval beze změny, SHA256 `86e394f505df5e2a23b32dd85fd6293ef7619f117da64e21e1fa522d64cc8e1b`. LFS recovery nepokračovalo a tento soubor ani tři ostatní původní untracked podklady nevstupují do commitu.
- Integrátor přijal build a HTTP/browser startup důkazy. Jde o provozní přejímku, nikoli nové prohlášení o úplné funkční či výkonové přejímce hry.
