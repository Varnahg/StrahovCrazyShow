# Izolovaný Day1 far-plane kandidát

Vstup je frozen V4 bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0 a jeho fyzická QA core/loaders identita s inactive-falloff opravou. Jde o malý QA experiment po přijatém CPU proofu V2 0cadc7d49b71a567cb3ac27974a8e6e3502676640d13afb232b0d4fa9dff3730. Native/main, V4, závislosti ani hrané buildy se nemění.

## Proč tato varianta

Předchozí průzkum porovnal nové pohledy/FOV, far plane, layer mask, scissor, forceCompilation a orthographic. Jen far plane zachová původní pozici, target, FOV, minZ, perspektivní definice i main pass a omezí vzdálený zarovnaný main mesh. Masky vyžadují správu cizích mesh stavů, scissor neculluje přípravu, forceCompilation nezaručuje přesné render descriptors a orthographic mění shader variantu. Combined FOV/target varianta přidává mutace bez prokázané výhody. Předchozí V1 restore chyba je opravena a archivována ve vstupním proofu; tento runtime helper vůbec nepoužívá setTarget.

AvatarLodController odpojuje neaktivní LOD části ze scene.meshes, ale nechává je pod rootem. Proto samotné getChildMeshes nestačí. Helper vezme všechny aktuální Game.avatars roots a jejich skutečně připojené, enabled, viditelné child meshes v camera layer. Neprovádí frustum cull: vzdálený avatar rozšíří union i za cenu menší úspory. Authorované skinned bounding envelopes se čtou beze změny, nepřepočítávají se z bind-pose vertices. Maximum jejich world corner depth v původním view + původní minZ určí maxZ, nejvýše původní hodnotu. Prázdné/nečíselné/nevhodné geometrické vstupy ponechají plný view. Skutečné výjimky z mesh APIs se nezachytávají jako fallback.

## Integrace a životní cyklus

Scope vzniká pouze uvnitř původní Game.prepareLighting. Před každým stage apply i restartem vrátí maxZ; pouze day-1-off/on aktivuje omezení před skutečným draw. Před každým draw těchto dvou etap znovu čte aktuální mapu avatarů a jejich bounds, protože pohyb nebo výměna rigů nemusí změnit dosavadní count-based revision. Není zde trvalá cache, registr meshů ani práce v interaktivním frame loopu. Krátkodobý Set scene.meshes a descendant arrays žijí jen během přípravného výpočtu; rigy scope neuchovává.

Restore, timeout/failure a finally vracejí maxZ idempotentně. Cancel wrapper to provede synchronně před původním callbackem i při retired Game; jde pouze o původní číselné camera.maxZ, bez setterů targetu, matice, draw nebo GPU. Scene observer zůstává původní jediný přípravný observer a detach respektuje vlastní wrapper identity. B6 camera/spatial cesta, poslední aktuální požadavky, 15 etap, dva dokončené ready draws, 30 s timeout, shader/pipeline health a final submitted-frame gate se nemění.

## Důkazy a hranice

Původní Game na nových dvou testech skutečně RED: maxZ zůstává 1100. targeted-final.log: 64/64 PASS; helper actual RH/LH perspective, multi-rig union, skinned authored envelope, regular instance, detach/visibility/layers/disposal, fallback a propagace chyby. Game testuje všechny stage boundaries, restart, vzdálený rig bez count revision, timeout, zrušení, renderer fault a skutečnou API chybu; existující startup/readiness testy zůstaly.

probe-avatar.ts je přesně hashovaný přijatý V2 proof s náhradou pouze far-only výpočtu za skutečný nový helper a jeho restore; ostatní projekční a Effect kontroly zůstaly. PASS 7 konfigurací, 119 captures, 70 porovnání plných defines/Effect identity, 77 přesných restore kontrol včetně 21 výjimek. Skutečné current-pose skeleton vertices a conservative corners nejsou oříznuté. Žádné aktivní morph targety, všechny animace, full-world collision ani celé multiplayerové rozmístění tím nejsou prokázané.

NullEngine používá GLSL/PCF fallback a schválený úzký texture-upload IO adapter se zachovanými daty/metadaty. Není to WGSL/pipeline/GPU/image/performance přejímka. Root teprve porovná celý startup, první Golden OFF/F a samostatný cold B6 approach/entry/F/outward/exit proti V4. Day1 plný pohled připravuje i užitečné světové D+P varianty za soumraku, lunar DIR a při pohledu ven z B6; nové kompilace či ztráta pokrytí jsou důvodem kandidáta odmítnout. Torch shadow work mimo main frustum zůstává a může zachovat část world přípravy. Timeout se neprodlužuje, přínos není předem tvrzen.
