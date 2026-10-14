# Předání: research-visual-lighting-20261014

- Vlastník: `research-01a13624-visual-20261014` (`/root/repair_reporting`); příjemce: `/root`.
- Checkout: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, `main`, HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: dokončený výzkum/porovnání řešení KEY-3/4/13/14/15; **žádná implementace runtime a žádná pixelová/GPU přejímka**. [Úplný rozhodovací podklad](../../performance/research-20261014/visual-lighting.md).
- Přesné změněné soubory: `docs/performance/research-20261014/visual-lighting.md`, tento handoff. Clean claim, žádné adopt-dirty/převzetí cizích změn. Nové AGENTS.md pravidlo14.10 i task předem načteny. Cizí WIP a hraný snapshot nezměněny.

## Podklady a hlavní nálezy

Rozhodující produkční log07c227f8… v immutable wave3 má build ID `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`, developmentfalse a origin4176. Byla čtena původní data, relevantní handoffy, installed Babylon9.30 a oficiální Babylon dokumentace; příslušné cesty/řádky/URL jsou v research dokumentu. Autor nepoužil Babylon Lite kontrakty jako náhradu9.30Core.

1. **Prokázaný image-processing kontraktní nesoulad:** `cinematic.ts` používá `pipeline.imageProcessingEnabled=false` ve snaze vypnout fullscreen processing. Installed setter ale vypne SceneConfiguration.isEnabled; tím přestanou být účinné i material TONEMAPPING/EXPOSURE/grade, přestože scalar hodnoty zůstanou uložené. Stávající testy kontrolují hodnoty, nikoli skutečné defines. Přesný veřejný kontrakt reprodukován povoleným experimentem níže. Toto není samo o sobě důkaz všech uživatelových nočních pixelů nebo dvojité gammy.
2. **KEY-3:** první ON logu má741.1ms interval, mainDraw694ms a shader program call wall22ms/30programových párů,550effect změn. Primary sources potvrzují změny slot/shadow defines a globální dirty práci; neprokazují, že celý zbývající čas je GPU kompilace. glTF cap opravy byly v té době již hotové; lokální fastpath nepokrývá tento cold mechanismus.
3. **KEY-15:**1/2nejbližší PointLight podle hráče, ostré hranice a0.5s cadence mají jiné chování než společná emisní čočka a11×11m neosvětlovaný noční pool pro všechny lampy. Konkrétní distance/receiver nesoulad je zdrojově doložený kandidát, nikoli identifikace jediného pixelového viníka.
4. **KEY-13:** není synchronizovaný obraz červeného snímku ani identita jeho material/texture bindingu. Zachycená absence texture/shader errors jej nevyvrací. Doporučeno nejprve cílené image+identity/readiness zachycení; žádný plošný gamma/AA/driver/fallback patch. Shimmer materiálů uživatel výslovně nehlásil; nemíchat s KEY-12 třesením kamery.
5. Skutečné custom ShaderMaterial jsou sky/sun/moon. Fotografická tráva je PBR; tree wind je PBR plugin. Fullscreen processing nesmí přidat další gamma transformaci již správné PBR větvi.

## Volba a rozsah dalších kroků

Dokument porovnává material-side non-HDR DefaultPipeline, vlastní Bloom/FXAA řetězec, material-owned konfiguraci, skutečný HDR fullscreen processing, scalar/paletové zásahy a sky-cube precision. Pro světla porovnává stable guard/order, idle fastpath, always-enabled/typed proxy sloty, cílený prewarm, receiver partition a širší engine migraci. Pro vzdálené lampy hysteresi/fade, sladění reprezentací, camera/player výběr, per-mesh řešení, lightmap/impostor a fotometrickou změnu. Pro červené pixely cílený důkaz, publikaci až po readiness, hot-swap test, konkrétní lifecycle/sampler opravu a teprve pak backend workaround.

**První doporučený implementační kandidát:** `DefaultRenderingPipeline` public non-HDR větev s účinným material-side image processing, bez nové fullscreen tonemap passy. Installed `_buildPipeline` tuto větev rozlišuje explicitně. Kandidát musí nejprve projít skutečnými controller lifecycle/defines testy a pixelovou přejímkou; větší HDR alternativa není předem vyloučena, pokud ukáže lepší výsledek. Samotné `sceneConfig.isEnabled=true` není dostatečný patch, protože observer současně znovu zapíná pipeline flag.

Přesný navržený první scope: `client/cinematic.ts`, `tests/cinematic-atmosphere.test.ts`, `tests/cinematic-art.test.ts`, vlastní budoucí handoff. Další scopes pro diagnostiku, lamp continuity, warmup/slot policy a specifické materiály jsou oddělené v research dokumentu. Vyžadují nové tasky/claims v rootem připravené isolated worktree `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`, nikoli úpravu main/HMR během hraní. Žádný nový scope si autor nepřivlastnil.

## Provedené ověření a refaktoring výzkumu

- Read-only porovnání deseti klíčových current zdrojů s wave3 manifestem: všechny shodné. Verze installed Babylon core9.30.0. Zvlášť označený lokální glTF fastpath je novější a do výchozího měření se nepřičítá.
- Root předem výslovně povolil jediný in-memory **NullEngine bez renderu/assetů/GPU** experiment veřejného setteru, SceneConfiguration a public prepareDefines. Spuštěno14.10.2026 cca14:12:18 Praha, `node --input-type=module`, exit0. Před setterem isEnabledtrue/TONE2/EXPOSUREtrue/IMAGEPROCESSINGtrue; po setteru a detach/reattach isEnabledfalse/TONE0/EXPOSUREfalse/IMAGEPROCESSINGfalse při stále uložené exposure1.18. Obnovení scene isEnabledtrue zapne zpět také pipeline flag. `finally` provedlo pipeline/scene/engine.dispose. Výstup je v tool transcriptu; výsledná tabulka a přesný postup jsou v dokumentu. Není to framebuffer test ani měření výkonu.
- Ostatní práce byla čtení a streamovaná analýza archivního JSONL. Neběžela nová test suite, build, integrace, GPU, server ani browser. Žádné vytvořené runtime/temp zdroje mimo task.
- Dokument sjednocuje odlišné symptomy a rozděluje fakta/hypotézy/chybějící důkazy; odstraněno zaměňování material-side/image-processing fullscreen cesty, samotných scalar nastavení a skutečně účinných defines. Každá varianta má dopad na cache, lifecycle, vzhled a ověření; předepsané budoucí testy nekopírují samotné hodnoty konfigurace.
- Čtecí kontrola tabulek:192 řádků,35392UTF-8B, žádná nesouhlasná šířka tabulky. Research SHA256 `efb8b5ead5a8dc8ac93de108ef407249818ae00a6c9c6d42f20463642c45aaa3`. Dokumentace sama netvoří source snapshot hry.

## Předání a omezení

Všechny vlastní krátké procesy ukončené, žádné porty, browser ani GPU prostředky nezůstávají. Rezervace se po tomto handoffu uvolňuje. Runtime opravy/funkce mají následovat po rozhodnutí jako samostatné commity; tento výzkum ještě žádný runtime commit nevytvořil a nic neintegroval do main. Root přebírá milník výzkumu do Linearu, výběr navazujícího tasku a finální integraci/evidenci.

Chybí obraz konkrétního červeného flash a vzdálené světelné závady, skutečný HDR/non-HDR pixelový a GPU A/B, izolované časování velkého mainDraw CPU a přejímka účinného grade přes low/medium/high. Zdokumentované experimenty a acceptance kritéria mají rozhodnout další opravy; samotný tento výzkum nezavírá KEY-3/4/13/14/15.
