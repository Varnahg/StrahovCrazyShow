import{join}from'node:path';import{pathToFileURL}from'node:url';
const{preview}=await import(pathToFileURL(join(process.cwd(),'node_modules/vite/dist/node/index.js')).href);
await preview({root:process.cwd(),configFile:false,preview:{host:'127.0.0.1',port:4201,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:2596',changeOrigin:false},'/realtime':{target:'http://127.0.0.1:2596',ws:true,rewrite:path=>path.replace(/^\/realtime/,'')}}}});
console.log('READY http://127.0.0.1:4201/?renderBackend=webgpu');
