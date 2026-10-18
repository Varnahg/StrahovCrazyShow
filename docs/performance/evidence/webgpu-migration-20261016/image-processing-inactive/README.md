# Neaktivní ImageProcessing příznaky: příčina, oprava a A1/B1/A2

18. 10. 2026. Přijímaný dílčí mechanismus je čtveřice nevyčištěných příznaků v Babylon9.30 prepareDefines. Hrané buildy zůstaly beze změny. Celý KEY-31 ani migrační cíl tím nejsou dokončené.

## Mechanismus a volba

Native Game vykreslí asset-scénu před vytvořením Cinematic; výchozí image processing je zapnutý. Aktivní prepareDefines nastaví pomocné hodnoty i při vypnutých COLORGRADING/VIGNETTE. Následná early-return větev pro vypnutí nebo postprocess mismatch vypíná nadřazené funkce, ale ponechá child values ze staré historie. Nový submesh má jejich výchozí false hodnoty. Výsledkem jsou odlišné klíče pro vizuálně stejný finální stav. Native proti combined se liší pořadím preloadu a Cinematic; následné stejné přípravné metody historii nevyčistí.

Předchozí nativní GPU atribuce zachytila všech pět programů: dva glass FAR, jeden far standard/end, dva outdoor dark-metal. Celé defines se proti dřívějším warm referencím lišily společnými třemi child příznaky. UV hypotéza byla vyvrácena. Přesná native startup historie v téže GPU relaci nebyla přímo zachycená; skutečný CPU reproduktor ji rekonstruuje ze zdroje a skutečných materiálů.

Zvolena čtyři false přiřazení za existující defines.VIGNETTE=false: VIGNETTEBLENDMODEMULTIPLY, VIGNETTEBLENDMODEOPAQUE, SAMPLER3DGREENDEPTH, SAMPLER3DBGRMAP. OPAQUE musí být symetrický k MULTIPLY. Aktivní větev je byteově stejná. Další prewarm historie přidávají čas a neřeší fresh receiver; přesun Cinematic zasahuje širší lifecycle; config writes před guardem zachovávají zbytečnou závislost vypnutých shaderů na nastavení; globální key stripping má širší rizika.

Použití v projektových GLSL/WGSL zdrojích a binding layoutu je parent-gated. Libovolný cizí custom shader může číst celý defines objekt; pro něj se univerzální kompatibilita netvrdí. Projektové pluginy tyto čtyři identifikátory nepoužívají. Oprava nepřidává cache, GPU prostředky, přípravné etapy ani nové timeouty.

## Reprodukce a kontrola obrazu na úrovni shaderů

Genuine RED0/2: skutečný native preload před Cinematic, 41 původních etap a nový dosud nepřipravený přijímač vytvoří tři další programy. GREEN18/18 pro přesnou in-process source metodu má0 nových programů a strict Effect/context reuse. Actual Standard/PBR GLSL/WGSL body/layout, aktivní hodnoty,64 konfiguračních kombinací, skutečný ThinImageProcessingPostProcess, obě vinětace,2D LUT kanály, disabled/mismatch/reactivation a FROMLINEARSPACE gamma/saturate jsou zachované. Prototyp se obnovuje v finally. Nezávislé review bez blockeru.

Přenositelný nativní přenos používá skutečnou implementaci, žádné prototype/report/cache vstupy: RED8PASS/9FAIL → GREEN17/17. Celý patch roundtrip zachová všech9 dotčených vendor souborů; původní hunks se po inverzi obnoví byteově. Lockfile mění jen šest patch hashů. Staré assertions a cleanup Game fixture zůstaly. Čistá izolovaná instalace odpovídá10 860 souborům měřené privátní kopie. Výsledek plné nativní/kombinované pipeline a integrace se doplní po jejím dokončení.

## Produkční pilot bez podrobného profileru

