---
title: 'Ultra úsporný režim a vlastní grafické volby'
type: 'feature'
created: '2026-11-04'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bf0a6550e0aa46eddcfa33cb8c76fd207d6592bc'
context: ['AGENTS.md','docs/agents/bmad-policy.md']
---

<frozen-after-approval reason="Uživatel výslovně schválil implementaci uvedeného plánu4.11.2026.">

## Intent

Přidat Ultra50% a samostatné ovládání grafických efektů ve stávající D větvi. Ultra používá existujícíLowdetaily,50%šířky/výšky3Dscény, žádné dynamickéstíny/mraky/drobnouvegetaci/postprocesy a pouzeFARstromy. HUD plnérozlišení; stromovékmeny, ostatníbudovy, světla a fyzika zůstávají.
RežimyAuto/Ultra/Low/Medium/High/Vlastní. Ručníúprava vytvoříCustom z aktuálníhoresolvedstavu a vypneautomatiku. Presetresetuje volby. Společnýpanel předhrou/ve hře mádraft/Použít/Zrušit; zavřenýdraft se zahodí, preferencepersistují až po potvrzeníGame. Staré výchozípreference se nemění.
LiveApply je řízenápříprava s feedbackem/neutralinput, ale Game.ready,autority/síť/simulace pokračují. Jedinývizuálníowner, pouze zvolenákombinacebezklonuscény;60s/quality a180s celkem nezvyšovat. Timeoutnenísuccess, rollback jen grafiky, device-loss pravdivěrestart-required. Cold manual start připraví jen vybranoukonfiguraci;Auto své3kvality.
Disabled komponenty nemají zbytečnéload/update/draw/preparation; pozdnívýsledek je nesmí zapnout. ColdUltra bezshadow/postresources a grass/MID/nearload. LiveOff může podržet jednu bounded sadu, necachekombinací. Efektivnísettings/features/revize/transition patří dobenchmarku,HUD,rawlogu iserverwhitelistu.
Práce pouze D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104, codex/graphics-smoothness-20261104. Před změnouarchivovat usertest a ukončitvlastníserver/sampler. Cmain/8080 a cizíWIP bezezměny.
</frozen-after-approval>

## Průzkum a rozhodnutí

Userbc908fab source3fe11… ready19:47:35→dispose19:58:29Praha. Broad renderwall29,4ms z32,7mscallbacku; CPUvsGPU není izolované. Low je77%rozměrů,High100%; jinépozice/cache/taktybrání A/Bzávěru. GPU/VRAM je včástiHighzatížené, chybíjednotlivénáklady efektů. Pětisekundovémezery jsou samostatnýproblém. Pohleddolůje podleuživateleplynulejší nežceláscenérie; hlavní srovnávacíscénář.
Varianta novéhoqualitystringu vevšechrendererech zamítnuta: unknown často znamenáMedium/plnémraky. Rozřešitnovépresety na3stávajícíkvality aexplicitfeatures. Úplné odstraněnístromůzamítnuto kvůlineviditelnýmkolizím; FARreuse beznovýchassetů. Ručnípřepínání jen povenístartuzamítnuto podleuživatelskévolby; použítřízenou živoutransakci. Nekombinovat všechnystavyvstartup prewarm. Retence jednésady jeomezenýkompromis pro návraty, coldUltra ji nemá.
Primárnípodklady: aktuálníshared/render-quality.ts,Game.prepareLightingVariants/frame/reconcile, cinematic,vehicle lighting,vegetation/TreeRenderer/AtmosphereSky a pinnedBabylon9.30; MDN menšíbackbuffer a Babylon sceneoptimization zplánovacího průzkumu.

## Code Map a rozdělení

Přesné veřejné integračnísignatury jsou v CONTRACT.md. UI taskultra-graphics-20261104-ui vlastnísharedtypes/resolver/adaptive/UI/persistence; vegetationtask vlastnívegetaci a vizuálnícloudcoverage; lightingtask vlastníshadows/postprocess. Roottask vlastníGame, transakci, preparation aexporttelemetrie. PřesnéwritePaths/testyjsouvtaskJSON; helperAPIzměnu nejprve domluvit.

## Tasks a přijetí

