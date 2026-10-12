# Ověření koordinace agentů · 12. 10. 2026

Změna přidává pravidla, mapu skutečného stacku, strukturovaný katalog zadání a lokální rezervační CLI. Herní implementace, assety ani běžící servery nebyly touto úpravou měněné. Existující invarianty v kořenovém AGENTS.md jsou zachované.

Implementační běh `pnpm exec tsx --test tests/agent-tasks.test.ts` prošel **15/15**, bez selhání a skipů, za 39,256 s; `node --check scripts/agent-tasks.mjs` prošel. Kontroly vykonávají skutečné samostatné procesy CLI v dočasných Git repozitářích, včetně linked worktree. Testují závod dvou claimů, disjunktní zápisy, předka/potomka a velikost písmen, procesní resources, kanonické porty, dirty soubory a rename, odmítnutí cizího ownera, heartbeat/stale, zachování původního scope při změně tasku, závislosti/cykly a poškozený registry/mutex.

Koordinátor následně pořídil úzce vymezený [snapshot zdrojů](source/) včetně testů. [Manifest](source-manifest.json) určuje přesné bajty pravidel, katalogu, CLI a testu. Jde pouze o koordinační tooling, **nikoli snapshot celé hry**. Opakování proti uloženým testům/CLI prošlo 15/15 za 112,361 s; jde o ověření chování, nikoli srovnání rychlosti. Kontroly dokumentace jsou zachycené v [results.json](results.json), [test.log](test.log) a [checks.log](checks.log).

Refaktoring sjednotil porovnání worktrees a odstranil opakovaný výpočet rezervovaných cest ve statusu. Nezávislá kontrola opravila nekanonické aliasy portů (`port:02568`), sjednotila doporučení heartbeat na 15 minut a upřesnila nepodporované předání živého procesu. Bezpečné primitivy zůstávají malé: lokální mutex, kontrola rozsahu, atomický zápis registru, žádné automatické převzetí.

Plná herní sada `pnpm test`, `pnpm build`, `pnpm test:integration` ani GPU měření se pro tuto změnu koordinace nespouštěly. Nejde o doklad funkčnosti současného herního WIP nebo o nový výkonový checkpoint. Již aktivní externí relace, soukromé benchmarky ani procesy nebyly přebírány či ukončovány.

Rezervace jsou kooperativní, sdílené jen mezi worktrees stejného lokálního Git repozitáře. Nezávislé klony a již běžící relace je musejí přijmout samostatně. CLI neblokuje editor, neautentizuje lidské předání ani automaticky nepozná cizí proces. Dirty kontrola nepokrývá ignorované výstupy ani jiné worktrees; ty vyžadují řádné rezervace a koordinátora. Stale pouze varuje, nikdy neuvolňuje práci. Během této úpravy měl `docs/verification.md` aktivního jiného zapisovatele; [integrační task](../../../agents/tasks/integration-checkpoint.json) má doplnit odkaz sem po skutečném předání, nikoli přepisem cizí evidence.

Po dokončení implementace se do registru skutečně přihlásili původní vlastníci oblohy, weather preview a outdoor ověření. Katalog následně dostal jejich přesně předané rozsahy, čtyři oddělené building tasky a návaznou změnu protokolu. Změny katalogu nezasáhly otestované bajty CLI ani testu; finální manifest zachycuje i tato zadání.
