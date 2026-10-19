# Konsolidace a pořadí řešení — 19. 10. 2026

Základ analýzy: `db9108ddd3d069030abebd0fcccd6ecefbd0ff53`. Úplné původní znění43 issues v [linear-before.json](linear-before.json); doporučení v [renderingu](rendering.md), [pohybu](movement.md) a [výkonu](performance.md). Analýza porovnává přijatý kód, jeho testy a evidenci; nové GPU měření neproběhlo.

## Rozhodnutí o rozsahu

- **KEY-25/26/27/28 → KEY-33 (Duplicate).** Nativní porty jsou v main; zbývající driverová/obrazová/lifecycle přejímka patří do jedné matice. Do33 bylo plně převzato původní znění Rozsah/Práce/Přijetí. Zůstává traceability vegetace V25, povrchů S26, avatarů/aut A27/C27 a oblohy SKY28. Historické imperativy „portovat“ jsou zachované zdrojové požadavky, nikoli pokyn přepisovat již integrovaný port.
- **KEY-13 → Canceled na přímý pokyn uživatele.** Uživatel19.10 uvedl, že červené záblesky dlouho nepozoruje a žádá je vyřadit. Odebrána jeho blokace11. Nejde o nový důkaz konkrétní opravy.
- **KEY-1/17/18/19/23/36/37/38/41/43 zůstávají Done.** Jejich úzké doložené výsledky neuzavírají širší rodiče.
- **Ostatní zachovat s konkrétním dalším krokem.** Žádný další pár není úplná duplicita. Diagnostika2 není totožná s vlastněným deníkem21, sender6 s recovery7 nebo obrazem12;20 není hotové jen proto, že37 opravilo Fresnel invalidaci.

## Jeden optimalizační celek

KEY-5 „Plynulost celé hry: rendering CPU/GPU, startup a lifecycle“ zastřešuje3,4,8,9,10,16,20,22,40. PodKEY22 zůstávají konkrétní WebGPU mechanismy a přejímky; pod40 experiment42 a přijatá oprava41. KEY-2/21 zajišťují důkazy, KEY-6/7/12 správnost pohybu, KEY-14/15 vzhled. KEY-11 je společná závěrečná přejímka.

Tato hierarchie vyjadřuje společný produktový výsledek. CPU práce v rendereru, upload, GPU draw, startup latency a teardown mají odlišné metriky. Nízká GPU utilization ani propad FPS samy neurčují příčinu. Parent se neuzavírá podle počtu dokončených dětí nebo průměrného FPS.

## Doporučené pořadí

| Pořadí | Celek | Konkrétní výsledek |
|---|---|---|
| 1 | KEY-39 +24/35/30 | Reprodukovat aktuální shadow ABI/baseEffect/lifetime a skutečný failure/restart; zdravý renderer je podmínkou platné přejímky. |
| 2 | KEY-31/32 +42/40 | Dokončit právě vlastněný worker experiment a přesný pipeline/submission průzkum. Vybrat nejmenší zásah podle současného profilu, připustit negativní výsledek. |
| 3 | KEY-3/4/9/16 | Jedna sdílená trasa F/auto/kvalita/tráva/B6; zachovat zvlášť interakční, obrazová, kolizní a resource kritéria. |
| 4 | KEY-6/7/12 | Společná stall/recovery/presentation matice, oddělené invariants senderu, autority a kamery. |
| 5 | KEY-8/10/20/29 | Responzivní loading, editor i návrat do menu, omezené prostředky a generace. Nepřebírat persistent-preview/staged-world WIP bez vlastníka. |
| 6 | KEY-14/15 | Znovu ověřit existující barevný kandidát vůči dnešnímu main a teprve na stabilním obraze měřit kontinuitu lamp. |
| 7 | KEY-33 →34 a11 | Jedna úplná matice obrazu/funkcí, samostatná proložená performance A/B a teprve pak default/release. |

KEY-2/21 podporují všechny fáze; dokončení celé obrazové funkce deníku nesmí uměle blokovat použitelná existující měření. Pořadí je doporučení podle rizika a připravenosti, nikoli oprávnění začít neobjednané implementace. Lokální rezervace a původní vlastníci platí nadále.

## Varianty uspořádání

1. Jeden megatask: málo položek, ale ztráta odpovědnosti, reprodukcí a samostatně ověřitelných výsledků.
2. Zachovat původních33 aktivních issues: zachová historii, ale portové přejímky se opakují a společný výkonový cíl není patrný.
3. **Zvolená varianta:** společný parent5, samostatné mechanismy a scénáře, jedna přejímka portů33, zrušení13 dle uživatele. Výsledek28 otevřených,4 Duplicate,1 Canceled,10 Done. Žádný runtime ani nový náklad cache/lifecycle; riziko přesunu kritérií omezeno plným zachováním jejich textu.

## Ověřování a závislosti

Staré implementační hrany25–28→31/32/33 byly odstraněny. Nesmí se převést na33→31/32:31 již blokuje33. KEY-39 nově výslovně blokuje33; existující blokace24/29/30/31/35 zůstávají. U13 odstraněna hrana→11. Přesun parent20 z11 do5 nemění jeho přejímku,11 nadále čeká na5.

Všechny issues se po změnách znovu načtou. Kontrola ověří stav, parent/duplicate target, nepřítomnost cyklu, úplnost43 ID a zachování původních portových požadavků. Případné průběžné změny vlastníků zůstanou zachované. Historické výsledky uváděné v briefs jsou přiřazené checkpointům; tento dokument neslibuje nové FPS ani novou funkčnost.

Linear používá samostatný stav Duplicate pro sloučené položky; historie a odkaz na canonical issue zůstávají dostupné. [Primární dokumentace vztahů](https://linear.app/docs/issue-relations).
