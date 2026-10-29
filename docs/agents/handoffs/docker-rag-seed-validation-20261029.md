# KEY-70: čtecí export DB

Root docker-rag-seed-validation-01a17e9d ověřil vlastní kontejner strahov-rag-20261028, label strahov.rag.task=rag-vector-20261028, exited stav a port127.0.0.1:5468. Pod heavy/5468 rezervací jej spustil, vyčetl výhradně schválené vstupy do vlastní cache a uzavřel všechny klienty. Po ověření kontejner opět stopped, bez změny volume.

Nástroj .cache/docker-rag-seed-validation-20261029/export.mjs provedl dvě READ ONLY transakce a žádné API volání. Legacy vybral45 z90vektorů přes default profile a input hash whitelist; scratch přesně56v3. Před/po heads a počty jsou stejné, receipt.json obsahuje důkaz a output SHA256. Profil, vstupní text/hash, dimensions/finite/nonzero i v3 provenience validované. Citlivé hodnoty nebyly logované ani zapsané do výsledku.

Public publikace byla samostatně pod seed claimem. Toto je čtecí audit/export; neprokazuje ještě celou novou Docker instalaci. Vlastní procesy skončily a port se po zastavení DB uvolnil, resources se uvolňují pro navazující Docker validaci.
