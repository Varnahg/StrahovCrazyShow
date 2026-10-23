# Source12 distant facade comparison remains unresolved

Readonly independent image/source audit by webgpu_editor_audit,23October2026. Inputs are [CM first-car](../validation/car-source12/first-car-night.jpg), [GL2 first-car](../validation/car-source12/gl2-first-car-night.jpg) and their original after-state exports. CM shows a facade grid; GL2 shows an almost uniform dark surface. This is a real image difference, not yet an attributed backend defect.

Source053501f0/builda21d1495/helper49662229, Medium2040×986, lightingUTC1792792800000, trafficUTC1792598400000 and full Weather values agree. Camera CM(110.553886,1.406327,8.147643) vs GL(110.011841,1.424693,8.004292) differs about0.561m despite matching yaw/pitch/FOV. Scene counts differ by one mesh/geometry; active meshes453vs458. Image and state are not an atomic exact-frame pair.

The likely object is menza OSM8111356 atx100.762,z167.57,height9m, facing north. Exact pixel→mesh ownership is not exported. Architecture far representations still contain glass/frame quads with deterministic material/UV/sideOrientation. Calculated distance after32.4845m bounding radius is119.254/119.363m, both beyond even High100+9hysteresis, so this particular building's quality hysteresis does not explain the difference. Vehicle beams range32m and cannot directly illuminate that facade; indirect material-state effects remain a hypothesis.

## Selected next practical discriminator

Keep actor and camera stationary, use ordinary lighting controls for the same fixed day instant and then the same fixed night instant in each backend, saving image and raw matrices/lighting. If GL grid appears by day, geometry exists and the difference narrows to night shading/reflection/shadow/material state. If absent in both, identify actual enabled/active mesh/material/draw owner before choosing a fix. No random facade/light/LOD change is justified by these images.

Original foot SPAWN yawπ looks north away from menza. Its identical-camera image remains useful for general parity but cannot resolve this southern facade. For menza use normal camera rotation to yaw0 or a stationary car, verify actual view/projection, and report any remaining pose difference. F does not change flashlight in a car. A broader passive material snapshot is deferred until the normal UI discriminator proves necessary; no extra GPU/readiness call is authorized by this document.

## Subsequent actual day/night observation

[V12 actual pair](../validation/entry-source12-v12/verification.json) shows the CM full pane grid and GL alternation of blue glass with brown wall/diagonal streaks even by day. Thus a purely night IBL explanation is insufficient. Original foot camera view matches exactly, but car DAY pose differs about0.203m and NIGHT about0.458m; these are not atomic pixel-identical views.

Primary `architecture-reality.ts`927–956 creates a full FAR backing quad at depth0, without openings;1046–1057 overlays glass at depth+0.008m. The actual FAR representation therefore has two overlapping parallel surfaces8mm apart. Near representation has actual openings and glass at−0.202m; both compared distant views remain FAR. This supports depth competition as a mechanism, but actual depth precision/culprit draw are unmeasured. Game camera minZ is0.08m/maxZ1100m; the earlier informal0.04 inference from the WebGPU projection was wrong. Different GL/WebGPU projection m14 values follow their NDC conventions, not different near clips. A conditional D24 step at150m is approximately1.68cm; native WebGPU request depth24plus-stencil8 does not prove physical32float or measuredD24 precision, and GL depthbits are not exported.

Next ordinary UI discriminator, when a GL slot is already running after its performance export: stationary DAY Actor, wheel camera distance3→15 and save image/raw each. World LOD stays FAR; reshuffled wall/glass moiré under a small depth change would support raster depth competition. No backend/geometry/material fix is selected from this hypothesis alone.

## Actual camera-distance follow-up

The [new samebuild600ae09c pair](../validation/facade-source12/verification.json) retains ordinary wheel8→3→15→7.602 on GL and8→15→7.602 on CM, day23Oct12Z/night22Z, Medium2040×986. GL wall/glass patches change withdistance;3m looks into vehicle/ground so doesnotshow thefacade. CMday8 also shows diagonal/partialpanes;15m is morecomplete. This supersedes an overbroad reading of priorCMimages as alwaysfull panes. Bothbackends can show camera-dependent interference, supporting the shared8mmbacking hypothesis; no missingCMmaterial or isolateddepthbits proof. Actor rolls and yawdrifts~0.00178rad, so notpixelidentical.

InitialCMimage after navigation was physicallyclipped1910×813 despite2040rawGameviewport; retained/excluded and replaced forcomparison by a freshimage afterfocus/maximize/viewportreapply. GLoriginal330records endsatpagehide withoutsession-end; CM620records has session-end/1recordSizegap/1initialnormalrejoinfailure followed bysuccessfulUIretry. No originalrecords fabricated. Allowntabs/processesstopped. No geometry/material patch selected.
