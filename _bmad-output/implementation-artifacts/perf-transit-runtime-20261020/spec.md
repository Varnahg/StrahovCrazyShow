---
title: "Omezit opakovaný úklid NPC poolu v dopravním rendereru"
type: "feature"
created: "2026-10-20"
status: 'done'
route: "dispatch"
baseline_commit: "c3454da45b22ad9726c257d3d481d45f6243ec04"
review_loop_iteration: 0
context: ["{project-root}/AGENTS.md", "{project-root}/docs/agents/bmad-policy.md"]
---



<frozen-after-approval reason="Explicitly assigned intent and task acceptance; controller preserves verbatim source">

## Intent

# KEY-53 — úklid poolu NPC pouze po změně vlastněných rigů

Uživatel výslovně požaduje malý performance úkol s přímým dopadem na hru, skutečný průchod řadičem do PR/merge/zelené main CI a srovnatelné před/po měření. Tento úkol je úzký follow-up KEY-5, doložený v docs/agents/handoffs/fps-transit-cost.md:7. Přijetí nadřazeného KEY-5 se tím netvrdí.

## Mechanismus a volba

client/transit-renderer.ts vlastní samostatný AvatarPrimitivePool. Jeho update po každém snímku volá pruneUnused, i když všechny passenger rigy zůstaly stejné. Pool přitom iteruje zdroje a materiály a alokuje pomocná pole/Sets. Původní audit tento follow-up neimplementoval. Čtecí oponentura prověřila creation/disposal, AvatarLodController, synchronní retain/release v avatar-skinned, CharacterMaterials a Babylon9.30InstancedMesh.dispose. LOD/hidden instance pouze deaktivují/odregistrují, neodstraňují vlastní source/material reference; far proxy a garment mají samostatné vlastnictví. Async texture completion nemění členství tohoto poolu.

Porovnáno: single-entry kalendářní cache je širší (DST a navigační provenience); throttle drží nepotřebné zdroje déle; změna globálního AvatarPrimitivePool API zasahuje cizí WIP a ostatní uživatele; zrušení úklidu by způsobilo retenci. Zvolena nejmenší informace o změně ve skutečném vlastníkovi, beze změny pool API.

## Přesný worker rozsah

Pouze client/transit-renderer.ts a tests/transit-pool-pruning.test.ts. Žádné změny avatar-renderer.ts, shared/transit.ts, navigačních katalogů, Game/UI/serveru, kvality, hustoty, materiálových parametrů, tras nebo světel. Žádné nové dependencies. Vlastní controller task vlastní renderer/spec/review/handoff; externí koordinátor vlastní měření/receipt. Před zápisem claim a aktuální AGENTS/policy; původní WIP jiných relací zůstává zachovaný.

## Požadované chování a refaktoring

Udržuj pouze lokální informaci, že pool vyžaduje úklid. Nastav ji před skutečným vytvořením či odebráním passenger rigu; při více změnách proveď jeden sweep na nynějším konci update. Zachovej sweep po první konstrukci a při výměně ID se stejným počtem NPC. Vymaž pending stav teprve po úspěšném sweepu, aby výjimka během dalšího update neztratila požadavek. Stabilní kohorta, pouze posun, animace, LOD či opacity nemají vytvářet další sweep. Plný dispose rendereru nadále uvolní všechny rigy/pool a funguje při opožděném dokončení loaderů. Nezaváděj timer, dlouhodobou cache dalšího obsahu, nový observer nebo druhý mechanismus vlastnictví.

## Regrese

Použij skutečný TransitRenderer update a skutečný Babylon pool/rigy tam, kde se ověřuje lifecycle; test-only fixture smí izolovat feed/loadery a scénář, nikoli nahradit vlastní úklid fake funkcí. Ověř:
- první konstrukci a stabilní snímky;
- near/medium/far/hidden a zachování živých meshů/materiálů;
- odstranění jednoho sdílejícího NPC, posledního, opětovné vytvoření;
- výměnu identity při stejném počtu a více mutací v jednom update;
- přerušený update/prune výjimku a pozdější dokončení pending úklidu;
- dispose a opožděné loadery beze změny záruk.
Cílený refaktoring je součástí tohoto jediného mechanismu; žádné plošné formátování.

