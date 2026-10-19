---
title: 'KEY-40: zbytečné průchody scény při inicializaci materiálu postavy'
type: refactor
created: 2026-10-19
status: done
route: oneshot
review_loop_iteration: 0
---

<frozen-after-approval reason="autorizovaný výzkum a následná optimalizace CPU; existující oprávnění podle projektové BMAD policy">

## Intent

Před složitějším workerem odstranit doloženou zbytečnou práci, pokud ji potvrdí skutečná reprodukce. Nové NPC vytváří CharacterMaterials přes PBR settery, které v pinovaném Babylonu mohou opakovaně procházet cizí meshe celé scény, přestože nový materiál dosud nemá spotřebitele. V produkčním profilu je transit envelope až 79 ms; přesný podíl tohoto mechanismu zatím není znám a nesmí se vydávat za prokázaný FPS přínos.

Ověřit skutečný RED, porovnat veřejné dávkování počátečních setterů s ponecháním stavu a s workerem. Pokud reprodukce potvrdí redundantní průchody, použít per-material atomicMaterialsUpdate před publikací nového materiálu do existující cache. Zachovat všechny povrchy, textury, pluginy, pozdější invalidaci a lifecycle. Žádná nová cache, scene-wide suppression, výměna assetů, změna obrazu nebo patch SDK. Ověření celého buildu a GPU zůstává pod koordinátorem; CPU průchody nejsou FPS přejímka.

</frozen-after-approval>

## Implementation Notes

- Výzkum standardů a worker variant viz technical-client-threading-2026-10-19/research.md; samostatný read-only audit transit-renderer identifikoval potenciální setter amplification a zároveň nepotvrzené další větve (sampling, raycasts, creation/disposal/LOD).
- Přesný task client-threading-character-material-init-20261019: character-materials.ts, vlastní test, vlastní cache/handoff. Podagent implementuje, cíleně refaktoruje a ověřuje společně; rodič nemění jeho soubory během claim.
- Primární kód: material.pure.js _markAllSubMeshesAsDirty; pbrMaterial decorators; veřejné atomicMaterialsUpdate; již přijatý analog avatar-garments.ts. Změna pouze v novém nesdíleném materiálu, callback synchronní. Lazy textury/pluginy a invalidace po návratu vyžadují test.
- Čistý výsledek porovnání nebo nepotvrzený RED znamená neimplementovat domnělou optimalizaci. Ponechat výsledek a dál profilovat; složitější worker bez přínosu není splnění cíle.
- RED potvrzen pro13povrchů:128–352foreignreads na32wrappers; GREEN32/cachehits0. Implementace/constrefaktor,34targetedPASS,independentreview[]. Clean1491/1491aCombined1524/1524boundedfullsuite,oba pnpm build/TSaizolovanáintegracePASS. Prvnídefaultcleantest2readinesstimeoutyzachované;nezměněnéfocusedaboundedběhypassed.
- NativeEdge6editorpresetů+face/glasses/beard/recolor,wholegameMedium/day/walk,2ready+2dispose,1333rawrecordů,error0,benchmarkhealthvalid/pending0. Přesnáevidencevdocs/performance/evidence/client-threading-character-materials-20261019/. DonejenproúzkouCPUopravu;žádnýFPSbenefit/workerscopepřijat. SynchronizacezměněnéhopresetupřiMPrejoinneověřena.
