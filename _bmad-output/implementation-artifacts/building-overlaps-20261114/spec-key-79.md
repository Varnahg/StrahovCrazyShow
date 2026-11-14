---
title: 'Překryvy fasád a základů'
type: 'bugfix'
created: '2026-11-14'
status: 'done'
route: 'dispatch'
baseline_commit: 'fae7200257016de6469534b81ff126547d8b5fd7'
context: []
---

<frozen-after-approval reason="zadání uživatele">

## Záměr

Prověřit černé překryvy budov v aktuální hře a opravit reprodukovatelné chyby. Menza a sokl koleje jsou výchozí kontroly. Přijetí vyžaduje zobrazení ze stejného místa v Edge a cílenou regresi skutečně opraveného mechanismu.

</frozen-after-approval>

## Mapa kódu

- `client/architecture-reality.ts` vytváří near/far dávky, vyřezává okna z podkladové fasády a připojuje sokl a ploché překryvy. Menza je `8111356`. B4 skládá autorské panely.
- `client/terrain-renderer.ts` vytváří svislé sukně pod výškovou úrovní fasád. `client/world-renderer.ts` používá stejnou základnu pro fasádu a sukni. CAD B1/B6 jsou samostatné.
- `shared/terrain.ts` a `shared/simulation.ts` sdílí výšky a kolize. U menzy se severozápadní svah promítá do prvních pěti oken a sahá několik metrů ven z půdorysu. Běžný kontakt terénu s plnou zdí je očekávaný.
- `shared/landmark-reality.ts` vytváří typové kolejní schody. Rozteč 0,29 m a hloubka 0,292 m vytvářejí přesahy bočních a spodních stěn a 1 mm průnik nejvyššího stupně s podestou.
- Podklady: aktuální DMR herní grid, stavební katalog a galerie ČVUT z 20. 6. 2024, dokumentace Babylon stínů, předchozí měření `docs/verification-evidence/ground-flicker-20261011/README.md`.

## Úkoly a přijetí

- [x] Zaznamenat skutečný obraz baseline a izolovat terén a stíny kolem spodních oken menzy. Pás B5 se projevil s vypnutými stíny i texturami.
- [x] Upravit doložené konflikty ve zdrojové geometrii, přidat cílenou regresi a ověřit near/far a nástupy na schody.
- [x] Uvést rozsah prohlédnutých meshů a případné neověřené projevy v předání.

## Plán experimentů

Problém: zakrytí nejnižšího prosklení menzy a blikající překryvy. Hypotéza: kombinace průniku terénu a lokálně opakovaných ploch, podle místa. Změna: každá izolace mění jedinou vrstvu, pak se srovná původní a upravená geometrie. Metrika: průnik okna a terénu, kladná plocha koplanárního překryvu, obraz ze stejných souřadnic. Správnost: původní DMR a průchodné kolize, identita buildu a skutečně odeslaný snímek. Přijetí: žádná zakrytá část opraveného prosklení ani potvrzený duplicitní povrch, navazující sokl a odpovídající oba LOD.

## Rozhodnutí

U menzy řešit pouze dotčená pole fasády. Místní snížení terénu by vyžadovalo prohlubeň v pokračujícím svahu a úpravu drapovaných povrchů. Zvednutí celé budovy by posunulo střechu i vstup. Plná soklová výplň v nejnižších polích umožní zachovat půdorys, terén i reálnou výškovou variabilitu. U schodů ponechat stávající kolizní mezery překryté a vykreslit jednoznačné provozní plochy bez překrytí. Globální `zOffset` může přemístit kresbu přes správně bližší objekty a nezmění fyzický průnik.

## Implementation Notes

- Koordinátor `building-overlap-01a1dad0` vytvořil jediný nový katalogový soubor `building-overlaps-20261114.json` ve své původní administrativní rezervaci. Tentýž vlastník při doplnění prokázaných cest přebírá jen vlastní katalogový soubor.
- Edge WebGL2, baseline `0f9a90990e77557c23f1953076a5c9130ce2d96b31b1e3e4f35a785aed8d3c16`, 1528 × 612 / 1175 × 470: drapovaný chodník a terén protínají spodní prosklení. Průnik je vidět i při vypnutých stínech. První pokus diagnostiky postrádal kontejner pro herní popisky; referenční build je následný funkční pokus.
- Audit prokázal mezery soklů u 16 mapovaných budov v herním rozsahu. Přidání terénních zlomů do dolního obrysu by zvyšovalo počet ploch a vyžadovalo dělení styků. Místo toho se ponechá stávající počet segmentů a lokálně se prohloubí dolní konce podle minima rozdílu na hranách terénních trojúhelníků. Sousední segmenty sdílejí vyhodnocenou dolní výšku vrcholu.
- Zjištěný překryv pilastrů/střešních lemů a samostatný B4 roh jsou viditelné materiálové hranice. Stanou se samostatnými kandidáty po ověření průniku a soklů. Stadionové a další vnitřní stavební průniky se hodnotí podle viditelnosti; stejná rovina sama nestačí pro zásah do celé stavby.
- Bočnice a stupnice schodů dostanou přesné společné hranice. Oproti prostému zkrácení vykreslených boxů se nevytvoří sousední skryté protilehlé stěny. Hranice kolizních boxů zůstanou v dosavadních souřadnicích a přepočítá se dohledatelná identita navigace.
- Třícentimetrový horní lem má v každém rohu společný bod pro sousední hrany. Horní plocha pilastru začíná až za lemem. B4 vrchní uzávěry kryté společnou střechou a opakované shodné trojúhelníky západního rohu byly vynechány při skládání herní geometrie. Sedací pás stadionu začíná 5 cm pod horní hranou atiky.
- Nezávislé review: cca 20 cm² na B5 a 10 cm² na B8 zůstávalo u společného lemu, protože ořez jedním směrem nebral v úvahu sousední lem. Finální verze odečítá skutečné trojúhelníky všech sousedních lemů. Přechodový pokus používal obecný výpočet normál pro submilimetrové pozůstatky a triangulaci celých ostře lomených pásek. Obě chyby se reprodukovaly při konstrukci celé architektury. Finální řez pracuje se stejnými trojúhelníky, které se kreslí, a vynechává zbytky pod přesností Float32.
