import asyncio, gzip, json, os, signal, subprocess, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

root=Path(__file__).resolve().parents[4]
source=Path(sys.argv[1]).resolve(); label=sys.argv[2]
out=root/'docs/performance/evidence/fps-drops-20261013'
logs=root/'.cache/fps-drops'
logs.mkdir(parents=True, exist_ok=True)
processes=[]; handles=[]
async def main():
 for port in [2570,4175]:
  import socket
  sock=socket.socket(); code=sock.connect_ex(('127.0.0.1',port));sock.close()
  if code==0: raise RuntimeError(f'Port {port} already owned')
 for name,args,env in [('server',['node','--import','tsx','server/index.ts'],dict(os.environ,PORT='2570')),('preview',['node','scripts/performance-preview.mjs'],dict(os.environ))]:
  handle=(logs/f'{label}-{name}.log').open('w');handles.append(handle)
  processes.append(subprocess.Popen(args,cwd=source,env=env,stdout=handle,stderr=subprocess.STDOUT,start_new_session=True))
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  context=await browser.new_context(viewport={'width':960,'height':720},locale='cs-CZ')
  page=await context.new_page();errors=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  await page.add_init_script('''(() => {localStorage.setItem('strahov.locale','cs');localStorage.setItem('strahov.rendering',JSON.stringify({mode:'low',targetFps:30}));
   window.__audit={stages:[],programs:0,shaderCompiles:0,longTasks:[]};
   for(const name of ['WebGLRenderingContext','WebGL2RenderingContext']){
    const p=window[name]?.prototype;if(!p)continue;
    for(const [method,key] of [['linkProgram','programs'],['compileShader','shaderCompiles']]){
     const original=p[method];p[method]=function(...args){window.__audit[key]++;return original.apply(this,args)};
    }
   }
   new PerformanceObserver(list=>{for(const e of list.getEntries())window.__audit.longTasks.push({start:e.startTime,ms:e.duration})}).observe({type:'longtask',buffered:true});
  })()''')
  try:
   for attempt in range(30):
    try:
     await page.goto('http://127.0.0.1:4175/',wait_until='domcontentloaded',timeout=60000);break
    except Exception:
     if attempt==29: raise
     await asyncio.sleep(.5)
   await page.get_by_role('button',name='Prohlédnout si Strahov sám',exact=True).click(timeout=60000)
   await page.wait_for_function("document.querySelector('canvas[data-boot-stage=ready]')",timeout=180000)
   await page.wait_for_timeout(3000)
   session=await context.new_cdp_session(page)
   await session.send('Profiler.enable');await session.send('Profiler.setSamplingInterval',{'interval':1000});await session.send('Profiler.start')
   async def mark(name):
    await page.evaluate('name=>{const a=window.__audit;a.stages.push({name,time:performance.now(),programs:a.programs,shaderCompiles:a.shaderCompiles,torch:document.querySelector("canvas[data-boot-stage]")?.dataset.flashlight})}',name)
   await mark('ready-off')
   await page.wait_for_timeout(5000)
   await mark('first-on-request');await page.keyboard.press('f');await page.wait_for_function('document.querySelector("canvas[data-boot-stage]").dataset.flashlight === "true"',timeout=60000)
   await page.wait_for_timeout(5000)
   await mark('first-off-request');await page.keyboard.press('f');await page.wait_for_function('document.querySelector("canvas[data-boot-stage]").dataset.flashlight === "false"',timeout=60000)
   await page.wait_for_timeout(5000)
   await mark('second-on-request');await page.keyboard.press('f');await page.wait_for_function('document.querySelector("canvas[data-boot-stage]").dataset.flashlight === "true"',timeout=60000)
   await page.wait_for_timeout(5000)
   await mark('end')
   profile=(await session.send('Profiler.stop'))['profile']
   with gzip.open(out/f'{label}.cpuprofile.gz','wt') as f: json.dump(profile,f)
   result=await page.evaluate('''() => {const canvas=document.querySelector('canvas[data-boot-stage]');const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const ext=gl?.getExtension('WEBGL_debug_renderer_info');return {...window.__audit,dataset:{...canvas.dataset},renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,canvas:{width:canvas.width,height:canvas.height},body:document.body.innerText.slice(0,1200)}}''')
   result.update(kind='Production application functional trace, software WebGL; not target-GPU FPS',sourceSnapshot=json.loads((source/'source-manifest.json').read_text())['snapshotId'],pageErrors=errors,viewport={'width':960,'height':720},weather='Live unavailable fallback; actual time; lighting trace is observational, not controlled GPU A/B')
   (out/f'{label}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
   try:
    await page.screenshot(path=str(out/f'{label}.png'),timeout=90000)
   except Exception as e: print('Screenshot:',str(e).splitlines()[0])
   if '--movement' in sys.argv[3:]:
    await page.keyboard.down('Shift');await page.keyboard.down('w')
    await page.wait_for_timeout(4000)
    await page.keyboard.up('w');await page.keyboard.up('Shift')
    await page.mouse.move(440,400);await page.mouse.down(button='right')
    await page.mouse.move(680,430,steps=8);await page.mouse.up(button='right')
    await page.wait_for_timeout(3000)
    movement=await page.evaluate('() => ({dataset:{...document.querySelector("canvas[data-boot-stage]").dataset},body:document.body.innerText.slice(0,1200)})')
    movement.update(kind='Production smoke: native Shift+W input for 4s, right-drag camera; no route or FPS assertion',sourceSnapshot=result['sourceSnapshot'],pageErrors=errors)
    (out/f'{label}-movement.json').write_text(json.dumps(movement,ensure_ascii=False,indent=2))
    await page.screenshot(path=str(out/f'{label}-movement.png'),timeout=90000)
   print(json.dumps({k:v for k,v in result.items() if k not in ['longTasks','body']},ensure_ascii=False))
  finally:
   await browser.close()
try:
 asyncio.run(main())
finally:
 for process in processes:
  if process.poll() is None: os.killpg(process.pid,signal.SIGTERM)
 for process in processes:
  try: process.wait(timeout=10)
  except subprocess.TimeoutExpired:
   os.killpg(process.pid,signal.SIGKILL);process.wait()
 for handle in handles:handle.close()
