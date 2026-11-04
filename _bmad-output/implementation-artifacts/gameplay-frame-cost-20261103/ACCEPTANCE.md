---
title: Přejímka plynulosti podle skutečného hraní
type: bugfix
created: 2026-11-04
status: done
route: oneshot
---

<frozen-after-approval reason="Výslovné zadání uživatele implementovat zlepšení testu a potom konkrétní optimalizaci; bez dalšího schvalování.">

## Intent

Dokončený sběr nesmí být zaměněn za hratelnou hru. Existující 10s HUD benchmark dostane zřetelný výsledek krátkého snímkového vzorku; skutečné přijetí hraní hodnotí uložený recorder včetně delšího pohybu a síťových korekcí. Uživatelův archiv c16cb5a6 musí vyjít nevyhovující bez nového GPU běhu.

Given úplné intervaly, when překročí explicitní číselné meze FPS/p95/p99/max či četnosti záseků, then výsledek uvede failed a konkrétní hodnoty. Given chybějící intervaly, zdrojová identita, nesouvislé seq či neplatné hodnoty, then nesmí vzniknout passed. Given krátké stání, then se nesmí potvrdit celá hratelnost ani síť. Given alespoň60s viditelného hraní a20s skutečného pohybu, when jsou dodrženy meze snímků a síťových resynců/korekcí a identita, then lze přijmout pouze tento označený scénář. Cílových60FPS je výchozí projektové zadání, nikoli údaj odvozený z pomalého měření. Výchozí inženýrské toleranční meze jsou konfigurovatelné a veřejně popsané; nejsou vydávané za oborový standard.

Obnovit rozhodování podle hráčského logu, nikoli vyrábět další obecný profilovací framework. Staré startup-only plány dál znamenají pouze measurement-complete/optimizationAccepted=false. Nový strukturovaný gameplay plán vyhodnotí skutečná data a nezamění neúplnost za úspěch. Nevylučovat tiše záseky při změně kvality; zvlášť označit přechody viditelnosti/startup. Renderer-health zůstává nezávislý na výkonové přejímce.

</frozen-after-approval>

## Implementation Notes

- Podklady: cadc09c9 hráčský archiv, Game.startBenchmark/onBenchmark, local-benchmark whitelist, performance-experiment benchmarkResult. Dosavadní acceptance byl pouze text a measurement-complete znamenalo počet uložených souborů; síťové korekce nebyly součástí FPS výsledku.
- Volba: čistý sdílený evaluator, úzký offline JSONL/gzip adapter a zapojení existujícího monitoru; UI používá stejnou snímkovou část. Samotné barevné varování v HUD by neochránilo runner, nový univerzální orchestrace/replay systém je zbytečný. Runtime recorder už potřebná data ukládá, není nutné přidávat další per-frame alokace ani měnit protokol.
- Scopes: gameplay-acceptance-20261104 implementuje helper/CLI/monitor+testy; root gameplay-acceptance-ui-20261104 UI/presentation+návod; AGENTS pod admin claim. Hraná relace skončila a její archiv je trvalý. Starý vlastní server už nenaslouchá, jeho cleanup soubor chybí, proto jeho shutdown neprohlašovat za doložený PASS.
- Nezávislé review před commitem, cílené testy a ověření proti původnímu archivu. Herní build a GPU ověření až nad stabilním checkpointem následné konkrétní opravy, bez dalších stacionárních sérií.

- Výsledek:35/35 evaluator/CLI/monitor,11/11 presentation,18/18 manifest/replay,10/10 i18n PASS; celý TypeScript před review doplněním a cílený TypeScript konečného helperu/testů PASS. Přímý finální Node CLI nad hráčským archivem vrací failed/exit2 včetně stale-authority a timeline-wait, nikoli úspěch podle samotného render health. Zdrojový manifest nově zahrnuje přesné bajty externí testovací gzip fixture.
- Browserový vzhled a celoprojektový build/integrace navážou společně s runtime opravou; tato etapa sama nedokládá FPS zlepšení. Žádná nová GPU měřicí série nebyla spuštěna.

## Review Triage Log

- Medium/patch: chyběla kontrola nepokrytého začátku/konce relace. Doplněné hranice, skutečné hidden/transition úseky a nejvýše jeden povolený interval na krajích; regrese chybějících5s i normálního krátkého dojezdu do dispose.
- Medium/patch: zdravé FPS bez čerstvé autority mohly projít při nulových odpovědích resync. Doplněné authorityAge/connection a timeline waits, neplatná/chybějící data nemohou vytvořit PASS. Regrese60FPS se zastavenou predikcí.
- Nezávislé následné ověření obou oprav: bez dalších nálezů.
