# B6: lokální napojení venkovních schodů

`shared/data/cad-buildings/b06-entry-grade.json` obsahuje malý společný TIN pro obraz, fyziku a drapované povrchy. Aktivuje se pouze při `hasCadBuilding("53929071")`. Původní DMR se nepřepisuje a nedoplňuje se žádný schod ani skrytá kolize. Používá se native větev původního F32 DMR bez starého plošného B6 flatten0; její zapojení vlastní koordinátor v `shared/terrain.ts`.

## Podklad a odlišení interpretace

Primární podklad je původní IPR Praha, léto 2023, licence CC BY, manifest SHA `d556d38d5c32d9d039479e492d7937e2c358df90cf94f7aee232f5e1ba330d93`. Fotoagent předal `photogrammetry/b06-entry-ground.json` a `b06-approach-patch-proposal.json` v ignorované cache. Šestnáct hladkých ground hitů má normálu Y > 0,92 a leží 0,2–0,8 m za nominální první CAD frontou. Rovinný fit v souřadnicích hry je:

```text
Y = -0.03549699050745778 X + 0.12692737366010734 Z + 10.207693648697521
RMS = 0.007908568557087325 m
```

RMS charakterizuje fit těchto fotogrammetrických bodů, nikoli geodetickou přesnost. Původní source-supported maska má **0,979 m²** a zůstává samostatně uložená. Generátor ověřuje vazbu všech vybraných vzorků na původní ground hits, source triangle IDs, rovinu a placement. Nepřebírá vyšší body u prvního schodu jako hladký terén.

Koordinátor výslovně přijal variantu B: minimální konvexní oblast obsahující obálku těchto vzorků a celou první frontu. Fronta se odvozuje z `lowerCadXY`, skutečného world středu, `acrossCadUnit`, source placementu a šířky **3,86 m**; není nakreslená nezávisle ve světě. Jádro má **2,716 m²**, z toho **1,737 m²** je mimo source obálku a je označeno jako extrapolated game grade. Přijatý odhad dosahuje přibližně 0,5 m směrem k čelu ve střední části a 0,93 m na pravém šířkovém okraji. Žádná část tohoto rozšíření se nevydává za měření. Případné malé díry původní source geometrie uvnitř sample obálky mají vlastní interpolation masku; v aktuálních datech je tato maska prázdná.

## Konkrétní geometrie

Patch vlastní dvě původní 4m buňky: **X [-8,-4] a [-4,0], Z [-84,-80]**. Samotný přechod má šířku nejvýše **0,5 m**, je zaoblený a omezený těmito buňkami. Mění se jádro a přechod o ploše přibližně **7,709 m²**; zbývajících **24,291 m²** buněk zůstává původním DMR. Data mají **84 vrcholů a 158 trojúhelníků**, přibližně 13 kB. Největší úprava zdrojového vrcholu je **0,1856124 m**.

Celý sklon source roviny zůstává v jádru zachovaný. Výšky roviny na první frontě vlevo / uprostřed / vpravo jsou **0,1608883 / 0,0587726 / −0,0433431 m**. Při přijatém native originY 0,6962777, lower local −0,60 a prvním stupni 0,175 m leží první nášlap na Y 0,2712777. Rozdíl proti této rovině tedy není konstantní: přibližně **0,110 / 0,213 / 0,315 m**. Pravý okraj se předem neprohlašuje za průchozí bez skoku; nerovná se terén napříč šířkou jen kvůli výsledku testu. Skutečnou roli spodní native podesty a oba směry nástupu ověří koordinátor Actorem.

V přechodu se mísí výška nejbližšího schváleného okraje jádra s původním DMR. Source rovina se tedy dál neextrapoluje za jádro. Čtyři vnitřní prstence a vnější návratová hranice jsou explicitní constraint lines. Každý původní NE–SW trojúhelník DMR je rozdělen samostatně; výsledná TIN zachovává jeho diagonálu, původní výšky obvodu a stejné vrcholy na společné hraně buněk.

## Reprodukce a stav

```powershell
uv run --no-project --with shapely==2.2.0 python -B scripts/cad-buildings/export_grade.py `
  --building b06 --terrain shared/data/terrain-grid.json `
  --observations .cache/cad-buildings-20261024/photogrammetry/b06-entry-ground.json `
  --proposal .cache/cad-buildings-20261024/photogrammetry/b06-approach-patch-proposal.json `
  --output shared/data/cad-buildings/b06-entry-grade.json
```

JSON obsahuje hashe obou podkladů, generátoru i původního DMR, source triangle IDs, všechny regionální masky a konkrétní source placement. Při změně pose nebo podkladu je nutná nová derivace. Data jsou odvozené runtime podklady; původní CAD dokumenty se do nich nebalí.

Malé analytické a runtime-sampler testy jsou GREEN společně s B1 grade: **10 Python + 7 TypeScript**, cílený typecheck PASS. Potvrzují plochy, rovinu, aktivaci, diagonály, hranice, determinismus a nepozměněný north-court patch. Skutečný Actor, produkční hra, obraz a GPU zůstávají následnou přejímkou koordinátora.
