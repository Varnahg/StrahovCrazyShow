# Zdrojové a veřejné manifesty assetů

Vite sestavuje modulový graf ze zdrojových souborů. Manifesty importované TypeScriptem proto mají zdrojovou kopii v `shared/data/assets/`; veřejné modely, textury a jejich původní metadata zůstávají dostupné jako URL v `public/`. Runtime přepojení importů a první byte-identické kopie provedl root.

Tento zásah upravil pouze čtyři generátory, nový regresní test a tento audit. Nespustil generování Blender modelů, render, export GLB ani stahování textur. Skutečné manifesty a jejich `importedAt` hodnoty se nezměnily.

## Generování

Po finálním veřejném `manifest.json` nyní každý generátor vytvoří `shared/data/assets` a zapíše příslušný soubor pomocí `write_bytes(public_manifest.read_bytes())`. Kopírují se stejné bajty včetně UTF-8, pořadí vlastností a koncového newline; JSON se podruhé neserializuje.

| Generátor | Zdrojový manifest |
|---|---|
| `scripts/create-environment.py` | `environment-manifest.json` |
| `scripts/create-b6-reality.py` | `b6-manifest.json` |
| `scripts/fetch-surface-pack.py` | `surfaces-manifest.json` |
| `scripts/create-bus.py` | `transit-manifest.json` |

Autobus zapisuje veřejný audit dvakrát. Zdrojová kopie vzniká až po **druhém finálním zápisu**, tedy po dokončení LOD, s `lowModel`, `lowTriangles`, `lowMeshCount` a všemi čtyřmi `wheelCentres`. První průběžný audit se do importovaných zdrojů nekopíruje.

## Ověření bez regenerace assetů

AST všech čtyř Python souborů se úspěšně parsovalo. Jejich skutečné finální write bloky se izolovaně provedly v dočasných ověřených podadresářích `.cache`, pouze s existujícím auditním JSON payloadem a `pathlib`/`json`. Ve všech čtyřech případech vytvořily dosud neexistující source adresář a bajtově shodnou veřejnou/zdrojovou dvojici. Kontrolní SHA-256 všech osmi skutečných manifestů před a po izolovaném ověření zůstaly shodné.

| Dvojice | Bajty | SHA-256 obou skutečných kopií |
|---|---:|---|
| Environment | 14 874 | `c1e8ce89a4d42fde0fcf1996d475b535e859ad06b3fbba824b1fd7a3b0f62af7` |
| B6 | 6 676 | `a9ffd0fd0550a1e8649a2582e3c0b0e259ae662129180fe47f14f0bb74b30d72` |
| Surfaces | 10 986 | `c3cf978e1db6e20f21946a8cb3e0d5716dbc730f671b09151f27ad373013d474` |
| Transit | 1 699 | `3ca361a92c68ad989535a5d00cd7c4e9a11b4c37c2b7913f8eca23aba67cb8a5` |

Nový `tests/asset-manifest-source.test.ts` ověřuje čtyři byte/schema dvojice, jedinečnost ID, strukturu kolizních boxů, existenci a byteLength publikovaných souborů, fyzikální měřítka PBR, kompletní kanály a dokončený autobusový LOD i kola.

Další kontrola používá skutečný TypeScript AST nad runtime JS/TS soubory `client/`, `shared/` a `server/`. Odmítá modulové hrany import/export, dynamic import, require a import.meta.glob do kořenového `public`. Negativní fixture zachytí všechny tyto formy; pozitivní fixture dovoluje `fetch('/models/...')`, texturové URL i běžné `readFile(new URL('../public' + audit.url, import.meta.url))`. Tím se neblokuje správné načítání veřejných assetů nebo serverové čtení PCM.

## Aktuální výsledek

Samostatný strict TypeScript check nového testu prošel. Finální cílený `pnpm exec tsx --test tests/asset-manifest-source.test.ts` hlásí **6 PASS / 0 FAIL, exit 0**. Čtyři byte/schema dvojice, skutečný runtime graf i negativní/pozitivní fixture AST guardu prošly.

Předchozí běh správně odhalil pátý problematický runtime import v `client/campus-exterior.ts:14`. Root jej přepojil z `../public/textures/surfaces/manifest.json` na `../shared/data/assets/surfaces-manifest.json`; tento runtime soubor nebyl změněn tímto subagentem. Následný výše uvedený průchod už prověřil opravený skutečný graf, nikoli výjimku či přeskočení selhání.

Praktický start aplikace a GPU diagnostiku nadále provádí root; tento audit neuvádí výsledek browserového startu, FPS ani celého build/test běhu. Během tohoto úkolu nevznikl žádný další server a hlavní server nebyl restartován tímto subagentem.
