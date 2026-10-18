# Předání: webgpu-light-define-history-proof-20261018

- Vlastník `webgpu-light-history-01a14497`, příjemce root; WT `C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow`, větev `codex/webgpu-migration`, claim base `655f937`.
- Dokončený omezený CPU proof. Zápisy pouze tento handoff a `.cache/webgpu-migration-checks/light-define-history-proof-20261018/`. Žádný produkční patch, změna dependency, cache, další BMAD workflow ani commit. Cizí WIP/prototypy/hraný build zachované.
- Readonly vstupy: pinned Babylon9.30/dependencies-v5 a frozen day-zero-v3 `0e15522126720f08e892de60685df25f5d20c313c562c952151de7d94d9f964a`. Přímé imports, žádná kopie projektu či GLB.

## Výsledek

Na stejném materiálu, meshi a submesh objektu, ve stejném camera pass, při stejném cap4/receiveShadows/texture/alpha/instancing stavu je historie prokázaná u všech4cest:

| Cesta | První day0OFF Effect | Pozdější DayOFF Effect | Rozdíl plných defines |
|---|---:|---:|---|
| PBR opaque | 6 | 26 | jen LIGHT_FALLOFF_STANDARD2 |
| Standard opaque | 7 | 27 | jen LIGHT_FALLOFF_STANDARD2 |
| PBR alpha-test regular instance | 8 | 28 | jen LIGHT_FALLOFF_STANDARD2 |
| Standard alpha-test regular instance | 9 | 29 | jen LIGHT_FALLOFF_STANDARD2 |

Sekvence je `night2ON → day0OFF → day0ON → day1OFF/ON → B6OFF/ON → restore-night1OFF → runtimeDayOFF → runtimeDayON`. Light enabled states odpovídají doloženým typovým kombinacím; actual StableLightState stanoví jejich pořadí. PBR/Standard readiness, PrepareDefinesForLights, Effect creation a Scene.render jsou skutečné. Obyčejné meshes a regular instances jsou skutečně vykreslené; nepoužívá se falešné Effect/material ready.

Mechanismus: pinned `materialHelper.functions.js:672–701` při poklesu počtu světel nečistí neaktivní `LIGHT_FALLOFF_*`. Ve slotu2 po night2ON zůstane POINT/standard falloff, ale první day0OFF používá pouze DIR+HEMI. Následné day0ON aktivuje slot2 jako HEMI a jeho falloff vyčistí přes původní `PrepareDefinesForLight:870–884`. Pozdější DayOFF má stejné aktivní světlo, ale jiný celý defines string. Native WebGPU createEffect používá plné defines v cache klíči (`webgpuEngine.pure.js:1504–1523`), takže tento rozdíl má skutečnou cache-key relevanci; CPU proof nezměřil jeho GPU cenu.

## Izolovaný counterfactual

Teprve po úspěšné baseline reprodukci běží nová samostatná CPU scéna. Instance wrapper původní metody `material.isReadyForSubMesh` při light-dirty odstraní pouze existující true falloff příznaky slotů od skutečného aktivního count do limitu. Následuje beze změny původní Babylon readiness/helper/Effect creation. Není to shipping implementace ani patch dependency.

V této variantě mají první i pozdější DayOFF shodné plné defines a stejné Effect IDs: PBR34, Standard35, PBR-instance36, Standard-instance37. Zaznamenaná změna je přesně jednou `LIGHT_FALLOFF_STANDARD2` na každý materiál při prvním day0OFF. U všech40porovnaných stage/material řádků jsou aktivní defines, ordered light type/falloff/shadow/filter/priority, cap, alpha, instancing, receiveShadows a texture-defining metadata shodné proti baseline. Celkem80skutečných main draw captures v obou scénách.

## Ověření, refaktoring a limity

- `TSX_DISABLE_CACHE=1 node --import tsx probe.ts`, finální `probe-final.log`, exit0. UTC18.10.01:28:08.205–01:28:08.599. Předchozí `probe-initial.log` byl také PASS; finální běh navíc pevně ověřuje submesh objekt, alpha/instance větev a aktivní/texture fingerprint.
- Probe sjednocuje konstrukci/capture/cleanup pro oba oddělené běhy; reprezentativní materiály nejsou znovu vytvořené mezi jejich etapami. Plné defines, flag tabulky, identity, skutečný pass/draw a každé counterfactual čištění jsou v `report.json`.
- Native NullEngine GLSL frontend, skutečná instance capability zapnutá pro CPU. Alpha textury používají native NullEngine dummy URL uploader. Raw upload adapter není potřeba. Requested PCF přechází na podporovaný POISSON; neprokazuje se WGSL, GPU pipeline, obraz nebo výkon. IBL texture není přítomná a zůstává stejná po celou sekvenci.
- Fixtures jsou výslovně reprezentativní PBR/Standard, ne přesná car reprodukce. Tímto se nepřipisuje všech31produkčních Day příprav jedné příčině. V produkčním exportu zůstávají chybějící per-stage full-defines/submesh vazby a jen7unused-derived repeats z62modulů. Další IBL/plugin/material/LOD rozdíly nejsou tímto proofem vyloučené.
- Root může nyní rozhodnout mezi odstraněním historie v přesně vymezeném helper kontraktu a menší dočasnou změnou pořadí/finální skutečnou přípravou po ustálení flagů. Tento task žádnou produkční variantu nevybral. Případná oprava potřebuje fallback/unsupported/frozen/lifecycle regresi a GPU A/B se stejným obrazem; případná extra příprava musí přiznat startup cenu a neměnit timeout/readiness.
- Oba enginy/scény/shadow maps/textury/materialy/meshes byly dispose ve finally, vlastní observers a instance hooky odstraněné. Žádný helper proces ani port nezůstává. Žádný GPU/fullsuite/build/integration/install/pnpm nebo samostatný typecheck.
- `manifest.json` obsahuje exact source/probe/output/log/handoff SHA. Po předání rootovi následuje release; čas dokládá registr. Bez commitu, stav tasku/integraci mění root.
