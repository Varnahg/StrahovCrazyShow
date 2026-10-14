# Výzkum a rozhodování před opravami — 14. 10. 2026

Koordinátor `repairs-01a13624-research-root`. Tento záznam spojuje tři výzkumné oblasti a pravidla integrace. Výslovné zadání uživatele: před opravou důkladně prozkoumat vzájemné dopady a rozumné varianty, teprve poté zvolit postup, implementovat, ověřit a jednotlivě commitovat/integrace do main. Linear aktualizovat v každém milníku.

## Základ důkazů a oddělení verzí

Referenční uživatelský log07c227f8… je jediná produkční relace wave3/0f20b5a7… s1799 souvislými událostmi a ukončením. První dev relace919ec969… má potvrzené HMR rekonstrukce a není čistá výkonová přejímka. Lokální kopie obou se zachovává. Aktuální uživatelské vizuální pozorování platí i bez pixelů v JSONL; příčina gamma/červeného flash se nesmí vymyslet.

Dne14.10 byly ověřeny původní PID i porty: žádné z evidovaných API/dev/preview na5173/2567/4176/2571 již neběželo. Cizí stale rezervace se neodstraňovaly. Vytvořena managed worktree `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`, branch `codex/playtest-repairs-wave4`, Git základ91ee88f. Bootstrap po rezervaci převedl přesně509source/config/test vstupů se SHA shodou proti wave3,12existujících LFS objektů materializoval a nevytvořil žádnou novou runtime opravu. Ověření `.cache/wave4-bootstrap/parity.json` a handoff v této worktree. Novější glTF fastpath je pouze oddělený cache kandidát.

Main zůstává s původním necommitnutým WIP, jehož původ je uveden v předáních. To není povolení stageovat celý strom. Cizí vegetační audit ani jiné worktrees se nemění.

## Rozdělení výzkumu

| Oblast | Dokument a rozsah | Rozhraní k ostatním |
| --- | --- | --- |
| B6 a render | [b6-render.md](b6-render.md), KEY-16/5 | Patra/visibility, root transform, svítilna/shadow kandidáti, aktivní meshe a lifecycle profileru. Odlišit změny fyzikální výšky/predikce od rendererového floor. |
| Síť a kamera | [netcode-camera.md](netcode-camera.md), KEY-7/12/6 | Authority/tick/RTT, predikce a její renderovaná interpolace; camera collision, obnovy po rendererovém stall. Nezakrývat chyby vyšší smoothing tolerancí. |
| Materiály, barvy a světlo | [visual-lighting.md](visual-lighting.md), KEY-3/4/13/14/15 | Material readiness/varianty, shadow/light sloty, PBR a custom shader output, image processing, výběr vzdálených lamp a souběh se startupem/LOD. |

Každá oblast musí pokrýt skutečné vlastnictví a pořadí volání, primární instalovaný Babylon9.30/Colyseus/Rapier kód, logy, reprodukce, alternativy, regresní rizika a způsob rozhodnutí. Strukturální NullEngine či matematická reprodukce dokazuje mechanismus; není GPU měření ani důkaz celého uživatelského obrazu.

## Společné rozhodovací podmínky

1. Problém má konkrétní pozorovatelný projev a definovanou reprezentativní trasu/scénu. Výsledek rozlišuje jeho samostatné složky (B6 vstup, chodba a schody nejsou jeden incident).
2. Varianta opravuje doložený mechanismus, případně má předem navržené rozhodující měření pro hypotézu. Nízká cena implementace ani snadnější test nesmí převážit zachování požadovaného chování.
3. Porovná se úzká oprava, širší strukturální oprava, změna cache/časování, práce s existujícím veřejným API a dopad případného snížení kvality. Varianty porušující kolize/provenienci/hosta či pouze skrývající chybu se explicitně odmítnou.
4. Ověří se scénář skutečné změny (pohyb/reparent/LOD/epoch/quality), nejen statická příznivá fixture. Stejné render ID, asynchronní callbacks a disposal jsou součást lifecycle rizik.
5. Implementační scope musí být úzký a rezervovaný v izolované worktree. Nové API/společný entrypoint předem koordinovat. Každý fix zahrnuje cílený refaktoring a testy.
6. Výsledek změří stejné podmínky produkční hry, celýHUD/skutečnou relaci, GPU/CSS/internal rozlišení a zdrojový hash. U vizuálu navíc obraz; u řízení skutečnou projekci a jízdu. Výsledky z různých změn/tras se nesčítají do jednoho vymyšleného přínosu.

