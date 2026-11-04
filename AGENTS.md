# Práce na StrahovCrazyShow

## Výslovná grafická větev na D — zadání 4. 11. 2026

Pro tuto práci uživatel výslovně mění starší pravidlo main-only: grafická vylepšení a navazující opravy záseků probíhají v D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104 na větvi codex/graphics-smoothness-20261104, založené z6805bcd4396eeb6abd17f724914a054b06fa86bc. Tato konkrétní výjimka má přednost před níže zachovanými historickými pravidly main-only. Další kopie se nezakládají. C checkout/main, cizí WIP a produkční8080 se nemění.

Koordinační registr zůstává společný v Git common directory původního repozitáře. Zdrojové rezervace, heavy-validation/GPU/porty a pravidla praktického měření platí nadále; worktree není náhradou koordinace. Všechny příkazy používej s výslovnou pracovní cestou naD, protože ručně vytvořený worktree není připojen jako spravovaný checkout aplikace.

Před implementací ověř očekávané chování, existující kód a vhodné primární podklady. Uživatel výslovně požaduje průzkum před změnami a praktické ověření výsledku.

## Jediná pracovní větev a kopie — výslovné zadání 29. 10. 2026

- Veškerá další práce probíhá přímo na `main` v `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`. Nevytvářej jiné větve, worktrees ani kopie projektu; toto pravidlo má přednost před staršími návody a BMAD/automatizačními výchozími postupy.
- `main` obsahuje aktuální přijatý kód i dohledatelnou rozpracovanou práci. Každý ověřený celek commituj přímo na main; nenechávej výsledek pouze ve vedlejší kopii. Neověřené prototypy označ pravdivě v `docs/work-in-progress.md`, nesmějí se ztratit ani vydávat za hotovou funkci.
- Souběžní agenti používají tentýž checkout a disjunktní souborové rezervace. Nezakládej izolovanou větev jako náhradu koordinace. Náročné ověřování zůstává serializované.
- Před zápisem ověř skutečný checkout a větev. Staré cesty ve výzkumu/handoffech jsou historická evidence, nikoli oprávnění je obnovit. Neměnné testovací buildy smějí být pouze výstupy v `.cache`, nikoli další Git checkouty.
- Přehled převzatých nedokončených celků a přesných zachovaných zdrojů je v [docs/work-in-progress.md](docs/work-in-progress.md).
## Výslovný postup uživatele od 14. 10. 2026

- Před každou opravou či funkcí nejdřív proveď důkladný výzkum celého dotčeného řetězce: příčiny, závislosti a vzájemné dopady. Projdi relevantní primární zdroje a reprodukční důkazy; odliš doložený mechanismus, hypotézu a chybějící měření.
- Před implementací porovnej všechny rozumné varianty řešení včetně jejich nákladů, rizik, dopadů na výkon, vzhled, chování, cache a lifecycle. Zaznamenej volbu a proč je pro konkrétní problém nejlepší. Výzkum není jen potvrzení první navržené opravy.
- Teprve po tomto průzkumu a rozhodnutí implementuj, proveď cílený refaktoring a relevantní ověření. Opravy/funkce commituj samostatně a průběžně integruj do main po jednotlivých ověřených celcích. Nepřibaluj cizí WIP a nevyužívej jednu velkou dávku nesouvisejících změn.
- Linear aktualizuj průběžně po průzkumu, rozhodnutí, implementaci, ověření a integraci. Uváděj současný stav, důkazy, otevřené otázky, skutečné výsledky testů a související commity; neoznačuj celek Done podle dílčího testu.
- Hranou testovací verzi drž neměnnou a před další prací ověř skutečnou URL a identitu klienta. Vývojová HMR karta není izolovaný uživatelský test. Oddělená pracovní kopie musí zachovat koordinační rezervace a vlastnictví vstupů/výstupů.

## Než začneš měnit soubory

