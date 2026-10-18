# KEY-31: užší avatarový pohled a světelné kontrolní scénáře

18. 10. 2026. Tento celek obsahuje opravený CPU důkaz a referenční GPU sérii plného V4. **Neobsahuje přijetí zúžené runtime přípravy.** V4 zůstává snapshot `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`; nativní vendor oprava je již samostatně v main podle [hitches-v12](../hitches-v12/README.md).

## Důkaz avatarového pohledu

V2 [manifest](proof-v2/manifest.json), SHA `0cadc7d49b71a567cb3ac27974a8e6e3502676640d13afb232b0d4fa9dff3730`: šest skutečných předloh a Alex s brýlemi/vousy, **119 captures a 70 porovnání úplných defines a Effect identity**. Ve spawn whole/FOV-only/far-only/combined variantách byly všechny aktuální skinned/morph-applied vrcholy i konzervativní bounding corners uvnitř frusta. ON má 13 896–18 305 vrcholů; v těchto předlohách nebyly aktivní morph targets. Nejde o přejímku všech animačních póz.

Nejmenší geometricky platná varianta mění pouze `camera.maxZ`: maximum hloubky skutečných konzervativních corners v původním view plus původní minZ. Rozsah **10,06794–10,07243 m** místo 1100 m, beze změny pose, FOV 0,85, minZ 0,08 a camera pass. Zdrojová Game cesta používá default distance 8 a pitch 0,28, collision IO je výslovně no-obstacle. FOV-only nevyřadí zarovnaného vzdáleného svědka; far-only ano. To není důkaz výkonové výhody v celé hře.

Původní V1 měla skutečnou chybu obnovy cíle kamery: `setTarget` změnil také focal distance/reference point, ačkoli view/projection po restore souhlasily. Review P2 vedlo k RED a opravě. Far-only nyní `setTarget` vůbec nevolá; ostatní zkoušené režimy obnovují i target/focal/reference/roll/quaternion objekt. **77 přesných restore kontrol včetně 21 výjimek PASS**, bez rozvolnění tolerance. [V1](proof-v1/manifest.json) a její původní handoff/probe/report jsou zachované jako překonaná evidence; [RED](proof-v2/review-v2-target-red.log) a [GREEN](proof-v2/review-v2-green.log) dokládají změnu. Nezávislé delta review P2 uzavřelo bez dalšího nálezu.

World TreeWind/Fresh wrapper mimo hlavní frustum přesto při každém narrow-first ON vytvořil base a depth Effect a skutečně kreslil do shadow map. Velké terrain meshes mohou frustum také protínat. Zúžení tedy neslibuje čistě avatarovou práci. Zaznamenaná B6 reference je pouze shader/draw comparator: u Eli klipuje 234 vrcholů bot a 3 vrcholy trouser waist. Není to důkaz úplného avatar pixel coverage.

RawTexture IO adapter zachovává původní data/metadata a pouze dokončuje NullEngine upload; žádné falešné material/Effect ready. IO refs po cleanup 0. Sky/IBL a collision jsou explicitní IO stubs, GLSL/PCF fallback není WebGPU obraz nebo výkon. Root přesunul navazující runtime experiment do samostatného cache-only tasku; původní V4 a hrané buildy zůstávají stejné.

## Referenční GPU série plného V4

Edge WebGPU compatibility, NVIDIA/pascal, medium/manual, CSS i render 1512×642, 59,9 Hz, jeden skutečný multiplayer klient/Alex. Stejné řízené počasí s cloud 0,96; bez souběžného testu/buildu v měřicích oknech. API bylo čerstvé, vstup od spawnu. Startup **43,5224 s**, příprava **26,0032 s**, final gate 35,4 ms. 868 modulů, 52 sync a 500 async pipeline, vše dokončené bez pending/failures.

**Pořadí je postupně zahřáté.** První odlišná předvolba je Golden OFF a pak první F; Day/Blue/Night/Full Moon nejsou nezávislé cold přechody. Panel je otevřený kromě většiny F okna.

| Okno | Raw seq | FPS | p95 / p99 | Maximum | Nové moduly / sync |
|---|---|---:|---:|---:|---:|
| Golden OFF |1295–1369|44,8|28,9 / 35,6 ms|124,5 ms|0 / 0|
| Golden první F |1481–1718|35,5|43,2 / 90,4 ms|210,9 ms|4 / 2|
| Day po F OFF |2569–2639|46,4|27,4 / 32,6 ms|121,2 ms|0 / 0|
| Blue |2900–3123|40,9|33,2 / 51,7 ms|161,4 ms|0 / 0|
| Night |3591–3756|41,7|34,8 / 47,2 ms|119,5 ms|0 / 0|
| Full Moon |4213–4280|43,9|29,2 / 33,5 ms|125,5 ms|0 / 0|

F seq1488 je 828,5 ms po startu. První interval 113,8 ms/CPU111,9 ms bez nového programu; druhý 119 ms/CPU92,1 ms se dvěma programy a shadow target59,4 ms. Zaznamenaný nový materiálový Effect patří listům; maximum210,9 ms přichází po CPU27,8 ms. F OFF seq2561 je **717,4 ms před Day benchmarkem** a 752,3 ms před volbou Day; všechny jeho sampled kontexty mají F=false. Starší okamžitý UI pressed stav není důkazem opaku.

Golden a Full Moon mají podle přesného zdroje kladný DIR: přenos přímého světla má kladné minimum, Golden volí Sun+3° a lunar preview Moon>10°. Naměřený enabled počet 3/4/3 při outside/vehicle=false/torch OFF/ON/OFF podporuje odvozené HEMI+DIR+1mapped POINT(+SPOT). Log neexportuje přímý seznam světel ani jejich per-material pořadí. **Cloud 0,96 vypnul celestial shadows, ne automaticky DIR.** `shadowSource=none`, caster/selection counts0 proto znamenají nepokrytou větev nebeských stínů.

Raw session `4c6c590b-dc97-4f44-8fd3-6cec78906a07`, 4451 souvislých záznamů, SHA `419cccef224db76dd5a2644082a4b5ec3c627baeb0270baa8f167bc308aa0221`. Health všech oken valid, pending/errors0, stage cap21 bez overflow/unknown/limited. Dispose4433 bez chyb a profil4434 inactive/resources0/observerErrors0. Všech13 weather payloads shodných; ambient se mezi okny mění. [Golden ON](inactive-light-v4-presets1-golden-on.png), [Full Moon](inactive-light-v4-presets1-full-moon.png). B6, clear weather, další avatary a nezávislý cold lunar přechod zde nebyly ověřené.

## Rozhodnutí a hranice dalšího experimentu

Day1 světové varianty mají využití při GoldenHour, svítání/soumraku, lunar DIR, řízeném autě a pohledu z B6 ven. Nelze přijmout zúžení pouze podle geometrie avatara. Samostatný far-only QA kandidát musí zachovat první Golden OFF/F a samostatný cold B6 entry/F/outward/exit proti plnému V4; nové world kompilace nebo ztráta pokrytí znamenají odmítnutí. Všechny etapy, readiness, timeout i B6 spatial restore zůstávají povinné. Shader/shadow sdílení může práci jen přesunout do jiné etapy, proto se měří celý startup.

[Archivní manifest](archive-manifest.json) ověřuje 70 převzatých souborů včetně rozbalených gzip obsahů. Nativní kód a hrané4193/4192/4188 se tímto důkazem nemění. KEY-31 i migrační cíl zůstávají otevřené; zbytkové intervaly nad100 ms stále trvají.
