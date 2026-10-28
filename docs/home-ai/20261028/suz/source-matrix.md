# Ověření a import SÚZ · 28. 10. 2026

Task `rag-sources-20261028-suz`, vlastník `rag-suz-01a17e9d`. Podkladem byl katalog předaný koordinátorem a následné přímé čtení veřejných primárních stránek. Katalog sám není důkaz správnosti. Přijato 14 zdrojů a 20 krátkých vlastních faktických parafrází; pět dalších záznamů je pouze v odděleném archivu. Nejde o úplný import všech URL katalogu.

## Výběr a pravidla

Porovnáno převzetí celých dokumentů, odkazový seznam bez obsahu a krátké ověřené parafráze. Celé dokumenty mají nejasnou licenci, mnoho datovaných podmínek a obtížně čitelné tabulky; samotné odkazy neposkytnou modelu fakta. Zvolen omezený výběr parafrází s locatorem a nezávislou platností zdroje. Indexování, runtime cache a lifecycle vlastní runtime integrátor; zde se nic nestahuje při uživatelském dotazu.

HTML bylo přečteno na veřejném webu SÚZ, PDF nativní textovou extrakcí se stránkovými locatory. Nebylo použito OCR ani přihlášení do ISKAM4. Web uvádí všechna práva vyhrazena; otevřená licence PDF nebyla zjištěna. `license` a `licenseUrl` jsou proto null. Autor označuje vydávající instituci, nikoli předpokládaného autora webové stránky. V datech nejsou celé dokumenty. SHA-256 každého chunku označuje přesný UTF-8 text uložené parafráze, nikoli upstream PDF.

`checkedAt=2026-10-28` je kontrolní den UTC. Provozní stránky mají novou kontrolu nejpozději `2026-11-04`, dokumentové PDF `2026-11-28`; obě hranice jsou výlučné UTC. Datum účinnosti se vyplňuje jen podle výslovného údaje v dokumentu. České datum je převedeno na půlnoc Europe/Prague s příslušným offsetem. Neznámá data ani konec účinnosti nejsou domýšleny z názvu, akademického roku nebo data stažení.

## Přijaté primární zdroje

