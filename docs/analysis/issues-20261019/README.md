# BMAD: analýza všech issues — 19. 10. 2026

**43 issues prozkoumáno; po konsolidaci28 otevřených,4 sloučená,1 zrušené a10 Done.** Podklady rozlišují doložený stav, hypotézy, varianty a doporučení, přesný rozsah změny/refaktoringu a praktické přijetí. Nová implementace ani GPU měření nebyly součástí práce.

[Úplný přehled v Linear](https://linear.app/gigeconomy/document/bmad-analyza-backlogu-a-podklady-k-reseni-19-10-2026-1eac50891685) · [BMAD SPEC](../../../_bmad-output/specs/spec-issues-20261019/SPEC.md) · [Rozhodnutí, hierarchie a pořadí](consolidation.md).

Hlavní optimalizační celekKEY-5 nyní pokrývá CPU/GPU renderový řetězec, startup a lifecycle. Portové přejímky25–28 jsou v33 se všemi původními požadavky. Červené záblesky13 byly vyřazeny na přímý pokyn uživatele.

| Issue | Rozhodnutí | Podklad |
|---|---|---|
| [KEY-1](https://linear.app/gigeconomy/issue/KEY-1/opravit-verohodnost-automatickych-logu-a-vyber-herni-relace) | Ponecháno Done | [movement](movement.md) |
| [KEY-2](https://linear.app/gigeconomy/issue/KEY-2/doplnit-mereni-pricin-renderovych-a-sitovych-zaseku) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-3](https://linear.app/gigeconomy/issue/KEY-3/odstranit-zaseky-pri-svitilne-a-nastoupeni-do-auta) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-4](https://linear.app/gigeconomy/issue/KEY-4/odstranit-blokujici-zmeny-kvality-a-pripravu-postprocessu) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-5](https://linear.app/gigeconomy/issue/KEY-5/odstranit-prujezdove-zaseky-a-soustavne-propady-renderu) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-6](https://linear.app/gigeconomy/issue/KEY-6/opravit-odesilani-vstupu-a-zachovat-rizeni-po-render-zaseku) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-7](https://linear.app/gigeconomy/issue/KEY-7/opravit-skokove-korekce-multiplayeroveho-pohybu-a-auta) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-8](https://linear.app/gigeconomy/issue/KEY-8/zrychlit-studeny-start-a-pripravu-velkych-zdroju) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-9](https://linear.app/gigeconomy/issue/KEY-9/omezit-cpu-pripravu-a-vykreslovaci-naklady-vegetace) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-10](https://linear.app/gigeconomy/issue/KEY-10/odstranit-propad-pri-otevreni-editoru-avatara) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-11](https://linear.app/gigeconomy/issue/KEY-11/overit-uplne-odstraneni-nalezu-a-integrovat-stabilni-checkpoint) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-12](https://linear.app/gigeconomy/issue/KEY-12/odstranit-treseni-obrazu-pri-pohybu-z-treti-osoby) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-13](https://linear.app/gigeconomy/issue/KEY-13/odstranit-cervene-zablesky-misto-textur-pri-narocnem-nacitani-scen) | Zrušeno na pokyn uživatele | [movement](movement.md) |
| [KEY-14](https://linear.app/gigeconomy/issue/KEY-14/opravit-neprirozene-nocni-barvy-a-jas-materialu) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-15](https://linear.app/gigeconomy/issue/KEY-15/opravit-neprirozene-chovani-osvetleni-pri-pohledu-z-dalky) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-16](https://linear.app/gigeconomy/issue/KEY-16/odstranit-zaseky-pri-vstupu-do-b6-a-prechodu-mezi-patry) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-17](https://linear.app/gigeconomy/issue/KEY-17/opravit-vlastnictvi-image-processing-wrapperu-a-unik-observeru-v) | Ponecháno Done | [movement](movement.md) |
| [KEY-18](https://linear.app/gigeconomy/issue/KEY-18/oddelit-prirustky-serveroveho-casu-od-historickych-citacu-v-reportu) | Ponecháno Done | [movement](movement.md) |
| [KEY-19](https://linear.app/gigeconomy/issue/KEY-19/zapojit-automaticke-frame-logy-a-izolovanou-vlastni-sitovou) | Ponecháno Done | [movement](movement.md) |
| [KEY-20](https://linear.app/gigeconomy/issue/KEY-20/vysetrit-a-odstranit-56sekundovou-blokaci-pri-odchodu-do-menu) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-21](https://linear.app/gigeconomy/issue/KEY-21/propojit-pohybovy-a-obrazovy-denik-hrani-se-scenari-a-vyhodnocenim) | Ponecháno; podklad k dalšímu kroku | [movement](movement.md) |
| [KEY-22](https://linear.app/gigeconomy/issue/KEY-22/premigrovat-celou-produkcni-hru-a-editor-na-plynule-webgpu) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-23](https://linear.app/gigeconomy/issue/KEY-23/webgpu-sjednotit-renderer-verze-a-bezpecny-integracni-kontrakt) | Ponecháno Done | [rendering](rendering.md) |
| [KEY-24](https://linear.app/gigeconomy/issue/KEY-24/webgpu-odstranit-shadow-shader-html-fallback-a-potvrdit-compiler-chybu) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-25](https://linear.app/gigeconomy/issue/KEY-25/webgpu-portovat-vitr-a-fotografickou-travu-na-nativni-wgsl) | Sloučeno do33 | [rendering](rendering.md) |
| [KEY-26](https://linear.app/gigeconomy/issue/KEY-26/webgpu-portovat-povrchove-a-fotograficke-materialy-na-wgsl) | Sloučeno do33 | [rendering](rendering.md) |
| [KEY-27](https://linear.app/gigeconomy/issue/KEY-27/webgpu-nativni-wgsl-vlasy-barvy-aut-a-instance-vsech-lod) | Sloučeno do33 | [rendering](rendering.md) |
| [KEY-28](https://linear.app/gigeconomy/issue/KEY-28/webgpu-prevest-oblohu-slunce-a-mesic-na-nativni-wgsl) | Sloučeno do33 | [rendering](rendering.md) |
| [KEY-29](https://linear.app/gigeconomy/issue/KEY-29/webgpu-prevest-avatar-editor-a-nahled-na-spravny-asynchronni-lifecycle) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-30](https://linear.app/gigeconomy/issue/KEY-30/webgpu-sjednotit-pravdivou-diagnostiku-a-obnovu-rendereru) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-31](https://linear.app/gigeconomy/issue/KEY-31/webgpu-odstranit-blokujici-pripravu-pipeline-a-svetelnych-variant) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-32](https://linear.app/gigeconomy/issue/KEY-32/webgpu-optimalizovat-render-submission-a-zivotni-cyklus-cache) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-33](https://linear.app/gigeconomy/issue/KEY-33/webgpu-provest-uplnou-funkcni-a-obrazovou-prejimku-hry) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-34](https://linear.app/gigeconomy/issue/KEY-34/webgpu-prijmout-vykon-integrovat-default-a-predat-stabilni-verzi) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-35](https://linear.app/gigeconomy/issue/KEY-35/webgpu-opravit-nativni-wgsl-shadowdepthwrapper-v-pinovanem-babylonu) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-36](https://linear.app/gigeconomy/issue/KEY-36/webgpu-odstranit-zbytecnou-invalidaci-materialu-pri-plynule-zmene) | Ponecháno Done | [rendering](rendering.md) |
| [KEY-37](https://linear.app/gigeconomy/issue/KEY-37/webgpu-odstranit-globalni-invalidaci-fresnel-materialu-pri-ukonceni) | Ponecháno Done | [rendering](rendering.md) |
| [KEY-38](https://linear.app/gigeconomy/issue/KEY-38/zapojit-stabilni-bmad-do-projektoveho-workflow-codexu) | Ponecháno Done | [performance](performance.md) |
| [KEY-39](https://linear.app/gigeconomy/issue/KEY-39/webgpu-opravit-nesoulad-svetelnych-ubo-ve-stinech-svitilny-a-zastaveni) | Ponecháno; podklad k dalšímu kroku | [rendering](rendering.md) |
| [KEY-40](https://linear.app/gigeconomy/issue/KEY-40/overit-a-zavest-prinosne-rozdeleni-klienta-mezi-cpu-vlakna) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-41](https://linear.app/gigeconomy/issue/KEY-41/omezit-pruchody-cele-sceny-pri-inicializaci-materialu-postav) | Ponecháno Done | [performance](performance.md) |
| [KEY-42](https://linear.app/gigeconomy/issue/KEY-42/overit-worker-pro-pripravu-travnatych-dlazdic-pri-pohybu) | Ponecháno; podklad k dalšímu kroku | [performance](performance.md) |
| [KEY-43](https://linear.app/gigeconomy/issue/KEY-43/sjednotit-linear-publikovany-main-a-dokoncene-vetve-bez-prevzeti-wip) | Ponecháno Done | [performance](performance.md) |

## Důkazy a omezení

- Baseline přijatého kódu: `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`; žádný cizí WIP nebyl převzat.
- [Původní inventář a plné popisy](linear-before.json), [stav po publikaci](linear-after.json), [výsledky kontrol](verification.json).
- Každá ze tří analýz uvádí zdroje a historickou evidenci. Původní runtime testy se při dokumentačním auditu neopakovaly.
- Provedeny pouze čtecí zdrojové kontroly, validace BMAD konfigurace, katalogu, pokrytí, odkazů a výsledného Linear grafu.
- Změny stavu se týkají pouze konkrétně zdůvodněné konsolidace a přímého uživatelského zrušení13. Dokončení dílčí implementace se nezaměňuje za přijetí celé hry.
