# Předání: cad-buildings-research-20261024

- Vlastník `cad-buildings-01a16b37-research`, příjemce koordinátor téhož chatu.
- Worktree `C:/Users/rezac/.codex/worktrees/cad-building-models/StrahovCrazyShow`, baseline `c713c2aedcafdb02358f05e4c9c51b607edeebc4`, čistý původní checkout, žádný cizí WIP převzatý.
- Výsledek: dokončen vstupní inventář 100 DXF / 16 budov a hloubkový průzkum B1 včetně 2D náhledů a variant převodu. Modely ani herní integrace nejsou hotové.
- Vlastní verzovaný výstup `docs/reality-pack/cad-buildings/README.md`; pracovní skripty, původní metadata a náhledy pouze v ignorované `.cache/cad-buildings-20261024/`.
- Reprodukce inventáře: `uv run --no-project --with ezdxf==1.4.5 --with matplotlib --with shapely python -X utf8 .cache/cad-buildings-20261024/cad_survey.py`, exit 0, 100 otevřených DXF, bez změn zdrojů. Zkouška polygonize `wall_study.py`, exit 0; obrazová kontrola odhalila chybějící příčky a tato metoda byla odmítnuta jako finální převod.
- Čtecí podagent `cad_b1_geometry_research` ověřil lokální párování hran: n01 731 pásů/144,413 m², n02 962/159,582 m², n03 1030/171,942 m², p01 590/79,385 m² v H/V prototypu. Nejde o hotové modelové stěny; p01 vyžaduje obecné směry. Strong dlouhé nepokryté úseky n01 8, n02/n03 0. Dveře LINE + otevřená POLYLINE, okna paralelní dvojice po 50 mm, n01 zhruba 55,9 mm. Izolované weak symboly nejsou stavební sloupy.
- Registrace: společná původní soustava, žádná normalizace bbox po patrech. N01 vs n02 sloupy medián12,36 mm/max25,32 mm; p01 vs n02 medián118,74/max389,34 mm, neodstraňovat slepým affine warpem.
- Výškový modelářský odhad odsouhlasený rámcem uživatele: 1PP −3,2, snížená hala91c a místnost14 −1,6, hlavní1NP0, 2NP3,2, 3NP6,4, střecha9,6m. Nástavba n04 není obytné patro. Podlahy/schody mají následně projít prostorovou kontrolou a herním Actor testem.
- Čtecí podagent `cad_runtime_research` doložil: současný archiv se ve hře jako celek nenačítá; nutno společně nahradit landmark render, obvodové kolize, střechu, foundation a doplnit terrain výřezy/indoor zóny. Doporučení Blender → GLB + konstrukční kolize z téhož vyhodnoceného meshe. Změna shared zdrojů vyžaduje kontrolu navigačních hashů a checkpoint protokolu.
- Cílený refaktoring se týká až navazujícího produkčního převodníku. Žádné GPU, Blender, servery ani porty nebyly spuštěny. Vlastní lehké CPU procesy skončily.
- Omezení: historická nezaměřená dokumentace, chybějí výšky a současné materiály. Detaily odhadnout a označit. Finální plány/kolize/build/testy teprve následují. `release` neoznačuje celé KEY-59 za hotové.
