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

Far-only vychází jako menší platný geometrický kandidát: mění pouze maxZ z1100 na10.62–10.65m, zachovává camera.position/rotation/target/FOV0.85/minZ0.08. Combined narrow přidá target na union center a FOV0.418–0.436. FOV-only nezabrání draw přesně zarovnané vzdálené geometrie; skutečný witness se vykreslí. Far-only i combined witness vyřadí. Výkonové prvenství mezi far-only a combined tím není určené; velké ground meshes a geometrie blízko avatara mohou protínat obě frusta.

Zároveň je pozitivně doložený limit: ve všech7 ON případech je representative wind leaf mimo main draw, ale skutečně se kreslí do torch shadow map a Fresh wrapper při první narrow ON připraví nový base Effect i depth Effect. Není tedy pravda, že narrow pohled připravuje pouze avatara. Pořadí zkoušky je narrow-first, takže tuto událost neskrývá dříve zahřátý whole view.

Recorded B6 comparator vykreslí požadované submeshe a prokáže shader reuse, ale klipuje234–237 současných vrcholů bot/podrážek. To není úplné avatar pixel coverage; důkaz celého avatara stojí na projekčních kontrolách spawn whole/narrow/far-only/FOV-only. V produkci se kamera/přítomnost avatara v B6 tímto proofem nemění.

Úspěšný i throwing callback obnoví camera pose, up vector, perspektivní mode/FOV mode, FOV, minZ/maxZ, projection/view matrices a stejné pass ID. Deep-equal ověření zachovává actor, CameraFollow historii, LOD/visibility history, rig transforms a animation phase/gait. Všechny vlastní observers, wrapper, scény, enginy a raw upload references jsou uvolněné.

Další případný krok je samostatný skutečný GPU A/B pouze změny view pro Day1 proti full V4, s first-Day, B6 F/výstupem, obrazem a celým startupem. Far-only má nejmenší mutation scope; combined je další srovnávací varianta. Nesmí se vynechat shadow work, vydávat CPU capture za úsporu sekund ani prodlužovat timeout.
