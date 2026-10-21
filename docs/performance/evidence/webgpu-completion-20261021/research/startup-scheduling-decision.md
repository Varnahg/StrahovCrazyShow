# Startup: oddělit konečnou práci od prezentačního RAF

21Oct2026, přijatý runtime main9341bcef, neměnný source/test/asset snapshot bc38843693a9ccf591e500657d9e506d7d64e4a1788ccb4a6f9571eefa78a8bd. Tento záznam je rozhodnutí pro kandidáta, nikoli jeho GPU přijetí.

## Co je doložené

Tři nezměněné WebGPU starty a jeden kontrolní WebGL2 start končí řízeným30s light timeoutem. V diagnostic WebGPU případě nezávislý raw host RAF během přípravy přidal pouze30callbacks za31,49s. Před vznikem herní smyčky naměřená idle cadence59,9Hz, engine maxFPS undefined/customRequester false/contextLost false/skip false/windowIsBackground false. ScriptCPU není celá1s mezera, shadery a async pipeline byly při prvním selhání dokončené bez chyby. Raw seq nemá mezery v uložených vybraných případech.

Příprava potřebuje nejméně tři skutečné ticks/stage: apply/progress draw a dvě akceptační draws s kontrolami původních meshes/effects/revision. WebGPU low má15stages, další kvality13; minimálně45/39ticks nelze provést při1Hz v původním30s limitu ani s nulovou cenou práce. Původní rozpočet tak omezuje především čekání na prezentaci, přestože finální submitted gate je samostatný.

Příčina nízkého browser RAF není doložená. Uživatelská otázka skutečného nezakrytého native okna je stále nezodpovězená; DOM visible/focused ji nenahrazují. Oddělený CSS-only experiment alpha0,96 místo úplně opaque loading dopadl stejně:30ticků a timeout30,05s. Průhlednost tedy není podložená produktová oprava. Tato data nejsou steady FPS přejímka, výkonový gain ani důkaz problému výhradně WebGPU.

## Primární mechanismy a meze

[Chromium Viz](https://chromium.googlesource.com/chromium/src/+/872b13be8c32fde4ffc3c1a7c5cf6c54dfd41785/components/viz/service/frame_sinks/compositor_frame_sink_support.cc#1505) má1s BeginFrame throttling pro undrawn/unresponsive klienty. [Window throttler](https://chromium.googlesource.com/chromium/src/+/HEAD/ui/aura/host_frame_rate_throttler.cc) má na Windows1FPS; [Microsoft occlusion policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/windowocclusionenabled) potvrzuje omezení painting překrytého okna. To dokládá mechanismy, nikoli přesnou příčinu/stejný commit v instalovaném Edge155. [Blink queue](https://chromium.googlesource.com/chromium/src/+/872b13be8c32fde4ffc3c1a7c5cf6c54dfd41785/third_party/blink/renderer/modules/webgpu/gpu_queue.cc#144) zajišťuje flush při onSubmittedWorkDone; queue fence není důkaz prezentace. [Posted-message scheduler](https://chromium.googlesource.com/chromium/src/+/9596b537e435c5c23d247cb7d9925d81e8f7707e/third_party/blink/renderer/platform/scheduler/main_thread/frame_scheduler_impl.cc) nezaručuje postup při browser freeze. Pinovaný Babylon9.30 begin/endFrame řeší submit, encodery, měření a deferred cleanup; scene.render je nenahrazuje.

## Varianty a volba

Zvednout limit nebo odečíst RAF mezery by skrylo původní kontrakt. Browser anti-throttle flags nejsou produktová oprava. CSS animace může záviset na reduced-motion a nemá důkaz; translucent pilot byl negativní. Microtask spin může vyhladovět watchdog/input. Pouhý timer kolem scene.render postrádá úplný frame a backpressure. Plošný přepis Game/preview/final gate má zbytečný dopad.

Zvolený omezený kandidát znovupoužije OnDemandRender a MessageChannel task host pouze pro konečnou light preparation. Jeden queued task a jeden GPUflight; callback pracuje s původní4ms/128mesh dávkou, pak předá řízení browseru. CPU-only dávka nevytvoří prázdný frame. Skutečný draw otevře lazy beginFrame, po synchronním verdictu celého ticku (včetně finish/restore/cleanup) zdravý frame uzavře endFrame a čeká na validaci+fence. Žádný otevřený frame přes await. Failed/timeout/disposed verdict nesmí submitnout vadný encoder. Samotný voidtick ani pozdní Promise výsledek nestačí.

Stop uvnitř úspěšného ticku zruší další práci, ale dovolí dokončit tento zdravý frame; následující quality pass nemůže obejít pending fence. Abort/device loss/generation zakážou submit a ruší queued práci. Hidden stav pozastaví příští dávku, late promise se spotřebuje. Root vlastní jeden adapter od konce preload loop po finální submitted gate a finally zavře porty/observery. Gameplay/editor RAF, varianty, kvality, cache, ABI, actual mesh/effect readiness a30/90s watchdogy zůstávají původní.

Cena: další startup task/fence na skutečný draw; bez nové materiálové/shader cache. Je nutné změřit celý startup, maxima outstanding práce, odezvu a skutečnou gameplay cadence; task scheduler sám nedokládá60FPS a není označen jako „unthrottled“. Tři přesné disjunktní tasky oddělují adapter, light verdict a explicitní Game wiring. Cílené testy musí prokázat end veto i při spolknutém failure, cleanup/restore/timeout, hidden/abort/loss a stop/run při fence; potom skutečný GPU pilot na novém snapshotu.
