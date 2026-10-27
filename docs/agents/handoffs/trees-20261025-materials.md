# Předání: trees-20261025-materials

- Vlastník `trees-materials-01a16b37`; příjemci koordinátor `/root` a modelář `cad_b1_geometry_research`.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/trees-realism-20261025`, baseline `8516c7b1877ec66c37120d9088264d44c52882f1`.
- Vlastní claim před prvním zápisem, bez `--adopt-dirty`. Nové soubory tohoto tasku byly na začátku nepřítomné. Root bootstrap/spec/task katalog a souběžný pilot/phenology/runtime WIP nebyly upravovány. Žádný další BMAD, podagent, staging ani commit.
- Výsledek: osm originálních CC0 2K map, ověřená provenience/hlavičky/hash, přesná analýza alfa a explicitní použitelné části s kotevními body. CPU přejímka hotová; skutečné materiály/koruny/GPU/sezóny integruje a ověřuje root.

## Změněné soubory

- `scripts/import-tree-materials.mjs`: explicitní import/verify, omezený download, původní metadata/licence, ZIP CRC/členy, MD5/SHA/rozměry, ochrana původních souborů proti přepsání jinými bajty.
- `scripts/tree-leaf-components.py`: pouze čtení alfa a zápis JSON; scanline 8-connected komponenty, přesný a konzervativní nejvýše 12vrcholový obal, coverage, převod image-top-left → Blender UV, originální spodní petiole/twig kotvy a výslovný whitelist Fir částí.
- `shared/data/assets/tree-materials-manifest.json`, `shared/data/tree-leaf-components.json`.
- `tests/tree-materials.test.ts`: nezávislý Node PNG decoder včetně 16bit RGB, flood-fill místo scanline algoritmu, kontrola původních bajtů, skutečných obalů/units/UV/kotev a ZIP chyb.
- `docs/trees/20261025/materials.md` a tento handoff.
- `assets/sources/trees/20261025/LeafSet024/`: `LeafSet024_2K-JPG_Color.jpg`, `LeafSet024_2K-JPG_NormalGL.jpg`, `LeafSet024_2K-JPG_Roughness.jpg`, `LeafSet024_2K-PNG_Opacity.png`, `metadata-v3.json`, `license.html`.
- `assets/sources/trees/20261025/fir_tree_01/`: `fir_tree_01_twig_diff_2k.jpg`, `fir_tree_01_twig_nor_gl_2k.jpg`, `fir_tree_01_twig_rough_2k.jpg`, `fir_tree_01_twig_alpha_2k.png`, `provider-info.json`, `provider-files.json`, `license.html`.
- Byteově totožné čtyři mapy každé rodiny v `public/textures/trees/20261025/LeafSet024/` a `public/textures/trees/20261025/fir_tree_01/`.
- Pouze vlastní cache `.cache/trees-materials-20261025/`: původní dva ZIPy, logy a finální checkpoint. ZIPy nejsou pro staging/Git.

## Podklady, volba a převod

Podrobné primární odkazy, varianty a kontrakt jsou v `docs/trees/20261025/materials.md`. LeafSet024 má aktuální v3 `surface-photogrammetry` a kompletní atlas 40×40 cm; dřívější LeafSet001/019 byly aproximace. Fir používá původní fotografické twig mapy Roba Tuytela/modeláře Rica Cillierse. Přesná akviziční metoda ani fyzický rozměr větvičky se nedomýšlejí. Celé modely, 8K mapy, uživatelské fotografie ani CAD se nestahovaly/kopírovaly. Není potřeba LeafSet027 pro tento zelený pilot, proto nebyl přidán.

Původní PNG opacity je preferovaná před JPEG maskou: zachová hranice alpha-testu bez nové JPEG komprese. Import nepřevzorkovává ani nepřebarvuje žádný kanál. LeafSet024 má 9 045 736 B runtime map, Fir 4 698 932 B; osm map dohromady 13 744 668 B. Všechny mají skutečně 2048×2048 pixelů. Nejde o naměřenou VRAM/FPS.

LeafSet024: 9 listů, jejich velikost z atlasu přibližně 8,81–9,75 ×12,32–12,89 cm. Fir: 15 větších diagnostických komponent, **jen 7 povolených `parts`**, bez bark stripu a izolovaných fragmentů. `components` není seznam pro náhodný scatter. Oba originální barevné atlasy byly vizuálně prohlédnuté; u vybraných částí je spodní petiole/base a horní tip explicitní výtvarnou interpretací. Kotvy jsou skutečné nadprahové pixely, nikoli centroid koruny. Fir délka 0,22–0,35 m, pokud ji modelář použije, zůstane jeho vlastní přiznaný herní odhad.

Body obalu jsou pixelové hrany, UV `u=x/W`, `v=1-y/H`, výstupní Blender hull je CCW. Převod exporteru nesmí přidat druhé otočení V. Runtime alpha musí číst grayscale opacity mapy, ne její PNG alpha kanál. Zdrojová Fir maska má RGB16; počty a průhlednost byly nezávisle ověřeny bez oříznutí na 8bit černou/bílou.

## Neměnné vstupy předané přímo modeláři

| Soubor | SHA-256 |
|---|---|
| `shared/data/assets/tree-materials-manifest.json` | `3bd65af8559f874ca41ecb62b6bf8556417922dcdac5abfb0f83884c9fbdca60` |
| `shared/data/tree-leaf-components.json` | `022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3` |

Modelář a root dostali přímo zprávu s oběma SHA, osmi cestami přes manifest, konvencí UV a kotvami. Od té chvíle se oba JSON ani mapy nemění bez domluvy. Modelář kopíruje přesný seznam do své rezervované cache, ověřuje hash a může pracovat nezávisle na zdejších logách/dokumentaci.

## Refaktoring a lifecycle

Import používá společné `preserve`, `metadata`, `publishMap` a `verifyTreeMaterials`; čte jen přesně pojmenované ZIP členy bez rozbalování cizích cest. Původní archivový SHA z manifestu při opakovaném získání hlídá drift. Mapy a metadata mají jediného zapisujícího vlastníka. Python analýza ukládá krátké řádkové běhy místo objektu pro každý pixel, paměť je dočasná pro jeden atlas. Konzervativní zjednodušení je průnik podpůrných polorovin, nikoli odmazávání vrcholů, které by mohlo řezat list. Reprodukce `--check` nezapisuje. Žádná per-frame cache, runtime shader nebo nový lifecycle ve hře není přidaný.

## Ověření

Použitá aktivace `.cache/trees-20261025/activate.ps1`; žádná instalace či zápis přes `node_modules`. Existující bundled Python: `C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`, Pillow12.3.0, NumPy2.3.5; `PYTHONDONTWRITEBYTECODE=1`. Embedded Blender Python Pillow nemá a nebyl měněn. Žádný Blender proces se nespustil.

Finální příkazy, všechny exit0:

```text
node scripts/import-tree-materials.mjs --verify
python scripts/tree-leaf-components.py --check
node node_modules/tsx/dist/cli.mjs --test tests/tree-materials.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node tests/tree-materials.test.ts
node --check scripts/import-tree-materials.mjs
```

- **4/4 PASS, 1257,4353 ms**, `.cache/trees-materials-20261025/targeted-final.log`.
- **Strict targeted TypeScript PASS**, `.cache/trees-materials-20261025/typecheck-final.log`.
- **Původní byte/hash/header verify PASS**, `verify-final.log`.
- **Deterministická čerstvá analýza shodná s vydaným JSON**, `components-check.log`, SHA `022533e3…`. Zdrojové počty 1 743 195/988 832 pixelů, 9/15 větších komponent, 9/7 použitelných částí.
- Nezávislý PNG reader kontroluje CRC, všechny RGB16 kanály a práh32768. Flood-fill znovu odvodí skutečné komponenty; každá krajní pixelová hrana leží v obalu. Kontroluje units/UV a kotvy v původním alfa kanálu. Obaly neobsahují cizí velké části (navíc jen 0–158 drobných původních pixelů).
- První chráněná Python analýza odmítla RGB16 opacity; původní `components.log` je zachovaný. Následná přesná prahová větev je doložená nezávislým dekodérem, nikoli zamlčenou konverzí souboru. Původní mapy zůstaly stejné.

Finální inventář všech vlastních zdrojů, map, testů a handoffu s bajty/SHA je `.cache/trees-materials-20261025/checkpoint.json`. Manifest zaznamenává i logy; dirty stav není identita výsledku.

## Procesy, rezervace a další krok

Vlastní importní proces a všechny krátké CPU procesy skončily s uvedeným výsledkem. Žádný server, port, browser, GPU, Blender, build či celá sada neběžely. Hrané4179/2592 nebyly dotčené. Po vytvoření checkpointu a oznámení příjemcům se uvolňuje vlastní claim; release není přijetí do main.

Koordinátor přebírá přesný checkpoint pro review/commit a aktualizuje task/Linear. Skutečný PBR round-trip, vzhled větvení/korun/sezón/alpha hran a GPU výkon patří modelářovu pilotu a rootově celkové přejímce. Toto předání je nevydává za dokončené.
