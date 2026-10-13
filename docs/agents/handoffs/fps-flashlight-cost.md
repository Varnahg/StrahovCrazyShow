# Předání: fps-flashlight-cost

- Vlastník: `fps-flashlight-20261013`; příjemce: `fps-root-20261013`.
- Pracovní kopie a větev: `/workspace/StrahovCrazyShow`, `main`; výchozí commit `a381cf637b607b364e85b1e44a8e57566b3c9a0d`.
- Výsledek: odstraněna redundantní invalidace světelných shaderů při vypnutí/zapnutí svítilny a světel auta. Vypnuté světlo zůstává skutečně zakázané s nulovou intenzitou, neobsazuje materiálový slot a nespouští stínový průchod. Uchovává pouze poslední konfiguraci `shadowEnabled`; zapnuté světlo aplikuje skutečnou kvalitu stínů.
- Změněné soubory: `client/vehicle-lighting.ts`, `tests/vehicle-lighting.test.ts`, `tests/flashlight.test.ts`, tento handoff.
- Cizí rozpracované změny: koordinované změny trávy, B6, cinematic, dopravy a integrační dokumentace nebyly převzaty ani upravovány.

## Primární podklady a rozhodnutí

Přečtena instalovaná Babylon.js **9.30.0** dne 13. 10. 2026:

- `Lights/light.js`: `setEnabled` vždy resynchronizuje světelné zdroje scénových meshů; setter `shadowEnabled` při změně navíc prochází scénu přes `_markMeshesAsLightDirty`.
- `Lights/Shadows/shadowGeneratorSceneComponent.pure.js`: `_gatherRenderTargets` vyžaduje současně `light.isEnabled()` a `light.shadowEnabled`. Zachování konfigurace stínů vypnutého světla nepřidává průchody.
- `Meshes/abstractMesh.pure.js`: vypnutý zdroj je odebrán z `lightSources`, takže neblokuje čtyřslotový rozpočet.
- `Rendering/objectRenderer.js` a `Materials/materialHelper.functions.js`: stínové defines závisí na neprázdnosti `renderList`. Pozorované array mutátory invalidují materiály při prázdném/neprázdném přechodu. Běžná aktualizace neprázdného seznamu nyní mění existující indexy, hraniční přechod používá jediné `push`/`pop`.

Broad phase se stále obnovuje ihned po reaktivaci, změně kvality, počtu meshů, větším posunu a po 250 ms. Zachování cache přes vypnutí nebylo použito: jiný caster se může mezitím přesunout nebo aktivovat. Rozměry map 128/256/512, rozsah, směrovost, filtrace, geometrie a selekce skutečného frusta zůstávají stejné.

## Refaktoring a ověření

Kandidáti sdílejí existující `shadowMap.renderList`; periodický výběr již nevytváří pole přes `scene.meshes.filter`. Vzdálenost používá ekvivalentní porovnání druhých mocnin, včetně odmítnutí neplatné vzdálenosti. Babylon spravuje nové pole při změně velikosti mapy, vlastní kód je znovu nepřipojuje k zaniklému targetu.

`pnpm exec tsx --test tests/vehicle-lighting.test.ts tests/flashlight.test.ts` dne 13. 10. 2026 v 16:52 Praha: **14/14 prošlo**, exit 0, 4,12 s. `git diff --check` pro tři změněné TS soubory: exit 0.

- Šest vypnutí/zapnutí: přesně **12 nutných dirty volání receiveru**, **0 dodatečných globálních změn shadow režimu**. Kontrola sleduje skutečné Babylon metody, členství `lightSources`, identitu mapy a kandidátního pole.
- Prázdný/neprázdný stínový seznam: přesně jedna požadovaná invalidace při každém přechodu, nula při běžném přesunu s neprázdným seznamem.
- Přesunutý caster, nově vytvořený caster, původně skrytý caster a změna kvality se projeví ve skutečném draw-time výběru.
- NullEngine test skutečného render-target collectoru prokáže vykonané zapnuté shadow draws a **nula průchodů i draws po vypnutí**, přestože konfigurace `shadowEnabled` zůstává zachovaná. Po zapnutí stejná mapa znovu kreslí.
- Stávající testy FK, RH kamery, čtyřslotového rozpočtu, quality lifecycle a disposal prošly.

SHA-256 ověřeného snapshotu, včetně testů:

| Soubor | SHA-256 |
| --- | --- |
| `client/vehicle-lighting.ts` | `7903f0be0f4b98affc599d7c9cb323581fa482b640b969d9ffc90eb433461891` |
| `tests/vehicle-lighting.test.ts` | `853f89942bb96e872526208c87e23b8a325ae71dfcc79a9e2c40007806f1f0b0` |
| `tests/flashlight.test.ts` | `ee6010035fe3d5589af9188b83960a48062fa1b18c698a38e5c8c7bea870a1e2` |

## Hranice výsledku

Jde o důkaz snížení CPU invalidací a alokací, nikoli změřené zrychlení GPU nebo odstranění studené kompilace. Tento agent nespouštěl browser, build ani plnou testovací sadu; sdílené měření a integraci vlastní koordinátor. Nevznikl vlastní dlouhožijící proces ani port.

`Material.forceCompilationAsync` bylo prozkoumáno, ale prewarm nebyl přidán. Babylon kompiluje dočasný submesh; skutečná varianta závisí na mesh atributech, instancích, stínech a pořadí aktivních světel. Jeden libovolný mesh na materiál nepokrývá skutečný svět ani vstup do B6. Plošné předehřívání všech kombinací by potřebovalo samostatný profil ceny načítání a pokrytí.

V Babylon 9.30 samotné přepnutí světla cache efektů nemaže: `DrawWrapper.setEffect` pouze přiřadí efekt, `ThinEngine.createEffect` znovu používá cache podle shaderů a přesných defines. Nově linkované programy pozorované koordinátorem i po prvním vypnutí proto nelze bez zachycení jejich defines označit za ničení cache přepínačem. Studené shaderové varianty zůstávají výslovně samostatnou sledovanou příčinou.

- Rezervace: handoff předán koordinátorovi, poté uvolněna vlastní rezervace; žádný vlastní pomocný proces neběží.
- Integrátor: přebírá konkrétní diff a testy, provede společné produkční ověření a aktualizuje task i `docs/verification.md`.
