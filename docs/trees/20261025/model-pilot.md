# Stromový pilot, 25. 10. 2026

Pilot porovnává vlastní anatomický generátor a MTree 5.6.0. Živé modely hry ani starý katalog 110 stromů nepřepisuje. Realističnost má podle výslovného zadání přednost před přesnou kopií koruny z fotografie; konkrétní botanický druh zůstává neznámý.

## Identita a podklady

| Pilot | Zdrojový strom | Kořen X/Z | Výška / koruna / poloměr kmene |
| --- | --- | --- | --- |
| Listnáč | `ipr-crown-014` | −67,59 / −60,96 m | 13,55 / 17,93 / 0,484 m |
| Jehličnan B6 | `ipr-b6-north-conifer` | −10,5 / −76,5 m | 12 / 6,5 / 0,175 m |

Rozměry jsou katalogové odhady, nikoli nové zaměření. Poloha má nejistotu přibližně 2,5 / 2 m; B6 používá explicitní korekci `b06-tree-placement.json`. Kolizní poloměr kmene se zachovává. Habitus je autorská interpretace, fotografie prokazují především obecný charakter a umístění. Ortografie je z 8. 6. 2024; uživatelské B6 fotografie nemají potvrzené datum pořízení. B2 fotografie je jen typologický kontext. Koncept `concept-seasonal-v1.png` je syntetický a není důkaz skutečného stromu.

Kopie všech čtených map a dat s SHA jsou v soukromé cache `inputs/manifest.json`; šest prohlédnutých obrazových referencí v `inputs/references/manifest.json`. Uživatelské fotografie se nepublikují. Materiály přebírá pilot beze změny pixelů z [materiálového handoffu](materials.md): LeafSet024 má kalibraci celého atlasu 0,4 × 0,4 m, jednotlivé listy asi 9 × 12,5 cm. Fir Tree 01 nemá známou fyzickou kalibraci; délka fotografické větévky 0,22–0,35 m je výslovný modelářský odhad. Používá se pouze whitelist 9 listů a 7 jehličnatých částí; proužek kůry z raw atlasu není listí.

## Volba a iterace

- R1 prokázal příliš řídké olistění a pravidelná ramena. Zůstal v `r1-sparse/`.
- R2 přidal skutečná vyšší větvení, ale listnáč vytvářel plochou horní vrstvu a jehličnan příliš pravidelná patra. Celé původní modely, skripty, master a snímky jsou v `r2-dense/`.
- R3 rozložil větve do více výšek, přidal převislé jehličnaté větvičky a odstranil chybu afinního fitu MTree. Jehličnan byl koordinátorem přijat pro herní pilot. Listnáč zůstával řídký. Obrazy a modely jsou v `r3-habitus/`; tento archiv netvrdí, že obsahuje samostatný zdrojový snapshot R3.
- R4 doplňuje krátké olistěné výhony podél vnitřních částí listnáče. Listy se nezvětšují a nesypou do objemu koruny. Rozdělení do malých skupin umožňuje více než 65 tisíc fotografických částí bez ztráty hustoty kvůli 16bit ranku.

Vlastní kostra má skutečnou hierarchii parent/attachment, klesající tloušťku a napojené sekundární/terciární výhony. MTree je izolovaný srovnávací generátor, nikoli vybraný finální systém. Jeho manifold se transformuje jedinou afinní transformací a původní poloměr kmene se iterativně kalibruje. Původní přesun jednotlivých prstenců podle atributů vytvářel hroty; tato varianta byla odmítnuta.

R4 vlastní wood LOD používá hranici průměru 0,5 px při 22 m a 0,65 px při 75 m, referenční vertikální FOV 0,85 a výšku obrazu 720 px. Zůstávají předci zachovaných větví, kritické spojovací body i šest krajních cest siluety. Počet segmentů a radiálních stran vychází z projekční chyby. Jde o geometrický rozpočet, ne naměřený výkon. MTree wood zůstává pro porovnání celý i v nižších LOD a není navržen k hromadnému nasazení.

Near listnáč porovnává proti R3 dvanáctitrojúhelníkovému obalu dvě mírně zakřivené quad pásky (4 trojúhelníky). Jejich UV rozsah, fyzická velikost a základna listu se nemění; původní alfa vytváří skutečný obrys. Zdrojově ověřený bbox nemá cizí velké listy, ale jeho zaplnění je jen přibližně 57–70 % oproti 81–90 % těsného obalu. Ušetřené trojúhelníky tedy mají cenu vyššího transparentního fillu; GPU srovnání teprve rozhodne. Fir zatím zachovává přesný zdrojový obal, protože jeho prostý bbox nebyl tímto důkazem pokryt.

