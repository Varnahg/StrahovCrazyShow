# Kurátorovaná znalostní sbírka z Discordu

Kanonický zdroj je [`knowledge.json`](../../../server/data/rag/community/knowledge.json). Obsahuje 144 samostatných odpovědí a krátkých návodů: 61 oficiálně doložených jednotek a 83 datovaných komunitních zkušeností. [Čitelná tematická sbírka](knowledge.md), [publikační manifest](../../../server/data/rag/community/manifest.json) a RAG bootstrap jsou odvozené výstupy; neupravují se ručně odděleně od kanonického zdroje.

## Obsah a původ

Parser bezpečně přečetl všech 180 HTML exportů, počty odpovídají exportéru. Zachoval 18 465 unikátních zpráv, vazby odpovědí a kontext vláken; citované náhledy nezapočítává znovu. Původní soubory zůstaly beze změny. Identita inventáře SHA256 je `c8afca9ef53c5d8cac6031fc926abcebfc73f59922c8fc1f9bf965df2f549e40`.

Každá zpráva má neveřejný záznam rozhodnutí:

| Zařazení zprávy | Počet |
|---|---:|
| Využita | 1 321 |
| Duplicitní | 400 |
| Systémová | 849 |
| Vyřazena | 12 331 |
| Nedostatečný kontext | 3 564 |
| Celkem | 18 465 |

Kurátoři prošli také obecné diskuse, aktivity, sociální kanály a oznámení. Chybějící vzdálené přílohy, 65 nepropojených odpovědí a nevyřešené otázky nepovažují za důkaz. Soukromé nabídky, nalezené věci, memy, okamžitá obsazenost a proběhlé jednorázové události nejsou znalostmi. Obsah chatů sloužil výhradně jako data, nikoli jako instrukce.

Původních 177 kandidátů vedlo ke 143 ponechaným jednotkám, 27 sloučením, 3 odmítnutím a 4 podržením. Druhá kontrola před embeddingy doplnila jednu novou oficiální odpověď z původně nedořešených otázek k rezervační jistotě; výsledkem je 144 jednotek. Každá přijatá jednotka má nezávislou kontrolu původní diskuse i podpory. Sloučení zachovávají blok, provozovatele, období a podmínky úspěchu; různé druhy podpory zůstávají oddělené.

Veřejná sbírka neobsahuje Discord identity, původní zprávy, soukromé kontakty, obývané pokoje, účty ani identifikátory zařízení. Veřejné týmové kontakty služeb jsou ověřené. Původní zprávy, podrobná lineage, posudky a audit jsou pouze lokálně v ignorovaném `.cache/discord-kb-20261103/`; nesmí být součástí veřejných odpovědí, image ani embeddingů.

## Důvěryhodnost a obnova

Komunitní zkušenost má skutečné období pozorování, omezení a samostatné datum kurátorské kontroly. Další kontrola je po 90 dnech, zde 1. 2. 2027. Nová kurátorská kontrola neposouvá datum zkušenosti. Oficiální jednotky respektují termín kontroly i účinnost každého podpůrného zdroje; nejbližší termín je 10. 11. 2026. Po termínu runtime podklad nepoužije, dokud neproběhne další skutečná kontrola.

Současně byly dvěma nezávislými průchody znovu ověřeny všechny relevantní expirované či zítra expirující podklady původní KB: 19 zdrojů / 28 úryvků. [Evidence obnovy](legacy-refresh.json) uvádí konkrétní zdroje a hashe. Texty všech původních úryvků, původní smlouva a cache vstupy zůstaly stejné. Ostatních 9 platných zdrojů a 56 úryvků smlouvy nebylo novelizováno pouze kvůli datu.

## Reprodukce a publikování

`scripts/discord-kb/compile.ts` vyžaduje kanonický JSON, soukromý review manifest, úplný audit ledger a parserové manifest/messages. Přijetí váže hashi na konkrétní obsah a všech 180 souborů / 18 465 zpráv. Změna obsahu nebo chybějící zařazení zneplatní potvrzení ještě před tokenizerem. Při obnově je nutné znovu potvrdit změněné jednotky a vytvořit nový prázdný výstupní adresář.

Použitý profil zůstává `text-embedding-3-large`, 3072 rozměrů, `title-heading-text-v2`. Otázka, jazykové varianty, odpověď a působnost tvoří jeden úryvek. Limit je 650 tokenů; tematický přehled se znovu neembeduje. Přesný manifest: 144 vstupů, 83 587 UTF-8 bajtů, 33 581 tokenů. Read-only import preview potvrdil 144 chybějících vstupů a 56 znovupoužitých původních dokumentových vstupů. Rozpočet skutečného importu byl přesně 144 / 83 587.

Izolovaný import vytvořil 144 embeddingů v 5 voláních; poskytovatel potvrdil 33 581 tokenů. Následný skutečný import stejné revize s rozpočtem 0 / 0 použil 200 uložených vstupů, bez jediného embeddingového volání. Obnova starších metadat použila dalších 45 původních vstupů, rovněž s nulovými novými voláními. Bootstrap revision 2 obsahuje 145 dokumentů / 200 úryvků a 245 schválených cache záznamů, včetně původních 101 beze změny. Historické revize databáze se nemažou.

## Měření

[72 testovacích dotazů](../../../server/data/rag/community/evaluation-questions.json) a [nezávisle připravený gold](../../../server/data/rag/community/evaluation-gold.json) byly uzamčeny před placenými embeddingy. Dotazy obsahují češtinu, slovenštinu, angličtinu, 52 zodpověditelných případů a 20 negativních či konfliktních případů.

Skutečný runtime retrieval (top 4, cosine cutoff 0,6) na výsledném stage snapshotu našel očekávanou jednotku u **49 / 52 = 94,23 %**, hranice 90 % splněna. [Úplný retrieval výsledek](retrieval-evaluation.json) zachovává přesné verze a všechny neúspěchy. Selhaly případy `positive-06`, `positive-25`, `positive-51`; očekávání ani cutoff se podle výsledku neměnily. Opakované měření po obnově legacy zdrojů využilo všech 72 query vektorů z cache a mělo stejný výsledek.

Baseline bez nových canonical ID není měřením nulové znalosti původního systému: starší úryvek s jiným ID může odpověď obsahovat. Proto se jeho nulová shoda s novými ID nevydává za prokázané procentuální zlepšení. Guardy nejsou ve jmenovateli a retrieval sám není ověřením bezpečnosti generované odpovědi.

Praktické generování, konečná neměnná release přejímka a nasazení se ještě ověřují. Tento průběžný záznam je neoznačuje za dokončené.
