---
title: 'KEY-59: první dokončený CAD model, blok 1'
type: 'feature'
created: '2026-10-24'
status: 'done'
route: 'dispatch'
baseline_commit: 'c713c2aedcafdb02358f05e4c9c51b607edeebc4'
review_loop_iteration: 0
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/docs/agents/bmad-policy.md'
  - '{project-root}/docs/reality-pack/cad-buildings/README.md'
---

<frozen-after-approval reason="uživatel zadal autonomní dokončení a potvrdil exteriéry i interiéry">

## Intent

Nahradit schematický archiv B1 editovatelným stavebním modelem podle pěti dodaných DXF. Je to první krok stejného úkolu pro všech 16 budov; další model začíná až po dokončení tohoto. Uživatel požaduje exteriéry i průchozí interiéry a dovoluje dopracování chybějících detailů. Všechny modely následně zapojit do hry, společně s odpovídajícími kolizemi.

## Boundaries & Constraints

**Vždy:** původní CAD soustava v metrech, společný počátek pater, oddělené podlažní kolekce, stavební otvory, skutečná schodiště a stropy bez uzavření schodišťového prostoru. Doložené půdorysy a odhadnuté výšky rozlišit v metadatech. Dokončení vyžaduje reopen skutečného Blender souboru a vizuální kontrolu, nikoli jen exit0.

**Nikdy:** původní DXF/DWG/TXT/LOG ani jejich obrazové či textové kopie do Gitu nebo zabalené do .blend. Žádný hromadný rebuild ostatních budov, změna hraného buildu, převzetí cizího WIP nebo tvrzení GPU výkonu z CPU auditu.

## I/O & Edge-Case Matrix

| Vstup | Výsledek | Chyba |
| --- | --- | --- |
| 5 lokálních B1 DXF | Samostatný metrický model, jednotlivá patra a metadata původu | Chybějící soubor zastaví export |
| Pomocné vrstvy/odlehlé body | Nejsou stavební geometrií; počet vyřazených entit v auditu | Nejasná významná hrana se hlásí, nevyplní náhodně |
| Dveřní a okenní kresba | Skutečné otvory, rám/ostění, otevřené průchozí dveře | Neúspěšné párování je explicitní nález |
| Střecha n04 | Střecha a malá nástavba | Nikdy čtvrté plné obytné patro |
| Snížená vstupní úroveň | Spojení schodištěm s hlavním1NP a polosuterénem | Výšky jsou označené odhady |

</frozen-after-approval>

## Code Map

- `scripts/cad-buildings/prepare_b01.py`: nový lokální převod DXF do dočasné geometrické receptury; uv/ezdxf/shapely, žádný runtime import DXF.
- `scripts/cad-buildings/build_model.py`: Blender vytvoří stavební solids, okna/dveře, schody, materiály a hierarchii; uloží editovatelný model.
- `scripts/cad-buildings/audit_model.py`: reopen, bounds/topologie/otvory/metadata a exportní shoda.
- `assets/blender/cad-buildings/b01.blend`: jediný nový finální zdroj B1; oddělený od starého generátoru, který by jej jinak přepsal.
- `public/models/cad-buildings/b01.glb`, `shared/data/cad-buildings/b01.json`: odvozený model a konstrukční kolize, zatím bez aktivace v herním registru.
- `shared/landmark-reality.ts`, `shared/simulation.ts`, `client/world-renderer.ts`: stávající B1 render/kolize/foundation; v tomto modelovém kroku se nemění. Integrační zásah je samostatný po modelech.

## Tasks & Acceptance

**Execution:**
- [x] `prepare_b01.py` + `test_prepare_b01.py`: lokální párování hran, otvorů a sloupů, explicitní B1 korekce, triangulované solids; testy syntetických CAD případů i skutečného lokálního výstupu.
- [x] `build_model.py`: jednotlivé modelové části s rolemi a podlažími, materiály, UV, vlastní schodišťová interpretace, uložení .blend a odvozených výstupů.
- [x] `audit_model.py`: skutečné reopen a kontrola konečných dat, nenulových trojúhelníků, chybějících podlaží, normalizovaných měřítek a průchozích otvorů; obrazové řezy všech podlaží.
- [x] `docs/reality-pack/cad-buildings/b01/` a handoff: zdroje/odhady, varianty, výsledky a omezení; samostatný commit po modelovém přijetí.

