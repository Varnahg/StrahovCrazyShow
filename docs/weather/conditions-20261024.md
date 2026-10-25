# Podmínky počasí a oprava oblohy – evidence 24.–25. 10. 2026

## Současný stav a rozsah zadání

Uživatel požaduje celkově realističtější počasí, více efektů, lepší oblohu, hvězdy, Měsíc, Slunce a jejich fáze, skutečné zakrývání světla mraky a rozsáhlý výzkum vhodného řešení. Níže jsou oddělené dokončené dílčí změny, jejich skutečná přejímka a dosud neimplementované možnosti. Úspěch jednoho efektu nebo CI není dokončením celého tohoto rozšíření. Historické oddíly zachovávají původní měření; aktuální stav určuje tento přehled a novější odkazovaná evidence.

| Oblast | Implementovaný stav | Důkaz a zbývající mez |
| --- | --- | --- |
| Data a DEMO | Stanice/model/stale mají oddělený původ; 30 zachycených položek, 26 DEMO scénářů, čas oblohy nezávislý na skutečném stáří dat | R4 datové opravy: 38/38 cílených testů; žádné tvrzení, že DEMO je měření |
| Slunce, Měsíc, hvězdy | SunCalc poloha/fáze/vzdálenost z UTC, skutečný úhlový průměr, LROC textura, HYG katalog a jemná scintilace | Staniční fáze je publikovaný výpočet; librace, reliéf terminátoru a kalibrovaný městský jas nejsou dokončeny |
| Mraky a světlo | Opravená sférická projekce tří vrstev; společná maska kotoučů/hvězd a lokální přímé světlo z 21 vzorků; zapojené odstranění druhého globálního cloud faktoru | CPU důkaz a integrace jsou hotové; nejde o objemové mraky, prostorovou mapu stínů celého kampusu ani cloud-aware IBL |
| Obdélníkový glow | Spojitá bloom extrakce namísto binárního prahu | **Denní GPU v4 PASS při bloom ON**, omezená noční kvalitativní kontrola; podrobnosti a přesné snímky v [evidenci světla](cloud-light-integration-20261025.md) |
| Srážky | Jeden indexed quad batch, rodiny déšť/mrholení/sníh/směs/kroupy, korektní perspektivní směr a omezené buffers | **R3 menší objem vizuálně přijat v celé WebGL2 i nativní WebGPU hře**; srovnatelný krátký A/B a jeho meze jsou v [evidenci srážek](precipitation-renderer-20261025.md) |
| Povrchy a širší atmosféra | Základní mokrost a modelová dohlednost; primární srovnání dalších metod je níže | LUT atmosféra, volumetrická self-shadow, prostorové cloud shadows, odpovídající odlesky, dopady/akumulace srážek nejsou tímto prohlášeny za hotové |

Koordinátor potvrdil CI PASS pro B6 commit `f83236bc9c159eb595f1451f3c00ac3af611fadd`; místní HEAD při této dokumentační revizi odpovídá témuž commitu. Jde o samostatnou integrační evidenci B6, nikoli o GPU přijetí menšího srážkového objemu nebo celého rozšířeného počasí. Tato revize nespouští nové testy, build, GPU ani výzkumný workflow.

### Přesná přijatá GPU evidence v4

Neměnný `source-r2-v4`, source ID `9a495d0a9817a25398b9c59f5863f46743432e4db807442788499c5a21b6c456`, WebGL2, Medium, CSS/render 1260×702, jasné DEMO a UTC `2026-10-25T10:00Z`: koordinátor potvrdil nepřítomnost obdélníku při výchozím bloom ON, plynulý gradient a zachované Slunce. Capture frame 4718 je `.cache/b6-photo-refinement-20261024/revision2/bloom-gpu-v4-fixed.json`, SHA256 `4af615cc012a55c0c7c1bce0212aff74e462ce7298e44de141ec749c5b11a086`. V UV(.3,.7) klesla extrakce z původního celého RGB přibližně (.82,.95,1.05) na (.02746582,.03179932,.03521729). Přesný řetězec source/extract/blur/merge a jeho meze zůstávají v odkazované evidenci; nejde jen o úsudek z CPU.

Noční v4 kontrola zachovala lampy, teplá okna a hvězdy bez nového obdélníku. Patnáctibodová pixelová mřížka ale minula tenké jádro lampy: samostatná kvantifikace energie nočního halo, úplná weather matice, další backend a výkon celé hry nejsou z tohoto snímku doloženy.

### V8 náhled neexpiruje; vítr se vyhlazuje

Čtecí audit `strahov-sky-1792901715315.json` z Downloads, SHA256 `69d7972ab6f33384ddbb100e276a5134b67226b00db22f53faaa394ac422308e`, zachytil WebGL2 draw 1024 částic/6144 indexů. Soubor vznikl `2026-10-25T04:15:15.315Z`, astronomický čas byl samostatný náhled `2026-10-25T10:00Z`, weather marker `rain-heavy`. Proti neměnnému v8 snapshotu `7a2e36cd02297c4fe1cc2c9bfd6395881118b3849a3f00a8d1dbfd9f4faf1484` byly ověřeny shodné bajty Game, SkyWeather, shared/weather a scénářů; novější R3 precipitation runtime se od v8 liší a tento capture jej nepřijímá.

`Game.effectiveWeather` drží preview do explicitního vypnutí. Preview má `observedAt:null` a `stale:true` už od vzniku, nikoli až po několika minutách. SkyWeather ani částice podle těchto polí nepřepínají na živé počasí. Zachycené windX −4.6015667915 a motionTime 1.0082999468 odpovídají rovnici `3 + (−6.3 − 3) * exp(−1.0082999468 / 5) = −4.6015670042`. Jde o silnou shodu s očekávaným pě­tisekundovým vyhlazováním k DEMO větru +3 m/s, ne o doloženou chybu znaménka FROM. Předchozích −6.3 m/s je odvození, protože capture neukládá prior wind ani okamžik volby.

