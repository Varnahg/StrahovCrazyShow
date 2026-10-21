---
title: 'Textem řízená tvorba hezkých 3D modelů a animací'
type: technical
topic: Text to 3D animation workflows
decision: Vybrat editovatelná workflow pro původní modely, postavy a textem řízené animace
source: native research
status: complete
preset: standard
validation: normal
created: '2026-10-21'
updated: '2026-10-21'
verified_claims: 4
unverified_claims: 26
disputed_claims: 0
---

# Textem řízená tvorba hezkých 3D modelů a animací

## Doporučení

Jako společné autorovací prostředí doporučuji **Blender řízený textovými požadavky přes uložený Python skript; živé MCP přidat, když bude potřeba pohodlná opakovaná práce se scénou**. Pro vlastní animované předměty je to přímější kandidát než humanoidní generátor pohybu: části, pivoty, materiály a klíče lze vytvářet a dál upravovat. Dostupné API a přenositelné animační kanály jsou doložené; krásný výsledek ani spolehlivost libovolného promptu z existence API neplynou. [15] [16] [17] [18]

Pro detailnější organické modely navrhuji **text → schválený výtvarný koncept → Meshy nebo Tripo → Blender dopracování → rig a animace**. Rodin je třetí kandidát pro stejné kvalitativní srovnání. Jde o doporučený pilot, nikoli změřené pořadí krásy: dosud neproběhla shodná placená generace, otáčení exportovaných modelů a deformační přejímka všech tří služeb. [1] [2] [3]

Pro dvounohou postavu je navíc doložený cloudový kandidát **Meshy model → rig → Text to Motion → přenos klipu → Blender**. Finální audit dohledal konkrétní API, které původní webový manuál nepokrýval; nejde jen o marketingový příslib. Výsledek na konkrétním účtu jsme negenerovali. [27] [28] SayMotion zůstává alternativa pro nový humanoidní pohyb; vlastní upload vyžaduje připravený rig, dostupné jsou i výchozí postavy. Přesnost kontaktů v animaci a podmínky zveřejnění herního GLB je nutné ověřit samostatně. [8] [9] [10]

Nejdůležitější mez: **textově vytvořený model, textově vytvořený pohyb a výběr hotového klipu jsou tři různé funkce**. „Umí animovat postavy“ neznamená, že služba na povel rozhýbe šestinohého tvora nebo rozloží vymyšlený stroj.

## Které workflow pro který výsledek

| Potřeba | První volba k ověření | Co je skutečně doložené | Hlavní mez |
| --- | --- | --- | --- |
| Stylizovaný předmět, létající schránka, rozkládací mechanismus | Text → LLM/Python → Blender → `.blend` a GLB | Vytvoření objektů, transformací a upravitelných klíčů; standardní TRS exportní kontrakt. [15] [16] [17] | Výtvarné vedení, správné díly a pivoty musí zajistit návrh a kontrola výsledku. |
| Detailní vymyšlená postava nebo organická rekvizita | Text → koncept → Meshy/Tripo, případně Rodin → Blender | Text/image modelování, materiály a běžné výměnné formáty. [1] [2] [3] | Geometrie není automaticky dobrý deformační rig. Nutné kontrolovat topologii, UV, zadní stranu a oddělené končetiny. |
| Dvounohá postava má předvést nový popsaný pohyb | Meshy Text to Motion → biped retarget; alternativně SayMotion → Blender | Meshy má generování klipu a samostatné aplikování; SayMotion dokumentuje celé tělo bez prstů/obličeje. [27] [28] [8] [9] | Skutečná kvalita, kontakty a účet nebyly testované; SayMotion má nevyjasněnou publikační podmínku. [10] |
| Neobvyklý tvor, více končetin, křídla nebo vlastní mechanická choreografie | Blender vlastní rig/pojmenované klíče řízené textem | Obecné klíče a skin/morph/TRS reprezentace. [15] [16] [17] | Žádný zde ověřený univerzální automatický humanoidní retarget pro tuto anatomii. |
| Experimentální pohyb obecné sítě z textu | AnimateAnyMesh v odděleném výzkumu | Vydaný textově podmíněný výpočet drah vrcholů a exportní kód. [14] [29] [30] | Není to doložená editovatelná kostra ani přijatý herní export; konkrétní roundtrip/licence vah vyžadují další ověření. |

