# Předání: fix-material-image-processing-20261014

**Implementace, cílený refaktoring, red/green regrese a typy jsou dokončené. Připraveno k root freeze/review; necommitnuto, neintegrováno do main, bez GPU nebo pixelového tvrzení.**

## Výsledek a rozsah

Vlastník `fix-01a13624-image-20261014`, příjemce `/root`. Výhradně WT `C:/Users/rezac/.codex/worktrees/image-processing-ownership/StrahovCrazyShow`, branch `codex/image-processing-ownership`, základ `6df08fb6b4003bc958a72fd58592ee24fa74dc41` s přijatým KEY-17 patchem. Žádný commit/staging, instalace, server, build, plná sada nebo GPU. Starý wave4/main/frozen runtime se nezměnil.

Změněné přesné soubory: `client/cinematic.ts`, vlastní `tests/cinematic-image-processing.test.ts`, `tests/cinematic.test.ts` (jediné autorizované očekávání), vlastní `docs/performance/research-20261014/visual-lighting.md`, tento handoff a ignorované důkazy v `.cache/material-image-processing/`. Nový test byl přenesen byte-exact z vlastního předchozího kandidáta. Cizí reuse WIP nebyl převzat; čistý HEAD má dispose/recreate přes low. Research před runtime zápisem zaznamenává znovupřijatou IMAGE-01 volbu po vyřešení vlastnictví. Před implementací načteny aktuální AGENTS/architecture/coordination/current-work a task; po rozšíření tasku převzaty pouze vlastní zdokumentované změny přes adopt-dirty. Cizí koordinační změny mimo scope se nestagovaly ani neměnily.

Runtime delta je jediný hunk: non-HDR argument `false`, odstranění `imageProcessingEnabled=false` a jeho sync bloku, vysvětlující komentář. Žádná art čísla/textury/shadery. Odstraněná redundantní synchronizace nepotřebuje náhradní stav/cache. Definice materiálů a ownership testy sdílí fixture/veřejné assertions, nic nezrcadlí algoritmus controlleru.

Primární podklad: installed Babylon9.30 `defaultRenderingPipeline.pure.js:224–228` setter vypíná přímo scene konfiguraci, větev513–525 při non-HDR nepřipojí fullscreen ImageProcessing a nechá material processing. KEY-17 ownership patch je doložený commit základu; skutečné installed SHA `imageProcessingPostProcess.js=c97937b740966d260475a421658cc038b8fb95756231f992468696a03484378a`, `postProcess.pure.js=e45a4d6682951457b861fcf2d58feecb6b587a90577c7e63bf286249fd037ab9`. Alternativy a důvody zůstávají ve vlastním visual research §3/7/8. Změna opravuje doložený veřejný barevný kontrakt; neurčuje automaticky všechny příčiny uživatelem popsaných barev.

## Ověření

Skutečné výsledky 14.10.2026 UTC:

- 15:12:48–15:12:50 red: nový skutečný controller test, exit1, **1/7 PASS**, šest očekávaných failů actual scene `isEnabled=false`; `red.log`, `red-result.json`.
- 15:13:17–15:13:19 green po jediném hunku: tentýž test, exit0, **7/7 PASS**, včetně actual Standard/PBR defines, low exposure, explicit material config, absence fullscreen IP a obou disposal cest; `green.log`, `green-result.json`.
- 15:13:41–15:13:43 staré `cinematic-atmosphere`, `cinematic-art`, `cinematic-pipeline`, `cinematic`: **15/16 PASS**, exit1. Jediný fail `tests/cinematic.test.ts:302` explicitně očekává `isEnabled=false` a kodifikuje opravovanou chybu. Ostatní testy beze změn prošly; `legacy.log`, `legacy-result.json`.
- 15:14:19–15:14:23 narrow TypeScript nového testu a tranzitivního controlleru: exit0; `types.log`, `types-result.json`.
- 15:18:02–15:18:04 finální společné nové7 + původní16 testy: exit0, **23/23 PASS**; `final.log`, `final-result.json`. Nový test zůstává byte-identický mezi red a oběma green běhy. Po opravě pouze boolean očekávání se narrow TS neopakovalo bez nového typového důvodu.

Přesné příkazy:

```text
node node_modules/tsx/dist/cli.mjs --test tests/cinematic-image-processing.test.ts
node node_modules/tsx/dist/cli.mjs --test tests/cinematic-atmosphere.test.ts tests/cinematic-art.test.ts tests/cinematic-pipeline.test.ts tests/cinematic.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/cinematic-image-processing.test.ts
node node_modules/tsx/dist/cli.mjs --test tests/cinematic-image-processing.test.ts tests/cinematic-atmosphere.test.ts tests/cinematic-art.test.ts tests/cinematic-pipeline.test.ts tests/cinematic.test.ts
```

