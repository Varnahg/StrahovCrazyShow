# B6-01: ověření a připravená grafická přejímka

14.10.2026. Referenční wave3 `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`. Kandidát `cbc158068138e3454a6959a0d7a945465ea2974e6c246e86ed231abf92a4b5dc`,8407vstupů včetně510source/config/test. Před/po/kopie SHA shoda; proti wave3 přesně změněný `client/b6-reality.ts` a přidaný `tests/b6-render-lifecycle.test.ts`, žádný další runtime nebo novýglTFfastpath.

## Provedeno

- Před opravou nová skutečná regrese1FAIL/3PASS,405root/402child world-matrix přepočtů proti očekávaným0/0.
- Po opravě34/34 cílených testů a úzkýTypeScript bezdiagnostik; nezávislý read-only review beználezu funkčníregrese.
- Celý kandidát: **878/878 pnpm test PASS**, **pnpm build PASS**, **celé pnpm test:integration PASS**. Pipeline14.10.12:36:33–12:40:58UTC, skutečnéstageexit0. Výstupy jsou v `.cache/b6-transform-validation/{test.log,build.log,test-integration.log,pipeline.jsonl,maneuvers.json,network.json,backlog.json}`. Existující build warning o neúčinném vegetation dynamic importu zůstává.
- Samostatná kontrola závislostí: Git archive91ee88f client/shared/package/tsconfig + pouze novýB6modul a jeho novýtest,4/4 PASS. Novýfix tedy nezávisí na ostatním dosud necommitnutém wave3WIP.
- Lokální produkční kandidát byl spuštěn na4186/API2581, HTTPhealth200, oba PID aUTCstart ověřené. Tato HTTPkontrola není GPU důkaz.

## Odloženo na výslovnou žádost uživatele

CUA nemělo připojený prohlížeč; vytvoření CodexIAB iEdge vrátilo nedostupnost. Otevření panelu přesCodexapp byloqueued. Uživatel odpověděl „teď nemůžu, připrav to na později“. **Žádná skutečná GPU/obrazová přejímka dnes neproběhla.** Netvrdíme odstranění všech6–8FPS ani vyřešeníKEY-16. Samostatnýcommit kandidáta lze uložit; začlenění runtimefixu do main a uzavřenípřejímky počká na praktickýdůkaz.

## Připravená reprodukce pro další relaci

Ve worktree `.cache/b6-transform-validation/` jsou neměnné adresáře `baseline` a `candidate`, jejich manifesty, buildy a zachované protokoly. Baseline pouze odkazuje na starýread-onlywave3build; assety obouvariant odkazují na stejný immutablebaseline. `weather-fixture.json` vychází ze skutečného B6 incidentu a preview jej označí jako uloženéQApočasí, nikoli živé.

Po obnovení validační rezervace a ověření volnýchportů použije koordinátor `start-qa.ps1 -Variant baseline` nebo `candidate`; každý běh má unikátní záznam v `runs/`, žádný starší log se nepřepíše. Oběvarianty postupně používají4186/2581. Zastavovat pouze přes `stop-qa.ps1 -RuntimePath <vlastní runtime.json>` po ověření vlastníka/PID/UTCstart/command; nikdy podleportu. Závislosti/junctiony jsou readonly, žádný dalšíbuild do baseline.

Před měřením: připojený prohlížeč, jediná aktivní 3Dscéna, žádnéfulltests/build/Blender, ověřenéGPU/driver,CSS iinternal2040×986, stejnýavatar/HUD, high, svítilna, pevnýnočnípreviewUTC a stejnýweatherfixture. Přesnýclock/resolution/source se potvrzuje z nového automatického logu; nepředpokládat ho jen podleUIpresetu.

Trasa: skutečný multiplayer, venek→západnívstupB6→jižníchodba→south-serviceschody0→1→2→0, oběma směry; pak severníschody. Třetí i prvníosoba, cold a warm svítilna/průchod. Porovnat minimálně tři srovnatelnéprůchody a counterbalance baseline/kandidát; zachovat všechna p95/p99/max a lokální minimaFPS, nikoli pouzeprůměr. Zkontrolovat skutečnýobraz světla/occlusion/meshů, dveře/schody/styky aeditovatelnýroot tam,kde jeUIkontrakt dostupný. Automatickélogy/exportbenchmarku obstaráagent; uživatel nemusí měřenízapínat.

Nové výsledky se oddělí od historického07clogu. Pokud zůstane výkonovýpropad, vrátit se kvariantám shadowindex/ancestorhelper/geometry až podleprofile. OpravaA neruší známou dynamickou lavinu při skutečném editovánípivotu ani dalšíčervené/noční/síťovézávady.

## Bezpečné navázání po odkladu

Příprava helperu 14. 10. neprovedla další GPU přejímku ani start serveru. `start-qa.ps1` vyžaduje PowerShell 7.4+ a spuštění z kořene výše uvedené worktree. Koordinátor nejdřív přepne task `validate-b6-transform-20261014` z `blocked` na `ready` a získá skutečnou rezervaci pod vlastníkem `repairs-01a13624-b6-validation`; helper nic nerezervuje. Před každým spuštěním musí mít claim aktuální heartbeat do 15 minut, správnou worktree, `.cache/b6-transform-validation/` a všechny zdroje `heavy-validation`, `gpu`, `workspace-build`, `port:4186`, `port:2581`, `port:2568`. Změnu vlastníka je nutné koordinovaně promítnout také do start/stop helperů, ne jen do task JSON.

