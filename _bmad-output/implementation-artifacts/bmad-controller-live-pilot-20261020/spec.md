---
title: "Přidat samostatnou nápovědu LFS kontrolního CLI"
type: "feature"
created: "2026-10-20"
status: 'done'
route: "dispatch"
baseline_commit: "c1c56327240d5634fa3f4670fc7264e6a4287238"
review_loop_iteration: 0
context: ["{project-root}/AGENTS.md", "{project-root}/docs/agents/bmad-policy.md"]
---



<frozen-after-approval reason="Explicitly assigned intent and task acceptance; controller preserves verbatim source">

## Intent

# KEY-47: pilot nápovědy LFS CLI

Explicitní přidělení: [KEY-47](https://linear.app/gigeconomy/issue/KEY-47/pilot-bmad-radice-napoveda-cli-kontroly-lfs), jeden pilot schválený uživatelem 20.10.2026 v rámci KEY-46. Žádný jiný backlog task nezačínej.

Doplň `--help` a `-h` do `scripts/check-lfs-assets.mjs`. Samostatná nápověda vrací exit0, stručně vysvětluje výchozí checkout a `--root CESTA`, kontroly velikosti/pointerů bez checksumu a bez stahování. Funguje mimo Git checkout i s prázdným PATH. Stávající ověřovací režim i odmítání neznámých/míchaných argumentů zachovej; help se přijímá pouze jako jediný argument. `--help --root ...` je chyba, ne tiché přeskočení kontroly.

Nejdřív reprodukuj dosavadní chování, projdi argument parser, pořadí filesystem/Git operací a stávající dva testové soubory. Porovnej časné zpracování help proti přimíchání do root parseru; zvol nejmenší jasnou variantu a zaznamenej důvod. Refaktoruj dotčené parsování jen podle skutečné potřeby. Přidej `tests/lfs-assets-help.test.ts` s black-box CLI testy obou voleb, prázdného PATH, nerepozitářového cwd, mixu argumentů a nezměněného odmítnutí neznámé volby. Používej absolutní process.execPath; nepotřebuješ dependencies instalovat. Test při neexistujícím cwd nemůže proces vůbec spustit, proto jako relevantní scénář použij existující temp nerepozitářový adresář. Ukonči vlastní procesy a bezpečně ukliď pouze vlastní temp fixture.

Primární podklady: současný skript a jeho testy; [Node process.argv](https://nodejs.org/docs/latest-v24.x/api/process.html#processargv), [Node child_process](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [Git LFS pointer](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pointer.adoc). Jde o CLI změnu bez vlivu na hru, GPU, síť, materiály či asset cache; neprováděj herní měření.

Koordinační task vlastní pouze BMAD plan/evidence/handoff/renderer; implementační worker má vlastní disjunktní task a owner. Žádný rekurzivní BMAD ani další agenti, žádné commity, push, PR, Linear mutace nebo globální nastavení z modelového workeru. Tyto integrační kroky provádí deterministický řadič. Před prvním zápisem ověř aktuální claim a svůj přesný scope.

Přejímka: uvedené CLI testy, nezávislé blind/edge/verification review, povinné GitHub checky na přesném head, SHA-vázané přijetí a chráněný merge. Řadič bude úmyslně ukončen po vytvoření PR před lokálním checkpointem a následně obnoven. Jeden run smí mít pouze jeden worktree, worker attempt pro daný krok, commit, PR a provozní Linear komentář.

## Boundaries & Constraints

Controller task: `bmad-controller-live-pilot-20261020`; writePaths: `_bmad-output/implementation-artifacts/bmad-controller-live-pilot-20261020/`, `_bmad/render/bmad-build/`, `docs/agents/handoffs/bmad-controller-live-pilot-20261020.md`.

Worker task: `bmad-controller-live-pilot-worker-20261020`; writePaths: `scripts/check-lfs-assets.mjs`, `tests/lfs-assets-help.test.ts`.

AGENTS.md, task definitions, live claims and docs/agents/bmad-policy.md remain authoritative.

**Frozen acceptance:**
- Pouze výslovně zadaný rozsah; doložené skutečné výsledky a ukončené vlastní procesy.
- CLI --help/-h funguje bez Git checkoutu a bez Git v PATH, existující LFS kontroly zůstávají zelené. Hra/GPU nemá změněný runtime.

</frozen-after-approval>

## I/O & Edge-Case Matrix

Derived interpretation of the unchanged frozen assignment; no new requirements.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Samostatná nápověda v checkoutu | Právě jeden argument --help nebo -h; cwd je kořen checkoutu a PATH je zděděný. | Exit 0, prázdný stderr a stručná nápověda na stdout vysvětlující výchozí cwd jako kořen checkoutu, --root DIR, kontroly velikostí a pointerů, absenci checksumu a stahování i samostatnost help argumentu. | Chyba spuštění procesu nebo ukončení signálem nesmí být považováno za úspěšnou nápovědu. |
| Nápověda nezávislá na checkoutu a dostupnosti Git | Samostatné --help nebo -h; existující temp nerepozitářový cwd se zděděným či prázdným PATH, nebo checkout s prázdným PATH. | Exit 0, stejná nápověda na stdout a prázdný stderr bez filesystem/Git ověřování checkoutu. | Použije se existující cwd; nápověda nesmí selhat kvůli chybějícímu checkoutu nebo Git v PATH. |
| Smíchané a opakované help argumenty | Help alias před či za --root DIR, neznámou volbou nebo pozičním argumentem; opakovaný alias nebo oba aliasy společně. | Exit 1, prázdný stdout a diagnostika Invalid arguments s usage na stderr. | Argumentová chyba se zachová také v nerepozitářovém cwd s prázdným PATH; nesmí ji zastoupit chyba filesystemu nebo Git. |
| Původní neplatné argumenty | Samostatné --unknown, --root bez hodnoty nebo neočekávaný poziční argument. | Exit 1, prázdný stdout a původní argumentová diagnostika s usage na stderr. | Zachovat odmítnutí parserem před filesystem/Git operacemi. |
| Platný ověřovací režim | Žádné argumenty v kořeni checkoutu nebo --root DIR pro platný checkout; pracovní soubory splňují kontroly inventáře HEAD. | Zachovaný exit 0 a souhrn připravených souborů po kontrole velikostí a pointerů bez checksumu a stahování. | Zachovat dosavadní přijetí prázdného inventáře a malých materializovaných souborů, které nejsou pointery. |
| Nezpůsobilé pracovní assety | Ověřovací režim s chybějícím souborem, chybnou velikostí, nematerializovaným pointerem nebo nepřípustnou cestou. | Exit 1 a zachovaná diagnostika dotčených položek se souhrnem selhání. | Zachovat dosavadní kontrolní režim bez oprav souborů, doplňování cache nebo stahování. |
| Selhání rootu nebo inventáře | Ověřovací režim s neexistujícím nebo nerepozitářovým rootem, chybějícím HEAD, vadným inventářem nebo selháním Git LFS. | Zachovaný exit 1 a diagnostika odpovídající původnímu ověřovacímu režimu. | Neúplnou nebo neprovedenou kontrolu nevyhodnotit jako úspěch. |

## Code Map

Pozorováno: HEAD je c1c56327240d5634fa3f4670fc7264e6a4287238; git status --short byl před průzkumem i po něm prázdný. Přímé čtení claims.json potvrdilo oba zadané vlastníky, správnou worktree a rozsahy shodné s definicemi tasků. Nebyl spuštěn status CLI ani proveden zápis.

Byly přečteny AGENTS.md, koordinační README, bmad-policy.md, mapa architektury, current-work.md, obě definice tasků, explicitní zadání a manifest pilotu. Povinné step-02-plan.md a spec-template.md se nepodařilo načíst: Get-Content i kontrola metadat skončily odepřením přístupu. Jejich obsah ani splnění jejich dalších požadavků proto nelze potvrdit.

Doložený mechanismus: parseRoot na ř. 16 přijímá pouze žádné argumenty nebo dvojici --root DIR. main na ř. 121 nejprve parsuje argumenty, následně provádí realpathSync, kontrolu adresáře a ověření kořene pomocí Git. Potom načte LFS inventář z HEAD, kontroluje pracovní soubory, jejich velikosti a malé soubory předává parseru pointerů. Neprovádí checksum ani stahování. readHeader uzavírá deskriptor ve finally. Oficiální dokumentace potvrzuje význam návratových kódů kontroly pointeru. [Git LFS pointer](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pointer.adoc)

Reprodukce na Node v24.19.0: samostatné --help a -h v checkoutu i v existujícím systémovém temp adresáři mimo Git s prázdným PATH skončily kódem 1, prázdným stdout a diagnostikou Invalid arguments s usage na stderr. Nerepozitářové cwd bylo ověřeno samostatným Git dotazem. Neznámá volba, help před i za --root a kombinace obou aliasů rovněž skončily kódem 1. Kontrolní běh bez argumentů ve stejném cwd s prázdným PATH došel ke Git operaci a skončil ENOENT. Všech devět CLI procesů skončilo normálně bez signálu; nebyly vytvářeny fixtures ani dlouhožijící procesy.

Oba existující testové soubory byly přečteny celé. Pokrývají výchozí checkout, explicitní root, HEAD inventář, pointery LF/CRLF, malé materializované soubory, velikostní chyby, nepřítomné soubory, ochranu cest, nezměněnou cache a odmítání chybných argumentů. Nový test má být samostatný black-box modul; import existujícího testového modulu by spouštěl jeho testy a Git fixtures.

Node dokumentuje process.execPath jako absolutní cestu a argumenty skriptu za prvními dvěma položkami process.argv. To podporuje současné slice(2) a spouštění testovaného CLI bez hledání Node v PATH. [Node process](https://nodejs.org/docs/latest-v24.x/api/process.html#processargv) Pro prázdný PATH musí test odstranit všechny varianty názvu Path/PATH; Windows je porovnává bez ohledu na velikost písmen. Neexistující cwd zabrání spuštění procesu. [Node child_process](https://r2.nodejs.org/docs/latest-v24.x/api/child_process.html)

Regresní sady nebyly spuštěny, protože vytvářejí a mění dočasné repozitáře; tato fáze je pouze čtecí analýza. Výkonnostní měření nebylo provedeno. Závěr o zanedbatelném dopadu navržené větve je odvozený z jejího rozsahu, nikoli naměřený výsledek.

- `scripts/check-lfs-assets.mjs` — Jediný existující implementační soubor workeru. Ř. 16: kontrakt parseRoot; ř. 26: Git subprocess; ř. 40: inventář HEAD; ř. 75 a 99: čtení a kontrola assetů; ř. 120: doporučené místo časné větve; ř. 144: zachovat lifecycle přes process.exitCode.
- `tests/lfs-assets-help.test.ts` — Dosud neexistující rezervovaný výstup workeru. Má obsahovat samostatné black-box CLI testy nápovědy a zachovaného odmítání argumentů bez závislosti na Git fixtures.
- `tests/lfs-assets.test.ts` — Čtecí regresní podklad. Ř. 30 a 45: izolace prostředí a bezpečný úklid; ř. 104: absolutní process.execPath; ř. 156 dále: hlavní kontrolní kontrakty; ř. 286: odmítání argumentů. Soubor není ve writePaths.
- `tests/lfs-assets-edge-cases.test.ts` — Čtecí regresní podklad pro malé materializované soubory a POSIX cestu s koncovou mezerou. Zachovat beze změn.
- `docs/agents/assignments/bmad-controller-pilot-20261020.md` — Autoritativní explicitní zadání KEY-47: samostatná nápověda, přísné kombinace argumentů, požadované testy a omezení role workeru.
- `docs/agents/assignments/bmad-controller-pilot-20261020.json` — Manifest řadiče; ř. 13 a 23 definují přesné cílené testy a samostatný běh help. Pouze čtení.
- `.github/workflows/ci.yml` — Navazující CI řetězec: ř. 33 původní LFS testy, ř. 36 skutečný preflight, ř. 62 celá sada zahrnující nový test, následně build a integrace. Úprava není potřebná ani rezervovaná.
- `package.json` — Dokládá Node 24, ESM a testovací glob tests/*.test.ts. Nový test bude zahrnut bez změny manifestu nebo instalace závislostí.
- `docs/agents/tasks/bmad-controller-live-pilot-worker-20261020.json` — Přesná hranice následného zápisu workeru: pouze skript a nový test; resources je prázdné. Shoda s přímým čtením claimu byla ověřena.
- `docs/agents/tasks/bmad-controller-live-pilot-20261020.json` — Vymezuje artefakty a renderer řadiče. Worker v této fázi specifikaci ani evidenci nezapisuje.
- `_bmad/render/bmad-build/autodev-key-47-c1ef58bf36c0-69f49613d226/607a5d7f6c796647d31c/step-02-plan.md` — Povinný podklad této fáze; čtení a metadata odepřena. Obsah neověřen.
- `_bmad/render/bmad-build/autodev-key-47-c1ef58bf36c0-69f49613d226/607a5d7f6c796647d31c/spec-template.md` — Povinná šablona pro artefakt řadiče; čtení a metadata odepřena. Obsah neověřen.

## Tasks & Acceptance

**Execution:**
- [ ] `scripts/check-lfs-assets.mjs` -- Přidat na začátek main přesnou větev pro jediný argument --help nebo -h, která vypíše požadovanou nápovědu na stdout a vrátí 0 před parseRoot a filesystem/Git operacemi. Argumenty získat jednou; ostatní vstupy předat zachovanému parseru. -- Zajistit samostatnou nápovědu nejmenší zvolenou změnou při zachování původního ověřovacího režimu a odmítání chybných argumentů. (basis: intent)
- [ ] `tests/lfs-assets-help.test.ts` -- Přidat samostatné black-box testy úspěšných scénářů nápovědy a argumentových okrajů matice pro oba aliasy, checkout i existující temp nerepozitářový cwd a zděděný i prázdný PATH. Použít absolutní process.execPath, odstranit všechny varianty PATH při jeho vyprázdnění, izolovat GIT_* a NODE_OPTIONS, kontrolovat normální ukončení a stdout/stderr a registrovat bezpečný úklid vlastní fixture. -- Doložit nezávislost nápovědy na Git a checkoutu, zachované odmítání neplatných vstupů a zabránění tichému přeskočení kontrol smíchanými argumenty. (basis: intent)

**Acceptance Criteria:**
- Given Kandidát KEY-47 vychází z přiděleného dvousouborového rozsahu., when Řadič porovná zdrojový diff s výchozím commitem., then Zdrojové změny zahrnují pouze scripts/check-lfs-assets.mjs a tests/lfs-assets-help.test.ts; herní runtime, GPU a asset cache zůstávají bez zásahu. (basis: intent)
- Given Testovací běh vlastní své pomocné procesy a dočasné fixtures., when Testovací běh skončí., then Vlastní procesy jsou ukončeny a po ověření cílové cesty jsou bezpečně uklizeny pouze vlastní dočasné fixtures. (basis: intent)
- Given Řadič přebírá konkrétní kandidát jediného přiděleného pilotu., when Řadič vyhodnotí přejímací brány., then Přijetí je vázáno na SHA, skutečné výsledky kontrol, nezávislá blind/edge/verification review a povinné GitHub checky na přesném head; integrace používá chráněný merge. (basis: intent)
- Given Řadič byl ukončen po vytvoření PR před lokálním checkpointem., when Řadič obnoví přerušený běh., then Běh pokračuje se stejnou identitou a zachovává jediný worktree, worker attempt pro daný krok, commit, PR a provozní Linear komentář. (basis: intent)

## Implementation Notes



## Spec Change Log

- One bounded planning-presentation completion: supply the omitted I/O matrix and typed execution/acceptance format; KEEP the exact frozen block, original plan, implementation and source identity.



## Review Triage Log



## Design Notes

Doporučena je přesná časná větev uvnitř main před parseRoot a všemi explicitními filesystem/Git operacemi. parseRoot zachovat; cílený refaktoring omezit na jediné získání args a přehledné umístění textu nápovědy. Nápověda má vysvětlit, že výchozím rootem je aktuální pracovní adresář, který musí být kořenem checkoutu, význam --root DIR, kontrolu velikosti a pointerů, absenci checksumu a stahování. Úplnou připravenost fáze nelze potvrdit, dokud řadič nezpřístupní oba povinné renderované podklady. Zápis specifikace, checkpoint i další dispatch zůstávají řadiči.

**Zvažované varianty:**
- Časná větev na začátku main: jednou získat args, přijmout pouze jediný argument přesně --help nebo -h, vypsat nápovědu a vrátit 0 před parseRoot a filesystemem. Nejmenší změna; zachovává kontrakt parseru i současné zpracování chyb přes process.exitCode. Přidává konstantní kontrolu bez nových závislostí, cache nebo zdrojů.
- Rozšířit parseRoot na parser vracející režim help nebo root: technicky může zajistit stejné pořadí operací, ale vyžaduje nový návratový kontrakt a jeho obsluhu před realpathSync, případně přejmenování funkce. Pro dvě samostatné volby přináší více refaktoringu a větší prostor pro chybu bez doloženého přínosu.
- Obsloužit help na úrovni modulu před stávajícím try/main: umožňuje obejít filesystem i Git, ale rozděluje řízení CLI mezi dvě místa a vyžaduje podmíněné spuštění main. Varianta uvnitř main zachovává přehlednější současný lifecycle.
- Použít obecný parser, například vestavěné util.parseArgs: nevyžaduje balíček, ale přináší širší změnu pravidel pro argumenty a potřebu dalšího ověřování kompatibility. Pro tento explicitně úzký kontrakt není náklad opodstatněný.

**Primární podklady:**
- AGENTS.md; docs/agents/README.md; docs/agents/bmad-policy.md; docs/agents/architecture.md; docs/agents/current-work.md.
- docs/agents/assignments/bmad-controller-pilot-20261020.md a odpovídající JSON manifest: explicitní CLI kontrakt, rozsah a přejímací příkazy.
- docs/agents/tasks/bmad-controller-live-pilot-20261020.json; docs/agents/tasks/bmad-controller-live-pilot-worker-20261020.json; přímo přečtený společný claims.json.
- scripts/check-lfs-assets.mjs; tests/lfs-assets.test.ts; tests/lfs-assets-edge-cases.test.ts; package.json; .github/workflows/ci.yml.
- [Node process.argv a process.execPath](https://nodejs.org/docs/latest-v24.x/api/process.html#processargv): argumenty a absolutní cesta interpretu.
- [Node child_process](https://r2.nodejs.org/docs/latest-v24.x/api/child_process.html): prostředí procesu, PATH na Windows, cwd a synchronní spouštění.
- [Git LFS pointer](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pointer.adoc): lokální kontrola pointeru a návratové kódy.
- Vlastní čtecí reprodukce devíti CLI běhů na Node v24.19.0 nad HEAD c1c56327240d5634fa3f4670fc7264e6a4287238.

**Rizika a omezení:**
- Blokace úplné připravenosti: oba povinné renderované soubory hlásí odepřený přístup. Není doloženo, že chybějí; jejich obsah nebyl přečten a nelze potvrdit úplnost plánovacího kroku vůči nim.
- Použití args.includes pro help by mohlo přijmout zakázané kombinace a tiše přeskočit kontrolu assetů. Nutná je přesná kontrola jediného argumentu.
- Přesunutí větve až za realpathSync nebo Git kontrolu by porušilo nezávislost nápovědy na checkoutu a dostupnosti Git.
- Test s pouhým přidáním PATH: '' může na Windows stále předat zděděný Path. Neexistující cwd by testovalo selhání spuštění místo nápovědy.
- Zelený regresní výsledek ani nová funkčnost zatím nejsou doloženy. Předpokládaný nulový zásah do hry, asset cache a správy deskriptorů vychází z navrženého rozsahu; musí jej potvrdit implementační diff a cílené testy.

## Verification

**Commands:**
- `node --test tests/lfs-assets.test.ts tests/lfs-assets-edge-cases.test.ts tests/lfs-assets-help.test.ts` — expected: exit 0; actual results recorded by controller
- `node scripts/check-lfs-assets.mjs --help` — expected: exit 0; actual results recorded by controller

CLI --help/-h funguje bez Git checkoutu a bez Git v PATH, existující LFS kontroly zůstávají zelené. Hra/GPU nemá změněný runtime.

## Controller Planning Decisions

Route: dispatch. The assigned controller run includes external Linear progress, Git push, PR publication and project acceptance, plus merge/main CI when merge=true; these are actual assigned external effects, even when worker source changes are small.

Observed worker footprint: `scripts/check-lfs-assets.mjs`, `tests/lfs-assets-help.test.ts`. Worker irreversibles: []. New callable/dependency surfaces: [].

Scope: keep-full, decided by the controller under existing single-task authorization; no new user approval is claimed. Retain the single assigned goal and its frozen acceptance. Splitting would change the delegated scope; this is a presentation decision, not new user approval or permission to add goals. Not measured; no exact model-token count is claimed. Keep-full applies regardless of length and accepts the context-length risk.

Authorization SHA256: 2d536203be9ffc3eb433ad3ff3f5d28a8de5ca11e33d504dfd9cc48e1784d02f. AGENTS.md and docs/agents/bmad-policy.md require autonomous completion of authorized work; routine format/route decisions do not request another approval. Only unresolved user-visible intent choices are intentGaps. Real missing inputs or runtime prerequisites still block readiness.
