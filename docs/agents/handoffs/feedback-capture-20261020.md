# Předání: feedback-capture-20261020

- Vlastník: `feedback-impl-01a15a3e-capture`; příjemce/integrátor: `feedback-impl-01a15a3e-root`, KEY-52.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020`, větev `codex/player-feedback-20261020`, výchozí commit `c713c2aedcafdb02358f05e4c9c51b607edeebc4`.
- Výsledek: nový samostatný capture modul, cílený refaktoring a CPU/typové ověření jsou připravené k přijetí. Nejde o dokončení celé KEY-52 ani GPU přejímku.
- Změněné soubory: `client/rendered-frame-capture.ts`, `tests/rendered-frame-capture.test.ts`, tento handoff. Žádný commit/staging podagenta.
- Cizí WIP: výchozí strom již obsahoval rootův SPEC a shared kontrakt, task definice a cizí klientské/serverové moduly. Nic z toho podagent neupravoval. Nezapsal do původní diary worktree ani jejích modulů/testů.

## Provenience a rozhodnutí před implementací

Přečteny aktuální AGENTS, mapa architektury, koordinace, evidence WIP, BMAD policy, přidělený task, KEY-52 SPEC, shared/feedback.ts, relevantní Game/render-engine kód a dokončený KEY-51 výzkum. Katalog byl validní; vlastní disjunktní claim byl získán před prvním zápisem. Podagent nespouštěl rekurzivní BMAD ani další agenty.

Primární zdroje ověřené 20. 10. 2026:

- [Babylon 9.30.0 screenshotTools](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Misc/screenshotTools.pure.ts): aktivní kamera kopíruje canvas na onEndFrame; jiná kamera jde do render-target větve. Místní pinované `abstractEngine.pure.js` a `webgpuEngine.pure.js` potvrzují, že engine endFrame je po render callbacku a WebGPU flushuje před observable.
- [HTML canvas/toBlob standard](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob-dev) a [MDN toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob): bitmapa je pro serializaci odpojená při volání, výstup může být null, nepodporovaný formát přechází na PNG a export může vyhodit SecurityError. Native encode nelze fyzicky zrušit.
- Úzké předání KEY-21: dokumentační commit `1ef29ecd37efa940052995afe98cb01867e245c8` v `C:/Users/rezac/.codex/worktrees/playtest-diary/StrahovCrazyShow`; závěrečná sekce `docs/agents/handoffs/playtest-diary-integration-20261016.md` a `docs/performance/evidence/playtest-diary-20261016/feedback-capture-handoff-20261020.json` byly přečteny.
- Původní `client/playtest-capture.ts` byl po předání přečten a SHA-256 znovu ověřena: `cf408483376eaa0303b2fcab9027305354a9d89c74d654954d693a2a08a164c8`. Jde o chráněný necommitovaný WIP, nikoli přijatý runtime. Nový modul byl navržen samostatně z public hooku a přebírá pouze doložený mechanismus end-frame + jedna vlastní bitmapa + toBlob. Žádný diary upload, triggers, bursts, timeline, schema nebo identity se nepřebírá. Původní claims zůstaly nedotčené.

Porovnané varianty:

| Varianta                                         | Chování, náklady a lifecycle                                                                                                   | Volba                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Kopie canvasu až po kliknutí mimo render         | Při preserveDrawingBuffer:false může být už po kompozici obsah pryč; metadata nejsou automaticky stejného snímku               | Zamítnuto                    |
| ScreenshotTools pro aktivní kameru přímo         | Public mechanismus odpovídá, ale používá globální canvas/base64 callback a neposkytuje požadované individuální storno/timeouty | Využit pouze ověřený princip |
| Jednorázový end-frame adapter                    | Jedna sync drawImage a jeden native encode, skutečná běžná kamera a postprocess; vlastní omezený lifecycle                     | Vybráno                      |
| Render target / druhé scene.render               | Další render, alokace/stav, riziko jiného obrazu                                                                               | Zamítnuto                    |
| Trvalé preserveDrawingBuffer nebo průběžné kopie | Zasahuje každý běžný frame kvůli vzácné akci; další cache/fronta                                                               | Zamítnuto                    |

Cena skutečného drawImage/readbacku není doložena fake testy; musí ji změřit integrátor ve hře. Domácí barevný filtr by mohl odmítat legitimní noční scénu, proto modul nehodnotí světlost pixelů.

## API a lifecycle

`new RenderedFrameCapture({ engine, frame, environment? })`, `capture(signal?) → Promise<{ capture: FeedbackCapture, image: Blob | null }>`, `dispose()`.

Engine má pouze public `onEndFrameObservable.add/remove` a `getRenderingCanvas`. `frame()` musí vracet poslední úspěšný běžný render, frameId zvyšovat po úspěšném scene.render a čas mít v performance.now doméně. Adapter na requestu uloží baseline ID, poté čeká na nové dokončené render metadata se shodnými rozměry canvasu. Zdrojové interní a CSS rozměry jsou v capture.frame, zmenšené rozměry v capture.width/height. Snapshot dovoluje pouze veřejná pole a odpojí pozici/kameru před encode.

Výstup bez upscalingu zachová poměr stran, delší strana nejvýše1920px, počet pixelů/bytes podle FEEDBACK_LIMITS. Jediný toBlob žádá WebP0.9 a vrací skutečný WebP/PNG/JPEG MIME. Null, prázdný blob, nepodporovaný MIME, překročení bytes nebo výjimka vrátí encoding. Bez endFrame do2500ms vrátí timeout; při běžících endFrame bez čerstvého platného renderu no-frame. No-view, busy a cancelled jsou explicitní výsledky s image:null. Není upload, objectURL ani DOM snapshot.

Module-owned slot blokuje další kopii/encode i mezi dvěma instancemi/Game generacemi. Abort/dispose během encode okamžitě logicky vrátí cancelled a uvolní vlastní bitmapu, ale slot zůstane obsazený do native callbacku nebo pevného encode timeoutu5000ms. Po hard timeoutu jde pouze o logické omezení: fyzicky hung browser encode zastavit nelze. Každý late callback ověřuje konkrétní operation token a nemůže uvolnit nový slot, nulovat cizí canvas ani změnit nový draft.

Refaktoring: společné `settle/release/stopFrameWait/releaseCanvas` sjednocují všechny úklidové větve; `active` chrání reentranci; nevzniká idle observer ani idle bitmapa. Canvas je líný a každá operace vlastní konkrétní objekt; po dokončení/stornu má rozměry0×0. Není trvalá obrazová cache ani opakované kopírování.

## Skutečné ověření

20. 10. 2026 přibližně20:19 UTC, bez GPU/serveru/build výstupů:

- `pnpm exec tsx --test tests/rendered-frame-capture.test.ts` — exit0, **17/17 PASS**, poslední běh693.7ms. Testuje idle/no extra render surface, první nový endFrame, stale ID/čas, budoucí čas, null frame, resize/aspekt/limity, hluboké odpojení metadat, MIME fallback/null/empty/bytes, chyby context/copy/encode, busy bounds, abort/dispose, synchronní reentranci, encode timeout a late callbacks i mezi dvěma Game instancemi.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM,DOM.Iterable --strict --skipLibCheck --esModuleInterop --types node client/rendered-frame-capture.ts tests/rendered-frame-capture.test.ts` — exit0, bez diagnostiky. Ověřuje tento modul/test a importované shared typy; nejde o celý build.
- `pnpm exec prettier --write client/rendered-frame-capture.ts tests/rendered-frame-capture.test.ts` — provedeno pouze ve vlastních souborech. `git diff --check` nad vlastními cestami bez hlášení (nové untracked soubory ještě nejsou staged).
- Výstupy příkazů zůstávají v tool transcriptu relace; nebyly vytvořeny další log soubory mimo rezervovaný rozsah.

