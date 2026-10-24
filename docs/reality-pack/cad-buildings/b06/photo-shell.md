# B6: příprava opravy podle fotografií

24. 10. 2026, baseline `ed52896a`, větev `codex/b6-photo-refinement-20261024`. Zdrojová metadata a kódový checkpoint; nový model zatím nebyl v tomto tasku přepočítán. Původní DXF ani fotografie se nekopírují do Gitu.

## Okna a rytmus konstrukce

Na N02 je `F5A/F5B` jediná dvojice okenních čar dlouhá 4,400 m přes pokoje 104/105. Jejich příčka má skutečné hrany `5EC/5ED` na X 30,028803 / 29,928803 a čelo `94C` na Y 0,189403. Původní plošný výřez odstranil její konec v pásu okna: aktuální přijatá recipe `f3cd31d0…` nemá zeď v bodě CAD (29,978803; 0,214403), Z 4,5. Vystouplý širší pilastr je až u dalšího modulu X 32,151–32,751, source `5D5–5DA`; nepřidává se k jednotlivým pokojům.

Zvolená oprava zachovává měřený profil příčky v původním otvoru a dělí pouze okenní descriptor na dvě části. Každá dostává dvě svislé tabule podle fotografie pokoje. Čtecí kontrola všech N01–N06 našla **18 takových dvojpokojových polí na patro**, výsledkem je **38 pokojových oken na patro**. N02 `E27/E28` má vynechanou krátkou čelní čáru; oba skutečné líce `448/449` však končí přesně na frame `E28`. Je zachována pouze existující dvojice těchto líců, bez prodloužení či nové odhadnuté šířky.

Druhá zvažovaná možnost, posunout celé okno o `normalOffset`, byla odmítnuta: tento údaj je střed okolního wall/reveal pásu. Source `F5A/F5B` jsou na Y 0,239404 / 0,189403 a jejich skutečný střed je již v `a/b` na 0,214403. Nové `windowPlaneNormalOffset=0` a `sourcePlaneBasis` význam výslovně rozlišují. Posuny do středu zdi by původní příčku neopravily. Silnější source pilastry, půdorysy pokojů i výšky se nemění.

Použité fotografie dodal uživatel 24. 10.; datum pořízení není známo. B6 front SHA `748bacdcf689e1ab8706ef9048505e85ef9acd71628c1e340e5a27cd0134366c`, rear `0a4837870bf3cce7e21ead36ce6ce4f4780562de150d39226a602f4df00e3841`, room `a689950942d17ec2ebff17d77cbf45abe2df850aa73381d83ed0fb1963ca90e9`. Fotografie se znakem 2 nebyla použita jako důkaz B6.

## Pokojové dveře a místnosti

Uživatel potvrdil jediné otevíravé křídlo **pouze u pokojů do chodby**. Source dvojice mají šířky přibližně 0,625 + 0,625 m, společný zavřený konec a odlišný nakreslený úhel 26,565° / 90°. Např. N02 pokoj 104: `46FE/4707` malé otevření, `4708/471D` plné. Příprava označuje malé křídlo `fixed-paired-door-leaf`, obě ponechá jako source annotations a propojí přes `pairedDoorId`; 90° křídlo zůstává aktivní. Výběr vyžaduje skutečnou vazbu bedroom–corridor, shodný společný konec a oba měřené úhly. Vstupní, hygienické ani schodišťové dvojice se tím nemění. Ověřeno 38 dvojic na každém N01–N06, celkem 228.

`room.usage` je `bedroom`, `corridor`, `bathroom`, `wc` nebo `other`, s `sourceBasis`/`usageBasis` a `usageSourceEntities`. Bedrooms jsou konkrétní číslované řady s ověřenými pokojovými rozměry, chodbovým portálem a oknem: N01 11–29 a 34–52, vyšší patra xx01–19 a xx24–42. Jejich využití je interpretace dispozice a uživatelových fotografií, nikoli aktuální inventura ubytovaných. Nejsou převzaty schematické runtime počty 35. Samotné umyvadlo, číslo místnosti nebo poloha v přístavbě neurčuje další bedroom/bathroom.

Hygiena vychází z přesných `2-ZARIZENI` symbolů. N02: bathroom 144b/A80 a 121b/C52; wc 144a/AC4, 144c/A6C, 121a/C7E, 121c/CDC. Obdobné konkrétní polygony se čtou na každém patře zvlášť. `sanitaryFixtures` uchovává skutečné `centerCad`, `boundsCad`, `size` (šířka, hloubka), `facingCad` směrem od zadní strany do místnosti, typ a source handles. N01 má 16 umyvadel a 5 pisoárů, N02–N06 po 20 a 10; počet 12 WC, 6 sprch a 2 výlevek je shodný. Ostatní patra se nevyplňují opakováním jednoho vzoru. N06 sprcha v 544b koliduje s konkrétním source rohem `7BB/7BC`; její vstupní bbox se nepřepisuje. Navazující helper omezí skutečnou geometrii podle místnosti a uvede tento konflikt.

