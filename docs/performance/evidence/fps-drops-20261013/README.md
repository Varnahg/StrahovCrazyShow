# Evidence FPS auditu, 13. října 2026

Závěry, konkrétní opravy a omezení: [audit](../../fps-drops-20261013.md).

- `grass-before.json`: původní izolovaný CPU profil; `grass-intermediate*.json` jsou **zamítnuté meziverze**, nikoli finální výsledek. Meziverze neuměly správně doplňovat aktuální výhled při souvislém pohybu.
- `grass-cpu.ts`: společný ovladač načítá původní nebo finální checkout. Zachovává původních pět scénářů a přidává samostatná měření do úplného ustálení pevného výhledu. Pole `frames` je počet volání při syntetickém 60Hz čase, nikoli dosažené FPS; `settled` rozlišuje hotový a částečný porost. `firstVisibleFrame` znamená první přidělené instance; jejich shaderový fade se ověřuje regresními testy.
- `sky-before/after.json`: 300 CPU aktualizací stejné oblohy, setup oddělený; GPU upload není zahrnutý. Ovladač `sky-cpu.mjs`.
- `transit-before/after.json`: pět opakování tří časových oken, přesné SHA výsledných překážek; ovladač `scripts/profile-transit-cost.ts`.
- `flashlight-before/after.*`: skutečná produkční aplikace v Chromium/SwiftShader, DOM diagnostika, nové GL programy, dlouhé úlohy, CPU profil a snímek. Skutečný čas a fallback počasí se mezi běhy liší; záznam není řízený GPU A/B důkaz. Volitelný `*-movement` smoke používá nativní klávesnici a pravé tlačítko myši, bez tvrzení o projeté trase.
- `test.log`, `build.log`, `integration.log`, `validation.json`: celé sekvenční ověření společného checkpointu.

Reprodukce v kořeni projektu s připravenými závislostmi Node24/pnpm11 a Git LFS assety:

```sh
node --import tsx docs/performance/evidence/fps-drops-20261013/grass-cpu.ts /absolute/checkpoint /absolute/output.json
node --import tsx docs/performance/evidence/fps-drops-20261013/sky-cpu.mjs /absolute/checkpoint
node --import tsx scripts/profile-transit-cost.ts /absolute/checkpoint
python3 docs/performance/evidence/fps-drops-20261013/browser-profile.py /absolute/built-snapshot label --movement
```

Pro browser musí snapshot obsahovat ověřený `dist/` a `source-manifest.json`, Python Playwright a `/usr/bin/chromium`; ovladač dočasně vlastní API2570 a preview4175 a oba procesy po skončení ukončí. Před spuštěním kontroluje obsazené porty. Baseline a kandidát používají stejné závislosti. CPU profily i browser se spouštějí postupně bez souběžného Blenderu, buildu či další scény. Další spuštění ukládat pod novými jmény, aby nezanikla původní evidence.
