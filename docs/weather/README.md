# Obloha a skutečné počasí na Strahově

Implementace používá souřadnice 50.08065° N, 14.39175° E. Osa X míří na východ, osa Z na jih. Časový údaj je vždy UTC instant v milisekundách; letní/zimní čas se používá jen při zobrazování pražských hodin a čtení hodin meteostanice.

## Astronomie

- `shared/weather.ts` volá skutečně nainstalovaný **SunCalc 2.1.1**. V této verzi jsou výstupní úhly **ve stupních**, azimut jde po směru hodin od severu. Hra je převádí na radiány a vektory světa. Starší návody pro SunCalc 1.x mají jiné jednotky a nesmějí se použít.
- Slunce i Měsíc mají vypočítanou polohu pro aktuální datum a Strahov, včetně změny výšky dráhy během roku. Nejde o zrychlený každodenní kruh. Výpočet je aktualizován nejvýše jednou za sekundu.
- Sluneční kotouč má úhlový průměr 0,533°. Měsíční průměr se mění podle vypočítané vzdálenosti a poloměru 1737,4 km. Tenká záře Slunce je výtvarná atmosférická aproximace, nikoli zvětšený sluneční kotouč.
- Shader Měsíce osvětluje promítnutou kouli podle skutečného osvětleného podílu a natočení jasného okraje vůči zenitu. Nov není stále svítící plný kotouč. Měsíční světlo scény závisí na fázi a výšce nad obzorem.
- Povrch používá skutečnou mapu LROC z NASA SVS. Mapa je pevná; optická librace, přesné natočení měsíčního pólu, zatmění a městský horizont terénu nejsou simulovány. Sférická textura je podrobnější než původní jednobarevná koule, bez tvrzení o astronomické přesnosti těchto detailů.
- Barvy atmosféry, expozice noci a hvězdné pozadí jsou herní aproximace. Hvězdy se otáčejí kolem nebeského pólu, ale nejsou katalogem skutečných souhvězdí. Noční expozice umožňuje orientaci hráče.
- Rozsvícená okna označená `StandardMaterial.metadata.nightWindows` zesilují po setmění a slábnou v pozdní noci podle pražských hodin. Vzor je fiktivní; nesleduje skutečné obsazení pokojů.

## Data a vítr

Server obnovuje počasí nejvýše jednou za 5 minut a souběžné požadavky spojuje. Čerstvá [meteostanice Silicon Hill](https://weather.sh.cvut.cz/weather/) je zdrojem teploty, povrchového větru a intenzity srážek. Měření starší než 30 minut nebo více než 5 minut v budoucnosti se považuje za zastaralé. Nečitelná intenzita nebo směr větru není nahrazena vymyšleným bezvětřím/suchem.

[Open-Meteo](https://open-meteo.com/en/docs) dodává **modelovou**, nikoli změřenou oblačnost, její nízkou/střední/vysokou složku a modelové proudění v 850/700/500 hPa. Povrchové hodnoty modelu se používají jako označený fallback při výpadku/zastarání stanice. Model starší než hodinu je zastaralý. `observedAt` a `cloudObservedAt` jsou oddělené; čerstvá stanice nepřebírá zastaralou modelovou oblačnost. Při výpadku obou zdrojů zůstávají poslední hodnoty označené jako zastaralé.

`windVector(speed, fromDegrees)` vrací skutečný směr pohybu v m/s. Například severní vítr proudí na jih: X = 0, Z = +speed. Vegetace a déšť mají používat povrchový vítr. Mraky používají modelové proudění ve výšce, pokud je dostupné; jinak je drift povrchovým větrem výslovně orientační. Změna proudění se plynule vyhlazuje vektorově, takže otočení přes 0° nezpůsobí rotaci opačným směrem.

U Open-Meteo je `current.precipitation` **úhrn za `current.interval`**, nejčastěji 900 s. Server převádí hodnotu na mm/h pomocí `3600 / interval`. Hodnota `rain` v herním protokolu je intenzita vodního ekvivalentu všech srážek; modelový `snowfall` je zvlášť v cm/h. Samotná teplota není spolehlivé určení skupenství srážek.

Z čísel oblačnosti a větru nelze určit skutečné rozložení jednotlivých mraků nad Prahou. Hra používá 24 sdílených texturovaných ploch s několika vrstvami a vlastní procedurální RGBA texturou. Výšky 125–219 m jsou **stlačené herní vrstvy**, nikoli měření základny mraků. Rychlost a směr driftu vycházejí z uvedených dat; lokální poryvy mezi bloky a výškový profil v každém bodě se neřeší.

## Zapojení

```ts
const skyWeather = new SkyWeatherController(scene, sunOrb, moonOrb, clouds);
// Po aktualizaci kamery a před scene.render():
const instant = timeOverride ?? Date.now();
const state = skyWeather.update({
  instant,
  weather,
  player: position,
  dt,
  quality,
});
applyArtLighting(context, { ...state, weather, player: position, dt });
// state.wind je vyhlazený povrchový vítr pro vegetaci a déšť.
// Při úklidu scény:
skyWeather.dispose();
```

Controller vypne původní koule, založí dva úsporné průhledné kotouče a vymění sdílenou texturu mraků. Původní pohyb koule a mraků ve `Game.frame` je nutné odstranit, aby se neposouvaly dvakrát. Viditelnost/odstín mraků řídí `applyArtLighting`; controller řídí pouze astronomii, geometrii kotoučů a drift. Měsíční textura se načte z vlastního lokálního `/textures/sky/moon-lroc-2k.jpg`, nikoli z NASA při každém spuštění.

## Ověření a zdroje

`pnpm exec tsx --test tests/weather.test.ts tests/core.test.ts tests/graphics.test.ts` ověřuje 22 případů: světové strany, výšku letní/zimní dráhy, fáze vůči nezávislým časům USNO, promítnutou plochu měsíčního terminátoru, natočení osvětlení směrem ke Slunci, pražský přechod letního času, převod úhrnů, bezpečné fallback chování a maskovanou emisi oken. `pnpm exec tsc --noEmit` prošel. Tyto kontroly nenahrazují měření FPS ani vizuální GPU kontrolu integrované scény. Živý požadavek a příklady dráhy jsou uložené v `audit.json`; lze je obnovit příkazem `pnpm exec tsx docs/weather/verify.mts`.

Primární zdroje, ověřené 10. 10. 2026:

- [SunCalc 2 – oficiální dokumentace](https://github.com/mourner/suncalc), lokální `node_modules/suncalc/index.d.ts` a `index.js`.
- [USNO – fáze říjen/listopad 2026, UTC](https://aa.usno.navy.mil/calculated/moon/phases?date=2026-10-01&format=p&nump=6): nov 10. 10. 15:50, první čtvrť 18. 10. 16:12, úplněk 26. 10. 04:12, poslední čtvrť 1. 11. 20:28.
- [Open-Meteo – parametry a intervaly](https://open-meteo.com/en/docs), živý požadavek API ověřil jednotky m/s, procenta a interval 900 s pro aktuální podmínky.
- [NASA SVS – CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) a [pokyny pro použití médií](https://www.nasa.gov/nasa-brand-center/images-and-media/). Zdrojový soubor je uveden v `sources.json`. Hra ani odvozená vizualizace nejsou produktem NASA a nevznikly s jejím schválením.