Pracovní váhy v [zadání](brief.md) jsou vzhled a umělecká kontrola 35 %, animace 25 %, editovatelnost 20 %, práce 10 %, cena/soukromí 10 %. **Vážené skóre kandidátů nepočítám**, protože nejsilněji vážená kvalita a počet použitelných pokusů nejsou měřené. Podrobné srovnání kontrolovatelných bran je v [CSV](candidate-matrix.csv); neobsahuje vymyšlené estetické skóre.

## Prakticky ověřená větev: text → Blender → animovaný GLB

Po výzkumu a [porovnání variant](root/pilot-decision.md) vznikla skutečná původní kinetická lucerna z [textového zadání](pilot/prompt.md) a uloženého Python skriptu. **Pilot prošel** v Blenderu 5.2.2 LTS/d13f752e3b9c: opětovné otevření nativního souboru `.blend`, animovaný GLB a nový import, 63 porovnání póz sedmi uzlů, maximum chyby matice 4,17×10⁻⁷ a shodné konce smyčky. Revize otevření prvního pantu o 12 % přidala novou Action a zachovala všech 59 mesh streamů, sedm původních Actions i zdrojový soubor. [Výsledek a důkazy ověření](pilot/README.md), [nezávislá kontrola dat v GLB](root/pilot-integration-check.json).

Ke stažení: [editovatelný master](pilot/star-lantern-source.blend), [textová revize](pilot/star-lantern-revised.blend), [animovaný GLB](pilot/star-lantern.glb). [Zavřený](pilot/closed.png) a [otevřený náhled](pilot/open.png) byly vizuálně zkontrolované. První pokus selhal na chybějícím World ve factory scéně; příčina, oprava i původní log zůstávají zachované. Úspěšný běh trval 69,17 s včetně dvou CPU renderů; to není naměřená doba celé lidské tvorby ani FPS.

GLB má 1 097 032 B, jeden čtyřsekundový klip, 59 mesh definic, 65 primitives, 47 472 trojúhelníků a 3 materiály. Jde o detailní autorskou rekvizitu, **nikoli přijatý herní budget nebo runtime výkon**. Nebyl proveden cílový engine vizuální test ani cloudové srovnání organických modelů. Vlastní Blender procesy skončily a heavy/GPU byly uvolněny pro KEY-53.

## Jak dostat hezký a konzistentní vlastní model

Nejdříve vytvořit stručný výtvarný list: silueta, proporce, paleta, materiály, počet a funkce částí, měřítko a zakázané změny. Původní objekt nepotřebuje fotografii existující věci; může mít textem vytvořený koncept. Obrázkový mezikrok dovoluje schválit zamýšlený vzhled před dalšími 3D pokusy. Meshy tyto vstupní cesty dokumentuje, jejich vlastní hvězdičky přesnosti ale nejsou nezávislým srovnáním. [1]

Meshy, Tripo a Rodin porovnávat na **stejném schváleném zadání**. Nestačí krásná textura z jediného úhlu. Každý kandidát potřebuje otočení, šedý materiál, kontrolu otvorů, zadních detailů, připojení částí a první deformaci. Tato kritéria jsou navržená metodika; v rešerši nejsou nalezenými vadami konkrétního vygenerovaného souboru. Tripo dokumentuje seed, PBR a další ovládání výstupu; Rodin má více vstupních obrázků a výstupní řízení. Dostupnost parametru není důkaz splněného art direction. [2] [3]

Uchovat detailní master. Runtime odvozeninu řešit odděleně: topologie/UV, textury, materiálové části, rig a omezené klíče. Samotné „quad“ či „game-ready“ nezaručuje hezký loket ani levné vykreslení. Měnící se topologie a obecná simulace nemají automaticky stejný přenos jako pevné díly nebo kostra. [15] [17]

## Co dnes znamená animování textem

