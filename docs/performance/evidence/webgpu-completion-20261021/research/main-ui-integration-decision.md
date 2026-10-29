# Samostatná integrace převzaté opravy UI ownership

Čtecí audit 24. 10. 2026, root + webgpu_renderer_audit. Remote main a origin/main jsou `9341bcef674de81abd9ae99f1afbf211672165d4`. Celý draft PR23 nadále nemá finální funkční/výkonovou přejímku. To samo neblokuje integraci nezávislé opravy.

## Zvolený nejbližší celek

Commit `02fdf68b2ec739b51088b2cdf7c1c11b7157719d` opravuje úklid vlastní multiplayerové Room při selhání asynchronního startu. Původní callback nesmí ukončit novější Game/Room ani zrušit nový pending join. Odděluje vlastní Game disposal a sdílí vlastněný disconnect/leave cleanup. Veřejné Game/Room API a backend/default zůstávají původní.

| Soubor | Přesný base blob: main =02fdf parent | Přesný přenášený blob02fdf |
| --- | --- | --- |
| client/ui.tsx | b91c6be05d1f8186ff77728ad440556c0dae6086 | b2f1da8404e8c24dae2678fc92f21c164ac5dba2 |
| tests/room-callbacks.test.ts | 45a21b78ef3df85eb7351e6d1786e057e0020c51 | 1c784400c0b1972cba25e0047f019c1e7865dcdf |

Cílové SHA256: UI `6aa94cf9ecd4278ef68c1e5a98377503f5bd96c667fe51e24e3ef5ac941562fe`, test `24645eda0e42414f614cc84ecc5cce68a1f0d3143bcd8bbeaa06bb560d701f23`. Převzít tyto konkrétní historické soubory, nikoli dnešní HEAD UI, které už používá nové StartupPreparationViews/completeStartupPreparation. Původních deset commitových souborů nezávisle ověřeno; kompaktní manifest path/sha256/bytes má SHA `230dd74460fe406ef13b080b2d2f39861c7de7ab40eb5142c11476bde307a653`.

Historický skutečný UI-effect RED0/2 a finální64/64/scopedTS0 jsou v ui-startup-ownership evidence; raw verification `fc364cbdc4638858ae25e7f269c33239dd169f9dcf5efe181b17d4ffc77b7a77`. Pokrytí zahrnuje factory/start failure, deferred leave/rejoin, novější pending attempt, stale Game/Room, Guest i throw/reject při leave. To je podklad výběru, nikoli nový test kombinace s main.

## Varianty a náklady

- **Samostatná UI oprava:** uzavřená source závislost, nemění native engine, shaderové varianty, vzhled ani caches. Nová samostatná pracovní kopie a vlastní dependencies z main lock/patch jsou nutné; dnešní root native sada obsahuje jiné patche. Zvoleno pro nejbližší izolovanou integraci po ověření.
- **Receiver subset:** čtyři runtime a čtyři přímé testy lze zdrojově oddělit, ale na main zůstávají jen Low a dvě car etapy. Nelze na ně přenést source14 firstF0. Vyžaduje nový úzký kontrakt a přejímku takové kombinace; není první nejlevnější celek.
- **Celý aktuální PR23:** zahrnuje další Game/native/default změny a nemá finální výkonovou matici. Není nyní přijatý celek.

## Ověření plánované kombinace

Zachovat cizí WIP v primárním checkoutu a běžící avatar probe v současné větvi. Před zápisem rezervovat přesné UI/test/handoff/evidence/config outputy ve společném registru; vytvořit izolovanou pracovní kopii z ověřeného main. Nevkládat jiné runtime diffy ani dnešní migrační package/lock/native patch. Instalace, build, celá sada, integrace a GPU/browser práce pouze v dalším výslovném resource okně po CAD checkpointu. Při vytváření managed worktree počítat i s případnými setup scripts; žádná skrytá instalace během CAD heavy.

Nový checkpoint má použít vlastní main dependency target, původní room-callbacks/game-render-engine/network-input-buffer cílené testy, plnou sadu/TypeScript/build/izolovanou integraci a odpovídající browser MP start→leave→rejoin i Guest. Kontrolované startup failure/cleanup musí mít konkrétní reprodukci s původním UI effectem; případný pouze CPU důkaz výslovně odlišit od browserového selhání. Main WebGL2 default i loopback omezení zůstanou původní. Před merge přesný head/base, nezávislé review/CI/project-acceptance a expected-head merge; žádný bypass.

Zatím jde o rozhodnutí a dependency audit. Nová pracovní kopie, instalace, další PR ani main integrace tímto dokumentem ještě nevznikly.