Ověřený dostupný runtime je **PowerShell Core 7.6.5**, `C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe`. Nepoužívat Windows PowerShell 5.1 (`powershell.exe`). Až po obnovení rezervace lze z kořene worktree spustit například následující příkaz; pro druhou variantu změnit pouze `baseline` na `candidate`:

```powershell
& 'C:/Users/rezac/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe' -NoProfile -File '.cache/b6-transform-validation/start-qa.ps1' -Variant baseline
```

Tentýž `pwsh.exe -NoProfile -File` použít pro `stop-qa.ps1 -RuntimePath <úplný vlastní runtime.json>`. Dostupnost cesty/verzi znovu ověřit při pozdějším navázání; žádná instalace není součást tohoto helperu.

Helper ověří registr ve společném Git adresáři, stav tasku, porty, očekávaný snapshotId a přítomnost vstupů. To **nenahrazuje kontrolu hashů obsahu ani HTTP připravenosti**. Záznam `runtime.json` vznikne atomicky před startem a průběžně ukládá PID i UTC identity. Úspěch hlásí `started-unverified`, nikoli ready. Při částečném selhání uklízí v opačném pořadí pouze proces se shodným PID, UTC startem, executable a příkazem; změněná identita nebo odmítnutý stop zůstane označený `manual-review`. Při takovém výsledku koordinátor nejdřív zkontroluje záznam a konkrétní identitu. Neúplný failed záznam nepředávat slepě původnímu stop helperu. Úspěšný kompletní záznam zůstává s `stop-qa.ps1` kompatibilní. Nouzové ukončení hostitelského PowerShellu či chyba disku nejsou garantovaně dokončený cleanup; před opakováním vždy ověřit již zaznamenané procesy.

Po startu koordinátor provede následující kroky:

1. Ověřit health přes preview, stderr a identitu obou procesů. Ověřit zdrojový manifest i skutečně servírovaný `dist/index.html` a jeho chunk soubory proti vybrané variantě. Runtime snapshotId je očekávaný štítek, nikoli přepočet buildu.
2. Otevřít jednu novou herní stránku na `http://127.0.0.1:4186/`. Při přepnutí varianty na stejné URL nejdřív ukončit a zavřít starou hru, zastavit její vlastní runtime, spustit druhou variantu a načíst novou stránku. Samotný serverový `source-identity` v logu nedokazuje, že stará karta už používá nový klientský bundle; ověřit také načtené asset URL.
3. Nastavit a ověřit v automatickém logu stejné CSS/interní rozlišení 2040×986, GPU, kvalitu, avatar, počasí a `lightingInstant`. Skript čas nenastavuje. Noční preset vybírá 22:00 UTC podle **aktuálního pražského data**; jeho název není pevný historický UTC. A/B provést se shodným skutečným instantem, nepovažovat průchody přes rozdílný den za stejné osvětlení.
4. Provést výše uvedenou trasu baseline/kandidát, další dvojici v opačném pořadí; oddělit cold a warm průchody. Ponechat jedinou aktivní 3D scénu a žádné paralelní těžké ověřování.
5. Automatické herní logy vznikají v `<baseline nebo candidate>/.cache/game-diagnostics/`, **nikoli automaticky v `runs/`**. Před zastavením API nechat dokončit odvod posledních záznamů; podle sessionId a časů zkopírovat všechny části JSONL do příslušného run adresáře spolu s benchmark exportem a metadaty varianty. Zkontrolovat sequence gaps a poslední záznam; retence původní cache není archiv. Uživatel žádné měření ručně nezapíná.
6. Teprve potom zastavit vlastní kompletní runtime přes `stop-qa.ps1 -RuntimePath ...`, ověřit zánik a volné porty. Po dokončení celé série uvolnit rezervaci; žádné automatické uzavření KEY-16 pouze podle startu helperu.

### Rozhodnutí o helperu a omezené ověření

Samotný `try/finally` bez průběžného záznamu by po přerušení ztratil identitu prvního procesu; ukončování podle portu by mohlo zasáhnout cizí práci. Zvolen je malý transakční start s atomickým přepisem záznamu a kontrolou identity. Nový obecný process manager ani přepis stop helperu nejsou pro tento scope potřeba. `Start-Process -Environment` nepozmění proměnné rodičovské relace. Primární podklady: [Microsoft Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-7.5), [Stop-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/stop-process?view=powershell-7.5), [Process.StartTime](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.process.starttime?view=net-9.0), čtené 14. 10. 2026, a skutečný koordinační registr/stop helper.

Parser a 18 izolovaných mock scénářů prošly bez reálného Start/Stop/CIM, Node serveru, browseru, buildu či GPU. Reproduktor je `.cache/deferred-b6-qa-checks/check.ps1`; výsledky `.cache/deferred-b6-qa-checks/mock-861ad77440c04d6a872a59811d9a2034/results.json`. Test používá jen kopii helperu a falešný registr ve vlastní checks složce. Reálný validační task zůstal `blocked` bez claimu. Pokryty jsou nesprávný owner/cwd/resources/stav/heartbeat/snapshot, obsazený port, selhání prvního/druhého startu, ztráta claimu po prvním startu, časný exit, PID reuse, jiný příkaz, odmítnutí cleanupu a úspěch bez falešné readiness.
