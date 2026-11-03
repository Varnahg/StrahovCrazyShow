# KEY-72: integrační přejímka a předání nasazení

Koordinátor `/root`, main v `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`. Výstupy v `.cache/discord-kb-20261103/validation/`. Původní produkční kontejner, DB a čtyři volumes dosud nezměněny; switch provádí jejich aktivní vlastník po tomto předání.

## Ověřené vydání

- Game: commit `c82c6b33872c42174b351df47677adc40741c474`, image `strahov-crazy-show:git-c82c6b33`, ID `sha256:73a983eae229181a5d42ebb632d1957b54af6a57ca0f601a2fdf559c3a442edf`.
- Opravený bootstrap: commit `d05c893e6bbdd557e19f4ceb351b6de60b9aa002`, image `strahov-rag-tools:git-d05c893e`, ID `sha256:5697d2cc4ad2aa1daba16fdd3d57076d69348775377a693a07f3f3bcc5958ece`.
- Runtime source manifest SHA `a087f53fcdcb2bcad70ad9e6dfe95998da3cb6d33f4cb093ae624de93518f78c`; 21 810 souborů z pevného Git tree, LFS podle SHA/velikosti. Po všech testech/build/image čteních všech 21 810 stále shodných. Žádná `.git` ani vývojová kopie, pouze neměnný testovací artefakt.
- Tools source manifest SHA `e35b4b567491bc2aca52ead4ad9dad3197688c6fe4a5b69f2955ccdeb9fa7d03`; 172 souborů minimálního kontextu z pevného commitu, po buildu shodné.
- Pozdější auditní commit `a4d17194` změnil zařazení zpráv a receipts, nikoli 144 runtime bundles, sourceVersion IDs, embedding inputs či bootstrap cache. Bootstrap-only změna d05 nemění game runtime. Starý tools image c82 se nepoužije.

## Skutečné výsledky

- Frozen `pnpm install --frozen-lockfile` a `pnpm build`: PASS. Docker runtime build včetně TypeScript a kontroly 8 064 runtime assetů bez LFS pointerů: PASS.
- Frozen `pnpm test`: 2 903 testů, **2 896 PASS, 5 SKIP, 2 FAIL**, 1 833,65 s. Neoznačujeme tento běh za zelený.
- Obě selhání byla v přípravě nezměněných nesouvisejících testů: `autodev-adapters.test.ts:1724` vyčerpal 15s čekání na live fixture před vlastním guardem; `recorded-walkthrough-replay.test.ts:41` narazil na Windows Git „Filename too long“ v hlubokém artefaktu. Původní log i konkrétní stacky jsou zachované.
- Přesné samostatné opakování obou na stejném frozen kódu: **2/2 PASS**, 27,19 s. `--test-concurrency=1`, pouze procesní Git `core.longpaths=true`; žádná úprava aplikace, testů, timeoutů ani systémového nastavení. To nepřepisuje původní full-suite výsledek.
- Frozen `pnpm test:integration`: PASS včetně multiplayeru, network/input backlog, respawnu a izolovaného feedback lifecycle. Vlastní server 2568 ukončen helperem.
- Foundation CPU83, runtime/data171, tooling20, parser13, audit9, skutečné PostgreSQL regrese20: PASS (jednotlivé checkpointy a logy uvedené v kořenovém handoffu; nesčítají se jako jeden nezávislý běh).
- Fresh i upgrade skutečného bootstrapu: stejné cílové heady, opakování unchanged, API0, cache245, původní DB revize zachované.
- Poslední bootstrap expiry oprava: nejdřív doložený FAIL, potom 22/22 cílených testů + tsc PASS + nezávislé ACCEPT. Stejných22 testů také PASS uvnitř konečného Linux tools image s vypnutou sítí.
- Skutečný PostgreSQL test s izolovanou injekcí hodin pro 10.11./3.12./1.2.: stávající145 dokumentů a head zachované; fresh po první hranici104 dokumentů, při dalších expiracích stejný head. Runtime2.2.2027 nevrátí prošlou evidenci. API0/cache245. Systémový a DB čas se neměnily. Pending-cross-expiry zůstává fail-closed; nemaže se checkpoint a neprovádí automatický retry.
- Retrieval72/gold před embeddingy: **49/52=94,23 %**; 20 guardů oddělených od jmenovatele. Corpus144 inputs/83 587 B/33 581 tokenů; reimport0calls. Legacy metadata refresh také0calls.
- Skutečné generování: první27/28 HTTP200, 20/20 guardů bez kritického porušení, první Wi-Fi invalid-response nezveřejněn. Samostatná reprodukce a skutečný UI průchod následně PASS. UI0canvas/0consoleerrors; podklady rozlišují oficiální ověření a komunitní období. Guard18 abstinuje místo úplného vysvětlení herního profilu.
- Přímo konečný Linux game image: health/AI status a skutečný dotaz k jistotě s novým oficiálním podkladem PASS pod reader rolí, která nemůže INSERT do cache. Testovací image container i síť odstraněny po ukončení; nejde o produkční switch.
- Všech245 původních souborů, včetně180 HTML, znovu hashově beze změny.

## Předání aktivnímu provoznímu vlastníkovi

Připravený override: `.cache/discord-kb-20261103/validation/release/compose-images.yaml`. Použít původní produkční projekt `strahovcrazyshow-main-20261027`, jeho konfiguraci, čtyři named volumes a původní secret mount. Pouze `--no-build --pull never`; ověřit image IDs před i po startu. Bootstrap má rozpočet **0 inputs / 0 bytes**, kompletní schválená cache je v image.

Před přepnutím ověřit, že původní heady stále odpovídají záloze: public `76922848bbaf791b366a87dc7b8985f5b995d9542b512948697b301edb3dbfdb`, public-documents `0e98de6518c62ccf9849dc81ce3ae11fdc9ba7f2df027300f2ffaa246d21bff9`. Záloha obsahuje pouze allowlisted veřejné RAG tabulky, bez rolí, hesel a feedbacku; manifest a důkaz izolovaného restore jsou v `production-baseline/`.

Koordinovat krátké zastavení starého game před SQL003, aby starý kód nečetl nový typ. Nový runtime umí také původní evidence na schema3; nepřepínat naslepo zpět na starý schema2 runtime po migraci ani nepřepisovat migration markery. Import zachovává staré heady při selhání; případný recovery má vycházet ze skutečně dokončených fází a uložené zálohy.

Cílové heady: public `b0c9aaf79a6868ce9d6a7ac037c607885186f545a65cbd2bbbdee96abe97661c`; public-documents `8fc2afc10a92f41e05e3e630b1efe15d834818eac47eff78fef1a4fed8dd1096`. Ověřit schema3, heady, všechny původní i144nových sourceVersion IDs, 145 documents /200 document chunks /45legacy chunks /245cache a původní volumes. Konečný produkční výsledek doplní root až po skutečném potvrzení, nikoli z tohoto ready předání.

Vlastní stage container bude při uvolnění rezervace zastaven; jeho named volume zůstane zachované. Žádné cizí procesy nebyly ukončeny.