Nová regrese používá skutečný controller/Scene/Standard/PBR konfigurace a `prepareDefines`; skutečné camera attach/detach metody sleduje voláním super. Jedinou substitucí je NullEngine raw-cube alokace, nic se nerenderuje. Kryje low/medium/high-first, high→low→medium opakování, expozici v low, owner material konfiguraci, žádný fullscreen IP a bounded účinky/observers/textury při obou disposal cestách. Původní atmosphere/art/pipeline soubory jsou beze změn.

Před každým CPU během TCP4186/2581 a candidate JSONL bez aktivity; pět `*-activity.json` obsahuje přesnou evidenci. Všechny krátké procesy skončily s uvedenými exit codes; žádný vlastní pomocný proces nezůstal. Provozní identifikátory se zde neukládají. Původní red/legacy fail nejsou přepsané. `git diff --check` prošlo.

## Identita a přesný přenos

SHA256 checkpointu:

| Soubor | SHA256 |
| --- | --- |
| původní HEAD cinematic (cache `cinematic-head.ts`) | `7ad7e26e49ec0c86f11b429ddf57fe3054e1fcda6aca357d0012e59df23a21f7` |
| nový runtime `client/cinematic.ts` | `d7d5693ac6f331c343258a03c53cd54076e426eae130493c75d8aaf4fcca9176` |
| nový test, beze změny mezi red/green | `ba5493d42ab4f3102e2743a501983c621803c24becce4224ef5abb08bce93637` |
| upravený původní `tests/cinematic.test.ts` | `2d13d409833aeeaa2c07d35f60fe62b59f92ae784765e5169f04b01f01ff5ef0` |
| vlastní visual research včetně výsledků | `5cfe52c1e31965d873155eaacbb4188eb8d93faf341e66ad600e41038e9fac87` |
| přijatý engine patch | `f1bedab8535488db586326bc2b9d18aeebf1444ed2c7569fbb691193f1d43805` |

Přesné soubory v `.cache/material-image-processing/`: `runtime-delta.patch` proti HEAD pro jediný runtime hunk; `head-delta.patch` navíc s jediným existujícím testovým očekáváním; `wave3-runtime-delta.patch` s týmž runtime hunkem proti skutečnému frozen wave3; `final-manifest.json` s výslednými source/test/doc/delta/log hashy. Aplikace stejného jediného bloku na cache kopii frozen wave3 dala `64f4c6f942b8c51e9d612934859deac1d8dfc06140e4298cf0ae5c14c4679ca3`, byte-exact starý wave4 kandidát. Reálný frozen wave3 zůstává `57b4a6bbc39448481d740ff490761dfc68b00a6a565eafd550084ef02db85193`. Nepřenášet celý nový cinematic na full production baseline: koordinátor použije pouze hunk a zachová dřívější reuse chování. Původní reálná wave4, frozen Game ani jiná phase WT se neměnily.

Root přečetl celý starý test a schválil nutnou změnu pouze jeho `isEnabled` assertion na true plus krátký důvod; všechny attach/identity/quality assertions zůstaly. Po průběžném handoffu a release rozšířil task přesně o `tests/cinematic.test.ts`; vlastní claim byl obnoven před zápisem. Tento jeden řádek spolu s `applyByPostProcess=false` kontroluje účinné zpracování v materiálech. Nejde o oslabení lifecycle kontroly.

Přesný nový runtime hunk vůči frozen wave3:

```diff
@@ -478,19 +478,14 @@ export class CinematicAtmosphere {
     } else if (!this.pipeline) {
       this.pipeline = new DefaultRenderingPipeline(
         "cinematic campus",
-        true,
+        false,
         this.scene,
         [this.camera],
         false,
       );
-      this.pipeline.imageProcessingEnabled = false;
-      // A recreated Babylon 9.30 pipeline initially assumes image processing
-      // is enabled, even if the previous one already disabled scene config.
-      // In that case the setter has no notification; synchronize its public
-      // configuration observable before preparing the chain (no extra build).
-      const imageProcessing = this.scene.imageProcessingConfiguration;
-      if (this.pipeline.imageProcessingEnabled !== imageProcessing.isEnabled)
-        imageProcessing.onUpdateParameters.notifyObservers(imageProcessing);
+      // Non-HDR keeps image processing in Standard/PBR materials and does not
+      // attach a fullscreen color pass over the display-space sky. Do not set
+      // imageProcessingEnabled=false: that also disables the scene's material grade.
       this.pipeline.fxaaEnabled = true;
       this.pipeline.bloomEnabled = true;
       this.pipeline.bloomScale = 0.5;
```

## Převzetí a meze

Obraz/GPU a účinek na uživatelem popsané noční barvy zůstávají neověřené; červené flash a vzdálené lampy jsou samostatné otevřené otázky. Produkční freeze, společné testy a integraci vlastní root.

Po uložení finálního manifestu následuje release; skutečný registry stav je autoritativní. Všechny vlastní procesy jsou ukončené. Release předává tento doložený změnový celek rootu, neznamená Done v Linearu ani nasazení. Koordinátor provede samostatný commit/review a stabilní production validaci se zachováním předchozího reuse chování; uživatelské GPU/obrazové okno zůstává odložené.
