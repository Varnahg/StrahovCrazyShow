# R6 B5: souvislá vzdálená koruna

Task `trees-20261026-r6-far`, owner `trees-r6-far-agent-20261026`. Navazuje na přijatý R6 nativní model a jeho přesný export. Tento kandidát je oddělený od původních modelů a aktuální hry.

## Důkaz a rozhodnutí

R6 MID obsahuje všech 82 100 fotografických listů v 16 019 rankových skupinách; původní FAR pouze 16 383 listů. Čtecí kontrola aktualizovaných kotev zjistila 54 sekvencí fotografických částí, 751/792/942/1 731/803/11 000 skupin po 1/2/3/4/5/6 listech. Největší vzdálenost kotev jedné skupiny je 0,36855 m. Orientace a roll listů se mezi skupinami liší, proto nelze tvrdit, že existující skupiny jsou přesné instance jedné geometrie.

Porovnané varianty:

- Řídký subset: malá geometrie, ale prokazatelně vynechává 80 % populace. Nepřijatý jako dokončená koruna.
- Úplný MID všude: zachová tvar, ale nedává požadovanou redukci počtu listů/vertexů ani rezidentní rozpočet katalogu.
- Jedinečný atlas pro všech 16 019 ranků: zachová unikátní tvar z projekce, ale texture pool roste s každým stromem; není vhodný společný základ pro 110 stromů.
- Celokorunový impostor: vyžaduje více směrů, sezónních stavů a novou depth/shadow cestu. V této etapě by spojil více změn a ztratil existující jemné rankové opadávání.
- **Omezená banka skutečných zdrojových skupin:** nejvýše osm medoidů pro každou z 54 fotografických sekvencí, pouze rigidní fit bez změny měřítka. Zvolená varianta. Skupina, která překročí limit fitu, zachová svoji přesnou MID geometrii. Žádný list není vyřazen kvůli rozpočtu nebo chybě fitu.

Medoid je vždy skutečná zdrojová skupina se stejnými fotografickými částmi ve stejném pořadí. Pivot je průměr původních kotev; čistá rotace jej neodsouvá. Individuální kotvy aproximované skupiny se mohou lišit, což je měřené a označené, nikoli vydávané za přesnou fotokopii. Výchozí fit limity 60 mm maximum a 25 mm RMS jsou autorské meze pilotu, ne přijatý obrazový výsledek. V 75 m při 720 px/FOV 0,85 odpovídá 60 mm přibližně 0,64 px. K tomu se přidává projekční chyba karty, která se ověřuje samostatně.

## Data a životní cyklus

Piny v `scripts/trees-20261026-r6-far/prepare.mjs` vážou R6 MID/FAR, source delta, aktualizované osy, fotografický atlas a nativní `.blend`. Existující čtecí rank join identifikuje list pomocí propojené komponenty, ranku a přesné UV footprint. Neodhaduje identitu podle pořadí exportovaných vertexů.

Banka používá pro každý medoid jednu nebo dvě projekční roviny. Rozdělení listy neduplikuje: každý původní list patří právě jedné rovině. Barevná, opacity, normalGL a roughness mapa vznikne projekcí původních fotografických materiálů bez nasvícení. Zdrojové mapy zůstávají nezměněné. Mipmap coverage a atlasové přesahy jsou samostatná přejímka.

Dohodnutý meziformát s integrátorem: `bank.json` verze 1, `coordinateSpace: gltf-y-up`, metry; `prototypes` obsahují číselné `id` a karty s `positions[12]`, `normals[12]`, `uvs[8]`; čtveřice vrcholů má CCW trojúhelníky `[0,1,2,0,2,3]`. `textures` obsahují integrity deskriptory čtyř map. Souřadnice karet jsou relativní k pivotu medoidu. Záznam placementu má 32 B little-endian: rank uint16, prototype uint16 (65535 znamená přesný fallback), anchor XYZ float32 a quaternion XYZW float32. Převod Blender `[x,z,-y]` má determinant +1. Záznamy seřazené podle ranku zachovávají existující sezónní prefix.

