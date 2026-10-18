# Rozhodnutí root pro izolovaný define-order-v6

18.10.2026. Vstupem je plný V4 bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0, nikoli zamítnutý far-only V5. Přijatý define-order proof96eb1c7cc96c2a97d3c6eccc03d6c82714dcf5401a3b6b234b959ff4a50af355 má16/16actual CPU testů,10same-engine WGSL/plugin/attribute větví a nezávislé čtecí review bez blokujícího nálezu. Root QA přejímka ani GPU benefit ještě neproběhly.

## Volba proti rozumným alternativám

- Neměnit renderer/cache a přidat další pohledy: opravuje jiný mechanismus chybějícího draw pokrytí, ale přidá startup. V4 už má15etap/40–42s vstup; není vhodné přidávat další práci před ověřením doložených duplicit.
- Rebuild sort nebo předdeklarace slotů: mění mutable `_keys`, clone/equality nebo needRebuild; pozdější opaque hodnoty/gettery mohou obejít guard.
- WebGPU-only native Effect cache-key normalizace: nechá první shader bytes původní, ale rozšíří reuse a potřebuje disjunktní raw/canonical namespace. Prefix+URI encoded key bez znaků +/@ by namespace oddělil; pinned consumers berou `_key` jako opaque. Eligibility však musí platit pro oba requesty. Zákaz processCodeAfterIncludes odmítne i vestavěné PBR/Standard callbacky, whitelist podle function textu není zvolen. Jiný kontrakt a lifecycle vyžadují samostatný proof, nikoli automatický přenos nynějšího výsledku.
- Zvolen jen copied MaterialDefines.toString hotový-result helper: původní getter čtení/throw i `_keys` zůstávají, žádná nová cache či gameplay stav. Celý unique literal block se validuje před sortem; unknown vrací původní bytes. Actual známé projektové default processor/plugin cesty mají doloženou WGSL/layout parity. Negativní order-sensitive custom preProcessor zůstává skutečným limitem, nikoli automaticky rozpoznanou fallback větví. Nejde o univerzální bezpečnost libovolného Babylon rozšíření.

Současné render hooks čtou hodnoty nebo přítomnost defines, ne pořadí: car-paint-instances56/68, photo-grass-wind84/91/128, tree-wind48/70, grass-material54/85, avatar-hair148, cinematic-art281/317. PhotogrammetryNight je dostupný testovaný plugin, produkční callsite nebyl doložen. webgpu-shadow-readiness19–42 parsuje Set/Map podle slotčísel; render-incident-profile179 hashuje text a jeho diagnostický otisk se záměrně změní. Hook/plugin/UBO pořadí samotné se měnit nesmí. Pinned/default a custom callback hranice vycházejí z hitches-v18/analysis.md.

## Mirrored baseline RED relevance

Čtecí audit resume_plan_review: v aktuálních car cestách není doložené záporné runtime měřítko. CarPack119–131 bake importovaných world transforms a reset position0/scaling1/Quaternion.Identity; createRig306–343 nové unit root/pivot/instance. assets159 používá reviewed pack,470–507 placement position+quaternion; transit-renderer305–343 totéž; Game2944–2948 a assets108–149 mění position/rotaci/wheels. Pinned InstancedMesh356 vybírá fallback podle rozdílného znaménka determinantu instance a LOD source, nikoli podle záporné souřadnice/yaw.

Explicitní scaling.x=-1 je v tests/wgsl-avatar-car398/430–431. Plugin je instalovaný i normálním autům, fallback hardBind se aktivuje až při !INSTANCES. CarPack/assets/transit/car-paint soubory jsou mezi primary/WT/V4 byte-identické podle čtecího auditu. Bez živé evidence záporného determinantu není mirrored RED prokázanou produkční chybou ani canonicalizer regresí. Zdroj/report/log zůstávají archivované; canonicalization coverage tuto větev neobsahuje.

## Následná přejímka

Leaf má vlastní physical core/loaders, candidate patch/lock a dvě test položky plus explicitní fixtures/material-defines-order. Původní V4/native/hranýbuild beze změny. Po frozen target testech/refaktoru/identity/roundtrip/typecheck musí root ověřit celý snapshot a skutečný build. První GPU běhy bez profileEnvironment: celý vstup, Golden/F, samostatná fresh B6 F/outward/exit. Počty scény a zdrojový hash zaznamenat; nižší počet kompilací bez kratších prodlev není úplné přijetí. Pokud pozitivní, stabilní fullsuite/build/integration a funkční kontroly dle scope; žádné automatické přepnutí default rendereru nebo uzavření KEY-31.
