# Venkovní mobiliář a dominanty · 12. 10. 2026

Implementace přidává **202 identifikovaných objektů**: 143 laviček, 2 piknikové stoly, 5 košů, 1 odpadní kontejner, 4 sběrná místa, 4 tabule, 1 stojan na kola, 3 prvky se sloupky, 20 bran, 17 oplocení, růžový traktor a Petřínskou rozhlednu. Počet prvků mapy není počet jednotlivých tyčí, nádob nebo skutečných kusů inventáře v terénu.

Podklady a rozlišení mapových údajů/interpretací: [inventář](../../reality-pack/outdoor-artifacts/inventory.md), [dominanty](../../reality-pack/outdoor-artifacts/landmarks.md). Původní OSM odpověď má SHA-256 `65b5495e340727dd55a0cd27f45ed987208145c4a72ab4cc7034e1d8f2ecf247`. Součástí inventáře je 15 dalších kandidátů čekajících na doložení podoby; dalších šest z těchto patnácti leží mimo pěší oblast. Nejde o úplný inventář všech fyzických předmětů areálu.

## Checkpoint B a pipeline

Finální snapshot `.cache/performance-snapshot/outdoor-artifacts-20261012-b`:

- ID **`66296696199597061021f234678f122ca46756137e8d442b2a66c3b1fdfd1d0a`**, 8313 souborů, včetně všech testů, dat a assetů. [Manifest](final-b/source-manifest.json).
- [Následná kontrola](final-b/source-check.json) přečetla všech 8313 zmrazených souborů bez změny a porovnala 18 dotčených runtime/test souborů se současným checkoutem: 0 odchylek. Diagnostické HTML/TS jsou samostatně dohledatelné SHA v témže záznamu, nebyly součástí původního runtime manifestu.
- **`pnpm test`: 646/648 PASS, exit 1.** [Log](final-b/test.log), [výsledek](final-b/test-result.json). Dvě selhání v `tests/graphics.test.ts`: `night moonlight is bounded and overcast has lower direct contrast` a `weather fog remains bounded and sunrise has no discontinuous lighting step`. Patří současně rozpracované atmosféře (staré limity měsíčního světla a mlhy), jejíž původní vlastník potvrdil převzetí. Testy se v tomto tasku neoslabovaly. Všech 23 nových regresí mobiliáře, dominant, rendereru, mapových značek a skutečné fyzikální integrace prošlo.
- **`pnpm build`: PASS, exit 0.** [Log](final-b/build.log), [výsledek](final-b/build-result.json). Zachované upozornění na velké chunky a neúčinný dynamic import vegetace; nejde o nové výkonové potvrzení.
- **`pnpm test:integration`: PASS, exit 0.** [Log](final-b/integration.log), [výsledek](final-b/integration-result.json). Samostatný server na 2568, skutečné SDK relace, pohyb/chůze, auto W/A/D/brzda/couvání/nástup/výstup, 12 klientů v jednom světě, izolovaný host, chat a obnovení relace. Wrapper vlastní server po ověření ukončil.
- **Protokol 10** odmítá starší predikci statických kolizí; klient a server musí přejít společně. Integrační síťový scénář zkouší i odmítnutí `PROTOCOL_VERSION - 1`, nyní v9.

Předchozí A je zachovaný: `9dc61cd8077338809a81a9d79a0695409b0d92a7783cd38b882a01832467d624`, protokol 9, 644/646 testů se stejnými dvěma weather selháními, build PASS. Jeho [manifest](source-manifest.json), [test log](test.log) a [build log](build.log) nejsou finální B a nebyly přepsané.

## Skutečná herní scéna

Jediný prohlížečový GPU náhled tohoto tasku: Intel UHD 630 přes ANGLE/D3D11, medium, CSS i interně **1280×720**. Všechny uložené stavy mají `ready=true`, **0 render/shader chyb a 0 asset chyb**. Diagnostika instancuje skutečný `Game`, všechny běžné assety a Rapier. Neobsahuje produkční multiplayerový HUD, proto není produkčním výkonnostním benchmarkem. Část snímků vznikla během CPU testů/buildu; žádné FPS ani timing tvrzení se z nich neodvozuje. Ostatní agenti po domluvě nespouštěli GPU/Blender.

- [Traktor zepředu](final-b/tractor-front.jpg), [stav](final-b/tractor-front.json); [zezadu](final-b/tractor-rear.jpg), [stav](final-b/tractor-rear.json).
- [Petřínská rozhledna včetně laviček v popředí](final-b/petrin-world.jpg), [stav](final-b/petrin-world.json).
- [Piknikový stůl](final-b/picnic-table.jpg), [stav](final-b/picnic-table.json). [Praktický kontakt](final-b/picnic-contact.json): skutečný vstup W na 2 s posunul postavu přibližně 7,2 m z počáteční vzdálenosti 8,5 m; zastavila se před lavicí/stolem, neprošla středem modelu.
- [Kontejner](final-b/dumpster.jpg), [stav](final-b/dumpster.json); [informační tabule](final-b/information-board.jpg), [stav](final-b/information-board.json).
- [Velká mapa se 202 značkami a zvoleným traktorem](final-b/map-artifacts.jpg), [text detailu](final-b/map-artifacts.txt). Vrstva se přepíná tlačítkem **Mobiliář a dominanty**. Plotové značky jsou ukotvené na úseku zdrojové linie uvnitř mapy, Petřín zůstává za pěší hranicí.
- A/D používají skutečný herní pohyb a původní matici kamery: [A](final-b/controls-left.json) má projekční posun **−600,26 px**, [D](final-b/controls-right.json) **+598,78 px**. Jde o kontrolu severního natočení ve třetí osobě; širší úhlové regrese ověřila celá sada, ne každá poloha ručně.
- [Vstup B6 tam a zpět](final-b/b6-roundtrip.json): **18/18 úseků**, 1234 fyzikálních vstupů, bez selhání, schody/podesty/recepce/venkovní návaznost, bez skoku či záchranného teleportu. [Snímek návratu](final-b/b6-roundtrip.jpg).

## Rozsah modelů a omezení

Společný plán má 98 152 trojúhelníků, 561 materiálových/LOD částí, 12 sdílených materiálů a 1772 fyzikálních boxů. Tyto počty nejsou FPS měření ani důkaz optimálnosti. CPU geometrie je kešovaná; GPU materiály/meshe vlastní scéna a mají ověřenou idempotentní likvidaci. Vzdálené detaily mobiliáře se vypínají s hysterezí; rozhledna zůstává dostupná až k far plane 1100 m.

Rozměry a typologie běžného mobiliáře jsou orientační, není-li uveden zdrojový rozměr. Blízkost jediného mapovaného stromu u lavičky není potvrzení jejího umístění pod korunou. V aktuálním zdroji nebylo zvlášť doložené zábradlí; generický plot se za ně nevydává. Tabule nemají vymyšlený místní text. Otevření neznámých bran a průchody v oplocení jsou popsané herní adaptace. Traktor zachovává 7,1m nesoulad OSM/GHMP v provenienci; část pneumatik, rám a zámek jsou dekorativní bez samostatného collideru. Rozhledna není přístupná, podkladová výška má toleranci a současný nezaměřený anténní nástavec je vynechaný.

Hlavní publikovaný preview 4179/2570 a hlavní `dist` tento task neměnil. Výsledek je integrovaný ve zdrojích; společný deployment s dokončenou atmosférou patří navazujícímu vlastníkovi. Vlastní dev 5173/2567, frozen 5175 a GPU tab byly ukončené; port 2568 uklidil wrapper.
