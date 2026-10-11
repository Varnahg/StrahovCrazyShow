import type {B6Box} from "./b6-interior";
import type {B6StairMesh} from "./b6-stairs";
/** The footprint/direction follow B6's canonical entry. The covered portal
 * proportions are unmeasured interpretations of the user's B6 north view and
 * separate typical-block entry photograph (which is not identified as B6).
 */
export function buildB6Entry(entry:{x:number;width:number;stepsFromZ:number;stepsToZ:number;landingMaxZ:number},rise:number){
  const boxes:B6Box[]=[],meshes:B6StairMesh[]=[];
  const frontZ=entry.stepsFromZ-.15,backZ=entry.landingMaxZ+.1,depth=backZ-frontZ;
  const add=(material:B6Box["material"],x:number,y:number,z:number,w:number,h:number,d:number,kind:B6Box["kind"]="wall")=>boxes.push({level:0,x,y,z,w,h,d,kind,role:"exterior-entry",material});
  // Side panels stop outside the existing 2.4m clear stair/door aperture.
  for(const sign of [-1,1]){
    const x=entry.x+sign*1.36;
    add("painted-concrete",x,(-rise+.9)/2,(frontZ+backZ)/2,.14,rise+.9,depth);
    add("entry-glass",x,(.9+2.56)/2,(frontZ+backZ)/2,.035,2.56-.9,depth-.2,"glass");
    for(const z of [frontZ,backZ])add("entry-metal",x,(-rise+2.56)/2,z,.16,rise+2.56,.16);
    add("entry-metal",x,.9,(frontZ+backZ)/2,.08,.055,depth);
    add("entry-metal",x,2.53,(frontZ+backZ)/2,.08,.055,depth);
    // The door leaves stay visibly open inside the lobby, never spanning the
    // north-to-south walking path. The historical source door state is unknown.
    const leafX=entry.x+sign*1.27,leafFrom=backZ-.23,leafTo=leafFrom+1.04;
    for(const z of [leafFrom,leafTo])add("entry-dark-metal",leafX,1.025,z,.055,2.05,.065);
    for(const y of [.045,1.05,2.025])add("entry-dark-metal",leafX,y,(leafFrom+leafTo)/2,.055,.065,leafTo-leafFrom);
    for(const [lo,hi]of[[.08,1.015],[1.085,1.99]])add("entry-glass",leafX,(lo+hi)/2,(leafFrom+leafTo)/2,.02,hi-lo,leafTo-leafFrom-.065,"glass");
    add("entry-metal",leafX-sign*.045,1.05,leafTo-.14,.018,.3,.025);
    // Slim round handrails follow the same existing exterior stair rise.
    const a=[entry.x+sign*1.1,-rise+.92,entry.stepsFromZ+.05],b=[entry.x+sign*1.1,.92,entry.stepsToZ];
    const dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dy,dz),normal=[0,dz/length,-dy/length];
    const positions:number[]=[],indices:number[]=[],segments=10,radius=.018;
    for(const p of [a,b])for(let i=0;i<segments;i++){
      const angle=i*Math.PI*2/segments;
      positions.push(p[0]+Math.cos(angle)*radius,p[1]+Math.sin(angle)*normal[1]*radius,p[2]+Math.sin(angle)*normal[2]*radius);
    }
    for(let i=0;i<segments;i++){const j=(i+1)%segments;indices.push(i,j,j+segments,i,j+segments,i+segments);}
    const ca=positions.length/3;positions.push(...a,...b);
    for(let i=0;i<segments;i++){const j=(i+1)%segments;indices.push(ca,j,i,ca+1,i+segments,j+segments);}
    meshes.push({id:`exterior-entry:${sign<0?"west":"east"}:handrail`,coreId:"exterior-entry",level:0,kind:"handrail",material:"entry-metal",positions,indices,castsShadow:true,collides:true,exteriorEntry:true});
    for(let i=0;i<4;i++){
      const t=(i+.4)/4,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t;
      add("entry-metal",entry.x+sign*1.21,y,z,.2,.018,.018);
    }
  }
  // Flat silver fascia, light soffit and deep reveals; all stay above heads on
  // the upper landing. The roof's underside is local2.56m, world4.36m.
  add("entry-metal",entry.x,2.65,(frontZ+backZ)/2,2.94,.18,depth+.18);
  add("painted-concrete",entry.x,2.555,(frontZ+backZ)/2,2.78,.01,depth+.02);
  for(const sign of [-1,1])add("painted-concrete",entry.x+sign*1.3,1.25,backZ-.08,.2,2.5,.35);
  add("entry-dark-metal",entry.x,2.18,backZ-.18,2.4,.08,.08);
  add("entry-glass",entry.x,2.365,backZ-.18,2.4,.29,.025,"glass");
  return {boxes,meshes,bounds:{minX:entry.x-1.55,maxX:entry.x+1.55,minZ:frontZ-.1,maxZ:backZ+1.05},measured:false,
    sourceIds:["b6-plan-2023","b6-pano-2025-north","user-typical-entry-photo"],
    dimensionsStatus:"Photo/map interpretation; no as-built dimensions. Door leaves are held open for the demo."};
}