## Zatím doložené mechanismy; volba opravy stále podléhá dokončení výzkumu

- B6: skutečný controller vynucuje root matrix při pohybu hráče; následný torch scan vynucuje rodiče znovu pro jednotlivé nesynchronizované potomky. Experiment ukázal amplifikaci i bez změny floor/scene membership. B6-only guard řeší statický spouštěč, ne všechnu dynamickou ancestor invalidaci. Širší helper potřebuje odlišné testy. Nelze tvrdit, že jeden tento mechanismus vysvětluje celých6–8FPS.
- Barvy: veřejný `DefaultRenderingPipeline.imageProcessingEnabled=false` v nainstalované verzi vypíná také scene image-processing configuration a actual material defines. Uložené exposure/toneMapping hodnoty pak nejsou důkazem aktivní korekce. Experiment bez renderu tento kontrakt ověřil. Material-side a fullscreen cesta se musejí porovnat i s custom sky shaderem, bloomem, kvalitami a skutečným obrazem.
- Prezentace pohybu: oddělené fáze plánovače síťových ticků a lokálního accumulator/interpolation mohou v matematické reprodukci vytvářet nerovnoměrný vizuální krok i bez chyby autority. Změna leadu může posunout presentation target. Samostatně zůstává nejistota vysokého RTT bez LongTask a skutečné velké resyncy; není správné vše označit za kameru nebo vše za síť.

## Integrace a commity

### Rozhodnutí IMAGE-01 po dokončeném výzkumu

Výzkum `visual-lighting.md` SHAefb8b5ead5a8dc8ac93de108ef407249818ae00a6c9c6d42f20463642c45aaa3 prokázal veřejný setter kontrakt a porovnal material-side non-HDR, plný HDR fullscreen s úpravou custom shaderů, vlastní Bloom/FXAA řetězec i oddělené material configurations. Pro první úzký kandidát je zvolen **veřejný non-HDR DefaultRenderingPipeline se zapnutou scene material image-processing konfigurací, bez volání imageProcessingEnabled=false**. Důvod: napravuje konkrétní vypnutí zamýšleného material ACES/grade, ponechává současný display-space výstup vlastní oblohy a nevkládá fullscreen barevný průchod. Nemění palety ani expozice odhadem.

Pouhé upravování čísel neřeší vypnuté actual defines. Samotné scene.isEnabled=true reaktivuje přes observer HDR postprocess a může nesprávně zpracovat vlastní shadery. Plná HDR cesta je rozumná širší architektura, ale vyžaduje úpravu custom výstupů, bloom kalibraci a GPU porovnání; vlastní efektový řetězec přidává lifecycle, který pro tento ověřitelný kontrakt není nutný. Non-HDR LDR/display bloom a existující neaktivní IP objekt mají výslovné obrazové/resource limity pro přejímku.

První regrese musí volat skutečný CinematicAtmosphere, kontrolovat isEnabled, applyByPostProcess, skutečné Standard/PBR defines a připojené passy přes všechny quality starty/přechody; také expozici během low, návrat a disposal. Zachovat starší cache/reuse opravu jako oddělený WIP. Nový fix/test musí být samostatně přenositelný vůči Git základu a neobsahovat unrelated reuse změny. Pokud tato veřejná cesta nesplní kontrakt či lifecycle, implementaci nepřijmout a vrátit se k porovnání alternativ. **Konečný obraz/FPS a integrace do main zůstávají odložené**, protože uživatel nyní nemůže zpřístupnit prohlížeč; nulový vizuální důkaz nesmí být nahrazen tvrzením o opravené noční paletě.

