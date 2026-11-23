const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const source=fs.readFileSync(path.join(__dirname,'..','audio-capture.js'),'utf8');

function context(options={}){
  const events=new Map(), graphs=[];
  class Buffer {
    constructor(length,rate){this.length=length;this.sampleRate=rate;this.numberOfChannels=1;this.data=new Float32Array(length);this.reads=0;}
    getChannelData(){if(options.changedRead&&this.reads++===1)this.data[0]=1;return this.data;}
    copyFromChannel(out){out.set(this.data);}
  }
  function node(){return {connect(){},start(){},frequency:{value:0},setPeriodicWave(wave){this.wave=wave;}};}
  class Offline {
    constructor(channels,length,rate){this.length=length;this.sampleRate=rate;this.state='suspended';this.destination={};graphs.push(this);}
    createOscillator(){this.osc=node();return this.osc;}
    createBuffer(channels,length,rate){this.input=new Buffer(length,rate);return this.input;}
    createBufferSource(){return node();}
    createPeriodicWave(real,imag,settings){return {real:Array.from(real),imag:Array.from(imag),settings};}
    createDynamicsCompressor(){this.comp={connect(){}};for(const k of ['threshold','knee','ratio','attack','release'])this.comp[k]={value:99};return this.comp;}
    async startRendering(){
      if(options.failFirst&&graphs.indexOf(this)===0)throw new Error('render failed');
      const data=new Buffer(this.length,this.sampleRate);
      for(let i=0;i<data.length;i++)data.data[i]=(i%32-16)/32;
      data.data[0]=-0;this.state='closed';return data;
    }
  }
  class Live {constructor(){this.sampleRate=48000;this.baseLatency=options.noLatency?undefined:128/48000;this.state='suspended';}async close(){}}
  const c={console,TextEncoder,Float32Array,Uint8Array,Uint32Array,DataView,Map,Date,Math,Array,JSON,Number,
    btoa:s=>BufferFrom(s,'binary').toString('base64'),setTimeout:()=>1,clearTimeout:()=>{},
    performance:{now:()=>10,timeOrigin:1},location:{origin:'https://example.test',pathname:'/detect.html'},
    navigator:{userAgent:'test Safari',vendor:'Apple Computer, Inc.',platform:'iPhone',languages:['zh-CN'],standalone:true},
    document:{hidden:false,addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)},
    OfflineAudioContext:Offline,AudioContext:Live,AudioBuffer:Buffer,BaseAudioContext:Offline,
    ApplePayError:Error,CSSPrimitiveValue:{},Counter:{},RGBColor:{},WebKitMediaKeys:{},
    HTMLButtonElement:class{},CSSCounterStyleRule:{},CSS:{supports:()=>true}};
  c.HTMLButtonElement.prototype.popover='';c.window=c;
  if(options.gzip)Object.assign(c,{CompressionStream,Blob,Response});
  vm.createContext(c);vm.runInContext(source,c);return {c,graphs,events};
}
const BufferFrom=(...args)=>global.Buffer.from(...args);
const device={model:'iPhone12,1',osVersion:'26.3.1',osBuild:'test-build',role:'physical',source:'user'};
async function capture(options={}){
  const setup=context(options);
  const record=await setup.c.CollectLabAudio.collect(device,{sourceSha256:'a'.repeat(64),onProgress:options.onProgress&&((...a)=>options.onProgress(setup,...a))});
  return {...setup,record};
}

test('page references the exact audio source bytes',()=>{
  const sha=crypto.createHash('sha256').update(source).digest('hex');
  const html=fs.readFileSync(path.join(__dirname,'..','detect.html'),'utf8');
  assert(html.includes("var audioSourceSHA='"+sha+"'"));assert(html.includes('audio-capture.js?v='+sha.slice(0,16)));
});
test('capture keeps all 55 repetitions and lossless deduplicated Float32 data',async()=>{
  const {record,graphs,events}=await capture();
  assert.equal(record.complete,true);assert.equal(record.shots.length,55);assert.equal(graphs.length,55);assert.equal(events.size,0);
  assert.equal(record.cases.length,11);assert.equal(record.buffers.length,4);
  assert(record.shots.every(s=>s.readbackStable&&s.copyFromChannelEqual&&s.sumText===String(s.sum)));
  const first=record.buffers.find(b=>b.id===record.shots[0].bufferId),raw=BufferFrom(first.data,'base64');
  assert.equal(raw.length,20000);assert.equal(raw.readUInt32LE(0),0x80000000);
  assert.equal(record.engineRule.componentValue,record.shots.find(s=>s.name==='fingerprint').sum);
  assert.equal(graphs[3].osc.type,'triangle');assert.equal(graphs[3].osc.frequency.value,10000);
  assert.equal(graphs[3].comp.threshold.value,-50);assert.equal(graphs[3].comp.release.value,.25);
  assert.equal(graphs[7].osc.wave.real.length,32);assert.equal(graphs[7].osc.wave.settings.disableNormalization,false);
  assert.equal(graphs[8].osc.wave.settings.disableNormalization,true);assert.equal(graphs[10].sampleRate,48000);
});
test('failed rendering and inconsistent repeated reads remain failures with evidence',async()=>{
  const failed=await capture({failFirst:true});assert.equal(failed.record.complete,false);assert.equal(failed.record.shots[0].status,'error');assert.equal(failed.record.shots.length,55);
  const changed=await capture({changedRead:true});assert.equal(changed.record.complete,false);
  assert(changed.record.shots.some(s=>s.bufferId!==s.rereadBufferId));assert(changed.record.buffers.length>4);
  const missing=await capture({noLatency:true});assert.equal(missing.record.complete,false);
  assert(missing.record.errors.some(e=>e.stage==='AudioContext.baseLatency'));
});
test('backgrounding stops remaining samples and preserves a diagnosable partial capture',async()=>{
  const {record,events}=await capture({onProgress(setup,done){if(done===1){setup.c.document.hidden=true;setup.events.get('visibilitychange')();}}});
  assert.equal(record.complete,false);assert.equal(record.shots.length,1);assert(record.errors.some(e=>e.stage==='visibility'));assert.equal(events.size,0);
});
test('R2 gzip transport round trips Unicode with the raw length and CRC, R1 still works',async()=>{
  const {c}=context({gzip:true});const record={captureId:'audio-unicode',kind:'audio-capture',text:'手机😀'.repeat(5000)};
  const chunks=await c.CollectLabAudio.encodeChunks(record),parts=[];
  for(const chunk of chunks.slice().reverse()){
    assert(global.Buffer.byteLength(chunk)<4096);const [head,body]=chunk.split('\n'),f=head.split(' ');assert.equal(f[0],'R2');assert.equal(f.length,7);
    assert.equal(+f[5],global.Buffer.byteLength(JSON.stringify(record)));parts[+f[2]]=body;
  }
  const unpacked=zlib.gunzipSync(BufferFrom(parts.join(''),'base64'));
  assert.equal(unpacked.toString(),JSON.stringify(record));assert.equal(chunks[0].split('\n')[0].split(' ')[6],c.CollectLabAudio.crc32(unpacked));
  const plain=context().c;assert((await plain.CollectLabAudio.encodeChunks(record)).every(x=>x.startsWith('R1 ')));
});

// Used by the Python codec regression fixture generator; no network or device API.
module.exports={capture,context};