Snapshot manifest zahrnuje implementaci i testy po posledním úspěšném běhu:

| Soubor                               | SHA-256                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| client/rendered-frame-capture.ts     | bf43b506e1f26f8927954b496ca572bd48d4c2b4ac1e60747499b3810da8f735 |
| tests/rendered-frame-capture.test.ts | 9682d9932b3f7c94197586104a29614daf33baaa8d2ba70992f81a73a0bc0c30 |

## Meze a předání

- Žádné vlastní dlouhožijící procesy, porty, GPU, heavy-validation nebo workspace-build; krátké CPU příkazy již skončily.
- Celá sada/build/integrace a skutečné framebuffer pixely, bez-HUD obraz, orientace, kamera/postprocess, dark scéna a náklady kopie/encode zůstávají přejímkou integrátora pod samostatnou rezervací. CPU mocks nejsou GPU důkaz.
- Root vlastní Game/UI/shared integraci, Linear, commit a přijetí. Tento task zůstává ready do jeho přijetí; release neznamená Done.
- Rezervace: všechny zápisy a CPU procesy končí tímto předáním; následný CLI release je poslední akce podagenta. Jeho skutečný výsledek dostává integrátor ve zprávě relace, další zápis po release podagent neprovádí.

Integrátor: k doplnění po kontrole konkrétního diffu/hashů a společného ověření. Společný docs/verification.md podagent neupravoval.
