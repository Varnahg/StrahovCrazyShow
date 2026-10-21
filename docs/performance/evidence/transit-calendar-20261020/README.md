# KEY-53: úklid poolu dopravních NPC

[Výsledkový report](measurement/RESULTS.md) dokládá úzké odstranění redundantní práce: původní profilovaná rutina měla průměrně 0,029655 ms na update, ve stabilní kandidátní kohortě se už nevolá. **Zvýšení FPS se neprokázalo:** 26,530877→26,269343. Souhrnný pokles celé update rutiny o 7,016 % nebyl konzistentní ve všech párech, proto není vydáván za robustní celkové zrychlení.

Skutečný run `key-53-776f5f92725b` prošel čistým startem, projektovým BMAD, implementací, třemi nezávislými review, 27 cílenými testy a [PR #22](https://github.com/Varnahg/StrahovCrazyShow/pull/22). Bez měřicího receiptu se správně zastavil před přijetím; po jeho vydání pokračoval stejným `resume` bez další implementace nebo PR.

Merge `e9bc2f54289e9f444f91f4c82b9e3abe3c9c16d3` má zelené skutečné [main CI](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577977) i [source hygiene](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/39519577922). Řadič skončil `complete`. Opakované dokončené `run` a `resume` vrátily stejný výsledek a nezměnily bajty checkpointu; viz [controller proof](measurement/controller-proof.json).

Kampaň obsahuje šest samostatných startů A1/B1/A2/B2/A3/B3 a 36 intervalů celé produkční hry se třemi skutečnými relacemi, 12 NPC a HUD. [Baseline](measurement/baseline.json.gz), [kandidát](measurement/candidate.json.gz) a [porovnání](measurement/comparison.json) zachovávají úplná raw data, všechny manifesty, inventář i variabilitu. Všech 8 kontrol parity/zdraví/metody prošlo, 0 neúspěšných měřených pokusů.

[Průzkum](research/selection.md), [volba varianty](research/decision.md), [metoda](measurement/README.md) a [přesný receipt](measurement/external-acceptance.json) vysvětlují scope. Podpůrný KEY-54 byl předem přijat přes [PR #20](https://github.com/Varnahg/StrahovCrazyShow/pull/20). Parent KEY-5 zůstává otevřený.

Pracovní název adresáře pochází z původně zvažované kalendářní cache. Staré preflighty včetně předběžné kopie s 10 LFS pointery nebyly použity jako finální baseline a zůstaly zachované. Přijaté A/B se liší pouze rendererem a jeho novým regresním testem. Omezení GPU, profilu, kvantizace, chybějící verze browseru a systémové telemetrie jsou výslovně uvedena v reportu.
