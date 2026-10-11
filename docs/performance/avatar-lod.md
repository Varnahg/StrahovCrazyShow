# LOD skutečných artikulovaných postav

`client/avatar-lod.ts` doplňuje současný rig a jeho IK animátor. Neodpojuje hráče, nefiltruje multiplayerovou přítomnost a nemá limit osm postav. Každá vzdálená postava zůstává samostatnou vykreslitelnou instancí na své interpolované pozici.

## Integrace do Game

Při vytvoření postavy, před prvním animačním snímkem:

```ts
const rig = createAvatarRig(scene, config, avatarPool, name);
const lod = new AvatarLodController(scene, avatarPool, rig, config);
const animation = new AvatarAnimator(rig);
```

Po výpočtu finální interpolované pozice nohou v renderovacím loopu:

```ts
const state = lod.update({
  distance: Vector3.Distance(camera.position, targetFeet),
  quality,
  position: targetFeet,
  yaw: player.yaw,
  visible: !player.vehicle && !(isLocal && firstPerson),
  forceNear: isLocal,
});
if (state.resetAnimation) animation.reset();
const animationDt = lod.animationDelta(dt);
if (animationDt > 0) animation.update(animationState, animationDt);
```

`position` má stejný počátek jako `rig.root`: výšku u nohou, tedy již po odečtení offsetu středu fyzikální kapsle. `animationState.position` musí obsahovat tuto stejnou finální interpolovanou polohu. Vzdálenost počítat od kamery, aby postava blízko kamery dostala správný detail i při oddáleném pohledu. Lokální postava má `forceNear` a zachová plné IK. Řízení, pohyb kapsle, networking, popisky ani kameru controller nemění.

Controller vlastní pouze LOD proxy a registrace rig meshů. Při změně profilu či odchodu volat `lod.dispose()` a potom `rig.root.dispose(false, false)`. Pozorovatel `rig.root.onDisposeObservable` zajišťuje uvolnění proxy cache i při samotném zániku kořene. Potom může stávající `avatarPool.pruneUnused()` uvolnit původní zdroje.

## Chování a limity

| Kvalita | Near → medium | Medium → near | Medium → far | Far → medium |
|---|---:|---:|---:|---:|
| low | nad 12 m | pod 10 m | nad 40 m | pod 36 m |
| medium | nad 18 m | pod 15 m | nad 66 m | pod 60 m |
| high | nad 25 m | pod 22 m | nad 98 m | pod 90 m |

Při prvním výběru se používají bližší hranice 10/36, 15/60 či 22/90 m. Hystereze zabraňuje střídání reprezentace při nepatrném pohybu u hranice. Neplatná vzdálenost zachová plný detail. Přepnutí je geometrické, bez průhledného crossfade a jeho sortování.

- **Near:** původní artikulovaná postava se všemi detaily, původními sdílenými geometriemi, materiály a animací každý snímek.
- **Medium:** zachovává hlavu, krk, hlavní účes, vousy, oděv, paže, ruce, nohy, kolena a boty. Drobné obličejové a oděvní detaily jsou vynechané. Plná geometrie hlavních dílů se nadále sdílí s ostatními postavami. IK aktualizace běží nejvýše přibližně 30× za sekundu a používá skutečný součet uplynulého času.
- **Far:** jedna uzavřená neprůhledná barevná silueta ze zjednodušených těles. Zachovává výšku, stavbu těla, hlavní účes a barvy kůže/vlasů/trička/kalhot. Aktualizuje interpolovanou pozici a yaw každý snímek, bez výpočtu kloubů a IK. Nohy se na této vzdálenosti neanimují; návrat do medium/near jednorázově resetuje staré kontakty chodidel. Brýle a malé odznaky se na far úrovni nekreslí.

## Proč jsou původní instances ponechané

`AvatarPrimitivePool` už používá Babylon hardware instances společné podle tvaru a barvy. Neviditelná zdrojová geometrie slouží viditelným instancím. Slučování celé hlavy nebo kloubů pro každou kombinaci předlohy a barev by rozbilo část tohoto globálního sdílení a mohlo zvýšit draw calls. Near ani medium proto původní instancing nepřepisují.

