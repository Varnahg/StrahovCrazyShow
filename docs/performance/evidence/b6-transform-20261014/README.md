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
