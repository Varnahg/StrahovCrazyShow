# Oprava vzdáleného lemu auta — 11. října 2026

Opravený je jeden původní lem `Rolled fender lip.003` v části `Body:paint`
vzdáleného LOD. Jeho 129 trojúhelníků nahradilo 204 trojúhelníků odvozených
z původních profilových řad. Celé far auto má **9277 trojúhelníků místo 9202**
(+75; +0,815 %), nadále 26 částí a stejné materiály. Žádný nový draw call,
textura, kolize ani změna near/medium se nepřidává. Výkon GPU tímto auditem
nebyl změřen.

Zdroj je zachovaný [CC0 model Innerscene](https://www.innerscene.com/tools/library/3d-parts/blue-five-door-compact-hatchback-5b95b2a0),
SHA `107410e01453abbce452fabbe6d51436fb98a0920672643a893263a8861873d7`.
Analýza zdrojové geometrie a reprodukce proběhla 11. 10. 2026. Nejde o nový
fotogrammetrický podklad ani zaměření konkrétního strahovského auta. Rozměry
nadále používají dříve přijatou normalizaci na herní fyzikální obálku.

## Proč nestačila výměna diagonály

Původně izolovaný návrh měnil jen čtyři indexy trojúhelníků 847/848 a zachoval
orientovaný obvod. Rozšířené paprsky však odkryly skutečnou zdrojovou plochu,
nikoli legitimní otvor podběhu. Tento návrh `c96516db…` byl zamítnut a není
v runtime. Konkrétní negativní příklad je nyní trvalý regresní test: paprsek
z `(-1.1270194441, 0.4643803537, -1.3968712240)` ve směru `(1,0,0)` zasahuje
původní source lip triangle 67, ale diagonální kandidát mine celé auto i
oboustranně. Nezměněný obvod nebyl dostatečný důkaz zachování povrchu.

Úplný lem tvoří samostatné far trojúhelníky **830–958** bez sdílených indexů
nebo geometrických poloh s jinou součástí. Jeho původní zdroj má 49 úhlových
řad po osmi bodech profilu. Oprava zachovává řady 0, 4, …, 48, všechny body
profilu a přesně původních 12 koncových trojúhelníků. Nové tětivy mezi těmito
řadami jsou výslovně aproximace LOD; nejde o tvrzení, že všechny nové
trojúhelníky mají stejnou konektivitu jako plný zdroj. Každý nový roh přebírá
přesnou původní normalizovanou polohu, UV a normálu z přijatého near exportu.

## Praktické ověření

- Uzavřený lem: 104 geometrických vrcholů, 306 hran, 204 trojúhelníků, Euler 2.
  Každá hrana má dvě opačně orientovaná použití; žádná degenerace.
- 34 272 lokálních paprsků: celé auto i paint, sedm vnějších směrů a jejich
  opačné směry, s cullingem i oboustranně. Žádný nově chybějící zásah, který
  obsahuje odpovídající původní source povrch. Tři ztracené paint zásahy ve
  vnějším pohledu jsou podle source skutečně prostor před pneumatikou.
- Na 5460 vzorcích plného lemu klesla největší vzdálenost source → far
  z 11,14 mm na 3,40 mm. Opačný směr má maximum 3,11 mm. Jsou to vzorkované
  vzdálenosti, nikoli certifikovaná spojitá Hausdorffova mez. Obálka zdrojového
  lemu je shodná ve všech třech osách.
- Skutečný editable master, jeho nové otevření a celý LOD generátor/export:
  **1890 paint trojúhelníků, nula neshod** všech indexovaných rohů
  POSITION/NORMAL/UV i transformací uzlů/předků.
- Zachováno 106 ostatních binárních buffer views, všechny ostatní části,
  PBR, embedded image bytes, kola, originální podklady a near/medium.
- Cílené testy: **18/18 PASS**, `pnpm exec tsc --noEmit` PASS.
  NullEngine v importních testech ověřuje strukturu, nikoli GPU výkon.
- Po doplnění ochrany neplatného source payloadu znovu prošly čtyři testy
  samotné opravy. Samostatná TypeScript kontrola review stránky a syntaxe
  Python helperů prošly také.

Blender běžel výhradně background s dvěma vlákny, bez renderu. Master save
a reopen: 20:59:34–20:59:58 UTC. Celý finální generátor:
21:04:51–21:05:03 UTC; poslední ověřovací reopen skončil 21:05:45 UTC.
Přesná okna a protokoly jsou v [důkazech](vehicles/far-fender-evidence/).

## Reprodukce a životnost podkladů

`scripts/repair-car-far-source.mjs` čte nezměněný original source a near GLB,
ověří SHA i přítomnost všech 780 původních source trojúhelníků v near a vybere
rohy profilových řad. `repair-car-far.mjs` obnovuje pouze tento lem po běžném
wheel repacku. `car-far-fold-repair.py` používá totožný recept v editable LOD
generátoru. Změny ve `create-car-lods.py` a `build-car-wheel-pack.mjs` proto
přežijí další odvození.

Editovatelný mesh je sestaven z nových, zkontrolovaných bufferů. Přímá mutace
původní nativní loop cache před přenastavením normál vedla k pádu Blenderu;
proto ji nový helper nepoužívá. Původní dekódované normály jsou uložené přesně
jako podporovaný `custom_normal` FLOAT_VECTOR/CORNER. Je to změna jejich
interního uložení v masteru; ověřené exportované normály okolních ploch se
nemění. Materiály, pojmenované objekty, transformace a packed images souhlasí;
nevzniká nutná závislost na `.cache` ani externí knihovně.

Historický far master se již před touto opravou lišil v `Body:black` od
nového odvození přijatého near masteru. Proto integrovaný far master vznikl
přímou opravou původního far masteru. Kontrolní nezměněný generátor tento
dřívější rozdíl doložil; nový helper sám žádný další rozdíl okolních částí
nevytváří.

Finální far GLB: `1ccf7c893b6ecddc0be58ca61fd8edd2b5a746eddcc5a1adcf42a3575f6d8bdc`.
Finální far master: `386e3a8cec5470fcc8a93a74ba38b869f7647887fa7fd49b9d6099105f35daa1`.
Podrobnosti: [aktuální audit](vehicles/far-fender-repair-audit.json),
[nezměněné soubory](vehicles/far-fender-evidence/preservation-guards.json).

## Vizuální přejímka a otevřené případy

Root provedl GPU přejímku tohoto lemu: vnější/detailní a potvrzený vnitřní pohled far, srovnání
near/medium ze stejné kamery a následné far s pohybem kol. Model byl připravený,
9277 trojúhelníků, 26 částí, čtyři pivoty a nula hlášených chyb. Použitý
kontext byl Intel UHD 630; nejde o GeForce FPS měření. [Snímky a GPU protokol](verification-evidence/vehicle-far-repair-20261011/)
ověřují tento lem, nikoli ostatní hrubá zjednodušení far modelu.

Vnitřní pohled byl výslovně zopakován 11. 10. 2026 ve 21:41:20.595 UTC:
[potvrzený snímek](verification-evidence/vehicle-far-repair-20261011/fender-far-inside-confirmed.png)
a pole `inside` v [GPU protokolu](verification-evidence/vehicle-far-repair-20261011/component-gpu-review.json)
mají načtený a připravený far model a kameru
`(-0.35, 0.4988000000000001, -1.39)` namířenou na `(-0.977, 0.4988, -1.39)`.
Původní DOM odečet po 500 ms ještě obsahoval předchozí detailní kameru
X = −1,65; zůstává zachovaný jako `insideStaleReport` a nedokládá vnitřní
pohled. `insideCorrection` vysvětluje nové přímé otevření této kamery.
SHA-256 potvrzeného snímku je
`978960c3a81c87a08b33ae218ccfc9f4740ecc0aaa1ac57065a6cd19f26f8d2f`,
protokolu s uchovaným starým odečtem
`47eb67864187367c878eb1da12da1391b5280b4b8ebd8bb37b565372cb7005bf`.

Opakovatelná review scéna je
`http://127.0.0.1:5190/docs/vehicles/preview.html?model=far&view=fender`.
`view=fender-close` a `view=fender-inside` nebo viditelná tlačítka volí stejné
zdokumentované kamery. Přepnutí near/medium/far kameru nemění. Stats ukazují
skutečný načtený model, SHA, počet trojúhelníků a polohu kamery. Scéna je
pravotočivá; car root má pouze posun Y −0,0112 m, bez zrcadlení. Celá hra
a výkon mají samostatnou přejímku.

Historické coarse far-body nálezy (22 caliper misses, samostatné liner/lip
misses a recesses) se tímto neprohlašují za uzavřené ani za současný počet
vad. Oprava tohoto konkrétního lemu je samostatná od těchto starších sond.
