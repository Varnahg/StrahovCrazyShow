# KEY-68 · integrace Decisions routingu

Vlastník `decisions-integration-01a17e9d`, pracovní kopie `C:/Users/rezac/.codex/worktrees/clean-home-crazy-typka/StrahovCrazyShow`. Samostatný integrační task doplňuje již vlastněné source/research scopes. Záznam obsahuje původní mezistav a následné konečné přijetí do main.

**Konečný stav:** PR35 přijat a sloučen jako `801b2d07c884c51e42b0fc1a890e7a0f9dbc0196`; podrobnosti níže. Původní mezistav je zachován jako audit průběhu. Veřejné nasazení se neprovádělo.

## Přijatá base a přesný export

- PR33 byl skutečně sloučen jako `dc89ba70dc4024b2e0b91d9f37c398aba0525da5`; `origin/main` po fetch potvrzen na stejném SHA. Jantar validační claim již nebyl aktivní; integrační claim byl úspěšně získán před lokálními Git operacemi.
- Původní PR35 head `702bb2d9db373400c02413e951b02bc310f6b284` na base `86e4dd60` zůstává dosažitelný. Jeho failed CI je zachované v routing verification, včetně přesného neúspěchu stromového testu a přeskočeného buildu/SDK.
- Přijatá UI base obsahuje opravu čekání stromového testu na skutečnou `loadDetail` operaci. Všechny soubory mimo původních 18 routing cest jsou ve výsledku totožné s novou base.
- Nový merge commit `6a967d66c122dc53ed530217e9624c00c0b66932`, poté export vlastních dvou dokumentačních změn z `40087bfba311fb5fb754c8ce8ff6cbe29b14ae15` jako `58f4c05029d870a050475c918a8cfb75b998c3a2`.
- Závěrečná kosmetická oprava pouze dvou existujících CRLF řádků v adapter/runtime handoffech: lokální `6efc121cd6ee97651458b98789a54a7e6c6a277d`, exportní **`741a2ebcdb5e401c828f609484606784d68bb7cb`**, tree **`19143d7b789332869239f13f2516f9ba889d9269`**. Prázdný diff s `--ignore-space-at-eol` potvrzuje, že tento krok neměnil obsah. Finální diff check proti accepted base prošel.

## Řešení jediného konfliktu

První `merge-tree` bezpečně skončil konfliktem bez změny větve, pracovních souborů nebo skutečného indexu. Konflikt byl pouze v `tests/crazy-typka-provider.test.ts`: upstream přidal dvanáct onboarding asertů již přítomných v naší verzi, vedle nového asertu proti neopodstatněnému odvolání předchozí odpovědi. Oba konkrétní diffy byly přečteny; zachovány jsou všechny aserty.

Explicitně vyřešen pouze přesný konflikt blobů base `7fbd72ccf778074421fe974bc71de3b00b8f163a`, ours `899e0a99ea87bcda5c27538d09840d81603b16a2`, theirs `3ca22b7dfc2ad5d16c686484729405cc3f08f778`. Výsledný test zůstal byte-for-byte shodný s již ověřeným routing testem. Jakýkoli jiný konflikt by helper odmítl. Všechny routing zdroje/testy mají stejné bloby jako původní ověřený checkpoint; pouze uvedené vlastní dokumenty se následně změnily.

## Izolace a zveřejnění

Použity pouze `merge-tree`, `commit-tree` a vlastněný dočasný index v research cache; žádný checkout/reset/stash, zásah do Jantar worktree nebo přibalení KEY-67 WIP či starého b72 closeoutu. První exportní receipt ověřil nedotčený skutečný index a pracovní HEAD; následný vlastní commit se týkal jen dvou uvedených handoffů. Kontrola allowlistu zachovala přesně 18 cest diffu proti nové main base.

Receipts jsou v `.cache/rag-auto-20261028/decisions-base-update.json` a `decisions-handoff-whitespace.json`. Nový head byl odeslán běžným fast-forward pushem do `codex/decisions-routing`; [PR35](https://github.com/Varnahg/StrahovCrazyShow/pull/35) čeká na nové povinné CI a exact-head project acceptance.

Žádný místní build, fullsuite, DB, Docker, GPU, placené API ani síťový listener nebyl spuštěn. Žádný vlastní pomocný proces nezůstává. Lokální heavy-validation se po tomto mezihandoffu uvolňuje během vzdáleného CI. Před finálním integračním krokem nový claim a čerstvá kontrola PR head/base/gates; main publikační okno se dál koordinuje.

## Konečné přijetí — 28. 10. 2026

Před publikací znovu získán tentýž integrační claim s doloženým převzetím vlastního mezihandoffu. Admin výslovně potvrdil main okno; čerstvý PR a `ls-remote main` ověřily očekávaný head/base. Všechny required checks byly SUCCESS a PR byl po změně draft→ready ve stavu CLEAN.

- Verify `40759077463`: 2641 PASS, 0 FAIL, 1 SKIP; skutečný PostgreSQL/pgvector blok 11/11, TypeScript/Vite build a všechny čtyři bloky izolované SDK integrace PASS. Skip pouze kvůli nedostupnému lokálnímu záznamu stanice; Vite upozornění na velké chunky přiznané.
- Secret checks `40759077450` a `40759072224`: každý 7/7 testů, 6849 souborů, 0 kandidátních nálezů.
- [Exact-head project acceptance](https://github.com/Varnahg/StrahovCrazyShow/pull/35#issuecomment-6479514397) váže head `741a2ebcdb5e401c828f609484606784d68bb7cb` a accepted base `dc89ba70dc4024b2e0b91d9f37c398aba0525da5` na skutečnou evidence. Žádný ruleset bypass.
- Merge pomocí `gh pr merge --merge --match-head-commit` proběhl 20:14:08 UTC. Skutečný merge SHA **`801b2d07c884c51e42b0fc1a890e7a0f9dbc0196`** potvrzen PR API a fetchem `origin/main`; celý tree je přesně shodný s accepted headem.

KEY-68 je předán jako dokončený v main. Automatický dokumentový ingest a archiv KEY-67 nejsou součástí tohoto přijetí; jejich WIP zůstává samostatný. Místní pracovní větev nebyla přepnuta a neměnné servírované hry 4280/4278 zůstaly nedotčené. Po místním closeout commitu se integrační claim a dokončené adapter/runtime claims uvolní; žádné vlastní procesy neběží.
