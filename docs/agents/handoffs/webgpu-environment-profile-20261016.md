# Předání: webgpu-environment-profile-20261016

- Vlastník: `webgpu-mig-01a14497-environment` (`/root/stack_options`); příjemce: koordinátor `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`; výchozí commit `e6e89a05c45b193e6771f76bd0eb0a33da0116fa`.
- Výsledek: úzký CPU profiler připraven pro zapojení koordinátorem. Samotný modul a CPU kontrakt jsou ověřené; KEY-32/KEY-36 ani GPU přejímka tím nejsou hotové.
- Změněné soubory: `client/environment-profile.ts`, `tests/environment-profile.test.ts`, toto předání. Pomocné kopie, logy a manifest pouze `.cache/webgpu-migration-checks/environment/`.
- Cizí WIP: výchozí `git status --short` byl čistý. Žádná převzatá cizí změna, žádný zápis do Game/UI, task katalogu, dependencies, hrané verze či historických snapshotů.

## Průzkum a rozhodnutí

Skutečný `Game.updateRenderEnvironment` obsahuje deset sekvenčních bloků: sky/weather, art lighting, car, vehicle lights, flashlight, vegetation, transit, precipitation, surfaces a cinematic. Práce uvnitř `cinematic.update` může synchronně vyvolat image-processing/material listenery. Stávající `BenchmarkRenderProfile` sleduje Scene/ObjectRenderer observables při renderu; nerozliší tyto aktualizace před `scene.render`. Jeho intervaly proto nelze použít jako přímý důkaz nákladů expozice v environment fázi.

