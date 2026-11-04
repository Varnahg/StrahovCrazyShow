# Výkonový audit plné aplikace

Výsledek patří konkrétním zdrojům, testům, závislostem a podmínkám běhu. Aktuální postup níže platí pro jediný `main` v `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`; historické výsledky jsou oddělené na konci. [Ověření](../verification.md), [rozpracované změny](../work-in-progress.md) a [přejímkový cíl](../acceptance.md) rozlišují přijatý stav od experimentu. Tento návod neurčuje právě běžící uživatelskou URL.

## Nejdřív důkaz, potom další pokus

Po selhání nejprve přečti původní logy a poslední dokončený milník. Rozliš timeout, validační chybu, nepřipravenou scénu a chybějící sběr; neodvozuj příčinu pouze z posledního čítače. Další start musí odpovědět na konkrétní otevřenou otázku. Předem plánovaná A/B či ABBA opakování kvůli variabilitě a cache jsou žádoucí; neúspěšný pokus uchovej.

Každý experiment má šest stručných položek. Pro runner je ulož do JSON plánu; jediný aktuální handoff kampaně na plán a raw data odkazuje, nemusí je opisovat:

```text
Problém (problem): konkrétní uživatelský výsledek, který chybí.
Hypotéza (hypothesis): doložený mechanismus nebo předpoklad k rozlišení.
Změna (change): jediná zkoušená změna oproti přesně určenému checkpointu.
Metrika (metric): hlavní ukazatel; scéna, rozlišení, populace, čas a počasí.
Správnost (correctness): readiness/health/obrazová shoda a fungující sběr.
Přijetí (acceptance): práh, warmup, délka, pořadí/opakování a stop podmínka.
```

Jedna hlavní metrika neruší podmínky správnosti. Po 30 minutách bez nového důkazu měnícího rozhodnutí zastav další neplánované starty a zvol rozbor logů, minimální reprodukci, nebo odložení hypotézy s přesným omezením. Časový limit není povolení přeskočit ověření. Startup čas, CPU kernel a gameplay FPS jsou různé výsledky; změnu cíle výslovně zaznamenej. Levné cílené kontroly dělej průběžně, celou sadu, build a relevantní integraci nad stabilním checkpointem po refaktoringu; opakuj je při změně, selhání nebo nevyřešeném riziku.

<a id="samostatna-obsluha-edge"></a>
## Samostatná obsluha Edge

Uživatel 4. 11. 2026 výslovně potvrdil, že agent má při testování sám převzít ovládání počítače a otevřít Edge. Nevyžaduj od uživatele přepnutí karty ani potvrzení popředí. Oprávnění a hranice shrnuje [AGENTS.md](../../AGENTS.md); následující postup je součástí přípravy každého browserového měření.

