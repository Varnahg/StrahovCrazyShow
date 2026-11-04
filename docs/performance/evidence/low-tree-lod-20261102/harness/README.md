# Produkční A/B z jediného main

Harness nemění produkční bootstrap, Game, profil hráče ani renderer. Nepoužívá DEV hook, replay, teleport či runtime instrumentaci. Všechny editovatelné zdroje zůstávají v kanonickém main; `.cache/low-tree-lod-20261102/` obsahuje jen buildy, manifesty a naměřené výstupy. `public/` ani `node_modules` se nekopírují.

Koordinátor před spuštěním drží výstupy v `.cache/low-tree-lod-20261102/`, `.cache/game-diagnostics/`, `heavy-validation`, `workspace-build`, pro prohlížeč `gpu` a porty `2568`/`4179`. Port8080 se nepoužívá. Ověřit skutečné cizí 3D scény; nezavírat je bez vlastníka. API automaticky zapisuje diagnostiku do společného `.cache/game-diagnostics/`; harness ji nemaže.

## Build

Z kořene jediného checkoutu na main, po dokončení instalace z frozen lockfile a LFS preflight:

```powershell
node docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs --build baseline
# Teprve po úspěšném baseline buildu implementovat kandidáta.
node docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs --build candidate
```

Každý label lze vytvořit jen jednou. Selhaný build zůstává zachovaný s `build-failure.json`; nepřepisuje se. Opakování použije nový label `baseline-2` nebo `candidate-2` (případně další kladné číslo). Harness používá produkční Vite konfiguraci s native loaderem, bez `.env`, s `publicDir:false`. Zahrnuje source/test manifest, Git identitu public stromu, SHA256 skutečných public bajtů, bundle bajtů, vlastních adapterů a package metadata závislostí. Kontrola před/po buildu odmítne souběžnou změnu; délky obou public hashování a celého buildu jsou v `identity.json.timingsMs`. TypeScript a testy spouští koordinátor samostatně; úspěšný Vite build je nenahrazuje.

## Běh

```powershell
# Volitelný společný fixture: explicitně označené QA počasí.
$env:STRAHOV_PERF_WEATHER_FIXTURE = 'C:/Users/rezac/Documents/GitHub/StrahovCrazyShow/.cache/low-tree-lod-20261102/weather.json'
node docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs --serve baseline
# Po Ctrl+C a potvrzeném cleanup.json:
node docs/performance/evidence/low-tree-lod-20261102/harness/run.mjs --serve candidate
```

Každý start dostane vlastní `runs/<label>-<čas>-<uuid>/`. API používá stále aktuální, ale proti baseline hashově shodné server/shared zdroje z main. Pozdější změna client/test souborů nebrání spuštění původního A bundle. Změna public bajtů, serveru, shared, patchů, lockfilu, harnessu či package metadata běh odmítne. Nepřepisovat zdroje/assety během běhu; opětovná kontrola je při ukončení, nikoli v každém snímku. Package metadata sama nejsou úplným auditem instalovaných dependency bajtů; během kampaně závislosti neměnit.

Preview4179 servíruje nejprve příslušný dist, pak ověřené public assety pouze pro čtení, pak standardní Vite fallback. `/api` a `/realtime` směřují pouze na vlastní API2568. API odstraňuje zděděné OpenAI/RAG/Linear/feedback a Vite/STATIC konfigurace. Běžné počasí může kontaktovat běžné veřejné weather providery; pro A/B použít tentýž označený fixture a stejný náhled času v UI.

CLI zůstává v popředí; vlastní child proces je na Windows skrytý. SIGINT/SIGTERM nebo30min limit uzavře vlastní preview/API, ověří zachované vstupy a zapíše `cleanup.json`. Žádné ukončování cizích procesů podle portu. Původní soubory/logy zůstávají zachované. Přijetí výsledku vyžaduje čistý cleanup a revalidaci vstupů.

## Skutečná hra

Otevřít `http://127.0.0.1:4179/?renderBackend=webgpu` nebo explicitní `webgl2` podle zvolené kampaně. Běžné „Pusť mě dovnitř“ → přezdívka/postava → „Vstoupit do hry“ vytváří skutečnou multiplayerovou relaci. Nepoužívat headless SwiftShader pro GPU přejímku. Připravenost vyžaduje boot/renderHealth ready, lightPreparation complete, connected a nulové asset/render chyby. Samotné připojení nestačí.

V Nastavení zvolit low pro tento experiment a po ustálení „Změřit FPS po dobu10sekund“. Během intervalu nezískávat screenshoty, DOM/AX snapshoty nebo profily. Zavřít velký report; zachovat běžný HUD, viditelnost a fokus. Dokončený výsledek se standardní produkční cestou uloží do vlastního `runs/.../benchmarks/`; „Stáhnout úplný záznam“ zachová i plný mesh inventář. `#benchmark-result` obsahuje raw frame times, ale mesh inventář zkracuje.

A/B potřebuje stejné CSS i interní rozlišení, backend, kameru, čas, počasí, různá skutečná avatarová připojení, cache/warmup podmínky a zaznamenanou GPU/driver/browser identitu. Zaznamenat všechny neúspěšné pokusy. Harness sám neautomatizuje trasu, nevytváří peers a netvrdí dosažení60FPS. Opakované A1/B1/A2/B2/A3/B3 se spouští ze stejných dvou zachovaných distů.
