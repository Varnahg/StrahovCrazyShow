# Úvod a Crazy Typka: výzkum a rozhodnutí

Datum: 27. 10. 2026. Výchozí main: `a0e0e31286ae9521f1282a8bd966b40e8fdad628`. Zadání a průběh: [KEY-63](https://linear.app/gigeconomy/issue/KEY-63) a [KEY-64](https://linear.app/gigeconomy/issue/KEY-64). Tři nezávislé čtecí průzkumy: UI/startup, SH zdroje/RAG a bezpečnost návrhu.

## Doložené mechanismy

- Úvod je v `client/ui.tsx`; plný AvatarEditor stojí před CTA. Skutečná karta na `http://127.0.0.1:4182/?terrainReview=b5-tree-hero` měla produkční bundle `index-DSBPccIM.js`, otevřený editor a CTA pod viditelnou oblastí. Karta nebyla změněna. Její vlastník potvrdil immutable v13 snapshot `d381c244f9e667ebfe85c420133effbca0fa0c4b9326d27f8593cd148a13a9f7`.
- Game.start zapisuje bootStage, kontroluje materiály/pipeline a odevzdaný snímek. Konstruktor synchronně staví svět: lepší loader sám neprokazuje rychlejší start ani odstranění blokování hlavního vlákna.
- Server má jedinou StrahovRoom. Počet skutečných připojených hráčů je `store.players.size`; žádné další místnosti nebo falešná AI postava nejsou potřebné.
- Dosavadní veřejné health nemá populaci; players/chat/community-events vracejí 403. Uživatel nově výslovně povolil veřejně souhrnný počet na úvodu. Výjimka nezahrnuje identity, polohy ani chat.
- AI integrace dosud v projektu není. Nejmenší kompatibilní cesta je vlastní HTTP handler před wildcard CORS a samostatný AI kanál, nikoli změna lidského ChatMessage.

## Varianty a volba

| Oblast | Porovnané možnosti | Volba a dopady |
| --- | --- | --- |
| Úvod | CSS úprava, extrakce s odloženým editorem, wizard | Extrakce; CTA dostupné hned, stávající editor a cache se používají beze změny. Neotevřený editor nemusí vytvářet 3D preview. |
| Loader | Časovaný progress, observer bootStage, nový Game callback | Observer konkrétní generace; žádné nepravdivé procento. Explicitní callback je dlouhodobě čistší, nyní by zbytečně křížil měněný Game. |
| Počet | Automatický join, veřejný agregát, jen in-game presence | Veřejný O(1) agregát podle přímé volby uživatele; polling jen menu, timeout/abort, žádná nula při chybě. |
| RAG | Lokální lexikální/BM25, embedding hybrid, OpenAI File Search | Malý kurátorovaný lokální corpus. Žádný externí index/cache nebo upload; omezený recall se doloží testy. Hybrid až při měřeném nedostatku. |
| Chat | Bot jako Player, automatický veřejný bot, vlastní AI kanál | Vlastní soukromý kanál a tentýž widget na úvodu. Nečte jiné konverzace, neovlivňuje count. |
| Odpověď | Stream tokenů, celá moderovaná odpověď | Celá odpověď; jednodušší kontrola výstupu a citací, za cenu čekání na dokončení. |

## Primární zdroje OpenAI

Otevřeno 27. 10. 2026:

- [Responses API](https://developers.openai.com/api/reference/python/resources/responses/methods/create): serverové generování, output limit a stav odpovědi.
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs): text.format JSON schema; nutno ošetřit refusal/incomplete a stále validovat data.
- [Moderation](https://developers.openai.com/api/docs/guides/moderation): `omni-moderation-latest` pro obsah, nikoli ochrana proti opakovaným požadavkům.
- [File Search](https://developers.openai.com/api/docs/guides/tools-file-search): spravovaný semantic/keyword retrieval, předem nahrané dokumenty/vector stores.
- [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices): limity vstupu/výstupu a pseudonymní safety_identifier.
- [Data controls](https://developers.openai.com/api/docs/guides/your-data): store:false není záruka nulové retence abuse-monitoring obsahu. Vlastní logy nebudou ukládat zprávy ani tokeny.

Není k dispozici OpenAI API key ani OPENAI_MODEL. Návrh nebude tvrdit ověřenou kvalitu živého modelu, cenu nebo oprávnění účtu. Zapnutí vyžaduje explicitní serverový vypínač, klíč a model. Testy používají injektovaný fake fetch bez externích volání.

## Veřejné zdroje Silicon Hill

- [Členství](https://www.siliconhill.cz/pages/clenstvi): registrátoři, IS, kancelář, kalkulátor. Datum poslední změny/licence neuvedeny; ukládat krátké vlastní faktické parafráze, ne celý web.
- [Dokumentový rozcestník](https://www.siliconhill.cz/pages/dokumenty): současné odkazy na stanovy a síťová pravidla. Datum změny neuvedeno.
- [Stanovy 1. 12. 2025](https://zapisy.sh.cvut.cz/prilohy/20251201-Stanovy_SH.pdf): čl. X účinnost 1. 1. 2026, nahrazují verzi 23. 6. 2025. Čl. II rozlišuje vznik členství podpisem registrace/ověřením a čerpání výhod po úhradě. Tento konkrétní dokument má přednost před zjednodušeným onboarding textem. Otevřená licence nezjištěna, pouze stručné parafráze.
- [Pravidla sítě 5. 6. 2018](https://zapisy.sh.cvut.cz/prilohy/20180605-Priloha3-Pravidla_site_klubu_Silicon_Hill.pdf): hlavní web na ně stále odkazuje. Evidence zařízení v IS, souhlas správce s vlastním síťovým prvkem, zákaz přenechání přístupu další osobě. Text spojuje účinnost se schválením; samostatné potvrzení schválení nebylo otevřeno. Nepředstírat novou verzi roku 2026.
- [Projekty](https://wiki.sh.cvut.cz/klub/projekty): poslední změna uvedena 18. 7. 2026 16:40, autor janciluk, časová zóna neuvedena. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); odvozený text označit a zachovat atribuci.
- [Sport](https://wiki.sh.cvut.cz/klub/sport): poslední změna uvedena 31. 10. 2025 15:49, autor valenel1, časová zóna neuvedena; CC BY-SA 4.0. Nepřebírat historické COVID podmínky jako současné.

Vše kontrolováno 27. 10. 2026. Hash corpus textu označuje uloženou parafrázi, nikoli nepořízený hash upstream PDF/HTML. Datum kontroly není datum publikace. Starší support feed, starý předpis o členství 2022 a rozporuplný wiki cache snapshot nejsou seed. Nejisté ceny, vrácení příspěvku, sankce/výjimky a konkrétní nároky na služby odkazovat do aktuálního oficiálního zdroje. Žádné kontakty konkrétních studentů nebo soukromé záznamy.

## Bezpečnost, paměť a lifecycle

Exact Origin není autentizace: skript jej může podvrhnout. Admission omezuje i upload/moderaci, nové relace mají samostatné limity, globální počet skutečně zahájených generování má pevný strop jednoho běhu procesu. Není to persistentní denní finanční limit. Per-IP limity musí počítat se sdíleným kolejním NAT; X-Forwarded-For se bez spravované proxy nedůvěřuje.

Náhodné tokeny pouze v paměti klienta a v POST/Authorization, nikdy v URL/diagnostice. Server historie omezená, TTL a kapacita map; jeden inflight na relaci. Reset zruší starou generaci, timeout běží až do dočtení provider body; cleanup v finally a shutdown abort. Žádné automatické placené retry ani cache odpovědí mezi uživateli.

Corpus a uživatel jsou data, ne zdroj systémových instrukcí. Server sestaví URL citací pouze z ověřených vybraných IDs. Ani správné ID samo nedokazuje faktickou správnost: testovat dotazy mimo corpus, minimal relevance a explicitní nejistotu. Moderace při chybě nepovolí nezontrolovaný obsah. Plain text v Reactu bez HTML či modelových URL.

## Osobnost

Crazy Typka je přiznaná fiktivní AI průvodkyně; v herním příběhu 22letá vysokoškolačka ze Strahova. Přirozená čeština/angličtina, krátké praktické odpovědi a lehké situační škádlení. Pomoc před flirtováním. Nehraje skutečnou obyvatelku, neslibuje schůzky či výlučný vztah, netvrdí reálné osobní vzpomínky a není oficiální podporou SH. U neznámého věku především humor; u nezletilosti čistě přátelský tón. Například: „Internetová výprava po Strahově? Začneme u registrátora.“ Citované rady se drží podkladů, charakter netvoří nová fakta.

## Chybějící měření

Živá generace, latency/náklady modelu a adversarial eval nad skutečným endpointem zatím neproběhly. Vizuální a lifecycle přejímka nových komponent teprve následuje. Žádný výsledek průzkumu se nevydává za úspěšnou implementaci, výkon nebo konečné přijetí.

## Doplnění z reálné HTTP integrace: CORS

První izolovaný SDK běh doložil, že neznámá AI cesta vracela správné 404, ale stále nesla `Access-Control-Allow-Origin: *`. Přečtený instalovaný primární zdroj `@colyseus/core` 0.18.9, `build/router/index.mjs`, vysvětluje celý řetězec: bindRouterToTransport odstraní původní Express request listener, předřadí vlastní CORS wrapper a ukončí všechny OPTIONS ještě před Express middleware. Pouhé umístění AI handleru před aplikační CORS nestačí.

Porovnány tři varianty: odstranění zděděných hlaviček opraví skutečné odpovědi, ale nedosáhne na předčasně ukončený preflight; změna globálního matchmaking CORS by změnila i ostatní klienty; úzký HTTP dispatcher pro AI oddělí jen její namespace a zachová přesný původní dispatcher pro všechny ostatní routy. Zvolena poslední varianta přes veřejné Node HTTP listener API po inicializaci Colyseus; před změnou ověří právě jeden dispatcher. Nevkládá patch do závislostí a nemění WebSocket upgrade ani matchmaking. Samotná AI service navíc odstraní případné zděděné permissivní hlavičky při jiném vložení do serveru.

Nové regrese ověřují odmítnutý i povolený preflight před frameworkem, zachování původního handleru pro ne-AI cesty a odstranění zděděných hlaviček. Následující skutečný SDK běh musí potvrdit i původní multiplayerové scénáře. První neúspěšný integrační log zůstává zachovaný; nejde o tvrzení, že původní běh prošel.
