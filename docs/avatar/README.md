# Editor a model postavy

Editor používá existující `Profile` / `AvatarConfig`, tedy nevyžaduje změnu síťového protokolu, sanitizace ani uložených profilů. Šest fiktivních předloh má různou výšku a stavbu těla, střih vlasů a oblečení. Výběr předlohy nastaví barvy a doplňky; následné změny jsou plně individuální. Výběr zachovává získaný `badge` a nemění přezdívku ani sociální nastavení.

## Zapojení

V UI nahraď původní inline editor komponentou:

```tsx
import { AvatarEditor } from "./avatar-editor";
const avatarEditor = <AvatarEditor profile={profile} onChange={setProfile} />;
```

Existující uložení profilu do localStorage a odesílání změn serveru zůstávají na straně App. Volitelný `compact` zmenší náhled v herním panelu.

Ve hře vytvoř jednou pro celou scénu sdílenou továrnu a v `makeAvatar` z ní sestav rig:

```ts
import { AvatarPrimitivePool, createAvatarRig } from "./avatar-renderer";
// Po založení scény, před prvním makeAvatar:
this.avatarPool = new AvatarPrimitivePool(this.scene, (color) =>
  this.mat(color),
);

const rig = createAvatarRig(
  this.scene,
  player.avatar,
  this.avatarPool,
  "avatar " + player.id,
);
return { ...rig, target: player, profile: JSON.stringify(player.avatar) };
```

Rig vrací `root`, `left`, `right`, `arm`, `rightArm`. Animuj levý a pravý krok opačně a ruce proti nohám; pravá paže má vlastní pivot a nemá zůstat připevněná přímo k rootu. Root se stejně jako dosud staví na fyzikální pozici minus 0,8 m. Chodidla jsou v lokálním Y přibližně 0, postavy měří podle předlohy a vlasů 1,54–1,67 m. Vzhled nemění autoritativní kapsli ani herní schopnosti.

Po zrušení nebo přestavbě avatarů zavolej `avatarPool.pruneUnused()`. Odstraní zdrojové meshe, které už nemají instance; sdílené materiály poskytnuté hrou nemaže. Při zrušení scény zavolej také `avatarPool.dispose()`.

## Výkon a ověřování

- Jedna geometrie koule/boxu pro barvu, velikosti a proporce jsou transformace instancí. Žádný vlastní 3D kontext pro jednotlivé herní avatary.
- Každý rig má přibližně 2 964–3 408 trojúhelníků a 27–38 instancovaných částí včetně odznaku. Sdílení snižuje počet vykreslovacích volání; CPU cenu transformací a skutečný dav musí potvrdit benchmark hlavní hry.
- Náhled používá stejnou továrnu i model jako hra, jeden dynamicky načtený Babylon kontext a vykreslování pouze po změně nebo otočení, změně velikosti a dokončení shaderů. Nemá běžící render loop, pozastavuje při skrytí dokumentu a po unmountu zruší engine, scénu, observer i čekající frame.
- `pnpm exec tsc --noEmit` kontroluje typy; `pnpm exec tsx docs/avatar/check-avatar-rig.mts` ověří všech šest siluet, rozměry, odznak, oddělené paže, sdílení geometrie a čištění po 80 změnách barev.

## Současné hranice

Procedurální model je soudržný a čitelný základ s jemnou stylizací. Není fotorealistický, nemá skenované tváře ani automatické vytvoření ze selfie. Konkrétní reálné osoby vyžadují dodané reference a domluvu. Vlasy a střih oblečení určuje předloha; samostatné položky šatníku a náhrada skinnovaným Blender/GLB modelem jsou další etapa, která má zachovat stejné `AvatarConfig` rozhraní nebo zavést jeho řízenou migraci.