## Ověření a externí přijetí

Controller provede cílené testy a nezávislé blind/edge/verification review. Koordinátor před runtime runem zmrazí srovnatelnou baseline a po výsledném commitu provede produkční A/B. Čisté testy nebo snížený počet sweepů nejsou GPU/FPS důkaz.

Externí evidence musí uvádět přesný baseline/candidate source/test/assets/build/overlay hash, identický scénář s plnou hrou/HUD, alespoň3skutečné relace s různými avatary, viditelnou NPC kohortu, GPU/driver, CSS/DPR/interní rozlišení, kvalitu/kameru/čas/počasí, warmup/délku/opakování a původní raw intervaly. CPU profile actual update/prune se měří odděleně od plain FPS/p95/p99. Nepřidávej umělou zátěž pouze do baseline a neodstraňuj obsah z kandidáta. Měřitelný CPU přínos musí překonat běžnou variabilitu srovnatelných sérií; pouze counter nebo negativní/nejasný výsledek nesmí projít jako výkonové přijetí. Rozsah případného FPS tvrzení musí odpovídat naměřeným datům.

External acceptance řadiče zůstane před přijetím/merge zastavená, dokud koordinátor po posouzení měření a parity nevydá validní receipt pro přesný run/base/commit/source a hashované důkazy. Koordinátor to provede autonomně podle již uděleného zadání; nejde o chybějící otázku na uživatele. Po předložení důkazu resume nesmí opakovat implementaci nebo vytvořit další PR. Done až po merge a skutečné zelené main CI.

## Boundaries & Constraints

**Always:** Controller task: `perf-transit-runtime-controller-20261020`; writePaths: `_bmad/render/bmad-build/autodev-key-53-776f5f92725b-4be13dffb905/`, `_bmad-output/implementation-artifacts/perf-transit-runtime-20261020/`, `docs/agents/handoffs/perf-transit-runtime-controller-20261020.md`. Worker task: `perf-transit-runtime-worker-20261020`; writePaths: `client/transit-renderer.ts`, `tests/transit-pool-pruning.test.ts`. AGENTS.md, task definitions, live claims and docs/agents/bmad-policy.md remain authoritative.

**Never:** add goals, mutate outside assigned scope, or replace frozen intent with assumptions.

