# Lokální odvozená oprava veřejných pěších povrchů

Tato implementace **nemění originální IPR soubory**. Zvlášť přiznává odvozenou úpravu několika vrcholů a doplnění chybějící podpory. Není to globální zploštění fotogrammetrie ani tvrzení, že vykreslená odvozená geometrie zůstala zcela nezměněná.

## Chráněný skutečný objekt u původního spawnu

Trojúhelník `1127320 / 1056` u `[22, −14]` stoupá přibližně od Y−0.798 k Y−0.102. Není doložený jako poškozená zem; může zachycovat skutečný plot u sportovního areálu. OSM hřiště `108568385` leží jižně od něj, jeho mapovaný hrací povrch však sám neurčuje přesnou vnější hranici plotu. Proto je tato oblast **výslovně chráněná před deformací**. Integrátor přesunul chybně umístěný původní spawn na skutečné veřejné parkoviště `[110, 12]` a auto na `[110, 16]`; souvislé navazující trasy se ověřují po přepočtu nové source kolize. Odstranit skutečný plot kvůli spawnu by byla nesprávná oprava.

Regresní test přímo dekóduje původní uzel a potvrzuje, že originální trojúhelník 1056 zůstává numericky beze změny. Chráněné jsou také mapované budovy, sportovní plochy s okrajem a celý B6 včetně přístupu, jehož přesnou průchozí konstrukci spravuje samostatná vrstva integrátora.

## Co se skutečně opravuje

`shared/data/photogrammetry-ground-repairs.json` obsahuje **13 konkrétních intervalů skutečných veřejných OSM pěších cest**, u kterých audit nejpodrobnějšího zdroje prokázal chybějící blízkou podpůrnou zem pod vyššími objekty či vegetací. Každý interval uchovává OSM way ID, skutečnou šířku, vzdálenost na segmentu, source node ID a původ auditu. Výsledné záplaty se dále protínají se stejnými spojenými uličními polygony včetně jejich děr; nevytvářejí zkratky přes trávník nebo střechu pod celým světem.

Lokální výplň má **94.88673 m², 649 trojúhelníků a jednu asfaltovou materiálovou dávku**. Používá původní `sourceGroundHeight` z ČÚZK DMR 5G a stejné dělení výškové mřížky jako ostatní terén. Nezaměňuje DMR s herní adaptací základu B6. Výšky výplně a nativní kolize jsou identické; renderer používá jen konstantní depth bias k odstranění coplanárního blikání na společných okrajích, nikoli jinou výšku podlahy.

Na těchto stejných intervalech se mohou upravit pouze blízké, dostatečně vodorovné source trojúhelníky: všechny tři vrcholy musí být nejvýše ±0.55 m od původního DMR a absolutní Y složka normály musí být alespoň 0.7. Vliv je omezen přesnou šířkou původní pěší cesty; podélně přechází do původního povrchu během 0.75 m. Strmé plochy, stromy, vyšší auta a vrcholy sousedící s nevyhovující konstrukcí jsou chráněné. Duplicity společného vrcholu v triangle soup dostávají stejnou ochranu, aby nevznikla trhlina u skutečné obruby. X/Z, pořadí vrcholů, UV, atlasy a všechny původní soubory se nemění.

Audit skutečného účinku na 19 souvisejících originálních source uzlech našel **60 změněných kopií vrcholů v 52 trojúhelnících**, maximální svislý posun **0.4476545 m**. UV hash zůstal shodný. Jde o konzervativní úpravu okrajů doplněné pěší země, nikoli odstranění všech nerovností nebo nízkých skutečných objektů. Přesné výsledky a původní resource SHA jsou v `ground-repairs-effect.json`.

Asfaltová záplata používá existující `SurfacePack` přes materiálová metadata `surfaceKind=asphalt`, fyzický UV poměr 4 m. Při integraci musí tento materiál projít stejným `SurfacePack.update` jako jiné doplněné povrchy. Je to obecná materiálová rodina s vlastní proveniencí, **nikoli zázračně obnovené IPR pixely země skryté pod stromem**.

## Přesné integrační API

```ts
import {
  applyPhotogrammetryGroundRepairs,
  groundRepairStats,
  getPhotogrammetryGroundPatchGeometry,
} from "./photogrammetry-ground";

// Vstup jsou již herní WORLD souřadnice, po EPSG:3857 -> metres transformaci.
const original = photogrammetryPositions(decoded, node, manifest);
const positions = applyPhotogrammetryGroundRepairs(original);
// Až potom ComputeNormals / sestavení source kolizí / vizuální cutout.
const diagnostics = groundRepairStats(original, positions);

// Připojit přímo jako další lokální source-support kolizi.
const fill = getPhotogrammetryGroundPatchGeometry();
// fill.positions a fill.indices už jsou ve světě, bez dalšího cos/height posunu.
// Indexy mají matematicky vzhůru orientované winding pro Rapier.
```

Pro zobrazení:

```ts
import { buildPhotogrammetryGroundRepairs } from "./photogrammetry-ground";
const derivedGround = buildPhotogrammetryGroundRepairs(scene);
// Při ukončení: derivedGround.dispose().
```

Renderer i generátor nativní kolize musí volat tutéž opravnou funkci a použít totožná data výplně. Získané cache arrays se nemají mutovat. Originální JPEG i geometry `.bin` zůstávají archivovaným nejpodrobnějším zdrojem; oprava existuje výhradně jako odvozená herní vrstva.

## Ověření a praktické hranice

`pnpm exec tsx --test tests/photogrammetry-ground.test.ts`: **6/6 PASS**. Testy pokrývají skutečně chráněný původní source trojúhelník, opravu konkrétního lokálního pěšího povrchu, zachované vyšší objekty a strmé obruby, kontinuitu společných vrcholů, shodné výšky nativní/renderovací geometrie, skutečné Rapier paprsky a zrušení všech rendererových dávek. Po převodu na Float32 se odstraní mikroskopické vzniklé ořezové slivery, aby se do odvozené podpory nedostaly nulové nebo numericky obrácené trojúhelníky.

Toto samo o sobě není důkaz souvislé chůze po celé nově integované hře. Integrátor připojil shodnou transformaci do vizuálního rendereru i generátoru source kolize, sdílenou výplň do nativní kolize a její mesh do rendereru. Přepočet odvozené kolize a opakování skutečných KCC tras z nového veřejného spawnu probíhá samostatně. Při dalším blokování je třeba identifikovat skutečný objekt nebo vadný povrch; skutečné ploty a auta se nemají automaticky mazat. B6 má vlastní cílenou opravu schodišťového nástupu. V této agentí práci nebyl spuštěn full build/suite ani GPU benchmark a nebyly přepisovány kořenové Game/Simulation/photogrammetry renderer soubory.
