# Herní zpětná vazba

Formulář je v úvodním menu, v herním docku a pod F8. Automaticky přiloží snímek samotného 3D canvasu bez HTML HUD, chatu, minimapy a jmenovek. Hráč vidí náhled a může snímek odebrat. Při nedostupném rendereru lze poslat text s důvodem chybějící fotografie.

Klient neposílá nic z právě rozepsaného hlášení před stiskem Odeslat. Starší uložená hlášení, u nichž hráč už stiskl Odeslat, se může opakovat při návratu online či dalším otevření hry. IndexedDB je best-effort: odmítnutí kvóty, soukromý režim a smazání browser dat nemají zaručenou obnovu. Do přijetí vlastním serverem se zobrazuje čekání, nikoli potvrzení doručení. Fronta je omezená na5hlášení/20MiB; po7dnech přestane automatické odesílání a hráč může obsah uložit či odstranit.

## Nastavení serveru

Nastavte proměnné přímo v prostředí procesu nebo v neveřejném souboru mimo Git a Docker build context:

- FEEDBACK_DIR: absolutní zapisovatelná cesta na persistentním disku/volume. Výchozí .cache/feedback je vhodné jen pro lokální použití; Docker image používá připravený /data/feedback i bez Compose.
- FEEDBACK_ALLOWED_ORIGINS: seznam přesných veřejných originů oddělených čárkou, například https://strahov.example.cz. Za reverse proxy je potřeba explicitní veřejný origin; forwarded hlavičkám se nevěří.
- LINEAR_API_KEY: osobní API klíč, výhradně serverový. Alternativně LINEAR_ACCESS_TOKEN pro OAuth Bearer.
- LINEAR_TEAM_ID a LINEAR_PROJECT_ID: pevné cílení projektu.
- LINEAR_STATUS_ID: nepovinný stav příchozího ticketu, jinak výchozí týmový Triage/Backlog.

Nikdy nepoužívejte VITE_ prefix pro přístupové údaje, nedávejte je do URL, klientských souborů, screenshotů, testovacích fixtures ani verzovaných .env. Při spouštění přes Node lze použít --env-file s cestou na soubor spravovaný uživatelem; samotné hodnoty nevypisujte. Compose předává pouze názvy proměnných a připojuje feedback-data do /data/feedback. Omezení ACL a zálohování jsou odpovědnost provozovatele.

Bez nastavení Linear server hlášení trvale přijme do pending-config. Hráčovo potvrzení znamená trvalé uložení vlastním serverem, ne slib vytvoření či opravy ticketu. Po doplnění konfigurace a restartu se fronta obnoví.

## Soukromá diagnostika bez spuštění hry

Připojení Linearu v Codexu nenastavuje prostředí herního serveru. Rozhodující je konfigurace skutečného běžícího procesu nebo kontejneru. Izolované testovací launchery mohou `LINEAR_*` záměrně odstranit, aby test neodesílal skutečná hlášení. Takový výsledek nelze vydávat za závadu externí produkce.

V kořeni nasazení spusťte samostatné read-only CLI. Nespouští herní server, nevolá Linear, neotevírá texty hlášení ani obrázky, nemění frontu a neuklízí staging:

```sh
node --import tsx server/feedback-diagnostics.ts
node --import tsx server/feedback-diagnostics.ts --directory /data/feedback
```

Používáte-li neveřejný soubor prostředí, načtěte ho stejným způsobem jako u skutečného serveru, například `node --env-file=/bezpecna/cesta/server.env --import tsx server/feedback-diagnostics.ts`. Cestu nahraďte skutečnou; hodnoty klíčů nevkládejte do příkazové řádky. V již běžícím Docker kontejneru lze použít `docker compose exec game node --import tsx server/feedback-diagnostics.ts`. Tím se spustí pouze diagnostické CLI v jeho stávajícím prostředí.

JSON obsahuje jen přítomnost povinných nastavení, zvolený typ credential a agregované počty stavů/chyb z `delivery.json`. Neobsahuje credential, team/project hodnoty, report ID, kontakty nebo soukromé URL. `configured: true` znamená pouze přítomnost nastavení; `apiVerified: false` výslovně uvádí, že CLI neověřilo vzdálená oprávnění. Snapshot aktivní fronty je best effort a může během čtení zastarat. Neznámé chybové řetězce se vykážou jako `other`; poškozené či příliš velké soubory a symlinky se neprocházejí dál.

Exit code `0`: konfigurace je přítomná a není nalezený blokovaný/poškozený záznam; stále nejde o doklad vzdáleného doručení. `1`: chybějící nebo podezřelé nastavení, chybějící adresář, `pending-config`, `blocked` či neúplný výpis vyžaduje pozornost. `2`: chybný příkaz nebo nedostupný adresář.

Při současném nastavení API klíče a OAuth tokenu má stejně jako dříve přednost `LINEAR_API_KEY`; diagnostika na nejednoznačnost upozorní. Do `LINEAR_ACCESS_TOKEN` patří samotný token bez prefixu `Bearer`. Záměna osobního klíče a OAuth proměnné nebo vložený prefix se hlásí jako varování, nepřepisuje se automaticky.

