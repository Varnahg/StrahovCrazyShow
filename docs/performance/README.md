# Výkonový audit plné aplikace

Tato složka odděluje nová měření od starší studie v `docs/optimization-study`. Výsledek vždy patří konkrétnímu otisku zdrojů. Změna klienta, serveru, sdílené simulace nebo assetu vyžaduje nový snapshot; starší čísla se nepřenášejí na novou verzi.

## Reprodukce izolovaného testu

V kořenu projektu vytvořit snapshot: `node scripts/performance-snapshot.mjs audit-YYYYMMDD-a`. Skript porovná SHA-256 všech vstupů před kopírováním, po něm i v kopii. Při nesouladu testovat nesmí. Složka `.cache/performance-snapshot/audit-YYYYMMDD-a` má vlastní zdroje a připojené stejné `node_modules`; balíček a lock jsou hashované.

V novém terminálu přejít do snapshotu a spustit:

```powershell
$env:PORT='2570'
$env:STRAHOV_PERF_TELEMETRY=(Join-Path (Get-Location) 'server-telemetry.jsonl')
node --import ./scripts/performance-server-preload.mjs --import tsx server/index.ts
```

V dalším terminálu ve stejném snapshotu:

```powershell
node --import tsx scripts/performance-network.ts http://127.0.0.1:2570 30 30 crowded network-30-crowded.json 3
node --import tsx scripts/performance-network.ts http://127.0.0.1:2570 100 30 crowded network-100-crowded.json 3
```

Pro rozptýlení použít `100 30 distributed network-100-distributed.json 50`. Pohyb probíhá pouze platnými veřejnými zprávami; žádné teleportování, manipulace se serverovou simulací ani obcházení limitů. Před další stovkou relací vyčkat, až se obnoví standardní limit 150 nových relací za minutu. Při headless testu musí být server před kohortou prázdný; harness to kontroluje počtem řádků v autentizovaných motion zprávách. Vypnout pouze proces izolovaného serveru; hlavní vývojový server na 2567 test nepoužívá.

Harness generuje souvislou `seq`, kanonizuje vstupy shodně s klientem, odesílá 2 příkazy každých 1/30 s a používá protokol 2. Sleduje skutečný postup serverového `tick` proti uplynulému času, počet hráčů v každém paketu, autoritativní potvrzení, resynchronizace, délku pohybu každého klienta a reálnou výslednou prostorovou obálku. Označení `distributed` samo o sobě nedokazuje úspěšné rozptýlení; zkontrolovat obálku a pozice v JSON.

Shrnutí a raw soubory přesunout do evidence příkazem z kořene projektu:

```powershell
node scripts/performance-report.mjs .cache/performance-snapshot/audit-YYYYMMDD-a docs/performance/evidence/audit-YYYYMMDD-a
```

## Význam serverových čísel

- CPU je spotřeba **procesu serveru** vůči času jednoho jádra. 100 % znamená jedno celé jádro. Součet počítače ani CPU procesu botů v čísle nejsou.
- `tickHzObserved` porovnává skutečné přijaté tick hodnoty s monotónními hodinami měřicího klienta; není to počet callbacků `setInterval`.
- Downlink počítá skutečné binární Colyseus zprávy všech typů. Motion payload je veden zvlášť. WS, TCP, IP a TLS hlavičky chybějí; jde tedy o spodní hranici síťového provozu.
- Ack age je čas od odeslání konkrétního potvrzeného vstupu do přijetí autoritativního stavu. Nejde o ping ani čas do zobrazení pixelu.
- `perf_hooks.monitorEventLoopDelay` se vzorkuje po 10 ms; rozlišení Windows časovačů je v něm obsažené. Nezaměňovat ho s intervalem renderových snímků nebo každým fyzikálním krokem.
- Loopback bez simulace latence či ztrát neprokazuje chování přes internet. Stejný počítač zároveň vytváří zátěž botů a může mít souběžné procesy.

## Produkční browser benchmark

1. Po dokončení integrace vytvořit nový neměnný snapshot. V jeho složce provést `node node_modules/vite/bin/vite.js build`, potom `node scripts/performance-preview.mjs`. Preview na `http://127.0.0.1:4175` přesměruje `/api` i `/realtime` výhradně na izolovaný server 2570.
2. Použít nový vlastní browserový tab. Neobnovovat uživatelův herní tab. Hrát plnou aplikaci v multiplayeru se standardním HUD; počet skutečných síťových relací ověřit autentizovanými motion řádky a počtem avatarů v benchmarku. Veřejné `/api/health` záměrně neposkytuje multiplayerovou přítomnost. Syntetická renderová skupina nemůže být uváděná jako síťový test.
3. Z benchmarku uložit skutečný `renderer` včetně výrobce/adaptéru. Cílový adaptér je Intel UHD Graphics 630. Jiný adaptér či software renderer znamená jiné měření. Zaznamenat model CPU, prohlížeč a verzi, napájení a souběžné těžké procesy.
4. Zapsat CSS viewport, DPR a **skutečné** rozlišení backbufferu. Předpoklad 1080p se nesmí vydávat za skutečnost, pokud okno tolik neměří. Nízké nastavení může snížit interní rozlišení; obě hodnoty zveřejnit.
5. Po načtení a zkompilování materiálů nechat scénu alespoň 15 s zahřát. Potom změřit minimálně 3×10 s vestavěným tlačítkem FPS. Jedna série: 1 hráč, 30 hráčů na nádvoří, 100 hráčů na nádvoří a 100 hráčů rozptýlených po areálu. Pro 30 celkem spustit 29 skutečných botů plus browser, pro 100 celkem 99 botů plus browser. Pro renderer mohou ostatní během vzorku stát; oddělený síťový test musí opravdu hýbat všemi.
6. V každé variantě zaznamenat nízkou i vysokou kvalitu, směr kamery a viditelnou část areálu. Zvlášť projít trasu kolem B6 a přes nádvoří. Po změně kvality znovu zahřát. Porovnání vyžaduje stejný pohled, světlo a počasí; živé počasí zaznamenat, řízené podmínky označit.
7. Uložit kompletní JSON benchmarku: počet snímků, skutečné trvání, průměrné FPS, p95/p99 **nezprůměrovaných** `Engine.getDeltaTime()` snímků, počet avatarů, trojúhelníky, GPU, viewport a backbuffer. P95/p99 nepřepočítávat ze zaokrouhleného HUD FPS. Přidat screenshot plného HUD a místa měření.

