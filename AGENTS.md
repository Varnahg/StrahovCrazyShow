# Práce na StrahovCrazyShow

Před implementací ověř očekávané chování, existující kód a vhodné primární podklady. Uživatel výslovně požaduje průzkum před změnami a praktické ověření výsledku.

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

## Pravidla hry a ověřování

- Svět používá metry, +X východ, +Z jih a pravotočivou kameru Babylon. A musí být vlevo a D vpravo na obrazovce při každém natočení kamery. Ověř skutečnou projekci a jízdu, nikoli pouze znaménka v kódu.
- Geometrii, materiály, cesty, parkoviště, lampy a vegetaci odvozuj z identifikovaných zdrojů s datem a proveniencí. Rozliš zaměření, mapový údaj, interpretaci snímku a herní odhad. Nedoplňuj náhodné budovy, kolejní okna na stadion nebo stromy do komunikací.
- Vykreslení a kolize používají stejné polohy a rozměry ze shared modulů. Před předáním projdi vstupy, schody, styky povrchů, řízení a kameru. Popisky promítej ze stejné kamery jako vykreslený snímek.
- Multiplayer je jediný společný svět pro všechny připojené relace. Žádné skupiny po osmi. Host je samostatný a nesmí dostávat multiplayerovou přítomnost či zprávy ani veřejným HTTP dotazem.
- V tomto demu není IS, ověřování bydliště, heslo ani skutečný studentský profil. Ukázkové akce, počty NPC a osvětlená okna musí zůstat označené jako simulované. PID plánované časy se nevydávají za živé polohy.
- Počasí odlišuje čerstvou stanici, meteorologický model a zastaralá data. Vítr je meteorologický směr ODKUD proudí. Astronomie používá skutečný UTC okamžik a souřadnice Strahova.
- Výkon měř v celé produkční hře s reálnými relacemi, HUD a různými avatary. Uveď hash zdrojů, GPU, CSS i interní rozlišení, FPS a p95/p99. NullEngine ani jedno číslo z HUD nejsou GPU důkaz.
- Použij `pnpm test`, `pnpm build` a izolovaný `pnpm test:integration` podle rozsahu změny. Snapshot musí obsahovat také testy. Známá omezení a skutečné výsledky patří do `docs/verification.md`.
- Autorizovanou práci dokončuj autonomně. Přidání procesu není náhradou integrace; paralelním agentům přiděluj oddělené soubory. Nepřidávej schvalovací kroky pro běžné vratné úpravy.
- Po každém uceleném funkčním updatu proveď cílený refaktoring dotčeného kódu: sjednoť opakovanou logiku, odstraň zbytečný stav/výpočty a zkontroluj cache, alokace a životní cyklus zdrojů. Zachovej ověřené chování, původní podklady a jasné vlastnictví souborů mezi agenty.
- Deleguj konkrétní implementaci, refaktoring a relevantní ověření společně. Agent předává integrovatelný výsledek se seznamem souborů a důkazů; dokončený agent uvolní slot. GPU kontroly a měření koordinuj, aby souběžné 3D scény nebo Blender neznehodnotily výsledky.
- Optimálnost dokládej skutečným profilem a srovnatelným měřením. Levné cílené kontroly prováděj průběžně; celou testovací sadu, build a integraci spusť nad stabilním checkpointem po dokončení jeho změn a refaktoringu.
