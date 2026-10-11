# Multiplayer a jízda nad skutečnou fotogrammetrií

Standardní izolovaný `pnpm test:integration` prošel nad protokolem **5**, novým spawnem (110; 12), autem (110; 16) a skutečným kolizním podkladem IPR. Nepoužil hlavní server 2567 ani náhradní plochou scénu. Izolovaný server 2568 a obě dočasné SDK relace byly po testu ukončené; hlavní server měl před i po stejný PID 18444.

Úspěšný rozšířený běh trval 21,0 s od startu SDK testu a dokončil 29 zaznamenaných kontrol. Standardní timeouty startu a odpovědí nebyly zvětšené. [Souhrn](photo-integration-summary.json), [výsledek běhu](photo-integration-run-2.json) a [konzolový výstup](photo-integration-run-2.log) jsou uložené.

## Ověřená funkčnost

- Dvě skutečné SDK relace ve stejném společném světě; druhý klient obdržel pohyb řízeného auta.
- Chůze, nastoupení do skutečného auta na novém parkovacím spawnu, W vpřed, fyzikální změna směru při A, D při couvání, S zpátečka a W zabrzdění couvání s následným rozjezdem vpřed.
- Space zastavil auto. Přímé E za jízdy server odmítl; po zastavení prošlo bezpečné vystoupení, zachování parkovací polohy a opětovné nastoupení.
- Globální chat, žádost o kontakt, přijetí na obou stranách, doručení soukromé zprávy a blokování. Test čeká na nové konkrétní odmítnutí blokované DM, nikoli na jakékoli dřívější hlášení.
- Host nedostal multiplayerovou relaci ani hráče/chat přes soukromé HTTP endpointy; odpovědi 403. Veřejný health endpoint neobsahoval přítomnost.
- Oprávnění autora setkání, odmítnutí úpravy cizí události, odpojení/opětovné přihlášení do stejné dočasné relace a veřejný endpoint počasí.

Příklady skutečných autoritativních stavů: W posunulo auto ze Z=16,000 na 18,790 rychlostí 4,718 m/s. A při rozjezdu změnilo yaw z přibližně −0,00054 na 0,01165 rad. D při zpátečce dosáhlo yaw 0,03508 rad a rychlosti −0,636 m/s. Následné S dosáhlo −3,975 m/s; W obrátilo pohyb na +2,863 m/s. Záznam obsahuje i polohy pozorovatele a úhel jeho replikovaných kol.

## Provenience a stabilita zdrojů

Kolizní soubor obsahoval **3 949 797 trojúhelníků** a měl SHA-256 `88c247467579429c92dbec2886ebdb156cfc73d426bcd3472095947e905c2b0c`. Kontroloval se skutečný gzip PCM, všechny soubory `shared/` a `server/` a integrační skripty: celkem 49 souborů. [Hashe před](photo-integration-source-before-run-2.json) a [po](photo-integration-source-after-run-2.json) úspěšném běhu jsou shodné. SHA-256 jejich seřazeného soupisu `path + NUL + sha256`, odděleného LF, je `8eee72acab452446bfd38d23c24a04c690c32927d2ae37324f6389d9a8843e3d`.

Nejde o hash celé grafické aplikace ani GPU měření. Test nedokládá FPS, kvalitu kamery v prohlížeči nebo všechny mapové trasy. Viditelný průchod autem a kamerou provádí root zvlášť.

## Uchovaný neúspěšný pokus

Původní méně rozsáhlý root test nejprve prošel. První rozšířený pokus však skončil ve fázi krátkého D/couvání: [FAIL JSON](photo-integration-run-1.json), [log](photo-integration-run-1.log). Po 0,4 s částečného pedálu test klávesy uvolnil a čekal na současně dostatečnou rychlost i změnu natočení; tato podmínka se nesplnila. Tento pokus se nevydává za PASS a jeho zdroje během běhu zůstaly stejné.

Finální fixture drží skutečný digitální vstup A+W a D+S až do pozorované změny směru, s konečným limitem 60 paketů. Prahy změny headingu a záporné rychlosti zůstaly zachované. Mezi neúspěšným a úspěšným pokusem se změnil pouze `scripts/integration.ts`; geometrie, fyzika ani Game se neupravovaly. Žádný teleport, přeskakování překážky nebo výměna kolizního světa se v testu nepoužívá.

Hlášení SDK „Room connection was closed unexpectedly (4002)“ patří záporné kontrole připojení bez tokenu, kterou test očekává. Není nahrazením průchodu autentizovaných demonstračních relací; jejich následné kontroly musí všechny projít.

Reprodukce se strukturovaným záznamem v PowerShellu:

```powershell
$env:STRAHOV_INTEGRATION_EVIDENCE = 'docs/interaction/photo-integration-rerun.json'
pnpm test:integration
```

Bez této proměnné běží stejný test a nevytváří nový JSON v dokumentaci. Veřejné nasazení, IS ani studentské účty nejsou součástí tohoto ověření.
