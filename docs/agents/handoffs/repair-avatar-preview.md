# Předání: repair-avatar-preview (KEY-10)

- Vlastník `repairs-01a13624-preview`; příjemce `/root` / `repairs-01a13624-root`.
- Checkout `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: opravené zbytečné rekonstrukce při úpravách, zachování sdílených bufferů a materiálů při náhradě rigů, omezený readiness lifecycle a API pro uspání zachovaného editoru. **První cold otevření a původní propad 8–14 FPS zůstávají k měření v produkční hře; update optimalizace sama tento incident neprokazuje jako vyřešený.**
- Přesný rozsah změn: `client/avatar-editor.tsx`, `client/avatar-renderer.ts`, nový `client/avatar-preview-cache.ts`, nové `tests/avatar-preview.test.ts`, `tests/avatar-preview-cache.test.ts`, toto předání. Vstupní soubory byly čisté; nepřevzat žádný cizí dirty WIP. UI persistence je práce koordinátora v `client/ui.tsx`.

## Průzkum a primární důkazy

Původní automatický log (13. 10. 2026 19:50:26–32 Praha, audit `docs/performance/playtest-diagnostics-20261013.md`) zaznamenal otevření editoru, fileTools/loadHandler 356,6 ms a několik herních oken 8–14 FPS. V té části nebyla zaznamenaná změna avatara. **Preview už před opravou renderoval on-demand; nebyl v něm trvalý druhý render loop.**

Instalované primární zdroje Babylon.js 9.30.0:

- `Meshes/mesh.pure.js`, `Mesh.dispose()`: volá `geometry.releaseForMesh(this, true)`.
- `Meshes/geometry.js`, `releaseForMesh()`: poslední uživatel se `shouldDispose=true` zruší geometrii a její buffery.
- `client/avatar-skinned.ts`, `client/avatar-garments.ts`: cache geometrie podle scény; disposed geometrie se znovu morfuje, normalizuje a posílá přes VertexData.applyToMesh. Garment materiály se zruší při users=0.
- Původní `createAvatarPreview.update()` nejprve rušil starý rig a teprve pak vytvořil nový. Tím při úpravě zničil i znovupoužitelnou geometrii a stejné garment materiály. Nový test samostatně reprodukuje tuto původní sekvenci a potvrzuje disposed původní Geometry.
- `scene.pure.js`, `executeWhenReady()` a `isReady()`: ihned spustí readiness kontrolu nad všemi mesh objekty, také nad neviditelnými zdroji poolu a vypnutými medium LODs. Každé volání přidávalo další once callback. `Mesh.isReady(true)` a `InstancedMesh.isReady(true)` umožňují ověřit pouze skutečně zobrazované meshe, přičemž instanci zkontrolují s příslušnou instanční variantou materiálu.
- Každý mount stále zakládá nový Engine/Scene/AvatarPrimitivePool. Texture cache je v engine/scéně, proto znovuotevření po skutečném unmountu opakuje přípravu. HTTP cache sama nenahrazuje GL buffery a kompilované efekty nového kontextu.

## Implementace a integrace

`AvatarPreviewModel` vytvoří nový rig před zrušením starého. Sdílené geometrie a nezměněné materiály tak mají po celou dobu uživatele. Poté starý rig zruší a `pruneUnused()` odstraní jeho nepoužívané barvy/zdroje. Nejvýše dva rigy žijí jen během této synchronní operace; do dalšího snímku zůstává jeden. Shodná konfigurace je no-op, porovnává se uložený snapshot hodnot, nikoli pouze reference objektu. Snapshot odhalí i inplace změnu konfigurace.

`AvatarPreviewFrameWork` drží nejvýše jeden RAF a jednu readiness kontrolu po 100 ms. Řízení kamery při připraveném modelu readiness znovu nezahajuje. Kontrola readiness předchází vykreslení, aby po dokončení asynchronního efektu následoval skutečný finální snímek i bez dalšího pohybu myši. Uspání/dispose ruší oba handly; generační token zneplatní i dříve vyzvednutý callback po znovuaktivaci. Nejde o trvalý render loop ani zahřívání skrytého náhledu.

`AvatarEditor` má nový volitelný prop `active?: boolean` (default true). Neaktivní první mount nevytvoří Engine. Již vytvořený náhled na `active=false` usne a ukončí pointer capture. Controller přidává `setActive(boolean)`. Při skrytém panelu či dokumentu si případný update ponechá pouze poslední konfiguraci; při návratu ji aplikuje a přepočítá rozlišení. Scene, pool a WebGL zdroje zůstávají vlastněné tímto komponentem, definitivní unmount je všechny uvolní. Nikam se neukládá profil uživatele ani globální cache jeho vzhledu.

**Root hook:** zachovat jednu instanci AvatarEditor po prvním otevření v rámci aktuální herní relace a předávat `active={panel === "avatar"}`. Skrytý DOM musí být skutečně skrytý a mimo focus; nesmí být ponechán v podmíněné větvi, která při zavření celý komponent odmountuje. Při opuštění hry ho odmountovat. V současném samotném modulu je potřebné API připravené; UI persistence není součástí tohoto diffu.

Zachovány původní geometrie, vlasy, brýle, vousy, materiály, osvětlení, near-detail, kamera, rotace, face/body framing, limit DPR1,5 i všechny ovládací prvky. Nevypíná se hlavní svět. Cold tvorba nadále vytváří i medium geometrii; její bezpečné odstranění z preview vyžaduje širší API a nebylo neobjednaně provedeno.

## Automatické měření dalšího testu

Technické `sessionDiagnostics.event("avatar-preview", ...)` události obsahují:

- `create`: `engineCpuMs`, `sceneCpuMs`, `rigCpuMs`, `totalCpuMs`, počty meshů/materiálů/textur.
- `update`: skutečnou CPU dobu přestavby a počty prostředků, pouze pokud se model změnil.
- `frame`, `ready-frame`, `resume-frame`: CPU render/readiness, počet snímků, wall-clock stáří přípravy/aktivace a interní rozlišení. Loguje se první snímek, dokončená příprava, první snímek obnoveného panelu nebo snímek s CPU nákladem ≥50 ms; nikoli každý běžný RAF.
- `active`, `dispose`: přechody a finální počet rebuildů/snímků.

Žádné jméno, profil, konfigurace osoby ani raw URL. Čas scene.render je CPU volání, nikoli přímý GPU čas či tvrzení o délce shader kompilace. Wall-clock příprava může zahrnovat čekání na assety/asynchronní efekty. Root může tento rozpad korelovat s hlavním herním frame logem.

## Ověření

- `pnpm exec tsx --test tests/avatar-preview.test.ts tests/avatar-preview-cache.test.ts tests/flashlight.test.ts tests/avatar-lod.test.ts tests/student-garments.test.ts tests/student-hair.test.ts`: **32/32**, exit 0, 13. 10. 2026 cca 20:45 Praha. Ověřeno sdílení bufferů, materiálů, posed garment/hair/torch/LOD chování a cancellation scheduleru. Existující NullEngine LOD fixture vypíše varování o své záměrně malé uniform kapacitě; test prošel, není to GPU přejímka.
- Finální cílené `pnpm exec tsx --test tests/avatar-preview.test.ts tests/avatar-preview-cache.test.ts`: **7/7**, exit 0, cca 20:47 Praha. Testy potvrzují nulový rebuild shodné konfigurace; stejnou identitu Geometry a nezměněného garment materiálu při úpravě; původní dispose-before-create ztrátu; 16 úprav bez růstu mesh/material/texture/skeleton počtů; release; vyloučení neviditelných LOD z readiness; coalescing a zneplatnění stale callbacku.
- `git diff --check -- client/avatar-renderer.ts client/avatar-editor.tsx`: exit 0.
- GPU, celá sada, build ani integrace nespouštěny. Root provede typovou kontrolu a produkční browserové přijetí včetně skutečných DOM active/hidden přechodů, rotace, detailu tváře a návratu po ztrátě/obnově kontextu.
- Žádné dlouhožijící procesy, porty ani GPU prostředky nespouštěny. Všechny vlastní testovací procesy skončily.

## Snapshot implementace včetně testů

| Soubor | SHA256 |
|---|---|
| client/avatar-editor.tsx | 20DB83A1D9D98B6BB2A7C647F79FBA383371546D415D5F38C7FD18CF13F4C83A |
| client/avatar-renderer.ts | 75AEDA37853BA39C650529CFECB152FFB8F8FB6E03973DC6DD3EAA1606F229D9 |
| client/avatar-preview-cache.ts | 092B63AE975B57AE19993B10EC24587D2E394CFECD1F78D1AB35A5F2F4FCB29D |
| tests/avatar-preview.test.ts | EFEFBA176C2FEDBB58B2AEABC30FE34BE3A7578EFFD6DB983CFEAD8CB8229FF5 |
| tests/avatar-preview-cache.test.ts | 23DCC784EE7187EC980DA6EB16334C407575CB987C01EC3BAAE6EA07AD8AFE77 |

- Rezervace: po předání uvolněna `release`; žádné pomocné procesy nezůstávají.
- Integrátor: převezme hook/persistence, zkontroluje produkční první i opakované otevření a zapíše výsledky do `docs/verification.md`. KEY-10 jako celek zatím není hotový ani není slíbeno odstranění původního 8–14 FPS propadu.
