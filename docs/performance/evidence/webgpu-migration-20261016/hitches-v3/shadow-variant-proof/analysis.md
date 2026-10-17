# CPU důkaz životnosti budoucí F shadow varianty

Vlastník `webgpu-shadow-variant-proof-20261017`, task `webgpu-migrate-pipeline-20261016`. Výhradně nová cache a pipeline handoff; žádná produkční oprava, nový cache mechanismus nebo engine patch. Zdroj je zmrazený C5 (`combined-v5`, snapshot c4e22edd3b691fce2827b5132ccbc09ec404a0aa6fd1338925ffddbe8a5be6f5), bez receiver kandidáta. Pinned Babylon 9.30 z readonly dependencies-v5 včetně existujících projektových patchů. Primární AGENTS/policy načtené; claim před zápisem. Spuštění proběhlo až po výslovném signálu rootu o konci GPU okna.

## Co se skutečně vykonalo

`probe.ts` importuje byte-identické C5 TreeWindPlugin, configureTreeMaterial, FreshWebGpuShadowDepthWrapper factory, StableLightState a shader registrace. Používá skutečný NullEngine, Scene, PBRMaterial, mesh, světla a dva skutečné ShadowGenerator. Reprezentativní leaf mesh má běžnou alfa texturu vrácenou jako ready dummy skutečnou NullEngine.createTexture cestou. ConfigureTreeMaterial nastaví skutečnou PBR foliage policy včetně translucency. Kontrola ověřuje alpha-test, přítomnost cleanTreeWind ve skutečném base vertex source a zapnutou shadow code injection.

Hemi + directional + dvě point lampy tvoří OFF. ON vymění jednu lampu za skutečný SPOT se STANDARD falloff, range24 a priority10, podle existujícího F/street-budget principu. Stabilizace světelných slotů je skutečná C5 implementace. Při konstrukci wrapper factory se pouze vybere WebGPU guard přes isWebGPU, potom vše běží na skutečné NullEngine GLSL Effect cestě. Není použita náhrada `_makeEffect`, `isReady`, `dispose`, renderu nebo cache algoritmu. Soukromé mapy wrapperu se pouze čtou, onEffectCreated a mesh.onAfterRender jsou pasivně sledované.

Příprava ON provede skutečnou material readiness a ShadowGenerator.isReady v jejich skutečných render-pass ID, bez Scene.render. Návrat OFF nejprve pouze nastaví světla; snapshot ještě ukazuje živé ON depth efekty. Následuje skutečné Scene.render. Mesh.onAfterRender potvrzuje main draw správné kamery s OFF efektem. Teprve tento krok ukazuje zánik ON depth variant. Další příprava ON vrátí stejný cached main efekt, ale nové shadow efekty a tokeny.

## Finální výsledek

| Krok | PBR main Effect | PBR sun depth | PBR torch depth |
|---|---:|---:|---:|
| Initial OFF | 0 | 1 | 2 |
| ON příprava | 3 | 4 | 5 |
| Návrat OFF, před renderem | 3 | 4 živý | 5 živý |
| Skutečný OFF render | 0 | 6 | původní položka odstraněná |
| OFF settled | 0 | 6 | 7 |
| Další ON příprava | 3 | 8 | 9 |

Oba připravené ON efekty4/5 mají **isDisposed=true již bezprostředně po konkrétním OFF renderu**. OnEffectCreated záznam ukazuje návrat na base0 a ukončení předchozích depth efektů; nejde pouze o pozdější zánik při cleanup. Další ON používá znovu main3, ale sun8/torch9 mají jiné RandomGUID tokeny i cache keys. SHA jejich vertex source a defines zůstaly stejné jako u předchozích ON4/5. To dokládá ztrátu přesné shadow cache identity, nikoli nutně náročnost opakované kompilace na GPU.

