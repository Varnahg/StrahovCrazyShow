# Předání: b6-photo-routes-20261024

- Vlastník `b6-photo-01a16b37-routes`; příjemce root. Cwd `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, větev `codex/b6-photo-refinement-20261024`, baseline ed52896a. Root předal čisté verifikační soubory; žádný cizí WIP se nepřepisoval.
- Vlastní změny: `scripts/cad-buildings/rapier_model.mjs`, `verify_doors.mjs`, `verify_accessibility.mjs`, `verify_world_paths.ts`, nové `verify_room_paths.mjs` a `test_room_paths.mjs`, `test_rapier_model.mjs`, `test_accessibility.mjs`, `tests/cad-building-world.test.ts`, `tests/cad-world-paths.test.ts`, tento handoff a vlastní `.cache/b6-photo-routes-20261024/`.
- Výsledek: executable native candidate room verifier + skutečná ochrana fixed door leaves. **61/61 malých CPU regresí PASS**, TypeScript a syntax kontroly PASS. Plný candidate room replay podagent nespouštěl; root přebírá ihned pro všech264 místností.

## Konkrétní implementace

`fixedOpeningSpec` sjednocuje klasifikace. Původní facade-opening-unconfirmed-access stále očekává `facade-glass` a kategorii fixed-facade-glazing. Nové fixed-paired-door-leaf očekává **kolizní role fixed-door-leaf**, kategorii fixed-door-leaf a graph exclusion fixed-paired-door-leaf; nikdy se nevydává za fasádu.

Coverage používá skutečnou jamb rovinu hinge→closedEnd posunutou o measured normalOffset, stejně jako potvrzený builder. Jeho38mm panel bottom+.015/top−.02 se vejde do původní20mm plane tolerance a55mm frame margin. Exact union area a obousměrné role-filtered ray hits zůstávají. Chybějící panel, pěticentimetrový proužek, špatná role i posunutá rovina neprojdou. Přidané `protectedDoorLeaves` nesčítá tyto panely s prosklením.

Accessibility exclusion vyžaduje odpovídající dvě reportované ochrany a **nezávisle znovu přepočtenou ochranu na aktuálním modelu**; falešné passed:true/coverage:true nestačí. World trace kontroluje protectionVerified/role/category a plnou skutečnou native coverage. Neúplná ochrana se nesmí změnit na tiše vyřazený průchod. Ve skutečném cad-building-world testu se pevné panely ověřují zvlášť native coverage + obousměrný hit v odpovídající world rovině, jmenovatel otevřených dveří je od nich oddělen.

Nový `verify_room_paths.mjs` importuje produkční **Actor** a používá jeho skutečný KCC/step. Nativní candidate collision parts se transformují aktuální registrovanou placement a vloží do izolovaného worldu. Nejde o kopii walker/controlleru ani přepsání shared publikovaného modelu. Adapter poskytuje pouze world/add/remove/tick/dispose a mapování skutečných kolizních částí. Terrain/traffic/celý publikovaný svět tím nejsou ověřené.

Room tours se čtou výhradně z hashově svázaného `model.roomWalkPaths`. Validuje se usage/provenance, current profil, floor/door vazba, konečné souřadnice, plný návrat do startu, omezený20m room envelope, stejná úroveň do.25m a absence support override. Fixed start nebo chybějící native panel se odmítne. Actor začíná na přesném canonical inside approach z doorApproachGeometry; původní ±.45m candidate midpoint mohl ignorovat normalOffset, proto je do.15m rozdíl **fyzicky přehrán jako první leg**, nikoli teleportován.

Setup i všechny cíle používají nové skutečné ray/capsule support queries. Nábytek ve výšce.4m se nesmí vydávat za původní floor reference. Teleport/recovery/restore/vehicle jsou zakázané. Každý leg ukládá support, výslednou pozici, grounded, kontaktní part/role a krátkou trail. Chůze na interiérových bodech automaticky neskáče. Chybějící podlaha, skříň v trase nebo selhání návratu znamenají partial, i když byl vzdálený bod navštíven. Všechny Actors/world se uklidí i při výjimce.

Refaktoring: veřejně sdílené supportAt/assertLiveController/forbidRecovery/walkActorLeg/sourceManifest z původního actual world replayeru; pevná ochrana má jediný generický helper se zpětně kompatibilními glazing wrappers. Manifest obsahuje i nové verifiery/tests, takže staré source reports po změně helperu je třeba regenerovat.

## Spuštění koordinátorem

```powershell
pnpm exec tsx scripts/cad-buildings/verify_room_paths.mjs `
  --model .cache/b6-photo-refinement-20261024/model/b06.json `
  --output .cache/b6-photo-routes-20261024/b06-room-paths.json
