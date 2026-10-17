# WebGPU: pokračování přes projektový BMAD

Koordinátor `webgpu-migration-01a14497-root`, metadatový task `webgpu-bmad-continuation-20261017`, owner `webgpu-migration-01a14497-bmad`. Uživatel17.10 výslovně zadal pokračovat migračními tasky pomocí BMAD; původní úplný cíl KEY-22 se nemění.

## Převzaté podklady a rozhodnutí

Primární checkout má připnuté BMAD6.12.4 s týmovými overrides v commitu `955d13470a8ae5f4c4fb847d6dc07a2348764ce8`. Migrační runtime zůstává v `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, základ `d0a0f98044216638fbfc425999ae5e0dded1bf38`. Jeho existující vlastní změny a rezervace nejsou kvůli zavedení workflow přebírány jiným agentem.

Zvolena jedna navazující specifikace [KEY-31: nepoužité konstanty](../../../_bmad-output/implementation-artifacts/spec-key-31-wgsl-unused-defines-20261017.md). Zachycuje již schválený omezený experiment; nezakládá druhý backlog, sprint ani novou architekturu. Závěrečný výkonový/default rollout je nadále podmíněn úplnou funkční a výkonovou přejímkou v KEY-22/33/34.

## Skutečně provedené kroky

- Načten nový AGENTS, projektová BMAD policy, návod a skill; ostatním živým podagentům byly nové instrukce výslovně předány. Konkrétní implementační/review podagenti další BMAD workflow nespouštějí.
- Před rendererem vytvořena a získána samostatná rezervace jeho cache a přesných následných artefaktů. Runtime scopes zůstávají disjunktní.
- Jediný oficiální příkaz `uv run --no-cache .../_bmad/scripts/render_skill.py --project-root ... --skill .../.agents/skills/bmad-build` uspěl. Načten skutečně vytištěný snapshot `_bmad/render/bmad-build/strahovcrazyshow-26f06f43ac20/a75cc1b44ecfd4495236/workflow.md`; prepend, persistent policy a česká komunikace jsou v renderu přítomné.
- Kroky01/02 vyhodnotily předchozí autorizaci, známé vlastnictví dirty změn, scope a průzkum. Existující uživatelský souhlas nahrazuje opakované schválení stejné práce podle projektové policy.
- Krok03 převzal rozpracovanou implementaci a přesný vlastní diff pěti cest. SHA256 diffu `A4D6A6BCB0197D2877AAE4CC2CCDC5F05871B0C3EA5C8FBB5240EAF24E1D7375`. Žádný cizí dirty/staged obsah nebyl převzat.
- Nezávislé předběžné statické review vrátilo `[]`, bez testů/TS/GPU. Poslední změny profileru po dřívějším31/32 testovém výsledku a1TSdiagnostic ještě vyžadují nové ověření; nehlásí se PASS.
- Katalog primární kopie po přidání tasku validuje165definic. Kontroly odkazu/specu a diffu jsou lehké metadatové kontroly, nikoli přejímka hry.

## Co zůstává otevřené

Uživatel převzal immutable combined-v4 na `http://127.0.0.1:4193/?renderBackend=webgpu`, snapshot `1383fc9296d70d256ead4c6df0ac87892cdcd522426272bc8e7288613266f277`. Jeho dokončení testu zatím nebylo oznámeno. Během tohoto okna zůstávají vypnuté testy, TS, buildy a další GPU práce; zdroje/dist/assets/dependencies/služby4193 se nemění.

Proto specifikace zůstává `in-progress` v kroku03. Testová matice, nový produkční inventář, oprava podle důkazů, kompletní pipeline, přejímka, runtime commity/integrace a default rollout nejsou nahrazeny úspěchem rendereru BMAD. [KEY-31](https://linear.app/gigeconomy/issue/KEY-31/webgpu-odstranit-blokujici-pripravu-pipeline-a-svetelnych-variant) i parent zůstávají otevřené. Navazující chat `01a13624-c16c-7c11-aa35-070e349e0266` se aktivuje až po skutečném dokončení migrace.

Renderer doběhl a nezanechal pomocný proces. Provozní identita živých herních služeb je pouze v lokální cache jejich runtime tasku. Metadatová rezervace BMAD pokračuje kvůli aktualizaci specifikace; administrativní rezervace katalogu se po publikaci uvolní.
