# Předání: cad-buildings-b1-accessibility-20261024

- Vlastník: `cad-buildings-01a16b37-accessibility-probe`; příjemce: root koordinátor `cad-buildings-01a16b37-root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/cad-building-models`, baseline `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.
- Výsledek: přenositelný CPU tester souvislé dosažitelnosti dveřních bodů je implementovaný a ověřený malými skutečnými Rapier fixtures. Celý B1 nebyl spuštěn; jeho přejímka a přejímka celé hry zůstávají otevřené.
- Změněné verzovatelné soubory: `scripts/cad-buildings/verify_accessibility.mjs`, `scripts/cad-buildings/test_accessibility.mjs`, tento handoff. Nic nestagováno ani necommitováno. Cizí WIP a read-only závislosti nebyly změněny.
- Vlastní ignorované výstupy: `.cache/cad-buildings-20261024/b01-accessibility/tests-initial.log`, `source-manifest.json`, `seeds-main-entry.json`. Poslední obsahuje pouze explicitní vstupní ID `route:exterior-main-east:lower`, odvozené z existujícího reportu R8b; žádnou kopii CAD.

## Volba a mechanismus

Zdrojová sousednost místností je levná, ale neodhalí stěnu navíc. Kompletní jemný graf s plným controllerem na každé hraně by opakoval velké množství stejné fyziky. Zvolená varianta používá omezenou mřížku a konzervativní capsule sweep jen k hledání kandidátní cesty. Souvislou dosažitelnost poté doloží skutečný controller od výslovně vybraného vstupu. Společný strom cest se prochází do hloubky, takže sdílenou chodbu není nutné přehrát znovu pro každé dveře. Po selhání návratu nebo větve se postava obnoví pouze na vstupu a ověřenou cestu k odbočce znovu fyzicky přehraje.

Výšky a podpora pocházejí z aktuálních `slab`, `stair` a `stair-landing` collision meshes. Mřížka není další stavební geometrie. Jednotlivé body mají zvláštní výškovou hladinu; stejné XY v jiném podlaží nevytvoří spojení. Sweep omezuje překročení stěn, podpůrné paprsky po nejvýše 15 cm filtrují chybějící podlahu. O konečném PASS rozhodují teprve souvislé skutečné kroky kapsle, nikoli tyto plánovací testy.

Externí reporty musí odpovídat SHA-256 collision JSON, GLB, actor source, profilu i všem nastavením kapsle. Dveře musí pocházet z nativních anotací téhož JSON. Vyžadují se oba směry všech dveří a schodišť modelu; chybějící, cizí či duplicitní výsledky jsou chyba. Souřadnice se kontrolují proti dveřním anotacím a `routePath`. Doloženou hranu vytvoří pouze úspěšný setup, prázdné překryvy a všechny skutečně úspěšné kroky s konečnou polohou a správnou výškou. Taková hrana se v globální cestě přesto znovu fyzicky přehrává.

Uzavřené fasádní prosklení je vyřazeno z průchodových cílů a zachovává výsledek vlastní coverage přejímky. Doložené externí dveře bez podpory mají kategorii `external-pending-terrain`; neklasifikovaný otvor bez podlahy má odlišnou kategorii `unclassified-missing-support`. Ani jedna není PASS. Ostatní výsledky rozlišují fyzicky dosažený bod, neověřenou plánovanou cestu, neplatný dveřní bod a bod nenalezený v mřížce.

Refaktoring: společné kontroly identity a úspěšného průchodu; společné vytvoření kandidátního bodu, cache kandidátů a sweep hran; jednotné spuštění/uvolnění postavy a souvislé přehrání cesty. Každá vytvořená postava se odstraní i při výjimce. CLI uvolní scénu v `finally`. Report `proofSessions` zachovává setup a všechny kroky jednotlivých souvislých návštěv; dosažený bod uvádí session a index kroku, po němž byl potvrzen.

## Ověření a identita

2026-10-24 přibližně 06:16 UTC: `node --test scripts/cad-buildings/test_accessibility.mjs`, exit 0, **12/12 PASS**, 1,619 s. Dependency root byl izolovaný, předem hashově ověřený `.cache/cad-buildings-20261024/b01-build/rapier-deps-20261024`, Rapier 0.21.0. `node --check` obou nových souborů exit 0.

Fixtures ověřují spojenou podlahu, tenkou dělicí stěnu, skutečný obchvat překážky, stejnou pozici v jiném podlaží, chybějící podlahu, vyčerpání rozpočtu, odmítnutí falešné hrany přes zeď, nesoulad hash/profil/fyzika, nesoulad anotace či neúspěšný krok reportu, odlišení prosklení/terénu/neurčeného otvoru, skutečné spojení schodištěm a lifecycle při výjimce. Zvláštní fixture má **4/4 lokální dveřní průchody úspěšné**, ale kvůli oddělené místnosti dosáhne ze vstupu pouze **2/4 dveřních bodů**, správně `partial`.

- Validator SHA-256: `81bb575f7e3bf0e84e31f86127de8baef18d64746d837f9957a6f9d0b3da74f5`.
- Testy SHA-256: `20a2069815060ba21a9b6495233de8e37c7be52a9529b2581cbd8eaafe0290e1`.
- Read-only `rapier_model.mjs`: `0875467342c0f85807daa8488e71144fe80a05714b51765fece7958ae922229c`.
- Read-only `verify_routes.mjs`: `99378ff26b6bd990b9ee7d48d912d9f6545cbe7dc3b72231a17acfc01ee950c2`.

## Použití při další rezervaci heavy-validation

Koordinátor nejprve převezme rezervaci testeru a drží `heavy-validation`; celý model je těžké ověření. Potřebuje aktuální nativní collision JSON s `doors` a nové kompletní door/route reporty pro přesně tentýž model a profil. Starý veřejný checkpoint bez `doors` není použitelný. Níže zástupné názvy reportů nahraďte skutečnými názvy aktuálního checkpointu; recepturu ani původní CAD nástroj nepřijímá.

```powershell
node scripts/cad-buildings/verify_accessibility.mjs `
  --dependency-root .cache/cad-buildings-20261024/b01-build/rapier-deps-20261024 `
  --model shared/data/cad-buildings/b01.json `
  --door-report .cache/cad-buildings-20261024/b01-build/doors-C.json `
  --route-report .cache/cad-buildings-20261024/b01-build/routes-C.json `
  --seeds .cache/cad-buildings-20261024/b01-accessibility/seeds-main-entry.json `
  --profile cad-plan `
  --output .cache/cad-buildings-20261024/b01-accessibility/accessibility-C.json
```

