# Předání: discord-kb-20261103-general

- Vlastník: `discord-kb-20261103-general-agent`; příjemce: root koordinátor KEY-72.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`. Výhradně přidělená cache a tento handoff, bez commitů nebo změn surových vstupů.
- Výsledek: textově přečteno všech **5804 zpráv v 9 General exportech**, v pořadí a s reply referencemi; každý message ID má explicitní disposition. Finální interní výstup `.cache/discord-kb-20261103/curation/general/candidates.json`: **30 kandidátních jednotek**, 17 komunitních a 13 ověřených oficiálními zdroji; **69 nepublikovaných pending podnětů** pro spojení s jinými partitions či další ověření.
- Dílčí výsledky: 2947 excluded, 2249 insufficient-context, 159 used, 254 system, 195 duplicate. Součet5804; přesně9 souborů a žádný chybějící/duplicitní message ID.
- Soubory: uvedený `candidates.json`, `review-batches.json`, `validation.json`, pomocné `review-helper.mjs`, `show.mjs`, `validate.mjs` a tento handoff. Předávám rootovi jejich další vlastnictví.
- Cizí WIP: žádný převzatý; původní HTML, raw/corpus, root runtime i ostatní partitions beze změn.

## Průchod a rozhodnutí

Přečteny oznámení20, spolujízda35, stadion141, wall-of-shame266, akce382, serious-talk-en783, serious-talk2197, popelnice933 a pokec1047. Dlouhé dávky s oříznutým tool výstupem byly dočteny menšími rozsahy; nebyl nahrazen celý kanál keyword filtrem. Strukturální klasifikace prázdného textu a systémových událostí následovala až po přečtení všech vykreslených záznamů. Textová pole zpráv, embedů a forwardů byla prohlédnuta; samostatné obrázky bez čitelné textové evidence nejsou vymyšleně převyprávěny.

Parserautor zvlášť přečetl dva nezachycené poll widgety v serious-talk ordinal1217/2016 (Kofola/Coca-Cola; zájem o007). Oba jsou explicitně excluded. Nový `raw/corpus-v2` doplňuje widgety při zachování source inventory a message IDs; tento původní textový průchod není novým tvrzením o vizuálním zpracování všech příloh.

Zachyceny a nepřepsány například tyto rozpory/změny:

- Historické blokové prádelny a papírové rezervace z2024 byly překonány oznámenímSÚZ o centralizaciB4 a uzavření od1.5.2025. Původní B2 kandidát byl z výsledku odstraněn.
- Nesoulad popisků praček zříjna2025 byl následně6.11.2025 označen opravený. Není publikován jako trvalá vada.
- Původní odpověď o rezervaci komunitní kuchyně autor odvolal, protože ji zaměnil za běžnou kuchyňku.
- SHpinec měl ve starších pozvánkáchB3 a novějšíchB7. Aktuální místo není odhadnuto ze starého plakátu.
- Tvrzení, že ethernet automaticky znamená veřejnouIP, bylo zpochybněno konkrétní adresou zaNAT. Není převzato jako garance.
- TiskárnaB9 je opakovaná komunitní informace, ovšem existuje pozdější obecná protichůdná odpověď. Aktuální B9wiki tiskárnu výslovně nepotvrzuje. Položka je nadále jen omezená komunitní zkušenost, bez historických cen a24/7 garance; observedUntil se nevylepšuje pozdější samotnou otázkou.
- Historické40Kč revize, jistoty3500/3900, ceny prádelen, návštěv a provozní časy se nepřenášejí jako současný ceník.
- Hromadné protestní reakce, soukromé ztráty/nálezy, zdravotní příběhy, osobní pokojové adresy, registrační heslo, token v exportním odkazu kalendáře a jednotlivé dopravní/energetické výpadky nevstupují do veřejných textů.

## Ověření a omezení

Prakticky znovu načteny primární aktuální SH wiki projekty/3Dtisk/FAQ/B9 a SÚZ FAQ/VUP2026–2027. Oficiální odpovědi rozlišují klub a správu ubytování. Relevantní VUP výjimka u opakovaného stěhování byla doplněna, takže výsledek netvrdí absolutní zákaz druhé změny. Doložitelné komunitní zkušenosti nesou období a omezení; soukromý message-level původ zůstává jen v interní cache.

`node --import tsx .cache/discord-kb-20261103/curation/general/validate.mjs` exit0: všechny message IDs, file membership, claim references, typy disposition a veřejná textová kontrola se shodují. Public metadata kontrakt prošel u28 kandidátů; **2 zůstávají blokované aktuální citační politikou**: `general-sh-registration` a `general-sh-moving-block` používají veřejně ověřenou `https://wiki.sh.cvut.cz/faq`, kterou současná v3 policy na rozdíl od legacyv2 neobsahuje. Root byl upozorněn; tento task allowlist neměnil a nepřeznačil je na komunitní tvrzení. Je třeba buď přidat přesný veřejný FAQseed v autorizovaném scope a přegenerovat politiku, nebo obě položky dočasně nepublikovat.

- Source inventory SHA-256: `c8afca9ef53c5d8cac6031fc926abcebfc73f59922c8fc1f9bf965df2f549e40`.
- Final `candidates.json` SHA-256: `5900fb1409de2dee36a06950b8c41e7462a54914cb2aae5216c46719f2679007`.
- `validation.json` obsahuje počty, dvě policy blokace a přesné hashes.
- Neprováděl jsem embeddingy, tokenizaci publikovaných chunků, SQL import, změnu bezpečnostní politiky ani API odesílání chatů. Síťové čtení primárních zdrojů používalo jejich URL, nikoli soukromý text zpráv jako vyhledávací dotaz.

## Další přijetí

Root provede nezávislý druhý průchod30 kandidátů a deduplikaci proti současné KB a ostatním partitions. Pending není publikovatelná evidence ani schválený seznam odpovědí. Vybrané FAQ mohou být nahrazeny úplnějšími stejnotematickými jednotkami z fora, ale jejich raw dispositions a auditní reference se mají zachovat.

Vlastní pomocné procesy neběží; nebyl spuštěn server ani port/GPU. Rezervace se po předání uvolňuje. Uvolnění neznamená dokončení celého KEY-72 ani schválení veřejné publikace.