1. **Připrav ovládání před spuštěním časovaného experimentu.** Načti aktuální dokumentaci dostupného browser/Computer Use nástroje a vyber Edge. Pro vlastní test založ označenou kartu nebo okno, které můžeš později bezpečně zavřít. U `cua_repl` je dokumentovaný vstup `cua.createBrowserTab("edge", url, { sessionName: "🎮 Test hry" })`; další akce řiď vrácenou dokumentací a stavem. Nepřenášej naslepo API či ID z minulé relace. Není-li Edge spuštěný a browser vstup jej neotevře, použij podporované spuštění nainstalované aplikace přes Computer Use a nový inventář.
2. **Sám zajisti aktivní testovací okno.** Použij dokumentované ovládání karet/oken; nativní Computer Use potřebuješ jen pro úkon, který browser API neposkytuje. Nativní okno vybírej podle čerstvého inventáře a ověřené testovací URL. Browser tab ID, browser window ID a nativní Windows window ID nejsou zaměnitelné. Nevybírej první Edge okno ani nepřebírej uživatelskou hru na 8080. Dřívější potvrzení uživatele není důkazem současného popředí.
3. **Ověř skutečný běh před prvním vzorkem.** Po připravenosti vlastního API/preview otevři přesnou URL aktuálního běhu (pro zdejší harness `http://127.0.0.1:4179/?renderBackend=webgpu`). Zkontroluj hash buildu, novou diagnostickou relaci, backend/GPU, readiness a čerstvý sběr; z aktuálního stavu ověř aktivní kartu a `visibilityState`/focus, pokud je nástroj poskytuje. Nastav a zaznamenej CSS viewport i interní rozlišení. Samotný screenshot či titulek okna nenahrazuje tyto podmínky. Neověřenou viditelnost označ jako omezení; foreground srovnání nepřijímej.
4. **Dodrž naplánovanou obsluhu série.** Připrav si pořadí UI akcí, warmup a počet intervalů před startem monitoru. Po readiness a připojení SDK peers proveď měření bez odbočení do výzkumu nebo dalších buildů. Během měřených intervalů nečti DOM, nefotografuj a nemanipuluj s oknem. Po každém intervalu ověř uložený výsledek; mezi vzorky řeš jen podmínky dalšího měření. Vypršení času kvůli obsluze eviduj jako neúplnou sérii, nikoli chybu hry; původní pokus nepřepisuj.
5. **Obnov jen běžnou technickou chybu.** Po timeoutu vstupu nejprve přečti aktuální UI a příslušné logy, protože akce mohla proběhnout. Při zaniklé kartě jednou obnov inventář téhož vybraného Edge, získej aktuální handle nebo založ vlastní náhradní kartu. Není důvod znovu vybírat jiný browser či žádat uživatele o otevření. Před novou herní relací uchovej původní logy a dodrž cleanup/nové run ID. Opakované selhání stejného kroku řeš podle konkrétní chyby a dokumentace, ne smyčkou startů hry.
6. **Rozliš bezpečnostní zastavení.** Odmítnutí kvůli neověřené URL, zrušení uživatelem, zamčená plocha a výslovný STOP nejsou běžný zaniklý handle. Nepoužívej jiný ovládací kanál, reset ani ruční shell/CDP automatizaci k obejití odmítnutí. Zaznamenej operaci, důvod, URL/run a poslední dokončený milník. Dodrž požadovaný rozsah zastavení; pokud lze pokračovat mimo UI, analyzuj existující logy a dokonči nezávislé kroky. Když nástroj vyžaduje ukončit tah, stručně to sděl a zachovej možnost navázat. Hlášení nástroje nevydávej za chybu WebGPU. O lidský zásah žádej pouze pro konkrétní neřešitelnou překážku, například odemčení plochy.
7. **Ukonči vlastní test.** Ověř uložené výsledky a cleanup procesů, zavři vlastní testovací karty nebo je nech otevřené jen pro výslovně předávaný živý výsledek. Vrať dočasný viewport override. Uživatelské karty, systémová nastavení a cizí procesy zachovej.

Tento postup odstraňuje zbytečné čekání na uživatele; nemění oprávnění samotného nástroje a nezaručuje dostupnost jeho Windows integrace. Pro práci s herní stránkou preferuje browser API, takže nativní výběr Edge okna není zbytečnou podmínkou každého testu.

## Přejímka plynulosti a pohybu

`measurement-complete` potvrzuje dokončený sběr. `renderHealth.valid` potvrzuje stav rendereru a assetů. Výkonovou a síťovou přejímku vyhodnocuj samostatně podle strukturovaných číselných mezí; ne podle volného textu `acceptance`. Výsledek je `passed`, `failed` nebo `inconclusive` s uvedenými důvody. Chybějící, neplatné či nesouvislé vzorky se nesmějí změnit v zelený výsledek.

Krátký herní benchmark hodnotí pouze svůj snímkový vzorek. V HUD ukáže nevyhovující plynulost, maximum intervalu a počet dlouhých snímků; nepřijímá chůzi ani připojení. Jeden sekundový zásek musí nevyhovět i tehdy, když jej p95/p99 nezahrnou. Delší scénář navíc potřebuje doložený pohyb a síťové korekce/resynchronizace ze stávajícího automatického recorderu. Nulové vstupy SDK peers nejsou pohybový scénář.

Výchozí projektová politika pro cíl60FPS toleruje minimum54FPS, p95 do33,33ms, p99 do50ms, maximum250ms a nejvýše1% intervalů od50ms. Pro označený gameplay úsek požaduje alespoň60s viditelného hraní,20s pohybu a20m trasy; síťové meze jsou nejvýše1 resync/min, korekce do1m, stáří autority do250ms a nejvýše1 čekání timeline/min. Ztracené připojení neprojde a chybějící stáří autority není důkaz zdravé sítě. Jsou to konfigurovatelné inženýrské limity projektu, nikoli oborová norma či záruka pro všechny scény. Po zjištění FAIL je nezměkčuj jen kvůli dosažení zelené. Výsledek s chybějícím pohybem nepotvrdí celou hratelnost. Startup a přechody viditelnosti označ odděleně; zásek při přepnutí kvality nezahazuj potichu.

