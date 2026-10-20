# KEY-51: canvas → Node → Linear, primární technický digest

Stav k 2026-10-20. Rozsah je výzkum veřejných rozhraní, nikoli důkaz funkčnosti hry. Dvě tematická kola, 13 webových volání; finální evidence osm zdrojů pro capture a osm pro Linear. Herní kód nebyl auditován, GPU, endpoint ani upload nebyly spuštěny. Přítomnost HUD mimo 3D canvas zůstává hypotézou pro audit koordinátora. Žádná níže uvedená latence, spotřeba ani implementační optimálnost nebyla změřena.

## Epistemická pravidla zadání

1. Never conclude from training data alone. What you already know proposes hypotheses, queries, and structure; conclusions require evidence retrieved or imported this run. A claim you cannot evidence is stated as an unverified belief or not at all.
2. The research firewall. Project context — briefs, PRDs, code, memory — shapes what to ask, never what is true. It is inadmissible as evidence: every claim in a research artifact traces to a digest or import file with a source. Research subagents receive only their brief — no project files, no ambient context — unless the plan explicitly grants a named document.

Projektové instrukce byly čteny pro oprávnění a koordinaci, nikoli jako důkaz níže uvedených vlastností API. Třídy: **spec** = normativní text/editor draft, **docs** = dokumentace poskytovatele, **code** = staticky přečtený upstream zdroj, **inference** = návrhové doporučení odvozené z citovaných podkladů, **gap** = neověřená podmínka. Confidence označuje sílu konkrétního tvrzení, nikoli pravděpodobnost bezchybné implementace.

## Zachycení obrazu a okamžik události

**C1 — doloženo, high, spec/docs.** HTML `toBlob()` nejprve zkontroluje origin-clean a pořídí kopii neprázdné bitmapy; následnou serializaci specifikuje paralelně a callback úlohou. Kopie tedy patří okamžiku volání, nikoli okamžiku dokončení callbacku. Nulový rozměr a neúspěšné vytvoření obrázku potřebují větev bez snímku; nečistý původ může vyvolat `SecurityError`. Nepodporovaný požadovaný formát může skončit jako PNG. Kontrolovat skutečný `Blob.type`, velikost a `null`, nespoléhat na příponu. MDN potvrzuje chybové stavy, formáty a nutnost uvolňovat již nepotřebná object URL. [P01], [P02]

**C2 — doloženo, high, spec.** WebGL ve výchozím `preserveDrawingBuffer:false` po kompozici buffer čistí. Pozdější `readPixels`, `drawImage` nebo export po návratu renderovací funkce proto nemá záruku původního obrazu. Specifikace doporučuje přístup v téže renderovací funkci; trvalé zachování bufferu může na některých platformách výrazně zhoršit výkon a jde o parametr vytvoření kontextu. WebGL2 dokument se čte jako rozšíření WebGL1; samotná verze 2 tento problém neruší. [P03], [P04]

**C3 — doloženo pro aktuální návrh, high; shoda nasazených browserů gap.** WebGPU nelze vysvětlovat stejným mechanismem. Čerstvě načtený editor draft říká, že `[[drawingBuffer]]` přežívá `[[currentTexture]]` a drží vykreslený obsah i po prezentaci. Expirace textury sama buffer nemaže; výměna bufferu ano, například při resize, configure nebo získání nové aktuální textury. Čtení canvasu zahrnuje `drawImage` i `toBlob` a musí zohlednit dokončení již odevzdané práce. Po ztrátě device je fallback posledním prezentovaným obrazem pouze volitelný. Nezaručovat screenshot po pádu ani nezaměňovat načtený editor draft za praktický test Edge či jiné implementace. [P07, sekce canvas, ř. 13497–13538, 13662–13679, 13688–13790]

**C4 — doloženo, high, docs/code.** Babylon rozlišuje current-render screenshot a render-target screenshot. Dokumentace výslovně říká, že druhý scénu vykreslí do `RenderTargetTexture`. Zdroj verze 9.30.0 pro aktivní kameru registruje jednorázový `onEndFrameObservable`, poté kopíruje rendering canvas přes 2D `drawImage`. Pro jinou kameru přechází na render target. Render-target větev mění dočasný stav scény, volá `scene.render()`, čte pixely a likviduje texturu. Komentáře zakazují souběžné screenshoty. Název `Async` tudíž nezaručuje absenci dalšího renderu ani nulovou cenu. [P05], [P06, ř. 64–148, 150–168, 347–455]

