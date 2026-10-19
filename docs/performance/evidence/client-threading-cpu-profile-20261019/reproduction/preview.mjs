import {join}from'node:path';
import {pathToFileURL}from'node:url';
const{preview}=await import(pathToFileURL(join(process.cwd(),'node_modules/vite/dist/node/index.js')).href);
await preview({root:process.cwd(),configFile:false,plugins:[{name:'owned-qa-js-profile',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{const url=new URL(req.url??'/','http://127.0.0.1:4206');if(url.pathname==='/')res.setHeader('Document-Policy','js-profiling');next();});}}],preview:{host:'127.0.0.1',port:4206,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:2601',changeOrigin:false},'/realtime':{target:'http://127.0.0.1:2601',ws:true,rewrite:p=>p.replace(/^\/realtime/,'')}}}});
console.log('READY http://127.0.0.1:4206/?renderBackend=webgpu&profileEnvironment=1&profileCpu=1');
