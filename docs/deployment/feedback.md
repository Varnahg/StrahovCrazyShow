# Herní zpětná vazba

Formulář je v úvodním menu, v herním docku a pod F8. Automaticky přiloží snímek samotného 3D canvasu bez HTML HUD, chatu, minimapy a jmenovek. Hráč vidí náhled a může snímek odebrat. Při nedostupném rendereru lze poslat text s důvodem chybějící fotografie.

Klient neposílá nic z právě rozepsaného hlášení před stiskem Odeslat. Starší potvrzené pending hlášení se může opakovat při návratu online či dalším otevření hry. IndexedDB je best-effort: odmítnutí kvóty, soukromý režim a smazání browser dat nemají zaručenou obnovu. Do přijetí vlastním serverem se zobrazuje čekání, nikoli potvrzení doručení. Fronta je omezená na5hlášení/20MiB; po7dnech přestane automatické odesílání a hráč může obsah uložit či odstranit.

## Nastavení serveru

Nastavte proměnné přímo v prostředí procesu nebo v neveřejném souboru mimo Git a Docker build context:

- FEEDBACK_DIR: absolutní zapisovatelná cesta na persistentním disku/volume. Výchozí .cache/feedback je vhodné jen pro lokální použití.
- FEEDBACK_ALLOWED_ORIGINS: seznam přesných veřejných originů oddělených čárkou, například https://strahov.example.cz. Za reverse proxy je potřeba explicitní veřejný origin; forwarded hlavičkám se nevěří.
- LINEAR_API_KEY: osobní API klíč, výhradně serverový. Alternativně LINEAR_ACCESS_TOKEN pro OAuth Bearer.
- LINEAR_TEAM_ID a LINEAR_PROJECT_ID: pevné cílení projektu.
- LINEAR_STATUS_ID: nepovinný stav příchozího ticketu, jinak výchozí týmový Triage/Backlog.

Nikdy nepoužívejte VITE_ prefix pro přístupové údaje, nedávejte je do URL, klientských souborů, screenshotů, testovacích fixtures ani verzovaných .env. Při spouštění přes Node lze použít --env-file s cestou na soubor spravovaný uživatelem; samotné hodnoty nevypisujte. Compose předává pouze názvy proměnných a připojuje feedback-data do /data/feedback. Omezení ACL a zálohování jsou odpovědnost provozovatele.

Bez nastavení Linear server hlášení trvale přijme do pending-config. Hráčovo potvrzení znamená trvalé uložení vlastním serverem, ne slib vytvoření či opravy ticketu. Po doplnění konfigurace a restartu se fronta obnoví.

## Uložení a doručení

POST /api/feedback přijímá multipart metadata JSON a případnou binární screenshot přílohu, bez multiplayerové relace. Route nevystavuje seznam hlášení, soukromé texty ani stav cizích hráčů. Stejné reportId s totožným obsahem vrací stejné přijetí; jiný obsah stejného ID je konflikt. Server kontroluje původ, objem, MIME/magic/rozměry, kapacitu a frekvenci.

Jeden proces vlastní FEEDBACK_DIR. Kompletní staging je synchronizován na disk a atomicky publikován před potvrzením. Uložené UUID Linear issue, etapy uploadu a přiřazení umožní obnovu po restartu. Žádný další proces nesmí současně používat stejný adresář. Docker volume přežije znovuvytvoření kontejneru; nemažte volume při aktualizaci.

Worker žádá fileUpload, provede serverový PUT se všemi vrácenými hlavičkami a vloží assetUrl do Markdown description. Potom vytvoří issue s předem uloženým UUID a ověří readback, včetně korelačního reportId a obrázku. Nejasný create timeout se nejprve dohledává. GraphQL errors se posuzují i při HTTP200. U rate limitu se čeká podle odpovědi, ostatní přechodné chyby mají omezený backoff. API token se odesílá jen do Authorization hlavičky oficiálního Linear endpointu.

Soukromé přílohy v Linear nejsou veřejnými odkazy. Klient dostane pouze reportId a čas přijetí. Závady oprávnění, neplatná konfigurace nebo vyčerpané pokusy zůstávají jako lokální stav blocked k obsluze. delivery.json je neveřejná provozní evidence; konfiguraci napravte a stav řešte při zastaveném writeru, nikdy jako veřejnou HTTP mutaci.

## Původ capture a ověření

Primitiva vychází z úzkého read-only předání KEY-21, dokumentační commit1ef29ecd37efa940052995afe98cb01867e245c8, capture SHAcf408483376eaa0303b2fcab9027305354a9d89c74d654954d693a2a08a164c8. Původní diary soubory, jejich transport i rezervace zůstávají oddělené. Nový modul doplňuje individuální AbortSignal, čekací/encode timeout, kopie metadat a společné vlastnictví encoderu přes výměnu Game.

Snímek odpovídá prvnímu novému běžnému úspěšnému frame po vyvolání. Čas žádosti, kopie a metadata frame jsou oddělené; nezaručuje přesný okamžik stisku ani obraz před pádem. Neprovádí další render, nemění kameru ani preserveDrawingBuffer a v klidu nekopíruje žádné pixely. Timeout logicky ukončí požadavek; nativní browser encoder nelze fyzicky zrušit.

CPU testy pokrývají frontu, multipart, restart, duplicitní transport a lifecycle. Skutečný obraz, native dialog, IndexedDB, GPU režie a Linear upload/readback se přebírají samostatným produkčním browser testem. Závěrečná evidence patří do docs/verification-evidence/feedback-20261020/.
