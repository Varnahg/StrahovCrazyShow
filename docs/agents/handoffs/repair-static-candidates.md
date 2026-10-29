# Předání: repair-static-candidates

- Vlastník: `repairs-01a13624-static` (`/root/repair_reporting`); příjemce: koordinátor `repairs-01a13624-root`.
- Pracovní kopie/větev: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`; výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: implementována a cíleně ověřena **volitelná** časná frustum filtrace explicitně bezpečné statické geometrie. Ve výchozím režimu zůstává původní enabled-only cesta. Zapnutí do hry a tvrzení o zlepšení FPS vyžaduje navazující produkční A/B přejímku koordinátorem.
- Změněné soubory: `client/active-mesh-candidates.ts`, `tests/active-mesh-candidates.test.ts`, tento handoff. Žádný převzatý dirty WIP; runtime/test cesty byly čisté při claimu. `game.ts`, baseline, první neměnný wave checkpoint, lockfile ani assety nebyly měněny.
- Podklady: vlastní `repair-render-cost-cause` + skutečný baseline; nainstalovaný Babylon9.30.0 `Scene._renderForCamera/_evaluateActiveMeshes`, Node synchronizace rodiče, TransformNode frozen/world lifecycle, Mesh/Geometry aktualizace a BoundingInfo/Box. Projektové static tagy níže ověřeny ve zdroji.

## API pro integrátora

```ts
const candidates = new EnabledMeshCandidates(scene, originalDefaultProvider, {
  earlyStaticFrustum: false, // kompatibilní výchozí režim pro A/B
  isStaticMesh: (mesh) =>
    mesh.metadata?.artStatic === true ||
    mesh.metadata?.sourcePack === "architecture-reality",
});

