/* HOLLOW — game.js : states, player, scanner, items, finale, HUD, main loop. */
(function (NS) {
  'use strict';

  var M, R, A, EN, VR, math;

  // ---- tuning constants (GDD §3) ----
  var EYE_STAND = 1.85, EYE_CROUCH = 1.15;
  var SPEED_WALK = 3.2, SPEED_SPRINT = 7.4, SPEED_CROUCH = 1.6; // sprint > chase (6.0)
  var PLAYER_RADIUS = 0.35;
  var NOISE_CROUCH = 2, NOISE_WALK = 7, NOISE_SPRINT = 22;
  var STAMINA_MAX = 1, STAMINA_DRAIN = 0.32, STAMINA_RECOVER = 0.24, STAMINA_MIN_SPRINT = 0.12;
  var NOISE_TRICKLE = 9, NOISE_BURST = 34, NOISE_INTERACT = 12;
  var TRICKLE_RAYS = 220, TRICKLE_CONE = 14 * Math.PI / 180;
  var BURST_TIME = 1.4, BURST_COOLDOWN = 6.0;
  var BURST_HALF_FOV = 75 * Math.PI / 180, BURST_COL_STEP = 0.55 * Math.PI / 180;
  var BURST_V_SAMPLES = 26, BURST_V_SPREAD = 0.95; // radians, ± around aim pitch
  var POINT_LIFE = 90, ENEMY_POINT_LIFE = 2.5, BEACON_LIFE = 1.2;
  var SCAN_RANGE = 60;
  var INTERACT_RANGE = 2.4;
  var INTERACT_RANGE_VR = 4.2;
  var MEMO_RANGE = 1.3;
  var MEMO_RANGE_VR = 3.2;
  var VR_AIM_MAX = 5.5;
  var VR_AIM_DOT = 0.72;
  var gfxQuality = 'medium';

  var GFX = {
    low: {
      trickleRays: 90, burstColStep: 1.1 * Math.PI / 180, burstVSamples: 12,
      pointLife: 40, xrMaxPoints: 120000, fboScale: 0.55, vrScale: 0.55, crt: 0.45
    },
    medium: {
      trickleRays: 220, burstColStep: 0.55 * Math.PI / 180, burstVSamples: 26,
      pointLife: 90, xrMaxPoints: 300000, fboScale: 0.85, vrScale: 0.8, crt: 0.75
    },
    high: {
      trickleRays: 360, burstColStep: 0.35 * Math.PI / 180, burstVSamples: 40,
      pointLife: 140, xrMaxPoints: 520000, fboScale: 1.0, vrScale: 1.0, crt: 1.0
    }
  };

  function applyGraphics(level) {
    var g = GFX[level] || GFX.medium;
    gfxQuality = GFX[level] ? level : 'medium';
    TRICKLE_RAYS = g.trickleRays;
    BURST_COL_STEP = g.burstColStep;
    BURST_V_SAMPLES = g.burstVSamples;
    POINT_LIFE = g.pointLife;
    if (R && R.setQuality) R.setQuality({ xrMaxPoints: g.xrMaxPoints, fboScale: g.fboScale, crt: g.crt });
    if (VR && VR.setFramebufferScale) VR.setFramebufferScale(g.vrScale);
    try { localStorage.setItem('hollow_gfx', gfxQuality); } catch (err) { void err; }
  }

  // ---- palette (GDD §3.2) — wall tones kept mid so additive LiDAR does not blow out ----
  var C_WALL = [0.32, 0.72, 0.42];
  var C_FLOOR = [0.12, 0.38, 0.34];
  var C_CEIL = [0.20, 0.50, 0.30];
  var C_HARBOR = [0.12, 0.78, 0.28];   // safe-zone LiDAR returns
  var C_YELLOW = [1.0, 0.92, 0.12];   // laser alarm beams
  var C_AMBER = [1.0, 0.70, 0.28];
  var C_CYAN = [0.43, 0.91, 0.91];
  var C_RED = [1.0, 0.27, 0.27];
  var C_WHITE = [1.0, 1.0, 1.0];
  var C_DOOR = [0.12, 0.28, 0.72];   // locked blast doors — dark blue
  var NOISE_LASER = 32;
  var LASER_COOLDOWN = 10;

  var CHOPPER_INBOUND_S = 40;
  var CHOPPER_LINGER_S = 25;
  var LZ_RADIUS = 3.5;
  var NOISE_UPLINK = 40;

  var MEMO_TEXTS = [
    "SIGINT FRAGMENT — TARGET NODE UNDER EMCON BLACKOUT. ACTIVE SCANNING IS DETECTABLE. SECURITY HOMES ON EMISSIONS.",
    "OPS NOTE — ACCESS KEYS SCATTERED IN THE WING. ALL THREE ARE REQUIRED TO OPEN THE CONSOLE-ROOM DOOR. OTHER BLAST DOORS ARE OPTIONAL SHORTCUTS (ONE KEY EACH).",
    "BRIEF ADDENDUM — AFTER UPLINK, EXFIL LZ GOES HOT. CHOPPER INBOUND THEN ON-STATION. IF YOU MISS THE WINDOW YOU ARE LEFT BEHIND.",
    "SECURITY PROFILE — COUNTER-INTRUSION UNIT IS BLIND BUT ACOUSTIC. FARADAY HARBORS DAMPEN YOUR SIGNATURE. TRIPWIRES ALARM THE GRID."
  ];

  var BOOT_LINES = [
    "RD-9 RANGING PACKAGE — FIELD CYBER RAID LOADOUT",
    "BUILD 0.9.1 / MISSION SUPPORT OVERLAY",
    "",
    "SELF TEST ............. OK",
    "PULSE HEAD ............ OK",
    "POINT STORE ........... OK",
    "COMMS BAFFLE .......... DEGRADED",
    "",
    "TASKING: INFILTRATE ENEMY C2 NODE (BLACKOUT).",
    "RECOVER 3 ACCESS KEYS. OPEN CONSOLE DOOR (D3).",
    "OPTIONAL BLAST DOORS ARE SHORTCUTS ONLY.",
    "JACK INTO CORE ROUTING MATRIX. ESTABLISH UPLINK.",
    "EXFIL TO LZ WHEN CHOPPER IS ON STATION.",
    "MINIMIZE EMISSIONS. SECURITY WILL HEAR YOU."
  ];

  var WIN_LINES = [
    "UPLINK CONFIRMED. PAYLOAD DELIVERED.",
    "OPERATOR EXTRACTED VIA LZ. CHOPPER AWAY.",
    "",
    "MISSION SUCCESS — NODE COMPROMISED.",
    "",
    "DEBRIEF: SIGNATURE DISCIPLINE AND SHARED",
    "UNDERSTANDING DECIDED THE RUN.",
    "",
    "( END TRANSMISSION )"
  ];

  var FAIL_LEFT_LINES = [
    "CHOPPER DEPARTED. LZ COLD.",
    "OPERATOR NOT ON BOARD.",
    "",
    "MISSION FAILURE — LEFT BEHIND.",
    "",
    "THE UPLINK HELD. THE EXTRACT DID NOT."
  ];

  // ---- state ----
  var state = 'BOOT'; // BOOT | CONTROLS | PLAY | DYING | DEAD | WIN | LEFT
  var player = { x: 0, z: 0, yaw: 0, pitch: 0, eye: EYE_STAND };
  var keys = {};
  var trickleOn = false;
  var vrScanOrigin = null, vrScanDirection = null;
  var trickleNoiseTimer = 0;
  var burst = { active: false, t: 0, cooldown: 0 };
  var accessKeys = [], memos = [];
  var keysCollected = 0, doorsOpen = 0;
  var vrHudHint = '';
  var vrHudObj = '';
  var uplinkDone = false;
  var exfilPhase = 'NONE'; // NONE | INBOUND | ON_STATION | GONE
  var exfilTimer = 0;
  var beaconTimer = 0;
  var auxLoud = 0, recentLoud = 0;
  var stamina = STAMINA_MAX, staminaExhausted = false;
  var tearTimer = 0, floodLevel = 0, dieTimer = 0;
  var glitchLevel = 0, glitchPop = 0, popTimer = 5;
  var runTime = 0;
  var now = 0, lastFrame = 0;
  var sens = 0.0022, reducedFlash = false;
  var deathCause = 'quiet';
  var clickTickFade = 0;
  var laserCooldown = {};
  var CIR = null;

  // typewriter event line
  var msgQueue = [], curMsg = null, msgChars = 0, msgHold = 0;

  var el = {};

  // ------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function init() {
    M = NS.map; R = NS.render; A = NS.audio; EN = NS.enemy; VR = NS.vr; math = NS.math;
    CIR = NS.circuit;

    el.canvas = $('glcanvas');
    el.hud = $('hud');
    el.timer = $('hud-timer'); el.pts = $('hud-pts'); el.chg = $('hud-chg'); el.obj = $('hud-obj');
    el.auxFill = $('aux-fill'); el.auxTick = $('aux-tick');
    el.staFill = $('sta-fill');
    el.vcrClock = $('vcr-clock');
    el.eventline = $('eventline');
    el.boot = $('boot-screen'); el.bootText = $('boot-text'); el.bootCont = $('boot-continue');
    el.controls = $('controls-screen');
    el.death = $('death-screen'); el.epitaph = $('death-epitaph');
    el.win = $('win-screen'); el.winText = $('win-text');

    R.init(el.canvas);
    VR.init($('enter-vr'));
    bindInput();
    startBootType();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function syncGfxButtons() {
    var buttons = document.querySelectorAll('.gfx-btn');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.getAttribute('data-gfx') === gfxQuality) b.classList.add('active');
      else b.classList.remove('active');
    }
  }

  function isMenuControl(el) {
    if (!el || !el.closest) return false;
    return !!(el.closest('input, select, textarea, button, label, a, .gfx-row, .opt-row, .menu-actions'));
  }

  function startDesktop() {
    A.ensure();
    A.startAmbient();
    if (NS.mic) NS.mic.start();
    el.canvas.requestPointerLock();
  }

  // ------------------------------------------------------------------
  // input
  // ------------------------------------------------------------------
  function bindInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Enter') {
        if (state === 'BOOT') { finishBoot(); }
        else if (state === 'CONTROLS') { startDesktop(); }
        else if (state === 'DEAD' || state === 'LEFT') { showScreen('controls'); state = 'CONTROLS'; }
        else if (state === 'WIN') { state = 'BOOT'; startBootType(); }
      }
      if (e.code === 'Space') {
        if (state === 'PLAY' && !(CIR && CIR.isActive())) { e.preventDefault(); tryBurst(); }
      }
      if (e.code === 'KeyE' && state === 'PLAY') {
        if (CIR && CIR.isActive()) CIR.rotateSelected();
        else interact();
      }
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });

    el.canvas.addEventListener('mousedown', function (e) {
      if (state !== 'PLAY') return;
      if (e.button === 0) trickleOn = true;
      if (e.button === 2) tryBurst();
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) trickleOn = false;
    });
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('mousemove', function (e) {
      if (state !== 'PLAY' || document.pointerLockElement !== el.canvas) return;
      player.yaw += e.movementX * sens;
      player.pitch -= e.movementY * sens;
      player.pitch = math.clamp(player.pitch, -1.45, 1.45);
    });

    // Controls screen: only explicit buttons start — never click-anywhere
    el.controls.addEventListener('click', function (e) {
      if (isMenuControl(e.target)) return;
    });
    var btnDesktop = $('btn-start-desktop');
    if (btnDesktop) {
      btnDesktop.addEventListener('click', function (e) {
        e.stopPropagation();
        startDesktop();
      });
    }

    // Boot screen: ignore option controls; CONTINUE / Enter advances
    el.boot.addEventListener('click', function (e) {
      if (isMenuControl(e.target)) return;
    });
    var btnBoot = $('btn-boot-continue');
    if (btnBoot) {
      btnBoot.addEventListener('click', function (e) {
        e.stopPropagation();
        if (state === 'BOOT') finishBoot();
      });
    }

    el.death.addEventListener('click', function () {
      if (state === 'DEAD' || state === 'LEFT') {
        $('death-screen').querySelector('h1').textContent = 'CARRIER LOST';
        showScreen('controls'); state = 'CONTROLS';
      }
    });
    el.win.addEventListener('click', function () {
      if (state === 'WIN') { state = 'BOOT'; startBootType(); }
    });

    document.addEventListener('pointerlockchange', function () {
      var locked = document.pointerLockElement === el.canvas;
      if (locked && state === 'CONTROLS') {
        if (!runActive) startRun();
        state = 'PLAY';
        showScreen(null);
      } else if (!locked && state === 'PLAY') {
        state = 'CONTROLS';
        trickleOn = false;
        showScreen('controls');
      }
    });

    window.addEventListener('resize', function () { R.resize(); });

    $('opt-sens').addEventListener('input', function (e) { sens = e.target.value * 0.000275; });
    $('opt-vol').addEventListener('input', function (e) { A.setVolume(e.target.value / 100); });
    $('opt-flash').addEventListener('change', function (e) { reducedFlash = e.target.checked; });

    function syncSmoothTurnUI(on) {
      var a = $('opt-smooth'), b = $('opt-smooth-controls');
      if (a) a.checked = !!on;
      if (b) b.checked = !!on;
    }
    function applySmoothTurn(on) {
      if (VR && VR.setSmoothTurn) VR.setSmoothTurn(on);
      syncSmoothTurnUI(on);
    }
    var smoothBoot = $('opt-smooth');
    var smoothCtrl = $('opt-smooth-controls');
    if (smoothBoot) {
      smoothBoot.addEventListener('change', function (e) { applySmoothTurn(e.target.checked); });
    }
    if (smoothCtrl) {
      smoothCtrl.addEventListener('change', function (e) { applySmoothTurn(e.target.checked); });
    }
    applySmoothTurn(VR && VR.getSmoothTurn ? VR.getSmoothTurn() : false);

    var saved = 'medium';
    try { saved = localStorage.getItem('hollow_gfx') || 'medium'; } catch (err) { void err; }
    if (!GFX[saved]) saved = 'medium';
    applyGraphics(saved);
    syncGfxButtons();

    var gfxButtons = document.querySelectorAll('.gfx-btn');
    for (var gi = 0; gi < gfxButtons.length; gi++) {
      gfxButtons[gi].addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var level = e.currentTarget.getAttribute('data-gfx');
        applyGraphics(level);
        syncGfxButtons();
      });
    }
  }

  function showScreen(name) {
    [el.boot, el.controls, el.death, el.win].forEach(function (s) { s.classList.remove('visible'); });
    el.hud.style.display = (name === null) ? 'block' : 'none';
    if (name === 'boot') el.boot.classList.add('visible');
    if (name === 'controls') el.controls.classList.add('visible');
    if (name === 'death') el.death.classList.add('visible');
    if (name === 'win') el.win.classList.add('visible');
  }

  // ------------------------------------------------------------------
  // boot / screens
  // ------------------------------------------------------------------
  var bootInterval = null;
  function startBootType() {
    state = 'BOOT';
    showScreen('boot');
    el.bootCont.style.display = 'none';
    el.bootText.textContent = '';
    var li = 0, ci = 0;
    clearInterval(bootInterval);
    bootInterval = setInterval(function () {
      if (li >= BOOT_LINES.length) { finishBoot(); return; }
      var line = BOOT_LINES[li];
      if (ci <= line.length) {
        el.bootText.textContent =
          BOOT_LINES.slice(0, li).join('\n') + (li ? '\n' : '') + line.slice(0, ci);
        ci += 2;
        if (A && Math.random() < 0.3) A.teletype();
      } else { li++; ci = 0; }
    }, 16);
  }
  function finishBoot() {
    clearInterval(bootInterval);
    el.bootText.textContent = BOOT_LINES.join('\n');
    if (el.bootCont.style.display === 'none') {
      el.bootCont.style.display = 'block';
      return;
    }
    state = 'CONTROLS';
    showScreen('controls');
  }

  // ------------------------------------------------------------------
  // run lifecycle
  // ------------------------------------------------------------------
  var runActive = false;
  function startRun() {
    runActive = true;
    if (A.stopAllTransient) A.stopAllTransient();
    if (CIR) CIR.close();
    R.clearPoints();
    EN.reset();
    M.resetDoors();
    math.srand(0x1988 ^ (Date.now() & 0xffff));
    player.x = M.markers.P.x; player.z = M.markers.P.z;
    player.yaw = 0; player.pitch = 0; player.eye = EYE_STAND;
    accessKeys = M.markers.fuses.map(function (f) { return { x: f.x, z: f.z, taken: false }; });
    memos = M.markers.memos.map(function (m, i) { return { x: m.x, z: m.z, read: false, i: i }; });
    keysCollected = 0; doorsOpen = 0;
    uplinkDone = false;
    exfilPhase = 'NONE'; exfilTimer = 0;
    burst.active = false; burst.t = 0; burst.cooldown = 0;
    trickleOn = false; auxLoud = 0; recentLoud = 0;
    stamina = STAMINA_MAX; staminaExhausted = false;
    floodLevel = 0; runTime = 0; deathCause = 'quiet';
    glitchLevel = 0; glitchPop = 0; popTimer = 5;
    laserCooldown = {};
    msgQueue = []; curMsg = null;
    queueMsg('RD-9 RAID OVERLAY ACTIVE. MINIMIZE EMISSIONS.', '');
  }

  function onKill() {
    if (state !== 'PLAY') return;
    state = 'DYING';
    dieTimer = 0;
    A.death();
    // epitaph by how loud you were (GDD §2.2)
    if (burst.active) deathCause = 'sweep';
    else if (recentLoud > 12) deathCause = 'loud';
    else if (recentLoud > 4) deathCause = 'steps';
    else deathCause = 'quiet';
  }

  function finishDeath() {
    runActive = false;
    state = 'DEAD';
    if (CIR) CIR.close();
    if (A.sting) A.sting(false);
    document.exitPointerLock();
    if (VR.active()) VR.end();
    setTimeout(function () {
      if (state === 'DEAD' || state === 'CONTROLS' || state === 'BOOT' || state === 'LEFT') {
        if (A.stopAllTransient) A.stopAllTransient();
      }
    }, 4200);
    var lines = {
      sweep: 'MID-SWEEP. SECURITY LOCKED YOUR SIGNATURE.',
      loud: 'YOU LIT THE DARK. THE GRID ANSWERED.',
      steps: 'FOOTSTEPS GAVE YOU AWAY THREE HALLS OUT.',
      quiet: 'YOU WERE QUIET. IT STILL HEARD YOUR HEART.'
    };
    el.epitaph.textContent = lines[deathCause];
    showScreen('death');
  }

  function failLeftBehind() {
    runActive = false;
    state = 'LEFT';
    exfilPhase = 'GONE';
    if (CIR) CIR.close();
    if (A.sting) A.sting(false);
    if (A.chopperStop) A.chopperStop();
    document.exitPointerLock();
    if (VR.active()) VR.end();
    el.epitaph.textContent = 'CHOPPER DEPARTED. YOU WERE NOT ON THE PAD.';
    $('death-screen').querySelector('h1').textContent = 'LEFT BEHIND';
    showScreen('death');
    if (A.stopAllTransient) {
      setTimeout(function () { if (A.stopAllTransient) A.stopAllTransient(); }, 2500);
    }
  }

  function winGame() {
    runActive = false;
    state = 'WIN';
    if (CIR) CIR.close();
    if (A.chopperStop) A.chopperStop();
    document.exitPointerLock();
    if (VR.active()) VR.end();
    el.winText.textContent = WIN_LINES.join('\n');
    showScreen('win');
    A.sting(false);
  }

  function startExfil() {
    uplinkDone = true;
    exfilPhase = 'INBOUND';
    exfilTimer = CHOPPER_INBOUND_S;
    if (A.uplinkSurge) A.uplinkSurge();
    else if (A.generatorRoar) A.generatorRoar();
    if (A.chopperInbound) A.chopperInbound();
    queueMsg('UPLINK ESTABLISHED — CHOPPER INBOUND', 'amber', 5);
    EN.state.agitation = 100;
    EN.hear(M.markers.G.x, M.markers.G.z, NOISE_UPLINK, now, true);
    EN.forceChase();
  }

  function onCircuitTimeout() {
    queueMsg('ROUTING LOCKOUT — GRID ALARM', 'red', 3);
    A.securityAlarm();
    EN.hear(M.markers.G.x, M.markers.G.z, NOISE_LASER, now, true);
    EN.forceInvestigate(M.markers.G.x, M.markers.G.z);
  }

  // ------------------------------------------------------------------
  // noise
  // ------------------------------------------------------------------
  function emitNoise(loud) {
    EN.hear(player.x, player.z, loud, now, true);
    recentLoud = Math.max(recentLoud, loud);
    auxLoud = Math.max(auxLoud, loud / NOISE_BURST);
  }

  // ------------------------------------------------------------------
  // scanning
  // ------------------------------------------------------------------
  function raySphere(ox, oy, oz, dx, dy, dz, s) {
    var lx = s.x - ox, ly = s.y - oy, lz = s.z - oz;
    var tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return -1;
    var d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    var r2 = s.r * s.r;
    if (d2 > r2) return -1;
    return tca - Math.sqrt(r2 - d2);
  }

  function castScanRay(dx, dy, dz) {
    var ox = vrScanOrigin ? vrScanOrigin.x : player.x;
    var oy = vrScanOrigin ? vrScanOrigin.y : player.eye;
    var oz = vrScanOrigin ? vrScanOrigin.z : player.z;
    var hit = M.raycast(ox, oy, oz, dx, dy, dz, SCAN_RANGE);
    var bestT = hit ? hit.t : SCAN_RANGE + 1;
    var color = null, life = POINT_LIFE;
    if (hit) {
      if (hit.type === 'door') color = C_DOOR;
      else if (hit.type === 'floor' && M.isSafeAt(hit.x, hit.z)) color = C_HARBOR;
      else color = hit.type === 'floor' ? C_FLOOR : (hit.type === 'ceil' ? C_CEIL : C_WALL);
    }

    // yellow laser beams
    var lt = M.rayLaser(ox, oy, oz, dx, dy, dz, SCAN_RANGE);
    if (lt > 0 && lt < bestT) {
      bestT = lt; color = C_YELLOW; life = 8;
    }

    // the Custodian — red returns, fast decay
    var sph = EN.spheres();
    for (var i = 0; i < sph.length; i++) {
      var t = raySphere(ox, oy, oz, dx, dy, dz, sph[i]);
      if (t > 0 && t < bestT) { bestT = t; color = C_RED; life = ENEMY_POINT_LIFE; }
    }
    // items
    for (i = 0; i < accessKeys.length; i++) {
      if (accessKeys[i].taken) continue;
      t = raySphere(ox, oy, oz, dx, dy, dz, { x: accessKeys[i].x, y: 0.9, z: accessKeys[i].z, r: 0.45 });
      if (t > 0 && t < bestT) { bestT = t; color = C_AMBER; life = POINT_LIFE; }
    }
    for (i = 0; i < memos.length; i++) {
      if (memos[i].read) continue;
      t = raySphere(ox, oy, oz, dx, dy, dz, { x: memos[i].x, y: 0.7, z: memos[i].z, r: 0.4 });
      if (t > 0 && t < bestT) { bestT = t; color = C_CYAN; life = POINT_LIFE; }
    }
    // locked blast doors — dark blue slab (also fills gaps if ray grazes)
    for (i = 0; i < M.markers.doors.length; i++) {
      var door = M.markers.doors[i];
      if (!door.locked) continue;
      t = raySphere(ox, oy, oz, dx, dy, dz, { x: door.x, y: 1.3, z: door.z, r: 1.15 });
      if (t > 0 && t < bestT) { bestT = t; color = C_DOOR; life = POINT_LIFE; }
    }
    if (!uplinkDone) {
      t = raySphere(ox, oy, oz, dx, dy, dz, { x: M.markers.G.x, y: 1.1, z: M.markers.G.z, r: 0.7 });
      if (t > 0 && t < bestT) { bestT = t; color = C_AMBER; life = POINT_LIFE; }
    }

    if (color === null || bestT > SCAN_RANGE) return;
    var j = 0.02; // sensor jitter (GDD §8.2)
    R.addPoint(
      ox + dx * bestT + (math.rand() - 0.5) * j,
      oy + dy * bestT + (math.rand() - 0.5) * j,
      oz + dz * bestT + (math.rand() - 0.5) * j,
      color[0], color[1], color[2], now, life
    );
  }

  function coneRay(fwd) {
    // random direction inside cone around fwd
    var theta = TRICKLE_CONE * Math.sqrt(math.rand());
    var phi = math.rand() * Math.PI * 2;
    // basis
    var up = Math.abs(fwd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    var rt = math.vnorm(math.vcross(fwd, up));
    var u2 = math.vcross(rt, fwd);
    var st = Math.sin(theta), ct = Math.cos(theta);
    var cp = Math.cos(phi), sp = Math.sin(phi);
    return [
      fwd[0] * ct + (rt[0] * cp + u2[0] * sp) * st,
      fwd[1] * ct + (rt[1] * cp + u2[1] * sp) * st,
      fwd[2] * ct + (rt[2] * cp + u2[2] * sp) * st
    ];
  }

  function updateScanner(dt) {
    // trickle
    if (trickleOn && !burst.active) {
      var fwd = vrScanDirection || math.dirFromYawPitch(player.yaw, player.pitch);
      for (var i = 0; i < TRICKLE_RAYS; i++) {
        var d = coneRay(fwd);
        castScanRay(d[0], d[1], d[2]);
      }
      A.scanTick();
      trickleNoiseTimer -= dt;
      if (trickleNoiseTimer <= 0) {
        trickleNoiseTimer = 0.25;
        emitNoise(NOISE_TRICKLE);
      }
    }

    // burst sweep
    if (burst.active) {
      var baseYaw = vrScanDirection
        ? Math.atan2(vrScanDirection[0], -vrScanDirection[2])
        : player.yaw;
      var basePitch = vrScanDirection
        ? Math.asin(math.clamp(vrScanDirection[1], -1, 1))
        : player.pitch;
      var t0 = burst.t;
      burst.t += dt;
      var t1 = Math.min(burst.t, BURST_TIME);
      var a0 = -BURST_HALF_FOV + (t0 / BURST_TIME) * 2 * BURST_HALF_FOV;
      var a1 = -BURST_HALF_FOV + (t1 / BURST_TIME) * 2 * BURST_HALF_FOV;
      for (var a = a0; a < a1; a += BURST_COL_STEP) {
        var yaw = baseYaw + a;
        for (var v = 0; v < BURST_V_SAMPLES; v++) {
          var pitch = basePitch - BURST_V_SPREAD + (v / (BURST_V_SAMPLES - 1)) * 2 * BURST_V_SPREAD
                    + (math.rand() - 0.5) * 0.03;
          pitch = math.clamp(pitch, -1.5, 1.5);
          var dd = math.dirFromYawPitch(yaw, pitch);
          castScanRay(dd[0], dd[1], dd[2]);
        }
      }
      if (burst.t >= BURST_TIME) {
        burst.active = false;
        burst.cooldown = BURST_COOLDOWN;
      }
    } else if (burst.cooldown > 0) {
      burst.cooldown -= dt;
      A.setCharge(1 - Math.max(0, burst.cooldown) / BURST_COOLDOWN, burst.cooldown > 0);
    }
  }

  function tryBurst() {
    if (burst.active || burst.cooldown > 0) return;
    burst.active = true;
    burst.t = 0;
    A.burstSweep();
    emitNoise(NOISE_BURST);
  }

  // ------------------------------------------------------------------
  // interaction & objectives
  // ------------------------------------------------------------------
  function inVR() { return VR && VR.active(); }

  function interactRange() { return inVR() ? INTERACT_RANGE_VR : INTERACT_RANGE; }

  function memoRange() { return inVR() ? MEMO_RANGE_VR : MEMO_RANGE; }

  function near(x, z, range) {
    var dx = x - player.x, dz = z - player.z;
    return dx * dx + dz * dz < range * range;
  }

  // Rotate vector by quaternion (x,y,z,w)
  function quatMulVec(qx, qy, qz, qw, x, y, z) {
    var ix = qw * x + qy * z - qz * y;
    var iy = qw * y + qz * x - qx * z;
    var iz = qw * z + qx * y - qy * x;
    var iw = -qx * x - qy * y - qz * z;
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
  }

  // Pip-Boy panel fixed to left controller orientation (raise wrist to read).
  function buildWristModel(wrist, bodyYaw) {
    var c = Math.cos(bodyYaw || 0), s = Math.sin(bodyYaw || 0);
    var gx, gy, gz, qx, qy, qz, qw;
    if (wrist) {
      gx = player.x + c * wrist.localX - s * wrist.localZ;
      gy = (VR && VR.worldYFromXR) ? VR.worldYFromXR(wrist.y) : wrist.y;
      gz = player.z + s * wrist.localX + c * wrist.localZ;
      qx = wrist.qx; qy = wrist.qy; qz = wrist.qz; qw = wrist.qw;
    } else {
      // Fallback if grip pose drops: left-front torso, upright
      gx = player.x - c * 0.22 - s * 0.18;
      gy = player.eye - 0.25;
      gz = player.z + s * 0.22 - c * 0.18;
      qx = 0; qy = 0; qz = 0; qw = 1;
    }

    function axis(lx, ly, lz) {
      var v = quatMulVec(qx, qy, qz, qw, lx, ly, lz);
      return [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]];
    }

    var right = math.vnorm(axis(1, 0, 0));
    var up0 = axis(0, 1, 0);
    var fwd = axis(0, 0, -1);
    // tilt panel toward the eyes (~55°)
    var tilt = 0.96;
    var ct = Math.cos(tilt), st = Math.sin(tilt);
    var up = math.vnorm([
      up0[0] * ct + fwd[0] * st,
      up0[1] * ct + fwd[1] * st,
      up0[2] * ct + fwd[2] * st
    ]);
    var normal = math.vnorm(math.vcross(right, up));
    right = math.vnorm(math.vcross(up, normal));

    // sit on top/inner face of left controller
    var off = axis(0.0, 0.045, 0.055);
    var px = gx + off[0], py = gy + off[1], pz = gz + off[2];

    var sx = 0.22, sy = 0.14;
    var m = new Float32Array(16);
    m[0] = right[0] * sx; m[1] = right[1] * sx; m[2] = right[2] * sx; m[3] = 0;
    m[4] = up[0] * sy; m[5] = up[1] * sy; m[6] = up[2] * sy; m[7] = 0;
    m[8] = normal[0]; m[9] = normal[1]; m[10] = normal[2]; m[11] = 0;
    m[12] = px; m[13] = py; m[14] = pz; m[15] = 1;
    return m;
  }

  function readMemo(i) {
    if (memos[i].read) return false;
    memos[i].read = true;
    queueMsg(MEMO_TEXTS[memos[i].i], 'cyan', 9);
    A.fuseChime();
    A.teletype();
    A.teletype();
    return true;
  }

  // Closest key/memo/door in front of the controller ray (VR-friendly pickup)
  function vrAimPick() {
    if (!vrScanDirection) return null;
    var ox = player.x, oz = player.z;
    var dx = vrScanDirection[0], dz = vrScanDirection[2];
    var fl = Math.sqrt(dx * dx + dz * dz);
    if (fl < 0.01) return null;
    dx /= fl; dz /= fl;
    var best = null, bestDot = VR_AIM_DOT;
    var i, tfx, tfz, dist, dot;
    for (i = 0; i < accessKeys.length; i++) {
      if (accessKeys[i].taken) continue;
      tfx = accessKeys[i].x - ox; tfz = accessKeys[i].z - oz;
      dist = Math.sqrt(tfx * tfx + tfz * tfz);
      if (dist > VR_AIM_MAX) continue;
      dot = (tfx * dx + tfz * dz) / dist;
      if (dot >= bestDot) { bestDot = dot; best = { kind: 'key', i: i, dist: dist }; }
    }
    for (i = 0; i < memos.length; i++) {
      if (memos[i].read) continue;
      tfx = memos[i].x - ox; tfz = memos[i].z - oz;
      dist = Math.sqrt(tfx * tfx + tfz * tfz);
      if (dist > VR_AIM_MAX) continue;
      dot = (tfx * dx + tfz * dz) / dist;
      if (dot >= bestDot) { bestDot = dot; best = { kind: 'memo', i: i, dist: dist }; }
    }
    for (i = 0; i < M.markers.doors.length; i++) {
      if (!M.markers.doors[i].locked) continue;
      tfx = M.markers.doors[i].x - ox; tfz = M.markers.doors[i].z - oz;
      dist = Math.sqrt(tfx * tfx + tfz * tfz);
      if (dist > VR_AIM_MAX) continue;
      dot = (tfx * dx + tfz * dz) / dist;
      if (dot >= bestDot) { bestDot = dot; best = { kind: 'door', i: i, dist: dist }; }
    }
    return best;
  }

  function takeKey(i) {
    if (accessKeys[i].taken) return;
    accessKeys[i].taken = true;
    keysCollected++;
    EN.addAgitationFloor(15);
    A.fuseChime();
    emitNoise(NOISE_INTERACT);
    queueMsg('ACCESS KEY RECOVERED ' + keysCollected + '/3', 'amber');
  }

  function interact() {
    if (CIR && CIR.isActive()) { CIR.rotateSelected(); return; }
    var range = interactRange();

    if (inVR()) {
      var pick = vrAimPick();
      if (pick && pick.kind === 'memo') {
        readMemo(pick.i);
        return;
      }
      if (pick && pick.kind === 'key' && pick.dist <= range) {
        takeKey(pick.i);
        return;
      }
      if (pick && pick.kind === 'door' && pick.dist <= range + 0.8) {
        // fall through to door unlock using that door via near() — force proximity by using door coords
        var aimed = M.markers.doors[pick.i];
        var needAim = aimed.keysRequired || (aimed.console ? 3 : 1);
        if (keysCollected < needAim) {
          if (aimed.console || aimed.id === 'D3') {
            pushMsg('CONSOLE DOOR — NEED ALL 3 KEYS (' + keysCollected + '/3)', 'amber');
          } else {
            pushMsg('BLAST DOOR LOCKED — NEED ACCESS KEY', 'amber');
          }
          return;
        }
        var unlockedAim = M.unlockDoor(aimed.id);
        if (unlockedAim) {
          doorsOpen = M.doorsOpenCount();
          A.clunk(0);
          emitNoise(NOISE_INTERACT);
          if (unlockedAim.console || unlockedAim.id === 'D3') {
            pushMsg('CONSOLE DOOR OPEN — JACK-IN READY', 'amber');
          } else {
            pushMsg('OPTIONAL BLAST DOOR OPEN (' + unlockedAim.id + ')', 'amber');
          }
        }
        return;
      }
    }

    for (var m = 0; m < memos.length; m++) {
      if (!memos[m].read && near(memos[m].x, memos[m].z, memoRange())) {
        if (readMemo(m)) return;
      }
    }

    for (var i = 0; i < accessKeys.length; i++) {
      if (!accessKeys[i].taken && near(accessKeys[i].x, accessKeys[i].z, range)) {
        takeKey(i);
        return;
      }
    }

    // unlock nearest locked door (D3 needs all 3 keys; D1/D2 optional, 1 key)
    for (i = 0; i < M.markers.doors.length; i++) {
      var door = M.markers.doors[i];
      if (!door.locked) continue;
      if (!near(door.x, door.z, range + 0.8)) continue;
      var need = door.keysRequired || (door.console ? 3 : 1);
      if (keysCollected < need) {
        if (door.console || door.id === 'D3') {
          pushMsg('CONSOLE DOOR — NEED ALL 3 KEYS (' + keysCollected + '/3)', 'amber');
        } else {
          pushMsg('BLAST DOOR LOCKED — NEED ACCESS KEY', 'amber');
        }
        return;
      }
      var unlocked = M.unlockDoor(door.id);
      if (unlocked) {
        doorsOpen = M.doorsOpenCount();
        A.clunk(0);
        emitNoise(NOISE_INTERACT);
        if (unlocked.console || unlocked.id === 'D3') {
          pushMsg('CONSOLE DOOR OPEN — JACK-IN READY', 'amber');
        } else {
          pushMsg('OPTIONAL BLAST DOOR OPEN (' + unlocked.id + ')', 'amber');
        }
      }
      return;
    }

    // jack-in console — only console-room door must be open
    if (near(M.markers.G.x, M.markers.G.z, range + 0.5)) {
      if (uplinkDone) {
        pushMsg('UPLINK ALREADY LIVE — MOVE TO LZ', 'amber');
        return;
      }
      if (M.isConsoleSealed()) {
        pushMsg('CONSOLE SEALED — OPEN CONSOLE DOOR (NEEDS 3 KEYS)', 'red');
        return;
      }
      if (CIR && CIR.isActive()) return;
      pushMsg('JACK-IN SEQUENCE — ROUTE THE MATRIX', 'amber');
      CIR.open(startExfil, onCircuitTimeout);
      return;
    }

    // LZ board during on-station
    if (exfilPhase === 'ON_STATION' && near(M.markers.X.x, M.markers.X.z, LZ_RADIUS)) {
      winGame();
      return;
    }
    if (exfilPhase === 'INBOUND' && near(M.markers.X.x, M.markers.X.z, LZ_RADIUS)) {
      queueMsg('LZ COLD — CHOPPER STILL INBOUND', '');
      return;
    }
    if (exfilPhase === 'NONE' && near(M.markers.X.x, M.markers.X.z, range + 0.4)) {
      queueMsg('LZ INACTIVE — COMPLETE UPLINK FIRST', '');
      return;
    }
  }

  function updateLasers(dt) {
    var id;
    for (id in laserCooldown) {
      if (laserCooldown[id] > 0) laserCooldown[id] -= dt;
    }
    var hit = M.laserHitPlayer(player.x, player.z, PLAYER_RADIUS + 0.15);
    if (!hit) return;
    if (laserCooldown[hit.id] > 0) return;
    laserCooldown[hit.id] = LASER_COOLDOWN;
    var mx = (hit.x0 + hit.x1) * 0.5, mz = (hit.z0 + hit.z1) * 0.5;
    A.securityAlarm();
    EN.hear(mx, mz, NOISE_LASER, now, false);
    EN.forceInvestigate(mx, mz);
    recentLoud = Math.max(recentLoud, NOISE_LASER);
    auxLoud = Math.max(auxLoud, 0.95);
    queueMsg('SECURITY ALARM — ' + hit.id + ' — IT HEARD THAT', 'amber', 4);
    // brief yellow paint of the single low beam
    var by = (hit.y0 + hit.y1) * 0.5;
    for (var i = 0; i < 48; i++) {
      var t = i / 47;
      R.addPoint(
        hit.x0 + (hit.x1 - hit.x0) * t + (math.rand() - 0.5) * 0.03,
        by + (math.rand() - 0.5) * 0.02,
        hit.z0 + (hit.z1 - hit.z0) * t + (math.rand() - 0.5) * 0.03,
        C_YELLOW[0], C_YELLOW[1], C_YELLOW[2], now, 4
      );
    }
  }

  function updateItems(dt) {
    // memos auto-read on walk-over
    for (var i = 0; i < memos.length; i++) {
      if (!memos[i].read && near(memos[i].x, memos[i].z, memoRange())) {
        readMemo(i);
      }
    }

    // chopper LZ beacon
    if (exfilPhase === 'INBOUND' || exfilPhase === 'ON_STATION') {
      beaconTimer -= dt;
      if (beaconTimer <= 0) {
        beaconTimer = exfilPhase === 'ON_STATION' ? 0.12 : 0.45;
        var X = M.markers.X;
        var flash = exfilPhase === 'ON_STATION' ? (Math.sin(now * 18) > 0) : (Math.sin(now * 4) > -0.2);
        if (flash) {
          var n = exfilPhase === 'ON_STATION' ? 70 : 35;
          for (var b = 0; b < n; b++) {
            var ang = math.rand() * Math.PI * 2;
            var rr = Math.sqrt(math.rand()) * LZ_RADIUS;
            R.addPoint(
              X.x + Math.cos(ang) * rr,
              0.05 + math.rand() * 0.35,
              X.z + Math.sin(ang) * rr,
              C_WHITE[0], C_WHITE[1], C_WHITE[2], now, BEACON_LIFE
            );
          }
        }
      }
    }

    // auto-board if standing in LZ during on-station
    if (exfilPhase === 'ON_STATION' && near(M.markers.X.x, M.markers.X.z, LZ_RADIUS)) {
      winGame();
      return;
    }

    // interact hints
    if (!curMsg && !(CIR && CIR.isActive())) {
      var hint = '';
      var hintRange = inVR() ? INTERACT_RANGE_VR : INTERACT_RANGE;
      var btn = inVR() ? '[A/X]' : '[E]';
      if (inVR()) {
        var aim = vrAimPick();
        if (aim && aim.kind === 'key' && aim.dist <= hintRange + 0.6) {
          hint = btn + ' RECOVER ACCESS KEY';
        } else if (aim && aim.kind === 'door' && aim.dist <= hintRange + 0.8) {
          var ad = M.markers.doors[aim.i];
          var an = ad.keysRequired || (ad.console ? 3 : 1);
          if (keysCollected < an) {
            hint = (ad.console || ad.id === 'D3')
              ? 'CONSOLE DOOR — NEED 3 KEYS (' + keysCollected + '/3)'
              : 'BLAST DOOR — NEED KEY';
          } else {
            hint = (ad.console || ad.id === 'D3')
              ? btn + ' OPEN CONSOLE DOOR'
              : btn + ' UNLOCK BLAST DOOR';
          }
        } else if (aim && aim.kind === 'memo' && aim.dist <= memoRange() + 0.4) {
          hint = btn + ' READ INTEL';
        }
      }
      for (i = 0; i < accessKeys.length; i++) {
        if (!accessKeys[i].taken && near(accessKeys[i].x, accessKeys[i].z, hintRange)) {
          hint = btn + ' RECOVER ACCESS KEY';
        }
      }
      for (i = 0; i < M.markers.doors.length; i++) {
        var hd = M.markers.doors[i];
        if (hd.locked && near(hd.x, hd.z, hintRange + 0.8)) {
          var needH = hd.keysRequired || (hd.console ? 3 : 1);
          if (keysCollected < needH) {
            hint = (hd.console || hd.id === 'D3')
              ? 'CONSOLE DOOR — NEED 3 KEYS (' + keysCollected + '/3)'
              : 'BLAST DOOR — NEED KEY';
          } else {
            hint = (hd.console || hd.id === 'D3')
              ? btn + ' OPEN CONSOLE DOOR'
              : btn + ' UNLOCK BLAST DOOR';
          }
        }
      }
      if (near(M.markers.G.x, M.markers.G.z, hintRange + 0.5) && !uplinkDone) {
        hint = M.isConsoleSealed()
          ? 'CONSOLE SEALED — OPEN D3 (3 KEYS)'
          : btn + ' JACK INTO CORE';
      }
      if (exfilPhase === 'ON_STATION' && near(M.markers.X.x, M.markers.X.z, LZ_RADIUS + 1)) {
        hint = 'ENTER FLASHING LZ — BOARD NOW';
      }
      for (i = 0; i < memos.length; i++) {
        if (!memos[i].read && near(memos[i].x, memos[i].z, memoRange())) {
          hint = inVR() ? btn + ' READ INTEL' : '';
        }
      }
      vrHudHint = hint;
      if (hint) { el.eventline.textContent = hint; el.eventline.className = ''; }
      else if (!msgQueue.length) el.eventline.textContent = '';
    } else if (curMsg) {
      vrHudHint = curMsg.text || '';
    } else {
      vrHudHint = '';
    }
  }

  function updateExfil(dt) {
    if (exfilPhase === 'INBOUND') {
      exfilTimer -= dt;
      if (exfilTimer <= 0) {
        exfilPhase = 'ON_STATION';
        exfilTimer = CHOPPER_LINGER_S;
        if (A.chopperOnStation) A.chopperOnStation();
        queueMsg('CHOPPER ON STATION — BOARD THE LZ', 'amber', 4);
      }
    } else if (exfilPhase === 'ON_STATION') {
      exfilTimer -= dt;
      if (exfilTimer <= 0) {
        failLeftBehind();
      }
    }
  }

  // ------------------------------------------------------------------
  // player movement
  // ------------------------------------------------------------------
  var strideAcc = 0;
  function updatePlayer(dt, vrInput) {
    if (CIR && CIR.isActive()) return; // locked into jack-in
    var crouch = !vrInput && (keys['ControlLeft'] || keys['ControlRight']);
    var wantSprint = vrInput
      ? (!!vrInput.sprint && !crouch)
      : ((keys['ShiftLeft'] || keys['ShiftRight']) && !crouch);

    var mx = 0, mz = 0;
    if (vrInput) {
      mx = vrInput.moveX;
      mz = vrInput.moveY;
      player.yaw = vrInput.heading;
    } else {
      if (keys['KeyW']) mz += 1;
      if (keys['KeyS']) mz -= 1;
      if (keys['KeyA']) mx -= 1;
      if (keys['KeyD']) mx += 1;
    }
    var moving = (mx !== 0 || mz !== 0);

    if (staminaExhausted && stamina >= 0.35) staminaExhausted = false;
    var sprint = wantSprint && moving && !staminaExhausted && stamina > STAMINA_MIN_SPRINT;
    if (sprint) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
      if (stamina <= 0) { stamina = 0; staminaExhausted = true; sprint = false; }
    } else {
      stamina = Math.min(STAMINA_MAX, stamina + STAMINA_RECOVER * dt * (moving ? 0.7 : 1));
    }

    var speed = crouch ? SPEED_CROUCH : (sprint ? SPEED_SPRINT : SPEED_WALK);

    var targetEye = crouch ? EYE_CROUCH : EYE_STAND;
    player.eye += (targetEye - player.eye) * Math.min(1, dt * 10);

    if (moving) {
      var l = Math.sqrt(mx * mx + mz * mz);
      if (l > 1) { mx /= l; mz /= l; }
      var sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
      // forward = (sin yaw, -cos yaw) in xz
      var dx = (mz * sy + mx * cy) * speed * dt;
      var dz = (-mz * cy + mx * sy) * speed * dt;
      var moved = M.moveWithCollision(player.x, player.z, player.x + dx, player.z + dz, PLAYER_RADIUS);
      var actual = Math.sqrt((moved.x - player.x) * (moved.x - player.x) + (moved.z - player.z) * (moved.z - player.z));
      player.x = moved.x; player.z = moved.z;

      strideAcc += actual;
      var stride = crouch ? 1.6 : (sprint ? 2.4 : 2.2);
      if (strideAcc > stride) {
        strideAcc = 0;
        var loud = crouch ? NOISE_CROUCH : (sprint ? NOISE_SPRINT : NOISE_WALK);
        emitNoise(loud);
        A.footstep(loud / NOISE_SPRINT);
      }
    }
  }

  // ------------------------------------------------------------------
  // event line typewriter
  // ------------------------------------------------------------------
  function queueMsg(text, cls, hold) {
    msgQueue.push({ text: text, cls: cls || '', hold: hold || (1.5 + text.length * 0.03) });
  }

  function updateMsg(dt) {
    if (!curMsg) {
      if (!msgQueue.length) return;
      curMsg = msgQueue.shift();
      msgChars = 0;
      msgHold = curMsg.hold;
      el.eventline.className = curMsg.cls;
    }
    if (msgChars < curMsg.text.length) {
      msgChars = Math.min(curMsg.text.length, msgChars + dt * 80);
      el.eventline.textContent = curMsg.text.slice(0, Math.floor(msgChars));
      if (Math.random() < 0.5) A.teletype();
    } else {
      msgHold -= dt;
      if (msgHold <= 0) { curMsg = null; el.eventline.textContent = ''; el.eventline.className = ''; }
    }
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }

  function updateHUD(dt) {
    runTime += dt;
    var totalSec = Math.floor(runTime);
    var mm = Math.floor(totalSec / 60), ss = totalSec % 60;
    el.timer.textContent = 'T+' + pad(mm, 2) + ':' + pad(ss, 2);
    var hh = Math.floor(totalSec / 3600);
    el.vcrClock.textContent = 'T+' + pad(hh, 2) + ':' + pad(mm % 60, 2) + ':' + pad(ss, 2);
    el.pts.textContent = 'PTS ' + pad(R.pointCount(), 6) + ' / ' + R.CAPACITY;

    var charge = burst.active ? 0 : (1 - Math.max(0, burst.cooldown) / BURST_COOLDOWN);
    var blocks = Math.round(charge * 8);
    var s = '';
    for (var i = 0; i < 8; i++) s += i < blocks ? '\u25AE' : '\u25AF';
    el.chg.textContent = s;

    el.obj.innerHTML = (function () {
      if (exfilPhase === 'ON_STATION') {
        return '<span class="energized">LZ ON STATION T-' + pad(Math.max(0, Math.ceil(exfilTimer)), 2) + '</span>';
      }
      if (exfilPhase === 'INBOUND') {
        return '<span class="energized">CHOPPER INBOUND T-' + pad(Math.max(0, Math.ceil(exfilTimer)), 2) + '</span>';
      }
      if (uplinkDone) return '<span class="energized">UPLINK LIVE</span>';
      if (M.isConsoleSealed()) {
        return 'KEY ' + keysCollected + '/3 · CONSOLE DOOR';
      }
      return 'KEY ' + keysCollected + '/3 · JACK-IN READY';
    })();
    vrHudObj = el.obj.textContent || el.obj.innerText || '';

    // AUX needle: own emission + live mic level
    auxLoud = Math.max(0, auxLoud - dt * 1.1);
    recentLoud = Math.max(0, recentLoud - dt * 14);
    var micL = (NS.mic && NS.mic.level) ? NS.mic.level() : 0;
    var shownAux = Math.max(auxLoud, micL);
    el.auxFill.style.width = Math.min(100, shownAux * 100) + '%';
    if (el.staFill) {
      el.staFill.style.width = Math.min(100, stamina * 100) + '%';
      el.staFill.style.background = staminaExhausted
        ? 'rgba(255,80,80,0.95)'
        : (stamina < 0.3 ? 'rgba(255,179,71,0.95)' : '');
    }

    if (R.setVRHud) {
      R.setVRHud({
        hint: vrHudHint,
        obj: vrHudObj,
        aux: shownAux,
        stamina: stamina,
        exhausted: staminaExhausted,
        timer: el.timer.textContent,
        chg: el.chg.textContent,
        contacts: EN.contacts ? EN.contacts() : [{ x: EN.state.x, z: EN.state.z, state: EN.state.state }],
        yaw: player.yaw,
        px: player.x,
        pz: player.z
      });
    }

    // click direction tick (accessibility twin, GDD §7.4)
    if (clickTickFade > 0) {
      clickTickFade -= dt * 1.6;
      el.auxTick.style.opacity = Math.max(0, clickTickFade);
    }
  }

  function onEnemyClick(dist, pan) {
    if (dist < 12) {
      clickTickFade = 1;
      el.auxTick.style.left = (50 + math.clamp(pan, -1, 1) * 46) + '%';
      el.auxTick.style.opacity = 1;
    }
  }

  // heartbeat proximity layer
  var heartTimer = 0;
  function updateHeartbeat(dt) {
    var dx = EN.state.x - player.x, dz = EN.state.z - player.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 10 || EN.state.state === 'DORMANT') return;
    heartTimer -= dt;
    if (heartTimer <= 0) {
      var t = 1 - dist / 10; // 0..1 close
      heartTimer = math.lerp(1.1, 0.42, t);
      A.heartbeat(0.4 + t * 0.6);
    }
  }

  // ------------------------------------------------------------------
  // main loop
  // ------------------------------------------------------------------
  function frame(ts) {
    requestAnimationFrame(frame);
    if (VR && VR.active()) return;
    processFrame(ts, null);
  }

  function processFrame(ts, xrData) {
    var dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;
    now = ts / 1000;

    var tear = false;

    if (state === 'PLAY') {
      var vrInput = xrData ? xrData.input : null;

      if (CIR && CIR.isActive()) {
        if (vrInput && vrInput.interactPressed) CIR.rotateSelected();
        if (vrInput && R.setWristModel) {
          R.setWristModel(buildWristModel(vrInput.wrist, vrInput.bodyYaw));
        }
        CIR.update(dt);
        updateExfil(dt);
        updateMsg(dt);
        updateHUD(dt);
      } else {
        updatePlayer(dt, vrInput);

        if (vrInput) {
          trickleOn = vrInput.trickle;
          vrScanDirection = vrInput.aimDirection;
          if (vrInput.aimOrigin) {
            var c = Math.cos(vrInput.bodyYaw), s = Math.sin(vrInput.bodyYaw);
            vrScanOrigin = {
              x: player.x + c * vrInput.aimOrigin.localX - s * vrInput.aimOrigin.localZ,
              y: VR.worldYFromXR ? VR.worldYFromXR(vrInput.aimOrigin.y) : vrInput.aimOrigin.y,
              z: player.z + s * vrInput.aimOrigin.localX + c * vrInput.aimOrigin.localZ
            };
          } else {
            vrScanOrigin = null;
          }
          if (R.setWristModel) {
            R.setWristModel(buildWristModel(vrInput.wrist, vrInput.bodyYaw));
          }
          if (vrInput.burstPressed) tryBurst();
          if (vrInput.interactPressed) interact();
        } else {
          vrScanOrigin = null;
          vrScanDirection = null;
          if (R.setWristModel) R.setWristModel(null);
        }

        updateScanner(dt);
        updateLasers(dt);
        updateItems(dt);
        updateExfil(dt);
        if (NS.mic) NS.mic.tick(dt, state === 'PLAY', function (loud) { emitNoise(loud); });
        EN.update(dt, player, now, { onKill: onKill, onEnemyClick: onEnemyClick });
        updateHeartbeat(dt);
        updateMsg(dt);
        updateHUD(dt);
      }

      if (EN.state.agitation > 70) {
        tearTimer -= dt;
        if (tearTimer <= 0) { tearTimer = 0.7 + math.rand() * 1.5; tear = true; }
      }

      // tape interference: the closer / angrier it is, the worse the signal
      var gdx = EN.state.x - player.x, gdz = EN.state.z - player.z;
      var gdist = Math.sqrt(gdx * gdx + gdz * gdz);
      var prox = EN.state.state === 'DORMANT' ? 0 : math.clamp(1 - gdist / 9, 0, 1);
      var agit = math.clamp((EN.state.agitation - 45) / 55, 0, 1);
      var gTarget = Math.max(prox * prox, agit * 0.45)
                  + (EN.state.state === 'CHASE' ? 0.25 : 0);
      glitchLevel += (Math.min(1, gTarget) - glitchLevel) * Math.min(1, dt * 5);

      // ambient tape damage: occasional pops even when it's far away
      popTimer -= dt;
      if (popTimer <= 0) { popTimer = 5 + math.rand() * 9; glitchPop = 0.45 + math.rand() * 0.4; }
      glitchPop = Math.max(0, glitchPop - dt * 3.5);
    } else if (state === 'DYING') {
      dieTimer += dt;
      var speedF = reducedFlash ? 0.45 : 1.4;
      floodLevel = Math.min(reducedFlash ? 0.4 : 0.85, dieTimer * speedF);
      // red flood of returns around the player
      for (var i = 0; i < (reducedFlash ? 60 : 220); i++) {
        var ang = math.rand() * Math.PI * 2, rr = math.rand() * 2.5;
        R.addPoint(player.x + Math.cos(ang) * rr, math.rand() * 2.4, player.z + Math.sin(ang) * rr,
          C_RED[0], C_RED[1], C_RED[2], now, 1.5);
      }
      if (dieTimer > 1.4) { floodLevel = 0; finishDeath(); }
    }

    if (xrData) {
      R.renderXR(VR.viewsForPose(xrData.pose, player), VR.framebuffer(), now);
    } else {
      var aspect = el.canvas.width / Math.max(1, el.canvas.height);
      var proj = math.mat4Perspective(70 * Math.PI / 180, aspect, 0.05, 220);
      // handheld camcorder drift: tiny, slow, never enough to spoil aim
      var swayYaw = (Math.sin(now * 0.7) + Math.sin(now * 1.13) * 0.5) * 0.0028;
      var swayPitch = (Math.sin(now * 0.9 + 2.0) + Math.sin(now * 1.31) * 0.5) * 0.0022;
      var fwd = math.dirFromYawPitch(player.yaw + swayYaw, player.pitch + swayPitch);
      var eye = [player.x, player.eye, player.z];
      var view = math.mat4LookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
      var glitch = Math.min(1, glitchLevel + glitchPop);
      if (state === 'DYING') glitch = 1;
      if (reducedFlash) glitch *= 0.35;
      R.render(proj, view, now, { tear: tear, flood: floodLevel, glitch: glitch });
    }
  }

  NS.game = {
    init: init,
    fusesCollected: function () { return keysCollected; },
    onVRStart: function () {
      if (A.stopAllTransient) A.stopAllTransient();
      if (!runActive) startRun();
      state = 'PLAY';
      showScreen(null);
      lastFrame = performance.now();
      if (NS.mic) NS.mic.start();
    },
    onVREnd: function () {
      trickleOn = false;
      vrScanOrigin = null;
      vrScanDirection = null;
      if (R.setWristModel) R.setWristModel(null);
      if (NS.mic) NS.mic.stop();
      if (state === 'PLAY') {
        state = 'CONTROLS';
        showScreen('controls');
      }
      lastFrame = performance.now();
    },
    onVRError: function (error) {
      $('vr-note').textContent = 'VR START FAILED: ' + (error && error.message ? error.message : error);
    },
    onXRFrame: function (time, xrFrame, pose, input, bodyYaw) {
      void xrFrame; void bodyYaw;
      processFrame(time, { pose: pose, input: input });
    },
    // test instrumentation (headless smoke harness)
    debug: {
      start: function () { startRun(); state = 'PLAY'; showScreen(null); },
      setTrickle: function (v) { trickleOn = v; },
      burst: function () { tryBurst(); },
      snapshot: function () {
        return {
          state: state,
          points: R.pointCount(),
          px: player.x, pz: player.z,
          enemy: EN.state.state, agitation: EN.state.agitation
        };
      }
    }
  };

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { NS.game.init(); });
    } else {
      NS.game.init();
    }
  }
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
