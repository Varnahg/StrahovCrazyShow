# Terén B6, půda a řídké květiny · KEY-61

Baseline main `ff13fa2b`. Implementace: ground `5b12122d`, statické QA `6403fa55`, květiny a stabilizace výběru `3029272c`. [Průzkum a volba](../../terrain/20261025/research.md), [nezávislé review](review.md), [index nezměněných GPU záznamů a snímků](gpu-record-index.json).

Finální neměnný snapshot v7 `3d2c6c6d0133fd4b6b20a9ed44f2021ad6784d66330fc6d4af962b9f978ce62d` obsahuje 8679 zdrojů, testů a assetů. Build s touto VITE_SOURCE_SNAPSHOT_ID prošel včetně TypeScriptu. Zdrojové/cílové SHA se před a po kopii shodovaly. Závislosti jsou pouze čtená junction k připnuté instalaci; žádná instalace či zápis do ní. Ve všech měřeních zůstává původní hraný server/snapshot 2592 neměnný.

## Skutečné opravy obrazu

- Native hex sampling všech šesti ground kanálů a obnovený fotografický detail/saturace potlačují pravidelně opakovaný motiv. Nemění se původní pixely ani metrické UV. Cena je 18 místo 6 texture fetchů; nejde o bezplatné zlepšení.
- V3 mění proti v2 pouze plugin class identity. Tím se na skutečném GPU obnovil šedý betonový chodník; CPU Effect fixture reprodukuje původní kolizi oběma pořadími. Paving data nebyla chybně přebarvena.
- V6 mění proti v5 pouze `shadowCaster:false` u tenké landcover vrstvy. Ustálený snímek odstranil vlnité pruhy před B6 a zachoval stín stromu. Geometrie, UV, shader i globální bias zůstaly shodné.
- V7 přidává omezený gate čisté mikrotranslace. Skutečný přední controller dokončí přípravu, nevytváří výběry/uploady pro 240 jitter snímků, ale reaguje na kumulovaný pohyb. Původní cadence 0,15 s zůstává. Projekce/rotace nejsou tolerancí ignorované, změna budgetu/kvality se neztratí.

## Testy a jejich meze

Ground cílené kontroly 39/39; pozdější skutečná wetness/UBO regrese 15/15; native hex sampling a wetness/detail kontroly 14/14; Effect identity 4/4; skutečný landcover shadow/geometry test 1/1. Květiny původně 44/44, actual loader regrese 10/10 a finální mikrotranslace/controller/GLSL-WGSL celek 43/43 plus tsc PASS. QA a collector společně 37/37; dodatečné přesné staré OSM/nové B6 a shader-order regrese 17/17. Tyto překrývající se běhy se nesčítají do jednoho čísla.

Plná lokální sada v1: 2100 testů, 2087 PASS, 10 FAIL, 3 SKIP. Pět chyb bylo v neúplném snapshotu/TEMP Git hranici, pět ve starých přesných očekáváních nových soil/grass dat. Opravené fixtures zachovaly původní hashe, testy nebyly vypnuté. V2 plná sada s concurrency4: 2102 testů, 2098 PASS, 1 FAIL, 3 SKIP, 1720406 ms. Jediná zbývající nezměněná autodev fixture překročila časový limit; samostatné opakování 1/1 PASS za 22,288 s. **To není čistý plný PASS.** Tři skipy jsou Linux-only browser, POSIX trailing-space fixture a volitelný zachycený station HTML. Finální CI musí potvrdit aktuální kombinaci.

V4 build odhalil nullable TypeScript ve fixture Effect testu; opraven explicitní assert existence před isReady, bez změny produkce. V5/V6/V7 build PASS. V6 i finální v7 úplná izolovaná `pnpm test:integration` na2568 PASS včetně respawnu, společného světa, epoch/backlog a feedback; vlastní servery se ukončily. V7 log je `candidate-v7-integration.log` v taskové lokální cache.

## GPU metodika a dosavadní výsledky