1. Přečti [mapu stacku a vlastnictví](docs/agents/architecture.md), [pravidla koordinace](docs/agents/README.md) a [evidenci převzatého WIP](docs/agents/current-work.md). Načti relevantní podklady a testy své oblasti; nečti hromadně archivní evidenci.
2. Spusť `git status --short`, `git worktree list` a `node scripts/agent-tasks.mjs status`. Registr obsahuje skutečné rezervace; task JSON je zadání, nikoli důkaz, že na něm někdo pracuje. Neuvedený vlastník neznamená volné rozpracované soubory.
3. Vyber přidělený úkol v `docs/agents/tasks/`. Před prvním zápisem získej rezervaci pomocí `node scripts/agent-tasks.mjs claim --task ID --owner JEDINECNE-ID-RELACE`. Po neúspěchu do rozsahu nezapisuj. Čtení a nezávislý průzkum rezervaci nepotřebují. `ready` není pokyn začít neobjednanou práci.
4. Upravuj pouze `writePaths` svého úkolu, včetně testů, podkladů a generovaných výstupů. Změnu API, společného vstupního souboru nebo dalšího assetu předem domluv s koordinátorem; ten zajistí navazující úkol či změnu rezervace. Agent nerozšiřuje rozsah sám a nedělá plošné formátování.
5. Při dlouhé práci obnovuj `heartbeat` nejpozději po 15 minutách a před další sadou úprav. Zastaralá rezervace zůstává obsazená. Neodstraňuj cizí zámky, neukončuj cizí proces podle portu ani nepřebírej práci jen podle stáří či neexistujícího PID.
6. Implementaci, cílený refaktoring a relevantní ověření předávej společně podle [šablony předání](docs/agents/handoff-template.md). Rezervaci uvolni až po ukončení vlastních pomocných procesů a předání; `release` neznamená hotovo. Koordinátor aktualizuje stav úkolu a integruje výsledek.

Koordinátor je agent vedoucí konkrétní uživatelské zadání, ne trvale určitý model. Jednomu souboru patří v daný okamžik právě jeden zapisující agent. Delegace má uvést přesné soubory, testy a výstupy; podagent si rezervuje vlastní disjunktní task. Převod rozpracované práce zaznamenej v předání. `--adopt-dirty` smí použít pouze doložený původní vlastník/příjemce předání, nikdy jako obcházení kolize.

Společné integrační body `client/game.ts`, `client/ui.tsx`, `client/world-renderer.ts`, `server/index.ts`, `shared/simulation.ts`, `shared/types.ts` a `shared/world.ts` rezervuj výslovně. Totéž platí pro `package.json`, lockfile, konfiguraci, tento soubor, katalog úkolů a `docs/verification.md`. Znalost oblasti nedává vlastnictví těchto souborů.

Build, celá sada testů, integrace, zátěžové měření a Blender sdílejí zdroj `heavy-validation`; GPU práce navíc `gpu`, build do pracovního stromu `workspace-build`, síťový proces `port:<číslo>`. Uveď je v tasku a rezervuj před spuštěním. Výchozí integrace používá pevný port 2568. Běžné lehké cílené CPU testy mohou běžet souběžně. Před GPU měřením ověř také skutečně běžící scény, protože registr neumí řídit dříve spuštěné programy.

Na sdíleném checkoutu nepoužívej `git add .`, hromadný commit, `reset`, `restore`, `clean`, `stash` ani přepnutí větve nad cizími změnami. Změny přidávej po konkrétních souborech. Worktree odděluje pracovní soubory, ale ne integrační odpovědnost ani GPU/porty. Před převzetím práce z worktree ověř konkrétní commit/diff a testy. Neregeneruj modely ani datové katalogy bez rezervace jejich vstupů i výstupů.

Aktivní rezervace jsou lokální ve společném Git adresáři; nesdílejí se mezi nezávislými klony/stroji a samy neblokují editor. V takovém případě urči jednoho koordinátora a jedno místo přidělování, nebo použij společnou externí službu. Úkoly a předání jsou verzované, provozní PID/rezervace se necommitují. Existujícím relacím je nutné nové instrukce výslovně načíst; nelze předpokládat, že změnu souboru samy zaznamenaly.

## BMAD v tomto projektu

- U nových funkcí a významných oprav používej automaticky projektový BMAD podle rozsahu změny. Než vyvoláš jakoukoli BMAD dovednost nebo její renderer, přečti [projektové propojení BMAD](docs/agents/bmad-policy.md); praktické příklady jsou v [návodu](docs/agents/bmad.md). Drobné mechanické úpravy nepotřebují celý workflow.
- Před prvním zápisem rendereru musíš držet rezervaci jeho výstupů i následných artefaktů. BMAD role, specifikace, sprint ani stav „hotovo“ nepřebíjejí zdejší zadání, task JSON, živé rezervace, cizí WIP nebo přijetí integrátorem. Nezačínej neobjednanou práci.
- Podagent s konkrétním implementačním/review zadáním od koordinátora další BMAD workflow rekurzivně nespouští. Načte zdejší pravidla a policy; před zápisem získá vlastní disjunktní rezervaci, provede zadanou implementaci, refaktoring a ověření a předá důkazy. Čistě čtecí review rezervaci nepotřebuje.
- Review, staging a commit se týkají pouze doložených vlastních změn tasku. Nikdy nepoužij upstream pokyn ke stagingu celého dirty stromu. Počet review nálezů nemá minimum; čistý výsledek je platný. Autorizovaná běžná práce nevyžaduje nové potvrzení jen kvůli BMAD kroku.
- Instalovaná verze a týmové overrides jsou verzované; aktualizace BMAD je samostatná rezervovaná údržba. Běžící starší relace musí tuto sekci výslovně znovu načíst, než BMAD použije.

