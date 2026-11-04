# Proč poslední starty selhaly

Rozbor 3. listopadu 2026 vychází z uložených JSONL, nikoli z čekání na chybovou obrazovku. [Vybrané původní záznamy a SHA256 celých logů](forensics.json) zachovávají i pokus, který nebyl použitelný pro výkonové srovnání. Žádný z těchto pokusů nedokládá úspěšné `Game.ready` ani herní FPS.

Při kontrole hashů se ukázalo, že původní otisk kontrolní session `de4086ab` zachytil jen prefix142 873B před doručením závěrečné dávky. Tento prefix je bajtově ověřený a jeho původní hash zůstává zachovaný v `capturedPrefix`; doplněný hash celého159 127B souboru je `89e6aab9d99c4a4d9dfb9068a79ad257cb0ba26eb50cbffc06e33198087a67e0`. Všech31 vybraných záznamů ze čtyř sessions se shoduje s původními záznamy.

## Dvě odlišná selhání

1. Candidate1, session `81768a0b-dc35-4133-b9ab-d8cf0bcdf87e`: skutečná GPU validační chyba. Hlavní průchod předal buffer světla `sun` o80B pipeline očekávající96B. Při čekání na nový shader mohl Standard/PBR ponechat starý připravený Effect, zatímco binding už používal aktuální seznam světel. Stejný mechanismus byl reprodukován s nativními Babylon Effect/Light/BindLights v cílených testech. Binding index5 není důkaz, že šlo o „páté světlo“. Přesný postižený mesh log neidentifikuje.
2. Candidate2, session `53db3a83-6f91-4fdd-9be7-73b2ffc93b61`: vypršel čas přípravy kvality Low, celkem30 466,8ms včetně obnovy. Chyba80/96 se v tomto jednom pokusu neobjevila. Dokončeno bylo jen sedm variant, osmá `night-1-on` skončila uprostřed kontroly objektů. Absence validační chyby v jednom neúspěšném startu není praktická přejímka opravy.

Candidate2 má build/source/test SHA `c69bb607d46bb299f9f9d3dfca279963c039538753965fe30a34895d8dcbd77f`, celý raw log SHA `489f433afd3a0f02e00e46a49fbe1e4cd8edb8571a566b02b6a1572738420cb5`. Identitu sestaveného klienta určuje `source.buildSnapshotId`; `source.contentSha256` je jiný, neatomický otisk serverem pozorovaného pracovního stromu. Předherní presentation probe měla60,2Hz; není to herní FPS.

## Co spotřebovalo čas candidate2

| Úsek | Naměřený čas | Počet |
| --- | ---: | ---: |
| Přípravné renderovací volání | 13 117,2ms | 92 |
| Bloky kontrol objektů | 4 514,9ms | 14 085 kontrol |
| Aplikace variant | 352,0ms | 11 |
| Zbytek celkového času bez přesné atribuce | 12 482,7ms | — |

První tři řádky jsou sourozenecké měřené úseky. Zbytek zahrnuje také práci mimo tyto úseky, obnovu a doručování callbacků; není označený za GPU čekání. Časy asynchronních pipeline se vzájemně překrývají a nesčítají se. Stejně tak se k renderům nepřičítají jejich vnořené shaderové časy.

Shaderová fronta dokončila281/281 příprav, při ukončení měla0 queued/0 pending a žádnou chybu. Její nativní práce trvala417,3ms. Celý compiler profiler zaznamenal602 `createShaderModule` volání za152,6ms, nejdéle8,2ms. V tomto pokusu se tedy neopakoval původní dlouhý synchronní shaderový blok. Rozdíl proti dřívějšímu pokusu není sám důkazem příčinného zlepšení: měnily se cache, systémové zatížení i kandidátní ochrana materiálů.

Pipeline adaptér evidoval65 neúplných renderů a8 177 `pending-entry` přeskočení; limit kapacity nebyl zasažen. Tyto čítače neznamenají8 177 unikátních shaderů. Posledních18 pending pipelines pochází výslovně ze snapshotu **po obnově nastavení**, nikoli z okamžiku poslední readiness kontroly.

