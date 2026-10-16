import { preview } from './dependencies/node_modules/vite/dist/node/index.js';
import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
const weatherBytes=await readFile(new URL('../webgpu-comparison/weather.json',import.meta.url));
const weather=JSON.stringify({...JSON.parse(weatherBytes),status:'fallback',source:'Řízené testovací počasí · uložený záznam',cloudSource:'Řízený meteorologický model · benchmark',cloudWindSource:'Řízené modelové proudění · benchmark'});
const log=process.env.STRAHOV_SHADER_REQUEST_LOG;
// External QA fixture only. Frozen source/dist stay immutable; HTML provenance
// explicitly distinguishes this one CSS intervention from production acceptance.
const sourceHtml=await readFile(join(process.cwd(),'dist/index.html'),'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const coverCss='.loading{background:transparent!important}';
const sourceHtmlSha256=hash(sourceHtml);
if(!sourceHtml.includes('</head>'))throw Error('Missing frozen HTML head boundary');
const coverHtml=sourceHtml.replace('</head>',`<style data-loading-cover-probe="transparent">${coverCss}</style></head>`);
const coverLog=log?join(dirname(log),'loading-cover-probe.jsonl'):null;
await preview({root:process.cwd(),configFile:false,plugins:[{name:'controlled-native-gpu-audit',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{
  const url=new URL(req.url??'/', 'http://127.0.0.1:4193');
  if(req.method==='GET' && url.pathname==='/' && url.searchParams.has('loadingCoverProbe')){
    const mode=url.searchParams.get('loadingCoverProbe');
    if(mode!=='opaque' && mode!=='transparent'){res.statusCode=400;res.end('Unknown loading cover probe');return;}
    const html=mode==='transparent'?coverHtml:sourceHtml;
    const record={atUTC:new Date().toISOString(),url:req.url,mode,snapshotId:process.env.STRAHOV_SOURCE_SNAPSHOT_ID,sourceHtmlSha256,servedHtmlSha256:hash(html),cssSha256:mode==='transparent'?hash(coverCss):null,scope:'external CSS diagnostic; unchanged frozen JS and readiness'};
    if(coverLog)void appendFile(coverLog,JSON.stringify(record)+'\n').catch(error=>console.error('Cover audit write failed',error));
    res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(html);return;
  }
  if(log && /\.fx(?:\?|$)/i.test(req.url??''))res.once('finish',()=>{void appendFile(log,JSON.stringify({atUTC:new Date().toISOString(),url:req.url,status:res.statusCode,contentType:res.getHeader('content-type'),contentLength:res.getHeader('content-length')})+'\n').catch(error=>console.error('Shader audit write failed',error));});
  if(req.url!=='/api/weather')return next();res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(weather);
});}}],preview:{host:'127.0.0.1',port:4193,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:2588',changeOrigin:false},'/realtime':{target:'http://127.0.0.1:2588',ws:true,rewrite:path=>path.replace(/^\/realtime/,'')}}}});
console.log(JSON.stringify({url:'http://127.0.0.1:4193/',apiPort:2588,fixtureSha256:createHash('sha256').update(weatherBytes).digest('hex')}));
