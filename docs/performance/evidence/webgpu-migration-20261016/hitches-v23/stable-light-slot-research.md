# Širší alternativa: stabilní světelné sloty

18. 10. 2026, čtecí průzkum functional_record a root nad současným projektem a pinovaným Babylon9.30.0. Žádná implementace, test ani GPU. Toto je posouzení širší varianty při dlouho nevyřešené optimalizaci, nikoli její přijetí.

Pevná čtveřice HEMI/DIR/POINT/SPOT nepokrývá současné kombinace. Bezměsíčná noc může mít SPOT+POINT+POINT+HEMI; místní pěší se svítilnou a vzdálený řidič SPOT+SPOT+DIR+HEMI. Game:2598–2599 zapíná sdílené auto i pro vzdáleného řidiče, updateRenderEnvironment:2255–2277 nezakazuje současnou místní svítilnu. Při více existujících zdrojích je nutné zachovat skutečný receiver selection/cap4, nikoli předpokládat nejvýše4zdroje ve scéně.

Intensity0 není disabled: PrepareDefinesForLights/BindLights používají mesh.lightSources a cap; nulové světlo stále zabere slot a může vytlačit jiný zdroj. Pinned transfer/binding může dál provádět uniform/shadow práci. OFF beamu nyní skutečně vyřadí světlo z materiálů a shadow collection. Typed light UBO i WGSL deklarace mění pole a bindingy podle typu/stínů; nejde o přepínač enginu.

Jednotný čtyřslotový GPU superset by mohl zachovat logický výběr a cap a předávat enabled/type/data jako uniformy. Potřebuje sjednotit UBO/transfers, PBR/Standard větve, STANDARD falloff, shadow bindingy/placeholder zdroje bez OFF shadow renderů, quality/Sun/Moon/dvaSPOTownery a lifecycle. FreshWebGpuShadowDepthWrapper v client/webgpu-shadow-readiness.ts:19–87 dnes záměrně kontroluje přesný count+type proti mesh.lightSources; pouhé vynucení defines by kontrolou neprošlo. Nové dynamické větve a stabilní bindingy mají neověřenou trvalou GPU cenu.

Pinned Lights/Clustered/clusteredLightContainer.pure.js:68–92 podporuje POINT/SPOT pouze s FALLOFF_DEFAULT, bez zapnutých shadow generators a některých dalších texture bindings. Root tento primary guard znovu přečetl. Projektové B6/ulice/beamy používají STANDARD a beamy stíny; změnit falloff nebo stíny kvůli přijetí by změnilo požadovaný vzhled. Vestavěný clustered režim tedy není přímá náhrada.

Stejné uniformní defines neodstraní automaticky warm CPU cestu: Light.setEnabled dál resynchronizuje lightSources a označí submeshes dirty. K potlačení options/serializer/cache-hit/events/reset by bylo potřeba další prokázané rozlišení dirty příčin, které nepřeskočí skutečné plugin/texture/attribute/shadow změny.

Porovnané směry: typed sloty zachovají malý současný shader, ale vytvářejí varianty; uniformní superset může omezit varianty, má však širší binding/shadow kontrakt; depth/pipeline retence může uchovat známé programy, ne připravit chybějící; day13 a CPU optimalizace zachovávají dnešní renderer, ale mají startup cenu. Dřívější receiver scan nepřinesl přesvědčivý cold zisk a zvýšil trvalou světelnou přípravu asi0,018→4,576ms/snímek. To varuje před výměnou jednorázové prodlevy za per-frame práci.

Širší varianta by se stala lepší až po actual CPU/WGSL proofu jednotného slotového kontraktu a následné obrazové/GPU přejímce: stejný výběr, cap, světlo/stíny/plugin/instance draws, nulové nové Day/F light programy, kratší příprava a celý startup, bez regrese steady OFF/ON p95/p99 a paměti. Clear-weather shadows a local torch se vzdáleným řidičem jsou nezbytné. Zatím je to nevybraná alternativa, nikoli důvod zapnout všechna nulová světla nebo změnit kvalitu.
