# Předání: global-refactor-bindings-runtime-20261020

- Vlastník: `refactor-01a15658-bindings-runtime`; příjemce: `refactor-01a15658-audit`.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/refactor-20261020`, větev `codex/global-refactor`.
- Výchozí a při předání stále aktuální HEAD: `42fa92a823b4e57936bf9fbf8c0bc82f04bdb95a`.
- Výsledek: přesný minimální runtime binding cleanup implementován a cíleně ověřen. Není přijetím celého KEY-48 ani GPU přejímkou.
- Staging/commit/task/spec/Linear: neprovedeno. Nové testy nebyly přidány.
- Procesy: jen dokončené jednorázové Node/PowerShell kontroly; exec session `44916` skončila exit 0. Žádný vlastní server, port, browser, GPU, Blender ani dlouhožijící proces.
- Rezervace: vlastní claim získán před zápisem, heartbeat obnoven před tímto předáním. Po oznámení příjemci bude uvolněn; skutečný výsledek release je v následné zprávě/CLI.

## Vlastnictví a přesný převzatý WIP

Před claimem byly znovu přečteny task, transfer, živý claims.json, `git status --short` a `git worktree list`; proběhl i CLI status. V žádné z devíti runtime cest nebyla cizí rezervace. Game/UI měl původní vlastník skutečně uvolněné podle koordinačního předání `0a598a6a5db4bb4e81469543c72b96b5d88720ed`; cizí primary checkout WIP nebyl převzat.

Výslovný transfer je `_bmad-output/implementation-artifacts/global-refactor-20261020/bindings-runtime-transfer.json`: sender `refactor-01a15658-audit`, receiver přesně `refactor-01a15658-bindings-runtime`. **Všech devět předávacích SHA-256 odpovídalo souborům před prvním zápisem.** Teprve potom proběhl úspěšný claim s `--adopt-dirty`; CLI převzalo jedinou dirty cestu `client/avatar-renderer.ts`.

Původ avatarového payloadu: `refactor-01a15658-avatar` → koordinátor → tento konkrétní příjemce, podle `docs/agents/handoffs/global-refactor-avatar-20261020.md` a transferu. Výchozí avatar SHA `41d42f0a2b48178575054772948533efc2507c28b5bd11fed190fd437120ff31` zahrnuje již předaný privátní surface kernel/obálky. Tento task z něj odstranil **pouze dva importy**. Předchozí změny `client/assets.ts` a testů student-eyes/student-garments zůstaly nedotčené; nejsou novým příspěvkem tohoto tasku.

Ostatní cizí dokumentační, fixture/Python, quaternion, simulation/benchmark, autodev a testové cleanup změny nebyly převzaty ani upravovány. Pracovní strom zůstává sdílený; toto předání není identita celé hry.

## Přesné soubory a změny

| Soubor | Vlastní minimální edit |
| --- | --- |
| `client/avatar-renderer.ts` | Smazány importy Color3 a Vector3; explicitní side-effect import instancedMesh i typový InstancedMesh zůstaly. |
| `client/car-pack.ts` | Z math.vector importu odstraněn pouze Vector3; Matrix/Quaternion zůstávají. |
| `client/main.tsx` | Smazán nepoužitý default React import; automatické JSX odpovídá existujícímu tsconfig react-jsx. |
| `client/render-incident-profile.ts` | Konstruktor má obyčejný používaný parametr scene místo private readonly parameter property. Tělo konstruktoru, callbacky, now default a observer lifecycle zůstaly. |
| `client/game.ts` | Smazány pouze DynamicTexture, BUILDINGS/B6_BOXES/MAP/BOUNDS/blockNumber/GROUND_RECTS/TREES a typ AvatarConfig z importů; width přejmenováno na _width se stejnou pátou pozicí a defaultem 4. |
| `client/ui.tsx` | Smazán pouze typový Input import. |
| `shared/b6-props.ts` | Smazán pouze import B6_LAYOUT, zůstaly B6_ROOM_AREAS/B6_STAIR_CORES. |
| `shared/netcode.ts` | consume(now,tick) → consume(_now,tick), bez smazání argumentu či změny arity. |
| `shared/photogrammetry-ground.ts` | Smazán pouze import STREET_FEATURES. |
| `docs/agents/handoffs/global-refactor-bindings-runtime-20261020.md` | Toto předání. |

Použité world importy PLACES/SPAWN/CAR_SPAWN/HUNT_POINTS/zoneAt zůstaly. Žádná změna startupu, rendereru, ovládání, geometrie, validace nebo UI logiky. Nepřidána cache ani nový stav. Zrušení nepoužitého scene fieldu není vydáváno za změřené paměťové/FPS zlepšení.

Průzkum a porovnání variant: předchozí pouze čtecí audit všech 53 diagnostik byl ověřen proti nyní předaným bajtům. Volba je odstranit nepotřebné vazby a ponechat používanou evaluaci modulů; nepřepisovat celé importní bloky ani slučovat jiné funkce. Mazání veřejných parametrů by mohlo měnit aritu/kompatibilitu, proto se jen přejmenovávají. Nepoužitý uložený scene field lze odstranit bez ztráty konstruktorového parametru, který tělo dál používá. Další BMAD workflow nebylo spuštěno.

Bare instancedMesh registrace je zachovaná. Math moduly dál načítají mimo jiné CharacterMaterials/avatar-skinned; DynamicTexture zůstává skutečně používán a importován přes world-renderer → architecture-reality. B6/world/streets/netcode moduly mají nadále používané hodnotové importy. Nevznikl pokus nahradit jejich inicializaci novou registrační cestou.

Čtyři hashované kosmetiky zůstaly beze změny: `client/architecture-reality.ts`, `client/b6-reality.ts`, `scripts/export-building-assets.ts`, `shared/landmark-reality.ts`. Závěrečná kontrola ověřila jejich SHA proti výchozímu commitu. Žádné GLB/Blender/source-plan/transit katalogy se kvůli cleanupu neměnily ani neregenerovaly.

## Skutečné ověření 20. 10. 2026

Původní task uváděl neexistující `tests/diagnostics.test.ts`. Před spuštěním byla dohledána skutečná sada `tests/network-diagnostics.test.ts`, která ověřuje consume(now,tick). Koordinátor opravil pouze verification filename v tasku a potvrdil validate PASS; podagent task neměnil.

Skutečný příkaz, přibližně 07:41 UTC:

```text
node --import tsx --test tests/render-incident-profile.test.ts tests/netcode.test.ts tests/network-diagnostics.test.ts tests/input-backlog.test.ts tests/timeline-physics.test.ts tests/b6-reality.test.ts tests/photogrammetry-ground.test.ts tests/realistic-car-pack.test.ts tests/car-webgpu-parity.test.ts tests/student-eyes.test.ts tests/student-garments.test.ts
tests 70; pass 70; fail 0; cancelled 0; skipped 0; todo 0
duration_ms 39686.3727; exit code 0
```

Zahrnuje skutečnou fyziku/predikci/legacy queue, diagnostiku, B6/ground kolize a lifecycle, reálné car GLB/LOD/materiály, avatar surface fit/oděvy a incident observer cleanup. Car WebGPU parity používá NullEngine; **nejde o skutečné GPU měření**.

Další jednorázové kontroly bez persistentních testových souborů:

- **9/9 přesných předávacích hashů MATCH** před claimem.
- **9/9 reverzních hashů MATCH** po implementaci v 07:44:18 UTC: po in-memory vrácení pouze výše vyjmenovaných lexikálních editů je každý soubor bajtově identický předání. Tím je doložena i úplná ochrana převzatého avatarového payloadu.
- Původní a nový skutečný Game.label AST byly samostatně transpilované v lokální funkční VM obálce: obě metody mají `.length === 4`; default zůstává 4 a volání s undefined/0/5.5 dávají stejné label požadavky.
- Původní consume AST a skutečně importovaný nový InputQueue mají `.length === 2`. Vstup s časem 99 a tick 901 správně zachoval ack a lastAppliedTick; následující idle volání neopakovalo skok.
- Čtyři autorovací soubory jsou hashově shodné s `42fa92a8`; side-effect instancedMesh import je stále přítomen.
- `git diff --check --` přesný devítisouborový runtime scope: exit 0.
- `git diff --cached --name-only --` tentýž scope: prázdný výstup; vlastní staging nebyl proveden.

První jednorázový VM audit skončil exit 1 kvůli opakované top-level deklaraci pomocné třídy Subject v samotném checkeru. Nevznikla změna produkčního kódu ani neúspěch cíleného testu. Checker byl uzavřen do samostatných funkčních obálek; opakovaný celý audit skončil exit 0. Původní výstup zůstává v tool transcriptu.

## Manifest předávaného výsledku

Kontrola `2026-10-20T07:44:18.532Z`. Následuje devět runtime souborů a jedenáct použitých testových vstupů; testy podagent neupravoval. Je to inventář po cíleném běhu, **nikoli frozen snapshot celého souběžně měněného checkoutu**. Handoff je vynechán kvůli sebereferenci.

| Soubor | SHA-256 |
| --- | --- |
| `client/avatar-renderer.ts` | `138e041fe2483e90d4dbdd367122851e63f6111c8076bb3144a4be85a50baed0` |
| `client/car-pack.ts` | `b894b9561d64471055e8ad89703ea8a277ac91c8a210ada5609cab4e6f836ef9` |
| `client/main.tsx` | `70deaa689aa1f00134fb02d4df3a50e67daa64ac8694f900a8641fe544f49747` |
| `client/render-incident-profile.ts` | `fe11faffe89879437b6c607aeae25753d025cfda680af2521772cdc232a1a512` |
| `client/game.ts` | `dc0e1adb323e5d5c3b42b3688da0c4b98b20ad6f549f3fda1b4a12e166f2f842` |
| `client/ui.tsx` | `3a008a9cc997c3a9c68b32d351ef17a0872e2532dc42643be9936fae42c284ee` |
| `shared/b6-props.ts` | `0d95981eeaa06d2a1d214d639a9bfd2b34719f63b5c35be419f02804f99344ad` |
| `shared/netcode.ts` | `a17866c5766e63f24d64ddcaca6f08a9033b36052820ad9bd4e97217e39b585a` |
| `shared/photogrammetry-ground.ts` | `d360d07a341535c51c6650258b740497971a08c8cf0d1e200ff32418dc45014a` |
| `tests/render-incident-profile.test.ts` | `3490bb94445eb4ba1f5ec91a2bb4f2cb9762a7a2d1a5e467272b9b4722ebdb7d` |
| `tests/netcode.test.ts` | `3306794c3d323aaa73ea70fd44312cad9d745efdeaf1957d684b718b13bec621` |
| `tests/network-diagnostics.test.ts` | `db65856bae43c7a632228009f14037e9e30ca646e4060603d80fe6d26af2c23a` |
| `tests/input-backlog.test.ts` | `a845c94b17cbc6e9ff196f8b55d754b48d723e53aa62425576272dd4a651d3e1` |
| `tests/timeline-physics.test.ts` | `99becdca298c8e66304a0f1395e4d8fc94fbd63f94319da45cd92c4a02eb6939` |
| `tests/b6-reality.test.ts` | `2b370b069205e1567507be1a8ce6e3530532d545ee7ed66295863fa968a92e76` |
| `tests/photogrammetry-ground.test.ts` | `53a38892989713d500115aee414e362c286fa6c20bcc5b4c0d6323e7794d3e27` |
| `tests/realistic-car-pack.test.ts` | `b4b1845ab942ebcb8e068210eca23ebaa7cc1977f43d678ee5858e46f1fc3ca5` |
| `tests/car-webgpu-parity.test.ts` | `c7d2a3e37c2cad1079e23e8a462b03626c18f0ae58952189b3e8c6e499451346` |
| `tests/student-eyes.test.ts` | `5c021063a7ea6f1466d6ccbc752b5374d2f80d9df645b881e6c8482137a7f92b` |
| `tests/student-garments.test.ts` | `b4b71260f05f21332dd3c5bdf8c758878a0f6198570fedc99368a5b16dc1a394` |

SHA-256 seznamu `cesta mezera SHA LF` v uvedeném pořadí: `3838d3f5da6fa6c65402e3dcb5b0c40f523b762b194017df59b4559c138df8de`.

## Omezení a převzetí

Neběžela plná sada, build/celková typová kontrola, integrace, GPU ani prohlížečová přejímka; patří následnému stabilnímu checkpointu koordinátora. Automatické JSX je podložené existující konfigurací, tento task netvrdí nově provedený build. Žádná změna assetů, licence, provenience nebo veřejného síťového protokolu.

Příjemce `refactor-01a15658-audit` přebírá přesně uvedené soubory/hashi včetně doloženého avatarového payloadu a vlastního dvouimportového doplnění. Samostatné review, commit/integraci a aktualizaci tasku/Linear provádí koordinátor po převzetí. Release sám neznamená přijetí nebo Done.
