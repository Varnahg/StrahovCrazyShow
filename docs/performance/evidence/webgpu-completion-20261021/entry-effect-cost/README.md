# První vstup: dvě vnitřní effect hranice

Task `webgpu-completion-entry-effect-cost-20261024`; vlastník `webgpu-completion-01a15a3e-entry-effect-cost`. Výchozí754dde6a, vlastní depth5 kopie V18 z neměnného V17/36/helper37646a00. Produkt, native dependency, starý helper a raw se nemění. Pouze cílené lehké CPU kontroly; žádné pnpm, build, server, GPU nebo celý helper corpus.

## Podklady a rozhodnutí před kódem

Primární podklady: `source15-blocking-costs.md`, `research/source15-blocking-costs-decision.md`, skutečný source15 receipt9487731c (frame6016–6023), původní recorder b7c86834 a before/after compiler bracket. Zásek210,9ms má CPU209,8/render191,3ms; první main PBR readiness62,4 a Standard19,1ms. Nula nových compiler/pipeline požadavků sama neurčuje cache-hit, serializer nebo JIT příčinu. Tento výzkum není performance přijetí.

Pinovaný Babylon9.30: PBRBaseMaterial.isReadyForSubMesh921 → _prepareEffect963 → _prepareDefines → dirty gate (čistá větev vrací null) → ABI/fallback/defines.toString1182 → engine.createEffect. WebGPU vlastní metodu1534; WebGL Engine ji dědí z ThinEngine1682. onEffectCreated/SubMesh.setEffect jsou až v readiness po návratu _prepareEffect. Generic cache API může volat positional onCompiled a zvyšuje refCount, PBR však předává callback v options. Effect constructor může zahájit async processing mimo synchronní API span. Žádná z nových metrik není GPU compile čas ani doklad cache hitu.

| Varianta | Dopad | Volba |
|---|---|---|
| Dva separátní profilery vedle původních8 | Původní readiness selfSelected neodečte nové děti; riziko doublecount | Ne |
| Jeden nový pevný10target stack | Zachová společnou hierarchii a odliší readiness residual, prepare residual a createEffect API; omezená observer režie | Ano |
| Hned měřit MaterialDefines.toString | Vyžaduje receiver identitu skutečného defines argumentu a předbíhá lokalizaci | Odloženo |
| Opravit cache/reset/serializer bez měření | Nemá kauzální podklad a mění vlastnictví/binding | Ne |

Samostatná akce pod již default-off `--routine-cost`, nový receipt/profile. Původní8 moduly/akce a entry waiter zůstanou byteexact. Waiter použije existující startCapture factory, jeden30s deadline a8původních Scene renderů. Nový stack má10rutin/4fáze, stack32,100000calls/frame,128phaseevents/64renderers. Exact native descriptor check před zápisy; engine hook jen na konkrétní instanci, PBR na původním prototype s own-scene filtrem. Obnovení pouze vlastních descriptorů, explicitní partial/conflict/throw; po stop žádné Game/Scene/engine reference v owner state.

Přidání nullReturns rozliší čistou PBR větev. Žádné cache čtení, key rekonstrukce, extra readiness/render/GPU/await/Promise reakce. Výstup obsahuje pouze pevná ID a scalars, nikoli Effect/material/name/source objekty. MaterialDefines.toString zatím neměřit. Případná pozdější diagnostika Standard internals musí být samostatná; nelze ji vysvětlovat podle PBR hranice.

## Ověření

Před/po guards jsou v before.json a následném proofu. Cílené testy musí vykonat native null/dirty/reuse, obě backend origin větve, společné nested selfSelected, reentry, foreign passthrough, original returns/Promise/falsy throws, atomický rollback/late references, lifecycle/deadline/frame IDs/caps a receipt tamper. Každý skutečný neúspěch zůstane zachovaný. CPU/NullEngine/terminal IO nejsou GPU důkaz. Finální exact counts a hashe doplní handoff po doběhu.

## Dokončený refaktor a meze

Nový core validuje všech10 descriptorů před prvním zápisem včetně inherited engine metody; nevytváří dočasný native-valued slot. Každý původní capture frame znovu kontroluje vlastnictví10 hooků. Foreign material passthrough neměří vlastní clock/row a během synchronní cizí material větve brání převzetí own engine association. Části callbacků stále patří inclusive API spanům. Engine class origin se importuje z pure modulů, aby nové obaly nepřidávaly barelové shader-registrace.

RTT before/after registrace má dílčí rollback; diagnostická chyba z notifikace nepřepíše původní notifikaci. Cleanup nuluje owner state a uvolňuje hook/listener seznamy. Retained wrapper po dispose volá pouze originál; test getteru zaniklého Game nesmí být znovu čten. Nejde o obecný důkaz nulové GC/VRAM retence nativního enginu.

Ve V18 jsou změněny pouze pět copied-test kompatibilitních count/import míst (6výskytů) a jsou reverzibilně ověřeny vůči veřejné donor-v17 kopii. Staré routine-cost/core, entry-render-cost a entry-routine-cost runtime moduly a celé původní bloky tlačítek jsou byteexact. Nové helper vstupy39, staré36 zůstávají neměnné. Native WebGPU cache ABI CPU případ má explicitní terminal cached record a neinstancuje GPU/device.

## Finální zdrojový checkpoint

Konečný helper 509888ebe5e37468a6f32fba1c0888e0ad0a6fd81a4578d584c8043179363465 má39vstupů. Nový jediný cílený test:42PASS/0FAIL/0SKIP, exit0;38MJS syntax0 a actualUI transform parse0. Celý starý helper corpus, build, fullprojectTS, integrace, browser, GPU ani instalace nebyly spuštěny. Cílená fixture používá přesné3souvislé AST statementy původního Game.frame +skutečné Scene/Gltf/Stable/PBR, ale fake Actor/health/DOM/transport a NullEngine/terminální IO; nejde o spuštění celého Game či GPU.

Finální proof je complete-inputs/verification.json. První verification.json/targeted-final.tap/d81f archiv jsou development42 checkpoint s neúplným before/after seznamem veřejné donor testdependency; nesmějí se vydávat za finální kompletní input guard. Při opravě se runtime neměnil: do testfixture se přidal původní AST prelude místo ručního pořadí a do before/after veřejnýdonor36+verifier. Je zachovaný původní verifier i39d81f source bytes. Nový finální běh má stejné42PASS a kompletní vybrané inputy. Předchozí21/30/33/38 logy také zůstaly zachované; žádný testfailure se nemaže ani nevyrábí.

Guardy zachycují původníV17live36, production11, native39,8explicitních native ABI modulů včetněThinEngine, veřejnoudonor36, starýV17seal a4původnísource15 receipty, metadata normalizaci i vlastní verifier. Vše před/po shodné. Nejde o rehash všech transitive node_modules ani obřích assetů. Materiálové/shaderové rozhodování zůstává původní.

Přenosné sources/ obsahují přesně39current inputů; donor-v17/ je jejich původní36výchozítestdependency. Příkaz node docs/performance/evidence/webgpu-completion-20261021/entry-effect-cost/materialize.mjs obnoví pouze vlastní helper prefix a odmítne rozdílné existující bytes; dependencies ani cizíV17target nemění. Zde proběhla jen kontrola existujících39/created0. Nový cílený soubor lze po odpovídající instalaci spustit přímo Node/tsx. Staré kopírované testy mají další původníhistorickéV10/V12 cache reference; jejich celý corpus přebírá root v novém zdrojovém okně.
