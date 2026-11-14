# Audit překryvů statické mapy

Výchozí commit `a6305f68`. Hráčský problém jsou černé plochy nebo blikání na budovách. Předpokladem k ověření jsou souběžné plochy s malým odstupem, průnik terénu a chybně použitá poloha modelu. Jedinou změnou proti běžné scéně je čtecí extrakce jejích vrcholů v Babylon NullEngine. Metrikou je kladná plocha průniku, odstup v milimetrech a posun světových vrcholů. Audit odděluje vzájemně výlučné LOD a porovnává oba nativní CAD modely proti stejnému umístění jako hra. Kritériem přijetí auditu je potvrdit pozitivní kontroly B4 a menzy, vypsat pokryté části a uvést mez použité metody.

## Rozsah a výsledek

- Hra dodala 2 844 154 trojúhelníků v 3 913 meshech. Sken zahrnuje zdrojový DMR, drapované plochy a ulice, běžné budovy s oběma úrovněmi detailu a sokly, nativní B1 a aktuálně vydaný render B6, stadion, kurty a modelovaný mobiliář. Byty a interiéry CAD jsou zastoupeny ve výchozí poloze a v dostupných variantách geometrie. Souřadnice jsou v herních metrech, +X na východ, +Z na jih. [Souhrn](summary.json)
- [Katalog](locations.csv) má 10 884 řádků, včetně 1 404 skupin neprůhledných ploch se stejnou orientací. Z nich 738 spadá do tolerance stejné roviny, ostatní mají malý odstup. Každý řádek obsahuje vlastníka, LOD, materiál, souřadnici uvnitř největšího nalezeného průniku, skladbu indexů a součet průniků dvojic trojúhelníků. Součet dvojic může vícekrát zahrnout stejnou plochu. Skupina může zahrnovat několik míst na jednom modelu. Varianty dveří, zdroje instancí, světelné plochy a značení mají v katalogu vlastní identifikaci podle hry.
- Pivoty 329 kořenů byly prověřeny na 4 212 612 vrcholech. U dílů zapsaných rovnou ve světových souřadnicích sestavení nepřidalo posun. Kontrolní posun každého kořene o `(2, 1, −3)` m se přenesl do jeho dílů s největší odchylkou `0,0153 mm`. U CAD a lokálně uloženého mobiliáře se srovnával přírůstek transformace. CAD GLB mají zkontrolovaný hash a používají skutečný herní loader. [Kořeny modelů](../../../client/world-asset-identity.ts)
- Kontrola všech 110 kmenů použila společný poloměr a skutečnou polohu. Nenašla kmen uvnitř půdorysu budovy, na hraně fasády ani střed kmene v mapované vozovce. [Prostorová evidence](placement.json)

## Nálezy k opravě nebo ověření

| Místo | Doložený mechanismus a příklad souřadnic |
| --- | --- |
| Menza `8111356` | Horní ocelový pás překrývá plnou obloženou stěnu ve vzdálenosti 12 mm v obou LOD. Příklad `(83,18, 3,45, 150,51)`. V blízkém detailu byly nalezeny i malé překryvy rámů s parapetem a sklem. |
| B4 `53929057` | Vzdálená fasáda překrývá plnou stěnu soklem `+4 mm`, rámem `+6 mm` a sklem `+8 mm`. Blízký sokl také překrývá autorský panel. Příklad `(78,75, −2,95, 46,63)` pro vzdálený sokl. |
| B5 a běžné fasády | Shodný detail okna kreslí blízké souběžné části rámu, parapetu a skla. U B5 má příklad vstupních rámů okna odstup v řádu milimetrů. Model vychází ze skutečných rámečků a těsnění, takže z katalogu teprve vybrat plochy viditelné z téže strany. |
| B1 `53929063` | Nativní betonové parapety sdílejí části ploch s omítkou v P1 a podlažích N1 až N3. Ukázka `(−94,29, 10,82, 100,26)` na N3. Další páry jsou uvnitř sestavy omítky a zárubní. |
| B6 `53929071` | Shodná rovina omítek N5 a N6 v okolí `(−0,96, 17,00, −69,93)`. Katalog obsahuje i malé odstupy částí zařizovacích modelů v koupelnách a místnostech. |
| B2, B3, B4, B5, B7, B8, B9, B10 | U všech osmi vstupů je bočnice betonových schodů stále v rovině se světlou bočnicí vstupu. Přibližně `0,148 m²` na vstup, příklad B5 `(−58,54, 2,54, −76,17)`. Předchozí oprava řešila samostatně spáry mezi stupni. |
| Stadion `1515034` | Shodné plochy nosných částí, betonu a podhledu, například u haly v `(−151,93, 27,42, 17,94)`. Beton stadionu se v katalogu protíná i s modelem `106220817` u `(−429,08, −31,23)` v rovině jeho soklu. |
| Oplocení | Tmavé plochy plotu `293949903` zasahují k fasádě a soklu vrátnice G, například `(-65,63, 245,41)` v XZ. Ploty `269652203` a `1532983905` se překrývají u `(350,40, 290,35)`. Plot `159388523` sdílí plochu s baštou sv. Karla u `(411,37, 65,38)`. Další polohy oplocení a kurtů jsou v katalogu. |
| Okrajové budovy | Některé samostatné sokly jsou ve stejné rovině jako stěny sousední budovy. Velké příklady `166375092` × `49379068`, `166375073` × `49379066` a `49379089` × `49379085` leží jižně od pokrytí terénu. Štefánikova hvězdárna `159477035` má podobný styk s Hladovou zdí `1132256447`, část u okraje vykresleného terénu. |
| Silnice | Přechody asfaltu, dlažby a dalších povrchů jsou záměrně `+1 mm` nad podkladem a používají hloubkový posun. Katalog obsahuje i směrové tabule, jejichž přední plocha a zadní deska mají skutečné milimetrové odsazení, například přechod `54283786`. Skryté šablony značek v počátku souřadnic se v herním pohledu nepoužívají. |