Serverová služba poskytuje `onDiagnostic` pro bezpečný startup/configuration záznam a pro kódy doručovacích či úložných chyb. Konfigurace se hlásí jednou při vzniku workeru a při změně její bezpečné projekce; ne každých pět sekund. Selhání loggeru nesmí přerušit příjem nebo doručování. Diagnostika není veřejný HTTP endpoint a nemění odpověď202.

Při řešení konkrétního nasazení rozlište:

- `403 origin-rejected`: hlášení nebylo přijato. Za HTTPS reverse proxy nastavte přesný veřejný origin do `FEEDBACK_ALLOWED_ORIGINS`; forwarded hlavičky nedávají automatické oprávnění.
- `pending-config` / `linear-not-configured`: chybí serverový credential, tým nebo projekt. Doplnění prostředí skutečného procesu a jeho restart umožní automatickou obnovu těchto záznamů.
- `blocked` / `linear-auth`: vzdálené oprávnění či credential byly odmítnuté. Oprava konfigurace sama již blokovaný záznam nepřehraje.
- `linear-rejected`, `linear-upload-failed`, `linear-network` nebo `linear-rate-limit`: použijte konkrétní kód a stav fronty; samotné potvrzení202 neprokazuje vytvořený ticket.

Blokované záznamy se neuvolňují automaticky ani tímto CLI. Obsluha jejich obnovy patří ke konkrétnímu autorizovanému zásahu při zastaveném writeru; zachovejte uložené issue UUID a informaci o předchozím create, aby bylo možné nejprve dohledat případný vzdálený výsledek.

Primární podklady ověřené27.10.2026: [autentizace a GraphQL chyby](https://linear.app/developers/graphql), [serverový upload a jeho hlavičky](https://linear.app/developers/how-to-upload-a-file-to-linear), [rate limity](https://linear.app/developers/rate-limiting). Osobní klíč se posílá přímo v Authorization, OAuth s Bearer; HTTP200 nemusí znamenat úspěch celé GraphQL operace. Stávající adapter tyto kontrakty zachovává.

## Uložení a doručení

POST /api/feedback přijímá multipart metadata JSON a případnou binární screenshot přílohu, bez multiplayerové relace. Route nevystavuje seznam hlášení, soukromé texty ani stav cizích hráčů. Stejné reportId s totožným obsahem vrací stejné přijetí; jiný obsah stejného ID je konflikt. Server kontroluje původ, objem, MIME/magic/rozměry, kapacitu a frekvenci.

Jeden proces vlastní FEEDBACK_DIR. Kompletní staging je synchronizován na disk a atomicky publikován před potvrzením. Uložené UUID Linear issue, etapy uploadu a přiřazení umožní obnovu po restartu. Žádný další proces nesmí současně používat stejný adresář. Docker volume přežije znovuvytvoření kontejneru; nemažte volume při aktualizaci.

Worker žádá fileUpload, provede serverový PUT se všemi vrácenými hlavičkami a vloží assetUrl do Markdown description. Potom vytvoří issue s předem uloženým UUID a ověří readback, včetně korelačního reportId a obrázku. Nejasný create timeout se nejprve dohledává. GraphQL errors se posuzují i při HTTP200. U rate limitu se čeká podle odpovědi, ostatní přechodné chyby mají omezený backoff. API token se odesílá jen do Authorization hlavičky oficiálního Linear endpointu.

Soukromé přílohy v Linear nejsou veřejnými odkazy. Klient dostane pouze reportId a čas přijetí. Závady oprávnění, neplatná konfigurace nebo vyčerpané pokusy zůstávají jako lokální stav blocked k obsluze. delivery.json je neveřejná provozní evidence; konfiguraci napravte a stav řešte při zastaveném writeru, nikdy jako veřejnou HTTP mutaci.

## Původ capture a ověření

Primitiva vychází z úzkého read-only předání KEY-21, dokumentační commit1ef29ecd37efa940052995afe98cb01867e245c8, capture SHAcf408483376eaa0303b2fcab9027305354a9d89c74d654954d693a2a08a164c8. Původní diary soubory, jejich transport i rezervace zůstávají oddělené. Nový modul doplňuje individuální AbortSignal, čekací/encode timeout, kopie metadat a společné vlastnictví encoderu přes výměnu Game.

Snímek odpovídá prvnímu novému běžnému úspěšnému frame po vyvolání. Čas žádosti, kopie a metadata frame jsou oddělené; nezaručuje přesný okamžik stisku ani obraz před pádem. Neprovádí další render, nemění kameru ani preserveDrawingBuffer a v klidu nekopíruje žádné pixely. Timeout logicky ukončí požadavek; nativní browser encoder nelze fyzicky zrušit. Do jeho původního callbacku proto další fotografie zůstane nedostupná, aby se nehromadily souběžné komprese. Textový formulář dál funguje.

CPU testy pokrývají frontu, multipart, restart, duplicitní transport a lifecycle. Skutečný obraz, native dialog, IndexedDB, GPU režie a Linear upload/readback se přebírají samostatným produkčním browser testem. Závěrečná evidence patří do docs/verification-evidence/feedback-20261020/.