Edge, NVIDIA GeForce GTX1060 přes ANGLE/D3D11, WebGL2/MSAA4, driver582.28. CSS1280×720; low interně984×553, medium/high1280×720. DEMO den11:00 a jasno, vítr3m/s od270°, běžný HUD, panel nastavení během měření zavřený. Každý záznam má vlastní source ID, skutečný view/projection a 10s intervaly. Pevné guest počátky, žádné WASD/chůze/jízda/ruční otáčení kamery. Drobné samovolné fyzikální posuny stojící postavy jsou v záznamech přiznané. IAB/Intel měření se nepoužívají pro cílovou přejímku.

| Pevný pohled / kvalita | Baseline FPS | V7 FPS | V7 p95 / p99 ms |
|---|---:|---:|---:|
| B6 front / medium | 42,7 | 39,5 | 29,2 / 34,9 |
| B6 rear / low | 51,5 | 44,4 | 27,3 / 32,6 |
| B6 rear / medium | 41,7 | 38,5 | 34,4 / 43,8 |
| B6 rear / high, po ustálení | 39,4 | 36,4 | 32,4 / 38,8 |
| OSM kontrola / medium | 33,9 | 34,2 | 35,0 / 48,3 |

Baseline B6 v těchto pohledech nemá žádné skutečné trsy; v7 je přidává spolu s řídkými květy. Jde o cenu většího detailu, ne o tvrzení zrychlení či zaručených60FPS. Jednotlivé intervaly nejsou statisticky robustní profil celého světa.

První v7 high interval29,1FPS/p95 111,7/p99 125,2 obsahoval souvislou sérii pomalých snímků po změně kvality; není vybrán jako ustálené srovnání. Zachován beze změny. Opakování po ustálení36,4FPS má preparing=false/pendingTiles=0 a0chyb. V5 front má preparing=true a není ustálený důkaz. V6 výkon má sourceSnapshotId=null kvůli opomenuté build-time proměnné a není přijat. První v6 obraz ještě neměl dokončený světelný přechod; pro kauzální důkaz slouží až settled snímek. Původní Edge startup~1RAF/s se po potvrzení popředí rozběhl bez změny hry.

Nezávislé finální vizuální review všech čtyř v7 pohledů přijalo odstranění dlaždic i pruhů, šedý beton a kontinuitu pěšiny bez dalšího nálezu. Další far medium interval má28,5FPS/p95 42,1/p99 85ms; bez shodného baseline není srovnáním výkonu. Skutečný WebGPU rear medium startup a materiály prošly, renderer ready/0chyb, obraz zachován. Jeho22,1FPS/p99 125ms při přepnutí není přijetím výkonu WebGPU ani podkladem změnit výchozí WebGL2.

Lokální připojení browserového multiplayeru prvního v7 sestavení vrátilo Method Not Allowed: výchozí fallback `/realtime` předpokládá odpovídající nasazení. Druhý build stejných neměnných zdrojů do nového `dist-local` používá existující dokumentovanou konfiguraci `VITE_MULTIPLAYER_URL=/`, stejně jako Docker. Původní `dist` zůstává zachovaný. [Receipt](local-build-receipt.json) odděluje tento build parametr od identických herních zdrojů; nejde o změnu produkčního kódu.

## Otevřené hranice

Čtyři skutečné multiplayerové relace (browser +3SDK, předlohy Robin/Mia/Niki) prošly běžným připojením a statickým vykreslením na stejném v7 zdroji s lokální build konfigurací. Záznam `edge-candidate-v7-multiplayer-four-medium-hud.json` uvádí4avatary,4nearLOD,58,4FPS,p95/p99 20,4/23,4ms a0chyb. SDK neposílalo pohybové vstupy a po časovém limitu se samo odpojí. První pokus o multiplayerový interval již zastihl1avatar po vypršení SDK klientů; záznam je zachovaný a nevydává se za čtyřhráčový. Běžný spawn v tomto pohledu neobsahuje nové B6 trsy, proto jde o důkaz běžné integrace, nikoli davového výkonu trávy.

Přesné CI head/base/run a následné přijetí do main se zaznamenává v KEY-61/PR; tento report nepředjímá úspěch čekajícího CI. Nejde o rekonstrukci každého stébla či místní druhový inventář: žluté květy jsou konzervativní interpretace fotografie, asset CC0 je generický. CAD a soukromé fotografie zůstávají mimo Git. Stromy nejsou součást této etapy. Dřívější rozdíl zadní terasy B6 0,481 m a36 neověřených sprchových cílů tímto nejsou vyřešeny.
