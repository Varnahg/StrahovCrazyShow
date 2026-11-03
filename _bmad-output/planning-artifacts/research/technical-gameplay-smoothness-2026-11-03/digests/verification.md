# Doplnění a kontrola nosných tvrzení

Root3.11.2026 otevřel oficiální Chrome Performance reference, LoAF a Memory problems, Google OMT článek, MDNUsingWebWorkers, Unityprofilingguide aUnity6000.3LTSinterpolation, NVIDIAUnderstandingandMeasuringPCLatency. Přesné odkazy jsou v research.md.

- Chrome+Unity nezávisle doporučují hledat úzké místo od kategorií k funkcím a oddělit detailní profil od normálního výkonového sběru. Čas strávený v CPU markeru může být čekání; bezGPUčasů nelze prohlásit CPU bound.
- Unity6000.3LTS potvrzuje stejný interpolation tradeoff jako agentem načtenáAlpha dokumentace. Report cituje LTS; neprovádí se migrace enginu ani přenosUnityAPI doBabylonu.
- GoogleOMT2019 je starý koncepční zdroj. Tvrzení o tehdejší podpoře bundlerů se NEPŘEBÍRAJÍ. Aktuálně načtenéMDN potvrzuje messaging/clone/transfer a chybějící přímýDOM. Výkon a vhodnost konkrétního workeru u nás zůstávají neověřené.
- NVIDIA2023 rozlišuje části input-to-displaylatence; používá se původní text článku, nikoli AI-generatedsummary. Nenavrhuje se nasadit ReflexSDK do prohlížeče.
- Root potvrdil rawC9 seq1132/1653/1666 a vztah vnořených časů. Kauzalita1,33s mezery zůstává neověřená; nezaměňuje se za GPUstall,GC,špatnýovladač nebo chybu netcode.
- Výzkum končí pokrytím metodiky a pořadí ověřování. Další webové zdroje nemohou nahradit chybějící trace konkrétní hry; nejde o důvod rozšiřovat rešerši.
