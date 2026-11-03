# WebGPU přípravný rozpočet –3.11.2026

- Výslovná změna zadání uživatele po C10: zvýšit limit, aby bylo možné WebGPU dokončit a testovat. Nový rozpočet60s na kvalitu a180s celkem nahrazuje starý30/90 pro tuto orchestrace.
- C10CM při stabilním preflightu skončilo po30028,7ms vLow/restore; NCM došloready a má3uloženévzorky. Nejde o novýFPSdůkaz ani o důvod obejít skutečnoureadiness.
- Změněny pouze2konstanty client/render-quality-preparation.ts a odpovídající rozpočtovéregrese. Všechny3kvality, apply/restorečas, cancellation,health/submission zůstávají. WebGL2 jde přímo do původního lighthelperu a jeho30s default se nemění.
- Cílená sada render-quality/game-light/game-startup78/78PASS, scopedTypeScriptPASS, nezávisléčtecíreview[]. Nový35s-per-pass případ skončí za105022ms se všemi3kvalitami; horní60/180meze včetněrestore se dále testují.
- Implementace připravená, skutečnýnovýC11 WebGPU běh následuje po novémimmutablebuildu. StarýC10 ani dřívějšítimeouty se nepřepisují. Rootmávalidačníclaim a žádnýstarýserver/sampler/peer užneběží.
