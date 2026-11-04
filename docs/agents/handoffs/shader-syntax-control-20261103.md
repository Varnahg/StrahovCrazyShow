# Předání: shader-syntax-control-20261103

Aktuální root integrace3.11.: controller je zapojený do Game s finálním native API, whitelist zahrnuje v4 admission counters. Game drží cache do dispose, explicitní loopback `shaderSyntaxCache=1`, defaultOFF. Native/controller/Game70/70, build a SDK PASS; [C9](../../performance/evidence/shader-syntax-cache-20261103/final-campaign.md) neposkytl potřebnou výkonovou přejímku, proto zůstává nepřijatým experimentem. Níže je původní autorovo předání; žádný výkonový přínos se jeho unit výsledkem netvrdí.

- Vlastník: `syntax-control-20261103` (`/root/performance_evidence`); příjemce: `/root`.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí HEAD `6c31b9a99c29ffe06a093f033f15394bb250bfd8`.
- Rozsah: nový `client/shader-syntax-cache.ts`, `tests/shader-syntax-cache.test.ts`, toto předání; task dovoluje také `.cache/shader-syntax-control-20261103/`.
- Cizí WIP: Game, native patch, dependency instalace a další render helpery zůstávají jejich vlastníkům. Žádný z těchto souborů tento task nemění.

## Výzkum a volba

Primární lokální Babylon 9.30: `webgpuEngine.pure.js:378–379,922–926` vlastní oddělené GLSL a WGSL processory. Řadič zavolá skutečný `_getShaderProcessor(1)` s původním receiverem a ověří identitu s `_shaderProcessorWGSL`. Nezavádí cache na libovolný custom processor. `:475–481` hlásí device loss enginovým observable; `:3090–3100` nastaví disposed a zničí zařízení ještě před zděděným dispose observable (`abstractEngine.pure.js:1523–1561`). Proto se při operacích kontroluje i disposed flag a identity zařízení/processoru. `abstractEngine.pure.js:244–259` nečeká na async init před restored notifikací; restored není důkaz připravenosti a řadič ho nepoužívá k opětovnému zapnutí.

Native factory kontrakt v souběžně autorem spravovaném patchi: jeden lease na processor; explicitní default off; disable vyčistí entries, reset také čítače, dispose clear + release pouze vlastníka; disposed snapshot zůstává dostupný. Factory deklaruje `IShaderProcessor`, proto controller používá type-only import a strukturální injekci, nikoli předčasný named import dosud neinstalované funkce.

Varianty: globální/prototype hook by zasáhl další enginy; startup-only lease by zahodila cache před pozdějším prvním použitím materiálů; automatické obnovení při context-restored by předpokládalo neprokázanou připravenost. Původní návrh vlastního `_getShaderProcessor` wrapperu odmítlo cílené čtecí review: kolidoval s již existujícím CPU profilerem, jenž hlídá výhradní vlastnictví stejné metody. Finální malý per-engine controller proto nemění žádnou metodu. Žije po celou Game, při skutečném retirement terminálně uvolní lease a vlastní observers. Native loss/dispose je okamžitý; náhradní výměnu identity zařízení/processoru zachytí konstantní nealokující `onBeginFrame` kontrola (`abstractEngine.pure.js:393`) a veřejné operace. AST cache nemá GPU stav. Mezi kontrolami není slibováno zachycení svévolné změny interního fieldu ve stejné synchronní úloze. Return/throw/receiver/argumenty a shader readiness zůstávají nedotčené. Pozdější cizí hook se nepřepisuje; regrese ověřuje souběh se skutečným CPU profilerem v obou pořadích.

`shared/session-diagnostics.ts:31–34,67–108,121–169` je skutečný client/server privacy kontrakt. `profile` se zahazuje. Snapshot používá `syntaxCache`/`stats`, explicitní whitelist numeric/boolean native polí, žádné obecné kopírování textů či AST. Čítače jsou UTF-16 units/počty objektů podle native kontraktu, nikoli heap bytes nebo GPU paměť.

## API a lifecycle