Při hlášení konkrétního hráčského problému začni jeho uloženým JSONL/gzip logem. Známý [test ze4.11.2026](evidence/gameplay-frame-cost-20261103/user-playtest-20261104/README.md) je regresní záporný případ: dlouhé záseky a opakované resynchronizace musejí vyjít `failed`. Vyhodnocení tohoto archivu nevyžaduje znovu spouštět GPU hru. Samotný počet korekčních eventů není počet všech korekcí: recorder malé běžné korekce filtruje; zachovej rozdíl vůči kumulativním counterům.

```powershell
node scripts/gameplay-acceptance.mjs docs/performance/evidence/gameplay-frame-cost-20261103/user-playtest-20261104/recording.jsonl.gz --source 2cdef569736faa5d3af601db33363b4f2430d2f80937e8cf15c1e67ec912c144
```

CLI vrací0 pro `passed`,2 pro doložené `failed`,3 pro `inconclusive`; `--policy` načte explicitní JSON meze a `--output` zapíše nový soubor bez přepsání původního. Offline přejímka čistého prefixu bez ukončení hry nesmí potvrdit celou relaci. Známá porušení mezí zůstávají nevyhovující i při zvlášť uvedené neúplnosti časového pokrytí; mezery ani neplatná identita nesmějí vytvořit PASS. Souvislá čísla záznamů nejsou totéž jako pokrytí všech časových intervalů.

Pro nový živý pohybový experiment přidej do existujícího plánu `gameplayAcceptance` s číselnými mezemi (např. `{"targetFps":60,"minVisibleSeconds":60,"minMovementSeconds":20,"minTravelMetres":20,"maxResyncsPerMinute":1,"maxCorrectionMetres":1}`). Monitor vyhodnotí pouze tento označený nasbíraný úsek a uloží `gameplay.status` a `gameplayAccepted`; překročení mezí má rozhodnutí `gameplay-failed`. Staré plány bez tohoto objektu nadále potvrzují jen sběr dat. Ani `gameplayAccepted: true` samo nedokazuje relativní zisk optimalizace: `optimizationAccepted` zůstává false do srovnatelného A/B a funkčního ověření.

## Jeden checkout, neměnný build

Podle [koordinace](../agents/README.md) rezervuj soubory/výstupy a `heavy-validation`, pro GPU také `gpu`, pro tento harness porty `2568`/`4179` a diagnostiky `.cache/game-diagnostics/`. `workspace-build` potřebuje build do pracovního stromu. Ověř skutečné procesy i aktivní 3D scény; cizí proces podle portu neukončuj. Uživatelský tab a hranou verzi neměň.

Použij existující [render-next harness](evidence/render-next-20261102/harness/README.md). Build vzniká pouze v `.cache/render-next-20261102/candidateN/build/dist`; nevytvářej kopii projektu, worktree ani HMR přejímku. Manifest zahrnuje source/test hash, public assety, instalované Babylon bajty a harness; další dependency metadata a hranice hashování popisuje README harnessu. Vstupy se ověřují před/po buildu a na hranicích běhu. Po jejich změně patří nový build do nového `candidateN`; existující build/run se nepřepisuje.

Před kampaní ověř Node 24, skutečné LFS assety a instalaci odpovídající lockfilu a patchům. Během měření závislosti neměň. Pro měřicí příkazy používej přímé `node` CLI; `pnpm exec` může při nesouladu instalace spustit automatickou instalaci. Potřebnou instalaci proveď jako samostatný rezervovaný krok před zmrazením checkpointu.

Z kořene canonical main, po volbě dosud nepoužitého čísla kandidáta (zde příklad `8`):

```powershell
$env:STRAHOV_SHADER_CANDIDATE = 'candidate8'
node docs/performance/evidence/render-next-20261102/harness/run.mjs --build baseline
$env:STRAHOV_PERF_WEATHER_FIXTURE = (Resolve-Path '.cache/render-profile-20261102/weather.json').Path
$env:STRAHOV_PERF_EXPERIMENT_PLAN = (Resolve-Path '.cache/render-next-20261102/candidate8/plan.json').Path
node docs/performance/evidence/render-next-20261102/harness/run.mjs --experiment run1
```

`--build baseline` je název příkazu sestavujícího aktuální main, nikoli tvrzení, že jde o kontrolní variantu. Weather cesta ukazuje existující uložený QA fixture; pro vlastní kampaň připrav a rezervuj explicitní soubor a pro všechny srovnávané běhy drž stejné bajty. Server jej označí jako testovací a uloží hash.

