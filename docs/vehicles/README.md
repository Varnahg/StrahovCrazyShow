# Samostatný car master a sdílený runtime pack

Hra nyní používá zakřivený samostatný hatchback s modelovaným interiérem, skutečnými pneumatikami, disky a čtyřmi nezávislými pivots. Každé parkovací nebo jedoucí auto má vlastní kořen a transformaci; neslučuje se s areálem. Nejde o fotogrammetrický vrak, ilustraci ani model skutečné značky a konkrétního strahovského auta.

Původní [Innerscene model](https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0) je vydaný jako **CC0**, včetně možnosti úprav a distribuce. Původní GLB je zachovaný byte-for-byte: **5 037 744 B**, SHA-256 `107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7`. Originál, importovaný `.blend`, opravený editovatelný near master a odvozené LOD jsou v `assets/blender/vehicles/innerscene-hatchback`. Původní `public/models/strahov-compact.glb` nebyl přepsán.

## Skutečně zkontrolovaný zdroj a opravy

Blender 5.2.2 importoval **130 902 trojúhelníků, 314 meshů a 10 materiálů**. Skutečné bounds importu jsou **4,26486 × 2,11692 × 1,58514 m**, což se mírně liší od nominálních rozměrů na webu. Byly vykresleny a prohlédnuty původní přední/zadní a boční pohledy; fotografie v této složce jsou skutečné rendery meshů, nikoli vygenerované ilustrace.

Následné skutečné WebGL review odhalilo vady, které samotná kontrola degenerovaných trojúhelníků neodhalí. Kapotový shut-line měl 183 vrcholů uvnitř shellu a 185 téměř koplanárních; přední dveřní shut-line 246 uvnitř, místy až přibližně 7 cm. [Podepsané vzdálenosti a zdrojové objekty](./source-seam-audit.json) jsou zachované. Opravený derivát přestavuje konkrétních 11 centerlines na skutečném povrchu shellu, s jednotným poloměrem 2,2 mm a offsetem centerline 3,5 mm ve zdrojových metrech. Horní úseky u oken mimo shell zůstávají vůči rámům. Po normalizaci se tyto milimetrové rozměry odpovídajícím způsobem mění.

Dva rovné přídavky `Flush roof side flange` a samostatný `Roof spoiler lip` vytvářely přečnívající rohové pláty. Z derivátu bylo odstraněno pouze těchto 12 + 12 + 188 trojúhelníků. Vlastní `Crowned roof pressing` zůstal zachovaný; kontrola uzavřenosti po logickém svaření 1 μm potvrzuje nulové otevřené hrany. Původní master zůstává archivovaný. Objekty `107 reused` v tomto konkrétním zdroji patří kolům, nikoli druhé skryté karoserii.

Opravený near master prošel druhým skutečným WebGL review a pohledem **Spáry zblízka**. Zblízka jsou kapotová a přední dveřní spára souvislé, střecha čistá, interiér viditelný a shader chyby prázdné. Důkaz: [repaired-near-closeup.png](./root-review/repaired-near-closeup.png). U vzdálenější zadní spáry zůstává jemný subpixelový aliasing; neprohlašujeme pixelovou dokonalost. [Komponentní prohlížeč](./preview.html) má také ovládání kol, barvy, detailu a osvětlení.

## Rozměry, podklad a materiály

Sdílená fyzika se nezměnila. Derivát se mapuje na **3,56 × 2,04 × 1,56 m**, rozvor 2,1 m, track 1,7 m a kruhová kola s poloměrem 0,34 m. Původní rozvor byl 2,58264 m a poloměr přibližně 0,31614 m. Dokumentované po částech lineární mapování zachovává kruhové nápravové zóny a podběhy, zkracuje prostor mezi nápravami a omezuje přečnívající zrcátka do fyzického envelope. Souřadnice se rotují se zachovanou orientací a windingem; nepoužívá se zrcadlení. Všechny knot values jsou v [runtime-pack-audit.json](./runtime-pack-audit.json).

Pivots odpovídají `VEHICLE_WHEELS`: x ±0,85, z ±1,05, parkovací y 0,36. Spodní bod pneumatik je lokálně 0,02 m, kořen používá sdílený offset −0,0112 m. Na všech 24 parkovacích polohách byl ověřen nezávislý kontakt s DMR: **mezera 0,001871–0,015064 m**. Poloha a rotace vozidla používá stejný sdílený terén jako fyzika. Otáčení, řízení a pružení jedné reprezentace nemění ostatní samostatná auta ani immutable zdrojové geometrie.

Zdrojové mapy mají skutečnou mikrovariaci, proto zůstávají zachované. Pouze lak má oddělenou neutrální mikrotexturu a explicitní barevný faktor glTF, aby bílé/červené varianty nezůstaly přimodralé. PBR materiál laku se sdílí podle skutečné barvy mezi rigy i LOD; nevzniká 24 shodných kopií. Dielektrická skla používají alpha 0,34 a modelovaný interiér; původní plnou transmission aproximují bez dalšího refraction render targetu. Brzdové třmeny zůstávají dekorativní součástí těla, nejde o úplný mechanický model zavěšení.

## LOD a API pro hru i provoz

| LOD                                   | Trojúhelníky | Části | Velikost GLB |
| ------------------------------------- | -----------: | ----: | -----------: |
| Near, zachovaná geometrie po opravách |      138 750 |    26 |  5 351 716 B |
| Medium, opravené wheel LOD K           |       42 732 |    26 |  2 063 852 B |
| Far, opravené wheel LOD K              |        9 202 |    26 |    479 460 B |

