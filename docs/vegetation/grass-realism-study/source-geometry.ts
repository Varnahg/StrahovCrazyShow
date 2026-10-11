import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {VertexData} from "@babylonjs/core/Meshes/mesh.vertexData";
import {Material} from "@babylonjs/core/Materials/material";
import type {Scene} from "@babylonjs/core/scene";
export type SourceTuft={id:string;positions:number[];normals:number[];uvs:number[];indices:number[];targetExtentMetres:number;triangles:number};
/** One metre-space/UV convention for editable Blender export and browser. */
export function createSourceTuftMesh(scene:Scene,tuft:SourceTuft){
 if(tuft.positions.length!==tuft.normals.length||tuft.uvs.length*3!==tuft.positions.length*2||tuft.indices.length!==tuft.triangles*3)throw Error("Invalid source tuft buffers: "+tuft.id);
 const mesh=new Mesh(tuft.id,scene),data=new VertexData();data.positions=tuft.positions;data.normals=tuft.normals;data.uvs=tuft.uvs;data.indices=tuft.indices;data.applyToMesh(mesh);mesh.sideOrientation=Material.CounterClockWiseSideOrientation;
 return mesh;
}
export function compareSourceTuftAttributes(mesh:Mesh,tuft:SourceTuft){
 const maximumError=(kind:string,expected:number[])=>{const actual=mesh.getVerticesData(kind);if(!actual||actual.length!==expected.length)throw Error("Mismatched original "+kind);let maximum=0;for(let i=0;i<actual.length;i++)maximum=Math.max(maximum,Math.abs(actual[i]-expected[i]));return maximum;};
 return{id:tuft.id,uvMaximumError:maximumError("uv",tuft.uvs),normalMaximumError:maximumError("normal",tuft.normals),sourceTriangles:mesh.getTotalIndices()/3,sideOrientation:mesh.sideOrientation};
}
