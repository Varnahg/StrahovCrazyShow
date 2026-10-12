# Předání: building-b4-material

- Vlastník: `buildings-01a12b28-pipeline`; příjemce: root chatu `01a12b28-f5be-74b0-868c-6c1b0d667685`.
- Worktree: `C:/Users/rezac/.codex/worktrees/visual-quality-jump/StrahovCrazyShow`, větev `codex/building-models`, výchozí HEAD `142ce23`.
- Výsledek: implementace a cílené CPU ověření dokončené, připravené pro archivní návaznost. GPU vzhled zatím není přijatý.

## Soubory a kontrakt

Nový `client/b4-panel-material.ts` vytváří pouze šedý B4 materiál jako PBR. Čte neutrální odstín z existujícího plánu, provádí `toLinearSpace(true)`, metallic 0, roughness 0.84, environment intensity 0.7. Nemá autorské textury, emisi ani vlastní světlo. Zdrojový odstín je výtvarná interpretace fotografie, složení obkladu zůstává neznámé. Roughness a přesná lineární barva odpovídají oběma existujícím Blender-native GLB panelům.

`client/architecture-reality.ts` používá továrnu a obecný Material typ pro Batch/mapy. Near/far sdílí stejný materiál. Nezměnila se žádná funkce skládající vertexy, normály, UV nebo indexy. Žádný pozorovatel, cache ani výpočet za snímek nepřibyl. Babylonův interní BRDF lookup je sdílený a vlastněný scénou, nikoli nová mapa panelu.

Testy: nový `tests/b4-panel-material.test.ts`, změněné `tests/b4-facade-rendering.test.ts` a `tests/architecture-reality.test.ts`. Poslední soubor byl přidán do rezervace koordinátorem po uvolnění a novém převzetí vlastního WIP. Headless test výslovně povoluje pouze sdílenou interní `data:EnvironmentBRDFTexture…` LUT; ostatní scene textury a autorské material slots dál zakazuje.

Evidence: `docs/reality-pack/b4-material-20261012/`. Jiné rozpracované soubory, primární main, původní fotografie/diagnostika B1, společný plán, native kity, exportéry a globální světlo se neměnily.

## Aktuální důkazy

- `node node_modules/tsx/dist/cli.mjs --test tests/b4-panel-material.test.ts tests/b4-facade-rendering.test.ts tests/architecture-reality.test.ts`: **10/10 PASS**, exit 0; `final-tests.log`.
- `node node_modules/typescript/bin/tsc --noEmit`: exit 0; `types.log`.
- `git diff --check` vlastněných runtime/testů: exit 0.
- Geometrické hashe **všech 120 budov**, včetně B4 near/far, jsou shodné před/po. Kontrola zahrnuje position/normal/UV/color/index a názvy meshů/materiálů. Materiálová třída a odezva jsou záměrně měněné; nejde o hash jejich vlastností. `geometry-comparison.json` odkazuje na celé before/after manifesty.
- Native GLB barevné faktory a roughness kontrolovány skutečným čtením obou existujících binárních souborů. Native plán/kity nebyly upraveny.

První běh 8/10 je zachovaný v `first-tests.log`. Selhaly dvě testové domněnky: LUT má alias s prefixem `data:` a číselným suffixem; Babylonova přesná sRGB funkce se kvůli zaokrouhleným konstantám liší od nezávislého vzorce asi o 4e-10. Opravily se jen testy podle skutečného enginu; tolerance 1e-8 nadále odliší nesprávnou gamma-2.2 konverzi.

Kompletní hashe zdrojů i testů: `docs/reality-pack/b4-material-20261012/result.json`. Továrna SHA `c8171233109b5096d232fbdd484c56faba2a620b6b7442fe8edd7251738d865a`; architektura `9e1c55065a1bfb32afffbd1e884e6c1126b962f5bfe951e7ba65cc516c4005e6`.

## Procesy, převzetí a zbývající práce

Všechny krátké testovací/typecheck/NullEngine auditní procesy skončily. Tento task nespustil Blender, build, síťový server ani GPU scénu; žádný vlastní proces neběží. Claim se po předání uvolňuje.

Root musí přidat nový material factory soubor do `sourceFiles` archivního exportéru, obnovit kombinovaný B4 archiv a ověřit další produkční snapshot. Při GPU A/B zachovat kameru z `b4-north-day-before-material-full.json`, denní okamžik, rozlišení a weather fixture. Samotná změna shaderu a CPU PASS zatím nejsou důkaz světlejší fotografie ani lepších FPS. Integrátor zapisuje přijetí do společného verification a mění stav tasku.
