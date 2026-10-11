# CPU rezerva bez snížení kvality světa

V Rapieru 0.21.0 jsme našli zbytečný průchod všemi fyzikálními objekty v každém kroku. `World.step()` po vlastní fyzice hledá objekty, které mohlo vytvořit nebo odstranit trhání měkkých těles. Projde všechny rigidní objekty a kolidery a následně je projde znovu kvůli odstranění. V našem světě s přibližně 8 130 kolidery a žádným měkkým tělesem tento průchod nic nemění.

`shared/physics-step.ts` volá tutéž veřejnou `PhysicsPipeline.step()` se stejnými parametry. Pokud ve světě existuje měkké těleso, použije standardní `World.step()` včetně vyhledání nových objektů. Veřejné vytvoření a odstranění rigidních objektů spravuje obálky okamžitě; totéž dělá odstranění měkkého tělesa s jeho zástupnými objekty. Potvrzeno ze zdrojových map dodaného balíčku `@dimforge/rapier3d-compat` 0.21.0. Závislost ani její soubory se neupravují.

Nemění se 60Hz fyzika, solver, kolizní geometrie, terén, pohyb, grafické modely, materiály ani dohledová vzdálenost. V `Simulation` se mění pouze tři volání kroku světa.

## Izolované měření CPU

Referenční zdroje: neměnný snapshot H `f7741a88638c05ab2bdc52c443fdc8382d31c0dc6d1dd24e1337ce1d94cfbb14`. Alternované dvojice standardního a upraveného průchodu, 120 zahřívacích a 240 měřených kroků na opakování, stejný čas provozu a stejné vstupy. Jde o Node CPU měření, nikoliv prohlížečové FPS nebo důkaz výkonu GPU.

| Aktivní fyzikální postavy | Standardní krok, průměr | Upravený krok, průměr | Zmenšení času kroku |
| --- | --- | --- | --- |
| 1 | 1,135–1,176 ms | 0,092–0,095 ms | přibližně 92 % |
| 30 | 2,387–2,454 ms | 1,208–1,221 ms | přibližně 50 % |

Interní Rapier profiler ukázal samotnou fyziku přibližně 0,031 ms/krok, z toho broad phase 0,0036 ms. Většina původního času `World.step()` tedy připadala na obálky JavaScriptu. Vzorkování PID provozu mělo samostatně 0,035–0,062 ms/volání; jeho plošné omezování nebylo potřebné.

Neodvozujeme z tohoto měření nové FPS. Zisk musí potvrdit samostatné měření celé produkční hry, při němž tento CPU profiler neběží.

## Zachování chování

Před integrací prošlo na snapshotu H přesné porovnání 18 000 stavů postav, 600 úplných stavů auta a šesti serializovaných fyzikálních světů o velikosti přibližně 15 MB. Snímky byly shodné po jednotlivých bytech. Zahrnovalo pohyb 30 postav, vytvoření a odstranění hráče, provoz, jízdu, zatáčení, brzdění, vystoupení a skok.

Po integraci prošly tři regresní testy na aktuálním autorském světě včetně nových kolizních sítí schodišť B6:

- Standardní průchod proti optimalizovanému: přesně stejné stavy všech postav a auta, stejné kompletní serializace, změna hráče za chodu, skutečné překážky parkoviště, schodiště a provoz.
- Zatáčení, brzdění, couvání a fyzicky ověřené vystoupení z auta: stejné stavy a serializace.
- Skutečné měkké těleso `SoftBodyDesc.rope`: 30 kroků přes standardní cestu; po jeho odstranění 30 kroků optimalizovanou cestou. Všech 60 serializací zůstalo shodných a odstraněné obálky nezůstaly ve světě.

Výsledek cíleného běhu: **3/3 PASS**, 4,60 s. V prvním běhu se opravila testovací očekávaná hodnota časového kroku na přesné `Math.fround(1/60)`, protože Rapier ukládá čísla jako float32; fyzika ani tolerance se neměnila. Zdrojové hashe tohoto cíleného ověření obsahuje `evidence/physics-wrapper/current-regressions.json`. Konečné ověření celé hry a jeho snapshot patří do `docs/verification.md`.

Opakování regresí:

```powershell
pnpm exec tsx --test tests/physics-step.test.ts
```

Opakování izolovaného CPU měření na aktuálních zdrojích:

```powershell
pnpm exec tsx scripts/profile-physics-step.ts
```

Surové důkazy: `evidence/physics-wrapper/baseline.json`, `rapier-stages.json`, `candidate-proof.json` a `current-regressions.json`. Měření na nových zdrojích není automaticky měřením snapshotu H; při předání je nutné uvést příslušný hash a výsledky neslučovat.