// Vrací true jen při vlastníku provideru a dostupném explicitním attestation.
candidates.setStaticFrustumEnabled(true);
candidates.setStaticFrustumEnabled(false);
// Dispose zachovává případný provider pozdějšího vlastníka.
candidates.dispose();
```

`isStaticMesh` je **odpovědnost vlastníka konkrétní geometrie**, ne automatická heuristika pro vše frozen. Musí potvrzovat neměnnou, CPU-bounded geometrii bez vertex deformace/custom shaderu/windu. Guardy přesto ověřují aktuální runtime stav. Bez této callback funkce se feature nezapne ani při `earlyStaticFrustum:true`.

Doložené první skupiny pro úzké A/B:

- `world-renderer.ts`: `context.staticMeshes` se sloučí a dostanou `{ solid:true, artStatic:true }`, poté freezeWorldMatrix. Jde o explicitní static batch kontrakt.
- `architecture-reality.ts`: `Batch.mesh()` vytváří pevné authored buffers a freezeWorldMatrix; následně přidá `sourcePack:"architecture-reality"` a near/far metadata. Jejich LOD je řízen přes enabled skupiny; případný nativní LOD na konkrétním mesh by guard vyřadil. Přidání rodiče může na první návštěvě způsobit bezpečný bypass, dokud native world matrix nesynchronizuje.
- SurfacePack/CampusSurfaceArt plugin této architektury v nynějším kódu mění fragmentovou část, nikoli vertex positions (ověřen `getCustomCode` fragment-only). Ostatní/nové custom pluginy nemají toto automatické povolení.
- Campus/outdoor/vegetation neoznačovat automaticky za bezpečné pouze podle názvu nebo `isFrozen`; dnešní campus/outdoor buildery nemají totožný frozen/static kontrakt a stromy mají vertex wind. Neprovádět plošné freeze/retagging kvůli splnění filtru.

`readonly stats` poskytuje:

- Pro poslední libovolný dotaz: `sourceCandidates`, `enabledCandidates`, `outputCandidates`, `staticTests`, `staticRejected`, `unsafeStatic`, `bypassReason`.
- **Stabilní poslední native evaluation**: `lastRenderSource`, `lastRenderEnabled`, `lastRenderOutput`, `lastRenderTests`, `lastRenderRejected`, `lastRenderUnsafe`, `lastRenderBypassReason`. Následný read-only `getActiveMeshCandidates()` z diagnostiky tyto hodnoty nepřepíše; takový dotaz se frustum filtru vůbec neúčastní.
- Kumulativně `queries`, `rebuilds`, `renderEvaluations`, `attestationErrors`; a `staticFrustumEnabled`. Počty nejsou timing ani důkaz získaných FPS.
- Bypass důvody: `disabled`, `unattested`, `outside-evaluation`, `camera`, `frustum`, `clipping`, `selector`, `provider`, `disposed`, případně null při aktivním prefilteru. Last-render je do prvního záznamu `not-rendered`.

## Správnost, konzervativní meze a refaktoring

- Frustum token vzniká na `onBeforeActiveMeshesEvaluationObservable`, po nativním updateTransformMatrix. Platí pro právě tu samou activeCamera, Scene frustum referenci, transform revision a renderId a spotřebuje se jen jednou při provider query. `onAfterActiveMeshesEvaluation` jej zruší. Externí dotazy mezi snímky používají celý enabled seznam. Kamera/transform změněná v dalších callbacks, více aktivních kamer, rig kamera nebo output render target znamenají bypass. Vlastní LOD selector/skipFrustumClipping také.
- Filtr ponechá původní relativní pořadí. Do druhého znovupoužitelného pole nepouští jen objekty, které přes stejné BoundingInfo a cullingStrategy prokazatelně neprojdou stejným frustum testem. Neupravuje geometrii, kolize, visibility, light/material stav ani stínové seznamy.
- Konkrétní guardy: pouze skutečný základní Mesh, frozen a synchronizované transformace, žádný native LOD/instance/thin instance/skeleton/morph/baked animation/billboard/infiniteDistance/action/animation, visible pozitivní visibility, bez alwaysSelect/zeroScale/blocked/unsynced bounds/wind metadata. Geometrie musí být ready, nesdílená, position buffer neupdatable; materiál je podporovaný rigid Standard/PBR nebo bounded MultiMaterial bez známého TreeWind pluginu. Neznámá třída/shader je bypass.
- `Node.isSynchronized()` je v9.30 typed callable metoda, ale upstream ji značkuje **@internal**. Zde kontroluje lokální změny a dirty/versioned rodiče bez forced recompute, bez čtení privátních polí. Tato verzně vázaná závislost je výslovná a krytá regresí při lokální změně, reparent i změně rodiče. Upgrade Babylonu musí tuto přejímku zopakovat.
- Bounds se necacheují napříč snímky: getter vrací aktuální BoundingInfo a synchronizuje dirty bounds k již cached world matrix, nevyvolává se `computeWorldMatrix(true)` ani material/shader readiness. Kontroluje se finite/ordered box, sphere a **shoda BoundingBox matrix s cached mesh world matrix**. Locked/nejisté bounds zůstávají native kandidáty.
- Právě test opakovaného setVerticesData na frozen přeloženém mesh doložil Babylon edge case: rekonstruovaný box může mít identity matrix, zatímco mesh world je přeložený. Filtr tento stav **neopravuje**, jen bezpečně bypassuje až do explicitní běžné obnovy bounds. Nezaměňovat tento malý synthetic důkaz s tvrzením o příčině původního playtestu.
- `BoundingSphere.getWorldMatrix()` je sice deklarovaný, ale běžná konstrukce v9.30 vrací undefined. Proto se tento getter nepoužívá jako důkaz; konzistentní BoundingInfo update ověřuje dostupná Box matrix plus finite sphere data. Tento problém zachytil vývojový regresní běh.
- Refaktoring: původní enabled cache zůstává jedním zdrojem; frustum výstup používá vlastní recyklované pole. Přesná eligibility se vždy znovu ověří, takže změna materiálu/bufferu/geometry/instance/rodiče nepoužije zastaralou způsobilost. Sdílené vyhodnocení stats odděluje native výsledek od čtecích dotazů. Žádné mesh-bound snapshoty, časovače nebo nové per-mesh geometry observables. Material guard nealokuje seznam názvů ani callback na každý mesh. Cena konzervativních kontrol se musí změřit jako celek.

## Ověření a evidence

- 13. 10. 2026 21:38 Praha: `pnpm exec tsx --test tests/active-mesh-candidates.test.ts` **10/10 PASS**, exit0. Původní4 regrese zachovány, native-render test rozšířen o default vs opt-in parity,6 dalších testů.
- Skutečné Babylon NullEngine render cesty: shodné aktivní pořadí, bind/draw jména, shadow draw jména a active index counts při pohybu kamery, native near/far instance LOD, invisible/disabled source, thin instances, negative determinant a změně parent/enable. Samostatná skutečná transparentní draw parity v obou směrech kamery; same-task add/remove/replace/enable také ověřené. **Nejde o GPU nebo FPS důkaz.**
- Strukturální guard regrese: opt-in/absence attestation, zachované lastRender stats po diagnostice, dirty local/parent/reparent, geometry replacement/updatable/shared/boundsmatrix mismatch, material swap/TreeWind/custom shader, skinning/morph, invalid/locked bounds, alwaysSelect, camera/frustum update mezi eventem a query, multicamera, custom LOD, clipping bypass, foreign provider, dispose a attestation exception.
- Úzká typová kontrola `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --types node tests/active-mesh-candidates.test.ts` **PASS**, exit0,21:39 Praha. Předchozí běh odhalil nepřesnou Babylon deklaraci `customLODSelector` jako vždy přítomné funkce; lokální optional type projekce zachovává skutečný runtime optional hook, bez změny chování.
- Vývojové neúspěšné běhy: nejdříve8/9 při geometrii odhalilo chybějící bounds-matrix guard; pokus použít také sphere getter měl3/9 kvůli jeho undefined runtime hodnotě. Po ověření primárního kódu použita skutečně dostupná Box matrix;9/9 a finálně10/10 prošly. Selhání nebyla skryta změnou požadavku na parity.
- Prettier nad oběma vlastními soubory a cílený `git diff --check` exit0. `git status --short package.json pnpm-lock.yaml` prázdný; žádná změna závislostí.
- Snapshot SHA256 včetně testů:
  - `client/active-mesh-candidates.ts`: `22bbd1c5714b244e8ae516f06686e38d9f81cc7aab8856eb0d96b673db682a16`
  - `tests/active-mesh-candidates.test.ts`: `cca77f249cb19fad329ac627bc57eb8e03f9f09dd8fce5d6089dc3d22c389708`
- Procesy/zdroje: všechny vlastní krátké testy/typová kontrola/experimenty skončily, fixtures dispose proveden. Žádný GPU, port, build, plná sada nebo změna zachovaného baseline checkpointu.
- Omezení/další krok: root musí nový modul převzít do **další vlny**, přidat jen doložený attestation callback, zachovat default off a provést srovnatelnou produkční A/B přejímku podle cause reportu. Při horším CPU/p95 feature nezapínat jen kvůli nižšímu počtu kandidátů. V této implementaci nejsou odstraněny všechny náklady mainDraw ani uzavřen celkový cíl opravit všechny problémy.
- Rezervace: předání dokončeno13.10.2026 21:41 Praha; následuje `release --task repair-static-candidates --owner repairs-01a13624-static`. Stav tasku/Linear/verification aktualizuje integrátor.