1. Archiv userlogu včetněsystému a původníchomezení, čistýSTOP/revalidation; samostatnýcommit.
2. PreferenceV2+resolver+UI kontrakt, lazyfeatureowners aGame integračnítransakce; cílenýrefaktor/několik disjunktníchleafů.
3. Testy aindependentreview, stabilnítsc/fulltest/build/SDK, potéfrozenEdge.
Given starévalidnípreference, whenmigrace, then stejnýrežim/cíl/rozpočet. GivenmanualeditAuto, thenCustomsnapshot. GivenCancel/close, then žádnáaplikace/uložení.
GivenOFF, then0shadowpasses/groundvegdraws a žádnénepotřebnéupdate;FAR-onlynezahajujeMID/near a latefinishje nezapne. GivenON/resize/dispose, then jedinýowner/žádnýleak. Cloudrender0 nesmí změnitmeteorologii/astronomii.
GivenApply, then Game.ready/autority/inputflushzůstávají, inputneutral, jedenrenderowner. Confirmedrendercommit preferences; timeout/cancel restorespreviousproof; fataldevice nesmí zobrazithraníready. Rapidapplyserializované, stalecompletionignorované.

## Verification a šestibodový plán

Problém: nedostatečnáschopnosthráčeomezitrenderzátěž. Hypotéza: explicitnípixel/shadow/vegetationbudgety pomohou, jednotlivépodílyzatímnejsouznámé. Jedinýcelek: schválenéUltraaCustomvolby, žádnýnewasset/protokol/fyzika. Metrika: funkčnígates ačasysnímku/scopes/drawcalls/LOD. Správnost: source/tests/assetsidentita, HUDčitelnost/projekce, A/D/kolize/B6/car/torch/night, cold/warm, dataqualityahealth. Přijetívýznamnéhozrychlení:≥20%lepšímediánčasuvevýhledu protiLow bezopakovanép99regrese; jinakpřínosneprokázaný, nikoli falešnéPASS.
Regrese migrace/draft/custom/rollback/cancel/timeout/resize/dispose/asynclateownership. Low/Medium/Highdefaults aserverprivacyzachované. Jedenfrozenbuild, stejnépozice/kamery/počasí/HUD/SDKavatars s neutrálnímiinputs; pohleddolů aširokývýhled. Jednotlivévolbyprokládaně sLowreferencí, potomUltra, opakované10svzorky. ZměnarozlišenímůžeměnitprojekčníLOD. BěhemintervalůžádnéDOM/screenshot/build/test. Úplnébenchmarkreporty a systémovátelemetrie; nedostatečnádata→inconclusive. Celkovýgameplaygate zůstávábezzměny, explicitníApply/startup/hraní vykázatzvlášť se všemizáseky.

## Implementation Notes

Před implementací ověřený clean STOP run2: APIexited,inputrevalidated=true, samplerexit0, vlastnílauncherclaimuvolněn. Dva původníuntracked userplaytest dokumenty prokazatelně vlastníroot; převzatépouzeproarchivaci. Dalšíkopie/branchnevzniká.

## Review Triage Log