Kontrola se skutečným ShaderMaterial a native ShadowDepthWrapper (uniformní wind bez LIGHT defines) drží main10 a depth11/12 se stejnými tokeny přes celý řetězec. Oba depth efekty zůstávají živé po OFF renderu. Jde o kontrolní shader kontraktu, nikoli tvrzení, že C5 dnes tento ilustrativní legacy shader produkuje. Aktivní C5 foliage je PBR + TreeWind, takže blanket tvrzení „wind ShaderMaterial F neovlivní“ tento PBR případ nevyvrací.

Finální `node --import tsx probe.ts`: exit0, obě větve i lifecycle tvrzení PASS. Fixture+cleanup **20:37:08.737–20:37:08.882 UTC**, 142,661ms wall, CPU203ms user+31ms system; celý Node příkaz1,958s včetně importů. JSON/report a log jsou hashované. Tyto časy nejsou výkonové měření hry.

Zachované pokusy: první `RawTexture` v NullEngine nebyla ready (pinned createRawTexture na rozdíl od createTexture ready nenastavuje), proto bounded readiness selhala. Nebyla falšována materiálová readiness; fixture přešla na běžnou NullEngine.createTexture cestu. První úspěšný report ještě připravoval pass0; doplněná explicitní kontrola skutečného main draw odhalila, že kamera má vlastní pass1. Finální proof používá camera.renderPassId, potvrzuje skutečné OFF render callbacky a okamžitý disposal. Předchozí logy/report jsou zachovány a nejsou finální přejímkou.

## Minimální možnosti vlastnictví podle výsledku

1. **Pouhé async prewarm pipeline bez změny shadow lifecycle nestačí.** Připravené descriptor/effect identity4/5 se při OFF renderu zruší a další ON používá8/9. Ani shodný shader source nedělá z jiného effect/token cache hit.
2. **Jen přidržet refcount starého Effectu nestačí.** Může zabránit fyzickému zrušení, ale wrapper stále odstraní map entry a vyrobí nový token. Takové držení by vyžadovalo zvláštní vlastníka i korektní výběr/adopci varianty; samo je spíše leak riziko.
3. **Omezené dvě varianty wrapperu** jsou nejmenší věrohodný kandidát pro pokračující OFF render: vlastněné záznamy per submesh/baseEffect/generator/shadow-defines a odpovídající pass bindings; ON a OFF se přepínají bez disposal druhé platné varianty. Životnost musí řešit změnu base shaderu, geometry/instances, shadow flags, shader errors, device/cache generace a disposal všech vlastních variant. Stávající Fresh layout guard se nesmí oslabit. Toto je návrh, nikoli implementovaný nebo přijatý cache zásah.
4. **Oddělená přípravná kopie material/wrapper kontextu** izoluje OFF vlastnictví, ale potřebuje explicitní přenos přesných Effect/token identit do skutečného draw ownera; pouhá clone s novým RandomGUID nemusí mít pozdější cache hit. TreeWind doNotSerialize navíc znemožňuje předpokládat identickou prostou material clone. Větší integrační rozsah než omezené varianty.
5. Zastavení OFF renderu či ponechání starého framebufferu by odstranilo tuto konkrétní invalidaci, ale nesplnilo požadavek dál plynule vykreslovat předchozí herní stav. Není navrženo jako oprava.

Tento proof ospravedlňuje další malý CPU návrh variantového vlastnictví, pokud koordinátor async cestu vybere; není důvod hned implementovat obecnou cache. Teprve potom má smysl spojit ji s přesnými future main/shadow pipeline deskriptory, deduplikací a generační ochranou async insertion. Tento úkol descriptor proof ani nový runtime neprováděl.

## Omezení

NullEngine nekompiluje WGSL a neprovádí skutečné GPU draw/submit. Použitý GLSL shader processing a skutečné Effect lifecycle dokazují ownership/token problém, ne GPU validitu, obraz, velikost úspory, příčinu osmivteřinové mezery ani četnost zasažených stromů v produkčním prvním F. Mesh a textura jsou malé reprezentativní fixtures, ne skutečný import tree GLB. No-instance stav; další LOD/instance/shadow konfigurace tento důkaz neověřuje. Celá sada, build, GPU, server, instalace a pnpm nebyly spuštěny. Scény/enginy jsou disposed a žádný vlastní proces nezůstal.
