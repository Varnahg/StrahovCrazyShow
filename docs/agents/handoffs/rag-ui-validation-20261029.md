# KEY-69: vizuální přijetí viewportu a SCS loaderu

Koordinátor `rag-ui-qa-01a17e9d`, pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Accepted base `8d3e69eccbce326ea198351507b5ea3a52e7cf82`; pracovní HEAD před UI commitem `0484541ce3756c8ae0b7b118772021b2e3aae646` má totožné runtime/source/test bloby a pouze starší koordinační metadata. UI se exportuje samostatně nad accepted main, bez tohoto metadata rozdílu a bez cizího WIP.

## Rozsah a identita

Vlastní zdrojové předání je `rag-ui-20261029-viewport-loader.md`, sedm source/test cest. Dva izolované snapshoty obsahují 961 explicitních vstupů včetně testů. Kopie ověřuje hash vstupu před/po zápisu; `.env`, klíče a soukromé konfigurace nejsou vstupy. Dependency instalace ani root dist se nemění.

- Candidate1 source SHA-256 `6ff06fac38e9bf04749c25a231eb32120ef4f99ce8a0c9da69b3def8bcd90f08`.
- Finální candidate2 source SHA-256 `91ffee75c6f48f3958a23e05760667428a6fd231b42331d765ced94812e78214`.
- Manifesty, přesné hashe sestavených souborů a screenshoty jsou v `.cache/rag-ui-validation-20261029/`, finální souhrn `evidence-summary.json`.
- Vite produkční build obou kandidátů PASS. Sestavení obsahovalo nezměněný produkční vstup a oddělený `ui-qa.html` používající skutečný LoadingScreen v témže `.game-shell` obalu. Fixture se necommituje a nepatří do normálního produkčního buildu. Zůstávají stávající varování o velkých chunkech.

## Skutečné prohlížečové ověření

Microsoft Edge 156 přes existující Playwright, izolovaný vlastní profil, headless, CSS rozlišení podle jednotlivých snímků. URL `http://127.0.0.1:4290/` obsluhovala produkční UI; `/ui-qa.html` pouze řízené loader/error stavy. Statický server neposkytoval backend a jeho `/api/` vracelo503. Nebyl připojen multiplayer ani OpenAI.

Oba CUA/node_repl helpery selhaly před inicializací na `failed to write kernel assets` / os error3. OS inventura ukázala již otevřenou uživatelskou hru v Edge; nebyla zavřena ani měněna. Vlastní Edge měl **ověřeně** WebGL=false, WebGL2=false a WebGPU adapter=false, takže nepřibyla3Dscéna. Produkční profil byl zkoušen se stavem načítaného/nedostupného preview, nikoli jako přijetí zdravého GPU preview. Tato práce nedokládá výkon GTX, skutečný herní startup ani opravu WebGPU timeoutu.

Candidate1: 40 screenshotů/geometry kontrol, 1440×900,1024×600,390×844,320×568,844×390 × CZ/EN × home/profile/loader/error. Root dokument měl vždy přesné rozměry viewportu a tmavý podklad; žádný vodorovný ani kořenový svislý overflow. Home/profile CTA byla hit-testovatelná. Prohlédnuté reprezentativní screenshoty potvrzují vzhled; všech40 případů mají uloženou geometrii. Dlouhý loader/error se posouvá uvnitř bounded overlay, návrat/report/recovery zůstávají dosažitelné.

Jedno nezávislé review identifikovalo P2: při velmi nízké výšce se editor smrskl na nulu. Skutečné screenshoty390×244 a844×200 potvrdily ztrátu polí při stále viditelném CTA. Oprava používá skutečnou visualViewport výšku≤420px a v tomto režimu jeden scroll celého shellu. Běžné vyšší viewporty zachovávají předchozí rozložení.

Candidate2: 17 cílených snímků/kontrol po opravě, včetně změněného844×390 v obou jazycích,390×244 a844×200. Na obou nízkých rozměrech skutečně provedeno scrollIntoView, kliknutí a vyplnění přezdívky, následně dosažení CTA; hit-testy obou konců PASS. Při390×844 ověřen konec vnitřního editorového scrollu. Loader s dlouhou chybou a otevřenými detaily na320×568 a844×390 umožnil dosažení návratu a aktivaci recovery callbacku. Reduced-motion vyhodnotil animation-name:none. Skutečný CDP pinch scale2 zachoval layout výšku844px. Žádné pageerror v obou bězích. Fyzická mobilní OS klávesnice nebyla emulována; její resize/pan kontrakt je pokryt unit testem s nezměněným innerHeight a měněným visualViewport, a dosažitelnost odpovídající nízké geometrie skutečným prohlížečem.

Úzké re-review uzavřelo P2 bez dalších nálezů. Autor doložil21/21 cílených testů, scoped strict TypeScript a diffcheck PASS. Celé CI/build/SDK nad finálním exportovaným PR headem následují před main přijetím; tento záznam jejich výsledek nepředjímá.

## Lifecycle a předání

Vlastní statický server a samostatný Edge skončily ve finally obou harnessů; ověřeno, že4290 už neposlouchá. Žádný cizí proces, frozen4278/4280, uživatelská karta ani jejich vstupy se neměnily. Source writer předal a uvolnil svůj scope; integrátor převzal přesný diff pod vlastním claimem. Po commitu/exportu se lokální QA zdroje uvolní; main integrace proběhne až po povinných kontrolách a přijetí přesného headu.
