# Pozemní rozběh a obraty — 12. října 2026

Úzká oprava `AvatarAnimator` ve worktree `visual-quality-jump`. Navazuje na opravené místní i vzdálené skoky; nemění Game, kameru, síťový kontrakt, fyziku, model ani materiál.

## Skutečná příčina špičky

Známých 61 m/s z předchozí skokové regrese nebylo chybou měření. Zopakovali jsme původní Rapier/KCC klip `run`, `jumpTick:108`, `turnAtTakeOff:true`, preset Sam, se vzorkováním 144 Hz. Zkoumaný úsek 1.0–1.7361 s je celý **před skokem**; chyba nastává při pozemním rozběhu a otočení z původního směru na +X.

V čase **1.256944 s** přechází levá noha z fáze 0.99455 do 0.00530, tedy ze švihu do opory. Její světový kotník přeskočí z přibližně `(111.9964, −3.1030, 12.4471)` na `(112.2975, −3.1078, 12.1191)`: **0.4453 m za jediný vzorek**. Maximum je 64.1195 m/s ve světě a 61.0902 m/s v prostoru kořene. Kořen přitom pokračuje v běžném fyzikálním pohybu.

Původní švih si uložil vzdálený cíl při ještě natočeném těle. Při přechodu do opory ale solver tento skutečný konec švihu zahodil a vytvořil nový teoretický bod podle nynějšího yaw a délky kroku. Body se při prudkém otočení lišily o desítky centimetrů. Nezávislá kompozice lokálních TRS po hierarchii rigu souhlasila s Babylon world matrix do **8.95 µm**; přesun tedy není artefaktem cache či výpočtu lokálních souřadnic.

Zdroj animace před opravou měl SHA-256 `19346ab0af5e6550c154844f87313df6b99c46f51e636cb2e6b7e2e5e7211570`. Reprodukce a výřezy stavů před/po jsou v `.cache/ground-turn-20261012/audit.ts`, `before.json` a `final.json`.

## Cílená změna

- U švihu se uchovává poslední plánovací yaw a příznak, zda se tělo během tohoto švihu otáčelo. Směrově změněný švih průběžně přizpůsobuje vodorovný cíl aktuální délce kroku a plynulému natočení těla. Při nové změně směru znovu změří předpokládaný povrch.
- Při jeho přechodu do opory se vychází ze skutečného posledního cíle kotníku po řešení IK. Z něj se jednou odečte předchozí odvalení podrážky, čímž vznikne pevná podpora. Ta během stance neklouže k jinému cíli.
- Rovné švihy zachovávají původní plán povrchu i přechod do opory. Tím se oprava prudkého otočení nerozšiřuje do ověřeného řešení přímé chůze a schodů.
- Jde o dva skalární údaje na chodidlo; reset je součástí existujícího resetu kontaktů. Nevznikl další seznam, registr, observer, alokace po snímcích ani GPU zdroj. Lokální/remote airborne větev, touchdown callback a jeho avatarová cache zůstávají zachované.

Samotné převzetí starého cíle bez přesměrování švihu by nechávalo podporu příliš daleko od kyčle. Naopak plošné přepočítávání všech kroků měnilo schodovou predikci. Konečná změna je proto omezená na skutečně směrově změněné švihy; původní přísnost podpory a ostatní regresní testy zůstaly zachované.

## Důkazy a kontroly

Stejný původní předskokový klip po opravě: **maximum 10.8389 m/s ve světě, 6.2152 m/s v prostoru kořene**, nezávislé FK se shoduje do **10.33 µm**. Toto je srovnání stejného konkrétního úseku a stejného rigu, ne obecné měření lidské biomechaniky ani FPS.

Nová [KCC fixture](../../../tests/helpers/ground-turn-fixture.ts) používá jednu počáteční pozici, skutečné vstupy a Rapier krok, bez přímého řízení kořene. [Regrese](../../../tests/ground-turn-animation.test.ts) kontroluje celé pětisekundové klipy včetně zastavení:

| Scénář | Preset / aktualizace | Maximum světové rychlosti kotníku | Největší posun při vstupu do opory | Největší odchylka skutečného kotníku od podpůrného cíle |
| --- | --- | ---: | ---: | ---: |
| Pozemní rozběh do +X z původního směru | Sam / near, 144 Hz | 15.315 m/s | 8.83 mm | 10.72 µm |
| Následný obrat o 90° za pohybu | Alex / near, 60 Hz | 15.889 m/s | 12.38 mm | 8.85 µm |
| Obrat o 180°, skutečný vstup `run:true` | Eli / medium, 30 Hz | 24.230 m/s | 17.31 mm | 6.17 µm |

Tyto maximální rychlosti zahrnují celé klipy, proto se první řádek liší od omezeného předskokového srovnání. Regrese ověřuje skutečnou FK kotníku a délky segmentů, správný směr kolena, nepřevrácené nohy, neměnnou polohu kořene a pevnou podporu během aktivního stance. Po dokončení idle settle připouští pouze 20µm odchylku podpory kvůli pozorovanému mikrometrovému pohybu KCC a reprezentaci world matrix; během aktivní opory se podpora nepřesouvá.

Finální cílený příkaz:

```text
tsx --test tests/ground-turn-animation.test.ts tests/animation.test.ts tests/locomotion-quality.test.ts tests/jump-animation.test.ts tests/remote-jump-animation.test.ts
```

**25/25 PASS, exit 0**, 9.884 s. Běh zahrnuje původní start/stop regrese, skutečné podrážky na rovině, svahu a schodech, všechny stavby těla, původní místní skoky a vzdálený 20Hz→60Hz/30Hz řetězec. Původní schodový KCC klip zachoval maximum 12.124577 m/s a odchylku podpory 7.38 µm. Cílený TypeScript: **exit 0**. `git diff --check`: **exit 0**. Logy: `.cache/ground-turn-20261012/targeted-final.log` a `typecheck.log`.

GPU ani Blender tento úkol nespouštěl. Samotná FK a číselná kontinuita nepotvrzují konečný vizuální dojem rychlého obratu. Root má ve skutečné hře ověřit rozběh do strany z klidu, změnu směru o 90°/180°, zastavení a navazující skok — u near a medium. Očekávaným výsledkem je odstranění bočního přeskoku boty při navázání opory. Prudký sprintový obrat stále představuje rychlý stylizovaný pohyb; není deklarován jako motion-capture realistická chůze.

## Budoucí SDK QA

Pouze pracovní `.cache/remote-jump-qa/driver.ts` nyní posílá `run:true`, pokud skutečně vysílá směrový vstup. Událost skoku loguje odpovídající `kind` a `run`, takže dosažený kraj trasy se nevydává za běh. Dříve archivované screenshoty, důkazy a SHA se neměnily: ty zůstávají walking/moving kontrolou se starým `run:false`. Upravený driver zde **nebyl spuštěn**.

## Freeze SHA-256

| Soubor | SHA-256 |
| --- | --- |
| `client/animation.ts` | `bc891ff99e5626866f1d5dcb48031ee540baec82ac8622e08c5938ae6c6e548d` |
| `tests/ground-turn-animation.test.ts` | `da30bbdc0c76a5a08c9327a46332f792e4ef4beebee5cb6434b7ec70d7ab9b3a` |
| `tests/helpers/ground-turn-fixture.ts` | `925b2b8a52ae1b2a50150faef8f6ba77130393a0231e4e9a90f1c20e078d06f7` |
| pracovní SDK driver | `8e0ef8bb7f92dea8cc044964e27fcef60ee25ac097d1dd7acde91aa72def8c79` |
