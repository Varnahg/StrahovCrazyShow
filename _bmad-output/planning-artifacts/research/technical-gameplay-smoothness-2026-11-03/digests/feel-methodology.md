# Pacing, odezva a síť – čtecí rešerše

Vše přečteno3.11.2026,6otevřenýchzdrojů/5webcalls; žádný kód projektu ani test. Zdroje popisují mechanismy, ne diagnózu této hry.

- F1: 60Hz znamená16,67ms interval a browser potřebuje vlastní režii. Pravidelných30FPS není automaticky lepších než proměnlivých60; cap je podmíněný experiment. Google/web.dev,13.12.2023: https://web.dev/articles/rendering-performance
- F2: Long Tasks sleduje úkoly≥50ms, LoAF zpožděné render updates>50ms; menší, ale pro60FPS škodlivé prodlevy mohou uniknout. Atribuce skriptů má omezení. Google Chrome,14.10.2024: https://developer.chrome.com/docs/web-platform/long-animation-frames
- F3: Nerovnoměrný vztah physics/render a sledovací kamery může způsobit jitter. Interpolace přidává zpoždění jednoho fyzikálního ticku, extrapolace může přestřelit kolizi. Unity7000Alpha,bezdata; mechanismus použitelný jako analogie, nikoli důkaz Babylon: https://docs.unity.com/en-us/engine/7000.0/manual/physics-section/physics-overview/rigidbody/rigidbody-interpolation
- F4: Snapshoty dorážejí nepravidelně; buffer/interpolace vyvažuje plynulost a latenci. Číselné příklady nejsou univerzální konfigurace. GlennFiedler,30.11.2014, původní technický článek: https://gafferongames.com/post/snapshot_interpolation/
- F5: Lokální predikce a přehrání neacknowledgovaných vstupů proti autoritě snižují čekání; opakované efekty je nutné deduplikovat. YahnBernier/Valve,původní paper vkopiiGameDevs,datum vnačtenékopii neurčeno: https://www.gamedevs.org/uploads/latency-compensation-in-client-server-protocols.pdf
- F6: Alokační/GC profily pomáhají najít zdroj pauz; samotný zásek není důkaz GC. GoogleChrome,6.11.2024: https://developer.chrome.com/docs/devtools/memory-problems

Návrhmetodiky: oddělit trvale nízkéFPS, hitch, vstupní latenci a rubberbanding. Měřit časovou řadu a tails, input→handler→sim→render (není plná input-to-photon latence), kamerové diskontinuity, CPU/GC, snapshot age/jitter/underruns a velikost korekcí. Produkční A/B stejnátrasa/podmínky, jedna změna. Prahy≥20% zlepšení jsou pracovní návrh, nikoli norma. GPU%/1%low/INP samostatně neprokazují hladký pohyb ani příčinu.
