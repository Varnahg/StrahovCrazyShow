/**
 * Run only against a dedicated audit server, never a shared game.
 * node --import tsx docs/optimization-study/evidence/network-benchmark.mts http://127.0.0.1:2568 output.json
 * Creates 1, 8, then 16 temporary bots; sends only movement and leaves all rooms.
 * Counts Colyseus application-message bytes, not Ethernet/IP/TCP/TLS/WS framing.
 */
import { Client, type Room } from '@colyseus/sdk';
import { writeFile } from 'node:fs/promises';

const endpoint = process.argv[2] || 'http://127.0.0.1:2568';
const output = process.argv[3];
if (new URL(endpoint).port === '2567') throw new Error('Use a dedicated audit server, not the standard development port.');
const client = new Client(endpoint);
const pause = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
const quant = (a:number[], p:number) => a.length ? [...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)] : null;
const round = (n:number|null) => n === null ? null : Math.round(n*1000)/1000;
type RecordRow = {id:string; room:Room; seq:number; sent:Map<number,number>; rawLen:number; times:number[]; sizes:number[]; ackAges:number[]; lastAck:number; inputTimes:number[]; sentBytes:number; maxBuffered:number; timer?:ReturnType<typeof setInterval>; recording:boolean};
const records:RecordRow[] = [];
const reset = (r:RecordRow) => Object.assign(r, {times:[],sizes:[],ackAges:[],lastAck:-1,inputTimes:[],sentBytes:0,maxBuffered:0,recording:true});
const result:any = {capturedAt:new Date().toISOString(),endpoint,node:process.version,platform:process.platform,context:'Dedicated server from .cache/optimization-study-snapshot; loopback; development execution; no artificial network latency/loss. Not a browser FPS or Internet RTT test.',metricsNote:'Bytes are binary Colyseus message payloads as exposed by WebSocket message events; transport/IP/TLS overhead excluded. latestAckSampleAge measures send-to-observation of newest ack in a received motion message, not ping RTT or end-to-end input-to-photon latency. Server acknowledges latest input state, not a replayable queue.',stages:[]};
result.initialHealth = await (await fetch(endpoint+'/api/health')).json();
if (result.initialHealth.online !== 0) throw new Error('Dedicated server must start empty.');
try {
  for (const count of [1,8,16]) {
    while (records.length < count) {
      const response = await fetch(endpoint+'/api/session', {method:'POST',body:JSON.stringify({mode:'multiplayer',profile:{nickname:'audit-net-'+records.length}})});
      if (!response.ok) throw new Error('Session HTTP '+response.status);
      const session = await response.json();
      const room = await client.joinById(session.worldId,{token:session.token});
      const r = {id:session.id,room,seq:0,sent:new Map(),rawLen:0,recording:false} as RecordRow;
      reset(r); r.recording=false; records.push(r);
      room.onMessage('*',()=>{});
      const conn = (room as any).connection;
      const original = conn.events.onmessage;
      conn.events.onmessage = (event:any) => {r.rawLen=event.data.byteLength;original(event);};
      const originalSend = conn.send.bind(conn);
      conn.send = (data:any) => {if(r.recording)r.sentBytes+=data.byteLength;originalSend(data);};
      room.onMessage('motion',(rows:any[])=>{
        if (!r.recording) return;
        const now=performance.now();r.times.push(now);r.sizes.push(r.rawLen);
        const ack=rows.find(row=>row[0]===r.id)?.[6];
        if (ack!==r.lastAck&&r.sent.has(ack)){r.ackAges.push(now-r.sent.get(ack)!);r.lastAck=ack;}
      });
      r.timer=setInterval(()=>{
        const seq=++r.seq, now=performance.now(); r.sent.set(seq,now);
        if(r.recording)r.inputTimes.push(now);
        room.send('input',{x:Math.floor(seq/60)%2?-.5:.5,z:0,yaw:0,jump:false,seq});
        if(r.recording)r.maxBuffered=Math.max(r.maxBuffered,conn.transport.ws.bufferedAmount||0);
        if(r.sent.size>300)r.sent.delete(seq-300);
      },1000/30);
    }
    await pause(1000); records.forEach(reset);
    const start=performance.now();await pause(6000);const elapsed=performance.now()-start;
    records.forEach(r=>r.recording=false);
    const r=records[0],gaps=r.times.slice(1).map((time,i)=>time-r.times[i]);
    const inputGaps=r.inputTimes.slice(1).map((time,i)=>time-r.inputTimes[i]);
    const stage={clients:count,durationMs:round(elapsed),motionSamples:r.times.length,motionHz:round(r.times.length/(elapsed/1000)),motionGapMedianMs:round(quant(gaps,.5)),motionGapP95Ms:round(quant(gaps,.95)),motionGapMaxMs:round(Math.max(...gaps)),bytesPerMotionMedian:quant(r.sizes,.5),monitorDownKBps:round(r.sizes.reduce((a,b)=>a+b,0)/(elapsed/1000)/1000),aggregateMotionDownKBps:round(records.reduce((sum,row)=>sum+row.sizes.reduce((a,b)=>a+b,0),0)/(elapsed/1000)/1000),monitorInputHz:round(r.inputTimes.length/(elapsed/1000)),monitorInputGapMedianMs:round(quant(inputGaps,.5)),monitorUpKBps:round(r.sentBytes/(elapsed/1000)/1000),monitorBufferedBytesMax:r.maxBuffered,latestAckSampleAgeMedianMs:round(quant(r.ackAges,.5)),latestAckSampleAgeP95Ms:round(quant(r.ackAges,.95))};
    result.stages.push(stage);console.log(JSON.stringify(stage));
  }
} finally {
  for (const r of records) clearInterval(r.timer);
  await Promise.all(records.map(r=>r.room.leave()));
  result.finalHealth=await(await fetch(endpoint+'/api/health')).json();
  if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');
}
