# Zdrojové exteriéry centrálních hřišť a Marketu

Balíček dodává čtyři vedle sebe umístěná oplocená hřiště, samostatný beachvolejbal a přesnější plochou střechu nízké budovy Potraviny / Recharging Bar. Jde o vlastní modelování podle otevřených map a fotografie, nikoli o fotogrammetrický model. Nejpodrobnější geometrie zůstává zachovaná v JSON, Blenderu i referenčním GLB; vzdálená podoba pouze vypíná drobné prvky.

## Podklady a jistota

| Prvek                  | Podklad                                                                                                                                                                                                                                                                                           | Co je doložené a co odhad                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Čtyři centrální hřiště | OSM ways [41833989](https://www.openstreetmap.org/way/41833989), [41833990](https://www.openstreetmap.org/way/41833990), [108568385](https://www.openstreetmap.org/way/108568385), [108568430](https://www.openstreetmap.org/way/108568430)                                                       | Zachované všechny čtyři zdrojové vrcholy, orientace a rozměry. OSM značí první tři jako fotbal, červený jako tenis.                                                                                                                                                                                                         |
| Barevné plochy         | [Ortofoto IPR 8. 6. 2024](../expansion/strahov-ortho-2024.jpg), [georeference a SHA](../expansion/ortho-georeference.json)                                                                                                                                                                        | Zelený západní kurt, dva žluto-modré a červený východní. Rozměr modrých vložek a kombinované lajnování jsou interpretované. OSM sportovní tagy se nemění.                                                                                                                                                                   |
| Beachvolejbal          | [OSM 293949918](https://www.openstreetmap.org/way/293949918), [SÚZ zpráva 12. 6. 2024](https://beta.suz.cvut.cz/en/news/training-tower-strahov-dormitories)                                                                                                                                       | Půdorys a poloha naproti supermarketu. Herní síť a čáry používají typové rozměry, nikoli zaměření. Neověřenou cvičební věž nepřidáváme.                                                                                                                                                                                     |
| Výška povrchů          | ČÚZK DMR 5G, současný `shared/terrain.ts`                                                                                                                                                                                                                                                         | Každá barevná plocha a čára jsou rozřezané podle přesných podkladových trojúhelníků DEM. Nevytvářejí rovnou desku přes svah.                                                                                                                                                                                                |
| Ploty a průchody       | Přítomnost oplocení na IPR ortofotu; mapované pěší cesty OSM                                                                                                                                                                                                                                      | Výšky 3–3,5 m, rozteče sloupků a dva 2,6m otevřené vstupy na každý centrální kurt jsou **herní odhady**. Zachovaná šířka všech pěších cest + minimálně 0,64 m odstupu při hustém ověření.                                                                                                                                   |
| Market / R-ko          | [OSM budova 7645350](https://www.openstreetmap.org/way/7645350), [SH Wiki](https://wiki.sh.cvut.cz/kolej/hospody), [Mapy panorama 1. 6. 2023](https://mapy.com/cs/zakladni?q=Recharging%20bar&source=firm&id=13296995&pid=101883310&newest=1&yaw=4.343&x=14.3938139&y=50.0812633&ds=2&z=17&ovl=8) | Sdílená jednopodlažní budova a plochá střecha. Panorama skutečně vizuálně prohlédnuté 10. 10. 2026: malovaná východní stěna, horní malá / spodní zamřížovaná okna, kouřovod, parcelbox. Tyto fasádní prvky zůstávají v existujícím architecture packu. Přesné dveře baru a dělení prodejen nejsou doložené; nevymýšlíme je. |

Google snímky dodané uživatelem sloužily k rozpoznání chyb a vizuálnímu srovnání. Žádné jejich pixely, Google 3D dlaždice ani textury nejsou obsažené v balíčku. Použitý výškový rastr a podklad IPR mají vlastní oddělenou provenienci.

## Integrace

```ts
import { createCampusExterior } from "./campus-exterior";
const exterior = createCampusExterior(scene);
// jednou za snímek spolu s existujícím quality controllerem:
exterior.update(player.x, player.z, quality);
// při opuštění hry:
exterior.dispose();
```

`shared/campus-exterior.ts` exportuje `buildCampusExteriorPlan()`. `plan.collision.positions/indices` tvoří stejnou hranici oplocení jako jeho viditelné dráty, přerušenou ve všech vstupních mezerách. Kořenová fyzika přidá jeden `Rapier.ColliderDesc.trimesh` s `FIX_INTERNAL_EDGES`. Barevné povrchy jsou pouze nátěr na stávajícím společném DEM; nepotřebují druhou kolizi. Existující OSM landcover může zůstat pod nimi. Při použití skutečného IPR mesh má integrátor vypnout překrývající se vrstvy, ne přes sebe kreslit dvě střechy či hřiště.

Renderer používá 11 sdílených material/LOD batches: **9 082 trojúhelníků zblízka / 2 344 z dálky**, 48 kolizních trojúhelníků, 5 hřišť, 8 otevřených vstupů. Ploty a sítě jsou neprůhledné geometrické dráty se dvěma kolmými pásky, bez alpha blendingu. Čáry a modré vložky mají stabilní depth bias; v prvním WebGL snímku bylo odhaleno blikání milimetrových vrstev a opraveno před předáním.

## Zdrojová editace a ověření

`pnpm exec tsx scripts/create-campus-exterior-plan.ts` exportuje nejpodrobnější společný plán. Následující příkaz vytvoří editovatelný [Blender](../../../assets/blender/campus-exterior/campus-exterior-source.blend) a referenční [GLB](../../../public/models/campus-exterior/campus-exterior-source.glb):

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python scripts/create-campus-exterior.py
```

Runtime nadále čte společný TypeScript plán, aby terén, oplocení a kolize zůstaly shodné. GLB nevytváří druhou překrývající se runtime vrstvu.

`pnpm exec tsx --test tests/campus-exterior.test.ts`: **6/6 PASS**. Ověřené přesné zdrojové půdorysy, DEM, šířky cest, zachování zdrojového detailu, řádné uvolnění rendereru i skutečný průchod kapsle Rapier všemi osmi vstupy. Kontrolní kapsle také narazí do všech dostatečně dlouhých pevných částí oplocení.

[Browser komparátor](preview.html) je izolované ověření tohoto balíčku. Neslouží jako měření FPS celé produkční hry a jeho zelené pozadí nenahrazuje existující ulice, parkoviště ani stromy. Uložené snímky: [shora](browser-overview.png), [detail](browser-courts-near.png), [vzdálená verze](browser-courts-far.png), [Market](browser-market.png). Rozlišení 1280 × 720; konzole při těchto kontrolách bez chyb a varování. Celkové GPU měření a integraci provádí kořenový proces.
