# Integrační kontrola zmražené verze D

10. 10. 2026, Europe/Prague. Zdrojový snapshot `integrated-20261010-d`, SHA-256 `6bac5a55ce9f8a07885fd07de125fca0299ef7b2e4b893ded45bbc0eb962d062`, 99 souborů. Audit neměnil runtime. Každý příkaz znovu ověřil všechny zdrojové hashe před spuštěním i po něm.

| Kontrola | Výsledek | Čas | Důkaz |
|---|---|---:|---|
| `pnpm test` | 91/91, exit 0 | 16,03 s | `test.result.json`, `test.stdout.log` |
| `pnpm build` | TypeScript + Vite, exit 0 | 10,78 s | `build.result.json`, oba build logy |
| `pnpm test:integration` | Skutečný samostatný server a dva klienti, exit 0 | 6,97 s | `integration.result.json`, oba integration logy |

Kontroly běžely sekvenčně. Po dokončení byl root i agent GPU měření výslovně informován `heavychecksfinished`. Produkční výstup je uvnitř snapshotu v `dist/`. NullEngine testy nejsou důkazem GPU výkonu ani FPS.

## Ověřené integrační vazby

- **LOD avatarů:** osm testů ve `tests/avatar-lod.test.ts` prokazuje odstranění neaktivních detailů z aktivní scény, obnovení všech původních detailů, hysterézi, zachování 100 identit, první osobu/auto, návrat IK z far a korektní uvolnění sdíleného zdroje až po posledním uživateli. Game volá `animation.reset()` při návratu z far a předává akumulované animační dt.
- **Auto:** `VehicleState` zachycuje polohu/rotaci, lineární a úhlovou rychlost, parkování, vlastní síly/točivé momenty, steering, kola a sleep. Restore/replay a persistence pokrývají testy vozidla a živá dvouklientová integrace včetně nastoupení, řízení, výstupu a opětovného vstupu. Kamera i LOS v `Simulation` při řízení explicitně vylučují chassis body, takže nemají narážet do vlastního auta. Rapier warm-start cache není serializovaný stav celé fyziky; přesný rollback všech kontaktů tato kontrola neprokazuje.
- **Host a soukromí API:** živý integrační test ověřil odmítnutí guest session, přesný veřejný health `{ok:true,demo:true}`, 403 pro hráče/chat/komunitní události, odmítnutí join bez tokenu a zákaz vytvoření druhého světa. Test health nedovoluje vydávat přítomnost hráčů veřejnému hostovi.
- **Emoce:** server v simulačním intervalu autoritativně odstraní emoci po 3,5 s. D doplnilo `Game.setEmote`, které aktualizuje současně kanonický localPlayer i renderový target; přepis targetu vlastním pohybem už nemá ztrácet vlastní emoci. Doplněný skutečný test metody nad minimálním stavem potvrdil oba cíle a solo expiry za 3500 ms (`supplemental-audit.json`). Samotné uplynutí serverových 3,5 s není v hlavním integračním testu samostatně čekáním ověřeno; zde je pro tuto část statický důkaz serverového timeru.
- **ContactShadows cleanup:** doplněný runtime audit nad skutečným NullEngine potvrdil po `dispose()` nulu meshů, materiálů i textur vlastněných touto komponentou. Zdroj i instance jsou nepickovatelné. `Game.updatePlayers` u odpojených hráčů shadow odstraňuje. PBR materiály importovaných assetů zůstávají součástí scény pro vykreslení; hlavní `Game.dispose` volá nakonec `scene.dispose()` a `engine.dispose()`. Opakované plné GPU cykly vstupu/výstupu z hry a jejich paměť tato kontrola neměřila.

## Menší nálezy a omezení

1. **Kontaktní stín při pozdější změně lokální identity:** `Game.setLocalId` smaže starý rig, ale neodstraní jeho kontaktní stín. Reprodukce s existujícím stínem `guest` zanechala jeden aktivní `contact guest` (`supplemental-audit.json`). Běžná UI inicializace nastavuje identitu před `start()`, kdy stín ještě neexistuje; pozdější welcome/reconnect po renderu může malou osiřelou skvrnu zanechat až do ukončení scény. Jde o menší vizuální/cleanup nedostatek, nikoli důvod tvrdit selhání multiplayeru či FPS.
2. Build varuje na neúčinný dynamický import vegetace (současně ji staticky importuje world renderer) a velký herní chunk. Finální JS chunk hry má přibližně 4,47 MB před gzip, 1,72 MB gzip; jde o velikost jednoho emitovaného souboru, nikoli změřený první přenos nebo dobu načítání.
3. GPU shader compilation, skutečný obraz, 100 skutečně připojených klientů a dlouhý výkonový test patří do samostatných důkazů renderer/network auditu.

## Historie ověřovacích snapshotů

Snapshot B vynechal testovací adresář. `pnpm test` skončilo exit 0, ale spustilo **nula testů**; tento falešně zelený výsledek je zaznamenán v `../b-pipeline-finding.json` jako chyba testovací pipeline, nikoli chyba hry. Root opravil freeze postup a vytvořil C. C již prošlo 91 testy, buildem a integrací. Po opravě vlastních emocí v Game/UI vzniklo D a všechny tři kontroly se znovu provedly nad D.
