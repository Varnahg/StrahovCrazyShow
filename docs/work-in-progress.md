# Rozpracovaná práce soustředěná v main

Konsolidace na přímé zadání uživatele 29. 10. 2026. Jedinou pracovní větví je `main` a jediným pracovním checkoutem `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`. Nepokračovat ve starých worktrees a nevytvářet náhradní větve.

Aktuální hra zachovává přijaté CAD modely, stromy, síť, Jantar, Docker a RAG. Níže uvedené starší prototypy zůstávají **rozpracované**, neoznačují se za hotové a jejich historické varianty nepřepisují novější funkční kód. Jejich úplné zdroje, testy a historie jsou dostupné z historie `main` bez další větve. Změny, které šly bezpečně převzít samostatně, jsou přímo v současných souborech: nástroje recorded replay, chybějící browser CI a původní výzkumná evidence.

| Celek | Přesný uložený zdroj | Co ještě zbývá |
| --- | --- | --- |
| Avatar preview cache a uspání editoru | `67f19cbab72e1b7c2e5c9466403810ad3c4f7fca` | Přenést do současného async WebGPU/Jantar lifecycle; ověřit cold/open scénář. |
| Postupná stavba světa/ulic a startup diagnostika | `67f19cbab72e1b7c2e5c9466403810ad3c4f7fca` | Sladit se současným CAD a seasonal world; rozdělit zbývající atomické kroky a provést praktickou přejímku. |
| Static frustum a MeshDrawProfile | `67f19cbab72e1b7c2e5c9466403810ad3c4f7fca` | Experiment byl výchozí vypnutý; chybí srovnatelné produkční A/B. |
| Grass worker | `a786e3e6d6d60cee1432afc0a7c064fb8b4df1fd` | Pozastavený prototyp KEY-42, chybí skutečný browser/GPU důkaz přínosu. |
| Playtest diary, timeline a upload | `f02e98579ae5f2e6f058d02b2ec4647e15dcacb2` | Nedokončené typování/integrace a capture lifecycle; samostatná capture primitiva už má novější implementaci na main. |
| WebGPU hry/editoru KEY-22 | `a849399f8fec940ef8e1fca429cebb1e4b464966` | 115 původně oddělených commitů zachováno; přejímka nebyla dokončena, zůstaly dlouhé intervaly a multiplayer/recovery timeouty. Portovat konkrétní opravy do současného enginu. |
| Materiálový ACES kandidát | `557eb880b6caff433f2d8e87211b20165baa4c12` | CPU/build/integrace historicky prošly, GPU a barevná přejímka chybí. Původní wrapper ownership oprava už je přijatá na main. |
| Úplný RAG crawler/scheduler | `aa7ec976c9b3c5cee7a7d3a13b358c6697a68525` | Výzkum a podklady zachovány; dokumentový runtime už je přijat, úplné pokrytí katalogu ještě není hotové. |
| Tree authoring a modelové meziverze | `f4a066a0672fc3324d1daf05c0cfdd76a34094ce` | Uchovat autorské zdroje; aktivní katalog nepřepínat na historické modely se starou orientací. |
| WebGPU výzkum a nepřijaté kandidáty | `bdc8ff57ac3c1b89ad658ce1bd17b94a89d92000` | Referenční důkazy, nikoli automaticky přijaté runtime změny. |

Příklad pokračování přímo na main:

```powershell
git show 67f19cbab72e1b7c2e5c9466403810ad3c4f7fca:client/avatar-preview-cache.ts
git diff 67f19cbab72e1b7c2e5c9466403810ad3c4f7fca^ 67f19cbab72e1b7c2e5c9466403810ad3c4f7fca -- client/avatar-preview.ts client/avatar-renderer.ts
```

Poté přenést pouze příslušnou logiku do aktuálních souborů, získat souborovou rezervaci, ověřit a commitnout na main. Plošné obnovení starého stromu by ztratilo novější úpravy.

Úplný [inventář snapshotů](verification-evidence/main-consolidation-20261029/worktree-snapshots.json) obsahuje 12 zachycených dirty stromů, 1 184 výskytů změněných souborů a SHA-256. Nezávislá kontrola potvrdila všechny bloby a všech 23 unikátních LFS objektů. [Původní refs](verification-evidence/main-consolidation-20261029/refs-before.json) a [původ převzaté evidence](verification-evidence/main-consolidation-20261029/evidence-import-manifest.json) umožňují dohledat zbytek. Dva historické stashe (`8e8713966deda43d23962038115db586006cc8ce`, `860b77aeeab8799a9bafc9386ae54ed6d6ddb511`) jsou zachovány včetně jejich indexových a untracked rodičů; odpovídající funkce už main obsahoval.

Ignorované neveřejné podklady a mezivýstupy mají místní obsahový archiv `.cache/main-private-preservation-20261029/`; tajemství a databáze nejsou v Gitu. Historické úkoly a handoffy popisují stav v době vzniku. Jejich staré cesty nejsou pokynem znovu založit pracovní kopii.
