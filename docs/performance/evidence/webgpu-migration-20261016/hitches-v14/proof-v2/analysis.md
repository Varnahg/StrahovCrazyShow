# Volba před CPU proofem

Vstup je frozen V4 bf28a565 s přijatým inactive falloff resetem, nikoli další runtime kandidát. Skutečný AvatarPrimitivePool/createAvatarRig/AvatarLodController zachovává near parts a vyjímá medium; geometrie těla/garments má authored konzervativní rig bounds pro skinning, vlasy vlastní fit bounds. CameraFollow používá default distance8 a pitch0.28, předchozí avatar proof měl distance5. Nový proof používá actual Game closure s aktuálními defaults a výslovný no-obstacle collision IO; nepředstírá full-world clip.

Varianty:

- Těsnější perspektivní pohled na stejné kameře/passu: pouze source-derived target/FOV a případně far plane; zachovat pozici, minZ, typ kamery, viewport a actor/history. Nejmenší vybraná zkoumaná varianta. Objekt nesmí být skrytý nebo teleportovaný; actual frustum, main draw a celé defines musí souhlasit.
- Layer/visibility mask: vyžaduje změny mesh stavů, owner cleanup a explicitní vyloučení okolí. Snadno zakryje shadow/base-effect práci a není potřebná pro tento proof; nevybráno.
- Scissor: omezuje raster, nikoli scene active-mesh/material přípravu. Nedokládá úsporu variant; nevybráno.
- forceCompilation: nezachycuje automaticky přesné future instance/texture/pass pipeline deskriptory ani skutečný main draw. Nevybráno.
- Orthographic: mění CAMERA_ORTHOGRAPHIC/PERSPECTIVE defines, takže by připravovala jinou variantu. Nevybráno.

Fit vychází z union skutečných enabled near bounding-box world corners. Skinned bounds se nesmí zúžit jen podle bind-pose vertex dat; zachovat původní konzervativní tělo/garment envelope. Navíc se projekčně ověří všechny aktuální pozice přes pinned getPositionData(true,true), jež aplikuje skutečné skeleton/morph matice do kopie dat (AbstractMesh1499/1411–1480). Žádné přepsání GPU/mesh/Effect readiness. Rezerva je vyjádřená dvěma pixely ve výšce aktuálního viewportu a původním near-plane odstupem, ne odhadovanou polohou těla.

Shadow cesta je samostatná: VehicleLighting má vlastní torch frustum, range24 a shadowMinZ0.1/shadowMaxZ24. Zúžení main kamery automaticky nevyloučí world castery. Fresh wrapper navíc obnovuje skutečný base effect ve shadow pass. Malý reprezentativní svědek mimo main view musí tento mechanismus ponechat aktivní; žádný world mesh není plnou produkční atribucí.

## Výsledek bounded ověření

Sedm konfigurací (všech6 default presetů a Alex+glasses+beard), 119 captures a70 pair comparisons PASS. OFF vykresluje12–14 avatarových částí, ON14–16 včetně skutečného torch prop. Pro whole Day1, FOV-only, far-only, combined narrow a B6 comparator jsou plné main Effect defines i identity shodné. Užší pohled nevyvolal variantu ORTHOGRAPHIC ani nový main pass.

Projekce není odvozena pouze z draw: každá zkoumaná zúžená varianta obsahuje všechny aktuální source vertices po skutečném skeleton/morph API i všech8 corners každého konzervativního near boundu. Žádný bod není nečíselný/za kamerou/za near-far/FOV. Počty ON vertices na konfiguraci13 896–18 305; přítomné jsou3–4 skinned meshes. Žádný preset nemá aktivní morphTargetManager, takže API morph větev je volána, ale konkrétní aktivní morph deformace nejsou ověřené. Změna animace neprobíhá; jde o aktuální source rest pose a původní konzervativní envelope, ne všechny možné emotes/jump/IK stavy.

Far-only ve V2 vychází jako menší platný geometrický kandidát: mění pouze maxZ z 1100 na 10.06794–10.07243 m, zachovává camera.position/rotation/target/FOV 0.85/minZ 0.08. Hranice je největší hloubka všech konzervativních bounding corners v původním nezměněném view plus původní minZ 0.08 m. Tato větev nevolá fitAvatar/setTarget ani jiný pose/FOV mutátor. Combined narrow přidá target na union center a FOV 0.418–0.436. FOV-only nezabrání draw přesně zarovnané vzdálené geometrie; skutečný witness se vykreslí. Far-only i combined witness vyřadí. Výkonové prvenství mezi far-only a combined tím není určené; velké ground meshes a geometrie blízko avatara mohou protínat obě frusta.

