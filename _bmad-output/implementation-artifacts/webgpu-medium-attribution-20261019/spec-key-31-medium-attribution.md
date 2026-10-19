---
title: 'KEY-31/32: přiřadit nové Medium programy současného F3'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Na Medium vzniklo během první jízdy po Ready 17 nových shaderových příprav a 18 synchronních pipeline. Přiřadit dodatečné requesty k materiálům pomocí již existující omezené diagnostiky v samostatné kopii současného F3. Získat podklad pro opravu přípravy a odstranění záseků. Hrané snapshoty i cizí WIP zachovat; tento diagnostický sběr není výkonová přejímka ani dokončení migrace.

</frozen-after-approval>

## Implementation Notes

- Rezervace webgpu-medium-attribution-20261019 / webgpu-01a15102-medium-attribution; root kopie, porty4200/2595, heavy-validation/gpu/workspace-build. Žádné mezery v zadání, nevratné změny ani nové produkční API.
- Současný clean F3 source3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03. Existující native-attribution/proof/source-parity.json obsahuje přesných pět preimages a nový šestý test. Přenos pouze jejich ověřených bytů, F3 patch MD3cc zachován. Současný Game má přesný donor preimage; staré závislosti/bundle nepřenášet.
- Varianty: odhad z obyčejné telemetrie nemá identity materiálů; nové hooky přidávají zbytečnou vrstvu; přenos reviewed bounded diagnostiky má malé a ověřitelné změny. Zvolen třetí. Stávající limity a cleanup se nemění; materiálová notifikace není skutečný draw/GPU čas. Žádná změna vzhledu, přípravy, cache ani herního chování.
- Assemble ověří všech576 zdrojů/testů, šest donor SHA/preimages, současný MaterialDefines; vytvoří vlastní source ID. Assets/public/docs/deps vypůjčené pouze ke čtení, vlastní nový dist. Cílené61 testy, fullTS/build, jeden Edge Medium2040×986/Alex/night průjezd. Plain webgpu query; explicitní lokální benchmark sám aktivuje attribution, bez profileEnvironment.
- Given nový request v lokálním benchmarku, when sběr skončí, then uložit request/user/defines a explicitní omitted/unmatched/error počty s raw relací. Given neúplnost nebo nereprodukce, then přiznat omezení a neurčovat neprokázanou příčinu. Nezávislé read-only review, vlastní procesy ukončit, commit/evidence/Linear, cíl zůstává aktivní.

- Výsledek:61/61+fullTS/build PASS; Edge17captured,0omitted/observerErrors,2mainleaves přiřazeny,15shadowbezpříméidentity. Zdrojovédefine vazby/deduplikace doložené, omezení vREADME. Služby/karta ukončeny.
- Review: původní exception-cleanup hypotéza po ověření validních weather/Observable/snapshot cest zamítnuta jako nedoložená; žádný blokující nález. Diagnostický task hotový, výkonová oprava a celý cíl otevřené.
