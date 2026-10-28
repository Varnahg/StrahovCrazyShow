# Ověření OpenAI / pgvector RAG

KEY-65 dokončeno a integrováno přes [PR34](https://github.com/Varnahg/StrahovCrazyShow/pull/34). Přijatý head `a4c24af4756e45c72563919715edd7102465fb18`, base `de6f87a2efbf8596bb03efae863e8d6763e22774`, main merge `86e4dd603ca1b91e3eaa5f84573f9481be410a29`. [Finální CI](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40692141941):2579PASS/0FAIL/1SKIP, skutečné SQL testy proběhly, TypeScript/produkční build a celý izolovaný SDK běhSUCCESS. [Přejímka](https://github.com/Varnahg/StrahovCrazyShow/pull/34#issuecomment-6469934495) a source-secret checkSUCCESS. Merge má shodný source tree `c1d382347b05829251d255dfb36bd2249771224b` s ověřeným headem. Žádné veřejné nasazení se netvrdí.

## Doložené výsledky

- Import45 úryvků z28 aktuálních zdrojů Silicon Hill/SÚZ,7 archivních metadata bez embeddingů. [Potvrzení importu](research/live-import.json), [restart a nulový opakovaný import](research/restart-proof.json).
- Skutečný OpenAI A/B eval zvolil `text-embedding-3-large`/3072 a cosine distance0.60. Po odstranění všech NLP odvozených filtrů zachováno33/33 zdrojových otázek,5/6 dalších parafrází a6/6 nesouvisejících bez evidence. Známá mezera je anglický dotaz na vyvolání filmu. [Metodika a omezení](research/vector-evaluation.md).
- Skutečný HTTP service/router/provider:3/3 odpovědi200, správné SH/SÚZ citace, přesný replay bez dalšího embeddingu/generování a reset204. [Receipt](research/live-api.json). Kontrola před posledními expiry/filter opravami; jejich cílené RED/GREEN testy a následné review ověřily dotčené chování bez dalších placených generací.
- PostgreSQL17.11/pgvector0.8.7: původně11/11, po review rozšířeno na12/12 skutečných DB testů,0skip. Zahrnuto exact cosine, archiv/čas, cache/metadata-only/changed-input, atomic publication, uncertainty, concurrency, abort/disconnect, profile/dim a mixed authority/topic filtry předLIMIT.
- Store/ingest18/18 CPU a scoped TypeScriptPASS; runtime105/105 v posledním předání a scoped TypeScriptPASS. Adaptér40/40 před kalibrací a poté spolu s dotčeným řetězcem108/108PASS. Počty jsou různé překrývající se běhy, nesčítají se.
- Finální společná cílená sada všech `crazy-typka*.test.ts` a `rag*.test.ts`:163PASS/0FAIL/1SKIP,1.4s. Skipped je explicitní opt-in DB test bez nastavené proměnné; jeho samostatný skutečný běh12/12 je uveden výše.
- Source-secret scanner nad6783 rozpoznanými textovými soubory:0 kandidátů. Dodatečný přesný scan skutečných privátních hodnot pouze v taskových změnách:0 shod. Klíče a URL s hesly zůstaly mimoGit.

## Nezávislé review

Tři vrstvy četly společný kódový diff. Nálezy i jednotlivé verdikty jsou v [specifikaci](../../../_bmad-output/implementation-artifacts/rag-sources-20261028/spec-key-65-import.md). Opraveny expirace zdroje během posledního async ověření, ztráta kandidátů u kombinovaných dotazů a tři mezery testů: SQL filtry, skutečný produkční loader, historie při změně revize. Finální re-review všech těchto nálezů uzavřené, žádný odložený podložený nález.

Odvozování SQL filtrů z textu je odstraněno celé, takže chat sémanticky hledá ve všech veřejných aktuálně platných zdrojích. Explicitní metadata API úložiště zůstalo podporované a behaviorálně ověřené protiDB. Model nadále rozlišuje instituce podle ověřené evidence a promptu.

## Plná sada a konečné přijetí

Místní plná sada zahájená nad `786c1bda78e71d73a429c515628d80207a706ed2` se skutečnou testDB skončila po1506s:2564PASS/3FAIL/3SKIP. Jedno selhání autodev legacy review child a dvě WGSL readiness selhání se na nezměněných testech izolovaně neopakovala:1/1 a7/7PASS. Původní plný běh zůstává neúspěšný, dílčí výsledky jej nepřepisují. Během jeho závěru, kdy zůstával aktivní jen nedotčený autodev soubor, vznikla kalibrace; RAG testy následně proběhly znovu. Pozdější review opravy potřebují finální CI nad společným headem.

Lokální heavy/build/2568/4268 rezervace byla po ukončení helperů skutečně předána Jantar chatu. Lokální build/SDK v tomto okně neběžely; následná finální CI je provedla úspěšně. CI měla skutečnou dočasnou pgvector službu, falešné credentials a fake embedding provider pro SQL testy. Main přijetí proběhlo až po zelených povinných checkech a statusu na přesném headu, bez bypassu.

První CLI push odmítl OAuth token bez workflow scope. Existující oprávněná GitHub aplikace publikovala přesně shodný CI blob do pracovní větve, jeho commit byl sloučen bez změny source tree a následný push prošel. Nevznikl nový token/grant, nesnížily se kontroly a nepoužil se neověřený SSH host. Tento autentizační krok neměnil ověřený obsah.

Žádná hra, editor, GPU měření nebo změna hraného snapshotu nebyly součástí tohoto RAG zadání. Místní vlastní DBvolume s placenou cache zůstává zachované; nejsou v něm uživatelské chatové dotazy. Provozovatel veřejného hostu musí samostatně nasadit server, persistentní DB a soukromou konfiguraci podle [návodu](deployment/README.md).
