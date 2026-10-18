# KEY-31: přesné přiřazení zbývajících programů

18. 10. 2026. Jde pouze o izolovaný diagnostický experiment. Runtime main zůstává na přijaté opravě trávy `cb236094`; nový profiler nebyl přenesen do produkčních zdrojů. Hraný4197 a starší snapshoty se nemění. Celá migrace ani KEY-31 nejsou dokončené.

## Proč tento sběr

Předchozí inventory dosáhl1024položek a8materiálových detailů ztrácelo vazbu mezi novými programy a stovkami přepnutí hotových Effectů. Zvýšení počtu detailů ani first-seen Effect nedokládá skutečnou přípravu. Copied rozšíření stávajících compilation/incident profilerů propojuje maximálně32 skutečných `_preparePipelineContextAsync` requestů přes context identitu s pozorovanými Effect/material/submesh/geometry daty. Nejvýše4 uživatelé/request, defines16KiB po escapingu, chunks1024, explicitní omissions. Aktivní pouze s `profileEnvironment=1`, lokálním logováním, WebGPU a aktivním benchmarkem. Žádná nová Promise větev, readiness polling, shader cache či běžná frame práce.

V1 review našlo P2: celková velikost metadata mohla překročit32KiB logger limit. Opraveno se skutečným RED/GREEN; následný recheck doplnil růst textu při redakci. V2 kontroluje skutečnou klientskou i opakovanou serverovou sanitizaci. Poslední nezávislý recheck bez vady. V1 zachovaná. Final55/55 targeted PASS, full TypeScript/build PASS; nejde o nový fullsuite/native checkpoint.

## Jeden skutečný sběr

Source snapshot `28e28738157412fb0c4e77cd38d75d0516326ebd5c878c380213764180fa7738`, Edge/Nvidia Pascal, WebGPU compatibility, Low77 %, CSS1528×650/internal1175×500, noční preview1792360800000, řízené počasí. Jedna skutečná multiplayerová relace **a5 simulovaných cestujících**. V předchozím grass B1 bylo0cestujících. Doprava používá Date.now()+network offset, nikoli fixní světelný preview čas; proto tento běh není performance A/B.

Benchmark87794,1→97804,3ms. Capture14requests přesně odpovídá deltě14preparations/28modules/28sync pipelines. Všechny fulfilled, defines úplné, unmatched0, request omissions0, observer errors0. Seznamy uživatelů jsou omezené na4 a explicitně vykazují vynechané další uživatele. Metadata z material notification neprokazují draw/adoption. Summary waitingEffects14 označuje zbývající registrované compile observery před cleanupem, nikoli14pending příprav; všechny byly před exportem odpojeny.

| Requesty | Čas od začátku | Materiály a varianty | Světla |
|---|---|---|---|
|618–620|0,662–0,702s|glass0 0/1 0, glass0 1 se svítícím oknem, shared outdoor PBR|automobil SPOT0 + mapped POINT1 + sky HEMI2|
|621–626|0,831–0,946s|NPC leather/metal/rubber instances, ocular medium, skinned sweatshirt/trousers, instanced head, skinned skin, hair curls|stejná trojice|
|627–628|2,747–2,766s|NPC strands-short02 alpha test, beard alpha blend/vertex alpha|stejná trojice|
|629–631|7,182–7,214s|stejné dvě glass varianty a outdoor PBR|automobil SPOT0 + sky HEMI1|

Všech14 má MAXLIGHTCOUNT4 a žádné SHADOW defines. Svítící okno navíc EMISSIVE, EMISSIVEASILLUMINATION a EMISSIVEDIRECTUV1. Přechod3→2 odstraňuje point slot a přesouvá hemisférické světlo. Původní dvě trojice jsou nyní přímo přiřazené; dalších8 jsou varianty pěti cestujících, kteří už byli v prvním post-ready kontextu. Není doložen pozdní import během jízdy. První FAR tráva opět nepřidala program.

Fingerprint v [souhrnu](summary.json) je FNV úplných captured defines, nikoli stabilní identita mezi relacemi. V této relaci se shoduje s incident effect.defines. Změna MATERIALPLUGIN_1 na historický suffix7 reprodukuje čtyři známé dřívější fingerprinty; pinned Babylon přiděluje suffix globálním čítačem. Pořadí inicializace avatar preview/Game se mezi běhy lišilo. Bez starých plných defines samotný FNV nedokládá textovou rovnost.

Startup41etap complete za45,931s, vstup→ready62,125s. Health start/end ready/valid, pending0, chyby0. Diagnostické FPS38,2/p9522,9/p99276,7/max1714,7ms nejsou důkazem zhoršení či zlepšení opravy trávy: změnil se soubor NPC, pořadí inicializace a běží detailní sběr. Celá následující mezera není naměřený GPU čas.

## Další rozhodnutí

Prokázané jsou nové kombinace materiálu, atributů a světelných slotů za jízdy. Zbývá rozlišit **nepokryté aktivní meshe při startupu** od **pozdějšího uvolnění již připraveného Effectu**. Příprava používá scene.getActiveMeshes(); benchmarkový capture historii startupu neobsahuje. Další oprava musí vyjít z těchto konkrétních skupin a lifecycle důkazu, ne z domněnky o pomalém GPU nebo ze snížení kvality. Žádný nový runtime fix pro tyto skupiny zde ještě není.

## Evidence a stav předání

`initial-archive-manifest.json` uchovává SHA44 vstupů; source/v1 a source/v2 obsahují šest konkrétních source/test souborů, copied zachovává neúspěšné fixture pokusy i skutečné RED/GREEN. `run/` obsahuje session, všechny requesty, benchmark a screenshot. Zdrojový manifest obsahuje také testy. QA4194/2589 je ukončená vlastním identity-checked helperem, karta je v menu.

Koordinátor přijal tento copied experiment a jeden skutečný sběr k samostatné integraci evidence. Neintegruje diagnostický runtime do main. Následuje cílený source/lifecycle důkaz pro šest konkrétních světelných programů. Celý KEY-31 a migrační cíl zůstávají otevřené.
