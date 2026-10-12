# Vzdálené odrazy a doskoky — 12. října 2026

Integrovaná návaznost na PR5 / protokol 8 a na ověřenou opravu místního skoku. Práce ve worktree `visual-quality-jump`, bez zásahu do main nebo služby na portu 4179. CPU důkazy a následná rootem provedená dílčí GPU kontrola celé vývojové hry jsou níže oddělené.

## Podklady a reprodukované mezery

- Serverové `synchronizePlayer` již kopíruje skutečný `Actor.grounded`; `captureMotion` jej posílá jako desáté pole řádku. Produkční motion encoder/decoder příznak zachovávají bez kvantizace. Souřadnice vzdálené prezentace mají krok 1 mm.
- `SnapshotBuffer` drží 100ms interpolační odstup. Před touto opravou interpoloval pozici, ale kontakt vracel vždy z levého endpointu `...a`. Test dvojice ground→air selhal už v čtvrtině intervalu: kořen stoupal, příznak zůstával `true`. Přesný pravý endpoint měl rovněž starý kontakt.
- `Game.updateAvatarPresentation` dosud vzdálenému animátoru předával `grounded: undefined` a vzdálený kontaktový stín nechával aktivní i během letu. Nová skutečná 20Hz síťová reprodukce na této podmínce před opravou selhala.
- Při prvním napojení se ukázalo, že `clearSole` dělal podlahové dotazy i během první části vzdušného blendu. Nyní je výslovně omezen na stav, který není airborne.
- Běžecký doskok Eli v medium měl bez měřeného podkladu podporující botu 26.95 mm nad skutečnou podlahou. Z toho 20.26 mm byl rozdíl mezi autoritativním capsule-bottom/root a povrchem; nešlo o zbylý vzdušný blend. Původní vzdálená animace používá bez podlahového dotazu rovinu na root.y. Tolerance testu nebyla uvolněna: při přechodu air→ground jsme doplnili skutečné změření podkladu.

Podklady jsou skutečné implementace [SnapshotBuffer](../../../shared/netcode.ts), [Game](../../../client/game.ts), [AvatarAnimator](../../../client/animation.ts), Rapier `Simulation.floorHeight` a stávající [aligned jump fixture](../../../tests/helpers/jump-animation-fixture.ts). Fixture zachycuje pozici i kontakt po stejném fyzikálním kroku.

## Výsledná integrace

`SnapshotBuffer.sample` vrací přesný kontakt každého endpointu. Uvnitř úseku, jehož oba kontakty známe, je kontakt `a.grounded && b.grounded`: úsek dotýkající se letu zůstává vzdušný až do skutečného grounded endpointu. Pokud některý vnitřní endpoint údaj nemá, výsledek zůstává `undefined`. Jde o konzervativní **prezentaci interpolovaného kontaktu**, nikoli dodatečnou fyziku nebo zpětný odhad kontaktu z výšky.

Game předává animátoru příznak z téhož `avatar.target`, do něhož vložil celý interpolovaný snímek včetně polohy. Místní postava dál používá svého Actor. Kontaktní stín vyžaduje explicitní `grounded === true`, proto neoznačuje let nebo neznámý stav za oporu.

Vzdálený let dostává skutečný `floorHeight` callback. Při sestupu animátor použije nejvýše jeden dotaz pod kořenem pro anticipovanou extenzi nohou. `touchdownGroundHeight` se použije pouze na první animovaném přechodu air→ground, kdy původní chodidlový solver změří reálné body podpory. Na běžných grounded snímcích vzdáleného davu nejsou přidané terénní dotazy. Far proxy neprovádí animaci ani dotazy. Neznámý kontakt zachovává původní fallback sledující výšku kořene, bez vymyšleného skokového příznaku či podlahy.

Tento krok nemění síťový formát, verzi protokolu, authority/reconcile, kameru, rig, kořenovou pozici ani fyziku. Jediná změna lokální animace je vyloučení nepříslušných sole-clearance dotazů za explicitního letu; původní regresní scénáře včetně schodů prošly. Avatar vlastní jednu lazy floor-query funkci, která čte jeho aktuální kořen a aktuálního lokálního Actor pro filtr dotazu. Nevzniká samostatný registr, observer ani GPU zdroj; po odstranění avatara se uvolní i tato funkce. Funkce se nevytváří pro far ani unknown avatar a na dalších grounded snímcích se znovu používá. Kopie animation state vzniká jen při použití touchdown callbacku.

## Cílené ověření

[Nový síťový test](../../../tests/remote-jump-animation.test.ts) a [jeho fixture](../../../tests/helpers/remote-jump-fixture.ts) používají skutečný MotionEncoder → MotionDecoder → SnapshotBuffer → Game presentation → AvatarAnimator/AvatarLodController. Každý zdrojový klip má 90 zpráv při 20 Hz, iterace vykreslení běží při 60 Hz; medium skutečně použije 30Hz akumulaci LOD. Latence je 60 ms, jitter mění pouze čas doručení a zachovává pořadí WebSocket zpráv. Série s 140ms pozdržením zahrnuje skutečné zastavení interpolace při dočasném nedostatku zpráv.

