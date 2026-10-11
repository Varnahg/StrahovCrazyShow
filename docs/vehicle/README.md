# Samostatné raycastové auto

`shared/vehicle.ts` používá instalovaný Rapier 0.21.0: jednu dynamickou karoserii, čtyři raycasty kol, CCD, přídavné iterace solveru a nízké těžiště. Jde o arkádové řízení malého auta v areálu, nikoli automobilový simulátor. Modul ještě vyžaduje propojení se `Simulation`, síťovým protokolem a rendererem; samotný test modulu není důkaz integrace do hry.

## Integrační kontrakt

```ts
const vehicle = new VehicleEntity(world, { x: 25, y: 0, z: -9 }, {
  id: "campus-car", yaw: 0,
});
vehicle.unpark(playerId); // false, pokud auto už patří jinému řidiči
// Každý společný pevný tick, na serveru i predikujícím klientu:
vehicle.step({ throttle: input.z, steer: input.x, handbrake: input.jump }, FIXED_DT);
world.step(); // JEDNOU za celý svět, nikoli jednou za každou entitu
const snapshot = vehicle.capture();
const visual = vehicle.getVisualPose();
const wheels = vehicle.wheelPoses();
```

- `step(input, dt)` se volá před `world.step()` přesně při 60 Hz. Jiný krok odmítne. Modul sám svět neintegruje. Bez vstupu předávat `{ throttle: 0, steer: 0 }`.
- `throttle` je −1..1: dopředu / zpátečka. Proti směru aktuální jízdy nejdřív brzdí, do opačného směru přejde až po zpomalení. `brake` je samostatná brzda 0..1, `handbrake` brzdí zadní nápravu a mírně snižuje její přilnavost. `steer` +1 zatáčí směrem k lokálnímu +X.
- Limit je 15 m/s dopředu, 5 m/s dozadu. Řízení se s rychlostí zjemňuje a má omezenou rychlost natočení a návratu. Limituje se tah a brzdný impuls, nikoli přepis polohy nebo rotace; prudký vnější náraz může rychlost dočasně překročit.
- `driverId` a `parked` jsou součást entity. Server rozhoduje o oprávnění nastoupit; `unpark(id)` brání současnému přivlastnění jiným řidičem. `park()` odebere řidiče a převede tělo na Fixed v jeho **aktuální skutečné pozici**, bez odstranění collideru a bez změny identity. Parkování je explicitní okamžité zastavení, proto běžný výstup povolit po zpomalení; odpojení může auto bezpečně zaparkovat okamžitě.
- Konstruktor standardně vytvoří dynamické tělo a může se nejdřív usadit na podkladu. `parked: true` rovnou zmrazí zadanou pozici; předem musí být validovaná. Na rovné půdě v místním testu je usazený GLB origin přibližně y=−0,011 m.
- Řidičův `Actor` nemá přepínat kapsli na kvádr. Po nástupu deaktivovat jeho pěší collider/controller a delegovat polohu, yaw a rychlost na persistentní `VehicleEntity`. Po bezpečném serverově potvrzeném výstupu aktivovat kapsli v prověřené výstupní poloze. Auto zůstává ve světě a ve snapshotech i bez řidiče.
- `reset(position, yaw)` a `restore(state)` mohou přesunout fyziku; jsou určené výhradně pro validovaný spawn, obnovu nebo autoritativní opravu. Herní vstup nesmí těmito metodami řídit. `dispose()` odstraní controller a body a je idempotentní.

## Souřadnice a GLB

Přímo z JSON `public/models/strahov-compact.glb` bylo ověřeno: root je přibližně v prostředku podlahy, +Y nahoru, přední světla/kapota na +Z, středy kol x=±0,85, y=0,36, z=±1,05 m; skutečný poloměr pneumatik je 0,34 m. Se zrcátky je šířka 2,04 m, s nárazníky délka 3,56 m a střecha dosahuje y=1,56 m. Chassis collider pokrývá x±1,02, z±1,78 a y=0,33..1,56. Kola mají samostatnou odpruženou polohu a nejsou plnými fyzikálními cylindry.

