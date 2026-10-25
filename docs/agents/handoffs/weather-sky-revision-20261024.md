# Předání: weather-sky-revision-20261024

## R5: sjednocení současné a historické evidence — weather-r5-evidence-cleanup

Převzato explicitně od roota přes `--adopt-dirty`, včetně R4 a navazujícího root/weather WIP. Cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, aktuální baseline `f83236bc9c159eb595f1451f3c00ac3af611fadd`. Koordinátor potvrdil B6 CI PASS; tato dokumentační relace novou CI ani GPU přejímku neprováděla.

**Změněny pouze dva soubory:** `docs/weather/conditions-20261024.md` a toto předání. Ostatní převzaté task cesty zůstaly bez zásahu. Nebyly spuštěny testy, build, GPU, server, nový workflow ani měnění runtime. Žádné nové cache soubory nevznikly; identitu těchto dvou výsledků tvoří SHA předané koordinátorovi po dokončení dokumentů.

Úvod conditions nyní odděluje současný stav, omezení a historickou diagnostiku. Zachovává původní zdroje, data, neúspěšné pokusy i měření. Aktuální shrnutí:

- **V4 bloom oprava je přijatá GPU evidence**, nikoli stále neznámý obdélník: source `9a495d0a9817a25398b9c59f5863f46743432e4db807442788499c5a21b6c456`, WebGL2/Medium1260×702, exact frame4718 capture SHA `4af615cc012a55c0c7c1bce0212aff74e462ce7298e44de141ec749c5b11a086`. Noční kontrola je kvalitativní a pixelový grid neměří jádro lampy; nepřebíráme z ní celkový výkon či kompletní weather matici.
- Lokální cloud transmission, odstranění druhého globálního cloud faktoru a scintilace jsou implementovány. Původní stav s160čarami a bez této masky je výslovně historický. `stationAstronomy` již existuje jako publikovaný výpočet, nikoli měřená fáze nebo návrh budoucího fieldu.
- Quad precipitation renderer je implementovaný. V8 dokládá skutečný draw a slabý pixelový footprint. R3 zmenšil objem18→10m při stejném počtu/rozměrech částic; **rootův nový GPU A/B zatím čeká**. B6 CI PASS tuto mezeru neuzavírá.
- Čtecí v8 lifecycle audit nenašel expiraci preview: záporný vítr přesně odpovídá krátkému5s vyhlazování. Dokument uvádí raw capture SHA, samostatné UTC scény/capture, omezení `motionTime`, odvozenou počáteční hodnotu i dvě minimální možnosti QA. Nezavádí nový runtime reset ani test.

Nejnovější uživatelský požadavek na více efektů, lepší oblohu/hvězdy/Měsíc/Slunce/fáze, skutečné překrývání světla mraky a velký výzkum nejrealističtějšího počasí **není označen jako dokončený**. Praktické další možnosti navazují na existující primární srovnání: nejdřív skutečné přijetí R3 a zakrytí srážek; poté radiometrický kontrakt + omezený Hillaire LUT prototyp s Brunetonovou referencí; prostorové cloud shadows/IBL; měřený volumetrický kandidát pro vyšší kvalitu; nakonec zdrojově přiměřené kontakty/akumulace a detail nebeských těles. U každé volby jsou náklady a podmínky přijetí. Jde o doporučené návaznosti, ne spuštěné úkoly nebo tvrzení o hotových technikách z velkých her.

Dokumenty byly čtením porovnány s aktuálními handoffy, v8 frozen zdroji a přesnými capture daty; relativní odkazy a whitespace byly zkontrolovány bez testovacího/build procesu. Žádný vlastní pomocný proces nezůstává. Release následuje po závěrečném SHA; runtime a další GPU práci nadále řídí root.

## Historie druhého předání – cloud transmission a scintilace

Po prvním release root výslovně zadal další implementaci a původní vlastník znovu získal stejný claim s `--adopt-dirty`. **Tehdejší cílené ověření: 64/64 PASS, exit0, 6,30s**, `.cache/weather-sky-revision-20261024/stage2-final-tests.log`. První56testový běh, tento64testový checkpoint a pozdější38testové datové opravy mají různý rozsah; nepředstavují zaměnitelné důkazy celého současného rendereru.

