# R6 koruna a WebGPU NCM · 26. října 2026

Tento záznam navazuje na [v9](webgpu-v9.md). Není závěrečnou přejímkou stromů ani výkonu celého katalogu.

R6 B5 má nepravidelně seskupené sekundární větve, zachované hlavní osy, všech 82 100 blízkých a středních listů a původní kořen/kolizi. [Nativní export](../../agents/handoffs/trees-20261026-r6-export.md) ověřil bitovou shodu rohů všech šesti meshů s Blenderem. FAR stále obsahuje pouze 16 383 listů; úplné pokrytí je navazující rozpracovaná funkce. Jehličnan odkazuje na původní R5 data.

Candidate-v10 `317a53aa197cc59fb44918d0aba06f433b5d8da06d3b1f06c3c812f70333fc44`: 439 cílených testů, build a izolovaná integrace PASS. Skutečný Edge / NVIDIA Pascal / WebGPU CM zobrazil R6 v létě, na podzim i v zimě bez renderových chyb. Jediný předběžný medium interval, 1528 × 650: **24 FPS, p95 48,7 ms, p99 53,3 ms**. Dlouhé čekání před měřením posunulo stojící avatar; nejde o přesně srovnatelný backendový A/B. Systémový sampler pokryl jen část desetisekundového intervalu. Snímky a plný záznam jsou v `.cache/trees-gpu-20261025/v10-cm-own-b5-near-*`.

První v10 NCM start odmítl pojmenovaný prázdný záznam `undefined` v hlavní tabulce draw wrappers. Příčinou nebyl regulární výraz. Skutečný Babylon `ObjectRenderer` při vytvoření uvolňuje dosud neexistující render-pass ID a zanechává tento prázdný vlastní datový záznam. Úzká oprava akceptuje pouze přesný prázdný hlavní záznam; živé wrappery, gettery a stínové tabulky tím nejsou povolené. Nativní reprodukce a 19 cílených regresí prošly; [podrobnosti](../../trees/20261025/bundle-parity.md).

Candidate-v11 `879d5008c7483439a0eaa8997c3d548561afa64ccf643509a99c0eac9cf198e0`: **443 cílených testů, build a izolovaná integrace PASS**. Skutečný NCM start již předchozí guard překonal, ale skončil na low / `night-1-on` po 30 364 ms aktivní přípravy. Žádná pauza karty nebyla započtena. Poslední readiness kontrola byla true; adaptér asynchronní přípravy byl v tomto režimu záměrně neaktivní. Osm zaznamenaných etap obsahuje přibližně 19,36 s souhrnného času renderu. Samotná synchronní API volání pipeline vykázala pouze 9,7 ms: nejde o důkaz, že celý čas spotřebovala tato API funkce. Přesná evidence: `.cache/trees-gpu-20261025/v11-fast-startup-first.json`.

Výchozí režim zůstává WebGPU CM. NCM je experiment; skutečná sezónní obrazová parita a výkon nejsou přijaté. Pokračující úzká oprava zkoumá asynchronní přípravu NCM bez změny limitů a bez přepínání režimu během přípravy.

Původní úplná sada v9 zůstává **2 227 PASS / 16 FAIL / 3 SKIP**; pozdější cílené opravy z ní nedělají PASS. Velké regresní sady, build a integrace dále až nad dokončeným funkčním celkem před commitem. Katalog stále tvoří dva piloty a 108 původních stromů; žádný commit ani integrace této etapy do main dosud neproběhly.

## Dokončený FAR celek a navazující v12

R6 FAR authoring nyní zastupuje všech 82 100 částí / 16 019 ranků. Sdílená banka má 369 medoidů; 72 skupin zachovává přesné listy. Deset nativních obrazových porovnání prošlo s explicitním atlasovým cutoffem 0,20. [Předání](../../agents/handoffs/trees-20261026-r6-far.md) a [skutečné rozbalení](../../trees/20261025/cluster-runtime.md) oddělují source bytes, rozbalené buffery a neověřený GPU výkon. V4 streaming má 9 nových a 26 kompatibilních regresí PASS; NCM async oprava 49 PASS. Nezávislá čtecí review obou funkcí i atlasové materiálové cesty nenašla opravitelný nález.