## Rozhodování a délka experimentů

- Před změnou nebo výkonovým během zapiš do existujícího plánu šest položek: problém, doložený mechanismus/hypotézu, jedinou zkoušenou změnu, hlavní metriku, podmínky správnosti a kritérium přijetí. Rozliš startup a plynulost hraní; dílčí CPU zrychlení není FPS důkaz.
- Po selhání nejprve vyhodnoť uložené logy. Nový běh musí zodpovědět konkrétní rozlišovací otázku nebo být předem plánovaným opakováním. Po druhém stejném neplánovaném selhání zastav opakování a uprav diagnostický postup; bez výslovného nového zadání neprodlužuj herní timeouty a neoslabuj přejímku.
- Výslovné zadání3.11.2026 po C10: umožnit dokončení WebGPU přípravy zvýšením rozpočtu na60s pro jednu kvalitu a180s celkem. Všechny readiness/health/submission podmínky zůstávají; staré30/90s údaje v evidenci popisují historické běhy. Změna limitu není sama o sobě zrychlením hry.
- Před dlouhou sérií ověř identitu buildu a krátký průchod telemetrie až do uloženého výsledku. Sleduj výpadek sběru, stáří vzorků, limity a rotaci souborů. Chybějící data znamenají omezený/neplatný výsledek, nikoli úspěch. Při testování použij přímé Node CLI nebo `pnpm --config.verifyDepsBeforeRun=error`; instalace závislostí je samostatný vědomý krok.
- Rozpracuj jeden optimalizační kandidát. Nezbytnou opravu správnosti odděl a uzavři samostatně. Výsledkem série je přijetí, zamítnutí nebo neprůkazný výsledek s přesným chybějícím měřením; další kandidát nesmí zakrýt neuzavřený předchozí.
- Po 30 minutách bez poznatku, který mění rozhodnutí nebo vylučuje konkrétní příčinu, zvol levnější rozlišovací kontrolu, návrat k datům nebo odložení hypotézy. Jde o kontrolu účelnosti práce, nikoli automatické ukončení úkolu, zkrácení testu či nový schvalovací krok pro uživatele.
- Opakované úkony automatizuj úzce ve stávajícím harnessu. Eviduj zvlášť build, start, měření a zbývající čas obsluhy; čekej na uložený výsledek, ne na chybovou obrazovku. Prohlížeč obsluhuj autonomně v rámci autorizace. Nevytvářej obecný řadič kvůli jedné sérii.
- Udržuj jeden stručný aktuální stav v existujícím předání (checkpoint, závěr, další krok); historické důkazy odkazuj. Cílené kontroly průběžně, plné ověření nad stabilním checkpointem. Úspěšnou kontrolu opakuj jen po relevantní změně, selhání či nové konkrétní pochybnosti.
- Dokončený sběr dat ani `renderHealth.valid` nepotvrzuje hratelnost. Před přejímkou použij strukturované číselné meze pro snímky, dlouhé záseky a síťové korekce/resynchronizace; samotný text `acceptance` v plánu nestačí. Chybějící nebo nesouvislá data nesmějí vyjít jako úspěch.
- Krátké stání na spawnu slouží k izolaci nákladu. Plynulost ověř také delším skutečným pohybem s nezávislým sběrem síťových událostí; neutrální SDK spoluhráči nenahrazují pohyb hráče. Pokud už existuje nevyhovující hráčský log, nejdřív jej vyhodnoť a časově přiřaď konkrétní zásek. Další běh musí ověřovat zvolenou příčinu nebo opravu; neopakuj obecnou stacionární sérii.

## Samostatné ovládání Edge při testování — zadání 4. 11. 2026