Primární podklady: produkční `client/game.ts`, `client/benchmark-render-profile.ts`, `client/render-incident-profile.ts` a lokální URL kontrakt `client/render-engine.ts` přečtené 2026-10-16; [W3C High Resolution Time, monotonic clock](https://www.w3.org/TR/hr-time-3/#monotonic-clock) ověřený téhož dne. `performance.now` má monotónní časovou základnu a může mít omezené rozlišení, proto jsou stejné sousední vzorky platné. Naměřené wall intervaly zahrnují i synchronní čekání, GC a přerušení procesu; nejde o čistý součet vykonaných CPU instrukcí či GPU timestamp.

Porovnané varianty:

- Explicitní `begin` a pevné hranice: jeden předalokovaný buffer, bez obalování produkčních callbacků, jasná atribuce. Zvoleno pro úzkou diagnostickou otázku a minimální zásah do lifecycle.
- `performance.mark/measure`: globální timeline entries, potřeba vlastního pojmenování a mazání; pro deset známých intervalů zbytečný storage/lifecycle.
- Obecný sběrač spanů či callback wrappers: více stavů/alokací nebo změna struktury produkčního kódu; vnoření zde není potřeba.
- Samotný Scene profiler: vhodný pro render submission, ale nevyřeší chybějící rozlišení zde zkoumané předrenderové CPU fáze.

Žádná změna expozice, renderování, cache či výkonová optimalizace nebyla přidána. Profil poskytne důkaz pro následné rozhodnutí koordinátora.

## Kontrakt a integrace

API schválené koordinátorem:

```ts
createEnvironmentProfile(location, {
  now?,
  onSlowFrame,
  thresholdMs?: number, // default 25
  minIntervalMs?: number, // default 1000
});
```

Mimo přesný loopback allowlist (`localhost`, `127.0.0.1`, `[::1]`, `::1`) nebo bez právě jednoho `profileEnvironment=1` vrací `undefined`. Konstrukce nečte clock; vypnutá varianta nečte ani options. Výsledek má `scope`, `begin()`, `mark(phase)`, `end(metadata?)`. Pořadí fází je exportované jako neměnné `ENVIRONMENT_PROFILE_PHASES`:

`skyWeather → artLighting → carLighting → vehicleLighting → flashlight → vegetation → transit → precipitation → surfaces → cinematic`.

Report obsahuje `scope`, `startedAtMs`, `endedAtMs`, `totalMs`, `phasesMs` a volitelná metadata. Poslední časová hranice je `mark('cinematic')`; `end` již clock nečte. Součet podfází tvoří tento environment interval. Jde o synchronní inkluzivní CPU wall scope uvnitř nadřazené environment/frame fáze, k níž se nesmí znovu přičítat. Není to GPU čas, FPS ani distribuce všech snímků. Diagnostický callback a sběr metadat jsou mimo tento interval; jejich náklad může ovlivnit následující frame, proto finální běžné FPS srovnání bude bez flagu.

Neúplný snímek, chybná/duplicitní/chybějící či dodatečná hranice a neplatný čas zahodí celý interval. Další `begin` začíná od nuly; nepotřebuje čistit buffer, protože všech deset platných hranic přepíše jeho položky. Zpětný skok clock zahodí aktuální interval a obnoví cadence od nového času, s celým `minIntervalMs` čekáním proti floodu. Nesmyslné numerické options používají defaults; explicitní nula dovoluje diagnostické/testovací vypnutí prahu či cadence.

Metadata: reused scalar record nebo stabilní lazy supplier vytvořený jednou pro Game. Kopírují se až při reportu, nejvýše prvních 16 prohlédnutých polí, klíč do 64 znaků a string do 160 znaků; ignorují se inherited/accessor, nonfinite a nescalar hodnoty. Getter se nevolá, externí mutable objekty se neuchovávají. Výjimka ve supplieru stále dovolí timing report bez metadat. Výjimka v callbacku je zachycena a reentrantní diagnostika potlačena. Cadence se aktualizuje před callbackem.

Koordinátor potvrdil integraci přes optional calls a stabilní thunk pro `quality`, `lightingInstant`, `daylight`, `exposure`, `meshCount`, `materialCount`, s eventem `environment-work`. Game změny nejsou součástí tohoto commitu.

## Refaktoring a vlastnictví

Časová validace a bezpečná bounded kopie metadat jsou soustředěné v malých pomocných funkcích; pevný `Float64Array` a skalární stav patří jediné instanci. Běžná `begin/mark/end` cesta bez reportu nevytváří pole/objekty/closures. Scope a phase tuple jsou neměnné; každý report má vlastní kopii hodnot. Žádné globální mutable registry, timery, listenery, engine zdroje ani cleanup/dispose dluh. Přidání nového ownera nesdílí cadence ani buffer.

## Ověření

Izolovaná kopie pouze vlastních dvou vstupů v `.cache/webgpu-migration-checks/environment/`; read-only junction na staré `.cache/webgpu-comparison/frozen/node_modules`. Pouze přímé Node CLI, bez instalace či bootstrapu. Node `v24.19.0`.

- 2026-10-16 17:09 UTC, `node node_modules/tsx/dist/cli.mjs --test tests/environment-profile.test.ts`: **PASS 13/13**, exit 0, log `logs/targeted-final.log`.
- `node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --lib ES2022,DOM --module ESNext --moduleResolution Bundler --esModuleInterop --types node tests/environment-profile.test.ts`: **PASS**, exit 0, log `logs/types-final.log`.
- První verze před finálním formátováním také PASS 13/13 a strict TS; `logs/targeted-v1.log`, `logs/types-v1.log` zůstaly zachované. Žádný zatajený neúspěšný test.
- Testy: opt-in/duplicates/local gate, přesné časové hranice včetně vyloučení report tail, threshold/cadence, interrupted/reset, out-of-order/extra mark, invalid/throwing/backward/coarsened clock a obnova, dva ownery, nezávislé snapshoty, bounded scalar metadata/getters/prototype, callback failure/reentry, defaults a reálný standardní clock.

Manifest `.cache/webgpu-migration-checks/environment/check-manifest.json` včetně testu má SHA-256 `fb04b43917ed787661fc517dcc44f5a2a4b999a3a070e104f0d1cfe87543e733`. Zdroj `ef00886e7da8d89a3d84340e26dbae49c4bf6348886d2fdd43e9eecaeecabfc5`, test `229d7fad55a0e1cf05794aaf3cbe12f8e4d2ac35acbeb69d0ce4814c4ee1e78e`.

- Procesy/zdroje: všechny vlastní CPU příkazy ukončené; žádný server/port, browser, GPU, build, install ani full suite.
- Omezení: žádný skutečný GPU/FPS důkaz, měření profiler overhead ani přejímka expozice. Root musí přidat Game hranice, zmrazit společný checkpoint a změřit skutečnou produkční hru; bez porovnatelného profilu nelze prohlásit patch za rychlejší.
- Rezervace: vlastník uvolní až po vlastním commitu tohoto předání a ověřené absenci vlastních procesů; release není dokončení celých KEY-32/KEY-36. Přesný commit/release potvrzuje předávací zpráva koordinátorovi.
- Integrátor: `/root`; aktualizaci task stavu, produkční pipeline, `docs/verification.md` a uzavření Linear přejímky vlastní koordinátor. Výzkum a CPU výsledky průběžně zapsány do KEY-36.
