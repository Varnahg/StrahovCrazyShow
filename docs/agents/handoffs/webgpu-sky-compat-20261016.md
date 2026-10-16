# Předání: webgpu-sky-compat-20261016

- Vlastník `webgpu-01a14497-sky`; příjemce `webgpu-01a14497-root`.
- WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-comparison`; navazuje na izolovaný engine experiment nad `960cb6f`, nikoli na jiné main WIP.
- Přesné soubory: `client/atmosphere-sky.ts`, `client/sky-weather.ts`, `tests/atmosphere-webgpu.test.ts`, tento handoff. Žádné jiné runtime/asset/cached soubory nebyly změněné.

## Důkaz a volba

První rootův skutečný Edge WebGPU smoke kandidáta `e0de700…` skončil chybou fragment shaderu: textureSample atmosférického noise není v uniform control flow, následovaly neplatné pipeline. Root původní důkaz zachovává. Source řetězec: `atmosphere-sky.ts` relief sample původně za pixelovými opacity/layer větvemi; další stejné riziko měly cloudField horizon return, hvězdy pod horizontem a Slunce/Měsíc s discard před vzorkováním.

Před změnou se ověřily všechny alternativy. Noise i stars používají `RawTexture.CreateRGBATexture(..., true, false, TRILINEAR)`; moonMap používá `new Texture(..., false, false, TRILINEAR)` s noMipmap=false. Pevné `textureLod(...,0)` by tedy změnilo minifikaci a mohlo způsobit aliasing u horizontu/hvězd. Explicitní textureGrad s gradienty připravenými v uniform flow zachovává podmíněné čtení, ale vyžaduje širší změnu společných helperů a předání gradientů. Babylon podporuje lokální DISABLE_UNIFORMITY_ANALYSIS, ale vypnutí diagnostiky nedělá neurčené derivace definovanými. Není použité. Vybrané přesunutí implicitních čtení před pixelové větve je nejmenší změna zachovávající textury/UV/mip policy a běžnou filtrovací cestu.

Primární zdroje: skutečný pinovaný Babylon 9.30 `WebGPU/webgpuTintWASM.js`, `webgpuEngine.pure.js`, `WebGPU/webgpuShaderProcessorsGLSL.js`, `WebGL/webGL2ShaderProcessors.js`, `Materials/Textures/rawTexture.js`; místní runtime shadery a explicitní argumenty textur. [WGSL derivace](https://www.w3.org/TR/WGSL/#derivative-builtin-functions) vysvětlují neurčený výsledek v nonuniform flow. Nejde o interpretaci FPS.

## Implementace a dopady

CloudField zachová časné uniform coverage vyřazení i jednotlivé uniform coverage gates; pixelový horizon return přesune až za čtení. Relief vzorkování zachová uniform detail gate, ale předchází opacity/layer větvím. Stars zachovají uniform brightness gate a vzorkují před pixelovým horizon testem. Sun/Moon cloud reads a lunar albedo read proběhnou před limb/horizon discard. Výsledné barvy/opacity vzorce, pozice, UV, textury, map dimensions, mipy, wrapping, sampling, gamma a kvalita se nemění. Jediný lokální cloudOpacity výsledek ve Slunci/Měsíci nahrazuje původní inline volání; nepřibývá cache ani nový resource lifecycle.

Tradeoff: při aktivní uniform vrstvě/detailu mohou textury nově číst i pixely později vyřazené horizontem/cloud opacity/lunar limb. Tato práce je skutečná; neslibujeme nezměněný GPU čas. Změna platí shodně na obou backendech, takže nové A/B musí použít tento společný checkpoint. Původní nedefinované implicitní derivace na hranách nelze považovat za garantovaný pixelově přesný výsledek; skutečný obraz horizontu, okrajů oblaků, hvězd a Měsíce ověřuje root.

## Ověření

Přidaný CPU test používá skutečný Babylon shader processor a přesné lokální glslang/Tint WASM kompilátory pro všech šest sky/sun/moon stages. Neukládá výstup, nesahá na síť ani GPU. Samostatná skutečná NullEngine kontrola ověřuje mipmaps/filter/wrap všech cloud/star textur. Není to náhrada browserové WGSL validace ani měření výkonu. Root spouští testy ze svého frozen scope spolu s existujícími atmosphere/light/night regresními testy a strict TypeScript; výsledky budou doplněny před předáním.

První targeted běh `.cache/webgpu-comparison/logs/sky-validation-targeted.log` měl 24/25 PASS včetně všech původních atmosphere/light/night regresí a šesti nezávislých WebGPU error-watcher testů. Nový compiler test skončil před kompilací: dodaný glslang browser wrapper neumí Node filesystem URL. Oprava testového loaderu vkládá skutečně přečtené lokální WASM bajty přes Emscripten `wasmBinary`; originální init/convert wrappery zůstávají stejné a test nepoužívá síť. První neúspěch je zachovaný a není důkazem shaderové chyby.

Druhý root běh `.cache/webgpu-comparison/logs/sky-validation-targeted-v2.log` má **25/25 PASS**, včetně skutečného lokálního GLSL→SPIR-V→WGSL pro všech šest stages. Výsledek potvrzuje průchod syntaxe/překladače a existující numerické/lifecycle regrese; browserovou uniformity validaci a obraz zatím netvrdí. Původní neúspěšný log nebyl přepsán. Root potvrdil **strict TypeScript v2 PASS, exit 0**. Jeho navazující build/GPU snapshot má SHA-256 `a1eb953f7dc9805ee01798e1f11da854215896aadc484d1d3b3d3a89aaad065d`, 8418 vstupů; build/GPU při tomto předání ještě nejsou dokončené. Celá sada se provede až nad stabilním kandidátem.

Scoped Prettier nového testu a git diff --check prošly. Žádný vlastní build/server/GPU/browser nebo dlouhožijící proces neběžel. Po explicitním stagingu čtyř vlastních souborů, samostatném commitu a předání se rezervace uvolňuje; konkrétní commit/release dostává root v závěrečné zprávě. Stav tasku/integraci a skutečnou GPU přejímku vlastní root.
