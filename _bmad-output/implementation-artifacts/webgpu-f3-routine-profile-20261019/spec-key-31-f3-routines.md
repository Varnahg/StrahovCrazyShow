---
title: 'KEY-31/32: zbývající CPU rutiny po F3'
type: 'chore'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Po přijatém F3 přetrvávají interakční záseky nad 100 ms. Změřit současné dominantní materiálové rutiny existujícím omezeným profilerem v nové izolované produkční kopii a z výsledku určit další opravu. Neměnit hrané buildy, nativní renderer ani cizí WIP; instrumentované FPS nepovažovat za srovnávací přejímku.

</frozen-after-approval>

## Implementation Notes

- Průzkum: aktuální native-clean-f3 má source 3c4be6d025f8524687e2eeb1cdf8f99f1c007ef12593ddda7c7db1ceb650fa03; přijatý runtime main 9edcc05132df1b3f9aa2c37c897fd11b29dad5fe. Starý routine QA má stejné společné app zdroje kromě dvou doložitelných diagnostických změn Game/render-cost. Jejich přesná inverze se musí shodovat s F3 základem. F3 patch, lock a nové testy se přebírají výhradně z F3.
- Varianty: čisté opakování benchmarku neměří zbývající rutiny; nová diagnostická vrstva by přidala neověřenou režii a lifecycle; zvolený existující max8 timer poskytne konkrétní nested walltime a již má obnovu při ukončení/chybě. Žádné hodnotové memo ani další cache.
- Code map: .cache/webgpu-routine-profile-20261019/candidate-v1 obsahuje qa-routine-profile.ts, mesh-draw-profile.ts, Game fixture a oba helper testy; qa-provenance/light-switch-profile/source-inverse.json a routine-profile/patches.json dokazují QA delta. Nový assembler smí zapisovat jen pod .cache/webgpu-f3-routine-profile-20261019/. F3 deps jsou pouze čtecí junction, přímé node příkazy neprovádějí pnpm auto-install.
- Given aktuální F3, when sestavím QA, then všechny původní zdroje/testy zůstanou přesné kromě dvou deklarovaných diagnostických souborů; dodané helpery mají doložený původ a původní F3 toString dostane původní receiver.
- Given běžící Edge Low/night/1 skutečná relace, when první vstup do auta a jízda změní světla, then se uloží nejvýše osm vzorků osmi rutin, source/rozlišení/health a úplný raw záznam. Nested inkluzivní časy se nesčítají jako nezávislé části ani GPU čas.
- Ověření: cílené helper/Game/mesh testy, TypeScript a izolovaný build; jediný produkční capture, restore/health/cleanup a hash hrané 4199 před/po. Rozdílná simulovaná zátěž se přizná. Samostatné čtecí review, evidence, scoped commit/integrace a Linear. Žádný otevřený záměr uživatele, nevratná změna ani nové veřejné API; proto oneshot.
- Implementováno: exact-inverse assembler, původních585 souborů se source46dab140…, F3 payload3cc739…, stávajících8 rutin. 32/32 targeted, TS/buildPASS, source před/po shodný. Jediný Edge Low/night/1actual/0ambient sběr: entry serializer37,4ms/499, další24ms/431; žádný health error ani nový program. Instrumentované52,6FPS/max174ms nejsou čisté A/B.
- Lifecycle: tři vzorky, cleanup errors/restoreConflicts0/0; návrat menu, pouze vlastní služby a karta ukončené, rozlišení obnoveno,4199 před/po stejných17bajtovýchSHA. Zachovány startovací neúspěch a bootstrap/reload log. Evidence50 hashovaných artefaktů.

## Review Triage Log

- Medium, patch: provozní runtime/PID receipts v připravovaném archivu porušovaly AGENTS. Nahrazeny označenými provenance projekcemi bez processes; plné receipts jen ignoredcache, raw GPU/session beze změny.
- Low, patch: README sliboval encoded délky, manifest obsahoval jen původní. Doplněno encodedBytes všech50 položek a znovu ověřeny SHA/délky.
- Následný nezávislý přezkum obou oprav: []; raw GPU/session SHA zachována. Done platí pouze pro tento příčinný profil; KEY31/32 a cíl zůstávají otevřené.