```

Volitelné `--glb` určí companion GLB; výchozí je stejný basename. Jeho SHA se musí shodovat s nativním JSON. `--room n01:11` je explicitní debugging podmnožina; report stále uvádí všech264 expectedRooms a nevybrané místnosti, takže malý test nemůže vydat úplný PASS. Před/po se kontroluje model, GLB a manifest aktuálních Actor/shared vstupů.

**`tourStatus` hodnotí všechny standardní room tours. `status` zůstává partial a exit code2, dokud existují extra neověřené cíle.** Současných36 shower centres je v unverifiedExtraTargets/not-verified se zdrojovým důvodem; průchod před sprchu není důkaz jejího vnitřku. .50m CAD vstupy se nezvětšují a.54m kapsle se nezmenšuje. Každá místnost má nového Actora u dveří: nejde o důkaz souvislé dosažitelnosti všech místností od venkovního vstupu. Ten má samostatný world/accessibility replayer.

## Důkazy a omezení

- `pnpm exec tsx --test scripts/cad-buildings/test_rapier_model.mjs scripts/cad-buildings/test_accessibility.mjs scripts/cad-buildings/test_room_paths.mjs tests/cad-world-paths.test.ts`: **61/61 PASS**, exit0,2.853s; `.cache/b6-photo-routes-20261024/fixtures-final.log`.
- Z toho8 nových room fixtures používá skutečný Actor: úplný návrat, nábytek blokuje/přístup kolem něj, blokovaný návrat, missing support, recovery zákaz, nesprávná podpůrná výška, canonical normalOffset prefix, subset/extra partial a vadná identita/úroveň/vstup.
- Cílený tsc pro verify_world_paths.ts/cad-world-paths.test.ts/cad-building-world.test.ts s ES2022/Bundler/strict/node,vite/client: PASS, exit0 (podagent hlásil úspěšný běh bez uchovaného logu; koordinátor následně doložil TypeScript finálním source-v4 produkčním buildem). node --check pro čtyři změněné mjs verifiery/helper také PASS.
- Pure validation skutečného candidate JSON **6598994ee87133ddfafe6aa682fcbcd89ef49d71113b22ed3b1dcebacccaf57d** prošla:264 native rooms +36extra targets a skutečná coverage všech pevných panelů. Při této kontrole nebyl vytvořen physics world a nejedná se o movement PASS. Companion GLB z exportu rootu máca013060e82944077bb72b060492321b8bc29952c1a10927747598d1bcea0c4b.
- Snapshot vlastních změn/testů a read-only candidate identity: `source-manifest.json`; tracked diff `changes.patch` ve vlastní cache. Rapier fixture temp výstupy jsou přesměrované do této taskové cache, ne do dřívějšího cizího B1 integračního scope.
- Žádný Blender, GPU, server, fullsuite ani full candidate replay neběžel. Všechny vlastní procesy skončily; nic nestagováno/commitováno. Po GREEN předání claim uvolněn, celý tento vlastní WIP je předán rootovi k `--adopt-dirty`. Integrátor určuje stav tasku a skutečnou přejímku modelu.
