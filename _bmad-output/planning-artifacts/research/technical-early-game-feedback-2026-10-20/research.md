---
title: 'Herní feedback a automatický snímek bez HUD'
type: technical
topic: early game feedback
decision: 'Vlastní krátký formulář → server → Linear; automatický snímek bez HUD'
source: 'Primární webové podklady a oddělený lokální audit'
status: complete
ledger_verified: 2
ledger_unverified: 7
ledger_overturned: 1
preset: '3researchers;2rounds;12sources-per-dimension-round'
validation: normal
created: 2026-10-20
updated: 2026-10-20
linear: KEY-51
---

# Herní feedback a automatický snímek bez HUD

## Doporučení

**Krátký formulář přímo ve hře; při otevření automaticky zachytit běžný herní snímek bez HUD, připojit kontext stejného snímku a po odeslání nejprve trvale uložit report na vlastním serveru. Ten jej následně předá do soukromého třídění v Linear.** Automatická fotografie je výchozí příloha, nikoli checkbox „zapnout screenshot“. Samotné otevření nic neposílá.

Nejbližší doložený vzor je historická Subnautica: Po stisku F8 se při otevření formuláře pořídil snímek, jeho odeslání ale bylo volitelné.[1] **Žádný z přečtených herních podkladů nepotvrzuje stejný automatický capture bez HUD.** Je to náš závazný požadavek, jehož výsledek je nutné ověřit.

Výzkum pokryl **11 konkrétních herních případů** a tři další historické vývojářské/beta studie. Podporuje proveditelnost krátkého herního vstupu a odděleného příjmu; nedokazuje optimální počet polí, vyšší konverzi ani výkon. Hry nebyly spuštěny a žádné testovací hlášení nebylo odesláno.

U nás jsou nynější HUD i jmenovky HTML prvky mimo canvas. Kopie samotného plátna je proto vhodný kandidát bez schovávání UI. Capture WIP v KEY-21 již řeší související mechanismus a jeho převzetí vyžaduje dohodu s vlastníkem. Současná diagnostika je pouze lokální, nikoli hotová veřejná služba feedbacku.[38]

Podklady: tři [výzkumné digests](digests/), [doplňující případy](sources-extra.md), [lokální audit s SHA-256](application-audit.md). Níže jsou oficiální pokyny a statické mechanismy rozlišeny od návrhových inferencí. Primární sdělení není praktické ověření klienta či doručení.

## Co dělají jiné hry

Historický early access postup a pozdější support hry s historií EA nejsou tvrzením o jejím dnešním EA statusu. „Nedoloženo“ neznamená neexistující.

| Hra / doložené období | Vstup a obsah | Obraz a diagnostika | Zpracování a důsledky |
|---|---|---|---|
| **Subnautica, EA 2014–2016** | F8, pause, kategorie a text | Auto pořízení, optional send; HUD-free nedoloženo | Anonymizované veřejné reporty; dlouhý feedback na fóru; report automaticky nezakládá úkol.[1] |
| **Subnautica 2, Experimental 2026** | F8 při problému; situace a repro | Auto screenshot + 30 s videa výslovně pro Xbox Insider, nikoli univerzálně pro F8 | Návrhy zvlášť na Nolt, hledání a hlasy; bugy tam nepatří.[2][3] |
| **Grounded 2, současný support** | Known Issues před ticketem; platforma, souhrn, kroky | Ruční screenshot/video, save, systémová diagnostika; auto capture nedoložen | Upvote s Obsidian účtem; podpora pomůže i bez všech příloh. DxDiag může obsahovat jméno počítače či uživatele.[4] |
| **Enshrouded, pokyny 2024–2025 a board** | Escape→Report a Bug; web při nefunkčním startu | Logy, save, DxDiag a doporučený obraz/video; automatika nedoložena | Návrhy přes Feature Upvote, duplicity a veřejné stavy; hlasy nezaručují realizaci.[5][6] |
| **Valheim, současný support** | Samostatná Bug, Feedback, Known Issues a překlady | Monday formulář nešel obsahově přečíst; pole/login/capture unknown | Doložené směrování, nikoli interní workflow.[7] |
| **Satisfactory, EA precedent a nynější support** | Externí QA web pro bugy i feedback | Aktuální QA nešlo načíst; přesná pole a capture unknown | Určené společné místo; nedovozovat login/hlasy/stavy jen z odkazu.[8] |
| **Factorio, reporting a technický popis 2018** | Fórum: jedna chyba, verze, skutečný/očekávaný stav, četnost, repro | Log, relevantní save, případně obraz/video; vedle toho historický crash upload | Agregace crash stacků nenahrazuje reprodukci. Aktuálnost starého uploaderu neověřena.[9][10] |
| **Timberborn, pokyn 2021 a aktuální board** | Vývojář uvádí tracker bez registrace | Crash dialog nabízí ZIP log+save; jinak manuální obraz/log/repro | Search, hlasy, komentáře, stavy a email fallback. Bez registrace neznamená bez všech identifikátorů.[11][12] |
| **Against the Storm, EA FAQ 2022** | Herní F11 nebo helpdesk | Při kontaktu save adresář, popis, četnost, obraz/specifikace; auto přílohy F11 neupřesněny | F11 je anonymizované, nelze odpovědět; návrhy a tracker zvlášť.[13] |
| **Slime Rancher 2, současný support** | Web: email, předmět, popis, typ a platforma | Podle místa pádu Player.log nebo DxDiag; přílohy volitelné | Pokrývá selhání před menu; F2 ani auto screenshot pokračování nejsou doloženy.[14][15] |
| **Hades II, EA pokyn 2024 a support** | F10 výslovně Windows PC podle samostatného vývojářského pokynu | FAQ potvrzuje crash reporter podmíněný Transmit Data; screenshot/annotace/save u F10 unknown | FAQ/email při nemožnosti hry; negeneralizovat Windows zkratku na všechny platformy.[16][17] |

