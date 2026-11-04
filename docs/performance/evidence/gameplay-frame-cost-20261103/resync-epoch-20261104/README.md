# Oprava opakovaných obnov epoch · 4. 11. 2026

**Přijatý úzký výsledek:** opožděný `resync`/`doorResync` staré epochy už nevymaže novější frontu ani nevyvolá druhé vynucené přebázování klienta. ProtokolV15 vyžaduje token u obou kanálů. Zachovává se1s retry, rate limity, fyzika i původní stale/prediction limity. Dveřní bootstrap používá poslední validně přijatou autoritu, i když ji Game ještě nedokázal aplikovat.

## Příčina a ověření opravy

[Hráčský důkaz](../resync-observed-pairs.json) zachovává20blízkých dvojic odpovědí. U konkrétní dvojice měly oba zaznamenané recovery momenty poslední známou epochu44; odpovědi pak během7,5ms zvýšily epochu45→46. Značka client-request sdružuje oba recovery kanály, proto nelze všechny případy připsat jednomu producentovi.

Skutečné produkční serverové registrace a metody byly spuštěny se stejným reprodukčním scénářem: dva požadavkyE a mezi nimi nový platný vstup. [Původní handler](server-red.log) vytvořil2forced authorities, epochu7→9 a zahodil vstup (queue0). [Opravený handler](server-green.log) vytvořil1forced authority, epochu7→8 a vstup zachoval (queue1). Totéž platí pro obě stejná i smíšená pořadí zpráv. Nejde o FPS benchmark.

| Kontrola | Skutečný výsledek |
| --- | --- |
| Server actual-handler regrese | 11/11 PASS |
| UI/authority buffer/door connection/network diagnostics | 70/70 PASS |
| Game recovery a CAD | 26/26 PASS |
| Plná sada, souběžnost4 | 3082 celkem:3074 PASS,3 FAIL,5 SKIP;27m11s |
| Dvě opomenuté30s aserce z dřívějšího WebGPU budget updatu | Opraveny na již schválené60/180s;35/35 cílených přípravných testů PASS, runtime nezměněn |
| Nezměněný test živého review řadiče | Ve full suite timeout; jediný izolovaný běh následně1/1 PASS |
| Sjednocení percentilové hranice HUD a evaluatoru | 47/47 navazujících testů PASS, review[] |
| `pnpm --config.verifyDepsBeforeRun=error build` | PASS včetně celého TypeScriptu |
| `pnpm --config.verifyDepsBeforeRun=error test:integration` | PASS, skutečné SDK/HTTP scénáře a vlastní server |
| Nezávislé review runtime patche | Bez nálezů;16 souborů shodných s manifestem |

Celá sada po cílených opravách znovu neběžela, takže se nepřepisuje na globální PASS. Původní logy jsou v `.cache/gameplay-frame-cost-20261103/resync-full-tests.log`, `controller-isolated-20261104.log`, `resync-build.log`, `resync-sdk-integration.log` a `.cache/resync-epoch-20261104/`. [Manifest samotného runtime checkpointu](source-manifest.json).

## Jediný pohybový průchod v Edge

Neměnný C14 source/test hash **31a14cdda855eef4486ac82c63778db13d2f614676c88bb22dbd104d6da99827**; [úplná build identity](build-identity.json). WebGPU CM, Edge156, NVIDIA/pascal, zaznamenané CSS2040×986 podle hráčského testu. [Dodatečně odečtená identita GPU/ovladače](gpu-identity.txt). Žádné souběžné vlastní buildy/testy/3D scény.

První startup vypršel na Medium po60 058,3ms. Popředí nebylo předem spolehlivě ověřené; jeho pozdější neaktivní stav není důkazem příčiny timeoutu. [Původní log](startup-timeout.jsonl.gz) zůstává. Jediný opravný start ve vlastním aktivním/fokusovaném okně skončil ready: Medium46 727,5ms,High13 882,6ms,Low34 499,7ms, celkem95 110ms aktivní přípravy. Timeouty ani kód se mezi pokusy neměnily. Není to přijetí spolehlivosti všech startupů.

V úspěšné relaci byli dva skuteční SDK spoluhráči s různými avatary. Po přepnutí uloženého Low na plánovaný Medium proběhla chůze klávesamiD/W/A/S bez teleportace a krátký benchmark běhemW/S. Celý [záznam relace](foreground-walk.jsonl.gz) obsahuje536,7s viditelného provozu, ale jen konzervativně odhadnutých26,9s/127,6m pohybu; zbytek se nesmí vydávat za aktivní trasu. Záznam nemá render/asset fault a zdroje byly po úklidu znovu ověřené.

Krátký HUD vzorek ukázal31,9FPS,p9546,2ms,p9968,4ms,max79,2ms a14intervalů od50ms; nový panel správně zobrazil **„Plynulost vzorku nevyhovuje.“** [Screenshot](benchmark.png). Nejde o párové srovnání s původním uživatelským hraním: liší se trasa, den/čas a průběh scény, a startup měl opravný pokus.

Celková [gameplay přejímka](gameplay-assessment.json) je **failed**, mimo jiné pro nízké FPS, max1 518,2ms a stáří autority1 491ms. Za tuto relaci jsou zaznamenané4resyncy a maximální detailní korekce0,18m; tyto hodnoty nejsou důkazem obecného procentního zlepšení. Časové pokrytí má přiznaná omezení. Bez samostatného GPU timing/system trace nelze objasnit všechny dlouhé mezery mimo callback.

Peers byli ukončeni před odchodem hráče, následně Game přes skutečné UI, viewport override resetován a vlastní testovací karta/okno zavřeny. [Peers cleanup](peers-cleanup.json) a [API/input cleanup](cleanup.json) PASS, porty2568/4179 uvolněné. [Receipty a SHA raw dat](receipt.json). Celkový60FPS cíl a příčiny zbývajících renderových prodlev zůstávají otevřené.