- `CloudLightSampler` používá tytéž RGBA8 bajty, bilinear/repeat, layer offsety a shaderové projekce. 21bodový plošný průměr Slunce a vážený terminátor Měsíce poskytuje lokální průchod přímého světla; malé srpky mají fallback jasného okraje. Žádný GPU readback, nové RT/textury ani alokace vzorkovacích vektorů/frame.
- `AtmosphereSky.lightTransmission` je stejný readonly objekt `{sun,moon}` aktualizovaný po driftu. `applyArtLighting` volá atmosféru právě jednou před key bindingem a aktualizuje přímé světlo bez nových barev; sample vrací `sunCloudTransmission`, `moonCloudTransmission`. **Game API nemusí root kvůli této změně upravovat.**
- Opravena další skutečná nespojitost coverage=1→méně (původní tvrdá saturace). První stage-2 run42/43 ji odhalil, log zůstal zachován. Krajní smooth blend je shodný v CPU/GLSL/WGSL, kalibrace0.1–0.9 zůstala. Nová nezávislá regrese dokládá spojitost pro všechny ranks; render lifecycle test používá dt1/60 a30s.
- Hvězdy mají mírnou výškově závislou scintilaci bez změny katalogu, RA/Dec, PSF či průměrné intenzity. Dvě uniformní fáze běží podle renderdt i při zmrazeném astronomickém preview. Amplituda/frekvence jsou výtvarné, nikoli naměřené.
- `Weather.stationAstronomy` nyní uchovává původní staniční fázi, `publishedAt`, `kind: calculation` a případná procenta/dorůstání. Není to sensor ani náhrada skutečného UTC rendereru. Přímý parse reálného HTML potvrzuje98%versusSunCalc97.8522%.
- Přibyl **26. DEMO scénář `cloud-breaks`** se35m/s západním prouděním nízkých mraků. CPU preview naSPAWN při25Oct10:00Z a22:00Z pokrývá transmission0–1 za60s; přesnýprůběh `.cache/weather-sky-revision-20261024/cloud-crossing-qa.json`. Tehdejší7bodovýGPUQA plán byl v `conditions-20261024.md`; jeho nynější úvod rozlišuje přijatou v4 opravu od zbývajících regresí.
- K předchozím16souborům přibyl `tests/sky-weather.test.ts`. Druhýmanifest je `.cache/weather-sky-revision-20261024/stage2-checkpoint-manifest.json`; zahrnuje17runtime/test/doc souborů, handoff zvlášť. Prvnímanifest se nepřepsal.
- **Tehdejší navazující root kroky byly později provedeny:** mock AtmosphereSky dostal `lightTransmission:{sun:1,moon:1}` a Game/Cinematic používají `cloudOcclusionApplied`, takže již maskovaný key není znovu tlumen globálním cloud faktorem. Integraci a bloom přejímku dokládá `docs/weather/cloud-light-integration-20261025.md`. Prostorové cloud shadows, IBL a Hillaire stále nejsou tímto implementovány.
- V této druhé etapě nebyly spuštěny vlastní GPU/server procesy a2591 se neměnila. Při tehdejším release ještě nebyla příčina širokého obdélníku ani GPU cena doložena; obdélník později uzavřela rootova v4 evidence. Naměřený výkon celé rozšířené weather pipeline z ní neplyne.

## Historie prvního předání

