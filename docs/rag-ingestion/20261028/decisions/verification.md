# Ověření routingu podle složitosti · KEY-68

Implementace a nezávislé review jsou dokončené; finální CI a integrace do main ještě čekají. Tento checkpoint mění pouze Decisions adapter, serverový výběr generátoru, jeho testy a serverovou konfiguraci. Automatický dokumentový ingest, plný katalog a oddělený vektorový archiv zůstávají rozpracované v KEY-67 a nejsou vydávány za dokončené tímto záznamem.

## Skutečné API

[Bezpečná evidence](live-evidence.json) obsahuje zdrojové hashe, syntetické případy, pravděpodobnosti, usage, latence, požadovaný a pozorovaný model, stav HTTP a výsledky replay. Neobsahuje API klíč, autorizační hlavičky ani skutečné uživatelské chaty. Celé diagnostické modelové odpovědi zůstaly jen v ignorované cache; veřejně jsou jejich hashe a délky.

- Přesný endpoint `/v1/decisions`, model `gpt-6-luna`, dvě nezávislé predicate otázky skutečně běžely. Zpracování 24 předem označených příkladů dosáhlo při prahu0.80 výsledku24/24 očekávaných tiers, bez falešné eskalace v této sadě. Obsahuje16 kalibračních a8 oddělených holdout případů. Při0.90 se minula jedna náročná kalibrační úloha. Malá syntetická sada není zárukou produkční přesnosti.
- Adapterová latence na těchto24 různých malých vstupech: p50 přibližně378ms, p95 přibližně1203ms. Obsahuje přenos a validaci body. Není to měření všech velikostí vstupu, celého produkčního RAG nebo srovnávací benchmark generátorů.
- Malý HTTP harness na127.0.0.1:4268 používal skutečnou moderaci, Decisions a Responses. Retrieval byl výslovně injektovanou schválenou evidence fixture; **nešlo o nové SQL ani embedding ověření**.
- Potvrzené requested iobservedmodel: `gpt-6-luna` pro přímý dotaz, `gpt-6.1-sol` pro syntézu. Po vyčerpání complex capu další náročný dotaz použil Lunu; totéž při chybějících lokálních podkladech. Všechny čtyři odpovědi HTTP200, replay beze změny těla a bez dalších placených kroků, reset204.
- Sol v prvním průchodu zbytečně opravoval předchozí správně doloženou odpověď jen proto, že její úryvek nebyl v novém výběru. Jedna provider instrukce nyní rozlišuje chybějící důkaz od důkazu chyby. Nová plánovaná Luna→Sol dvojice tento konkrétní problém již neobsahovala, při zachovaném routingu, citacích a replay.
- Celkem30 Decisions pokusů,6 Responses generací (z toho2complex) a12 moderací. Vše potvrzené,0uncertain. Responses cap byl explicitně zvýšen4→6 až po release/předání; původní ledger zůstal zachovaný. Žádný automatický retry ani další generace po vyčerpání capu.

## Kódové ověření

Závěrečná cílená sada adapter/provider/service: **94PASS,0FAIL,0SKIP**. Scope strict TypeScript prošel. Pokrývá serializované endpointy/modely/effort, validaci odpovědi, celkové i kumulativní bajtové capy, souběh posledního complex slotu, nestandardní práh, potvrzené reasoning usage, fallback, reset/shutdown/disconnect/deadline, source expiry a replay.

Tři nezávislé vrstvy review našly a následně uzavřely:

1. Nepodporované none/minimal pro známý Sol se odmítají před placeným HTTP.
2. Potvrzené reasoning tokeny se zachovají a nepřičítají znovu k output/total.
3. Expirace při skutečném backend capture zachová409cancelled přes embedding callback, bez embedding HTTP nebo generace.
4. Regrese pro postupné vyčerpání bajtového limitu a skutečný účinek prahu0.9 nyní zachytí původně neověřené mutace.

