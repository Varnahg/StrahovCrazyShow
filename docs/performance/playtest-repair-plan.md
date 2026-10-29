# Strahov Crazy Show — plán úplného odstranění nálezů

## Aktuální testovací update — 14. 10. 2026 19:52 Praha

**http://127.0.0.1:4187/** je spuštěný společný build všech dosavadních kandidátů: B6, engine/IMAGE, clock a phase nad plnou wave3 diagnostikou. Snapshot1cddfe82…,922/922 testů+build+celá integracePASS,515 sourcehashů. HTTPbundle/sourceID a collector zápis na disk PASS; otevřenípaneluqueued, skutečnýGPU/vzhled zatímneověřen. Logování automatické, aktuálníčas/počasí. Starší4186 zůstáváoddělené.

Další priorita: zachovat hraný snapshot, dokončit jednotlivé commity/integrace s již získanými důkazy a vyhodnotit nový skutečný test. Nespouštět znovu celé meziverze pouze kvůli evidenci. Před jakýmkoli heavy/GPU krokem ověřit také4187/2582 a skutečnélogy; tři agent-collector-smoke soubory nejsou hraní. Vizuální chyby aRTTpolicyA zůstávajíotevřené.

### Předchozí integrační krok19:18

Clock-calibration fixB je samostatně vmain98ce8fc (publication4f41b37):827/827 testů, build a celá integrace PASS; b773dc71…,492 source hashů.117 původních dirty souborů zachováno. RawRTT freezeA a GPU/celková přejímka zůstávají otevřené. Navazuje samostatný přenos již připraveného phase fixu nad tímto přesným základem, se zachováním nové kalibrace a doplněním skutečného phase helperu do room AST testu.

### Předchozí V11 krok

V11 je samostatně integrovaný do main6e407ec (publication8fd53e9):819/819 testů, build a plná integrace PASS; snapshot03b597a6…,491 hashů beze změny. Následný2-řádkový test-only follow-up main58c8003/publicationc677d47 zachovává skutečný Game Scene kontrakt ve FakeGame;24/24 proti working i feature UI. Podrobnosti v novém V11 integračním handoffu a verification.

Nově potvrzený problém KEY-7: over-budgetRTT při nové epoše zanechá clock bias i po freshlow, skutečný counterexample153ahead a3 pozitivní kontroly. Vybrán samostatný qualified-calibration fix bez změny rawRTT nebo limitů; potom pokračuje phase delta. Vyřešení celé RTT policy ani skutečného GPU třesení se netvrdí.

### Předchozí diagnostický krok

Automatický diagnostický základ je samostatně integrovaný v lokálním main commitu `4bd7c4b79bea9dea20b5d8fe0d5bc3467fdbbfcb`. Převzat přesný feature `5f9b011` a ověření **750/750 testů, build a celá integrace PASS** nad snapshotem `9877f891566af3ec6bb035d2f09de7d18ae2bea4d7e9158434fae22aae3060be`. Celý commitnutý runtime/test/config/assets strom je shodný s ověřeným zdrojem. Všech156 původních dirty/untracked souborů zůstalo při integraci byte-identických, včetně serverového V11 WIP a cizí vegetace. [Přesné předání](../agents/handoffs/integrate-wave3-diagnostics-baseline-20261014.md).

Uživatel znovu požádal o test a přímé zadání URL. **http://127.0.0.1:4186/** je dostupná (HTTP200), API2581; samostatný portový task serve-b6-candidate-20261014 drží stále stejný neměnný B6 build. Otevření v Codex panelu je queued; nový render ani herní JSONL zatím nebyl potvrzen. Uživatel nemusí zapínat profiler nebo exportovat logy. Automatické ukládání začne po načtení stránky. Samotná HTTP dostupnost není GPU přejímka.

| Kandidát | Připravený stav | Zbývá |
| --- | --- | --- |
| B6-01 / KEY-16 | Lokální commit `f63039b`, běžící candidate `cbc158068138e3454a6959a0d7a945465ea2974e6c246e86ed231abf92a4b5dc`, 878 testů/build/integrace PASS | Srovnatelná skutečná hra, obraz a GPU; následně samostatná integrace main |
| Engine / KEY-17 | Samostatný lokální commit `6df08fb`, 888 testů/build/integrace PASS; původní schema5.0.36 zachované | Integrace main a navazující obrazová přejímka |
| IMAGE-01 / KEY-14 a KEY-4 | Navazující lokální commit `557eb88`, stejný nový test1/7→7/7, 895 testů/build/integrace PASS, produkční reuse zachovaný | Integrace main; skutečný vzhled, LDR/bloom a výkon |
| Fáze pohybu / KEY-12 a KEY-7 | Skutečná Game regrese5FAIL/1PASS→green,52 cílených a892 plných testů/build/integrace PASS | Nejprve samostatně publikovat původní V11, potom phase delta; GPU a další korekce zůstávají otevřené |
| Červené záblesky a vzdálená světla | Výzkum a původní produkční log uchované | Samostatné rozhodnutí, opravy a praktické důkazy |

