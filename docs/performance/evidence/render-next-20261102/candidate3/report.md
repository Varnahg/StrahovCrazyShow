# Kontrola shaderové fronty ve stejném buildu

Série z 3. listopadu 2026 **nepřijímá plošnou shaderovou frontu jako optimalizaci**. Všechny čtyři starty skončily timeoutem Low. Fronta snížila maxima jednotlivých přípravných renderovacích volání v této sérii, ale přidala opakované kontroly a oddálila dokončení srovnatelných variant.

Použitý build/source/test SHA je `a55cd239d0884f86ccdeff4a1e997b6443d11fa75f0508a968a3f4adaf0aaaac`, main`df62bd4d` s vymezeným render WIP. Manifest obsahuje967 source/test vstupů,8 064 veřejných assetů a hashe závislostí. Předchozí archivní baseline se po přijatých RAG změnách nepoužila. Úplné raw logy, systémová telemetrie, build identity i cleanup jsou gzip archivy s původními a komprimovanými SHA v [souhrnu](summary.json).

Edge156, WebGPU, GTX1060/6GiB, ovladač582.28, CSS1280×720; před každým startem spolehlivá předherní cadence59,9Hz. Stejný profil Alex a přezdívka Profil GPU, běžný multiplayerový spawn, celý klient a HUD. Bez dalších3D scén, buildů či testů během měření. QA počasí pochází ze stejné uložené fixture a je označené jako model/starší data. Vlastní karta byla aktivovaná v samostatném okně pomocí browser management.

Pořadí bylo předem uložené jako native → queued → queued → native. Vypnutí fronty zachovalo materiálovou ochranu, pipeline/health/submission gates, původní timeouty i společný signál pro opakování pomocných targetů. Query měnil jediný klientský build. Studené browser/driver cache nebyly vynucené; první pokus se neprohlašuje za certifikovaný cold start.

## Shodných prvních sedm dokončených variant Low

| Pokus | Čas variant | Kontroly objektů | Rendery | CPU kontrol | CPU renderů | Max render |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| native1 | 20,922s | 5 996 | 45 | 2,295s | 11,106s | 2,218s |
| queued1 | 26,246s | 9 097 | 80 | 4,389s | 10,799s | 0,952s |
| queued2 | 25,303s | 9 025 | 87 | 6,428s | 11,194s | 1,038s |
| native2 | 20,086s | 5 990 | 43 | 3,664s | 10,136s | 2,441s |

V této malé sérii jsou průměry s frontou: čas variant+25,7%, počet renderů+89,8%, počet kontrol+51,2%, CPU kontrol+81,5%. CPU součet renderů vzrostl jen o3,5%. Zbytek času není automaticky GPU čekání. Jde o popis této série, nikoli obecný statistický odhad výkonu.

V odpovídajících dokončených fázích mají oba režimy stejné konečné délky front:343 v`vehicle-1`,441/443 v`current-off/on`,439/441 vnočních variantách. Hodnoty924–928 patří staršímu candidate2 a nejsou rozdílem tohoto A/B. Shodné počty bez ID ještě neprokazují totožné množiny objektů.

Babylon zařazuje běžné Mesh/InstancedMesh do aktivního seznamu po`isReady(false)`, před úplnou kontrolou materiálů. Herní příprava naproti tomu volá`isReady(true)`; nehotové objekty přecházejí do retry podmnožiny a vyvolají další render. Před potvrzením se znovu projde aktivní seznam. Vyšší počet kontrol tedy není důkazem dalších viditelných objektů nebo nových unikátních shaderů. Poslední délka fronty1 může znamenat jediný retry objekt.

## Výsledek celých startů a systémové meze

Native pokusy dokončily13 a11 Low variant, queued7 a10. Každý skončil ve variantě následující; High/Medium ani Game.ready se nedosáhlo. Žádná GPU validační chyba80/96 se v této sérii neopakovala. Neexistuje platný herní FPS interval ani následná scéna se dvěma SDK spoluhráči.

