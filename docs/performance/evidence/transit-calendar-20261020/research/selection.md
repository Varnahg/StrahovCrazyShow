# Výběr runtime performance úkolu — 20. 10. 2026

Výchozí vzdálený main: ba91b84c17918ee16a9472c57f38b427fa6e21da. Uživatel požaduje další malý Linear performance úkol s přímým runtime dopadem, průchod řadičem až po merge/main CI a srovnatelné měření před/po. KEY-50 byl pouze offline diagnostický úkol a není předchozí výkonové měření.

## Doložené kandidáty

- KEY-42: travní worker má původní neintegrovaný WIP v 9b78. Nepřebírat a nevytvářet druhou implementaci.
- KEY-20: teardown závisí na Game/UI, které nyní vlastní feedback implementace; původních 5,64 s není current-main baseline.
- KEY-32: širší submission/cache přejímka vyžaduje nový profil, není vhodná pro předem zvolený malý zásah bez důkazu.
- KEY-5: dopravní renderer je uvedený jako relevantní runtime část. V shared/transit.ts se opakuje Intl převod pragueDate při každém vzorku; sampleTransit jej provede přes daysFor i transitStatus. Single-entry cache UTC sekundy je možná, ale každý zásah do transit.ts vyžaduje rezervaci a regeneraci navigační provenience se všemi vstupy. Dosud není změřený přínos.
- Přímo doložený odložený follow-up v docs/agents/handoffs/fps-transit-cost.md:7: client/transit-renderer.ts volá pool.pruneUnused na konci každého update. AvatarPrimitivePool iteruje sources/materials a alokuje pole a Sets i bez změny živých NPC. Užší kandidát je provést úklid až po strukturální změně passenger rigs, s přesnou kontrolou creation/disposal/LOD a asynchronního lifetime. Průzkum tohoto mechanismu pokračuje; zatím nejde o schválenou implementační volbu.

## Přejímka a omezení řadiče

V1 manifest přijímá pouze acceptance.kind=cli (store.mjs) a po checkech/review automaticky vydává project-acceptance (adapters.mjs). GPU/runtime úkol se nesmí vydávat za CLI práci. Před produkčním úkolem je nutná úzká, samostatně ověřená podpora externí praktické přejímky, svázané s přesným zdrojovým kandidátem a baseline/candidate důkazy; bez důkazu má řadič zastavit před accept/merge. Merge:false sám nestačí, neboť accept mu předchází.

## Koordinace a plán měření

Primary checkout obsahuje cizí WIP; použita čistá vlastní worktree ci-main-autonomous-pilot/StrahovCrazyShow a větev codex/performance-transit-runtime. Runtime zatím nezměněn. Feedback aktuálně drží renderer a heavy-validation/gpu/workspace-build. Zátěž ani 3D přejímka nezačala; vyžádáno bezpečné měřicí okno podle dřívějšího výslovného svolení uživatele odstavit jiné relace. Jeho kód se nepřebírá.

Před implementací se uzavře mechanismus, varianty a neměnná baseline. Měření: stejný driver, raw data, proložená A/B opakování, identické výstupy/obraz/HUD/reálné relace, hardware a rozlišení. CPU profil je oddělený od plain FPS/p95/p99. Výsledek bez doloženého přínosu není přijetí.
