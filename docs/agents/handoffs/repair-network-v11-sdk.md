# Předání: repair-network-v11-sdk

- Vlastník: `repairs-01a13624-v11-sdk` (`/root/repair_network_causes/v11_sdk_producers`); příjemce: `repair_network_causes` a root koordinátor.
- Pracovní kopie: `C:/Users/rezac/Documents/GitHub/StrahovCrazyShow`, větev `main`, výchozí commit `91ee88f0aaa902c79fad589aeb84bc086a66c9ea`.
- Výsledek: SDK producenti převedeni na V11; lehké ověření prošlo. Skutečné síťové scénáře a zátěž čekají na rezervované integrační okno rootu; toto předání je netvrdí za dokončené.
- Změněné soubory: `scripts/timeline-client.ts`, `scripts/integration.ts`, `scripts/integration-network.ts`, `scripts/integration-input-backlog.ts`, `scripts/integration-respawn.ts`, `scripts/performance-network.ts`, `tests/timeline-client.test.ts` a toto předání.
- Cizí WIP: pět existujících skriptů bylo před claimem čistých, helper/test nové. Server, shared kontrakty, Game/UI a renderer patří jiným vlastníkům a nebyly měněny. `--adopt-dirty` nepoužito.
- Podklady: skutečné zdroje uvedených skriptů, `client/network-timeline.ts`, `client/network-input-buffer.ts`, `shared/input-timeline.ts`, `shared/netcode.ts`, `shared/simulation.ts` (pedestrian rychlost 4,6 m/s), `shared/vehicle.ts` (exit limit 1 m/s), dohoda V11 s vlastníkem serveru dne 13. 10. 2026. Žádné tvrzení o skutečném GPU výkonu.

## Chování a refaktoring

`ScriptTimelineClient` sdílí s hrou `NetworkTimeline` a `FrameInputBuffer`. Přijímá pouze platnou novější autoritu, při rebase resetuje sender a prioritu první dávky, odesílá jen `source === input`; neutrální catch-up nikdy nespotřebuje jump edge a nejde na drát. Helper nemá vlastní trvalý timer. `holdFor` a `holdUntil` pumpují po 30 Hz; `settle` vypouští konec fronty a čeká na `ack >= zachycený seq` v téže epoše. Změna epochy při settle je chyba, ne falešný úspěch. `dispose` vyčistí sender.

- `integration.ts`: A/D, forward/reverse a brzda drží vstup během celé pozorované podmínky. Všechny prostorové, rychlostní a steering prahy zachovány; heading manévry zachovávají deadline `60 * 34 ms`. Odstraněn V10 generátor `++seq`. Stages obsahují autoritativní tick, simulační UTC čas, epochu i sender diagnostiku. Původní wave1 fail log zůstává nedotčen.
- `integration-network.ts`: všech 12 pozorovatelů porovnává motion se stejným `authority.tick`, přesné ack a chybu X nejvýše 0,51 mm. Ack již nesmí být zaměněné za počet odeslaných příkazů; matching tick/epoch jsou v reportu. Historie omezená na 120 snímků.
- `integration-input-backlog.ts`: celý šestnáctitickový future window se řeší v čase, ne zrychleným odčerpáním FIFO. Displacement je omezený odsimulovanými tick × 4,6 m/s; receipt se prokazuje `receivedSeq`, rozlišení `ack`. Kontroluje invalid/late/old-epoch/ahead/duplicate counters, jejich nulovou potřebu resync, běžný omezený lead a nedotčeného druhého hráče. Explicitní resync musí vytvořit novější epochu s ack0 a znovu reagovat na držený pohyb.
- `integration-respawn.ts`: queued burst před respawnem je ve staré epoše; nucená autorita má novější epochu, ack0 a aktuální spawn před tickem. Obě presence mají ack0 a správné pořadí. Test prokazuje skutečné zvýšení discarded, odmítnutí staré epochy i resolved slotu, pokračování času, nový pohyb a ochranu cizího řidiče.
- `performance-network.ts`: producent používá tentýž helper, během pozastavení nevyrábí historické dávky. Command Hz počítá skutečně odeslané příkazy, nikoli `počet paketů * 2`; evidence označuje význam ack age a intentional lead, přidává epochu do resync a omezené vlastní queue/sender snapshoty. Paměť timestampů se promazává při ack/epoch, instance se disposují v finally.

## Ověření

13. 10. 2026, přibližně 19:45–19:48 UTC:

1. `node --import tsx --test tests/timeline-client.test.ts` → exit 0; **6/6**: current epoch/old authority/dispose, neutral catch-up a jump, held controls + time settle, epoch barrier, cadence-delayed tail, pause a aktuální časový frontier. Výstup: 6 tests, 6 pass, 0 fail, 0 skipped, 924 ms posledního běhu.
2. `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --resolveJsonModule --types node scripts/timeline-client.ts scripts/integration.ts scripts/integration-network.ts scripts/integration-input-backlog.ts scripts/integration-respawn.ts scripts/performance-network.ts tests/timeline-client.test.ts` → exit 0, poslední kontrola po finálních změnách.
3. `git diff --check --` pět existujících změněných skriptů → exit 0, bez výstupu.

Neběžela síťová integrace, celý test suite, build ani GPU. Nebyl spuštěn žádný server ani pomocný dlouhožijící proces. Přímé výsledky lehkých příkazů jsou v transcriptu; scope neobsahuje další výstupní log soubor.