| Scénář | Animované snímky / 5 s iterace | Dotazy podkladu celkem | Nejmenší odstup kyčle od kotníku | První animovaný doskok: spodní bod boty nad podkladem |
| --- | ---: | ---: | ---: | ---: |
| Alex, skok z klidu, near, jitter 0 | 294 | 67 | 0.6100 m | 0.986–0.987 mm |
| Eli, běh, medium, jitter 0/+22/−12/+8 ms | 147 | 51 | 0.3770 m | 1.095–7.833 mm |
| Sam, běh, near, jitter 0/+140/+140/0/0 ms | 294 | 58 | 0.3639 m | 1.232–1.346 mm |

Dotazy jsou součtem celého klipu včetně úvodního usazení postavy a vlastního skoku. Mimo sestup a jednorázové doskoky se nedělají; ve vzdušném animovaném snímku nejvýše jeden. Dvě další varianty ověřují Robinův chybějící grounded údaj a far proxy preset 4: oba mají **0 terénních dotazů**, far navíc **0 animovaných snímků**, kořen v obou případech skutečně stoupá a klesá.

Testy kontrolují všechny kombinace `true/false/undefined` v t=0, 0.25, 0.75, 1, stejné sampled příznaky pro animaci a stín, složené nohy v apexu, nepřevrácené koleno, skutečné délky segmentů a obě viditelné boty při prvním animovaném doskoku. Původní testy nebyly oslabeny.

Příkaz odpovídající cílenému běhu:

```text
tsx --test tests/remote-jump-animation.test.ts tests/jump-animation.test.ts tests/animation.test.ts tests/locomotion-quality.test.ts tests/prediction-replay.test.ts tests/local-avatar-presentation.test.ts
```

**35/35 PASS, exit 0**, test runner 13.106 s. Po root review následoval refaktor jedné avatar-owned floor-query funkce; zpřísněné remote + camera testy znovu **7/7 PASS, exit 0**, 8.329 s, se stejnými kontaktními hodnotami a počty dotazů. Regrese ověřuje stejnou identitu callbacku napříč aktualizacemi a žádný callback u far/unknown. Spuštěno přímo přes lokální `node_modules/tsx/dist/cli.mjs`; bez instalace balíčků, GPU, serveru či Blenderu. Scoped TypeScript nad runtime importy nových testů: **exit 0**. `git diff --check`: **exit 0**. Původní logy jsou archivované beze změny: [35 testů](../../verification-evidence/remote-jump-20261012/cpu-targeted-tests.log), [7 testů po refaktoru](../../verification-evidence/remote-jump-20261012/cpu-query-cache-tests.log), [typecheck](../../verification-evidence/remote-jump-20261012/cpu-typecheck.log), [původní scoped konfigurace](../../verification-evidence/remote-jump-20261012/cpu-tsconfig.json.txt). Archivace testy neopakovala; plná společná pipeline patří stabilnímu checkpointu.

## Praktická GPU kontrola 12. října 2026

Root spustil jednu skutečnou SDK relaci `QA Skok Eli` proti API 2572/protokolu 8 a pozoroval ji z celé hry na portu 5190 s HUD a vlastním hráčem. [Archiv původního driveru](../../verification-evidence/remote-jump-20261012/driver.ts.txt) posílá kanonické vstupy do skutečné serverové fyziky, bez teleportu či vyrobených motion snapshotů. Argumenty byly `eli 180 both`, později operátor zadal režimy `s` a `r`. Skutečný počáteční spawn byl podle hlášení autority přibližně `(111.800003, −2.1935, 12)`, po usazení Y přibližně −2.3734. Režim nazvaný `running` v tomto driveru stále posílá **`run:false`**: GPU kontrola pokrývá klid a skok za pohybu/chůze, nikoli Shift sprint.

Blízký pohled používal medium kvalitu, Intel UHD 630 a CSS/render **1280×720**; místní hráč byl u `(110,12)`, vzdálený přibližně 1,7–5,8 m stranou a kamera asi 7 m za místním hráčem. Pro vzdálený pohled root použil skutečné D 1600 ms, S 3000 ms a A 1600 ms do `(110.64998,26.21823)`, přepnul na low a pozoroval druhého hráče přibližně z 20 m: CSS **1280×720**, interně **984×553**. Názvy „blízký/vzdálený“ označují tento pohled. **Skutečný runtime LOD nebyl nezávisle vyčten**; ani původní adresář `medium-frames` není jeho důkazem.

Vybraných šest nezměněných snímků bylo při archivaci znovu prohlédnuto:

