# Předání: grass-cold-fix

- Vlastník: `fps-20261013-grass`; příjemce: koordinátor FPS optimalizací.
- Checkout/větev: `/workspace/StrahovCrazyShow`, `work`; výchozí commit `a381cf6`.
- Výsledek: průběžná příprava trávy a výběr aktuálního obrazu implementované, refaktorované a cíleně ověřené. Komponentové měření před/po a celou herní přejímku vlastní koordinátor.
- Soubory: `client/photographic-grass.ts`, `client/photo-grass-placement.ts`, nový `client/photo-grass-selection.ts`, `tests/photo-grass.test.ts`, nový `tests/photo-grass-selection.test.ts`, `tests/benchmark-snapshot.test.ts`, toto předání a `docs/verification-evidence/agents/grass-cold-fix/`.
- Cizí WIP: nepřevzatý; souběžné změny ostatních FPS agentů nebyly upravovány.
- Podklady: současný runtime, Babylon 9.30 API, původní geometrie/terén/mapové výluky; skutečný rozsah kamery 3–15 m v `client/game.ts`. Historický problém dokumentuje `grass-cold-audit`.

## Konečná architektura

Studené generování dlaždic má samostatnou frontu. Výběr aktuálního obrazu používá dostupné hotové dlaždice a publikuje užitečnou částečnou trávu, zatímco zbytek se připravuje. Nečeká na celé studené okolí. Fronta upřednostní aktuální hráčský focus; u první osoby viditelné popředí přibližně 4 m před kamerou. Okrajové dlaždice s centrem mimo frustum dostanou nižší prioritu, aby se čas neutrácel nejprve na neviditelné kořeny pod očima.

Výběr i samostatné generování mají každý kooperativní rozpočet 2 ms a nejvýše 256 kroků. Tile generátor předává řízení po 16 klasifikacích nebo 16 maticích; synchronní offline API vyčerpá stejný generátor. Cache publikuje pouze dokončenou dlaždici. Za update se dokončí nejvýše dvě studené dlaždice, přidá nejvýše 256 instancí a při plnění zkontroluje nejvýše 1024 kandidátů. Prioritní halda zachovává původní pořadí score/ID bez úplného závěrečného sortu; řazení se ukončí, jakmile nezbývá rozpočet ani na nejlevnější LOD.

Nový view zruší zastaralý krátký výběr při změně kvality, FOV/výšky, posunu přes 3 m nebo otočení přes přibližně 30°. Hotové cache dlaždice zůstávají použitelné. Změna cíle aktualizuje čekající dlaždice; již rozpracovaná dlaždice mimo aktuální dosah se uzavře bez publikování. Při pohybu proto lze průběžně dokončovat současnou viditelnou trávu. Samostatné opakovaně používané pooly chrání aktivní kandidáty před přepsáním. Dispose uzavře oba generátory a odstraní fronty, preferenční snapshot, haldu i oba pooly.

Preference starých kořenů a LOD se zachytí při změně pohledu. Doplnění cache ve stejném pohledu tento snapshot nemění, takže částečně zobrazené nové kořeny samy neposunou původní score. Konečný cold medium má přesně původních 1916 kořenů, souřadnic a LOD: SHA `481a3b9b1ad136fa18ab9d25e908daa85d0e51652a709ad77ba26014210f15c0`.

## Cache a zachované výstupy

Původních 256 cache položek nestačilo pro normální high třetí osobu: skutečné pohledy zahrnují přes 300–460 dlaždic. Cached-only výběr by je stále znovu generoval. Koordinátorem schválený pevný limit je nyní **1536 dlaždic**, tedy nejvýše **15 MiB matic** (proti původním 2,5 MiB). Není to zvýšení hustoty či render rozpočtu. Konzervativní obal pro radius 12 m a vodorovný odstup kamery/focus do 18 m (15 m orbit plus 3 m rezerva pohybu) má nejvýše `(26 + 18 / sqrt(2))² < 1536` grid buněk při libovolném natočení. Testuje se reálná statická kamera 8 i 15 m. Extrémní přechodné vzdálenosti mimo tento obal nejsou garance úplného pracovního setu; paměťový limit nadále platí.

