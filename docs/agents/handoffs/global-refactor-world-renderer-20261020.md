# Předání: global-refactor-world-renderer-20261020

- Vlastník: `refactor-01a15658-world`; příjemce: koordinátor KEY-48 (`refactor-01a15658-audit`).
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- HEAD při převzetí: `1701bd07ad330df038d9b2b30489ab3560be1090`; zdrojová baseline specifikace: `885d07fc2e22576f0ce6c6ceaea08fd8a8d9dc95`.
- Výsledek: implementace a cílené CPU ověření připraveny k převzetí. Bez stagingu a commitu. Přijetí, stabilní build/integrace a produkční vizuální přejímka patří koordinátorovi.
- Cizí WIP: při převzetí byl změněn pouze koordinátorův `_bmad-output/implementation-artifacts/global-refactor-20261020/spec-world-renderer.md`; nebyl upraven ani převzat. Ostatní živé claims byly přečteny z registru a nezasahovaly do tří přidělených cest.

## Přesné změněné soubory

1. `client/world-renderer.ts` — odstraněno 11 nevolaných privátních funkcí a jejich nepoužívané importy/barvy; `facadeEdges` používá stávající `architectureEdges` a vrací pouze původních šest polí.
2. `tests/graphics.test.ts` — tři behaviorální testy veřejného výstupu, identity bodů, pořadí klíčů, signed zero, otevřených/uzavřených polygonů, obou orientací, degenerací a ostrých hranic `0.08`/`0.88`.
3. `docs/agents/handoffs/global-refactor-world-renderer-20261020.md` — toto předání.

Zdrojové soubory zachovávají LF; žádné plošné formátování. Renderer má 294 místo 847 řádků. Odstraněné funkce `collect`, `texture`, `facadeMaterials`, `facadePlane`, `edgeStrip`, `flatRoof`, `removeOriginalRoof`, `removeBoxFace`, `building`, `b6`, `stadium` měly dohromady 491 řádků těl/deklarací; další úbytek tvoří mrtvé importy/barvy a nahrazená duplicita hran.

## Podklady a rozhodnutí

- Primární zdroj: skutečný výchozí kód, AST/import průzkum a skuteční volající, nikoli odhad z velikosti souboru. Audit a varianty: `docs/refactoring/20261020/README.md`; zmrazené veřejné kontrakty: `docs/refactoring/20261020/world-renderer-contract.json`.
- Přesun nevolaného řetězce by pouze přesunul mrtvý kód; jeho opětovné zapojení by měnilo hru. Odstranění je omezené na uzavřený privátní řetězec.
- Prostý alias `architectureEdges` by přidal `tx/tz`. Explicitní projekce zachovává původní vlastnosti `a,b,length,nx,nz,long`, jejich pořadí a reference bodů. Nový geometrický modul by zbytečně rozšířil rozsah a autorovací vstupy.
- `scripts/export-building-assets.ts:314–349` zahrnuje do `sourceFiles` modul `architecture-reality.ts`, nikoli `world-renderer.ts`. `architecture-reality.ts` se nezměnil; modely, manifesty ani autorovací generátory nebyly přegenerovány.
- Cache, stav ani lifecycle nevznikají. Odstraněné továrny se před změnou nevolaly. Kompatibilní export nyní navíc alokuje projekci výsledného pole; současná produkční hra tento export nevolá. Není deklarována optimalizace FPS.

## Identita zdrojů a veřejný kontrakt

| Soubor | SHA-256 před | SHA-256 po |
| --- | --- | --- |
| `client/world-renderer.ts` | `4c7895e007cc80b8f7844e9e6f35d421ced202f15837b9311046e521e74a11df` | `a74ea34088b4e5674faa30893ea7ee558044fdc5ae045fd647793790c93cf8fe` |
| `tests/graphics.test.ts` | `ed9b4b4097a1c3a337f0bceb562e285e1707a9b26bd40b6be710dbd14092a881` | `2fe248d8514399f84f6cc9ed4fc85e845e104a78b2bc0d3549a9749194aa11c9` |
| `client/architecture-reality.ts` (jen čteno) | `9e1c55065a1bfb32afffbd1e884e6c1126b962f5bfe951e7ba65cc516c4005e6` | shodné |

SHA-256 úzkého manifestu obsahujícího první dva soubory v uvedeném pořadí, každý řádek přesně `<cesta>\t<sha256>\n`: `e6f110719822a4893f6896f3a2c3f9d633e0c92847ffc012f5629f070ebb893a`. Toto je identita taskového zdroje včetně testů; není to identita celé produkční hry. Samotný handoff není do vlastního manifestu zahrnut.

