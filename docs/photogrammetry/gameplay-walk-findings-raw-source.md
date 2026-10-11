# Fyzikální zjištění z původní fotogrammetrie

Platný detailní běh je **gameplay-walk-raw-source-20261010-b.json** a odpovídající Markdown. Běh `a` zachytil stejné skutečné fyzikální problémy, ale jeho původní mapování `Rapier featureId → sourceNode` bylo nesprávné a odstranilo se. Tento Rapier build pro různé ray hit body na obřím mesh vrací `featureId=0`. Běh `b` proto přiřazuje uzly přímým průsečíkem s původními nejpodrobnějšími IPR trojúhelníky v okolí kontaktního bodu. Chyba vzdálenosti průsečíku u uvedených překážek je řádově miliontiny metru.

Použitá kolize má **3 949 772 trojúhelníků**, gzip SHA-256 `d313d45b158fd67bb65bac3b12a4f63360646527de8386c52543544ab53cd434`. Jedna produkční `Simulation(photoCollision)` zůstala aktivní pro všech osm nezávislých tras; vznikla za 18,10 s. Zdrojové soubory během běhu zůstaly stejné. Žádný průchod nepoužil teleport, skok, změnu autostepu ani vložení náhradní plochy. Nejde o ověření GPU/FPS.

**Výsledek: 2/8 PASS, 6 FAIL.** Východní a západní přímý desetimetrový průchod ze spawnu mají fyzické opření po celý běh, bez propadu. Obě mapované trasy k 191 a trasa k východní veřejné straně R-ka se zastavují již u spawnu; zbývajících 500/640 m proto tento běh vůbec necertifikuje. Severní a jižní přímé desetimetrové sondy nejsou tvrzením, že daná úsečka je skutečný chodník. Jejich blokování může být správná kolize s reálnou překážkou.

## První překážka společná trasám 191 a R-ko

Postava se zastaví na **X 21,9309; Y −0,0507; Z −14,2409**. Kontaktní bod je **X 21,9139; Y −0,5360; Z −13,8397**, normála Y **0,2538**. Skutečný zdrojový uzel je **1127320**, původní trojúhelník **1056**, odvozený collision triangle **3007391**.

Jeho původní vrcholy v herních metrech:

```text
(22.061466, -0.102000, -13.719386)
(22.345335, -0.794000, -13.889009)
(21.514385, -0.798000, -13.925571)
```

Původní atlas `public/models/photogrammetry/ipr2023/1127320.jpg` jsem vizuálně prohlédl. Obsahuje sportovní povrch, oplocení, vegetaci a zaparkovaná auta. UV uvedeného trojúhelníku jsou přibližně `(0.7977,0.5677)`, `(0.8087,0.5642)`, `(0.8040,0.5937)`. **Samotná strmá normála není důkazem vadného skenu:** tato překážka může odpovídat plotu nebo zachycenému automobilu. Před opravou zdrojové geometrie je nutné porovnat konkrétní umístění s fotem a ortofotem. Pokud jde o reálný plot, oprava patří do skutečně průchozí pěší trasy vedle plotu; odstranění překážky by zhoršilo věrnost.

Jižní sonda se zastaví u **X 22,8123; Z −12,4992**. Její relevantní kontakty ve stejném uzlu odpovídají původním trojúhelníkům **544** a **997**, normály Y přibližně **0,34–0,35**. Severní sonda stojí u **X 22,1467; Z −23,7123** na svislém kontaktu uzlu **1127328**, původní trojúhelník **1643**; ani zde se automaticky nepředpokládá vadný podklad.

## Severní přístup B6

Postava se zastaví na **X −4,8500; Y 0,6218; Z −81,8314**. Skutečný kontakt je první nativní schod na **X −4,8501; Y 0,1500; Z −81,4010**, normála Y **0,2075**. Nejde o kontakt se source trimesh; jde o zachovaný herní model schodiště.

Chodidlo postavy je na skutečné přístupové výšce přibližně **−0,178 m**, první modelovaný schod má vršek **+0,150 m**. Skok výšky přibližně **0,328 m** překračuje produkční autostep **0,22 m**. Výřez původního skenu navíc začíná v Z −82,1, zatímco první schod až v Z −81,4, takže chybí navazující opěrný povrch před schodem.

Správná oprava je malá explicitní přístupová plocha se shodnou vykreslenou a fyzikální geometrií, která propojí skutečnou source výšku s patou existujícího schodiště. Výšku autostepu neměnit. Root po tomto běhu přidal návrh této plochy; **tento report novou opravu ještě neověřuje**. Ověření se musí zopakovat na novém zmrazeném collision packu, nikoli přenést výsledek původních DEM testů.

## Opakování po opravách

```powershell
pnpm exec tsx scripts/validate-photogrammetry-walks.ts --label clean-source-20261010-a
```

Opět zkontrolovat SHA source collision packu a stabilitu souborů. Každý FAIL zastavuje trasu na prvním fyzicky prokázaném problému; žádná zbývající část trasy se nesmí označit jako ověřená. Pokud se mění odvozené source pozice, diagnostický průsečík musí použít stejnou odvozenou transformaci a zachovat ID původního uzlu/trojúhelníku.