| ID / vrstva | Verdikt a důkaz | Řešení |
|---|---|---|
| R1 / leaf lighting | medium: Babylon dispose bezpodmínečně mění autoClear a ničil vlastnictví původního/cizího false. | patch: rozhodnout cílovou hodnotu před dispose, obnovit v finally; dvě regrese RED→GREEN. |
| R2 / leaf UI | medium: F8 mohl současně ponechat dva focus trapy a odpojení panelu rušilo Apply. | patch: feedback převezme jediný overlay; M/J/G během Apply nemění vlastníka; 13 cílených kontrol prošlo. |
| R3 / leaf vegetation | medium: Off během grass JSON ještě spouštělo textury. | patch: dormantní vlastník a sdílený obnovitelný On; 4 hraniční regrese prošly. |
| R4 / blind Game | medium: oba readiness gate čekaly na již nepotřebné MID/near IO při FAR-only. | patch: čekat na detail pouze v normal; zachovat skutečné čítače a chyby základního FAR. |
| R5 / blind Game | medium: timeout finálního gate zapisoval fatální render fault a tím zabránil rollbacku. | patch: explicitní recoverableTimeout pouze pro živou transakci; skutečné GPU/renderer chyby zůstávají fatální i při pozdním dokončení. |
| R6 / verification-gap | medium: testy neprocházely skutečným zápisem a opětovným čtením localStorage. | patch: cílená regrese skutečného readeru/persistence efektu pro Ultra/Custom, odmítnutí a stale Apply. |
| R7 / verification-gap | medium: chyběla volající cesta manual→Auto a tři živé přípravné průchody. | patch: skutečné prepareGraphicsConfiguration, pořadí kvalit a obnova efektivního stavu před potvrzením. |
| R8 / verification-gap Other | medium: synchronní replay wrapper volal nově asynchronní setQuality, takže graphicsApplying zabránil očekávanému renderu. | patch: replay zachová svůj explicitní render-only override a zamrazí adaptive stav bez interaktivní transakce; skutečná wrapper regrese. |
| R9 / edge cases | medium: bezpodmínečné isEnabled=false měnilo původní cold WebGL Low barevné zpracování. | patch: historická vypnutá větev jen pro WebGPU; WebGL si zachová původní materiálové zpracování, dvojí backend regrese. |
| R10 / edge cases | medium: Off během flower JSON ještě zahajovalo čtyři textury a geometrii. | patch: před konstrukcí ověřit živou enablement politiku; po příštím On lze malý JSON znovu načíst. |
| R11 / edge cases | medium: nezávisle potvrzen stejný FAR pending problém jako R4. | Společná oprava R4, žádné falšování statistik. |
| R12 / edge claim | medium: nezávisle potvrzen timeout/rollback problém R5. | Společná oprava R5; startup výchozí fail-closed se nemění. |
| R13 / skutečná regrese při opravě R5 | high: markReady vrací false pro již-ready renderer; původní finální gate by odmítl každý živý Apply. Skutečný helper test byl RED, zatímco dřívější mock tuto chybu zakryl. | patch: po skutečné readiness a dokončeném snímku přijmout již-valid health; markReady ponechat pro původní startup. Nový skutečný Game gate test musí dokázat úspěšný Apply i rollback. |
| R14 / následné ověření R9 | medium: první WebGL post ON stále vypínal globální grading přes Babylon setter, i když samotný cold stav byl již opravený. | patch: úzký adaptér pouze vlastního pinned observeru oddělí bloom/FXAA od materiálového gradingu. Skutečné změny kvality zachovají původní historii; Game zachytí grading pro rollback. 45 lighting testů a 13 Game Apply testů PASS. |
| R15 / finální rollback review | low: vlastník mohl výslovně zapnout grading i u předchozí High; návrat kvality by snapshot znovu přepsal. | patch: znovu prosadit snapshot po environment setup před vykreslením; parametrizované Low i High rollback případy 2/2 PASS včetně skutečného obnoveného snímku. |
| R16 / integrace na main | medium: plánovač světel zachytil výjimku z kreslení před RenderHealth a mohl zahájit rollback po chybě rendereru. | patch: nahlásit výjimku v živé přípravě světel a předat ji dál plánovači. Regrese před opravou selhala a po opravě vyžaduje restart bez rollbacku. |
| R17 / integrace na main | medium: vyčerpání rozpočtu před vykonáním časovače předalo finální bráně nulu a změnilo běžný timeout na chybu rendereru. | patch: zkontrolovat zbývající čas před vstupem do brány. Regrese před opravou selhala a po opravě obnoví původní grafiku. |

Žádný nález nemění schválený záměr, limit 60/180 s ani fyziku/protokol. Všechny opravy jsou součástí téhož kontraktu a vyžadují následné review a stabilní celkové ověření. Dosavadní cílené testy nejsou výkonovou přejímkou.

## Výslovné rozšíření zadání: WebGL2 příprava

Uživatel následně požádal „webgl2 timeouty increasni taky“. Problém: WebGL2 Game startup na rozdíl od WebGPU stále dědil výchozích 30 s z prepareLightVariants; souběžné R3 ověření skončilo current-off timeoutem při rozpracované frontě. Mechanismus je doložen přímým WebGL early return v Game.prepareLighting bez timeoutMs.

Jediná změna: předat WebGL2 vybrané kvalitě stejných 60 000 ms jako manuálnímu WebGPU. Metrika: skutečný caller předává 60 s a zachovává jediný průchod/požadovanou kvalitu; pozdější start v Edge zvlášť prokáže či vyvrátí dokončení. Správnost: žádné další kvality, readiness, shader/health, timeout rejection a potvrzený snímek zůstávají. Přijetí: cílené Game regrese a typová kontrola, praktický smoke v rámci rezervovaného okna. Obecný třicetisekundový helper default pro jiné vlastníky a finální submission gate zůstávají stejné jako u WebGPU. Zamítnuto plošné prodloužení všech časovačů a změna timeoutu na úspěch. Tato výslovně povolená změna rozpočtu není zrychlením hry.

## Integrace na main · 10. listopadu 2026

Funkční přejímka je dokončená. Ve skutečném Edge prošel start a živá změna na obou backendech, jízda, B6 a noční svítilna. Výkonové hodnocení zůstává otevřené v KEY-5. Přesné výsledky, oba počáteční timeouty a následné úspěšné běhy jsou v [integračním předání](../../../docs/agents/handoffs/pr41-main-20261110.md).
