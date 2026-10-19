# KEY-31: první UV matrix bez redundantního WebGPU dirty scanu

- Task `webgpu-first-uv-helper-20261019`, owner `webgpu-01a15102-first-uv-helper`, root příjemce. Přímý BMAD leaf; žádný renderer, podagent, commit ani zásah do root runtime/patch/lock/dependencies/hraných buildů.
- Frozen manifest `.cache/webgpu-first-uv-helper-20261019/manifest.json`, SHA256 `601cbaa6db2989c14a66631e22c502515652e2f44cbeefad13816ac81726eb9e`;26 hashovaných vlastních artefaktů a osm pinned source vstupů.
- Jediný runtime `candidate/Textures/texture.pure.js`, SHA256 `f98c6a16047d4b6990351a415b002b3f0cc5886e9c6812aa5fc5cd49dc29ee93`, preimage `f27fd4a566579ea2cc99c43ae056e48546b3d433aded037ab97c997c6299a976` z native8fb/SDWf8. Dva přesné hunks a inverse byte-exact v `source-inverse.json`/`runtime.diff`. Od early handoffu runtime beze změny.

## Změna a kontrakt

- Před alokací se zachytí Boolean existence cached matrix. Global texture-dirty notification při identity změně se potlačí jen pro vůbec první výpočet na WebGPU. Matematika, aktualizace skutečné identity, same-parameter fast path a všechny pozdější přechody jsou původní. WebGL ponechá první i pozdější notifikace.
- Žádná nová cache, persistent state, UV option, shader feature či history/type guard. Stock PBR/Standard/NodeMaterial získává identity-dependent defines až z výsledku getteru. Read-only assignment scan current client/core/loaders nenašel getTextureMatrix assignment override; neprokazuje univerzální historii libovolného externího SDK uživatele.
- Výslovné omezení: third-party getter, který nejdřív vrací identity bez super a teprve po vytvoření shaderu poprvé zavolá stock getter, může první notification potřebovat. Tento kontrakt není podporovaný ani maskovaný neúčinným method/type guardem. Totéž platí pro ruční reset soukromé matrix cache a reentrant custom row-generation historii. `CONTRACT.md` obsahuje mechanismus, volbu a omezení.
- Skutečný profil doložil Texture→globaldirty→material fullscene scan, nikoli zda pozorované volání bylo první nebo pozdější. Proto přínos pro aktuální first-entry či všech pět hitchů není předem tvrzený.

## CPU proof a refaktoring fixture

- `node .cache/webgpu-first-uv-helper-20261019/run-proof.mjs`: genuine **RED2pass/2fail**, **GREEN4pass/0fail**, všechny child exit codes podle očekávání. Testy používají skutečný Texture/Matrix/clone: první identity/neidentity, matrix object fast-path, pozdější oba identity přechody, uBase2→1, clone fresh cache, optimize toggle a detached engine/no-scene return.
- Čtyři další original/candidate procesy (WebGL a WebGPU flag) vytvoří skutečné StandardMaterial/PBRMaterial/NodeMaterial sdílející jednu texturu, actual Mesh/Node graph a actual readiness/render. Každý projde šest stavů: první nonidentity, identity, další nonidentity, homogeneous rotation, optimize-off/on. **Úplná shoda matrix bytes/identity, defines, ordered shader ABI a celých shader source tabulek**; šest jedinečných shader textů na case je ověřeno i proti SHA, porovnání není hash-only.
- WebGL dirty counts A/B oba `[1,1,1,0,0,0]`; WebGPU A `[1,1,1,0,0,0]` proti B `[0,1,1,0,0,0]`. Pouze první redundantní notification zmizela; všechny ostatní výsledkové objekty jsou přesné. Explicitní assertions kontrolují změny DIFFUSEDIRECTUV/ALBEDODIRECTUV a Node UVTRANSFORM při identity přechodu.
- CPU substrate je NullEngine s real pinned classes a GLSL preprocessing/Effecty; PBR/Standard forceGLSL a Node GLSL. NullEngine.createRawTexture záměrně neoznačí GPU upload jako ready, takže fixture nastaví jediný decoded one-pixel InternalTexture ready bit. Shader/material readiness funkce nejsou nahrazované. Není to WGSL compiler, GPU/driver/image nebo frame-time proof.
- První dva material-spike pokusy čekaly na právě tento absentní NullEngine ready bit a timeoutovaly; původní logy zachované. Třetí actual material case dokončil všechny stavy, ale následné PowerShell zobrazování několikamegabajtového řádku se ručně přerušilo; Node proces už neběžel. Tento shell pokus není finální parity verdict. Následný runner píše raw tabulky do samostatných JSON a na stdout pouze malé metadata; šest childů finálního proofu dokončeno za6,4s bez oprav runtime.

## Reprodukce a převzetí

- Loader overlayuje pouze skutečný pinned `Materials/Textures/texture.pure.js` na jeho fyzické package URL. `FIRST_UV_CORE`/`FIRST_UV_MODULE` umožní root-owned replay; `FIRST_UV_VARIANT=A` bere nezměněný originál. Original/candidate parity tedy vyžaduje skutečně nepřepsaný base. `run-proof.mjs <outputDir>` zapisuje root replay výstupy odděleně; není třeba install ani fyzická kopie dependency.
- Root převzal early runtime po critical4green; full types/build, SHA-guarded Vite transform a skutečný Medium capture vlastní root. Helper nepouští žádný další CPU test po oznámení konce proofu, GPU, server ani build. Root musí podle skutečného výsledku přijmout/odmítnout; celková migrace/KEY31/32 nejsou tímto hotové.
- Všechny vlastní helper procesy ukončené. Po předání release; stav/integraci/Linear/commity řídí root. Frozen payload a manifest se bez hlášení nemění.
