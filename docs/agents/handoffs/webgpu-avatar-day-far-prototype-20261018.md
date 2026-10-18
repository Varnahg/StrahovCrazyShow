# Předání: webgpu-avatar-day-far-prototype-20261018

- Vlastník `webgpu-avatar-day-far-01a14497`; příjemce root. WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, výchozí HEAD `2290081`.
- Výsledek: izolovaný QA overlay připravený k nezávislému review a root GPU A/B. Žádný native/main runtime patch, commit nebo další BMAD workflow. V4, frozen dependencies a hrané verze beze změny.
- Povolené výstupy: tento handoff a `.cache/webgpu-migration-checks/avatar-day-far-prototype-20261018/`. Cizí WIP ani předání jiných tasků nejsou převzaté.
- Vstup: immutable V4 `bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0`; QA dependencies manifest `1f7fd825af1633d4efc227ffdc033d7e85540bd6400f7c03b7bbf0f4822d9eac`; přijatý avatar-view V2 proof `0cadc7d49b71a567cb3ac27974a8e6e3502676640d13afb232b0d4fa9dff3730`.

## Přesný runtime a testový rozsah

Pod `candidate/` jsou proti V4 změněné pouze:

1. `client/game.ts`: stage-owned helper pouze pro day-1-off/on, synchronní cancel restore a idempotentní final cleanup.
2. `client/avatar-preparation-far-plane.ts`: nový malý helper, union všech aktuálních připojených viditelných avatar meshes, čtení authored bounds a původního view, změna pouze maxZ.
3. `tests/game-light-preparation.test.ts`: skutečná VM Game wiring a lifecycle regrese; minimální fixture doplnění actual rootu a helperu.
4. `tests/avatar-preparation-far-plane.test.ts`: actual Babylon perspective/bounds/instance/lifecycle testy helperu.

Ostatní copied client/shared/tests/package/tsconfig soubory jsou byte-identické. Testovací source closure má 427 původních souborů / 28.4 MB, žádné assets/GLB nebo celý pracovní projekt. node_modules je jen junction na frozen QA dependencies, bez instalace nebo zápisu do nich. `input-manifest.json` a `manifest.json` dokumentují přesné hashy a 4 změny.

## Chování, volba a refaktoring

`decision.md` uvádí průzkum a varianty. Far-only nepoužívá setTarget, FOV/minZ/pose mutátory, nový pass, masky nebo teleport. Maximum hloubky konzervativních corners všech zapojených rigů v původním view + původní minZ určí maxZ. Detached LOD children, disabled/hidden/layer-excluded/disposed části se nepočítají; vzdálené rigy se nefrustum-cullují. Prázdné/nečíselné/nevhodné envelope ponechá plný view. API výjimka se propaguje do původního failed preparation kontraktu.

Jeden helper vlastní pouze dočasné maxZ, ne rigy/cache/observers. Před každým Day1 draw znovu načte live rigs, aby stejný mesh count nezakryl vzdálenější nový/pohnutý avatar. Výpočet žije jen během loading etap; interaktivní Game.frame beze změny. Před každou další etapou/restartem obnoví maxZ, stejně tak restore/timeout/failure/finally. Cancel wrapper vrací maxZ synchronně před původním callbackem a detach kontroluje identity vlastníka. B6 camera a spatial refresh se nemění.

Původních 15 etap, dvě kompletní ready draws, 30 s deadline, všechny effect/pipeline/health guards, inventory cap 21/default 16 a final submitted-frame gate zůstaly. Neimplementována souběžná material-budget capture změna.

## Ověření a omezení

- RED `targeted-red.log`: původní V4 Game, 0/2 PASS; oba nové behavior testy selhaly na nezúženém maxZ. Exit 1, 18.10.2026 kolem 03:38:27 UTC.
- `targeted-01.log`: 47/48 PASS; chyběl testový import Babylon InstancedMesh, nikoli runtime failure. Zachováno. Po importu `targeted-02.log` 62/62 PASS.
- Finální `TSX_DISABLE_CACHE=1 node --import tsx --test tests/avatar-preparation-far-plane.test.ts tests/game-light-preparation.test.ts tests/light-preparation.test.ts tests/game-startup.test.ts`: `targeted-final.log`, exit 0, **64/64 PASS**, trvání 2.881 s. Nové případy navíc prověřují živý vzdálený rig bez revision změny a skutečný bounds throw bez tichého fallbacku.
- `node types.mjs`: scoped TS včetně Game transitive closure a cílených testů; **3366 files / 0 errors, exit 0**, `scoped-types-final.log`. Předchozí checkpoint `scoped-types-01.log` měl také 3366 files / 0 errors; nepoužívá se místo finálního výsledku.
- `node adapt-proof.mjs` + `TSX_DISABLE_CACHE=1 node --import tsx probe-avatar.ts --all`: skutečný nový helper ve frozen V2 sedmikonfiguračním proofu. `avatar-proof.log`, exit 0, UTC 03:43:46.656–03:43:49.120. **7/7, 119 captures, 70 plných defines/Effect comparisons, 77 přesných restores včetně 21 výjimek PASS.** Původní assertions včetně celých skinned/current-pose vertices a conservative corners zůstaly; `probe-adaptation.json` popisuje přesný přenos.
- Všechny vlastní scény/enginy/observers/rigs/pool/raw-upload refs uvolněné. Žádný server/port/GPU/fullsuite/build/integration/install/pnpm. Typecheck i testy skončí před release; root služby zůstávají pod root rezervacemi.
- NullEngine/GLSL/PCF fallback a explicitní IO adapter nejsou GPU/WGSL/image/performance důkaz. Žádné aktivní morph targety, všechny animace, skutečný full-world camera clip, clear-weather nebo multiplayer přejímka. Far union může s dalšími vzdálenými avatary ponechat celý view.

## Předání integrátorovi

Root dostane finální manifest SHA a exact 4-file changes. Před buildem čtecí review; potom vlastní nový snapshot/tool cache se stejnou fyzickou QA core/loaders identitou. Nutný celý startup a první GoldenHour OFF/F plus samostatný cold B6 entry/F/outward/exit proti V4. Světové Day1 varianty jsou užitečné i mimo syntetické poledne; nové kompilace nebo ztráta pokrytí znamenají odmítnutí. Kandidát není předem přijatá optimalizace. Rezervace se uvolňuje po předání, bez commitu; stav tasku a další postup rozhoduje root.
