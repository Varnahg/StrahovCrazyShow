# TERÉN: jediná headless inspekce květin

Owner `terrain-flowers-derive-01a16b37`, příjemce root. Přidělená resource `heavy-validation`, souběžný zdrojový claim `terrain-20261025-flowers`. Cwd `D:/CodexWorkspaces/StrahovCrazyShow-terrain-20261025`, baseline `ff13fa2b`. Všechny cache a TEMP na D podle `.cache/terrain-20261025/activate.ps1`.

Příkaz 25.10.2026:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/derive-ground-flowers.py *> .cache/terrain-flowers-20261025/source-extraction.log
```

Exit **0**, Blender **5.2.2 LTS**, PID **35396**, vlastní inspekce **13,03 s**. Proces po skončení neexistuje. Žádný render, GPU, server, instalace ani změna zdrojového masteru. Velký zdroj se necommití: master + deklarované mapy jsou v `.cache/terrain-flowers-20261025/source-highest/`; importer ověřil provider velikost/MD5 a vlastní SHA-256. Před i po Blender čtení byly všechny tyto SHA znovu porovnané.

Výsledek: 5 source rostlin A–E, každá LOD0–3. A_LOD3 má 260 trojúhelníků; topology audit rozlišuje dvě žluté hlavy po 24 tri a stonky po 14 tri. Lokální source výška A_LOD3 před modifikátorem je 0,156891 m. Runtime nebude používat katalogovou šířku 4,2 m jako rozměr rostliny.

Extrahovány **raw mesh corners**, UV seams a split normals. LOD1–3 obsahují Displace modifier; export jej záměrně nevyhodnocuje a následná drobná květinová derivace nesmí tvrdit byte/geometrickou shodu s evaluated source LOD. Original .blend zachovává původní autorské chování. Runtime výběr komponent, přenos materiálu a menší LOD pokračují lehkou CPU transformací uloženého výpisu pod hlavním flowers taskem. Není důvod spouštět druhý Blender/bake: originální atlas již obsahuje samostatné fotografické hlavy.

Cache SHA-256:

- `source-extract.json`: `064c6b8fd12165adc1a4d9e26c06b5bbed0d4421ac6141d4cdc931df892784be`
- `source-inspection.json`: `23d1a836a6089eec2585bbe5e5263547362fdc5b8007db335ef53993b3899ad9`
- `source-extraction.log`: `9cbe4b7c543dae0d2fc2e98deb2cbbb558f26e9755cdd184fcdb5122abf48a8e`

Tento handoff potvrzuje inspekci/extrakci zdroje, nikoli dokončené květiny, shaderovou/GPU přejímku či FPS. Resource se uvolňuje pro root build; hlavní flowers claim zůstává aktivní.