Zároveň je pozitivně doložený limit: ve všech7 ON případech je representative wind leaf mimo main draw, ale skutečně se kreslí do torch shadow map a Fresh wrapper při první narrow ON připraví nový base Effect i depth Effect. Není tedy pravda, že narrow pohled připravuje pouze avatara. Pořadí zkoušky je narrow-first, takže tuto událost neskrývá dříve zahřátý whole view.

Recorded B6 comparator vykreslí požadované submeshe a prokáže shader reuse, ale v každé konfiguraci klipuje 234 současných vrcholů bot/podrážek. Eli má navíc 3 klipované vrcholy trouser-waist, celkem 237. To není úplné avatar pixel coverage; důkaz celého avatara stojí na projekčních kontrolách spawn whole/narrow/far-only/FOV-only. V produkci se kamera/přítomnost avatara v B6 tímto proofem nemění.

Úspěšný i throwing callback ve všech třech režimech obnoví camera pose, up vector, perspektivní mode/FOV mode, FOV, minZ/maxZ, getTarget, _initialFocalDistance, _referencePoint, roll cache, původního vlastníka quaternionu, projection/view matrices a stejné pass ID. V2 obsahuje 77 striktních restore kontrol včetně 21 exception paths; žádné tolerance nebyly přidány. Deep-equal ověření zachovává actor, CameraFollow historii, LOD/visibility history, rig transforms a animation phase/gait. Všechny vlastní observers, wrapper, scény, enginy a raw upload references jsou uvolněné.

## P2 review a oprava důkazu

Archiv review-v1 zachovává původní manifest/probe/report/logy a handoff byte-identicky. V1 nebyl úplný restore důkaz: fitAvatar/setTarget změnil TargetCamera._initialFocalDistance a _referencePoint a původní restore vracel jen vizuálně ekvivalentní view. Far-only tehdy také nejprve volal fitAvatar, takže tvrzení o změně pouze maxZ nebylo správné. Pinned TargetCamera.setTarget (targetCamera.pure.js 262–285) mění focal distance/reference point i rotaci a za určitých podmínek pozici. _getViewMatrix (454–483) z reference point znovu odvozuje _currentTarget; shodná matice proto nestačí.

Nejprve přidaná přesná assertion reprodukovala RED: focal distance 8.717856710818625 místo 8.586873523819381 (review-v2-target-red.log). Po oddělení čisté far-only větve a úplném restore ostatních režimů prošlo všech 7 konfigurací v review-v2-green.log, UTC 03:10:37.700–03:10:40.241. Projekční tolerance pro klasifikaci hran frusta zůstala původní; restore používá strict/deep equality bez tolerance.

## Co by zúžení Day1 mohlo odstranit

Plný Day1 view připravuje i světové varianty Sun + POINT + HEMI, případně TORCH navíc. Nejde pouze o syntetickou polední kombinaci. ArtLighting počítá night = 1 − smooth(−0.04, 0.1, sunAltitude) (art-lighting.ts 163); GoldenHour preview cílí Slunce +3° (lighting-preview.ts 97–106). V tomto překryvu je kladné sluneční Directional a současně povolené mapped POINT. Podobná kombinace nastává přirozeně za úsvitu/soumraku. Počet POINT závisí na skutečném quality capu, vzdálenosti, torch/B6/headlight rezervaci (art-lighting.ts 393–422), nikoli jen názvu etapy.

BlueHour −6° již nemá přímý Sun, ale Moon může dodat Directional; fullMoonNight vybírá Moon >10° a Sun <−12°. Konkrétní night anchor dnešního proofu neměl aktivní Moon key, takže night0/1/2 etapy samy nezaručují všechny lunární kombinace. B6 fill je zapnutý podle skutečné přítomnosti uvnitř nezávisle na čase (b6-reality.ts 644); pohled ven z B6 může vyžadovat světové D+P varianty za hranicí těsného avatarového frusta. Driving/headlight přidává další podmínky a shadow rozdíly, které nelze ztotožnit pouze podle typu SPOT. Cinematic shadow strength >0.008, aktivní Directional, quality a skutečný caster list mění define cesty; cloud 0.96 tohoto CPU proofu je nepokrývá.

Nejmenší případný GPU A/B proto porovná čerstvé V4 a far-only při první GoldenHour OFF → F ON s pohledem na svět za novou far plane a zvlášť studený Day/B6 approach → entry/F → outward view → exit. Golden nejprve by mohla zahřát varianty a zakrýt regresi B6, proto jde o samostatné běhy. Sekvence Day/Blue/Night/full moon po Golden je jen zahřátý průzkum; nezávislý cold lunar důkaz vyžaduje vlastní běh. Porovnat celý startup, nové moduly/pipelines, CPU i frame gaps a obraz. Žádný runtime kandidát není tímto proofem zvolen ani implementován; nesmí se vynechat shadow work, vydávat CPU capture za úsporu sekund nebo prodlužovat timeout.