Diagnostický základ i atomický V11 celek jsou nyní samostatně vmain. Navazuje úzká prevence epochové clock chyby a samostatný Game phase delta; jejich společné mezistavy vyžadují vlastní ověření. Ostatní světelné, cinematic reuse, static-frustum, editorové a staged-startup změny mají vlastní skupiny. Celý diagnosticContext závisí na dalších profile/light/glTF vrstvách. Nynější main glTF fastpath909d… se liší od frozen1babb… a zůstává samostatný kandidát. Žádná z nových engine/IMAGE/phase oprav není přimíchaná do právě dostupné4186.

Pozdější B6 porovnání má připravené `baseline` a `candidate`, stejné uložené QA počasí, start/stop skripty a trasu venek → západní vstup → jižní chodba → jižní schody 0→1→2→0 → severní schody, v obou směrech, v první i třetí osobě. Zkontrolovat první i opakovaný průchod se svítilnou; po základní trase jízdu a správné A/D. Srovnatelné běhy mají stejný čas, kvalitu, GPU, CSS/interní rozlišení, avatar a HUD; změny nastavení se vyhodnotí odděleně. Názvy starších URL nejsou důkazem toho, kterou verzi hráč skutečně spustil.

Koordinátor zaznamená FPS, p95/p99/max, lokální propady, korekce a kontext scény z automatického logu, ověří souvislost sekvencí a zachová novou relaci mimo původní 07c. Červené záblesky a vzhled potřebují také obraz; samotné logy neukládají kompletní pixely. Na uživateli není ruční konfigurace diagnostiky. Přesný technický postup je ve WT `docs/performance/evidence/b6-transform-20261014/README.md`; živé preview drží samostatný portový task, vlastní GPU měření nyní neběží.

Start helper je po review dokončený: vyžaduje skutečnou rezervaci a průběžně uchovává identitu procesů; při částečném neúspěchu uklízí pouze ověřený vlastní proces. Parser a 18/18 izolovaných mock scénářů PASS na dostupném PowerShell Core7.6.5. Nejde o nový herní/GPU test. Hashy obsahu, HTTP připravenost, skutečný klientský bundle, shodný lightingInstant a archivaci JSONL z cache varianty zajistí koordinátor při pozdějším běhu; helper je nepředstírá.

## Aktualizace 14. 10. 2026 po druhém produkčním testu

Celý Linear projekt byl aktualizován a jeho nesprávný stav Completed vrácen na In Progress. Všech 11 původních issues má dnešní stav, důkazy, zbylé kroky a podmínky přijetí. KEY-1 je Done pouze pro původní rozsah automatické věrohodné diagnostiky; KEY-4 a KEY-10 jsou částečně implementované In Progress, nikoli stále Todo. KEY-9 zůstává Todo; ostatní původní opravy a celková přejímka jsou otevřené. Plošné blokování implementací na úplném dokončení KEY-2 bylo nahrazeno souvisejícími vazbami; závěrečná KEY-11 nadále závisí na všech oblastech.

Nové samostatné úkoly z uživatelského feedbacku:

