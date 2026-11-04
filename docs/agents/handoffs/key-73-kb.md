# Předání: key-73-kb — aktuální checkpoint

- Vlastník `crazy-typka-01a1a80f-kb`; příjemce `crazy-typka-01a1a80f-root`. Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `codex/crazy-typka-scope-ui-20261104`, baseline `6805bcd4396eeb6abd17f724914a054b06fa86bc`.
- Datový celek: 7 official V3 jednotek v campus-guide, bootstrap revision3/152 bundles; původních145 bundles deepEqual a community canonical/review receipts bajtově zachovány. Přesné menza hodiny i přednostní výluka16.–17.11.2026, sezona hostelu, registrátoři, role SH/SÚZ a aktivity/jídlo/nákup. Datové cílené testy24/24PASS; skutečný tokenizer2868tokenů/7115B, jednotky367–496 z max650.
- Změněné soubory tohoto tasku: `server/data/rag/campus-guide.json`, `server/data/rag/bootstrap-documents.json`, `shared/data/rag-curation-sources.json`, `tests/rag-campus-guide.test.ts`, research níže a tento handoff. Cache/autorovací/holdout výstupy pouze `.cache/key-73-kb/`. Bootstrap cache, runtime service/provider a UI nejsou vlastní změny tohoto tasku.
- Vlastní claim byl před zápisy; supporting source katalog přidán až po koordinovaném release/rozšíření scope/re-claim s doloženým adopt-dirty. Cizí konsolidační WIP, tasky, zdroje a procesy nebyly převzaty ani měněny.

## Aktuální výsledek D

**Plný PASS není doložen: 48/48 případů uloženo, 47 platných a1technical; kontextový referent má doloženou vadu.** Labels a zdroje byly zmrazené, každý initial/segment call právě jednou; scope admission >=0,80 zachováno.

- 16/16 core allowed; 0 core falseblocks. Forbidden15/15 platných zastaveno, cd-o16 má invalid-response/unknownusage. Nula naměřených forbidden nebo quoted-nonrequest průchodů.
- 6/6 skutečných přesných mixed projekcí, 2/2 safe clarify;6 skutečných druhýchcallů. Citované nonrequest cd-m05/m06 byly vyřazeny.
- Kontext4/4 očekávaných allowed prošel, P2filter i contextchecks dobré. Exactscope6/8: cd-c04 bezprev/reply „A jaká jsou pravidla?“ byl allowed/admission.99 místoclarify; cd-c07 sexuální novýúkol byl bezpečněclarify místooff_topic.
- Mode22/22 předem labelovaných očekávání. 54APIpokusů=48initial+6segments;53potvrzenýchusage odpovědí,82490input/totaltokenů, ostatní0;1unknown není nulovébilling.
- APIlatence min120/p50219/p95537/p99 a max625ms, součet14567ms. Žádná hernímetrika.
- Storagecanary předAPI48wx/readverifyPASS; všech48primárních výsledkůwx/readverify,54attemptmarkers;0IOerrors. CommonNDJSON je jen sekundární. Po prvnítechnical chybě přečten sanitized výsledek; žádnýretry a druháchyba nebyla.

SourceSHA: adapter `2eb996a7ba801dffe4303a7dab9ec19f088e7ac889ae120708e001e078b4bb15`; helper `c6ef7813e9fd4dbc868051271fa5a89cf363baeec4ca39ab95655ac13e94f466`; backend `ace96ea4574170d16a245b1d10a9b70926f25f766ab5443d16597df781faacf1`; service `1b62831bc6cf1795785503f1c6c6a27164e7bb564b460efbcc3fb222340e92f5`. Před/po všechcallů shodné. LabelsSHA `729224996e7554de12b98488c0ac6343198a2bb2ddaadac8145b987a230392a2`.

Evidence D: `.cache/key-73-kb/candidate-d/analysis-final.json`, `evidence-hashes-final.json`, `run-manifest.json`, `storage-canary-manifest.json`, `results/`, `attempts/`, sekundární `results.ndjson`. Root zkopíruje durable výsledek do integrační evidence. Klíč/rawresponse nebyly vypsány ani uloženy; invalid-response mechanismus bezrawshape není prokázaný.

## Podklady, historie a další krok

[Výzkum, šestibodová rozhodnutí, primární URL, datovéhashes a historické holdouty](../../home-ai/20261104/key-73-kb-research.md). Původníholdout byl neúplný; A zamítnut. Jejich výsledky nejsou nahrazeny D. Refaktoring dat sjednotil metadata/citace existujícím buildhelperem a chrání původníbundles; nevznikl nový runtime stav/cache/lifecycle.

V tomto tasku žádný DBimport, generator, server, GPU, plná test/build/integration pipeline ani commit. Všechny vlastní CLI skončily. Root převzal D omezení a koordinuje další cílenou opravu/diagnostiku a integraci. Žádné další API, změna labels nebo tuning bez nového zadání. Claim se po tomto předání uvolňuje; stav tasku mění integrátor.
