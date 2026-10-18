# KEY-31: první F bez nové kompilace, zbývající denní přechod

18.10.2026. **Jeden izolovaný QA pilot, nikoli dokončená přejímka nebo native runtime integrace.** Navazuje na [předchozí pilot](../hitches-v7/README.md) a [avatar/entry proof](../hitches-v8/README.md). Hrané4193/4192/4188 zůstaly nezměněné.

Kandidát `36431c878f1c0c151af4bc259918a108dee60b15d1d294ecb7e6e40ee12ad42b` doplnil day mapped-POINT1 OFF/ON a odvozenou clipped B6 kameru. Čistý target/desired výpočet sdílí s normálním CameraFollow, jehož128kombinací včetně alokací prošlo parity kontrolou. Nezměnil actor/avatara, timeout30s ani úplnou readiness. Existující inventory potřebuje18labelů: skutečný RED odhalil interní clamp16, následná úzká oprava dovolí explicitní hardcap20 při nezměněném default16 a ostatních limitech. Bez nové cache nebo diagnostických hooks.

## Skutečné ověření

72/72 targeted +35/35 inventory testů PASS, fullTS a produkční `pnpm build --configLoader native` PASS; shared dependency metadata beze změny. Čtecí review všech5runtime souborů bez blokujících nálezů. Dřívější failed fixture tick-limit a skutečný inventory RED jsou uložené; nejsou vydávané za úspěšné. Fullsuite/integration tohoto kandidáta zatím neproběhly. [Build receipt](b6-coverage-v2-build.json), [overlay SHA](overlay-record.json), [source composition](candidate-composition.json), [source manifest](candidate-source-manifest.json.gz).

Fresh server a vstup od spawnu, Edge WebGPU compatibility, NVIDIA/pascal, medium/manual,1512×642 CSS i render,59.9Hz, jeden skutečný multiplayer klient/Alex. Normální GPU timing +opt-in `profileEnvironment=1`; žádný současný build/test/GPU klient. Osvětlení day18.10.10:00Z a řízené označené počasí. Celý vstup→ready **39.0587s**, příprava **21.1177s**, poslední gate40.4ms. Startup710modulů,52sync+403async, completed/pending/failures v pořádku. Nové day1 etapy2.0331+2.3814s; B6 etapy1.6428+2.0144s. Cena startupu není skrytá.

| Samostatné okno | Raw seq | Snímky | FPS | P95 / P99 | Maximum |
|---|---|---:|---:|---:|---:|
| OFF |7325–7908|270|27.0|46.7 /71.1ms|80.1ms|
| První F |10548–11121|229|22.8|58.2 /69.4ms|190.0ms|
| Ustálené ON |15384–15938|238|23.7|53.1 /62.7ms|81.1ms|

Jediné F seq10600@402562.9ms je896.7ms po začátku druhého okna. Ve všech třech oknech moduly792→792, sync111→111, async403→403, inventory CPU delta0. První F tedy v tomto průchodu **nevytvořilo žádný nový modul/program ani pipeline**. Zůstává CPU188.1ms/mainDraw153.9ms a791přepnutí již existujících Effectů,190ms interval a další103.8ms. Je to znatelný zbytkový zásek, ne plynulost bez výhrad. `previousContext.flashlight=false` u190ms summary řádku je starší kontext; pořadí akce a aktuální kontext potvrzují ON.

B6active505 ve všech výsledcích. Health valid renderer2/generation1,0pending/errors; dispose seq17395 render/asset errors0, profil17396 inactive/tracked resources0/observerErrors0. [ON obraz](b6-coverage-v2-pilot1-on.png) při vizuální kontrole zachovává scénu, avatara a svítilnu; nejde o úplnou pixelovou přejímku všech funkcí.

## Otevřené prodlevy a hranice porovnání

Přechod na Day ve spawnu seq835 stále vytváří seq842 interval889.7ms/CPU869.2ms/mainDraw841.2ms/29programů/404Effect changes/0RTT a seq851 mezeru3593.8ms při CPU26.3ms. To jsou jediné gameplay intervaly nad500ms. Běžný den v daném počasí má DIR+HEMI bez mapped POINT, zatímco day1 POINT výslovně znovu zapne. Night0 zase neobsahuje Directional. Source audit tak dokládá chybějící day0; dominantní shadow-wrapper příčina tohoto přechodu doložená není.

Cesta ještě není bez dalších prodlev: přístup k B6 má seq1722 interval398.8ms/CPU127ms (těsně předtím seq1718 dva nové programy). Před OFF benchmarkem uvnitř B6 seq7207 interval222.9ms/CPU214.7ms se2novými programy; není správné automaticky ho označit za okamžik vstupu. Mezi startup snapshotem a OFF oknem přibylo celkem82modulů/59sync. Nulový přírůstek při F neznamená úplnou přípravu celé trasy.

Poloha(-5.07952,2.62010,-76.88297) je19.89cm od původní inside kontroly; active geometry970vs977, cached grass16vs7, F nastalo357.54s po ready místo230.17s. Uvnitř cold-F okna se auta mění0→1. Stejné B6 counts nejsou důkazem stejných identit/selection historie. Jde o podporu coverage hypotézy, nikoli přesněmatched nebo statistické A/B FPS. OFF a ON jsou samostatné steady vzorky, cold-F je nelze nahrazovat. Detaily a omezení exportů zůstávají v raw/UI JSON.

## Důkazy a další rozhodnutí

[Raw](async-b6-coverage-v2-pilot1-session.jsonl.gz), [startup summary](async-b6-coverage-v2-pilot1-summary.json.gz), [OFF UI](b6-coverage-v2-pilot1-off-benchmark.json.gz), [cold-F UI](b6-coverage-v2-pilot1-first-f-benchmark.json.gz), [ON UI](b6-coverage-v2-pilot1-on-benchmark.json.gz). Session6ac8c0e9-eeff-4be3-a787-bb0e6e3a9c5a,17397souvislýchrecords0–17396, rawSHA75b0acd93458d1bcfba5672bcbf0c47430149dccd7a10212e24bec6a76c5d234. [Offline helper](summarize-b6-window.mjs) vybírá explicitní okna0/1/2 a kontroluje UI/raw počty snímků; nezávislý audit jejich přiřazení i percentile přepočítal.

[Archivní manifest](archive-manifest.json) ověřuje35převzatých souborů včetně gzip obsahu. Diffy, nové helper/test/fixture soubory a RED/GREEN logy jsou součástí evidence. Full derived privacy kombinace s explicit20 nebyla nově samostatně ověřená; dosavadní full-derived test používá default16 a explicit20 má vlastní privacy roundtrip. Není prokázaný únik ani konkrétní chyba, ale testy se nevydávají za širší matici.

Další vybraný QA krok je day0 OFF/ON přes existující spawn apply, aby pokryl doložený Day OFF a zdrojově odůvodněný ON venku/odchod z B6. ON mezera zatím nebyla v tomto scénáři změřená. Dvě další etapy musí projít původním30s limitem a započtením celého startupu.20pojmenovaných stage položek potřebuje navíc overflow slot; nastaví se výslovný bounded21 při default16, bez dalších hooks. Konečné opakované měření, native integrace, funkční přejímka a default WebGPU zůstávají otevřené.
