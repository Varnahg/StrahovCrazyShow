import {createServer} from 'node:http';
const script = `
const output = document.querySelector('#profiler-probe');
const result = {url: location.href, userAgent: navigator.userAgent, available: typeof window.Profiler === 'function'};
let profiler;
try {
  profiler = new window.Profiler({sampleInterval:16, maxBufferSize:64});
  result.actualInterval = profiler.sampleInterval;
  const start = performance.now();
  function qaProbeBusyWork() { let n=0; while(performance.now()-start<220) n+=Math.sqrt(n+1); return n; }
  result.work = qaProbeBusyWork();
  result.trace = await profiler.stop();
  result.samples = result.trace.samples.length;
  result.stopped = profiler.stopped;
} catch(error) { result.error = {name:error.name, message:error.message}; }
output.textContent = JSON.stringify(result, null, 2);
`;
const server=createServer((req,res)=>{
  if(!['/enabled','/disabled'].includes(req.url)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/enabled')res.setHeader('Document-Policy','js-profiling');
  res.end('<!doctype html><meta charset="utf-8"><title>QA CPU profiler — '+req.url+'</title><h1>Ověření standardního CPU profileru</h1><pre id="profiler-probe">Probíhá kontrola…</pre><script type="module">'+script+'</script>');
});
server.listen(4200,'127.0.0.1',()=>console.log('QA profiler probe: http://127.0.0.1:4200/enabled'));
process.on('SIGINT',()=>server.close(()=>process.exit()));
