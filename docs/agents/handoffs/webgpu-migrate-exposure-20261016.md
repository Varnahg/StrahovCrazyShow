# Předání: webgpu-migrate-exposure-20261016 / KEY-36

- Vlastník: `webgpu-mig-01a14497-exposure`; příjemce: root `01a14497`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, `codex/webgpu-migration`; katalog zadání `d3bd6c0`, předchozí výzkum `e9b198f` a upřesnění patch provenance `3c8ab85`.
- Výsledek: úzká oprava CPU invalidace expozice, ověřená skutečnými Babylon materiály/efekty/observables a CPU uniform transportem. Produkční podfázový čas a GPU obrazová/výkonová přejímka zůstávají otevřené. KEY-32/KEY-36 se tím automaticky nestávají Done.
- Přesné změny: `patches/@babylonjs__core@9.30.0.patch`, `pnpm-lock.yaml`, `tests/image-processing-value-updates.test.ts`, tento handoff. Pomocné fyzické kopie, originály a logy jen v `.cache/webgpu-migration-checks/exposure/`.
- Cizí WIP: nic nepřevzato. Root Game/UI/startup/instrumentace, health a acceptance patří jejich vlastníkům. Žádný zdrojový node_modules, hraný snapshot, port ani asset nebyl změněn.

## Výzkum a rozhodnutí

[KEY-32 průzkum](../../performance/webgpu-cache-research.md) uzavírá cestu `skyWeather` → soumrakový daylight → `campusExposure` → config observer → opakovaný traversal všech scene submesh/render-pass wrappers pro každý Standard/PBR materiál. Přímé `_exposure` by odstranilo traversal, ale skutečný DefaultRenderingPipeline test prokázal zastaralý bloom uniform. Cached material membership by zasáhlo podstatně širší lifecycle a render-pass kontrakt. Kvantizace expozice by změnila obraz a nebyla zvolena.

Koordinátor schválil zachovat všechny notifikace a vynechat pouze material define traversal pro exposure změnu, která nemění `exposure !== 1`. Změny 1↔non1 a ostatní configuration setters zachovávají plnou invalidaci.

## Implementace a cílený refaktoring

Append-only patch mění jen `Materials/imageProcessingConfiguration.pure.js` a `Materials/imageProcessing.js`:

- Expozice při změně čísla vždy uloží přesnou původní JS hodnotu a pošle původní payload všem původním observer maskám. Stejná hodnota zůstává no-op.
- Value-only dispatch dostane identitní marker přes existující `EventState.userInfo`; jeden objekt se lazy alokuje na konfiguraci, žádná nová alokace na každý snímek.
- Mixin přeskočí traversal jen při přesné shodě markeru své konfigurace. Bloom a ostatní consumers obdrží notifikaci beze změny. Nenahrazuje se Observable ani globální prototype.
- `try/finally` obnoví metadata vnějšího dispatch. Prostý config boolean byl zamítnut, protože vnořená přímá `notifyObservers` by jej nesprávně zdědila. Přímé nested notify zůstává konzervativně plná invalidace; oba směry vnořených setterů zachovají skutečnou define změnu.
- V testech je společný fixture skutečných material families a jednotný per-instance invalidation observer. Instance se ověřuje přes její skutečný source render efekt; nevymýšlí se samostatný instanced efekt. Všechny scény/enginy a UBO mají vlastněný teardown.

Původních **5950 bajtů patche je beze změny**, včetně postprocess ownership/disposal a WGSL shadow wrapperu. Pinovaný existující owner-keyed UBO mechanismus se nemění. Nový patch má 9103 bajtů a SHA-256 `5e2a931df89822e98cdea08310fcd84f734aed60ba95499c93cda0eccca77115`; lockfile mění jen šest výskytů předchozího patch hashe `71971bf14ec2f5a837f8d71962ebf9844c0e027f77336f57fda134b79d495fe3`. Žádná verze či resolution se nemění.

## Skutečné ověření

Vlastní core je fyzická kopie ze zmrazených native-v3 dependencies, ne junction/hardlink do živých balíčků. TypeScript/tsx/@types se pouze čtou přes junction; instalace ani `pnpm exec` se nespouštěly.

