# Předání: stabilize-light-variants-20261015

- Vlastník `key3-light-variants-20261015` (`/root/flashlight_wip_and_regressions`), příjemce `/root`.
- Pracovní kopie `C:/Users/rezac/.codex/worktrees/key17-ownership-integration/StrahovCrazyShow`, detached metadata HEAD `2c7aec924c7f24f2f129c1c4343305c2d9fbffcc`. Vstupní runtime/test overlay odpovídá publikovanému main `a8edf56`, Game runtime pochází z `e1b03fe`. Metadata HEAD není identita této předané source sady.
- Výsledek: integrovatelný kandidát stabilního pořadí již vybraných světel a ochrany materiálového capu před doloženou glTF inflací. **Nejde o uzavření KEY-3 ani tvrzení o zlepšení GPU výkonu.** Produkční A/B vlastní root.

## Předání vlastnictví a přesné změny

Root výslovně předal vlastní publikovaný `client/game.ts` overlay a přesné historické WIP soubory `client/stable-light-state.ts`, `client/gltf-light-budget.ts`, `tests/stable-light-state.test.ts`, `tests/gltf-light-budget.test.ts`. Původ doložen v main handoffech `repair-light-lifecycle.md` a `repair-gltf-light-budget.md`, novější glTF fastpath verze. Claim získán s `--adopt-dirty` pro jediný již změněný Game overlay. Čtyři přebírané soubory byly překopírovány pouze do vlastní WT, jejich SHA zůstává totožné s předaným WIP. Původní main WIP, cizí rozpracované soubory, frozen preview4188 a jeho node_modules nebyly měněné.

Změněné/přidané cesty:

- `client/game.ts`: +15/-1 vůči uloženému vstupu; importy, dva povinné scene-owned controllery, vytvoření okamžitě po `new Scene`, kanonizace před preload i herním renderem a disposal před scénou i jejími controllery.
- Čtyři výše uvedené helper/test soubory, beze změny vůči převzatým hashům.
- `tests/game-light-lifecycle.test.ts`: čtyři nové regrese skutečných Game lifecycle bloků.
- Tento handoff a `.cache/night-light-feature/` s původní Game, samostatnou order-only Game, logy a manifestem.

## Výzkum, volba a refaktoring

Rozhodnutí před implementací: `docs/performance/research-20261015/night-flashlight.md`. Primární zdroj je instalovaný Babylon9.30.0: `Light`, `AbstractMesh`, `PrepareDefinesForLights`, `BindLights`, glTF loader, Standard/PBR hot swapping, shadow target collector. Main neměl ani jeden controller; starý wave3 je jiný checkpoint.

Změna zachovává počet a množinu přispívajících světel, intenzity, barvy, geometrii, světelný rozpočet a vypínání svítilny/stínů. Stabilizace odmítá truncated, frozen, unknown/custom a nebezpečné MultiMaterial případy. Pořadí závisí na aktuálním shaderovém podpisu, ne historii přepínání. glTF guard chrání vlastní explicitní cap, cross-scene a concurrent lifecycle a neodhaduje neznámý již zvýšený cap.

Převzatý cílený refaktoring je zachovaný: dvě opakovaně používané mapy a bounded fronta/observery v `StableLightState`; nový glTF fastpath prochází materiály jen při skutečné změně, aktivním loaderu nebo odložené opravě. Klidový frame neprovádí plný material/mesh sweep. Nevznikl druhý stav požadovaného osvětlení ani další scéna. Dva explicitní render hooky zůstaly na skutečných lifecycle hranicích, aby se do feature nepřenesl jiný startup/render refaktor.

## Ověření 16. 10. 2026 kolem 00:12 Europe/Prague

GPU baseline root dokončil a browser zavřel před povolením těchto lehkých CPU testů.

