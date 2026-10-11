# Oprava chůze, běhu a opory bot — 11. 10. 2026

Nejnovější navazující opravu skutečného odrazu, letu a doskoku popisuje [jump repair](jump-repair-20261011.md). Preview nyní srovnává P3 a opravu skoku; historické O2 podklady zůstávají zachované.

Předchozí opravu rozběhu, zastavení a opakovaného stisku pohybu po sestavě O2 popisuje [kontinuita kroků](transition-repair-20261011.md). Její O2 baseline a výsledky zůstávají zachované; následující zpráva a starší snímky patří ještě dřívější historické fázi.

Uživatel upozornil na poskakování postav a ruce příliš daleko vpředu. Audit skutečných světových transformací produkčního rigu potvrdil obě závady. Root, kapsle a kamera přitom měly nulovou animovanou vertikální odchylku; výrazný pohyb vznikal uvnitř rigu v pánvi a následně v hlavě.

## Podklady a rozhodnutí před úpravou

- Původní `client/animation.ts`, skutečné proporce a pivoty `client/avatar-renderer.ts`, skeleton a oděvy; volání stejného `AvatarAnimator` v `client/game.ts` a `client/transit-renderer.ts`.
- [Yang et al. 2015, Effects of constrained arm swing on vertical center of mass displacement during walking](https://pubmed.ncbi.nlm.nih.gov/26234472/): primární experiment při 1,34 m/s uvádí přibližně čtyřcentimetrovou vertikální změnu těžiště při běžném švihu paží. Hlava ani pánev herního rigu nejsou měřením lidského těžiště; studie zde určuje řád velikosti, nikoli přesný předepsaný pohyb.
- [Pontzer et al. 2009, Control and function of arm swing in human walking and running](https://pubmed.ncbi.nlm.nih.gov/19181900/): primární kinematický experiment podporuje protipohyb paží a jejich roli při stabilizaci trupu. Konkrétní úhly v demu zůstávají autorskou herní interpretací.
- B6 používá identifikovanou rekonstrukci schodů; zdejší geometrický zátěžový test má stupně 15 / 35 cm, bez vydávání za přesné zaměření celé B6.

Žádná animace, model, textura ani materiál z Hogwarts Legacy se nekopíruje. Referencí je klidný, věrohodný pohyb; tato oprava není tvrzením o dosažení jeho produkční kvality.

## Co se změnilo

1. Delší úplný běžecký cyklus snížil původní frekvenci 4,47 kroků/s při 4,6 m/s. Krok stále vychází ze skutečně uražené vzdálenosti, ne z počtu snímků.
2. Podpora boty navazuje mezi patou, plochou nohou a odvalem přes špičku. Kolenní recovery má menší zdvih a vrchol před polovinou švihu, aby nevypadala jako vysoké pochodování.
3. Výška pánve vychází z malé souvislé periodické trajektorie a dosažitelnosti právě podepřených nohou. Švihající noha smí svůj cíl přiblížit podle skutečné délky stehna a holeně; nesmí kvůli sobě stahovat celý trup dolů.
4. World výška pánve vyhlazuje fyzikální přechod na stupeň. Cílový nášlap se plánuje dopředu, při sestupu umožňuje předem snížit pánev. Příliš nízká zadní opora se při výstupu včas uvolní.
5. Kontroluje se také skutečný rozsah podrážky, nejen kotník. U hrany stupně dostane celá bota potřebnou výšku; pro riser mezi vzorky je kontrola záměrně konzervativní.
6. Paže mají malou extenzi ramene a méně pevného ohnutí lokte. Obě ruce nyní přirozeně procházejí i za trup. Gesta nadále plynule přebírají stejná ramena/lokty a vracejí se do klidu.

Veřejné API `AvatarAnimationState` se nezměnilo. Kód nepohybuje rootem, kamerou, fyzikou ani sítí. Lokální, vzdálené a dopravní postavy nadále vytvářejí stejnou animační třídu; detailní terénní dotaz poskytuje lokální hráč, vzdálení hráči a NPC používají aktuální rovinu chodidel.

## Ověřené výsledky

`before-transform-audit.json` a `after-transform-audit.json` zaznamenávají 27 kinematických scénářů: tři rychlosti, 30/60/144 Hz a rovinu / 12% svah / schody. Po první zahřívací sekundě se měří dalších pět sekund. **NullEngine zde dokazuje transformace a numerické limity; neměří GPU ani FPS hry.**

Rovná plocha, 60 Hz, před / po:

| Rychlost | Rozsah hlavy a pánve | Největší změna hlavy za snímek | Průměrná poloha levé ruky před rootem |
|---|---:|---:|---:|
| Chůze 1,8 m/s | 9,35 → 3,12 cm | 2,78 → 0,44 cm | +8,27 → +1,41 cm |
| Běh 4,6 m/s | 10,19 → 3,81 cm | 3,30 → 0,61 cm | +22,87 → +6,50 cm |
| Sprint 7 m/s | 13,51 → 3,60 cm | 5,24 → 0,70 cm | +23,18 → +5,78 cm |

Původní kontrola přesnosti kotníku sama nestačila: nový audit skutečných viditelných vertexů podrážky odhalil průnik až o výšku jednoho stupně, přestože kotník ležel nad podkladem. Oprava proto přidává test skutečné podrážky.

- 16 / 16 cílených testů `tests/animation.test.ts` + `tests/locomotion-quality.test.ts`: PASS.
- Nové testy kontrolují rozsah / rychlost hlavy a polohu obou rukou při 30/60/144 Hz, rozumnou kadenci, vertexové průniky podrážek na rovině, svahu a schodech v obou směrech při 1,8/4,6/7 m/s, přesnost podepřených kotníků, skutečné schody, otáčení a zastavení; všech šest tělesných proporcí také na příčném svahu a obrubníku.
- Celý `pnpm exec tsc --noEmit`: PASS po opravě typů; dvě dřívější přechodné chyby v průběhu editace nejsou vydávané za finální výsledek.
- Celé `pnpm test`, build a izolovanou integraci provádí rodičovský úkol na společném zmrazeném checkpointu včetně dalších oprav. Tento dílčí záznam je nenahrazuje.

Runtime původního auditu a náhledu SHA-256: `43264dc5539afee8705edac45040d2d7017ff1cc3a28fa5989b4bb27321dda81`. Finální korekce opory níže má SHA-256 `d4043c2407e8e741be84df8455895318230753968dada9d0302c422870045a6c`.
Původní runtime SHA-256: `43e32ecedcd59cc6ba4bc4357cb24985f73826ec92e6565de5a70a37b18070bd`.
Anatomie zůstala `8809116cd9d3f35c471f76429c863a58624126315031addb27642c22159ba8dc`, oděvy `03ef63d845c1027184d75fa17b219ae60133150efcdf2c68bc08031d5d8d1cba`.

## Interaktivní kontrola

`http://127.0.0.1:4197/docs/characters/locomotion-study/preview.html`

Spuštění: `pnpm exec vite --config .cache/locomotion-study/vite.config.ts` nebo otevřít tuto HTML cestu na běžném lokálním Vite serveru. Archivovaná `animation-before.ts` se liší od původního produkčního souboru pouze cestami typových importů pro samostatný náhled.

Vlevo je původní, vpravo upravená animace na stejném produkčním modelu a oděvu. Rozložení používá samostatné zobrazovací parenty po horizontální ose kamery, takže se postavy nepřekrývají ani v profilu. Nabídka obsahuje klid, chůzi, běh, sprint, otáčení, rozběh / zastavení, gesto, šest postav a různé pohledy. Veřejné tlačítko „Přejít do ustáleného kroku“ provede čtyři sekundy kinematického zahřátí; toto není výkonový benchmark. DOM `#metrics` odděluje transient a steady historii. Viditelné okno je nutné pro posouzení souvislého pohybu; throttlovaný skrytý tab není vhodný pro hodnocení časování.

Root nejprve skutečně otevřel náhled a ověřil `ready: true` / `shaderError: null`, ale zamítl překrývání v profilu a smíšenou historii přechodu. Layout i měření se opravily. Opakovaný GPU náhled na Intel UHD 630 potvrdil oddělené postavy v profilu, `ready: true`, `shaderError: null` a ustálený běh 4,6 m/s: 600 vzorků, rozsah hlavy původně 10,18 cm / nově 3,87 cm. [Snímek](root-review/run-profile.png), [DOM údaje](root-review/run-profile.json). Jde o kvalitativní kinematickou kontrolu, nikoli FPS, mocap nebo průchod schodiště s fyzikou. Celou pipeline a další praktické kontroly uvádí [přejímka zveřejněného dema](../../releases/demo-2026-10-11.md).

Reprodukce transformací: `pnpm exec tsx docs/characters/locomotion-study/audit.ts docs/characters/locomotion-study/after-transform-audit.json`.

## Omezení

Procedurální 13kostní animace není motion capture ani kompletní animační systém AAA. Stále má omezenou mimiku, přechody složitých směrů a individualitu postav. Konzervativní podpora přes hranu schodu může krátce zvednout celou botu na vyšší stupeň; na svahu se obuv nenaklání podle plné normály povrchu. Velmi rychlý sprint do schodů zůstává zátěžovým případem a má větší fyzický pohyb těla než rovná silnice. Terénní kontroly přidávají lokálnímu hráči několik floor dotazů; skutečný CPU/GPU dopad patří do benchmarku celé hry. Výsledky zde nezahrnují měření GeForce uživatele.

## Korekce opory po společné pipeline L — 11. 10. 2026, 15:04 Praha

Zmrazený checkpoint `github-demo-20261011-l` zůstal zachovaný se skutečným výsledkem 370 / 372. Jeden z neúspěšných testů stále vyžadoval pevnou výšku kotníku při došlapu. To je zastaralý kontrakt po zavedení odvalu: na podlaze zůstává bod paty či špičky, zatímco kotník se zvedá.

Nahrazení tohoto požadavku přímou kontrolou světové FK matice současně odhalilo skutečnou chybu: horizontální offset odvalu měl nesprávné znaménko členu `ankleHeight * sin(pitch)`. Bod podrážky má lokální Y souřadnici zápornou. Správná Babylon rotace proto používá Z příspěvek `-ankleHeight * sin(pitch)`. Jediná změna runtime tento člen opravuje; patní a špičková opora nyní při pohybu těla neklouže.

`tests/skinned-avatar.test.ts` zachovává kontrolu skutečných Babylon bone matrices, bind pose, deformace skin weights, LOD a likvidace skeletonu. Navíc nastavuje root podle skutečné dráhy a ověřuje oba druhy odvalu: po ustálení je světový bod podrážky na podlaze do 1 µm, kotník dosahuje cíle a stejný bod opory neklouže do 3 µm. Rozběhová podpora se měří samostatně s limitem 3 mm, protože pánev tehdy plynule přechází z klidového postoje; nejde o plošné navýšení původní tolerance. Test také vyžaduje skutečný zdvih kotníku nad 4 cm, aby jej nešlo obejít návratem k ploché botě.

Cílený refaktoring CPU skinning oracle připraví maticovou paletu jednou na vzorek a znovu používá vektory; nealokuje matici pro každý vliv každého vertexu. Numerický výpočet skin weights, bind-pose přesnost a kontrola deformace zůstávají zachované. Nejde o tvrzení o výkonu produkčního rendereru.

`pnpm exec tsx --test tests/skinned-avatar.test.ts tests/animation.test.ts tests/locomotion-quality.test.ts`: **22 / 22 PASS**. Celý `pnpm exec tsc --noEmit`: **PASS**. Runtime SHA-256 je `d4043c2407e8e741be84df8455895318230753968dada9d0302c422870045a6c`, test `0e1d11f8cdb88e587e1fd9ff2b4231993e16e50b660ea2a7ebba7a2c44648d51`. Původní audit a GPU náhled výše patří k předchozímu SHA, nejsou dodatečně vydávané za měření této korekce. Novou společnou pipeline, commit a push provádí rodičovský úkol; další grafická studie se neotevírá.
