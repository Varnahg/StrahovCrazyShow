# Průzkum importu SH a SÚZ · KEY-65

Uživatel 28. 10. 2026 výslovně zadal skutečný import ověřených SH/SÚZ zdrojů z připraveného katalogu, s oddělením archivu. Základ je přijatý main `de6f87a2efbf8596bb03efae863e8d6763e22774`; původní katalog má 114 URL a sám není důkaz jejich současné platnosti. Nová větev `codex/rag-sources-sh-suz`, samostatné disjunktní rezervace. Linear KEY-65; nástroj shared agent context vrátil serverové Tool not found, použity vlastní předchozí evidence a aktuální kód.

## Mechanismus a varianty

Dosavadní corpus má 11 chunků ze šesti SH zdrojů, jeden globální checkedAt/reviewAfter, jen šest tematických kategorií a allowlist tří SH hostů. Prompt žádá fakta jen o SH. Pouhé přidání SÚZ textů proto nestačí: citace by byly odmítnuté a obecná slova platba/registrace/kancelář by směšovala instituce. Cena navázaná na obecné projects by také mohla změnit konkrétní službu.

| Varianta | Výhody | Náklady a rizika | Volba |
| --- | --- | --- | --- |
| Přisypat vše do jednoho JSON | Málo souborů | Globální expirace, směšování autorit, obtížné vlastnictví/archiv | Zamítnuto |
| Validované current datasety a interní registr | Přesná provenance, expirace každého zdroje, oddělené autorské scopes | Úprava celého evidence/citation/replay řetězce | Zvoleno |
| Embeddings/vector DB nebo hosted file search | Potenciálně lepší recall velkého corpus | Nové úložiště, placený ingest, cache/migrace; neřeší správnost zdroje | Odloženo do doložené potřeby |
| Runtime crawler | Průběžné změny | Nové síťové/aktualizační chyby a přijetí nedůvěryhodného obsahu | Není součástí zadání této vlny |

Zůstanou tři explicitní aktuální vstupy: původní základ se stejnými IDs, nové SH podklady a SÚZ. Dva archivní soubory se do runtime vůbec nenačtou. Oproti přesunu celého základního corpus se tak zachová review původních faktů a disjunktní vlastnictví. Registry se sestaví jednou při zapnutí AI, data/časové hranice jsou neměnné; žádné čtení disku nebo síť při každé zprávě. Chybná data se musí zachytit uvnitř ochrany volitelné AI služby. Vzhled a multiplayer se nemění.

Kontrolní den a termín nové kontroly jsou administrativní UTC. Právní účinnost má vlastní doložený ISO okamžik s offsetem půlnoci Europe/Prague. Nesměšovat ji s datem stažení či schválení. Archiv je mimo aktivní index; u aktivního dokumentu s minulým registračním obdobím se tento interval nevydává za dnes otevřenou registraci.

Při replay je nutné ověřit všechny podklady předané modelu, nikoli pouze vrácené citace: model může legitimně vrátit prázdné sourceIds. Interní dependency IDs jsou malé a zůstávají jen ve stejné dočasné session. Ostatní admission, moderace, requestSeq a cleanup zůstanou zachované.

## Primární zjištění před implementací

Čtecí průzkum provedli nezávisle SH a SÚZ pracovníci. Jejich následná evidence bude v sh/ a suz/ s přesnými locators a eval dotazy.

- SH wiki FAQ má starší formulaci vzniku členství; použijí se jen stabilní přípravné kroky a stěhování, nikoli definice nebo ceny odporující stanovám. WiFi stránka má rozporné CA návody; nevydávat doporučení vypnout ověření certifikátu.
- 3D tisk má rozdílné jméno správce oproti novějšímu registru: používat pouze týmový kontakt. SHerna má rozporný footer a postup vstupu; importovat konzervativně potvrzení rezervace, VR školení a chování, ne tvrzení o okamžité dostupnosti. Fotoateliér a Modelland patří do archivu.
- SÚZ aktuální rozcestník odkazuje dokumenty 2026/2027 a ceníky od září 2026. Scénář výslovně stanoví účinnost 4. 5. 2026. VUP vlastní datum neuvádí, vazba na přílohu se označí, datum se nevymýšlí.
- SÚZ FAQ se v následcích pozdní výpovědi liší od aktuálních VUP; pro smluvní podmínky přednost VUP/PPUK. Ceník má jednotku Kč/lůžko/den včetně DPH; bez spolehlivého přiřazení tabulkových řádků se sazby nepřevezmou. Starý dokumentový rozcestník 2022/2023 a skončená rezervační etapa se oddělí.

Dosud nejde o výsledek importu ani živé modelové ověření. Na začátku byla jen čtecí kontrola browserových karet; původní karta 4182 už nebyla otevřená. Žádná karta/scéna se kvůli této kontrole nespustila ani nezměnila. Soukromý OpenAI klíč zůstává mimo Git, žádný pracovník jej nepotřebuje.
