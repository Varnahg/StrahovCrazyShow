# Posouzení dodatečného návrhu RAG

Uživatel 27. 10. 2026 předal návrh jiného agenta výslovně jako nezávazný nápad a dovolil zvolit jiné řešení. Nepřebíráme z něj automaticky nový hardware, všechny služby ani hodinový provoz. Stávající zadání úvodu, loaderu a Crazy Typky pokračuje.

## Přebírané doplnění před vydáním

1. **Navazující otázky.** Retrieval použije u úzké, celé navazující otázky téma poslední relevantní USER zprávy. Nebude přepisovat dotaz dalším modelem, přebírat fakta z odpovědi bota nebo přeskakovat novější nesouvisející téma. Jasně nová otázka stojí sama. Bez kotvy přijde přiznání mezery/upřesnění, nikoli náhodný dokument. Sportovní dotaz a jeho cena nesmějí být zaměněny za obecné členství.
2. **Idempotence doručení.** AI session ponese monotónní `requestSeq`. Opakování poslední stejné operace vrátí původní terminální odpověď/chybu bez dalšího API nebo historie; souběh vrátí busy, jiný obsah stejného čísla konflikt, staré/přeskočené číslo out-of-order. Přijatý pokus se eviduje před moderací a ukládá i terminální chybu. Klient u nejistého doručení nabídne explicitní obnovení stejné operace a neposune pořadí, dokud výsledek nepotvrdí. Žádná automatická placená retry smyčka.
3. **První čistý pozdrav.** Jen celá první zpráva nové prázdné relace, z malého přesného seznamu, dostane schválený místní text bez API. Pozdrav s otázkou, další zpráva nebo kontext po chybě/moderaci tuto zkratku nepoužije. Chat zůstává vypnutý bez serverové konfigurace. Privacy text bude přesně říkat, že zprávy a kontext může zpracovat OpenAI, protože další modelová otázka může zahrnout i předchozí místní pozdrav.

Idempotence je omezená na životnost dočasné AI relace. Uchovává se jen poslední výsledek; starší operace se bezpečně odmítnou, neplaceně znovu nevygenerují. Reset, expirace a shutdown mažou záznamy. Replay faktické odpovědi po ztrátě čerstvosti podkladů se odmítne bez nového generování. Ingress limity zůstávají i při replay.

Doplnění je součástí existujících disjunktních client/server tasků a jejich testů; nemění lidský chat ani společný svět. Samostatné podání a potvrzení zprávy umožní odlišit uživatelův nový dotaz od síťového opakování.

## Co nyní nepřidáváme

- **PostgreSQL/pgvector a embedding pipeline:** repo nemá takové úložiště a aktuální schválený corpus má 11 chunků ze 6 zdrojů. Předpoklad Raspberry Pi a 5 000 aktivních chunků nebyl potvrzen. Nová služba a migrace nejsou přiměřené pro již ověřený malý index. Při skutečném růstu nejdřív změřit recall/latenci a potřebu persistence.
- **Decisions na každé zprávě a automatická Terra eskalace:** nynější rozhodnutí zvládá lokální kód a pevný model. Další modelové volání přidává provozní závislost i zpracování dat. Silnější generátor nenahradí chybějící schválené zdroje. Eskalaci zavést teprve podle označených případů a rozpočtu.
- **Hodinový crawler:** veřejný host není pod správou uživatele; návrh sám není pověření zakládat opakované úlohy. Corpus obsahuje také autoritativní PDF, která HTML-only ingest neřeší. Automatické přijetí změn by obcházelo nynější kontrolu provenience a licence. První verze nadále používá kontrolovanou publikaci a vynucenou freshness hranici.
- **Cache odpovědí napříč uživateli:** není potřebná. Nová idempotence slouží pouze doručení konkrétní operace ve stejné relaci, nikoli odpovědi na jinou podobnou otázku.

## Zachované principy pro další rozšíření

Případný ingest má oddělit HTTP validátory, kanonický hash dokumentu a přesný embedding vstup/profil. Má obnovit jen změněné části, zachovat poslední platnou verzi při výpadku, publikovat revizi atomicky a obnovit rozpracované joby po restartu. Generativní model nesmí určovat embedding profil; metadata času stažení nepatří do embedding textu. Soukromé dokumenty se filtrují oprávněním před modelem, nikdy pouze promptem. Nové URL nesmí pocházet přímo z veřejného chatu.

Část těchto principů současná verze už plní: oddělená politika a veřejná znalostní data, hash přesného textu, omezený neměnný index, vynucená revize podkladů, ověřené source IDs, žádný runtime crawler, klíč jen na serveru, lokální admission a moderace oddělené od lidského chatu. Další infrastruktura musí navázat na skutečnou potřebu a samostatně ověřené API/hardware.

## Předání navazující implementace

Výchozí revize `17e811ed43480a67b4f2c90f5d667f116403a330`. Root ukončil vlastní preview i browserovou konverzaci, zdokumentoval původní handoffy a uvolnil client/server claims. Předává jejich aktuální čisté zdrojové soubory k navazující práci; vlastní docs/metadata nejsou dětským WIP. Root dál vlastní `client/ui.tsx`, `server/index.ts` a integrační skripty. Děti použijí vlastní původní disjunktní tasky a nové unikátní ownery. Testy mají fake provider; skutečný klíč ani soukromou konfiguraci nečtou. Původní logy se zachovají a nové dostanou odlišná jména.
