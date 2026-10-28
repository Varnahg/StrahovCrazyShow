# Nasazení vektorového RAG

Crazy Typka vyžaduje při zapnutí AI publikovanou PostgreSQL/pgvector revizi, OpenAI klíč a samostatně zvolený model odpovědí. Embeddingový profil je po [evaluaci](../research/vector-evaluation.md) ve výchozím stavu `text-embedding-3-large`/3072 s cosine distance prahem0.60. JSON je kurátorovaný importní vstup; změny v souborech se projeví až po úspěšném importu. Výpadek DB nespouští textový fallback.

## Oddělení služeb a oprávnění

`compose.yaml` nadále spouští hru samostatně. `compose.ai.yaml` přidává serverovou AI konfiguraci, `compose.rag.yaml` volitelnou persistentní DB a administrativní importer. DB nemá publikovaný host port. Hra i importer ji oslovují přes `rag-db:5432` ve stejné Compose síti. Volume `rag-data` uchovává i placené embeddingy; nemažte je při běžné aktualizaci.

Použijte externí `--env-file` mimo checkout a zálohy Gitu. `RAG_POSTGRES_PASSWORD` inicializuje ownera DB; `RAG_DATABASE_URL` pro hru patří pouze čtecímu loginu. `RAG_INGEST_DATABASE_URL` pro importer používá ownera pouze během migrace, poté omezený ingest login. Schéma a explicitní granty jsou v [provozním návodu](../vector-store/operations.md). Skutečné klíče ani URL s heslem nevkládejte do argumentů, issue, klienta nebo výstupu `compose config`.

Pořadí prvního nasazení:

1. Spusťte `rag-db`, ověřte health a vytvořte schéma příkazem `migrate` přes target `rag-tools`.
2. Správce DB vytvoří oddělené login účty a přidělí reader/ingester granty. Nastaví jejich URL v externí konfiguraci.
3. Spusťte importer s explicitním rozpočtem. Pro současný corpus stačí nejvýše 45 vstupů a 65536 UTF-8 bajtů, nejedná se o údaj účtovaných tokenů.
4. Ověřte `status` a nulový opakovaný import s `--max-inputs 0 --max-bytes 0`; teprve s hotovou revizí zapněte AI a ověřte citace.

Příklad příkazů používá zástupnou cestu k externí konfiguraci, žádná skutečná tajemství:

```sh
docker compose --env-file /secure/strahov-rag.env -f compose.yaml -f compose.ai.yaml -f compose.rag.yaml up -d rag-db
docker compose --env-file /secure/strahov-rag.env -f compose.yaml -f compose.ai.yaml -f compose.rag.yaml run --build --rm rag-tools migrate
# Nyní nastavte omezený ingest login podle provozního návodu.
docker compose --env-file /secure/strahov-rag.env -f compose.yaml -f compose.ai.yaml -f compose.rag.yaml run --rm rag-tools import --max-inputs 45 --max-bytes 65536
docker compose --env-file /secure/strahov-rag.env -f compose.yaml -f compose.ai.yaml -f compose.rag.yaml run --rm rag-tools import --max-inputs 0 --max-bytes 0
docker compose --env-file /secure/strahov-rag.env -f compose.yaml -f compose.ai.yaml -f compose.rag.yaml up -d --build game
```

Hodnoty `CRAZY_TYPKA_EMBEDDINGS_PER_PROCESS` a `CRAZY_TYPKA_EMBEDDING_TOKEN_BUDGET` omezují pokusy a konzervativní UTF-8 rezervace během jednoho procesu; nejsou trvalou finanční kvótou. `CRAZY_TYPKA_GENERATIONS_PER_PROCESS` je oddělený strop generování. Nejistý výsledek importu vyžaduje výslovný `--retry-uncertain`; nejprve zkontrolujte souhrn, rozpočet a zachovanou cache. Nepřidávejte automatickou smyčku opakování.

PostgreSQL má zakázané logování bind parametrů pro běžné i chybové logy; aplikace to kontroluje před SQL s parametry. Záloha a její obnova musí zahrnout volume, profil a verzi aplikace. Provozovatel zajišťuje obnovování zdrojů před `reviewAfter`, publikaci a monitoring. Automatický crawler/scheduler tento checkpoint nezavádí.

## CI a skutečné ověření

CI používá dočasný PostgreSQL17/pgvector0.8.7 image připnutý digestem a výhradně falešné testovací údaje. `RAG_TEST_DATABASE_URL` spouští skutečné SQL testy v unikátním schématu testovací DB; OpenAI provider je v těchto testech fake. Bez této proměnné je DB test výslovně skipped, což není doklad SQL funkčnosti. Multiplayer integrační harness odstraňuje všechna zděděná `RAG_`, `OPENAI_`, `CRAZY_TYPKA_`, `LINEAR_` a `FEEDBACK_` nastavení.

Místní SQL/placený OpenAI důkaz se eviduje samostatně. Tento návod netvrdí nasazení na veřejný host; k tomu je potřeba provozovatel a jeho serverová konfigurace.

Primární podklady: [GitHub PostgreSQL services](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Docker Compose services](https://docs.docker.com/reference/compose-file/services/), [pgvector](https://github.com/pgvector/pgvector). Rozdělení rolí, limitů a publikace je projektové rozhodnutí podle [vektorového kontraktu](../research/vector-contract.md).