## Snapshot přidělených zdrojů

SHA-256 k 19:47:48 UTC, zahrnuje testy; nejde o hash celého současně editovaného checkoutu:

| Soubor | SHA-256 |
| --- | --- |
| `scripts/timeline-client.ts` | `dbb2049cea2847404445bc30840db8f1e4e2e207fd04e6af923e7e439114a03a` |
| `scripts/integration.ts` | `8ea80fc3f581820d51bc03c0ebd5039227201a1a040c8a1b19a80f7b379732fd` |
| `scripts/integration-network.ts` | `14c5359c366d4aae7ba8298c72bbbcaf1512d69dba784fc961045f254838de07` |
| `scripts/integration-input-backlog.ts` | `40a64908fb7fd134c36583a138c8dc16296197ae61a1830452a49ae6b0167b6c` |
| `scripts/integration-respawn.ts` | `4890ec773852edd29b12fc8a6a66b5796d2d91d5058cffaa14bc5f52aeb3dfe7` |
| `scripts/performance-network.ts` | `0763ccd4c5cd732ebd3f22c88b936c44ff7055972408cbc2ac6a34a5ad6a7540` |
| `tests/timeline-client.test.ts` | `74c8ea997b091b3321c1bfa0ebdf5890415c50e9b96ca336357f15a1d6651c1d` |

- Omezení a další krok: root spustí skutečné SDK scénáře se serverem V11 ve stabilním snapshotu, zachová fail evidence a ověří manévry; potom naváže zatěžovací a GPU profil celé hry. Unit test helperu tuto přejímku nenahrazuje.
- Rezervace: po napsání tohoto předání bude uvolněna; autoritativní stav je registr. Vlastní dlouhožijící procesy žádné.
- Integrátor: stav tasku a společnou verifikaci mění root po převzetí.

## Následná oprava po selhání wave2, 20:04 UTC

Root po immutable wave2 (`c3c816…`, podle předání 808/808 testů + build) předal skutečný integrační timeout `exit and park car`. Přímý zdroj: `.cache/playtest-repairs-validation/wave2-native-test-integration.log`. Respawn a původně selhávající A/D v této integraci již prošly. Původní fail ani zmrazený snapshot nebyly změněny.

Vlastník znovu claimnul stejný task přes `--adopt-dirty` na základě vlastního předání výše. Nové zápisy jsou jen `scripts/timeline-client.ts`, `scripts/integration.ts`, `tests/timeline-client.test.ts` a toto předání.

Potvrzená chyba helperu: `holdUntil` dříve vyhodnotil podmínku před první produkcí. Po `W recovers` mohla být rychlost již nad 0,5 a zároveň pod 1 m/s, takže brzda nevyrobila žádný příkaz; následné `settle` odsimulovalo dosud naplánované W. Tuto sekvenci reprodukuje test se skutečnou `TimelineInputQueue`, šesti naplánovanými W sloty, počáteční rychlostí 0,6 m/s a skalárním modelem odezvy. Jde o důkaz vady řízení testovacího producenta, nikoli náhradu Rapier přejímky.

Oprava: společná privátní metoda `advance` oznamuje skutečně nově vyrobené příkazy. `holdUntil` zachytí první jejich `{inputEpoch, seq}`, pokračuje v držení řízení a podmínku zkouší až po `authority.ack >= seq` ve stejné epoše. První pump smí nevyrobit nic, pokud je původní lead již naplněný; stále nesmí ukončit manévr. Změna epochy vyvolá výslovnou chybu. Žádný rychlostní/prostorový práh ani deadline se nemění.

`integration.ts` zaznamená stav těsně před požadavkem na výstup po vyřešené brzdě. Při selhání uloží i vypíše poslední plnou autoritu, motion obou peers, notices, car a producer; tento snapshot vzniká před cleanup. Další fail tak zachová skutečný důvod a rychlost, i když není nastavena cesta evidence JSON.

Ověření:

- Před opravou `node --import tsx --test tests/timeline-client.test.ts`: 6 pass / 2 fail. Reprodukce selhala na `new braking controls must actually be produced`; epoch regression na `Missing expected rejection`.
- Po opravě tentýž příkaz: **8/8 pass**, 0 fail/skip, exit 0; poslední běh 518 ms.
- Stejný cílený příkaz TypeScript z předchozí sekce nad všemi sedmi zdroji/testy: exit 0, bez chyb.
- `git diff --check` přidělených existujících skriptů: exit 0.
- Žádný server, zátěž, build, síťová integrace ani GPU zde spuštěny nebyly. Skutečné potvrzení opraveného scénáře provede root v novém snapshotu.

Aktualizované SHA-256 tří změněných zdrojů k 20:04:06 UTC (ostatní výše zůstávají):

| Soubor | SHA-256 |
| --- | --- |
| `scripts/timeline-client.ts` | `4056707aa9ac03990514697786f57a4ae7e32b02d833a0e95fc418abe5ea112d` |
| `scripts/integration.ts` | `e81b8b70f0498b8a4e7d522e9f70bb3bd30c1576db5e96c4d4607a71244ea7e3` |
| `tests/timeline-client.test.ts` | `5a0821514f145a9aa63dc2948082ed8d2b15a05fbe64a648859d3b9c400493ba` |

Po tomto dodatku končí vlastní zápisy a rezervace bude znovu uvolněna. Žádné vlastní dlouhožijící procesy.
