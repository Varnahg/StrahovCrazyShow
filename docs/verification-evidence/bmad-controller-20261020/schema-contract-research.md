# Shoda modelového schématu a plánovací validace

20.10.2026. Executor fbeb58218c596e9828047c83194fb8412a1cec5b, skutečný run key-47-c1ef58bf36c0. [Původní výsledek a identita](pilot-spec-completion-stop.json) se zachovávají beze změny.

## Doložený mechanismus

Spec-completion:v1 skončil exit0 a ready=true; přečetl doručené instrukce, ověřil nezměněný kandidát a výslovně vypořádal původní administrativní/formátové otázky. Řadič poté správně zastavil SPEC_PRESENTATION před amendmentem. Model vyplnil čtyři prázdná pole then, celé formulace Když/Pak vložil do when, do tasks zahrnul i původní pouze čtené testy a controller handoff a do footprint vložil popisné věty místo raw cest. Schéma tyto hodnoty dovoluje; následná validace je odmítá. Nejde o změnu uživatelského záměru ani důkaz úspěšné prezentace.

Pravidla v promptu/schématu musí mít stejný význam jako runtime validace. Worker write scope není seznam všech čtených podkladů, kontrolních příkazů a controller artefaktů. Ty mají vlastní existující manifest/role. Oprava nesmí tento scope rozšířit jen kvůli modelové odpovědi. Zároveň musí jít vyjádřit ready=false bez vymyšlené kompletní prezentace.

## Primární zdroje

Root použil OpenAI Docs a otevřel aktuální [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): podporované jsou enum, textový pattern, minItems a required nullable properties; root musí být object, nikoli anyOf. Podmínkové if/then/else nejsou podporované. Tato dokumentace podporuje volbu reprezentace, nenahrazuje skutečný CLI výsledek. [Oficiální Codex příklad](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex) ukazuje uložené schema předané přes --output-schema a samostatný output-last-message. Jeho obecná repair smyčka ani model overrides nejsou součástí tohoto zadání.

Lokální primární důkazy jsou immutable input/request/receipt skutečného attemptu8c438cd6b1af902c78419a5c, jeho původní JSON a současné validatePresentation/buildWorkerPrompt/schemas. Po neúspěchu nebyl přepsán pilotní stav, spec ani modelový výstup.

## Varianty před implementací

- Oslabit validaci nebo uznat ready=true samo o sobě: odmítnuto; ztratily by se konkrétní struktury a hranice rozsahu.
- Automaticky rozřezávat české věty Když/Pak a odstraňovat text z cest: odmítnuto; heuristika by mohla změnit význam či zamaskovat skutečně jiný požadavek.
- Opakovat tentýž attempt se stejnými volnými schématy: odmítnuto; ztráta identity a neomezené hledání zeleného výsledku.
- Sjednotit kontrakt schéma/prompt/validator a pro doložený starý terminal invalid-ready výstup navrhnout jediný omezený čtecí převod: preferovaná varianta k technickému dopracování. Původní raw result/SHA, request/receipt, frozen blok a sourceDigest zůstávají zachované. Skutečné otázky a provozní blokace zastaví postup před jakoukoli opravou formátu. Nový kontrakt musí být immutable a ověřovaný také při replayi. Žádná opakovaná implementace, změna manifestu ani nový PR.

Zvažuje se oddělená verze kontraktu od transportu a explicitní fail-closed mimo jediný doložený stav před amendmentem/review/commitem. Význam textu nadále posuzuje model a nezávislá readiness; schéma pouze omezuje serializaci. Dopady se týkají evidence, cache vstupů a lifecycle jednoho čtecího pokusu; hra, GPU a runtime klienta se nemění.

## Rozhodnutí a hranice

Koordinátor přijal poslední variantu: readiness a skutečné blokace mají přednost před kontrolou presentation; blocked výsledek může mít presentation=null. Nový kontrakt má neprázdné samostatné texty when/then, raw cesty, přesné authorization bases a jasně odděluje worker zápisy od controller výstupů a read-only kontrol. Per-attempt schema se uloží neměnně, jeho SHA vstupuje do input/provenance a executor jej ověří před spawnem.

Jediný spec-completion:v2 smí navázat pouze na prokázaný terminal exit0 původní v1 s ready=true, prázdnými novými gaps/blockers, správným celým priorReadiness reconciliation a prokázanou chybou presentation kontraktu. Nadále pouze před amendmentem/v3/review2/commitem; v2 failure/invalid/false zastaví a nemá další automatickou generaci. Původní request, receipt, input i raw output/SHA zůstávají. Následná samostatná readiness:v3 nebyla dosud spuštěna a zůstává povinná.

Pro původní dokončený kandidát lze enum cest odvodit ze skutečných worker změn. Nový plán v této první verzi může výslovně požadovat konkrétní worker writePaths místo otevřených adresářových rezervací; současné jediné přidělení má dva konkrétní soubory. Nepřidává se obecný generátor neznámých nových cest. Controller artefaktové adresáře zůstávají oddělené a podporované. Omezení musí být jasně diagnostikované před modelovým plánováním a doložené testem.

## Stav

[Sériová plná sada](serial-local-validation.json) nad předchozím snapshotem prošla1614/0fail/1existing skip; build a izolovaná integrace exit0. Po zaznamenání28 neměnných hashů a release validation rezervace byl source freeze výslovně ukončen. Kontraktová oprava a refaktoring jsou dokončené:19/19 cílených testů,3/3 review regresí a root3/3 native/schema/recovery recheck PASS; TypeScript/format exit0. [Nezávislé review a jednotlivé verdikty](review-schema-contract.md) jsou uzavřené. Následuje skutečný modelový pilot a finální celá CI přesného PR kandidáta. Pilot je stopped, s jedinou dokončenou implementací, bez amendmentu, commitu a PR. Pozorované vlastní PID42912/28340/26028/43512/36140/14352/36012 při kontrole03:36:27Z již neběžely.
