# Přejímka Ultra a samostatných grafických voleb

Stav: plán před prvním výkonovým během; žádné výsledky nejsou dosazené před měřením. Funkční a snímková přejímka jsou oddělené. Původní uživatelský záznam je v `user-playtest/` a neslouží jako srovnatelná kontrolní varianta nového buildu.

## Otázka a podmínky

- Problém: uživateli je pohled do celé scenérie výrazně méně plynulý než pohled dolů.
- Mechanismus/hypotéza: cena viditelné geometrie, stínových průchodů, vegetace a počtu pixelů; podíly jednotlivých nákladů zatím nejsou doložené.
- Zkoušená změna: jedna grafická volba proti stejnému Low, následně celý Ultra. Žádný další optimalizační kandidát, nový asset nebo změna fyziky.
- Metrika: medián a p95/p99/max úplných snímkových intervalů, dlouhé pauzy, draw calls, LOD, CPU fáze a dostupný hlavní GPU průchod. GPU vytížení a takty jsou doprovodné údaje, nikoli diagnóza.
- Správnost: jeden neměnný produkční build s manifestem zdrojů/testů/assetů/závislostí; Edge WebGPU, cíl 60 FPS, CSS 1280 × 720, stejné skutečné pozice/kamery, HUD, označené QA počasí a denní okamžik, dva skuteční SDK spoluhráči s různými avatary. Zaznamenat skutečný backbuffer, adaptér, ovladač, browser a systémovou telemetrii.
- Přijetí významného zrychlení: alespoň 20 % lepší medián snímkového času Ultra proti Low ve scenérii, bez opakovatelného zhoršení p99. Nesrovnatelné pozice, chybějící intervaly či nestabilní podmínky znamenají neprůkazný výkonový závěr. Celkový gameplay gate a všechny dlouhé pauzy zůstávají zachované.

## Varianty

| ID | Základ | Jediný rozdíl proti Low |
|---|---|---|
| A | Low | Referenční doporučené hodnoty, měřené skutečné rozlišení. |
| B | Vlastní, Low | Render 50 % šířky i výšky. |
| C | Vlastní, Low | Dynamické stíny vypnuté. |
| D | Vlastní, Low | Mraky vypnuté. |
| E | Vlastní, Low | Tráva, květiny a opadané listí vypnuté. |
| F | Vlastní, Low | Detailní stromy vypnuté, FAR kmeny a koruny zůstávají. |
| G | Vlastní, Low | Efekty obrazu zapnuté. Low je standardně vypíná, proto se zde měří cena jejich přidání. |
| H | Ultra | Souhrnné nastavení podle schváleného plánu; neslouží k připsání výsledku jediné příčině. |

Každá varianta má tři desetisekundové vzorky pro pohled dolů a tři pro scenérii: celkem 48 intervalů. Předem zvolené prokládání rozdělí práci do tří samostatných startů, každý po 16 intervalech (oba pohledy pro každou z osmi variant). Pořadí variant: první start A–B–C–D–E–F–G–H, druhý H–G–F–E–D–C–B–A, třetí A–H–D–E–B–F–C–G. V druhém startu obrátit i pořadí dvou pohledů. Mezi uloženými benchmarky respektovat limit collector 3/min; po Apply nejdříve dokončit přípravu a ustálit scénu.

V prvním startu navíc ověřit studený Ultra bez vypnutých prostředků, poté nastavit referenční Low. Přípravu a první použití vykazovat mimo výkonové intervaly. Po změně render scale zaznamenat LOD; změnu výsledku nepřipisovat automaticky pouze pixelům.

## Funkční kontrola a sběr

Před časovanou sérií autonomně připravit Edge a ověřit URL, identitu klienta, viditelnost/popředí, viewport a průchod diagnostiky až do uloženého souboru. Ovládat skutečné UI, kameru a pohyb; nevydávat přehrání či teleport za hraní. Během desetisekundových intervalů žádný DOM, screenshot, jiný build/test nebo vlastní 3D scéna.

Před přijetím ověřit čitelnost HUD a projekci popisků při 50 %, vstupy/kolize B6, A/D při chůzi a jízdě, první nástup do auta a noční svítilnu. Tyto kroky mají vlastní označení a časovou osu, nenahrazují stacionární A/B. Ověřit také ukládání/návrat nastavení a zrušení konceptu.

Uchovat úplné benchmarky, automatický raw log, systémové vzorky a cleanup/revalidation. Nespouštět neplánovaně totéž po selhání: nejdříve z uloženého logu určit rozlišovací otázku. Neúplná série se nepřepisuje a neoznačuje za úspěch. Při nemožnosti splnit podmínky uvést přesné chybějící měření místo odhadu přínosu.
