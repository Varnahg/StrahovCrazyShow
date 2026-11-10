# Předběžný běh run2

Tři uložené benchmarky sloužily k ověření sběru a exportu. Dvě výhledová měření ztratila fokus; uživatel potvrdil současnou práci na počítači. Žádný vzorek z tohoto běhu není součástí primární matice run3. Před dalším během uživatel výslovně souhlasil s nerušeným oknem.

Běh byl ukončen vlastními STOP soubory; API/sampler/peers a input revalidation mají čistý cleanup. Dva raw díly a systémová telemetrie jsou zachované. První timeout download eventu neznamenal chybějící soubor; úplný skutečný download byl dohledán a ověřen. Neshoda exportu v řídicím helperu byla způsobená rozdílnými REPL closure stavy, nikoli hrou; nový sběr používá sdílený objekt a přímou shodu server/full.