**Frozen acceptance:**
- Přesný nový run KEY-53 použije vlastní renderer prefix, jediný plán/implementaci a tři skutečná nezávislá review.
- Runtime se nepřijme pouze podle testů; external gate vyžaduje identitně svázanou praktickou A/B evidence a koordinátorův receipt.
- Po receipt/resume tentýž PR/commit projde chráněným merge a zelenou main CI bez opakovaného workeru.
- Stabilní kohorta NPC nevykonává redundantní pool sweep; vytvoření/odebrání/výměna identity vyvolá jeden sweep po dokončení update.
- Pending úklid přežije přerušený update a nuluje se až po úspěchu; plný dispose, živé materiály/instance, LOD a async completion zachovají chování.
- Bez změny počtu/detailu NPC, tras, fyziky, materiálů a dalších runtime modulů; implementace i cílený refaktoring součástí jediného scope.
- Přesný runtime kandidát zachovává NPC, LOD, materiály a lifecycle. Koordinátor přijme pouze srovnatelné proložené A1/B1/A2/B2/A3/B3 v celé produkční hře/HUD se třemi skutečnými různorodými relacemi a stejnou NPC kohortou, CPU profile odděleným od plain FPS/p95/p99, shodnými podmínkami a úplnými raw důkazy včetně vyloučených/selhaných pokusů. Měřitelný CPU přínos musí překonat variabilitu; counter nebo testy samy nestačí. Parent KEY-5 zůstává otevřený. Před accept/merge je nutný nezávislý externí receipt pro přesné run/base/commit/source a tyto tři úplné evidence balíky.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Prázdná stabilní kohorta | Načtený renderer, prázdný pool a žádní vybraní passengers. | Update nevykoná sweep a nevytvoří rigy. | Stávající guard před načtením a po dispose zůstane zachován. |
| První konstrukce | První update vytvářející jeden nebo více skutečných passenger rigů. | Po dokončení konstrukce a aktualizace všech vybraných NPC proběhne jeden skutečný sweep. | Při přerušení před dokončením zůstane požadavek pending. |
| Stabilní snímky | Stejná vybraná ID; mění se pozice, yaw nebo animace. | Rigy se znovu použijí a další sweep neproběhne. | Nevzniká nová chybová větev ani další kolekce pro sledování identity. |
| LOD a viditelnost | Stejná kohorta přechází near, medium, far, hidden a zpět; mění se opacity. | Přechody nevyvolají sweep; návrat obnoví stejné živé zdroje, materiály a detaily. | Živé materiály a instance nesmějí být uvolněny kvůli odregistrování ze scény. |
| Odstranění jednoho sdílejícího NPC | Dva skutečné rigy sdílejí zdroje; jedno ID přestane být vybrané. | Odstraněný rig se uvolní, proběhne jeden sweep a druhý rig zůstane funkční. | Sweep nesmí zrušit zdroj ani materiál přeživšího vlastníka, včetně far nebo hidden rigu. |
| Poslední odstranění a návrat | Poslední vlastník zmizí a v pozdějším update je znovu vytvořen. | Po odstranění proběhne jeden sweep nepoužitých poolových zdrojů; opětovná konstrukce vytvoří živý rig a provede svůj jeden sweep. | Opětovné vytvoření nesmí použít disposed zdroj nebo materiál. |
| Výměna identity | ID A je nahrazeno ID B při stejném výsledném počtu NPC. | A se uvolní, B se vytvoří a na konci update proběhne jeden sweep. | Rozhodnutí se neopírá pouze o počet passengers. |
| Více mutací | Jeden update odstraní a vytvoří více rigů. | Všechny změny se sloučí do jediného sweepu po dokončení update. | Sweep se nevolá uvnitř jednotlivých mutací. |
| Přerušený update | Po skutečné mutaci rigu update vyhodí výjimku před závěrečným sweepem; další update již členství nemění. | První update sweep nedokončí; následující úspěšný update pending úklid provede jednou. | Výjimka se nepotlačí; pending se nevymaže při vstupu do dalšího update ani před sweepem. |
| Výjimka během sweepu | Skutečný pruneUnused vyhodí výjimku a následný update nemění rigy. | Úklid se znovu pokusí dokončit; pending se vymaže až po úspěchu a další stabilní snímky již nesweepují. | Pending zůstane nastaven i při částečně provedeném prune; bez nového catch nebo rollback mechanismu. |
| Dispose a opožděné loadery | Renderer je disponován s živými či odregistrovanými rigy nebo před dokončením loaderů. | Plný dispose uvolní všechny rigy a pool nezávisle na pending; pozdní dokončení neobnoví runtime objekty a další update nic nevytvoří. | Pozdní bus kontejnery se disponují a pozdě získaný car-pack handle se uvolní podle současných guardů. |

</frozen-after-approval>

## Code Map

Pozorováno: HEAD c3454da45b22ad9726c257d3d481d45f6243ec04, čistý git status a shodné owner/worktree/writePaths obou přidělených rezervací. SHA-256 intentu je 8e14b090b14ddf1ad1a69839124d88e1f4f89d353aee1ddec96b9f463f8b433a; transit-renderer.ts má 7e174d991d075631be034e113f871462679206455a22914da69ade2372bed292. Přidělený adresář specifikace neexistuje, takže není draft frozen blok k převzetí. Primární kód potvrzuje nepodmíněný sweep, jeho alokace, synchronní retain/release a samostatné vlastnictví LOD proxy a oděvů. Node v24.19.0 z této worktree úspěšně resolvuje tsx, TypeScript a Babylon 9.30.0; lokální závislosti byly čitelné. Jde o statickou analýzu, nikoli provedenou runtime reprodukci nebo výkonové měření. Testy, build, integrace ani A/B v této etapě neběžely. Hypotézou zůstává velikost CPU úspory a případný dopad na FPS. Nebyly změněny soubory, claims ani externí služby.