Meshy webový manuál popisuje presety, marketingová knihovna nový klip z textu. Finální audit následoval odkaz z API ceníku a doplnil skutečné **Text to Motion API**: samostatný promptovaný klip, následně `motion_task_id` pro přenos na biped rig. Starší závěr „pouze marketing bez doloženého API“ je tím opravený; původní digests zůstávají jako historie. Čtyřnožce tato retarget cesta odmítá. Klip je nutné stáhnout/aplikovat během třídenní retence; výsledný retarget může být pouze GLB bez FBX. [11] [12] [27] [28]

Anything World v přečteném postupu používá textové **model type** k zařazení modelu, potom nabízí dostupné animace. To není doložené volné textové zadání nového pohybu. [13]

AnimateAnyMesh je skutečně jiná výzkumná větev: inference vytváří textově řízené dráhy vrcholů, exportní kód z nich per-frame shape keys. Přítomnost FBX/ABC exportního volání není důkaz použitelného rigu nebo zachovaných klipů. Neplatí ani opačné paušální tvrzení, že Blender FBX neumí animované shape keys: oficiální exporter 5.2 implementuje relativní tvary i jejich vzorkované váhy. Konkrétní AnimateAnyMesh import a interpolace zůstávají netestované. [14] [24] [29] [30]

V Blender větvi text popisuje výsledek a jazykový model vytvoří nebo upraví skutečný kód/klíče. Například: „Zachovej model a klip `idle`. Přidej `open_v2`: šest panelů se za 0,8 s otevře o 60°, jádro vystoupá o 12 cm a po 4 s se vše vrátí do počáteční pózy.“ Měřítko, počet dílů, časy a zachování starého klipu jsou kontrolovatelné požadavky. Skript a parametry se ukládají; samotný chat nebo opakovaný prompt není deterministická reprodukce. [16]

MCP může doplnit informace o scéně a náhledy pro opakované textové úpravy. Není vlastním naučeným generátorem modelů či pohybu a pro první uložený skript není nezbytné. Rozsah oprávnění konkrétního addonu a jeho telemetrie jsou popsány v [Blender digestu](digests/blender/r2.md); plugin v tomto výzkumu neinstalujeme. [18]

## Cena, práva a odchod z nástroje

| Varianta | Co lze nyní doložit | Co nepočítat jako cenu použitelného výsledku |
| --- | --- | --- |
| Meshy API | Vybraná současná tabulka uvádí mesh 20, texturovaný 30 a 8K 35 kreditů, zvláštní Smart Topology ceny; web/Agent/API mají odlišné rozpisy. [6] | Kredity webového předplatného a API neslučovat. Vybraný model, operace a cost preview zaznamenat. |
| Meshy Text to Motion | Generace `prime` 10 kreditů/FBX nebo `swift` 3/BVH; retarget je další operace. [27] [28] | Cena klipu není celková cena modelu, rigu, opakování a dokončené animace. |
| Tripo API | $1 odpovídá 100 kreditům; cena se mění podle modelové větve, textur a postprocessingu. [7] | Studio tarif není API rozpočet. Konverze, neúspěšné varianty a ruční cleanup jsou další náklady. |
| Blender/Python | Nyní již dostupná autorovací větev; placené modelové API není pro procedurální pilot potřeba. [16] [25] | LLM, vlastní čas a CPU nejsou automaticky nulový náklad; žádnou fiktivní tokenovou cenu zde nedopočítávám. |

Srovnávat `(celá útrata + koncepty + konverze + cleanup práce) / počet přijatých assetů`, včetně minimálního tarifu a nevyužitých kreditů. Bez skutečných pokusů je míra úspěšnosti neznámá. Ceníky jsou aktuálně přečtené nabídky poskytovatelů, nikoli nezávisle ověřené faktury nebo záruka příští ceny.

**Soukromí obsahu, práva k němu a jeho použití k trénování modelů jsou odlišné otázky.** Meshy terms umožňují training ne-Enterprise obsahu a placenou privátnost řeší zvlášť. Tripo má v přečtených terms u placené větve výslovnou no-training větu, ale negarantuje jedinečnost výstupu. Před účtem/pilotem potvrdit konkrétní produktový tarif a smlouvu; nejde o právní garanci exkluzivního vlastnictví originální postavy. [4] [5]