Výchozí rozlišení je 0,75 m, spojovací dosah od portálu 1,6 m, výšková tolerance 0,035 m; limit je 30 000 platných bodů, 100 000 kandidátů, 150 000 sweepů a 40 000 skutečných kroků mezi waypointy. Přepínače `--spacing`, `--max-nodes`, `--max-candidates`, `--max-sweeps`, `--max-moves` dovolují řízené zpřesnění. Návratové kódy: 0 všechny cílové body doložené bez čekajících kategorií, 2 částečná přejímka, 1 chyba vstupů/běhu.

Nenalezená cesta **není důkaz izolované místnosti**: konečné rozlišení, konzervativní sweep a zvolený kandidátní strom mohou cestu minout. Při selhání skutečné hrany se automaticky nehledají všechny alternativní cesty. Výsledek zůstává otevřený pro jemnější probe nebo posouzení konkrétního bodu. Počet dveřních bodů se nevydává za počet místností. Plná hra, terén, klient/server a GPU nebyly ověřeny.

Procesy: pouze ukončené malé CPU fixture příkazy; žádný server, Blender, GPU nebo běžící helper. Celý B1 nebyl spuštěn, protože heavy-validation patří druhému chatu. Rezervace se po tomto předání uvolní; původ vlastního untracked WIP je tímto výslovně předán koordinátorovi, který jej může převzít přes `--adopt-dirty`.

Integrátor: čeká na čtecí přijetí koordinátorem, konkrétní celý B1 probe a pozdější integraci. Task stav zůstává `ready`; tento handoff nepotvrzuje dokončení modelu ani hry.


## Převzetí koordinátorem a oprava přiřazení patra

Root převzal doložený WIP rezervací `cad-buildings-01a16b37-access-acceptance`. Čtecí kontrola zjistila, že report mohl obsahovat platný lokální průchod ve stejném XY o patro výše, aniž byl odmítnut proti spodní výšce dveřní anotace. Konkrétní dvojpodlažní fixture byla nejprve RED (`wrong-floor-red.log`). Příprava evidence nyní znovu měří podporu vůči `door.bottom` a porovnává i kontaktní výšku kapsle. Celkem **13/13 testů PASS**,1,378s; `tests-root-acceptance.log`. Žádný celý B1 ani Blender během cizího heavy okna neběžel.

Aktuální validator SHA `01582833276755b8f7a128613004f1c4fe02219cdaa0649026942148e69bfb5f`; testy `5afe43f6bf10e1929017403522da67f1ca578d1e65360a92c404dc02a7668c6d`. Původní agentovy hashe výše zůstávají historickým předáním. Celá modelová přejímka nad C zůstává pending.

## Mezipodesty jako odbočky doložených tras

Vlastník `cad-buildings-01a16b37-accessibility-branches` převzal výslovně předaný root WIP pomocí `--adopt-dirty`; kontrola výšky dveřních bodů, 13. test, předchozí root sekce a `wrong-floor-red.log` zůstaly zachovány.