- Canonical AST těla `buildWorld` před **i po**: `43066433256251cc5ede9ffbf88b8457f7fc3525542f7e1790784c8871c2800d` (TypeScript printer, `NewLineKind.LineFeed`, `EmitHint.Unspecified`). Porovnání používá původní commit a uložený kontrakt.
- Celá deklarace `buildWorld`, včetně těla, komentářů a signatury, je také bajtově shodná při porovnání `getText` příslušných AST uzlů. Stejně shodné jsou `WorldBuildContext` a soukromý typ `FacadeEdge`.
- Veřejné exporty ve stejném pořadí: `WorldBuildContext`, `facadeEdges`, `buildWorld`.
- Veřejná signatura hran zůstává `export function facadeEdges(points: [number, number][]): FacadeEdge[]`.
- Veřejná signatura světa zůstává `export function buildWorld(context: WorldBuildContext, options: { photogrammetry?: boolean } = {})`.

## Skutečné ověření 20. 10. 2026

1. Ještě nad původním rendererem, po doplnění testů: `node --import tsx --test tests/graphics.test.ts` — exit **0**, **8 PASS / 0 FAIL**, 4915,471 ms. Nové aserce tedy zachycují skutečný původní kontrakt.
2. Po implementaci, přibližně 06:38:55–06:39:14 UTC:

   ```text
   node --import tsx --test tests/graphics.test.ts tests/architecture-reality.test.ts tests/b6-reality.test.ts tests/landmark-reality.test.ts tests/building-foundation.test.ts tests/campus-exterior.test.ts tests/stadium-exterior.test.ts
   tests 55; pass 55; fail 0; cancelled 0; skipped 0; todo 0
   duration_ms 19072.7662; exit code 0
   ```

   Zahrnuje původní architekturu a fasády, B6 vstupy/schody/interiér/lifecycle, základy a GLB normály, venkovní povrchy/brány i stadionové fyzické uzávěry. Nejde o GPU důkaz.
3. Po lokálním zpřehlednění nového testového bloku: `node --import tsx --test tests/graphics.test.ts` — exit **0**, **8 PASS / 0 FAIL**, 5225,9074 ms. Produkční zdroj se po bodu 2 neměnil.
4. Nezapisující srovnávací Node/tsx skript načetl původní `facadeEdges` AST přímo z baseline commitu do samostatného VM. Pro všech 120 budov použil otevřený/uzavřený polygon a obě orientace; doplnil degenerace, minimální délku a ne-konečné číselné vstupy. **488 polygonů / 6333 hran PASS**, exit **0**. Každý klíč a hodnota se porovnávaly přes `Object.is`, včetně identity původních bodů, signed zero a NaN; očekávání nekopírovalo algoritmus do nového testu.
5. Nezapisující AST kontrola výše uvedených signatur, exportů, těla světa a nezměněného `architecture-reality.ts` — exit **0**. `git diff --check -- client/world-renderer.ts tests/graphics.test.ts` — exit **0**.

Výsledkové výňatky jsou uložené v tomto handoffu; samostatný log nebo srovnávací fixture mimo přidělené cesty nebyl zapisován. Původní příkazy a výstupy jsou také ve výstupech nástrojů této relace.

## Procesy, omezení a převzetí

- Vlastní procesy: pouze jednorázové Node/tsx/AST kontroly. Testovací exec session `37447` skončila exit 0; žádný server, port, browser, Blender nebo GPU proces nebyl spuštěn a žádný vlastní pomocný proces nezůstává živý.
- Neběžela vlastní celá sada, `pnpm build`, izolovaná integrace ani GPU přejímka. Patří navazujícímu rezervovanému ověření koordinátora; předchozí výchozí PASS není vydáván za ověření nového celého checkpointu.
- Specifikace ani katalog tasků nebyly změněny; žádný soubor nebyl staged nebo commitnut. Výsledek neuzavírá celkový refaktoring KEY-48.
- Rezervace při zápisu předání: vlastní úzký claim `global-refactor-world-renderer-20261020`; heartbeat obnoven před závěrečnou sadou zápisů. Po předání a ukončení pomocných procesů bude uvolnění potvrzeno samostatným CLI a zprávou integrátorovi. `release` není převzetí ani stav Done.
- Další krok integrátora: zkontrolovat pouze tyto tři vlastní soubory, převzít výsledky, provést rezervované společné ověření a samostatný commit; task status, Linear a společné `docs/verification.md` aktualizuje koordinátor.
