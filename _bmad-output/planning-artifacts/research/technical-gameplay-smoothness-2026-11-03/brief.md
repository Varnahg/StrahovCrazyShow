# Rozhodovací rámec

Zadání3.11.2026: určit největší dopad na hratelnost, záseky a plynulý pocit ze StrahovCrazyShow. Pouze research, žádná změna hry, serveru nebo nové GPU měření. Main22398e38; tři původní cizí soubory zachovat.

Typtechnical, tvarvýběr dalšího zásahu. Tři čtecí větve: renderovací praxe; frame pacing/ovládání/síť; pojmenované primární projektové importy. Jeden průchod, nejvýše6 otevřených zdrojů na webovou větev, doplnění jen pro nosné tvrzení. Root odpovídá za syntézu. Rámec plyne z výslovného zadání a stávající autorizace, další schvalovací otázka není potřebná.

Pevné podmínky: celá hra/HUD/multiplayer, zachovat správnost, předem rozlišovat startup, steady frame cost, hitches a latenci. Přednost má měřitelný dopad s nízkým integračním rizikem a levným rozlišujícím testem. Žádná univerzální rada maximalizovat CPU/GPU/RAM. Číselné prahy přejímky budou návrhem, ne vydávanou normou. Výstup jeden krátký český report s podklady; nevytvářet další obecný řadič ani implementační backlog.

Povolené primární importy: C9 final-results a gzip benchmark/JSONL, client/game.ts, benchmark-render-profile.ts, render-cost.ts, tree-renderer.ts, render-fallback.ts, shared/netcode.ts a související přímo vyvolaná logika. Kontext určuje otázku; tvrzení se opírají o tento čerstvý import nebo přečtený veřejný zdroj.
