# Předání: discord-kb-20261103-blocks

- Vlastník: `discord-kb-20261103-blocks-agent`; příjemce: `discord-kb-20261103-root`.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`; výchozí koordinace `d124d4a3`.
- Výsledek: ručně přečtené všechny zprávy ve 23 přidělených exportech (10 blokových kanálů a 13 exportů serveru B6), celkem **7 836 zpráv**. Připravený soukromý dataset pro druhé review a mezikanálovou deduplikaci; nejde o veřejnou ani ingestovanou KB.
- Zápisy: pouze `.cache/discord-kb-20261103/curation/blocks/` a toto předání. Žádný staging, commit, změna původních exportů ani cizího WIP.

## Předané artefakty

V `.cache/discord-kb-20261103/curation/blocks/`:

- `candidates.json`: dohodnutý kontrakt `version/partition/reviewedFiles/items/pending`.
- `review-state.json`: průběžná evidence úplně přečtených ordinal rozsahů, konkrétní výběry, vyvrácení a mezery. Indexy odpovídají pořadí exportů z manifestu po omezení na tuto partition; výsledný JSON už používá původní `messageId` a `fileName`.
- `build-partition.mjs`: offline deterministické sestavení z ručních výběrů. Nepoužívá keyword filtr k rozhodování, které kanály číst; pokrytí každého exportu musí být doložené kompletním ručním review.
- `verification.json`, `artifact-manifest.json`: výsledek reconciliation a SHA-256 interních artefaktů.

Kandidátní dataset má **51 položek** a **38 pending otázek**. Všechny přijaté kandidáty jsou **community-experience**, s datovanými `observedFrom/Until`, `factCheckedAt: null` a review do `2027-02-01`. Přístup na wiki B6 a blokových her vracel timeout nebo HTTP 200 s anti-bot výzvou; nešlo o přečtený primární obsah a není vykazován jako oficiální ověření. Root může při druhém review nahradit překryvy ověřenými položkami z poradny.

SHA-256 `candidates.json`: `e00803786e287451e3e5ec928d31677e1575fa5c15452a65f31c25640755b22a`.

## Obsahová rozhodnutí

- B9: novější tiskárna ve studovně mezi 4. a 5. patrem, tisk z počítače/USB a QR platba. Starý zánik Robocopy se nevydává za neexistenci této služby. Ceník, kopírování a čtvrtky nejsou bez dalšího ověření potvrzené. Samostatně je zachován přesně omezený úspěšný test tisku jedné stránky z PC po chybných znacích při tisku z USB; hypotézy o fontech nejsou diagnózou.
- B3: po revitalizaci používají oznámení roku 2026 společenskou místnost mezi 4. a 5. patrem; staré K1 nad vrátnicí není převzato jako dnešní lokalizace. Sušárna s nepasujícím klíčem zůstala nedořešená. Vysavač na vrátnici je naopak doložen novější odpovědí.
- B7/B3: přístup do posilovny není vždy pouhé čekání na synchronizaci. Jedna debata skončila doplněním chybějící služby registrátorem; navazující zdroje potvrzují nutnost správného nastavení přístupu. Současné členské podmínky mají být převzaty z oficiálního zdroje poradny.
- B5: poloha kufrárny byla opravena z nultého na minus první patro; pozdější harmonogram změnil i přihlašování. Zachován princip aktuální domluvy, nikoli staré termíny. B9 nepřislíbil automatickou úschovu ostatním blokům.
- B6: ticketing, role Local, sušárna, místnosti, dobrovolní správci, úspěšná pomoc vrátnice po upřesnění rozsahu elektrického výpadku. Dočasný USB hotspot a Wi-Fi pokrytí jsou datované zkušenosti, ne současná diagnóza sítě.
- Kniha závad/SÚZ a síť/Silicon Hill jsou rozlišené. Nezachovávají se neautorizované zásahy do elektroinstalace, topení ani domácí chemické postupy proti škůdcům.
- Staré blokové prádelny a jejich ceníky/rezervace jsou vyřazené vůči pozdějšímu centrálnímu provozu B4. Plošné tvrzení, že vlastní prací prostředek nelze použít, je v chatu později opravované a zachované pouze jako datovaná zkušenost s omezením.
- Kontakty a identity obyvatel, soukromé incidenty, údaje o konkrétních obývaných pokojích, bankovní a vyzvedávací údaje zůstávají mimo kandidátní odpovědi. Výpadky, akce, ceny, obsazenost a neověřené úřední termíny se nepřevádějí na dnešní stav.

## Ověření a hranice

- `node .cache/discord-kb-20261103/curation/blocks/build-partition.mjs`: exit 0, přesná coverage 7 836/7 836, 23/23 souborů, 0 chybějících a 0 duplicitních dispositions.
- Rozdělení: 691 `used`, 117 `system`, 6 448 `excluded`, 580 `insufficient-context`. Každé `used` má existující kandidátní ID. Referenční zprávy mohou obsahovat i původní chybnou odpověď a pozdější opravu; pouze doložený konečný závěr vstupuje do odpovědi.
- Nezávislá Node kontrola potvrdila vazbu každé disposition na přesný zdrojový soubor, jedinečnost 51 item IDs a existenci všech claim source IDs. Kontrola veřejných kandidátních polí neobsahuje raw Discord URLs, snowflakes ani osobní e-maily.
- `git check-ignore` potvrzuje, že surový audit zůstává neveřejný v cache. Vstupní inventář je stále `c8afca9ef53c5d8cac6031fc926abcebfc73f59922c8fc1f9bf965df2f549e40`.
- Dodatečná kontrola původního HTML odhalila 16 poll widgetů bez vlastního textového pole v původním parseru. Všech 14 patřících blocks bylo zvlášť přečteno včetně možností a výslovně vyřazeno jako dobové hlasování o filmu/termínu/nápoji/stěhování. Zbylé dvě ankety patří General; koordinátor byl informován. Navazující úzká oprava parseru doplní pole polls a novou extrakci bez změny source IDs.
- Žádné externí LLM volání nad raw chatem, embeddingy, DB import, build ani GPU. Jednorázové lokální procesy skončily.
- Rezervace se uvolňuje po tomto předání. Root provede nezávislé obsahové review, deduplikaci s poradnou/General/ostatními kanály a konečné rozhodnutí o publikaci; teprve on mění stav tasku a integruje dokumentaci.
