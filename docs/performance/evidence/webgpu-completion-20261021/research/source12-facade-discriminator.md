# Source12 distant facade comparison remains unresolved

Readonly independent image/source audit by webgpu_editor_audit,23October2026. Inputs are [CM first-car](../validation/car-source12/first-car-night.jpg), [GL2 first-car](../validation/car-source12/gl2-first-car-night.jpg) and their original after-state exports. CM shows a facade grid; GL2 shows an almost uniform dark surface. This is a real image difference, not yet an attributed backend defect.

Source053501f0/builda21d1495/helper49662229, Medium2040×986, lightingUTC1792792800000, trafficUTC1792598400000 and full Weather values agree. Camera CM(110.553886,1.406327,8.147643) vs GL(110.011841,1.424693,8.004292) differs about0.561m despite matching yaw/pitch/FOV. Scene counts differ by one mesh/geometry; active meshes453vs458. Image and state are not an atomic exact-frame pair.

The likely object is menza OSM8111356 atx100.762,z167.57,height9m, facing north. Exact pixel→mesh ownership is not exported. Architecture far representations still contain glass/frame quads with deterministic material/UV/sideOrientation. Calculated distance after32.4845m bounding radius is119.254/119.363m, both beyond even High100+9hysteresis, so this particular building's quality hysteresis does not explain the difference. Vehicle beams range32m and cannot directly illuminate that facade; indirect material-state effects remain a hypothesis.

## Selected next practical discriminator

Keep actor and camera stationary, use ordinary lighting controls for the same fixed day instant and then the same fixed night instant in each backend, saving image and raw matrices/lighting. If GL grid appears by day, geometry exists and the difference narrows to night shading/reflection/shadow/material state. If absent in both, identify actual enabled/active mesh/material/draw owner before choosing a fix. No random facade/light/LOD change is justified by these images.

Original foot SPAWN yawπ looks north away from menza. Its identical-camera image remains useful for general parity but cannot resolve this southern facade. For menza use normal camera rotation to yaw0 or a stationary car, verify actual view/projection, and report any remaining pose difference. F does not change flashlight in a car. A broader passive material snapshot is deferred until the normal UI discriminator proves necessary; no extra GPU/readiness call is authorized by this document.