- `client/transit-renderer.ts` — Povolený zápis. TransitRenderer vlastní pool na ř. 66/76; update od ř. 219 odstraňuje a vytváří passenger rigy na ř. 383–397 a nyní bezpodmínečně volá pruneUnused na ř. 428. Pending nastavit před těmito mutacemi a spotřebovat na současném konci update. Zachovat konstruktor, loadSources a dispose od ř. 437. [intent, worker:0, worker:1]
- `tests/transit-pool-pruning.test.ts` — Povolený nový soubor, nyní neexistuje. Obsáhne regresní matici přes skutečnou produkční třídu, Babylon pool, rigy a LOD. Fixture smí izolovat feed a assetové I/O; samotný úklid musí zůstat skutečný. [intent]
- `client/avatar-renderer.ts` — Pouze ke čtení. AvatarPrimitivePool od ř. 199; synchronní materialUsers na ř. 224–236; pruneUnused od ř. 300 iteruje zdroje a materiály a vytváří pole/Sets. createAvatarRig od ř. 337 může během konstrukce také odstranit dočasné části, proto zachovat postkonstrukční sweep. API neměnit. [intent, worker:0, worker:2]
- `client/avatar-skinned.ts` — Pouze ke čtení. Ř. 123–126 synchronně retainují materiál a uvolňují jej při disposal meshe. Odregistrování LOD meshe toto vlastnictví neruší. [intent, worker:1]
- `client/avatar-lod.ts` — Pouze ke čtení. Konstruktor zachovává potomky rigu; update od ř. 397 mění enabled a registraci ve scéně. Far proxy má vlastní počet uživatelů a disposal od ř. 480. Přechody LOD samy nevyžadují sweep primitivního poolu. [intent, worker:1]
- `client/character-materials.ts` — Pouze ke čtení. get vytváří materiály a textury; prune od ř. 191 odstraňuje nepoužité materiály; dispose od ř. 199 uvolňuje také textury. Dokončení textur nepřidává členy do poolu. [intent, worker:1]
- `client/avatar-garments.ts` — Pouze ke čtení. Oděvy mají samostatnou scene cache a synchronní počty uživatelů materiálů; konstrukce nahrazuje některé původní části. Vlastnictví ani cache neměnit. [intent, worker:1, worker:2]
- `shared/transit.ts` — Pouze ke čtení. TransitPassenger a TransitFrame určují vstupy fixture; sampleTransit zůstává produkčním zdrojem. Neměnit výběr, hustotu, opacity, trasy ani kalendář. [intent, worker:2]
- `tests/avatar-lod.test.ts` — Pouze ke čtení a následnému spuštění. Existující NullEngine regrese ověřují skutečné registrace, zachované detaily a přežití sdílených zdrojů. Použít jako vzor lifecycle kontrol. [intent, worker:1]
- `tests/skinned-avatar.test.ts` — Pouze ke čtení a následnému spuštění. Regrese od ř. 397 ověřuje zachování materiálů odpojeného far těla až do zániku posledního vlastníka. Je součástí manifestového checku. [intent, worker:1]
- `tests/game-webgpu-startup.test.ts` — Pouze ke čtení. Existující vzor TypeScript AST/transpileModule a node:vm umožňuje vykonat aktuální produkční kód s izolovaným I/O. Pro nový test zachovat celou třídu TransitRenderer včetně inicializace, konstruktoru a lifecycle. [intent]
- `C:/Users/rezac/.codex/worktrees/ci-main-autonomous-pilot/StrahovCrazyShow/node_modules/@babylonjs/core/Meshes/instancedMesh.pure.js` — Pouze ke čtení; skutečně rozlišená lokální závislost Babylon 9.30.0. dispose na ř. 533 synchronně odstraňuje instanci ze sourceMesh; běžné vypnutí nebo odregistrování instance tento krok neprovádí. [intent, worker:1]

## Tasks & Acceptance

