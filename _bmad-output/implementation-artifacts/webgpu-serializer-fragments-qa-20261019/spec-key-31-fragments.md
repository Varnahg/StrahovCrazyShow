---
title: 'KEY-31/32: vynechat neemitované fragment zápisy'
type: 'refactor'
created: '2026-10-19'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Ověřit, zda lze po přijatém F3 zlevnit opakovanou serializaci shaderových konstant bez změny jejích výsledků a pozorovatelného chování. V nové izolované kopii porovnat vynechání neemitovaných per-call fragment zápisů s F3; do runtime přijmout pouze doložený přínos. Zachovat hrané buildy a cizí WIP.

</frozen-after-approval>

## Implementation Notes

- Primární důkazy: přesný pinovaný materialDefines.js F3 SHA3cc739… a jeho caller PBR/Standard, předchozí schema/shared/differential/WGSL/warm/cold fixtures. Nový skutečný Edge profil main fe5b6177: entry toString37,4ms/499 z95,5ms přípravy; další24ms/431 z56,3ms. Tím je doložena cena rutiny, nikoli cena konkrétního vnitřního zápisu.
- Varianty porovnané čtecím podagentem: parser/sort už F3 hit nepoužívá; string-value regex nelze odstranit kvůli multiline/01/NaN/fallback. Complete-value memo bylo v produkčním pilotu odmítnuto bez doloženého p99/FPS přínosu. Densearray může spustit zděděné index settery a pooling ohrozit reentranci. Prefix metadata přidává řetězce a mění bounds/paměť; případný další oddělený pokus. Globální light invalidace má širší obrazové/readiness/lifecycle dopady, předchozí lease neprokázal zisk. Zvolen první nejmenší experiment: pouze přesun fragments[index]=fragment do existující fragment!==undefined větve v null-prototype lokálním objektu.
- Invarianty: opakované this._keys.length/_keys[index]/this[prop] ve stejném pořadí, inline coercion a původní throw; žádné další čtení hodnot/prototypu, zkrácení plné name-shody ani změna kanonického fallbacku. Žádná nová cache nebo persistentní stav. Per-call object nezanechá neaktivní vlastnost; pozdější chybějící read v nullproto vrací totéž undefined.
- Code map: nový cacheprefix vlastní task, readonly F3 native-clean zdroje/deps. Reuse původních fixture warm.test.ts/cold.test.ts/native-engine/trace/client a existujících semantic+WGSL testů. Loader nahradí jen přesné MD URL stejnou třídní identitou a zapíše skutečně načtený SHA. Inspect test musí číst skutečný kandidátní zdroj, nikoli starý fyzický F3. Původní fixture metadata se označí jako historický vstup, nikoli nová GPU identita.
- Given aktuální F3, when sparse kandidát běží, then differential corpus/getter/proxy/coercion/reentrance/fallback a Standard/PBR/WGSL výstupy budou shodné. Given původní per-call nullproto buffer, when neemitovaný index chybí, then ani po prototype pollution nevznikne zděděná hodnota či setter.
- Měření: proložené A/S/S/A/A/S whole warm/cold a synthetic churn; stejné draw/program/uniform invarianty, úplný source receipt, žádná browser/FPS extrapolace zCPU. Výsledek bez konzistentního přínosu odmítnout bez GPU; při přínosu pokračovat čistým produkčním A/B bez routine profileru v nové kopii.
- Bez nevyřešené otázky uživatelského záměru, nevratného efektu či veřejného API; oneshot. Nezávislé review, cílený refaktoring podle profilu, scope commit/main/Linear a předání skutečného výsledku.
- Výsledek: kandidát51b6ff… zůstává pouze QA. A/S26/26 včetně52-case differential, bounds/reentrancy/prototype, skutečné11WGSL/55states a GLB.6warm×5 a6cold×2 testů +2churn PASS. Receipt24, physical F3 nezměněn. Staré Windows import a chybějícífixture neúspěchy jsou zachované, finální runs03 úplný.
- Proložené3A/3S wholewarm mediány PBR4,7073→4,6211ms, Standard4,0861→3,9839ms, surface5,0113→4,9520ms; coldPBR10,7174→11,1265ms, Standard7,2825→7,3026ms. Pouze malý warm rozdíl bez konzistentního cold přínosu, proto odmítnuto; žádný nový GPU/build/runtimepatch. CPU výstupy/shader/layout/uniform parity přesné, nejde oFPS důkaz.
- Scope a závěrečný raw/evidence přezkum bez nálezů; všech139 archivovaných SHA/délek sedí. Done platí pro rozhodnutý experiment; KEY31/32/default i celé zadání nadále otevřené.
