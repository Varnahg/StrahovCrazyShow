# Předání: jantar-home-20261028-i18n-title

- Vlastník: `jantar-title-01a17fd8` (`/root/map_assets`); příjemce: koordinátor `/root`, relace `01a17fd8-017a-7852-87f9-cd1538e1bde2`.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/jantar-home/StrahovCrazyShow`; větev `codex/jantar-home`; výchozí commit `987bcd9242f747a6dd78c83a68b127a60ab90f19`.
- Výsledek: opraven canonical publisher titulku, doložená regrese a cílené ověření. Připraveno k integraci; žádný commit/staging a žádné označení tasku Done.
- Změněné verzované soubory: `client/i18n.ts`, `tests/i18n.test.ts`, toto předání. Ignorovaná evidence: `.cache/jantar-home-20261028-i18n-title/source.diff`, `test-before.log`, `test-after.log`.
- Cizí WIP: SPEC, `client/ui.tsx`, další handoffy/tasky a verifikační dokumentace patří koordinátorovi. Nedotčeno. Odstranění duplicitního App efektu řeší výslovně rodič ve svém UI claimu.

## Výzkum, mechanismus a volba

`publishLocale` zapisoval starý lokalizovaný slogan do `document.title` před `next === locale` guardem. Při storage clear/remove s browser fallbackem stejným jako aktuální jazyk tedy došlo k přepsání nového brandu, ale nikoli k notify externího store; App efekt navázaný na locale tento stav nemohl opravit. Tento mechanismus je potvrzený zdrojem a neúspěšným testem skutečně zaregistrovaného handleru, nejde pouze o hypotézu.

Primární podklady: `client/i18n.ts`, původní `tests/i18n.test.ts`, schválený title v `index.html` a koordinátorův review nález. [HTML Standard, Web storage](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface) byl ověřen 28. 10. 2026: remove předává jako novou hodnotu null a clear má null key i newValue; těmto stavům odpovídá fixture.

Porovnané varianty:

- Další App listener/MutationObserver nebo efekt: druhý vlastník titulku, další lifecycle a stále zbytečná vazba na React. Nezvoleno.
- Vynucené notify při stejném locale: změna existujícího store kontraktu a zbytečné rendery. Nezvoleno.
- Jediná korekce canonical publisheru na schválený invariant: zvoleno. Čtyři řádky starého větvení nahrazuje jediný `document.title = "Strahov Crazy Show"`. Umístění před guardem zůstává, takže se dokument opraví i bez změny store.

## Chování a cílený refaktoring

`document.documentElement.lang`, detekce jazyka, persistence, fallback, výjimky storage a jednorázové notify zůstávají původní. Nevzniká veřejné API, listener, stav, cache, resource nebo síťový požadavek. Odstraněné větvení sjednocuje vlastnictví titulku; jiný runtime refaktoring není pro tuto opravu potřeba.

Původní test změny jazyka zachovává všechny asserty persistence, profilu, relace a notify; pouze titulky odpovídají schválenému brandu. Navíc při opakovaném `setLocale("en")` záměrně poškodí title/lang a ověří jejich obnovení bez dalšího notify.

Nová Node fixture načte izolovanou instanci téhož i18n modulu a zachytí jeho skutečný storage callback. Ověřuje clear a remove při stejném fallbacku, změněný i opakovaný jazyk, fallback po odstranění, ignorování jiného klíče a nulovou opětovnou persistenci. Subscription i globální deskriptory obnovuje ve `finally`; nevytváří browser nebo GPU scénu.

## Ověření

Vše 28. 10. 2026, pouze lehké CPU příkazy v uvedené pracovní kopii:

- Před opravou `node --import tsx --test tests/i18n.test.ts`: exit 1, 8/10 prošlo a 2/10 selhaly. Direct locale očekával nový brand, actual byl starý anglický slogan. Skutečný storage clear po nastavení nového brandu a se stejným českým fallbackem obnovil starý český slogan. Původní neúspěch je zachovaný v `test-before.log`.
- Po opravě a refaktoringu fixture stejný přímý Node příkaz: exit 0, 10/10 prošlo, 1261,053 ms; `test-after.log`.
- `node node_modules/prettier/bin/prettier.cjs --check client/i18n.ts tests/i18n.test.ts`: exit 0, oba soubory odpovídají formátu.
- `git diff --check -- client/i18n.ts tests/i18n.test.ts`: exit 0.
- Rozsah source diffu: `client/i18n.ts` +1/-4 řádky, `tests/i18n.test.ts` +92/-2 řádky. Diff zahrnuje pouze vlastní dva soubory a obsahuje testy.

Nespouštěl se package manager, instalace, globální TypeScript, full suite, build, integrace, server, browser, GPU ani placené API. Tento test skutečného callbacku v Node není přijetí reálné cross-tab browser události nebo celé hry. Koordinátor naváže odstraněním svého duplicitního App efektu a příslušnou stabilní validací.

## Identita zdrojů a evidence

| Soubor | SHA-256 |
| --- | --- |
| `client/i18n.ts` | `ac3427bded06b04d908339ad65aad7eab92a329693fc74f0a1dee897cfaadbce` |
| `tests/i18n.test.ts` | `0292f8400c30ee44a1f3a745b315a13ef86196ef2786c2481e9acc02a8de2256` |
| `.cache/jantar-home-20261028-i18n-title/source.diff` | `3d6c261798ed26b4b2861d81ce0c37fbe99255146da4cc4744e46e8c405cc2f8` |
| `.cache/jantar-home-20261028-i18n-title/test-before.log` | `f02fabbc95c0cd9686e3f3316a4314ec19b29261cf996a73b7b5469c177ec5a9` |
| `.cache/jantar-home-20261028-i18n-title/test-after.log` | `d6a101bdbc14ba27cfcadff16165cbd713d896c99e9451ec02c9cfba4ccc08ff` |

## Procesy, rezervace a převzetí

Všechny vlastní pomocné příkazy skončily; žádný vlastní dlouhodobý proces, port či GPU resource nevznikl. `node_modules`, chráněná 4182 a neměnný runtime 4278 ani jeho soukromé dependencies nebyly upraveny či spuštěny.

Claim `jantar-home-20261028-i18n-title` se uvolňuje bezprostředně po zapsání tohoto předání; skutečný úspěch release a čas jsou v závěrečné zprávě koordinátorovi. Uvolnění není integrace ani Done. Integrátor přebírá pouze doložené vlastní soubory, aktualizuje společnou evidenci/Linear a stav tasku.
