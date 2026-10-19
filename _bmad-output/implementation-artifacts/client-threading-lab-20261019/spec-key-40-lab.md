---
title: 'KEY-40: rozhodovací profil před rozdělením klienta mezi vlákna'
type: chore
created: 2026-10-19
status: done
route: oneshot
review_loop_iteration: 0
---

<frozen-after-approval reason="explicitní uživatelský výzkum a následná realizace; projektová policy používá existující autorizaci">

## Intent

Zjistit, která skutečná CPU práce klienta má být prvním kandidátem pro worker, aniž se mění hraná verze. Výzkum a staré logy vyloučily fyziku jako hlavní přínos (0,34–0,38ms/frame) a doložily environment špičky až53,7ms vedle dominantního render bucketu. Samotné přesunutí scene.render není paralelizace.

V odděleném lokálním API/preview4204/2599 použít přesně současný frozen produkční source65d028 a již existující profileEnvironment=1, případně existující render benchmark. Žádná změna hry ani nové obecné diagnostické vrstvy. Odebrat reprezentativní foreground chůzi a zatáčení, rozlišit environment části a rozhodnout o nejmenším vratném worker prototypu podle ceny práce/přenosů/cache a rizika. Následná runtime implementace má vlastní specifikaci a rezervaci.

</frozen-after-approval>

## Implementation Notes

- BMAD renderer9b78 7dd88a77841d79f60052; zdrojový HEAD737e0c7abfe3677240b97e243521be46a516fcdd, cizí WIP nedotčené. Reference65d028 je uživatelský kandidát, nikoli celý přijatý main.
- Rozsah .cache/client-threading-lab-20261019 a vlastní evidence/handoff; task s heavy-validation/gpu/4204/2599. Čtecí závislosti/assets/dist se půjčí přes junction, nikdy se do nich nezapisuje; source/test soubory se ověří přes manifest a fyzicky zkopírují. API cache/logy mají nové cwd.
- Použít existující prepare/start/preview/stop/verify mechanismus z předaného userbuild4203, jen nové cesty/porty/vlastník. Ověřit HTTP identity a skutečné PID/start/path; pro ukončení pouze vlastní procesy podle zaznamenané identity.
- Přijetí: existující hrané4203 a starší beze změny; žádná cizí aktivní scéna během měření; úplné sekvence vlastních logů, source/backend/rozlišení/focus/scene uvedené. Background běh se nevydává za výkonový důkaz. Žádný FPS claim z profilu s diagnostikou.
- Profil je hypotézu rozhodující výzkum; celý KEY-40 se tím neuzavírá. Malý read-only tooling celek nevyžaduje herní fullsuite/build; nový runtime kandidát bude vyžadovat příslušné testy/build/integraci a skutečné A/B.
- Dokončeno: skutečná vlastní Edge relace,5500souvislýchrecordů,byte-exact source/HTTP, export benchmark/screenshot a raw archiv. Výsledek zúžil environment špičky na transit, ne samotný sampler. READYodkazy doplněny profileEnvironment dle nezávislého review. VlastníGPUscéna/okno/API/preview ukončeny a původní lab claim uvolněn; archivpřevzal validačnítask stejnému rootu. `done` znamená hotový úzký lab, ne runtimeoptimalizaci.
