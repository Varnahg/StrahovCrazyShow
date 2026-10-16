# Předání: webgpu-migrate-shadow-wrapper-20261016 / KEY-35

Vlastník `webgpu-mig-01a14497-vendor`, příjemce `webgpu-migration-01a14497-root`. Worktree `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí commit `43bde14`. Zápis je omezen na existující Babylon patch, jeho hash v lockfile, nový regresní test, tento handoff a `.cache/webgpu-migration-checks/vendor/`. Claim získán před prvním zápisem.

## Průzkum a rozhodnutí před implementací

Primární zdroje: pinovaný Babylon 9.30 `ShadowDepthWrapper`, GLSL/WGSL PBR/default/shadow includes, skutečný WGSL processor a společný processing context, projektové tree wind a custom ShaderMaterial wrapper callsites v cinematic/vehicle lighting. CPU experiment 16. 10. 2026 vykonal skutečný wrapper a processor. Directional normal bias odkazuje na bare `vNormalW`, ale native PBR/default používají `vertexOutputs.vNormalW`. Fragment extra deklarace se vloží pouze před GLSL `void main`, takže native soft-alpha postrádá `bayerDither8` a `softTransparentShadowSM`; packed point depth bez normal bias postrádá `pack` a `lightDataSM`. Část ostatních shadow uniforms/varyings se přenáší společným processing contextem; netvrdíme, že chybí vždy všechny.

Zvolena úzká změna pinovaného wrapperu: výchozí WGSL normal remap při zachování explicitních remapů a WGSL fragment include před `@fragment`. Původní GLSL větev zůstane totožná. In-memory kandidát odstranil všechny tři defekty pro výchozí i explicitní remap bez změny alpha discard. Alternativní subclass vyžaduje kopii privátní `_makeEffect`/map nebo manipulaci se sdíleným efektem. Vlastní shadow shader by duplikoval wind, alpha, instancing, bias a depth varianty. Vypnutí wrapperu/bias by měnilo obraz. Vendor patch proto nejlépe zachová cache, observer lifecycle i callsites; žádný upgrade ani globální ForceGLSL není potřeba.

Existující image-processing patch bude zachován po bytech a lockfile změní pouze starý patch SHA-256 na nový. Cílené CPU testy používají fyzickou kopii core v přiděleném stagingu; ostatní dependencies pouze read-only. Žádné `pnpm exec`, instalace, editace historického node_modules, GPU, build nebo fullsuite.

## Výsledek a ověření

Hotová úzká CPU oprava. Výchozí WGSL normal remap se přidává jen pokud seznam explicitně nepřemapoval klíč `vNormalW`; zůstává funkční i prázdný či world-only seznam. Úplné vlastní remapy mají přednost. Přidání výchozího páru probíhá pouze při vytvoření nového efektu po cache kontrole, nikoli v každém snímku. Ostatní remapování a GLSL fragment větev zůstaly zachované. Native fragment dostává jazykově správný include před `@fragment`; předchozí KEY-24 zajišťuje jeho registraci. Žádné nové observables, timers, efekty navíc, přepínání režimu nebo nové vlastnictví zdrojů.

Test vykonává skutečné PBR/default shader templates, projektový TreeWindPlugin, explicitní custom ShaderMaterial remap, ShadowDepthWrapper a WGSL processor. Nahrazeno je jen vytvoření GPU efektu. Devět případů kryje directional normal bias, soft alpha a packed point bez normal bias u PBR/Standard/custom materiálu. Navíc se ověřují prázdné/world-only remapy, alpha discard a wind text, tři přesné původní GLSL source/binding hashe, obě `doNotInjectCode` větve a zachování cache + jediné uvolnění invalidovaných efektů. Původní GLSL golden hashe byly zachyceny nad nezměněnou pinovanou třídou; nezahrnují náhodné effect tokeny.

### Skutečné kontroly

Všechny běhy proběhly 16. 10. 2026 ve vlastním `.cache/webgpu-migration-checks/vendor/`, přímým Node CLI. Core je fyzická kopie s link count 1; ostatní potřebné dependency adresáře jsou read-only junctions. Neproběhlo `pnpm exec` ani install. Historické tři dotčené vendor soubory mají po dokončení shodné hashe jako před kopií.

| Běh | Výsledek | Log |
|---|---|---|
| Příprava fixture nad původním core | Zachované selhání: ještě prázdné golden hodnoty a příliš doslovný whitespace assertion | `fixture-preparation.log` |
| Red nad původním core, 15:06:55 UTC | **7 PASS / 8 FAIL**, exit 1; skutečné native deklarace/remap | `red.log` |
| První kandidát | **15/15 PASS**, exit 0 | `green.log` |
| Doplněný prázdný/world-only remap proti prvnímu kandidátu | **0 PASS / 1 FAIL**, exit 1 | `partial-remap-red.log` |
| Finální wrapper + import closure + původní image-processing ownership | **29/29 PASS**, exit 0; 16 + 3 + 10 testů | `related-final.log` |
| Scoped strict TypeScript nad finálními source/testy | **0 diagnostik**, exit 0 | `types-final.log` |
| Nové použití kompletního patche na obnovované nepřepsané vendor soubory | PASS; všechny tři výsledné soubory přesně shodné s testovanými | `clean-apply-final.json` |
| Prettier pouze nového testu, `git diff --check` | PASS | výstup relace |

Příkazy: `node --import tsx --test --test-concurrency=1 tests/webgpu-shadow-depth-wrapper.test.ts tests/render-shadow-includes.test.ts tests/babylon-image-processing-ownership.test.ts`; `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --lib ES2022,DOM,DOM.Iterable tests/webgpu-shadow-depth-wrapper.test.ts client/render-shaders.ts client/tree-wind.ts`.

První lokální git-apply byte kontrolu ovlivnil Windows `core.autocrlf`: všechny tři soubory převedl na CRLF, text byl shodný. Pokus je zachovaný v `clean-apply/`. Nový kontrolovaný `git -c core.autocrlf=false apply` nad čerstvým subsetem potvrdil i bajtovou shodu. Nejde o čistou pnpm instalaci; tu provede root před integrací.

Původní image-processing patch je nezměněný prefix původních bajtů. Lockfile změnil pouze šest výskytů původního hashe na nový. Finální patch SHA-256: `71971bf14ec2f5a837f8d71962ebf9844c0e027f77336f57fda134b79d495fe3`. Finální testovaný ShadowDepthWrapper SHA-256: `bd2bfe313728751f375d613492e7210adb09733556dcb8e6f2d8e720b55f122c`. Kompletní source/test/log hashe a kontroly jsou v `.cache/webgpu-migration-checks/vendor/checks.json`.

Root převezme pouze čtyři verzované own cesty, provede čistou frozen instalaci, stabilní plnou pipeline a GPU kompilaci/obraz stínů stromů/aut. CPU výsledek sám není Done pro KEY-35 ani migraci. Původní frozen comparison, frozen4188 a sdílené instalace nejsou upravené. Žádný vlastní dlouhožijící proces nezůstává. Po samostatném commitu se claim uvolňuje; commit a potvrzení release dostává root ve zprávě.
