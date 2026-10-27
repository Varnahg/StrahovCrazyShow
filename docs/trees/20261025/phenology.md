# Regionální sezónní model stromů

Rozhodnutí před implementací, 25. 10. 2026. Tento model je vizuální regionální aproximace pro Prahu, nikoli dnešní botanické pozorování Strahova, určení místních druhů nebo údaj meteostanice Silicon Hill.

## Primární podklady a licence

[ČHMÚ, otevřená fenologická data](https://opendata.chmi.cz/meteorology/phenology/wood_species/) poskytuje jednotlivé druhy a metadata stanic. [Popis polí](https://opendata.chmi.cz/meteorology/phenology/fenologicka_data_popis.pdf) rozlišuje datum nástupu fáze od kódu `444` (fáze nenastala). [Oficiální podmínky ČHMÚ](https://www.chmi.cz/o-chmu/produkty-a-sluzby/data-a-vyhodnoceni) potvrzují [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Atribuce derivace: **Český hydrometeorologický ústav (ČHMÚ), fenologická pozorování 2014–2025; regionální zpracování a umělecké křivky projektu StrahovCrazyShow.** ČHMÚ tento herní model neověřoval ani neschvaluje.

Použité regionální stanice: Mšecké Žehrovice P1MSZE31 (460 m), Benešov P3BENS31 (370 m), Doksany U1DOKS31 (155 m), přibližně 36–44 km od Strahova. Lípa, bříza a habr tvoří obecnou listnatou oporu; modřín samostatnou oporu opadavého jehličnanu. Žádný z těchto druhů se tím nepřiřazuje stromům ve hře. Nejde o třicetiletý klimatický normál. Dostupnost kombinací stanice/druh je nerovnoměrná (11 z 12 kombinací); chybějící záznamy se nedoplňují.

Raw UTF-8 CSV a derivace jsou v `.cache/trees-phenology-20261025/`; verzovaný `shared/data/tree-phenology.json` obsahuje pouze odvozené souhrny, parametry, přesné URL, bajty a SHA256 vstupů. Reprodukce: vybrat roky 2014–2025, tři uvedené stanice, fáze PL10/LX/ZL10/ZL100/OL10/OL100; validní celočíselné pořadí dne 1..365/366 přepočítat na `(DOY−1) × 365 / délka gregoriánského roku`. Kódy 444 a jiné chybějící/neplatné hodnoty vyloučit, nikdy nezaměnit za datum. Nejprve medián každé stanice/druhu/fáze, pak rovnoměrně vážený medián těchto mediánů v každé skupině, zaokrouhlený na 0,1 modelového dne. Souhrny uchovávají počty a rozptyl; všech 66 vybraných souhrnů v tomto výřezu má validní pozorování bez 444. Roky s extrémně časným opadem se nemažou jako údajná chyba.

| Skupina | První listy 10 % | Plné olistění | Žloutnutí 10 % | Žloutnutí 100 % | Opad 10 % | Opad 100 % |
|---|---:|---:|---:|---:|---:|---:|
| Generický listnáč | 102,6 | 120,7 | 263,3 | 289,8 | 279,3 | 311,0 |
| Opadavý jehličnan | 97,5 | 118,5 | 284,5 | 302,5 | 299,5 | 331,0 |

Čísla jsou odvozená fáze v normalizovaném 365denním UTC roce, **nikoli přesné datum Strahova**. [ČHMÚ PTT](https://www.chmi.cz/namerena-data/fenologicky-vyvoj-vegetace) používá historii efektivních teplot a délku dne; model tuto historii nemá a nepředstírá GDD z aktuální teploty. [Arnold Arboretum](https://arboretum.harvard.edu/collections/conifer-collection/) rozlišuje stálezelené a opadavé jehličnany; [obnova jehličí evergreenů](https://arboretum.harvard.edu/stories/evergreens-are-deciduous-too/) není celoplošný zimní opad.

## Zvolená reprezentace a zamítnuté varianty

Čtyři skupiny: `deciduous-broadleaf`, `evergreen-conifer`, `deciduous-conifer`, `reference-bare`. Referenčně holý strom zůstává bez listí; fotografie sama neurčuje příčinu holé koruny. Barevná změna, množství listů, zralost a dostupný opad jsou samostatné veličiny 0..1. Nejsou to procenta přímo naměřená na místním stromě.

Zvoleny jsou spojité smoothstep segmenty s nulovou derivací v uzlech. Množství listů stoupá z nuly 12 modelových dní před PL10 přes 0,1 v PL10 k jedné v LX. Obdobně klesá před OL10 přes 0,9 v OL10 k nule v OL100. Zralost dobíhá 14 dní po LX. Vybarvení začíná 14 dní před ZL10, dosahuje 0,1 v ZL10 a jedné v ZL100. Již neviditelný kohortový stav zralosti/vybarvení se po OL100 vymaže během 21 dní, takže přechod roku je plynulý. Tyto mezilehlé tvary/okraje jsou výslovná umělecká interpolace, ne měření.

`litterPotential` vyjadřuje relativní zdroj opadu pod danou skupinou: podzimní úbytek plus předchozí kohorta přetrvávající v zimě a ustupující před novým plným olistěním. Není to `1−leafAmount`, pokrytí půdy ani fyzikální bilance. Samostatný `ground.litterRetention` určuje modelovou sezónní retenci/úklid; prostorový renderer musí stále použít kořeny, rozměry, terén a vlastní výluky. `ground.flowerBloom` je explicitně umělecký jarní vrchol a slabší pozdně letní/podzimní okno obecných žlutých květů; není to monitoring pampelišek ani jejich lokální druhové určení. Oba hooks pouze poskytují hodnotu, nic nemění v GroundFlowers ani ground materiálu.

Evergreen zachovává `leafAmount=1`; slabší modelová jarní obnova a podzimní výměna části jehličí nemohou odhalit celý holý strom. Opadavé jehličnany podporujeme jako schopnost, bez nového automatického místního přiřazení. Generické seed odchylky mají 17 pevných hodnot v rozsahu ±4 modelové dny; seed0 je neutrální. Jde o uměleckou variaci. Žádné náhodné hodnoty podle framu nebo délky relace.

Zamítnutý je čtyřstavový skok podle měsíce, přebarvení bez opadu, libovolná teplotní reakce bez historie a neomezená cache všech dat/seedů. Výpočet používá jediný UTC instant, normalizovaný celý gregoriánský rok (přestupný rok nemá skok u března). Vzorek je explicitně označený `sampledAt` a obnovuje se jednou za UTC minutu. Cache drží nejvýše 8 stavů; seed výsledky jsou konečné sloty, nikoli rostoucí mapa identit. Opakované snímky nepotřebují nové objekty ani Date. Neplatný datum/source/seed se odmítne výjimkou; nevymýšlí se náhradní aktuální čas.

## Preview a integrační hranice

Preview je čistá explicitní volba `real/spring/summer/autumn/winter`, nikoli per-frame solver. Kotvy jsou 20. dubna, 15. července, 20. října a 15. ledna aktuálního UTC roku. Při lighting `real` se zachová UTC čas dne; při ostatních režimech se **nejdříve zvolí sezonní datum a teprve potom** volá stávající `selectLightingPreview`. Tak golden/blue/full-moon zůstávají skutečné astronomické konfigurace daného výsledného UTC okamžiku. Úplňkový solver může posunout datum o další dny; sezóna se následně vyhodnotí z výsledného okamžiku, nikoli ze staré kotvy. Návrat na seasonal `real` zachová dosavadní lighting selection. Výsledek obsahuje vrácenou lighting selection, již má root převzít do UI, včetně případného solver fallbacku.

Root použije `selection.instant ?? realNow` pro astronomii i `getTreeSeasonState`; source je demo při kterémkoli časovém preview, jinak regional-model. Meteostanice, její datum i fieldSources zůstávají vlastními skutečnými daty. Tento task neupravuje Game/UI/lighting-preview ani GroundFlowers.

UI musí uchovat **base lighting selection** odděleně od effective seasonal výsledku. Jinak by přepsání původního day/25.10 složeným day/20.10 ztratilo datum pro návrat na season real. Vrácené `.lighting` slouží efektivnímu readoutu/fallbacku; původní base instant se nepřepisuje sezonním instantem. Neplatné/mismatched preview vstupy vracejí real/null. Čistý season model podporuje celý rozsah JavaScript Date, ale složený astronomický preview používá pouze čtyřciferné roky1000..9999, které dosavadní lighting ISO parser umí nezaměnit; mimo ně je bezpečný real/null fallback. Skutečné současné datum není omezené.

## API, cache a ověření

`getTreeSeasonState(instant, source = "regional-model")` vrací immutable `TreeSeasonState` s `model`, `source`, `sampledAt`, `revision`, `year`, `phaseDay`, `groups: Readonly<Record<TreeFamily, TreePhenology>>` a `ground`. `phenologyForTree(state, family, seed = 0)` používá přímo tento factory stav; jeho interní konečný cache se neserializuje. Pro předání do jiného procesu předej instant/source a stav znovu vyhodnoť, nekopíruj factory objekt. Identita výsledku pro stejnou minutu/source/seed bucket zůstává. Seed je konečné číslo převáděné na uint32; NaN/Infinity, neznámá skupina nebo neplatný stav jsou RangeError. Runtime model nečte Date.now, počasí ani browser timezone. Module cache drží pouze osm malých datových stavů a žádné renderer resources, takže nevyžaduje scene-dispose hook.

`SEASON_PREVIEWS`, `SeasonPreviewMode`, `SeasonPreviewSelection`, `isSeasonPreviewMode` a `selectSeasonPreview(mode, baseLighting, now)` jsou exportované z `client/season-preview.ts`. Preview vrací `{mode, instant, source, lighting}`. Při season real + jakémkoli nenulovém lighting instantu je source stále demo. UI labels sezonních voleb explicitně obsahují DEMO; i18n a připojení patří rootovi.

Ověření: `node node_modules/tsx/dist/cli.mjs --test tests/tree-season.test.ts tests/season-preview.test.ts` — **13/13 PASS**, exit0, **383,246 ms**; `.cache/trees-phenology-20261025/targeted-tests.log`. `node node_modules/typescript/bin/tsc --noEmit --pretty false` — **PASS**, exit0; `typecheck.log`. Testy procházejí hodinově celý přestupný rok, monotonicitu rašení/opadu, samostatný model opadu a květů, všechna čtyři chování, UTC/device timezone, roky0/99/1900/2000/2100/2400, krajní platné JavaScript Date a odmítnutí neplatných hodnot. Cache testy prokazují vyhazování starých minut, neměnnost i nejvýše17 různých seed výsledků. Preview test používá skutečný SunCalc nad všemi sezonními kombinacemi zlaté/modré hodiny a úplňku; také původní base-lighting round trip. Metadata test znovu odvodí agregátní kotvy z verzovaných dílčích souhrnů. Žádná síť v testech, GPU, build ani fullsuite.

Hodnoty jsou připravené pro renderer integraci. Neprohlašují fyzicky změřenou rychlost růstu, opadu, rozkladu, kvetení ani hotovou obrazovou přejímku hry. Přesné source hashe a další integrační kroky jsou v handoff stejného tasku.