`motionTime` roste pouze při aktivních srážkách a moduluje se po 125.6637 s; není to měřič času od výběru. Filtr používá renderové dt omezené na 0.1 s, takže skrytá karta nebo pomalé snímky neposouvají jeho stav podle celé uplynulé doby na hodinách. Při uvedeném přechodu změní vítr znaménko po 5.657 aktivních sekundách a po 30 s dosáhne +2.97695 m/s. Pro srovnání počkat na ustálení a zaznamenat raw target, smoothed wind a render elapsed; alternativou pro deterministické DEMO je výslovné okamžité nastavení filtrů při změně jeho identity, se zachováním plynulých live aktualizací. Tato alternativa **není implementovaná** a vyžaduje jednotné rozhodnutí pro povrchový i výškový vítr. Oprava timestampů preview by řešila neexistující expiraci.

## Datové guardy po nezávislém auditu – 25. 10. 2026

Čtecí audit skutečného zachyceného HTML odhalil dva případy nesprávného fallbacku. Při odstranění jediného venkovního labelu `Teplota:` parser převzal21.8°C ze sekce **Serverovna** a označil ji jako živou venkovní hodnotu. Samotné pořadí stejně pojmenovaných řádků proto nestačí. Leaf parser nyní zachovává explicitní sekce `Aktuální podmínky`/`Serverovna`; všechny indoor položky zůstanou v publikovaném přehledu, ale nevstupují do číselných venkovních polí. Chybějící, neplatný nebo duplicitní venkovní core údaj odmítne stanici a dovolí model/prior fallback. Není přidána HTML/DOM závislost a zůstává podpora skutečné chybně uzavřené tabulky.

Druhý případ: budoucí čas byl správně označen jako stale, ale porovnání nejvyššího timestampu jej přesto vybralo před platnou cache. Sdílený `isWeatherTimeAdmissible` nyní pro stárnutí i arbitráž používá stejnou dosavadní toleranci5min do budoucnosti a vyžaduje konečný čas. Vybírá se nejnovější **přípustný** snapshot, nikoli vždy previous. Pokud nepřijde nový platný zdroj, zachovaná skutečná data i fieldSources se označí stale; pokud není žádná přípustná historie, vrátí se označený unavailable stav bez teploty nebo falešného měřicího času. Renderingové DEMO vstupy ani skutečný UTC čas nebyly změněny.

Reprodukce4/4 byly před opravou RED. Finální cílené weather/provider/freshness/scenarios + UI preview/HUD testy **38/38 PASS**, žádný skip, exit0, TAP2.487s; strict cílený TypeScript PASS. V cache `data-guards-red.log`, `data-guards-final-tests.log` a `data-guards-typecheck-final.log`. Test původního HTML uchovává původní30položek a čas22:09:10Z, rozlišuje4.2°C venku od21.8°C uvnitř. Provider regrese potvrzují model při neplatné stanici a skutečnou starší stanici/model při výpadku obou zdrojů. Tyto kontroly neprokazují GPU kvalitu oblohy ani nové živé meteorologické měření.

Průzkum proběhl v pracovní kopii `cad-building-models`, výchozí commit `e7ef3ff6`. Hraná neměnná verze na 2591 nebyla ovládána ani přestavena. Toto je evidence implementačního úkolu; GPU přejímku a integraci vede koordinátor.

## Druhý implementační checkpoint: shodný mrak a přímé světlo

Koordinátor zadal pokračování 25. 10. po půlnoci místního času, opět ve stejném rezervovaném scope. Před implementací je zvoleno bilineární CPU vzorkování **stejných bajtů atlasu** jako `RawTexture`, se shodnou repeat adresací a texel-centre konvencí, po stejném shaderovém průsečíku a transformaci cirrů. Pinovaný `rawTexture.js` potvrzuje `invertY=false`, RGBA8 a předání téhož bufferu enginu. GPU implicitní mipy zůstanou zachované; CPU LOD0 průměr přes kotouč je metrická irradiance aproximace, ne tvrzení pixelové shody minifikovaných hran u obzoru.

| Varianta | Rozhodnutí / důvod |
| --- | --- |
| Dál násobit celkovou oblačností | Nezajistí, že mezera před Sluncem rozsvítí scénu; zamítnuto |
| Jediný vzorek uprostřed kotouče | Levné, ale neodpovídá částečnému zakrytí a může kolísat na hraně; nahrazen pravidelným plošným průměrem |
| GPU readback světelné masky | Přesnější raster, ale latence/stall a asynchronní vlastnictví; pro první celek zamítnuto |
| 21 bodů pravidelné sítě uvnitř kotouče, CPU bilinear | Zvoleno: konečný počet vzorků, kontinuita, žádná per-frame alokace ani nový GPU zdroj; použije skutečný úhlový průměr obou těles |
| Prostorová cloud shadow mapa pro celý kampus | Významně širší material/shadow scope; samostatný následný celek, lokální directional transmission se za ni nevydává |

Aktualizace atmosféry proběhne jednou za snímek **před** aplikací přímého světla; použije stejný drift/coverage, jaký dostanou shadery. Palette cache zůstane 10 Hz, přímé světlo se aktualizuje bez nových barev/vektorů. Samostatný útlum deště a mlhy se neaplikuje dvakrát. Při stoprocentní nízké oblačnosti zanikne přímý key, ambient zůstane; stávající skutečné stíny dál řídí výsledná intenzita.

