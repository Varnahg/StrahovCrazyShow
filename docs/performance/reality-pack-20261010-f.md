# Reality Pack F — měření zastavené při spuštění

Snapshot F se v reálném prohlížeči nespustil kvůli `TypeError: this.getGPUFrameTimeCounter is not a function`. **F nemá platný výsledek FPS ani síťové kohorty.** Výsledky staršího snapshotu D se na něj nevztahují.

- Zdrojový SHA-256: `bd2532b6f7ca623b11984cc85555cfbe9073089810f8826e423b6fae9b738f3f`, 205 souborů včetně testů a zdrojových assetů. [Manifest](evidence/reality-pack-20261010-f/source-manifest.json).
- Sekvenční `pnpm test`: 136/136 testů prošlo, žádné přeskočené; produkční build a izolovaná integrace skončily úspěšně. [Testovací log](../verification-evidence/reality-pack-20261010-f/tests.log). Tyto kontroly neodhalily chybějící rozšíření Babylon.js v browserové GPU instrumentaci.
- Produkční preview běželo na 4176 a samostatný server na 2571, svět `xmregerTW`. Chybu při spuštění skutečné aplikace zachytil hlavní agent ovládající prohlížeč. Výkonový subagent GUI neovládal.
- Nebyl spuštěn žádný bot. Neexistuje 30hráčové měřicí okno, počet pohybujících se klientů, ACK statistika ani platný FPS vzorek. [Serverová telemetrie](evidence/reality-pack-20261010-f/server-telemetry-startup-only.jsonl) zahrnuje pouze start a pokus o připojení; není zátěžovým výsledkem.
- Izolovaný server i preview byly po chybě zastaveny. Oprava a další benchmark vyžadují nový snapshot.

[Inventář instalovaných adaptérů](evidence/reality-pack-20261010-f/environment-installed.json) je pouze WMI inventář. Jeho `Current*` údaje mohou být uložené z dřívějšího režimu a nedokazují aktivní monitor ani WebGL adaptér. Přímá kontrola Win32 a postup pro výběr NVIDIA jsou v [samostatné GPU diagnostice](gpu-selection.md). [Počasí před pokusem o spuštění](evidence/reality-pack-20261010-f/weather-before-browser.json) se zachovává jako kontext, nikoli podmínka úspěšného benchmarku.
