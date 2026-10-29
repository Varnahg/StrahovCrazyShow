# Authored přijímače: chybějící pokrytí a negativní dvouetapový kandidát

18. 10. 2026. Pouze izolované CPU důkazy; žádný zde uvedený kandidát není nativně integrovaný ani GPU přijatý. Navazují na [přesný produkční capture](../program-attribution/README.md).

## Skutečné továrny a pokrytí

Proof používá původní architecture factory pro objekt53929057, glass0 0 a glass0 1, reálný outdoor plán node/4002100657 dark-metal, skutečný Cinematic a osm Game metod včetně quality/light přípravy a kamery. Canvas paint a NullEngine pixel upload jsou explicitní IO adaptéry; materiálové recepty, texture metadata, readiness a camera-pass draws nejsou nahrazené. Physics cameraDistance představuje volný prostor, nesouvisející avatar presentation je vynechaná. Nejde o WGSL/GPU či obrazový důkaz.

Final3/3PASS,4,669s. Všechny původní pokusy a hashy jsou zachované.

| Historie | Target ready draws při přípravě | První car1 / car0 | Opakování |
|---|---:|---:|---:|
| Covered pohled | všechny41etapy | 0 / 0 nových programů | 0 / 0 |
| Opačný pohled, pak skutečné alignVehicleCamera π→0 | žádná z41etap | 3 / 3 | 0 / 0 |

Cap zůstal4, žádný připravený Effect nebyl po skutečném timer/turn/endFrame cleanupu disposed. Covered případ má strict Effect/context/whole-defines reuse. PBR defines jsou mezi historiemi shodné. Standard se liší jediným serializovaným USESPHERICALFROMREFLECTIONMAP: runtime hodnota je v obou true, ale covered `_keys` jej obsahuje a cold ne. Netvrdíme stejný kompletní WGSL klíč mezi těmito historiemi. Nezávislé review bez blokujícího nálezu; upozornilo, že41aktivních etap ještě nedokazuje dostatečnost dvou.

## Dvouetapový kandidát — nepřijat

Kandidát používá scoped alwaysSelectAsActiveMesh jen během původních low vehicle0/1. Výběr přes sourcePack/exteriorOnlyGlass a material/layout, žádné názvy, klony, buffery, změny kamery/actoru/světel nebo cache. Původní flagy a view se po přípravě obnoví. V1 je zde zachovaný; chybějící helper lifecycle/legacy wiring nebylo po hlavním gate failure vydáváno za hotové.

Final run02 skutečně zapojuje combined C5 updatePreloadVisuals před celou41stage maticí. V obou pořadích kvalit cold replay car1 použije původní Effect, ale car0 vytvoří **dva nové programy skla**. Jediný celý defines rozdíl je přidaný USESPHERICALFROMREFLECTIONMAP; PBR má přesný reuse. Žádný Effect disposal a žádná cap změna. Run01 bez C5 navíc ukazoval image-processing rozdíl; pro combined byl nepřesný, proto je zachovaný odděleně.

Příčina klíče: StandardMaterialDefines příznak před prvním rebuild nedeklaruje; PrepareDefinesForLights proběhne před IBL, který dodatečně přiřadí true. Následující nový LIGHT slot spustí rebuild a náhodně zahrne starý neindexovaný příznak. Další krok je izolovaný test explicitní deklarace před constructor.rebuild, nikoli další warm etapy nebo shader cache. Čtecí audit nenašel použití příznaku ve Standard GLSL/WGSL graphu a SH binding je vypnutý; přesto jsou nutné skutečné processor/binding a pozdější GPU důkazy.

## Oddělená native hranice

Native start nemá combined C5 preload aktualizaci Cinematic. Při requestedmedium/high může první low pass ponechat imageProcessing.isEnabled=true; pozdější postprocess konfigurace jej vypne. Následný low automobilový replay pak potřebuje jiný klíč. C5 GREEN se proto nesmí vydávat za native přijetí. Samostatný IBL proof a baseline kandidát mají ověřit skutečné oddělené source historie. Tyto budoucí výsledky nejsou automatickou součástí tohoto archivního proofu.

`artifact-manifest.json` mapuje původní a archivované SHA; velké logy, reporty a zdroje jsou gzip. Task coverage proof je dokončen jako důkaz. V1 candidate má outcome rejected-cold-two-stage-contract a zůstává nepřijatý. Celý KEY-31 a migrační cíl jsou otevřené; hrané4198 a starší verze se nemění.
