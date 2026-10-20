# Integrační kontext projektu

Čtecí audit21Oct2026 nad runtime přijatým v main c3454da45b22ad9726c257d3d481d45f6243ec04. [Přesné SHA7 vstupů](root/application-input-hashes.json). Jde o požadavky a omezení tohoto projektu, **nikoli důkaz schopností Meshy, LLM nebo animátorů**. Žádný Blender/export ani nový herní build nebyl při auditu spuštěn.

- `client/avatar-renderer.ts` vytváří vlastní `AvatarRig` z konkrétních `TransformNode` pivotů a importovaných JSON geometrií; používá scene-owned `AvatarPrimitivePool`, sdílené materiály a oddělené vlasové/oděvní/oční části.
- `client/avatar-skinned.ts:28` staví Babylon `Skeleton` z `client/data/skinned-character-geometry.json`, propojuje kosti s existujícími rig uzly, sdílí geometrie pro near/medium v `WeakMap<Scene,…>`, používá čtyři váhy na vertex a ruší skeleton s rootem. Skutečný JSON má13 kostí: hips,torso,head,left,leftKnee,leftFoot,right,rightKnee,rightFoot,arm,leftElbow,rightArm,rightElbow.
- `client/animation.ts:113` obsahuje `AvatarAnimator`: chůze je řízena uraženou vzdáleností, kontakty chodidel a existujícími pivots; pohyb rootu/kamery/kolize řeší jiná vrstva. To není obecný automatický import libovolného externího rigovaného klipu.
- `scripts/create-avatar-reality.py` reprodukovatelně vytváří editovatelný `.blend`, referenční `.glb` a runtime JSON vertex arrays. Hlavička uvádí Blender5.2, což je autorovo zadání skriptu, nikoli v tomto auditu ověřená instalovaná verze nebo kompatibilita.
- `scripts/create-student-garments.py` zachovává původní anatomický SHA, redukuje váhy na existujících13 herních kostí, exportuje near/medium JSON a uloží editovatelný master. Vyměnit postavu za generovaný soubor tedy vyžaduje vědomé rozhodnutí o retargetu/adapteru, LOD, sdílení zdrojů a vlastnictví, nikoli jen stáhnout FBX.
- `docs/avatar/README.md` obsahuje historický popis procedurálních jednoduchých forem. Současné tělo je doloženo přímo výše uvedeným skinned kódem; starší návod nelze použít jako aktuální kompletní inventář. Tento výzkum jej bez rezervace nepřepisuje.

## Důsledky pro doporučení a pilot

Pro samostatné autorské použití je žádoucí nativně editovatelný `.blend` s geometrií, materiály, pojmenovanými částmi a animací. Pro herní použití se hodnotí ještě runtime forma, měřítko/metrická konvence, stejné kolize, kosti/weights/LOD, palety a počet materiálů, sdílení, první načtení a teardown. Jakékoli konkrétní limity polygonů/textur se musí odvodit z porovnaného skutečného herního profilu; v tomto čtecím auditu se nový univerzální budget nevymýšlí.

První pilot má být mimo produkční assety a bez změny fyziky či profilu hráčů. Model i animaci otevřít, upravit, znovu uložit a importovat; vizuálně ověřit identitu a požadovaný pohyb, následně porovnat ve stejné plné scéně s HUD. Tato část je plán, žádný takový nový pilot zatím neproběhl. GPU/Blender zdroje nyní koordinuje KEY-53; výzkum mu nekonkuruje.
