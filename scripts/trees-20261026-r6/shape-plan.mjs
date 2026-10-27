/** Pure rigid subtree transforms. No filesystem IO or implicit source loading. */
const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const mul = (a,s) => a.map(v => v*s);
const dot = (a,b) => a.reduce((n,v,i) => n+v*b[i],0);
const unit = a => { const n=Math.hypot(...a); if(n<1e-12) throw Error('Degenerate direction'); return mul(a,1/n); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const applyRotation = (r,p) => r.map(row => dot(row,p));
export const applyTransform = (transform,p) => add(applyRotation(transform.rotation,sub(p,transform.sourceAnchor)),transform.targetAnchor);
const matrixProduct = (a,b) => a.map(row => [0,1,2].map(i=>dot(row,b.map(r=>r[i]))));
const rotation = (axis,degrees) => {
  const [x,y,z]=unit(axis), t=degrees*Math.PI/180,c=Math.cos(t),s=Math.sin(t),d=1-c;
  return [[c+x*x*d,x*y*d-z*s,x*z*d+y*s],[y*x*d+z*s,c+y*y*d,y*z*d-x*s],[z*x*d-y*s,z*y*d+x*s,c+z*z*d]];
};
export function sample(branch,t) {
  if(!Number.isFinite(t)||t<0||t>1||branch.points.length<2) throw Error('Invalid branch sample');
  const p=t*(branch.points.length-1),i=Math.min(Math.floor(p),branch.points.length-2),f=p-i;
  return add(mul(branch.points[i],1-f),mul(branch.points[i+1],f));
}

export const B5_BRANCH3_EDITS = Object.freeze([
  {id:1473,t:.16,yaw:-18,elevation:35,group:1},
  {id:1534,t:.19,yaw:22,elevation:23,group:1},
  {id:1595,t:.24,yaw:-30,elevation:32,group:1},
  {id:1656,t:.48,yaw:28,elevation:42,group:2},
  {id:1717,t:.52,yaw:-20,elevation:28,group:2},
  {id:1778,t:.57,yaw:15,elevation:39,group:2},
  {id:1839,t:.61,yaw:-28,elevation:18,group:2},
  {id:1900,t:.80,yaw:24,elevation:29,group:3},
  {id:1961,t:.83,yaw:-26,elevation:40,group:3},
  {id:2022,t:.87,yaw:18,elevation:16,group:3},
  {id:2083,t:.91,yaw:-22,elevation:26,group:3},
  {id:2144,t:.94,yaw:32,elevation:35,group:3},
]);

export function buildShapePlan(branches,parentId,edits) {
  const byId=new Map(branches.map(b=>[b.id,b]));
  if(byId.size!==branches.length) throw Error('Duplicate branch ID');
  for(const b of branches) {
    if(!Array.isArray(b.points)||b.points.length<2||b.points.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v)))) throw Error('Invalid points');
    let cursor=b;const seen=new Set();
    while(cursor.parent!==null){if(seen.has(cursor.id))throw Error('Branch cycle');seen.add(cursor.id);cursor=byId.get(cursor.parent);if(!cursor)throw Error('Missing parent');}
  }
  const parent=byId.get(parentId);if(!parent)throw Error('Missing selected parent');
  const children=branches.filter(b=>b.parent===parentId);
  if(new Set(edits.map(e=>e.id)).size!==edits.length||children.length!==edits.length||edits.some(e=>byId.get(e.id)?.parent!==parentId)) throw Error('Edits must cover exactly the selected direct children');
  const transforms=edits.map(edit=>{
    if(!Number.isFinite(edit.yaw)||!Number.isFinite(edit.elevation)||Math.abs(edit.elevation)>80)throw Error('Invalid rotation');
    const branch=byId.get(edit.id),sourceAnchor=sample(parent,branch.attachmentT),targetAnchor=sample(parent,edit.t);
    if(Math.hypot(...sub(sourceAnchor,branch.points[0]))>1e-8)throw Error('Detached source child');
    const yaw=rotation([0,0,1],edit.yaw);
    const direction=applyRotation(yaw,sub(branch.points.at(-1),branch.points[0]));
    const tilt=rotation([direction[1],-direction[0],0],edit.elevation);
    return {...edit,sourceT:branch.attachmentT,sourceAnchor,targetAnchor,rotation:matrixProduct(tilt,yaw),branchIds:[]};
  });
  const transformByRoot=new Map(transforms.map(t=>[t.id,t]));
  for(const branch of branches){let cursor=branch;while(cursor.parent!==null&&cursor.parent!==parentId)cursor=byId.get(cursor.parent);const t=transformByRoot.get(cursor.id);if(t)t.branchIds.push(branch.id);}
  for(const t of transforms)t.branchIds.sort((a,b)=>a-b);
  return {version:1,parentId,interpretation:'Three irregular authored groups; not a botanical measurement',coordinateSpace:'root-local Blender Z-up',transforms};
}

/** Closest segment points, including zero-length and parallel segments. */
export function segmentDistance(a,b,c,d) {
  const u=sub(b,a),v=sub(d,c),w=sub(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w);
  const clamp=x=>Math.max(0,Math.min(1,x));
  let s=0,t=0;
  if(aa<=1e-20)t=cc<=1e-20?0:clamp(ee/cc);
  else if(cc<=1e-20)s=clamp(-dd/aa);
  else {const den=aa*cc-bb*bb;s=den>1e-20?clamp((bb*ee-cc*dd)/den):0;t=(bb*s+ee)/cc;
    if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}}
  return {distance:Math.hypot(...sub(add(a,mul(u,s)),add(c,mul(v,t)))),s,t};
}