1. RED: `GAME_LIGHT_SOURCE=.cache/night-light-feature/game.before.ts pnpm exec tsx --test tests/game-light-lifecycle.test.ts` — očekávaný exit1, **0/4**. Všechny testy selhávají na chybějícím konstrukčním zapojení; nejde o import/missing-file chybu. Log `game-red.log`.
2. GREEN: `pnpm exec tsx --test tests/game-light-lifecycle.test.ts tests/stable-light-state.test.ts tests/gltf-light-budget.test.ts tests/flashlight.test.ts tests/vehicle-lighting.test.ts tests/art-lighting-budget.test.ts tests/art-lighting-maintenance.test.ts tests/night-lighting.test.ts` — exit0, **52/52**, 13,84 s. Log `targeted.log`.
3. Prettier pouze nového `tests/game-light-lifecycle.test.ts`; následně jeho čtyři testy znovu exit0, **4/4**, log `game-green.log`.
4. `git diff --check -- client/game.ts` — exit0. Úzký diff se porovnával také přímo s uloženým `game.before.ts`, nikoli se zastaralým detached HEAD.

Mechanism regrese používají skutečný Babylon: před stabilizací prokáží rozdílné Standard/PBR defines při stejných přispívajících světlech; bez guardu skutečný glTF přepíše cap4→43. Pokryté jsou cap/own/frozen/READY/concurrent/cross-scene případy, nulová klidová režie průchodů, OFF bez light slotu a bez shadow passu, mapy128/256/512, auto low bez stínů, noční B6/celestial/street budget a odstranění observerů. Nové Game testy přímo extrahují produkční lifecycle bloky, nahrazují jen browser/render IO a používají reálné controllery a Babylon objekty. Nejde o screenshot ani GPU důkaz.

## Otisky předané sady

Manifest `.cache/night-light-feature/manifest.json`, scope sourceId `f66a8daa578f7e4eed6844a22974f1c7dfe51abe6c3740c9037797ba6807ae61` zahrnuje šest zdrojových/testovacích souborů. Nejde o hash celé hry.

| Soubor | SHA-256 |
|---|---|
| client/game.ts | 9b0b03f5b671f8d7a388ec538758e4890f52e23f29c8271df151605b601d69f7 |
| client/stable-light-state.ts | 4adfb37dae15ca6a0b9e1b65634266b6791ffc1d8c1aca01858a9557c7f7b8bc |
| client/gltf-light-budget.ts | 909d69632a7fe955c7cbdaa3e264aa032bc9198f5e0ed9feca9bcdcaa24248aa |
| tests/stable-light-state.test.ts | da9fdb75827d310ff408f05dc0c0bc3a84556ee2b88c9630269def3576ab181b |
| tests/gltf-light-budget.test.ts | db8ba5e162dbebf14189de2b03178b5fbe02b678c94eb0f00e42606207e98136 |
| tests/game-light-lifecycle.test.ts | 03f12f83491f29d782a839aa8ed08e497eb4a240f2b09a138fc0c21808f82f3a |

Pro oddělené logické commity je připravená `.cache/night-light-feature/game.order-only.ts`: proti `game.before.ts` obsahuje pouze stable ordering; aktuální Game navíc glTF guard. Nový Game lifecycle test ověřuje obě části společně, takže jej přidat až s druhou částí.

## Zbývající práce integrátora

Root převezme přesný diff, upraví svou explicitní fixture v `tests/game-diagnostics.test.ts`: `stableLights: { update() {}, dispose() {} }` a `gltfLightBudget: { dispose() {} }`. Povinné runtime controllery nebyly udělané nepovinnými kvůli staré fixture. Ostatní nalezené Object.create Game testy nespouštějí celý render/dispose.

Root drží heavy/GPU a provede celou sadu, typy/build, odpovídající integraci a srovnatelné produkční A/B. Při prvním zavedení jiné posloupnosti shaderových slotů zůstává potřeba skutečné vizuální kontroly hot-swapping/chybějících či červených ploch. Žádná globální změna hot swapping nebyla přidána. Cold SPOT/SHADOW varianty a případný first-F addLight náklad zůstávají další měřitelné příčiny; tento kandidát sám neopravňuje označit všechny sekundové záseky za vyřešené.

Všechny vlastní test procesy skončily, žádný server/port/GPU/full build/instalace závislostí nebo commit nebyl spuštěn. Po předání následuje uvolnění `stabilize-light-variants-20261015`; příjemce vlastní výše uvedené změny, nejsou volný nepřevzatý WIP. Stav tasku, společnou verification a Linear mění root.
