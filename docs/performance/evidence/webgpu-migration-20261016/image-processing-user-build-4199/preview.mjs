import { preview } from '../webgpu-hitch-validation-20261017/image-processing-combined-v2/node_modules/vite/dist/node/index.js';
await preview({root:process.cwd(),configFile:false,preview:{host:'127.0.0.1',port:4199,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:2594',changeOrigin:false},'/realtime':{target:'http://127.0.0.1:2594',ws:true,rewrite:path=>path.replace(/^\/realtime/,'')}}}});
console.log('READY http://127.0.0.1:4199/?renderBackend=webgpu');
