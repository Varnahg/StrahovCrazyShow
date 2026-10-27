# Předání prvního R5 rozdělení LOD

Root `trees-r5-stream-export-root-01a16b37`, D worktree, základ8516c7b1. Vstup `public/models/vegetation/seasonal-r5/runtime-contract.json` byl předán modelerem jako dokončený první whole-pilot checkpoint. Ověřený Node exporter vytvořil pouze nové `public/models/vegetation/seasonal-r5-streamed/`; R4 ani R5 vstupy nebyly přepsány.

Export skončil exit0 a porovnal všech54 skutečných accessor ranges bez změny bajtů. Output contract SHA `1fdd11357f01b9bbf5506ce1140a0faf9e6337eb6232e7a3e529195547032cf3`. Navazující produkční parse/decode prošel všemi šesti samostatnými GLB a12částmi; přesné výsledky v `.cache/trees-r5-stream-export-20261025/decoder-check.log`, původní export report v `export.log`.

Jde o zdrojová data, nikoli GPU/FPS přejímku. Žádný server, Blender ani vlastní běžící proces nezůstal. Heavy se po tomto předání uvolňuje pro pokračující modelářský bake; soubory mají doloženého původního vlastníka i po release a nejsou volné pro cizí editaci. Při další výrobní revizi bude potřeba nový konkrétní source/hash checkpoint a nové byte-identity ověření.

## Revize s plným MID

Po explicitním předání modelářovy nové whole revize root znovu získal tento claim. Původní whole split byl zachovaný v `first-whole-output/` v taskové cache. Nový export porovnal všech54 accessorů a následný produkční decoder prošel všemi12částmi. Oba parsed prototypy mají ověřený `lodProfile: full-coverage` (plná MID populace; nikoli tvrzení o LOD2). Výstupní contract SHA `9dc0b48ada20c9662e30628f985555d7ea30ce2bdd7113bb63f7019217551535`, součet source souborů72 785 460B a počáteční far4 255 752B. Některé stejné source atributy byly v monolitu sdílené; perLOD rozdělení tudíž může zvětšit součet všech souborů, přestože zásadně sníží první přenos. Nejde o tvrzení o VRAM.

Logy `export-full-mid.log` a `decoder-full-mid.log` zůstávají vedle první evidence. Root routing/LOD/projection regrese43/43PASS, finální typecheck předv4PASS. Export/decoder procesy skončily, heavy se opět uvolňuje před přidělením validation-window. Runtime vlastní source/test opravy mají nadále svůj streaming claim.