Poslední operace byla `check`, cursor174 z926, retry0 a readyRenders0. Nulový `lastGate` tedy neznamená připravenou scénu: celý kontrolní seznam ještě neprošel. Novější dokončené varianty zahrnují924–928 aktivních objektů; starší běhy z počtu kontrol naznačují přibližně441–443. Bez srovnatelného seznamu scény, kamery a dokončeného načtení nelze rozdíl připsat samotné frontě.

## Co zatím není doložená příčina

- Jeden restart `weather` nastal v poslední variantě. Kód používá identitu weather objektu; nový HTTP JSON může restartovat přípravu i při stejných hodnotách. Log však neobsahuje hodnoty před/po. Celá poslední varianta trvala1 667,4ms, takže tento jediný restart nevysvětluje zbývajících sedm nedokončených variant.
- Nízké celokaretní vytížení ani součet Promise latencí neprokazují chybu ovladače, nedostatek VRAM nebo čekání CPU na GPU.
- Materiálová ochrana provádí kontroly vlastnictví a readiness navíc. Její samostatná cena není zaznamenaná. Odstranění ochrany by znovu připustilo reprodukovanou chybu80/96.

## Zvolené další rozlišující srovnání

První kontrola má zachovat materiálovou ochranu, shadow ochranu, všechny Low/Medium/High varianty, skutečné readiness/submission gates a30/90s limity. Změnit má pouze plošné odkládání shaderové přípravy: porovnat nativní průchod s dosavadní frontou na společném stabilním checkpointu. Až podle výsledku posuzovat inline rozpočet, který okamžitě propustí levnou práci a přebytek nechá ve FIFO. Jediné synchronní nativní volání nelze přerušit.

| Varianta | Důvod volby nebo odložení |
| --- | --- |
| Kontrola bez plošného deferral, materiálová ochrana zachována | Nejmenší změna pro oddělení ceny fronty; může znovu odhalit dlouhé synchronní bloky. |
| Jeden společný inline/FIFO rozpočet na engine frame | Možný další kandidát; musí zachovat pořadí, reentranci, callbacky, zánik a jeden reset rozpočtu. |
| Zvýšit počet jobs nebo rozpočet současné fronty | Méně přesně rozliší příčinu; každý levný nový kontext stále odkládá. |
| Omezit opakované rendery a readiness skeny | Potenciálně větší přínos, ale nejdříve je nutné určit konkrétní drahé fáze a závislosti; jinak hrozí zastavení přípravy práce spouštěné renderem. |
| Změnit weather revision na skutečné hodnoty | Samostatný menší kandidát; neprezentovat jako opravu celého timeoutu. |
| Prodloužit timeout nebo vynechat varianty | Neřeší naměřený náklad a nesplňuje současný přejímací kontrakt. |

Výklad asynchronního dokončení odpovídá [WebGPU — async pipeline creation](https://www.w3.org/TR/2026/CRD-webgpu-20260915/#async-pipeline-creation). Konkrétní mechanismus readiness a callbacků byl ověřen proti instalovanému Babylon9.30, zejména `webgpuEngine.pure.js`, `mesh.pure.js`, `pushMaterial.js` a Standard/PBR implementacím.

## Stav ověření a pokračování

Materiálová korekce a související startup/lifecycle sada114/114 PASS; následný build PASS. Dřívější úplná sada měla2877 PASS/1 FAIL/5 SKIP a nezměněný řadičový případ timeoutoval i izolovaně. Žádný výsledek se nepřeznačuje na zelenou celoprojektovou či GPU přejímku.

Po produkčním switchi KEY-72 je potřeba domluvit stabilní vstupy a znovu rezervovat heavy-validation/GPU/porty. Dnešní rozbor nespustil žádnou3D scénu ani testovací server. Kandidátní implementace zůstává rozpracovaná; druhá optimalizace proti herním zásekům není dokončená.
