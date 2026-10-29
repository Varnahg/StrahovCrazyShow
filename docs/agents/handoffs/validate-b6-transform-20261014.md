# Předání validačního checkpointu B6-01

Vlastník `repairs-01a13624-b6-validation`, managed worktree `C:/Users/rezac/.codex/worktrees/playtest-repairs-wave4/StrahovCrazyShow`. Kandidát `cbc158068138e3454a6959a0d7a945465ea2974e6c246e86ed231abf92a4b5dc`; základ wave3 `0f20b5a7c7ba9ce5ab9aa16bba3b0a6886823152a322be2724fd2cdad41d6248`. Snapshot obsahuje8407vstupů/510source-config-tests; přesný rozdíl jen B6modul a nový lifecycle test. Žádný glTFfastpath nebo dalšíruntimefix nebyl přimíchán.

Skutečná pipeline14.10.12:36:33–12:40:58UTC:878/878 testůPASS, buildPASS, celá SDKintegracePASS, všechnyexit0. Žádná tolerance manévrů se nezměnila. Původní průběhy ani logs se nepřepisovaly. Samostatný Git archive91ee88fclient/shared + B6fix/test prošel4/4 a potvrzuje nezávislost tohoto commitu na ostatnímbootstrapWIP. Přesná evidence a omezení jsou v `docs/performance/evidence/b6-transform-20261014/README.md`, `checkpoint.json`, `pipeline.jsonl`; plnélogs v `.cache/b6-transform-validation/`.

Dočasný produkčníserver: API PID28740/startUTC2026-10-14T12:42:39.3135761Z, preview PID24024/startUTC2026-10-14T12:42:39.3257718Z, port2581/4186. cwd `.cache/b6-transform-validation/candidate`; příkazy a vlastníci v runtime-candidate-20261014.json. Health přespreview200, stderrbezvýstupu. CUA nemělo žádný připojenýbrowser a pokusy oIAB/Edge bylyunavailable; appbrowseropenbylqueued. Žádná GPUscéna proto neběžela a GPUvýkon se netvrdí.

Uživatel požádal „teď nemůžu, připrav to na později“. Předaný QApostup má baseline i candidate, zachovanébuildy, explicitněoznačenéuloženépočasí, unikátnírunmetadata a stopověřeníPID/UTCstart/command. První stopskript narazil na PowerShellautomatickydekódovaný DateTime; před Stop-Process selhal, nikoho nezastavil. Opravené typed/invariantculture čtení pak ověřiloidentitu a ukončilo oba vlastníPID. NáslednýCIMvýpis obouPID prázdný;4186/2581/2568volné. Žádné validačníhelpery nezůstaly.

Root ukládá samostatný kandidátní commit. Integrace do main a uzavření KEY-16 čekají na praktickou grafickou přejímku; dokumentační výzkum už je na lokální main v commitu 10fa69b057b90696f1eaadc0b520caceb0dfbf44. Cizí WIP, původní preview a stale rezervace se neměnily. Po commitu a předání se tato validační rezervace uvolní; při další přejímce znovu rezervovat porty, GPU a heavy-validation a ověřit aktuální dostupnost prostředí.

## Obnovené přímé URL — 14. 10. 2026 16:16 Praha

Na nový pokyn uživatele otevřít adresu bez Computer Use běží candidate na http://127.0.0.1:4186/ a API2581. Před startem package agent ukončil vlastní pnpm proces; root získal validate-b6-transform-20261014 jako repairs-01a13624-b6-validation v této worktree. Živá rezervace se zatím neuvolňuje: drží vlastní služby pro uživatele.

Přesný provozní runtime (PID, UTC start, příkaz), HTTP důkazy a další výstupy jsou v .cache/b6-transform-validation/runs/candidate-20261014-141603-418-37498c6a/. Skutečná CIM identita obou procesů souhlasí s runtime.json. Ověřeno510/510 source/config/test hashů a byte shoda servírovaného HTML, obou JS chunků a CSS; health200. Původní main dependencies a všechny B6 aliases zůstávají beze změny, schema5.0.36 a původní core hashes znovu ověřené. Kandidát stále cbc158…/f63039b; nový ownership patch není jeho součástí.

Open_in_codex s přímým URL vrací queued. Skutečný render/GPU zatím nepotvrzen; nejde o přijatý výkonový A/B. Recorder začne automaticky po načtení stránky; JSONL jsou v candidate/.cache/game-diagnostics a před retencí je koordinátor přiřadí ke konkrétnímu runu. Před dalším těžkým procesem nebo změnou varianty ověřit, zda uživatel právě hraje. Při ukončení použít původní stop-qa.ps1 s přesným runtime.json a ověřit zánik; nezastavovat podle portu ani stáří.

14.10 následný převod: před zastavením nebyl žádný připojený klient ani nový herní log. Původní runtime byl korektně ukončen a jeho zánik ověřen; cache obsahuje closed-for-preview-transfer.json. Dostupné uživatelské URL převezme samostatný serve-b6-candidate-20261014 pouze s porty, protože samotné servírování není probíhající GPU přejímka. Původní validační rezervace se uvolňuje až po ověřeném stopu; žádná hotová obrazová přejímka se netvrdí.