**Acceptance:**
- Given pět plánů, when otevřu uložený .blend, then existují 1PP/1NP/2NP/3NP/střecha a pouze plánovaná nástavba.
- Given pohled shora na patro, when porovnám půdorys, then členění a otvory odpovídají dokumentaci bez rozpisek a falešných stěn ze schodů.
- Given schodiště, when prohlédnu řez a modelový průchod, then navazují podesty, není nad hlavou uzavřená deska a podchodná výška je doložená.
- Given exportované konstrukce, when porovnám transformované vrcholy, then GLB i kolizní výstup odpovídají stejné Blender geometrii.

## Implementation Notes

24.10: Inventář i průzkum B1 hotovy. První renderer BMAD selhal transientním WinError5 při rename; diagnostická rename sonda uspěla a opakovaný oficiální renderer následně úspěšně publikoval validní snapshot, bez změny upstream kódu. Projektový přímý pokyn opravovat předpoklady a dokončovat autorizovanou práci byl použit; workflow nebyl obcházen čtením nezpracovaných upstream kroků.

24.10: Původní prototyp výšek rozšířen na výslovnou půlpatrovou interpretaci obou příčných křídel ve všech patrech (offset−1,6m), hlavní výšky zachované. CAD neprokazuje rovný bypass širokých schodišť; tato hypotéza dovoluje navázané boční/střední rameno, poslední patro používá úzké měřené dvojrameno a zachovává pokoje. Střecha9,6/8,0m. Není tvrzeno zaměření skutečných výšek. První64částový Blender kandidát uložen a znovu otevřen; numerická shoda GLB/kolize a206středových paprsků světlosti1,9m PASS. Obrazové přijetí a skutečný herní průchod stále chybějí, další budova nezačala.

## Spec Change Log

24. 10. 09:26 UTC — B1 modelově přijat. Po skutečném vrácení heavy proběhl nový úplný převod a162 Python testů vstrict režimu bez skip;28 Node fixture testů PASS. Nová receptura677b8f7d… s aktuálním generátorem942b9463… je kromě nového pole generatorSha256 přesně shodná s celou původní R10 recepturou d1202adf…. Master,GLB i kolizní JSON zůstaly byteově stejné. Všechny čtyři jednotlivé review nálezy mají výslovnou triáž;3 přímé opravy prošly následnou kontrolou původních reviewerů, claim-only nepřesnost přiřazení dveřní přejímky byla zamítnuta, nic odloženo. Status done platí pouze pro tento samostatný B1 stavební model, ne pro KEY-59/herní integraci/ostatních15 budov. Navazující commit je omezený na vlastní změny B1 a jeho nástroje/evidenci.

24. 10. 08:30 UTC — R10 je publikovaný do pracovních asset cest a vstupuje do nezávislého review. 154 Python testů bez skip, 11 fyzikálních a 15 accessibility fixture testů prošlo. Native Blender/reopen/export i byteově shodný následný export uloženého masteru bez CAD prošly pro všechny tři soubory. 44/44 schodišťových tras a 552/552 místních dveřních průchodů s podporou prošlo; 15 pevných fasádních prosklení má ověřené plné krytí otvoru. Dalších 11 vnějších dveří čeká na skutečný terén. Souvislé cesty ze tří doložených vnějších nástupů dosáhly 561/563 bodů; poslední dva patří prostoru za 28D2/28EB s výhradně vnějším přístupem. Souvislé CAD zadní stěny 160A/1698 dokazují, že se nemá prorážet vnitřní cesta ani přidávat umělý vnitřní seed. Původní diagnostický report zůstává partial.

Příprava obsahuje také zdrojově omezené uzávěry širšího N01 pod odsazenými křídly N02 a mělké bay bez falešného párového zdiva. Jejich nové nástupní meze respektují zadní stěnu i poloměr kapsle. P01 s146 už uzavírá skutečné vstupní schodiště/podesta, minimum světlosti 2,4659m; další deska nebyla přidána. Nativní R9 nález překryvu vyšší podpěry s N01 portálem2852 opraven jen v přesném rozsahu zdrojových jambů1603/1602. Všechny geometrické Z zůstávají hypotézou C. Podrobná aktuální evidence v README/model-audit a handoffech; R10 master5d415c1f…, GLB93aa01dd…, collision629ca3a8…. Ostatní budovy a herní integrace nejsou hotové. Heavy skutečně předáno 08:15–09:15UTC; review je pouze čtecí.

