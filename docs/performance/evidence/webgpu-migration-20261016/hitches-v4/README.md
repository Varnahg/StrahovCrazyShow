# KEY-31: skutečný inventář před prvním F a po něm

**80 nových WGSL modulů; žádná nová identická raw/body ani odvozená shoda.** Cache identického WGSL nemá pro tento burst doložený přínos. Samotné odstranění nepoužitých konstant nezměnilo tento závěr; případný vliv menšího textu na compiler nebyl měřen. Nejde o přijatou runtime opravu.

Použit byl existující desetisekundový benchmark v UI, bez další diagnostické vrstvy. Uložený JSON pochází z viditelného `#benchmark-result`; stávající UI vynechává pouze `modelReview`. [Summary](summary.json) zachovává celý compilation.start/end a frame intervals, [manifest](manifest.json) SHA256 originálů i bezeztrátových gzip kopií. Raw log má5710 souvislých záznamů seq0–5709. Benchmark i raw konec mají shodné UTC2026-10-17T21:10:24.990Z.

QA4194/API2589, session `42cec056-b4b5-475a-8cb4-e5b4533b73ce`, původní snapshot `3cf48f74ff65aac859d5fa8869abd8da775cee66f85d2df5ff5ac4428d54507b`; WebGPU compatibility, timestamp OFF a opt-in inventář jako v předchozí kontrole. Edge, nvidia/pascal (host GTX1060 viz hitches-v3),1512×642 CSS i interní rozlišení, medium, denní náhled, jedna skutečná multiplayer relace,0busů/0cestujících/1auto. Před benchmarkem B6:0, x−4,757706/y2,62010/z−77,065445. Hraná4193/C5 zůstala na menu se stejným snapshotem a nebyla přepsána.

Benchmark seq1644→1784 pokrývá279127,8→289145,7ms. První F seq1677@280577,6ms je uvnitř, stejně jako1062,2ms burst a6179,1ms mezera (frameIntervalsMs index57/58). Post-submit fence6265,1ms zahrnuje dokončení fronty i doručení callbacku, není čistý GPU čas. RawRAF/processFrame přibyly po jednom, queue wait6132,7ms a completedCPU46,4ms; síťové callbacky během mezery pokračovaly. UI10,3FPS přes103snímků/10,02s zahrnuje cold hitch, **není ustálený výkon**.

| Inventář | Před → po | Rozdíl |
|---|---:|---:|
| Module calls / rawKnown / bodyKnown |728→808|80|
| Raw/body repeated / duplicate groups |0→0|0|
| Ready stage calls |188→268|80|
| Retained UTF-16 units |22 290 147→25 054 703|2 764 556|
| Derived analyzed |728→808|80|
| Derived repeated / duplicate groups |38→38 /38→38|0 /0|

Unknown, limited, hash collisions, ambiguity a stage overflow zůstaly0. Limity1024entries,33 554 432UTF-16units a16stages nebyly dosaženy (14stages). Derived export je omezen na16 z38 starších skupin, ale aggregate repeated delta je0 a export před/po je identický. Jde o diagnosticky upravenou reprezentaci, nikoli nasazený shader.

Za okno vzniklo40 shader preparations (232,7ms CPU),80 shader modules (12,5ms),80 validations (0,7ms),59 sync pipelines (2,6ms),0async pipelines a102submits (2,7ms). Textový inventář sám přidal209,8ms CPU, už zahrnutých v nadřazených časech. Součty completion latencí se překrývají a nejsou elapsed/GPU čas. Snapshot výsledku vzniká před posledním endFrame submit:102submits versus103snímků není rozpor.

**Limity:**59pipeline calls nedokazuje59duplicit — descriptor identity se nesbírala. Inventář nerozděluje main/depth původ. CPU shadow-token reprodukce z hitches-v3 se nesmí vydávat za atribuci tohoto F. Jeden diagnostický běh není statistické A/B ani finální přejímka.

Renderer2/generation1 byl na obou hranicích valid/ready, pending/errors0, bez změny hooků. Entry→ready44 102,9ms, příprava19 995,1ms. Dispose seq5705 bez render/asset chyb, seq5706 inactive/raw stopped/epoch2/tracked0/observerErrors0. Po sběru byla vlastní hra ukončena a měřicí karta přešla na about:blank.

Další návrh má řešit skutečně odlišné světelné varianty nebo přesnou asynchronní přípravu. Stabilní nulová světla musejí zachovat fyzický výběr i fixed caps, stíny a souběh místní svítilny se vzdáleným řidičem. [WebGPU specifikace](https://www.w3.org/TR/2026/CRD-webgpu-20260915/#dom-gpudevice-createrenderpipelineasync) vysvětluje, proč asynchronní vytvoření může předejít blokování queue timeline; to samo ještě nedokazuje přínos konkrétní integrace do Babylon9.30.