| UTC okamžik z původního capture indexu | Snímek a pozorování |
| --- | --- |
| 07:20:06.861 | [Blízko, let](../../verification-evidence/remote-jump-20261012/near-04-airborne.jpg): postava je nad asfaltem, kolena složená bez zjevné inverze. |
| 07:20:07.173 | [Blízko, sestup](../../verification-evidence/remote-jump-20261012/near-06-descent.jpg): postava je níže než v předchozím snímku, nohy zůstávají složené. |
| 07:20:07.445 | [Blízko, na zemi](../../verification-evidence/remote-jump-20261012/near-08-ground.jpg): návrat do stojné výšky, bez nápadného přetrvávajícího visení bot v tomto snímku. |
| 07:21:26.150 | [Z dálky, let](../../verification-evidence/remote-jump-20261012/distant-00-airborne.jpg): zvýšená silueta je částečně zakrytá autem. |
| 07:21:27.067 | [Z dálky, na zemi](../../verification-evidence/remote-jump-20261012/distant-04-ground.jpg): postava je opět níže u asfaltu; detail bot omezuje velikost v obraze. |
| 07:21:29.184 | [Z dálky, let za pohybu](../../verification-evidence/remote-jump-20261012/distant-20-moving-airborne.jpg): zvýšená silueta s pokrčenými nohami. |

[Protokol a SHA archivovaných souborů](../../verification-evidence/remote-jump-20261012/review.json) odděluje skutečné obrazové soubory/indexy od rootem hlášených vstupů, pozic a výsledků konzole. Finální browser kontrola hlásila boot `ready`, render chyby 0 a konzoli bez warning/error. SDK proces skončil 07:21:47.594 UTC s exit 0 a `socketLeft=true`; prohlížeč pak ukázal jednoho účastníka. Raw SDK stdout ani per-frame grounded/stínová telemetrie se v dodané cache nenacházely a nejsou zpětně vymyšlené. Milimetrové odstupy bot a přesný první kontakt proto zůstávají důkazem CPU regresí, nikoli těchto screenshotů.

## Meze a praktické QA

- Jde o 20Hz autoritativní vzorkování s interpolací, nikoli rekonstrukci přesného okamžiku fyzikálního kontaktu mezi zprávami. Medium aktualizuje artikulaci po 1/30 s; při 60Hz iteraci se změna nohou může projevit o jeden snímek později než samotná poloha/stín.
- Podlahové dotazy vidí aktuální klientskou kolizní scénu, nikoli historický rollback pohyblivého vozidla. U nedostupného povrchu callback poctivě vrací `undefined` a zůstává původní aproximace. Průběžný vzdálený krok na schodech stále nemá lokální plný terénní IK.
- Far proxy sleduje skok kořenem a skrývá kontaktní stín; nemá artikulovanou skokovou pózu. Ztracené/chybějící příznaky nevymýšlíme z vertikálního pohybu.
- Dílčí GPU kontrola výše pokrývá pouze Eli a vybrané blízké/vzdálené snímky. Sam, skutečný Shift sprint, nepřetržitá plynulost kroku a přesný čas/poloha kontaktního stínu nejsou tímto GPU archivem uzavřené. Vzdálené snímky jsou malé a místy zakryté autem.
- Vývojová scéna nemá úplný produkční source snapshot. Screenshot burst ovlivňuje okamžitá FPS v HUD; tato čísla nejsou benchmark ani potvrzení 60 FPS. Produkční freeze a GeForce přejímka zůstávají samostatně otevřené.
- CPU kontroly nejsou FPS měřením a neprokazují 60 FPS na GeForce.

## Freeze SHA-256

`client/game.ts` zahrnuje také rootovy dříve existující kamerové a benchmarkové změny; tento úkol měnil pouze avatar presentation. Všech pět níže uvedených otisků bylo při následné archivaci znovu ověřeno a shodovalo se se zdroji původní GPU kontroly. Zachycují historický kontrolovaný stav, nikoli budoucí změny nebo celý produkční snapshot.

| Soubor | SHA-256 |
| --- | --- |
| `client/game.ts` | `77c79081ab1cdb368c1aca022963060a34ca20779b014c0fc70ba141ce12cd66` |
| `client/animation.ts` | `19346ab0af5e6550c154844f87313df6b99c46f51e636cb2e6b7e2e5e7211570` |
| `shared/netcode.ts` | `d1cb306091462adac6181bd8ba08865eec86f103bf794ba38dd249bc73c3465e` |
| `tests/remote-jump-animation.test.ts` | `3848ac10d82f38691c0814fb0990134732ea3bf1c7dd3821b7f33a19c3863541` |
| `tests/helpers/remote-jump-fixture.ts` | `15d76417c9f3960c24e1fdbd2ee36254ad33c2e516b5e3ae0954b78a7783edbe` |
