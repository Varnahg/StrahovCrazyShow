# Světlo, mlha a srážky · 12. 10. 2026

Záměr je čitelná pohádková atmosféra se skutečnou astronomickou geometrií. Žádné assety Hogwarts Legacy nebyly převzaté. Teplý západ, chladná měsíční noc a teplé doložené lampy jsou výtvarné směrování, nikoli kalibrovaná fotometrie Strahova.

## Primární podklady

- [Krisciunas & Schaefer, PASP 103 (1991), 1033–1039](https://articles.adsabs.harvard.edu/pdf/1991PASP..103.1033K), rovnice 20, ověřeno 12. 10. 2026: relativní intenzita je normalizovaná k úplňku z `10^(-0.4*(0.026*alpha + 4e-9*alpha^4))`, kde alpha je fázový úhel ve stupních. Čtvrť tak má přibližně 9 % jasu úplňku. Vzdálenost přidává poměr `(384400 / distanceKm)^2`. U nepatrného srpku je přidaný hladký herní útlum k nule, aby nov nerozsvěcel areál.
- [Kasten & Young (1989), Applied Optics 28, 4735](https://doi.org/10.1364/AO.28.004735), vzorec relativní optické dráhy; implementace ověřena i proti [FAO pyWaPOR](https://www.fao.org/aquastat/py-wapor/et_look_rsts/clear_sky_radiation.html). Výšky SunCalc 2 jsou již refrakcí opravené. Koeficient útlumu 0,16 a hladké vynoření prvních 3° jsou herní odhady, nikoli změřené aerosoly.
- [WMO Guide to Meteorological Instruments, část I, dohlednost](https://www.weather.gov/media/epz/mesonet/CWOP-WMO8.pdf): meteorologický optický dosah odpovídá propustnosti 0,05. Používáme `density = -ln(0.05) / visibilityMetres` pro Babylon EXP mlhu, s omezením extrémů. Dohlednost je model Open-Meteo, nikoli měření stanice. Na obvyklých 1–40 km vztah zůstává přesný; extrémy pod 120 m jsou kvůli hratelnosti omezené.
- [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), znovu ověřeno 12. 10. 2026: zachovaná LROC barevná textura, mapa středu přivrácené polokoule. Světlý okraj a terminátor jsou vypočítané; fyzikální librace a zatmění se neřeší. V denní obloze se neosvětlená část kotouče mísí s přesným pozadím, nikoli s tmavou náhradní barvou.
- Lokální Babylon **9.30.0**: shader EXP fog, `ShaderMaterial`, `ShadowGenerator` PCF, `ImageProcessingConfiguration` ACES. [Stíny a omezení](shadow-sources.md), [HYG/USNO/IERS a mraky](atmosphere-sources.md), [Open-Meteo a stanice](provider-sources.md).

## Integrované chování

`sampleArtLighting` rozlišuje Slunce, Měsíc a žádný přímý zdroj. Světlo pod horizontem je nulové. Oblačnost/srážky tlumí přímý zdroj, zatímco denní difuzní obloha zůstává čitelná. Měsíční škála 0,035 při průměrné vzdálenosti, slabý noční orientační fill, expozice 1,08–1,18 a barvy jsou výtvarné jednotky. Nesmějí se prezentovat jako lux nebo jako fyzikálně absolutní poměr Slunce/Měsíce.

Stejný dominantní vektor řídí světlo i jednu stínovou mapu. Silné zatažení, žádný zdroj nebo zdroj pod obzorem vypínají průchod. Rozlišení a PCF zůstávají v původním rozpočtu kvality. Není to ray tracing, úplná objemová atmosféra ani fyzikálně proměnlivá penumbra; stíny jsou lokální kolem hráče. Mraky vrhají pouze průměrný světelný útlum, ne prostorově přesnou putující mapu stínů na zem.

Modelová dohlednost plynule mění mlhu. Déšť a sníh mají intenzitou řízený počet pevných částic, skutečný směr proudění a odlišnou rychlost/stopu. Neznámé skupenství se nedovozuje z teploty; dešťová stopa je explicitní vizuální fallback. Sníh se neukládá na zem. Místní proudění mezi budovami se nesimuluje.

Refaktoring sjednotil stárnutí serverové i klientské odpovědi do `ageWeatherSnapshot`, ponechává neměnné starší snapshoty a samostatné původy modelových polí. Astronomie má sekundovou cache, světelná paleta 10Hz cache; textury vznikají jednou a všechny vlastníky lze bezpečně uvolnit. Stará oblačná geometrie a neaktivní náhradní sluneční/měsíční koule se již nevytvářejí.

Výkon a výsledné snímky patří vždy konkrétnímu produkčnímu snapshotu v `docs/verification.md`. Průběžné vývojové snímky `atmosphere-evidence/*initial.jpg` nejsou finální přejímka ani srovnávací GPU měření.