Po připojení browseru lze pro celkových sto účastníků spustit například `node --import tsx scripts/performance-network.ts http://127.0.0.1:2570 99 180 crowded network-99-browser.json 15 100`. Poslední argument deklaruje sto autentizovaných motion řádků (99 botů a jeden browser); samotné vytvoření 99 sessions tak nemůže omylem vydávat neúplnou scénu za stovku.

Výsledek nad 30 FPS v jednom desetisekundovém pohledu neprokazuje plynulost celého světa. Při méně než 30 FPS nebo p95 nad 33,3 ms uvést nesplněný výkonový cíl v dané konfiguraci. Bez cílového adaptéru a požadovaného rozlišení zůstane tento konkrétní cíl neověřený.

## Předintegrační serverová evidence

Snapshot `7c47a4c6d47f6c42a346799bcbd5e69d29c7699d20c04c0a91092c7450396580`, [raw evidence](evidence/preintegration-20261010-a/summary.json), Node 24.19.0, Windows, Intel Core i7-8750H (6 jader / 12 vláken). Na stroji jsou Intel UHD 630 i NVIDIA GTX 1060; následující čísla jsou serverový test a žádný adaptér se jím neověřuje.

| Měřená varianta | Tick / s | Motion / s | CPU jednoho jádra | Downlink jednoho / všech | Ack p95 | Resync / chyby |
|---|---:|---:|---:|---:|---:|---:|
| 30 pohybujících se, 30 s | 60,023 | 19,999 | 17,72 % | 61,667 kB/s / 1,850 MB/s | 50,372 ms | 0 / 0 |
| 100 pohybujících se, 30 s | 59,996 | 20,000 | 34,75 % | 195,959 kB/s / 19,615 MB/s | 57,745 ms | 0 / 0 |
| 100 připojených rozptýlených, 87 pohybujících se, 30 s | 59,307 | 19,260 | 47,18 % | 186,676 kB/s / 18,666 MB/s | 290,865 ms | 400 / 0 |

Všichni testovaní účastníci byli ve stejném světě. V prvních dvou variantách se každý skutečně pohyboval. Zprávy obsahovaly přesně 30, respektive 100 řádků. Vstupy dosahovaly 60 příkazů/s v 30 batchech/s. Síťový výstup roste téměř kvadraticky, protože celý pohybový seznam dostává každý účastník. To je konkrétní hranice současné architektury; úspěšná simulace stovky na loopbacku není důkaz dostatečného veřejného uplinku.

Rozptýlená varianta měla reálnou obálku x 24–256 m a z −11–30 m. Třináct botů uvízlo při jednoduchém řízení k cíli; tuto variantu tedy nelze vydávat za sto současně pohybujících se klientů. Zaznamenala p95 intervalu motion 79,439 ms, maximum 353,589 ms a 400 autoritativních resynchronizací. Event-loop maximum dosáhlo 243,532 ms. Současně se na stroji sestavil frozen produkční klient (Vite build trval 2,08 s); běžel také další vývoj. Příčina jednotlivých prodlev není tímto měřením izolovaná. Výsledek dokládá citlivost vůči prodlevám, **nikoli splnění požadavku na stabilitu**. Finální audit má tuto scénu zopakovat bez sestavování a prověřit důsledky `MAX_CATCHUP_STEPS` a resetování front při zahazování času.

Frozen produkční sestavení prošlo. Browser/GPU měření bylo záměrně odloženo na dokončení následné integrace; pro tuto verzi není zaznamenané žádné FPS ani tvrzení o 30 FPS na Intel UHD 630.

Tyto výsledky **nepatří pozdějším úpravám vozidla, avatarů, grafiky ani klienta**. Finální integrovaná verze vyžaduje další freeze a samostatné GPU měření.

Novější historický [integrovaný audit D](integrated-20261010-d.md) obsahuje skutečné Intel UHD 630 výsledky pro 1/30/100 připojených účastníků, kompletní raw evidence, neplatný populační přechod na high a otevřené problémy. Ani jeho čísla se nepřenášejí na následné integrační opravy.
