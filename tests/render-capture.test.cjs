const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','detect.html'),'utf8');
const source=html.slice(html.indexOf('/* Full rendering evidence.'),html.indexOf('/* ---- 汇总 ---- */'));
function context(extra={}){
  const elements=new Map(), waits=[];
  const c={TextEncoder,URL,AbortController,Map,Date,Math,Array,JSON,console,
    setTimeout:()=>1,clearTimeout:()=>{},tag:'测试-标签',quiet:false,ep:'http://localhost/upload',
    location:{href:'http://localhost/detect.html',protocol:'http:',origin:'http://localhost',pathname:'/detect.html'},
    navigator:{userAgent:'test',platform:'test',languages:['zh-CN'],standalone:false},screen:{width:390,height:844,colorDepth:24},
    devicePixelRatio:3,innerWidth:390,innerHeight:844,outerWidth:390,outerHeight:844,inject:'',
    performance:{now:()=>1,timeOrigin:0,getEntriesByType:()=>[]},matchMedia:()=>({matches:false}),snap:{profile:{hwConcurrency:4}},
    document:{hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,value:''});return elements.get(id);}},
    bytesB64:bytes=>Buffer.from(bytes).toString('base64'),sleep:async ms=>{waits.push(ms);},...extra};
  c.window=c;vm.createContext(c);vm.runInContext(source,c);c.elements=elements;c.waits=waits;return c;
}
function record(){return {captureId:'render-unicode',kind:'render-capture',schema:1,tag:'手机远程😀',data:'漢字'.repeat(4000)};}
test('ASCII transport preserves Unicode exactly, including reversed fragments',()=>{
  const c=context(),r=record(),chunks=c.renderChunks(r);
  assert.equal(c.renderCRC32(new TextEncoder().encode('123456789')),'cbf43926');
  assert(chunks.length>2);const parts=[];
  for(const chunk of chunks.slice().reverse()){
    assert(Buffer.byteLength(chunk)<4096);assert(/^[\x00-\x7f]+$/.test(chunk));
    const [header,body]=chunk.split('\n'),fields=header.split(' ');
    assert.equal(fields[0],'R1');assert.equal(fields[1],r.captureId);assert.equal(+fields[3],chunks.length);
    parts[+fields[2]]=body;
    assert.equal(+fields[4],Buffer.from(JSON.stringify(r)).toString('base64').length);
  }
  assert.equal(Buffer.from(parts.join(''),'base64').toString(),JSON.stringify(r));
});
function gameContext(urls){
  const calls=[],values={width:0,height:0};let n=0;
  const x={rect:(...a)=>calls.push(['rect',...a]),isPointInPath:(...a)=>{calls.push(['point',...a]);return false;},
    fillRect:(...a)=>calls.push(['fillRect',...a]),fillText:(...a)=>calls.push(['text',x.font,x.fillStyle,...a]),
    arc:(...a)=>calls.push(['arc',...a]),beginPath:()=>calls.push(['begin']),closePath:()=>calls.push(['close']),fill:(...a)=>calls.push(['fill',...a])};
  const canvas={getContext:()=>x,toDataURL:()=>{calls.push(['url']);return urls[n++];}};
  ['width','height'].forEach(key=>Object.defineProperty(canvas,key,{get:()=>values[key],set:v=>{values[key]=v;calls.push([key,v]);}}));
  const c=context({document:{createElement:()=>canvas}});return {c,calls};
}
test('original game keeps the canvas reuse, emoji, fonts, winding and two text reads',()=>{
  const {c,calls}=gameContext(['text-png','text-png','geometry-png']);
  const r=c.gameCanvasOriginal(false);assert.equal(r.text,'text-png');assert.equal(r.geometry,'geometry-png');assert.equal(r.winding,true);
  assert.deepEqual(calls.filter(v=>['width','height'].includes(v[0])),[['width',1],['height',1],['width',240],['height',60],['width',122],['height',110]]);
  assert.deepEqual(calls.filter(v=>v[0]==='text'),[['text','11pt "Times New Roman"','#069','Cwm fjordbank gly 😃',2,15],['text','18pt Arial','rgba(102, 204, 0, 0.2)','Cwm fjordbank gly 😃',4,45]]);
  assert.deepEqual(calls.find(v=>v[0]==='point'),['point',5,5,'evenodd']);
  assert.equal(calls.filter(v=>v[0]==='url').length,3);
});
test('unstable text does not become a successful geometry image',()=>{
  const {c,calls}=gameContext(['first','changed']);const r=c.gameCanvasOriginal(false);
  assert.equal(r.text,'unstable');assert.equal(r.geometry,'unstable');assert.equal(calls.filter(v=>v[0]==='arc').length,0);
});
test('model and OS must be declared, and unsupported canvas retains every failed sample',async()=>{
  const c=context();assert.throws(()=>c.renderDeclaration(),/机型/);
  c.document.createElement=()=>({getContext:()=>null});
  c.Image=class {set src(value){queueMicrotask(()=>this.onload());}};
  const r=await c.collectRendering({model:'iPhone12,1',osVersion:'26.3.1',source:'user'});
  assert.equal(r.shots.length,100);assert.equal(Object.values(r.expectedShots).reduce((a,b)=>a+b,0),100);
  assert(r.shots.every(s=>s.status==='error'&&s.imageId===null));assert.equal(r.images.length,0);assert(r.errors.length>=100);
  assert.equal(r.shots.filter(s=>s.name==='game-text').length,32);
});
test('noreport forbids remote upload',async()=>{
  let requests=0;const c=context({quiet:true,fetch:async()=>{requests++;return {ok:true};}});c.renderCapture=record();
  await c.uploadRenderingCapture();assert.equal(requests,0);assert.match(c.document.getElementById('capture-status').textContent,/仅导出/);
});
test('upload failure is visible; retry uses the same capture and resumes at the missing slice',async()=>{
  const sent=[];let failing=true;
  const c=context({fetch:async(url,options)=>{sent.push(options.body);return {ok:!(failing&&sent.length===2),status:400,headers:{get:()=>null}};}});
  c.renderCapture=record();await c.uploadRenderingCapture();
  assert.equal(c.renderUpload.next,1);assert.equal(c.renderBusy,false);assert.match(c.document.getElementById('capture-status').textContent,/上传失败/);
  failing=false;await c.uploadRenderingCapture();
  assert.equal(sent[1],sent[2]);assert.equal(c.renderUpload.next,c.renderUpload.chunks.length);
  assert(c.waits.includes(5200));assert.match(c.document.getElementById('capture-status').textContent,/上传完成/);
});
test('429 waits before retry and permanent HTTP errors do not claim success',async()=>{
  let calls=0;const c=context({fetch:async()=>{calls++;return {ok:calls===2,status:429,headers:{get:()=> '1'}};}});
  await c.sendRenderingChunk('http://localhost/upload','R1 sample');assert.equal(calls,2);assert.deepEqual(c.waits,[60000]);
  c.fetch=async()=>({ok:false,status:403});await assert.rejects(c.sendRenderingChunk('http://localhost/upload','x'),/403/);
});