Originál a near master nebyly kvůli LOD zjednodušeny. Exportní a loader testy potvrzují konečné souřadnice/normály a nulové trojúhelníky s plochou pod 1e−12 m² ve všech třech výstupech. Nativní Babylon instance LOD vybírá zdroj podle skutečné kamery; na auto vzniká 26 instancí, nikoli tři úplné kopie. Sdílené low/medium/high prahy jsou **10/36, 16/55, 24/75 m**.

[Wheel oprava K](./wheel-repair.md) řeší rozpojené UV ostrovy před decimací a nevalidní far dvoustranné kolapsy. Všech32 skutečně exportovaných medium/far wheel částí je uzavřených a bez degenerovaných trojúhelníků; J body/PBR/obrázky/uzly zůstaly bitově stejné. Následná [near oprava 11. 10. 2026](../vehicle-pilot-repair-20261011.md) odstranila vnitřní normalizační fold výměnou jedné diagonály: pouze šest indexů, bez změny vertex polí, UV, materiálů, rozměrů nebo kol. Opraven je také editovatelný master a regenerátor. Nová GPU přejímka této opravy zatím neproběhla. Far limity zůstávají otevřené a jsou nově rozlišené podle skutečných source komponent; 22 z 28 starších body-ray missů patří třmenům, nikoli vnějšímu shellu. Uzavřenost kol se nevydává za dokonalost celé karoserie.

```ts
import { acquireCarPack, CAR_PACK_MANIFEST } from "../../client/car-pack";
const lease = await acquireCarPack(scene);
const rig = lease.pack.createRig("traffic-car-unique-id", "#aeb5b9");
// Pouze pro zaparkované / vypnuté auto:
const parked = lease.pack.createRig("parking-unique-id", "#aeb5b9", false);
lease.pack.setQuality(quality); // vnitřní guard; společné pro celý Scene pack
lease.pack.updateLighting(lighting.night);
// root = nezávislý TransformNode, wheels = právě 4 samostatné TransformNode
rig.dispose();
parked.dispose();
lease.release(); // až po zrušení vlastních rigů, nikoli přímé pack.dispose()
```

`loadCar()` standardně používá tentýž pack jako `TransitRenderer`; opakované acquire ve stejné Scene sdílí jeden upload. Explicitní `assetSource` ponechává legacy/offline cestu a původní regresní testy. Controller vrací `setQuality()` a `updateLighting()` vedle stávajících kořenů, wheel update a dispose. Konečný release uklízí také paletové texture wrappers; vlastní scene BRDF LUT se nepoškozuje. [Kanonický manifest](../../shared/data/assets/vehicles-manifest.json) a veřejná kopie jsou byte-for-byte shodné.

## Noční světla

Main přední a zadní lens jsou oddělené od skel, mlhovek, couvaček a třetího brzdového pruhu. `updateLighting(night)` nastavuje emisi pouze main lens. Zaparkované rigy používají sdílené neemitující varianty, takže všechna stojící auta v noci samovolně nesvítí. Osvětlené lens neznamenají další skutečný dynamický zdroj pro každé NPC.

Středy dvou předních světel jsou odvozené z konkrétních `Flush swept transparent headlamp lens` source meshů, stejnou normalizační funkcí jako karoserie: **x ±0,624723, y 0,830676, z přibližně +1,75775 m**. Jsou v `CAR_PACK_MANIFEST.lights.frontCentres`, spolu se zadními středy a proveniencí. Kořen může jejich průměr použít pro jeden combined řízený headlight SpotLight s konečným dosahem. Emisivní hodnoty i dosah/beam jsou herní výtvarné odhady, **nikoli naměřené lumeny nebo kandely**. Brzdová a couvací signalizace vyžaduje samostatný stav; samotný přechod na noc je nezapíná.

## Ověření a opakování

`tests/realistic-car-pack.test.ts` načítá skutečné GLB přes skutečný Babylon loader. V headless části jsou záměrně odložené dekódy obrazů; ověřuje geometrii, materiálové hodnoty, fyzické rozměry, skutečný LOD selection, refcount, paletu, grounding a omezenou emisi, **nikoli GPU nebo FPS**. Původní legacy loader regrese zůstávají zachované.

Původní pack ověření: **11/11 PASS**, exit 0, [úplný log](./targeted-tests.log). Původní `pnpm exec tsc --noEmit`: **PASS**, exit 0, [log](./typescript.log). Po integraci lokální near opravy: **19/19 cílených testů PASS** včetně reálného GLB loaderu, LOD, 24 parkovacích pozic a kontrol nezměněných kol; [nový log](./inner-shell-repair-tests.log), [aktuální audit](./inner-shell-repair-audit.json). Cílený TypeScript rovněž PASS. Full suite, build, integrace a nová GPU přejímka patří do kořenového předání. Prvotní bílé CPU near rendery v `before-repair` jsou historický důkaz chyby barevného exportu; dřívější modrý master potvrzuje tehdejší WebGL review, nikoli tuto následnou opravu.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/car-master-pack.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-realistic-car.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --threads 2 --python scripts/create-car-lods.py
pnpm exec tsx scripts/build-car-manifest.ts
pnpm exec tsx --test tests/realistic-car-pack.test.ts tests/native-car-models.test.ts
```

Blender audity používaly nejvýše dvě CPU vlákna. FullGame cold WebGL, společná kvalita s vegetací, řízení/kamera a skutečný GPU/FPS benchmark patří finální integraci. **138 750 trojúhelníků ani komponentní snímek nejsou měření výkonu celé hry.**
