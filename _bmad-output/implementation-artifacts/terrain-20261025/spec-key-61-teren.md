---
title: 'KEY-61: povrchy, tráva a řídké květiny Strahova'
type: 'feature'
created: '2026-10-25'
status: 'done'
route: 'dispatch'
baseline_commit: 'ff13fa2b3b47363378ce55d34ed12eb5beec1ede'
review_loop_iteration: 0
context:
  - '{project-root}/docs/terrain/20261025/research.md'
  - '{project-root}/docs/agents/bmad-policy.md'
---

<frozen-after-approval reason="Přímo autorizovaný záměr TERÉN-20261025; měnit jen po novém pokynu uživatele">

## Záměr

Svět působí příliš plochým a ořezaným dojmem. Zlepšit trávu, květiny, půdu, přirozenou rozmanitost a přechody povrchů podle skutečných podkladů Strahova. Výsledkem je integrovaná hra se srovnáním před/po a skutečnými výsledky pro všechny grafické kvality.

## Hranice

Vždy: výzkum a volba před změnou, doložený původ a datum zdrojů, odlišení měření od interpretace a uměleckého odhadu, respekt komunikací a kolizí, cílený refaktoring, živé rezervace, průběžný Linear. Hraná neměnná verze 2592 se nemění. Vizuální QA pouze pevnými statickými pohledy, bez chůze, jízdy nebo WASD. Výkon měřit v produkční hře, nikoli odvozovat z obrázku či NullEngine.

Mimo rozsah: další etapa stromů, změny budov, neprokázané terénní převýšení, vymyšlené druhové inventáře. Nezahrnovat původní CAD ani uživatelské fotografie do Gitu. Koncept imagegen není zdroj reality.

</frozen-after-approval>

## Mapa kódu

- `shared/vegetation.ts`, `shared/data/landcover.json`: OSM plochy a společné výluky; kolem B6 chybí přirozený trávník.
- `shared/terrain.ts`, `shared/streets.ts`: měřený podklad, grading, CAD výřezy a existující pěšiny; geometrie/kolize musí zůstat v souladu.
- `client/terrain-renderer.ts`, `client/vegetation.ts`, `client/streets-renderer.ts`: zemní vrstvy a render cest.
- `client/surface-pack.ts`, `client/cinematic-art.ts`: PBR assety, světová makrovariace, cache a mokré materiály.
- `client/photo-grass-*.ts`, `client/photographic-grass.ts`: tři LOD, rozpočty 60/140/280 tisíc trojúhelníků, dosah6/9/12m, alpha-test, sdílené mapy a omezená cache.
- `client/game.ts`: skutečný Actor, startup kamery, focus trávy a produkční benchmark.

## Úkoly a přejímka

- [x] Zdokumentovat referenční plochy a doplnit pouze doložené chybějící pokrytí; společné čisté pole pro variaci a okraj opotřebení. Zachovat tvrdé výluky budov, cest a umělých hřišť.
- [x] Zlepšit trávník a fotografický půdní materiál včetně přechodu pěšiny; sladit světový detail a blízké trsy, zachovat skutečný rozměr textur a podporu GLSL/WGSL.
- [x] Přidat řídké drobné květiny s doloženým generickým assetem, omezeným společným rozpočtem vegetace, vlastními rozměry a LOD. Nízká kvalita zachová stejné rozmístění ploch, vyšší přidají detail.
- [x] Přidat whitelist lokálních pevných QA počátků bez následné teleportace, jen pro hosta. Běžný startup a multiplayerové pozice zůstanou beze změny.
- [x] Ověřit výluky, determinismus, mezní stavy, kvalitativní přechody, disposal a chyby načítání cílenými testy; poté celý stabilní checkpoint test/build/integrace. Skutečný lokální full-suite timing failure a úspěšný cílený retry jsou přiznané v reportu; přesný PR head ještě podléhá CI.
- [x] Provést nezávislé review a statickou přejímku vzhledu/výkonu se zdrojovým hashem, GPU, HUD, CSS/interním rozlišením, FPS a p95/p99. Integrovat jednotlivé ucelené změny a zapsat skutečné limity. Implementace je společně ve v7 a samostatných commitech; povinné externí přijetí do main zůstává řízené PR checks/KEY-61.

Výsledky a odkazy: `docs/verification-evidence/terrain-20261025/README.md`. BMAD implementační/review postup uzavřen; tento status nenahrazuje čekající project-acceptance ani není tvrzením, že už proběhl merge do main.

Přejímací kritéria:

- Když je pozice v doloženém trávníku u B6, vzniká souvislý podklad a přiměřený blízký detail; stejné pole nevytváří trávu v budově, na chodníku ani na umělém hřišti.
- Když je kamera u existující nezpevněné pěšiny, zůstává její trasa průchodná a rozhraní má přirozený půdní okraj bez plovoucích či problikávajících vrstev.
- Když se změní kvalita, nemění se geografie, kolize ani kořeny deterministického rozmístění; mění se pouze doložené rozpočty/detail. Cache a připravené materiály neunikají.
- Když se načte pevný QA pohled, Actor i kamera začnou na stejném platném místě, focus trávy zůstane u Actoru a parametry jsou odmítnuté mimo loopback/hosta.
- Když je kandidát předán, obsahuje skutečné reference a srovnatelné statické důkazy. Žádná hypotéza o optimalizaci není prezentována jako naměřený zisk.

## Rozhodnutí

Volíme rozšíření existujícího rendereru: společné pokrytí/variace, fotografická půda a několik omezených květinových dávek. Samotná změna barvy neopraví chybějící pokrytí; celoplošný fotoatlas by přidal velká data a zapečené stíny. Nové trsy nebudou vrhat další stínový pass bez měřeného důvodu. Výška a počet květin jsou umělecká interpretace fotografie, ne botanické měření. Podrobné varianty a zdroje jsou v [průzkumu](../../../docs/terrain/20261025/research.md).

## Poznámky implementace

- 25.10: D pracovní kopie sdílí původní Git/registr; závislosti jsou čtecí junction. Velké výstupy a cache patří na D;12 výchozích LFS souborů ověřeno vůči pinned OID. C má nedostatek místa.
- Autonomní implementace i paralelní agenti jsou přímo autorizováni; další schvalovací checkpoint se nepřidává.
- Předány ground39/39, flowers44/44, QA84/84 + collector7/7; společně QA/collectorHTTP37/37. Všechna4 stanoviště mají fyzikální podporu v celé baseline Simulation po120 idle ticích bez přesunu. Nejde o GPU přejímku.
- Baseline ff13fa2b + shodný7souborový QA overlay má snapshot4d793275df7a7b1018071515723be3f8486945f0b2b9dff91541aae0f0fdeda1 a produkční build PASS. Celý kandidát a nezávislé review probíhají; na otázku, zda uživatel uvolnil hranou GPU scénu2592, dosud není odpověď.

## Změny specifikace

## Review

- Předběžná čtecí kontrola: low/patch — cache bez názvů kanálů mohla sdílet záměnu albedo/alpha; autor doplnil kanonické pořadí, názvy, rozměry a dvě cílené regrese před vytvořením review-v1. Aktuální assety nebyly zaměněné.
- Review-v1 blind-hunter: []; edge-case-hunter: []. Obě nezávislé čtecí kontroly hotové.
- Verification-gap1: medium/patch — test injektoval hotové květiny a neověřoval úspěšné produkční PhotographicGrass.load. Doložená mutace odstranění připojení by prošla; doplnit reálný loader s náhradou pouze IO, update, nenulové instance a společný cap.
- Verification-gap2: medium/patch — wetness druhé vrstvy nebyla čtena ze skutečného UBO po SurfacePack.update. Doložená mutace vypuštění setWetness by prošla; doplnit sucho/dešť/sucho pro obě základní vrstvy.
- Ostatní nález: medium/patch — přesné staré mesh/source seznamy streets a static-submesh-chunks postrádají nový soil batch. Aktualizovat po ověření identity rozdělených polygonů, nikoli oslabit porovnání. Celá sada nad candidate-v1 ještě dobíhá.
- Praktická GPU přejímka: neprovedená měření, nikoli prokázaná chyba kódu. Uživatel25.10 výslovně potvrdil konec hraní a možnost ověřovat. Původní IAB scéna byla přes UI navigována na about:blank; server/soubory2592 zůstaly beze změny. GPU claim bude převeden samostatně.

## Ověření

Cílené testy přidělených modulů, následně `pnpm test`, `pnpm build`, izolovaný `pnpm test:integration` s rezervací zdrojů. Čtyři neměnné guest pohledy: zadní pěšina B6, přední trávník B6, existující OSM trávník a vzdálenější B6. A/B se stejným světlem, počasím, rozlišením a dokončenou přípravou; serializované GPU. Statický multiplayerový běh s reálnými SDK relacemi je oddělený důkaz režie, pokud B6 detail není v záběru.