- Uživatel výslovně autorizoval převzetí ovládání počítače pro testování hry: sám otevři nainstalovaný Edge, vlastní testovací kartu/okno, přepni je do popředí a proveď test. Nežádej znovu o otevření prohlížeče, přepnutí karty ani potvrzení, že je v popředí. Rozsah platí pro testování tohoto projektu; nové oprávnění řeš jen tam, kde je skutečně vyžaduje nástroj nebo bezpečnostní pravidla.
- Nejprve použij dostupné browser API pro Edge a jeho aktuální dokumentaci. Vytvoř vlastní označenou testovací kartu; při potřebě nativního okna použij Computer Use a skutečné ID z čerstvého inventáře. Browser tab/window ID není Windows window ID. Nativní výběr okna nepoužívej jako povinný mezikrok, pokud browser API úkon zvládá.
- Před měřením sám ověř přesnou URL, identitu buildu/relace, aktivní a viditelnou kartu, viewport a průchod diagnostiky do uloženého výsledku. Přípravu ovládání dokonči před časově omezenou sérií; během snímkového intervalu nečti DOM a nepořizuj screenshoty. Nepovažuj název okna ani otevření URL za důkaz správné hry či GPU.
- Běžně zaniklou kartu nebo zastaralý handle obnov podle čerstvého inventáře ve stejném vybraném Edge; po chybě nejprve přečti stav a logy, opakuj jen konkrétní obnovovací krok. Bezpečnostní odmítnutí, neověřená URL nebo výslovný STOP nejsou tento případ: nepřecházej na jiný kanál, shell/CDP ani reset k obejití ochrany. Respektuj rozsah zastavení; dovoluje-li nástroj pokračovat mimo UI, zpracuj uložené logy a nezávislou práci. Vyžaduje-li ukončení tahu, uveď přesnou překážku a zachovej stav pro navázání.
- Používej [praktický postup ve výkonovém návodu](docs/performance/README.md#samostatna-obsluha-edge). Zachovej uživatelské karty a server na 8080; uklízej pouze vlastní testovací prostředky. Zamčená plocha či výslovně požadovaný lidský zásah jsou skutečné překážky, běžná obsluha Edge nikoli.

## Pravidla hry a ověřování

- Svět používá metry, +X východ, +Z jih a pravotočivou kameru Babylon. A musí být vlevo a D vpravo na obrazovce při každém natočení kamery. Ověř skutečnou projekci a jízdu, nikoli pouze znaménka v kódu.
- Geometrii, materiály, cesty, parkoviště, lampy a vegetaci odvozuj z identifikovaných zdrojů s datem a proveniencí. Rozliš zaměření, mapový údaj, interpretaci snímku a herní odhad. Nedoplňuj náhodné budovy, kolejní okna na stadion nebo stromy do komunikací.
- Vykreslení a kolize používají stejné polohy a rozměry ze shared modulů. Před předáním projdi vstupy, schody, styky povrchů, řízení a kameru. Popisky promítej ze stejné kamery jako vykreslený snímek.
- Multiplayer je jediný společný svět pro všechny připojené relace. Žádné skupiny po osmi. Host je samostatný a nesmí dostávat identity, polohy, soukromou multiplayerovou přítomnost či zprávy ani veřejným HTTP dotazem. Výslovná výjimka schválená uživatelem27.10.2026: anonymní `GET /api/presence` smí vrátit pouze souhrnný počet aktuálně připojených hráčských relací (`online`), bez dalších údajů; NPC a AI se do něj nezapočítávají.
- V tomto demu není IS, ověřování bydliště, heslo ani skutečný studentský profil. Ukázkové akce, počty NPC a osvětlená okna musí zůstat označené jako simulované. PID plánované časy se nevydávají za živé polohy.
- Počasí odlišuje čerstvou stanici, meteorologický model a zastaralá data. Vítr je meteorologický směr ODKUD proudí. Astronomie používá skutečný UTC okamžik a souřadnice Strahova.
- Výkon měř v celé produkční hře s reálnými relacemi, HUD a různými avatary. Uveď hash zdrojů, GPU, CSS i interní rozlišení, FPS a p95/p99. NullEngine ani jedno číslo z HUD nejsou GPU důkaz.
- Použij `pnpm test`, `pnpm build` a izolovaný `pnpm test:integration` podle rozsahu změny. Snapshot musí obsahovat také testy. Známá omezení a skutečné výsledky patří do `docs/verification.md`.
- Autorizovanou práci dokončuj autonomně. Přidání procesu není náhradou integrace; paralelním agentům přiděluj oddělené soubory. Nepřidávej schvalovací kroky pro běžné vratné úpravy.
- Po každém uceleném funkčním updatu proveď cílený refaktoring dotčeného kódu: sjednoť opakovanou logiku, odstraň zbytečný stav/výpočty a zkontroluj cache, alokace a životní cyklus zdrojů. Zachovej ověřené chování, původní podklady a jasné vlastnictví souborů mezi agenty.
- Deleguj konkrétní implementaci, refaktoring a relevantní ověření společně. Agent předává integrovatelný výsledek se seznamem souborů a důkazů; dokončený agent uvolní slot. GPU kontroly a měření koordinuj, aby souběžné 3D scény nebo Blender neznehodnotily výsledky.
- Optimálnost dokládej skutečným profilem a srovnatelným měřením. Levné cílené kontroly prováděj průběžně; celou testovací sadu, build a integraci spusť nad stabilním checkpointem po dokončení jeho změn a refaktoringu.
