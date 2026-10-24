export const BUFFER_LIMITS=Object.freeze({resources:2048,owners:1024,events:4096,meshHooks:8192,hooks:12288,scope:32,ownerLinks:8});
export const BUFFER_EVENTS=Object.freeze({allocation:0,matrixBefore:1,matrixAfter:2,replacement:3,release:4,destroyBefore:5,destroyReturned:6,destroyThrew:7,deferredBefore:8,deferredReturned:9});
export function bufferTechnicalName(value){
  if(typeof value!=='string'||value.length>96||/avatar|player|student|token|secret|authorization|https?:|@/i.test(value))return null;
  const clean=value.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,'<id>');
  return /^(b6|campus|ground|world|photo|tree|grass|sky|car|vehicle|floor|road|window|wall|lamp|terrain|shadow|street|mesh|m#|default|pbr|__root__|route display|bus)/i.test(clean)&&/^[a-z0-9 _.:#<>/\[\]-]+$/i.test(clean)?clean:null;
}
export function bufferFailureTarget(value){
  if(typeof value!=='string')return null;
  const match=/BabylonWebGPUDevice(\d+)_DataBufferUniqueId=(\d+)[^\r\n"]{0,160}_size(\d+)/.exec(value.slice(0,4000));
  if(!match)return null;const numbers=match.slice(1).map(Number);
  return numbers.every(Number.isSafeInteger)?{engineID:numbers[0],dataBufferID:numbers[1],bytes:numbers[2]}:null;
}
export function validateBufferTrace(value){
  if(!value||value.schemaVersion!==1||value.enabled!==true||typeof value.active!=='boolean'||!Array.isArray(value.resources)||value.resources.length>BUFFER_LIMITS.resources||
    !Array.isArray(value.owners)||value.owners.length>BUFFER_LIMITS.owners||!Array.isArray(value.events)||value.events.length>BUFFER_LIMITS.events||!value.coverage||!value.issues||!value.history)
    throw new Error('Buffer lifecycle shape/bounds');
  const walk=(item,depth=0)=>{
    if(depth>8)throw new Error('Buffer lifecycle depth');
    if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return;
    if(typeof item==='string'&&item.length<=2048)return;
    if(Array.isArray(item)){if(item.length>BUFFER_LIMITS.events)throw new Error('Buffer lifecycle array');for(const row of item)walk(row,depth+1);return;}
    if(item&&Object.getPrototypeOf(item)===Object.prototype&&Object.keys(item).length<=64){for(const field of Object.values(item))walk(field,depth+1);return;}
    throw new Error('Buffer lifecycle scalar export only');
  };
  walk(value);return value;
}
