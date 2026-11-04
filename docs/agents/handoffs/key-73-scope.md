# KEY-73 · scope a režim odpovědi

Vlastník: `crazy-typka-01a1a80f-scope`. Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `codex/crazy-typka-scope-ui-20261104`, výchozí commit `6805bcd4396eeb6abd17f724914a054b06fa86bc`. Task `key-73-scope`, vlastní claim získán 4.11.2026. Specifikace: `_bmad-output/implementation-artifacts/key-73/SPEC.md`.

## Rozhodnutí před změnou

1. Problém: bezpečnostní moderace a dosavadní complex/local predikáty neomezují produktový rozsah; obecné úkoly proto mohou dojít ke generátoru.
2. Mechanismus: doloženo v Decisions otázkách a provider instrukcích; konkrétní uživatelský runtime ani četnost modelových selhání tímto čtecím průzkumem ověřeny nejsou.
3. Jediná změna: doplnit scope a overview/specific do stávajícího Decisions volání; druhé omezené volání jen pro smíšené dotazy. Čistý helper bezpečně vybere pouze přesné samostatné povolené části.
4. Hlavní metrika: přijetí jen scope >=0.80; všechny invalidní/neúplné výsledky odmítnout, nejvýše1+1 HTTP pokus bez retry, žádné oslabení existujících byte/time/cancel hranic.
5. Správnost: max6 segmentů, Intl.Segmenter(cs/en,sentence) a newline/odrážky/středník, žádná heuristika spojek ani generativní rewrite. Aggregate maxcomplex/maxlocal, jisté overview jinak specific; odmítnutý text nepatří do projekce.
6. Přijetí: cílené adapter/helper testy projdou; runtime integraci, holdout, browser a plné gates dokončí koordinátor. Čisté unit testy nejsou živým modelem potvrzenou kvalitou.

Porovnáno: blacklist je obcházený a blokuje legitimní vulgaritu ve stížnosti; moderace řeší bezpečnostní taxonomii, ne místní rozsah; dodatečné běžné API kolo přidává zbytečnou latenci. Vybrány nezávislé otázky ve stejném volání a druhé pouze pro mixed. Žádná nová trvalá cache/paměť ani serverové procesy.

