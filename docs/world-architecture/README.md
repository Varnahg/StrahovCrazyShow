# Architektura Strahova a podklady pro modelování

Ověření odkazů a sběr: **10. 10. 2026**. [Interaktivní atlas](atlas.html) funguje jako samostatný HTML soubor i přes lokální Vite na `/docs/world-architecture/atlas.html`. Mapa obsahuje 40 objektů v okolí hry, dohledatelné OSM identity, přehled jednotlivých fotografií a pět panoramatických stanovišť. Současný stav budov nebyl ověřen návštěvou na místě.

## Co se skutečně změnilo ve hře

- `shared/data/building-catalog.json` katalogizuje všech **70 původních OSM budov**. Každý záznam má architektonický typ, podobu fasády, původ výšky, přesný OSM identifikátor, zdroje, přiřazené fotoreference a vypočtenou orientovanou obálku.
- `buildingArchitecture(buildingOrId)` a `measuredFootprint(building)` jsou exporty z `shared/world.ts` pro renderer. Obálka zachovává natočení; nenahrazuje skutečný nepravidelný polygon. Výpočty v metrech používají stejné přibližné souřadnice jako původní mapa.
- `BUILDINGS` používá společné výšky pro obraz a kolize. U **11 garáží, technických objektů a přístřešků** zmizel nepřiměřený univerzální fallback 15 m. Nové náhradní výšky 3,5–4,5 m jsou výslovně označené `typology-inferred-approximate`, nikoli zaměřené. Explicitní OSM `height` a počty podlaží zůstaly zachované. Ani výška odvozená z podlaží krát 3 m není měřením.
- `MAP.paths` sdílí pouze **298 skutečných záznamů s typem komunikace**. Odstraněných 231 bezejmenných typů zahrnovalo hranice, obrysy tribun a další nekomunikace, které starý XML import omylem vykresloval jako cesty. Původní `map.json` zůstal beze změny jako zdrojový podklad.
- `STADIUM` nově poskytuje samostatný úplný OSM multipolygon stadionu: **74 bodů vnějšího obvodu, 66 bodů vnitřního otvoru a šest částí tribun**. Původní import ho vynechával, protože podporoval jen `way[building]`. Stadion je kulisa západně od herních hranic, nikoli nové průchozí území. Renderer musí zachovat otevřenou plochu uprostřed.
- Kolizní geometrie B6, schodiště a `GROUND_RECTS` nebyly tímto úkolem měněny.

## Identity a stavební rozdíly

| Identita | OSM way | Zásadní charakteristika / reference |
|---|---|---|
| B1 | 53929063 | Budova správy a bufetu podle SÚZ; navzdory OSM názvu a tagu nesmí dostat šestipatrovou kolejní fasádu. |
| B2 | 53929060 | Jižní řada, západní ubytovací blok; konkrétní fasádové fotografie stále chybí. |
| B3 | 53929069 | Jižní řada mezi B2 a B4; smíšené otevření B4 obsahuje i starší interiér B3. |
| B4 | 53929057 | Vizuálně doložená šedá panelová čela, drobnější otvory, bílé dlouhé fasády a rekonstrukce interiéru v roce 2024. |
| B5 | 53929066 | Severní řada západně od B6; detaily se mají ověřit jednotlivě. |
| B6 | 53929071 | Severní řada mezi B5 a B7, západní vstupní výstupek; východní přístup k suterénním klubům. Plán a wiki určují místnosti, ne přesné kóty. |
| B7 | 53929068 | Severní řada východně od B6; 007 v suterénu, sousední Sport bar je jiné místo. |
| B8 | 53929065 | Jižní řada východně od B4; buňkové uspořádání, nepřebírat vnitřní dispozici B6. |
| B9 | 53929062 | Jižní řada mezi B8 a B10; konkrétní fasádové fotografie stále chybí. |
| B10 | 53929067 | Východní konec jižní řady; detaily se mají ověřit jednotlivě. |
| B11 | 53921163 | Odlišný nepravidelný půdorys, kratší hlavní objem severně od B10. |
| B12 | 53921168 | Nižší třípodlažní objekt východně od B11; archivovaný detail s tabulí 12 B z roku 2009. |
| Potraviny / R-ko | 7645350 | Jeden nízký společný stavební objekt; bod baru není samostatná budova ani zaměřené dveře. |
| Menza Strahov | 8111356 | Jezdecká 1920/1 podle SÚZ, samostatná od B1; fotografie ukazuje velké prosklení, světlé panelové obložení a schody. |
| Velký stadion | relation 1515034 / 1515375 | Sportovní prstenec, otevřený střed, tribuny a podpory. Historická panoramatická fotka rozlišuje stadion od kolejí. |