První skutečný report R9a měl 441/563 dosažených bodů a žádné selhání souvislého pohybu. Všech 78 nedosažených N03 bodů bylo v křídlech na 4,35 m; main na 5,70 m byl dosažený. Obě U trasy přitom byly v globální stopě projeté. Čtecí triáž doložila, že tester vystavoval jen konce celé U trasy na 2,85/5,70 m. Její mezipodesty na 4,35 m měly správnou podporu a žádný překryv kapsle. Dvě malé skutečné návaznosti od již dosaženého spodního U nástupu přes mezipodestu k nejbližším křídelním dveřím prošly. Příčinou chybějícího větvení byl tester, nikoli doložená závada modelu.

`prepareEvidence` nyní vystavuje všechny waypointy s konečnou výškou z kompletně úspěšně ověřené směrové trasy. Původní ID `route:<id>:lower` a `route:<id>:upper` zůstala zachována, mezilehlé kotvy mají stabilní ID `route:<id>:waypoint:<index-v-původní-forward-path>`. Hrany zachovávají směry a přesné úseky původní cesty. Mezibody `floor:null` zůstávají uvnitř hran; nevytváří se z nich podlažní kotvy. Neúspěšný či neúplný směr neposkytne žádnou dílčí hranu. Pokud není kompletní ani jeden směr, nevzniknou mezipodestové kotvy vůbec. Nic z toho nepřidává nový externí seed ani stavební geometrii.

Nová skutečná fixture má spodní podlahu 0 m, odbočku k dveřím z mezipodesty 0,6 m a horní podlahu 1,2 m. Obě celé schodišťové trasy fyzicky procházejí. Před opravou byla odbočka RED 0/2 (`intermediate-landing-red.log`); po opravě je PASS 2/2 od spodního i horního vstupu. Odebrání posledního úspěšného kroku up reportu správně zabrání všem jeho dílčím hranám, zatímco kompletní down směr zůstane použitelný. Další regrese ověřuje uchování `floor:null` portálu uvnitř hrany v obou směrech. Opakovaná tvorba skutečných schodišťových reportů ve fixtures byla sjednocena do `stairReport`.

Samotná waypointová změna: **14/14 malých testů PASS**, 1,383 s. Následně bylo podle koordinátorova oznámení převzato read-only API `doorApproachGeometry(scene, door)` z `rapier_model.mjs`. `prepareEvidence` i fixture generátor dveřních reportů nyní používají jeho `points`; duplicitní výpočet normály, středu a stand-off vzdálenosti byl odstraněn. Root kontrola podpory vůči `door.bottom` a kontaktní výšky kapsle zůstala zachována.

Nová skutečná fixture mělkého prostoru se zadní stěnou a anotací `approachBoundaryCad` potvrzuje oba lokální směry i globální návaznost zkráceného bodu. Starý report s původním příliš vzdáleným bodem je odmítnut proti modelové anotaci. Výpočet zkrácení se v accessibility neopakuje; vlastní jej sdílený read-only helper koordinátora.

Konečný stav: **15/15 malých testů PASS**, 1,448 s, exit 0; `tests-waypoints-approach-api.log`. Syntaxe obou souborů ověřena `node --check`, exit 0. Manifest `source-manifest-waypoints-approach-api.json` obsahuje i přesné read-only závislosti:

- Validator: `983cab05de60d1f6840298d20e0e0cbedc4ac191796ef8eae83a8ced835d1193`.
- Testy: `c9fb44efcb50eeed7d1e68b59b00c2e346b0fcc14b513bc50c4aff11f11efbd2`.
- Read-only Rapier helper: `cf616c51f757c63bbe773a5ef2e9050c7bd6ef900bbdaf1c8fc203c2c05f870f`.
- Read-only route helper: `99378ff26b6bd990b9ee7d48d912d9f6545cbe7dc3b72231a17acfc01ee950c2`.

Žádný celý B1, Blender, GPU ani opakovaný celý grid během této implementace neběžel. Změny tohoto předání jsou opět jen původní dva `.mjs` soubory, tento handoff a vlastní ignorované logy/manifest. Všechny vlastní pomocné procesy skončily. Vlastník po GREEN předává veškerý zde popsaný WIP zpět koordinátorovi a uvolňuje rezervaci; root smí doložené změny převzít přes `--adopt-dirty`. Dosažitelnost všech zbývajících bodů skutečného B1 tímto není předem potvrzena.

## Root přijetí09:26UTC

Finální aktuální fixture sada13Rapier+15accessibility,28/28 PASS bez skip. R10 ze tří doložených vstupů dosáhl561/563 koncových bodů; poslední dva jsou podle konkrétních CAD stěn160A/1698 uzavřený prostor s výhradně vnějším přístupem, čekající na skutečný terén. Source zůstává pravdivý partial, nepřidává se umělý seed ani interní otvor. Tester a jeho cílený refaktoring byly převzaty; celá hra a navazující terrain integrace tím nejsou ověřené. Aktuální source checkpoint c13b05ac… v publikační cache zahrnuje také oba accessibility soubory. Task done po přijetí koordinátorem.
