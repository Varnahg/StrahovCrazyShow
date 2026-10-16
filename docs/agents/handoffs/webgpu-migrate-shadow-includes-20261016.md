# Předání: webgpu-migrate-shadow-includes-20261016 / KEY-24

Vlastník `webgpu-mig-01a14497-shadow`, příjemce `webgpu-migration-01a14497-root`. Pracovní kopie `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí commit `d46b3d3`. Scope jsou pouze `client/render-shaders.ts`, `tests/render-shadow-includes.test.ts`, tento handoff a `.cache/webgpu-migration-checks/shadow/`. Claim získán před zápisem; žádný cizí WIP se nepřebírá.

## Rozhodnutí před implementací

Primární podklady 16. 10. 2026: pinovaný Babylon 9.30 `ShadowDepthWrapper`, `ShadowGenerator._initShaderSourceAsync`, `ShaderStore`, `ProcessIncludes`, Vite 8.3.4 HTML fallback, skutečná registrace hry a historické B1/B2/B3 JSONL. WebGPU ShadowGenerator registruje WGSL includes, ale GLSL wrapper zachová jazyk materiálu a potřebuje šest GLSL includes. Pět z nich hledá přes `.fx`; šestou deklaraci vkládá přímo ze store. CPU reproduktor se skutečným ProcessIncludes vložil pět kopií 504B index.html. Resource okna B1/B2/B3 mají přesně 4020/1500/1500 B, odpovídající pěti HTML odpovědím / cached odpovědím. Původní konkrétní HTTP URL/body v archivu chybí, proto finální historické spojení zůstává předmětem nového GPU reproduktoru.

Vybrána explicitní registrace šesti drobných includes v obou jazykových storech na stávajícím registračním místě. Nevyžaduje nový stav, per-frame práci, timer, GPU pipeline, světlo či lifecycle vlastníka. Globální ShadowGenerator.ForceGLSL by změnil další shaderové cesty a neodpovídá cíli native WGSL migrace. Import celého shadow rendereru není nutný pro známou dependency closure. HTTP 404 guard by odstranil HTML symptom, ale nedodal chybějící shader; patří do oddělené diagnostické/hostingové práce. Kopírování vendor shader textů by vytvořilo druhý zdroj pravdy.

Regrese má vykonat skutečnou injekci ShadowDepthWrapper a skutečné ProcessIncludes bez GPU. Negativní kontrola zachová chybějící include/HTML mechanismus; red→green běh použije stejný test nad původní a opravenou registrací. Výsledek nesmí být vydáván za shaderovou kompilaci nebo obrazovou přejímku.

Native WGSL omezení: pinovaný wrapper vkládá fragmentExtraDeclaration přes GLSL `void main` regex. Registrace obou jazyků sama nepotvrzuje kompletní native WGSL generování; root byl upozorněn na nutnost zvláštního ověření deklarací a skutečné kompilace.

## Výsledek a ověření

Hotová CPU část: stávající registrační modul doplnil šest GLSL a šest WGSL include importů. Shader texty jsou nadále pinované vendor zdroje. Globální ForceGLSL, světla, materiálové hodnoty, geometrie, limity ani renderer se nemění. Žádná nová cache nebo opakovaná práce za snímek; ESM registry vzniká jednou při načtení. Jde o cílené sjednocení jazykových závislostí na existujícím místě, bez nového runtime helperu.

Nový test zachovává skutečný Babylon ShadowDepthWrapper a ProcessIncludes. Nahrazuje pouze vytvoření GPU efektu a HTTP IO. Kontroluje zachování shaderLanguage, alpha define a shadow uniforms, kompletní GLSL/WGSL include rozklad bez fetchů/HTML/undefined, včetně šesté deklarace. Negativní kontrola stále reprodukuje přesně pět `.fx` požadavků a pět HTML substitucí. Native WGSL kontrola je důkaz importů/rozkladu, nikoli oprava výše uvedené deklarace wrapperu nebo kompletní shaderová kompilace.

Vlastní staging `.cache/webgpu-migration-checks/shadow/` obsahuje pouze potřebné kopie source/test/package a read-only použitý junction na historické dependencies. Žádná instalace ani editace přes junction neproběhla. Všechny příkazy jsou krátké CPU kontroly a ukončily se:

| Kontrola 16. 10. 2026 | Výsledek | Log |
|---|---|---|
| Stejný finální test, původní registrace z `d46b3d3`, přibližně 14:50:48 UTC | **1 PASS / 2 FAIL**, exit 1; chybějící GLSL/WGSL include | `red-final.log` |
| Finální registrace + stejný test, přibližně 14:50:51 UTC | **3/3 PASS**, exit 0 | `green-final.log` |
| Scoped strict TypeScript pro oba soubory | **0 diagnostik**, exit 0 | `types.log` |
| Scoped Prettier a `git diff --check` | PASS | výstup relace |

Příkazy ze stagingu: `node --import tsx --test tests/render-shadow-includes.test.ts`; `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node --lib ES2022,DOM,DOM.Iterable client/render-shaders.ts tests/render-shadow-includes.test.ts`.

Manifest se shodou source/staged hashů a hashů logů: `.cache/webgpu-migration-checks/shadow/checks.json`. Runtime SHA-256 `e73d2d242eb18d2c876cee60f6811bc41061520eee4718d1e9eb583252e60fd0`; test SHA-256 `b09f46ab9374d43e5cadf9453ce5ce27b1e5b496a46ffc5e4f78e7e55011f44c`. Původní red pokusy i baseline soubor zůstávají zachované. První pokus o vytvoření stagingu měl neexistující cwd a nic nevykonal; následné vytvoření z kořene uspělo.

Žádný GPU, server, build ani fullsuite nebyl spuštěn. Historický frozen comparison a frozen4188 zůstávají neměnné. Root musí provést samostatnou stabilní pipeline a skutečné R bez peers / peers bez R / peers+R včetně capture `.fx` odpovědí, shader compile/Promise chyb a stínového obrazu. CPU PASS neuzavírá celý KEY-24 ani migraci.

Po samostatném commitu pouze tří vlastních verzovaných cest se claim uvolňuje; přesný commit a výsledek release dostane root v závěrečném předání. Žádný vlastní dlouhožijící proces nezůstává. Linear, přijetí tasku a následnou integraci spravuje root.
