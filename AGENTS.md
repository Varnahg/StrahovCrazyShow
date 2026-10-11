# Práce na StrahovCrazyShow

Před implementací ověř očekávané chování, existující kód a vhodné primární podklady. Uživatel výslovně požaduje průzkum před změnami a praktické ověření výsledku.

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
