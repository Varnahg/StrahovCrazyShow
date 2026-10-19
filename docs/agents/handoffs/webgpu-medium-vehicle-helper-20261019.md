# Předání: webgpu-medium-vehicle-helper-20261019

- Vlastník: `webgpu-01a15102-medium-vehicle-helper`; příjemce `/root`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow`, detached HEAD `f1981635` při zadání. Pinned vstup `.cache/webgpu-garment-init-qa-20261019/snapshot`, source ID `06754993e63049552768a7114f7a7fb8233cae0c2770a23336e9e071df8bc220`, obsahuje SDWf8 a garment068.
- Výsledek: izolovaný copied kandidát připraven k vlastní QA/integraci koordinátora; žádná integrace do main ani GPU/FPS přejímka tímto předáním.
- Zápisy: pouze `.cache/webgpu-medium-vehicle-helper-20261019/` a tento handoff. Žádné kořenové runtime/testy, cizí WIP, package/lock/vendor patch nebo fyzické node_modules nebyly měněny. Žádný staging/commit.
- Koordinace: načteny AGENTS/policy/task/mapa/koordinace/current-work, git status/worktrees a registr. Claim i heartbeat proběhly pod vlastním ownerem. Rozšíření původních dvou copied runtime souborů o render-quality-preparation bylo před zápisem výslovně autorizováno koordinátorem a skutečně zapsáno do task JSON; žádný další BMAD renderer/podagent.

## Výzkum a volba

Podrobnosti jsou v `RESEARCH.md`, `LATE-REQUEST.md` a `CONTRACT.md` helperu. Projita celá skutečná chain prepareLighting → prepareRenderQualities → prepareLightingVariants → prepareLightVariants → authored selection → updateRenderEnvironment/applyArtLighting → VehicleLighting. Current actual trace3320 obsahuje vehicle shadow/pass creation a light resync na vstupu, ale neudává CPU share ani atribuci všech6/9 nových programů. Tato hypotéza se nevydává za úplnou příčinu záseků.

Původní vehicle0/1 byly jen Low bez stínů. Medium skutečně používá256 a High512 shadow map, s původním PCF/shadow chováním. Medium/High mohou mít dva mapped POINT při ambient+car a vypnutém skutečném celestial key; při dalších zdrojích clamp1/0. Samotné rozšíření0/1 je neúplné. Po srovnání s initial-quality-derived stage setem a novou restart orchestrací byla zvolena stabilní0/1/2 matice každého WebGPU passu. Low2 se úmyslně clampuje na1 a opakuje již připravený stav. Startup cena je explicitně **48 místo41** stage při stabilním requestu. Timeouts, shader/light/shadow hodnoty a scene/gameplay chování se neoslabují.

Actual retention proof potvrdil, že stabilní requested quality běží poslední, takže Medium256/High512 RTT/pass je hotový před vstupem a následný vstup jej nemění. Samostatný test ale přes skutečný Game.setQuality/applyAdaptiveQuality + skutečný AdaptiveQualityController odhalil platnou pozdní změnu: během finálního temporaryMedium zůstane requestHigh odložen, restore aplikujeHigh při neaktivním vozidle a ponechá starou256 mapu. Existing quality fixture tento late-request kontrakt už požadovala; veřejné setQuality nemá ready gate. RED `red-late-public.log` zachován.

Po schválení scope je nejmenší oprava reuse existujícího passu: optional getter requestedQuality v quality helperu; po complete final attempt při odlišném posledním requestu přidat další plný final attempt, stále s původním started/paused a90s celkem, min(30s,remaining). Žádné resetované hodiny/timery, generator/Effect cache ani private hack. Historické finalPass=true se nepřepisuje, protože původní callback už jako final proběhl. Stable3passes/48; testovaná lateMedium→High4passes/64. Další skutečné změny mohou původní deadline vyčerpat a skončí timeout, nikoli falešným ready.

## Přesné přebírané soubory

Manifest `.cache/webgpu-medium-vehicle-helper-20261019/manifest.json` SHA-256 **`b7f2ddfb9c7230972b0411b254fb11f2e44923c874f70659630e0cceefd322d2`** obsahuje přesně těchto osm `files`:

| Soubor pod candidate/ | SHA-256 |
|---|---|
| client/game.ts | `67b026b976af9f316bcac323a603046b57cf2f6c8653f8d1fe22c7bb27ca8750` |
| client/light-preparation.ts | `f7fc4343f7e70245a53130cf06f9041ad224120e05e005edb7564067499521db` |
| client/render-quality-preparation.ts | `456a3daea741fbdb3e190eea87e443c7678d200cafc0d49bcfd51dd6a07a801a` |
| tests/game-authored-light-preparation.test.ts | `862874d7a7dfe29cabc793d8115cd9822fa3856482f233bac55a7a09deedd932` |
| tests/game-light-preparation.test.ts | `0e9c11f720f022492453b673bc3716a45f364e115ad5fc10d54977d8f1906330` |
| tests/game-low-vehicle-preparation.test.ts | `b682832524f1c2f87f6da7fdc68c93f7d26b2373771bb9092f3fa64673745b86` |
| tests/game-quality-preparation.test.ts | `2b0aa855ca824161f0a1b64590249c6ea0dd12029a7be064e03380b08b9db9a3` |
| tests/render-quality-preparation.test.ts | `904c018bdb5e373491144fc54b643b23b29c818286d5c634306391ded02df894` |

`source-inverse.json` a freeze.mjs ověřují byte-exact inverzi všech tří runtime souborů do source067. `runtime-and-tests.diff` obsahuje jen vlastní osmifile delta. Celé ostatní copied client/shared/tests byly porovnány beze změn. Borrowed node_modules/public/assets jsou readonly directory junctions; jejich cíle jsou v manifestu. SDW zůstává f8, MD F3 zůstává3cc. Runtime změna se nesmí přenést plošnou kopií cizího rootGame WIP; root vlastní samostatnou integraci.

## Implementace a refaktoring

Vnitřní Options `includeLowVehicleVariants` je přejmenované na `includeVehicleVariants`, stage typ rozšířen na0|1|2. Native Game gate nyní zahrnuje všechny quality a stejný authored selection/lifecycle. Stávající forced POINT clamp zůstal přesně původní. Nový optional requestedQuality getter je jediná další orchestrace; callback absent zachovává původní fixed traversal. Připravené materiály/efekty a prostředky vlastní stejné controllery, bez nové runtime cache/profileru/alokovaných proxy světel. Concrete node flags se nadále vracejí jen vlastním zachyceným kořenům.

Test consumers nyní očekávají48 a oprávněné16/případné64; původně Medium native fixture bez car roots dostala skutečné TransformNode/VehicleLighting pro nově dosažitelnou větev. Native authored representatives se ověřují ve vehicle větvích všech kvalit. WebGL nadále9 a žádné lease/FAR/authored přidávání. Unikátních20 pojmenovaných inventory labels včetně construction/assets/submitted-frame/ready stále vejde do původních maxStages21 s overflow; limit nebyl zvětšen.

## Provedené ověření

Příkazy používají běžný borrowed `tsx --test`, žádný QA module loader nebo novou env source override. Nové případy jsou v běžných `.test.ts`; staré volitelné GAME_*_SOURCE seams v převzatých fixtures zůstávají, helper je nenastavoval. NullEngine provádí skutečnou Babylon CPU/render/lifecycle chain, nikoli nativní GPU výkon.

- `red-medium`: původní Game nativeMedium má13 a chybějí vehicle0/1/2; očekávaný RED exit1, log zachován.
- `green-new`: rozšíření0/1/2 před tail opravou **5PASS/1FAIL**: skutečné Medium/High SHADOW+SPOT/POINT defines, reálné256/512 mapy, nonvacuous2POINT a fixed requested order PASS; latequalitymap256vs512 FAIL. `red-late-public` potvrdil totéž přes actual veřejný setQuality/controller.
- `interim-chain` **105/106** (stejný známý latecase); negativní name filter ho kvůli suite kontextu nevyřadil, nic se nezamlčelo.
- `extended-lifecycle` **30/30 PASS**: Low/Medium/High cancel/dispose/fault/timeout/throw, oba disposed roots, replacements; Medium/High quality/profile/weather revisions; actual extra enabled PointLight rozpočty1/0.
- První `green-late` **5/6**, pouze chybně očekávaná aritmetika testu čtvrtého timeoutu29995 místo správných29980, neboť remaining total již zahrnuje všechny předchozí apply náklady. Opraven jen očekávaný test; runtime beze změny.
- Konečný `final-chain`, 2026-10-19 **14:57:40.418–14:57:49.260 UTC**, exit0: **152/152 PASS**, osm fixturefiles: game-low-vehicle, game-light, game-quality, light-preparation, render-quality-preparation, authored-light-preparation, vehicle-lighting, game-authored-light-preparation. Zachované raw log/command/timestamps jsou final-chain.log/json.

Konečné testy dokazují skutečné zero/one/two POINT counts při dostupném budgetu, nonvacuous dvě světla na moonless noci, omezení1/0 skutečnými extra zdroji, skutečné256/512 shadowEnabled a SHADOW defines, main Effect reuse a stejné RTT/pass při vstupu. Dále actual mapped authored factories mimo pohled, FAR aktivaci/cleanup, revision, ready draws, shadow lifecycle a WebGL starý režim. Tail case má64 stages a flags false/false/true/true, RTT512 před první jízdou. Repeated changes spotřebují originální90s: čtvrtý timeout29980, pátý9975, overrun účtovaný, dispozice/restore error identity i absent optional callback ověřeny.

Po tomto posledním běhu změněn pouze `import type`/type-only ShadowGenerator cast ve vehicle testu podle veřejné SDK návratové deklarace IShadowGenerator a vysvětlující komentář final-attempt v runtime helperu; žádný executable kód. V manifestu je tato hranice výslovná. Full typed check/build/integration patří rootovi, child je nespouštěl.

## Omezení, procesy a další krok

Toto není GPU/WGSL parity, produkční A/B, důkaz FPS úspory ani odstranění všech zbývajících programů/záseků. Čas startupu48 vs41 nebyl měřen. Jeden generator zůstává single-owner; pozdější interaktivní změna kvality po ready může legitimně resize mapu. Low si může ponechat nepoužitou dřívější shadow mapu, ale nevykresluje shadow pass; nový cache mechanismus se nepřidává.

Žádné fullsuite/build/install/GPU/servery ani další agenti nebyli spuštěni. Všechny cílené subprocessy skončily, žádné PID/porty nezůstávají. Parent dostal explicitní konec CPU testů v14:57:49UTC a finální hashe před svým GPU. Potom jen čtení, hash IO, inverse a handoff.

- Rezervace: držena do zápisu tohoto handoffu; poté release a jeho výsledek předán rootovi. Release neznamená přijetí tasku.
- Integrátor `/root`: převezme osm přesných souborů, provede independent review a čistý/combined checkpoint TS/test/build/integration a skutečnou produkční Edge přejímku. Teprve integrátor aktualizuje task/Linear/commity/main a rozhodne o přínosu. Hrané snapshoty zůstaly nedotčené.