Matice, zdrojové výluky, terén, metry, LOD definice, fade, tři společné meshe, atlas a stropy **60k/140k/280k trojúhelníků** se nezměnily. Nové statistiky `preparing` a `pendingTiles` rozlišují načtené textury (`ready`) od probíhajícího doplnění trávy; měření nemusí zaměňovat neúplný snímek za hotový výsledek.

Refaktoring odstranil nepoužívané pole vzdálenosti kandidáta, sjednotil dokončení/zrušení, ukončuje zbytečné řazení nevyhovujících kořenů a uvolňuje reference na nepoužité matice. Pouhá příprava cache již nepřepočítává statistiky všech vykreslených kořenů. Statický view se kontroluje v původním intervalu, nikoli každým dalším snímkem.

## Ověření

`pnpm exec tsx --test tests/photo-grass-selection.test.ts tests/photo-grass.test.ts tests/benchmark-snapshot.test.ts`: **21/21 PASS**, 14,43 s, exit 0. Log: `docs/verification-evidence/agents/grass-cold-fix/targeted-tests.log`.

- Přesné konečné souřadnice/LOD/ID odpovídají baseline. Tráva se objevuje při stále neprázdné studené frontě; příprava a přidávání dodržují jednotkové limity.
- Nezávislá halda odpovídá úplnému řazení 16 000 položek se shodnými score a všem třem původním rozpočtům.
- Dlaždice generovaná po částech odpovídá synchronnímu výsledku; zrušený generátor nezapíše cache.
- Ověřené změny kvality, teleport, ostré otočení, původní statické uploady, disposal obou front a poolů, průběžné trojúhelníkové limity.
- Syntetické pozice kamery odpovídající rychlostem chůze **4,6 m/s** a sprintu **7 m/s**, **30 simulovaných aktualizací/s**, přímá cesta po skutečné travnaté oblasti OSM `1316120376`, x=110 / z=45→101. Při pevných pracovních kvótách je po prvním 1 s simulace v kontrolních bodech vždy nejméně 100 kladně viditelných kořenů v **aktuálním frustumu a aktuálním dosahu 8 m**. Stejnou podmínku splňuje simulované souvislé otáčení 90°/s. Test nekontroluje pouze staré kořeny za kamerou; neprovádí však chůzi přes Rapier, neměří produkční FPS a negarantuje tento počet kořenů při přetíženém CPU.
- Skutečné high pohledy třetí osoby s focus odlišným od oka, rameny **8/15 m**, FOV 0,85: oba překročí 256 cache položek, úplně se ustálí a dalších 120 statických aktualizací nevygeneruje žádnou dlaždici ani nezmění počet kořenů.

`git diff --check`: PASS. Manifest runtime/testů: `docs/verification-evidence/agents/grass-cold-fix/source-hashes.json`. Závěrečné read-only review `ui_network_audit` nenalezlo blokující problém. Předchozí review zachytila skutečné problémy pohybu a cache, které výše uvedené regrese pokrývají.

### Dokončení po společné sadě testů

První společná sada odhalila závislost testu přímé chůze/sprintu na sdíleném CPU: ve sprintovém snímku 40 vzniklo jen 97 očekávaných viditelných kořenů proti požadovaným 100, protože reálné 2ms dávky při souběhu ostatních testů vykonaly méně práce. Vlastník znovu převzal svou existující rezervaci přes doložené `--adopt-dirty` a změnil pouze plánování tohoto testu. Jeho `performance.now` nyní používá syntetický pevný čas, takže každý simulovaný snímek dostává stejné původní jednotkové limity práce. Práh 100 kořenů, skutečné rychlosti, frustum, prostorový dosah i délka trasy zůstaly beze změny. Časové předávání řízení samostatně pokrývají regrese zrušení úlohy; výkonové profily nadále měří skutečný čas. **Tento test prokazuje logiku pokrytí při daném pracovním kvantu, nikoli výkon či hustotu za libovolného vytížení CPU.**

Opakovaná cílená sada včetně haldy a benchmark snapshotu: **21/21 PASS**, 22,06 s, exit 0; log `docs/verification-evidence/agents/grass-cold-fix/targeted-tests-deterministic.log`. Runtime soubory a jejich profily zůstaly beze změny; manifest aktualizuje pouze testový hash. Rezervace následně opět uvolněna koordinátorovi.

