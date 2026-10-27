/** Pure offline centreline fitting and metric foliage attachment preparation. */
import { dimensions, number, vector } from './catalog.mjs';
const add = (a, b) => a.map((v, i) => v + b[i]);
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map(v => v * s);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = a => { const n = Math.hypot(...a); if (!Number.isFinite(n) || n < 1e-12) throw Error('Degenerate axis direction'); return scale(a, 1/n); };
const identity = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const apply = (matrix, point) => matrix.map(row => dot(row, point));
const multiply = (a, b) => a.map(row => b[0].map((_, j) => row.reduce((n, v, k) => n + v*b[k][j], 0)));
const rotateZ = angle => [[Math.cos(angle), -Math.sin(angle), 0], [Math.sin(angle), Math.cos(angle), 0], [0,0,1]];

/** Axis fitting is affine, so interpolation commutes with the transform and
 * every child remains at its parent's attachmentT. Radii scale independently.
 * Source/target dimensions are soft catalogue estimates, not mesh bounds. */
export function createAxisFit(sourceDimensions, targetDimensions) {
  const source = dimensions(sourceDimensions), target = dimensions(targetDimensions);
  const same = Object.keys(source).every(k => JSON.stringify(source[k]) === JSON.stringify(target[k]));
  const major = target.crownDiameter/source.crownDiameter, height = target.height/source.height;
  const minor = major*target.crownMinorRatio/source.crownMinorRatio;
  // Crown azimuth is in world X/Z; Blender's horizontal Y is world -Z.
  const matrix = same ? identity() : multiply(rotateZ(-target.crownAzimuth), multiply([[major,0,0],[0,minor,0],[0,0,height]], rotateZ(source.crownAzimuth)));
  // Linear shear moves the crown relative to the rooted stem without breaking
  // junction interpolation. At source nominal height it reaches target offset.
  const sourceOffset = [source.crownOffset[0], -source.crownOffset[1], 0];
  const transformedOffset = apply(matrix, sourceOffset);
  if (!same) {
    matrix[0][2] += (target.crownOffset[0]-transformedOffset[0])/source.height;
    matrix[1][2] += (-target.crownOffset[1]-transformedOffset[1])/source.height;
  }
  return { version: 1, coordinateSpace: 'root-local Blender Z-up', source, target, matrix,
    radiusScale: target.trunkRadius/source.trunkRadius, identity: same,
    interpretation: 'relative catalogue-shape fit; leaf offsets must undergo rigid relocation, never this affine matrix' };
}
export function sampleAxis(branch, t) {
  number(t, 'attachment parameter', 0, 1);
  if (!Array.isArray(branch.points) || branch.points.length < 2 || !Array.isArray(branch.radii) || branch.radii.length !== branch.points.length) throw Error('Invalid sampled axis');
  const u = t*(branch.points.length-1), i = Math.min(Math.floor(u), branch.points.length-2), f = u-i;
  vector(branch.points[i], 'sample point'); vector(branch.points[i+1], 'sample point');
  number(branch.radii[i], 'sample radius', 1e-8, 5); number(branch.radii[i+1], 'sample radius', 1e-8, 5);
  return { point: branch.points[i].map((v,k) => v*(1-f)+branch.points[i+1][k]*f),
    tangent: unit(subtract(branch.points[i+1], branch.points[i])), radius: branch.radii[i]*(1-f)+branch.radii[i+1]*f };
}
export function validateAxes(axes) {
  if (!Array.isArray(axes) || !axes.length || axes.length > 100000) throw Error('Invalid axis population');
  const byId = new Map(), roots = [];
  for (const branch of axes) {
    if (!Number.isSafeInteger(branch.id) || branch.id < 0 || byId.has(branch.id) || !Number.isSafeInteger(branch.depth) || branch.depth < 0) throw Error('Invalid axis identity/depth');
    if (!Array.isArray(branch.points) || branch.points.length < 2 || !Array.isArray(branch.radii) || branch.points.length !== branch.radii.length) throw Error('Invalid axis arrays');
    branch.points.forEach(p => vector(p, 'axis point'));
    branch.radii.forEach((r,i) => { number(r, 'axis radius', 1e-8, 5); if (i && r > branch.radii[i-1]+1e-12) throw Error('Increasing branch radius'); });
    for(let i=1;i<branch.points.length;i++) unit(subtract(branch.points[i], branch.points[i-1]));
    number(branch.attachmentT, 'attachment parameter', 0, 1);
    if(branch.parent===null) roots.push(branch); else if(!Number.isSafeInteger(branch.parent)||branch.parent<0) throw Error('Invalid parent identity');
    byId.set(branch.id, branch);
  }
  if(roots.length!==1 || roots[0].depth!==0 || Math.hypot(...roots[0].points[0])>1e-9) throw Error('Expected one rooted axis');
  let maxAttachmentGap = 0;
  for(const branch of axes) if(branch.parent!==null) {
    const parent=byId.get(branch.parent);
    if(!parent || parent.depth+1!==branch.depth) throw Error('Broken hierarchy');
    const gap=Math.hypot(...subtract(sampleAxis(parent,branch.attachmentT).point,branch.points[0]));
    maxAttachmentGap=Math.max(gap,maxAttachmentGap);
    if(gap>1e-8) throw Error('Disconnected child axis');
  }
  const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
  for(const b of axes) for(const p of b.points) p.forEach((v,k)=>{minimum[k]=Math.min(minimum[k],v);maximum[k]=Math.max(maximum[k],v);});
  return { branches:axes.length, rootId:roots[0].id, rootRadius:roots[0].radii[0], maxAttachmentGap, bounds:{minimum,maximum} };
}
export function fitAxes(axes, fit) {
  const before=validateAxes(axes), expected=createAxisFit(fit.source,fit.target);
  if(JSON.stringify(expected)!==JSON.stringify(fit)) throw Error('Invalid axis fit descriptor');
  if(Math.abs(before.rootRadius-fit.source.trunkRadius)>1e-8) throw Error('Source axis/root radius mismatch');
  const transformed=axes.map(b=>({...structuredClone(b),points:b.points.map(p=>fit.identity?[...p]:apply(fit.matrix,p)),radii:b.radii.map(r=>fit.identity?r:r*fit.radiusScale)}));
  const after=validateAxes(transformed);
  if(Math.abs(after.rootRadius-fit.target.trunkRadius)>1e-8) throw Error('Fitted trunk radius mismatch');
  return { axes:transformed, audit:{source:before,fitted:after,physicalLeafOffsetsScaled:false} };
}

