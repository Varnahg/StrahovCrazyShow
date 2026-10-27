---
title: 'KEY-62: realistické stromy a koordinovaná roční období'
type: 'feature'
created: '2026-10-25'
status: 'in-progress'
route: 'dispatch'
baseline_commit: '8516c7b1877ec66c37120d9088264d44c52882f1'
review_loop_iteration: 0
context:
  - '{project-root}/docs/trees/20261025/research.md'
  - '{project-root}/docs/trees/20261025/decision.md'
  - '{project-root}/docs/agents/bmad-policy.md'
---

<frozen-after-approval reason="Výslovně objednaná realizace STROMY-20261025 a následné přímé upřesnění uživatele; běžné vratné kroky nevyžadují nové potvrzení">

## Záměr

Stromy mají působit přirozeně: věrohodná kostra, nepravidelná koruna s mezerami, drobné listy na větévkách, kvalitní kůra a soudržné sezónní změny. **Realističnost má přednost před dokonalou kopií fotografie.** Zachovat doložené polohy a přibližný charakter/rozměry; přesný druh uvádět jen s důkazem. Dodat fungující integrovanou hru, nikoli jen návrh.

## Hranice

Výzkum a označený koncept před modelováním; varianty podle skutečného vzhledu a měření. Nové velké výstupy naD. Hrané4179/2592 i servery neměnné. Všechny změny v rezervovaných disjunktních úkolech, bez cizího WIP a nákupu placených služeb. GPU pouze Edge/GTX1060, jediná scéna; uživatel souhlasil s přepnutím karty při testování. Ve hře pouze pevné statické kamery, žádné WASD/chůze/jízda. Původní CAD/fotografie zůstávají mimo Git.

Sezóny používají datum hry jako regionální model, ne dnešní botanické měření. Náhledy jsou DEMO a nemění data stanice. Zahrnout rašení, hustotu/vybarvení/opad, holou zimní kostru listnáčů, zachované jehličí evergreenů a omezený opad na terénu. Nepřidávat neprokázané stromy či sníh jen proto, že je zima.

## Vstupy a hraniční stavy

| Stav | Očekávání |
|---|---|
| Běžné UTC datum | Stejný instant pro astronomii a sezónní model; nezávislost na délce relace |
| Jaro/léto/podzim/zima | Sladěná fáze stromu, opadu a souvisejících květů; evergreen neztratí celou korunu |
| Přepnutí kvality nebo pozdní LOD | Zachová kořen, fázi a přítomnost listí; v zimě se listy nevrátí pozdním načtením |
| Vadný asset/dispose během loadu | Žádný částečný osiřelý mesh, závod či nekonečný retry; doložená fallback politika |

</frozen-after-approval>

## Mapa kódu

- `shared/vegetation.ts`, `shared/data/tree-reconstruction.json`:110 identit, polohy a odhadnuté rozměry; nevydávat odhady za zaměření.
- `scripts/tree-pack-blender.py`, `tree-runtime-pack.mjs`: dosavadní větvení a GLB/chunk export.80% listových skupin se odděluje od větví; nový pilot mimo legacy výstupy.
- `client/vegetation.ts`, `tree-appearance.ts`, `tree-wind.ts`: LOD/streaming, shared PBR a shadow wrapper. Zachovat terrain/grass opravy, zlepšit vlastnictví importů; nepoužívat material.alpha pro opad.
- `client/game.ts`, `lighting-preview.ts`, `ui.tsx`: UTC a označené preview; současné terrain-review poskytuje základ pevných kamer.
- `shared/ground-cover.ts`, `client/ground-flowers.ts`: společné výluky/rozmanitost a květy, s nimiž musí sezónní změna souhlasit.

## Úkoly a přejímka

- [ ] `scripts/import-tree-materials.mjs`, `tree-leaf-components.py`, source/runtime mapy a manifesty: originální CC0 fotografické listy/větvičky, přesné UV komponenty a měřítko, licence/hash/akvizice.
- [ ] `scripts/trees-20261025/`, editovatelné seasonal `.blend` a nové runtime modely: stejný malý listnatý/conifer pilot vlastního generátoru a připnutého MTree, holá i olistěná kostra, třiLOD. Výběr před hromadným exportem.
- [ ] `shared/tree-season.ts`, `shared/data/tree-phenology.json`, `client/season-preview.ts`: dokumentovaný regionální model a čisté testy skupin, přestupnosti, ročního přechodu a preview.
- [ ] `shared/tree-asset-types.ts`, `client/tree-renderer.ts`, `tree-season-material.ts`, `tree-litter.ts` a existující vegetace: sdílené prototypy při zachování identit, konzistentní wood/foliage LOD, skutečný výběr celých listových komponent, omezený opad, cache/abort/cleanup.
- [ ] `client/game.ts`, `ui.tsx`, `terrain-review.ts`, `shared/local-benchmark.ts`: společný instant, označené náhledy a fixní korunní kamery. Přidat jen potřebná integrační data.
- [ ] Cílené testy, refaktoring, nezávislé review, neměnný test/build/integrace a statické GPU srovnání; samostatné commity a přijetí do main.

Je-li strom bez listů, při zimním stavu zůstane věrohodně čitelná napojená kostra. Jsou-li listy přítomné, po přepnutíLOD nezmění kořen ani anatomické rozmístění. Je-li scene disposed během fetch, po dokončení nevznikne nový vlastník. Je-li roční období změněné, všechny příslušné komponenty i shadow pass souhlasí a evergreen zůstane zelený. Je-li výsledek hodnocený, má skutečný source hash, GPU, CSS/interní rozlišení, p95/p99 a limity; počet trojúhelníků sám není FPS důkaz.

## Implementační poznámky

Koncept je hotový před implementací; viz `docs/trees/20261025/concepts.md`. Čtecí výzkum proběhl ve třech disjunktních větvích. Žádný nevratný krok či chybějící lidská preference neblokuje pilot. GPU okno již uživatel povolil.

## Záznam změn specifikace

27. 10. 2026: uživatel výslovně přebírá veškeré herní testování a zakazuje agentovi spouštět hru. Agent dokončí WebGPU s WebGL2 fallbackem, sezóny/textury a začlení výsledek do main; může provést statickou kontrolu a izolované ověření bez hry. Nový pokyn nahrazuje starší požadavek povinné GPU přejímky agentem i zákaz automatického kompatibilního fallbacku. Vizuální kvalita a FPS se nesmějí prohlásit za ověřené bez měření. Vedlejší konkrétní úkol je zjistit příčinu nedoručování feedbacku do Linearu; vlastní tasky oddělují soukromou diagnostiku a serverové zapojení. Starý frozen blok zůstává historickou specifikací, tento explicitní pozdější pokyn má přednost.

26. 10. 2026: uživatel znovu výslovně určil WebGPU jako cílový výchozí backend. Doplněna úzká změna factory a explicitní kompatibilní WebGL2 volba po chybě. Praktické ověření musí odstranit doložený timeout current-on, nikoli obejít přípravné kontroly. Cílené regrese a GPU důkazy se evidují odděleně od dokončení stromů.

## Záznam review

## Ověření

Cílené CPU testy při vývoji; `pnpm test`, `pnpm build`, izolovaný `pnpm test:integration` nad stabilním snapshotem včetně testů. Shaderové GLSL/WGSL a skutečný receiver/caster kontrakt. Statické reference kolem B6 a dalších reprezentativních bloků, čtyři roční období, low/medium/high a cold/warm LOD. Hromadné modely až po přijetí malého pilotu. Hrané kopie a primární C checkout zůstávají beze změny.
