# Oprava astronomické noci a lokálních světel

Pro hlášenou **11. 10. 2026 02:00 v Praze** používáme skutečný okamžik **2026-10-11T00:00:00Z**. SunCalc 2.1.1 dává Slunce −43,9162°, Měsíc −50,2433° a osvětlenou část Měsíce 0,254 %. Obě tělesa jsou pod obzorem. [USNO](https://aa.usno.navy.mil/calculated/moon/phases?date=2026-10-01&format=p&nump=6) uvádí nov 10. 10. v 15:50 UTC; [SunCalc](https://github.com/mourner/suncalc#sun-position) vrací výšky ve stupních, které shared modul jednou převádí na radiány. Astronomické pozice se při opravě nezměnily.

Příčinou světlé noci byl trvalý plošný ambient **0,28**, samosvítící mraky **0,18**, příliš světlé noční barvy a samostatné minimum 24 % v původním custom shaderu vegetace. Navíc stará materiálová studie nastavovala svou noc natvrdo na ambient 0,28 a klíčové světlo 0,06, takže vizuální studie nereprodukovala skutečný svět.

`sampleArtLighting()` nyní ve skutečné bezměsíčné noci vrací ambient **0,018 za jasna / 0,009 při zatažení**, nulové Slunce i Měsíc a emisi mraků **0,004**. Noční obloha je `#050a12` až `#101820`; soumrak plynule navazuje až na astronomickou hranici −18° podle [NOAA](https://gml.noaa.gov/grad/solcalc/glossary.html). Lunární klíčové světlo vyžaduje Měsíc nad obzorem a známou fázi, reaguje na oblačnost a nemůže z neznámé fáze udělat úplněk. Expozice zůstává omezená na 1,08–1,18, noční IBL multiplikátor je 0,04. Prudké přepnutí náhledu obnoví IBL hned, bez dvousekundového denního dosvitu.

`applyArtLighting()` vrací vyhlazený sample včetně `surfaceIllumination` pro custom vegetaci. Jasná hlášená noc dává 0,0794, zatažená 0,0561; druhý nezávislý denní/noční výpočet tak není potřebný. Místnosti a praktická světla zůstávají **simulované**; maska oken nerozsvěcuje neprůhledné stěny.

## Parkovací lampy a konzistence materiálů

Samotná OSM inventura obsahovala 36 lamp; nejbližší od počátečního bodu `(110,12)` byla téměř **110 m** daleko. Chybějící mapový bod nepovažujeme za důkaz, že lampa v realitě není. Z oficiálního ortofota IPR z **8. 6. 2024 v 10 cm/px** byly zvlášť identifikovány dvě bílé lampy jižní hrany centrálního parkoviště:

| ID                              | Základna x/z v metrech | Odhad výšky                                                      | Nejistota polohy |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------- | ---------------- |
| `ipr2024-parking-south-west`    | 60,8 / 33,5            | 5 m, typologický odhad; koruna stromu ruší sken                  | 0,8 m            |
| `ipr2024-parking-south-central` | 131 / 32               | 5 m; izolované body hlavy ve skenu 2023 dosahují 4,768 m nad DMR | 0,6 m            |

Základny jsou **interpretace fotografie, nikoli zaměření**. Údaje v [kanonickém souboru](../../shared/data/photo-lamps.json) zachovávají původní pixely, datum, zdrojové uzly a nejistotu. Oba bílé sloupy, jejich kolize a skutečná světla vznikají ze stejných `LAMP_PLACEMENTS`, celkem nyní 38. Dva nejasné kandidáty jsme nepřidali. Historický zdroj nemůže potvrdit dnešní stav všech svítidel.

Původní PointLight s intenzitou 0,7 měl na PBR materiálech výchozí inverzní kvadratický útlum, zatímco StandardMaterial používal lineární dosah. Převedený asfalt tak téměř nesvítil pod lampou, i když jiné materiály ještě světlo vykazovaly. Praktická herní světla nyní explicitně používají `Light.FALLOFF_STANDARD` s konečným dosahem **22 m**, společným pro PBR i Standard. Low ponechává nejbližší **jednu** lampu, medium/high nejvýše **dvě**; guard nezměněného stavu nadále brání opakovanému průchodu celé scény.

Intenzity, barvy i dosahy jsou **výtvarné herní parametry, nikoli naměřené lumeny, kandely nebo lux**. Hra není fotometrický výpočet osvětlovací soustavy. Globální ambient se kvůli navigaci nezvyšuje; v samotném středu parkoviště mimo dosah doložených lamp je nadále přirozeně tma. Nejbližší doložená lampa je od spawnu 29 m; nedoplňujeme kvůli spawnu neexistující světlo. Dynamické praktické lampy nemají další stínové mapy.

## Ověření a reprodukce

- [Deterministický audit](./night-lighting-audit.json) obsahuje zdrojové SHA-256, polohu Strahova, jasnou/zataženou noc a den. Opakování: `pnpm exec tsx scripts/audit-night-lighting.ts`.
- Regrese ověřují přesný okamžik, přechod soumraku, fázi a obzor Měsíce, skutečné hodnoty Babylon Scene, masky oken, lokální lampy, identické kolize, zdrojové pixely a původní hash fotografie. NullEngine je zde pouze ověření stavu/geometrie, **nikoli GPU/FPS důkaz**.
- Cílený běh osmi testovacích souborů: **38/38 PASS**, exit 0; [úplný log](./night-repair-evidence/targeted-tests.log). `pnpm exec tsc --noEmit`: **PASS**, exit 0; [log](./night-repair-evidence/typescript.log). Full suite, produkční build a integrační test jsou úlohou kořenového integračního běhu.
- [Materiálová studie](../reality-pack/art-style-preview.html) používá stejné osvětlení jako hra; tlačítka mají přesné pražské datum a čas. V odděleném IAB kontextu se skutečně vykreslilo a zkompilovalo všech devět PBR makro shaderů bez hlášených chyb. Jasná/zatažená noc byla vizuálně zkontrolovaná; výsledky a snímky jsou v [night-repair-evidence](./night-repair-evidence/). Toto GPU je **Intel UHD 630**, nikoli uživatelova GeForce v Chrome/Edge; studie nepředstavuje benchmark celé hry.
- Konečný reload studie nejprve odhalil prázdné default/PBR GLSL registry (pouze preprocesorové `#define`, 0/9 připravených shaderů). Neúspěšný stav je zachovaný jako `shader-lazy-load-failed-reload.*`. Studie následně převzala stejnou explicitní registraci `client/render-shaders.ts` jako hlavní hra; nový reload zkompiloval 9/9 a nehlásil chyby. Neúspěšný reload se nezapočítává jako úspěšné vizuální ověření.
- Původní referenční JPEG má SHA-256 `f1209447c33a3d9d951ba955c7e4d91e89a56e41bba6c084a768266dcd3d5866`; neměnná kopie i georeference jsou v `assets/reference/lighting`, takže jsou zahrnuté i ve zdrojovém snapshotu a jeho testech. Žádné pixely map nebo fotografií nevstupují jako nová herní textura.

Finální praktické hraní celé hry, příjemnost noční orientace, integrace shaderu trávy, časový údaj náhledu a měření výkonu na GeForce patří následnému integračnímu ověření. Samotná tato oprava nepředstavuje dokončení všech modelů, interiérů ani celého pilotu.
