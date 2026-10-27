# R4 pilot ve skutečné hře — rozpracované ověření

Source snapshot `7feab98cdcec6752ae78a2a2fb80b31dda93dfd68e519d119b59be6519e9a018`, 8 739 souborů včetně testů; candidate-v3. Klient `sha256-d20b39760cdc16db8474167b9e694ee8c58bccd87060e3a21cd6914698a6c7b0`, script `index-CUS2V6I_.js`. Produkční build a izolovaná integrace PASS. V2 má 188/188 cílených CPU kontrol PASS; V3 mění pouze zúžení typu v regresi, loader 12/12 PASS. Úplná sada zůstává otevřená.

## Skutečný Edge

Edge, WebGL2, ANGLE NVIDIA GeForce GTX 1060, ovladač 582.28, 1280 × 720 CSS i render, MSAA 4. Pevná guest scéna s HUD a jedním skutečným avatarem; žádné WASD, jízda ani otáčení kamery. Nejde o multiplayerovou přejímku. Po prvním timeoutu při přípravě světla v předchozím okně nový start v uživatelem otevřené kartě dokončil preparation a měl `ready`, nula render/asset chyb. Rozdíl podporuje vliv aktivity okna, není sám měřením příčiny původního timeoutu.

Všechny následující záznamy jsou DOM JSON z uživatelského tlačítka měření, uložené beze změny v `.cache/trees-gpu-20261025/`. Datum je UTC. Stejné denní světlo 15. 7. 2026, clear DEMO a medium. Před měřením původního modelu bylo vyčkáno ustálení cloud přechodu; první okamžitý obrázek s mraky není použit jako ustálené srovnání.

| Soubor | UTC dokončení | FPS | p95 ms | p99 ms | Celkové tri | Aktivní tree tri |
|---|---|---:|---:|---:|---:|---:|
| v3-own-b5-near-summer-medium-01.json | 20:41:00.129 | 21,5 | 61,5 | 71,0 | 3 210 391 | 1 111 559 |
| v3-own-b5-near-summer-medium-02.json | 20:47:04.153 | 27,8 | 59,6 | 80,8 | 3 210 189 | 1 111 559 |
| v3-legacy-b5-near-summer-medium-01.json | 20:54:00.493 | 27,3 | 46,0 | 75,0 | 1 890 019 | 396 786 |
| v3-legacy-b5-near-summer-medium-02.json | 20:59:37.564 | 29,1 | 43,0 | 52,6 | 1 889 893 | 396 786 |

Každý záznam má stejné zdroje, kvalitu, sezonní okamžik a validní render health. Own má dva nové source trees a 108 legacy; baseline 110 legacy. Celkový počet zahrnuje stínové průchody, aktivní tree tri jsou počty enabled mesh/submesh prefixů, ne čistě GPU viditelné plochy.

## Limity srovnání

- Scéna není pixelově totožná: obyčejný Actor po idle fyzice mírně změnil X oproti nominálnímu startu −85 m. U zaznamenaných běhů jde přibližně o −84,90 až −84,75 m. Nebyla provedena korekce teleportem. Finální přesné obrazové A/B potřebuje stabilnější podporu kamery nebo samostatné vysvětlení fyzikálního driftu.
- Takty GPU nebyly vynucované a v čtecí telemetrii se měnily. Driver hlásil P5 822/810 MHz a později P3 přibližně 835/2999 MHz. Přesné FPS proto nejsou důkazem výkonu na maximálních taktech ani samotného vlivu geometrie.
- `v3-legacy-b5-near-medium-clocks.csv` je **předběžný** třicetisekundový záznam, skončil před prvním baseline intervalem. Nepřiřazovat jej jako souběžné měření tohoto intervalu. `v3-comparison-clocks.csv` je následný průběžný sampler; jeho lokální čas je podle metadat `clock-sampler.json` nutné převést na UTC a teprve potom spojit s intervaly benchmarku.
- Baseline a own nejsou srovnání počtu polygonů v izolovaném rendereru; běží celá hra. Lze doložit náklad geometrie a pozorované výsledky, zatím nikoli přesný procentní regresní dopad.

## Obrazové výsledky a další krok

Čtyři skutečné PNG `v3-own-b5-near-{spring,summer,autumn,winter}-medium.png` ukazují řidší jaro, plnější léto, okrový podzim a holou zimní kostru bez render chyb. Nezávislý čtecí audit potvrdil dlouhé olistěné pásy/ramena, rozpad velmi jemných zimních konců na tečky a malý tonální rozdíl uvnitř koruny. Z tohoto záběru nelze spravedlivě posoudit žilnatinu či kůru na několik pixelů širokých plochách; horní HUD zakrývá část obrysu.

R4 **není přijatý pro hromadné nasazení**. Následuje B6 evergreen, střední/vzdálený pohled a konkrétní R5 odvozené výhony/LOD. Je třeba zachovat fyzickou velikost listů, nikoli jejich čitelnost řešit zvětšením karet. Fotografie/atlas se nepřepisují bez doloženého materiálového problému. Závěrečná pipeline, review, commity a main integrace stále chybějí.

## Dokončení průzkumného okna

B6 own summer/medium záznam `v3-own-b6-near-summer-medium-01.json`:44,3FPS, p9528,0ms, p9931,8ms,934 670 aktivních tree tri, UTC21:06:34.057. Následný zimní PNG zachovává zelené jehličí. MTree B5 near summer/medium:24,3FPS, p9556,7ms, p9970,2ms,618 671 aktivních tree tri, UTC21:48:18.202. Je to řidší geometrická alternativa, nikoli srovnání identické vizuální kvality. Obě scény ready/bez chyb.

Skutečný mid PNG potvrzuje ztrátu hustoty původního50% leaf subsetu. Far PNG je výslovný **neúspěšný QA pohled**: stadion zakrývá cílový strom, proto z něj nebyl učiněn závěr o vzhledu LOD2. Následný audit zahrnul celý kanonický stadion i terénní průsečíky a navrhl nový bod `[-170.5,-202.5]` na service cestě. Root jej zapsal do dalšího kandidáta a12/12 CPU regresí prošlo; nový GPU obrázek zůstává otevřený.

Na konci byl NVIDIA sampler ukončen po ověření PID/commandline, testovací Edge karta převedená na about:blank a viewport resetovaný. Heavy okno bylo skutečně předáno R5 CPU modeláři. Žádná3D scéna nezůstala běžet během jeho nativních renderů.

Samostatně byl nad neměnným candidate-v4 a stejným env zopakován dříve selhavší `blind authority repair resumes none…`:1/1PASS,38,10s, log `autodev-blind-none-v4.log`. To není dodatečné označení původní celé sady za PASS ani definitivní určení příčiny; původní receipt ztratil stderr. Pro další kompletní sadu je plánované omezení workerů před globem (`--test-concurrency=2`), bez změny původních assertion.