- Vlastník `weather-sky-r2`; příjemce kořenový koordinátor `/root`.
- Cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- **Výsledek: integrovatelný dílčí checkpoint, celý uživatelský požadavek není hotov.** Opravena doložená nespojitá projekce mraků (prudké úhlové zrychlení pod 4,88°), halo má nulové okraje; modelová mlha tlumí také oblohu/tělesa/hvězdy/klíčové světlo. Stanice zachovává kompletní publikovanou tabulku a další číselná pole, model zachovává WMO kód. Připraveno 25 jasně označených DEMO scénářů, rozlišené mrholení/kroupy. Široký světlý obdélník screenshotu nebyl GPU reprodukován a nelze jej označit za opravený.
- Rozšířený výslovný požadavek na realističtější oblohu: dokončen primární výzkum a implementovatelný návrh dalších checkpointů v [conditions-20261024.md](../../weather/conditions-20261024.md). Přímé světlo zatím stále používá globální oblačnost, ne konkrétní masku mraku. Doporučená další fáze: shodná cloud transmission → Hillaire atmosphere LUT + IBL → měřený volumetrický low-cloud prototyp. To ještě není implementováno.

## Přesné soubory

Runtime: `shared/weather.ts`, nový `shared/weather-scenarios.ts`, `server/weather.ts`, `client/sky-weather.ts`, `client/art-lighting.ts`, `client/weather-particles.ts`, `client/atmosphere-sky.ts`, `client/atmosphere-wgsl.ts`.

Testy: `tests/weather.test.ts`, nový `tests/weather-scenarios.test.ts`, `tests/graphics.test.ts`, `tests/atmosphere-sky.test.ts`, `tests/atmosphere-native-wgsl.test.ts`.

Evidence: nový `docs/weather/conditions-20261024.md`, `docs/weather/README.md`, `docs/weather/sources.json`, tento handoff a vlastní ignorovaná `.cache/weather-sky-revision-20261024/`.

`client/game.ts`, `ui.tsx`, `world-renderer.ts`, `cinematic.ts`, `sky-reflection.ts`, `surface-pack.ts`, sdílené quality/entrypoints ani společné verification nebyly upraveny. Cizí B6/CAD/door WIP v téže worktree zůstal beze změny.

## Kontrakt integrace

- `WEATHER_SCENARIOS: {id,label,description}[]`, `WeatherScenarioId`, `isWeatherScenarioId(value)`, `createWeatherScenario(id, now?)` v `shared/weather-scenarios.ts`.
- Vytvořit při výběru, držet odděleně od skutečného snapshotu. Do celého `updateEnvironment` použít jediný effectiveWeather (obloha, světlo, particles, surfaces, cinematic); původní fetch/freshness/HUD hodnoty zůstávají skutečné. Každé preview zobrazit jako DEMO. Při návratu zanikne override, cache se nepřepisuje. Nový `Weather.preview` je pouze marker; demo nikdy netvrdí měřicí čas, `sourceKind` ani falešné fieldSources.
- `weatherCode` je zvlášť modelově atribuovaný a stárne v existujícím freshness řetězci. `weatherConditionFromCode` a `WMO_CONDITIONS` pokrývají dokumentovaný Open-Meteo subset včetně 45/48/95/97.
- `stationReadings` zachovává 30 skutečných položek zachyceného HTML s typem `surface/derived/daily/indoor`; rosný bod, tlak, sluneční záření a dnešní úhrn mají také číselná pole. Maximum větru není současný náraz. Serverovna není venkovní T. Forecast ikona zůstává odhad předpovědi.
- Stanice publikuje i fázi Měsíce mimo tabulku: zachycený text 98 % dorůstá odpovídá SunCalc 97,8522 % ve stejném UTC. Při prvním předání šlo o návrh, následný checkpoint však již přidal `stationAstronomy` s časem a `kind:calculation`. Přesná fáze rendereru se dál počítá ze skutečného UTC; publikovaný text ji nepřepisuje.

## Podklady a refaktoring