**Execution:**
- [ ] `client/transit-renderer.ts` -- Doplnit jediný lokální pending příznak, nastavit jej před vytvořením nebo odebráním passenger rigu a na současném konci update provést jeden podmíněný sweep; příznak vymazat až po úspěšném návratu. Cíleně upravit pouze tento mechanismus a zachovat úplný dispose i loader guardy. -- Odstraní doložené redundantní iterace a alokace při stabilní kohortě, zachová výměny identity i pending práci po výjimce a nezasáhne společné vlastnictví. (basis: intent)
- [ ] `tests/transit-pool-pruning.test.ts` -- Vytvořit regresní testy všech řádků I/O matice přes aktuální produkční TransitRenderer, skutečný Babylon pool, rigy a LOD. Izolovat pouze feed a assetové I/O; pro počty použít call-through pozorování, pro chyby řízené jednorázové výjimky. Zachovat konstruktor, loadSources, update a dispose ve vykonávaném kódu. -- Samotné počítadlo sweepů neověří lifecycle. Testy musí doložit přežití sdílených zdrojů, poslední uvolnění, návrat, přerušený úklid a pozdní dokončení loaderů. (basis: intent)

**Acceptance Criteria:**
- Given Baseline a kandidát dostávají shodné vstupy plné hry a stejné nastavení kvality., when Proběhne porovnání herního scénáře., then Počet a detail NPC, trasy, fyzika, materiálové parametry, světla a chování ostatních runtime modulů zůstávají shodné. (basis: worker:2)
- Given Existuje kandidát tohoto přesného runu a jeho ověřitelná identita., when Controller provede předepsané review., then Tentýž plán a implementace projdou třemi skutečnými nezávislými review: blind, edge a verification. (basis: controller:0)
- Given Jsou dostupné úplné proložené série A1/B1/A2/B2/A3/B3 z produkční hry s HUD, třemi skutečnými různorodými relacemi, stejnou NPC kohortou, shodnými podmínkami a raw důkazy všech pokusů., when Koordinátor vyhodnotí paritu a oddělené CPU a FPS měření., then Výkonové přijetí vyžaduje CPU přínos přesahující variabilitu sérií; rozsah případného FPS tvrzení odpovídá odděleným plain FPS/p95/p99 výsledkům. (basis: acceptance)
- Given Pro přesný run, base, commit a source chybí validní nezávislý receipt nebo některý úplný hashovaný balík baseline, candidate či comparison., when Controller dosáhne externí přejímky., then External gate zastaví přijetí a merge; testy ani počítadlo sweepů gate nenahradí. (basis: controller:1)
- Given Koordinátor vydal validní receipt pro přesného kandidáta a požadované důkazy., when Controller obnoví běh., then Pokračuje tentýž PR a commit bez opakování workeru; Done nastane až po chráněném merge a skutečné zelené main CI. (basis: controller:2)
- Given Dílčí KEY-53 splnil vlastní přejímku., when Controller uzavře KEY-53., then Nadřazený KEY-5 zůstává otevřený. (basis: acceptance)

## Implementation Notes



## Spec Change Log



## Review Triage Log



## Design Notes

Plán je připraven pro přidělenou implementaci: jeden lokální pending příznak, nastavený před vytvořením nebo odebráním passenger rigu, jeden podmíněný sweep na původním konci update a vynulování až po úspěchu. Nový prázdný pool začíná bez pending práce; první vytvoření NPC ji nastaví. Nevzniká nové veřejné API ani závislost. Worker nemá nevratné změny. [intent, worker:0, worker:1, worker:2] Route zůstává dispatch podle rozhodnutí controlleru; publikaci, externí stav, přejímku a integraci vlastní controller/koordinátor. Keep-full je již rozhodnuto a přesný počet tokenů nebyl měřen. [controller:0, controller:1, controller:2]

**Zvažované varianty:**
- Lokální pending příznak v TransitRenderer: konstantní stav bez dalších kolekcí; zachová okamžik úklidu po změně rigů a nezasáhne sdílené API. Zvoleno. [intent, worker:0, worker:1]
- Lokální příznak pouze uvnitř update: menší životnost stavu, ale přerušený update by ztratil požadavek na úklid. Zamítnuto. [worker:1]
- Porovnávání počtu NPC: levné, ale nerozpozná výměnu identit při stejném počtu. Uchovávání další množiny identit by duplikovalo existující mapu. Zamítnuto. [intent, worker:0]
- Časový throttle: omezuje sweeps, ale prodlužuje retenci nepotřebných prostředků a přidává časový mechanismus. Zamítnuto. [intent]
- Dirty informace uvnitř AvatarPrimitivePool: rozšiřuje společný modul a odpovědnost ostatních uživatelů mimo přidělený rozsah. Zamítnuto. [intent, worker:2]
- Úplné odstranění sweepu by ponechávalo nepoužité zdroje; kalendářní cache řeší jiný mechanismus a přidává DST a navigační provenienci. Obě varianty jsou mimo zvolený cíl. [intent]

