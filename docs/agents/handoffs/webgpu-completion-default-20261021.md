# Předání: webgpu-completion-default-20261021

- Vlastník: webgpu-completion-01a15a3e-default; příjemce: webgpu-completion-01a15a3e-root.
- Pracovní kopie: C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/player-feedback-20261020; větev codex/webgpu-completion-20261021; výchozí HEAD bf71359073f8c7b038f04edfaac6dd84650acd7e, runtime základ main9341bcef.
- Výsledek: lokální kandidát společné backend policy hry i editoru. Bez query, s nesouvisející query nebo explicitním renderBackend=webgpu vybírá nativní WebGPU CM na každém hostname. Explicitní webgl2 reference a webgpu-fast NCM vyžadují přesný localhost,127.0.0.1,::1 nebo [::1] (case-insensitive). Prázdná, neznámá i opakovaná volba zůstává chybou.
- Změněné soubory: client/render-engine.ts; tests/render-engine.test.ts; docs/agents/handoffs/webgpu-completion-default-20261021.md. Bez stagingu nebo commitu; převzetí provede integrátor.
- Cizí změny při startu: untracked specifikace, measurement handoff, measurement/, research/presentation-variant.mjs a validation/ z úloh koordinátora/ostatních agentů. Nebyly převzaty ani měněny. Aktuální dirty strom není společný testovaný checkpoint.

## Podklady a volba

Načteny aktuální AGENTS.md, bmad-policy, architecture, koordinace, current-work, task JSON a spec-key-22-webgpu-completion.md včetně kontextu webgpu-migration.md. Předcházející čtecí audit našel jediné místo tvorby engine: createGameEngine sdílené Game UI i avatar preview. Game přebírá připravený engine; není důvod přidávat další factory nebo fallback.

Zachovat WebGL2 default by nesplnilo zadání. Automatické WebGL2 při nedostupném WebGPU odporuje explicitnímu kontraktu. Zvolený CM využívá stávající native WGSL a startup async pipeline přípravu. NCM zůstává místním experimentem: jeho přípravný adapter je inert a přínos bundle reuse potřebuje vlastní skutečné měření. Primární zdroj: https://doc.babylonjs.com/setup/support/webGPU/webGPUOptimization/webGPUNonCompatibilityMode/ a instalované Babylon 9.30 zdroje; ověřeno při čtecím průzkumu21Oct2026. Volba CM není tvrzením o vyšším FPS.

## Refaktoring a dopady

Selektor má stále jeden validační a jeden hostname guard. Guard nyní vymezuje obě referenční/experimentální volby proti jedinému produkčnímu backendu; komentář a chyba odpovídají skutečnému kontraktu. Nevzniká druhá policy pro editor. Inicializace, native shader guard, abort race, partial/late cleanup a vlastnictví zdrojů zůstaly bajtově beze změny mimo selektorový komentář a podmínky. Bez nové cache, engine instance, frame smyčky nebo alokací v herním hot path. Lokální výběr backendu nepředstavuje změnu geometrie, kvality nebo vzhledu.

## Skutečně provedené ověření

Příkaz spuštěn21Oct2026 přibližně08:48UTC:

    pnpm --config.verify-deps-before-run=false exec tsx --test tests/render-engine.test.ts tests/avatar-preview-webgpu.test.ts tests/render-startup.test.ts

Exit0;60testů,60PASS,0FAIL,0SKIP,0CANCELLED,0TODO; runner duration4239.9144ms. Původní stdout je ve výstupu nástroje tohoto předání; další log soubor nebyl v tasku vyhrazen. Testy zahrnují produkční/no-query i explicitní volbu, lokální IPv4/IPv6 a case variantu, odmítnutí hostname suffix triků, prázdné/neznámé/duplicitní volby, propojení defaultu s CM inicializací bez reference engine, původní cancellation/failure/no-fallback/disposal a skutečné preview/startup kontrolní funkce. Fixture engine/device nenahrazují GPU přejímku. Babylon constructor test na CPU správně vypisuje WebGPU unsupported; nativní zařízení neotevírá.

Git diff --check pro oba změněné kódové soubory: exit0. Zkontrolován přesný diff:48insertions/26deletions ve2souborech; původní LF zachováno. Žádná změna Game/UI, readiness, časů ani scheduleru.

## Identita kandidáta

Manifest obsahuje právě zdroj a test, pořadí je následující. SHA256 UTF-8 kompaktního JSON pole těchto objektů: 5e6ae54915f7ddcc54dd593c87284bba0896fcb92685b21fa76ef08fdf101f40.

```json
[
  {
    "path": "client/render-engine.ts",
    "bytes": 8311,
    "sha256": "d7d2ff94ba1cd628817cdae2e748c7f59a60f3f0af5199ae120b50db1ef97858"
  },
  {
    "path": "tests/render-engine.test.ts",
    "bytes": 8523,
    "sha256": "b14dbb4f3916d77fb49924f54051c70e40be5372648b5041bfbb2657fd2f367d"
  }
]
```

## Procesy, rezervace a omezení

Pouze ukončený cílený CPU příkaz v uvedené pracovní kopii, bez serveru/portu/build/GPU/fullsuite a bez vlastních pomocných procesů. Task nemá procesní resources. Claim bude po tomto předání uvolněn příkazem release; úspěšné uvolnění je doloženo výstupem nástroje. Release neoznačuje KEY22 ani GPU přejímku Done.

Root musí přijmout skutečný neměnný build editoru i celé hry, startup bez timeoutu a správný obraz/výkon včetně požadovaných relací; potom fulltest/build/izolovanou integraci a exact-head/main CI. Předchozí preflighty prokázaly řízený timeout a1Hz rawRAF také ve WebGL2; tento task jeho příčinu ani řešení netvrdí. Výchozí policy se smí publikovat teprve po přejímce, jak výslovně stanovuje task a specifikace.

Integrátor: zatím nepřevzato; stav tasku a společné doklady upraví koordinátor po vlastní kontrole.