Candidate-v12 `9fdf4385d8b056edba00664935523ca694ff8e2361ad28d5ece65ada444905b0` obsahuje 8 871 hashovaných souborů a má **produkční build včetně celého TypeScriptu PASS**. Jde o dokončený FAR/NCM celek pro skutečnou obrazovou přejímku; nedokončený katalogový exporter, jeho test a vlastní výstupní adresáře jsou výslovně vyloučené v manifestu. Žádné importované runtime soubory nebo testy hotové funkce se nevylučují. Celá regrese ani integrace se v tomto kroku znovu nepouštěly.

Pokus o předchozí v11 CM FAR referenci 26.10. v18:45 UTC skončil po 30,04 s aktivní přípravy na `vehicle-1`. Posledních 10 ticků trvalo 11,17 s; readiness nenahlásila čekání na meshe, efekty či zdraví. Canvas byl podle DOM viditelný/focused, ovšem přibližně 1Hz obnova znemožňuje platné srovnání výkonu. Tento důkaz neprokazuje přesný mechanismus omezení OS/prohlížeče. NVIDIA Pascal byla skutečně načtena; systémový inventář uvádí GeForce GTX 1060 / ovladač582.28. Záznam `v11-cm-far-startup.json`, snímek timeoutu a souběžné hodinové vzorky zůstávají v `.cache/trees-gpu-20261025/`. Žádné FPS tohoto pokusu se nevydává za přejímku.

V12 čeká na nové potvrzení viditelného Edge okna. Původní v11 server i sampler byly ukončeny až po kontrole vlastních PID/příkazů/časů vytvoření; nový v12 server používá stejný rezervovaný port4182 a neměnný snapshot. Hrané4179/2592 se nezměnily.

## V12 po potvrzení foreground

Výchozí WebGPU CM skutečně dokončilo všech 41 etap za 70,0525 s aktivní přípravy, bez pauzy. Renderer i assety byly zdravé. Jediný FAR letní interval, medium, CSS/interně 1528×647, jeden host, denní a jasný DEMO náhled: **19,5 FPS, p95 58 ms, p99 66,1 ms**, 10,05 s. [Sanitizovaný benchmark](v12/cm-far-benchmark.json), [souhrn startů](v12/startup-summary.json). Během intervalu nepřibyla kompilace, pipeline ani validační chyba; [delta čítačů](v12/compilation-delta.json).

[Současná systémová telemetrie](v12/cm-far-telemetry.json) pokrývá celý interval devíti vzorky: GeForce GTX1060 / 582.28, P5, graphics822MHz, memory810MHz, využití27–35 %, teplota77°C, paměť3867–3887MiB. Důvod těchto taktů není prokázaný. Není to 60FPS přejímka ani důkaz zrychlení proti předchozí verzi; předchozí FAR pokus nebyl platným A/B měřením.

[Léto](v12/cm-far-summer.png), [podzim](v12/cm-far-autumn.png) a [zima](v12/cm-far-winter.png) ukazují skutečné přepnutí olistění. B5 je malá koruna v kontextu celého světa; tyto snímky samy nedokládají všechny mipové úrovně a úhly. Tento checkpoint stále používá dva vlastní piloty a108legacy stromů. Dokončení pozdějšího offline katalogu není zpětně GPU přejímkou všech110modelů.

Experimentální NCM skončilo na low / `night-1-on` po 34,818 s; jeden render trval9,877s. Async adapter byl skutečně aktivní,257požadavků /210dokončených /47pending, jeho API CPU15,6ms. Zaznamenaná pomalá `createShaderModule` volání vysvětlují alespoň6,741s posledního renderu (68,3 %). Celkové module CPU NCM12,913s oproti262,2ms dokončeného CM běhu; příčina uvnitř browseru/ovladače není doložená. Vnořený shaderPreparation čas se k module CPU nepřičítá. `bundle.finish()` nebylo měřené a nelze mu připsat zbytek. CM zůstává výchozí, NCM není přijaté a nezastavuje výrobu katalogu.

Po kontrole byla karta uvolněna a sampler skončil; uživateli bylo řečeno, že Edge už nemusí držet v popředí. Pozdější oprava skutečné kamery před skrytými QA draw zatím nemá nový GPU záznam a není vydávána za opravu tohoto NCM záseku.
