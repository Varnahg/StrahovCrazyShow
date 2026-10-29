# Předání: verify-frame-projections-20261014

- Vlastník: `key19-projection-tests-20261014`; příjemce: root koordinátor.
- Pracovní kopie: `C:/Users/rezac/.codex/worktrees/key17-ownership-integration/StrahovCrazyShow`; přidělený publikovaný obsah `f4f6116c643bf001702f1b96331a3088d1717b08` nad historickým detached HEAD `2c7aec9`.
- Rozsah: pouze nový `tests/game-diagnostics-projection.test.ts`, toto předání a `.cache/frame-projection-tests/`. Produkční helper vlastní `network_context_audit`; žádné jeho zdrojové soubory tento agent nemění.

## Podklady a rozhodnutí před testy

Nezávislý read-only rozbor 14. 10. 2026 prošel celý řetězec Game, UI, recorder, vlastní serverovou authority, sanitizer a offline report KEY-18. Testy mají ověřit konkrétní rizika: implicitní kopírování budoucích privátních polí, vyhodnocení getterů při volitelném logování, propad chyb proxy do hry, neplatná počítadla a aliasování mutable vstupů. Primárními podklady jsou skutečné `client/game-diagnostics.ts`, `shared/network-diagnostics.ts`, `shared/input-timeline.ts` a `client/network-timeline.ts`. Síťová diagnostika má pouze vlastní data a pevný whitelist; timing dovoluje nezáporné zlomky, počítadla vyžadují safe integers. Getter ani cizí prototyp nejsou telemetry.

Samotná kontrola výsledku obecným sanitizerem by neprokázala, že getter nebyl zavolán ani že se zdrojové objekty nekopírují. Proto testy volají skutečné exportované projekce, používají throw/count sentinely, skutečný serverový clock/queue snapshot a mutate-after-capture. Game/frame/UI lifecycle testy zůstávají původnímu implementátorovi, tento soubor je neduplikuje. Žádná změna protokolu, síťového provozu, renderingu ani náročné ověření.

## Výsledek

Hotové nezávislé testy, produkční source beze změny tohoto agenta. Nový soubor obsahuje deset scénářů: skutečný clock/queue snapshot, plain/null-prototype objekty a odmítnutý legacy formát, nevyhodnocené gettery, throwing/revoked proxy a callbacky, rozlišení bezpečných integer počítadel od zlomkových časů, transportní i timeline whitelist, odpojení mutable vstupů a 3000 neznámých polí bez enumerace. Pozdější návrh vlastníka helperu zahrnul explicitní timeline projekci a UI gate; při kontrole tohoto výsledku nebyl nalezen blokující nález.

Refaktoring testů: sdílená factory vytváří skutečné serverové `NetworkClockTiming` a `TimelineInputQueue` snapshoty, společný getter sentinel prokazuje nulové vyhodnocení. Test se neopírá o kopii produkční implementace. Vznikly pouze rezervované dva verzované soubory a cache s důkazy.

Ověření 14. 10. 2026 přibližně 21:13 UTC:

| Příkaz / kontrola | Výsledek | Log |
| --- | --- | --- |
| `pnpm exec tsx --test tests/game-diagnostics-projection.test.ts` | 10/10 PASS, exit 0 | `.cache/frame-projection-tests/targeted-tests.log` |
| Cache-only kopie helperu bez integer guard, stejná testovací sada | očekávaně 6 PASS / 4 FAIL, exit 1; selžou clock, queue, transport a timeline numerické regrese | `.cache/frame-projection-tests/mutation-red.log` |
| Finální `pnpm exec tsx --test tests/game-diagnostics-projection.test.ts` po formátování testu | 10/10 PASS, exit 0 | `.cache/frame-projection-tests/targeted-tests-final.log` |

Mutation byla vytvořena výhradně v `.cache/frame-projection-tests/`; skutečný helper se nemutoval ani neobnovoval. Finální test je formátován jednosouborovým Prettierem. Neproběhl build, celá sada, install, browser, GPU nebo server; patří integračnímu vlastníkovi.

SHA-256 testovaného páru a důkazů:

- `client/game-diagnostics.ts` (čtený source jiného vlastníka): `2d2de8552e10d5829d3afb82c4646c5f650506231840af34fbaed1d2f57e23e1`
- `tests/game-diagnostics-projection.test.ts`: `6c901fd065ca164227e1d54292f34ed046d52d8e9545a5e04f6b374008f5ffba`
- `targeted-tests-final.log`: `1b6bccca7d1136ef6e8a05a47aaa7bcd74dde1c10c84a568df4165fd3fadcaa8`
- `mutation-red.log`: `268d9b0408219393d37df878c5cfd004d19fc07fc24530170071ab6c5b0de214`

Procesy: všechny vlastní CLI příkazy skončily; žádný port/timer/helper nezůstal běžet. Cizí WIP, registry jiných vlastníků a živé preview zůstaly nedotčené. Rezervace se po tomto předání uvolňuje; testy a handoff přebírá root pro jediný KEY-19 checkpoint. Integrátor ověří konečné source/test bytes v úplné pipeline a zapíše výsledek do `docs/verification.md`.
