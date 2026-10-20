# Dokumentace StrahovCrazyShow

Pro spuštění a ovládání začni v [českém návodu](../README.cs.md) nebo [English guide](../README.md). Tento rozcestník vede k udržovaným návodům a původním podkladům; datované checkpointy nejsou popisem právě běžícího buildu.

| Potřebuji | Kde začít |
| --- | --- |
| Nasadit jedno demo | [Docker, konfigurace a HTTPS](deployment/docker.md) |
| Zjistit rozsah a co zbývá přijmout | [Přejímka](acceptance.md), [výsledky a známá omezení](verification.md) |
| Orientovat se v kódu | [Mapa architektury](agents/architecture.md) |
| Bezpečně změnit projekt | [AGENTS.md](../AGENTS.md), [rezervace a předání](agents/README.md), [BMAD policy](agents/bmad-policy.md) |
| Integrovat změnu / použít řadič | [CI](agents/ci.md), [autodev](agents/bmad-controller.md) |
| Měřit celou hru | [Výkonová metodika a evidence](performance/README.md), [WebGPU QA](performance/webgpu-migration.md) |
| Ověřit předlohu areálu | [Reality Pack](reality-pack/README.md), [architektonické zdroje a atlas](world-architecture/README.md), [review modelů/terénu](model-review/README.md) |
| Dohledat modely a licence | [Samostatné budovy](reality-pack/separate-assets/README.md), [modely](../public/models/README.md), [prostředí](models/README.md) |
| Dohledat postavy, vozidla a přírodu | [Oděvy/postavy](characters/student-garments/README.md), [vozidla](vehicles/README.md), [stromy](vegetation/realistic-pack.md), [PID a simulovaní NPC](transit/README.md) |

[Ověření](verification.md) zachovává historické zdrojové identity, výsledky, neúspěšné pokusy a odkazy na raw data. Živý stav práce a vlastníků určují tasky a koordinační registr; [current-work.md](agents/current-work.md) je historický bootstrap inventář z 12. 10. 2026.