Další nezávislí vývojáři popisují vlastní zkušenost. **Concealed Intent** mělo krátký formulář a automatické připojení existujícího herního logu; screenshot byl možné další rozšíření.[18] **Failure** posílalo přímo do JIRA, drželo příchozí reporty odděleně od backlogu a ověřené duplicity slučovalo. Screenshoty v článku 2015 teprve plánovalo.[19] Beta **Pathfinder: Wrath of the Righteous** dokumentuje Alt+B a kontext objektu pod kurzorem; současná podpora potvrzuje webový fallback.[21][22]

Historický oficiální repozitář Subnautica rozlišuje herní frontend, sběrný backend a webovou prezentaci; sám odmítá být hotovým funkčním balíkem k převzetí.[20] Pro nás z těchto případů plyne rozumnost odděleného příjmu a třídění, nikoli povinnost zveřejnit reporty nebo automaticky začít implementovat každý nápad.

## Doporučený tok hráče

Tato část je vlastní návrh, ne seznam vlastností výše uvedených her.

1. **Vyvolání:** viditelné „Zpětná vazba“ v herní nabídce, úvodním menu i chybě startu. F8 je kandidát po ověření konfliktů; dotykový hráč potřebuje tlačítko.
2. **Capture a formulář současně:** zaznamenat požadavek a připravit kopii nejbližšího normálního úspěšného snímku. Ihned otevřít formulář se stavem „Připravuji snímek“ a umožnit psaní. Multiplayer pokračuje; zruší se držené vstupy a psaní neovládá postavu.
3. **Krátký obsah:** Chyba / Nápad / Ostatní, jeden povinný popis. U chyby nepovinné rozbalení očekávaného chování a reprodukce. Náhled automaticky přiložené fotografie. Hráč může nežádoucí snímek odebrat; základní tok nevyžaduje zapnutí přílohy. Kontakt je volitelný pro doplňující otázky.
4. **Přehled:** „Snímek hry bez rozhraní + technické údaje“, rozbalitelný rozsah. Obecný nápad nepotřebuje celou diagnostickou historii.
5. **Odeslání:** zachovat text i stejnou fotografii při výpadku. Rozlišit „Čeká na odeslání“ od „Přijato, hlášení…“. Přijetí až po persistentním uložení serverem, bez slibu opravy nebo odpovědi.
6. **Bez dostupného snímku:** textový report musí jít dokončit s pravdivým důvodem. Chyba startu/GPU a zastavený loop nesmějí blokovat hlášení nebo vyrobit černý obrázek vydávaný za úspěch.

Dialog má focus uvnitř, Tab/ShiftTab, Escape, návrat focusu a čitelné stavy podle WAI.[37] Capture timeout nesmí blokovat psaní. Čistý snímek nezachytí chybu minimapy či textu HUD: zachovat primární fotografii bez HUD a popis; druhá explicitně vybraná UI příloha může být pozdější rozšíření. Nezaměnit ji za automatický full-page screenshot.

