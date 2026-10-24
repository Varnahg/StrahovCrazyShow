# Příprava vlastního stínu po změně postavy

24. 10. 2026. Navazuje na actualsource14 valid0/1/0 a [původní avatar chain](avatar-edit-shadow-preparation.md). Task332 je dokončený CPU reproduktor, nikoli produktová oprava: author24seal84e32478 ověřen rootem a nezávislým review bez nálezů. Původní nové testové vstupy jsou zachované v `avatar-shadow-probe/source-before/`.

## Mechanismus a důkazy

V obou native CPU cap větvích skutečné Game metody vytvoří Mia→Robin. Tři Mia near submeshe sdílejí shadow Effect srefcount3; původní root.dispose a normální OFF/base snímky vedou krefcount0/disposed/cache absence. Robin má main Effecty, ale žádné shadow sloty. První skutečný torch draw vytvoří nový Effect/context se shodným plným klíčem; opakování0. Cílené tři původní native isReady calls při OFF v přesném existujícím passu přesunou tuto kompilaci před F. DefaultNull i explicitní bone-texture cap větev mají shodný mechanismus. Rawcaps potvrzují textureFloatfalse/units16 vdefaultu, nikoli0units. Production skeleton texture policy se nemění.

Sonda má3PASS a2desiredlazyRED, scoped2roots/TS0/syntax0. Aggregate firstprograms zůstávají2lazy/1targeted; zbývající targetedcontext není shadowcontext vlastních tří cílů. NullEngine/GLSL/Poisson není skutečná GPU eviction či WGSL, ani frame hitch důkaz. Async passscope sondy je pouze sekvenční experiment; produkt musí pass obnovit synchronně před yieldem.

## Rozumné varianty

| Varianta | Cena, výkon, cache a lifecycle | Volba |
| --- | --- | --- |
| Dnešní lazy cesta | Nejmenší práce při editaci, prokázaný pozdější požadavek při F | Reference |
| Cílená příprava3ownnear během existujícího PlayerFlashlight.update iOFF | Přesune jednu kompilaci před F, neušetří ji. Malý bounded stav, původní native shader rozhodování a vlastněný generátor/pass. Bez Gamehooku, timeru či Sceneobserveru. | **Zvoleno** |
| Držet starý rig/Effect do navázání nového | Může zachovat cache bez nové kompilace, ale mění dispose/prune pořadí, referenční vlastnictví, pool reuse a peak resources. Nemá nyní srovnatelný lifecycle/performance důkaz. | Odloženo |
| Whole-renderList forceCompilationAsync nebo76stage restart | Bere cizí/world castery, vlastní polling bez avatarfilter/abort, rozsáhlá práce/timeout dopady. | Nezvoleno |

## Nejmenší produktový kontrakt

PlayerFlashlight.update už dostává aktuální localrig a kvalitu. Nový úzký VehicleLighting vstup připraví pouze konkrétní vlastní3opaque PBR near meshe bez wrapper/instances/morph. Shared player shadow konfigurace/mapresize se musí používat i při OFF přípravě, protože dnešní earlyreturn jinak ponechá starý pass pro novou kvalitu. Enabled/intensity/shadow policy, caster selection, velikosti map a filtry se nezmění. Car cesta zůstane původní.

Před prvním pokusem aktualizovat jen vlastní world matrices kvůli NONUNIFORMSCALING. Basic ShadowGenerator.isReady nepotřebuje main PBR Effect; tuto variantu před prvním baseframe je nutné přímou regresí ověřit. Každá dávka synchronně uloží aktuální pass, nastaví skutečný map.renderPassId, zavolá originály a ve finally obnoví původní pass; žádný await.

Jediná práce drží konkrétní root, tři meshe/materialy, normalizovanou kvalitu, generátor, mapu a pass. Maximálně3native readiness calls/update a32dávek na stejnou konfiguraci, tedy nejvýše96calls i při permanentním notready. Vyčerpání není ready a stejná konfigurace se nesmí automaticky každý frame obnovit. Normální native F cesta zůstává fallback; první okamžitéF před dokončením ani úplnou GPU pipeline/zerohitch tento pomocník negarantuje. Completed/unsupported/unavailable steady cesta má jen levné identity kontroly bez alokací či světového scanu.

Změna rig/mesh/material/quality/map/pass ruší starou práci. Undefined/disposed rig a dispose vyčistí vlastní reference. Po každém native callu se znovu ověří konkrétní own stav kvůli synchronním callbackům; stale průchod nesmí přepsat novější. Výjimku včetně falsy throw zachovat, vždy restore pass. Unsupported se nesmí hlásit jako připravené pokrytí. Žádné guessed shaderflags, effect cache retention, starý rig, proxy světla nebo změna30/90startup limitů.

Implementace má zahrnout cílený refaktor společné player konfigurace a skutečné lifecycle/quality/reentry/false-ready/unsupported/finite-budget regrese, původní actualrig reproduktor i před-base test. Nové skutečné GPU ověření a fresh snapshot až po samostatném přijetí source/CPU a dalším CADwindow. Main/default/KEY22 a finální výkon zůstávají otevřené.