- Přímý HTTP200 station GET 2026-10-24T22:09:37Z, skutečné windows-1250 HTML a parsed JSON ve vlastní cache; nejde o starý webový index. Modelový schema GET 22:12:53Z potvrdil interval 900 s, jednotky a existující current pole.
- Pinovaný Babylon 9.30 shader/material/transform source, skutečný stávající code chain a screenshot uživatele. Source-v4 sky soubory byly porovnány SHA256 a odpovídají baseline. Žádné ovládání živé 2591.
- Nová projekce používá stabilní kořen průsečíku se sférickou vrstvou, zachovává výšky, atlas, čas a meteorologický FROM drift. GLSL a WGSL sdílejí konstanty, stejné masky zůstávají i pro kotouče. Přibyly aritmetické operace, nikoli textury/draw calls/render targets; skutečná GPU cena není změřena.
- Parser čte leaf `<td>` buňky místo vnořených `<tr>`; skutečný web má neuzavřený daily-rain řádek. Sdílená klasifikace WMO a immutable definice preview s kopiemi vnořených hodnot zamezují duplicitním modelům a sdíleným mutacím. Particle systém stále používá pevný buffer. Existující cache polling a resource disposal se nemění.

## Skutečné ověření

- 2026-10-24T22:20:03Z: `pnpm exec tsx --test tests/weather.test.ts tests/weather-provider.test.ts tests/weather-freshness.test.ts tests/weather-scenarios.test.ts tests/atmosphere-sky.test.ts tests/atmosphere-native-wgsl.test.ts tests/atmosphere-webgpu.test.ts tests/atmosphere-light.test.ts tests/graphics.test.ts` → **56/56 PASS, exit 0, 5,09 s**. Log `.cache/weather-sky-revision-20261024/targeted-tests.log`.
- Zahrnuje skutečný pinovaný GLSL→SPIR-V→WGSL CPU překlad; nativní WGSL rozhraní a ownership testy nejsou GPU důkaz.
- Předchozí cílené průběžné běhy 39/39 a 38/38 PASS. Přímý parse uloženého reálného HTML uspěl se 30 položkami; první `tsx -e` shell pokus selhal na citování, opraven pouze způsob spuštění přes stdin, ne parser/test.
- `git diff --check` nad vlastními soubory PASS. Poslední pozdější změna kódu byla pouze upřesnění komentáře o projekci; ostatní pozdější zápisy jsou evidence.
- Checkpoint manifest **včetně změněných testů**: `.cache/weather-sky-revision-20261024/checkpoint-manifest.json`; jeho `scopeHash` identifikuje přesných 16 runtime/test/doc souborů, handoff sám je oddělený. Plný společný snapshot, typecheck, build, celou sadu a integraci provede root.

## Procesy, rezervace a další krok

Žádný vlastní dlouhožijící proces, server, GPU nebo Blender nebyl spuštěn. Všechny CPU příkazy skončily. Zdroj-v4/URL2591 a source ID `0ee299c2bc87e3d76c832783aa877c19ff8ff74de4e9bced8993e8be09d58100` zůstaly neměnné.

Claim byl při tomto historickém průzkumu koordinovaně uvolněn pro přidání čtyř atmosphere cest a znovu získán `--adopt-dirty` pouze pro vlastní průzkumný dokument. Tehdejší release nebyl Done a root převzal integrační/GPU práci. Pozdější v4 evidence již přijala opravu obdélníku; celé rozšířené zadání realistického počasí zůstává odděleným nedokončeným cílem podle aktuálního R5 přehledu.

## R4: sekce stanice a přípustná cache historie — weather-data-guards-r4

Explicitně převzat celý root/weather WIP po jeho release přes `--adopt-dirty`; task nově zahrnuje také `tests/weather-provider.test.ts`. Cwd/větev/HEAD shodné s předchozím předáním. Tato návaznost mění pouze `shared/weather.ts`, `server/weather.ts`, `tests/weather.test.ts`, `tests/weather-provider.test.ts`, krátkou evidenci v `docs/weather/conditions-20261024.md`, toto předání a vlastní cache. Ostatní převzaté renderer/atmosphere/scenario změny byly zachovány a neupravovány. Žádné další BMAD, GPU, server, build, fullsuite ani modelové zápisy.

### Důkazy, varianty a implementace

