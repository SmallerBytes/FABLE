/* HOLLOW — render.js : raw WebGL1 point-cloud ring buffer + CRT post pass. */
(function (NS) {
  'use strict';

  var CAPACITY = 700000;     // points (GDD §3.2)
  var STRIDE = 8;            // x y z r g b birth life
  var BYTES = STRIDE * 4;

  var gl = null, canvas = null;
  var pointProg = null, postProg = null;
  var vbo = null, quadVbo = null;
  var fbo = null, fboTex = null, fboW = 0, fboH = 0;
  var cpu = new Float32Array(CAPACITY * STRIDE);
  var cursor = 0, written = 0;
  var staging = new Float32Array(60000 * STRIDE);
  var stagingCount = 0;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('HOLLOW shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('HOLLOW link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  var POINT_VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aCol;',
    'attribute float aBirth;',
    'attribute float aLife;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform float uNow;',
    'varying vec3 vCol;',
    'varying float vBright;',
    'void main(){',
    '  vec4 vp = uView * vec4(aPos, 1.0);',
    '  gl_Position = uProj * vp;',
    '  float age = uNow - aBirth;',
    '  float b = age < 0.4 ? mix(1.3, 1.0, age / 0.4)',
    '                      : max(0.0, 1.0 - (age - 0.4) / aLife);',
    '  vBright = b;',
    '  vCol = aCol;',
    '  float dist = max(0.5, -vp.z);',
    '  gl_PointSize = clamp(170.0 / dist, 1.6, 5.0) * (b > 0.0 ? 1.0 : 0.0);',
    '}'
  ].join('\n');

  var POINT_FS = [
    'precision mediump float;',
    'varying vec3 vCol;',
    'varying float vBright;',
    'void main(){',
    '  if (vBright <= 0.004) discard;',
    '  vec2 d = gl_PointCoord - 0.5;',
    '  float r2 = dot(d, d);',
    '  if (r2 > 0.25) discard;',
    '  float soft = 1.0 - smoothstep(0.10, 0.5, sqrt(r2));',
    '  gl_FragColor = vec4(vCol * vBright * soft, 1.0);',
    '}'
  ].join('\n');

  // Wristlink / Pip-Boy panel — world-space textured quad (proper stereo)
  var HUD_VS = [
    'attribute vec3 aPos;',
    'attribute vec2 aUv;',
    'uniform mat4 uMVP;',
    'varying vec2 vUv;',
    'void main(){ vUv = aUv; gl_Position = uMVP * vec4(aPos, 1.0); }'
  ].join('\n');
  var HUD_FS = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vUv);',
    '  if (c.a < 0.05) discard;',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  var POST_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  // VHS camcorder pass: barrel, tracking wobble, chroma bleed, line tears,
  // dropouts, head-switching band, scanlines, grain, vignette, cheap bloom,
  // agitation tear (GDD §8.3). uGlitch drives interference intensity.
  var POST_FS = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uTear;',     // 0..1, single-frame horizontal tear
    'uniform float uFlood;',    // death flood 0..1
    'uniform float uGlitch;',   // 0..1, tape interference level
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main(){',
    '  vec2 cc = vUv - 0.5;',
    '  float r2 = dot(cc, cc);',
    '  vec2 uv = vUv + cc * r2 * 0.12;',                 // barrel
    // vertical hold slip: whole picture rolls when interference spikes
    '  float slip = step(0.965, hash(vec2(floor(uTime * 6.0), 5.0))) * uGlitch;',
    '  uv.y = fract(uv.y + slip * (hash(vec2(floor(uTime * 6.0), 9.0)) - 0.5) * 0.3);',
    // tape tracking wobble: slow horizontal weave, worse with glitch
    '  uv.x += sin(uv.y * 9.0 + uTime * 2.1) * 0.0012 * (1.0 + uGlitch * 4.0);',
    // line-tear bands: random rows yank sideways
    '  float row = floor(uv.y * uRes.y / 4.0);',
    '  float ln = hash(vec2(row, floor(uTime * 13.0)));',
    '  float band = step(0.992 - uGlitch * 0.10, ln);',
    '  uv.x += band * (hash(vec2(ln, fract(uTime))) - 0.5) * (0.02 + uGlitch * 0.10);',
    '  if (uTear > 0.5) {',
    '    float tb = step(0.45, vUv.y) * step(vUv.y, 0.47);',
    '    uv.x += tb * 0.03;',
    '  }',
    // head-switching noise at the bottom of the frame
    '  float hs = 1.0 - smoothstep(0.0, 0.022, uv.y);',
    '  uv.x += hs * (hash(vec2(floor(uv.y * 600.0), floor(uTime * 47.0))) - 0.5) * 0.18;',
    '  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {',
    '    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return;',
    '  }',
    // chroma bleed: R and B smear apart like a worn tape
    '  vec2 cab = vec2((1.2 + uGlitch * 5.0) / uRes.x, 0.0);',
    '  vec3 col;',
    '  col.r = texture2D(uTex, uv + cab).r;',
    '  col.g = texture2D(uTex, uv).g;',
    '  col.b = texture2D(uTex, uv - cab).b;',
    '  vec2 px = 1.0 / uRes;',
    '  vec3 nb = texture2D(uTex, uv + vec2(px.x * 2.0, 0.0)).rgb',
    '          + texture2D(uTex, uv - vec2(px.x * 2.0, 0.0)).rgb',
    '          + texture2D(uTex, uv + vec2(0.0, px.y * 2.0)).rgb',
    '          + texture2D(uTex, uv - vec2(0.0, px.y * 2.0)).rgb;',
    '  col += nb * 0.12;',                               // bloom approximation
    '  float scan = 0.88 + 0.12 * sin(uv.y * uRes.y * 3.14159);',
    '  col *= scan;',
    // tape noise: base grain plus interference static
    '  float grain = (hash(uv * uRes + fract(uTime) * 61.7) - 0.5) * (0.06 + uGlitch * 0.22);',
    '  col += grain;',
    // dropout streaks: a scanline flares white for one frame
    '  float drop = step(0.9994 - uGlitch * 0.004, hash(vec2(floor(uv.y * uRes.y), floor(uTime * 24.0))));',
    '  col += drop * 0.55;',
    // torn bands read as raw static, not picture
    '  col = mix(col, vec3(hash(uv * uRes + uTime * 31.0)) * 0.5, band * uGlitch * 0.8);',
    '  col += hs * hash(uv * uRes + uTime * 53.0) * 0.25;',
    '  float vig = 1.0 - r2 * 1.35;',
    '  col *= max(vig, 0.0);',
    '  col += vec3(0.012, 0.022, 0.014) * max(vig, 0.0);', // faint phosphor base glow
    '  col = mix(col, vec3(0.9, 0.05, 0.05), uFlood);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var attrs = {}, unis = {}, postAttrs = {}, postUnis = {};
  var hudProg = null, hudAttrs = {}, hudUnis = {};
  var hudCanvas = null, hudCtx = null, hudTex = null, hudVbo = null;
  var hudState = { hint: '', obj: '', aux: 0, timer: '', chg: '' };
  var hudDirty = true;
  var wristModel = null; // Float32Array(16) game-world model matrix

  function init(cnv) {
    canvas = cnv;
    gl = canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      xrCompatible: true
    });
    if (!gl) throw new Error('HOLLOW: WebGL unavailable');

    pointProg = program(POINT_VS, POINT_FS);
    postProg = program(POST_VS, POST_FS);
    hudProg = program(HUD_VS, HUD_FS);

    attrs.aPos = gl.getAttribLocation(pointProg, 'aPos');
    attrs.aCol = gl.getAttribLocation(pointProg, 'aCol');
    attrs.aBirth = gl.getAttribLocation(pointProg, 'aBirth');
    attrs.aLife = gl.getAttribLocation(pointProg, 'aLife');
    unis.uProj = gl.getUniformLocation(pointProg, 'uProj');
    unis.uView = gl.getUniformLocation(pointProg, 'uView');
    unis.uNow = gl.getUniformLocation(pointProg, 'uNow');

    postAttrs.aPos = gl.getAttribLocation(postProg, 'aPos');
    postUnis.uTex = gl.getUniformLocation(postProg, 'uTex');
    postUnis.uRes = gl.getUniformLocation(postProg, 'uRes');
    postUnis.uTime = gl.getUniformLocation(postProg, 'uTime');
    postUnis.uTear = gl.getUniformLocation(postProg, 'uTear');
    postUnis.uFlood = gl.getUniformLocation(postProg, 'uFlood');
    postUnis.uGlitch = gl.getUniformLocation(postProg, 'uGlitch');

    hudAttrs.aPos = gl.getAttribLocation(hudProg, 'aPos');
    hudAttrs.aUv = gl.getAttribLocation(hudProg, 'aUv');
    hudUnis.uTex = gl.getUniformLocation(hudProg, 'uTex');
    hudUnis.uMVP = gl.getUniformLocation(hudProg, 'uMVP');

    vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, CAPACITY * BYTES, gl.DYNAMIC_DRAW);

    quadVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // Unit quad in local space (scaled by wrist model). x=width, y=height, z=0 face.
    hudVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, hudVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -0.5, -0.5, 0, 0, 1,
       0.5, -0.5, 0, 1, 1,
      -0.5,  0.5, 0, 0, 0,
       0.5, -0.5, 0, 1, 1,
       0.5,  0.5, 0, 1, 0,
      -0.5,  0.5, 0, 0, 0
    ]), gl.STATIC_DRAW);

    hudCanvas = document.createElement('canvas');
    hudCanvas.width = 640;
    hudCanvas.height = 400;
    hudCtx = hudCanvas.getContext('2d');
    hudTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, hudTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 640, 400, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    resize();
  }

  function resize() {
    var w = Math.floor(canvas.clientWidth * (window.devicePixelRatio || 1));
    var h = Math.floor(canvas.clientHeight * (window.devicePixelRatio || 1));
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (fboW === w && fboH === h) return;
    fboW = w; fboH = h;
    if (fboTex) { gl.deleteTexture(fboTex); gl.deleteFramebuffer(fbo); }
    fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function addPoint(x, y, z, r, g, b, birth, life) {
    if (stagingCount >= 60000) return;
    var o = stagingCount * STRIDE;
    staging[o] = x; staging[o + 1] = y; staging[o + 2] = z;
    staging[o + 3] = r; staging[o + 4] = g; staging[o + 5] = b;
    staging[o + 6] = birth; staging[o + 7] = life;
    stagingCount++;
  }

  function flush() {
    if (stagingCount === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    var remaining = stagingCount, srcOff = 0;
    while (remaining > 0) {
      var space = CAPACITY - cursor;
      var n = Math.min(space, remaining);
      var view = staging.subarray(srcOff * STRIDE, (srcOff + n) * STRIDE);
      cpu.set(view, cursor * STRIDE);
      gl.bufferSubData(gl.ARRAY_BUFFER, cursor * BYTES, view);
      cursor = (cursor + n) % CAPACITY;
      written += n;
      srcOff += n;
      remaining -= n;
    }
    stagingCount = 0;
  }

  function pointCount() { return Math.min(written, CAPACITY); }

  function clearPoints() {
    cursor = 0; written = 0; stagingCount = 0;
  }

  function drawPoints(proj, view, now, maxPoints) {
    var n = pointCount();
    if (n <= 0) return;
    gl.useProgram(pointProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(attrs.aPos);
    gl.vertexAttribPointer(attrs.aPos, 3, gl.FLOAT, false, BYTES, 0);
    gl.enableVertexAttribArray(attrs.aCol);
    gl.vertexAttribPointer(attrs.aCol, 3, gl.FLOAT, false, BYTES, 12);
    gl.enableVertexAttribArray(attrs.aBirth);
    gl.vertexAttribPointer(attrs.aBirth, 1, gl.FLOAT, false, BYTES, 24);
    gl.enableVertexAttribArray(attrs.aLife);
    gl.vertexAttribPointer(attrs.aLife, 1, gl.FLOAT, false, BYTES, 28);
    gl.uniformMatrix4fv(unis.uProj, false, proj);
    gl.uniformMatrix4fv(unis.uView, false, view);
    gl.uniform1f(unis.uNow, now);
    if (!maxPoints || n <= maxPoints) {
      gl.drawArrays(gl.POINTS, 0, n);
    } else {
      // Quest budget: draw the newest points from the circular buffer.
      var start = (cursor - maxPoints + CAPACITY) % CAPACITY;
      var firstCount = Math.min(maxPoints, CAPACITY - start);
      gl.drawArrays(gl.POINTS, start, firstCount);
      if (firstCount < maxPoints) {
        gl.drawArrays(gl.POINTS, 0, maxPoints - firstCount);
      }
    }
    gl.disableVertexAttribArray(attrs.aPos);
    gl.disableVertexAttribArray(attrs.aCol);
    gl.disableVertexAttribArray(attrs.aBirth);
    gl.disableVertexAttribArray(attrs.aLife);
  }

  function render(proj, view, now, opts) {
    opts = opts || {};
    resize();
    flush();

    // pass 1: points -> fbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, fboW, fboH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    drawPoints(proj, view, now);

    // pass 2: fbo -> screen with CRT
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(postProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.uniform1i(postUnis.uTex, 0);
    gl.uniform2f(postUnis.uRes, canvas.width, canvas.height);
    gl.uniform1f(postUnis.uTime, now);
    gl.uniform1f(postUnis.uTear, opts.tear ? 1 : 0);
    gl.uniform1f(postUnis.uFlood, opts.flood || 0);
    gl.uniform1f(postUnis.uGlitch, opts.glitch || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVbo);
    gl.enableVertexAttribArray(postAttrs.aPos);
    gl.vertexAttribPointer(postAttrs.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(postAttrs.aPos);
  }

  // WebXR: wristlink panel in game world (stereo-correct, look at left controller)
  function paintHud() {
    if (!hudCtx) return;
    var ctx = hudCtx;
    var w = hudCanvas.width, h = hudCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // chassis
    ctx.fillStyle = 'rgba(4, 18, 10, 0.92)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(124,255,155,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = 'rgba(63,138,85,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(124,255,155,0.98)';
    ctx.font = 'bold 28px Consolas, monospace';
    ctx.fillText('RD-9 WRISTLINK', 36, 48);
    ctx.font = '22px Consolas, monospace';
    ctx.fillStyle = 'rgba(124,255,155,0.7)';
    ctx.fillText(hudState.timer || 'T+00:00', 36, 84);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(124,255,155,0.98)';
    ctx.font = 'bold 26px Consolas, monospace';
    ctx.fillText(hudState.obj || '', w - 36, 48);
    ctx.font = '22px Consolas, monospace';
    ctx.fillStyle = 'rgba(124,255,155,0.75)';
    ctx.fillText('CHG ' + (hudState.chg || ''), w - 36, 84);

    // audio / signature bar
    var aux = Math.max(0, Math.min(1, hudState.aux || 0));
    var bx = 36, by = 120, bw = w - 72, bh = 28;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(124,255,155,0.85)';
    ctx.font = 'bold 20px Consolas, monospace';
    ctx.fillText('AUDIO / SIGNATURE', bx, by - 14);
    ctx.strokeStyle = 'rgba(63,138,85,0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = aux > 0.55 ? 'rgba(255,80,80,0.95)' : 'rgba(124,255,155,0.95)';
    ctx.fillRect(bx + 3, by + 3, Math.max(0, (bw - 6) * aux), bh - 6);

    // prompt band
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(28, h - 130, w - 56, 96);
    ctx.strokeStyle = 'rgba(255,179,71,0.55)';
    ctx.strokeRect(28, h - 130, w - 56, 96);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,179,71,0.98)';
    ctx.font = 'bold 30px Consolas, monospace';
    var hint = hudState.hint || 'RAISE LEFT WRIST · CHECK STATUS';
    // wrap long hints
    if (hint.length > 34) {
      var mid = hint.lastIndexOf(' ', 34);
      if (mid < 12) mid = 34;
      ctx.fillText(hint.slice(0, mid), w * 0.5, h - 92);
      ctx.fillText(hint.slice(mid).trim(), w * 0.5, h - 56);
    } else {
      ctx.fillText(hint, w * 0.5, h - 74);
    }
    hudDirty = false;
  }

  function setVRHud(state) {
    if (!state) return;
    var next = {
      hint: state.hint || '',
      obj: state.obj || '',
      aux: state.aux || 0,
      timer: state.timer || '',
      chg: state.chg || ''
    };
    if (next.hint !== hudState.hint || next.obj !== hudState.obj ||
        next.timer !== hudState.timer || next.chg !== hudState.chg ||
        Math.abs(next.aux - hudState.aux) > 0.02) {
      hudDirty = true;
    }
    hudState = next;
  }

  function setWristModel(m) {
    wristModel = m || null;
  }

  function drawVRHud(proj, view) {
    if (!hudProg || !hudTex || !wristModel) return;
    if (hudDirty) {
      paintHud();
      gl.bindTexture(gl.TEXTURE_2D, hudTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hudCanvas);
    }
    var math = NS.math;
    var mvp = math.mat4Multiply(proj, math.mat4Multiply(view, wristModel));
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(hudProg);
    gl.uniformMatrix4fv(hudUnis.uMVP, false, mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hudTex);
    gl.uniform1i(hudUnis.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, hudVbo);
    gl.enableVertexAttribArray(hudAttrs.aPos);
    gl.enableVertexAttribArray(hudAttrs.aUv);
    gl.vertexAttribPointer(hudAttrs.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(hudAttrs.aUv, 2, gl.FLOAT, false, 20, 12);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(hudAttrs.aPos);
    gl.disableVertexAttribArray(hudAttrs.aUv);
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  function renderXR(views, framebuffer, now) {
    flush();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      gl.viewport(v.viewport.x, v.viewport.y, v.viewport.width, v.viewport.height);
      drawPoints(v.projection, v.view, now, 300000);
      drawVRHud(v.projection, v.view);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function makeXRCompatible() {
    if (gl.makeXRCompatible) return gl.makeXRCompatible();
    return Promise.resolve();
  }

  NS.render = {
    CAPACITY: CAPACITY,
    init: init, resize: resize,
    addPoint: addPoint, pointCount: pointCount, clearPoints: clearPoints,
    render: render, renderXR: renderXR,
    setVRHud: setVRHud, setWristModel: setWristModel,
    getContext: function () { return gl; },
    makeXRCompatible: makeXRCompatible
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
