# Předání: global-refactor-grass-resources-20261020

- Vlastník: `refactor-01a15658-grass-resources`; příjemce: `refactor-01a15658-audit`.
- CWD: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- Výchozí commit: `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`.
- Výsledek: úzký refaktoring, failure regrese a cílené ověření dokončené, připravené k review a samostatnému integračnímu commitu.
- Změněny pouze `client/photo-grass-resources.ts`, `tests/photo-grass.test.ts` a tento handoff. Žádný staging/commit, task/spec edit, asset/generátor ani worker změna.

## Vlastnictví a průzkum

Před prvním zápisem znovu ověřeny task JSON, HEAD, čistý task scope, živý `claims.json` (žádná kolize) a `agent-tasks status`. Získán vlastní claim bez `--adopt-dirty`. Předchozí avatar a simulation/benchmark tasky byly již předané a uvolněné; do jejich souborů se nezapisovalo. Cizí WIP tohoto checkoutu nebylo převzaté.

Pravidla AGENTS/architektury/koordinace/BMAD policy a šablona předání byly načtené v této relaci. Žádný rekurzivní BMAD. Primární podklad je čtecí audit nativní trávy z 20. 10. 2026: celé placement, renderer, preparation, resources, batch, selection, budget, wind a transition moduly, relevantní shared klasifikace/terén, jejich callery a testy. Před změnou byly znovu porovnány konkrétní disposal smyčky a load/release řetězec.

Worker handoff a transfer manifest byly pouze čtené při auditu; jeho manifest SHA-256 byl ověřen jako `330b0732e2f48ccdea4e322282d575b7bfbf902d08806f7017203cea79af98db`. Původní worker claim je uvolněný. Nativní placement/renderer/testy před tímto taskem odpovídaly transfer base a tři experimentální runtime cesty zde neexistovaly. Nic z workeru ani combined snapshotu nebylo aplikováno nebo zapnuto.

## Rozhodnutí a zachované vlastnictví

| Varianta | Náklady / rizika | Volba |
| --- | --- | --- |
| Ponechat dva stejné trojité průchody | Dvojí definice pořadí a argumentů likvidace týchž polí | Nevybráno |
| Lokální helper pouze pro tři identické smyčky | Jeden closure při vytvoření skupiny a call při jejím cleanupu; žádná práce za snímek, závislost nebo nové API | Vybráno |
| Sloučit celé destroy/catch větve nebo obecný disposer | Rozdílný observer/cache/refcount kontext, riziko jiného exception/async pořadí | Nevybráno |

`disposeOwnedAssets` je privátní closure uvnitř factory větve nových resources. Obsahuje původní smyčky v přesném pořadí:

1. `sources.values()` v pořadí Map, `mesh.dispose(false, false)`.
2. `ownedMaterials` v pořadí vytvoření, `material.dispose(false, false)`.
3. `loaded` v pořadí atlasů, `texture.dispose()`.

Helper nemá catch/finally, idempotentní guard ani pokračování po chybě. Původní fail-fast chování tedy zůstává: výjimka disposal zastaví další likvidaci a v inicializačním catch nahradí původní chybu načítání. Testy tuto stávající prioritu výslovně ověřují; refaktor ji neopravuje ani nezměkčuje.

V `destroy` nadále nejprve proběhne jeho vlastní idempotentní guard, `destroyed = true` a odstranění scene observeru; po úspěšném helperu se odstraní cache klíč. Inicializační catch po úspěšném helperu nadále volá `Promise.allSettled(pending)` a předává původní výjimku. Cache se zapíše až po kompletní inicializaci. Lease stále vlastní své klony, uvolní je před snížením refcountu a poslední reference teprve volá destroy.

Zachovány per-scene cache klíče, ready Promise, materiály/textury, per-lease wind, retained FAR helper a pořadí jeho zrušení před lease release. Žádný nový public export, cache, per-frame alokace či změna placement/výběru. Není tvrzeno zrychlení ani FPS přínos.

## Testy a skutečné výsledky

Vše 20. 10. 2026 ve výše uvedeném cwd. Výstupy jsou v tool transcriptu a shrnuté zde; další log soubor mimo scope nevznikl.

1. **První verze dvou nových testů před produkční změnou**, přibližně 07:42 UTC: exit **1**, **1 PASS / 1 FAIL**, 4 127 ms. Missing-LOD test se pokusil pozorovat vytvořené meshe/materiály přes scene notifications a nezachytil jejich synchronní disposal. Byla to chyba fixture, nikoli produktová regrese. Lokální Babylon `scene.pure.js` řádky 2335 a 2779 prokazují `TimingTools.SetImmediate` pro tyto notifikace.
2. **Opravené dva nové testy stále proti původnímu produkčnímu kódu**: exit **0**, **2 PASS / 0 FAIL**, 4 338 ms:

