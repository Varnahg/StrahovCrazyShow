# KEY-42: ověření experimentálního grass tile workeru

Status: in progress. Pokračování projektového BMAD build podle úspěšného rendereru 2e5169e7e102/7dd88a77841d79f60052 a předaného implementačního spec/handoffu. Žádný další rekurzivní workflow. Průzkum a varianty: předchozí profile checkpoint main db9108dd. Prototyp je opt-in a není přijatá výchozí optimalizace.

V2 source f893fb5b: 36/36 cílených testů, full TypeScript PASS. Jediný review P2 (hladovění připraveného workeru při native handoffu) opraven a ověřen nezávislým čtením. Root přebírá přesné sedm source/test souborů do clean i combined kopie po kontrole stejných tří změněných základů. Cizí WIP a hrané buildy zůstávají nedotčené.

Validace: celý test script s řízenou concurrency4 jako v předchozím stabilním checkpointu, full TypeScript, Vite production build, izolovaná integrace2568. Přímé Node entrypoints odpovídají package scriptům; nevolat pnpm exec s readonly sdílenými dependencies. Nic neinstalovat ani nepatchovat v donor node_modules. Skutečné příkazy, výsledky a jakékoli selhání zachovat. Úspěšný unit transport neprokazuje skutečný module worker bundling/transfer ani FPS.

Vlastní4207/API2602 až po build/checks. Edge: produkční trasa kolem X105,Z14→96, Medium/day,1912×867 nebo nově zdokumentované stejné rozlišení obou variant, HUD/reálné multiplayer sessions. Default main versus explicitní grassWorker=1 bez profileCpu/profileEnvironment; proložené páry, oddělit cold convergence a ustálené zatížení. Zkontrolovat worker ready/completed/fallback, bootstrap, message/apply náklady, queue/cache, matice/coverage/fades, teleport/kvalitu/dispose/reentry. Neinterpretovat celý environment jako worker úsporu. Přijetí vyžaduje čistý přínos, nikoli existenci workeru; při negativním výsledku zachovat důkazy a prototyp nezapínat.

KEY-40 cíl zůstává aktivní. Starší WebGPU cíl je uživatelem pozastavený. Komunikace/integrace nepřebírá cizí práci.
