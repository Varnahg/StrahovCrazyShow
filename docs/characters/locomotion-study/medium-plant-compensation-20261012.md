# Opora chodidel mezi medium aktualizacemi — 12. října 2026

Samostatná oprava pozemní opory navazující na [grounded-turn opravu](ground-turn-20261012.md). **Neřeší prudký švih při sprintovém obratu o 180°**; jeho původní chybný obraz i číselné důkazy zůstávají zachované.

## Reprodukce a příčina

Rootův GPU náhled Alex / reverse180 / medium / run:true ukázal dvě odlišné věci:

1. Při pohybu kořene mezi aktualizacemi 30Hz pózy se podpírající noha přesouvala spolu s kořenem. Skutečná chyba vůči uloženému světovému cíli dosahovala **19.485 cm při 144Hz iteraci**, **11.691 cm při 60Hz iteraci**. Při úplné IK aktualizaci se vracela na jednotky mikrometrů.
2. V kroku 269 se pravá, **nepodpírající** noha přesunula o **0.749982 m**. Původní údaj 107.997469 m/s dělil tento pohyb interním krokem 1/144 s, přestože medium póza měla akumulovaných 0.034722 s. Průměr mezi skutečnými pózovými aktualizacemi byl 24.755375 m/s. Přepočet metriky neodstraňuje skutečný přeskok.

První problém je způsoben držení lokálních transformací při plynule se pohybujícím kořeni. Druhý souvisí navíc s prudkou změnou směru cíle rozběhnutého švihu. Rootovy důkazy jsou zachované v `.cache/ground-turn-qa/root-review/`; původní servírovaný modul v `preview-v1-served.js.txt`, přesná reprodukce v `medium-audit-1.json`.

## Integrovaná kompenzace

`AvatarAnimator.compensatePlantedFeet(position)` znovu promítne pouze stávající podpírající nohy vůči aktuálnímu kořeni. Neposouvá oporu, gait phase ani předchozí vzorek pohybu, neplánuje nový krok a nemá terénní callback. Používá jednu znovupoužívanou stavovou strukturu na animátor a existující quaternionové pracovní proměnné; mezisnímek nevytváří nový objekt, pole, observer ani zdroj vykreslení.

Game jej volá jen při současném splnění všech podmínek: viditelný artikulovaný **medium**, nulový pravidelný animation delta, kladný snímkový čas, explicitní grounded:true a žádné vozidlo. Near, far, hidden, neznámý kontakt a let zůstávají na původních cestách. Animátor navíc odliší tři výsledky:

- `skipped`: neinitializovaná/resetovaná/disponovaná/skrytá postava, let, vozidlo, žádná opora nebo velký skok kořene. Nevynutí aktualizaci.
- `compensated`: podpory jsou dosažitelné, případně při bezpečném snížení pánve v původním rozsahu. Přepočítají se jen příslušné nohy.
- `unreachable`: původní opora by vyžadovala překročení délky nohy nebo spodního limitu pánve. Neprotahuje se noha, nesnižuje se limit a nemaže se příznak opory jen kvůli testu.

Při `unreachable` Game spotřebuje **pouze již akumulovaný čas** přes `AvatarLodController.flushAnimationDelta()` a provede obyčejný úplný update. Ten může korektně ukončit příliš dlouho drženou stance. Druhý flush vrátí nulu. Far, hidden, near a disposed controller nic neodevzdají. Běžná cadence bez tohoto případu se nemění; při 144Hz iteraci původní threshold 1/30 s znamená pět kroků na pózu, přibližně 28.8 aktualizace/s.

Tato výjimka byla nutná v širší regresi: v t=3.465278 měl Alex podporu 0.6926 m za kořenem. Původní pelvis minimum 0.615 dovolovalo o přibližně 1 cm méně poklesu, než potřeboval přesný dosah. Pouhé odmítnutí kompenzace nechalo chybu 4.85 cm; její ignorování nebo rozšíření povoleného dřepu nebylo přijato. Včasná úplná aktualizace využije skutečný uplynulý čas a krok uvolní. Změna je stále vizuální; fyzika a kořen se nemění.

## Skutečné regrese a cena

[Nové testy](../../../tests/medium-plant-compensation.test.ts) používají skutečný Game avatar presentation helper, produkční LOD/rig a Rapier KCC klip. Pro oba presety Alex/Eli porovnávají původní callback s integrovanou cestou při 60/144Hz aktualizaci kořene.

| Iterace kořene | Původní chyba opory | Integrované maximum Alex / Eli | Úplné aktualizace za 5 s | Z nich vynucené dosahovým limitem | Dotazy terénu před / po |
| --- | ---: | ---: | ---: | ---: | ---: |
| 60 Hz | 0.11691 m | 6.82 / 8.42 µm | 150 / 150 | 0 | 22 / 22 |
| 144 Hz | 0.19485 m | 12.05 / 10.71 µm | 144 / 144 | 2 | 22 / 22 |

