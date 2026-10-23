# Kompatibilita oznámeného zdroje a cílového průchodu stínů

Root nález po CPU přijetí432e197d, před spuštěním GPU source11. Source11 74dbc7a7 obsahuje8580 vstupů a vlastní frozen install;201 běžných installed testů, plný build18.29s, izolovaná integrace a exact-head CI2126/2126 jsou zelené. Tyto výsledky zůstávají historické; nový nález jim nepřipisuje coverage, kterou nemají.

Primární pinned Babylon9.30 [ShadowDepthWrapper](https://github.com/BabylonJS/Babylon.js/blob/9.30.0/packages/dev/core/src/Materials/shadowDepthWrapper.ts) připravuje base material při shadow readiness jen pro standalone. Pro běžný wrapper čerpá poslední oznámený base Effect a zaznamenaný source pass. Parametr passIdForDrawWrapper určuje cílový draw context, nemusí označovat průchod, v němž vznikl base Effect. Samotné zpřísnění na bases.get(requested) proto změnilo původní API.

Projektové Cinematic a VehicleLighting stále obsahují přímou nonstandalone factory pro wind-deformed ShaderMaterial alpha castery s remappedVariables. Fresh přidává shadow-pass base readiness jen lit materiálům. Aktuální hlavní listí je PBR a tráva má depthCaster=false; to nevylučuje regresi obecného nativního kontraktu. Starý portable druhý generator s draw alias2 bez notify2 byl při prvním fixu změněn; explicitní notify2 omylem přestal chránit původní alias případ. Nový samostatný canonical-pass test má zůstat navíc.

Autor nezávisle potvrdil čtecím inline CPU witness: skutečný ShaderMaterial.isReadyForSubMesh v main0, jediná notification0, standalone=false, přesné remaps a ShadowGenerator readiness v RTTpass2. Starý source f8a8c609 vrátí ready depth Effect; source11 5494233c vrací false/null. Oba procesy exit0 a vybraný native SHA před/po shodný. Jde o terminal NullEngine GLSL/depth IO, nikoli WGSL obraz nebo GPU výkon. Přesný příkaz/stdout a RED/GREEN mají být zachované v novém compatibility podadresáři, nikoli dopsané do starého sealu46.

| Varianta | Náklady a rizika | Rozhodnutí |
|---|---|---|
| Přepnout callery na standalone nebo přidat refresh všem custom materiálům | Další varianty/render readiness, změna původního caller/API kontraktu; neřeší alias uživatele wrapperu | Nezvoleno |
| Vrátit globální source map a invalidaci | Znovu ruší nezávislé připravené stíny a původní entry nález | Nezvoleno |
| Pouhý fallback bez provenance/alias lifecycle | Může vybrat jiný efekt při bindingu, nebo target release zlikviduje source ownera | Nedostatečné |
| Jeden sdílený resolver posledního legitimně oznámeného zdroje pro readiness i binding | Zachová známý requested canonical pass včetně pending stavu; jen absent requested může půjčit jiný stále živý oznámený zdroj. Žádný nový cache/history/GPU/caller zásah | Zvoleno |

Resolver nejdřív odmítne neplatný nebo zaniklý draw pass. Známý requested pass vždy vítězí a pending/disposed source nesmí přejít na jiný ready efekt. Jen chybějící requested pass dovolí poslední oznámenou tuple při přesné shodě s canonical mapou a živém source passu. Source a target jsou odlišné role; engine.currentRenderPassId nesmí nahrazovat source provenance veřejného alias volání.

Owned depth entry zůstává keyed source passem; owning mainDrawWrapper patří drawWrapper[sourcePass], target-only wrapper je nonowning context. Binding použije stejný resolver, nikoli libovolný první alias/facade. Target release uklidí jen alias; source release zlikviduje vlastní entry a její aliasy. Nová vlastní canonical notification targetu odpojí jeho starý cizí alias. Reentrant create znovu ověří source selection, identity a živost requested passu; změněná fallback selection musí svůj acquire uvolnit. Pořadí poslední skutečné notification lze zachovat pořadím canonical Map bez historie variant.

Follow-up mění pouze současné native ShadowDepthWrapper JS/privateDTS přes patch+lock a přesné portable fixture testy. Source11/install, původní5494/8317/efd5, sealy46, failed logs a oba původní clean review zůstanou jako historický checkpoint. Nová evidence/cache patří jen compatibility/ podadresářům. Obnovený původní alias test plus actual ShaderMaterial/ShadowGenerator RED→GREEN, requested pending/refcounts/source-v-target release/promotion/twoRTT/reentrant selection a předchozí201/TS musí předcházet novému source12/GPU. Žádné další uživatelské potvrzení není potřeba pro tuto autorizovanou opravu.
