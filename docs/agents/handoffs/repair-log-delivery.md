# Předání: repair-log-delivery

- Vlastník: `repairs-01a13624-logdelivery`; příjemce: root `repairs-01a13624-root`.
- Pracovní kopie: `C:\Users\rezac\Documents\GitHub\StrahovCrazyShow`, main, výchozí HEAD `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Převzatý WIP: explicitní převod všech pěti zdrojů/testů v [repair-game-integration](repair-game-integration.md), claim s `--adopt-dirty`. Game/UI ani cizí soubory nebyly upraveny.
- Výsledek: implementace a cílené CPU ověření dokončené. Skutečná produkční browser→disk přejímka patří root; celé KEY-1 zatím není doloženo tímto handoffem.

## Příčina a podklady

Read-only analýza `.cache/playtest-repairs-validation/wave2-session.jsonl` dne 13. 10. 2026: 9 692 244 B, 83 batchů, 1 819 records, poslední seq2595. Součet 32 mezer je777, stejný jako poslední `droppedTotal`. `frame-hitch` n372 /6 243 505 B/max19 176 B; `frame-window` n332 /3 031 671 B/max9 513 B. Starý klient poslal nejvýše jednu128KiB dávku za5–6s, zatímco měřený detail vytváří podstatně více dat; bounded fronta vyhazovala nejstarší records včetně starých recording-gap markerů. Pořadí a přenosová kapacita jsou doložené kódem i logem.

Starý souhrnný důvod nerozlišoval queue capacity,32KiB record size a event rate. Z chybějících dat nelze vyloučit jednotlivé oversized records; maxima uložených records toto nevylučují. Shoda seqgapů a droppedTotal podporuje ztrátu ve frontě/size, ne event-rate (ta seq nespotřebovává); jde o inferenci, ne rekonstrukci vymazaného obsahu. Nový recorder příčiny výslovně počítá.

Primární podklady k lifecycle: [Fetch Standard](https://fetch.spec.whatwg.org/) stanoví společný64KiB budget pro probíhající keepalive requesty; [Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) popisuje zastavení callbacků při freeze a nezaručené pagehide při ukončení procesu. Ověřeno13.10.2026. Nepřidáváme tvrzení o garantovaném crash/offline tailu.

## Změny a refaktoring

- `client/session-diagnostics.ts`: jeden sekvenční drain; automatický48KiB trigger a1s timer; menší zbytek po úspěšné velké dávce zůstává do dalšího triggeru/timeru, aby se nevyčerpal serverový request budget. Normální klient drží110POST/min (server nadále120 globálně), životní cyklus má zbývající rezervu. Fronta zůstala1MiB/512records plus jeden batch. Failure backoff platí i pro size-trigger a explicitní flush.
- Batches nejvýše60KiB, pod nezměněným serverovým128KiB limitem. Nepotvrzený batch má neměnné ID/JSON bytes. Pagehide/dispose může zrušit běžný transport a synchronně zahájit keepalive retry přesně téhož batch; stará odpověď už nový drain nepřepíše. Celý jeden lifecycle drain odešle nejvýše60KiB včetně retry; nevyčerpané records jsou pravdivě pending/retrying/error. Dokončené capability discovery po dispose posílá tail pomocí keepalive. Timer a observables/listeners/console hooky se uklidí jako předtím.
- `status()` a recording-gap mají kumulativní `droppedByReason` (`queueCapacity`, `recordSize`, `eventRate`); status navíc `pendingBytes`. Marker zahrnuje i vlastní případné vytlačení recordu. Session-end/pagehide nepodléhají limitu běžných eventů.
- `shared/session-diagnostics.ts`: společné konstanty dávkování; reuse TextEncoder. Schema v1,32KiB record limit a privacy sanitizer nezměněné. Cache přesných bytes in-flight body odstranila opakované kódování při HUD status/retry.
- `server/session-diagnostics.ts`: policy odpovídá novým klientským konstantám; pořadí, idempotence, fsync, disk limity a source observation zůstaly stejné. Source TTL30s nezpůsobí hashování při každém batch. Explicitní buildSnapshotId není důvod nahradit pozorovaný content hash deklarací.
- `tests/session-diagnostics.test.ts`, `tests/session-diagnostics-server.test.ts`: nové regrese a aktualizovaný test očekávající skutečné retry backoff+automatický drain namísto ručního opakování každé dávky.

## Ověření

13.10.2026 přibližně20:31–20:34UTC, všechny zde uvedené finální příkazy exit0:

- `pnpm exec tsx --test tests/session-diagnostics.test.ts`:20/20 PASS. Tříminutový virtuální zdravý transport s asynchronním fake HTTP, skutečnými serializovanými/validovanými requesty a kontrolou serverového120POST/min limitu:15 194 427 B/306batchů; všech939seq a3 600měřených frames;19actions včetně exit-car a session-end; zero dropped/pending; maxpendingBytes65 123; max1souběžný běžnýPOST. Hitch payloady17–20KiB a window8.5–10KiB záměrně odpovídají naměřeným velikostem wave2.
- Stejná sada prokazuje exact-byte retry, backoff při opakovaných enqueue/flush, bounded offline queue, pravdivé tři důvody ztráty, cleanup, přepnutí pending requestu na keepalive, pozdní receipt bez přepsání nového stavu, bounded oversized lifecycle tail a obnovení přenosu. První průběžná varianta regrese odhalila, že okamžité posílání drobných zbytků vyčerpává120POST/min; finální batching toto odstranil.
- `pnpm exec tsx --test --test-name-pattern 'in-process sequential drain' tests/session-diagnostics-server.test.ts`:1/1 PASS, bez listen portu. Skutečný collector/fdisk/fync zpracoval101batchů, do30s provedl1source capture, poTTL druhý; per-row content hash se aktualizuje i při deklarovaném buildSnapshotId. Uloženo všech101seq.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --types node client/session-diagnostics.ts shared/session-diagnostics.ts server/session-diagnostics.ts tests/session-diagnostics.test.ts tests/session-diagnostics-server.test.ts`: PASS. Poslední následná drobná úprava nastavuje existující stav `retrying` při vyčerpaném tail budgetu a má pokrytí v20/20testech.

