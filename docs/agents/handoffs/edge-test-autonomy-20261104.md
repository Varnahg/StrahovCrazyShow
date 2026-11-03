# Předání: samostatná obsluha Edge při testování

- Vlastník a integrátor: `edge-autonomy-20261104-root`; AGENTS/katalog pod drženým `smoothness-20261103-admin`. Canonical checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, výchozí commit `c244d4be3323fbfb43cc7b30f01a6774c481f623`.
- Zadání 4. 11. 2026: trvale zaznamenat, že agent sám přebírá ovládání pro test, otevře Edge a připraví kartu, bez žádostí o přepnutí či potvrzení popředí. Nejde o dokončení rozpracované gameplay optimalizace.
- Soubory: `AGENTS.md`, `docs/performance/README.md`, `docs/agents/tasks/edge-test-autonomy-20261104.json`, toto předání. Tři předexistující neversionované soubory konsolidace z 29.–30. 10. zůstaly nedotčené a nejsou v commitu.

## Podklady a rozhodnutí

Současná dokumentace `cua_repl` nabízí přímý vstup `createBrowserTab("edge", ...)`, zjištění stavu a zavření vlastní karty. Nativní `getApp` vyžaduje skutečné Windows window ID a předchozí pokus zastavila kontrola URL. Proto je zvolen přímý browser vstup pro herní stránku; nativní ovládání zůstává jen pro potřebné úkony mimo schopnosti browser API. Žádost uživateli o běžnou obsluhu neodpovídá jeho opakované autorizaci; shell/CDP nebo reset po bezpečnostním STOP nejsou přípustná obnova.

Přečteny místní Computer Use `SKILL.md`, `docs/guidance.md`, `docs/confirmations.md` a aktuální dokumentace nástroje. Místní skill popisuje i starší `sky` rozhraní; nové projektové pokyny správně odkazují na skutečně dostupné API a jeho vrácenou dokumentaci. Uložení trvalých projektových pokynů do AGENTS odpovídá [oficiální dokumentaci OpenAI](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex), ověřeno 4. 11. 2026. Tato stránka není zdrojem oprávnění k ovládání; tím je přímé zadání uživatele a pravidla nástroje.

Zvolený rozsah je dokumentační upřesnění existujícího postupu. AGENTS drží stručné povinnosti, výkonový návod proveditelné kroky a rozlišení chyb. Nový controller, změna konfigurace, nový BMAD build workflow ani herní refaktoring nejsou pro tento rozsah potřebné. Runtime, cache, alokace a životní cyklus hry se nemění.

## Praktická kontrola

Bez uživatelského zásahu vznikla přes `cua.createBrowserTab` vlastní Edge karta `about:blank` ve skupině „🎮 Ověření samostatného Edge“. Návrat nástroje potvrdil URL a fokus `AXWebArea`; následné čtení DOM potvrdilo `visibilityState: visible`. Po `close()` inventář ověřil, že vlastní karta už není uvedená. Nebyla otevřena hra ani spuštěn GPU test; žádná cizí karta ani server na 8080 se neměnily.

Jeden mezikrok `document.hasFocus()` nebyl v omezeném read-only DOM rozhraní dostupný (`TypeError`); bez opakování této metody následovalo ověření fokusu z AX stavu. Nešlo o bezpečnostní odmítnutí ani selhání hry. Předchozí nativní URL guard se znovu nezkoušel a jeho odstranění se netvrdí. Smoke test dokládá samostatné otevření a úklid přes browser API, nikoli budoucí dostupnost všech nativních úkonů nebo platné FPS měření.

## Ověření a předání

- Nezávislá čtecí kontrola změn AGENTS/výkonového návodu: bez nálezů. Ověřila ID, dokumentovaný vstup, autonomii a zachování security/URL STOP.
- `node scripts/agent-tasks.mjs validate`: PASS, 610 definic. Kontrola 19 místních odkazů v dotčených dokumentech včetně explicitního Edge anchoru: PASS, žádná chybějící cesta. `git diff --check`: PASS.
- Herní testy/build/integrace se pro tuto čistě dokumentační změnu nespouštějí; nejsou jejími důkazy.
- Procesy: žádný nový server/sampler, vlastní prázdná karta zavřena, nový viewport override nenastaven. Rezervace tohoto tasku se uvolní po ověření a commitu; existující rezervace rozpracované optimalizace zůstávají samostatné.
