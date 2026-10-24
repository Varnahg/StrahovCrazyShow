# Přesné baseline assety pro test B1+B6

24.10.2026, vlastník cad-buildings-01a16b37-baseline, vlastní worktree cad-building-models, HEAD6dd89606. Před spuštěním úplné hry bylo materializováno12 již lokálně stažených LFS objektů přes jejich přesné cesty z HEAD. Žádná výroba ani přebírání cizího WIP.

Každý soubor prošel porovnáním SHA256 s OID původního pointeru a velikostí. Souhrn je v `.cache/cad-buildings-20261024/b01-runtime-build/lfs-materialization.json`. `node scripts/check-lfs-assets.mjs` PASS12/12; tento preflight sám kontroluje velikosti/pointery, kontrolu checksumů provedl předchozí samostatný krok. Celkem přibližně1.2GB baseline dat. Git obsah těchto cest se nezměnil.

Vlastní materializační proces skončil exit0. Žádný běžící proces ani port. Tato činnost není přejímka modelů, hry ani výkonu. Další změny těchto assetů se neprovádějí.
