# Příprava světel auta před první jízdou

Uživatelský průchod na 4196 potvrdil přetrvávající záseky celé hry. Tento celek řeší pouze chybějící varianty nízké kvality světla auta. Předchozí příprava používala svítilnu hráče se stíny, zatímco auto na low používá světlo bez stínů. [CPU důkaz](../user-4196-20261018/vehicle-proof/review.md) prokázal dvě chybějící PBR varianty; nejde o vysvětlení všech uživatelských záseků.

Kandidát vloží dvě etapy s reálným autem a 0/1 dalším bodovým světlem před původní přípravu. Nemění jeho transformaci, hráče ani fyziku. Obnovuje konkrétní vlastněné vizuální uzly, včetně chyby, timeoutu, výměny či zániku. Limity 30 sekund na kvalitu a 90 sekund celkem, úplná readiness a závěrečné vykreslení zůstávají. Ostatní backendy a kvality původní etapy zachovávají. Volitelný místní shaderový inventář má prostor pro dvě nová jména; běžná hra inventář nezapíná.

## Produkční pilot A1 → B1 → A2

Edge, NVIDIA GeForce GTX 1060 6 GB, ovladač 582.28, jeden skutečný multiplayerový klient, HUD, low 77 %, noční náhled, řízené počasí. Interní rozlišení 1470×666; CSS B1/A2 1912×866, A1 1912×867. Měření obsahovalo první nastoupení, W po 8 sekund a ruční brzdu 2,5 sekundy. Během desetisekundového sběru byl panel zavřený a neprobíhalo čtení DOM ani snímkování.

| První jízda | Původní A1 | Kandidát B1 | Původní A2 |
|---|---:|---:|---:|
| FPS | 38,1 | 42,0 | 37,0 |
| p95 | 27,6 ms | 31,8 ms | 27,7 ms |
| p99 | 314,9 ms | 230,9 ms | 327,9 ms |
| Nejdelší snímek | 803,7 ms | 424,1 ms | 865,7 ms |
| Snímky ≥100 ms | 6 | 6 | 6 |
| Nové programy | 12 | 4 | 12 |
| Nové moduly / sync pipeline | 24 / 15 | 8 / 6 | 24 / 15 |

Při vstupu do auta vzniklo 5/2/5 nových programů; při poklesu počtu světel 3→2 vzniklo 6/1/6. Příprava materiálů prvního vstupu A1→B1 klesla z 247,7 na 159,7 ms. Zásek u nově viditelného listí zůstal: jeden nový program ve všech bězích. Hromadné přepnutí materiálových efektů se téměř nezměnilo (571→569). Dlouhé intervaly po renderu nejsou změřeným GPU časem.

Ustálené A1/B1: 58,6/58,3 FPS, p95 21,7/22,3 ms, p99 27,6/30,1 ms, maximum 39,5/42,9 ms, žádné nové shadery či pipeline. Kandidát připravil 41 etap, kontroly 39; všechny dokončené, health valid, pending 0 a render/asset errors 0. Příprava B1 trvala 47,00 s proti 42,15/46,34 s v kontrolách. Rychlejší start není cílem tohoto zásahu.

**Přijetí je dílčí.** A2 podporuje účinek opravy proti pouhému zahřátí cache, ale jediný B běh není obecnou výkonovou zárukou. P95 se nezlepšil a počet snímků přes 100 ms neklesl. B1 dojel zhruba o 11 m dál, takže pozdější části nejsou polohově ani pixelově totožné. Jemné profilování bylo zapnuté ve všech třech bězích; nejde o konečnou přejímku bez diagnostiky ani o WebGL2/WebGPU matrix či test tří relací.

## Důkazy a ověření

- [Přesná čísla a zdroje](comparison.json), [nezávislé kontroly a jejich omezení](qa-review.md).
- [A1](runs/a1.jsonl.gz), [B1](runs/b1.jsonl.gz), [A2](runs/a2.jsonl.gz): úplné raw záznamy v gzip, původní hash v [manifestu pilotu](pilot-manifest.json). Stejně jsou zachované úplné UI benchmarky v `benchmarks/` a obrazy v `images/`.
- Kontroly používají zdroj `5d247248f50a762877e9079bb4fcd65280e959e8014eb3f65b2662e397c518cb`; [kandidát](qa-source-manifest.json) `5c6b36ad783a332030bf21f25344d17b43e6ea0005c9f0bb5a754bae7444c483`.
- V1 review našlo chybějící kontrolu zániku jednoho uzlu během lease. Obě regrese nad V1 selhaly očekávaným způsobem; V2 má 31/31 dotčených testů a scoped TypeScript 3363/0. Původní 47/47 + 26/26 a neúspěšný první testový běh zůstávají uchované. Závěrečné review V2 nemá další nálezy.
- Přenos do čistého kódu má 49/49 cílených testů, 26/26 souvisejících a scoped TypeScript 3361/0. Přesná shoda metody s V2 a opačná aplikace změn prokazují zachování původních nativních bajtů mimo vlastní delta.

Hrané 4196/4195 a starší snapshoty se nemění. KEY-31 a migrační cíl zůstávají otevřené; přetrvává listí, drahá změna materiálů i nevysvětlená část dlouhých intervalů.

## Integrace a předání

Runtime `a86136ef6183c4319cce0bb41b5ed638542b0d3e` → main `42f7336f7e3bf9e651e6ee921ef9dad63cf580cd`. Přesně čtyři soubory, dva zachované kombinované překryvy a 132 dalších pracovních cest beze změny. [Integrační záznam](runtime-main-integration.json). [Čistý checkpoint](clean-validation.json) má 1387/1387 testů; [kombinovaný](combined-validation.json) 1447/1447. Oba prošly TypeScript/build a izolovanou integrací bez skipů nebo driftu. Kompletní logy jsou uchované jako gzip.

Nový neměnný build http://127.0.0.1:4197/?renderBackend=webgpu, API2592, stejný kombinovaný zdroj 5c6b36ad. [Identita](delivered-build-identity.json), [obraz](delivered-build.png), [root smoke záznam](delivered-session-summary.json). Běžné počasí, jemný profiler vypnutý: auto low77 %, CSS1912x866/interně1470x666, 57,8FPS/p9522ms/p9930,9ms/max63,1ms, health valid/pending0/chyby0. Jde o stacionární smoke, nikoli nové srovnání jízd. Vlastní hráč odešel do menu, služby zůstávají dostupné pro uživatele.

Navazující čtecí průzkum zpřesnil označení materiálu: `photographic leaves · shared flat PBR` je FAR/medium fotografická tráva, nikoli nový stromový GLB. Při prvním záseku B1 má 192 instancí a 4224 trojúhelníků (22 na FAR instanci); před jízdou jsou ready textury, ale žádné instance/buffery. Skutečný thin-instance program se tak při spawn přípravě neaktivoval. To je podklad pro samostatný další experiment, ne oprava obsažená v tomto commitu.
