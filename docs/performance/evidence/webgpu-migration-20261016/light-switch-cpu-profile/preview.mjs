import {readFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const {preview}=await import(pathToFileURL(join(process.cwd(),'node_modules/vite/dist/node/index.js')).href);
const fixture=await readFile(new URL('./weather.json',import.meta.url));
const weather=JSON.stringify({...JSON.parse(fixture),status:'fallback',source:'Řízené testovací počasí · uložený záznam',cloudSource:'Řízený meteorologický model · benchmark',cloudWindSource:'Řízené modelové proudění · benchmark'});
await preview({root:process.cwd(),configFile:false,plugins:[{name:'qa-js-self-profile',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{
 const url=new URL(req.url??'/','http://127.0.0.1:4200');
 if(url.pathname==='/')res.setHeader('Document-Policy','js-profiling');
 if(url.pathname==='/api/weather'){res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(weather);return;}
 next();
});}}],preview:{host:'127.0.0.1',port:4200,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:2595',changeOrigin:false},'/realtime':{target:'http://127.0.0.1:2595',ws:true,rewrite:p=>p.replace(/^\/realtime/,'')}}}});
console.log(JSON.stringify({url:'http://127.0.0.1:4200/?renderBackend=webgpu',apiPort:2595,policy:'js-profiling',fixtureSha256:createHash('sha256').update(fixture).digest('hex')}));
