# Předání: denní světelné varianty před hraním

18.10.2026, root `webgpu-day-native-01a14497`. Uživatel výslovně přijal delší načítání ve prospěch svižného hraní. Proto byl přijat dříve ověřený day13 celek; experimentální memo cache není součástí.

- WT commit `c9f62e95f4cb40ff9b777480b544764939b4b8ce` → main `90e893cf70094b3a15c177841ffe6f1936f72831`.
- Přesně6souborů: Game wiring, light-preparation stage list, bounded existing opt-in profiler capacity a jejich3testy. Žádný B6/camera/default/vendor/lock delta. WebGPU13/WebGL9, původní30s deadline, pending/full readiness, dvě acceptance draws a restore zachované.
- Clean snapshot `b9d812d3262ec6e781b6d268b4ca0fec108ab0b32591dbfba83a70d0578b513f`:1338/1338,fullTS/build/integrationPASS; dřívější research/review/RED-GREEN/GPU evidence v hitches-v22. Přenos SHA review bez nálezů.
- Nový combined snapshot `bce0990518c8ce652da7cd73d899a4c068a52d80fbe3cbc950c5126432124dc1`:1398/1398 bezskipů,fullTS/build/isolatedintegrationPASS. Kompletní logy a SHA v `.cache/webgpu-hitch-validation-20261017/day13-combined-v1-validation.json`. Pinned dependencies a zdroje zachované.
- Main integrace použila privátní index a CAS. Dva cizí překryvy v Game a Game testu dostaly jen reverzibilní vlastní hunks; reverzní merge obnovil původní working bytes přesně. Dalších130dirtypaths zachováno. Receipt `.cache/webgpu-migration/day13-main-integration.json`. Review opravil chybějící vazbu composition SHA na ověřený manifest před prvním zápisem; recheck bez nálezů.
- Čerstvé day13 reference1/2: Golden max124.4/121.3ms, prvníF152.3/137.5ms, valid health a0render/asseterrors. Starší native9 prvníF5175–6265ms. Časy nejsou přijímacíFPS série a stále přesahují cílových100ms.

Nový samostatný frozen build4195/API2590 má vlastní task a runtime. Hrané4193/4192/4188 beze změny. B6, další světelné/quality/auto/LOD scénáře, steadyFPS a celá migrace nejsou tímto dokončené. Nativní komponenta je integrovaná; root navazuje praktickou přejímkou a předáním buildu.

Navazující skutečný auto smoke: první neaktivní tab měl31RAF/30s a timeout; retry v aktivním okně prošel13stage přípravou21.3065s a ready. Auto poté přešlo medium→low, první lowF mělo max3993.4ms,8modulů/49syncpipelines,healthvalid. Medium coverage je funkční komponenta, ale všechnyquality nejsou připravené. Nový quality-preparation task řeší tuto doloženou mezeru; userbuild4195/API2590 byl po vlastní reprodukci zastaven, frozen zdroje i raw zachovány. Není předaný jako dokončené plynulé hraní. Vlastní native integrační pomocné procesy skončily, root může uvolnit tuto rezervaci.