Pouhé `isVisible = false` není dostatečná optimalizace. Aktuální Babylon 9.30.0 v `Scene._evaluateActiveMeshes` nejdříve prochází kandidáty, kontroluje připravenost a počítá world matrix a až později ověřuje `isVisible`. I `setEnabled(false)` ponechává mesh v kandidátech. Controller neaktivní instance veřejnými metodami `scene.removeMesh` / `scene.addMesh` skutečně odregistruje a obnoví. Zůstávají reverzibilně připojené k vlastnímu rigu; nemusí se znovu vytvářet při návratu.

Far geometrie se cacheuje pro stejnou předlohu, barvy a rozměry. Kořenová světová poloha se z transformací odečte. Uživatelé stejného vzhledu sdílejí jednu source geometry a bílý materiál s vertex colours. Barvy se neslévají do jedné náhodné barvy davu. Poslední zánik dané podoby uvolní její zdroj; zánik posledního zdroje uvolní společný materiál. Původní geometrii far postav pool nadále drží, aby návrat k detailu nevyvolával tvorbu celého rigu.

## Změřené strukturální počty

Počty pocházejí z **aktuálního** `avatar-renderer.ts`, skutečných šesti předloh a `tests/avatar-lod.test.ts` nad Babylon NullEngine. Nejsou odhadem FPS ani GPU draw calls. Nezahrnují okolní svět, osvětlení, štítky nebo vozidla.

| Předloha | Near instances / triangles | Medium instances / triangles | Far instances / triangles |
|---|---:|---:|---:|
| Alex | 43 / 6 484 | 21 / 3 068 | 1 / 228 |
| Robin | 48 / 6 232 | 20 / 2 812 | 1 / 216 |
| Eli | 46 / 6 228 | 22 / 2 856 | 1 / 240 |
| Sam | 39 / 5 948 | 22 / 2 836 | 1 / 240 |
| Mia | 50 / 6 432 | 22 / 3 012 | 1 / 240 |
| Niki | 45 / 6 996 | 23 / 3 580 | 1 / 252 |

Při 100 skutečných samostatných rigech střídajících těchto šest vzhledů:

- near: **4 512** avatar instances, **4 596** celkem avatar mesh kandidátů včetně 84 neviditelných pool sources;
- far: **100** avatar instances a **190** mesh kandidátů včetně původních 84 sources a šesti sdílených far sources;
- žádná ze sta identit nezmizela; reprezentace zůstala viditelná a měla vlastní transformaci;
- úspora registrovaných avatar kandidátů je přibližně **95,9 %**; neznamená to stejnou procentní úsporu celého snímku.

Počet unikátních barev/vzhledů může zvýšit počet sdílených zdrojů. Sto unikátních vzhledů může mít až sto far source geometrií; pořád má každá postava jednu viditelnou far instanci. Controller nemá tvrdit konstantní počet draw calls pro libovolný dav. Při stovce lidí těsně u kamery zůstává plný detail nákladný. Výsledek skutečné integrované aplikace na Intel UHD 630, při 30/100 síťových účastnících a známém backbufferu, musí ověřit oddělený produkční GPU benchmark.

## Ověření

`node --import tsx --test tests/avatar-lod.test.ts tests/animation.test.ts`: **16 testů prošlo**. Nových osm testů ověřuje odregistraci kandidátů a obnovení detailů, hysterezi, všech šest výšek a palet, uzavřenost far geometrie, zachování sta identit, sdílení a životnost zdrojů, viditelnost při first person/vozidle, 30Hz IK a skutečný průchod far instance Babylon active-mesh vyhodnocením. Navazující osm animačních testů dál ověřuje chůzi, gesta, rotaci, teleporty, stabilní ukotvení nohou a skok.

Síťový harness už ověřuje počet přes autentizované rooms a motion rows. Veřejné `/api/health` nepotřebuje ani nepožaduje `online` či `worldId`. Pro 99 botů a jeden browser lze zadat osmý argument `100`; před měřením musí všechny autentizované streamy potvrdit očekávaných sto řádků. Historické předintegrační JSON výsledky zůstávají beze změn.
