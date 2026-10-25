# Předání: terrain-20261025-effect-identity

Integrátor po převzetí: celý build candidate-v4 zachytil TypeScript nullable typ Effectu za optional-chain assertionem. Rozděleno na přímé `assert.ok(effect)` a `assert.ok(effect.isReady())`; test se neoslabuje, produkce se nemění. Původní build log je zachovaný, cílená regrese a úplný tsc se opakují v root validační cache.

- Owner `terrain-effect-01a16b37`; příjemce root.
- Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, větev `codex/terrain-quality-20261025`, baseline `ff13fa2b`.
- Změněn pouze nový `tests/ground-effect-identity.test.ts`, tento handoff a vlastní `.cache/terrain-effect-identity-20261025/`. Žádné produkční soubory ani engine patch se neupravovaly. Ground autor dodal identity-only `getClassName()` v samostatném scope, SHA `e85940f4b05a169f0846ef1f4fb7efe253eb4b8028ac0446ccd51eaac862ea26`.

## Skutečný mechanismus a přejímka

Fixture používá skutečné PBR materiály, `MaterialPluginManager`, GLSL processing, UBO layout, `ThinEngine.createEffect` a retained submesh Effect. NullEngine nahrazuje pouze driver/texture IO. Nejsou vymýšlené Effect objekty, cache klíče, shaderový obsah ani uniform reflection.

Čtyři testy pokrývají ground-first a paving-first pro oba stavy:

1. Legacy subclasses vracejí pouze původní `MaterialPluginBase` identity. Vlastní freshly-prepared PBR defines obou materiálů jsou úplně stejné, skutečný Effect je totožný a druhý owner nezkompiluje nový program. Ground-first kontaminuje paving ground kódem a deklarovanými sampler jmény; paving-first naopak připraví ground o tento kód a jména. Tyto PASS znamenají reprodukci vadného mechanismu, nikoli přijetí legacy chování.
2. Skutečný produkční `GroundCoverMaterialPlugin` má jiný Effect než skutečný `CampusSurfaceArtPlugin`. Po odebrání pouze `MATERIALPLUGIN_*` řádků se celé defines musejí rovnat. Paving Effect neobsahuje ground kód ani deklarace/jména jeho tří samplerů. Další skutečný ground owner se stejnou shaderovou třídou, ale opačným uniform-only `soilBase`, sdílí ground Effect bez nové kompilace a má vlastní UBO.

Repetition je explicitně nastavena na **0 po konstrukci pluginu** a test ověřuje `#define TEXTURE_REPETITION_MODE 0` na každém ownerovi. Budoucí zapnutí HEX_TILING tak nemůže zamaskovat selhání identity v této fixture.

NullEngine `getUniforms()` vrací `[]`; skutečný WebGLPipelineContext proto odstraňuje všechny položky z `Effect.getSamplers()`. Tento limit se neobchází falešnými driver locations. Test kontroluje původní deklarovaná jména skutečného `Effect.getUniformNames()` spolu s `uniform sampler2D` deklaracemi ve skutečném `Effect.fragmentSourceCode`. Reflektované GPU sampler bindingy a výsledné barvy ověří root ve statickém A/B.

## Ověření

Po aktivaci D prostředí:

```text
node node_modules/tsx/dist/cli.mjs --test tests/ground-effect-identity.test.ts
```

**4/4 PASS**, exit 0, **1,403 s**. Log `.cache/terrain-effect-identity-20261025/tests-accepted.log`.

Původní nezdařené fixture kroky zůstávají v oddělených logách: `tests-initial.log` / `tests-readiness-diagnostic.log` zachycují nepřipravenou RawTexture IO větev; `tests-texture-io.log` zachycuje prázdnou driver sampler reflection; `tests-final.log` odhalil neexistující convenience getter UBO (nahrazen skutečným deklarovaným `_uniformBuffer` polem). Žádný produkční mechanismus se kvůli výsledku neměnil.

Neproběhl širší test, build, browser, GPU, server ani commit. Zdrojový pohled na `materialPluginManager.pure.js:42`, `thinEngine.pure.js:1682` a `effect.pure.js` předcházel fixture; existující core patch tento cache klíč ani plugin class identity nemění. Celková typová/integrace a GPU přejímka zůstávají rootovi.

## Checkpoint a rezervace

Původní `.cache/terrain-effect-identity-20261025/checkpoint.json` byl vytvořen v okamžiku, kdy už spolupracující autor přešel k fázi 2. Je proto nahrazen níže uvedeným explicitně ověřeným checkpointem; původní logy zůstávají zachované.

## Ověření po souběžném přechodu GroundCover do fáze 2

Root potvrdil, že identity-only v3 s `e85940f4…` je již neměnně zmrazená a živý GroundCover dostal další autorizovanou úpravu antitilingu. Původní owner znovu získal tentýž task pomocí doloženého `--adopt-dirty`; žádnou produkci neupravoval.

Tentýž **nezměněný** nový test byl spuštěn ještě jednou. Hashe před/po jsou zaznamenané v `.cache/terrain-effect-identity-20261025/phase2-inputs.json` a jsou shodné:

- GroundCover `b067d8ad8093227c719484ab32d71eb235f91d6486d5703a64567199f635f8cc`
- CampusSurfaceArt `8c81e090a9cc1e0c02f8668c5daed57fbf9939d376be7386b5e87f7f47cb0f7b`
- Test `7bb9046eaf3be7b1f3fabc5b1de2f9b325c173e9904453129d3aaf2609490369`

**4/4 PASS**, exit 0, **1,296 s**, log `tests-phase2-accepted.log`. I nad novým shaderem zůstávají obě repetition hodnoty/defines přesně 0; jejich shoda se asertuje, takže výsledek neplyne z rozdílného HEX_TILING.

Finální manifest je `.cache/terrain-effect-identity-20261025/checkpoint-phase2.json`, s hashi testu/handoffu, čtených produkčních vstupů, pinovaného engine řetězce a přesně přiřazeného nového logu. Vlastní procesy skončily, claim je znovu uvolněný. Identity-only v3 GPU A/B ověřuje root odděleně; tento CPU checkpoint je nepředstírá.