U 144Hz případu se dvě aktualizace posunuly dříve; celkový počet se v tomto klipu nezvýšil. Součet spotřebovaných intervalů a zbývajícího akumulátoru je přesně 5 s. Dotazy zahrnují úvodní usazení a nejsou novými dotazy kompenzace. Ověřeny jsou pevné cíle opory, zachované délky segmentů, bezpečná pánev, přechody LOD, reset/respawn, teleport, neznámý kontakt, vozidlo, let, skrytí, disposal a opakované použití stejné pracovní struktury. Testy zachovávají otevřený velký delta u nepodpírající nohy.

**42/42 cílených testů PASS**, exit 0, 12.798 s. Sada zahrnuje nový test, `avatar-lod`, `ground-turn-animation`, `animation`, `locomotion-quality`, `jump-animation`, `remote-jump-animation` a `local-avatar-presentation`. Runtime i cache QA scoped TypeScript: **exit 0**. Původní tolerance nebyly zvýšeny. Logy jsou v `.cache/medium-plant-compensation/`.

Nové nativní CPU srovnání po zahřátí použilo pět střídavých opakování, stejný KCC klip a produkční remote semantics. Měřilo animaci a dvě native foot world-matrix evaluace, bez `scene.render`, GPU a zbytku klienta:

| Iterace / počáteční LOD fáze | Původní callback | Cache prototyp | Integrovaná metoda |
| --- | ---: | ---: | ---: |
| 60 Hz / 0 | 0.004411 ms | 0.004461 ms | 0.004840 ms |
| 144 Hz / 1 | 0.003350 ms | 0.003358 ms | 0.003253 ms |
| 144 Hz / 0, dva dřívější updaty | 0.002747 ms | — | 0.003889 ms |

Jsou to mediány na jednu iteraci jednoho avatara. Rozptyl krátkých běhů se překrývá; například zdánlivě nižší integrovaný medián ve druhém řádku není důkaz zrychlení. Úplné vzorky, rozsahy a počty dotazů jsou v `cadence-profile.json`. **Mikrosekundy nepřevádíme na FPS ani na záruku celkového klientského výkonu.**

Cache komponenta nyní používá stejnou kompenzaci i flush a hlásí `compensatedFrames`/`forcedPoseTicks`. Nový explicitní vstup je `http://127.0.0.1:5190/.cache/ground-turn-qa/index.html?qa=compensation3`. Metriky oddělují změnu polohy po snímku, průměr mezi aktualizacemi pózy a chybu opory. Agent neotevíral GPU scénu; praktické posouzení této integrace provádí root.

## Oddělený otevřený sprintový švih

Čtecí trace `redirected-swing-trace.json` potvrzuje, že samotné zvýšení cadence nestačí. Při every-render 144Hz, Alex/reverse/run:true, je v t=**1.847222 s** špička **41.2681 m/s**. Tělo za 6.944 ms otočí yaw o **−0.28955 rad**. Pravý švih je již v 65.14 % průběhu, po easing má váhu **0.72017**. Jeho plánovaný endpoint změní XZ o `(−0.1851, +0.3841)` m.

Příspěvek této změny endpointu ke kotníku je `(−0.1333, +0.2766)` m; postup fáze přidá `(+0.0822, +0.0051)` m. Výsledný pre-IK XZ posun je `(−0.0511, +0.2817)` m a skutečný kotník urazí přibližně **0.2866 m**. Nový endpoint tedy okamžitě dostává vysokou váhu starého, již pokročilého švihu. Nejde o pohyb podpírající nohy a tato integrace jej záměrně nevydává za opravený.

Nejmenší navržený další ověřitelný krok je omezit změnu **světového XZ cíle jen u přesměrovaného grounded švihu**, vzhledem k poslednímu skutečně vyřešenému cíli, podle uplynulého času a obvyklé rychlosti švihu odvozené z gait duty/speed. Zachovat dosahový solver, skutečné navázání opory a původní rovné schody i skoky. Návrh zatím není implementovaný ani prohlášený za vizuální PASS; 30Hz vzorkování nepodpírající nohy navíc zůstává samostatnou prezentační hranicí.

## Freeze SHA-256

| Soubor | SHA-256 |
| --- | --- |
| `client/animation.ts` | `731e47e04d2f02fab21c7d71b2a0abe1f51efe330d4281f6c69a90081a04f9a6` |
| `client/avatar-lod.ts` | `a101cbeae2e28d472de28004018cc1e1f4f8441dc6bb35ae881029ed8fbdea34` |
| `client/game.ts` včetně rootových dalších změn | `15a0128d3b821fa15543cf1548c1e4467843e24470ae22fdb67c3044df4f37a0` |
| `tests/medium-plant-compensation.test.ts` | `f68490a84b637077759a217bdc5d5a32ed41f3a3fe3a1fe601dfa45273ea00b6` |
