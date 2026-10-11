# Lokální svítilna — kontrola kontraktu 11. 10. 2026

`PlayerFlashlight` přidává jediný místní kužel s dosahem 24 m. Ve třetí osobě je původní procedurální herní rekvizita připojená k `rig.rightElbow`, úchop `(0, -0.275, 0.02)`, osa `-Y`; světlo vychází mírně před čočkou, ze socketu `(0, -0.39, 0.02)`. Není to zaměřený reálný předmět ani převzatý externí model. Ve skryté první osobě používá světlo inverzní skutečnou RH view matici stejné kamery. Animované držení pravé ruky vlastní `AvatarAnimator.flashlight`; model a světlo vlastní `PlayerFlashlight`.

Sdílený `VehicleLighting(kind="player")` zachovává původní výběr casterů a draw-time frustum kontrolu. Svítilna má stínovou mapu 128/256/512 pro low/medium/high. Světla auta mají nezměněné chování: low bez stínového průchodu, medium/high 256/512. Vypnutí svítilny vypne light i `shadowEnabled`; existující mapa může zůstat přidělená pro opětovné zapnutí, ale Babylon ji nezařadí do render-target průchodů. Toto chování je ověřené skutečným CPU dispatch průchodem scény, nikoli jen hodnotou příznaku.

## Cílený refaktoring a opravy

- Zaniklý rig už nemůže dostat nový osiřelý model svítilny. Disabled rig z první osoby nadále funguje pro kamerový paprsek; hidden a disposed jsou odlišné stavy.
- Čočka patří tělu jako potomek, není potřeba druhý řídicí stav. Při změně profilu se model buď přepojí na nový loket, nebo se po likvidaci původního rigu obnoví. Materiály vlastní controller a do jeho konečné likvidace se znovu používají.
- Pozice gripu se nezapisuje každý snímek. `setEnabled` těla i světla se volá pouze při změně stavu. Rozlišení stínů se určuje jedním společným helperem.
- Světový loket se počítá s vynucením pouze při `!isSynchronized()`. Úplné vynechání této kontroly reprodukovalo neaktuální pozici po změně rodiče ve stejném render ID; regrese používá nezávislé lokální TRS skládání bez čtení cache světa.

Průzkum vycházel z instalovaného Babylon 9.30.0: `Cameras/targetCamera.pure.js` (`setTarget` v přesně bočním směru nepatrně posune pozici o Epsilon), `Lights/Shadows/shadowGeneratorSceneComponent.pure.js` (scheduling jen enabled light + enabled shadows) a `Meshes/transformNode.pure.js` (rekurzivní dispose bez implicitní likvidace materiálů). Test směru proto porovnává skutečnou kameru po `setTarget`, včetně reálné RH projekce na dolní pravou stranu obrazu.

## Ověření

```text
node --import tsx --test tests/flashlight.test.ts tests/vehicle-lighting.test.ts
```

**12/12 PASS**, exit 0, 3,028 s: pět nových testů svítilny a všech sedm původních testů světel auta. Ověřeno 6 presetů × 6 směrů skutečného hand FK, 4 azimuty × 3 sklony kamery, přepnutí první/třetí osoby, opakované aktualizace bez dalších `setEnabled`, výměna/zánik avataru, chybějící rig, opětovné použití materiálů, idempotentní cleanup a odstranění starých shadow map při změně kvality. Skutečná NullEngine scéna musí nejprve provést stínový průchod a caster draw, po vypnutí nemá ani jeden a po zapnutí je znovu provádí. Tato testovací scéna má vypnuté vzorkování textur a není GPU/pixelovým důkazem.

Úzká sémantická TS kontrola pouze uvedených dvou modulů a dvou testových souborů: **0 diagnostik**, exit 0. [Testovací log](verification-evidence/flashlight-20261011/targeted-tests.log) a [SHA souborů a časová okna CPU](verification-evidence/flashlight-20261011/source-checks.json) jsou uložené. Závěrečné testy běžely 20:50:08.647–20:50:12.061 CEST; TS 20:49:42.879–20:49:55.348 CEST. Žádný GPU/Blender ani plná pipeline se v této větvi nespouštěly.

## Integrace a obrazová kontrola

Game nadále vlastní klávesu F, lokální stav, rezervaci slotu ve světelném rozpočtu, explicitní vypnutí po vstupu do auta a předání již aktualizované kamery/rigu. `PlayerFlashlight` nemá vlastní informaci o vozidle: Game při jízdě předává `enabled=false`. Rovněž nesmí vytvořit controller pro každého vzdáleného hráče.

Praktická GPU kontrola hlavním vláknem má ověřit skutečnou viditelnost rekvizity v dlani, směrování a velikost světelné skvrny na stěně/schodech, occlusion na všech kvalitách, první/třetí osobu, změnu profilu, zapnutí/vypnutí a přechod do auta. Zejména malá 128px mapa nezaručuje perfektní hrany stínů. **GPU a vizuální kontrola zatím není potvrzená; vyšší FPS ani 60 FPS tímto testem nejsou doložené.**

### Následná produkční kontrola P2/P3

Skutečná noční hra s HUD a jedním multiplayerovým hráčem na medium/Intel UHD 630, CSS/render 1280×720, prošla F a první/třetí osobou. P2 pixelová kontrola ukázala ostrou hranici kuželu. Instalovaný Babylon Standard shader používá `pow(cosAngle, exponent)`; P3 nastavuje exponent hráčova světla na 64 a zachovává automobilový exponent 2. Odpovídající podmínka je součástí testu, finální celá sada má 469/469 PASS. [Finální produkční protokol](verification-evidence/pilot-20261011-p3/production-ui.json) a [skutečný snímek z první osoby](verification-evidence/pilot-20261011-p3/production-flashlight-first-person.png) potvrzují měkké osvětlení před hráčem bez ostrého okraje. Noc zůstává tmavá. Nativní F potvrdilo vypnutí, canvas hlásí 0 render chyb a konzole warning/error je prázdná. Všechny kvality, schodiště, výměna profilu a vjezd do auta nejsou tímto konkrétním GPU průchodem plošně přijaty; jejich CPU kontrakty nenahrazují zbývající pixelové kontroly. GeForce FPS přejímka P3 zůstává otevřená.