**C5 — doporučení, medium, inference z C1–C4.** Pro hlášení preferovat jednorázovou kopii běžného dokončeného herního snímku do vlastního omezeného 2D canvasu a následný `toBlob`. Kopii neodkládat až po síťovém požadavku nebo dopsání formuláře. Rozlišit čas otevření formuláře, čas kopie a identitu skutečně zachyceného frame; následující normální frame není přesně okamžik stisku. Ve WebGPU musí integrační místo odpovídat skutečnému odevzdání práce enginu. Před implementací ověřit hook a backend, protože dokumentace screenshotu nedokazuje lifecycle konkrétní hry. Čekání na další frame musí mít konec a umožnit textové hlášení při zastaveném render loopu.

**C6 — doloženo a podmíněná inference, high/medium.** Canvas exportuje vlastní bitmapu; HTML overlay je součástí následné kompozice stránky. Pokud HUD skutečně není kreslený do tohoto canvasu, jeho kopie jej nezahrne. Pokud do něj patří Babylon GUI či jiné prvky, samotný export je neodstraní. `getDisplayMedia()` vyžaduje přechodnou aktivaci uživatele, výběr zdroje a nové povolení při každém použití; není vhodnou výchozí cestou automatické přílohy. Preferenci canvas-only odvozuji z těchto vlastností, nikoli z provedeného auditu HUD. [P01], [P03], [P08]

**C7 — návrh, medium, inference.** Udržovat nejvýše jednu čekající kopii/enkódování a omezené rozlišení, počet i bajty příloh; nepřidávat kontinuální framebuffer cache bez potřeby a měření. Po uzavření formuláře či změně generace ignorovat opožděný callback, zrušit observer a ukončit vlastněné zdroje. Asynchronní serializace není důkaz levného GPU readbacku. Porovnat cíleně celou hru před/po, včetně snímkové mezery při capture, encode, výsledné čitelnosti, paměti a opakovaného otevření. Podkladem jsou kopie bitmapy, čekání na odevzdanou práci a nepodporovaný screenshot souběh [P01], [P06], [P07]; konkrétní limity zůstávají rozhodnutím po měření.

## Doručení a Linear

**L1 — doloženo, high, docs.** Linear veřejné GraphQL podporuje API klíč i OAuth. `issueCreate` přijímá team, titul a Markdown description; návratový `success` a issue ID je třeba ověřit. HTTP 200 samo nestačí: odpověď může obsahovat dílčí data a GraphQL `errors`. SDK zpřístupňuje typ chyby, HTTP stav a původní chyby, pokud jsou dostupné. Z toho odvozuji serverové držení přístupových údajů, sanitizaci logů a malou výstupní selection místo předání klíče prohlížeči. [P09], [P15]

**L2 — doloženo, high, docs/code.** Manuální cesta je `fileUpload(contentType,name,size)` → ověřit payload → serverový PUT na `uploadUrl` se všemi vrácenými hlavičkami → použít `assetUrl` v issue/comment Markdownu. Linear požaduje serverový upload a popisuje chybu 403 při chybějících hlavičkách. Alternativou je automatický import obrázku z URL nebo base64 v Markdownu. Schema označuje `assetUrl` jako permanentní URL; životnost podepsaného PUT URL zde dokumentace neudává. Doporučuji explicitní upload kvůli evidenci jednotlivých etap, nikoli na základě naměřené rychlosti. [P10], [P16]

**L3 — doloženo, high, docs.** Uložené soubory jsou privátní. Čtení mimo Linear vyžaduje autentizaci nebo dočasně podepsanou URL vyžádanou hlavičkou `public-file-urls-expire-in` v sekundách. Tuto dočasnou URL neukládat jako trvalou identitu přílohy. OAuth dokumentace uvádí 24hodinový access token a obnovu refresh tokenem; server musí zvládnout expiraci. Dokumentace nepředstavuje SLA uchování souboru ani důkaz přístupu konkrétního příjemce. [P11], [P14]

**L4 — doloženo omezeně, high, docs/code.** Attachment je propojení externího zdroje s issue, nikoli synonymum uploadu obrázku. Stejná URL na stejném issue má výslovně idempotentní aktualizační chování. Aktuálně načtené oficiální schema navíc dovoluje `IssueCreateInput.id` v UUID v4 formátu. Není tím doložen kontrakt opakovaného `issueCreate` vracejícího původní úspěch. Obecný idempotency header ani atomická transakce upload+issue v prostudovaných podkladech doloženy nejsou. GitHub schema nenahrazuje introspekci skutečného veřejného endpointu; ta v tomto běhu neproběhla. [P12], [P16, ř. 18498–18546]

