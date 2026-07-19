/* HOLLOW — audio.js : fully procedural WebAudio (no samples). GDD §9. */
(function (NS) {
  'use strict';

  var ctx = null, master = null, noiseBuf = null;
  var drone = null, droneGain = null;
  var breathGain = null, breathPan = null;
  var whineOsc = null, whineGain = null;
  var stingNodes = null;
  var volume = 0.7;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);

    // 2s of white noise, reused everywhere
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }

  function panner(pan) {
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      return p;
    }
    return ctx.createGain(); // mono fallback
  }

  function noiseSource() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  // ---- continuous layers -------------------------------------------------
  function startAmbient() {
    if (!ensure() || drone) return;
    drone = {};
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneGain.connect(master);

    [38, 57].forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = i ? 7 : -4;
      var g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g); g.connect(droneGain);
      o.start();
    });
    var n = noiseSource();
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 160; bp.Q.value = 0.6;
    var ng = ctx.createGain(); ng.gain.value = 0.08;
    n.connect(bp); bp.connect(ng); ng.connect(droneGain);
    n.start();

    // custodian breathing layer (gain driven per-frame)
    var bn = noiseSource();
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.45;
    var lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    var lfoBase = ctx.createGain(); lfoBase.gain.value = 1.0;
    breathGain = ctx.createGain(); breathGain.gain.value = 0.0;
    breathPan = panner(0);
    lfo.connect(lfoG);
    lfoG.connect(breathGain.gain);
    bn.connect(lp); lp.connect(breathGain); breathGain.connect(breathPan); breathPan.connect(master);
    bn.start(); lfo.start();
    void lfoBase;
  }

  function setAgitation(a) {           // 0..100 — tightens the room tone
    if (!droneGain) return;
    droneGain.gain.value = 0.05 + 0.0012 * a;
  }

  function setBreath(gain, pan) {      // proximity breathing, <14 m
    if (!breathGain) return;
    breathGain.gain.value = Math.min(0.20, gain);
    if (breathPan.pan) breathPan.pan.value = Math.max(-1, Math.min(1, pan));
  }

  // ---- one-shots ---------------------------------------------------------
  function blipAt(freq, dur, gain, pan, type, when) {
    if (!ctx) return;
    var t = (when || ctx.currentTime);
    var o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    var p = panner(pan || 0);
    o.connect(g); g.connect(p); p.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function thump(freq, dur, gain, pan, lpf) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var s = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lpf || 240;
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    var o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t + dur);
    var og = ctx.createGain();
    og.gain.setValueAtTime(gain * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    var p = panner(pan || 0);
    s.connect(f); f.connect(g); g.connect(p);
    o.connect(og); og.connect(p);
    p.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
    o.start(t); o.stop(t + dur + 0.05);
  }

  var lastTick = 0;
  function scanTick() {                          // trickle scan: ~28 ticks/s
    if (!ctx) return;
    var t = ctx.currentTime;
    if (t - lastTick < 0.035) return;
    lastTick = t;
    blipAt(1050 + Math.random() * 140, 0.025, 0.018, (Math.random() - 0.5) * 0.4, 'square');
  }

  function burstSweep() {                        // rising chirp + tick shower
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + 1.3);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.linearRampToValueAtTime(0.10, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.45);
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 1.3);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + 1.5);
    for (var i = 0; i < 40; i++) {
      blipAt(1400 + Math.random() * 600, 0.02, 0.012, -1 + 2 * (i / 40), 'square', t + (i / 40) * 1.4);
    }
  }

  function setCharge(level, charging) {          // capacitor whine while recharging
    if (!ctx) return;
    if (charging && !whineOsc) {
      whineOsc = ctx.createOscillator();
      whineOsc.type = 'triangle';
      whineGain = ctx.createGain();
      whineGain.gain.value = 0.008;
      whineOsc.connect(whineGain); whineGain.connect(master);
      whineOsc.start();
    }
    if (whineOsc) {
      if (charging) {
        whineOsc.frequency.value = 1800 + 2400 * level;
      } else {
        blipAt(4200, 0.07, 0.02, 0, 'sine');     // "ready" tick
        whineOsc.stop(); whineOsc = null; whineGain = null;
      }
    }
  }

  function footstep(loud) {                      // player's own steps
    thump(95, 0.09, 0.03 + loud * 0.05, 0, 300 + loud * 500);
  }
  function enemyStep(pan, gain) {
    thump(60, 0.16, gain, pan, 180);
  }

  function click(pan, gain) {                    // custodian double-click signature
    if (!ctx) return;
    var t = ctx.currentTime;
    blipAt(2300, 0.018, gain, pan, 'square', t);
    blipAt(1900, 0.018, gain * 0.8, pan, 'square', t + 0.07);
  }

  function heartbeat(intensity) {
    thump(55, 0.10, 0.05 * intensity, 0, 140);
    setTimeout(function () { thump(50, 0.09, 0.038 * intensity, 0, 130); }, 140);
  }

  function sting(on) {                           // chase enter/exit
    if (!ctx) return;
    if (on && !stingNodes) {
      stingNodes = [];
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.4);
      g.connect(master);
      [110, 116.5, 220, 233].forEach(function (f) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f;
        o.connect(g); o.start();
        stingNodes.push(o);
      });
      stingNodes.push(g);
    } else if (!on && stingNodes) {
      var gg = stingNodes[stingNodes.length - 1];
      gg.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      var nodes = stingNodes;
      stingNodes = null;
      setTimeout(function () {
        nodes.forEach(function (n) { if (n.stop) try { n.stop(); } catch (e) { void e; } });
      }, 900);
    }
  }

  function scareImpact() {
    if (!ctx) return;
    sting(false);
    var t = ctx.currentTime;

    // frame-0: custodian double-click — it found you
    click(0, 0.22);
    blipAt(2300, 0.018, 0.18, 0, 'square', t + 0.07);
    blipAt(1900, 0.018, 0.14, 0, 'square', t + 0.14);

    // impact thump + body-hit noise burst
    thump(38, 0.22, 0.55, 0, 90);
    var hit = noiseSource();
    var hf = ctx.createBiquadFilter();
    hf.type = 'highpass'; hf.frequency.value = 800;
    var hg = ctx.createGain();
    hg.gain.setValueAtTime(0.45, t);
    hg.gain.exponentialRampToValueAtTime(0.0005, t + 0.18);
    hit.connect(hf); hf.connect(hg); hg.connect(master);
    hit.start(t); hit.stop(t + 0.2);

    // inhuman screech — descending saw through a resonant band
    var sc = ctx.createOscillator();
    sc.type = 'sawtooth';
    sc.frequency.setValueAtTime(1400, t);
    sc.frequency.exponentialRampToValueAtTime(180, t + 0.55);
    var sf = ctx.createBiquadFilter();
    sf.type = 'bandpass'; sf.Q.value = 6;
    sf.frequency.setValueAtTime(2200, t);
    sf.frequency.exponentialRampToValueAtTime(400, t + 0.5);
    var sg = ctx.createGain();
    sg.gain.setValueAtTime(0.28, t);
    sg.gain.exponentialRampToValueAtTime(0.0005, t + 0.6);
    sc.connect(sf); sf.connect(sg); sg.connect(master);
    sc.start(t); sc.stop(t + 0.65);
  }

  function death() {
    if (!ctx) return;
    var t = ctx.currentTime;
    // carrier tearing out — follows the visual impact
    var s = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.30, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.2);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + 1.3);
    blipAt(220, 1.6, 0.05, 0, 'sine', t + 0.9);  // carrier-loss tone
  }

  function fuseChime() {                         // major 6th dyad, amber-tinted
    blipAt(880, 0.5, 0.04, 0, 'sine');
    blipAt(1480, 0.6, 0.03, 0, 'sine');
  }

  function clunk(pan) {
    thump(140, 0.18, 0.10, pan || 0, 500);
  }

  function generatorRoar() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var s = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(80, t);
    f.frequency.linearRampToValueAtTime(320, t + 2.0);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 1.4);
    g.gain.linearRampToValueAtTime(0.06, t + 4.0);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + 4.2);
    var o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(30, t);
    o.frequency.linearRampToValueAtTime(55, t + 2.0);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(0.10, t + 1.5);
    og.gain.linearRampToValueAtTime(0.03, t + 4.0);
    o.connect(og); og.connect(master);
    o.start(t); o.stop(t + 4.2);
  }

  function doorGrind() {
    if (!ctx) return;
    var t = ctx.currentTime;
    var s = noiseSource();
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 300; f.Q.value = 2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.linearRampToValueAtTime(0.0, t + 0.85);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + 0.9);
  }

  function teletype() { blipAt(1800, 0.015, 0.008, 0, 'square'); }

  NS.audio = {
    ensure: ensure, setVolume: setVolume,
    startAmbient: startAmbient, setAgitation: setAgitation, setBreath: setBreath,
    scanTick: scanTick, burstSweep: burstSweep, setCharge: setCharge,
    footstep: footstep, enemyStep: enemyStep, click: click, heartbeat: heartbeat,
    sting: sting, scareImpact: scareImpact, death: death, fuseChime: fuseChime, clunk: clunk,
    generatorRoar: generatorRoar, doorGrind: doorGrind, teletype: teletype
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
