# Nativní projektový pin: přesné sdílení odvozených shadow programů

Produkční změna v lokální main: **1757002ece17e7c7ddd0f1853bf68204c8cee977**, root4082ab855011fd6c1e90d6e556d03bf71bd57e95. Přeneseny pouze ověřené SDWf8 bajty, šest lock SHA odkazů a19 přenositelných regresí. Ostatních osm projektových patch sekcí, včetně MaterialDefines F3 `3cc739bea27f7ec1f1b0f43e089d72d63ab15952166e7d3557c88af10ed34768`, zůstalo přesně zachovaných. Nejde o přepnutí renderer defaultu ani vyřešení všech záseků.

## Zdroj, replay a ověření

- Patch SHA `965f9774f8fd436bcd699d6f54c0a1b64a318f554bb261a85aa9189828f55c49`, lock SHA `89cc1fb1c60b6a0a79d97e102da09ecf96bfb4ea68d22213bdba640240349315`. Roothelper manifest72ad99fd12f9d5c46fb7c8598267d87cebfd6af6ca54b9c47c6ee420995ffbfb. Full starý patch reverse/nový apply pro9souborů exact; vlastní SDW inverse exact,6lockrefnáhrad. Celý native algorithm je byteově shodný s dříve reviewed/GPUověřeným f8 kandidátem.
- `pnpm install --frozen-lockfile --ignore-scripts --package-import-method=copy` skutečně prošlo. Všech10860core/loaders souborů shodných s F3 kromě SDW `f8a8c6091af9caa96ba897f28d7d490f3607d7856dee86b3a05321e1477aba29`; app/loaders skutečně jeden core, physicalcopy witness a původní SDW/MD moduly nezměněné. Žádná instalace do root/hraných node_modules.
- Portable test standardně používá `import.meta.resolve` a skutečně instalovaný core bez QA overlay, envswitchů či absolutních cest. Starý modul13pass/6fail, reviewedpayload19/19, scopedTS PASS. Konečná úplná sada pak testovala skutečnou novou instalaci, nikoli privátní testovací loader.
- Clean source **8fb217a11a338de1cc687b953177d6cad8291e5f67bb2e1d02d781c4a6ab320e**,581source/test/configfiles: **1472/1472**, `pnpm build` včetně fullTS a všechny4izolované integration scénáře PASS.
- Accepted combined source **70810e61c41f18461bcea10df882cfa7fa81765c1954f0c9136de29c92808c6e**,594files: **1532/1532**, build/fullTS a všechny4integration scénáře PASS. Vychází z frozen přijatého F3combined77d, nikoli nového sloučení neznámého WIP. Sdílí pouze vlastní čerstvé clean dependencies; source a dist jsou oddělené.
- Source identity obsahují i všech pět přidaných test/fixture souborů. Clean app/test blobs se ověřily proti tehdejšímu HEAD; oba manifesty ověřené před/po každém jobu. Raw příkazy, časy, exit a SHA logů v progress.json.gz. Nezávislý read-only review native7payload/pin/replay/lock/source/depsisolation nenašel potvrzenou vadu a neoznačoval tehdy rozběhnuté gaty zaPASS.

## Skutečný Edge nad novou instalací

Relace56577d0f-0486-4e60-9817-057dda821e33,527souvislých záznamů odseq0, native combined70810, WebGPU compatibilitytrue, bezglslang/Tint, MediumCSS/internal2040×986, Alex1actual, night1792447200000, řízené počasí. Raw game-readyat49,30s a benchmarkat93,58s v časové základně stránky; nejde o přesné měření celého click→ready ani porovnání startupů. Dodržené30s ustálení od veřejně pozorovaného ready, S1900/E značka/benchmark/E/W8000/space2500. Carfalse→true,102,33m, foregroundtrue, přesně jedna raw/UI1:1 shoda frameintervalů.

| Metrika | Výsledek |
| --- | ---: |
| Nové preparations/modules/syncpipelines | **6 /12 /7** |
| FPS /p95 /p99 | 46,3 /30,2ms /116ms |
| Maximum /intervaly≥100ms | **176,5ms /5** |
| Health/render/asset/device errors, pending | 0 |

GTX1060/driver582.28 podle nvidia-smi,77→79°C,1404→1582MHz před/po, bez zamčených taktů/resetu shader cache. Doprava je skutečným časem, END0bus/1passenger/0car; min/max průběhu tím nejsou doložené. Oproti předchozím plain/diagnostic17/34/18 je reprodukováno omezení na6/12/7. **Není to proložená FPS A/B ani důkaz procentního zrychlení či nezhoršení celkového frame tailu.** Maximální zásek je větší než v předchozím QA průjezdu; liší se source/WIP, doprava i takt. Pět≥100ms intervalů zůstává, p99nesplňuje cíl. Unit přijata jako přesné omezení programového násobení a ownership fix; výkonová/default přejímka zůstává otevřená.

Car entry/jízda/brzda, Game exit a znovu připravený Alex editor prošly, finální console[], raw bez error/fault/device-loss. Dřívější QA stejného f8 modulu pokrývalo další High/Low/Medium/day/torch/reset/editor6smoke; tyto kroky se zde nevydávají za znovu provedené. B6, kamera,≥3actual, úplnáimage/lifecycle/host/multiplayer matice a3proložené backend páry nejsou tímto potvrzené.

Dále bude použit existující opravený JS self-profile V2 na Medium firstdrive. Souhrn synchronních compilation čítačů sám nerozkládá>100ms renderCPU ani async wall latency; neimplementovat další cache či contextreuse bez skutečných stacků. Hraný4201 znovu ověřen přes589source a19skutečněservírovanýchcode SHA, health/embeddedsource77d beze změny. Ostatní chráněné snapshoty a133cizíchWIP zachovány. Vlastní4200/2595 a2568 ukončené, Edge karta zavřená/viewportreset; PID jenignoredcache.

[Manifest](artifact-manifest.json) obsahuje73zdrojových, testových, instalačních, build/integration, rawGPU a image artefaktů s encoded/decodedSHA a délkami. Společný docs/verification.md zůstává cizí WIP; toto je oddělená evidence podle projektové policy. KEY31/32/default i celý migrační cíl jsou stále otevřené.
