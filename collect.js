/* wepoker-h5 全量采集：环境 / 指纹 / 权限 / 定位 / 网络 / 交互
   对齐 main_bundle.js 的 HMFDeviceFp + GPSController，以及 GeoComply RiskSentry 的字段口径 */
(function () {
  var R = {}, tag = new URLSearchParams(location.search).get('tag') || '?';
  var done = false, t0 = Date.now();
  var out = document.getElementById('o');
  if (!out) { out = document.createElement('pre'); out.id = 'o'; document.body.appendChild(out); }
  out.style.cssText = 'font:12px -apple-system;white-space:pre-wrap;word-break:break-all;padding:8px';
  var paintAt = 0;
  function paint() {
    var now = Date.now();
    if (now - paintAt < 400) return;
    paintAt = now;
    try { out.textContent = JSON.stringify(R, null, 1); } catch (e) {}
  }
  function put(k, v) { R[k] = v; paint(); }
  function murmur3(str, seed) {
    seed = seed || 0; var h = seed >>> 0, k, i = 0, len = str.length;
    while (i < len) {
      k = (str.charCodeAt(i) & 0xff) | ((str.charCodeAt(i + 1) & 0xff) << 8) | ((str.charCodeAt(i + 2) & 0xff) << 16) | ((str.charCodeAt(i + 3) & 0xff) << 24);
      k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
      h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) >>> 0; i += 4;
    }
    k = 0;
    switch (len & 3) {
      case 3: k ^= (str.charCodeAt(i + 2) & 0xff) << 16;
      case 2: k ^= (str.charCodeAt(i + 1) & 0xff) << 8;
      case 1: k ^= str.charCodeAt(i) & 0xff;
        k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593); h ^= k;
    }
    h ^= len; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /* ---------- 1. 环境 ---------- */
  function env() {
    put('standalone', window.navigator.standalone === undefined ? 'undef' : window.navigator.standalone);
    put('displayModeStandalone', matchMedia('(display-mode: standalone)').matches);
    put('displayModeFullscreen', matchMedia('(display-mode: fullscreen)').matches);
    put('inner', innerWidth + 'x' + innerHeight);
    put('outer', outerWidth + 'x' + outerHeight);
    put('screen', screen.width + 'x' + screen.height + '@' + window.devicePixelRatio);
    put('avail', screen.availWidth + 'x' + screen.availHeight);
    put('dpr', window.devicePixelRatio);
    put('isSecureContext', window.isSecureContext);
    put('userAgent', navigator.userAgent);
    put('platform', navigator.platform);
    put('lang', navigator.language);
    put('languages', (navigator.languages || []).join(','));
    try { put('tzName', Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (e) {}
    put('tzOffsetMin', -new Date().getTimezoneOffset());
    put('hwConcurrency', navigator.hardwareConcurrency || null);
    put('maxTouch', navigator.maxTouchPoints || 0);
    put('deviceMemory', navigator.deviceMemory || null);
    try {
      put('colorGamut', matchMedia('(color-gamut: rec2020)').matches ? 'rec2020'
        : matchMedia('(color-gamut: p3)').matches ? 'p3'
        : matchMedia('(color-gamut: srgb)').matches ? 'srgb' : null);
    } catch (e) {}
    try { put('uaCh', navigator.userAgentData ? { platform: navigator.userAgentData.platform, mobile: navigator.userAgentData.mobile } : null); } catch (e) {}
    put('plugins', navigator.plugins ? navigator.plugins.length : 0);
    put('mimeTypes', navigator.mimeTypes ? navigator.mimeTypes.length : 0);
    put('hasWebdriver', !!navigator.webdriver);
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      put('conn', c ? { type: c.type || null, effectiveType: c.effectiveType || null, rtt: c.rtt || null, downlink: c.downlink || null, saveData: !!c.saveData } : null);
    } catch (e) {}
    try { if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (s) { put('storageQuotaMB', Math.round(s.quota / 1048576)); put('storageUsageMB', Math.round(s.usage / 1048576)); }); } catch (e) {}
  }

  /* ---------- 2. 指纹 ---------- */
  var FONT_LIST = ['Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'American Typewriter', 'Andale Mono', 'Apple Color Emoji', 'AppleGothic', 'AppleMyungjo', 'Avenir', 'Avenir Next', 'Baskerville', 'Bodoni 72', 'Bradley Hand', 'Chalkboard', 'Chalkboard SE', 'Cochin', 'Copperplate', 'Courier', 'Courier New', 'Damascus', 'Didot', 'DIN Alternate', 'DIN Condensed', 'Futura', 'Geeza Pro', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Hiragino Sans', 'Hoefler Text', 'Impact', 'Kailasa', 'Kohinoor Telugu', 'Lucida Grande', 'Marker Felt', 'Menlo', 'Mishafi', 'Noteworthy', 'Optima', 'Palatino', 'Papyrus', 'Party LET', 'PingFang SC', 'PingFang TC', 'Rockwell', 'Savoye LET', 'Skia', 'Snell Roundhand', 'STHeiti', 'Symbol', 'Thonburi', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Waseem', 'Zapf Dingbats', 'Microsoft YaHei', 'SimSun', 'Noto Sans CJK SC'];
  function detectFonts() {
    var base = ['monospace', 'serif', 'sans-serif'], sp = document.createElement('span');
    sp.style.cssText = 'position:absolute;left:-9999px;font-size:72px'; sp.textContent = 'mmmmmmmmmmlli';
    document.body.appendChild(sp);
    var bw = {}; base.forEach(function (b) { sp.style.fontFamily = b; bw[b] = sp.offsetWidth; });
    var out = {};
    FONT_LIST.forEach(function (f) {
      for (var i = 0; i < base.length; i++) {
        sp.style.fontFamily = '"' + f + '",' + base[i];
        if (sp.offsetWidth !== bw[base[i]]) { out[f] = 1; return; }
      }
    });
    sp.remove(); return out;
  }
  function fontPreferences() {
    var fams = ['default', 'serif', 'sans-serif', 'monospace', 'fantasy', 'system-ui', '-apple-system', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Menlo', 'PingFang SC'];
    var sp = document.createElement('span');
    sp.style.cssText = 'position:absolute;left:-9999px;font-size:24px;white-space:nowrap';
    sp.textContent = 'mmmmmmmmmmlli WwQq@#123àéü漢字'; document.body.appendChild(sp);
    var r = {}; fams.forEach(function (f) { sp.style.fontFamily = f; r[f] = Math.round(sp.getBoundingClientRect().width * 1000) / 1000; });
    sp.remove(); return r;
  }
  function canvasFp() {
    var c = document.createElement('canvas'); c.width = 300; c.height = 60;
    var x = c.getContext('2d');
    x.textBaseline = 'top'; x.font = "14px 'Arial'"; x.fillStyle = '#f60'; x.fillRect(125, 1, 62, 20);
    x.fillStyle = '#069'; x.fillText('WPK-H5 指纹😀', 2, 15);
    x.fillStyle = 'rgba(102,204,0,0.7)'; x.fillText('WPK-H5 指纹😀', 4, 17);
    var g = x.createLinearGradient(0, 0, 300, 0); g.addColorStop(0, '#a1c4fd'); g.addColorStop(1, '#c2e9fb');
    x.fillStyle = g; x.fillRect(0, 40, 300, 20);
    var url = c.toDataURL(), px = x.getImageData(0, 0, 300, 60).data, sum = 0;
    for (var i = 0; i < px.length; i += 97) sum = (sum + px[i]) % 1e9;
    return { hash: murmur3(url), len: url.length, pxSum: sum };
  }
  function webglFp() {
    try {
      var c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return null;
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      var o = {
        vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION),
        umVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
        umRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxViewport: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || []),
        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxVaryings: gl.getParameter(gl.MAX_VARYING_VECTORS),
        exts: (gl.getSupportedExtensions() || []).slice().sort()
      };
      o.hash = murmur3(JSON.stringify(o.exts) + o.umRenderer + o.maxTexture);
      return o;
    } catch (e) { return { err: e.name }; }
  }
  function audioFp() {
    return new Promise(function (res) {
      try {
        var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!OAC) return res({ err: 'no-OfflineAudioContext' });
        var ctx = new OAC(1, 5000, 44100), osc = ctx.createOscillator();
        osc.type = 'triangle'; osc.frequency.value = 10000;
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12; comp.attack.value = 0; comp.release.value = 0.25;
        osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
        ctx.startRendering().then(function (buf) {
          var d = buf.getChannelData(0), sum = 0;
          for (var i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
          res({ sum: sum, hash: murmur3(sum.toFixed(10)) });
        }).catch(function (e) { res({ err: e.name }); });
      } catch (e) { res({ err: e.name }); }
    });
  }

  /* ---------- 3. 权限 ---------- */
  function perms() {
    put('mediaDevices', !!(navigator.mediaDevices));
    put('getUserMedia', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
    put('gumCalls', 0);
    if (!navigator.permissions) return;
    ['geolocation', 'camera', 'microphone', 'notifications'].forEach(function (n) {
      try {
        navigator.permissions.query({ name: n }).then(function (p) { put('perm_' + n, p.state); })
          .catch(function (e) { put('perm_' + n, 'err:' + e.name); });
      } catch (e) { put('perm_' + n, 'throw'); }
    });
  }

  /* ---------- 4. 定位（对齐游戏：无 options 的 getCurrentPosition + watch 历史） ---------- */
  var history = [], integrity = { samples: 0, timeouts: 0, denied: 0, sameTimestamp: 0 };
  function geoOnce() {
    var t = Date.now();
    try {
      navigator.geolocation.getCurrentPosition(function (p) {
        put('geo', {
          lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy,
          alt: p.coords.altitude, altAcc: p.coords.altitudeAccuracy,
          head: p.coords.heading, speed: p.coords.speed,
          ts: p.timestamp, age: Date.now() - p.timestamp, latencyMs: Date.now() - t
        });
      }, function (e) {
        if (e.code === 1) integrity.denied++; if (e.code === 3) integrity.timeouts++;
        put('geo', 'err:' + e.code + ':' + e.message);
      });
    } catch (e) { put('geo', 'throw:' + e.name); }
  }
  function geoWatch() {
    try {
      var id = navigator.geolocation.watchPosition(function (p) {
        integrity.samples++;
        var last = history[history.length - 1];
        if (last && last.ts === p.timestamp) integrity.sameTimestamp++;
        if (history.length < 30) {
          history.push({
            seq: history.length, ts: p.timestamp, lat: p.coords.latitude, lon: p.coords.longitude,
            acc: p.coords.accuracy, alt: p.coords.altitude, altAcc: p.coords.altitudeAccuracy,
            head: p.coords.heading, speed: p.coords.speed
          });
        }
      }, function (e) {
        if (e.code === 1) integrity.denied++; if (e.code === 3) integrity.timeouts++;
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
      setTimeout(function () { try { navigator.geolocation.clearWatch(id); } catch (e) {} put('locationHistory', history); put('locationIntegrity', integrity); }, 7000);
    } catch (e) { put('locationIntegrity', integrity); }
  }

  /* ---------- 5. 网络 ---------- */
  function getJson(url, ms) {
    return new Promise(function (res, rej) {
      var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms);
      fetch(url, { cache: 'no-store', signal: c.signal })
        .then(function (r) { return r.text(); })
        .then(function (txt) { clearTimeout(t); var j = null; try { j = JSON.parse(txt); } catch (e) { j = { __raw: String(txt).slice(0, 60) }; } res(j); })
        .catch(function (e) { clearTimeout(t); rej(e); });
    });
  }
  function net() {
    var probes = ['https://api64.ipify.org?format=json', 'https://ipwho.is/?fields=ip,city,connection'];
    var chain = Promise.resolve();
    probes.forEach(function (u) {
      chain = chain.then(function () {
        if (R.exitIp && R.exitIp !== '?') return;
        var t = Date.now();
        return getJson(u, 9000).then(function (j) {
          if (j && j.ip) { put('exitIp', j.ip); put('exitSrc', new URL(u).host); put('exitLatencyMs', Date.now() - t); if (j.city) put('exitCity', j.city); }
          else put('exitTry_' + new URL(u).host, j && (j.__raw || JSON.stringify(j).slice(0, 60)));
        }).catch(function (e) { put('exitErr_' + new URL(u).host, (Date.now() - t) + 'ms:' + e.name); });
      });
    });
    chain.then(function () { if (!R.exitIp) put('exitIp', '?'); });
    /* ---- STUN（对齐 GeoComply StunMetrics）---- */
    var STUN_SERVERS = [
      'stun:stun.l.google.com:19302',
      'stun:stun.cloudflare.com:3478'
    ];
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    function probeStun(url, index) {
      return new Promise(function (resolve) {
        var out = { url: url, index: index, stunIp: null, stunIpType: null, port: null,
                    hostIp: null, hostMasked: null, srflxCount: 0, hostCount: 0,
                    rttMs: null, error: null };
        var started = Date.now(), done = false;
        function fin() { if (done) return; done = true; out.rttMs = Date.now() - started; resolve(out); }
        try {
          var pc = new RTCPeerConnection({ iceServers: [{ urls: url }] });
          pc.onicecandidate = function (ev) {
            var c = ev.candidate && ev.candidate.candidate; if (!c) { fin(); return; }
            var mS = / ([\d.]+|[\da-fA-F:]+) (\d+) typ srflx/.exec(c);
            if (mS) {
              out.srflxCount++;
              if (!out.stunIp) {
                out.stunIp = mS[1]; out.port = Number(mS[2]);
                out.stunIpType = mS[1].indexOf(':') >= 0 ? 'v6' : 'v4';
              }
            }
            var mH = / (\S+) (\d+) typ host/.exec(c);
            if (mH) {
              out.hostCount++;
              if (!out.hostIp) {
                out.hostIp = mH[1];
                out.hostMasked = /\.local$/i.test(mH[1]) || /^[\da-f-]+\.local$/i.test(mH[1]);
              }
            }
          };
          pc.createDataChannel('x');
          pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).catch(function (e) { out.error = e.name; fin(); });
          setTimeout(function () { try { pc.close(); } catch (e) {} fin(); }, 6000);
        } catch (e) { out.error = e.name; fin(); }
      });
    }
    (async function () {
      var results = [];
      for (var i = 0; i < STUN_SERVERS.length; i++) results.push(await probeStun(STUN_SERVERS[i], i));
      put('stunMetrics', results);
      var first = results.filter(function (r) { return r.stunIp; })[0];
      put('stunPub', first ? (first.stunIp + ':' + first.port) : 'none');
      put('stunIpType', first ? first.stunIpType : null);
      put('stunHostIp', first ? first.hostIp : null);
      put('stunHostMasked', first ? !!first.hostMasked : null);
      put('stunNetworkType', conn ? (conn.type || conn.effectiveType || null) : null);
      put('stunRttMs', first ? first.rttMs : null);
    })();
    try {
      var t1 = Date.now();
      fetch('/ping-ntp', { cache: 'no-store' }).then(function (r) {
        var d = r.headers.get('date');
        put('ntp', { rttMs: Date.now() - t1, serverDate: d, localDate: new Date().toUTCString(), offsetSec: d ? Math.round((Date.parse(d) - Date.now()) / 1000) : null });
      }).catch(function (e) { put('ntp', 'err:' + e.name); });
    } catch (e) {}
    try {
      if (performance && performance.getEntriesByType) {
        setTimeout(function () {
          put('httpEntries', performance.getEntriesByType('resource').slice(-25).map(function (e) {
            return { url: String(e.name).slice(0, 90), type: e.initiatorType, dur: Math.round(e.duration), dns: Math.round(e.domainLookupEnd - e.domainLookupStart), tcp: Math.round(e.connectEnd - e.connectStart), tls: Math.round(e.secureConnectionStart > 0 ? e.connectEnd - e.secureConnectionStart : 0), ttfb: Math.round(e.responseStart - e.requestStart) };
          }));
        }, 3000);
      }
    } catch (e) {}
  }

  /* ---------- 6. 交互事件（触摸/指针/鼠标） ---------- */
  var evs = [];
  function interaction() {
    var seen = { touchstart: 0, touchmove: 0, touchend: 0, pointerdown: 0, pointermove: 0, pointerup: 0, pointercancel: 0, mousedown: 0, mousemove: 0, mouseup: 0 };
    function rec(type, e, pt, pressure, ptrType) {
      if (evs.length >= 40) return;
      var last = evs[evs.length - 1];
      evs.push({
        type: type, ts: Date.now(), x: pt ? Math.round(pt.clientX) : null, y: pt ? Math.round(pt.clientY) : null,
        dx: last && pt ? Math.round(pt.clientX - last.x) : null, dy: last && pt ? Math.round(pt.clientY - last.y) : null,
        dt: last ? Date.now() - last.ts : null, pointerType: ptrType || null,
        pressure: typeof pressure === 'number' ? pressure : null,
        touches: e.touches ? e.touches.length : null,
        radiusX: e.touches && e.touches[0] && e.touches[0].radiusX || null,
        force: e.touches && e.touches[0] && e.touches[0].force !== undefined ? e.touches[0].force : null,
        isTrusted: e.isTrusted
      });
    }
    function on(type, evt, getter, pressure, ptrType) {
      window.addEventListener(type, function (e) {
        seen[type] = (seen[type] || 0) + 1;
        var pt = getter(e); if (pt) rec(type, e, pt, pressure ? pressure(e) : null, ptrType ? ptrType(e) : null);
      }, { passive: true, capture: true });
    }
    on('touchstart', null, function (e) { return e.changedTouches && e.changedTouches[0]; });
    on('touchmove', null, function (e) { return e.changedTouches && e.changedTouches[0]; });
    on('touchend', null, function (e) { return e.changedTouches && e.changedTouches[0]; });
    on('pointerdown', null, function (e) { return e; }, function (e) { return e.pressure; }, function (e) { return e.pointerType; });
    on('pointermove', null, function (e) { return e; }, function (e) { return e.pressure; }, function (e) { return e.pointerType; });
    on('pointerup', null, function (e) { return e; }, function (e) { return e.pressure; }, function (e) { return e.pointerType; });
    on('mousedown', null, function (e) { return e; });
    on('mousemove', null, function (e) { return e; });
    on('mouseup', null, function (e) { return e; });
    setTimeout(function () { put('interactionCounts', seen); put('interactionEvents', evs); }, 6000);
  }

  /* ---------- 7. 上报 ---------- */
  function finish() {
    if (done) return; done = true;
    put('readyStateMs', Date.now() - t0); paint();
    var endpoint = (function () {
      var q = new URLSearchParams(location.search).get('ep');
      if (q) return q.replace(/\/$/, '');
      return (window.COLLECT_EP || '').replace(/\/$/, '');
    })();
    try { fetch(endpoint + '/r?tag=' + tag, { method: 'POST', body: JSON.stringify(R), cache: 'no-store' }).catch(function () {}); } catch (e) {}
    try { var i = new Image(); i.src = endpoint + '/r?tag=' + encodeURIComponent(tag) + '&d=' + encodeURIComponent(JSON.stringify(R)); } catch (e) {}
  }

  env(); perms(); interaction(); net(); geoOnce(); geoWatch();
  (async function () {

    /* 补充：对齐 fillBrowserPayload 的其余字段 */
    try {
      var ua = navigator.userAgent;
      put('webBrowser', /WebClip|WebApp/.test(ua) ? 'WebClip' : /Safari/.test(ua) ? 'Safari' : 'Other');
      put('appId', location.host);
      put('osName', /iPhone|iPad|iPod/.test(ua) ? 'iOS' : 'other');
      var m = /OS (\d+)_(\d+)/.exec(ua); put('osVersion', m ? m[1] + '.' + m[2] : null);
      var v = /Version\/([\d.]+)/.exec(ua); put('safariVersion', v ? v[1] : null);
      put('screenAvailTop', screen.availTop !== undefined ? screen.availTop : null);
      put('pluginList', Array.prototype.map.call(navigator.plugins || [], function (p) { return p.name; }).slice(0, 10));
      put('mimeTypeList', Array.prototype.map.call(navigator.mimeTypes || [], function (t) { return t.type; }).slice(0, 10));
      put('heapLimitMB', performance && performance.memory ? Math.round(performance.memory.jsHeapSizeLimit / 1048576) : null);
      (function () {
        var f = 0, t = 0;
        (function loop(a) { if (!t) t = a; f++; if (a - t < 1000) requestAnimationFrame(loop); else { put('refreshHz', f); } })(performance.now());
      })();
      var gl2 = document.createElement('canvas').getContext('webgl');
      if (gl2) {
        var ext = gl2.getExtension('EXT_texture_filter_anisotropic');
        put('webglParams', ext ? { maxAnisotropy: gl2.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) } : null);
      }
    } catch (e) {}
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })]); } catch (e) {}
    try { var f = detectFonts(); put('fontsList', Object.keys(f)); put('fontsCount', Object.keys(f).length); put('fonts', f); } catch (e) {}
    try { put('fontPreferences', fontPreferences()); } catch (e) {}
    try { put('canvasFp', canvasFp()); } catch (e) {}
    try { put('webglFp', webglFp()); } catch (e) {}
    try { put('audioFp', await audioFp()); } catch (e) {}
    try {
      put('visitorId', murmur3(['' + R.fontsList, JSON.stringify(R.fontPreferences), R.canvasFp && R.canvasFp.hash,
        R.webglFp && R.webglFp.hash, R.audioFp && R.audioFp.hash, R.hwConcurrency, R.maxTouch, R.screen,
        R.colorGamut, R.languages, R.tzOffsetMin].join('|')));
    } catch (e) {}
  })();
  setTimeout(finish, 12000);
})();