24.10. 05:39 UTC — zvolena varianta C pro navazující model. Po porovnání uniformního offsetu A (nestejné stoupání U0,105/0,217m), uniformních hlavních pater B (stejné risery, ale horší návaznost fasádních pásů) a společného0,15m stoupání C je C konzistentní se všemi22 vnitřními segmenty i IPR podestami/pásy. Lokální main:−3/0/2,85/5,70/roof9; wing:−4,65/−1,95/1,05/4,35/roof8,05; headtop11,55. Navržené světové posazení N01main4,20m. To je společná stavební a fotogrammetrická interpretace, ne nová geodetická kóta. Všechny XY, původní hrany a počty vnitřních stoupání zůstanou zachované.

Implementace současně opravuje prokázaný starší chybný zónový model: nekonečné Y pásy přiřazovaly42+42 oken dlouhých hlavních fasád i jejich stěnové pásy k nízkému wing. Nové regiony musí respektovat celé místnosti, oddělující stěny, vestibuly a skutečné U/L portály. Pouhé doplnění X meze nestačí: původní Y meze rovněž procházely částí hlavních pokojů N03. Příprava opraví společný resolver pro konstrukce i otvory a přidá konkrétní source witness testy.

IPR2023 potvrzuje vysoké rámované fasádní sestavy křídel N02/N03, nikoli generický parapet0,9m. Cílené profily skutečných vnějších řad: N02wing sill0,30/head3,05; N03wing sill0,10/head3,15m nad příslušnou podlahou. Světlé spodní výplně jsou materiálovou interpretací, ne tvrzením o čirém skle. Vyšší trojice hlavních čel jsou uzavřené prosklené výplně s kolizí; bez vymyšlených balkonů nebo otevřených dřevěných křídel. Nový native test tohoto provedení čeká na návrat výpočtového okna. Samostatná Rapier fixture potvrzuje skutečné blokování kapsle i odmítnutí chybějící skleněné výplně:8/8 malých testů PASS.

R8b před touto výškovou úpravou prošel native/reopen,44/44 trasami a544/604 dveřními pokusy (60 bez venkovní podlahy,0 blocked/invalid-start), všemi6 CPU rendery a exportem uloženého masteru bez CAD včetně302 dveřních anotací a6 výřezů terénu. R8b je lokální cache checkpoint; verzované asset cíle stále R7a. Neměnit tento rozdíl v dokumentaci na tvrzení konečného přijetí. Heavy předáno druhému chatu05:21–06:51UTC; nyní jen lehká implementace a jednotlivé testy, další native build až po skutečném vrácení.

24.10. 05:08 UTC: výšková volba R6 je znovu otevřená po primárním porovnání s IPR2023. Z původních30 dlaždic s ověřenými SHA vznikl pouze lokální čtecí render, žádná změna fotogrammetrického masteru. Dominantní vodorovné střechy jsou přibližně13,25m (hlavní) a12,25m (obě křídla), malá nástavba15,75m ve světové soustavě hry. Pixelové paprsky do texturovaných trojúhelníků ukazují hlavní vstupní podestu4,20–4,27m a N02 boční podestu5,24–5,38m. Jde o fotogrammetrii2023, nikoli stavební zaměření a nikoli automatické potvrzení historického stavu2005. n04.wing není endpoint žádné vnitřní schodišťové trasy; jeho dosavadní offset proto není vynucen CAD. Porovnávají se oddělené střechy, rozteče pater a proměnlivé posuny křídel podle skutečných počtů riserů. Dosavadní jednotný3,2m stack se nesmí označit jako finální skutečný stav.

Vnější inventář je nyní6 tras/7ramen. Nový R8 nativní audit zastavil publikaci na skutečném průniku P01 stěny1D2/1D3 místnosti s146 s posledními nášlapy hlavního vstupu. Rozhodnutí zachovává místnost a spodní stěnu, ořezává pouze průnik pod spodním lícem schodiště. Alternativy odstranit místnost, posunout rameno nebo vypnout kolizi jsou odmítnuty, protože by měnily doložený půdorys nebo oddělily vzhled od fyziky.