`room.finishTriangles` používá stejnou constrained triangulaci a její kontroly jako solids, ale pouze pro průnik source místnosti se skutečnými vršky podlahových desek ve shodné výšce. Nepokrývá účetní schodišťové otvory, podesty, canopy ani jiné úrovně. Source `room.loops` a `levelKey` se zachovávají.

## Ověření

**41/41 lehkých testů PASS**, 0,146 s: zachování skutečné tenké příčky v pásu otvoru, dvě tabule a původní rovina okna, odmítnutí neprokázaných příček, omezení pokojových dveří, rozpoznání a orientace jednotlivých sanitárních symbolů, nevyplněný schodišťový otvor v finish mesh. Čtecí metadata sonda prošla osm DXF bez párování stěn či úplné přípravy. Source kontrakt pro navazující agenty je v `.cache/b6-photo-shell-20261024/source-contract.json`; jeho finish preview vychází z přijatých stávajících desek, nikoli z nového modelu.

**14 skutečných recipe testů čeká na fresh fullprep** s novými dependency SHA. Původní recipe/audit/model zůstaly beze změny. Nové zavřené vedlejší křídlo, okenní rámy a výsledné interiéry musí následně ověřit nativní builder, průchody a fotografické porovnání; tento task nespouštěl Blender, GPU ani fullsuite.

## Zadní přístup a výška sprchových příček

Navazující root převod před touto úpravou prošel 56 strict testy; jeho recipe `b6ca86bb…` zůstává zachována. Nový kód přidává samostatně označenou rekonstrukci zadního přístupu z IPR 2023. P01/N01 v CAD nemají v zadním výřezu jednotlivé venkovní nášlapy; `D85/D90` s `D84/D8C/D8D` tvoří přerušenou kresbu a nejsou úplným změřeným čelem terasy. B6 zadní schodiště je potvrzeno také uživatelskou fotografií a popisem „U kolejí 2“ na [Filmových místech](https://filmovamista.cz/4957-Bylo-nas-sest-2-Vysokoskolaci); pixely tamních nových snímků nebyly pro tuto úpravu dostupné.

Souvislá IPR stopa prokazuje dvě klesající plochy a mezilehlou podestu: CAD (57,19903; 18,51939), world Y přibližně 1,709 → (59,27177; 19,81181), 0,323; podesta končí u (59,82771; 20,15845), 0,333; druhé rameno pokračuje až k (62,29399; 21,69625), −1,066. Původně posuzovaný bod kolem +0,33 tedy nebyl patou. Source triangles jsou uvedené přímo v segmentech a manifest SHA je `d556d38d…`. Zvolená plochá úroveň podesty +0,320, horní +1,715 a dolní −1,0655 jsou přiznané interpretace těchto ploch. Odečítá se pouze doložený B6 pose origin +0,6962777093.

Počet **8 + 8 stoupání a šířka 1,50 m jsou konstrukční odhady**, nikoli změřené CAD čáry nebo spočítané fotografické stupně. Metadata mají `sourceFrontsMeasured=false` a podrobný basis. DMR u paty dává přibližně −0,912, o 0,154 m výše než IPR; lokální terénní přejímka zůstává povinná. Výřez se omezuje na úzký půdorys fyzických ramen/podest, nemaže celý stín terasy ani okolní trávu.

Terasa se mění na explicitní IPR obálku dopojenou na CAD zadní linii: 19,769421 m², bounds [49,925; 16,284; 57,731; 20,303]. Je stále jediným `canopy`, nyní s odhadnutou tloušťkou 0,20 m, aby uzavřela terminální stoupání. Zadní route ji odkazuje přes `upperSupportSolidId`, nestaví druhou koplanární podestu. P01 dveřní head má nadále rezervu přibližně 0,219 m pod krytem. Rozdíl 0,481 m proti modelové horní dveřní úrovni zůstává neověřený; nebyly vloženy tři vymyšlené stupně ani změněna interiérová patra. Sign config na rekonstruovaném čele nese pouze dva doložené texty, výšku panelu 0,70 m a výslovně odhadnuté umístění nad terasou.

Sprchové příčky mají nově cap 2,05 m nad příslušnou podlahou podle uživatelovy fotografie (nikoli CAD Z). Masky vyžadují skutečnou T příčnou hranu, obě její koncovky a dva vnitřní podélné líce mezi třemi source vaničkami. Čtecí kontrola všech šesti podlaží našla čtyři masky po 0,1485 m² na patro. N02 west první: `650/652/653/7AD/7AE`, druhá `64E/64B/64A/7AC/7AF`; východ má vlastní source handles. Obvodové `7A9/7A6`, zadní zeď, room.loops i skutečné 0,50m mezery se nemění. Vnitřní sprchové cíle proto nejsou pro efektivní 0,54m kapsli průchozí; koupelnový vstup a apron se posuzují samostatně.

Poslední lehká přejímka: **46/46 PASS, 0,165 s**. Obsahuje terminální oporu bez překrytí posledního nášlapu, source/estimated označení ramen, omezený terénní výřez a snížené příčky se zachovaným obvodem i půdorysem. Nový fullprep a nativní přejímka patří rootovi.
