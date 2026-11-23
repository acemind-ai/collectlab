(function (g) {
  'use strict';
  const VERSION = 'audio-v1';
  const FRAMES = 5000, REPEATS = 5;
  const compressor = {threshold: -50, knee: 40, ratio: 12, attack: 0, release: 0.25};
  const plan = [
    {name:'buffer-direct', source:'buffer', sampleRate:44100},
    {name:'buffer-compressor', source:'buffer', sampleRate:44100, compressor:true},
    {name:'triangle-10000', source:'oscillator', type:'triangle', frequency:10000, sampleRate:44100},
    {name:'fingerprint', source:'oscillator', type:'triangle', frequency:10000, sampleRate:44100, compressor:true},
    {name:'triangle-440', source:'oscillator', type:'triangle', frequency:440, sampleRate:44100},
    {name:'triangle-3000', source:'oscillator', type:'triangle', frequency:3000, sampleRate:44100},
    {name:'sine-997', source:'oscillator', type:'sine', frequency:997, sampleRate:44100},
    {name:'custom-normalized', source:'custom', frequency:440, sampleRate:44100, disableNormalization:false},
    {name:'custom-unnormalized', source:'custom', frequency:440, sampleRate:44100, disableNormalization:true},
    {name:'triangle-48000', source:'oscillator', type:'triangle', frequency:10000, sampleRate:48000},
    {name:'fingerprint-48000', source:'oscillator', type:'triangle', frequency:10000, sampleRate:48000, compressor:true}
  ].map(p => Object.assign({frames:FRAMES, channels:1, sumFrom:4500, sumTo:5000}, p));

  function crc32(bytes) {
    let crc=0xffffffff;
    for (const byte of bytes) {
      crc^=byte;
      for (let j=0;j<8;j++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0');
  }
  function b64(bytes) {
    let text='';
    for (let i=0;i<bytes.length;i+=8192) text+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
    return g.btoa(text);
  }
  function pcmBytes(samples) {
    const little=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
    const input=new DataView(samples.buffer,samples.byteOffset,samples.byteLength);
    const bytes=new Uint8Array(samples.length*4), output=new DataView(bytes.buffer);
    for (let i=0;i<samples.length;i++) output.setUint32(i*4,input.getUint32(i*4,little),true);
    return bytes;
  }
  function nativeChecks() {
    const checks={};
    const items=[['OfflineAudioContext',g.OfflineAudioContext||g.webkitOfflineAudioContext],
      ['getChannelData',g.AudioBuffer&&g.AudioBuffer.prototype.getChannelData],
      ['copyFromChannel',g.AudioBuffer&&g.AudioBuffer.prototype.copyFromChannel]];
    const base=g.BaseAudioContext&&g.BaseAudioContext.prototype;
    for (const name of ['createOscillator','createDynamicsCompressor','createPeriodicWave']) items.push([name,base&&base[name]]);
    for (const [name,fn] of items) checks[name]={available:typeof fn==='function',native:typeof fn==='function'&&Function.prototype.toString.call(fn).includes('[native code]')};
    return checks;
  }
  function engineRule() {
    const count=x=>x.filter(Boolean).length, nav=g.navigator;
    const webkit=count(['ApplePayError' in g,'CSSPrimitiveValue' in g,'Counter' in g,
      String(nav.vendor||'').indexOf('Apple')===0,'RGBColor' in g,'WebKitMediaKeys' in g])>=4;
    const css=g.CSS, button=g.HTMLButtonElement;
    const recent=count([!('getStorageUpdates' in nav),button&&'popover' in button.prototype,
      'CSSCounterStyleRule' in g,css&&css.supports('font-size-adjust: ex-height 0.5'),
      css&&css.supports('text-transform: full-width')])>=4;
    const safari=/^function\s.*?\{\s*\[native code]\s*}$/.test(String(g.print))&&String(g.browser)==='[object WebPageNamespace]';
    return {version:'FingerprintJS 4.5.1',scope:'iOS branch predicates and measured graph; not a running game cache',
      webkit:webkit,recent:recent,safari:safari,skipsAudio:webkit&&recent&&safari};
  }
  function renderAudio(context) {
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,buffer)=>{
        if(settled)return;settled=true;g.clearTimeout(timer);context.oncomplete=null;
        if(error)reject(error);else resolve(buffer);
      };
      const timer=g.setTimeout(()=>finish(new Error('OfflineAudioContext timeout')),6000);
      context.oncomplete=event=>finish(null,event.renderedBuffer);
      try {
        const pending=context.startRendering();
        if(pending&&typeof pending.then==='function')pending.then(buffer=>finish(null,buffer),error=>finish(error));
      } catch(error) { finish(error); }
    });
  }

  async function collect(device, options) {
    options=options||{};
    const start=g.performance.now(), nav=g.navigator, doc=g.document;
    const record={kind:'audio-capture',schema:1,captureId:'audio-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
      tag:options.tag||'audio',startedAt:new Date().toISOString(),finishedAt:null,device:device,
      collector:{version:VERSION,sourceSha256:options.sourceSha256||null,gameEngineSha256:'4ebf7046747728f139306b32568066e0b9d309d1d68287ddf56405d3bdc0269f'},
      environment:{ua:nav.userAgent,platform:nav.platform,languages:Array.from(nav.languages||[]),
        standalone:nav.standalone===true,browserObject:String(g.browser),documentHidden:doc.hidden,
        origin:g.location.origin,path:g.location.pathname,timeOrigin:g.performance.timeOrigin,
        samplingState:'same-page; new OfflineAudioContext for every shot; not WebContent cold starts'},
      cases:JSON.parse(JSON.stringify(plan)),expectedShots:{},inputs:{},buffers:[],shots:[],errors:[],
      nativeChecks:nativeChecks(),engineRule:engineRule(),visibilityChanges:[]};
    const seen=new Map();
    function remember(samples) {
      const bytes=pcmBytes(samples), data=b64(bytes);
      if(seen.has(data))return seen.get(data);
      const id='pcm-'+record.buffers.length;
      record.buffers.push({id:id,format:'f32le-base64',length:samples.length,byteLength:bytes.length,crc32:crc32(bytes),data:data});
      seen.set(data,id);return id;
    }
    function error(stage,e,n) {record.errors.push({stage:stage,n:n||null,name:e.name||'Error',message:String(e.message||e).slice(0,300)});}
    const real=new Float32Array(32), imag=new Float32Array(32);
    let seed=31337;
    for(const values of [real,imag])for(let i=1;i<values.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;values[i]=((seed>>>16)-32768)/32768;
    }
    record.inputs.custom={generator:'lcg32-v1',seed:31337,realBufferId:remember(real),imagBufferId:remember(imag)};
    const fixed=new Float32Array(FRAMES);
    for(let i=0;i<fixed.length;i++)fixed[i]=((i%32)-16)/16;
    record.inputs.buffer={generator:'ramp32-v1',bufferId:remember(fixed)};
    record.compressor=Object.assign({},compressor);
    for(const spec of plan)record.expectedShots[spec.name]=REPEATS;
    const onVisibility=()=>record.visibilityChanges.push({ms:g.performance.now()-start,hidden:doc.hidden});
    doc.addEventListener('visibilitychange',onVisibility);
    try {
      let live;
      try {
        const AC=g.AudioContext||g.webkitAudioContext;live=new AC();
        if(!Number.isFinite(live.sampleRate)||live.sampleRate<=0||typeof live.state!=='string'||!live.state)throw new Error('AudioContext sampleRate or state unavailable');
        record.audioContext={sampleRate:live.sampleRate,baseLatency:Number.isFinite(live.baseLatency)&&live.baseLatency>=0?live.baseLatency:null,state:live.state};
        if(record.audioContext.baseLatency===null)error('AudioContext.baseLatency',new Error('baseLatency unavailable'));
      } catch(e) {error('AudioContext',e);record.audioContext={error:String(e.message||e)};}
      finally {if(live&&live.close)try{await live.close();}catch(e){error('AudioContext.close',e);}}
      const OAC=g.OfflineAudioContext||g.webkitOfflineAudioContext;
      rounds:for(let n=1;n<=REPEATS;n++)for(const spec of plan){
        if(doc.hidden){error('visibility',new Error('Page hidden; remaining samples were not run'));break rounds;}
        const shot={name:spec.name,n:n,status:'error',startedMs:g.performance.now()-start,documentHidden:doc.hidden};
        try {
          if(!OAC)throw new Error('OfflineAudioContext unavailable');
          const context=new OAC(1,spec.frames,spec.sampleRate);
          let source;
          if(spec.source==='buffer'){
            const input=context.createBuffer(1,spec.frames,spec.sampleRate);input.getChannelData(0).set(fixed);
            source=context.createBufferSource();source.buffer=input;
          } else {
            source=context.createOscillator();source.frequency.value=spec.frequency;
            if(spec.source==='custom')source.setPeriodicWave(context.createPeriodicWave(real,imag,{disableNormalization:spec.disableNormalization}));
            else source.type=spec.type;
          }
          let end=source;
          if(spec.compressor){
            const node=context.createDynamicsCompressor();
            for(const key of Object.keys(compressor))node[key].value=compressor[key];
            source.connect(node);end=node;
          }
          end.connect(context.destination);source.start(0);
          shot.stateBefore=context.state;
          const rendered=await renderAudio(context);shot.stateAfter=context.state;
          if(rendered.length!==spec.frames||rendered.numberOfChannels!==1||rendered.sampleRate!==spec.sampleRate)throw new Error('Rendered buffer dimensions differ from the plan');
          const data=new Float32Array(rendered.getChannelData(0));
          const again=new Float32Array(rendered.getChannelData(0)), copied=new Float32Array(spec.frames);
          rendered.copyFromChannel(copied,0);
          shot.bufferId=remember(data);shot.rereadBufferId=remember(again);shot.copyBufferId=remember(copied);
          shot.length=data.length;shot.sampleRate=rendered.sampleRate;shot.channels=1;
          shot.readbackStable=shot.bufferId===shot.rereadBufferId;shot.copyFromChannelEqual=shot.bufferId===shot.copyBufferId;
          if(!Array.from(data).every(Number.isFinite))throw new Error('Non-finite PCM sample');
          let sum=0;for(let i=spec.sumFrom;i<spec.sumTo;i++)sum+=Math.abs(data[i]);
          shot.sum=sum;shot.sumText=String(sum);shot.status='ok';
        } catch(e) {shot.error=String(e.message||e).slice(0,300);error(spec.name,e,n);}
        shot.elapsedMs=g.performance.now()-start;shot.documentHiddenAtEnd=doc.hidden;record.shots.push(shot);
        if(options.onProgress)options.onProgress(record.shots.length,plan.length*REPEATS,shot);
      }
    } finally {doc.removeEventListener('visibilitychange',onVisibility);}
    if(record.visibilityChanges.some(e=>e.hidden))error('visibility',new Error('Page entered the background during capture'));
    const raw=record.shots.find(s=>s.name==='fingerprint'&&s.n===1&&s.status==='ok');
    record.engineRule.rawAudio=raw?raw.sum:null;
    record.engineRule.componentValue=record.engineRule.webkit?(record.engineRule.skipsAudio?-4:(raw?raw.sum:null)):null;
    record.complete=record.shots.length===plan.length*REPEATS&&!record.errors.length&&record.shots.every(s=>s.status==='ok'&&s.readbackStable&&s.copyFromChannelEqual&&!s.documentHiddenAtEnd);
    record.finishedAt=new Date().toISOString();record.environment.documentHiddenAtEnd=doc.hidden;
    return record;
  }

  async function encodeChunks(record) {
    const raw=new TextEncoder().encode(JSON.stringify(record));
    if(raw.length>8*1024*1024)throw new Error('采样文件过大，请发送采样文件。');
    let packed=raw, protocol='R1';
    if(typeof g.CompressionStream==='function'&&typeof g.Response==='function'&&typeof g.Blob==='function'){
      try {
        const stream=new g.Blob([raw]).stream().pipeThrough(new g.CompressionStream('gzip'));
        const gzip=new Uint8Array(await new g.Response(stream).arrayBuffer());
        if(gzip.length<raw.length){packed=gzip;protocol='R2';}
      } catch (_) { /* R1 remains a lossless option on browsers without gzip. */ }
    }
    const encoded=b64(packed),size=3072,count=Math.ceil(encoded.length/size),crc=crc32(raw),chunks=[];
    for(let i=0;i<count;i++){
      const fields=[protocol,record.captureId,i,count,encoded.length];
      if(protocol==='R2')fields.push(raw.length);
      fields.push(crc);chunks.push(fields.join(' ')+'\n'+encoded.slice(i*size,(i+1)*size));
    }
    return chunks;
  }
  g.CollectLabAudio={version:VERSION,plan:plan,collect:collect,crc32:crc32,encodeChunks:encodeChunks};
})(globalThis);
