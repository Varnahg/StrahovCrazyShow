# Skutečná evaluace OpenAI a pgvector

28. 10. 2026 nad kurátorovaným corpusem 45 úryvků, 28 aktuálních zdrojů a 7 archivních záznamů pouze s metadata. PostgreSQL 17.11, pgvector 0.8.7, přesné cosine SQL, samostatný reader účet. Žádná hra/GPU ani produkční host. Import a každý experiment měly explicitní horní rozpočet; veškeré přihlašovací údaje zůstaly mimo Git.

## Volba modelu a prahu

Před měřením zvolen small/1536 jako levný výchozí kandidát. Skutečné měření odkrylo chybějící podklad u českého dotazu na štěnice. Proto porovnány stejné vstupy s large/3072; žádný rewrite dotazů ani lexikální předvýběr kandidátů. Pro každý profil skutečně zaplaceno 45 dokumentových a 45 syntetických dotazových embeddingů, vždy dvě HTTP dávky. Import vykázal 6547 tokenů, query evaluace 825 tokenů na profil. Profil/cache obou variant zůstaly oddělené; druhé stejné importy měly nula API volání.

| Model / práh cosine distance | Zdrojové případy, alespoň jeden očekávaný úryvek v top4 | Další parafráze | Nesouvisející bez podkladů |
| --- | --- | --- | --- |
| small/1536, 0.60 | 32/33 | 4/6 | 6/6 |
| large/3072, 0.60 | 33/33 | 5/6 | 6/6 |
| large/3072, 0.68 | 33/33 | 6/6 | 4/6 |

Volba: **large/3072, práh0.60**. Bez prahu mělo large39/39 a small38/39. Práh je konzervativní aplikační rozhodnutí podle této malé sady, nikoli obecná garantovaná přesnost. Šest dodatečných parafrází nebylo použito při psaní zdrojových chunků, ale po výběru modelu/prahu již nejde o nezávislý finální holdout. Šest negativních případů nedokládá úplnou odolnost proti spamu; tu řeší i admission, moderace a rozpočty.

Známé omezení: anglické „Where can I develop my photographic film?“ správně řadí Fotokomoru jako první, ale se vzdáleností0.667 neprojde konzervativním prahem. Zvýšení na0.68 by současně přidalo podklady k dotazům na obchodování s bitcoinem a nákup GPU. Nebyla přidána výjimka podle konkrétní testové fráze. Případné další zlepšení má systematicky hodnotit bilingvní projektové parafráze na nové předem zmrazené sadě; není podmínkou tvrzení, že dnešní implementace skutečně používá OpenAI a SQL vektory.

Strojová evidence: [small](vector-evaluation-small.json), [large](vector-evaluation-large.json). Obsahuje výhradně syntetické testovací dotazy, IDs nalezených úryvků, vzdálenosti a místní časy SQL. Uživatelské dotazy a jejich embeddingy runtime neukládá. Místní časy tohoto průchodu nejsou zátěžový benchmark.

Po review odstraněno odvozování instituce/tématu z přirozeného dotazu, protože kombinované služby mohly ztratit část kandidátů. [Opakované SQL vyhledání bez těchto filtrů](vector-evaluation-unfiltered.json) nad stejnými zaplacenými vektory zachovalo39/39 předprahem,38/39 při0.60 a6/6 negativních bez evidence; toto opakování nevolalo OpenAI. Údaje usage v souboru patří původnímu získání vektorů a nejsou novou útratou.

## Skutečný import a HTTP odpovědi

Aktivní large revize `76922848bbaf791b366a87dc7b8985f5b995d9542b512948697b301edb3dbfdb`, profil `48298f1f727a87ab57999ec2584b79c4d7a3f8c39060cdb03f635d226ae5bcbc`. [Importní potvrzení](live-import.json) doložilo první import45/2calls a druhý import45reused/0calls. Administrativní import běžel omezeným ingester loginem; reader získal stejný publikovaný head.

[HTTP důkaz](live-api.json) použil skutečné produkční service/router/provider moduly na dočasném127.0.0.1:4268, large3072/0.60 a generativní `gpt-6-luna` s reasoning none. Jde o samostatný HTTP harness bez Game rendereru; není to vizuální přejímka UI.

- Registrace SH vrátila veřejný registrační postup a citaci FAQ.
- Hlášení štěnic vrátilo hospodáře/recepci a odborný zásah, s citací SÚZ FAQ.
- Obecná otázka o Peru neměla žádnou falešnou SH/SÚZ citaci; model odpověděl z obecných znalostí podle svého povoleného rozsahu.
- Všechny tři HTTP odpovědi200. Přesný replay měl stejné tělo a nezměněné počítadlo embeddingů/generací.
- Celkem3 query embedding pokusy/46 potvrzených tokenů a3 generace; další generace harness nepovoloval. Smazání relace204, server i pool ukončeny.

První spuštění harnessu skončilo ještě před vytvořením relace kvůli záměně jeho očekávání `available` versus skutečného status pole `enabled`; žádné placené volání. Opravena pouze testovací pomůcka. To nebyla chyba produkčního HTTP kontraktu.

Databázová regrese se syntetickým providerem zvlášť prošla11/11: exact cosine, metadata-only0, změněný vstup1, odstranění0, starý head při neúplném importu, persistentní cache, uncertain guard, souběh, profil/dimenze, archiv/future/expiry, abort a přerušení přesně vlastněného SQL spojení. Plná sada/build/SDK a CI jsou samostatný navazující důkaz.

Navazující review doplnilo skutečný mixed-authority/topic scénář předLIMIT; celý nový DB test prošel12/12,0skip. [Restart skutečného kontejneru](restart-proof.json) zachoval aktivnílarge revizi a opakovaný import opět použil45 existujících vstupů s0API voláními.