## Capture: volba, výkon, cache a lifecycle

toBlob umí paralelní serializaci, ale samotná kopie nemusí být levná. Výsledkem může být null či PNG místo požadovaného formátu; origin-clean může vyvolat SecurityError. Kontrolovat skutečný MIME a velikost.[23][24]

WebGL preserveDrawingBuffer:false může po kompozici vyčistit obsah; pozdní export po onclick proto není spolehlivý.[25] WebGPU má jiná pravidla: aktuální editor draft drží drawingBuffer přes expiraci currentTexture, ale resize/configure/výměna bufferu jej ovlivňuje; fallback po device loss je nepovinný. Draft není test Edge.[26]

| Varianta | Náklady a obraz | Stav a lifecycle | Závěr |
|---|---|---|---|
| **Jednorázová end-frame kopie canvasu** | Jedna kopie/encode, běžná kamera a postprocess; režie neznámá | Bez současného HTML HUD. Uchovat snímek i metadata, omezit objem práce, nastavit časový limit a umožnit zrušení | **Preferovaný kandidát** přes dohodnutou primitive KEY-21.[28][38] |
| Render-target screenshot / nový render | Další vykreslení, textura, možný jiný obraz | Dočasný stav a disposal, není původní snímek | Nevhodný default. Babylon docs i kód potvrzují další render.[27][28] |
| Trvalé preserveDrawingBuffer:true | Náklady každého snímku se mohou změnit | Parametr při vzniku kontextu kvůli vzácné akci | Bez prokázaného důvodu nevolit.[25] |
| Průběžné foto/video | Předincidentní obraz za cenu stálých kopií, paměti/encode | Další fronty, retence a vlastník pipeline | Až samostatně po měření. |
| Full-page/screen capture | Přidá rozhraní a potenciálně cizí obsah | Neodpovídá čistému canvas výsledku | Není cesta pro požadovanou automatickou přílohu. |

Babylon 9.30.0 pro aktivní kameru registruje onEndFrame a drawImage; jiná kamera přechází na render target.[28] Lokální WebGPU flushuje před end-frame observable. To podporuje hook statickým důkazem, nikoli nulový stall nebo hotový browser test.[38]

**Počáteční návrh k měření:** zachovat poměr stran, delší strana nejvýše 1920 px, WebP s kvalitou 0,9, pravdivý PNG fallback; v metadatech zdrojové interní i CSS rozlišení. Nejvýše jeden pending capture/encode a jeden draftový snímek. Žádné průběžné kopie. Stisk a kopie mohou být různé normální snímky: uložit oba časy a frameId, neslibovat přesný okamžik stisku.

Po zrušení, leave/rejoin či změně enginu odstranit observer a object URL, uvolnit bitmapu a ignorovat starý callback. Po odeslání zůstává pouze omezená pending fronta a potvrzení přijetí. Převzetí KEY-21 musí sjednotit vlastnictví kopie/encode, ne přidat druhou nekontrolovanou pipeline.[24][38]

## Server → Linear

| Varianta | Výhody a cena | Volba |
|---|---|---|
| Browser→Linear | Údaje a cílení trackeru u klienta; vzdálené vícekrokové selhání | Neodpovídá zvolenému serverovému návrhu. |
| Server→Linear bez persistování | Málo místního stavu; výpadek uploadu/create ohrozí potvrzení | Jen prototyp.[29][30] |
| **Persistentní serverový inbox/outbox→Linear** | Disk/store, kapacita, retence a obnova; hráč nezávisí na dostupnosti Linear | **První nasazení.** |
| Databáze a samostatná služba/object storage | Více provozu, vhodné pro více replik a vyšší objem | Rozšíření po doložení potřeby. |

Pro dnešní jednu Node instanci je nejmenší kandidát **asynchronní souborový spool na persistentním volume**: staging textu+binárky, validace/hash, publikování kompletního záznamu a teprve potom potvrzení přijetí. Restart obnoví uložené etapy. Jde o odvozený závěr, který je nutné ověřit praktickým testem pádu a trvalosti uložených dat, nikoli o garantovanou vlastnost současného serveru. Nynější compose.yaml žádné volume nedeklaruje.[38] S existující databází nebo více replikami by bylo nutné volbu přehodnotit.

