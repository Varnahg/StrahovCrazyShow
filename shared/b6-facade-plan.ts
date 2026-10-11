import type {B6Box} from "./b6-interior";
export const B6_FACADE_PLAN={
  source:"IPR Praha2023 semantic B6 facade study; user B6 photos",
  sourceReference:"docs/reality-pack/facade-study/study.json",
  measured:false,
  northSmall:{width:1.2,height:1.0,sill:1.1,lintel:2.1,panes:1,style:"small" as const},
  receptionWestBand:{width:4.4,height:1.2,sill:1.05,lintel:2.25,panes:3,style:"stair" as const},
  globalRoomPitchStatus:"Existing22-bay metric retained. Source wide glazing groups need per-window validation; groups are not a room inventory.",
  roofSourceDatumWorld:18.752938270568848,
  roofDetails:[
    {id:"north",minX:1.473133008757395,maxX:6.524479841302615,minZ:-81.17969925817874,maxZ:-77.14745640708983,rise:3.384405056910719},
    {id:"south",minX:9.084679851596913,maxX:14.485925731186185,minZ:-30.366231556730057,maxZ:-24.411392862791946,rise:2.4514390076279042},
  ],
} as const;
export function b6LongWindow(x:number,z:number,standard:{width:number;height:number;sill:number;lintel:number}){
  return x===0&&z<-77.1?B6_FACADE_PLAN.northSmall:{...standard,panes:4,style:"room" as const};
}
/** Only faces exactly coincident with the external facade are removed. The
 * room-side surface, wall thickness, every window reveal and collisions stay.
 * B6's lower north lobby portal remains owned by the traversable interior.
 */
export function b6FacadeOwnsBoxFace(box:B6Box,nx:number,nz:number,layout:{bounds:{minX:number;maxX:number;minZ:number;maxZ:number};lobby:{minX:number}}){
  if(box.kind!=="wall"||box.role!=="shell")return false;
  const eq=(a:number,b:number)=>Math.abs(a-b)<1e-8;
  return (eq(box.w,.35)&&((eq(box.x,layout.bounds.minX)&&nx<-.5)||(eq(box.x,layout.bounds.maxX)&&nx>.5)||(eq(box.x,layout.lobby.minX)&&nx<-.5)))||
    (eq(box.d,.35)&&((eq(box.z,layout.bounds.minZ)&&nz<-.5)||(eq(box.z,layout.bounds.maxZ)&&nz>.5)));
}