**L5 — doporučení, medium, inference z L1–L4.** Server před pokusem uloží report ID, zvolené issue UUID a aktuální etapu. Při nejasném výsledku create nejprve dohledá issue podle uloženého ID a porovná očekávaný obsah; nové UUID nevytváří automaticky. Replay a kolizi ověřit kontrolovaným integračním testem. Oddělit „upload připraven“, „PUT potvrzen“, „issue vytvořeno“ a „vazba potvrzena“. Při selhání create zachovat už známé `assetUrl`; při nejasném PUT nepovažovat absenci síťové výjimky za potvrzení úspěchu. Retenci osiřelých uploadů ani jejich automatický úklid zde nelze slíbit.

**L6 — doloženo, high, docs; následný návrh medium.** Linear má společné i endpointové request limity a complexity limity. Dokumentuje resetové hlavičky v UTC epoch milisekundách a GraphQL `RATELIMITED` dokonce s HTTP 400; retry tedy nesmí hledat pouze 429. Limity se mohou vyvíjet. Odvozený návrh: sériová omezená fronta, čekání podle odpovědi a backoff s jitterem, konečný počet pokusů, zvlášť neplatný vstup/oprávnění a přechodná chyba. Neopakovat create naslepo po timeoutu. [P13], [P15]

## Volba varianty a chybějící důkazy

**D1 — inference, medium.** Přímé Node→Linear má méně místního stavu, ale úspěch hráče váže na několik vzdálených etap. Malý perzistentní outbox/spool přidává správu disku, retence, kapacity a obnovy, zato umožňuje vlastní potvrzení „přijato serverem“ oddělit od „vytvořeno v Linear“. Pro požadavek spolehlivého hlášení doporučuji druhou variantu s limity bajtů, počtu, stáří, souběhu a viditelnou chybou při plné frontě. Je to architektonická inference z dílčích chyb a limitů [P09–P13], nikoli vlastnost poskytovaná Linear. Bez perzistentního potvrzení nepoužívat v UI formulaci „uloženo“.

Před realizací zbývá ověřit canvas/HUD, identitu browseru a backendu, hook po skutečném submitu, hotové versus chybějící frame, resize/device loss, formulář bez obrázku, skutečný MIME, požadované tělo a bajtové limity serveru, restart mezi etapami, timeout po úspěšném create, expirovanou upload URL, oprávnění a zobrazení screenshotu v cílovém issue. Neproběhl nezávislý empirický crosscheck. HTML versus MDN je dokumentační triangulace různých vydavatelů; Babylon docs+code a všechny Linear podklady zůstávají jednou dodavatelskou rodinou. Nezávislý provozní důkaz musí dodat kontrolovaný experiment.

## Registry primárních zdrojů

U všech položek **accessed=2026-10-20; pub_date=unknown**. Datum změny MDN toBlob je 2026-10-12; není to datum prvního vydání. WebGL2 uvádí datum editor draftu 2026-06-30. Živé `main/master` zdroje se mohou změnit. Confidence je high pro zde vyčtený text; neprokazuje nasazení ani výkon.

| ID | Přímý zdroj | Publisher | Class |
| --- | --- | --- | --- |
| P01 | [Canvas, toBlob a bitmapa](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob) | WHATWG | spec |
| P02 | [HTMLCanvasElement.toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) | MDN / Mozilla contributors | docs |
| P03 | [WebGL: drawing buffer](https://registry.khronos.org/webgl/specs/latest/1.0/#THE_DRAWING_BUFFER) | Khronos | spec |
| P04 | [WebGL2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/) | Khronos | spec |
| P05 | [Render Scenes To PNG](https://doc.babylonjs.com/features/featuresDeepDive/scene/renderToPNG) | Babylon.js | docs |
| P06 | [Screenshot implementation 9.30.0](https://raw.githubusercontent.com/BabylonJS/Babylon.js/9.30.0/packages/dev/core/src/Misc/screenshotTools.pure.ts) | BabylonJS | code |
| P07 | [WebGPU editor draft source](https://raw.githubusercontent.com/gpuweb/gpuweb/main/spec/index.bs) | W3C GPU for the Web WG / GPUWeb | spec |
| P08 | [getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) | MDN / Mozilla contributors | docs |
| P09 | [GraphQL a chyby](https://linear.app/developers/graphql) | Linear | docs |
| P10 | [File upload](https://linear.app/developers/how-to-upload-a-file-to-linear) | Linear | docs |
| P11 | [File storage authentication](https://linear.app/developers/file-storage-authentication) | Linear | docs |
| P12 | [Attachments](https://linear.app/developers/attachments) | Linear | docs |
| P13 | [Rate limiting](https://linear.app/developers/rate-limiting) | Linear | docs |
| P14 | [OAuth2](https://linear.app/developers/oauth-2-0-authentication) | Linear | docs |
| P15 | [SDK errors](https://linear.app/developers/sdk-errors) | Linear | docs |
| P16 | [Current SDK schema](https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql) | Linear | code |