## Exportní kontrakt

`public/models/vegetation/seasonal/runtime-contract.json` má verzi 2, metry a `uint16-normalized`. Čtyři prototypy jsou pouze kandidáti pro dvě zdrojová umístění, `selectedPrototypeId` je `null`. Koordinátor musí variantu výslovně zvolit.

Každý GLB obsahuje tři LOD, každý se samostatným `wood` a `foliage`. Jména jsou `<variant>__lod<0|1|2>__wood|foliage`; node extras obsahují role, materialKey, lod, archetypeId a sourceTreeId. GLB je root-local Y-up s identickými transformacemi, bez vložených obrázků a materiálů. Sdílené mapy dodá runtime loader. Native `.blend` uchovává všechny originální mapy a oddělené editovatelné varianty ve studiu; studiové posuny nejsou herní umístění.

`COLOR_0` je normalized uint16 VEC4, RGB = 65535, A = fáze opadu v celém rozsahu 1–65534. Indexy jsou seřazené podle skupin. Listnáč má nejvýše šest sousedních listů v jedné skupině, rozsah kotev pod 0,39 m; u jehličnanu je skupinou jedna fotografická větévka. Stejná skupina má stejný rank ve všech LOD. `componentCount` označuje rank skupiny, `photographicPartCount` fyzické části. Audit uvádí obojí i počty při 25/50/75 % fáze. Runtime vypíná vertex alpha a ponechává material alpha = 1; opad mění index subset, nikoli průhlednost koruny.

## Reprodukce a závislosti

Použita Blender 5.2.2 LTS, build `d13f752e3b9c`, headless Cycles CPU, nejvýše 2 vlákna. Žádný addon není instalován globálně. [Oficiální MTree release 5.6.0](https://github.com/GoodPie/modular_tree/releases/tag/5.6.0) z 20. 10. 2026 má Windows ZIP SHA `2de83eeeaafccf1818e665a61c1975bdc9e16a59cc1f78b0bfdb94c8b0241103`. ZIP je rozbalen do vlastní cache `deps/mtree560/`, jeho `wheels/modular_tree-5.6.0-cp313-cp313-win_amd64.whl` jako ZIP do `deps/mtree-core/`. Použitý nativní core má MIT licenci; GPL addon se neregistruje ani nedistribuuje.

Po převzetí zmrazených materiálů spustit postupně z kořene pracovního stromu:

```powershell
. ./.cache/trees-20261025/activate.ps1
$env:OMP_NUM_THREADS='2'
$treeBlender='C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
& 'C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe' -B scripts/trees-20261025/freeze_inputs.py
& $treeBlender --background --factory-startup --threads 2 --python-exit-code 7 --python scripts/trees-20261025/build_pilot.py
& $treeBlender --background --factory-startup --threads 2 --python-exit-code 7 --python scripts/trees-20261025/add_foliage.py
node scripts/trees-20261025/publish_contract.mjs
node node_modules/tsx/dist/cli.mjs --test tests/tree-seasonal-assets.test.ts
```

Soukromé reference lze zmrazit pomocí `freeze_references.py` jen tam, kde jsou skutečně dostupné. Nativní příkazy vyžadují rezervaci `heavy-validation`; nesmějí běžet při GPU měření koordinátora.

Letní studiové rendery mají leafAmount = 1, holé = 0. Jarní render se nevytvářel. Vlastní varianta je vlevo, MTree vpravo; `*-bare-lod2.png` ukazuje nezakrytou vzdálenou kostru. Toto není herní GPU přejímka. Přesné hashe, výsledky a stav rezervace jsou v [předání](../../agents/handoffs/trees-20261025-pilot.md).

## Zbývající omezení

R4 far vlastní listnáč má 2 690 wood + 32 766 foliage trojúhelníků, jehličnan 1 992 + 43 572. Redukce wood je doložená, ale jednotlivé listy/twigy stále nepředstavují rozumný far katalog 110 stromů. Další porovnání má použít skutečně odvozený twig cluster nebo menší alfa obal stejných fyzických větévek, se zvláštní zimní kostrou a ověřeným transparentním fillem. Samotné navýšení loader byte limitu není optimalizace. Širší publikace čeká na skutečné herní A/B, sezónní průchod a výkonový profil.
