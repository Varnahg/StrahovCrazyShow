# KEY-31: CPU cena přepnutí již připravených materiálů

18. 10. 2026. Dokončený izolovaný proof; **žádná produkční oprava ani nová cache**. Vstupem je QA V6 `fc6efd2bcf91bd2b1720b35f090d74656352486ea7f09a2199dc69d14c61d525`. [Report a varianty](proof/report.md) rozlišují skutečně měřené hranice od hypotéz. Manifest V2 `7a25099dad279c07ef5cf203004802438fe657db392bb209a7dc1a91ec1dda23` prošel nezávislým čtecím review bez zbývajících nálezů.

Tři samostatné Node procesy: každý **5/5 PASS**, scoped TypeScript **2963 souborů / 0 chyb**. Pro každý druh materiálu celkem 48 warm přepnutí a 48 nezměněných snímků. Skutečné PBR, Standard a PBR+CampusSurfaceArt používají 12 meshes / 36 submeshes, skutečné světelné přepnutí 3→4→3 a nativní `WebGPUEngine.createEffect` cache cestu. Každé warm přepnutí má 36 cache hitů, serializací, onEffectCreated událostí a resetů; **0 nových programů**. Stejný nezměněný draw tyto kroky neprovádí. Skutečná změna hodnoty define vytvoří 1 program a návrat znovu použije původní Effect.

Mediány v ms pro celý snímek s 36 submeshes:

| Měřený scope | PBR | Standard | PBR + plugin |
|---|---:|---:|---:|
| Material readiness inclusive | 7,381 | 5,165 | 7,258 |
| Celé MaterialDefines.toString | 4,566 | 2,835 | 4,540 |
| Options před serializerem | 0,880 | 0,736 | 0,802 |
| Native createEffect a post-call observer | 0,279 | 0,183 | 0,265 |
| Prázdný WebGPUDrawContext.reset | 0,026 | 0,011 | 0,009 |

Scopes se překrývají a **nesčítají se**. Serializer zahrnuje původní textový loop i canonicalResult; parser zde není izolovaný. Cache scope zahrnuje také následnou observer klasifikaci, count a ownership check. U Standardu není samostatný callable defines scope; report správně uvádí širší interval. Observery, validace a JIT/GC ovlivňují CPU experiment; čísla se **nepřepočítávají na 794 produkčních změn**.

Actual shader/layout/forwarded uniform snapshots zůstaly shodné. Pinned WGSL material používá non-UBO forwarding; plugin UBO má samostatně ověřená data. Skutečný WebGPUDrawContext dokládá JS reset, ale nemá reálný GPU tlak owner slots/bind groups. Pipeline creation a draw submission zůstávají NullEngine. Main pass, bez stínů, externích textur, instancí nebo celé světové scény: **nejde o browser/GPU profil**. Cleanup a identita observer výjimky jsou ověřené i v chybové cestě.

Původní neúspěšné běhy jsou zachované jako chyby fixture, nikoli produkční RED/GREEN. Review V1 opravilo odkazy z reexport wrappers na skutečné `.pure.js` implementace a zpřesnilo observer režii časovače. V1 manifest/report/primární evidence/handoff jsou v `proof/review-v1/`; měřený test, trace a raw běhy 05–07 zůstaly byte-identické. Žádné přeměření kvůli této opravě neproběhlo.

Nejmenší další výzkumná hranice je levnější čistá serializace při stejných bytes a getter/throw kontraktu. Dřívější Effect lookup, shared-material příprava, stabilní světelné sloty nebo memo mají další callback/ownership/paměťové dopady a nejsou tímto proofem přijaté. Samostatný day13 experiment měří chybějící varianty; tyto dva zásahy se nesmí zaměnit.

[Archivní manifest](archive-manifest.json) ověřuje 46 artefaktů včetně pěti přesných vstupních zdrojů. [Předání](proof/handoff.md) obsahuje reproduce příkazy a prostředí; archiv zachovává původní importní cesty a není samostatný instalovaný projekt. Žádný vlastní proces nezůstal spuštěný, claim je uvolněný. KEY-31 i celková migrace zůstávají otevřené.