| Source ID | Ověřený zdroj / discovery | Lokátor a použití | Časové a věcné omezení |
| --- | --- | --- | --- |
| `suz-housing-documents` | [Ceníky a dokumenty](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty), discovery totožné | Oddíly Ceníky a Ubytovací dokumenty pro AR 2026/2027 | Rozcestník, nikoli samostatný příslib nároku či ceny. |
| `suz-scenario-2026-2027` | [Scénář](https://www.suz.cvut.cz/cz/media/file/scenar-ubytovani-2026-2027), odkaz z aktuálního rozcestníku | Čl. II–IV, s. 1–2; závěr s. 3 | Výslovně účinný od 4. 5. 2026: `2026-05-04T00:00:00+02:00`. Projednání AS 29. 4. není vydáváno za datum vydání. |
| `suz-procedures-2026-2027` | [Postupy a pravidla](https://www.suz.cvut.cz/cz/media/file/postupy-pravidla-pri-poskytovani-ubytovani-na-kolejich-cvut-2026-2027), odkaz z rozcestníku | Čl. IV, s. 3–4; čl. V/a–b, s. 5; slovník jistot, s. 9 | Vlastní nadpis určuje AR 2026/2027. Samostatná účinnost neuvedena. Skončené termíny nejsou aktuální návod. |
| `suz-vup-2026-2027` | [VUP](https://www.suz.cvut.cz/cz/media/file/vseobecne-ubytovaci-podminky-priloha-c3-scenare-ubytovani-2026-2027), odkaz z rozcestníku | Čl. III/1–5, s. 1–2; IV/15, s. 3; V/2, s. 4 | Aktuálně zveřejněná příloha 3. Vlastní datum účinnosti chybí, zůstává null. |
| `suz-dorm-tariff-2026-09` | [Ceník kolejného](https://www.suz.cvut.cz/cz/media/file/cenik-kolejneho-platny-od-1-9-2026), odkaz z rozcestníku | Nadpis/záhlaví s. 1; podmínky s. 2 | Výslovně od 1. 9. 2026, půlnoc `+02:00`. Ověřena jednotka za lůžko a den včetně DPH. Konkrétní sazby se nepřebírají. |
| `suz-apply-housing` | [Jak získat ubytování](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/jak-ziskat-ubytovani), discovery totožné | Žádosti stručně a přehledně; postup podání | Provozní shrnutí, bez částek a bez záruky volného pokoje. |
| `suz-payment-methods` | [Platební metody](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/platebni-metody), discovery totožné | Kde a jak můžu zaplatit za kolej? | Metody pro ubytování; ne obecné pravidlo pro menzu. Bez bankovních údajů a otevírací doby pokladen. |
| `suz-arrival-guidance` | [Pokyny k nástupu](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/jak-ziskat-ubytovani/pokyny-k-nastupu-na-ubytovani-na-kolejich-cvut), odkaz z Jak získat ubytování | Odložený nástup; platba za první měsíc | Jen dohodnutí postupu a omezení inkasa. Úplné doklady se přebírají z PPUK, které výslovně zahrnují výjimku pro průkazové foto. |
| `suz-housing-faq` | [FAQ](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ubytovani-faq), discovery totožné | Hlášení závad; Výskyt nežádoucího hmyzu | Pouze provozní směrování hlášení. Ne sanace svépomocí, sankce, vracení jistoty ani klubové nároky. |
| `suz-strahov-dorms` | [Koleje Strahov](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/koleje-strahov), discovery totožné | Adresa; kontakty; hospodářky bloků; nabídka pokojů | Týmové kontakty a typy pokojů. Ne aktuální kapacita, jízdní řády ani dostupnost služeb. |
| `suz-housing-office` | [Oddělení pro ubytování](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/zakladni-informace/oddeleni-pro-ubytovani), discovery totožné | Adresa; kontakty | Kanceláře 33a,b jsou SÚZ; nezaměňovat s kanceláří SH v jiných dveřích. Bez provozní doby. |
| `suz-menza-strahov` | [Menza Strahov](https://www.suz.cvut.cz/cz/menzy-stravovani/menza-strahov), discovery totožné | Adresa; Jídelníček; Menza Strahov | Jen umístění a informace, kde hledat dynamické menu. Žádná dnešní jídla, ceny či příslib otevření. |
| `suz-strahov-buffet` | [Snack bar / bufet](https://www.suz.cvut.cz/cz/menzy-stravovani/snack-bar-bufet), discovery totožné | Snack bar Strahov | Umístění v B1; bez aktuálního sortimentu, času nebo ceny. |
| `suz-sports-rental` | [Pronájem sportovišť](https://www.suz.cvut.cz/cz/komercni-sluzby/pronajem-sportovist), discovery totožné | Areál Strahov; popis pronájmu | Hřiště SÚZ, ne klubové posilovny SH. Bez sazeb; starý provozní interval Bubeneče se vynechává. |

## Rozpory a výluky

- FAQ spojuje pozdní výpověď s nevrácením jistoty. Aktuální VUP V/2 odkazují na smluvní pokutu v ceníku. FAQ se pro tyto závěry nepoužívá a import neslibuje konkrétní vypořádání ani nepřebírá sazbu sankce.
- Nativní extrakce kolejného spolehlivě zachovala hlavičku s jednotkou, ale pořadí bloků, kategorií a cen není dostatečným důkazem řádkových vazeb. Konkrétní ceny nebyly importovány; automatická vizuální kontrola neposkytla čitelné pixely pro jejich potvrzení.
- [Metodika rezervací s `-0`](https://www.suz.cvut.cz/cz/media/file/metodika-rezervaci-ubytovani-ar-2026-2027-0) je skutečný odkaz rodiče. Katalogová varianta bez `-0` mimo jiné odkazuje na jiný článek Postupů. Ani jednu nepoužíváme jako současný návod otevřených rezervací: popisovaná etapa skončila. Aktuální soubor není prohlášen za právně neplatný; pouze není zařazen do aktuálního RAG.
- [Starý rozcestník](https://www.suz.cvut.cz/cz/dlouhodobe-ubytovani/dokumenty-0), jeho [Scénář](https://www.suz.cvut.cz/cz/scenar-ubytovani-20222023) a [Postupy](https://www.suz.cvut.cz/cz/scenar-ubytovani-priloha-c1) výslovně patří AR 2022/2023. Staré sazby ani text se nerozmnožují. Přesné konce právní účinnosti nejsou doloženy, metadata je nedoplňují.
- [Ceník náhrad](https://www.suz.cvut.cz/cz/media/file/cenik-nahrad-platny-od-1-9-2026) byl přečten jako kontrola rozporu, nikoli importován jako tabulka pokut a finanční návod. [Způsoby úhrady](https://www.suz.cvut.cz/cz/media/file/zpusoby-uhrady-kolejneho-0) potvrzují rozlišení platby na koleji a platby v bance; účty/IBAN/variabilní symbol se nepřebírají.
- [Základní informace](https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/zakladni-informace) opakují kontaktní stránku OpU. Samostatný duplicitní chunk se nevytváří. [Hostel](https://www.suz.cvut.cz/cz/hotely-hostely/hostel-strahov) je sezónní služba; jeho současná dostupnost nebyla ověřena, proto není aktivním podkladem.
- Žádné dnešní menu, časy menzy/pokladen, dopravní spojení, volná místa nebo parkovací režim se nepřebírají jako trvalá fakta. Agáta a aktuality vyžadují samostatný datovaný dynamický postup. Žádný crawler nebo scheduler nevznikl.
- Osobní účty, přihlašovací rozhraní a soukromá data jsou vyloučena. Použity pouze veřejné týmové kontakty; žádná přihlašovací stránka nebyla otevřena.

## Ověření a návazné dotazy

`retrieval-cases.json` obsahuje 20 samostatných českých dotazů. `expectedChunkIds` znamená všechny uvedené požadované výsledky; každý případ zakazuje archivní source IDs. Samostatný validátor kontroluje JSON, reference, unikátnost, přesné textové hashe, témata, časové formáty a rozsah parafrází. Přepínač `--retrieval` používá skutečný export `retrieveConversationKnowledge` s pevným kontrolním dnem; nic negeneruje ani nevolá provider.

Při společné přejímce ověřit také sekvence „Kolejné na Strahově“ → „A kolik to stojí?“ (SÚZ, bez částky), „Menza Strahov“ → „Jaká je otevírací doba?“ (bez tvrzení aktuálního otevření) a „Klubové členství“ → explicitní dotaz na ubytovací jistotu (změna instituce). Po neznámém tématu se stará kolejní kotva nesmí obnovit. Samostatné dotazy na pokoj B8 nesmějí dostat cenu fitka nebo členského příspěvku.

Tato evidence potvrzuje zdroje a vlastní data. Celý runtime, jeho testy, skutečný model a finální integraci přebírá koordinátor. Žádná GPU hra, server ani placené API v tomto tasku neběží.
