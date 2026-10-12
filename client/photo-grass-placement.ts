import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BUILDINGS, MAP } from "../shared/world";
import { placementClassifier, sampleHash, LANDCOVER, grassSurface, polygonBounds, surfaceElevation } from "../shared/vegetation";
import { groundHeight, groundNormal } from "../shared/terrain";

export type PhotoGrassTile = { id:string; x:number; z:number; matrices:Float32Array; count:number; minimumY:number; maximumY:number };
/** All locations remain within the existing source-backed grass classification.
 * The 78mm macrogeometry already uses metres; old point.size scaling is forbidden. */
export function createPhotoGrassPlacement(cacheLimit:128|256=128) {
  const classifier=placementClassifier(BUILDINGS,MAP.paths);
  const grassAreas=LANDCOVER.areas.filter(grassSurface),grassBounds=grassAreas.map(area=>polygonBounds(area.points));
  const surfaceOffset=surfaceElevation(grassAreas[0]);
  const matrix=Matrix.Identity(),rotation=Quaternion.Identity(),tilt=Quaternion.Identity(),yaw=Quaternion.Identity();
  const scale=Vector3.One(),up=Vector3.Up(),normal=Vector3.Up(),position=Vector3.Zero();
  const cache=new Map<string,PhotoGrassTile>();
  const footprintAllowed=(x:number,z:number)=>classifier.grass(x,z)&&classifier.grass(x-.08,z-.08)&&classifier.grass(x-.08,z+.08)&&classifier.grass(x+.08,z-.08)&&classifier.grass(x+.08,z+.08);
  return {
    // A conservative bounding-box prefilter cannot exclude a valid strip just
    // because the centre of its one-metre tile lies on an adjacent pavement.
    mayContainGrass:(x:number,z:number)=>grassBounds.some(b=>b.maxX>x&&b.minX<x+1&&b.maxZ>z&&b.minZ<z+1),
    tile(tileX:number,tileZ:number):PhotoGrassTile {
      const id=tileX+":"+tileZ,cached=cache.get(id);if(cached)return cached;
      const seed=Math.imul(tileX,73856093)^Math.imul(tileZ,19349663),points:{x:number;z:number;key:number;seed:number}[]=[];
      for(let i=0;i<169;i++){
        const itemSeed=seed^Math.imul(i+1,83492791),x=tileX+((i%13)+.15+.7*sampleHash(itemSeed))/13,z=tileZ+(Math.floor(i/13)+.15+.7*sampleHash(itemSeed+1))/13;
        if(footprintAllowed(x,z))points.push({x,z,key:sampleHash(itemSeed+2),seed:itemSeed});
      }
      // Prefix thinning is uniform over the tile, not a row-by-row empty stripe.
      points.sort((a,b)=>a.key-b.key);points.length=Math.min(160,points.length);
      const matrices=new Float32Array(points.length*16);let minimumY=Infinity,maximumY=-Infinity;
      for(let i=0;i<points.length;i++){
        const p=points[i],n=groundNormal(p.x,p.z),y=groundHeight(p.x,p.z)+surfaceOffset;
        normal.set(n.x,n.y,n.z);Quaternion.FromUnitVectorsToRef(up,normal,tilt);Quaternion.RotationYawPitchRollToRef(sampleHash(p.seed+3)*Math.PI*2,0,0,yaw);tilt.multiplyToRef(yaw,rotation);
        position.set(p.x-(tileX+.5),y,p.z-(tileZ+.5));Matrix.ComposeToRef(scale,rotation,position,matrix);matrix.copyToArray(matrices,i*16);minimumY=Math.min(minimumY,y);maximumY=Math.max(maximumY,y);
      }
      const value={id,x:tileX+.5,z:tileZ+.5,matrices,count:points.length,minimumY:Number.isFinite(minimumY)?minimumY:groundHeight(tileX+.5,tileZ+.5),maximumY:Number.isFinite(maximumY)?maximumY:groundHeight(tileX+.5,tileZ+.5)};
      cache.set(id,value);if(cache.size>cacheLimit)cache.delete(cache.keys().next().value!);return value;
    },
    classify:footprintAllowed,
    get cacheSize(){return cache.size;},
    dispose(){cache.clear();},
  };
}
