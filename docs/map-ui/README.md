# Interaktivní mapa a názvy míst

## Podklady a návrh

Prohlédnuté 10. 10. 2026: oficiální [Blizzard: Map & Quest Log, 15. 9. 2014](https://worldofwarcraft.blizzard.com/en-gb/news/15707238/patch-6-0-2-preview-user-interface) popisuje zoom kolečkem, posun tažením a propojení mapy s cíli. [Blizzard: Updated UI and HUD, 25. 10. 2022](https://worldofwarcraft.blizzard.com/en-gb/news/23837944) vysvětluje výraznější minimapu a odstranění rušivých prvků. Použité principy: blízké cíle na minimapě, volitelné sledování postavy, oddělená podrobná mapa a menší počet názvů v pohledu. Žádná grafika, kód ani herní asset WoW nebyly převzaty.

Podklad tvoří přímo `BUILDINGS`, `STREET_SURFACES`, `LANDCOVER`, `REALITY_GROUND` a `BOUNDS`, které používá hra. Neexistuje druhá ručně poskládaná mapa. Rozšíření hranic světa se projeví i ve výřezu. Parkoviště je interpretace georeferencovaného leteckého snímku IPR Praha z 8. 6. 2024; původ a omezení jsou v `shared/data/reality-ground.json`. Mapa se připojuje výhradně k datům poskytnutým UI, nevytváří síťové spojení. Hostovi UI předává prázdný seznam multiplayerových hráčů.

## Funkční chování

- Zoom tlačítky, kolečkem nad mapou a klávesami `+` / `−`. Kolečko zachovává světový bod pod kurzorem i při natočení a CSS transformaci mapy.
- Posun myší, prstem nebo šipkami při zaměření mapy. Home / ⛶ vrátí celý areál; ⌖ sleduje postavu. Ruční posun sledování vypne, aby se mapa nevracela proti vůli uživatele.
- Sever nahoře nebo směr postavy nahoře. Směrová šipka a měřítko vycházejí z metrů, +X východ a +Z jih. Výchozí lokální výřez je přibližně 180 m široký, odvozený z aktuálních hranic světa.
- POI lze vybrat myší, Enterem nebo mezerníkem. B6 a klubovna mají oddělené značky s odkazovou čarou; nedochází k přesunu skutečné polohy klubovny. Detail ukáže popis, zdroj a nadcházející fiktivní akce. Výběr akce otevře její detail.
- Vybraný cíl zůstává označený na obou mapách. Pokud je mimo výřez, okrajová šipka ukazuje jeho směr; jejím výběrem se posune pouze mapa. Uvedené metry jsou vzdušná vzdálenost, **nejde o vypočtenou pěší trasu**. Žádný výběr neteleportuje postavu.
- Fialové body znamenají virtuální přítomnost. Lokální postava má vlastní směrovou značku, nepřekrývá se duplicitním multiplayerovým bodem.
- Blízké názvy venkovních míst nejsou v 3D pohledu: vzdálený název se zapne od 42 m a vypne pod 34 m; maximum je 180 m, s výstupní hysterezí 198 m. Vzdálenost místa je půdorysná, aby vysoká střecha nepředstírala vzdálenou budovu. Vnitřní orientační patra mají vlastní blízké pravidlo.
- Názvy hráčů zůstávají do 45 m, s hysterezí 49,5 m; zachován rozpočet 16 hráčů + nejvýše 8 míst a nejvýše čtyři kontroly překážek za vykreslený snímek. Názvy míst se nepřekrývají. Stejná vykreslená kamera, CSS rozměry, časová hystereze a subpixelová necitlivost zůstávají zachovány.

## Ověření

`pnpm exec tsx --test tests/minimap.test.ts tests/labels.test.ts`: **12/12 PASS**. Skutečná Babylon projekce v NullEngine testuje popisky, jejich rozsah, zakrytí, rozpočty a stabilitu. Matematické testy ověřují 32 směrů bez zrcadlení, inverzní transformaci, bod pod kurzorem při zoomu, drag při natočení, nové hranice světa i směry okrajových cílů. Nejde o GPU ani FPS měření. Globální `pnpm exec tsc --noEmit` původně PASS; poslední souběžný běh v 21:25 hlásil jedinou chybu mimo tento balíček, v rozpracovaném `shared/landmark-reality.ts:303` (přetypování `number[][]` na dvojice souřadnic). Hlavní úkol ji řeší s autorem modulu.

Praktický prohlížečový test v samostatném IAB panelu na `http://127.0.0.1:5173/`: zoom tlačítky 1,00 → 1,69, šipka doprava změnila střed −30,00 / 35,00 → 8,13 / 35,00, Home vrátil 1,00 a původní střed; kolečko zvýšilo zoom 1,30 → 2,37 a drag posunul střed −59,01 / 67,37 → −105,10 / 35,47. Výsledek je na [snímku menu](browser-menu-map.png). Po testu byl vlastní panel zavřen.

Zbývající praktická kontrola v hlavním viditelném panelu: výběr POI a události v sólo HUD, sledování pohybující se postavy, přepnutí směru mapy, dotykový pinch a výsledný vzhled 3D popisků v celé scéně. Subagent nemůže nastavit viditelnost IAB; jeho skrytý panel nedokončil start GPU scény, proto tyto části nejsou vydávány za end-to-end GPU důkaz. Kompletní test/build/izolovanou integraci a GPU měření provádí hlavní úkol po zapojení souběžných změn.