Doporučený kontrakt:
- Browser vytvoří reportId. Stejné ID+hash vrátí stejné přijetí; ID s jiným obsahem konflikt. Dvojklik nevytvoří další report.
- Server přijme hlášení i od hosta bez multiplayerové relace; pevné cílení týmu/projektu, vlastní origin policy, byte/pixel/MIME limity a omezená fronta. Žádné klientské libovolné URL pro backendový fetch.
- Před prvním create uloží UUIDv4 issue. Oficiální schema dovoluje zvolené id; není tím doložen idempotentní replay celé mutace.[34]
- fileUpload→PUT se všemi vrácenými hlavičkami→assetUrl v Markdown description; uložit výsledek každé etapy. Attachment externí URL není totéž co upload obrázku; stejná URL+issue má vlastní upsert kontrakt.[30][32]
- Ověřit HTTP, GraphQL errors, success a vrácené ID; HTTP 200 může částečně selhat.[29] Po timeoutu create nejprve dohledat uložené UUID a porovnat korelační reportId, nikoli naslepo založit nové.
- Rate limit rozpoznávat i jako GraphQL RATELIMITED s 400, ne pouze 429; odpověď/resetové hlavičky, backoff/jitter, omezené automatické pokusy a viditelná chyba pro správce.[33]
- V Linear nejprve soukromé třídění bug/idea/ostatní, ověření, duplicita, doplnění a přijetí do práce. Transportní idempotence není významová deduplikace různých hráčů.[19]

Linear soubory jsou privátní. assetUrl může být trvalá identita, ale přístup mimo Linear vyžaduje auth nebo dočasně podepsanou URL; neslibovat veřejný trvalý obrázek.[31][34] Token zůstává na serveru. Credential scope, skutečné API schema a zobrazení přílohy musí ověřit budoucí integrace.

**Offline/cache:** IndexedDB draft+Blob je best-effort, ne server potvrzení přijetí; kvóta, eviction a InPrivate zůstávají reálné meze.[35] Retry při online či dalším otevření hry, bez slibu doručení se zavřeným browserem. sendBeacon true znamená zařazení a queued limit 64 KiB, proto ne potvrzení ani vhodný screenshot transport.[36] Preview/private response no-store, object URL uvolnit, žádný image Blob v localStorage nebo herní asset cache.

## Syntéza, protiargumenty a otevřené otázky

Různí vývojáři dokládají proveditelnost krátkého herního vstupu a odděleného třídění.[1][18][19] Veřejné boardy jsou také legitimní cesta pro návrhy a duplicity; výzkum neprokazuje jejich nižší konverzi.[6][12] Naše volba vychází z uživatelského cíle a možnosti strojového kontextu. Vyšší množství lepších reportů ve Failure je anekdota bez kontrolního experimentu.

Obraz nestačí: Factorio odděluje crash signál a reprodukci, ATS ukazuje omezení anonymní odpovědi.[10][13] U nás připojit **identitu skutečně načteného klienta**, zvlášť serverBuildId, čas/frame, renderovou polohu/kameru, režim, kvalitu a obě rozlišení. Server HEAD není identita klienta. Kontext jen v dostupném rozsahu s mezerami, bez chatu, cizích identit a tajných query parametrů; host nepotřebuje multiplayerovou přítomnost. Současný sampled diagnostics context není automaticky přesná render pose ani veřejný záznam posledních 30 s.[38]

Před implementací zbývá:
- Dohoda o capture WIP KEY-21 a vlastnictví Game/UI integrace.
- Reálný WebGL2/WebGPU výstup, barvy, submission timing, resize/device loss, CORS taint, stall a paměť. Statické podklady je nenahrazují.
- Rozlišení, byte budget, timeout a délka dostupného technického kontextu. Kandidát jeden snímek a omezený záznam událostí za 30 s u chyby; žádné kontinuální video. Čísla jsou návrh.
- Deployment volume, kapacita/backup/retence. Startovní návrh browser pending nejvýše 5 reportů / 20 MiB / 7 dní; server neodeslané nesmazat tiše, při kapacitě odmítnout nové přijetí; úspěšně předané binárky 7 dní pro obnovu, v Linear samostatná politika. Nejde o změřené hodnoty ani právní závěr.
- Linear credential a integrační test nejednoznačného create, UUID kolize, uploadu a readbacku. Automatický úklid osiřelých uploadů nebyl doložen.
- Pozdější odpověď/status hráči je další funkce; první verze potřebuje volitelný kontakt a poctivý potvrzení přijetí, ne veřejný seznam reportů.
- Čistý snímek neukáže HUD chybu ani dění před pádem; krátký capture není deterministický replay.