### Výsledek IMAGE-01 a navazující vlastnictví prostředků — 14. 10. 2026

Kandidát IMAGE-01 **není přijatý**. Nová regrese skutečného CinematicAtmosphere měla před opravou 1/7 PASS a po úzkém non-HDR delta 5/7 PASS. Dva disposal testy prokázaly zbývající živý callback ThinImageProcessingPostProcess; původní testy 8/8 a úzký TypeScript PASS tento problém nevyvracejí. Kód není v main, v B6 frozen candidate ani v přijatém commitu. Agent předal přesný diff a uvolnil rezervaci; původní reuse WIP zůstal zachovaný.

Instalovaný Babylon 9.30.0: `imageProcessingPostProcess.js:342` vytváří vlastní Thin wrapper a předává jej jako effectWrapper do base PostProcess. `postProcess.pure.js:388` ho vyhodnotí jako existující/půjčený, jeho dispose na787–790 pak wrapper neuvolní. Chybí volání Thin dispose, který odpojuje observer. Callback zůstává i po deferred ticku a scene.dispose; nejde pouze o odložené odstranění observeru. Veřejné constructor option effectWrapper není veřejný getter hotového objektu (`postProcess.pure.d.ts:326` má pouze protected readonly `_effectWrapper`).

Znovu porovnané varianty: veřejný klientský cleanup přes onBuild/onDispose bez getteru nelze dokončit; cast/prototype hack je odmítnut. Vlastní Bloom/FXAA řetězec vyžaduje širší správu wrapperů, resize, sdílení textur, MSAA a barevného kontraktu. Oddělené konfigurace všech materiálů vyžadují zachytit i glTF importy/replacements a zachovat explicitní konfigurace. Preferovaný další krok je **samostatný pinovaný package patch uvnitř vlastnící třídy**, s uloženou referencí pouze na skutečně interně vytvořený wrapper a idempotentním uvolněním; ne změna soukromého base flagu. Přesný patch a pnpm workflow ještě vyžadují výzkum před zápisem. Není to tvrzení o oficiální upstream opravě.

Samostatný task `fix-babylon-image-processing-ownership-20261014` / KEY-17 musí prokázat owned/borrowed/shared, number/object/explicit-undefined options, výměnu konfigurace, double/multi-camera dispose a reprodukovatelnou instalaci. WT node_modules je read-only junction do main a závisí na něm také staré B6 snapshoty. Kontrola koordinačního CLI ukázala, že checkScopeFilesystem záměrně odmítá rezervaci existujícího junctionu; původní návrh přesměrování odkazů se proto nepoužije. Koordinátor připraví novou managed worktree z přesného commitu f63039b s vlastní instalací až po rezervaci. Dosavadní WT, main dependencies a všechny staré B6 linky zůstanou nedotčené. Patch bude vlastní commit před navazujícím IMAGE fixem.

Úplné předání ve worktree `playtest-repairs-wave4`: `docs/agents/handoffs/fix-material-image-processing-20261014.md`, výzkum `visual-lighting.md` sekce7 SHA256 `de50a113ef5103c4eaf935d778467141d739172fd97ef58fb027aa50575b2c82`. Kandidát cinematic SHA256 `64f4c6f942b8c51e9d612934859deac1d8dfc06140e4298cf0ae5c14c4679ca3`; nový test `ba5493d42ab4f3102e2743a501983c621803c24becce4224ef5abb08bce93637`. Uživatelova GUI přejímka je odložená, žádný nový obrazový důkaz nevznikl.

### Rozhodnutí B6-01 po dokončeném výzkumu

