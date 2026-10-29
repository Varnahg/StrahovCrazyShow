# První skutečný RAG → chat průchod

Vlastník `rag-e2e-validation-01a17e9d`. Ověřená SÚZ smlouva SHA `8ef4883e3ee2bdc4788425db2cb428a53574cf6aa7e4ebad664d26756ad82a62` prošla plným offline normalizerem a v3 validací. Import do vlastní `rag_auto_0dadab175ad3_test` vytvořil56 skutečných OpenAI text-embedding-3-large vektorů, profile `bfa5e41dd0947f3e7cf1be3b4cb55dc9c1fcec6ec28f258e8967585a10d72937`, revision `0e98de6518c62ccf9849dc81ce3ae11fdc9ba7f2df027300f2ffaa246d21bff9`. Dva embedding requesty,11159 UTF-8 bajtů,3651 tokenů.

Skutečná HTTP služba na vlastním127.0.0.1:2568 používala read-only DB roli, skutečné query embeddingy, moderaci, Decisions a Responses. Na dotaz o platbě elektřiny odpověděla200 s věcně správným odkazem na ceník příslušné koleje a v3 citací přesného dokumentu, metody openai a strany1. Žádný fake retrieval. Odpověď přibližně5,14s.

Identický další import:56 cache hitů,0 embeddingů/HTTP. Přesný requestSeq replay: shodná odpověď,0 placených operací a nezměněné counters. Reset204. Původní databáze před/po zachovala stejný public head a90 cached vectors; nemigrovala se.

Souhrn ledgeru:2doc embedding HTTP +1query embedding +1Decisions +1Responses(Luna) +2moderace =7HTTP, bez retry. Plán/zdrojové hashe a bezpečný ledger jsou `.cache/rag-e2e-20261029/`; raw soukromý session token ani klíče se do reportu neukládaly. Zbývající rozpočet se tímto uzavírá, nejde o povolení dalších volání. Zdrojový kód během testu odpovídal zmrazenému manifestu.

Node HTTP helper skončil a všechny DB clients zavřel. Vlastní DB kontejner se po přejímce zastaví; data/volume i scratch důkazy zůstanou zachované. Následuje release paid a integrační rezervace. Tento důkaz platí pro první konkrétní dokument a zapojení služby; celý katalog ani veřejný deployment tím nejsou dokončené.
