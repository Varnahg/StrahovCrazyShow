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

Před/po guards jsou v before.json a následném proofu. Cílené testy musí vykonat native null/dirty/reuse, obě backend origin větve, společné nested selfSelected, reentry, foreign passthrough, original returns/Promise/falsy throws, atomický rollback/late references, lifecycle/deadline/frame IDs/caps a receipt tamper. Každý skutečný neúspěch zůstane zachovaný. CPU/NullEngine/terminal IO nejsou GPU důkaz. Konkrétní counts/commands/TAP/SHA a omezení jsou v předání tasku a public verification.json. Starý corpus, build a GPU provede až root v přiděleném okně.

## Použití koordinátorem

Nový immutable build potřebuje existing --routine-cost (výchozí false). Po startup ACK a při vlastním ready pěším Game zvolit „Diagnostic · první vstup do auta /8 framů /10 effect rutin“, potom normálně požádat E o nástup. Waiter čeká na skutečný Actor false→true, ne na samotnou klávesu. Jedna entry akce na Game; po miss/refusal je nutný nový Game. Nevrstvit staré8/3 akce ani jiný profiler. Receipt kind entry-effect-cost obsahuje entryTrigger a nový entryEffectProfile (10×4 rows/frame); nejde o staré routineProfile. První frameId je trigger ID, nativeFrameIdAfter je až následující ID.

PBR hranice nevysvětluje Standard internals. Engine span není čistý cache lookup a nečte cache/keys; nullReturns platí pouze jako pozorovaný původní return. Časy jsou diagnostické inclusive wall spans; předmětem není FPS či GPU. Origin webgpu-own nebo thinengine-inherited musí být doložen konkrétní nativní metodou.

## Dokončený refaktor a meze

Nový core validuje všech10 descriptorů před prvním zápisem včetně inherited engine metody; nevytváří dočasný native-valued slot. Každý původní capture frame znovu kontroluje vlastnictví10 hooků. Foreign material passthrough neměří vlastní clock/row a během synchronní cizí material větve brání převzetí own engine association. Části callbacků stále patří inclusive API spanům. Engine class origin se importuje z pure modulů, aby nové obaly nepřidávaly barelové shader-registrace.

RTT before/after registrace má dílčí rollback; diagnostická chyba z notifikace nepřepíše původní notifikaci. Cleanup nuluje owner state a uvolňuje hook/listener seznamy. Retained wrapper po dispose volá pouze originál; test getteru zaniklého Game nesmí být znovu čten. Nejde o obecný důkaz nulové GC/VRAM retence nativního enginu.

Ve V18 jsou změněny pouze pět copied-test kompatibilitních count/import míst (6výskytů) a jsou reverzibilně ověřeny vůči veřejné donor-v17 kopii. Staré routine-cost/core, entry-render-cost a entry-routine-cost runtime moduly a celé původní bloky tlačítek jsou byteexact. Nové helper vstupy39, staré36 zůstávají neměnné. Native WebGPU cache ABI CPU případ má explicitní terminal cached record a neinstancuje GPU/device.
