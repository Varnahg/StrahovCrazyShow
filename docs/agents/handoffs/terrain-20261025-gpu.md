# Předání statické GPU kontroly

Uživatel výslovně povolil kontrolu po ukončení hraní a vyžádal Edge pro GTX1060. IAB scény byly odpojené, starý2592 server/snapshot zůstal beze změny. Všechna vstupní ovládání byla omezená na menu a pevné QA počátky; žádné WASD/chůze/jízda/otáčení kamery. CPU testy a build neběžely během přijímaných intervalů.

[Původní záznamy a index](../../verification-evidence/terrain-20261025/gpu-record-index.json), [metodika a skutečné výsledky](../../verification-evidence/terrain-20261025/README.md). Edge1280×720, WebGL2/MSAA4, GTX1060, source v7 `3d2c6c6d0133fd4b6b20a9ed44f2021ad6784d66330fc6d4af962b9f978ce62d`. Čtyři vizuální pohledy přijaty nezávislým reviewerem. WebGPU ověřilo skutečné materiály bez renderových chyb; není přijato jako výkonnější backend. Čtyři skutečné MP relace ověřeny v běžném statickém spawnu, odděleně od výkonu B6.

Přechodové a chybně identifikované běhy zůstávají zachované a oddělené. Neplatný clipped screenshot není doklad celé scény. Původní low a nový medium/high nelze přímo porovnat napříč rozlišením. Bez pohybu nelze prohlásit pohybové blikání či všechny možné pohledy za ověřené.

Dočasné viewport override se před předáním resetuje. Provozní identita běžícího preview a současná GPU rezervace zůstávají místní; nejsou součástí Git evidencí.