Pro konzervativně odvozená vnitřní okna prvních sedmi variant bylo19/25/24/19 systémových vzorků. Průměr celkového CPU76,8/73,7/71,5/72,6%; GPU7,1/6,6/5,8/9,6%. Přesné UTC hranice, zbytkový čas, provider timestampy a pravidla výběru jsou u každého pokusu v`systemWindow` v[souhrnu](summary.json); reprodukuje je[skript](analyze-system.mjs). CPU používá vlastní interval PDH, GPU vlastní driver timestamp s odstraněním duplicit, nikoli čas celé kolekce. Takty GPU nebyly zamčené: native1 kolísal923–1404MHz, queued pokusy1404MHz, native2 měl810MHz. Teploty69–76°C, VRAM přibližně2 961–3 422MiB z6 144MiB. V těchto vzorcích nebyl aktivní thermal/power-cap/brake flag. Řidší driver vzorky a celokaretní hodnoty nevylučují krátké špičky.

CPU aktivita GPU procesu Edge patří sdílenému browserovému procesu; není GPU časem ani výhradní prací této hry. Běžely také systémové a uživatelské procesy včetně Task Manageru, CUA a ChatGPT. Collector spotřebovával přibližně6–10% jednoho jádra. Rozdílné takty, cache historie, počasí restart vprvním páru a pouze2+2 pokusy omezují příčinné závěry; FPS nebo hardwarový upgrade se z nich nedoporučuje.

## Oddělený instrumentovaný pokus

Pátý pokus`native-profile` se do tabulky ani průměrů nezapočítává. Zapnul původní`profileEnvironment=1` včetně inventáře shaderů. Rozdíl před/po přípravě ve stejné generaci: render callbacky20,1225s, endFrame44,8ms, flush38,3ms, writeBuffer52,7ms. Tyto intervaly jsou částečně vnořené a nesčítají se. Background=false, bez maxFPS capu a bez přeskočení kvůli capu; observerErrors ainvalidClocks byly0.

Inventář textů sám zabral3,5765s a je zahrnutý vshaderPreparation3,9788s. CreateShaderModule napříč pokusem trvalo175,4ms/742 volání, max9,1ms. Zbývá práce uvnitř callbacků mimo dosud měřené úseky. Profiler nepokrývá všechna nativní API, například`createBindGroup`; shader preprocessing před tvorbou modulů je stále hypotéza, nikoli prokázaná příčina.

Další měření proto oddělí synchronní`createEffect` caller interval a dvojici WGSL`initializeShaders`→`finalizeShaders`, bez inventáře textů. První zahrnuje i cache/konstrukci/callbacky; druhý zachytí zpracování před moduly. Přechody přes asynchronní hranici musí být oddělené od CPU práce. Nové ladění fronty před touto atribucí nebylo vybrané.

## Ověření nástrojů a úklid

172 cílených testů PASS; nový once-only RTT/postprocess případ s původní logikou prokazatelně selhal vnative režimu a s opravou prošel. TypeScript následně zachytil chybějící typ pole vjedné fixture; po opravě prošel`pnpm build` i nový neměnný build. Nezávislé review bez zbývajícího blockeru. Dřívější plné testy se tím nepřeznačují na PASS.

API/preview i sampler skončily přes vlastní STOP. Cleanup13:11:56.412UTC: failure=null, apiExited=true, inputsRevalidated=true, cleanupErrors=[]. Sampler skončil13:11:24.913UTC,1 032 vzorků, bez cleanup chyb. Vlastní karta zavřená, viewport override resetovaný,2568/4179 volné. Produkční8080 nebyl upravovaný.

DOM odečtený až po posledním timeoutu a obnově nastavení měl CSS i canvas1280×720. **Není to důkaz interního rozlišení předchozích časovaných Low snímků**, které tento startup záznam samostatně neobsahuje. Zdroj a hlavní výsledky jsou archivované; výkonová optimalizace ani druhý zásah proti herním zásekům nejsou dokončené.
