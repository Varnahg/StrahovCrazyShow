# Rozhodnutí pro KEY-53

Vybrán jediný runtime cíl: omezit redundantní úklid vlastního poolu NPC v client/transit-renderer.ts. Primární handoff fps-transit-cost.md:7 jej výslovně ponechal jako follow-up; KEY-5 uvádí dopravní renderer jako relevantní runtime část.

Převod pražského kalendáře by také šetřil práci, ale přidává časovou cache/DST okraje a vyžaduje regeneraci navigační provenience. Pool sweep má menší scope (renderer + nový regresní test), žádnou změnu sdílené fyziky/dat ani vzhledu. Jiné uvažované varianty: časový throttle úklidu by zbytečně zadržoval prostředky; globální dirty příznak v AvatarPrimitivePool by rozšířil sdílené API a cizí avatar-renderer WIP; úplné odstranění sweepu by ztratilo cleanup. Zvolena dirty informace lokálního vlastníka TransitRenderer.

Prune se vyvolá jednou na původním konci update po skutečném přidání/odebrání passenger rigu. Příznak instance se nastaví před mutací a vymaže až po úspěšném sweepu, aby nepřišel o práci při přerušeném update. Pouhý počet NPC nestačí pro výměnu identity. Vytvoření má zachovat postkonstrukční sweep. LOD/hidden jen mění registrace/enabled, ponechává instance a material references; far proxy/garment mají vlastní lifecycle. Async dokončení textur nemění členství tohoto poolu. Plný renderer.dispose stále uklízí celý pool bez ohledu na příznak.

Čtecí oponentura ověřila AvatarPrimitivePool.pruneUnused, CharacterMaterials.get/prune/dispose, AvatarLodController.update/dispose, skinned material retain/release a pinned Babylon InstancedMesh.dispose. Runtime/test cesty jsou čisté ve všech18 registrovaných worktrees; na current main má transit-renderer SHA256 7e174d991d075631be034e113f871462679206455a22914da69ade2372bed292. Nejde o převzetí jiného WIP.

Nezměřený údaj: časová úspora a dopad na FPS. Počet odstraněných sweepů sám nestačí. Připraven původní baseline snapshot5a123c5cbe7ceca84f03798254f32acf21debe97e62647c71751a7bef0500496 (8528files); žádný A/B výsledek se dosud netvrdí. Pokud před runem main postoupí kvůli feedbacku, finální baseline se vytvoří z totožného nového base jako kandidát. Starý snapshot zůstane zachovaný.

Praktické přijetí vyžaduje skutečnou plnou produkční hru/HUD, tři skutečné různorodé relace, identický scénář/GPU/rozlišení/čas/počasí, samostatné CPU profile a plain FPS/p95/p99 intervaly a lifecycle/obrazovou paritu. Pomocný KEY-54 přidává externí receipt před accept/merge; nepřidává uživatelské schvalování, koordinátor vydá důkaz autonomně až podle měření.
