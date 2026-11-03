# Rodičovský výzkumný digest

Vše otevřeno3.11.2026. Nezávislé ověření metodiky: Unityprofilingguide https://unity.com/how-to/best-practices-for-profiling-game-performance (nedatovaný) a ChromePerformance https://developer.chrome.com/docs/devtools/performance/reference (rolling) rozlišují fáze, GPU a režii instrumentace. Unity popisuje i čekání naGPU; delšíCPU marker sám nedokazuje drahýJS výpočet. Přenos dopadů doBabylonu musí ověřit vlastnítrace.

GoogleOMT https://web.dev/articles/off-main-thread (5.12.2019) nabízí koncept práce mimo main; čerstvě načtené MozillaMDN https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers (rolling/bezdata) potvrzuje message passing, structured clone/transfer. Toto potvrzuje náklady přenosu a izolaci, nikoli přínos konkrétního workeru. Zastaralá tvrzeníGoogle o bundlerech se nepřebírají.

NVIDIA https://developer.nvidia.com/blog/understanding-and-measuring-pc-latency/ (5.5.2023) rozděluje vstupní, počítačovou a zobrazovací latenci. Čtený byl původní text od odstavceSystemlatency, ne přidaná AI-generatedsummary. Přenos je pouze metodický; ReflexSDK není návrhem pro browserovou hru.

LTS analogie kamery: https://docs.unity.com/en-us/engine/6000.3/manual/physics-section/physics-overview/rigidbody/rigidbody-interpolation (relativníaktualizace2měsíce, přesnýdenneuveden) potvrzuje latenci interpolace a riziko extrapolačního přestřelení. Slouží jako obecný tradeoff, ne jako konkrétníAPI proRapier/Babylon.
