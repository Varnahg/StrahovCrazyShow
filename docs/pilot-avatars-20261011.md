# Studentské postavy v pilotu — 11. 10. 2026

Produkční `createAvatarRig` nyní vytváří anatomicky fitované oči ve hře, editoru i simulovaných NPC. Dřívějších šest plochých vrstev oka/duhovky/zornice vznikalo na dně konkávního socketu, přibližně 21 mm za správným apexem, a při otočení je překrývala tvář. Medium LOD oči úplně odstraňoval. Nový společný povrch obou očí nahrazuje staré vrstvy přímo ve factory; nejde o další izolovaný náhled.

## Primární podklady a původ

Před integrací byly znovu přečteny studie `docs/characters/student-avatar-study`, `hair-realism-study` a `student-garments`. Dne 11. 10. 2026 byly ověřeny [oficiální MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) a [licenční informace vydavatele](https://static.makehumancommunity.org/about/license.html). High-poly, low-poly i použité brown/green/blue oční materiály jsou v tabulce jednotlivě označené CC0. Původní OBJ/MHCLO/MHMAT mají také výslovnou CC0 hlavičku. Nejde o fotogrammetrii studenta ani kopii postav Hogwarts Legacy.

`assets/sources/characters/student-eyes/source.json` zachovává získání `2026-10-11T10:45:52Z`, hash oficiálního archivu `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107` a byte SHA všech 33 nezměněných zdrojových souborů. Všechny jsou zachovány pod `eyes/`; editovatelný fit je v `anatomical-eyes.blend`. Původní source head/body se nemění: SHA256 `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`.

Runtime `client/data/student-eyes.json` je byte-identický s ověřeným fitovaným výstupem studie, SHA256 `cfdc617ca51583b923fae30d15b226c8ba7f3fec6d9903246b51d9327a2a8d0e`. Fit původních UV povrchů vychází ze skutečně změřených původních socket spheres; radiální vůle 0,15 mm je modelovací rozhodnutí. Near vyřazuje 490 transparentních corneal quadů zdroje, aby nezměnilo původně průhledný UV ostrůvek v modrou neprůhlednou plochu. Corneal odlesk dodává jediný neprůhledný PBR clear-coat materiál. Barva celého atlasu se netónuje: brown/green/blue atlasy zachovávají bílé sclery a původní paletovou volbu presetu.

## Cena a životnost

Obě oči dohromady mají 1 060 near / 172 medium trojúhelníků, jeden instancovaný mesh v právě aktivním LOD. V celé scéně se sdílejí dvě geometrie, šest kombinací geometrie/palety a tři materiály/textury. Žádné nové průhledné třídění, offscreen pass ani samostatná kostra očí. Far proxy oči vynechává.

Near proti předchozímu checkpointu u každého presetu ztrácí pět částí a 476 trojúhelníků. Medium přidává jednu část a 172 trojúhelníků, protože oči už nezmizí. Tři původní 1024×1024 atlasy mají dohromady 1 939 087 byte na disku; sdílejí se pro všechny postavy. Nejedná se o údaj o GPU paměti.

| Preset | Near části / tri | Medium části / tri | Far části / tri |
| --- | ---: | ---: | ---: |
| Alex | 12 / 25 654 | 8 / 11 068 | 1 / 192 |
| Robin | 13 / 26 374 | 8 / 11 068 | 1 / 192 |
| Eli | 12 / 33 462 | 8 / 13 192 | 1 / 192 |
| Sam | 14 / 26 244 | 10 / 15 246 | 1 / 204 |
| Mia | 13 / 26 674 | 8 / 11 312 | 1 / 192 |
| Niki | 12 / 25 654 | 8 / 11 068 | 1 / 192 |

Pro 100 různých relací se šesti střídajícími presety ověřuje stávající test 1 267 near instancí a 100 far instancí; žádná identita se nevynechává. Jde o strukturální Babylon NullEngine měření, **nikoli FPS, draw calls nebo GPU výkonnostní důkaz**.

Cílený refaktoring sjednotil výběr autorských forem a tím i nastavení vertex colors pro sdílené zdroje. Pruning sestaví množinu použitých materiálů jednou místo opakovaného skenu pro každou barvu. Výška neměnných šesti účesů se spočte jednou po použití daného účesu bez opakovaných `filter`/spread alokací při vytváření postav. Oči využívají existující pool a nemají další paralelní systém vlastnictví zdrojů. Tři atlasové textury žijí do dispose poolu; neomezený růst po editacích nevzniká.

## Ověření

Finální cílený běh `pnpm exec tsx --test tests/student-eyes.test.ts tests/avatar-lod.test.ts tests/animation.test.ts`: **22/22 PASS**. Navazující oděvní a skinned testy v předchozím cíleném běhu této integrace: **12/12 PASS**. `pnpm exec tsc --noEmit`: **PASS**. Kompletní stabilní checkpoint, build a integraci provádí hlavní agent a zapisuje do `docs/verification.md`.

Nový oční test provádí **216 skutečných geometrických Babylon ray kontrol**: šest presetů × tři šířky obličeje 0/0,5/1 × near/medium × yaw 0/±0,65 × dvě oči. První zásah paprsku směrem k původní texturové zornici vždy patří očnímu povrchu, nikoli kůži. Near/medium/far návraty zachovávají právě jeden aktivní oční mesh, far oči vyřazuje z `scene.meshes`. Čtyři rebuild cykly s dvanácti postavami ověřují sdílení, neprůhledný režim, nezbarvenou scleru, odstranění posledního vlastníka, nulové zbylé oční zdroje/materiály/geometrie a bounded tři atlasové textury. Existující test zachovává průhlednost všech šesti původních účesů před skutečnými pupil landmarks.

Nový lokální profil v `client/ui.tsx` startuje skutečným presetem Alex (tlumená mikina `#657b67`, face 0,45). Dříve editor označoval Alex, ale fallback měl neonovou sdílenou default barvu a face 0. Uložené lokální volby se pouze stávajícím způsobem sanitizují; sdílený/serverový default se nemění. `tests/core.test.ts`: **7/7 PASS**. Přímá kontrola skutečné funkce `readProfile` s prázdným, null a nevalidním úložištěm i existujícím vlastním profilem prošla; ověřila také neměnné sdílené defaults.

## Navazující GPU review a limity

Připravený existující náhled `/docs/characters/student-garments/preview.html` vytváří skutečný produkční rig. Pro detail vybrat „Obličej“, Alex/Robin/Eli/Sam/Mia/Niki, near a medium; pro otočení použít orbit kamery a gesta/chůzi. Referenční ray kamera je `(0, eyeHeight + 0.10, 1.03)`, yaw hlavy `0/±0.65`; deformovaný world matrix očí je stejný jako u renderu. Při GPU kontrole zkontrolovat čitelnost obou duhovek, okluzi víčky, brýle, odlesky, readiness a nulové shader chyby. Celou produkční hru s HUD a reálnými relacemi měřit zvlášť s hashem, GPU, CSS/interním rozlišením, FPS a p95/p99. Tento dílčí agent GPU ani Blender nespouštěl, aby nenarušil měření hlavního agenta.

V této první oční fázi se texturované vlasové prototypy neintegrovaly: `long01` má ve stávajícím doloženém auditu 510–1 427 viditelných segmentů průniku do oděvu v každém ze šestnácti kontrolovaných stavů. Navazující [integrace dvou krátkých účesů](pilot-hair-20261011.md) po checkpointu M2 doplňuje Alex/Sam včetně barvení; dlouhé varianty zůstávají vyřazené. Zbývající původní produkční siluety nejsou dokončené filmové pramenné vlasy. Obličej je stále obecná společná anatomie se šířkovou úpravou; mrkání, řízení pohledu a mimika zůstávají další prací. Kontrola ray geometrie není důkazem všech pixelů, světelných podmínek či cílových GPU.

Reprodukční derivace je uchovaná v `assets/sources/characters/student-eyes/study-generator.py`. Matematika je převzata z ověřené cache studie; upravené jsou pouze vstupní a výstupní cesty pro zdroje zachované v repozitáři. Tento běh nový Blender export neprováděl; runtime je původní byte-identický export. Generátor používá původní socket audit v `docs/characters/student-avatar-study/source-head-components.json`.

## Skutečné GPU review a dohledání černých očí

První kontrola integrujícího agenta na dlouho běžícím Vite serveru 5173 skutečně ukázala celé černé oči (`docs/verification-evidence/pilot-20261011-m/eyes-before-gpu-repair.png`). Samotné `scene.isReady() === true` a nulová chyba shaderu nestačily: rozšířená diagnostika skutečných instancí ukázala správné UV a bílý albedo multiplier, ale atlas `ready:false` a rozměry 0×0. HTTP cesta `/models/characters/student-eyes/brown.png` tehdy vracela **200 text/html, 574 byte**, což byl SPA fallback, nikoli obrázek.

Příčinou byla zastaralá Vite evidence public souborů: server nastartoval před importem nových atlasů a projekt záměrně nesleduje změny `public/models`, aby kopírování velkých modelů nespouštělo nechtěné reloady. Po čerstvém spuštění QA serveru 5185 se stejné nezměněné materiály/geometrie načetly správně. Žádná oprava fitu, orientace UV, gamma, cullingu ani clear-coatu nebyla potřeba. Po přidání nových public assetů je nutné spustit čerstvý dev server a ověřit skutečný image Content-Type; status 200 sám o sobě nestačí. Produkční sestavení vyžaduje své samostatné ověření hotových assetů.

Integrující agent následně vizuálně ověřil Alex near i medium, Robin near s brýlemi a Eli ze tří čtvrtin. Atlasy hlásily **ready:true, 1024×1024**, shadery neměly chybu a byly vidět bílé sclery, barevné duhovky a černé zornice. Důkazy v `docs/verification-evidence/pilot-20261011-m/`: `eyes-alex-near.png/.json`, `eyes-alex-medium.png/.json`, `eyes-robin-near.png/.json`, `eyes-eli-three-quarter.png/.json`. Uvedená GPU je Intel UHD Graphics 630 přes ANGLE/D3D11; jde o vizuální QA, nikoli FPS benchmark.

Existující oděvní náhled nyní používá produkční `SceneTextureDiagnostics` a vedle `textureLoadErrors` vypisuje stav, rozměry, cestu a UV atlasů skutečných near/medium instancí. Nová regrese dekóduje skutečné nezměněné 8bit RGBA PNG bez dalšího obrazového nástroje a přes Babylon ray hits/getTextureCoordinates vzorkuje 36 bodů: tři palety × near/medium × obě oči × zornice/oba boky sclery. Ověřuje světlé neprůhledné sclery, tmavé zornice a skutečný `Texture.invertY`, nikoli jen existenci UV pole. Dodatečný cílený běh `pnpm exec tsx --test tests/student-eyes.test.ts tests/texture-diagnostics.test.ts`: **5/5 PASS**. Runtime avatar soubory se v této diagnostické opravě nezměnily.
