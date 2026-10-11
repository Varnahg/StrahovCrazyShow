# Ověření zmrazené sestavy G — 11. 10. 2026

Snapshot: `.cache/performance-snapshot/authored-models-20261011-g`.

SHA-256 ID: `18312ddacd1191e512cfb5f0e1018f024e020fdad8d0075130657e4ea43a6684`.

Všechny příkazy běžely **sekvenčně ze snapshotu**, nikoli z živého pracovního adresáře. [Manifest](./source-manifest.json) obsahuje 7 866 souborů včetně 45 testovacích souborů, zdrojů, modelů a médií. Závislosti používají původní `node_modules` přes junction; verze identifikují hashované package/lock soubory.

| Kontrola | Skutečný výsledek | Doba příkazu | Úplný log |
| --- | --- | --- | --- |
| `pnpm test` | **264/264 PASS**, 0 FAIL, 0 skipped/cancelled/todo, exit 0 | 377,472 s | [tests.log](./tests.log) |
| `pnpm build` | TypeScript i Vite produkční build PASS, exit 0 | 52,884 s | [build.log](./build.log) |
| `pnpm test:integration` | Izolovaný server a dvě skutečné SDK relace PASS, exit 0 | 19,964 s | [integration.log](./integration.log) |

Přesné UTC začátky/konce, příkazy, pracovní adresáře, signal a exit code obsahuje [results.json](./results.json). Produkční soubory vznikly pouze ve snapshotovém `dist`; živý `dist`, zdroje, hlavní server a preference uživatele nebyly měněny.

Kompletní testy zahrnují skutečné geometrie a materiály, správu LOD a streamování, identitu samostatných budov/aut/stromů, ovládání/kameru, kanály a souhlasy komunikace a fyzikální vstupy. Delší grid test ověřil 4 309 přístupných venkovních sond, z nich 1 840 pod původní nulovou hladinou a 1 187 na svazích, pomocí skutečného ustalování postavy bez záchranných teleportů. Doba testu není měření FPS hry.

Integrační wrapper použil port **2568**, oddělený od hlavního serveru. Ověřil společný svět, hranici hosta, vzájemnou přítomnost/pohyb dvou relací, skutečný fyzikální plyn/W/A/D/brzdu/zpátečku/bezpečné vystoupení a návrat do auta, globální i soukromý chat, přijetí kontaktu, blokování, vlastnictví událostí, obnovení relace a weather endpoint. Wrapper vlastní server ukončil; po skončení na 2568 nebyl listener. Log zachovává také SDK diagnostiku ukončení spojení s kódem 4002; celý test přesto dokončil všechny assertions a skončil exit 0.

**Historický popisek:** `scripts/integration.ts` stále používá ve výstupu formulaci „on photogrammetry“ a načítá stará photoCollision metadata pro případný evidenční export. Frozen `server/index.ts:36` ale skutečně vytváří `new Simulation()` bez photogrammetrického argumentu. Test tedy běžel proti nynějšímu nativnímu světu; starý popisek není dokladem použití surového IPR meshe. Kvůli zachování ověřovaného hashe nebyl text ve zmrazeném zdroji přepsán.

Build hlásí neblokující upozornění na statický i dynamický import `vegetation.ts`, větší JavaScript chunky přes 1 100 kB a časování přípravy výstupního adresáře. Vše je zachováno v úplném logu; nedošlo ke změkčení testů ani maskování výstupu.

Závěrečný [source-check.json](./source-check.json), po všech třech příkazech v **2026-10-10T23:04:44.158Z**, porovnal SHA-256 každého manifestovaného souboru se snapshotem i živým projektem a také vyhledal dodatečné soubory v zachycených adresářích. Výsledek: **liveAndFrozenMatch=true, mismatches=[], allStagesPassed=true**. Dokumentace, cache, dist a node_modules nejsou součástí source manifestu.

Toto ověření neobsahuje browser/FPS benchmark, boty ani nasazení. Měření produkčního výkonu se má provést až nad touto úspěšně ověřenou sestavou se stejným source ID.
