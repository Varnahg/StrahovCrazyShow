# Obloha a skutečné počasí na Strahově

Implementace používá souřadnice 50.08065° N, 14.39175° E. Osa X míří na východ, osa Z na jih. Časový údaj je vždy UTC instant v milisekundách; letní/zimní čas se používá jen při zobrazování pražských hodin a čtení hodin meteostanice.

## Astronomie

- `shared/weather.ts` volá skutečně nainstalovaný **SunCalc 2.1.1**. V této verzi jsou výstupní úhly **ve stupních**, azimut jde po směru hodin od severu. Hra je převádí na radiány a vektory světa. Starší návody pro SunCalc 1.x mají jiné jednotky a nesmějí se použít.
- Slunce i Měsíc mají vypočítanou polohu pro aktuální datum a Strahov, včetně změny výšky dráhy během roku. Nejde o zrychlený každodenní kruh. Výpočet je aktualizován nejvýše jednou za sekundu.
- Sluneční kotouč má úhlový průměr 0,533°. Měsíční průměr se mění podle vypočítané vzdálenosti a poloměru 1737,4 km. Tenká záře Slunce je výtvarná atmosférická aproximace, nikoli zvětšený sluneční kotouč.
- Shader Měsíce osvětluje promítnutou kouli podle skutečného osvětleného podílu a natočení jasného okraje vůči zenitu. Nov není stále svítící plný kotouč. Měsíční světlo scény závisí na nelineární fotometrii fáze, vzdálenosti a atmosférickém útlumu podle výšky nad obzorem. Stejný dominantní zdroj řídí orientaci skutečných stínů.
- Povrch používá skutečnou mapu LROC z NASA SVS. Mapa je pevná; optická librace, přesné natočení měsíčního pólu, zatmění a detailní městský horizont za dosahem herní geometrie nejsou simulovány. Sférická textura je podrobnější než původní jednobarevná koule, bez tvrzení o astronomické přesnosti těchto detailů.
- Hvězdná obloha používá 925 skutečných hvězd HYG v4.1 do magnitudy 4,5. UTC siderický čas a precese převádějí katalog J2000 na strahovský obzor. Jas, velikost bodů, barevná paleta atmosféry a pražská světelná záře jsou výtvarné aproximace. Podklady, licence a přesnost: [atmosphere-sources.md](atmosphere-sources.md).
- Rozsvícená okna označená `StandardMaterial.metadata.nightWindows` zesilují po setmění a slábnou v pozdní noci podle pražských hodin. Vzor je fiktivní; nesleduje skutečné obsazení pokojů.

## Data a vítr

