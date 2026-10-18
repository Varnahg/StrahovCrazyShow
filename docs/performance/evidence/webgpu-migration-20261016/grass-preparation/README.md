# První thin-instance vykreslení fotografické trávy

Po opravě světel auta zůstává v [produkčním A1/B1/A2 průjezdu](../low-vehicle/README.md) samostatný shluk u prvního programu materiálu `photographic leaves · shared flat PBR`. Zdrojový průzkum určil, že patří FAR/medium fotografické trávě. Před jízdou jsou její textury ready, ale počty draw/instances/bufferů/cached tiles jsou nulové. B1 u prvního shluku zaznamenal 192 instancí, 4224 trojúhelníků a 20480 B instance bufferů. Poměr 22 trojúhelníků odpovídá FAR. Stromové meshe a pending tree loads se nezměnily.

`acquireGrassResources.ready` čeká na textury. `PhotoGrassBatch.flush` teprve připojí matrix a photoGrassFade buffery; plugin přidává atribut při `hasThinInstances`. Startovní příprava prochází aktivní meshe a tuto budoucí instancovanou cestu neobsáhne. To odůvodňuje další omezený experiment; nevysvětluje automaticky celou následnou mezeru 230–260 ms.

## Ověřené varianty

Proof používá skutečnou geometrii/recepturu, produkční resources/batch/plugin, PBR a low VehicleLighting s mapped POINT. V2 po review opravuje lampu na skutečný STANDARD falloff a kontroluje celé flags, sloty a návrat 1→0. [Nezávislé review](proof-review.md), [finální rozbor](proof/analysis-v2.md), [manifest V2](proof/manifest-v2.json), [spuštěný výsledek](proof/run-v2-01.log).

| Varianta | Doložený výsledek |
|---|---|
| Ready textury | První thin FAR potřebuje dva nové programy pro 0/1 POINT. |
| Neinstancovaný mesh nebo nulový count | Stejnou thin cestu nepřipraví. |
| Skutečný FAR count1 | Obsahuje matrix/fade atributy, INSTANCES/THIN_INSTANCES a skutečně projde CPU thin dispatch. |
| Sdílená Geometry dočasného klonu | Přepíše živé instance buffery; genuine RED. |
| `makeGeometryUnique` před flush | Zachová živé buffery, roots, wind, materiály a textury; GREEN. |
| Warm a okamžitý dispose | Po skutečném deferred cleanup zanikne poslední Effect; později se znovu kompiluje. |
| Převzetí obou variant běžným batchem před dispose | Oba Effecty zůstanou reuse i po cleanup, bez nového programu. |
| Medium po FAR | Použije stejné dva Effecty, bez nových programů. |

Finální V2 má **6/6 PASS**, 2,215 s, bez skipů. V1 včetně chybného falloff a všech 12 pokusů zůstává zachovaný; přesnou point1 coverage nahrazuje V2. První fixture chyby s Texture IO nebo neexistujícím API nejsou vydávané za mechanismus RED. Raw JSON reporty jsou bezeztrátově komprimované; [archivní manifest](proof-archive-manifest.json) obsahuje uložené i původní hashe.

Hranice: NullEngine má explicitně povolený instancing capability vstup a používá vlastní syntetické ready Texture IO 1×1. Mesh/material/Effect readiness není přepsaná. Jde o skutečný **GLSL frontend**, nikoli hardware/WGSL/GPU nebo obrazový důkaz. Fixture používá viditelný root; budoucí fade0/always-active příprava potřebuje vlastní přejímku. Nejde o end-to-end ověření selection/tiling controlleru ani o odstranění všech záseků.

## Volba kandidáta

Po důkazu a review je vybrán jediný vlastní FAR batch s oddělenou geometrií, fade0, vlastními wind metadata a příznakem `alwaysSelectAsActiveMesh` pouze na jeho mesh. Po přípravě zůstane vypnutý do zániku `PhotographicGrass` nebo výměny resources. Tím zachová vlastníka připraveného Effectu bez shader cache-map, refcount patchingu a další smyčky observerů. Cena je ohraničená jedním meshem/drawWrapperem, FAR geometrií a minimálně 5120 B CPU instance polí plus GPU buffery a režie. Nejde o přesné měření heapu.

Zásah do živého empty batch by měnil allocation/slot/bounds/selection invarianty. Event-based handover by musel sledovat skutečné převzetí obou variant a některá nemusí během hry vůbec nastat. Proto se zatím nevolí. Ponechání scope pouze na dvě vehicle etapy by zase nepokrylo chůzi, den a ostatní kvality: copied kandidát použije všechny **již existující** WebGPU etapy. Počet41, limity30s/pass a90s celkem i úplná readiness se nemění. Nové náklady musí ověřit produkční pilot.

Task `webgpu-grass-preparation-candidate-20261018` je oddělená pracovní kopie nad `5c6b36ad…`. Tento dokument nepřijímá jeho runtime ani GPU výkon. Uživatel následně výslovně požádal pokračovat v opravách a měření; GPU a náročné kontroly může root obnovit nad stabilním kandidátem. Hraný 4197 i starší buildy zůstávají neměnné a KEY-31 i celkový cíl otevřené.