Primární zachycené HTML v `.cache/weather-sky-revision-20261024/station.html` má venkovní4.2°C pod `Aktuální podmínky` a vnitřní21.8°C pod výslovnou sekcí `Serverovna`. Dřívější parser volil první stejnojmenný label a indoor odhadoval počítadlem teplot. Přejmenování/odstranění pouze prvního venkovního labelu proto vytvořilo21.8°C se statusem live. Zachování pořadového fallbacku problém neřeší; vypuštění indoor dat by porušilo úplný publikovaný přehled; plný HTML parser přidává zbytečnou závislost pro konkrétní známou malformed stránku. Vybráno zachování heading sekce u každé skutečné leaf buňky. Číselný lookup používá jen outdoor mapu; duplicitní outdoor label je nejednoznačný. Indoor údaje se dál publikují jako `kind:indoor`, včetně případné indoor vlhkosti, bez ohledu na pořadí sekcí.

Arbitráž dříve správně označila budoucí stránku stale, ale její vysoký timestamp následně vybral před validním previous. Např. při now24Oct22:09:37Z převzala25Oct23:09:10Z místo skutečné historie24Oct22:09:10Z. Pouhé vynucení previous by naopak ignorovalo novější platná starší měření. Nový sdílený `isWeatherTimeAdmissible(observedAt, now)` sjednocuje konečnost/5min clock-skew pro `isWeatherStale` i serverový výběr nejnovějšího přípustného snapshotu. Původní30min station/60min model stale limity se nemění. Neplatné future/NaN/Infinity/null kandidáty nevstupují do arbitráže. Bez nového platného zdroje se zachová nejnovější skutečný prior jako stale se skutečným observedAt/původem; bez jakékoli přípustné historie se vrátí neutral `unavailable` bez teploty a času měření.

Refaktoring: společná časová podmínka místo dvou odlišných pravidel, jediná neutral unavailable factory pro inicializaci i neplatnou historii, společné očištění textu pro buňky/headings a jednoznačný outdoor lookup bez opakovaného hledání první teploty. Všechny pomocné mapy žijí pouze v jednom parse, pending fetch/cache lifecycle zůstává stejný. Starší Weather/fieldSources objekty se nemutují. `Game.effectiveWeather`, UI volba DEMO a astronomický preview čas nebyly měněny.

### Ověření

- `data-guards-red.log`: čtyři nové reprodukce **RED4/4** před opravou, včetně původního skutečného HTML a celé provider fallback posloupnosti.
- `node --import tsx --test --test-reporter tap tests/weather.test.ts tests/weather-provider.test.ts tests/weather-freshness.test.ts tests/weather-scenarios.test.ts tests/weather-preview-ui.test.ts tests/hud-status.test.ts`: **38/38 PASS**,0skip, exit0, TAP2.487s; `data-guards-final-tests.log`.
- Zahrnuje missing/invalid/duplicate outdoor, obrácené pořadí sekcí, indoor humidity, model fallback, retained model/station stale, future model/station/previous, všechny nepřípustné timestampy, nejnovější přípustnou historii a přesnou hranici5min. Původní jednotky900s→mm/h/cm/h, srážky celkem vs kapalná složka, původy/stárnutí polí,26DEMO izolací a HUD labely zůstávají ověřené.
- Strict TypeScript nad shared/server/weather scénáři a čtyřmi datovými testy s projektovými flags a `--jsx react-jsx`: **PASS exit0**, `data-guards-typecheck-final.log`. První příkaz opomenul JSX flag kvůli transitivnímu importu HUD v již existujícím freshness testu; šlo pouze o chybný kontrolní příkaz (`data-guards-typecheck.log`), ne změnu kódu kvůli testu.
- Scoped `git diff --check` PASS. Plné build/GPU/síťové přijímací kroky zůstávají koordinátorovi.

Všechny vlastní procesy skončily. `.cache/weather-sky-revision-20261024/data-guards-checkpoint.json` obsahuje přesné hashe všech převzatých task cest, testů, čtené primární evidence a tento scope; staré manifesty nejsou přepsány. Po jeho vytvoření následuje release `weather-data-guards-r4`. Root může doložený WIP znovu převzít přes `--adopt-dirty`; dokončení těchto dvou datových oprav není potvrzením celého oblohového/GPU cíle.