## Praktická přejímka — plán, zatím neprovedeno

1. Host/multiplayer, pěšky/auto, venek/B6, den/noc, kvality a rozlišení: ověřit obraz bez HUD/chatu/minimapy/jmenovek, věrné postprocess barvy a stejná frame metadata; spočítat render calls proti druhému renderu.
2. CZ/EN, klávesnice/dotyk/focus/Escape, držený pohyb, rapid reopen, zrušení, leave/rejoin a opožděný encode. Auto příloha bez ručního zapnutí, psaní při přípravě.
3. Null/MIME/zero canvas/taint, timeout, resize, GPU loss: pravdivý missing-image, žádný falešný úspěch.
4. Offline/storage quota, dvojklik/retry, plný disk, pád před/po potvrzení přijetí, restart každé vzdálené etapy, PUT 403, GraphQL 200 + errors, rate 400/429, timeout po úspěšném create, expirovaná URL/token; jeden report má nejvýše jedno přiřazené issue.
5. Celá produkční hra baseline/idle/capture/encode/upload, skutečné relace a HUD: zdrojový hash včetně testů, GPU, CSS/interní rozlišení, FPS/p95/p99, capture stall a paměť. Optimalitu tvrdit až z měření. Stabilní checkpoint poté pnpm test/build/izolovaná integrace pod rezervacemi.

## Zdroje

Externí zdroje accessed **2026-10-20**. P=primární sdělení/statický kód; N=normativní text/editor draft; L=lokální audit. Jednotlivé vendorové chování zůstává nezávisle prakticky neověřené. WHATWG a Mozilla jsou dokumentační triangulace, nikoli GPU měření.