Přesná triáž je ve [specifikaci](../../../../_bmad-output/implementation-artifacts/rag-auto-20261028/spec-key-68-decisions-routing.md). Re-review potvrdilo uzavření všech doložených nálezů bez dalších regresí. Změny po živém ověření zachovaly platný wire request a otázky; nebylo potřeba znovu platit stejnou evaluaci.

## Konfigurace a provozní hranice

Dosavadní `OPENAI_MODEL`/`OPENAI_REASONING_EFFORT` zůstávají simple cestou. Ověřená dvojice je Luna/none a Sol/low; complex model je konfigurovatelný serverem. Při nejistotě či nedostupném routeru zůstává dosavadní moderovaná levná cesta. Zrušení operace žádný fallback nepovoluje.

Výchozí capy jsou500 Decisions pokusů,1000000 konzervativních UTF-8 rezervací a20 complex generací za běh procesu, plus dosavadní celkový generation cap500. Nejde o trvalý finanční limit ani přesný tokenizer. Complex cap0 vypne eskalaci. `usage()` odděluje potvrzená a neznámá čerpání; obsah dotazů se do metrik neukládá. `low-confidence` ve fallback čítači znamená nedosažení požadovaného prahu pro complex, nikoli nutně nejistotu mezi oběma třídami.

Žádné Node závislosti ani nový veřejný DTO/SQL/klientský protokol tento checkpoint nepřidává. Převzatý Jantar onboarding má být integrován až s odpovídající přijatou UI base. Veřejný host nebyl těmito lokálními testy nasazen a stále vyžaduje provozní konfiguraci jeho správce. Všechny vlastní validační HTTP procesy byly ukončené.

## První export a CI

[PR35](https://github.com/Varnahg/StrahovCrazyShow/pull/35) má samostatnou větev `codex/decisions-routing`. První exportní head je `702bb2d9db373400c02413e951b02bc310f6b284`, base `86e4dd603ca1b91e3eaa5f84573f9481be410a29`. Přesně 18 routing souborů odpovídá původním ověřeným blobům; změny KEY-67 a starší dokumentační closeout nejsou zahrnuté. Export použil izolovaný dočasný Git index bez přepnutí nebo změny pracovních souborů.

[Verify 40752514245](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40752514245) skončilo neúspěšně: **2622 PASS, 1 FAIL, 1 SKIP**, 2624 testů, přibližně 438 sekund. Skutečný PostgreSQL/pgvector test a nové router regrese prošly. Jediný skip patří nedostupnému lokálnímu záznamu stanice. Checkout byl testovací merge `701460bbfc1c4715bd3e023358a9c34d412f6961` nad uvedeným head/base.

Selhal nezměněný test `v4 wood-only fallback permits complete card coverage and still preloads original detail foliage` v `tests/tree-cluster-streaming.test.ts:239`: `group.active` bylo 2 místo 0. Test po spuštění detailního načítání čeká jen 12 `setImmediate`, zatímco kontrola SHA-256 obsahuje asynchronní `crypto.subtle.digest`; počet ticků není bariérou dokončení. To dokládá možnost předčasné aserce, nikoli samo o sobě konkrétní příčinu v CI. Izolovaný přímý Node běh stejného testu dne 28. 10. 2026 prošel **1/1** (test přibližně 90 ms). Nález a důkazy byly předány vlastníku stromů; žádný soubor stromů nebyl v tomto tasku změněn. **Build a multiplayerová integrace byly v tomto CI přeskočené, nemají tedy úspěšný výsledek.**

[Source secret hygiene 40752514285](https://github.com/Varnahg/StrahovCrazyShow/actions/runs/40752514285) prošla: 7/7 testů, 6804 kontrolovaných textových souborů, žádný kandidátní nález. PR zůstává draft a čeká také na přijatou UI base z PR33; finální sloučení ani veřejné nasazení tímto checkpointem nejsou doloženy.