test('invalid upload destination still allows exporting the completed capture',async()=>{
  for(const endpoint of ['http://localhost/upload','javascript:alert(1)']){
    let requests=0;const c=context({ep:endpoint,location:{protocol:'https:',href:'https://example.test/detect.html'},fetch:async()=>{requests++;}});
    c.renderCapture=record();c.renderPhase='ready';await c.uploadRenderingCapture();
    assert.equal(requests,0);assert.equal(c.renderPhase,'retry');assert.equal(c.document.getElementById('capture-save').hidden,false);
    assert.equal(c.renderCapture.captureId,'render-unicode');
  }
});

test('ordinary geolocation and touch reports deferred during upload flush the latest snapshot',()=>{
  const posted=[],c=context({lastReport:'',behaviorSignals:()=>({}),radiusHist:{},touchBuf:[],postReport:body=>posted.push(JSON.parse(body))});
  c.document.characterSet='utf-8';c.document.title='test';c.document.querySelector=()=>null;
  vm.runInContext(html.slice(html.indexOf('function report(){'),html.indexOf('function row(')),c);
  c.renderBusy=true;c.report();c.snap.geoScan={coords_count:25};c.snap.geoDrift=[{acc:5.1}];c.report();
  assert.equal(posted.length,0);assert.equal(c.renderReportPending,true);
  c.renderBusy=false;c.flushRenderingReport();c.flushRenderingReport();
  assert.equal(posted.length,1);assert.equal(posted[0].geoScan.coords_count,25);assert.equal(posted[0].geoDrift[0].acc,5.1);
});
