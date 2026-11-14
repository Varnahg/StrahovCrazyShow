---
title: 'Opravit překryvy po auditu mapy'
type: 'bugfix'
created: '2026-11-14'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '8c5f6f3ce3f01c445ecfd0f221a1719e7f877153'
---

## Záměr

Opravit doložené chyby UV a nežádoucí překryvy z auditu KEY-79. Každou skupinu ověřit nad skutečnou hrou a po dokončení otevřít PR s ověřenou změnou.

## Rozhodnutí a ověřování

1. Textury střech. Chybná kombinace UV sousedů vzniká při zápisu střechy přes obdélníkový helper. Samostatné UV pro každý vrchol zachová pozice, indexy, rámec materiálu a výkon. Přemapování celého materiálu nebo náhrada textur by chybu v geometrii neodstranily. Přijetí: pro každou střechu oba LOD odpovídají XZ / 4 a skutečný snímek ukazuje souvislou kresbu.
2. Ploché vrstvy fasád. U menzy rozdělí obklad původní stěnu v její rovině, na B4 se vzdálené otvory skládají z nepřekrývajících se pásů rámu a tabulí. U B4 je původní autorský panel vlastníkem spodní části stěny. Zvyšování zOffset nebo posunutí detailů by bylo závislé na rendereru a mohlo měnit styky či stíny. Přijetí: paprsek prochází nanejvýš jediným obkladovým povrchem na zkoušených místech a v obou LOD. Záběry potvrdit v Edge.
3. Bočnice schodů. Bok zakrytý souvislou clonou nevytváří vlastní povrch. Vnější obrys stupňů, kolizní plán a navigace se ověří odděleně. Posunout celé schodiště by měnilo výšku dveří.
4. Další materiálové a meziobjektové průniky se posoudí podle místa, orientace a zakrytí. Vlastnictví viditelných ploch se řeší v příslušném zdroji. Chybu v CAD exportu nelze plošně mazat podle součtu dvojic, protože soubory obsahují vnitřní stěny a více reprezentací. Výškové opravy střech vycházejí ze společného terénu a kotvy, které používá i kolize.

Výška střech 49379066, 49379072 a 53920575 je katalogový odhad podle podlaží nebo typu. Vybraný minimální herní rozměr je nejvyšší bod herního DMR uvnitř půdorysu plus dvoucentimetrový odstup, zaokrouhlený nahoru na centimetry. Společná efektivní výška ve `shared/world.ts` zvedá horní hranu stěn a kolizní střechu. Původní výškové podklady a základna zůstávají dohledatelné. Řez terénem by změnil průchod svahu, zatímco zvednutí celé budovy by změnilo napojení na okolí. Zdroj výšek [ČÚZK DMR 5G](https://ags.cuzk.gov.cz/arcgis2/rest/services/dmr5g/ImageServer). [Městský model budov](https://geoportalpraha.cz/data-a-sluzby/clanky-a-projekty/3D-model/3d-model-budovy-mosty) je samostatný zdroj pro případné budoucí zaměření skutečných střech.

Parapety B3, B8 a B9 využijí stejný výpočet obálky pod oknem jako menza. Ponechání výškového filtru na 1 m opomíjí malá okna ve výšce 1,05 m. Horní hrany oken zůstávají ve zdrojových výškách.

Východní pavilon stadionu skládá dlouhé betonové a plechové desky z nezávisle otočených boxů. Horní a dolní plochy se na zalomeních kříží. Navazující desky dostanou stejnou natočenou hranu v půdorysu. Review našlo u prvního kandidáta mezeru mezi upravenou viditelnou hranou a starým kolizním boxem. Finální plán používá pro obě vrstvy shodné desky. Kandidát se ověří na pochozích plochách a šikmým pohledem na podhled.

CAD B1 a B6. Byla potvrzena shodná orientace a kladná společná plocha mezi omítkou a parapetem B1 a omítkou N5 a N6 B6. Při opravě pevného renderu se odečte plocha druhého vlastníka z původních trojúhelníků, UV a normály se interpolují z jejich původních hodnot. Export se připne hashem jako jiné render-only aktualizace. Úprava zdrojového modelu s novým odvozením všech kolizí by zde rozšířila rozsah, a hloubkový bias by závisel na backendu. Podmínkou přijetí je stáhnout a vykreslit přesné nové bajty. Primárními vstupy jsou oba stávající nativní GLB a [standard glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

Ploty. Sloupek na společném konci panelů se opakuje, zatímco u vrátnice G a bašty probíhá plot po stěně. Sloupky mají jednoho vlastníka podle společného koncového bodu a průchod plotu stavebním obrysem se potlačí pouze u nalezených objektů. Očekávaný styk u bran a jiných zdokumentovaných průchodů určuje stávající plán. Globální odstřižení plotů v okolí budov by mohlo měnit přístupy i tam, kde audit problém nenašel. Přijetí zahrnuje zachovanou návaznost a fyzický průchod.

U B3 a B4 zvedneme pouze první nášlap o 2 cm, což odpovídá hernímu průniku 17 a 15 mm. Sdílený plán renderu, fyziky i výšky NPC použije stejný první stupeň. Podesta a dveře jsou v původní výšce. Terénní zákop kolem prvního stupně by oproti tomu měnil přístup a přidával hranu mezi existujícími drapovanými povrchy.

Západní tribuna OSM 106220817 má samostatnou doloženou obálku a stadion potřebuje zachovat uzavření prostoru. Beton západní konstrukce v rozsahu stavby časem splývá s generickou fasádou tribuny. Zvolené vlastnictví při styku se omezí na průnik betonových trojúhelníků s jasně určenou obálkou, bez posunu tribuny nebo plošného odebrání konstrukce stadionu. [OSM západní část](https://www.openstreetmap.org/way/106220817) · [Praha 6](https://www.praha6.cz/akce/akce_velky-strahovsky-stadion--z-tribuny-na-tribunu-2026-07-29-a_78797.html)

Blízká okna. Sklo překrývá spodní stranu rámu a těsnění, protože souvislá obdélníková tabule leží o 2 mm za instalační rovinou. Tabule vyplní jen otvory uvnitř těsnění. Existující UV celé tabule se interpolují podle její původní šířky a výšky, aby žaluzie a masky nepřeskakovaly na každém poli. Rozměry drží stávající stavební sada. Přijetí vyžaduje průchod paprsku tabulí, zachovanou šířku příček a žádnou tabuli ve středu příčky.

## Podmínky experimentů

Problém jsou tmavé plochy, blikání a porušená kresba. Hypotéza je doložený překryv nebo vadné UV konkrétní plochy. Každý pokus mění jen daný generátor či vlastnictví povrchu. Hlavní metriky jsou UV po vrcholech, počet povrchů na paprsku nebo hloubka průniku. Správnost vyžaduje zdravý odeslaný snímek z neměnného buildu, shodný pohled a zachování prostoru pro pohyb. Přijetí vyžaduje odstranění doloženého konfliktu a cílenou regresi.
