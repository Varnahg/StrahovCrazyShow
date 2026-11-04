# Kontrola výzkumného reportu

- Editorial structure: žádné nálezy.
- Editorial prose: opraveno spojování názvů metrik/jednotek a jednoznačně stanoveno „o20%nižšíp95“ a „o polovinu nižší četnost“, nikoli „nejméně polovičníčetnost“.
- Nezávislá sémantická kontrola: dvě podstatná upřesnění. 66ms není celýcallback, nýbrž scope končící předrecorderem/HUD. Doplněn přímý odkaz na čtyři startup výsledky doimportu. Obojí opraveno vreportu i podkladech.
- Root prošel skutečný Game→UI→projectLocalBenchmark→server exportní řetězec. FrameIntervals a main-pass GPU pole nejsou v uložených benchmarkech, protože je whitelist nezachová. Příčina výkonového záseku tím stále není určena.
- Nezávisle přečtené Chrome/NVIDIA/UnityLTS/MDN zdroje podporují rozlišovánílatence,časovýchscope a nákladůworkerů. DostupnostdetailníhoGPUtrace a ziskjakékoliúpravy zůstávají otevřené.
- Číselné limity přejímky jsou pracovní návrh. Zde neproběhl novýGPUtest, časováníaniimplementace.
