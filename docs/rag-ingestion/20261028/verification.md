# Funkční checkpoint dokumentového RAG a chatu

Stav 29.10.2026: komponenty celých dokumentů a skutečné napojení chatu jsou připravené k integračnímu CI. První skutečný průchod prošel. Celý katalog ještě není importovaný a crawler/scheduler zatím není propojený do jednotného provozního příkazu. Toto není tvrzení o veřejném nasazení.

## Co je ověřené

- Acquisition:114 původních URL/115 katalogových řádků, bezpečný transport, skutečné robots+HTML ověření SÚZ hubu. Připravené další zdroje nejsou totéž co publikované dokumenty.
- Offline worker a OpenAI PDF adapter/normalizer zachovávají celé bloky, strukturu, provenance a skutečné tokenové limity. Image-only a neověřené modelové tabulky zůstávají review-required; schema samo neprokazuje kvalitu.
- V3 foundation zachovává legacy profily, přidává nový `title-heading-text-v2`, veřejné citace a přesnou blok↔chunk vazbu včetně table lineage.
- PG17/pgvector:32 cílených unit testů a skutečný scratch DB běh19/19, včetně migrace naplněné v1, ACL, immutable/sealed publikace, soupeřících zápisů, combined current view, archive a explicitního rollbacku. První reálný běh zachytil opravenou CASE syntax chybu; jeho log je zachovaný.
- Chat používá nové view, current default a explicitní archive/asOf. Scope patří do requestSeq/replay identity. Zdrojové verze se neslévají, provider zná serverový čas a metodu extrakce. Decisions complexity routing z PR35 zůstává beze změny.

## Skutečný OpenAI → SQL → odpověď

[PDF pilot](pdf/live-evidence.json) ověřil2count+2extraction HTTP. Smlouva zachovala oba jazyky, nadpisy a číselné výskyty. Screenshot zachytil dříve chybějící příkladové21.10.2026, ale nemá úplně zakódovaný vizuální stav a není automaticky publikovaný. Count billing zůstává unknown; neoznačujeme jej za bezplatný.

[První E2E](../../agents/handoffs/rag-e2e-20261029-validation.md) použilo skutečnou smlouvu,56chunků a56nových text-embedding-3-large vektorů (11159 B/3651tokenů/2HTTP) ve vlastní testovací DB. Skutečná služba s read-only DB rolí, moderací, Decisions, query embeddingem a Lunou vrátila200 a správnou v3 citaci konkrétního dokumentu/strany. Na otázku o elektřině správně odkázala na ceník příslušné koleje, nevymyslela částku. Odpověď přibližně5,14s.

Stejný import znovu:0nových embeddingů,56cache hitů a stejnárevize. RequestSeq replay:identická odpověď a0dalších placených kroků. Reset204. Původní DB zachovala public head i90cached vectors. Celkem7HTTP v E2E, žádné retry. Raw dokumenty/kandidáti a credentialy nejsou v Git.

## Závěrečné review

Jedno společné review podle uživatelem zvoleného lean postupu našlo jeden P2: jednotlivě platné citation locators mohly překročit společný limit až po generaci. Oprava kontroluje projektovatelnost před publikací a společný merge/cap při admission evidence. Zachovávají se celé chunky a locatory se potichu neořezávají. Re-review reprodukovalo původní5+5 případ: nyní200 s jedním celým chunkem místo502. Ověřeno také9span odmítnutí před publikací, UTF-8 cap a deduplikace. Žádné otevřené nálezy.

Po opravě162 cílených testů prošlo a scoped strict TypeScript je čistý. Širší CI/build/SDK nad finálním exportem teprve následují. Python testy a lockfile jsou součástí source checkpointu; vlastní relevantní sady mají43normalizer/17lineage+HTML/DOCX regresí. HTML A/B/A byl22,818/16,828/21,854s se stejným celým obsahem; omezený vzorek a chybějící část fázové atribuce jsou přiznané v předání.

## Zbývající práce

Jednotná obnovitelná orchestrace, rozšíření skutečného importu a zdrojových pravidel, úplná inventura použitelných zdrojů a řešení review fronty. Uživatel doplnil i běžné služby mimo SH/SÚZ: CrossFit, bazén a potraviny. Jejich registrace není přijetím tohoto checkpointu předstíraná. Následující UI viewport/loader a WebGPU timeout mají oddělené zadání.
