# Nativní fyzikální průchod: native-20261011-a

Výsledek: **PASS**. Produkční Simulation() bez IPR collideru, start (110; 12), 109 kmenů, 24 parkovaných aut, 5 oplocených hřišť. Zdrojové hashe před/po: shodné.

Normální Actor/KCC, 60Hz fyzika. Žádný skok, teleport, vypnutí objektu nebo změna geometrie. A* pouze navrhuje lokální body na existujícím zdrojovém asfaltu/footways; každý návrh musí projít nezměněnou fyzikou. Parkoviště je virtuální private spojka. R-ko se ověřuje k chodníku před solidní budovou, nikoli do baru. B6 navazuje modelovými schody a recepcí. Dopravní čas 0 je deterministická statická regrese, nikoli průchod mezi živými autobusy.

| Trasa | Stav | Metry | Tiky | Grounded | Max horizontální krok | Detoury |
|---|---|---:|---:|---:|---:|---:|
| stadium191a | PASS | 610.646 | 8208 | 99.93% | 0.077074m | 1 |
| stadium191b | PASS | 749.067 | 10015 | 99.94% | 0.077118m | 1 |
| rko-public-approach | PASS | 98.828 | 1513 | 99.60% | 0.076951m | 1 |
| b6-north-reception | PASS | 218.005 | 3108 | 99.81% | 0.076970m | 1 |

Podrobné body, kontakty, provenance a zdrojové hashe jsou v JSON. Nejde o GPU/FPS měření ani o potvrzení nezaměřených architektonických detailů.

SHA-256 použitého auditního skriptu (jeho obsah se od spuštění nezměnil): 815b42f79f0202db055cf0e4919af6fe50a3ecfd7957313f12dfa49a1fc707eb.