Samostatný geometry-only GLB obsahuje nezměněné FAR dřevo a přesné fallback listy, se stávajícími jmény `own-broadleaf__lod2__wood/foliage`. Srovnávací plný GLB a editovatelný `.blend` jsou nezávislé důkazy. Runtime decoder rozbalí banku do per-source polí jednou při načtení; nepřidává se nový per-frame shader ani instancing. Rozbalené CPU/GPU buffery se vykazují odděleně od stažených source bajtů a atlasových mipů.

`runtime-contract.json` v4 odkazuje na původní R6 near/MID a původní R5 conifer beze změny, přidává banku `r6-broadleaf` a `farCluster` k B5. SHA `c5c059efdfd12fb82aa319952a004b83db6f8ea52a9342ab4980a9f7dcde4a15`. `bank-source.json` je samostatná zmrazená autorská fixture, runtime ji nenačítá: 544 094 B, SHA `df10633f0329e73162ddbe5fc47cbfc3183be68712f6eba2ca6d431bf03130e3`. Obsahuje přesné medoidní body, pořadí fotografických částí a pivoty v Blender Z-up pro následný fit dalších stromů vůči stejné bance; katalog nesmí znovu vybrat jiné medoidy pod stejnými ID.

## Dokončený kandidát a skutečné výsledky

První 60/25mm fit by ponechal 72 730 listů v přesném fallbacku; proto nebyl vydáván za optimalizaci. Dvě omezená zpřesnění volí skutečnou zdrojovou skupinu nejbližší průměru rigidně zarovnaných členů, nikoli syntetickou průměrnou geometrii. Při stejném striktním limitu zůstalo přesných 61 001 listů. Pro FAR kandidáta byly po souhlasu koordinátora použity výslovně aproximované limity 150 mm maximum / 70 mm RMS; rozhodující je obraz celé koruny v cílové projekci, nikoli přesná kopie jednotlivého listu. Staré podklady obou striktních variant zůstaly uložené.

Finále: **369 zdrojových medoidů, 727 bankovních karet, 15 947 aproximovaných rankových skupin a 72 přesných skupin (432 listů)**. Každý z původních 82 100 listů a 16 019 ranků je zastoupen. Karty mají 62 262 trojúhelníků, přesný fallback 864, nezměněné FAR dřevo 2 690. Foliage tedy klesá z plného MID 164 200 na 63 126 trojúhelníků (61,6 %), bez odstranění skupin. Toto není měření FPS.

Banka má 474 603 B, placementy 512 608 B a exact GLB 157 372 B. Per-source FAR přenos je **669 980 B**; sdílené čtyři mapy dohromady 2 359 067 B. Rozbalená foliage pole mají 6 817 608 B, navíc dřevo, sezónní indexy, engine buffery a sdílená banka. Čtyři 1024² RGBA8 mapy představují odhad 16 MiB base / 21,33 MiB s plnými mipy; skutečná VRAM nebyla změřena. Mapy/banka se mají sdílet napříč katalogem, placementy a fallback jsou per source. Nelze násobit pouze komprimované PNG a vydávat výsledek za GPU paměť.

Atlas vznikl čtyřmi celoplošnými emisními Cycles CPU2 průchody z původních fotografických materiálů, bez pečeného světla. Má 727 neprázdných dlaždic po 32 px, 4px gutter; v základní mapě nemá žádný neprůhledný gutter pixel. Původní fotografický cutout je stále 0,5. Dvojité resamplování při pečení a použití karet s cutout 0,5 však snížilo maskovanou plochu koruny o 4–12 %. Derivovaný atlas proto má vlastní **alphaCutoff 0,20**, srovnaný proti 0,50 a 0,35; mapy ani měřítko listů se při této korekci nezměnily. `normalMapStrength: 1` odpovídá tomu, že původní nativní strength 0,45 je již zahrnutá v pečeném normálovém obrazu. Runtime musí tyto hodnoty použít pouze pro nový atlas.