| ID | Podporované tvrzení | Publisher a přímý zdroj | Publikace / explicitní update | Evidence |
|---|---|---|---|---|
| [1] | F8, auto capture, optional send | [Unknown Worlds: Development Feedback](https://steamcommunity.com/sharedfiles/filedetails/?id=356376081) | 2014-12-15; upd 2016-02-05 | P, historie |
| [2] | F8 a Xbox specifické přílohy | [Subnautica 2 Experimental](https://support.subnautica.com/hc/en-us/articles/60750147889305-Where-do-I-report-bugs-I-find-on-the-Experimental-branch) | pub unknown; upd 2026-08-12 | P |
| [3] | Návrhy odděleně | [Unknown Worlds: Nolt](https://subnautica2.nolt.io/) | unknown | P |
| [4] | Known issues, přílohy, repro | [Obsidian: Report an Issue](https://support.obsidian.net/article/179-report-an-issue) | pub unknown; upd 2025-07-30 | P |
| [5] | In-game a fallback | [Keen: Reporting Bugs](https://enshrouded.zendesk.com/hc/en-us/articles/9767167725853-Reporting-Bugs) | pub unknown; upd 2025-03-21 | P |
| [6] | Návrhy/duplicity/stavy | [Keen: Feature Upvote](https://enshrouded.featureupvote.com/) | unknown | P |
| [7] | Oddělené support kanály | [Iron Gate: Valheim](https://www.valheimgame.com/support/) | unknown | P; iframe gap |
| [8] | QA jako určené místo | [Coffee Stain: Support](https://www.satisfactorygame.com/support/) | unknown | P; QA gap |
| [9] | Ruční bug report | [Wube: How to report a bug](https://forums.factorio.com/viewtopic.php?t=3638) | 2014-05-16; edit unknown | P; dostupnost kolísala |
| [10] | Crash stack versus repro | [Wube: FFF231](https://www.factorio.com/blog/post/fff-231) | 2018-02-23 | P, historie |
| [11] | Bez registrace a crash ZIP | [Mechanistry: bugs/crashes](https://steamcommunity.com/app/1062090/discussions/2/3110269213859735252/) | 2021-02-22; upd 2021-05-13 | P |
| [12] | Search/votes/stavy | [Mechanistry: board](https://timberborn.featureupvote.com/?tag=Feedback) | unknown | P; lead recheck timeout |
| [13] | F11 bez odpovědi | [Eremite: FAQ](https://eremitegames.com/faq-and-livestream/) | 2022-11-08 | P, historie |
| [14] | Pole a přílohy SR2 | [Monomi Park: request](https://slimerancher2.zendesk.com/hc/en-us/requests/new) | unknown | P |
| [15] | Log podle místa pádu | [Monomi Park: Crash Troubleshooting](https://slimerancher2.zendesk.com/hc/en-us/articles/8430266043155-Crash-Troubleshooting-PC) | pub unknown; upd 2026-03-17 | P |
| [16] | Windows F10 | [Supergiant: Press F10](https://steamcommunity.com/app/1145350/discussions/1/4358998952355052872/?l=english) | 2024-05-10 | P |
| [17] | Crash report a email fallback | [Supergiant: Technical FAQ](https://steamcommunity.com/app/1145350/discussions/1/4361248648383659778/?l=english) | 2024-04-18; update unknown | P; F10 a Alt+Tab neplynou z tohoto FAQ |
| [18] | Krátký formulář a log | [Cordingley: Concealed Intent](https://www.gamedeveloper.com/programming/in-game-feedback-forms) | 2015-03-26 | P, historie |
| [19] | Intake odděleně od backlogu | [Dream Harvest: Failure](https://www.gamedeveloper.com/business/in-game-bug-and-feedback-system-for-unity) | 2015-05-04 | P, historie |
| [20] | Tři části systému | [Unknown Worlds: snfeedback](https://github.com/unknownworlds/snfeedback) | GDC 2015; commit unknown | P |
| [21] | Alt+B/context v beta | [Owlcat: beta návod](https://owlcat.games/instruction) | unknown, historická beta | P, PDF text |
| [22] | Webový fallback | [Owlcat: support](https://owlcat.games/support/1000) | unknown | P |
| [23] | Bitmapa/serializace | [WHATWG: canvas](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob) | live standard; pub unknown | N |
| [24] | Null/MIME/URL lifecycle | [Mozilla: toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) | pub unknown; upd 2026-10-12 | P |
| [25] | WebGL buffer | [Khronos: WebGL](https://registry.khronos.org/webgl/specs/latest/1.0/#THE_DRAWING_BUFFER) | live spec; pub unknown | N |
| [26] | WebGPU odlišnosti | [GPUWeb: draft](https://raw.githubusercontent.com/gpuweb/gpuweb/main/spec/index.bs) | live branch; pub unknown | N; browser gap |
| [27] | Render target screenshot | [Babylon: Render Scenes To PNG](https://doc.babylonjs.com/features/featuresDeepDive/scene/renderToPNG) | unknown | P |
| [28] | Větve screenshot API | [Babylon 9.30.0 code](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Misc/screenshotTools.pure.ts) | verze 9.30.0; pub unknown | P |
| [29] | Create a partial errors | [Linear: GraphQL](https://linear.app/developers/graphql) | unknown | P |
| [30] | Upload→PUT→assetUrl | [Linear: File upload](https://linear.app/developers/how-to-upload-a-file-to-linear) | unknown | P |
| [31] | Privátní soubory | [Linear: File auth](https://linear.app/developers/file-storage-authentication) | unknown | P |
| [32] | Attachment upsert | [Linear: Attachments](https://linear.app/developers/attachments) | unknown | P |
| [33] | Rate/reset | [Linear: Rate limiting](https://linear.app/developers/rate-limiting) | unknown | P |
| [34] | Issue UUID/assetUrl | [Linear: SDK schema](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) | live branch; pub unknown | P; introspection gap |
| [35] | Best-effort draft | [Mozilla: quotas/eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | unknown | P |
| [36] | Beacon queue/limit | [Mozilla: sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon) | unknown | P |
| [37] | Dialog klávesnice | [W3C WAI: modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | unknown | P |
| [38] | Kód/WIP/SHA | [Lokální audit](application-audit.md) | 2026-10-20 | L; bez GPU |

## Znovuověření

Strojový výpočet: [staleness.json](staleness.json), [vstupy](claims-dated.json). Historické precedenty neexpirují jako tvrzení o minulosti, ale necertifikují dnešní UI. Neznámé datum publikace nebylo nahrazeno datem přístupu; tyto API/schema/support podklady znovu načíst před implementací. Datumové snapshoty používají explicitní update nebo datum vlastního auditu. Nejdřívější vypočtená kontrola je **2026-11-12**; praktická browserová a Linear přejímka zůstává samostatnou bránou před nasazením.