`new ShaderSyntaxCache(engine, { createCache, enabled?: boolean, maxEntries?, maxTextUnits?, maxNodes?, maxOperators? })`; `setEnabled(boolean)`, `reset()`, `snapshot()`, `dispose()`. Po ukončení jsou mutátory no-op. WebGL nevolá factory, nečte WGSL vlastnosti ani neinstaluje hooks/observers. Factory vstup je původní `IShaderProcessor`; jeho lease metody se volají s původním receiverem.

Snapshot obsahuje `active: boolean | null`, `activityKnown`, `supported`, `requestedEnabled`, `inert`, `disposed`, `reason`, `statsCurrent`, `cleanupIncomplete`, pět chybových čítačů a ploché `stats|null`. `active=null` znamená neznámou aktivitu po factory/snapshot chybě. Při vadném dispose nesmí disposed controller tvrdit, že native cache už není aktivní: zachovává poslední skutečné primitive údaje a cleanup failure. Text výjimky se neukládá. Normální native dispose sám clearuje; při jeho výjimce controller zvlášť zkusí disable/reset a vždy pokračuje v ostatním cleanupu.

Refaktoring: společný `releaseLease` pro běžné i synchronně reentrantní ukončení při factory; společný guarded cleanup; žádné vlastnictví metod; bounded whitelist snapshotu a oddělené unknown/stale stavy. Žádná per-frame alokace či scan, jen konstantní kontrola identity, žádné device.lost Promise closure navíc.

## Ověření a předání

Root po byte auditu dependency reconcile výslovně povolil lehké testové okno. Runtime pro tyto kontroly: TSX 4.23.15 / TypeScript 5.9.3 beze změny; instalovaný Babylon shaderProcessor js+d.ts byl staged kandidát native autora, proto to není starý native baseline. Testy používají injektovaný lease a skutečný Babylon WGSL getter/Observable/CPU profiler. Vite se v nich nespouští. Žádný `pnpm exec/run` ani package reconcile tento task nespouštěl.

- `node --import tsx --test tests/shader-syntax-cache.test.ts`: **12/12 PASS**, 0 fail/skip, exit 0, 1081.1329 ms; `.cache/shader-syntax-control-20261103/targeted-01.log`.
- `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --esModuleInterop --resolveJsonModule --allowImportingTsExtensions --strict --types 'node,vite/client' --lib 'ES2022,DOM,DOM.Iterable' client/shader-syntax-cache.ts tests/shader-syntax-cache.test.ts`: **PASS**, exit 0; `.cache/shader-syntax-control-20261103/types-01.log` (prázdný úspěšný výstup).
- Scoped `git diff --check`: PASS. Nové soubory jsou untracked, žádný staging.
- Čtecí review primárních zdrojů i finálního helperu: původní kolize getter hooku vyřešena, další konkrétní nález `[]`. Čtecí review testy nespouštělo.

Oba procesy skončily před 16:00:54 UTC 3.11.2026. CPU autor i root dostali explicitní DONE, než native autor spustí časované benchmarky. Žádné další testy během jeho měření nejsou plánované.

Žádný build, full suite, GPU, server, instalace závislostí, staging nebo commit z tohoto tasku. CPU/controller testy samy nepředstavují přijetí cache, FPS ani vizuální paritu. Root po frozen patch instalaci ověří skutečné native API a integruje celou Game.

Source je zmrazený po kontrolách; změny ve 3 předaných souborech přebírá root. Rezervace bude uvolněna bez vlastních živých procesů; release není prohlášení o přijetí optimalizace. Root je integrátor a doplní skutečnou native integraci/produkční přejímku i stav tasku.

Frozen SHA-256 (3.11.2026 16:00:54 UTC):

- `client/shader-syntax-cache.ts`: `77c0247b8c50fbc99db9eb7f781f7976707e293dd4352dd0bfa635f53135a322`.
- `tests/shader-syntax-cache.test.ts`: `d38659ef2b8d35cb8d3f33383df418c6b452273443cdd1d91db81e7198b311d5`.

Předání a uvolnění rezervace: 3.11.2026 přibližně 16:02 UTC. Vlastní pomocné procesy: žádné živé, žádné porty/GPU zdroje.
