# KEY-31: příčina dlouhých snímkových mezer — první zúžení

17.10.2026. Jde o průzkum a diagnostický experiment, nikoli dokončenou opravu nebo FPS přijetí.

## Doložený problém

V původním C5 běhu seq849/907/1098 následují po55/53/56 nových programech a909,9/993,1/961,2ms Game CPU prodlevy8001,2/6563,5/7074,9ms. Uvnitř prodlev přitom pokračují klientské probe callbacky, HTTP logy i server tick. Nejde o souvislou osmivteřinovou JS blokaci ani o opožděně zapsaný frame log. W3C rozlišuje dobu do renderStart od blockingDuration; obě se nesmějí zaměňovat.

## Oddělená skutečná reprodukce

Původní4193 server při pokračování neběžel. Obnoven totožný frozenC5 bez rebuildů; uživatelská karta zůstala na místě. Samostatná4194/API2589 používá560 ověřených kopií zdrojových/config souborů a readonly assets/dependencies/dist. Uživatel výslovně schválil přesun nové měřicí karty do vlastního aktivního okna Edge.

Nová session a0e58765-430e-4323-bdd4-d4a793f34ef7 reprodukuje medium/B6/F: CPU burst629,8ms a následný interval3095,4ms; noc629ms a3064,7ms. Běh má dodatečný profilovací overhead a jiný počáteční quality/cache stav, nejde o měřený přínos oproti původním8s. Snapshot timing i raw jsou zachované; raw gzip se po rozbalení ověří hashy v summary.json.

Celý engine: endFrame/flush max1,7ms, encoder.finish0,2ms, currentTexture4,2ms. Tyto synchronní hranice nevysvětlují několikasekundový interval. Max engine cadence8958ms a raw RAF5944ms ale pocházejí z různých částí startupu; bez dvou bodů u stejného incidentu nelze z jejich rozdílu určit místo čekání. Neoznačujeme proto GPU ovladač za prokázanou příčinu.

## Materiálové varianty a porovnané možnosti

Pinned CPU probe point-range12 i spot-range24 změnil light defines a Effect u16/16 dalekých materiálových uživatelů. Jednoduchý AABB allowlist ve fixture jejich změny odstranil. Nejde o16 GPU kompilací ani o přijatou produkční opravu. Oba projektové controllers používají explicitní STANDARD falloff s konečným cutoff; physical fallback obecně cutoff nemá. Dále hrozí povýšení jiného světla do omezených slotů, frozen/custom/lightmap cesty a nesprávné bounds instancí/deformací. Konzervativní filtrování tedy není mechanická výměna seznamu.

Porovnány byly stabilní enabled sloty s nulovou intenzitou (spotřebují světelný budget a shadow práci), širší warmup (prodlouží startup), descriptor-exact async prewarm (musí zachovat skutečné instance/texture/pass stavy), dávkování a prostorové membership. Existující clustered-light container není přímá náhrada: nepodporuje nynější stíny a STANDARD falloff a přidává nový binding/lifecycle řetězec. Žádná varianta zatím není prokázanou opravou celé prodlevy.

## Další rozlišující experiment

Pouze oddělená cadence kopie přidává při rawFrameMs>=250 a zapnutém stávajícím WebGPU profilu snapshot jeho dosavadních čítačů. Bez nových observers/hooků, timerů, Promise či cache. Běžná hra a hraná4193 se nemění. Dvě blízké hranice po CPU burstu a po následném čekání umožní porovnat raw RAF callback count s engine count ve stejné generaci/epochě; rozdíl0–2 má nejistotu pořadí callbacků, desítky mají jiný význam. Chyba pozorování nesmí zastavit render.

Skutečná Game.frame regrese v této QA kopii:9/9 PASS včetně hranice249,9/250, NaN/Infinity, off/WebGL, dvou časových bodů, reálného sanitizeru/validatoru a nefatálních chyb snapshot/sink. Produkční runtime zatím není upravený ani přijatý; plný TS/build experimentu se ověřuje samostatně.

Primární podklady: [W3C LoAF](https://www.w3.org/TR/long-animation-frames/), [GPUWeb pipeline API](https://gpuweb.github.io/types/interfaces/GPUDevice.html#createrenderpipelineasync), [Edge Performance](https://learn.microsoft.com/en-us/microsoft-edge/devtools/performance/reference), pinned Babylon9.30 zdroje s hashy v light-manifest.json. Projektová BMAD specifikace zůstává draft do zvolení opravy podle měření.