Deset skutečných saved-pixel srovnání celé koruny: léto / 50% opad; 75 m při 0/45/90°, dále 135 a 175 m při 0°. Jde o 256px výřez odpovídající 720px projekci/FOV 0,85, ortografická aproximace FAR. Finální poměr maskované plochy je **0,9633–1,0167**, přidaná plocha mimo 1px toleranci nejvýše **0,7813 %**, chybějící nejvýše **1,3889 %**. Všech deset splnilo předem uvedené ±5% / 5% meze. Počáteční neúspěchy 0,50/0,35 jsou zachované; nejde o důkaz všech úhlů nebo herního sampleru.

**Automatické atlasové mipy a skutečné WebGPU stíny/vítr/výkon zůstávají přejímkou runtime.** Base gutter 4 px u 32px dlaždice sám neprokazuje oddělení na vysokých mip úrovních. Babylon 9.30 v běžném sampler cache nenabízí veřejný libovolný maxLOD přes `Texture`; vypnutí mipů by přineslo jiné aliasing/performance riziko. Tento modelovací krok proto netvrdí, že trilineární runtime obraz již prošel. Neprovádí privátní sampler patch ani globální změnu PBR.

## Ověření a reprodukce

- **5/5 přenosných CPU testů PASS**, bez skip/fail: proper rigid 90°/180°, žádné měřítko/reflection, determinismus/zdrojová identita, fallback a 32B glTF rekord. Moduly nemají implicitní IO při importu.
- Skutečný reopen `.blend` a porovnání expanded triangle corners vůči srovnávacímu GLB: všechny pozice přesně stejné; UV max 5,96e-8. Nativní custom-normal encoding odchylka max 0,000394 ve fallbacku / 0,0000257 na kartách je přiznaná. Exportované **FAR dřevo a exact fallback jsou bitově stejné jako příslušná původní R6 GLB data** včetně normál a UV. Žádné tvrzení o bitové shodě aproximovaných karet s původními listy.
- Integrátor provedl nezávislý skutečný runtime decoder roundtrip veřejných souborů: všechny ranky, exact sentinely a integrity map PASS; compact-vs-comparison rohy max POSITION 0,954 µm, NORMAL 1,192e-7, UV přesně. Full/half/zero sezónní prefixy správné. Jeho evidence `.cache/trees-cluster-runtime-20261026/produced-check.json` patří jinému rezervovanému tasku; autor modelu ji nevytvořil ani nepřepsal.
- Reopen našel 15 packed images včetně všech čtyř nových map s přesnými bajty; root/collider zůstal stejný. Editovatelný model má 49 255 099 B, SHA `3c4f7b9dd938f589f19a4e82949ee6c7141f53d719d74ff12cf0075c19422240`.
- Žádný whole-project build, fullsuite, integrace, GPU proces nebo server. Cílené ověření rendereru a velké předcommitové kontroly patří integrátorovi nad dokončeným celkem.

Reprodukce s pinovanými vstupy a vlastní rezervací heavy-validation:

```powershell
. .cache/trees-20261025/activate.ps1
node scripts/trees-20261026-r6-far/prepare.mjs --prepare
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python scripts/trees-20261026-r6-far/build.py
node scripts/trees-20261026-r6-far/publish.mjs --publish
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python scripts/trees-20261026-r6-far/verify_native.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python-exit-code 1 --python scripts/trees-20261026-r6-far/audit_images.py
node node_modules/tsx/dist/cli.mjs --test tests/tree-r6-far.test.ts
```

Před opakováním zachovat přijatý checkpoint. Scripty přepisují pouze své nové výstupy; zdrojové R6/R5/R4 modely jsou neměnné. `compare_coverage.py` je zachovaný úzký experiment cutoutu, nikoli další běžný build krok.
