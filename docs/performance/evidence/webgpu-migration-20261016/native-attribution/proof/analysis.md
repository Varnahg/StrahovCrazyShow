# Pouze nativní benchmarková atribuce

Normal native777a1bbb vykázal5novýchprogramů/10modulů/12sync a573ms max při nulovém ambientu. Plain telemetry neposkytuje whole defines/users; nelze z ní oprávněně vybrat další opravu. Reviewed compilation+incident profiler již tuto omezenou vazbu řeší (32requests,4users,16KiBdefines a32KiBlogger budget včetně dvojí anonymizace).

Volba: přesné dva reviewed profiler moduly a úzký lifecycle v copied native Game. Celý C5 Game by přenesl jiný startup, deferredplayers a frame instrumentaci. Zvolený explicitní benchmark používá existující local-recording gate a WebGPU, NE profileEnvironment. Startup tedy nedostane inventář/environment/raw-RAF hooks jen kvůli této atribuci. Původní BenchmarkRenderProfile zůstává; nový RenderIncidentProfile žije pouze během benchmarku a jeho vlastní neaktivní phase observers a shader/material counters představují přiznanou diagnostickou režii. Nejde o FPS kontrolní A/B.

Stop má identity guard a odpojí callback, ukončí export i disponuje incident při restartu, konci, fault a dispose. Vnitřní Promise/wrapper/sanitizer kontrakty se nemění. Žádná změna quality/lighting přípravy, aktérů, kamery, renderer factory, shaderů, device options, cache nebo limitů.