```text
node --import tsx --test --test-name-pattern="atlas loader failure|missing LOD disposes" tests/photo-grass.test.ts
```

Missing-LOD fixture nyní pozoruje skutečně vytvořenou částečnou skupinu přes řízený getter právě při požadavku na chybějící medium LOD: před chybou existuje jeden near source a dva materiály. Žádné globální nahrazování Babylon konstruktorů.

Nové testy ověřují pouze dosud nepokryté failure cesty: loader selže na třetím atlasu; medium LOD chybí po vytvoření near geometrie. Oba zahrnují normální cleanup a cleanup, který sám vyhodí přesný sentinel. Ověřují pořadí, původní chybu nebo identitu cleanup chyby, skutečně uvolněné i dosud neuvolněné zdroje a úspěšný retry, který musí znovu načíst všech pět map místo použití cache. Každá scéna je nakonec uklizená i v chybové variantě.

3. **Finální přesný task příkaz**, přibližně 07:43 UTC: exit **0**, **29 PASS / 0 FAIL**, 25 481 ms:

```text
node --import tsx --test tests/photo-grass.test.ts tests/photo-grass-preparation.test.ts tests/benchmark-snapshot.test.ts
```

Tato sada dále ověřuje původní root fingerprint, bounded přípravu/eviction, pohyb a změnu kvality, per-lease sdílení a wind, buffer compaction, pending ready/failure, disposal/retry, retenční FAR efekt/geometrii/tokeny a neměnnost exportovaného benchmarku.

4. **Diferenciální strukturální a disposal důkaz**, 07:45 UTC, jednorázový `node --input-type=module`, exit **0**. Oracle je skutečný původní modul z `git show 42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a:client/photo-grass-resources.ts`. TypeScript AST transform odstranil jedinou novou helper deklaraci a rozbalil jeho dvě volání: výsledný celý modul se přesně shodoval s původním AST po odstranění komentářů/formátování. Tím jsou doloženy i nezměněné okolní větve a veřejné deklarace.

Samostatně byly původní tři smyčky z obou větví a skutečné nové helper tělo spuštěné ve VM se stejnými kontrolovanými zdroji: tři meshe, dva materiály, pět textur, bez chyby i s chybou v každém z deseti disposal míst. **22 trace porovnání, 0 rozdílů** v pořadí, argumentech a identitě vyhozené výjimky. Algoritmus oracle nebyl ručně přepsán.

5. `git diff --check -- client/photo-grass-resources.ts tests/photo-grass.test.ts`: exit **0**, bez výstupu.

## Identita tasku

Manifest vytvořen `2026-10-20T07:45:13.639Z`, zahrnuje změněné testy. Handoff se do vlastního manifestu nezahrnuje. Identita se vztahuje pouze na tento disjunktní celek, nikoli na celý dirty checkout.

| Soubor | SHA-256 |
| --- | --- |
| `client/photo-grass-resources.ts` | `fd74e9577ed814c3e8adf558b8e89ecfbb8d82d4e945b638e813c9bcb714aba7` |
| `tests/photo-grass.test.ts` | `835752fea30d395108b0a4a62a7e24a94c047f461c5b55a5f0d3d12121cf418a` |

Manifest SHA-256: `57c70ee24c9e2d6062efb9d111464344808a5f5b29a4a2589da7a766913da7fe`. Payload: uvedené řádky v pořadí tabulky, každý `path + NUL + sha256`, spojení LF bez posledního LF.

SHA-256 `git diff --binary 42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a -- client/photo-grass-resources.ts tests/photo-grass.test.ts`: `1a880ebf3befc28f959a921f43bab72ebf9eadc629731c7260a518cc5acca745`.

Původní resources SHA-256: `14ebd248bc3a2bde786c9b52b80d82dfed604b387c6b87a3706f533cd3d5ac0f`.

## Cleanup, omezení a převzetí

Všechny vlastní testovací, AST/VM a CLI procesy skončily; žádný persistentní proces, server, port, preview, Blender ani GPU scéna nebyly spuštěny. Žádný cizí proces nebyl ukončen. Plná sada, build, izolovaná integrace a produkční praktická přejímka nebyly spuštěny: patří koordinátorovi pod samostatnou rezervací. NullEngine a strukturální/trace důkaz nejsou GPU/performance důkaz ani určení příčiny startup timeoutu.

Po předání tohoto souboru bude vlastní claim uvolněn a přesný výsledek/čas předán koordinátorovi. Release není stav Done. Integrátor `refactor-01a15658-audit` přebírá review, samostatný commit/integraci, společné ověření a aktualizaci Linear, tasku a `docs/verification.md`.
