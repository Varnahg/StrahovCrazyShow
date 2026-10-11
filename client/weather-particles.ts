import type {Vec3} from '../shared/types';
/** Reset whole segments together; wrapping endpoints separately flashes long streaks. */
export function updateRainSegments(lines:Vec3[][],dt:number,temperature:number,wind={x:0,z:0}){
  const snowfall=temperature<0,speed=snowfall?2:12,length=snowfall?.08:.7;
  const step=Math.min(.1,Math.max(0,dt));
  for(const line of lines){const top=line[0],bottom=line[1];top.y-=step*speed;top.x+=wind.x*step;top.z+=wind.z*step;if(top.y<-1)top.y+=18;top.x=((top.x+18)%36+36)%36-18;top.z=((top.z+18)%36+36)%36-18;bottom.x=top.x+wind.x*length/speed;bottom.y=top.y-length;bottom.z=top.z+wind.z*length/speed;}
}