**Primární podklady:**
- AGENTS.md; docs/agents/README.md; docs/agents/bmad-policy.md; docs/agents/architecture.md; docs/agents/current-work.md
- docs/agents/tasks/perf-transit-runtime-controller-20261020.json; docs/agents/tasks/perf-transit-runtime-worker-20261020.json
- docs/agents/assignments/perf-transit-runtime-20261020.md; docs/agents/assignments/perf-transit-runtime-20261020.json
- C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.git/agent-coordination/claims.json; git status --short; git worktree list; git rev-parse HEAD
- Inline autorizované step-02-plan.md, spec-template.md a project-authorization.json včetně authorization.bases
- docs/agents/handoffs/fps-transit-cost.md:7; docs/performance/evidence/transit-calendar-20261020/research/decision.md; docs/performance/evidence/transit-calendar-20261020/research/selection.md
- Primární runtime kód a testy uvedené v codeMap; client/avatar-eyes.ts; client/avatar-hair.ts
- Lokální Babylon 9.30.0: instancedMesh.pure.js:533, mesh.pure.js:4319, transformNode.pure.js:1294; package.json; pnpm-lock.yaml; pnpm-workspace.yaml; patches/@babylonjs__core@9.30.0.patch

**Rizika a omezení:**
- Omezení sweepů prokazuje změnu mechanismu, nikoli měřitelný výkonový přínos; ten musí teprve doložit předepsané externí série. [acceptance]
- Fixture musí vykonávat aktuální produkční třídu a skutečný prune, jinak by mohla zakrýt chyby inicializace, pořadí nebo lifecycle. [intent]
- Reset pending před úspěšným sweepem by ztratil úklid po výjimce; porovnání pouze počtu NPC by minulo výměnu identity. Obě chyby vyžadují samostatné regrese. [worker:0, worker:1]

## Verification

**Commands:**
- `node --import tsx --test tests/transit-pool-pruning.test.ts tests/avatar-lod.test.ts tests/skinned-avatar.test.ts` — expected: exit 0; actual results recorded by controller

Přesný runtime kandidát zachovává NPC, LOD, materiály a lifecycle. Koordinátor přijme pouze srovnatelné proložené A1/B1/A2/B2/A3/B3 v celé produkční hře/HUD se třemi skutečnými různorodými relacemi a stejnou NPC kohortou, CPU profile odděleným od plain FPS/p95/p99, shodnými podmínkami a úplnými raw důkazy včetně vyloučených/selhaných pokusů. Měřitelný CPU přínos musí překonat variabilitu; counter nebo testy samy nestačí. Parent KEY-5 zůstává otevřený. Před accept/merge je nutný nezávislý externí receipt pro přesné run/base/commit/source a tyto tři úplné evidence balíky.

## Controller Planning Decisions

Route: dispatch. The assigned controller run includes external Linear progress, Git push, PR publication and project acceptance, plus merge/main CI when merge=true; these are actual assigned external effects, even when worker source changes are small.

Observed worker footprint: `client/transit-renderer.ts`, `tests/transit-pool-pruning.test.ts`. Worker irreversibles: []. New callable/dependency surfaces: [].

Scope: keep-full, decided by the controller under existing single-task authorization; no new user approval is claimed. Retain the single assigned goal and its frozen acceptance. Splitting would change the delegated scope; this is a presentation decision, not new user approval or permission to add goals. Not measured; no exact model-token count is claimed. Keep-full applies regardless of length and accepts the context-length risk.

Authorization SHA256: 36bbbeeb522ee8ad63105bc79380832701b62f3f3ee769e3ba8dbcfeb9068ee3. AGENTS.md and docs/agents/bmad-policy.md require autonomous completion of authorized work; routine format/route decisions do not request another approval. Only unresolved user-visible intent choices are intentGaps. Real missing inputs or runtime prerequisites still block readiness.
