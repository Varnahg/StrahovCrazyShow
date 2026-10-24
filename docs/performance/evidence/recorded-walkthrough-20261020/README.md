# KEY-49: zaznamenané průchody — připravená testovací vrstva

Stav 20. 10. 2026: implementace je pouze v tests. Obě fixtures a přehrávač jsou připravené; praktická přejímka obou tras a negativní kontroly zatím **neproběhla**. Změna není přijatá do main a KEY-49 zůstává otevřené.

## Zdroj a pokrytí

Výchozí přijatý main ab39b7185d0c9fb5e393c654818f43de82e07886. [Návod](../../../../tests/replay/README.md), [provenance dat](../../../../tests/replay/fixtures/README.md) a [datové předání](../../../agents/handoffs/recorded-walkthrough-data-20261020.md) vysvětlují úplné SHA a původ obou záznamů.

B6 má584 vzorků/24 explicitních událostí, outside a patra0–4; venkovní auto166/19. Agentův smoke a menu nejsou součástí přehrání. Chybí úplné tickové vstupy, orientace aktérů a mezisnímky. Test v hostu rekonstruuje renderové stavy, nikoli původní fyziku, multiplayer, recovery nebo přesné pixely.

## Skutečné kontroly

- 25/25 cílených testů PASS (13 extrakce,12 replay/lifecycle/integrita), žádný skip.
- TypeScript a normální produkční pnpm build PASS;16 normálních JS bundle souborů neobsahovalo testové hooky.
- Všechny4 izolované SDK scénáře pnpm test:integration PASS.
- Testový produkční Vite build PASS; vlastní source-manifest zahrnuje zdroje, testy, fixtures a identitu neměnného public Git stromu. Dirty public assety runner odmítá.
- Lokální plná sada Windows byla koordinátorem výslovně ukončena během pomalých subprocess regresí řadiče před GPU oknem. Nejde o PASS ani FAIL sady; log je zachovaný v .cache/recorded-walkthrough/full-tests.log. Finální úplné ověření vyžaduje CI přesného PR head.

## Neplatné GPU starty a vnější podmínka

Tři pokusy stejného testového buildu source2cb754e0440e11161a2596dd032397bba9c340b4207daea2c5bcc0d7b94b18b3 skončily timeoutem přípravy světel ještě před prvním herním snímkem. Původní diagnostika je v komprimovaných souborech vedle [souhrnu](startup-attempts.json). Události browser-state hlásily visible, což samo neprokázalo skutečné zobrazení hostitelského panelu.

Samostatný dotaz capability visibility v IAB vracel false i po žádosti o zobrazení. open_in_codex vrátil queued pro tento chat, nikoli otevřený panel. Přípravné RAF měly sekundové mezery. Tyto pokusy se **nepoužijí k přejímce tras, negativní kontroly ani nové produktové regrese**. Přesná driverová příčina se netvrdí.

Uživatel dostal asynchronní žádost nechat tento chat/testovací panel otevřený, případně dokončit jen přípravu bez GPU. Odpověď zatím nepřišla. Vlastní Edge a IAB karty jsou zavřené, viewporty obnovené a server/API ukončené (provozní descriptor je pouze v ignorované .cache/recorded-walkthrough/);2568/4291 byly znovu volné. Cizí veřejná herní karta ani ostatní WIP se neměnily.

## Další přijetí

Po skutečném zobrazení panelu znovu rezervovat validační task, spustit nový neměnný testový build a oba scénáře. Ověřit i stopAfterFirstSample=1: hlídač musí vydat failed. Finální report musí mít kompletní počty vzorků/událostí, skutečné snímky, polohu/kameru v toleranci a nulové renderer/asset chyby. Žádné FPS/A-B tvrzení není součástí změny.

Review opravilo obnovování uloženého počasí po UI pollingu, skutečné ukončení Game po endFrame, kontrolu hidden startu, snapshot fixture bajtů, časné signály a timeout health requestu. Skutečný přenos času/kvality/scaling/svítilny/počasí nyní kontrolují spy vstupy renderových controllerů. Negativní GPU varianty jsou zatím neprovedené. Nová CPU sada24/24 a normální/testový produkční build PASS. HTTP smoke obou fixture ověřil přesné SHA, unknown404 a report bez povoleného Origin403; šlo jen o HTTP/CLI kontrolu, nikoli přehrání. Smoke služby byly ukončené a2568/4291 volné.

Druhé review potvrdilo všech11 prvních nálezů. Navazující B3 odhalilo snapshot před posledním endFrame; oprava odkládá validaci za callback, zastaví další snímky, čeká na WebGPU submitted work s5s timeoutem a před dispose znovu kontroluje health. Pozdní endFrame a stalled queue mají CPU regresi. Aktuální cílené kontroly25/25 a oba produkční buildy PASS. GPU přijetí zůstává otevřené.
