# Uživatelský WebGPU build4195

Vlastník `webgpu-day13-user-build-01a14497`, rezervace zůstává aktivní pro běžící preview/API. URL **http://127.0.0.1:4195/?renderBackend=webgpu**, API2590. Source snapshot205b4dda8028dd20b90dbd75177ba6ebd8d3fcf41d02cd97a8c44c42a6b9d05d, odpovídá nativnímu commitu61377f6153/main0703258da7 a explicitně zachovaným combined working features. Výchozí renderer projektu tím není přepnutý.

Vše ve vlastní `.cache/webgpu-day13-user-build-20261018/`: snapshot-v2 (source/tests), build-identity-v2.json, runtime-v2, prepare-v2.mjs/start-v2.ps1/stop-v2.ps1. Dist a pinned dependencies jsou read-only odkazy do dokončeného immutable quality-combined-v1; tuto verzi nikdy nerebuildovat. Další změna dostane jiný snapshot. Běžné počasí a produkční API, bez HMR či memo cache. Provozní PID jsou pouze v lokálním runtime záznamu.

Build/fullTS,1427testů a izolovaná integrationPASS. Aktivní Edge vstup, auto→low prvníF a high/medium/low roundtrip zdravé. Startup~58s; původní~4s prvnílowF nyní~150ms, zbývají kratšíhitches aFPS. Přesnéexporty/raw/snímky jsou vedlebuildidentity; podrobnépředání Gamequality tasku omezuje rozsah přijetí.

První snapshot bez qualitymatrix (`snapshot`,runtime) je zachovaný a služby zastavené. Jeho neaktivnítab timeout a následná platná reprodukce auto-low4s nejsou přepsané. Hrané4193/4192/4188 se nemění. Před dalšími GPU/heavy testy ověřit, zda uživatel novou4195 právě nehraje; předání URL není souhlas přepisovat tuto živou verzi.


## Odstavení na pokyn koordinátora KEY-44 — 19. 10. 2026

Vlastní API a preview procesy byly po ověření přesné identity ukončeny; porty jsou bez listeneru. Snapshot, build, závislosti a veškerá evidence zůstávají zachované. Procesní rezervace se po tomto předání uvolňuje; před restartem je nutný nový claim. Souhrn vlastníků, obnovitelných cest a operačních receipts: [webgpu-hitch-validation-20261017.md](webgpu-hitch-validation-20261017.md), oddíl Pozastavení a předání koordinátorovi KEY-44. Žádný commit, integrace ani nový test/build/GPU běh.
