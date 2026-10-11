/** Cache study only: same seeded point set for both comparison beds. */
export type StudyPoint={x:number;z:number;yaw:number;variant:number};
export function studyPoints(distribution:"grid"|"lawn",short:boolean,variants:number,seed=0x51a6b6):StudyPoint[]{
 if(variants<1)throw Error("Grass study needs source variants");
 if(distribution==="grid"){
  const points:StudyPoint[]=[];
  for(let x=-.9;x<=.91;x+=.18)for(let z=-.9;z<=.91;z+=.18){const i=points.length;points.push({x,z,yaw:i*2.399963,variant:i%variants});}
  return points;
 }
 let state=seed>>>0;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 const count=short?3500:512,minDistance=short?.023:.048,cell=minDistance/Math.SQRT2,cells=new Map<string,StudyPoint[]>(),points:StudyPoint[]=[];
 for(let attempt=0;attempt<count*100&&points.length<count;attempt++){
  const x=(random()*2-1)*.94,z=(random()*2-1)*.94,cx=Math.floor(x/cell),cz=Math.floor(z/cell);let allowed=true;
  for(let dx=-2;dx<=2&&allowed;dx++)for(let dz=-2;dz<=2&&allowed;dz++)for(const point of cells.get(`${cx+dx},${cz+dz}`)??[]){if((point.x-x)**2+(point.z-z)**2<minDistance**2){allowed=false;break;}}
  if(!allowed)continue;
  const point={x,z,yaw:random()*Math.PI*2,variant:Math.floor(random()*variants)};points.push(point);const key=`${cx},${cz}`,bucket=cells.get(key);if(bucket)bucket.push(point);else cells.set(key,[point]);
 }
 if(points.length!==count)throw Error(`Grass study sampling incomplete ${points.length}/${count}`);
 return points;
}
