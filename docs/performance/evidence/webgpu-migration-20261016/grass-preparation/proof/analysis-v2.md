# V2: skutečný mapped POINT falloff

Review našlo přesný P2 ve V1 fixture: PointLight ponechal výchozí falloff, ale frozen `streets-renderer.ts:885–892` nastavuje diffuse `#ffd6a0`, range z lamp placement, `Light.FALLOFF_STANDARD`, intenzitu0 a disabled stav. `shared/streets.ts:361` udává range22; `art-lighting.ts:427` nastavuje aktivní intenzitu `night*0.7`. V1 point1 proto chyběl `LIGHT_FALLOFF_STANDARD1`; přesná mapped-point shader coverage nebyla správně doložená.

V2 používá stejnou malou scénu a skutečný controller. Opravuje POINT na STANDARD, diffuse/range/intensity podle zdroje. Poloha zůstává explicitní fixture poloha, nikoli geolokační důkaz. Ověřuje type POINT, renderPriority0, výchozí lightmap mode a nepřítomnost shadow generatoru. VehicleLighting má skutečné STANDARD/priority10/shadow=false na low. Po StableLightState se na skutečném mesh kontroluje pořadí SPOT,HEMI nebo SPOT,POINT,HEMI.

Každý zachycený Effect kontroluje celou množinu STANDARD flags: pouzeSTANDARD0 při0POINT, STANDARD0+STANDARD1 při1POINT; LIGHTCOUNT2/3 a odpovídající POINTLIGHT1/LIGHT2. Přidaný návrat1→0 na stejném FAR batchi potvrzuje odstraněníSTANDARD1/POINTLIGHT1/LIGHT2 a reuse bez nového programu. Proti V1 se celé point0 defines nezměnily; point1 má právě jeden nový řádek `LIGHT_FALLOFF_STANDARD1`, žádný odstraněný.

Jediný nový společný běh `node run-v2.mjs 01`:6/6PASS, bez skipů,2.215s runner. Závěry jsou stejné se správným mapped vstupem: ready/noninstance/zero-count prvníthin program nepřipraví; FAR0/1 potřebuje1+1; medium sdílí stejné Effecty; geometry isolation je nutná; immediate deferred-disposal zničí poslední Effect a způsobí+1program, zatímco předání OBĚMA variantám běžného batche zachová exactreuse po cleanupu.

V1 proof.test.ts, manifest, run01–12 i reporty zůstaly byte-identické a celý původní balík40artefaktů je navíc pod v1/. V2 má vlastní proof-v2.test.ts, run-v2.mjs a manifest-v2.json. Žádný runtime/cache/retention kód, build, TS nebo GPU se neměnil ani nespouštěl. Původní NullEngine capability, syntetické Texture IO, GLSL a selection/pixel limity zůstávají v platnosti; corrected flags nejsou WebGPU/FPS přejímka.
