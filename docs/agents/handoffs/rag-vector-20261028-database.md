# Předání vlastní místní RAG databáze

Owner `rag-vector-db-01a17e9d`, task `rag-vector-20261028-database`. Kontejner `strahov-rag-20261028` s labelem `strahov.rag.task=rag-vector-20261028`, volume `strahov-rag-20261028-data` se stejným labelem. Původní bind pouze127.0.0.1:5468,512MiB/1CPU. PostgreSQL17.11 a pgvector0.8.7, image digest `sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d`. Obě nastavení logování bind parametrů0; žádné raw SQL/vektory/key v logu.

Samostatný provozní corpus ve `strahov_rag`, testy pouze ve `strahov_rag_test` s unikátním vlastním schema a kontrolovaným cleanup. Runtime login má pouze SELECT/USAGE; ingester omezené INSERT/column UPDATE, bez CREATE/DELETE a vlastnictví tabulek. Hesla a URL jsou v privátních env souborech pod `%LOCALAPPDATA%/StrahovCrazyShow/secrets`, nikoli v repozitáři. Jejich obsah se nevypisoval. OpenAI klíč se nekopíroval do DB env ani klienta.

Aktivní profil large3072 `48298f1f727a87ab57999ec2584b79c4d7a3f8c39060cdb03f635d226ae5bcbc`, revize `76922848bbaf791b366a87dc7b8985f5b995d9542b512948697b301edb3dbfdb`. Placeny také oddělené small vektory pro A/B; tyto profily se nemíchají. Restart zachoval data a další import znovu45reused/0calls. Doklady v [research](../../home-ai/20261028/research/restart-proof.json).

Po přijetíPR34 root ověřil přesný label, zastavil pouze tento kontejner a ověřil `exited`. Volume existuje a zachovává zaplacené embeddingy. Docker Desktop je sdílená platforma a nebyl zastaven; žádný cizí proces nebo volume nebyl měněn. Před dalším spuštěním nová rezervace portu5468/rag-postgres-local a ověření skutečného portu/identity; toto předání neznamená automatické spuštění či právo převzít cizí port.

Místní helpery a úplné bezpečné logy jsou v ignorované `.cache/rag-vector-20261028-database/`; obecný reprodukovatelný provoz zajišťují verzované CLI/Compose a [návod](../../home-ai/20261028/deployment/README.md). Veřejný host zde nebyl nasazován.
