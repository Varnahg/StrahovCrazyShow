# Průběžné review KEY-63 a KEY-64

Tento záznam zachycuje konkrétní nálezy před společnou integrací. Není to potvrzení hotové produkční přejímky.

| Nález | Důkaz a náprava | Ověření |
| --- | --- | --- |
| Neshodný název origin env | Návod používal ALLOWED_ORIGINS, service ORIGINS; sjednoceno na `CRAZY_TYPKA_ALLOWED_ORIGINS`, jinak by HTTPS proxy dostala 403 | Serverové CORS/config testy |
| Review termín byl jen metadato | Corpus se původně používal i po reviewAfter; nyní retrieval odmítá stale/future/invalid datum a service předává vlastní clock | Boundary test těsně před a na 27. 11. 2026 UTC |
| Volná locale coercion | `String(["en"])` přijalo pole; nahrazeno přesným string union porovnáním | Malformed request test |
| Nevěcná retrieval shoda | Jediné obecné slovo rules dokázalo vybrat zdroj u nesouvisejícího dotazu; zpřísněna klíčová shoda | Negativní dotazy bez citací |
| Tři úvodní návrhy neměly evidence | Přesné dotazy z CZ/EN UI reprodukovaly prázdný retrieval; doplněna omezená slovníková normalizace a campus-specific anglická fráze | Test všech čtyř skutečných starterů; generic what-can-I-do zůstává bez evidence |
| Live loader měl busy předka | `aria-busy=true` na celé sekci dovoluje odklad oznámení stavu; odstraněno, aktuální krok zůstává polite status | SSR regrese zakazuje potlačující busy předka; skutečná čtečka zatím neověřena |
| Expirace AI skrytě ztratila kontext | Klient vytvořil novou relaci bez upozornění a ponechal starý log; nová relace nyní vyčistí log, zachová právě odeslaný dotaz a oznámí absenci starého kontextu | Oba případy: lokální expiresAt i server 401; reset odstraní oznámení |
| Sestavení světa mohlo předběhnout paint textu | Přidán cancel-safe double-rAF helper před synchronní konstrukcí; žádná změna readiness ani tvrzení o FPS | Dva snímky, abort v neviditelné kartě, queued callback po cleanupu |
| Přímá DM/event navigace zůstala v AI pohledu | Tři lidské entrypointy nyní používají společné openHumanChat: vybere lidský pohled, kanál a otevře panel | Vykonání skutečného UI helperu po předchozí AI volbě; žádný HTTP/model call |
| Herní karta měla tmavý text nad tmavým panelem | Průhledný background override odstraněn; světlá AI karta si zachová vlastní kontrast i uvnitř side-panel | Čtecí kontrola skutečné CSS návaznosti; 3D herní screenshot se tím netvrdí |
| Po odeslání zprávy se skutečný browser fokus vrátil na tělo stránky | Composer zůstává během odpovědi editovatelný, explicitní send/starter/reset vrací fokus do něj; automaticky se další dotaz neodesílá | Regrese zachování draftu a blokace druhého requestu; navazující skutečná browser kontrola |
| Globální Colyseus CORS předběhl Express | Jen AI namespace má vlastní dispatcher před frameworkem; ostatní routy zachovávají původní handler | 27 serverových testů po opravě a celý izolovaný SDK běh PASS |
| Po neúspěšné nové otázce měl generátor starší téma než retrieval | Terminální chyba přijatého pokusu ořízne modelovou historii; deterministická paměť USER témat dál respektuje novější hranici. Zamítnutý plný text se znovu neposílá modelu | Regrese ověřuje nejen prázdnou evidenci, ale i skutečný modelový vstup bez starého sportovního dialogu a bez neúspěšného nového textu |

Server/provider/retrieval read-only review provedl nezávislý agent po průzkumu. Nedoložil další podstatný problém v klíčích, citacích, moderaci a lifecycle. Klientské review odděleně kontrolovalo reset, pozdní statusy a přístupnost; dvě P2 výše root opravil. Root navíc reprodukoval nedostatečný recall na konkrétních UI starterech.

Primární podklad pro busy/live region: [WAI-ARIA 1.2 aria-busy](https://www.w3.org/TR/wai-aria-1.2/#aria-busy). Zdroje pro API a RAG jsou v [průzkumu](research.md). Všechny dosavadní testy používají řízené provider odpovědi; neprokazují kvalitu živého modelu, prompt-injection odolnost v otevřeném provozu ani GPU chování.

## Konečné review 28. 10. 2026

Tři nezávislé čtecí vrstvy zkontrolovaly celý vlastní diff proti přijatému main752e75fd (včetně nových souborů); cizí závislosti byly z review vyloučené. Blind a edge reviewer uvedli procedurální omezení: součástí původního diffu byly také evidence/specifikace, takže nelze tvrdit dokonale slepé review. Jejich nálezy byly doložené konkrétním kódem a reprodukcí.

- medium/patch: loader dědil světlý ink z game-shell na světlém pozadí (1,127:1). Vlastní tmavý ink a light color-scheme obnovují kontrast titulku, kroku, detailů i značky; kaskáda zkontrolována. GPU render se netvrdí.
- medium/patch: corpus mohl vypršet během API volání. Přidána kontrola před publikací/uložením historie; počáteční odpověď i replay nyní odmítnou expirovaný podklad.
- medium/patch: chyběla pozitivní regrese provozního env stropu. Nový test nastavuje skutečný env cap=1, bez vnitřního override, a dokládá právě jednu generaci.

Po těchto opravách kombinovaná cílená sada159/159 PASS. Živé modelové testy jsou vedené samostatně v přejímce; původní mock evidence jimi není nahrazena. Nevyřešený podložený nález z tohoto review nezůstal.