Nová lifecycle regrese odhalila další doložený mechanismus: starý `atmosphereDensity` vracel při coverage=1 přesně 1, ale těsně pod ní některým texelům jen 0,3–0,5. První stage-2 běh proto skončil 42/43 (log `stage2-first-tests.log`), nikoli vizuální PASS. Varianty: odstranit saturaci by porušilo plně zatažené nebe, zúžit noise práh by udělalo nestabilní hrany. Zvolený společný CPU/GLSL/WGSL smooth blend pouze v krajních 7,5 % coverage zachová plné jasno/zataženo a spojitost; kalibrace 0,1–0,9 zůstane nezměněná.

U hvězd je po [primárním vysvětlení NASA](https://starchild.gsfc.nasa.gov/docs/StarChild/questions/question26.html) zvolena pouze slabá scintilace, silnější nízko nad obzorem. Polohy RA/Dec, katalog, textura/PSF i průměrný pražský noční jas se nemění. Amplituda/frekvence jsou výtvarná aproximace, nikoli údaje ze stanice. Dvě omezené plynulé fáze nepřidají textury ani particle systém; PSF refaktoring a více hvězd se odkládají do GPU přejímky při skutečném rozlišení. Animace používá renderové dt, nikoli skoky astronomického preview času.

Druhý checkpoint je implementován: `AtmosphereSky.lightTransmission` je opakovaně použitý readonly `{sun,moon}` objekt. `applyArtLighting` po jediném update atmosféry aplikuje jeho hodnoty bez nových Color3/vektorů; pure `sampleArtLighting` zůstává kompatibilní pro samostatné reference. U Měsíce jsou vzorky vážené stejnou osvětlenou normálou jako lunární shader, takže zakrytí tmavé poloviny nemění osvětlený srpek. Velmi úzký srpek menší než rozestup sítě má jeden reprezentativní vzorek jasného okraje. Staré globální tlumení mraků se v přímém klíči znovu nenásobí.

`stationAstronomy` nyní zachovává publikovaný lunar readout, `kind: calculation`, `publishedAt` a procento/dorůstání, pokud je stránka publikuje. Není přidána měřená fáze do `fieldSources`. Zemské souřadnice ani čas rendereru se nenahrazují hrubým textem stanice.

Finální cílený běh druhého checkpointu: **64/64 PASS, exit 0, 6,30 s**; stejné soubory jako první 56testový běh plus `tests/sky-weather.test.ts`. Log `.cache/weather-sky-revision-20261024/stage2-final-tests.log`. Nové testy kontrolují shaderové rovnice nezávislým CPU vyjádřením, texel-centre/repeat/bilinear, plochu kotouče a osvícenou půlku Měsíce, spojitost coverage endpointů, 30sekundový lifecycle při renderovém dt 1/60, jeden drift update za frame, neměnnou geometrii hvězd při běžící scintilaci, opakované použití textur a cleanup. Testový limit změny za snímek je aplikován při skutečném 60Hz render dt; matematická kontinuita je zvlášť ověřena pro všechny atlas ranks. GPU mipy nejsou CPU LOD0 a shaderový compile není vizuální PASS.

Na konci tohoto druhého checkpointu ještě zbývalo odstranit druhý globální cloud faktor v `cinematic.ts` a doplnit `AtmosphereSky` test double. **Následná integrace obojí provedla:** Game předává `cloudOcclusionApplied:true`, `campusShadowResponse` znovu netlumí maskovaný key celkovou oblačností a mock má `lightTransmission`. Mechanismus, cílené výsledky a navazující bloom GPU přejímka jsou v [evidenci integrace světla](cloud-light-integration-20261025.md). Nejde již o otevřený implementační krok.

### Zbývající GPU matice a regresní scénáře pro koordinátora

Pouze nový izolovaný snapshot, nikoli hraná 2591. Každý záznam musí obsahovat source/client ID, backend, kvalitu, CSS a interní rozlišení, GPU, UTC a stav skutečné/demo meteorologie.

1. **Regrese přijaté opravy obdélníku:** v4 je již GPU PASS. Na novém kandidátu s další změnou světel/postprocessu porovnat tentýž denní pohled a zachování legitimního glow. Nová izolace jednotlivých passů je nutná teprve při novém konkrétním artefaktu; není důvod znovu vydávat původní příčinu za neznámou.
2. **Denní cloud crossing:** `cloud-breaks`, UTC `2026-10-25T10:00:00Z`, pozorovatel x=110,z=12. CPU recept začíná Sun transmission=0, v 5–10 s má 1, v 15 s asi 0,74, ve 20 s 0 a v 25 s opět 1. Kamera ve hře má malý offset, časy proto ber jako vodítko; rozhoduje shoda konkrétního kotouče a světlé/stinné fasády. Pozorovat 60 s, poté otočit kameru od Slunce: přímé světlo nesmí záviset na směru pohledu.
3. **Měsíční crossing:** stejné místo a scénář, UTC `2026-10-25T22:00:00Z`; Moon transmission začíná 1, v 15 s asi 0,47 a od 20 s 0. V samostatné čtvrti/srpku ověřit, že mrak přes tmavou část kotouče nehasí viditelný jasný okraj. Fáze/vzdálenost/poziční data zůstávají astronomické.
4. **Přechod zataženo→jasno:** bez skoku času přepnout overcast→clear; žádné náhlé prosvícení při první změně z coverage=1. Ověřit frame-time při přechodu nulový/nenulový directional key a přípravu light-slot variant.
5. **Nízký horizont:** obloha v rozsahu 0–10° nad obzorem, postupná pomalá jízda a otočení o360°; zvlášť rozsah kolem4,88°. Žádný fold, hrana nebo zrychlení z clampu; porovnat minifikované cloud okraje a kotouč. LOD0 CPU diskový průměr neslibuje identické GPU mipy, přílišný vizuální nesoulad je fail.
6. **Hvězdy:** jasná noc + stejný UTC i kamera; nízké hvězdy mají o něco výraznější jemné kolísání jasu než zenit, neteleportují ani neblikají do tmy. Pak fog a overcast: hvězdy nesmí zůstat nad mrakem/mlhou. Pozorovat také low kvalitu a při zmenšeném interním rozlišení.
7. **Lifecycle:** třikrát live→demo→live, změna quality, resize a teardown; žádné další textury/materiály po opakování, žádné readback stall; živá meteorologická cache a stáří hodnot se nepřepisují. Srovnat FPS/p95/p99 ve stejné celé hře s HUD a avatary, nikoli izolovaný NullEngine.

CPU vodítko crossing scénářů v `.cache/weather-sky-revision-20261024/cloud-crossing-qa.json` má obě tělesa v rozsahu transmission 0–1 během 60 s. Nejde o GPU snímek nebo důkaz skutečného stínu mraku na budově.

## Historie původní diagnostiky před opravami

Následující body popisují stav před první opravou projekce a před GPU izolací bloom. Nejsou popisem současných shaderů ani otevřeným seznamem již vyřešených chyb.

- Původní shaderové cesty v `atmosphere-sky.ts` / `atmosphere-wgsl.ts` promítaly mraky pomocí `direction.xz / max(direction.y, .085)`. Nad 4,88° šlo o průsečík s rovinou; pod mezí se jmenovatel zastavil, horizontální složka se u obzoru zastavila a pod ním obrátila. U vrstvy 1400 m klesla absolutní derivace projekce na hranici z přibližně 193772 m/rad na 1400 m/rad: stejný drift znamenal až 138× větší úhlový pohyb těsně pod mezí. Tento doložený mechanismus byl nahrazen sférickým průsečíkem; původní čísla zůstávají důkazem příčiny, nikoli parametry dnešního rendereru.
- Screenshot uživatele ukazoval široký světlý obdélník pod malým slunečním kotoučem. Sluneční rovina zabírala jen 3,2° a tehdejší Gaussian měl na hraně nenulovou alfu; tato samostatná drobná hrana nevysvětlovala široký obdélník. Tehdy byla nutná GPU izolace. Následné A/B/A a stage capture doložily bloom extrakci a v4 opravu; přesná evidence je v aktuálním přehledu výše.
- Pinovaný Babylon 9.30.0 (`Meshes/transformNode.pure.js`) přičítá kameru k poloze `infiniteDistance` bez parenta. Shader oblohy interpoluje původní pozici boxu a normalizuje ji; hranice jeho stěn jsou matematicky spojité. ShaderMaterial alpha blending a depth-write jsou explicitní. Nebyl doložen důvod měnit celý engine ani postprocess pipeline.

## Historie variant před první implementací

| Varianta | Vzhled/chování | Náklady a rizika | Rozhodnutí |
| --- | --- | --- | --- |
| Posunout `.085` níže | Zlom se pouze přesune k horizontu, roste minifikace | Levné, ale neopraví projekci | Zamítnuto |
| Úplně skrýt nízké mraky mlhou | Maskuje zlom i za jasného počasí | Mění počasí, zakrytí slunce a vzhled horizontu | Zamítnuto |
| Paprsek protne kulovou vrstvu nad Zemí | Spojitá konečná vzdálenost i u obzoru; zachová metry a drift | Tři odmocniny/fragment, stejné textury/draw calls; třeba GPU srovnání | Zvoleno, výšky vrstev zůstávají výtvarná aproximace |
| Plně volumetrické ray marching mraky | Lepší objem a parallaxa | Nové zdroje, historie, cache a vysoká GPU cena | Mimo rozsah bez výkonových důkazů |
| Zvětšit sluneční kotouč / přidat světelný billboard | Snadný filmový efekt | Poruší úhlový průměr, přidá další rovinu/zakrývání | Zamítnuto |
| Plynule ohraničené halo a atmosférický opar | Kotouč zachová 0,533°, halo nemá hranaté okraje | Beze změny počtu textur, materiálů a draw calls | Zvoleno |
| Teplotou odvodit sníh či vlhkostí mlhu | Jednoduché | Nedokládá srážkovou fázi ani dohlednost | Zamítnuto |
| Uchovat WMO kód, oddělené původy polí a demo scénáře | Rozlišuje déšť/sníh/mlhu i nejistotu | Malé aditivní datové rozšíření, existující cache/freshness | Zvoleno |

## Primární stanice

Přímý GET `https://weather.sh.cvut.cz/weather/` dne **2026-10-24T22:09:37Z** vrátil HTTP 200, `Content-Type: text/html; charset=windows-1250`, `Last-Modified: 2026-10-24T22:09:10Z`. HTML je ve vlastní ignorované cache `station.html`. Webový index vracel odlišný čas, proto jeho hodnoty nebyly převzaty jako aktuální měření. Stránka uvádí **wview 5.21.7 / Wired Davis Vantage Pro2 Plus**, stanici 345 m n. m. a přibližné souřadnice 50,1 N / 14,4 E. Hra zachovává přesné dosavadní souřadnice Strahova pro astronomii.

| Publikovaný údaj | Jednotka / charakter | Použití a omezení |
| --- | --- | --- |
| Teplota, relativní vlhkost | °C, % | Povrchové hodnoty; hlavní teplota nesmí být zaměněna za serverovnu |
| Charakter větru | 16 světových stran, m/s, km/h | Meteorologický směr ODKUD; sekundární km/h není další měření |
| Intenzita deště, dnešní srážky, nejvyšší intenzita, storm total | mm/h; mm; maximum s místním časem | Úhrn není intenzita; nulový úhrn nezakazuje modelový sníh, fáze se neměří |
| Tlak, tendence | hPa, symbol/text | Tlak bez tvrzení o kalibrační metodě; tendenci uchovat jako zdrojový text |
| Rosný bod, wind chill, heat index | °C, odvozené hodnoty | Nejsou samostatné potvrzení mlhy, námrazy ani typu srážek |
| Hustota vzduchu | kg/m³, odvozená | Informace stránky; nemění fyziku hry |
| Základna oblačnosti | m nad stanicí, výpočet | Není ceilometr ani skutečná geometrie mraků |
| Sluneční záření | W/m² | Lokální staniční hodnota; neotáčí ani neposouvá astronomické Slunce |
| Výpar | mm | Publikovaný výpočet; stránka nespecifikuje interval dostatečně pro renderer |
| Denní max/min T, HI/WC, vlhkosti, rosného bodu, tlaku; max větru a slunečního záření; průměr větru | Hodnota a případně čas dne | Historická charakteristika dne; **maximum větru není aktuální náraz** |
| Serverovna – teplota | °C | Vnitřní měření, nepoužívá se pro venkovní počasí |
| Forecast icon | názvy `fc-icon-…` | Předpovědní ikona; není aktuální měření oblačnosti nebo srážkové fáze |
| Východ/západ, fáze Měsíce | lokální čas / popis | Publikovaný astronomický výpočet, hra počítá z UTC samostatně |

Stanice nepublikuje doložený senzor dohlednosti, hustoty mlhy, sněhové pokrývky, sněžení, krup, blesků ani srážkové fáze. Jejich vzhled musí být modelový nebo zřetelně demonstrační.

## Model a pokrytí stavů

[Open-Meteo – oficiální dokumentace](https://open-meteo.com/en/docs) potvrzuje aktuální modelové podmínky z 15minutových dat, dostupnost hodinových proměnných také v `current`, jednotky a WMO kódy. Aktuální úhrny se dělí skutečným `interval`; změna nesmí zaměnit cm sněhu s mm vodního ekvivalentu. Kódy 96/99 jsou modelové kroupy, 95/97 bouřky. Kódy 45/48 jsou mlha / námrazová mlha. Metrická dohlednost má přednost před odhadem oparu. Kódy nejsou pozice blesků a neopravňují vymýšlet živou bouřkovou detekci.

Čerstvá stanice vlastní T/vítr/srážkoměr; model doplňuje zvlášť označené vrstvy mraků, vítr ve výšce, dohlednost, úhrn sněhu a fázi. Při nesouladu „stanice sráží / model sucho“ zůstává fáze neznámá. Neznámé srážky mají pouze orientační kapalný vzhled. Nejsou vytvořeny zasněžené povrchy, kaluže, námraza ani světelné záblesky bez odpovídajícího datového a stavového modelu.

## Historie první CPU přejímky – 24. 10. 2026

Cílený příkaz `pnpm exec tsx --test tests/weather.test.ts tests/weather-provider.test.ts tests/weather-freshness.test.ts tests/weather-scenarios.test.ts tests/atmosphere-sky.test.ts tests/atmosphere-native-wgsl.test.ts tests/atmosphere-webgpu.test.ts tests/atmosphere-light.test.ts tests/graphics.test.ts` dne 2026-10-24T22:20Z skončil **exit 0, 56/56 PASS** (5,09 s test runner). Log je `.cache/weather-sky-revision-20261024/targeted-tests.log`. Zahrnuje skutečný pinovaný Babylon GLSL→SPIR-V→WGSL CPU překlad, nativní WGSL rozhraní, parser/model/freshness, všech 25 scénářů, geometrii projekce, fázi Měsíce, mrholení/kroupy a lifecycle. První samostatný shellový pokus vypsat reálný parser přes `tsx -e` selhal na PowerShell/cmd citování; následné spuštění přes stdin Node/tsx uspělo a uložilo všech 30 položek. Nešlo o chybu parseru a testy nebyly oslabeny.

Tento první podúkol tehdy neprovedl GPU měření, build ani plnou integraci. Následný rootův v4 důkaz již přijal denní bloom opravu a omezenou noční scénu. Celá matice den/noc, všech weather rodin, quality/backendů, zakrytí a výkonu zůstává širší přejímkou; aktuální R3 objem srážek potřebuje vlastní GPU A/B. Původní CPU běh se nevydává za tyto novější výsledky.

## Implementovaný kontrakt a stavová matice

`WEATHER_SCENARIOS` exportuje `{id,label,description}[]`, `WeatherScenarioId`, `isWeatherScenarioId` a `createWeatherScenario(id, now)`. Poslední funkce se volá při výběru, nikoli každý frame. Vrací nový samostatný `Weather` s `preview`, původem `DEMO`, neznámým měřicím časem a prázdnými `fieldSources`. Původní skutečný snapshot ani jeho freshness neovlivňuje. Časová preview fungují nezávisle. Čerstvost/výpadky se ověřují provider/freshness fixtures, nejsou podvrženým typem počasí.

| Stav / kódy Open-Meteo | QA scénáře | Renderový projev a mez |
| --- | --- | --- |
| 0, 1, 2, 3 | clear, mainly-clear, partly-cloudy, overcast | Pokrytí vrstev, stávající den/noc, zakrytí kotoučů; ne fotografie skutečné oblohy |
| Dohlednost; 45, 48 | haze, fog, rime-fog | EXP mlha + opar oblohy, útlum kotoučů/hvězd/klíčového světla; bez usazování námrazy |
| 51, 53, 55 | drizzle, dense-drizzle | Malé pomalejší stopy, intenzita plynulá |
| 56, 57 | freezing-drizzle | Kapalné drobné stopy; led na povrchu se neodvozuje z jediné teploty |
| 61, 63, 65 | rain-light, rain, rain-heavy | Dlouhé rychlé stopy, hustota podle mm/h |
| 66, 67 | freezing-rain | Kapalné dešťové stopy; stejné vizuální skupenství během pádu |
| 71, 73, 75, 77 | snow-light, snow, snow-heavy, snow-grains | Pomalé krátké částice, vítr a kolébání; zrna sdílejí lehkou reprezentaci sněhu |
| 80, 81, 82; 85, 86 | showers, snow-showers | Kapky/vločky, roztrhaná oblačnost; bez předstírání přesné polohy přeháňky |
| Současné kapalné a pevné modelové srážky | mixed | Směs částic, ne závěr jen z T |
| 95, 97; 96, 99 | thunderstorm, hail | Tmavší mraky, vítr, srážky; kroupy krátké rychlé částice. Bez vymyšlených živých blesků |
| Vítr; neznámá fáze | wind, unknown-precipitation | Konzistentní směr FROM; neznámé srážky mají orientační kapalný vzhled |

## Rozšířený výzkum realistické další fáze

Výslovné rozšíření uživatele požaduje výrazně věrnější oblohu, textury, hvězdy, Měsíc, Slunce, efekty a skutečné zakrývání světla mraky. Primární zdroje a srovnání metod níže již existují; dokumentační revize nezahajuje další workflow. Lokální cloud transmission a scintilace byly od prvního průzkumu implementovány. LUT, objemové mraky a další povrchové efekty zůstávají návrhy, nikoli hotovými technikami převzatými z velkých her.

### Výchozí řetězec před druhým implementačním checkpointem

Tato tabulka je historická baseline. Zejména chybějící scintilace, chybějící maska přímého světla a 160 čárových srážek již nepopisují aktuální implementaci; její stav je v úvodní tabulce.

| Oblast | Stav při prvním průzkumu | Tehdejší mezera |
| --- | --- | --- |
| Slunce | SunCalc 2.1.1, skutečný UTC/Strahov, 0,533° kotouč, extinction a dominantní directional light | Výtvarná paleta a forward lobe nejsou integrál rozptylu atmosféry |
| Měsíc | Skutečná poloha/vzdálenost/fáze, osvětlený terminátor a natočení jasného okraje, NASA LROC textura, nelineární relativní světlo | Bez librace, orientace lunárního pólu a detailu reliéfu u terminátoru |
| Hvězdy | 925 HYG v4.1 bodů do magnitudy 4,5, RA/Dec, siderický čas, precese, B−V barvy, soumrak a vliv Měsíce | Pevný městský práh a výtvarná PSF; chybí atmosférická scintilace a kalibrovaný městský jas |
| Mraky | Tři sdílené masky, stejný drift a occlusion kotoučů; hvězdy leží pod cloud compositingem | Plochá hustotní pole bez objemové self-shadow; nikoli měřený cloud shape |
| Přímé světlo povrchů | `sampleArtLighting` tlumí globální oblačností/deštěm/mlhou | **Nečte masku mraku ve směru ke Slunci/Měsíci.** Stín budovy není stín mraku |
| IBL/odlesky | `SkyReflectionSampler` jednou vlastní 6×32² buffer; aktualizuje paletu po 2 s nebo velké změně | Integruje jen top/horizon gradient, ne viditelné mraky/kotouče ani jejich směrový jas |
| Srážky/povrchy | 160 pevných segmentů, déšť/sníh/směs/kroupy; povrchová mokrost | Žádné splash/ripple události, kapky na skle, per-surface snowfall nebo lokální blesková detekce |

### Fáze Měsíce versus stanice

Ve skutečném HTML je mimo meteorologickou tabulku text **„Fáze měsíce: Dorůstá – 98% úplňku“**. Pro stejný okamžik 2026-10-24T22:09:10Z vrací lokálně pinovaný SunCalc `waxing=true`, `fraction=0.9785215874`, `phase=0.4541808195`. Zaokrouhlení osvětleného podílu na 98 % je ve shodě. Stanice tedy poskytuje publikovaný astronomický výpočet, nikoli senzor Měsíce. Text a jeho čas se již uchovávají v `stationAstronomy`; renderer počítá terminátor z přesného UTC, aby preview nepoužívalo fázi z jiného dne. [Primární SunCalc dokumentace](https://github.com/mourner/suncalc) odpovídá lokálním typům: `phase` a `fraction` jsou různé veličiny a jasný okraj se vztahuje k paralaktickému úhlu. Opakovaný USNO dotaz při prvním průzkumu timeoutoval; existující nezávislé USNO fixture testy prošly, ale tento nový fetch se nepovažuje za ověřený.

### Primární rendererové varianty

1. **Opravené 2,5D vrstvy + shodná maska světla** jsou již implementovaná spojovací etapa: rank atlas, metrická projekce, bilineární CPU vzorkování ve směru obou těles a přenos transmission do přímého světla po aktualizaci driftu. Jde o lokální světlo v okolí hráče, nikoli prostorově úplné stíny přes kampus. Zůstává rozdíl CPU LOD0/GPU mipů a potřeba vizuálně ověřit plošný průměr přes 0,533° kotouč. Tato etapa bez nových render targets/readbacku je použitelná základna a levnější varianta pro nižší kvalitu, ne hotová volumetrická atmosféra.

2. **Fyzikální atmosféra přes malé LUT podle Hillaire** je vhodný kandidát pro nový hlavní kvalitativní stupeň. [Autorova publikace EGSR 2020](https://sebh.github.io/publications/egsr2020.pdf) popisuje dynamické parametry média a přibližný multiple scattering; [MIT referenční implementace](https://github.com/sebh/UnrealEngineSkyAtmosphere) umožňuje porovnat výsledek s path tracerem. Přímé načtení 35,99MB PDF selhalo na limitu webového parseru; byl prostudován autorův abstrakt, README a [skutečný HLSL integrátor](https://raw.githubusercontent.com/sebh/UnrealEngineSkyAtmosphere/master/Resources/RenderSkyRayMarching.hlsl), který odděluje transmittance, sky-view a aerial perspective, používá optickou tloušťku, zemský stín a explicitní LOD. Port musí mít nativní GLSL/WGSL cesty; DX11 compute nelze pouze vložit do Babylonu. LUT invalidovat při změně aerosolů/atmosféry, sky-view při změně pozice Slunce/kamery; ne znovu alokovat každý frame.

3. **Brunetonova předpočítaná atmosféra** je alternativou s velmi dobrým referenčním zázemím. [Autorova implementace](https://ebruneton.github.io/precomputed_atmospheric_scattering/) má testy jednotek, spektrální CPU reference, ozon a WebGL2 demonstraci. Předpočítané vícerozměrné textury jsou vhodné pro stabilní médium, ale změny počasí vyžadují opatrné přepočty a správné UV parametrizace. Pro tento projekt preferuji Hillaire pro dynamické počasí; Bruneton je nezávislá obrazová/reference kontrola. Není prokázáno, který kandidát je na uživatelově GPU rychlejší.

4. **Volumetrická nízká oblačnost** přinese skutečnou tloušťku, vnitřní stíny a osvětlené okraje. [Primární Guerrilla prezentace](https://d3d3g8mu99pzk9.cloudfront.net/AndrewSchneider/The-Real-time-Volumetric-Cloudscapes-of-Horizon-Zero-Dawn.pdf) dokládá kombinaci Perlin–Worley objemového šumu, odděleného detailu, height profilů a Beer/Henyey–Greenstein approximací; vysoko položené tenké vrstvy ponechává 2D. Jejich údaj přibližně 2 ms a 20 MB je výsledek jejich enginu, **nikoli očekávaný výkon tohoto browseru**. Zde nejdříve samostatný prototyp half-resolution, zastavení při nízké transmittance, explicitní texture LOD; temporal reprojection až po ověření rychlých otoček, teleportu, resize, preview skoků a occlusion hran.

5. **HDRI/fotografická obloha nebo sprite billboards** mají nízké základní shading náklady, ale obtížně sjednotí reálný čas, vrstvený vítr, skutečnou fázi a prostup světla. Jsou vhodné jako identifikované referenční snímky, nikoli jako jediná obloha řízená živými údaji. **Path tracing** slouží případně jako offline reference; není navržen do živé multiplayerové hry.

### Konkrétní návrh zdrojů, nákladů a scope

Navržené první LUT rozměry jsou **návrh**, nikoli převzatý příslib výkonu: transmittance 256×64, multiple scattering 32×32, sky-view 192×108, případně aerial perspective 32³. Při RGBA16F jde výpočtem o přibližně 554 KiB bez mipů a engine overheadu. Half-resolution cloud buffer a jedna historie při 1920×1080 potřebují RGBA16F asi 7,9 MiB; 128³ RGBA8 noise dalších 8 MiB před mipy. Proto low kvalita zachová současné vrstvy, medium začne menšími tabulkami bez historie a high objemový kandidát se povolí až po srovnatelném měření. Žádné FPS/timing zatím nebylo změřeno.

Nové soubory bude třeba předem rezervovat: návrh `client/atmosphere-lut.ts`, `client/cloud-light.ts`, případné shader moduly a jejich přesné testy. Integrační zásahy do `client/cinematic.ts`, `client/sky-reflection.ts`, `client/surface-pack.ts`, `client/game.ts`, `shared/render-quality.ts` a případných assets **nepatří tomuto claimu**. Celý strom materiálů musí používat stejný lineární radiometrický kontrakt; dnešní custom sky emituje display barvy, zatímco PBR/Standard a postprocess mají jiný převod. Přidání LUT bez této dohody by způsobilo dvojitou gamma/exposure a neshodné odlesky.

Izolace obdélníku a lokální cloud transmission jsou již provedené etapy. Nejbližší praktický krok je přijetí R3 srážek na novém neměnném kandidátu: stejná kamera, osvětlení, rozlišení a ustálený vítr; jedinou porovnávanou změnou je objem. Poté lze porovnat následující samostatné možnosti. Žádná z nich touto dokumentací nezačala běžet:

| Navazující možnost | Přínos a doporučené pořadí | Náklad / riziko a podmínka přijetí |
| --- | --- | --- |
| R3 srážky a zakrytí střechou | Nejdřív skutečné GPU A/B menšího objemu; poté source-derived roof/occlusion dotaz pro venkovní přístřešky | Stejný počet částic neznamená stejný fragmentový čas. `zoneAt/outside` ani depth test samy nesimulují dopad na střechu; před splash efektem musí být doložen skutečný kontaktní povrch |
| Atmosférické LUT + jednotná radiance | Pro další hlavní kvalitativní stupeň preferovat omezený Hillaire prototyp; Bruneton jako nezávislou referenci | Nejprve sjednotit lineární barvy, exposure a sky/IBL/surface kontrakt. Změřit stejný den/noc/mlhu a zabránit dvojí gamma; paměťové rozměry výše jsou návrh, ne profil |
| Prostorové cloud shadows a IBL | Doplnit odlišné osvětlení budov na různých místech a odpovídající směrové odlesky | Kamera-local transmission nestačí. Vyžaduje společné world souřadnice, invalidaci a rozpočet aktualizace; nepřepisovat oblohu druhým nesouvisejícím vzorkem |
| Volumetrické nízké mraky | Poté omezený prototyp objemu/okrajů/self-shadow pro vyšší kvalitu, zachovat současné vrstvy jako levnější variantu | Nejdřív bez temporální historie porovnat obraz a cenu; historii přidat až s ověřeným rychlým pohybem, resize, změnou času, occlusion a context-loss. Čísla Guerrilla nejsou výkon této hry |
| Textury a nebeská tělesa | Porovnat minifikaci, PSF, jasný okraj Měsíce a městský noční jas při skutečné velikosti kotouče | Vyšší rozlišení mapy samo nepřidá detail několika pixelům. Librace/reliéf mají smysl až s odpovídající referencí a zobrazením; více hvězd není automaticky realističtější Praha |
| Dopady, kaluže, sníh a námraza | Po kontaktu s povrchem doplnit omezené splashe/ripples; akumulaci řešit jako samostatnou simulaci s historií a táním | Okamžitý WMO kód není měření sněhové pokrývky. Vymezit vizuální versus fyzikální změny, uchovat stav při výpadku dat a přiznat simulaci; blesky vyžadují zdroj poloh/času nebo explicitní DEMO |

Každá zvolená implementační etapa potřebuje odpovídající reálné denní/noční GPU snímky, quality/backend porovnání, běžnou jízdu s HUD/avatary a srovnatelné FPS/p95/p99; lifecycle musí pokrýt resize a obnovu contextu. O pořadí nemá rozhodovat počet efektů nebo velikost textur, ale konkrétní vizuální nedostatek a naměřený rozpočet celé hry.

### Textury, hvězdy a efekty: rozhodnutí

[NASA CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) již poskytuje používanou mapu LROC 2025 (2k JPEG). Její větší barevné mapy a výšková data jsou dostupné, ale 0,5° kotouč při běžném FOV má jen několik pixelů; přidat gigabajtový podklad bez zvětšování by nepřineslo odpovídající detail. Zachovat skutečný průměr, přezkoumat minifikaci/PSF a až pro přiblížení zvážit malou odvozenou normal mapu s proveniencí. NASA označuje mapu za upravenou pro vizualizaci, ne za vědeckou kalibraci.

[HYG původní autor](https://github.com/astronexus/HYG-Database) přemístil další vývoj na Codeberg. Aktuálně pinovaný v4.1 katalog a licence se nemění; automatické dotažení nového katalogu by vyžadovalo rezervaci vstupů a odvozených JSON. Scintilace má být slabá, rychlá a závislá na výšce, nikdy ne náhodné blikání poloh. Více hvězd nemůže znamenat noční oblohu bez pražského světelného znečištění. Jas noční oblohy není stanicí měřen; zůstává výtvarným parametrem.

Babylon 9.30 `VolumetricLightScatteringPostProcess` není cloud renderer: používá extra render target a standardně 100 screen-space vzorků. Pouhé zapnutí paprsků by zvýšilo cenu a nezajistilo skutečnou cloud transmittance; zatím není zvoleno. Dešťové splashe vyžadují zásah do skutečných shared povrchů/occlusion, sněhová pokrývka časovou akumulaci a tání, blesky buď další časoprostorový zdroj nebo explicitní DEMO. Žádný z těchto efektů nesmí předstírat současný staniční senzor.

## Zachycené hodnoty stanice

Jednorázový snímek **2026-10-25 00:09:10 Europe/Prague = 2026-10-24T22:09:10Z**. Nejde o trvale aktuální hodnoty. Denní statistiky se právě po půlnoci resetovaly; proto se liší od staršího webového indexu. `station-parsed.json` ve vlastní cache obsahuje všech 30 položek s časem a původem.

| Publikovaný údaj | Zachycená hodnota | Klasifikace |
| --- | --- | --- |
| Teplota: | 4.2 °C | surface |
| Wind Chill : | 2.2 °C | derived |
| Heat Index : | 4.2 °C | derived |
| Rosný bod: | 1.9 °C | derived |
| Relativní vlhkost: | 85 % | surface |
| Tlak vzduchu: | 1018.1 hPa, tendence - | surface |
| Charakter větru: | E 2.2 m/s (8.0 km/h ) | surface |
| Odhad rychlosti větru : | Light Breeze | derived |
| Hustota vzduchu: | 1.276 kg/m 3 | derived |
| Základna oblačnosti: | 287 m (nad úrovní meteostanice) | derived |
| Intenzita slunečního záření: | 0 W/m 2 | surface |
| Výpar: | 0.000 mm | derived |
| Dnešní srážky: | 0.00 mm | daily |
| Intenzita deště: | 0.00 mm/h | surface |
| Nejvyšší intenzita deště: | 0.00 mm/h v ----- | daily |
| Storm Total : | 0.00 mm | daily |
| Teplota (maximum): | 4.2 °C v 00:01 | daily |
| Teplota (minimum): | 4.1 °C v 00:00 | daily |
| Heat Index (maximum): | 4.2 °C v 00:01 | daily |
| Wind Chill (minimum): | 1.4 °C v 00:02 | daily |
| Vítr (maximum): | 3.1 m/s v 00:02 | daily |
| Dnes vál vítr průměrně: | 2.3 m/s | daily |
| Vlhkost (maximum): | 85 % v 00:00 | daily |
| Vlhkost (minimum): | 85 % v 00:00 | daily |
| Rosný bod (maximum): | 1.9 °C v 00:01 | daily |
| Rosný bod (minimum): | 1.8 °C v 00:00 | daily |
| Tlak vzduchu (maximum): | 1018.3 hPa v 00:01 | daily |
| Tlak vzduchu (minimum): | 1018.1 hPa v 00:08 | daily |
| Intenzita slun. záření (maximum): | 0 W/m 2 v 00:00 | daily |
| Teplota: | 21.8 °C | indoor |