1. Před změnou core vznikl RED `exposure-red-v3.log`: **2/7 pass, 5 fail**. Skutečné same-define změny dělaly 4 material invalidace / 40 `getMaterial` návštěv proti očekávaným0; nested/bloom/custom config testy odhalily stejnou příčinu. Původní pomocné `exposure-red.log` a `exposure-red-v2.log` uchovávají opravené fixture chyby: chybějící instancedMesh side-effect import a chybný předpoklad vlastního instance efektu. Nejsou vydávány za produkční chyby.
2. Po patchi a cíleném refaktoringu finální `exposure-green-v3.log`: **8/8 pass**, exit0, 1.967 s celkem. Příkaz z vlastního stagingu: `node node_modules/tsx/dist/cli.mjs --test tests/image-processing-value-updates.test.ts`.
3. Pokrytí: Standard/PBR/metallic-roughness/specular-glossiness, MultiMaterial a source instancing, frozen/unfrozen přesný příští uniform bind se zachovaným Effect; 1↔non1 skutečné defines; ostatní color/texture/white-balance/tone/contrast/enabled/postprocess setters; unchanged values; nested setters v obou pořadích; přímé nested notify; observer throw a následné zotavení; observer masks, late subscriber a dispose během dispatch; pozdě přidaný materiál a nezávislá config; skutečný cinematic pipeline/bloom bind; skutečné WebGPU leftover UniformBuffer třídy s CPU buffer transportem v původním i owner-keyed režimu.
4. `node typecheck.mjs` → **2953 souborů / 0 diagnostik**, exit0, `exposure-types-v2.log`. Předchozí `exposure-types-v1.log` zachovává pouze opravené přístupy testu k protected/private Babylon diagnostickým hookům.
5. `git apply --check` nových hunks nad čistými dvěma originály PASS. Následně skutečné `git apply` vytvořilo soubory bajtově shodné s otestovanou fyzickou kopií. `patch-verification.json`: prefixUnchanged=true, lockOnlyHashChanged=true. Patched SHA: config `f0b452b09bfe47b6eccf4c6369480391cb25a02e497cd8fddc182fcec5bfe043`, mixin `902800495f4c7d3f01c51662a350150c33760dddb8de4f6e27b049623698bb3e`.
6. `source-preservation.json` potvrzuje, že oba původní dependency soubory zůstaly bajtově shodné s originály a editované kopie nejsou symlink. Scoped Prettier a `git diff --check` PASS.

Dílčí `exposure-green-v2.log` obsahuje jednu později opravenou testovou domněnku: outputTextureWidth/Height jsou stávající plain value fields, nikoli dirty setters. Finální regrese ověřuje i jejich původní chování, nemění vendor API kvůli chybnému testu.

## Omezení a převzetí

- CPU test dokládá mechanismus, přesná data a cache/lifecycle. NullEngine ani CPU transport stub nejsou obrazové/GPU měření a netvrdí produkční zrychlení nebo vyřešení 1Hz browser cadence.
- Původní session environment fáze je skutečně drahá, ale podíl expozice zatím nemá přímé produkční podfázové měření. Root jej doplňuje odděleně; reálný foreground/occlusion stav zůstává součástí měření.
- Root provede novou čistou instalaci s novým patch hashem v odděleném snapshotu, stabilní plnou sadu/build/integraci a skutečnou WebGPU paritu včetně bloom, času/počasí, různých avatarů a světel. Plná instalace kombinovaného patche nebyla v tomto CPU tasku spuštěna.
- Žádný vlastní dlouhožijící proces, server, GPU ani build. Testovací procesy skončily. Po commitu přesných čtyř souborů a předání rootovi bude rezervace uvolněna; integrátor spravuje Linear a konečné přijetí.

## Závěrečné přijetí koordinátorem18.10.2026

Doplněný GPU průchod a nezávislé review dokončily původní scope KEY-36. [Produkční evidence](../../performance/evidence/webgpu-migration-20261016/exposure-acceptance/README.md) prokazuje dvě skutečné exposure hodnoty ve spojitém rendereru, modrá→noc→modrá snímky a zachovaný bloom.8actualBabylon regresí nad skutečně použitými exposure dependencies znovu8/8PASS; samotná implementace zůstává main667ce466. Jednotlivý setter-frame a izolovaný CPU/FPS přínos nejsou změřené. Nové QA také obsahuje jiné dosud nepřijaté změny; jejich přejímku tento výsledek nenahrazuje. Vlastní QA služby ukončené, hranébuildy zachované. Koordinátor webgpu-exposure-acceptance-01a14497.