Při kolmém pohledu ze 100 m je mezera mezi sklem a rámem vzdáleného B4 přibližně `0,27` kroku v modelu D24 s herními rovinami `0,08–1 100 m`. Při 150 m je odstup horního pásu menzy přibližně `0,72` kroku. Úhel, skutečný formát hloubky, pořadí kreslení a zakrytí ovlivňují výsledný snímek. [Projekce a hloubka](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf)

## Průnik terénu a souřadnice textur

- Střechy `49379066`, `49379072` a `53920575` protíná herní terén uvnitř vykresleného rozsahu až o `1,559 m`, `54 mm` a `32 mm`. Přesné souřadnice průniku obsahuje souhrn. Zůstává dříve naměřený styk terénu s vnějším rohem prvního stupně B3 a B4 o 17 a 15 mm. [Výškový zdroj ČÚZK](https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer)
- Z 2 942 prověřených běžných otvorů stojí za kontrolní snímek spodní část parapetu B9 u `(208,37, 52,89)` v XZ. Výpočet obálky parapetu dává přesah terénu `49 mm`. Stejná konzervativní obálka ukázala `14 mm` u B3 a `9 mm` u B8 na jiných hranách než dříve opravená okna. Obálka používá celý rozsah parapetu a nejnižší bod jeho profilu, takže sama nepotvrzuje, že průnik leží na viditelném líci skla. [Souřadnice](placement.json)
- U 117 procedurálních střech tvoří 1 299 trojúhelníků v každém LOD. Všech 1 299 používá pro prostřední vrchol kombinaci UV souřadnic jeho sousedů. Dva trojúhelníky mají i nulovou plochu v UV, na kapli Kalvárie `27581157` a budově `49379061`. Těchto střech se týká zborcení kresby a normálové mapy. Potraviny navíc obsahují 648 blízkých a 272 vzdálených trojúhelníků kovových detailů s nulovou UV plochou, ale dotčený kov nemá texturu. Žádná souřadnice UV ani normály v exportu neměla neplatnou číselnou hodnotu. [Tvorba střechy](../../../client/architecture-reality.ts:1411)

## Reprodukce a meze

```powershell
node --import tsx docs/verification-evidence/map-clipping-20261114/export.mts
py docs/verification-evidence/map-clipping-20261114/scan.py .cache/geometry-release-20261111/map-clipping-20261114
py docs/verification-evidence/map-clipping-20261114/catalog.py .cache/geometry-release-20261111/map-clipping-20261114
node --import tsx docs/verification-evidence/map-clipping-20261114/place-audit.mts
```

Python použil NumPy 2.4.4 a Shapely 2.1.2. Tolerance plošného průniku je `1 mm²`, prahová vzdálenost podél dominantní osy je `15 mm` a stejná rovina znamená nejvýše `0,15 mm`. Páry se hledají uvnitř intervalů zaokrouhlených složek normály, což může vynechat šikmé dvojice na hranici intervalů. Sken měří rovnoběžné či téměř rovnoběžné plochy. Průniky terénu se zkoumají samostatně u střech a otvorů. Výpočtem se neměří viditelnost při průchodu kamerou, průniky koruny stromů, dynamické objekty, částice, stíny ani runtime stavy po libovolném pohybu dveří. Uživatelovo hlášení jako celek tedy vyžaduje další průchod scénou ve skutečném rendereru.

Binární extrakt je na D: v `CodexWorkspaces/StrahovCrazyShow-geometry-release-20261111/qa/map-clipping-20261114/triangles.bin`, SHA-256 `6055acfe14d8471be93baee421e419ffb3416ee3963a5ed1db1cf99dca2df38a`. Čtecí audit prošel pozitivními kontrolami B4, menzy a osmi bočnic vstupů a kontrolou počtů v exportu. [KEY-79](https://linear.app/gigeconomy/issue/KEY-79/budovy-odstranit-cerne-prekryvy-soklu-fasad-a-terenu)
