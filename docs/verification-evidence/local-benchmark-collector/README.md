# Výslovně zapnutý místní sběr benchmarku

Implementace: `server/local-benchmarks.ts`, privacy projekce `shared/local-benchmark.ts`, diagnostická route před běžným wildcard CORS v `server/index.ts` a callback stávajícího tlačítka v `client/ui.tsx`.

Collector je standardně **vypnutý**. Diagnostické endpointy tehdy vracejí 404 a nic nezapisují. Zapne se pouze při současném nastavení:

- `STRAHOV_LOCAL_BENCHMARK_DIR`: výslovná **absolutní** místní cílová složka.
- `STRAHOV_LOCAL_BENCHMARK_ORIGIN`: přesný původ stránky, např. `http://127.0.0.1:4179`. Pouze HTTP loopback `127.0.0.1` / `localhost`, port 4179, bez koncového lomítka.
- `STRAHOV_SOURCE_SNAPSHOT_ID`: přesný lowercase SHA-256 identifikátor výsledného snapshotu I.
- Server skutečně poslouchá na sdílené konstantě `127.0.0.1`; příchozí i místní socket musí být loopback.

Při sestavení klienta musí `VITE_SOURCE_SNAPSHOT_ID` obsahovat tentýž identifikátor. Spuštění serveru a sestavení patří do neměnného snapshotu I. Hodnoty development/null, chybějící konfigurace či starý klient se nezapisují. Aktuální herní funkce, ověřování relací a singleton světa zůstávají oddělené.

Vývojový nebo běžný build bez platného snapshot ID diagnostiku ani nevyhledává. Build s platným ID zjišťuje enabled status, ale bez výslovného serverového opt-in přesto nic neposílá ani neukládá.

Uživatel v Chrome/Edge otevře hotovou místní hru na nastaveném původu a stiskne dosavadní **„Změřit FPS po dobu 10 sekund“** v Nastavení. Pouze toto UI tlačítko uděluje jednorázový příznak pro upload; programové/debug spuštění měření jej neuděluje. Callback vždy nejprve zobrazí běžný výsledek. Teprve pak pro ručně spuštěné měření ověří status a případně odešle data. Při enabled collector se krátce zobrazuje, že se výsledek ukládá pouze na tomto počítači; po 201 nenápadné potvrzení. Selhání uložení ponechá výsledek v prohlížeči. Není nová obrazovka, účet, heslo ani IS.

Mutable rendering counters se převedou do samostatného payloadu synchronně při dokončení měření, před čekáním na HTTP status. Privacy whitelist je proveden **před HTTP a znovu před diskem**. Neobsahuje hráčská ID, přezdívky, chat, účty, modelReview/identity rootů, volné poznámky, URL textur, chybové cesty, klientské filename/path nebo klientské receivedAt. Unknown extra data se nezapisují; explicitní osobní/file pole server odmítá. Povolené jsou pouze FPS/kvantily, doba a počet snímků, rozlišení, skutečně hlášený GPU renderer/vendor a klasifikace, kvalita/budgets, agregované počty/LOD avatarů, virtuální kamera/osvětlení, renderCost souhrny a frameBreakdown.

POST `/api/diagnostics/benchmark` vyžaduje přesný Origin, JSON Content-Type, nejvýše **256 KiB** včetně chunked přenosu, nejvýše **3 pokusy/minutu**, shodný snapshot ID, konečná číselná pole, dobu alespoň 10 s a kohortu **1 nebo 30** avatarů. Podpora desetinných statistik/triangle souhrnů je zachována. Rozlišení, frames a enumy mají vlastní kontrolu. GET `/api/diagnostics/status` vrací pouze enabled/source ID/mode. Browserové same-origin GET běžně nemají Origin, proto status přijímá i Referer se **stejným přesným původem**; POST/preflight tuto výjimku nemají. Cizí původ nikdy nedostane wildcard CORS diagnostiky.

Měření musí obsahovat číselné `renderErrorCount=0` a `assetLoadErrorCount=0`. Chybějící pole nebo jakákoli kladná hodnota záznam zneplatní: FPS z rozbitého shaderu nebo chybějících stromů/vozidel nejsou přijatelný výsledek výkonu kompletní scény. Texty chyb a cesty se nepřenášejí.

Server doplní vlastní receivedAt UTC, source ID a pevný mode. Generuje interní náhodný UUID filename; nejprve zapíše `.tmp` s exclusive create a atomicky jej přejmenuje na `.json` ve výslovné složce. Klient žádné jméno ani cestu neurčuje a response je nevrací. API neposkytuje seznam ani čtení uložených výsledků. Jde o klientem hlášené lokální měření, nikoli serverové ověření GPU či náhradu fyzického uživatelského kliknutí.

`pnpm exec tsx --test tests/local-benchmarks.test.ts`: **6/6 PASS**, [úplný HTTP test log](./tests.log). Ověřeno default off, chybějící/nebezpečná konfigurace, foreign/null/wrong-port Origin, preflight a browser Referer, atomic write a trusted metadata, privacy/unknown pole, stale/development/null source, filename/path traversal, neplatná čísla/doba/kohorta, text/plain, 3/min a oba způsoby překročení 256 KiB. Testy spouštějí vlastní krátké HTTP servery na náhodných loopback portech a ukládají jen do ověřených dočasných adresářů; hlavní server ani uživatelská nastavení nemění.

Cílený strict TypeScript klientského UI, čisté projekce, serverového modulu a testů prošel. Tento subagent nespouštěl full suite, build, snapshot ani benchmark v uživatelově Chrome/Edge. Skutečný výsledek GeForce zůstává čekající, dokud uživatel s finální I sestavou nestiskne běžné tlačítko a nevznikne odpovídající místní JSON. Finální sestavu I a její environment identitu připravuje root.
