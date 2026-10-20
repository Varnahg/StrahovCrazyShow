# Praktický pilot: hvězdná lucerna

**Provedeno 21. 10. 2026, Europe/Prague.** Původní objekt vznikl z textového zadání, parametrů a uloženého skriptu v Blenderu **5.2.2 LTS**, build `d13f752e3b9c`. Bez importovaných modelů, referenčního IP, instalačních zásahů, placených služeb či síťového generování. Je to praktický důkaz jedné procedurální pevné/kloubové rekvizity; není to srovnání kvality 3D generátorů.

## Výsledek a soubory

- [closed.png](closed.png), [open.png](open.png): oba skutečné CPU rendery 900 × 900, 32 samples, čtyři vlákna; vizuálně prohlédnuté přes `view_image`. Uzavřený modroměděný kokon se otevírá do šestilistého květu kolem teplého jádra. Světla a podstavec slouží náhledu a nejsou exportovanou součástí assetu.
- [star-lantern-source.blend](star-lantern-source.blend): autorovací checkpoint před exportem, šest pojmenovaných pantů, oddělené panely, materiály a sedm původních Actions / **2 904 nativních klíčů**. Soubor byl skutečně znovu otevřen a klíče porovnány.
- [star-lantern.glb](star-lantern.glb): **1 097 032 bajtů**, jediný klip `Scene`, přesně **4,000 s**, 30 FPS, pohyb kořene a šesti pantů. Standardní glTF Y-up export, `SCENE`, bez rozdělení po objektech. Parametry ověřeny proti RNA skutečně nainstalovaného exportéru.
- [star-lantern-roundtrip.blend](star-lantern-roundtrip.blend): GLB skutečně importovaný do nové prázdné scény. Import vytvořil jeden slotted Action se sedmi channelbags.
- [star-lantern-revised.blend](star-lantern-revised.blend): samostatná textová revize, první panel se otevírá o **12 % více**. Původní Action je zachovaný; původní zdrojový `.blend` se nezměnil.
- [prompt.md](prompt.md), [parameters.json](parameters.json), [create_lantern.py](create_lantern.py): skutečný textový a kódový vstup; nejde o Meshy ani trénovaný motion model.

## Provedené kontroly

[receipt.json](receipt.json) obsahuje úspěšné kontrolní body, přesnou verzi, statistiky a SHA256 souborů vytvořených hlavním během. [roundtrip-pose-errors.json](roundtrip-pose-errors.json) obsahuje 63 numerických porovnání světových matic (sedm animovaných uzlů × devět časů). Maximum je **4,172325 × 10⁻⁷** při toleranci `5 × 10⁻⁵`. Rozdíl konců smyčky je **4,408728 × 10⁻¹⁷**, tedy v přesnosti výpočtu. Časová nula GLB se po importu stala Blender framem 0; zdroj začíná framem 1.

Dodatečný čtecí běh [verify_saved_files.py](verify_saved_files.py) znovu otevřel oba uložené autorovací soubory. [saved-files-verification.json](saved-files-verification.json) dokládá shodu streamů všech **59 meshů** (pozice, polygonové rozsahy a materiálové indexy, smooth flags, loop indexy, UV a názvy materiálových slotů), všech **sedmi původních Actions**, existenci nové osmé Action a uložené nastavení **Cycles CPU / 4 threads**. Nejde o porovnání celých `.blend` souborů, které se kvůli nové Action přirozeně liší.

[glb-structure-audit.json](glb-structure-audit.json): 66 uzlů, 59 meshů, 65 primitives, 3 materiály, 0 textur, 27 875 exportovaných POSITION prvků a **47 472 trojúhelníků**. Použitá extension `KHR_materials_emissive_strength`. To je referenční detailní rekvizita, nikoli přijatý herní budget: sloučení dílů, LOD, kolize a náklady mnoha instancí zůstávají samostatnou prací.

## Reprodukce a lifecycle

Použitý executable: `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`. Každý běh měl `--background --factory-startup --disable-autoexec --threads 4 --python-exit-code 1`. Vlastní config, datafiles, scripts, temp a pycache byly přesměrovány pod `.cache/ai3d-pilot-20261021/` v pracovní kopii. Žádná cizí instance Blenderu nebyla ukončena. Před spuštěním i po skončení nebyl nalezen jiný běžící `blender.exe`; vlastní hlavní PID byl 53232 a skončil normálně.

V pořadí byly spuštěny `inspect_runtime.py` → `create_lantern.py` → `verify_saved_files.py`, vždy s absolutním adresářem tohoto pilotu po oddělovači `--`. [runtime-rna.json](runtime-rna.json), [export-preset.json](export-preset.json) a logy zachycují konkrétní verzi a volby. Pro opakování je nutné stejně nastavit vlastní pracovní cesty a rezervovat `heavy-validation`/`gpu`; uvedený příkaz není pokyn spouštět jej souběžně.

Hlavní úspěšný běh trval **69,17 s** včetně dvou CPU renderů; není to benchmark. První pokus selhal na chybějícím World v nové prázdné scéně. Oprava explicitně vytvořila World, druhý pokus prošel. Původní [pilot-attempt-1.log](pilot-attempt-1.log) a [receipt-attempt-1.json](receipt-attempt-1.json) zůstávají zachované. Úspěšný log je [pilot-attempt-2.log](pilot-attempt-2.log); samostatné ověření [verify-saved-files.log](verify-saved-files.log).

Skript sdílí malé helpery pro konstrukci dílů, materiály, stage, nativní Action data, ukládání evidence a kontrolu GLB. Save/export/render/reopen/revision/blank-import jsou oddělené kroky s explicitním vlastnictvím scény; žádné handlery, timery ani síťové procesy nezůstávají běžet.

## Meze důkazu

Prošlo skutečné vytvoření, autorovací reopen, textová revize a Blender GLB roundtrip. Nebyl spuštěn nezávislý Khronos Validator, cílový herní engine, FPS měření ani vizuální přehrání celého videa; vizuálně byly ověřeny dva statické stavy, pohyb numericky v devíti časech. Nebyly zkoušeny organic rig/skin/shape keys, FBX či obecné Geometry Nodes simulace. Zdejší emise a PBR se musí znovu přijmout v cílovém enginu. Žádná produkční součást hry nebyla změněna.
