# KEY-70: skutečná Docker přejímka

Root docker-rag-full-validation-01a17e9d, resources heavy-validation/workspace-build/port4294. Pouze vlastní projekty `scs-docker-rag-a2847b5960-a` a `-b`. Původní strahov-rag-20261028 DB a volume zůstaly stopped/nedotčené; žádný GPU/browser nebo placené API.

## Identity a sestavení

Fyzický immutable snapshot v `.cache/docker-rag-full-validation-20261029/snapshot-a2847b5960` měl9007vstupů včetně testů a5067MB; každá kopie ověřena source/target SHA před/po. Source hash `8347e924e53539a2c04c3617c3fbde53cdd2ff022ddaf5f480e64e06f3a451ba`, pracovní HEAD58da5fc7693bd1fda04f06050a7b1f6fc9afbcaa plus vlastní Docker WIP. Jeden plný image build prošel locked dependencies, kontrolou8064runtime assetů bez LFS pointerů, strict TypeScript i Vite buildem.

Herní image: `sha256:21015b852881ef738ccca96a60926dac079e857d85b38ff73a09ceb09a278a66`. Po review se změnil pouze bootstrap, jeho test a seed revision obal; secrets helper/game entrypoint ani klient/server runtime kód se nezměnily. Finální tools snapshot160souborů má hash `f967df79da2d115e75d00f41bda0e1f475b6ebad59a823736f3295bb55f1c567`, jeho skutečný image build prošel a výsledný image je `sha256:4e6fd4317b586aaf7a196c00eaf1c68ecd89803e3c692d508418fecf353e5aa0`. Reálná přejímka použila tento opravený tools image a stejný herní runtime image; velké assety se znovu nesestavovaly. Herní image obsahuje starší nepoužitý seed metadata obal, provozní bootstrap čte výhradně finální seed ve svém tools image. Finální normální CI zkontroluje celý nový source checkpoint.

## Výsledky

- První čistý projekt automaticky vytvořil oddělené credentials, omezené role, schéma a oba heads: legacy76922848bbaf791b366a87dc7b8985f5b995d9542b512948697b301edb3dbfdb a v30e98de6518c62ccf9849dc81ce3ae11fdc9ba7f2df027300f2ffaa246d21bff9.
- Oba projekty mají101vektorů a1v3dokument, cache digest `68d1488022679eace3dcc144e45d21a3`. Embedding attempt ledger má0řádků. Default seed je tedy úplně použitý bez embedding requestu.
- Hra health200 a `/api/ai/status` enabled:true, skutečně přes hostport4294. Reader INSERT=false, přístup k bootstrap metadata=false; ingester nemá superuser/createrole/createdb/bypassrls. Game nemá owner mount, DB URL ani raw API key v Docker Config.Env; obojí načítá až runtime wrapper.
- Restart stejného projektu zachoval reader credential fingerprint, cache a heads. Nový čistý projekt má nový credential fingerprint, ale stejné seed heads/cache digest. Jde o doloženou čistou druhou instalaci na tomto Docker enginu, nikoli fyzicky provedený běh na druhém notebooku.
- Skutečné DB scénáře PASS: vyšší revision se stejným targetem posune jen marker; nižší revision zachová novější; stejná revision s jiným targetem se odmítne; změna existujícího embedding profilu a chybějící secret nepoškodí data; nezávislá publikace zůstane zachovaná i po dalším plném stop/start. Po všech scénářích101cache/0attempts. Původní independent head byl ve vlastním testu45ce3eea…, nikoli ve skutečné placené DB.

Použit byl falešný key a explicitní maxInputs/maxBytes0. První pokus s Docker `internal:true` doložil plnou readiness uvnitř kontejneru, ale host HTTP skončil ECONNREFUSED; tento omezený validační setup je zachovaný v logu. Poté byl použit běžný bridge a `api.openai.com:127.0.0.1` u konzumentů. Host HTTP prošel, žádný OpenAI request nemohl utratit rozpočet. Toto není test kvality živé modelové odpovědi; ta byla ověřena dříve v přijatém RAG checkpointu.

## Evidence a cleanup

Příkazy/logy jsou v `.cache/docker-rag-full-validation-20261029/`: manifesty, `a-internal-fresh.json`, `a-restart.json`, `a-restart-preserves-operator.json`, `b-fresh-transfer.json`, `transfer-proof.json`, exercise.ts a command logs. Zaznamenané hashy neobsahují credentials. Bootstrap stdout obsahoval pouze safe outcomes; SQL/role hesla se nelogují, DDL session má log_statement=none/log_min_error_statement=panic a bind logging0.

Cleanup ověřil přesná jména všech osmi vlastních volumes, jejich Compose project labels, local driver a absenci host bind options. Poté odstranil jen oba vlastní projekty/volumes a ověřil, že nezůstaly kontejnery ani volumes daných projektů. Žádný prune nebo restart Docker Desktop. Běžící pomocníci skončili; port4294 se ověřuje volný před release. Testovací image a immutable evidence jsou zatím zachované jako cache, nejsou součástí Git exportu.