Podklady: současné `server/crazy-typka-decisions.ts`, `server/crazy-typka-provider.ts`, `server/crazy-typka.ts`, `server/rag-evidence-backend.ts`; [Decisions](https://developers.openai.com/api/docs/guides/decisions), [create reference](https://developers.openai.com/api/reference/typescript/resources/decisions/methods/create), [moderace](https://developers.openai.com/api/docs/guides/moderation), přečteno4.11.2026. Moderation sexual kategorie výslovně vylučuje sexuální vzdělávání; není tedy produktovým filtrem.

## Aktuální checkpoint

Implementace, cílený refaktoring a vlastní ověření dokončeny; příjemce `crazy-typka-01a1a80f-root` integruje a spouští společné review/přejímku. Baseline přímý `node --import tsx --test tests/crazy-typka-decisions.test.ts`: **18 PASS, 0 FAIL**, bez placeného API. Finální přímá sada adapter/helper: **37 PASS, 0 FAIL, 0 SKIP**. Živá modelová správnost ani hotová funkce celé aplikace se tímto neprohlašují.

## Změny a rozhraní

- `server/crazy-typka-decisions.ts`: `ComplexityDecision` zachovává komplexitu, místní podklady a usage; přidává `scope:{kind,confidence}` a `answerMode:{kind,confidence}`. Nová povinná metoda `classifySegments({text,segmentIds},options)` zpracuje2–6pevných selectorů s0..s5 jedním HTTP. Choice odpovědi vyžadují správnou kategorii, confidence a kompletní unikátní normalizovanou probability distribution. Odmítnutí/neúplná odpověď je chyba. Jména modelů dál vybírá pouze server.
- `server/crazy-typka-scope.ts`: exact-excerpt splitter, přesný vstup pro další moderaci, gate0.80, čistá projekce schválených částí a agregace maxcomplex/maxlocal, nejistý režim specific, pevná česká/anglická odmítnutí. `rejectedKinds` rozlišují nejasnost od mimooborového obsahu a objektifikace. Nevlastní shared DTO, historii ani quote buffer.
- `tests/crazy-typka-decisions.test.ts`, `tests/crazy-typka-scope.test.ts`: nové kontrakty, selector integrita,6segmentů i na8191byte unescaped vstupu, neúplné/duplicitní/foreign výsledky, scoped projekce, hranice0.80, skutečné timeout/cancel/transport regrese s injektovaným fetch, přesné zachování místní části a odmítnutí nejasného mixu.
- Tento handoff a `.cache/key-73-scope/` obsahují pouze vlastní evidenci. Cizí untracked předání/evidence a souběžné změny root/UI/KB nebyly převzaty ani editovány. Žádný staging ani commit.

Refaktoring sjednotil původní bounded HTTP/reader/abort/usage mechanismus pro obě router metody, nevznikl druhý transport. Dynamické otázky mají nejvýše24položek, vstup8191UTF-8bajtů a celý request32KiB zůstávají. První6segmentový test doložil příliš dlouhé opakované instructions; byly zkráceny při zachování explicitního scope a limitu, nikoli zvýšením capu. Následná aserce byla přesunuta na scope otázku, kde nyní patří genuine-fragment instrukce. Dva sdílené Intl.Segmenter objekty nenesou obsah konverzací; není přidána trvalá cache uživatelských vstupů ani retry.

## Provedené ověření a identita

- `node --import tsx --test tests/crazy-typka-decisions.test.ts tests/crazy-typka-scope.test.ts`: exit0, **37/37PASS**, finální trvání567ms; log `.cache/key-73-scope/targeted-tests.txt`. Trvání není síťový či herní benchmark.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types node server/crazy-typka-decisions.ts server/crazy-typka-scope.ts tests/crazy-typka-decisions.test.ts tests/crazy-typka-scope.test.ts`: exit0; log `.cache/key-73-scope/scoped-typescript.txt`.
- `git diff --check --` nad vlastními čtyřmi TS soubory: exit0. Prettier použit pouze na tyto přidělené soubory.
- Přesné SHA-256 všech čtyř zdrojů a testů: `.cache/key-73-scope/source-manifest.json`, SHA-256 manifestu `e641b000cf2922ce10c643c5f30d4be7d508d157c347606af9d30021959d6d97`. Manifest zahrnuje testy a výchozí commit; netvrdí identitu celé souběžně měněné aplikace.

Žádný vlastní dlouhožijící proces, port ani GPU scéna. Všechny cílené CLI skončily. Plná sada, build, integrace, skutečný Decisions holdout a browser nebyly tímto taskem spuštěny; vyžadují koordinátorovu navazující rezervaci a přejímku. Prah0.80 je schválená politika, ne zde živě kalibrovaná přesnost.

Předáno koordinátorovi. Claim `key-73-scope` se uvolňuje po tomto záznamu příkazem release; skutečný výsledek je ve společném registru a předávací zprávě. Stav tasku mění integrátor až po přijetí. Další krok rootu: review společného diffu, přesná moderace projektovaného query, ověření reply/mixed lifecycle, živý holdout a praktická UI přejímka.

## Navazující oprava tvaru refusal · 4.11.2026

Vlastní dirty soubory převzaty zpět původním vlastníkem přes `claim --adopt-dirty`, na výslovné zadání rootu a s tímto doloženým původním předáním.

1. Problém: platný scope off_topic končí invalid-response místo pevného místního odmítnutí, jestliže nezávislá vedlejší otázka vrátí refusal.
2. Doložený mechanismus: uložený skutečný HTTP200 výsledek v `docs/verification-evidence/key-73/decisions-shape-diagnostic.json` obsahuje off_topic/confidence0.85 a named answer_mode refusal. Dosavadní validátor vyžaduje choice u každé mode odpovědi.
3. Jediná změna: připustit správně pojmenovaný a strukturálně platný refusal vedlejších routing otázek pouze při scope, který sám nepovoluje přímé generování. Normalizovat pak celou routing trojici na complex0/local1/specific-confidence0; scope a potvrzené usage zachovat.
4. Hlavní metrika: diagnostický denied/refusal tvar projde jako potvrzené rozhodnutí; allowed/confidence>=0.80 s kterýmkoli refusal stále invalid-response.
5. Invarianty: scope refusal, chybějící/duplicitní odpovědi, vadné probabilities/distributions a usage dále selžou; mixed segmenty allowed znovu potřebují všechny4platné odpovědi. Žádná změna promptu, prahu, API kol, byte capu, transportu nebo retry.
6. Přijetí: cílené regrese denied+mode refusal, uncertain allowed+refusal, mixed rejected-segment refusal a allowed-refusal zákaz projdou společně se všemi dosavadními adapter/helper testy a scoped TypeScriptem. Žádné další API volání ani holdout v tomto tasku.

Checkpoint: úzká oprava a cílené ověření dokončeny. Kvalitativní false-block kandidát zůstává odděleným navazujícím krokem koordinátora.

Změny tohoto navázání: `server/crazy-typka-decisions.ts` odděluje kontrolu přítomnosti/unikátnosti od normalizace named refusal až po validním scope; každý ostatní ne-refusal výsledek zůstává přísně validovaný. Refusal nesmí nést další pole mimo name/type. `SCOPE_THRESHOLD` má jedinou definici v adapteru, ze `server/crazy-typka-scope.ts` se dál reexportuje beze změny hodnoty0.80 a dosavadního API. `tests/crazy-typka-decisions.test.ts` přidává4regrese včetně přesného relevantního produkčního tvaru865potvrzených tokenů, uncertain allowed, strict allowed>=.80 a skupinové normalizace rejected mixed segmentu. Žádný prompt ani transport se nezměnil.

Ověření po opravě: přímé `node --import tsx --test tests/crazy-typka-decisions.test.ts tests/crazy-typka-scope.test.ts`: **41PASS,0FAIL,0SKIP**, exit0,541ms. Tentýž scoped strict TypeScript příkaz uvedený výše: exit0, log `.cache/key-73-scope/refusal-scoped-typescript.txt`. `git diff --check` nad vlastními soubory: exit0. Strukturovaný záznam výsledků a nových hashů všech4zdrojů/testů je `.cache/key-73-scope/refusal-source-manifest.json`, SHA-256 `1900a3a870a6eac87f186b0deb2fd90dc28a1953d67c61fc168b6dbb1424e855`. Původní manifest/log37testů zůstává historický.

Předáno zpět rootu; žádný commit, API request, holdout, port ani pomocný dlouhožijící proces. Claim se po zápisu tohoto záznamu opět uvolňuje, skutečný release potvrzuje registr. Nová oprava zachovává místní odmítnutí, ale sama není řešením5kvalitativních falešných blokací ze skutečného holdoutu.

## Kvalitativní kandidát A · 4.11.2026

Původní vlastník na výslovné navazující zadání koordinátora znovu převzal vlastní dirty rozsah přes claim --adopt-dirty; správnostní refusal oprava zůstává přijatá a samostatně doložená.

1. Problém: skutečný holdout určil5místních vstupů jako allowed, ale jejich confidence nedosáhla schválené0.80: menza/večeře0.79, hlášení pokojové závady0.79, kreativní/hudební/herní nabídka0.70 (overview0.42), ENhelp této hry0.49, poděkování/rozloučení0.70.
2. Mechanismus/hypotéza: pravděpodobnosti jsou měření; nejasně vymezené pozitivní místní třídy a záměna neznámé odpovědi/neurčeného detailu za nejasný úkol jsou diagnostická hypotéza. Samotné změny instrukce nejsou důkaz opravy.
3. Jediná změna: pouze request_scope a answer_mode instructions lépe vymezí pozitivní místní třídy, běžné místní reference, úzký význam clarify a přehled nabídek i podle zadaných zájmů. Žádná změna labels, prahu, parseru, transportu, schématu ani počtu volání.
4. Hlavní metrika: root po zamrazení kandidáta provede16casekalibraci a nový nezávislý holdout; cílem jsou nulové false blocks hlavních místních scénářů při nulových průchodech odmítaných úkolů. Tento task žádný modelový běh nespouští.
5. Invarianty: scope0.80, dosavadní named refusal správnost a failclosed, jasný nový školní/sexuální úkol zůstává mimo rozsah i s místním slovem. Šest segmentů s maximálním vstupem stále musí projít původním request capem.
6. Přijetí:41stávajících unit regresí a scoped TypeScript projdou; doložen bude hash promptového kandidáta před předáním, pak už se instrukce během eval nemění. Kvalitativní přijetí náleží výsledku rootovy oddělené evaluace.

Porovnání: snížení prahu by bez nové evidence rozšířilo přijetí i neurčitých či mimooborových požadavků a porušilo zamčenou politiku; blacklist nerozlišuje hlášení závady či legitimní místní stížnost a nepomůže nízké confidence povolených tříd. Vybráno zpřesnění pozitivního významu otázek: zachová stejné4otázky/latenci v počtu kol a bezpečnostní hranice; nákladem je několik tokenů navíc, ověřených byte cap regresí. Žádné doslovné holdoutové věty ani nové keyword pravidlo.

Checkpoint: kandidát A implementován a **zamrazen pro evaluaci**, živý kvalitativní výsledek zatím neznámý. Změněny pouze řetězce request_scope a answer_mode instructions v `server/crazy-typka-decisions.ts`; žádný další runtime ani testový soubor v tomto navázání.

První délková verze téhož kandidáta měla40PASS/1FAIL, protože6sad otázek s8191bytevstupem překročilo původní32KiB request cap. Uložený log `.cache/key-73-scope/candidate-a-tests.txt` byl vyhodnocen; instrukce byly stručně přeformulovány při zachování stejné pozitivní hypotézy, schéma ani cap se nezvýšily. Cílená maxcap regrese pak prošla. Finální přímá celá adapter/helper sada: **41PASS,0FAIL,0SKIP**, exit0,435ms, log `.cache/key-73-scope/candidate-a-final-tests.txt`. Scoped strict TypeScript: exit0, log `.cache/key-73-scope/candidate-a-scoped-typescript.txt`. `git diff --check` vlastního rozsahu: exit0.

Zmrazený SHA-256 adapteru je `72d509ade05860dc397fd0765ec2f810eb2ad479bf514c0b7d2be0c9fc5e37fd`. Manifest všech4zdrojů/testů `.cache/key-73-scope/candidate-a-source-manifest.json`, SHA-256 `22e934bda5de5870ebb63cd30c45957572f64ce2f15d537c9134bd027dfb9703`, odděluje kandidáta od předchozí správnostní opravy. Původní soubory/evidence zůstaly zachovány.

Žádné API, nové procesy, heavy ověření ani commit. Předáno rootu pro16casekalibraci a nový nezávislý holdout; do jejich uzavření se prompt nemění. Claim key-73-scope se po tomto záznamu uvolňuje; přijetí kvalitativního kandidáta nemohou potvrdit samotné unit testy.

## Kvalitativní kandidát B · oddělená politika formy

Původní vlastník na výslovné navazující zadání rootu převzal stejný vlastní dirty rozsah přes claim --adopt-dirty. Prompt kandidáta A se nemění.

1. Problém: kalibrace A opravila všech5dřívějších false blocks (scope confidence0.84–0.98), ale správně zvolený creative overview sconfidence0.66 helper převrací na specific.
2. Mechanismus: uložené kalibrační rozhodnutí modelu již volí správnou formu; resolvedAnswerMode nevhodně znovupoužívá bezpečnostní SCOPE_THRESHOLD0.80 pro nezávislé formátování. Tematické oprávnění a forma mají rozdílný dopad.
3. Jediná změna: pouze helper zavede ANSWER_MODE_THRESHOLD0.5 a overview přijme při finite confidence>0.5, nejvýše1. Při<=0.5 zůstává specific. Scope>=0.80 se nemění; prompt/wire/počtyvolání zůstávají.
4. Hlavní metrika: existující kalibrační overview0.66 se bez nového API vyhodnotí jako overview; scope0.79 dál vždy clarify. Root naváže nezávislou48sadou sjiž zamčenými labels.
5. Invarianty: forma nepovoluje generování ani dražší model; scope a complex/local routing zůstávají oddělené. Invalidní confidence není overview. Agregace přijatých segmentů musí použít stejnou oddělenou mode politiku.
6. Přijetí: unit hranice0/0.49/0.5/0.5001/0.66/0.79/1, scope0.79, agregace a všechny dosavadní adapter/helper regrese projdou spolu se scoped TypeScriptem. ŽádnéAPI v tomto tasku.

Porovnání: změna promptu by zbytečně měnila již správně zvolený overview a narušila zamrazený kandidát A; snížení scope prahu by rozšiřovalo oprávnění kvůli formátu. Vybrána samostatná konzervativní majoritní mode politika, specific při nerozhodném0.5; žádná nová state/cache, náklad ani API roundtrip.

Checkpoint: kandidát B dokončen a zamrazen pro navazující rootovu evaluaci. Runtime změna pouze v `server/crazy-typka-scope.ts`: nová exportovaná konstanta ANSWER_MODE_THRESHOLD0.5 a přijetí overview při confidence>0.5. V `tests/crazy-typka-scope.test.ts` doplněny všechny požadované hraniční hodnoty, scope0.79 nezíská oprávnění ani soverview1, agregace používá oddělenou formovou politiku a nerozhodné0.5 zůstává specific. Žádná změna instrukcí či wire.

Ověření: přímá adapter/helper sada **42PASS,0FAIL,0SKIP**, exit0,654ms; log `.cache/key-73-scope/candidate-b-tests.txt`. Scoped strict TypeScript příkaz uvedený výše: exit0; log `.cache/key-73-scope/candidate-b-scoped-typescript.txt`. `git diff --check` vlastního rozsahu: exit0. Manifest `.cache/key-73-scope/candidate-b-source-manifest.json` obsahuje přesné4zdroje/testy a oba odlišné prahy. SHA adapteru kandidáta A zůstává `72d509ade05860dc397fd0765ec2f810eb2ad479bf514c0b7d2be0c9fc5e37fd`, takže kalibrovaný prompt nebyl změněn.

Bez API, commitů, portů a dlouhožijících procesů. Předáno rootu; claim se po tomto záznamu uvolňuje. Unit regrese potvrzují vyhodnocení uložené overview confidence0.66 a zachování bezpečnostního scope0.80; nepotvrzují výsledek nové48case evaluace.

## Kvalitativní kandidát C · mixed není permission

Rootův nezávislý48holdout kandidáta A+B **zamítl**:48platných odpovědí, žádný průchod forbidden, ale1/16core a2kontextové false blocks; všech8mixed skončilo clarify. Předchozí unit PASS neznamenaly kvalitativní přijetí. Root výslovně zadal tento úzký navazující kandidát; původní vlastník znovu claimnul vlastní doložený dirty rozsah. B byl do tohoto nového zadání stabilně zmrazen.

1. Problém: raw mixed0.50/0.70/0.56/0.37/0.57 se před bezpečným druhým classify změnily na clarify. Část vícero úkolů byla chybně posouzena jako off_topic sconfidence0.45/0.27. Místní nabídka se zájmy, cesta k místní provozovně a reply sčíslem bloku mají nízkou scope confidence0.54/0.71/0.79.
2. Mechanismus/hypotéza: helper doloženě používá admission práh i pro raw mixed, přestože mixed dovoluje pouze další omezenou kontrolu. U textových klasifikací je hypotézou nevyřešený místní referent a posuzování poslední věty namísto celého USER payloadu; root současně opravuje jeho explicitní obalení.
3. Jediný kandidát: mixed svalidní confidence vrátit jako mixed bez admission prahu, jinak gate zachovat. Pouze scope instructions upřesní lokální reference, krátké upřesnění čísla bloku a prioritu skutečných současných local+unrelated požadavků vcelé posuzované zprávě. Žádná změna schématu, labels, prahů povolení/formy ani caps.
4. Hlavní metrika: nové unit hranice pro mixed pošlou pouze kbounded druhému callu; každý allowed segment dál potřebuje>=0.80. Kvalitativní mixed úspěšnost a kontextové false blocks znovu vyhodnotí root po freeze, tento task API nespouští.
5. Invarianty: allowed/off/clarify sconfidence<0.80 zachovají clarify, invalidní confidence nikdy mixed. Druhé Decisions nepustí nejasný/mixed segment ke generování. Tematické>=0.80, forma>0.5, max6/max8191/32KiB, failclosed/refusal/usage a početkol1+optional1 zůstávají.
6. Přijetí: všechny cílené adapter/helper regrese včetně nových mixed hranic a povolení segmentů projdou se scoped TypeScriptem; doložit nové SHA a zamrazit. Žádná úprava KB, runtime série ani tvrzení ofinálním globálnímPASS. Dříve zahájený globální lokální test před C není finálnícheckpoint.

Porovnání: snížení allowed prahu by měnilo bezpečnostní oprávnění a neřešilo záměnu mixed spermission. Další nový planner/API by zvyšoval náklad. Volba ponechá původní bounded rozklad a oddělí jeho dovolení od dovolení generace; stručné doplnění scope řeší význam místních odkazů bez keyword blacklistu.

Checkpoint: C implementován a zdrojově **zamrazen pro evaluaci**, kvalitativní výsledek neznámý. `assessScope` nejdříve ověří finite confidence v0..1, pak raw mixed vrací pouze jako mixed bez admission prahu; ostatní kind zachovávají>=0.80. Projekce mixed segment vždy vyloučí a každý allowed segment potřebuje>=0.80. Nová unit regrese pokrývá počáteční mixed0/0.37/0.5/0.57/0.7/0.799999/0.8/1 i segmenty na obou stranách bezpečnostní hranice.

Změny pouze `server/crazy-typka-scope.ts`, request_scope instructions v `server/crazy-typka-decisions.ts` a `tests/crazy-typka-scope.test.ts`. Answer_mode instructions a jeho>0.5 politika zůstaly. Jedno rozšíření scope textu bylo o58bajtů nad původním32KiB request capem na6/max8191 regresi (42PASS/1FAIL, `.cache/key-73-scope/candidate-c-tests.txt`); uložený výsledek byl vyhodnocen a jen formulace téhož scope kandidáta zkráceny. Cílená cap regrese poté prošla bez změny limitu.

Finální cílená sada: **43PASS,0FAIL,0SKIP**, exit0,438ms; log `.cache/key-73-scope/candidate-c-final-tests.txt`. Scoped strict TypeScript: exit0; log `.cache/key-73-scope/candidate-c-scoped-typescript.txt`. `git diff --check` vlastních souborů: exit0. Manifest všech4zdrojů/testů `.cache/key-73-scope/candidate-c-source-manifest.json`, SHA-256 `30e608c740018de31d3e6ac3ed64714c134d542a597bf9e058182d266e42eec8`.

Zmrazené zdrojové SHA-256: adapter `c716efd726519cd867a52c542acf49f6e4d358b3f487e78bc9889f5494e391de`, helper `5c74ae37ed0160bcdcb13821caa07603732b2a1f85435d3dfacc94457f0e603e`. Od předání těchto hashů rootu již žádné zdrojové zápisy. BezAPI, commitu, portu a pomocného procesu. Claim se po zápisu této evidence uvolňuje. Root sjednotí svůj nový whole-payload wrapper sC a vyhodnotí skutečné nové případy; žádný dřívější globální lokální běh není vydáván za finálníPASS.

## Kandidát D · oddělená binary admission probability

Kalibrace C byla zamítnutá: parent mixed již rozpoznán, ale raw allowed segmenty confidence0.27–0.60 stále nevstoupily; deiktický místní dotaz confidence0.39. Root zastavil další pouhé promptování a provedl rozlišovací diagnostiku. Probe2 `docs/verification-evidence/key-73/admission-predicate-probe2.json` má9/9správných výsledků, včetně dvou samostatných místních segmentů0.91/1.0 a forbidden0–0.02. Probe1 současně doložil chybu při započtení jiných originálních úkolů do vybraného segmentu. Původní vlastník znovu adoptoval vlastní dirty rozsah na výslovné zadání rootu.

1. Problém: bezpečnostní gate používá multiclass confidence jako pravděpodobnost výlučně povoleného doménového úkolu; skutečné nízké confidence blokují správně označené místní úkoly.
2. Mechanismus: official Decisions docs rozlišují predicate probability a samostatnou choice confidence. Uložený rozlišovací binary probe2 na stejných typech vstupů dává9/9správně; nejde jen o hypotetické snížení prahu. Kvalitativní obecná záruka tím nevzniká.
3. Jediný kandidát: nový povinný predicate local_task_allowed vrací admissionProbability; přímé povolení jen raw allowed a admission>=0.80. Scope confidence zůstává metadaty/důvodem. Doménovou policy sdílet jednou ve skutečné developer zprávě, exact moderated text oddělit jako user.content, krátké otázky zůstávají nezávislé. Selected domain hodnotí jen candidate.text, ne jiné úkoly original.
4. Hlavní metrika: nové unit hranice potvrdí>=0.80 binary oprávnění a oddělení choice metadata; root následně vyhodnotí skutečnou přejímku D. Žádné další živé API v tomto tasku.
5. Invarianty: oba gate fields musí být platné/non-refusal; ancillary3refusals se smějí normalizovat jen bez efektivního oprávnění. Agregovaná admission je MIN přijatých segmentů. Mixed/off nejsou přímé povolení. Pořád1+optional1HTTP,8191exactUSERbajtů a32KiBcelého requestu, finite model/caps, žádný rewrite ani veřejnéDTO.
6. Přijetí: adapter/helper testy a strict scoped TS projdou, včetně30otázek pro6segmentů/max8191, allowedlabel+admission0.79/0.8, wronglabel+admission0.95 nesmí povolit, allowed+admission0.95+ancillary refusal musíerror. Zmrazit nové zdrojové hashe a předat rootu fixtures/wire.

Porovnání: snižování multiclass confidence mění práh nad nesprávnou metrikou a neřeší její význam; regex nevyhodnotí význam úkolu; další promptový pokus bez rozlišovacího důkazu byl po C zastaven. Vybrán samostatný typovaný predicate sdaty zprobe2. Prosté přidání otázky by zvýšilo6/max8191request32472→35646bajtů, nad32768; sdílená pevná policy vdeveloper zprávě odstraní redundantní instrukce bez zvýšení capu.

Wire primárně ověřen4.11.2026 v [create reference](https://developers.openai.com/api/reference/resources/decisions/methods/create): input je pole zpráv, developer.content i user.content mohou být string; developer zpráva přijímá pouze text. Pevná policy nikdy neobsahuje runtime USER/AI obsah. Exact moderovaný text zůstane beze změny vuser.content. Čtecí dokumentace není placeným API pokusem.

Checkpoint: D implementován a **zdrojově zamrazen** pro rootovu další evaluaci; nové skutečné modelové výsledky hotové integrace D ještě nejsou známy. Root navíc levně ověřil stávající choice-category probabilities (`choice-metric-probe.json`): problémové případy0.51/0.55 také zůstaly pod0.80. Samotné využití již dostupné distribuce proto nevysvětlí ani neopraví doloženou blokaci; samostatný predicate zůstává podloženou zvolenou variantou.

Změněny čtyři přidělené TS soubory: adapter přidává `admissionProbability`, povinný5.predicate a validaci obou gate fields; parser zohledňuje efektivní binary permission při ancillary refusal. Pevná DOMAIN_POLICY je jednou vdeveloper.content, exact moderovaný vstup vuser.content. Helper vyžaduje allowedlabel+binary>=0.80, agreguje admissionMIN a uchovává explicitní volitelný context pro krátké segmenty odděleně od original. Original se pro doménový predikát nepoužívá, scope důvodová otázka jej používá pouze pro genuine-request vsquote. Root aktualizoval vlastní service fixtures a optional context caller; žádný shared/public/UI kontrakt nebyl vtomto tasku měněn.

Finální přímá adapter/helper sada: **45PASS,0FAIL,0SKIP**, exit0,684ms; `.cache/key-73-scope/candidate-d-final-tests.txt`. Scoped strict TypeScript: exit0; `.cache/key-73-scope/candidate-d-scoped-typescript.txt`. `git diff --check` vlastního rozsahu: exit0. Unit regrese pokrývají povinný predicate vdenied i allowed výsledku, refusal/invalidprobability, label+probability souhlas při nízké class confidence, allowed+admission0.95+ancillaryrefusal error, explicitní context, neředěnou MIN agregaci a beze změny všechny transportní/byte/timeout/cancel hranice.

Čistě lokální serializační kontrola sinjektovaným fetch bez sítě doložila při6segmentech a8191neescapovaných USERbajtech **30otázek,32502bajtůrequestu**, ztoho1342bajtů pevné developer policy jednou. Oba původní capy zůstaly. Kontext/payload sdalším JSON escaping stále podléhá celkovému32KiB capu; jeho odmítnutí není ztracené měření ani zvýšení limitu.

Manifest všech4zdrojů/testů `.cache/key-73-scope/candidate-d-source-manifest.json`, SHA-256 `9bd0638d56b5ceb09fbbe28f2c37c98f9e6de8c6264cdd0300f01fc7e1d4b14b`. Zmrazené zdrojové SHA-256: adapter `2eb996a7ba801dffe4303a7dab9ec19f088e7ac889ae120708e001e078b4bb15`, helper `c6ef7813e9fd4dbc868051271fa5a89cf363baeec4ca39ab95655ac13e94f466`. Od oznámení freeze rootu žádné další zdrojové zápisy. Předáno ksamostatné integraci/evaluaci; unitPASS není kvalitativní přijetí. Žádný skutečný API request, commit, heavy běh, port ani pomocný proces. Claim se po tomto záznamu uvolňuje.

## D2 · typovaný API refusal je explicitní denial

Rootův nezávislý běh D má16/16core,6/6mixed a2clarify správně; jediný technický případ o16 diagnostika `docs/verification-evidence/key-73/diagnose-o16.json` vyřešila jako platný objectifying_people/confidence0.91, gate predicate refusal a vedlejší refusal, potvrzené usage762. Dřívější požadavek odmítat oba gate refusal jako invalid-response byl rootem výslovně zpřesněn: známý typovaný refusal se smí zpracovat výhradně jako NEpovolení. Původní vlastník na toto úzké navazující zadání adoptoval stejný vlastní dirty rozsah.

1. Problém: slušné pevné odmítnutí objektifikace se mění na technickou provider chybu, přestože API vrátilo platný a jednoznačně nepovolující typ.
2. Mechanismus: skutečný shape diagnostický výsledek má validní usage a scope, ale local_task_allowed:type refusal; dosavadní parser jakýkoli gate refusal označuje za vadný protokol.
3. Jediná změna: správný named refusal některého gate normalizovat pouze na denial. Admissionrefusal=>0; validní nonallowed scope zachovat, allowed+admissionrefusal=>clarify/confidence1. Scope refusal (i svalidním predicate0.99) nebo oba refusal=>clarify1/admission0. Vedlejší routing normalizovat konzervativně, potvrzené usage zachovat.
4. Hlavní metrika: uložený objectifying tvar bude potvrzené lokální odmítnutí místo technické chyby; žádná kombinace refusal nikdy neposkytne permission. Root naváže immutable R2 se skutečnou službou/UI.
5. Invarianty: missing/duplicate/malformed gate nebo vedlejší nonrefusal shape pořád error; oba validní gate allowed+.99 a ancillary refusal pořád error. Žádná změna instrukcí, modelu, prahů, počtu otázek/HTTP, wire, byte caps nebo další modelová série.
6. Přijetí: relevantních7kombinací, přesný o16 shape a všechny dosavadní unit regrese projdou se scoped strict TypeScriptem. Poté D2 zmrazit, handoff/release; žádné další zdrojové změny vtomto tasku bez nového konkrétního zadání.

Porovnání: nový prompt ani nižší práh neřeší správné rozpoznání explicitního API refusal; plošné tolerování vadných gate by oslabovalo protokol. Vybrána strukturálně přísná normalizace známého refusal do nepovolujícího stavu, bez opakování API či dalšího plánovače.

Checkpoint: D2 implementováno, ověřeno a **zdrojově zamrazeno**. Změněn pouze parser/normalizace v `server/crazy-typka-decisions.ts` a relevantní regrese v `tests/crazy-typka-decisions.test.ts`. Žádná instrukce, doménová policy, wire, model, hodnota prahu, cap ani helper se nezměnily. Normalizace každé skupiny probíhá až po strukturální kontrole všech přítomných odpovědí; chybějící/duplicitní názvy a vadné nonrefusal odpovědi proto nemohou být zakryty denialem.

Přímá adapter/helper sada: **52PASS,0FAIL,0SKIP**, exit0,631ms; log `.cache/key-73-scope/candidate-d2-tests.txt`. Sedm nových kombinací zahrnuje přesný relevantní o16shape sp762potvrzenými tokeny, off/clarify/mixed/allowed+admissionrefusal, scope refusal svalidním predicate0.99 a obagate refusal. Původní allowed+.95+ancillaryrefusal stáleerror; nové malformed-refusal a malformed nonrefusal vedle gate refusal takéerror. Scoped strict TypeScript: exit0, `.cache/key-73-scope/candidate-d2-scoped-typescript.txt`. `git diff --check` vlastního rozsahu: exit0.

Manifest4zdrojů/testů `.cache/key-73-scope/candidate-d2-source-manifest.json`, SHA-256 `e1e980208da709e77dbc4f21effc068d1f3ac358039b4dbf48081d5f371cce87`. Finální zmrazený adapter SHA-256 `9886e6017230e7548d0a27d040edf04d7dc9aef9c91c37e4fc0d28c280211a47`; helper zachoval SHA-256 `c6ef7813e9fd4dbc868051271fa5a89cf363baeec4ca39ab95655ac13e94f466`. Od oznámení tohoto freeze rootu žádné zdrojové zápisy.

Bez skutečného API, commitů, heavy ověření, portů a pomocných procesů. Předáno rootu pro immutableR2/službu/Edge/CI, bez tvrzení o jejich výsledku. Claim se po tomto záznamu uvolňuje. Další zdrojové změny tohoto tasku nejsou plánovány; nový skutečný problém vyžaduje nové konkrétní zadání a zachovanou diagnostiku.

## Navazující neutrální mixed refusal · cílená UX správnost

Root poskytl nový konkrétní důkaz HTTPmixed-r3 a úzké zadání textu; původní vlastník znovu adoptoval pouze vlastní doložený dirty rozsah. Jde ovýslovné navazující zadání poD2freeze, ne pokračování modelového tuningu.

1. Problém: správně zodpovězená místní část snejistým zbytkem končila obecnou otázkou clarify namísto stručného odmítnutí zbytku.
2. Mechanismus: raw off-topic segment snízkouconfidence se bezpečně změnil na clarify; server zvolil jeho otázkový text. Root nezávisle mění caller na jednotný non-objectifying mixedRefusal. Doménová klasifikace ani bezpečnostní gate nejsou chybou.
3. Jediná změna tohoto tasku: pouze český a anglický mixedRefusal budou neutrálně odmítat zbývající část bez tvrzení, že je jistě mimooborová, a bez otázky. Objectifying odmítnutí zůstane přesně zachováno.
4. Hlavní metrika: obě lokalizace neobsahují otazník ani falešné označení nejisté části za mimoobor; další místní otázku lze položit samostatně.
5. Invarianty: žádné změny gate, prahů, modelu, rolí, wire, labels, zdrojů, source guards, procesu/API/GPU. Root vlastní změnu serverového calleru a jeho testy.
6. Přijetí:52cílených adapter/helper regresí a diffcheck projdou; žádné API, build, GPU, CI ani commit. Poté handoff/release pro rootovu navazující integraci a krátký in-game smoke.

Porovnání: clarify otázka by pokračovala vnechtěném doplňování zbytku; dosavadní kategorické mimooborové odmítnutí by nepravdivě označilo i nejasnou místní část. Vybrán jednotný neutrální text, bez dalšího rozhodování či stavu.

Checkpoint: úzké UX doladění dokončeno. Změněny jen dvě mixedRefusal lokalizace v `server/crazy-typka-scope.ts` a dvě sémantické aserce vexistujícím lokalizačním testu `tests/crazy-typka-scope.test.ts`. CZtext přesně podle rootova zadání, EN odpovídající bez otázky; nejistý zbytek se neoznačuje za jistě mimooborový. Oceněný objectifying text a všechny gate/policy funkce beze změny.

Přímá adapter/helper sada **52PASS,0FAIL,0SKIP**, exit0,620ms; log `.cache/key-73-scope/mixed-refusal-ux-tests.txt`. `git diff --check` vlastního rozsahu: exit0. Helper SHA-256 `2526e0e146b8da7bfd08b193ab2f899bb0a26c81dd7bc91ea051d22c40febe37`, test SHA-256 `df395ca0ecb3541e969711559d238461d25ef09af1f1f2ef4d02f9e916083ead`. Žádné API, build, GPU, CI ani commit; CPU CLI skončilo bez pomocných procesů.

Předáno rootu kjeho samostatně vlastněnému calleru a navazující integraci. Claim se po tomto záznamu uvolňuje. Výsledky dalšího herního smoke a CI tento task nezná a neprohlašuje.
