# Závěrečné rozhodnutí o syntax cache

Plán uložen před měřením 3. 11. 2026, po procesním commitu `4264b964af75d48be993671985d7ffa138af0e9a`. **Kandidát se nepřijímá pro výchozí zapnutí.** Uspěl pouze jeden ze dvou ON startů. Implementace v4 a opt-in zůstávají zachované, výchozí stav je OFF. Původní plán níže se podle výsledků nemění.

- **Problém:** příprava celé hry opakovaně překročí původní časové limity; přínos CPU cache dosud není potvrzený ve skutečném startu.
- **Hypotéza:** C7 narážel na kapacitu cache. Oba ON běhy dosáhly16 entries a2096923 textových jednotek (limit2097152), se stovkami evikcí. Zvětšení kapacity může zlevnit opakované parsování; samotné čítače příčinu timeoutu neprokazují.
- **Změna:** jediný nový build, cache ON s limity32/4194304/65536/16384 versus OFF; native algoritmus v4, všechny varianty, readiness a30/90s limity beze změny. Účetní jednotky nejsou heap bajty.
- **Metrika:** klientský čas `mode-change(multi)` → `game-ready`, podpůrně jednotlivé quality fáze, cache counters a systémová telemetrie. Příprava ani idle cadence nejsou gameplay FPS.
- **Správnost:** main, skutečný Edge/WebGPU, Medium/CSS1280×720, stejná QA weather fixture, plná hra/HUD; shodné dokončené quality varianty, žádné render/asset faults. Žádný build či test během GPU. Poslední úspěšný ON doplní dva SDK peers a tři10s vzorky s obrazovou kontrolou, pokud je dosaženo ready.
- **Přijetí:** pevné pořadí ON1/OFF1/OFF2/ON2. Pro tvrzení o zrychlení a výchozí zapnutí požadovat všechny čtyři úspěšné starty, ON alespoň o10% rychlejší v obou sousedních párech a funkční vizuální/MP ověření. Jde o předem zvolený praktický práh, nikoli statistickou významnost. Timeout se uchová jako platný neúspěch; procenta z useknutých časů se nepočítají. Povolena nejvýše jedna náhradní ON/OFF dvojice výhradně pro doloženou vnější chybu/selhání sběru. Při nesplnění zůstane cache výchozí vypnutá a kandidát se uzavře jako nepřijatý/neprůkazný, bez dalšího zvětšení nebo nového kernel výzkumu.

C7 předchozí průzkum: ON1 timeout, OFF1 timeout, OFF2 timeout, ON2 ready; příprava úspěšného ON2 55,548s. Chybějící finální cleanup a mezera systémové telemetrie nedovolují prohlásit celou C7 kampaň za úplný ověřený profil. Její pozitivní i negativní záznamy zůstávají zachované.

## Výsledek C9

Build/source/test SHA `157e275e124aa354b242d13db2baf521b1b37f6383a4f2ab33475bc1d668cfb1`, main po `b5058f62` + vymezený cache WIP. [Souhrn a SHA archivů](final-results.json) obsahuje59 souborů: úplné diagnostiky, systémové vzorky, plány, cleanup, benchmarky, identitu buildu a validační logy. Archivovaný C8 se po opravě monitoru nepřepsal; GPU série proběhla pouze v C9. [Archivátor](archive-final.mjs) ověřil gzip roundtrip, sekvence a společnou identitu.

Edge156 na Windows, skutečné WebGPU/NVIDIA Pascal; systémový sampler identifikoval GTX1060/6144MiB. Windows inventář po běhu: ovladač32.0.15.8228. Předherní cadence ON1 142,9Hz, OFF1 144,9Hz; OFF2 ji označil za nestabilní (medián7ms,p9513,8ms). To není herní FPS ani důkaz příčiny timeoutu. Browser/driver cache nebyly vymazané a takty nebyly zamčené.

