# Předání tématu chatu a HUD

Vlastník `chat-redesign-20261117-theme`, příjemce `chat-redesign-20261117-root`. Kanonická pracovní kopie na main, výchozí commit `c5289bd46921b702fa7ec6b3d3800bae9c97c468`.

Rozsah tvoří `client/jantar-theme.css`, `client/style.css`, `client/hud.css`, `client/welcome-screen.css`, `client/interaction.css`, `client/feedback.css`, `client/graphics-settings.css`, `client/journal.css`, `client/minimap.css`, `client/avatar-editor.css` a `client/crazy-typka.css`. Cizí změny se nepřebíraly. Předávám pouze těchto jedenáct CSS souborů a toto předání.

Společné téma se dědí z `#root`, takže zahrnuje i dialogy vedle úvodní obrazovky. Manrope používá role 16 px pro čtený text, 14 px pro ovládání, 12 px pro metadata a 22 px pro titulky. Tokeny pokrývají barvy, fokus, ovladače, vyvýšené plochy, backdrop a rohy 8/12 px. Upravil jsem původní deklarace komponent a odstranil opakovaný obecný herní reset barev ovladačů. Deník a mapové ovladače přišly o zbytečné důležitosti deklarací. Sémantické fill/stroke mapy, skutečné barevné vzorky postavy a oficiální pravidla tlačítka Google zůstávají ve svých původních hodnotách.

Režim `crazy-embedded` používá společnou typografii a prostor rodiče, vizuálně skrývá duplicitní nadpis a ponechává jediný AI editor. Oprava podle integrační browserové kontroly odstranila boční rámečky obou rolí AI zpráv. Desktopová lišta má dvouřádkové vycentrované popisky a výšku ovladače 68 px; ikony v úzkých breakpointech zachovávají své dosavadní rozměry.

Ověření 17. listopadu 2026 proběhlo přímým Node CLI. PostCSS úspěšně přečetl všech 11 modulů. Lightning CSS je všechny zkompiloval bez varování. Porovnání původních a výsledných AST potvrdilo shodné mapové fill/stroke deklarace a deklarace tlačítka Google. V upravených fontových deklaracích nejsou Georgia, Segoe UI ani DM Sans. `git diff --check` prošel. Příkaz `node --import tsx --test tests/graphics-settings.test.ts tests/feedback-ui.test.ts tests/feedback-form.test.ts tests/crazy-typka-compact.test.ts tests/crazy-typka-ui.test.ts` prošel 78/78 s kódem 0. Poslední změny se týkaly CSS, jejich parser/kompilátor znovu prošel.

Refaktoring sjednotil zdroj vizuálních hodnot a odstranil konfliktní blanket přepis. CSS nepřidává časovače, stav ani nový zdroj za běhu. Vizuální přejímku, měření computed hodnot a společný produkční build vlastní koordinátor. Neměl jsem spuštěný server ani prohlížeč a po předání uvolňuji rezervaci. Commit provede integrátor.
