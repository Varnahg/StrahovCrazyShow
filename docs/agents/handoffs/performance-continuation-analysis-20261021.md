# Výkonová analýza: první navazující checkpoint

Vlastník ai3d-research-01a15a3e-perf; kopie `.cache/player-feedback-20261020`. Zápis jen `docs/performance/evidence/continuation-20261021/` a toto předání. Aktuální evidence je čtecí analytický výstup, žádná další runtime optimalizace nebo GPU měření. Task zůstává rozpracovaný pro přijetí skutečných nových KEY-53 výsledků a interpretaci.

Provedeno: načtena metodika a relevantní původní CPU stack/phase profily, porovnány identity a limity, přímo přečten nový úplný baseline manifestf3b5…/8557. Současný c3454 runtime a skutečně instalovaný Babylon9.30.0 mají vlastní5fileSHA. Doložena přítomná texture→scene→material/submesh dirty cesta a dosavadní per-update transit pruning; nebyla vydávaná za měřenou cenu nebo navržená oprava provedena.

Nový modelový pilot poskytl konkrétní GLB1 097 032B. Vlastní malý čtecí Python audit skutečných vertex/index streamů našel59mesh definic/34přesně unikátních/25nadbytečných,65primitives/47472tri/27875POSITION/3materiály/0textur. VstupníSHA a reprodukce jsou uložené. Nejde o provedenou deduplikaci, runtime draw calls, úsporu paměti nebo FPS. Zvolen přesný bajtový audit bez zásahu do modelu; semanticky stejné sítě s jiným pořadím by nerozpoznal.

Ověření: skutečný parser prošel nad vlastním GLB, ast.parse vlastní utilitky PASS,8lokálních odkazů v reportu PASS. Žádný herní build/test suite ani Blender během této analýzy; původní samostatný pilot už je ukončený a jeho heavy/GPU předané. Žádný vlastní daemon/port/browser/helper nyní neběží.

Koordinace: KEY-53 řadič dokončil27/27cílených testů a3review, PR22/head3ac77c7abf8fca43e6380f382aba306502ab86d6/basec3454da4 má zelenou CI/hygiene; finální produkční A/B je ještě u koordinátora. PR21 closing docs se nesmí sloučit před jeho předáním, protože změna přesné base zneplatní přejímku. Publication okno vlastní perftransit koordinátor. Modelový výzkum KEY58 je přijatý lokálním commit673e3626; report/pilot/claims se nepřevádějí na přijatý výkon.

Další práce: převzít konkrétní before/candidate/after manifests, raw CPU/GPU/frame intervals, podmínky, relace/NPC/avatar/camera/čas/rozlišení a health, ověřit srovnatelnost a interpretovat nulový i kladný/záporný výsledek. Potom aktualizovat prioritu mezi průběžným render/submission, NPC lifecycle, UV dirty scan, tile generation a asset sdílením. Nesčítat vnořené scope, nepoužívat sample count jako čas. Aktivní společný goal zůstává otevřený; tento checkpoint není Done.