Druhá společná sada odhalila stejnou závislost na sdíleném CPU u statického high pohledu třetí osoby s ramenem 15 m. Po opětovném převzetí vlastní rezervace byly prověřeny všechny sémantické controller scénáře. Sdílený helper `fixedPreparationClock` nyní sjednocuje pevná pracovní kvanta pro cold parity, malý pohyb, kruhové i přímé trajektorie, otáčení, statickou třetí osobu, změny kvality, fade a životní cyklus. Stejný princip používá test benchmark snapshotu. Explicitní hodiny s přírůstkem **+3 ms** nadále samostatně ověřují předávání řízení a zrušení rozpracovaných úloh. Zachován původní limit **1200 snímků**, podmínka cache **>256**, **120** idle aktualizací i práh **≥100** kořenů v aktuálním frustumu. Jde o syntetické pozice kamery a pevné pracovní kvóty; výsledky neprokazují skutečnou chůzi přes Rapier, produkční FPS ani realtime záruku hustoty při přetíženém CPU.

Konečné cílené ověření: **21/21 PASS**, **23,04 s**, exit 0; log `docs/verification-evidence/agents/grass-cold-fix/targeted-tests-fixed-quanta.log`. Oproti druhému integračnímu snapshotu se změnily pouze testy `tests/photo-grass.test.ts` a `tests/benchmark-snapshot.test.ts` plus toto předání a důkazy. Hash všech runtime souborů a testu haldy souhlasí s předchozím manifestem; runtime i jeho naměřené profily zůstávají beze změny. Závěrečnou společnou validaci provádí koordinátor.

## Výkonové důkazy a limity

Koordinátorovy konečné profily jsou v `docs/performance/evidence/fps-drops-20261013/grass-final-{before,after,after-diagnostic}.json`. Driver `grass-cpu.ts` obsahuje původních pět scénářů a čtyři nezávislé studené pohledy sledované do úplného ustálení. **Všechny čtyři ustálené konečné hashe souhlasí s baseline.** Pouhé pevné okno 180 snímků nemusí ukazovat plnou hustotu; statistiky tuto rozpracovanost přiznávají.

První konečný běh mění maxima původních pěti scénářů přibližně **384→51 / 28→8,7 / 254→14,6 / 15→21 / 595→60,5 ms**. Snižování high→low má stále synchronní prune. Čerstvé úplné cold-medium/teleport/high/low se ustálily po **207/377/256/58 snímcích**; průběžná viditelná tráva se objevuje dříve. Celková CPU práce vzrostla přibližně 2–3× kvůli opakovaným částečným výběrům. Kompromisem je výrazně menší blokování jednoho update a dřívější užitečný obraz oproti čekání na celý studený výběr.

První fresh-teleport běh obsahoval také maximum **176,6 ms** (baseline 1038,5 ms). Následující diagnostický běh se stejnými zdroji a Node CPU/GC instrumentací toto maximum nezopakoval: maxima fresh-medium/teleport/high/low byla **16,0/7,9/9,6/3,8 ms**, GC maximum **18,24 ms**, shoda všech čtyř ustálených hashů opět PASS. Bez souběžného časového přiřazení nelze původní špičku poctivě označit za GC/JIT/CPU plánování. Oba výsledky zůstávají uchované; nejde o garanci update pod 16 ms.

Dva 2ms rozpočty nejsou tvrdý realtime limit celého update: commit, quality-prune, alokace/upload batchů a GC mají vlastní náklady. Jde o komponentový NullEngine profil, nikoli GPU FPS. Celkovou plynulost musí potvrdit skutečná produkční hra na cílovém GPU. Původní auditní driver zůstává nezměněný; meziverze kandidátních profilů nejsou výsledky konečné architektury.

Procesy: ukončené cílené CPU testy, žádný vlastní server/GPU/Blender/profil. Žádný commit agenta; společnou integraci a publikaci provede koordinátor. Po závěrečném předání je rezervace uvolněna; stav tasku mění koordinátor.
