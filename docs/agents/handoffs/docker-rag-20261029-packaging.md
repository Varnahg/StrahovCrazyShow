# KEY-70: průběžné předání Docker packaging

Vlastník docker-rag-packaging-01a17e9d, C worktree clean-home-crazy-typka. Vlastní WIP: nový compose.full.yaml a dvě úzká COPY doplnění Dockerfile, plus taskový spec. Žádný cizí soubor nebyl převzat. Bootstrap child vlastní disjunktní scripts/testy; seed zatím čeká na vlastní auditovaný export.

Při dočasném release kvůli rozšíření scope o .gitignore a tests/docker-full-config.test.ts jsou zápisy zastavené a vlastní změny zachované. Nebyl spuštěn Docker/build/DB/API. Následný reclaim téhož doloženého WIP použije stejného ownera a --adopt-dirty; release není dokončení.

## Finální implementace a přijetí komponent

Scope byl řádně rozšířen a reclaimnut. Nový compose.full.yaml spojuje generování interních credentials, pgvector, bootstrap a hru pod jeden příkaz. Owner/ingester volume je oddělené od reader volume hry; OpenAI key je runtime file secret. Existing game-only Compose zůstává dostupný. Dockerfile kopíruje tři helpery do správných targets, `.gitignore` vylučuje secrets/, existující allowlist .dockerignore secret soubory nepouští do contextu. `.env.example` je volitelný, běžný uživatel zadává jen raw key file.

`tests/docker-full-config.test.ts` prošel2/2: skutečný Compose parser potvrzuje dependencies/health/exit, žádný host DB port, omezené secret mounts a absenci klíče v configu. Cílené bootstrap/entrypoint testy17/17 a strictTS byly předány. Jediné review P2 o návratu managed headu ze staršího image bylo opraveno confirmed/pending seed revision; úzké re-review bez nálezů. Hlavní testovací image build a skutečný fresh/restart/transfer/ACL/safe-failure prošly v samostatném full-validation tasku. Testy nepoužily skutečný OpenAI klíč ani placený request.

Veřejný seed má101dokumentových vektorů, aktuální v3 dokument1 a explicitní revision1. Úplný katalog/crawler zůstává otevřený. Embedding profil existující composite DB se přes startovací konfiguraci nemigruje; guard jej odmítne s jasným kódem. Dokumentace tuto hranici uvádí. Finální commit/export a CI/main přijetí provádí root po společném handoffu.