| Pokus | Výsledek | Low příprava | Zaznamenané Low fáze | Poznámka |
| --- | --- | ---: | ---: | --- |
| ON1 | timeout | 31,371s | 12 | Platný preflight, nedokončené `day-0-on`. |
| OFF1 | timeout | 30,252s | 6 | Platný preflight, nedokončené `night-0-on`. |
| OFF2 | timeout | 31,229s | 13 | Nestabilní předherní cadence; omezená srovnatelnost. |
| ON2 | Game.ready | 27,762s | 15 | High23,673s, Medium3,617s; všechny požadované průchody. |

Počet fází zahrnuje i poslední zahájenou neúplnou fázi. ON2 měl klientský startup **78,6774s**, přesně `85684,8 − 7007,4ms` od `mode-change(multi)` do `game-ready`. Samotná příprava kvalit trvala55,0523s. `startupObservedMs` v monitoru je jiný interval od přijetí prvního logu; jeho popis se nepřenáší na klientský čas. Proti useknutým OFF timeoutům se procento zrychlení nepočítá.

ON2 měl912 požadavků,615 hits,181 evikcí a peak4193157/4194304 účtovaných textových jednotek. Zvětšení kapacity tlak neodstranilo, ale čítače neurčují jeho příčinný podíl na celkovém čase. Výstup WGSL/bindings kryjí native parity testy; tento experiment není důkaz univerzálního zrychlení nebo regresivity cache.

Náhradní dvojice nebyla využita: nahrazení omezeného OFF2 nemůže odstranit platné selhání ON1, které už porušilo předem stanovenou přejímku. Další zvětšování cache se v této etapě neprovádí. Běžná hra zůstává na OFF; další výkonový zásah potřebuje vlastní konkrétní příčinu a přejímku.

## Omezená herní kontrola

V úspěšném ON2 byli připojeni dva skuteční SDK peers s různými avatary; celkem3 hráčské relace, ne3 lidé. Medium, target60, CSS i interní render1280×720, pevný denní/podzimní QA náhled a stejná kamera. Nastavení zůstalo při vzorcích otevřené. [Snímek mezi vzorky](final-artifacts/three-player-medium.jpg) zachycuje plnou hru/HUD; panel překrývá část scény.

| Vzorek | FPS | p95 snímku | p99 snímku |
| --- | ---: | ---: | ---: |
| 1 | 24,1 | 66,6ms | 102,9ms |
| 2 | 23,1 | 66,7ms | 101,2ms |
| 3 | 22,5 | 68,6ms | 224,4ms |

Každý vzorek trval přibližně10s, měl3 avatary a nulové render/asset chyby. Toto není důkaz60FPS, rozdílu proti OFF ani dlouhodobé stability. B6, auto a noční trasa nejsou dokončenou přejímkou této kampaně. GPU čas průchodu a celokaretní telemetrie mají odlišný rozsah; z procenta vytížení se diagnóza nevyvozuje.

Všechny4 běhy mají potvrzený cleanup a revalidaci vstupů; poslední také peers cleanup. Sampler v každém skončil na vlastním STOP. Vlastní Edge karta zavřená, viewport resetovaný a porty2568/4179 volné; Docker8080 zachován.

## Ověření kódu a omezení

Native/controller/Game/lifecycle70/70 PASS. Úplná sada3029:3023PASS/1FAIL/5SKIP (29min17,7s); nezměněný PDF timeout test selhal na cancelled0vs1 a izolovaně1/1prošel. Dříve nestabilní blind authority test tentokrát prošel. Původní FAIL se nepřeznačuje na PASS. Produkční build včetně TypeScriptu a SDK integrace PASS; první build odhalil chybějící typový kontrakt přímého `.mjs` importu testu, opraven runtime importem podle existujících harness testů. Poslední úpravy monitoru zvlášť20/20 + scoped TypeScript, harness3/3; následný neměnný C9 build PASS. Nezávislé review cache integrace bez blockerů, kontrola závěrů potvrzuje nepřijetí. Zelená celoprojektová ani kompletní GPU/FPS přejímka se netvrdí.