| Linear | Problém | Priorita |
| --- | --- | --- |
| [KEY-12](https://linear.app/gigeconomy/issue/KEY-12/odstranit-treseni-obrazu-pri-pohybu-z-treti-osoby) | Třesení při pohybu z třetí osoby; rozlišit kameru, interpolaci a síťové opravy | Urgent |
| [KEY-13](https://linear.app/gigeconomy/issue/KEY-13/odstranit-cervene-zablesky-misto-textur-pri-narocnem-nacitani-scen) | Červené záblesky místo textur; nutný synchronizovaný obrazový důkaz | Urgent |
| [KEY-14](https://linear.app/gigeconomy/issue/KEY-14/opravit-neprirozene-nocni-barvy-a-jas-materialu) | Nepřirozené noční barvy/jas; gamma je zatím hypotéza, ne změřená příčina | High |
| [KEY-15](https://linear.app/gigeconomy/issue/KEY-15/opravit-neprirozene-chovani-osvetleni-pri-pohledu-z-dalky) | Nepřirozená vzdálená světla; rozlišit výběr lamp, útlum, emissive a stíny | High |
| [KEY-16](https://linear.app/gigeconomy/issue/KEY-16/odstranit-zaseky-pri-vstupu-do-b6-a-prechodu-mezi-patry) | Odděleně vstup, chodba a patra/schody B6; render i průchodnost | Urgent |

Rozhodující log: `07c227f8-d2f8-4011-a6f8-5d27ad0627a4`, 14.10.00:10:32–00:19:56 Praha, produkční4176, snapshot `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`, 1799 souvislých událostí/296 dávek/session-end/jeden Game start. Kopie v `.cache/playtest-repairs-validation/user-test-20261014-production/`, SHA256 `0ebf9512e10df06d94121358a57133885b7d0371b10d3b0b3027dbbce4b46dbb`. Jediná errors=1 je favicon404. Nastavení se měnila: celá relace je skutečná noc, auto medium→low, cíl60→144FPS, poté high; průměr59.68FPS není stabilních60 ani řízené A/B.

Potvrzeno: 17 ne-resync korekcí≥0.35m, 30 resynců; při zahrnutí resynců29 změřených velkých posunů a maximum10.939m. Jeden respawn má explicitní uživatelskou akci. Světlo741.1ms, B6 vstup169ms, chodba444.9/242.5ms, jižní schody tři okna6.46/6.41/8.07FPS bez nových shader/effect událostí. Pixelové závady z feedbacku se nesmějí popírat absencí JS/render chyby ani vydávat za změřenou gamma/GPU kompilaci.

První dnešní dev test919ec969… byl ovlivněn našimi HMR změnami (4starty/3dispose, síť zachovaná). V čistém4176 se tyto restarty neopakovaly. Pracovní glTF fastpath16/16+strictTS je novější než wave3, nenachází se v uživatelem hrané verzi a vyžaduje novou přejímku. Žádný nový runtime patch nebyl při této aktualizaci Linearu nasazen. Přesný zveřejněný stav16issues je uložen v `.cache/playtest-repairs/linear-published-20261014.json`.

## Původní členění a historické podklady (13. 10. 2026)

Uživatelský cíl: pečlivě zjistit příčiny a opravit **všechny** problémy z testu13.10.2026, včetně chyb diagnostiky. [Linear projekt](https://linear.app/gigeconomy/project/strahov-crazy-show-252107035e48) je samostatný; technicky přiřazen týmuKeyCraft. Cíl zůstává aktivní do doloženého dokončení všech oblastí.

Výchozí audit: [playtest-diagnostics-20261013.md](playtest-diagnostics-20261013.md). Původní log v `.cache/playtest-diagnostics-20261013/session.jsonl`, SHA25630f15b76b579f872d127c61bbdd4821e8779a6082fffb18001878391d2215f6d. Neměnit jej při opakovaných kontrolách.

| Linear | Oblast a nutná podmínka uzavření | Závislost |
|---|---|---|
| [KEY-1](https://linear.app/gigeconomy/issue/KEY-1) | Přesné connection/resync/position logy, incidenty a správný výběr herní relace; regrese a browser-to-disk důkaz | žádná |
| [KEY-2](https://linear.app/gigeconomy/issue/KEY-2) | Měřitelné render pass/shader/asset a network/server příčiny, bounded režie a lifecycle | KEY-1 |
| [KEY-3](https://linear.app/gigeconomy/issue/KEY-3) | Cold i warm svítilna/auto bez sekundových bloků, vizuálně zachované světlo/stíny | KEY-2 |
| [KEY-4](https://linear.app/gigeconomy/issue/KEY-4) | Low/medium/high/auto změny bez blokující přípravy a úniků prostředků | KEY-2 |
| [KEY-5](https://linear.app/gigeconomy/issue/KEY-5) | Stejná trasa a rozlišení bez průjezdových freeze; skutečný profil a odstraněné dominanty | KEY-2/3/4 |
| [KEY-6](https://linear.app/gigeconomy/issue/KEY-6) | Bounded transport bez běžného overflow/ztráty drženého úmyslu, ani při stalls; bez zrychlení/floodu | KEY-2 |
| [KEY-7](https://linear.app/gigeconomy/issue/KEY-7) | Sjednocený čas input/prediction/authority, stabilní auto/pohyb bez trvalých tvrdých oprav | KEY-2/6 |
| [KEY-8](https://linear.app/gigeconomy/issue/KEY-8) | Responzivní cold start s pravdivým ready, méně synchronní přípravy, původní asset/provenience | KEY-2 |
| [KEY-9](https://linear.app/gigeconomy/issue/KEY-9) | Vegetace v měřeném frame budgetu, zachované rozmístění/čitelnost/hustota a lifecycle | KEY-2 |
| [KEY-10](https://linear.app/gigeconomy/issue/KEY-10) | První i opakované otevření editoru bez propadů na8–14FPS, žádné zbylé scény/timery | KEY-2 |
| [KEY-11](https://linear.app/gigeconomy/issue/KEY-11) | Všechny dílčí důkazy + plná test/build/integrace + celá produkční GPU hra/HUD/relace a vizuální přejímka | všechny výše |

## Současné vlastnictví první vlny

- Root `repair-game-integration`: game/UI integrační body, recorder a průběžný render profiler; diagnostické regrese. Přebírá vlastní předchozí WIP podle automatic-diagnostics handoffů.
- `repair-diagnostic-report`: předaný CLI report a jeho testy; vlastní předání původního autora přijato koordinátorem a explicitně předáno podagentovi.
- `repair-light-lifecycle`: svítilna/car light/cinematic a přesně vyjmenované testy. Změna celkového světelného budgetu se nesmí udělat bez nové koordinované rezervace.
- `repair-network-cause`: příčinná analýza a reprodukce, poté nový disjunktní implementační task. Nenahrazuje opravu pouhou dokumentací.
- `repair-production-validation`: výhradně koordinovaný heavy/GPU/build/port4176/2571/2568. Původní dev5173/2567 a starý building-preview nepřebírá.

## Potvrzené příčiny a otevřené otázky

1. Connection telemetry race: welcome může předběhnout vytvořeníGame; následné vytvoření nepřeneslo už známý connected stav.
2. Resync displacement: logging porovnával authoritativní polohu po restore s touž authoritativní polohou před restore. Skutečná předchozí poloha je potřeba pouze diagnosticky a s bezpečným fallbackem při neplatném těle/respawnu; původní recovery se nesmí rozbít.
3. Interaction position: sanitizer správně odmítá instanci RapierVector3; call site musí explicitně projektovat x/y/z.
4. Přepínání světel v installedBabylon9.30 měnílightSources a shader defines, nejen intenzitu. SHADOW závisí i na neprázdnosti renderList. Art lighting souběžně mění počet lamp; jednoduchý always-enabled beam může poškodit slot budget a vzhled. Strategie variant/stabilních slotů potřebuje skutečné GPU ověření.
5. Síťový overflow se objevil i při soustavných13–15FPS a intervalech<112ms, nikoli pouze jednom velkém freeze. 30Hz timer neodčerpával frontu při pokračující60Hz produkci vstupů. Je třeba měřit a odstranit závislost na hladovějícím timeru, nepřekročit serverový limit.
6. Levná reprodukce Rapier+Game.reconcile prokazuje timeline mismatch: při prázdné frontě zůstáváack stejný, auto však fyzikou za1/2/3tick ujede0.233/0.466/0.698m. Klient porovnává capture[ack] s pokročilejším stavem a replay může práci zdvojit. Samotné vyhlazení ani držení posledního inputu tento časový rozpor neřeší.
7. Přesné dominanty rendereru/assety/vegetace/editoru zůstávají před prokázáním otevřené. Žádná hypotéza shader compilation se nevydává za ověřenou příčinu konkrétního snímku.

## Převzetí a přejímka

Každá vlna: levné regrese během implementace; cílený refaktoring/alokace/cache/lifecycle; zastavení souběžných zápisů při stabilním checkpointu; source snapshot včetně testů; následně pnpm test, pnpm build a izolovaná pnpm test:integration. GPU pouze celé produkční hře sHUD, skutečnou kartou a CSS/internal rozlišením, cold i warm akce, shodné prostředí/trasa,1a více rozmanitých reálných relací. Zdrojový hash a všechny neúspěšné pokusy uchovat.

Cíl defaultauto60 naGTX1060 při referenčnímCSS2040×986; odstranit sekundové záseky a opakované skokové korekce/overflow. V každé variantě uvéstFPS,p95,p99,max a podmínky; manuální high se nesmí prohlásit za rychlejší z jiné trasy. Vizuální ověření kamera/A-D/jízda, dveře/schody/styky povrchů a single-world/guest invariants. Otevřený limit neníDone. Potvrzené úplné dokončení vyžaduje výslovný závěrečný audit všech11úkolů.