Přijatý výzkumný podklad `b6-render.md` SHA927956382935e1ef0cdc84194a94de547370f2b68ac916db9c33b445f61bbf8f porovnává13 variant a dva reprodukční experimenty. Koordinátor po kontrole zvolil **A: podmíněná synchronizace B6 pivotu při převodu fill světla + vlastní scratch Matrix/Vector3 bez dlouhodobé inverse cache**. Je to nejlepší první samostatný fix pro přesně doloženou zbytečnou invalidaci statické budovy: izolovaný skutečný callsite experiment snižuje135root/134child přepočtů na0/0 při stejné geometrii i členství scény.

Samotné always-false čtení bylo odmítnuté, protože vrací starou matici při skutečné změně ve stejném render ID. Širší ancestor helper řeší navíc dynamickou lavinu, ale vyžaduje vlastní testy animovaných/instancovaných/billboard objektů a není nutný k odstranění statického spouštěče. Inverse cache nepřidává prokázaný časový benefit a přidává invalidovaný stav; scratch-toRef zachová chování bez zbytečných alokací. Visibility/portal/mesh merge/shadow index změny by zároveň měnily další proměnné a nejsou vybrané pro tento fix.

Očekávaný invariant: statický pivot se čtením fill pozice nezmění; skutečně posunutý/rotovaný/škálovaný/reparentovaný pivot stále vrátí aktuální světovou transformaci. Žádná změna API, světelných slotů, geometrie/fyziky ani render floor politiky. Dynamická lavina po skutečném přesunu rootu zůstává známým samostatným případem. KEY-16 zůstane otevřený do praktického důkazu celé cesty včetně vstupu a pater; tento fix neslibuje sám odstranit všech6–8FPS.

Implementační task `fix-b6-transform-read-20261014` je povolen pouze v izolované worktree: B6 modul, nový lifecycle test, výzkumný podklad a vlastní handoff. Cílené regrese skutečných B6/VehicleLighting modulů + srovnatelný produkční průchod před commitem/integrací. Novější glTF fastpath zůstane mimo tento A/B.

Izolovaná worktree byla zvolena oproti dalším editacím main za běhu dev serveru (opakování HMR rizika) a oproti dalším volným cache kopiím (nepřehledný Git původ). Sdílené závislosti jsou pouze pro čtení, GPU/porty zůstávají globálně rezervované. Nový fix nikdy nepřepisuje dříve vydaný immutable snapshot.

Před každým commitem: zkontrolovat konkrétní diff a staged obsah, vyloučit převzatý nesouvisející WIP i ignorované snapshoty/modely/cache. Historické dosud necommitnuté funkce musí mít vlastní logicky soudržné commity; nelze je nepozorovaně zahrnout do nového malého fixu. Samostatný fix lze integrovat, pokud jsou jeho závislosti zmapované a předaná/verifikovaná verze přesně určená. Pokud oprava zasahuje do již rozpracovaného integračního souboru, nejprve vyřešit oddělení jeho základu, nikoli hromadné git add.

Po implementaci cílené testy; po stabilizaci příslušného checkpointu plná sada/build/izolovaná integrace dle rozsahu a praktická přejímka. Pak samostatný commit fixu/feature, kontrola konkrétního commit/diff při integraci do main, ověření výsledného stavu a záznam hashe vLinearu. Žádný whole-checkout reset/restore/stash/clean ani přepis cizíhoWIP. Není to pokyn commitnout neověřenou hypotézu.

## Průběžný Linear

Projektové pravidlo a začátek výzkumu byly zveřejněné14.10; KEY-12–16 jsou In Progress výslovně ve fázi výzkumu. Další aktualizace vždy při dokončení podkladů, zvoleném řešení, implementaci, ověření a integraci s commitem. Plánované testy označit jako plán, nepřijatý FPS/vizuální výsledek nezměnit naDone.

Oficiální doplňkový podklad: [Babylon Image Processing](https://doc.babylonjs.com/features/featuresDeepDive/materials/shaders/image_processing/) (čteno14.10.2026) vysvětluje linear-input/gamma kontrakt fullscreen image processing a kompatibilitu custom shaderů. Pro konkrétní setter a výkonnostní chování je autoritou instalovaný9.30kód a reprodukční experiment, nikoli aktuální BabylonLite dokumentace.