Fotografie ČVUT exteriéry **1, 2 a 8** mají přímo viditelné označení B4. Snímek **9** má nápis Menza Strahov a jeho identita souhlasí s adresou SÚZ. Snímek **3** je užitečná předloha dlouhé fasády, ale nemá doložené číslo bloku. Snímek **10** má červené křídlo; samotná barva nestačí k přiřazení ke konkrétnímu bloku. Rekonstruované sprchy B4 nelze automaticky použít jako skutečný interiér B6.

## Fotografie a panoramatický průzkum

[photo-index.json](photo-index.json) obsahuje **146 individuálních fotoodkazů ČVUT**: 12 exteriérů, 62 snímků rekonstruovaného B4, 57 snímků otevření a návštěvy B3, 15 historických pokojů. Sedm konkrétních snímků bylo vizuálně otevřených v běžném prohlížeči. Zbývající odkazy jsou výslovně `not-reviewed`; jejich zahrnutí do katalogu není tvrzením, že byly všechny lokalizované. Navíc byly vizuálně prohlédnuté a s uvedením autora/licence archivované dvě historické fotografie Wikimedia Commons.

[panorama-survey.json](panorama-survey.json) navazuje na dřívější individuálně prohlédnuté záznamy v `docs/references/atlas.json`. Eviduje kameru, souřadnice, původní heading/pitch/FOV, pano ID, datum, zakrytí a konkrétní fasády. Dnes doložené pokrytí:

| Stanoviště | Datum | Doložená část | Co nepokrývá |
|---|---|---|---|
| B6 Google `gWCshoWQgiJdy1QWcqe1eQ` | září 2025 | Severní čelo, kontext vstupu | Obě celé dlouhé fasády a jih |
| B6 Mapy `101883263` | 1. 6. 2023 | Sever a bok vstupního krytu, okolí | Úplná východní/západní fasáda |
| B7 Google `2UCXwe4UgzW5bAoI5ZFssA` | květen 2024 | Jih, jižní východní část, 007 | Sever, západ a zbývající východní část |
| B7 Mapy `94772339` | 21. 5. 2022 | Přístavek Sport baru a pěší plochy | Není důkazem dveří 007 |
| R-ko Mapy `101883310` | 1. 6. 2023 | Východní stěna a zasazení do svahu | Přesné dveře baru, celé dlouhé fasády |

**Praktický postup inspirovaný GeoGuessr:** otevřít skutečné panorama, zaznamenat stanoviště a pomocí běžných šipek projít na sousední. Každý takto skutečně provedený krok přidat jako orientovanou hranu mezi pano ID. Zatím máme pět stanovišť a **nula ověřených sousedních hran**; blízké souřadnice ani navržená trasa neopravňují spojení vymyslet. Navržené kontrolní trasy jsou označené odděleně od skutečné navigace poskytovatele.

Každou stěnu porovnat alespoň ze dvou odlišných směrů, přiřadit OSM ID a jméno fasády, zaznamenat stromy, auta, deformaci spojů a rozdílné roky. Rozměry zakotvit do geodat a skutečného zaměření. Panorama slouží k inspekci; není hotový 3D model ani kalibrovaná fotogrammetrická sada. Google, Mapy.com a GeoGuessr nejsou hromadně stahované. Jejich obrazová média nejsou součástí herních textur.

## Reprodukce a ověření

Z kořene repozitáře:

```powershell
node docs/world-architecture/build-catalog.mjs
node docs/world-architecture/build-panorama-survey.mjs
node docs/world-architecture/collect-photo-links.mjs
node docs/world-architecture/build-atlas.mjs
pnpm exec tsx docs/world-architecture/verify.mts
```

První dva skripty čtou existující mapu/OSM atlas. Třetí potřebuje síť pro čtyři veřejné galerie a dvě licencované fotografie Commons; u ČVUT ukládá pouze odkazy. Katalog uchovává SHA-256 mapy/XML, index SHA-256 archivovaných fotografií. Atlas je samostatný a nevyžaduje účet ani externí JavaScript.

Geometrické kontroly prošly: všech 70 mapových identit, úplné číslování B1–B12, zachování doložených výšek/podlaží, všechny původní vrcholy uvnitř natočených obálek, shodné půdorysy, správný otvor stadionu při triangulaci, platné vazby zdrojů a kontrolní součty archivů. V prohlížeči byl ověřen výběr Menzy a filtrování na B4. Kompletní `pnpm exec tsc --noEmit` prošel také po integraci souběžně upravovaného rendereru.

## Zbývající mezery

Většina bloků má jistou mapovou identitu, ale nemá individuálně ověřené čtyři fasády. Chybí přesný výškový model terénu, zaměření podlaží/schodišť a úplné aktuální interiéry. Plánek B6 z roku 2023 nerozlišuje všechny změny využití místností do roku 2026. Přesné dveře R-ka a rozdělení jeho prostoru od Potravin stále nejsou doložené. Úroveň detailu musí zůstat označená jako aproximace do doplnění podkladů.
