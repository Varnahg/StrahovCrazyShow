# Vizuální směr před modelováním

Uživatel25.10 upřesnil: **realističnost stromů má přednost před dokonalou kopií fotografie**. Zachováváme doložené polohy a přibližné rozměry; struktura je věrohodná autorská interpretace, nikoli přesné zaměření větví či určení druhu.

Před výrobou vznikl vestavěným `image_gen` jediný nový koncept: `.cache/trees-20261025/concept-seasonal-v1.png`, SHA256 `9eebaeaa7ce0a67310691c5890fc061e2fdbcefb5e655965931d52d5adc40828`. Původní nástrojový výstup zůstal v Codex generated_images, pracovní kopie je naD. Přesný anglický výrobní prompt je `.cache/trees-20261025/concept-prompt.txt`. CLI/API fallback nebyl použit. Návrh není runtime textura ani screenshot hry a nezakládá nová místní měření.

Prompt vychází z prohlédnutých B6 fotografií popisem: přibližně12m asymetrický kuželovitý jehličnan s viditelným kmenem, nepravidelnými vodorovnými/převislými patry a mezerami; obecný evropský listnáč s čitelnou hierarchií. Fotografie nebyly upravovány ani jejich pixely použity v této nově generované tabuli. Koncept má dvě řady a čtyři stejné pohledy „JARO/LÉTO/PODZIM/ZIMA“, se záhlavím „KONCEPT STROMŮ – nikoli snímek hry“.

Vizuální přejímka návrhu: větve nesou listy, koruna má mezery a asymetrii, letní a zimní silueta si odpovídají. Listnáč postupně raší, vybarvuje se a odlistí; jehličnan si uchovává jehličí. Půdní opad je omezený a nepravidelný. Zimní obrázek je bez sněhu, aby šla posoudit kostra. Podzimní jehličnan v konceptu má poněkud silné zhnědnutí; produkční evergreen má zůstat převážně zelený a nebudeme tento odstín slepě kopírovat.

Při skutečném modelu kontrolovat kostru bez listů, napojení větévek, měřítko fotografického listu a kůry, čitelné mezery, lokální normály, kořen a kontinuitu LOD. Generovaný obrázek nedokládá počet trojúhelníků, paměť ani dosažitelný GPU výkon.
