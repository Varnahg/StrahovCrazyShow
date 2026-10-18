import raw from "./data/north-court-terrain-patch.json";
export const TERRAIN_PATCH=raw;
type Point=[number,number];
type Triangle={points:Point[];heights:number[];minX:number;maxX:number;minZ:number;maxZ:number;den:number};
const cells=new Map<string,Triangle[]>();
const pointsByCell=new Map<string,Point[][]>();
for(const cell of raw.cells){
  const triangles:Triangle[]=[];
  for(let i=cell.firstIndex;i<cell.firstIndex+cell.indexCount;i+=3){
    const vertices=raw.indices.slice(i,i+3).map(index=>raw.positions.slice(index*3,index*3+3));
    const points=vertices.map(p=>[p[0],p[2]]as Point),[a,b,c]=points;
    triangles.push({points,heights:vertices.map(p=>p[1]),minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minZ:Math.min(...points.map(p=>p[1])),maxZ:Math.max(...points.map(p=>p[1])),den:(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])});
  }
  cells.set(cell.column+":"+cell.row,triangles);
  pointsByCell.set(cell.column+":"+cell.row,triangles.map(triangle=>triangle.points));
}
/** Canonical local triangles replace their original source-grid cells. */
export function terrainPatchCellTriangles(column:number,row:number){return pointsByCell.get(column+":"+row);}
export function terrainPatchIntersects(minX:number,maxX:number,minZ:number,maxZ:number){
  const b=raw.bounds;return minX<b.maxX&&maxX>b.minX&&minZ<b.maxZ&&maxZ>b.minZ;
}
export function terrainPatchHeight(x:number,z:number):number|undefined{
  const b=raw.bounds;if(x<b.minX-1e-8||x>b.maxX+1e-8||z<b.minZ-1e-8||z>b.maxZ+1e-8)return undefined;
  const step=raw.sourceGrid.step;
  const column=Math.min(Math.round((b.maxX-raw.sourceGrid.minX)/step)-1,Math.floor((x-raw.sourceGrid.minX)/step));
  const row=Math.min(Math.round((b.maxZ-raw.sourceGrid.minZ)/step)-1,Math.floor((z-raw.sourceGrid.minZ)/step));
  for(const t of cells.get(column+":"+row)??[]){
    if(x<t.minX-1e-8||x>t.maxX+1e-8||z<t.minZ-1e-8||z>t.maxZ+1e-8)continue;
    const[a,b,c]=t.points,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(z-c[1]))/t.den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(z-c[1]))/t.den,w=1-u-v;
    if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7)return u*t.heights[0]+v*t.heights[1]+w*t.heights[2];
  }
  return undefined;
}
