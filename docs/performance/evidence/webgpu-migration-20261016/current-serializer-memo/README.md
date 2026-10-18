# Současný serializer memo: nepřijato do runtime

19. 10. 2026, KEY-31. Dokončený omezený correctness a GPU pilot; celé issue a migrace zůstávají otevřené. Žádný produkční patch, lockfile ani hraný build se tímto výsledkem nemění.

## Rozhodnutí

Omezené engine/device memo má ověřenou sémantiku, ale šest nynějších neinstrumentovaných prvních jízd neprokázalo dostatečný celkový přínos. **Do nativního patche se nyní nezačleňuje.** Nenásleduje další zvětšování cache nebo změna přejímacích limitů podle těchto čísel.

| Běh v pořadí | FPS | p95 ms | p99 ms | max ms | snímků ≥100 ms |
| --- | --- | --- | --- | --- | --- |
| A1 | 52,8 | 22,5 | 35,3 | 228,3 | 4 |
| M1 | 52,8 | 25,6 | 48,8 | 139,4 | 3 |
| A2 | 54,2 | 22,8 | 29,7 | 175,6 | 3 |
| M2 | 54,2 | 23,4 | 28,3 | 159,8 | 3 |
| A3 | 54,0 | 22,4 | 28,9 | 187,4 | 4 |
| M3 | 52,3 | 24,7 | 34,2 | 167,6 | 3 |

Medián A/M: FPS54/52,8, p9522,5/24,7ms, p9929,7/34,2ms, max187,4/159,8ms. Celkem ≥100ms11/9. Všechny běhy měly0nových programů,0nových modulů a2synchronní pipeline. Zkrácení maxima samo neprokazuje plynulou hru.

## Identity a rozsah

- A: přijatý native `909ebf8a019b26aff5561a0aaba97b976a26d033746da85ae958c6f4034589a5`,595zdrojových souborů; privátní kopie se čteným dist/dependencies.
- M: `b43527c92bc5fe8cc703f91757b97dbb1e2c855e018b889dbaf343d02b185495`, stejná aplikace/testy a5provenance souborů navíc. Jen4vendor změny z current proof. Standard/PBR mají jedinou callsite delta; současné IBL/IP opravy zachované, inverse4/4exact. Žádný profilovací wrapper stock `toString`, sampler ani Document-Policy.
- Proof manifest SHA256 `8567f6fba66a8bfcdcc5fa767b3efa328ed850af8bde98458bfaeb865814ca69`.51/51correctness, scopedTS3169/0,11WGSLscénářů/55celých stavů A/Mexact kromě výslovných memo observations. Testová fyzická package identity a10860dependency invariant doložené. M cílené testy18/18, fullTypeScript/buildPASS. Fullsuite/integrace pro tento nepřijatý QA runtime znovu neběžely; předchozí výsledky nejsou vydávané za jeho ověření.
- Memo64entries/262144combinedUTF16units je logický limit, ne heap garance. Rawgetter reads, custom serializer, owner/device epochs, loss/restore/dispose a cleanup mají vlastní aktuální testy. Starší unique-churn režie+12,59% není aktuální produkční čas.

## Podmínky a omezení

Edge155, GTX1060 driver582.28,1skutečnýAlex,0simulovaných bus/car/passenger, manualLow77%, CSS1528×650/render1175×500. Řízená noc1792447200000 a stejné uložené počasí. Stejný vstup E, W8000ms, space2500ms; malé rozdíly koncové pozice z119,12do121,82zůstávají přiznané. Jde o pilot, nikoli Medium2040×986/3peer přejímku nebo statistickou významnost.

Před/po každém běhu jsou snapshoty GPU teplot/taktů/P-state, nikoli kontinuální profil nebo fixní takty. Předběžné takty A1/M1/A2/M2/A3/M3:885/847/847/847/949/822MHz;72–73°C. Také doba ready→benchmark se liší přibližně17–88s. Zhoršení p95/p99/FPS proto není důkazem kauzální regrese memo; všechny platné běhy včetně nepříznivého M1 jsou zachované. Mode→ready se měří z aplikačních událostí, odděleně od operátorských pauz: A55,15/55,45/61,19s, M51,33/51,26/51,11s. Startup není současná prioritní překážka.

Každý UI frame array se jednou celý shoduje s raw diagnostickým benchmarkem po zaokrouhlení na0,1ms. Raw session sekvence jsou0→konec bez mezer, source/čas spuštění/skutečný benchmark identifikují právě jednu relaci; healthvalid/pending0. Nejsou zaznamenané focus/visibility ztráty během benchmarku. A1 collector správně odmítl pozdní jednorázový resource beacon předchozí stránky bez benchmarku/seq0; nejde o vynechání pomalého běhu.

## Review, uchování a další krok

Nezávislé read-only BMAD blind review přenosu i šesti raw/UI běhů: žádný doložený opravitelný nález. Potvrdilo zachování nepříznivých výsledků, podmínek a omezení. Audit neuděluje úplnou GPU/image přejímku.

`artifact-manifest.json` připíná172původních payloadů, gzip je lossless. Proof obsahuje4vendor payloady/předobrazy/inverse, testovou closure a raw logy, nikoli duplicitní kompletní dependencies. `comparison.json` a běhové identity/session/benchmark/GPU/snímky jsou zachované; operativní PID rezervace se necommitují. Archivní skript neobnovuje hrané buildy.

Vlastní preview/API4200/2595 byly po každém běhu ukončené podle skutečné PID/start/cwd identity. Protected4199 před/po:17codefiles a servedHTML byteově zachované. Starší hrané buildy ani133cizích WIP cest nebyly měněné. Následující úzký průzkum má odlišit skutečnou cenu interního serializeru od zbývajících binding/pipeline nákladů pomocí již existujícího omezeného timeru; nové cache se bez přínosu nepřidávají.