`body.translation/rotation` a `getVisualPose()` přímo odpovídají GLB rootu; nepřičítat starý offset −0,6 m. `wheelPoses()` vrací world-space pose, steering, spin, suspensionLength a kontakt; pořadí je přední levé (−X/+Z), přední pravé (+X/+Z), zadní levé (−X/−Z), zadní pravé (+X/−Z). Quaterniona kol je pro kolo s osou X. Importované GLB cylindry mají osu Y a vlastní základní rotaci z=−π/2: při použití póz zachovat základní mesh rotaci násobením quaternionů. Náboje přiřadit podle původní polohy, názvy `.001` neoznačují sémanticky nápravu.

## Snapshot a predikce

`VehicleState` obsahuje identitu, řidiče, parked, uloženou parking pose, translation, quaternion, lineární a úhlovou rychlost, steering, čtyři vizuální rotace a délky odpružení, kontakty kol, uživatelské síly/momenty a sleeping. `capture()` nic nevrací odkazem na vnitřní pole. `restore()` ověřuje identitu a konečné hodnoty, obnoví body state, steering a app-owned wheel state; kontaktní paprsky se při dalším kroku přepočítají.

Rapier neposkytuje veřejné settery interních kontaktních/suspension cache ani interní rotace raycast kol. Proto vlastníme vizuální rotaci kol. Vnitřní warm-start cache kontaktního solveru **není** součást entity snapshotu. Izolovaný vůz na statickém podkladu prošel restore/replay s tolerancí 1 cm; nelze z toho tvrdit přesný rollback více navzájem kolidujících dynamických těl. Pro přesný rollback celého světa použít `world.takeSnapshot()` / `World.restoreSnapshot()` a znovu navázat těla a controllers. Síťový renderer má interpolovat samostatný renderový stav; fyziku nelze lerpovat přes stěny.

Dynamický chassis má vypnuté automatické uspání: raycast controller před physics stepem mění rychlost a mohl nechávat uspané tělo s nesouhlasící svislou rychlostí. Zaparkované tělo je Fixed a aktivní update neprovádí. Malý offset svislé rychlosti na konci ticku vzniká pořadím podpěrného impulsu a substepped gravitace; kontrola stability měří skutečnou polohu, ne samotný velocity sample.

## Ověření a limity

Spuštění: `pnpm exec tsx --test tests/vehicle.test.ts`, následně `pnpm exec tsc --noEmit`.

Headless scénáře používají přímo WASM Rapier, bez mockování fyziky:

- klid na cuboidu a heightfieldu: po usazení výškové kmitání pod 5 mm, minimální vodorovný drift;
- skutečná GLB geometrie karoserie, střechy, nárazníků a zrcátek uvnitř proxy;
- akcelerace, service brake, změna směru a omezení dopředné/zpětné rychlosti;
- přední řízení a chybějící otáčení na místě;
- persistentní parkování, řidič, snapshot/restore a pózy kol;
- stejná fyzická trajektorie při 30/60/120Hz renderových callbackách s pevnými 60Hz kroky;
- top-speed náraz do 20cm zdi a zatáčení těsně podél zdi: kontrola skutečných rohů collideru, tolerance průniku 3,5 cm;
- 12cm obrubník, rampa se stoupáním 1 m na 8 m, dopad zpět na podlahu;
- slalom, střídavé zatáčky a dvě plné opačné smyčky osmičky, návrat do 5 m od křížení;
- ruční brzda zadní nápravy a silnější zpomalení než volný dojezd;
- dvousekundový restore/replay izolovaného auta s chybou polohy pod 1 cm.

Raycast kola nemají objem; vysoký kolmý obrubník nelze považovat za přejezdný automaticky. Rozumné obrubníky a rampy potřebují odpovídající kolizní geometrii. Testy nedokazují libovolný převrat, každý profil terénu, multiplayer s 60/120ms RTT, FPS, napojení kamery či správné nastupování/vystupování. Tyto kontroly patří do další integrace.

API ověřeno proti lokálním `.d.ts` Rapier 0.21.0 a [oficiální dokumentaci DynamicRayCastVehicleController](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html). Pozor na skutečný setter `controller.setIndexForwardAxis = 2` a na `wheelBrake`, které přijímá brzdný **impuls**, tedy sílu násobenou dt.