DeepMotion paid licence dovoluje začlenění do tvůrčích děl a současně omezuje standalone redistribuci a snadnou extrakci assetů. Veřejně stahovatelný herní GLB je proto **nevyjasněná publikační podmínka**, nikoli zde potvrzeně povolené nebo zakázané použití. [10]

Lokální TRELLIS.2 není první volba bez hardwarového a dependency auditu: README uvádí NVIDIA nejméně 24 GB a časy na H100. MIT hlavního modelu/kódu není souhrnná licence všech závislostí; nvdiffrast/nvdiffrec mají vlastní omezení. To automaticky neurčuje licenci vytvořeného GLB. Konkrétní Hunyuan3D-2.1 community licence se výslovně nevztahuje na EU; z toho nelze zobecnit zákaz všech jiných Hunyuan verzí nebo zvláštních smluv. [19] [20] [21] [22]

## Začlenění do hry a další měření

Pro samostatnou tvorbu zachovat `.blend` před bake a exportem. Pro tuto hru je navíc důležitý [integrační audit](application-audit.md): současné postavy mají vlastní rig se 13 kostmi, JSON geometrie a procedurální pohyb. Generovaný soubor není automatická výměna stávající postavy. Nový adapter/retarget, LOD, kolize, animace a lifecycle vyžadují vlastní přijatou změnu. Teď se žádný produkční model ani fyzika nemění.

Výkonovou analýzu vedeme [samostatně](../../../../docs/performance/evidence/continuation-20261021/README.md). Nové modely se přijímají nejen podle polygonů: patří sem materiály/draw calls, textury, kosti a váhy, morph paměť, velikost klipů, souběžné počty, první načtení a skutečná plná hra s HUD. Žádný univerzální nový asset budget ani FPS úspora není z této rešerše naměřená.

## Co může doporučení změnit

- Srovnatelný cloudový pilot může ukázat jiného výtvarného vítěze než kandidáty vybrané dokumentací. Dosud chybí přijatá míra úspěšnosti, počet oprav a cena jednoho použitelného modelu.
- Skutečný Meshy účetní/API pilot může potvrdit nebo vyvrátit praktickou kvalitu jeho již dokumentované textové animace; dostupnost ve webovém rozhraní není odvozena z API úlohy.
- Pro organickou mimiku, prsty, kontakt s předmětem a složité nehumanoidy mohou být nutné další ruční fáze. Ani jeden zde ověřený zdroj nedokládá univerzální textový postup bez oprav.
- Cloudové podmínky a tarifní UI se musí znovu zkontrolovat před nákupem či veřejným exportem. Bez paid/cost preview zde nebyla přijata žádná obchodní objednávka.

## Prameny

Všechny přístupy 21. 10. 2026, místní datum Europe/Prague. „Nedatováno“ znamená živou stránku čtenou nyní; datum přístupu není datum vydání. Medium/unverified označuje funkci nebo cenu doloženou poskytovatelem, bez nezávislého praktického potvrzení. Normativní formát a API se rovněž neztotožňují s estetickou kvalitou.

