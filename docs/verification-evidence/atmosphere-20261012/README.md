# Atmosféra A · společný checkpoint · 12. října 2026

Source snapshot **cc97bef12245d7861505791ea4ad5d56e3d667c55f81cf8e10f2a0e1927edae5**, **8313 souborů včetně testů**, protokol **10**. Zahrnuje nové počasí i předaných 202 outdoor objektů. Nové modelování budov v oddělené worktree do tohoto checkpointu nepatří.

## Pipeline

- `pnpm test`: **648/648**, exit0, 107,8s.
- `pnpm build`: **PASS**, exit0, 36,8s; VITE_SOURCE_SNAPSHOT_ID odpovídá manifestu.
- První `pnpm test:integration`: exit1, timeout „A turns the real front wheels left“. Původní [log](test-integration.log) zůstává zachovaný.
- Stejný snapshot bez změn: opakovaná **celá integrace PASS**, exit0. [Výsledek](integration-retry.json), [log](integration-retry.log). Skutečné SDK scénáře ověřily respawn, W/A/D/brzdu/couvání/nastoupení, hosta, chat, reconnect, 12 účastníků a backlog recovery. Test ani fyzika se kvůli timeoutu neoslabily; skripty, simulation, netcode a server/index jsou bitově stejné jako u předaného outdoor B. Příčina časového výkyvu není izolovaná.
- [Pipeline záznam](pipeline.json), [manifest](source-manifest.json), [nezávislý SHA audit](source-check.json).

## Produkční GPU

Codex IAB, WebGL2 / ANGLE D3D11, **Intel UHD Graphics 630**. CPU Intel Core i7-8750H; Windows napájení Rovnováha. CSS **1280×720**, medium interně **1280×720**, low **984×553**. Přesná verze hostitelského Chromium nebyla rozhraním dostupná. Jedna celá produkční hra s HUD a otevřeným nastavením, pevná kamera na nádvoří, řízené označené počasí. Všechny měřené intervaly mají 0 render/asset chyb. Jiné námi řízené 3D scény a Blender byly po dohodě zavřené.

| Scéna | FPS | p95 ms | p99 ms | Intervaly |
| --- | --- | --- | --- | --- |
| 1 relace, den, medium | 37,9 | 30,1 | 33,0 | 1×10,01s |
| 30 relací, den, medium | 30,6 / 28,0 / 32,1 | 41,2 / 51,9 / 36,6 | 44,1 / 68,9 / 45,8 | 3×10s |
| 30 relací, úplňková noc, medium | 30,5 / 32,2 / 30,5 | 47,2 / 38,3 / 48,9 | 71,1 / 46,1 / 58,5 | 3×10s |
| 30 relací, den, low | 42,7 | 30,4 | 35,5 | 1×10,02s |

[Strojové shrnutí a profil](gpu-summary.json) odkazuje na jednotlivá JSON s nezprůměrovanými `frameIntervalsMs`, skutečným GPU, projekcí kamery, počasím a stínovým stavem. Úplné inventáře byly skutečně stažené v `one-day-medium-full.json`, `thirty-day-medium-full.json`, `thirty-moon-medium-full.json`, `thirty-day-low-full.json`. Medium GPU práce ve třiceti lidech byla v jednotlivých vzorcích přibližně 26,9–31,4ms, low18,4ms; tato GPU/CPU čísla nejsou sčítaná ani vydávaná za p95 celé latence.

**Přísný medium cíl ≥30 FPS a p95≤33,3ms nebyl splněný; 60 FPS se netvrdí.** Low má pouze jeden vzorek, nikoli kompletní přejímku. Chybí shodné před/po A/B bez ostatních změn, takže se netvrdí zrychlení ani optimálnost. High a jiná místa nebyla FPS testem pokrytá. GeForce neměřena.

## Síť a praktický rozsah

29 skutečných SDK klientů + browser, šest avatarových předloh. [Síťový záznam](network-29-atmosphere.json) po364,123s: každý motion30 řádků, všech29 klientů se pohybovalo, tick60,010Hz, motion19,993Hz, bez aplikačních chyb; **29 cílených resynchronizací input-backlog**, ack p95 117,231ms. Všech sedm třicetiavatarových GPU intervalů leží uvnitř tohoto souvislého běhu. Loopback na jednom PC není internetový test ani důkaz nulových záseků. Ukončení stop-souborem zavřelo všechny SDK relace.

Produkční nativní vstupy ověřily A/D, V a návrat do třetí osoby a její orbit. IAB odmítl pointer lock; první osoba vyžadovala oznámený pravý tah. Použitý základní browser drag podporoval levé tlačítko, proto se nativní pravý tah nad80° netvrdí. Skutečný Babylon kamerový test promítá80° těleso, kontroluje A/D při16 natočeních; plná GPU scéna v diagnostice zobrazila skutečný Měsíc ve výšce50,6°. SDK integrace ověřila řízení skutečného auta. Předaný outdoorB navíc provedl B6 vstup tam/zpět18/18; nové počasí geometrii ani schody nemění.

Vizuální scénáře celé DEV hry jsou [zde](../../weather/atmosphere-evidence/): proměnlivé mraky, zlatá hodina, úplněk, první čtvrť zakrytá budovou/stromem, déšť/high, sníh/low a mlha250m. Všechny finální zaznamenané stavy byly ready a bez shader/asset chyby. Nejsou FPS důkazem. Soubory s `initial` a `cloud-refinement-first` zůstávají výslovně mezikroky. První diagnostická HTML verze postrádala label layer, byla opravena před těmito stavy. [Produkční večerní snímek](production-golden.jpg) a [produkční konzole](production-console.json) jsou samostatné.

## Omezení a podklady

[Obloha/HYG a licence](../../weather/atmosphere-sources.md), [fotometrie a mlha](../../weather/atmosphere-lighting.md), [stanice/model/čerstvost](../../weather/provider-sources.md), [stíny](../../weather/shadow-sources.md). Palety/intenzity jsou výtvarné jednotky, ne lux. Mraky nejsou satelitní obraz a nevrhají lokální putující stíny; stínová mapa zůstává lokální PCF. Nejde o volumetrický ray tracing ani napodobení assetů Hogwarts Legacy. Měsíc nemá přesnou libraci/zatmění; sníh se neukládá na zem. Okna jsou simulovaná. Aktuální čas a meteorologické stáří zůstávají oddělené od náhledu osvětlení.

Vlastní testovací služby4191/2586/5191 a všechny testovacíGPUtably byly ukončené. Nasazení hlavního4179/2570 bude doloženo v `publication.json`; původníD2 služby byly výslovně předány jejich původním vlastníkem, nikoli převzaty jen podle portu.
