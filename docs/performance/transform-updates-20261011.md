# Přesné zápisy transformací po M6

**Odstraněny redundantní transformace; GPU ani FPS přínos se zatím netvrdí.** Při níže uvedených cílených testech zůstalo M6 na portu 4179 beze změny. Následný společný checkpoint N prošel 410 testy/buildem/integrací/SHA i praktickou jízdou ve dne a v noci, poté převzal místní port 4179. [Finální důkazy a rozsah přejímky](../verification.md).

## Podklad a změna

Skutečný profil M měl render CPU jako hlavní klientskou položku; aktivace meshů ve třech denních jednoavatarových intervalech trvala přibližně 5,27–5,80 ms. M však předchází následné enabled-candidate cache a není aktuálním profilem M6 ani GeForce. Statický audit ukázal, že `Game.frame`, obě cesty načítání auta a kontaktní stíny zapisují identické polohy/rotace každý frame.

Instalovaný Babylon.js 9.30.0 v `Vector3.copyFromFloats` a jednotlivých souřadnicových setterech označí vektor jako dirty i při stejné hodnotě. `TransformNode.rotationQuaternion` zároveň resetuje Eulerovu rotaci a invaliduje uzel. Přepočet matice zvyšuje child update ID, aktualizuje bounds a vyvolá `onAfterWorldMatrixUpdateObservable`. Četnost těchto skutečných přepočtů je předmětem níže uvedeného důkazu.

- `client/transform-updates.ts` obsahuje dva sdílené přesné zápisy. `Object.is` zachovává i znaménko nuly; nepoužívá epsilon ani kvantování. Quaternion patří cílovému uzlu a není aliasem vstupního pracovního bufferu. Při skutečné změně se použije veřejný Babylon setter včetně původního resetu Eulerovy rotace.
- `client/assets.ts` sjednocuje dva původně stejné wheel updatery. Steering a spin se počítají v původním pořadí `RotationAxis(up) × RotationAxis(right)`, do opakovaně použitých quaternionů. Cache úhlů nepřeskočí aplikaci na nový nebo změněný pivot. Pravidlo odpružení včetně parked/no-contact výšky 0,32 m se nemění; každá dvojice rigů má vlastní cache a disposed guard.
- `client/contact-shadows.ts` vlastní u každého instance poslední úplný vstup a požadovanou orientaci. Ground fit se přepočítá při změně polohy, rozměrů nebo yaw. I při shodném vstupu se přesně kontroluje skutečná transformace meshů, takže se opraví vnější zásah. Remove/dispose uvolní také cache. Orientace na terénu i ve vzduchu zůstává původní.
- `client/game.ts` nepřepisuje shodnou polohu avatara ani kořeny aut. Konečná pozice s lokálním visual offsetem se zapíše jednou; kontaktní stín auta dále dostává původní neoffsetovanou polohu. Pole `Game.frames` zůstává zachované pro vývojové `__strahov.getStats.frameTimes`; jeho push/shift se provádí pouze v DEV. Produkční benchmarkové `b.frames` se nemění.

Žádný asset, materiál, LOD, world freeze, trajektorie, geometrie nebo kolize se nemění.

## Skutečné native recompute události

Nová regrese používá původní implementaci jako nezávislou větev a porovnává ji s novými funkcemi. Po každém kroku porovnává přesné world matrix hodnoty a world bounds. Počet je odečten z veřejných Babylon observable událostí; nepochází ze statistického odhadu ani z počtu zavolání našeho helperu.

| Scénář | Počet evaluačních kroků | Původní recompute | Nové recompute |
| --- | ---: | ---: | ---: |
| Stojící auto po warmupu | 240 | 2400 | 0 |
| Pohyb, zatáčení, spin a odpružení | 120 | 1200 | 1200 |
| Stojící kontaktní stín po warmupu | 240 | 240 | 0 |

Automobilová fixture má dva skutečné Babylon rigy: každý root, čtyři wheel pivoty, tělo a čtyři jednoduché geometrické potomky; aktivní je vždy parked nebo driving reprezentace. Používá kanonické wheel connections ze shared modulu. **Není to celá produkční scéna ani GPU rendering.** Pohyblivý případ úmyslně zachovává všechny potřebné aktualizace. Samostatné existující regrese níže navíc načítají skutečné oba GLB/load adaptéry a chrání jejich geometrii, původní parkovací vozy a shadow proxy.

Nové testy pokrývají také signed zero a velmi malou změnu, vlastnictví quaternionů, reset Eulerovy rotace, parked/driving, kontakt a chybějící suspension/spin hodnoty, visual offset, výměnu pivotu, disposed guard, terrain/airborne kontaktní stín, změnu visibility, vnější změnu transformace a remove/recreate stejného ID.

## Cílené ověření a omezení

Příkaz `pnpm exec tsx --test --test-concurrency=1 tests/transform-updates.test.ts tests/native-car-models.test.ts tests/realistic-car-pack.test.ts tests/car-shadow-proxy.test.ts tests/vehicle-camera.test.ts`: **22/22 PASS**, exit 0, test runner 14,451 s. Předcházející samostatný běh tří nových testů byl rovněž 3/3 PASS. [Log a strojový záznam](evidence/transform-updates-20261011/results.json).

Před oběma CPU běhy bylo ověřeno **0 established TCP spojení na lokálním serveru 2570**. Jde o lokální pozorování socketů v daných okamžicích, nikoli veřejné zveřejnění multiplayerové přítomnosti nebo úplnou historii uživatelských měření.

Tato evidence měří zachování chování a odstranění zbytečných native přepočtů; neudává úsporu milisekund ani FPS. Celou testovací sadu, build a izolovanou integraci spustí hlavní agent nad stabilním checkpointem. Produkční GeForce měření musí samostatně ukázat, zda změna zmenší `activeMeshes`/render CPU čas a poskytne rezervu pro 60 FPS při stejném rozlišení, kvalitě, počasí, provozu a populaci.