Diagnostika dveří: radius0,25m/halfHeight0,55m zachovává výšku1,6m a prochází nejúžšími skutečnými dveřmi. U dveří2DFE podpora na hraně schodu neodpovídá jedinému svislému paprsku pod středem kapsle. Reprodukční fyzikální test nejprve selhal; svislý sweep stejné kapsle se stejným odstupem opravil měření podpory bez uvolnění tolerance, změny geometrie nebo vynechání kontroly zaklesnutí.7/7 fyzikálních testů a konkrétní2/2 směry průchodu PASS. Herní controller zatím nezměněn; nutná společná klient/server a B6 regrese při integraci.

24. 10., navazující fyzikální kontrola: kandidát R4 prošel přesným reopen/export auditem a 56 cílenými testy. Samostatný Rapier 0.21.0 s aktuálním Actor nastavením však dokončil jen 17 ze 44 směrových zkoušek. Část startů leží v překážce a není validní trasa. Potvrzené modelové chyby: chybějící dno vnějších šachet a plná výška stěn v překryvu P01 místnosti pod schodištěm. Znovu se zkoumá půlpatrová výšková hypotéza napříč patry; žádná z těchto výšek není měřená. B1 se nepřijímá jako hotový.

Rozhodnutí pro šachty: místo obecného vyplnění děr nebo neviditelného kolizního boxu použít společné dva ověřené N01 obrysy také pro P01 podlahu. N01 je odečítá, P01 explicitně sjednotí se svým envelope. Tím vizuální a fyzikální konstrukce zůstávají totožné, sousední místnosti/terén nejsou vyplněny. Nový test kontroluje i případ, kdy původní envelope dno vůbec neobsahoval; následný test skutečné receptury musí pokrýt celou šachtu na její spodní výšce.

Samostatná reprodukce N03: aktuální autostep minWidth 0.20 s radius 0.42 kontroluje sestupný kontakt na hraně druhého stupně (normála asi 51°, limit 45°). MinWidth 0.10 nebo 0.15 na jednoduchém schodišti projde. Varianta radius 0.28 / halfHeight 0.52 a minWidth 0.10 je kandidát pro pozdější společnou klient/server integraci a skutečné CAD dveře, nikoli aktuálně změněná hra. Změna geometrie CAD nebo globálního maxSlope na 60° byla zamítnuta: první deformuje podklady, druhá mění všechny svahy. Samostatný modelový probe s menší kapslí zatím 18/44; tímto se nepotvrzuje celá průchodnost ani výkon.

## Review Triage Log

### Nezávislé review R10, 24. 10. 08:55 UTC

Všechny tři vrstvy skončily před triáží. Blind hunter vrátil `[]`; dvě ostatní vrstvy níže. Geometrie R10 není těmito nálezy zpochybněna.

| Nález | Verdikt | Důkaz a rozhodnutí |
| --- | --- | --- |
| Edge: `verify_routes.mjs`, načtení `--access-overrides` mimo `finally` | low, patch | Neplatný/chybějící soubor skutečně vyhodí výjimku po `openModel` a před chráněným blokem. Přesun načtení vstupu před alokaci je přímá oprava bez další větve či veřejného API; alternativní rozšíření try/finally by také fungovalo, ale alokovalo by svět zbytečně. |
| Edge: specifikace připisuje `audit_model.py` kontrolu všech průchozích otvorů | low, rejected claim-only | Audit provádí schodišťovou světlost, nikoli dveřní přejímku. Dveře skutečně samostatně ověřuje `verify_doors.mjs`; R10 má její report 552 průchodů a 15 chráněných výplní. Jde o nepřesné přiřazení nástroje ve specifikaci, ne o chybějící kontrolu modelu; nepřidává se duplicitní dveřní fyzika do Blender auditu. Přejímka nadále vyžaduje oba nástroje. |
| Verification: negativní prosklení neprochází `verifyDoors` | medium, patch | Dosavadní fixture ověřuje jen helpery; vypuštění `coverage.passed` v reportu by nezachytila. Doplnit malé skutečné modely přes veřejný vstup funkce, ověřit obě směrové kategorie, boolean i celkový status. Opakování celého B1 pro tuto regresi je pomalejší a nenabízí negativní vstupy. |
| Verification: lokální testy mohou přijmout starou recepturu | medium, patch | Současný loader kontroluje jen heightModel, proto správná stará cache zakryje regresi napojení nových solids. Svázat recepturu s SHA generátoru a zavést přísný přejímací běh: chybějící, stará nebo nesouhlasná receptura musí selhat; syntetické testy bez soukromých CAD zůstávají přenositelné. Nový úplný převod se porovná s R10 geometrií. |

