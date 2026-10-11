# Stabilita animací a popisků

Implementace 10. 10. 2026. Vlastní modul je `client/animation.ts`, popisky spravuje `client/labels.ts`. Jde o doplnění současného Babylon rendereru; opravy fyzikálního času, predikce a kamery spravuje hlavní implementace. Tato práce jejich výsledky sama necertifikuje.

## Animace postavy

`AvatarAnimator` se vytvoří jednou pro každý `AvatarRig` a aktualizuje po určení jeho konečné renderované pozice, před `scene.render()`. Fáze kroků vychází z vodorovné ujité vzdálenosti. Rychlost, váha chůze, natočení těla a ramenní gesta používají exponenciální přechody nezávislé na počtu snímků. Chodidla stojícího hráče se nepohybují podle globálních hodin. Paže jsou při lokomoci symetrické a protilehlé nohám.

Modul nepřepisuje `root.position`, pitch/roll kořene, kameru, kapsli ani síťový stav. Otočení těla jde nejkratší cestou přes hranici −π/+π. Velký přesun nad 2,5 m, změna vozidla a dlouhá mezera nad 250 ms ruší starou fázi. Pro explicitní teleport či resync zavolat `reset()` i při kratším přesunu.

Integrace do Game:

```ts
import { AvatarAnimator } from "./animation";

// makeAvatar: přidat animation do vraceného objektu a typu Avatar.
const rig = createAvatarRig(scene, config, pool, name);
const animation = new AvatarAnimator(rig);

// Po nastavení a.root.position; nahradí původní přímý yaw a globální sinus.
a.animation.update(
  {
    position: a.root.position,
    yaw: p.yaw,
    emote: p.emote,
    vehicle: p.vehicle,
    grounded: id === this.localId ? this.actor.grounded : undefined,
  },
  dt,
);
```

Změna profilu vytváří nový rig i nový controller. Smazání avatara nepotřebuje zvláštní dispose animátoru: drží pouze čísla a referenci na svůj rig. Nespouštět zároveň starou sinusovou animaci. `grounded` vzdálených postav není nyní součástí jejich veřejného renderového stavu, takže jejich skok používá neutrální lokomoční variantu.

## Opravené chyby popisků

- Nový DOM span začíná skrytý; nevykreslí jméno na souřadnicích 0,0 před prvním renderem.
- Výběr nejbližších nastává po testu kamery a vzdálenosti. Lidé za kamerou nemohou vytlačit všechna jména před kamerou.
- Nejvýše 16 hráčských jmen a osm názvů míst. Členství má vzdálenostní hysterézi, aby podobně vzdálení lidé každým snímkem neměnili pořadí. Limit se týká pouze popisků.
- Dosah má 10% hysterézi, occlusion má odlišnou prodlevu objevení 80 ms a zmizení 140 ms. Za kamerou se text skryje okamžitě.
- Nejvýše čtyři LOS dotazy za renderovaný snímek; fronta vybírá nejstarší neaktuální výsledek. Occluded bližší dav nemůže navždy vyhladovět vzdálenější viditelné jméno.
- Projekce používá hotovou matici stejného snímku, aktuální CSS rozměry a interní rozlišení. Opakovaně používá vektory a jednotkovou matici. Pozice zůstává subpixelová s deadzone 0,1 CSS px; nevzniká žádná dohánějící CSS transition.

Při náhlém vstupu stovky popisků do záběru může první LOS kontrola posledních kandidátů trvat přibližně 25 renderovaných snímků a poté 80 ms objevení. Jde o vědomé rozložení práce; avataři se vykreslují okamžitě. Při výměně vybraného jména se může během 140ms hide přechodu krátce ukazovat více jmen než běžný limit.

## Ověření a jeho hranice

`pnpm exec tsx --test tests/animation.test.ts tests/labels.test.ts` ověřuje skutečné transformace Babylon AvatarRig v NullEngine a projekci kamery s řízenou minimální DOM reprezentací. Třináct regresních testů zahrnuje chůzi/běh/sprint při 30/60/144 FPS, zastavení, shortest-angle otočení, gesta bez root bob, teleport/uspání/vozidlo, artikulované klouby/proporce/uzavřenost geometrie, světové anchory chodidel a skok/dopad, výběr jmen před kamerou, hysterézi a spravedlivou frontu 100 kandidátů s limitem čtyř dotazů.

`pnpm exec tsx docs/stability/audit-animation.ts` znovu vytvoří `animation-audit.json`: 1/30/100 reálných instancovaných rigů, 180 zahřívacích a 900 měřených kroků, CPU časy samotných animátorů a odděleně NullEngine scene traversal, nulová změna polohy kořene animátorem, prostředí a hashe měřených zdrojů. NullEngine neměří GPU, DOM kompozitor, síť ani celou hru; výsledek není měření herního FPS.

Po integraci je nadále potřeba skutečný browser průchod spawn → B6 → schody → ven, 30 sekund stání, rychlé otočení a dav při 30/60 FPS, se stejnou kamerou a počasím. Ověřit zvlášť text, síťové korekce, fasády a Z-fighting. Animátor sám nemůže odstranit vibrace statických staveb způsobené kamerou nebo překrývající se geometrií.

Následující iterace přidala kolena, lokty, kotníky a plantovaná chodidla pomocí dvousegmentového IK. Aktuální stav, nové testy a omezení popisuje [dokumentace postav](../characters/README.md). Nejde o fotorealismus ani o animaci úrovně Hogwarts Legacy. Pro 100 lidí držet všechny viditelné modely; snížit pouze detail a případně četnost vzdálených kosmetických gest s fázemi určenými z renderového času. Lokální postava, blízcí lidé a projekce popisků se aktualizují každý vykreslený snímek.
