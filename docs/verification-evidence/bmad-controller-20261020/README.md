# BMAD řadič — evidence KEY-46 / KEY-47

Datum:20.10.2026. Výchozí přijatý main `ceddc0802cd98dccfbee9d44fc00d6331ac9d749`. Implementace probíhá v odděleném worktree, vlastní změny mají disjunktní tasky. Primární checkout a jeho134 cizích dirty cest nejsou součástí tohoto předání.

- [Výzkum, varianty a skutečné backend probes](research.md).
- [První nezávislé review, jednotlivé verdikty a první plná sada](review-1.md).
- [Cílený recheck a uzavření všech nálezů](review-2.md).
- [Specifikace a původní záměr](../../../_bmad-output/implementation-artifacts/bmad-controller-20261020/spec.md).
- [Návod CLI](../../agents/bmad-controller.md).
- [Engine předání](../../agents/handoffs/bmad-controller-engine-20261020.md), [adapters předání](../../agents/handoffs/bmad-controller-adapters-20261020.md), [procesní QA](../../agents/handoffs/bmad-controller-recovery-qa-20261020.md).

## Ověřené checkpointy před integrací
- Samostatný Codex app-server skutečně načetl Linear; Codex exec skutečně provedl příkaz a vrátil strukturovaný výstup. Bez nového API klíče nebo kopírování tokenů.
- Engine původně14 testů; po review17/17, strict TypeScript exit0 a7/7 aktuálních hashů ověřeno.
- Adaptéry původně17 testů; po doplnění skutečných BMAD spec/lenses24/24 a TypeScript exit0. Review opravy navazují, staré hashe jsou historické checkpointy.
- Procesní QA:7 skutečných kill/restart scénářů; tehdejší společná sada38/38. Dva původní fixture failures a jejich konkrétní příčiny zůstávají popsané v předání.
- Skutečný loader/provenance ověřil9 BMAD snapshot souborů. Parent sestavil všech5 skutečných stage/lens promptů bez nevyřešených runtime placeholderů; žádný model ani vzdálená mutace při tomto smoke.
- První plná sada `pnpm test`:1557 pass,3 fail,1 skip. Selhaly staré modelové testy nad LFS pointery. Pod explicitní rezervací bylo z committed Git LFS objektů materializováno12 souborů/1.2GB; následný preflight12/12 ready a asset Git diff prázdný. Logy první chyby se nepřepisují.

## Lokální checkpoint před PR10
Po opravách a nezávislém rechecku jsou všechny nálezy uzavřené: engine17/17, adapters33/33, procesní recovery7 scénářů. [Strojová evidence](local-validation.json) váže výsledky na30 konkrétních zdrojových/configuračních souborů; SHA256 manifestu je `aab082702ea76f444589076f7d61da7a7e497188c78be63a5ca664da482dd847`.

`pnpm test --test-concurrency=2`:1578 testů,1577 pass,0 fail,1 skip (existující POSIX test cesty s koncovou mezerou na Windows). Produkční `pnpm build` a izolovaný `pnpm test:integration` exit0; [skutečný integrační log](local-integration.log). Preflight12/12, LFS fsck,239 tasků a README odkazy exit0. Port2568 a vlastní supervisoři po kontrole volní.

Druhá plná sada s výchozí konkurencí měla1575 pass,1 fail,1 skip: starší LFS fixture překročila15s timeout Git procesu. Cílený recheck24 pass a1 skip. Finální běh snížil pouze souběžnost přes standardní Node přepínač; žádný test, očekávání, timeout ani package konfigurace se neměnily. Původní logy obou neúspěchů zůstaly zachované.

