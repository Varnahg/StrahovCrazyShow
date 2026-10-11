# Grafická vrstva prostředí

Implementováno 10. 10. 2026. Navazuje na [výtvarný směr](../art-direction/ART_DIRECTION.md) a [katalog staveb](../../shared/data/building-catalog.json).

## Co je ve hře

- Tlumená společná paleta omítky, betonu, soklů, asfaltu, chodníků, vegetace a dřeva. Stavební povrchy mají velmi nízký specular; číslo bloku už nevybírá náhodnou barvu.
- Skutečné polygonové obrysy budov zůstávají zachované. Hlavní kolejní stěny dostaly široká trojdílná okna; čela jsou šedá se střídmými párovými malými otvory. B8 má samostatnou variantu rytmu, B12 používá svou nižší výšku. B1, Menza, Potraviny, garáže a neidentifikované objekty nedostávají kolejní rastr.
- Tři vlastní malé fasádové atlasy s mipmapami a 4× anizotropií nahrazují tisíce okenních kvádrů. Zobrazují rámy, sklo, ostění a parapety. Nejde o fotografie z cizích služeb ani o přesně zaměřenou fasádu.
- Sokly a tenké střešní hrany jsou skutečná geometrie uvnitř existujícího obrysu. Přidaná střecha a fasádový atlas nahrazují odpovídající původní plochy; nevznikají dvě téměř koplanární vrstvy, které by na dálku blikaly.
- B6 zachovává průchozí původní interiér, západní vstup a schodiště. Atlas nepřekrývá otevřenou část přístupu. U nahrazených venkovních stěn zůstává tloušťka, vnitřní povrch a nezávislý collider.
- Velký strahovský stadion má vlastní otevřený prstenec podle OSM s vnitřní dírou a samostatnými částmi. Nemá kolejní okna ani střechu přes hřiště. Je dekorativní kulisa za herní hranicí.
- Mraky používají jedinou vlastní měkkou alfa texturu a 24 ploch ve dvou výškách, celkem 48 trojúhelníků. Množství a odstín se mění plynule podle počasí. Nejde o volumetrickou simulaci.
- Lampy mají matný stožár, kryt a levnou teplou světelnou skvrnu na zemi. Nízká kvalita nepřidává dynamická bodová světla; střední a vyšší zapne nejvýše dvě nejbližší bez stínů.
- Gradient oblohy má pouze 12 trojúhelníků. Den, nízké slunce, soumrak, noc a zatažení interpolují barvu klíčového světla, ambientu a horizontu. Slunce pod obzorem nesvítí zdola; volitelný měsíční příspěvek je nejvýše 0,1. Počasí přechází přibližně pět sekund, déšť mírně ztmaví asfalt.

## Zapojení světla

`applyArtLighting(this, { sun, moon, weather: this.weather, player: pos, dt })` z `client/art-lighting.ts` se volá jednou před `scene.render()`. Kontext hry poskytuje scénu, hlavní a hemisférické světlo, lampový materiál, pole lamp a mraků a kvalitu.

Kontrolér nahrazuje přímé přepisování intenzity slunce/ambientu, barvy oblohy/mlhy, hustoty mlhy, intenzity lamp a zapínání mraků. Existující posun mraků podle větru může zůstat. Výpočty poloh slunečního a měsíčního kotouče i částic deště zůstávají v herní smyčce.

## Ověření

`pnpm exec tsx --test tests/graphics.test.ts`: 5/5 testů prošlo. Kontrolují svit vzhledem k obzoru, omezený měsíční příspěvek, rozsah mlhy, kontinuitu úsvitu, orientaci normál a rozlišení katalogových typů.

`pnpm exec tsx docs/graphics/verify.mts`: Babylon NullEngine skutečně sestavil celý svět. Výsledek před přidáním avatarů, auta, gradientu oblohy a deště:

| Metrika                               | Výsledek |
| ------------------------------------- | -------: |
| Meshů                                 |       60 |
| Trojúhelníků                          |   42 940 |
| Materiálů                             |       28 |
| Meshů / trojúhelníků mraků            |  24 / 48 |
| Zapnutých dynamických lamp na začátku |        0 |

Kontrola NullEngine není screenshot, test GPU ani měření FPS. Skutečný počet viditelných průchodů, dlouhý benchmark a stabilitu za pohybu je nutné hodnotit v prohlížeči na konkrétním hardwaru. `pnpm exec tsc --noEmit` prošel.

## Přesnost a zbývající práce

Fasádové rozteče jsou typologická aproximace odvozená z charakteru doložených fotografií. Dlouhé a krátké stěny se rozlišují podle skutečných hran; nejde o zaměření každého okna. Nábytek a interiér B6 jsou zatím demonstrační. Menza má doložené velké prosklení, ale fotografie nebyla bezpečně přiřazena konkrétní světové straně; její objem proto zůstává střídmý, dokud se toto neověří. Totéž platí pro přesné výkladce a dveře Potravin/R-ka.

Statická geometrie se aktuálně slučuje podle materiálu, což omezuje průchody, ale má hrubý culling. Prostorové slučování 32–64 m buněk je další měřitelný krok; tato vrstva jej nevydává za hotový. PBR, sluneční stíny a náročné postprocesy nejsou zapnuté.
