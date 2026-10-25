# Předání: b6-native-door-export-guard-20261025

- Vlastník `b6-native-door-guard-r2`; příjemce root. Cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline `e7ef3ff63dbb3ed0f771082331d8bb0eee5f2427`.
- Nové vlastní soubory: `scripts/cad-buildings/door_export_audit.py`, `scripts/cad-buildings/test_door_export_audit.py`, toto předání a `.cache/b6-native-door-export-guard-20261025/`. Žádný cizí WIP, model, builder, audit adapter, původní CAD nebo published asset nebyl změněn.
- Výsledek: čistý validátor skutečné zavřené geometrie proti definici fyzikálních dveří; **10/10 testů PASS**, včetně všech aktuálních475dveří /962moving parts ze skutečného GLB. Builder/audit wiring patří rootovi a není tímto předáním tvrzen jako dokončený.

## Doložený mechanismus a volba

Původní `export_collision` transformoval statické vrcholy přes `obj.matrix_world`, ale nové `interactiveDoors` kopíroval bez změny z uložených metadat. `open_master` dovoloval transformace a editované vrcholy; audit porovnával native/GLB/statické kolize, nikoli samostatné fyzikální definice. Čtecí AST reprodukce skutečné exportní funkce se zadaným root posunem+1m dala statický vrcholX1 a hingeModelX0 místoX1. Neznamená to chybu dosavadního identity masteru; znamená to chybný reexport po podporovaném editování masteru.

Přepočet všech metadat podle transformace by vyžadoval také floor/CAD/stair/terrain kontrakty a neřešil by libovolné vertex edits či ztrátu skutečného pantu. Kontrola samotných matic nezachytí Edit Mode. Souhrnná obálka může zakrýt ztenčené křídlo klikami a nezachytí chybějící plochu. Vybrána explicitní podpora aktuálního authored schématu: identity native root/object matice a úplné skutečné triangulované boxové komponenty podle rolí. Neznámý tvar nebo editace se odmítne, nic se tiše nepřemístí ani neodhadne.

## API a root wiring

```python
from door_export_audit import validate_closed_door_export

report = validate_closed_door_export(definitions, parts, root_matrix, tolerance=2e-5)
```

`definitions` je aktuální seznam native `interactiveDoors`. `parts` jsou slovníky:

```text
id, doorId, floor, role, collision,
positions = skutečné evaluated XYZ triples nebo flat XYZ,
indices = flat triangle indices,
matrixLocal = nested 4×4 původní native object matrix
```

`root_matrix` je nested4×4 původní native root matrix. Matice se kontrolují před změnou souřadné konvence; musí být identity s tolerancí1e-8. Vrcholy musí být skutečně evaluated a už převedené z Blenderu do model/game `(x,z,-y)` v metrech. Nepředávat metadata bounds místo vrcholů. U unclaimed nepohyblivých částí stačí id/role/doorId; jejich celé geometrie validátor nečte, ale zjistí tím orphan door parts. `floor` se převezme z `obj['floorId']`. Body/handle/other claimed části vyžadují skutečný `collision` bool podle `collisionPartIds` a identity s definicí.

Umístit před publikaci při počáteční tvorbě i `--from-blend`, po evaluated geometry/metadata vytvoření, a stejně v nativním auditu. Adapter/build/audit vlastní root. Nedoplňovat fallback, který validátor přeskočí nebo mu předá nulové transformace místo skutečných. Pokud se má nově podporovat jiná stavební dveřní geometrie, rozšířit authored schéma i jeho důkazy; pouhé povolení větší tolerance není řešení.

Při nesouladu vyvolá `ValueError` s door/part identitou a konkrétním mechanismem. Kontrola zahrnuje:

- Přesnou vazbu building/source/floor/door/part, chybějící/duplicitní/orphan části, defaultclosed a konečná metadata.
- OBB křídla v lokálním rámci skutečného `closedPose`; pant leží na dolní závěsové hraně, `handleModel` odpovídá současné autorské pozici.
- Wood leaf: celý přesný box, samostatně od klik. Glass: čtyři rámové hranoly, při šířce>1.6m navíc prostřední sloupek, inset sklo a dvě těsnění. Kliky jsou dva samostatné malé boxy; jejich větší přesah se nesmí stát tolerancí pro chybné křídlo.
- Každý actual triangle patří právě jedné podporované boxové komponentě a vychází z jejích skutečných rohových vrcholů do20µm. Orientace, úplné pokrytí všech6ploch, duplicitní trojúhelníky a uzavřenost hran se kontrolují samostatně. Chybějící plocha tedy neprojde jen díky stejné obálce.

## Ověření, cache a lifecycle

Příkaz: bundled Python `C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe -B scripts/cad-buildings/test_door_export_audit.py -v`, `PYTHONDONTWRITEBYTECODE=1`, `B06_DOOR_EXPORT_ACCEPTANCE=1`. **10/10 PASS**, exit0,1.471s v unittest; `.cache/b6-native-door-export-guard-20261025/tests-final.log`. Test čte actual GLB bytes, ověřuje SHA proti JSON a skládá skutečné material primitives podle částí. Aktuální počty:469wood+6glass=475dveří,962moving parts.

Negativní případy: root translation; object translation/rotation; Edit Mode translation a změna jednoho rohu s identity maticí; smazaná/duplikovaná/otočená plocha; samostatná změna skla/rámu/těsnění/klik; chybné identity/collision/role; stale hinge/handle; nečíselné vstupy a větší tolerance. Zvláštní regrese ztenčí wood leaf při **nezměněné celkové obálce díky klikám** a stále je správně odmítnuta. Široké glass fixture vyžaduje skutečný prostřední sloupek.

Žádné modelové nebo runtime změny, Blender, GPU, server, build ani opakování jiných70/80testů. Žádné dlouho žijící procesy, globální cache, nativní alokace nebo mutace vstupů. Lokální seznamy a čítače končí s jedním validačním voláním; geometrie se generuje pouze v testových fixtures, nikdy jako náhrada skutečného vstupu do validátoru. `-B` zamezuje cizím pycache výstupům. Přesné source/test/handoff a actual asset SHA jsou v `checkpoint.json` vlastní cache.

Vlastní procesy ukončeny. Po zápisu manifestu následuje release; root převezme doložené nové soubory a provede native wiring/Blender acceptance pod svým vlastnictvím. Samotný actualGLB PASS není nová Blender/GPU přejímka.