| Metrika | A1 původní | B1 opravená | A2 původní |
| --- | ---: | ---: | ---: |
| Nové programy / moduly | 5 / 10 | 0 / 0 | 5 / 10 |
| Synchronní pipeline | 12 | 2 | 12 |
| FPS | 49,6 | 55,3 | 47,8 |
| p95 | 23,7 ms | 21,4 ms | 25,3 ms |
| p99 | 84,8 ms | 27,5 ms | 67,1 ms |
| Maximum | 573,0 ms | 171,8 ms | 582,3 ms |
| Intervaly nad100 ms | 4 | 4 | 4 |

A source777a1bbb, B736318b2. Aplikace a Game32f02d… jsou stejné; jediná změna z10 860 dependency položek je imageProcessingConfiguration.pure.js f0b452b0…→b961f563…. Čtyři odstraněná přiřazení vrací původní bajty. Žádné změny scény, kvality nebo geometrie. Všude1 skutečný Alex,0 ambientních postav, Low77 %, interně1175×500, stejné řízené počasí a noc1792360800000. CSS A1 má1528×651, B1/A21528×650. Browser hlásí NVIDIA Pascal; místní inventář uvádí GTX1060 a driver32.0.15.8228. Teploty, takty a driver cache nebyly řízené po jednotlivých bězích.

Všech41 etap complete, bez timeoutu/pause. Lighting48,772/44,183/48,851s; mode→ready63,929/60,061/64,167s. Všech496/553/478 UI intervalů má jedinou souvislou shodu v raw logu. První interval podle stávající semantiky mírně přesahuje start marker dozadu; všechny vykazované velké záseky jsou hluboko uvnitř měření. Health valid, žádné chyby ani pending operace. Stejné ovládání neznamená identickou trajektorii: konec z113,01/121,82/112,50. Obrazy ukazují zachované auto, světlo a svět z různých koncových pozic; nejsou přesnou pixelovou paritou.

## Zbývající mezery

B1 seq401:171,8ms, předchozíCPU167,5/render153,4; seq402:134,6ms poCPU17,1/render15,8. Později seq412:109,8ms poCPU108,9/render100,9 a seq415:123,2ms poCPU22,6/render18,4. Zůstávají CPU render nárazy a následné mezery před callbackem. Není doložené, že druhá část je čistý GPU čas; plain log neurčuje přesný materiál či driverový původ. P99 pod33,3ms není nulový počet záseků.

Pilot podporuje úzkou opravu neaktivních variant; návrat A2 obnovil pět příprav a delší mezery. Neprokazuje univerzální FPS ani celou funkční/výkonovou přejímku. Vlastní QA4194/2589 je po každé scéně zastavené, původní hrané buildy neměnné.

## Dokončený nativní přenos a integrace

Čistá instalace skutečného projektového patche prošla. Finální native909ebf8a: **1446/1446 PASS**, combined3d405db9: **1506/1506 PASS**; oba full TypeScript/build a izolovaná integrace PASS. Původní plná V1 kontrola zachytila tři typové chyby pouze ve dvou testech. Root doplnil readonly literal tuple a skutečný string guard; přesná inverze i původní failed build jsou zachované. Runtime, patch a lock se při této opravě testů nezměnily. Původní native/source artefakty jsou autorova targeted verze; final-source a finální snapshoty obsahují tyto dvě přiznané typové opravy.

Runtime WT0eba3cf5e5c0659779d9c365b732b07b37693846 → main6a7f7554bf585a52a40f38cd5a6626fbbb8bbde5. Přesně čtyři vlastní patch/lock/test cesty, 133 ostatních pracovních cest zachovaných. Žádná změna public assetů, Game runtime, původních hraných buildů nebo cizích rozpracovaných souborů. Nezávislé review původního proofu, přenosu, oprav testů i integračního postupu bez blockeru. Přijat je pouze reset neaktivních příznaků; čtyři zbývající intervaly nad100ms, další scénáře a celá WebGPU přejímka zůstávají otevřené.