| Ref | Co podporuje | Vydavatel / primární odkaz | Publikace | Přístup | Confidence |
| --- | --- | --- | --- | --- | --- |
| [1] | Text, image a multiview cesty | [Meshy generation methods](https://docs.meshy.ai/en/webapp/guides/choosing/generation-method) | nedatováno | 2026-10-21 | medium/unverified |
| [2] | Tripo H3 ovládání a meze | [Tripo API](https://docs.tripo3d.ai/model-generation/text-to-model-v3-0-v3-1.html) | živé docs, model2026-02-11 | 2026-10-21 | medium/unverified |
| [3] | Rodin Gen-2.5 vstupy/export | [Hyper3D](https://docs.hyper3d.ai/en/api-specification/rodin-gen2-5) | nedatováno | 2026-10-21 | medium/unverified |
| [4] | Private, training, paid/free práva | [Meshy Terms](https://www.meshy.ai/terms-of-use) | 2026-09-19 | 2026-10-21 | text spot-check; aplikace smlouvy neověřena |
| [5] | Tripo paid/no-training/neexkluzivita | [Tripo Terms](https://www.tripo3d.ai/terms) | 2025-07-11 | 2026-10-21 | medium/unverified |
| [6] | API kreditové operace | [Meshy API pricing](https://docs.meshy.ai/en/api/pricing) | nedatováno | 2026-10-21 | medium/unverified |
| [7] | Oddělená Tripo API cena | [Tripo API pricing](https://docs.tripo3d.ai/get-started/pricing.html) | nedatováno | 2026-10-21 | medium/unverified |
| [8] | Nový textový pohyb a omezení těla | [DeepMotion SayMotion](https://www.deepmotion.com/doc/saymotion) | nedatováno | 2026-10-21 | medium/unverified |
| [9] | Požadavky na vlastní humanoid a export | [DeepMotion Custom Characters](https://www.deepmotion.com/article/custom-characters-saymotion) | nedatováno | 2026-10-21 | text spot-check; výsledek neověřen |
| [10] | Upload versus output a distribuce | [DeepMotion Terms](https://www.deepmotion.com/terms-of-use) | 2025-03-30 | 2026-10-21 | text spot-check; aplikace nevyjasněna |
| [11] | Užší webový preset manuál | [Meshy Animate manual](https://docs.meshy.ai/en/webapp/guides/animate) | nedatováno | 2026-10-21 | odlišný/neúplný rozsah vůči API popsanému ve zdrojích [27] a [28] |
| [12] | Marketingové tvrzení Text to Animation | [Meshy animation library](https://www.meshy.ai/animation-library) | nedatováno | 2026-10-21 | API cesta doplněna zdroji [27] a [28], výsledek unverified |
| [13] | Klasifikace model type a výběr klipů | [Anything World Quickstart](https://anything-world.gitbook.io/anything-world/quickstart/animate-anything-quickstart) | nedatováno | 2026-10-21 | medium/unverified |
| [14] | Vertex motion a exportní řetězec | [AnimateAnyMesh original code](https://github.com/JarrentWu1031/AnimateAnyMesh/blob/main/utils/render.py) | živý main; release2025–26 v repo | 2026-10-21 | code-read; roundtrip unverified |
| [15] | Blender exportní a animační kontrakt | [Blender glTF manual5.2](https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html) | footer2026-10-20 | 2026-10-21 | dokumentace + omezený skutečný pilot |
| [16] | Vložení upravitelných klíčů | [Blender API 5.2](https://docs.blender.org/api/5.2/bpy.types.bpy_struct.html) | verze 5.2, nedatováno | 2026-10-21 | API + vlastní runtime pilot |
| [17] | Nezávislý TRS/morph/skin formát | [Khronos glTF 2.0.1](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) | 2021-10-11 | 2026-10-21 | normativní/verified |
| [18] | LLM/Python bridge a scene feedback | [MCP for Blender original repo](https://github.com/ahujasid/mcp-for-blender) | nedatovaný main | 2026-10-21 | medium/unverified |
| [19] | TRELLIS model a hardware/dependency notice | [Microsoft TRELLIS.2](https://raw.githubusercontent.com/microsoft/TRELLIS.2/main/README.md) | nedatováno | 2026-10-21 | medium/unverified |
| [20] | Oddělená licence raster dependency | [NVIDIA nvdiffrast](https://raw.githubusercontent.com/NVlabs/nvdiffrast/main/LICENSE.txt) | nedatováno | 2026-10-21 | text přečten; use-path neověřen |
| [21] | Oddělená licence render dependency | [NVIDIA nvdiffrec](https://raw.githubusercontent.com/NVlabs/nvdiffrec/main/LICENSE.txt) | nedatováno | 2026-10-21 | text přečten; use-path neověřen |
| [22] | Konkrétní Hunyuan2.1 územní vymezení | [Tencent licence](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2.1/main/LICENSE) | 2025-06-13 | 2026-10-21 | text přečten; jiné smlouvy neověřeny |
| [23] | Skutečné nativní uložení souboru | [Blender save API 5.2](https://docs.blender.org/api/5.2/bpy.ops.wm.html) | verze 5.2, nedatováno | 2026-10-21 | API + vlastní reopen ověřen |
| [24] | FBX relativní shape geometry a curves | [Oficiální Blender 5.2 exporter](https://raw.githubusercontent.com/blender/blender/blender-v5.2-release/scripts/addons_core/io_scene_fbx/export_fbx_bin.py) | větev5.2, nedatováno | 2026-10-21 | source spot-check |
| [25] | Licence Blenderu a oddělené dílo | [Blender Foundation](https://www.blender.org/about/license/) | nedatováno | 2026-10-21 | tvrzení vydavatele, ne individuální právní posudek |
| [26] | Model identity a oznámený retirement lowpoly | [Meshy image API](https://docs.meshy.ai/en/api/image-to-3d) | živé docs, changelog18Sep2026 v digestu | 2026-10-21 | medium/unverified |
| [27] | Skutečné textové motion API | [Meshy Text to Motion](https://docs.meshy.ai/en/api/text-to-motion) | nedatováno | 2026-10-21 | API-read; účet a kvalita unverified |
| [28] | Přenos motion_task_id na biped a exportní limity | [Meshy Animation API](https://docs.meshy.ai/en/api/animation) | nedatováno | 2026-10-21 | API-read; runtime unverified |
| [29] | Text conditioning vertex trajektorií | [AnimateAnyMesh inference source](https://github.com/JarrentWu1031/AnimateAnyMesh/blob/main/test_drive.py) | živý main | 2026-10-21 | source-read, runtime unverified |
| [30] | Oznámený release kódu a vah | [AnimateAnyMesh repo](https://github.com/JarrentWu1031/AnimateAnyMesh) | release oznámení2025–26 | 2026-10-21 | repo-read; váhy/licence a běh unverified |

Nativní uložení `.blend` je samostatné od importu/exportu výměnného souboru. [23] Nezávislé převzetí rozhodovacích tvrzení a korekce jsou v [ověřovacím digestu](root/verification-digest.md); původní digests zůstávají v `digests/` a procesní rozhodnutí v `.memlog.md`.

## Čerstvost

[Strojový výstup](staleness.json) používá [datované záznamy](claims-dated.json): osm datovaných tvrzení, osmnáct nedatovaných vynechaných z datové aritmetiky. Okna jsou kompatibilita: 1 měsíc, AI přehled/cena/smluvní text: 3 měsíce; normativní glTF má samostatnou kontrolu platné verze, nikoli vymyšlené datum expirace.

| Záznam | Z publikace odvozená opakovaná kontrola | Stav této rešerše |
| --- | --- | --- |
| Tripo modelové datum11Feb2026 | 11Mar2026 | Živé docs přečteny nyní, říjnové datované release potvrzení chybí. |
| DeepMotion terms 30. 3. 2025 | 30Jun2025 | Veřejný odkazovaný text znovu přečten; produktové/private dodatky nevyjasněné. |
| Tripo terms 11. 7. 2025 | 11Oct2025 | Veřejný text přečten; konkrétní účetní smlouva neověřena. |
| Hunyuan2.1 licence 13. 6. 2025 | 13Sep2025 | Konkrétní starší licence přečtena; jiné verze/smlouvy se z ní neodvozují. |
| Meshy datovaný API signál 18. 9. 2026 | 18Oct2026 | Aktuální docs přečteny; blízký známý přechod lowpoly 30. 10. 2026 zkontrolovat před automatizací. [26] |
| Blender manuál aktualizovaný 20. 10. 2026 | 20Nov2026 | Nejbližší budoucí obecná kontrola z datovaného souboru. |
| Meshy terms 19. 9. 2026 | 19Dec2026 | Přesto znovu ověřit před objednávkou a uploadem. |

Nejstarší strojové datum kontroly je 30. 6. 2025, **nejde o důkaz neplatných podmínek**: říká, které publikace už vyžadovaly nové čtení. To nyní proběhlo u veřejných stránek, ne u uživatelova budoucího tarifu/Order. U nedatovaných ceníků a technických stránek nelze poctivě spočítat stáří; kontrolovat je znovu před placeným pokusem nebo instalací. Známá konkrétní změna 30. 10. 2026 je dříve než obecná budoucí kontrola 20. 11. 2026. Výběrovou zprávu po dvou čtvrtletích obnovit před použitím; ceny a AI nabídky významně dříve.