Server obnovuje počasí nejvýše jednou za 5 minut a souběžné požadavky spojuje. Čerstvá [meteostanice Silicon Hill](https://weather.sh.cvut.cz/weather/) je zdrojem teploty, povrchového větru a intenzity srážek. Měření starší než 30 minut nebo více než 5 minut v budoucnosti se považuje za zastaralé. Nečitelná intenzita nebo směr větru není nahrazena vymyšleným bezvětřím/suchem.

[Open-Meteo](https://open-meteo.com/en/docs) dodává **modelovou**, nikoli změřenou oblačnost, její nízkou/střední/vysokou složku a modelové proudění v 850/500/300 hPa. Povrchové hodnoty modelu se používají jako označený fallback při výpadku/zastarání stanice. Model starší než hodinu je zastaralý. `observedAt` a `cloudObservedAt` jsou oddělené; čerstvá stanice nepřebírá zastaralou modelovou oblačnost. Při výpadku obou zdrojů zůstávají poslední hodnoty označené jako zastaralé.

`windVector(speed, fromDegrees)` vrací skutečný směr pohybu v m/s. Například severní vítr proudí na jih: X = 0, Z = +speed. Vegetace a déšť mají používat povrchový vítr. Mraky používají modelové proudění ve výšce, pokud je dostupné; jinak je drift povrchovým větrem výslovně orientační. Změna proudění se plynule vyhlazuje vektorově, takže otočení přes 0° nezpůsobí rotaci opačným směrem.

U Open-Meteo je `current.precipitation` **úhrn za `current.interval`**, nejčastěji 900 s. Server převádí hodnotu na mm/h pomocí `3600 / interval`. Hodnota `rain` v herním protokolu je intenzita vodního ekvivalentu všech srážek; modelový `snowfall` je zvlášť v cm/h. Samotná teplota není spolehlivé určení skupenství srážek.

Z čísel oblačnosti a větru nelze určit skutečné rozložení jednotlivých mraků nad Prahou. Souvislá procedurální textura nyní tvoří tři vrstvy v jedné obloze; původních 24 ploch se již nevytváří. Jejich modelové pokrytí, proudění a čerstvost zůstávají oddělené od výtvarné simulace obrysů. Mraky mají společnou masku pro oblohu, hvězdy i oba kotouče. Zakrytí budovami funguje i za původní 420m sférou umístění kotoučů.

Dohlednost Open-Meteo řídí EXP mlhu podle metrické optické dráhy; mezi hodnotami mlha plynule přechází. Při absenci modelové dohlednosti nastupuje umírněný výtvarný opar. Déšť/sníh využívají doložený modelový typ srážek, nikoli samotnou teplotu; hustota a délka částic reagují na intenzitu. Chybějící typ staničních srážek má označený odhad vzhledu deště. Sněhová pokrývka se nesimuluje. [Zdrojová a cache pravidla](provider-sources.md), [světlo a mlha](atmosphere-lighting.md).

Revize 24. 10. zachovává WMO kód a celý publikovaný staniční přehled `stationReadings` s rozlišením povrchových, odvozených, denních a vnitřních údajů. Denní maximum větru není aktuální náraz. Parser zvládá skutečnou chybně uzavřenou tabulku wview. [Průzkum, zdrojové hodnoty a matice stavů](conditions-20261024.md) rozlišují fakta a chybějící GPU přejímku. Mraky protínají kulové vrstvy namísto roviny s tvrdým zlomem u obzoru. Modelová mlha tlumí také kotouče, hvězdy a přímé světlo; kroupy mají krátké rychlé částice a mrholení jemnější pomalejší stopy. Mrznoucí déšť je za letu kapalný.

`shared/weather-scenarios.ts` poskytuje 26 výslovně demonstračních scénářů pro všechny podporované rodiny počasí a reprezentativní intenzity. `createWeatherScenario(id)` vytváří samostatný renderový vstup s `preview`, `observedAt: null` a bez tvrzení o měření. Výběr neaktualizuje serverovou cache ani původní živý snapshot; astronomický čas se volí nezávisle. Neobsahuje domnělé živé blesky, kaluže, námrazu či sněhovou pokrývku.

Přímé světlo nyní čte stejné vrstvy mraků jako kotouče: `AtmosphereSky.lightTransmission` poskytuje po `update()` opakovaně používané hodnoty `{sun,moon}`. 21bodový průměr přes skutečný kotouč používá bilineární CPU vzorkování téhož atlasu; u Měsíce se váží osvětlená část terminátoru. Jde o lokální průchod světla pro okolí kamery, nikoli celoplošnou cloud shadow mapu. `applyArtLighting` aktualizuje atmosféru jednou před světly a vrací také `sunCloudTransmission` / `moonCloudTransmission` pro QA. Scénář `cloud-breaks` ukáže přechody během minuty. Jemná scintilace mění pouze jas hvězd, ne jejich polohy ani PSF. Staniční `stationAstronomy` uchovává publikovanou fázi a čas jako výpočet; skutečný renderer dál používá přesný UTC okamžik.

## Zapojení

```ts
const skyWeather = new SkyWeatherController(scene);
// Po aktualizaci kamery a před scene.render():
const instant = timeOverride ?? Date.now();
const state = skyWeather.update({
  instant,
  weather,
  player: position,
  dt,
  quality,
});
applyArtLighting(context, { ...state, atmosphere: skyWeather.atmosphere, weather, player: position, dt });
// state.wind je vyhlazený povrchový vítr pro vegetaci a déšť.
// Při úklidu scény:
skyWeather.dispose();
```

Controller vlastní skutečné kotouče, mapu Měsíce a sdílený materiál/textury atmosféry. `applyArtLighting` aktualizuje tentýž handle až po nastavení kamery; nevytváří druhou oblohu. Astronomie má sekundovou cache, paleta světla se při běžném vyhlazení přepočítává nejvýše 10×/s. Žádná textura ani hvězdná geometrie se nevytváří v každém snímku. Měsíční mapa zůstává lokální `/textures/sky/moon-lroc-2k.jpg`.

V Nastavení jsou označené náhledy dne, zlaté hodiny, modré hodiny, noci a příští téměř úplňkové noci. Zlatá/modrá hodina hledají skutečný večerní průchod Slunce výškou +3°/−6°. Měsíční náhled najde skutečný budoucí okamžik, kdy je Měsíc nad obzorem v tmavé obloze. Náhled neproměňuje aktuální počasí v předpověď. První osoba dovoluje vzhlédnout do 85°; třetí osoba a auto zachovávají bezpečný původní rozsah.

## Ověření a zdroje

Cílené regrese pokrývají astronomické světové strany, nezávislé fáze USNO a precesi ERFA, promítnutý terminátor Měsíce, siderickou rotaci katalogu, pokrytí mraky, vlastnictví textur, stínové projekce, pražský letní čas, jednotky a čerstvost počasí i skutečnou projekci pohledu nad 80°. NullEngine testy dokazují výpočty a lifecycle, nikoli GPU výkon. Aktuální úplná pipeline a produkční důkazy patří do [docs/verification.md](../verification.md); historický `audit.json` z 10. října se nevydává za dnešní kontrolu.

Primární zdroje, ověřené 10. 10. 2026:

- [SunCalc 2 – oficiální dokumentace](https://github.com/mourner/suncalc), lokální `node_modules/suncalc/index.d.ts` a `index.js`.
- [USNO – fáze říjen/listopad 2026, UTC](https://aa.usno.navy.mil/calculated/moon/phases?date=2026-10-01&format=p&nump=6): nov 10. 10. 15:50, první čtvrť 18. 10. 16:12, úplněk 26. 10. 04:12, poslední čtvrť 1. 11. 20:28.
- [Open-Meteo – parametry a intervaly](https://open-meteo.com/en/docs), živý požadavek API ověřil jednotky m/s, procenta a interval 900 s pro aktuální podmínky.
- [NASA SVS – CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) a [pokyny pro použití médií](https://www.nasa.gov/nasa-brand-center/images-and-media/). Zdrojový soubor je uveden v `sources.json`. Hra ani odvozená vizualizace nejsou produktem NASA a nevznikly s jejím schválením.