Před spuštěním vytvoř rezervovaný `plan.json` podle [kontraktu harnessu](evidence/render-next-20261102/harness/README.md): šest textových položek výše, `sourceHash` z manifestu buildu (64 hex znaků), `benchmarkCount` 0–30, `timeoutSeconds` 30–1800 a `systemTelemetry` (výchozí `true`). Plán a následný souhrn odkazuj z aktuálního handoffu. Nula benchmarků znamená pouze startup, nikoli FPS důkaz. Runner sám spustí serve a systémový sampler, sleduje nové diagnostiky/benchmarky, provede STOP/cleanup a uloží `runs/run1/experiment-summary.json`; ovládání browseru a spuštění HUD benchmarků stále provádí operátor. Ruční `node docs/performance/evidence/render-next-20261102/harness/run.mjs --serve run1` je alternativa; nespouštěj jej současně s `--experiment`.

Otevři `http://127.0.0.1:4179/?renderBackend=webgpu`, vstup běžným UI a ověř připravenost. Automatická volba jinak preferuje **WebGPU compatibility mode**; po bezpečně uklizeném odmítnutí inicializace dovoluje WebGL2 fallback s novým canvasem. Explicitní `renderBackend` je striktní, `webgpu-fast` pouze loopback experiment; skutečný backend vždy odečti z diagnostiky. Kontrakt určuje [render-fallback.ts](../../client/render-fallback.ts).

Pro dva skutečné SDK peers po browser readiness spusť v dalším terminálu stejného checkoutu:

```powershell
$env:STRAHOV_SHADER_CANDIDATE = 'candidate8'
node docs/performance/evidence/render-next-20261102/harness/run.mjs --peers run1
```

Peer helper importuje aktuální [PROTOCOL_VERSION = 14](../../shared/netcode.ts), vytvoří dva různé avatary a posílá neutrální vstupy. `peers-ready.json` musí potvrdit populaci 3 a autentizovaná motion data; neprokazuje viditelnost avatarů ani GPU readiness. Tento scénář nenahrazuje dav 30/100 hráčů nebo pohybovou trasu. Pro další starty použij `run2`/`run3`, pro odůvodněné opakování např. `run1-attempt2`; stejnou hodnotu `STRAHOV_SHADER_CANDIDATE` nastav v každém terminálu.

## Sběr, rozhodnutí a úklid

Před dlouhým intervalem krátce ověř, že přibývá správný session log a benchmark se shodným source hashem, backendem a podmínkami; při systémové telemetrii také nové časované vzorky. Monitor kontroluje novou diagnostickou identitu, `presentation-rate` a `sample` preflight, potom readiness/chyby a benchmarky. Technický výsledek sběru sám nepotvrzuje hypotézu ani obrazovou správnost.

Měř celou produkční hru s HUD, reálnými relacemi a různými avatary po dokončené přípravě a ustálení. Uchovej původní benchmark JSON a screenshot scény/HUD: source hash, CPU/GPU/ovladač/browser, CSS viewport/DPR/backbuffer, kvalitu, kameru, světlo/UTC/počasí, populaci a viditelné avatary, délku/warmup/opakování, FPS a p95/p99 dob snímků. Změna kvality vyžaduje nové ustálení. Timeout přípravy nebo neplatný health není FPS vzorek; CPU/NullEngine úspěch ani méně draw calls není důkaz GPU zrychlení. Cíl 60 FPS na GTX 1060 za dne a s davem nelze uzavřít jiným adaptérem, rozlišením nebo pouze stacionární scénou.

V jednom handoffu odděl dobu buildu, startupu, měření a obsluhy. Uveď závěr, neúspěšné/vyloučené pokusy a jejich důvod; plánovaná opakování ani outliery potichu nevyřazuj. Systémové CPU/GPU intervaly nejsou přesné renderové snímky, vnořené CPU časy se nesčítají. Serverové CPU je vůči jednomu jádru, ack age není ping a loopback neprokazuje internetové chování.

Běh ukonči jeho `STOP` markerem (cestu potvrzuje `runtime.json`):

```powershell
New-Item -ItemType File -Path .cache/render-next-20261102/candidate8/runs/run1/STOP
```

Vyžaduj `peers-cleanup.json`, pokud byli peers spuštěni, a `cleanup.json` s ukončeným API, bez chyb a s revalidovanými vstupy; ověř vlastní PID a uvolněné porty. `PEERS_STOP` ukončí jen peers. Další běh začne po cleanupu. Raw logy zůstávají v run adresáři a `.cache/game-diagnostics/`; trvalé souhrny a potřebné raw důkazy předej do rezervované evidence, bez přepisování historie. Integrátor převezme ověřený celek a commitne pouze jeho soubory na main.

## Historický kontext

Následující původní předintegrační výsledky jsou z 10. 10. 2026. Popisují tehdejší snapshot/harness a jeho limity, nikoli současný protokol, stav KEY-48 nebo aktuální GPU výkon.

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
