# Předání nativních B1+B6 modelů 24.10.2026

Koordinátor `cad-buildings-01a16b37-models`, worktree cad-building-models, základ6dd89606. Scope pouze B1+B6 podle posledního pokynu uživatele; bez původních CAD, dalších budov nebo cizího WIP.

- B1 R10 konstrukce zachovaná, osm packed IPR2023 atlasů; přesné native/GLB/UV/PBR/PNG ověření PASS. Foto asset checkpoint30c13354, původní asset checkpoint6dd89606/b3cf0558.
- B6 R4: osm vlastních plánů,392roompolygons,703doors,319windows,37flights/28landings,113parts/65collisionparts/195796triangles. 44strictprep,26puregeometry a nativefixtures v předchozích rootlogách PASS; finální audit372headroom/supportPASS a přesná exportní shoda.
- B6 photomaster74946455…, GLB54ef5d20…,collisiona7f62e9a…;21atlasů z28patchů, geometrydigest73a0f4ed… přesně zachován. Source-derived PNG packed v masteru, žádné původní CAD/JPEG ani pomocná renderovací světla.
- Root prohlédl finální overall a všechny P01,N01–N07 půdorysy, tři dokončené západní N01interiérové pohledy. Půdorysy/overall audit+renderall exit0. Dodatečný drahý batch všech podobných interiérů byl po třech dokončených pohledech a již hotovém audit reportu vědomě ukončen přesně vlastnímu BlenderPID20032; zbytek obrazů se nevydává za vytvořený. Model se tím neměnil. Fototextury zachovávají rozmazání/stíny/nesoulad starších zdrojů; zamítnuté plochy zůstávajíPBR, žádné generativní doplnění.
- Modelovédoor/routes iactualSimulation: B1 574door/44stairs aB6 1406door/74stairsPASS. SouvislýfullworldB1 574/574 aB6 1406/1406PASS; skutečnýActor,bezteleportu. B6jemnějšíspacing0.60 vyřešil sourcechodbu0.935485m bez zásahu do stěn. Aktuální runtimehash musí být znovu svázán po posledních integračních opravách.
- Zobecněníbuilderu omezeno naexplicitníB1/B6identity, výškymezzanine a nativní metadata; B1roundtrip předfotobake zachovalpůvodníbytes. Photo projekce a geometry/export audit společné,bezduplikacebuilderů. PůvodníhotovéR10modely jsou recoverablevGitu.

Přesné veřejné shrnutí, zdrojové předpoklady a SHA jsou v docs/reality-pack/cad-buildings/{b01,b06}/README.md a model-audit.json. Modelový checkpoint není produkční GPU přejímka; integrace/camera/build/network musí být doloženy samostatně. Žádný Blender ani modelový pomocný proces již neběží.
