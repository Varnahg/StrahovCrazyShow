# Předání: příprava všech kvalit před hraním

18.10.2026, root `webgpu-game-quality-preparation-01a14497`. User výslovně přijal delší start ve prospěch svižného hraní. Výzkum potvrdil přípravu pouze medium, následný auto→low a chybějící low render-target/shadow/pipeline kombinace. Alternativy selective-low-F a viditelný async transition nepokrývaly celý požadovaný kontrakt; zvolena konečná3quality matrix.

WT `61377f61530f51433c51b565f03773421d4b3b35` → main **`0703258da75d98cf192a8a4f11bb360baa765585`**, přesně5source/testfiles. Nový helper, actual Game wiring, dvě testovací sady a zachované single-quality assertions. Bez memo, vendor, backend-default nebo adaptive-policy změny. Temporary render quality nezasahuje requested adaptive state; nejnovější volba se obnoví před skutečnými finálními ready draws. Každý pass má nejvýše30s aktivního času, celámatrix90s, včetně apply/restore režie; původní cancel/visibility/health/final submitted-frame gate zůstává.

Ověření:

- Helper19/19 a scopedTS184/0; actual LightHelper39stages/117draws. Manifestd4b733216a48f0d8e3bdc8074b606425348e3d81bcb0ec17996f85f980bef396.
- Game wrapper baselineRED1PASS/6FAIL→GREEN7/7, následně constructor-order regresníRED a oprava `scene?.isDisposed`; targeted61/61 +client/shared scopedTS0. Dva další actual-inner testy ověřily restore-quality před3readydraws a skutečný250ms budget; celý inner19/19. Neúspěchy i zdroje uchovány.
- Clean snapshot **412bdb18b992ce2325f792072b538b914a345f898c544bef839429d0279fbf39**:1367/1367 bezskipů,fullTS/build/integrationPASS.
- Combined snapshot **205b4dda8028dd20b90dbd75177ba6ebd8d3fcf41d02cd97a8c44c42a6b9d05d**:1427/1427 bezskipů,fullTS/build/integrationPASS. VM test pouze dostal existující C5 diagnostic side-effect port, assertions zůstaly.
- Nezávislé review helperu/wiringu a main integrace bez zbývajících blokujících nálezů.219původních C5 Game members byte-exact; explicitní merge zachoval startup/preload/postprocess reuse. Dva foreign source/test překryvy, dalších131dirtypaths uchováno. Receipt `.cache/webgpu-migration/quality-main-integration.json`.

Skutečný Edge, jeden multiplayer klient/Alex, běžné aktuální počasí,1514×643, auto→low50% (757×321):

| Scénář | Maximum intervalu | Nové moduly / sync pipeline |
|---|---:|---:|
| Původní day13, první low F |3993.4ms|8 /49|
| Všechny kvality, první low F |150.4ms|4 /3|
| Low→high se zapnutou svítilnou |224.4ms|0 /1|
| High→medium |162.4ms|0 /0|
| Medium→low |152.8ms|0 /0|
| Opakované low F po roundtrip |113.7ms|0 /0|

Nový startup57.6603s, příprava38.5843s a39complete stages (low16.9898s,high16.4526s,medium5.1418s). Healthvalid/chyby0 ve všech pěti exportech. P95/p99 prvního lowF29.5/50.5ms a43.2FPS: stále nesplňuje celkovývýkonnostnícíl. Jde o konkrétní odstranění sekundového cold-pipeline záseku, nikoli konečnouFPS/renderer přejímku. Počasí/ambient nejsou přesně shodné mezi starým a novým během; pipeline rozdíl a kvalitativní příčina mají přímé zdrojové důkazy.

Raw a UIexporty v `.cache/webgpu-day13-user-build-20261018/`, session20154542-847b-4d9d-af34-832e1d9ac97e,1470souvislýchrecords, SHA2538f3b164d9c4a63d508d72b4ba3ebae980fda028cca87b29a8f6296b719875. Invalidní první neaktivnítab1FPS timeout z předchozího buildu zachován odděleně; nedošlo kvůli němu k navýšení timeoutu.

Nový frozenbuild4195/API2590 má samostatné vlastnictví a zůstává dostupný; staré4193/4192/4188 nedotčené. Žádné vlastní testovací procesy nezůstaly. Známé meze: B6/auto/remoteavatar/pohledy a celá1/3relation matrix ještě nejsou přijaté. Bounded shader inventory agreguje stejné stage názvy napříčquality; `passQuality` označuje přípravný průchod, jeho final restore může použít pozdější requestedquality. V C5 se late request během loading override nezaloguje samostatným quality-change eventem, ale renderer jej správně obnoví. KEY-31 a migrační cíl zůstávají otevřené.
