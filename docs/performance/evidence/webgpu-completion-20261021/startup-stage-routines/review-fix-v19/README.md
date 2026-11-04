# V19: čtyři konkrétní opravy po review

Převzetí původním autorem podle vlastního V18 handoffu a root koordinace24Oct07:48UTC. Starý helper92577509/38,118owned seal i původní handoff jsou neměnné. Nová sousední depth5kopie helper/v19; výstupy pouze ve vlastních review-fix-v19 prefixes. Triage round-1 četl autor před změnami.

1. Před instalací stage owner může skutečný browser clock odmítnout Guest nebo prošlé A. Volíme vynechat již optional field, nikoli rozvolnit strict validaci null/přítomného profilu. Původní rejected raw a chyba zůstanou původní.
2. Browser identity už startupRoutines vždy emituje. Pipeline receipt uzavřený whitelist proto potřebuje pouze tento už předem ověřený scalar. Neotevírá se arbitrary field ani nový typ.
3. RTT addInit může uspět a addFinish hodit. Malá registrační transakce odstraní jen vlastní první observer při druhém selhání a nechá chybu dosavadní diagnostické install větvi. Rendering/notifications se nepřidávají ani nepohlcují.
4. Nový test musí vykonat skutečný transformed Game.prepareLightingVariants callsite a původní options literal bez ruční registrace. Callback seams oddělí svět/zdroje, ale nemohou nahradit injekci ani options konstrukci.

Rozsah zůstává čtyři helper soubory (overlay,receipt,module,test). Žádný runtime/Game/native/cache/timeout/API zásah. Jen jeden dotčený cílený testový soubor a syntax/readonly SHA guards; širší ověření a skutečný build/GPU provede root. Varianty širšího wrapperu nebo nullable validátoru jsou pro tyto doložené chyby zbytečné. CPU není výkonová/GPU přejímka.

## Výsledek

V19/38 helper7459213b6383e99b5b5bfc2f2b547833eb30dc566b65b8a5f0b9592d456ca800, přesně4změněné vstupy a34byteexact proti V18. Dotčený testový soubor má21PASS/0FAIL/0SKIP za2.4548s.4syntax kontroly0;231chráněných souborů před/po bezdriftu, včetně původního V18/118sealu a jeho handoffu. Full corpus/build/GPU nebyly spuštěny.

RED17PASS/4FAIL je zachován s původními test inputs. První GREEN20/21 odhalil pouze chybějící camera/trafficInstant nové pre-owner fixture; doplněny skutečná Scene.activeCamera a scalar clock. Runtime kvůli tomu nebyl měněn. RTT regrese ve finálním testu kontroluje okamžitě aktivní observer count a původní notifications/render a po původním native deferred cleanup turn fyzický seznam. Nevyužívá private Observable counter ani nepřidává helper timer. Původní native deferred odstranění je zaznamenané, nikoli vydávané za synchronní odstranění.

Aktivní resolved startup nadále musí mít svůj profil; jeho odstranění je negativní regrese. Přítomný null nebo malformed profil se stále odmítá. Rejected start před ownerem zachová optional absenci a originální chybu; oba skutečné clock refusals (Guest i prošlé A) vykonává celý overlay s původním installBrowserClock. Pipeline whitelist propouští jen identity-ověřený startupRoutines null/closed target a nadále odmítá cizí klíče/typy/neshodu.

Nový Game test vykonává skutečný transformed prepareLightingVariants body a původní options literal bez ruční registrace. Callback/host/constructor seams vyřadí celý svět; krátký routing seam vybere původní19variant při konstrukci options a před každým skutečným renderem je engine nativní NullEngine/GLSL. Původní untransformed Game callsite je negativní kontrola: stejný běh bez injekce nevytvoří pass/stage/frame trace. Nejde o hardware/WGSL/fullGame performance důkaz.
