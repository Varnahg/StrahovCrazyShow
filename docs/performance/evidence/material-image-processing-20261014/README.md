# IMAGE-01: ověřený kandidát materiálových barevných korekcí

14. 10. 2026. Jediný runtime hunk nastavuje DefaultRenderingPipeline na non-HDR a odstraňuje setter, který kromě fullscreen průchodu vypínal také scene material processing. Standard/PBR materiály tak skutečně používají zamýšlené ACES/exposure/grade; vlastní display-space obloha nedostává další fullscreen barevný průchod. Žádná změna art hodnot, intenzit světel, textur nebo shaderů podle odhadu.

## Přesný produkční přenos

Základ je ověřený engine checkpoint `8eea61632293796a6ea9a72434d44fc03e8a455c86eb13532590ace23b73fb17` s pinovaným KEY-17 patchem. Nový snapshot `d032be6510b1a94c9bbada421ad84da50ddfc97e0498df4bc4eb896f1145c19f` má8410 vstupů/513 source-config-test a právě3 delty: cinematic runtime a dva testy. Nový Game phase fix není přimíchaný.

Git kandidát má čistou cinematic verzi bez staršího wave3 reuse WIP. Do produkční kopie proto integrátor **nekopíroval celý pracovní cinematic**: ověřil původní wave3 SHA `57b4a6bbc39448481d740ff490761dfc68b00a6a565eafd550084ef02db85193`, aplikoval přesně jediný předaný hunk a ověřil výsledný SHA `64f4c6f942b8c51e9d612934859deac1d8dfc06140e4298cf0ae5c14c4679ca3`. Tím zůstalo reuse chování zachované. Stejná zamýšlená delta je samostatně přenositelná i na čistý Git základ.

## Výsledky

- Stejný nový test SHA `ba5493d42ab4f3102e2743a501983c621803c24becce4224ef5abb08bce93637`: před hunkem1/7 PASS (šest actual isEnabled=false), po hunku7/7 PASS. Bounded disposal nyní prochází díky samostatnému KEY-17 patche.
- Původní čtyři cinematic sady nejprve15/16 PASS. Jediný explicitní assertion `isEnabled=false` kodifikoval opravovanou chybu. Root přečetl celý test a schválil pouze změnu na true s důvodem; applyByPostProcess=false a všechny attach/identity/quality kontroly zůstaly. Finální společná sada23/23 PASS, narrow TypeScript0 diagnostik.
- **Úplný produkční checkpoint895/895 testů PASS, build PASS, celá pnpm test:integration PASS.** Viz [pipeline.jsonl](pipeline.jsonl) a [checkpoint.json](checkpoint.json).
- Po celé pipeline513/513 zdrojových hashů i oba engine patch JS hashes beze změny. Port2568 po ukončení bez listeneru. Původní živý4186 kandidát se neměnil.

Raw evidence a manifesty jsou v `.cache/material-image-processing/` a `.cache/material-image-processing-validation/`. Původní red i legacy failure zůstávají zachované. Provozní PID jsou jen v ignorované cache. Build zachovává dřívější upozornění na ineffective dynamic import a velikost chunků; tento fix je neřeší.

## Otevřená obrazová přejímka

Testy používají skutečné controller/material defines/pass lifecycle, ale nerenderují skutečné pixely. **Noční vzhled, HDR→LDR clipping/banding, bloom a FPS nejsou přijaté.** Non-HDR používá jiný intermediate formát a bloom pracuje nad materiálově zpracovaným obrazem; toto je výslovná podmínka následného srovnání při stejném času, počasí, kameře, kvalitě a rozlišení. Nepřepisovat tento limit tvrzením „gamma opravena“. Runtime integrace do main zůstává samostatný krok; červené záblesky a vzdálená světla mají další otevřené příčiny.