## Integrační stav
[PR#10](https://github.com/Varnahg/StrahovCrazyShow/pull/10) přijal řadič z head `3b4c265e3916c4608fab1f09767bc77ca5cb3790` a base `ceddc0802cd98dccfbee9d44fc00d6331ac9d749`. [Přijetí integrátora](https://github.com/Varnahg/StrahovCrazyShow/pull/10#issuecomment-6280380691) navazuje na uzavřená review, lokální procesní přejímku a skutečné GitHub checky. Oba PR joby doložily testMergeSha `6a5ec326cb5e97f90a2d908c79c64017e27d6fba`; merge s exact-head guardem vytvořil `c1c56327240d5634fa3f4670fc7264e6a4287238`.

[PR CI a přijetí](github-controller-acceptance.json), [main CI](github-controller-main-ci.json): verify i source-secret-hygiene success na přesném merge SHA. Žádný bypass ani změna ochrany main. Zdrojový strom místního řadiče shodný s přijatým main.

Živý pilot KEY-47 běží pod `key-47-c1ef58bf36c0`. Nejprve skutečně [zastavil před workerem kvůli cizí rezervaci rendereru](pilot-reservation-stop.json); vlastník po koordinační zprávě svou rezervaci uvolnil a běžné resume zachovalo tutéž pracovní kopii. [Souběžné resume](pilot-concurrent-resume.json) správně odmítnuto jako BUSY, exit3.

[Skutečný SIGKILL controlleru během implementace](pilot-worker-crash.json) ponechal původního supervisora16592 a attempt `e05980c9326af6af6e251ed3` živé. [Následné čtení](pilot-worker-survived.json) doložilo pokračování téhož modelového vlákna a růst událostí4→28. Resume se připojilo ke stejnému attemptu, který dokončil exit0.

Pilot současně odhalil nečitelné snapshot instrukce a chybějící explicitní provozní readiness: [výzkum, varianty a oprava](runtime-input-repair.md). [Baseline hotové implementace](pilot-upgrade-baseline.json) uchovává přesné hashe. Neprovedená review se nepřijímají.

## Opravy doložené živým pilotem

- Doručení hashově ověřených instrukcí přes stdin a omezené převzetí existujících attemptů: commit `353b4c31acd367d6310ddc913d018d850dbb8f0b`, [review](review-delivery-v2.md), [51/51 lokálních testů](repair-final-validation.json). Původní selhání jednoho subprocess testu je zachované; jeho přesná příčina nebyla prokázána.
- Úplná prezentace specifikace a zápis odolný proti pádu: commit `fbeb58218c596e9828047c83194fb8412a1cec5b`, [výzkum](spec-format-research.md), [review a jednotlivé verdikty](review-spec-format.md). Skutečný model vrátil neplatnou prezentaci a řadič ji [odmítl](pilot-spec-completion-stop.json).
- Svázané výstupní schema a jediná oprava prokázaného slabého completion kontraktu: commit `938254e3fe874de24b89ade193f8f8e5b7a95d6d`, [primární podklady a varianty](schema-contract-research.md), [review](review-schema-contract.md), [cílené testy a hashe](schema-contract-validation.json). Skutečný následující modelový krok dokončil [amendment bez změny zdrojů a frozen zadání](pilot-schema-amendment.json); readiness v3 vrátila ready=true.
- Nové edge a verification review byly čisté. Blind výslovně odmítl přezkum kvůli chybějící inline projektové policy; [původní výsledek a všechny tři receipts](pilot-review-authority-stop.json), [příčina, varianty a omezení opravy](review-authority-research.md). Řadič správně zastavil před commitem/PR. Náhradní blind a následná integrace se zatím netvrdí.

Celý stabilní místní checkpoint po opravě prezentace: [1614 pass, 0 fail, 1 existující Windows skip; build a izolovaná integrace exit0](serial-local-validation.json), [integrační log](serial-local-integration.log). Tento běh předchází schema a authority opravám; není vydáván za plnou sadu jejich konečných bajtů. Předchozí souběžná sada měla jeden timeout nezměněné WGSL readiness zkoušky; [neúspěch i úspěšný izolovaný recheck](full-validation-readiness-failure.json) zůstávají zachované. Test, očekávání ani timeout nebyly oslabeny. Konečný kandidát vyžaduje vlastní přesnou GitHub CI.

## Provozní omezení
V1 má jeden explicitní issue, nikoli scheduler. Při neprokázaném výsledku procesu/externí mutace zastaví unknown a nevytváří další worker nebo PR. Úmyslná poškození receipt/checkpointu jsou lokální fixtures; neoznačují se za živý backend test. Herní/GPU výkon nebyl změnou ověřován ani tvrzen.

Automatické schvalování odmítlo odstranění původní failure fixture `C:/Users/rezac/AppData/Local/Temp/strahov-autodev-recovery-avrd5v` jako `blocked by policy` bez podrobnějšího důvodu. Adresář zůstal s původní evidencí a bez živých procesů; blokace nebyla obcházena.