Žádný GPU, build, full suite ani naslouchající server. Dočasný in-process testový adresář pod systémovým tmp byl odstraněn bezpečně kontrolovaným cleanupem. Žádné pomocné procesy neběží; procesní status ověřen. Logy kontrol jsou výstupy nástrojů tohoto tasku; historické wave2 JSONL nebylo změněno.

## Identita předání

Scope SHA256 (pět souborů níže v tomto pořadí, stream `path + NUL + bytes + NUL`): `3208610a978ad1c5b0acea66994571e714c0dac4976650990b55ba7a1ab37dfc`. Jde o identitu předaného modulu včetně jeho testů, nikoli celé produkční aplikace.

| Soubor | SHA256 |
| --- | --- |
| client/session-diagnostics.ts | 6e2521eae7f6058796acb42e38e7d85fb7b8ed470f0410436b09943fd5afca21 |
| shared/session-diagnostics.ts | ad1850d3e1409beaa2374dfa67c6a6d7a8d8cbab159da2a774c66dd4d436fe1f |
| server/session-diagnostics.ts | d06d3c123b60957ac4c6e834fe2d69d56008b60ddcee13ec87b648a24913c1f6 |
| tests/session-diagnostics.test.ts | 1c7b9d6b3b0a0dd1a585349ddb88e862701dba1e06180fde1de0f94125bcbd8c |
| tests/session-diagnostics-server.test.ts | 3753754bd1b33eadb82fd01603744df08fb58edd63901f43b72f4b661d1e598a |

## Omezení a převzetí

Bez durable outbox nelze zaručit offline/crash/OS-kill tail. Při nezdravém transportu, velmi velkém jednom synchronním burstu nebo vyčerpání společného serverového limitu více klienty zůstávají existující bounded ztráty možné a nově rozlišené; nezvyšoval se neomezeně limit ani netlumily původní detaily. I keepalive je best effort a další sekvenční request po freeze může čekat na neprovedený callback. Root musí v nové produkci ověřit normální hra→pagehide→disk včetně seq/critical events, nových sampler payloadů a skutečné režie.

Rezervace bude uvolněna po odeslání tohoto předání; příjemce smí doložený diff převzít. Koordinátor mění stav tasku a doplní společnou verification/Linear až po svém přijetí.