/** Proper rigid rotation between tangents, including a deterministic 180° case.
 * Preserves every metric leaf/twig edge and authored roll relative to its axis. */
function tangentRotation(from, to) {
  const a=unit(from),b=unit(to),v=cross(a,b),c=Math.max(-1,Math.min(1,dot(a,b))),s=Math.hypot(...v);
  if(s<1e-12) {
    if(c>0) return identity();
    const basis=Math.abs(a[0])<.8?[1,0,0]:[0,1,0],u=unit(cross(a,basis));
    return u.map((x,i)=>u.map((y,j)=>2*x*y-(i===j?1:0)));
  }
  const u=scale(v,1/s),k=[[0,-u[2],u[1]],[u[2],0,-u[0]],[-u[1],u[0],0]],kk=multiply(k,k);
  return identity().map((row,i)=>row.map((n,j)=>n+s*k[i][j]+(1-c)*kk[i][j]));
}
/** The same attachment parameter and rigid transform must be used for all LOD
 * corners of this component. No atlas UV, source part or rank is regenerated. */
export function relocateLeafComponent(component, sourceAxis, fittedAxis, targetT=component.branchT) {
  if(component.branchId!==sourceAxis.id || sourceAxis.id!==fittedAxis.id) throw Error('Leaf/axis identity mismatch');
  const source=sampleAxis(sourceAxis,component.branchT),target=sampleAxis(fittedAxis,targetT);
  const anchor=vector(component.anchor,'leaf anchor');
  if(Math.hypot(...subtract(anchor,source.point))>1e-8) throw Error('Leaf anchor does not match source axis');
  if(!Array.isArray(component.positions)||component.positions.length<3) throw Error('Invalid component positions');
  const rotation=tangentRotation(source.tangent,target.tangent);
  const unchanged=targetT===component.branchT&&source.point.every((v,i)=>v===target.point[i])&&source.tangent.every((v,i)=>v===target.tangent[i]);
  if(component.normals!==undefined&&(!Array.isArray(component.normals)||component.normals.length!==component.positions.length)) throw Error('Invalid component normals');
  return {...structuredClone(component),branchT:targetT,anchor:[...target.point],
    positions:component.positions.map(p=>{vector(p,'leaf vertex');return unchanged?[...p]:add(target.point,apply(rotation,subtract(p,anchor)));}),
    ...(component.normals===undefined?{}:{normals:component.normals.map(n=>{vector(n,'leaf normal');unit(n);return unchanged?[...n]:apply(rotation,n);})})};
}
/** New target attachments use the existing artistic density limits but sample
 * arc length, rather than depending on how many points describe a branch.
 * This is an authoring plan; surface attachment still needs the tube/BVH audit. */
export function prepareLeafAnchors(axes, family) {
  validateAxes(axes);
  if(family==='reference-bare') return [];
  if(!['deciduous-broadleaf','evergreen-conifer'].includes(family)) throw Error('Unsupported foliage family');
  const broad=family==='deciduous-broadleaf',spacing=broad?.028:.10,minimumDepth=broad?3:2,result=[];
  for(const b of [...axes].sort((a,b)=>a.id-b.id)) {
    if(b.depth<minimumDepth)continue;
    const cumulative=[0];for(let i=1;i<b.points.length;i++)cumulative.push(cumulative.at(-1)+Math.hypot(...subtract(b.points[i],b.points[i-1])));
    const length=cumulative.at(-1),count=Math.max(3,Math.min(22,Math.floor(length/spacing)));
    let groupIndex=0,groupCount=0,minimum,maximum;
    for(let i=0;i<count;i++) {
      const distance=length*(.22+.76*(i+.35)/count);
      let segment=0;while(segment+1<cumulative.length-1&&cumulative[segment+1]<distance)segment++;
      const fraction=(distance-cumulative[segment])/(cumulative[segment+1]-cumulative[segment]);
      const t=(segment+fraction)/(b.points.length-1),sample=sampleAxis(b,t),anchor=sample.point;
      let lo=minimum?minimum.map((v,k)=>Math.min(v,anchor[k])):[...anchor],hi=maximum?maximum.map((v,k)=>Math.max(v,anchor[k])):[...anchor];
      if(broad&&(groupCount===6||Math.hypot(...subtract(hi,lo))>.39)){groupIndex++;groupCount=0;lo=[...anchor];hi=[...anchor];}
      result.push({branchId:b.id,branchT:t,anchor,tangent:sample.tangent,supportRadius:sample.radius,distanceAlongBranchMetres:distance,
        groupKey:[b.id,broad?groupIndex:i],componentOrdinal:i,physicalScalePolicy:broad?'LeafSet024 atlas 0.4m unchanged':'fir photographic twig 0.22–0.35m unchanged'});
      groupCount++;minimum=lo;maximum=hi;
    }
  }
  return result;
}