Žádný nález není odložen. Opravy nemění budovu, herní controller, terén ani převzaté zdrojové plány. Modelovou přejímku nelze zaměnit za ověření ve hře.

09:00 UTC: původní edge reviewer potvrdil čtením uzavření lifecycle chyby (RED → GREEN doloženo). Původní verification reviewer potvrdil uzavření obou konkrétních testovacích mezer. 13/13 Rapier fixture a 15/15 malých přípravných fixture PASS. Nález o neaktuální cache je implementačně uzavřený, ale čerstvá úplná příprava a strict přejímka ještě čekají na skutečné vrácení výpočtové rezervace. Původní R10 cache není dodatečně opatřena aktuálním hashem.

Read-only review nového ořezu podhledem odhalilo degeneraci až po float32: vrcholy s výškou 1 a 1,0000000000000568 splynuly do opakovaného indexu. Oprava přesunula normalizaci a kontrolu plochy za konečné float32 zaokrouhlení (`quantized_face`), před vytvoření indexů. Reprodukce je CPU regresí a připravenou nativní Blender fixture. CPU PASS; nový nativní běh čeká na výpočtové okno.

## Design Notes

Navazující rozhodnutí R6 (zatím bez přepočtu uloženého R5): plné schodišťové rameno s N předními hranami obsahuje N stoupání a N−1 vodorovných intervalů. Poslední hrana ústí přímo do horní podesty. Tuto konvenci potvrzuje [výuka VUT](https://www.fce.vutbr.cz/PST/kacalek.p/BH03/prednaska/01%20uvod_schodiste_rozdeleni.pdf); nedokazuje ovšem Z rozměry této budovy. Builder přijme skutečné `riserPositions` a samostatné horní podesty. Krátký střed podle plného vyššího půdorysu se neprotahuje k fasádě; nižší přerušený a vyšší plný obraz jsou jedna fyzická trasa.

Zvažovány byly: zachovat offset −1,6 m a přidat jiné stupně (porušilo by zakreslené intervaly), ponechat počet hran s příliš vysokými stupni (1,6/7 = 0,229 m), měnit všechny hlavní úrovně nebo nastavit různá křídla po patrech (větší, hůře podložený zásah). Zvolena jednotná interpretace křídel −1,8 m při zachování hlavní rozteče 3,2 m. Krátký střed překoná 1,4 m sedmi stoupáními; dlouhá boční ramena a L trasy překonají 1,8 m. Rozdílné modelové výšky stupňů zůstávají přiznanou hypotézou. N03 úzké U používá 10 a 9 naměřených hran, prostřední výška odpovídá křídlu. R5 uložené bajty jsou stále starší kandidát; tato změna není zatím native/physics PASS.

Jediným půdorysným vstupem builderu jsou nové unikátní `interiorStairPlans` s úseky, skutečnými hranami, podestami a explicitními klíči výšek. Mezilehlá L podesta se rozdělí podle počtu stoupání obou ramen (např. 5:7), nikoli automaticky na poloviny. Sousední source projekce a jejich odchylky zůstanou v přípravné provenienci. Žádná změna herní cache/lifecycle v tomto modelovém kroku; export stále publikuje ověřenou sadu a runtime je zatím neaktivní.

Volba: lokální sémantická rekonstrukce do Blenderu, pozdější hra čte odvozený GLB a stejné konstrukční kolize. Globální polygonize již selhala na skutečných příčkách. Párování hran 0,06–0,65m, překrytí>0,08m a kontrola room polygonů omezí falešné stěny; odlehlé a osamocené hrany vyžadují audit. Výškový prototyp: 1PP−3,2; hala91c/místnost14−1,6; hlavní1NP0; 2NP3,2; 3NP6,4; střecha9,6m. Schodišťové polohy vycházejí z DXF, výšky jsou odhad. Zachovat vrstvy pro pozdější úpravy modeláře; nepřidávat světla do každé místnosti.

## Verification

`uv run --no-project --with ezdxf==1.4.5 --with shapely python -m unittest discover -s scripts/cad-buildings -p test_*.py`; lokální příprava jen B1; Blender CPU build/reopen v rezervaci heavy-validation. Vizuální kontrola renderu/řezů s rezervací GPU podle použitého backendu. Herní testy, celý build, integrace a produkční GPU profil až po zapojení hotových modelů, nesmějí být vydávány za provedené v této etapě.
