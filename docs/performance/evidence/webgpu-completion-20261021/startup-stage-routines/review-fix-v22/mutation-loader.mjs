export async function load(url,context,nextLoad){
  const result=await nextLoad(url,context);
  if(!/\/helper\/v2[12]\/startup-stage-effects\.mjs$/.test(url))return result;
  const source=typeof result.source==='string'?result.source:new TextDecoder().decode(result.source);
  const filter="accepts:(receiver,args)=>index===0?receiver===s.scene:\n      data(receiver,'_scene')===s.scene&&(index!==7||data(args[0],'_scene')===s.scene)";
  if(source.split(filter).length!==2)throw Error('Exact receiver-filter mutation drift');
  console.log('Receiver-filter mutant applied to '+url);
  return{...result,source:source.replace(filter,'accepts:()=>true')};
}
