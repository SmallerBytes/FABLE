/* HOLLOW — game.js : states, player, scanner, items, finale, HUD, main loop. */
(function (NS) {
  'use strict';

  var M, R, A, EN, VR, math;

  // ---- tuning constants (GDD §3) ----
  var EYE_STAND = 1.6, EYE_CROUCH = 1.0;
  var SPEED_WALK = 3.2, SPEED_SPRINT = 5.6, SPEED_CROUCH = 1.6;
  var PLAYER_RADIUS = 0.35;
  var NOISE_CROUCH = 2, NOISE_WALK = 7, NOISE_SPRINT = 16;
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

  // ---- palette (GDD §3.2) ----
  var C_WALL = [0.486, 1.0, 0.608];
  var C_FLOOR = [0.18, 0.52, 0.46];
  var C_CEIL = [0.30, 0.72, 0.42];
  var C_HARBOR = [0.15, 1.0, 0.35];   // safe-zone LiDAR returns
  var C_YELLOW = [1.0, 0.92, 0.12];   // laser alarm beams
  var C_AMBER = [1.0, 0.70, 0.28];
  var C_CYAN = [0.43, 0.91, 0.91];
  var C_RED = [1.0, 0.27, 0.27];
  var C_WHITE = [1.0, 1.0, 1.0];
  var NOISE_LASER = 32;
  var LASER_COOLDOWN = 10;

  var MEMO_TEXTS = [
    "DR. OKONKWO, ACOUSTICS — IT DOESN'T HAVE EYES. IT NEVER HAD EYES. MARCHETTI SAYS IT SEES THE ROOM THE WAY OUR RANGEFINDER DOES. PULSE AND RETURN. IT LIKED THE RD-9 TESTS. IT WOULD STAND AT THE GLASS. LISTENING.",
    "MARCHETTI, CONTAINMENT — DAY 3 WITHOUT POWER. WE MOVE WHEN IT MOVES. DO NOT USE THE RANGING UNIT INDOORS. I WATCHED IT TAKE BECK MID-SWEEP. IT COMES TO THE CLICKING. IT COMES FAST.",
    "UNSIGNED, MESS HALL — GENERATOR FUSES PULLED AND HIDDEN. WE DID IT ON PURPOSE. THE EXIT DOOR HELD IT IN. IF YOU POWER THE DOOR YOU ARE OPENING THE DOOR. DECIDE IF GOING HOME IS WORTH THAT.",
    "DR. OKONKWO, FINAL — IT ISN'T HUNTING US. IT'S CALIBRATING. EVERY SCREAM IS A RETURN PULSE. IT IS BUILDING A MAP OF US. BE NOTHING. BE NOWHERE. BE QUIET."
  ];

  var BOOT_LINES = [
    "FABLE DYNAMICS RD-9 RANGING WORKSTATION",
    "ROM 0.7.2  (C) 1988 FABLE DYNAMICS / APPLIED OPTICS DIV",
    "",
    "SELF TEST ............. OK",
    "PHOSPHOR ARRAY ........ OK",
    "PULSE HEAD ............ OK",
    "POINT STORE 700000 .... OK",
    "ACOUSTIC BAFFLE ....... MISSING",
    "",
    "DISPATCH 88-10-22 / OPERATOR HALSE, W.",
    "SITE C SUBLEVEL 2 IS DARK. GRID DOWN 11 DAYS.",
    "RECOVER 3 FUSES. RESTORE GENERATOR.",
    "EXIT VIA FREIGHT DOOR. SURVEY TEAM NOT RESPONDING.",
    "PROCEED ALONE."
  ];

  var WIN_LINES = [
    "FREIGHT DOOR CYCLED. SURFACE REACHED 06:12.",
    "OPERATOR HALSE RECOVERED. UNIT RD-9 RECOVERED.",
    "",
    "SITE C SEALED PERMANENT BY ORDER F.D. BOARD 88-11-02.",
    "",
    "NOTE APPENDED 1989:",
    "SPECIMEN MANIFEST LISTS TWO.",
    "",
    "( ARCHIVE TAPE 7 ENDS )"
  ];

  // ---- state ----
  var state = 'BOOT'; // BOOT | CONTROLS | PLAY | DYING | DEAD | WIN
  var player = { x: 0, z: 0, yaw: 0, pitch: 0, eye: EYE_STAND };
  var keys = {};
  var trickleOn = false;
  var vrScanOrigin = null, vrScanDirection = null;
  var trickleNoiseTimer = 0;
  var burst = { active: false, t: 0, cooldown: 0 };
  var fuses = [], memos = [];
  var fusesCollected = 0, fusesSeated = 0, seatLockout = 0;
  var powered = false, beaconTimer = 0;
  var auxLoud = 0, recentLoud = 0;
  var tearTimer = 0, floodLevel = 0, dieTimer = 0;
  var glitchLevel = 0, glitchPop = 0, popTimer = 5;
  var runTime = 0;
  var now = 0, lastFrame = 0;
  var sens = 0.0022, reducedFlash = false;
  var deathCause = 'quiet';
  var clickTickFade = 0;
  var laserCooldown = {};   // id -> remaining seconds

  // typewriter event line
  var msgQueue = [], curMsg = null, msgChars = 0, msgHold = 0;

  var el = {};

  // ------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function init() {
    M = NS.map; R = NS.render; A = NS.audio; EN = NS.enemy; VR = NS.vr; math = NS.math;

    el.canvas = $('glcanvas');
    el.hud = $('hud');
    el.timer = $('hud-timer'); el.pts = $('hud-pts'); el.chg = $('hud-chg'); el.obj = $('hud-obj');
    el.auxFill = $('aux-fill'); el.auxTick = $('aux-tick');
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

  // ------------------------------------------------------------------
  // input
  // ------------------------------------------------------------------
  function bindInput() {
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Enter') {
        if (state === 'BOOT') { finishBoot(); }
        else if (state === 'DEAD') { showScreen('controls'); state = 'CONTROLS'; }
        else if (state === 'WIN') { state = 'BOOT'; startBootType(); }
      }
      if (e.code === 'Space') {
        if (state === 'PLAY') { e.preventDefault(); tryBurst(); }
      }
      if (e.code === 'KeyE' && state === 'PLAY') interact();
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

    el.controls.addEventListener('click', function (e) {
      if (e.target && (e.target.id === 'enter-vr' || e.target.id === 'btn-mission-map' || e.target.closest('#btn-mission-map'))) return;
      A.ensure();
      A.startAmbient();
      if (NS.mic) NS.mic.start();
      el.canvas.requestPointerLock();
    });
    el.boot.addEventListener('click', function (e) {
      if (state === 'BOOT' && e.target.tagName !== 'INPUT') finishBoot();
    });
    el.death.addEventListener('click', function () {
      if (state === 'DEAD') { showScreen('controls'); state = 'CONTROLS'; }
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
    R.clearPoints();
    EN.reset();
    math.srand(0x1988 ^ (Date.now() & 0xffff));
    player.x = M.markers.P.x; player.z = M.markers.P.z;
    player.yaw = 0; player.pitch = 0; player.eye = EYE_STAND;
    fuses = M.markers.fuses.map(function (f) { return { x: f.x, z: f.z, taken: false }; });
    memos = M.markers.memos.map(function (m, i) { return { x: m.x, z: m.z, read: false, i: i }; });
    fusesCollected = 0; fusesSeated = 0; seatLockout = 0;
    powered = false; beaconTimer = 0;
    burst.active = false; burst.t = 0; burst.cooldown = 0;
    trickleOn = false; auxLoud = 0; recentLoud = 0;
    floodLevel = 0; runTime = 0; deathCause = 'quiet';
    glitchLevel = 0; glitchPop = 0; popTimer = 5;
    laserCooldown = {};
    msgQueue = []; curMsg = null;
    queueMsg('RD-9 RANGING ACTIVE. RETURNS ARE TRUTH.', '');
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
    if (A.sting) A.sting(false);
    document.exitPointerLock();
    if (VR.active()) VR.end();
    // hard-cut any lingering chase layers; death one-shot self-ends by 4s
    setTimeout(function () {
      if (state === 'DEAD' || state === 'CONTROLS' || state === 'BOOT') {
        if (A.stopAllTransient) A.stopAllTransient();
      }
    }, 4200);
    var lines = {
      sweep: 'MID-SWEEP. LIKE BECK.',
      loud: 'YOU LIT THE DARK. THE DARK ANSWERED.',
      steps: 'IT HEARD YOUR FOOTSTEPS THREE ROOMS AWAY.',
      quiet: 'YOU WERE QUIET. IT HEARD YOUR HEART.'
    };
    el.epitaph.textContent = lines[deathCause];
    showScreen('death');
  }

  function winGame() {
    runActive = false;
    state = 'WIN';
    document.exitPointerLock();
    if (VR.active()) VR.end();
    el.winText.textContent = WIN_LINES.join('\n');
    showScreen('win');
    A.sting(false);
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
      if (hit.type === 'floor' && M.isSafeAt(hit.x, hit.z)) color = C_HARBOR;
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
    for (i = 0; i < fuses.length; i++) {
      if (fuses[i].taken) continue;
      t = raySphere(ox, oy, oz, dx, dy, dz, { x: fuses[i].x, y: 0.9, z: fuses[i].z, r: 0.45 });
      if (t > 0 && t < bestT) { bestT = t; color = C_AMBER; life = POINT_LIFE; }
    }
    for (i = 0; i < memos.length; i++) {
      if (memos[i].read) continue;
      t = raySphere(ox, oy, oz, dx, dy, dz, { x: memos[i].x, y: 0.7, z: memos[i].z, r: 0.4 });
      if (t > 0 && t < bestT) { bestT = t; color = C_CYAN; life = POINT_LIFE; }
    }
    if (fusesSeated < 3) {
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

  function readMemo(i) {
    if (memos[i].read) return false;
    memos[i].read = true;
    queueMsg(MEMO_TEXTS[memos[i].i], 'cyan', 9);
    A.fuseChime();
    A.teletype();
    A.teletype();
    return true;
  }

  // Closest fuse/memo in front of the controller ray (VR-friendly pickup)
  function vrAimPick() {
    if (!vrScanDirection) return null;
    var ox = player.x, oz = player.z;
    var dx = vrScanDirection[0], dz = vrScanDirection[2];
    var fl = Math.sqrt(dx * dx + dz * dz);
    if (fl < 0.01) return null;
    dx /= fl; dz /= fl;
    var best = null, bestDot = VR_AIM_DOT;
    var i, tfx, tfz, dist, dot;
    for (i = 0; i < fuses.length; i++) {
      if (fuses[i].taken) continue;
      tfx = fuses[i].x - ox; tfz = fuses[i].z - oz;
      dist = Math.sqrt(tfx * tfx + tfz * tfz);
      if (dist > VR_AIM_MAX) continue;
      dot = (tfx * dx + tfz * dz) / dist;
      if (dot >= bestDot) { bestDot = dot; best = { kind: 'fuse', i: i, dist: dist }; }
    }
    for (i = 0; i < memos.length; i++) {
      if (memos[i].read) continue;
      tfx = memos[i].x - ox; tfz = memos[i].z - oz;
      dist = Math.sqrt(tfx * tfx + tfz * tfz);
      if (dist > VR_AIM_MAX) continue;
      dot = (tfx * dx + tfz * dz) / dist;
      if (dot >= bestDot) { bestDot = dot; best = { kind: 'memo', i: i, dist: dist }; }
    }
    return best;
  }

  function interact() {
    var range = interactRange();

    if (inVR()) {
      var pick = vrAimPick();
      if (pick && pick.kind === 'memo') {
        readMemo(pick.i);
        return;
      }
      if (pick && pick.kind === 'fuse' && pick.dist <= range) {
        fuses[pick.i].taken = true;
        fusesCollected++;
        EN.addAgitationFloor(15);
        A.fuseChime();
        emitNoise(NOISE_INTERACT);
        queueMsg('FUSE RECOVERED ' + fusesCollected + '/3', 'amber');
        return;
      }
    }

    // memos (desktop walk-over is in updateItems; VR can also press interact while close)
    for (var m = 0; m < memos.length; m++) {
      if (!memos[m].read && near(memos[m].x, memos[m].z, memoRange())) {
        if (readMemo(m)) return;
      }
    }

    // fuse pickup
    for (var i = 0; i < fuses.length; i++) {
      if (!fuses[i].taken && near(fuses[i].x, fuses[i].z, range)) {
        fuses[i].taken = true;
        fusesCollected++;
        EN.addAgitationFloor(15);            // GDD §5.4 — endgame pressure
        A.fuseChime();
        emitNoise(NOISE_INTERACT);
        queueMsg('FUSE RECOVERED ' + fusesCollected + '/3', 'amber');
        return;
      }
    }
    // generator seating
    if (near(M.markers.G.x, M.markers.G.z, range + 0.5)) {
      if (seatLockout > 0) return;
      if (fusesSeated >= fusesCollected) {
        queueMsg(fusesCollected >= 3 ? 'SOCKET JAMMED' : 'NO FUSE IN HAND', '');
        return;
      }
      fusesSeated++;
      seatLockout = 1.5;                     // forced noise ritual (GDD §6.1)
      A.clunk(0);
      emitNoise(NOISE_INTERACT);
      if (fusesSeated < 3) {
        queueMsg('FUSE SEATED ' + fusesSeated + '/3', 'amber');
      } else {
        powerOn();
      }
      return;
    }
    // exit door
    if (near(M.markers.X.x, M.markers.X.z, range + 0.4)) {
      if (!powered) {
        queueMsg('DOOR DEAD — NO POWER', 'red');
        emitNoise(NOISE_INTERACT);
        return;
      }
      A.doorGrind();
      queueMsg('DOOR CYCLING', '');
      setTimeout(function () { if (state === 'PLAY') winGame(); }, 850);
      return;
    }
  }

  function powerOn() {
    powered = true;
    A.generatorRoar();
    queueMsg('GENERATOR ONLINE — EXIT ENERGIZED', 'amber');
    // global scripted noise: it knows exactly where you are (GDD §6.2)
    EN.state.agitation = 100;
    EN.hear(M.markers.G.x, M.markers.G.z, 200, now, true);
    EN.forceChase();
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
    // brief yellow paint of the beam for confirmation
    for (var i = 0; i < 60; i++) {
      var t = i / 59;
      R.addPoint(
        hit.x0 + (hit.x1 - hit.x0) * t + (math.rand() - 0.5) * 0.05,
        hit.y0 + (hit.y1 - hit.y0) * math.rand(),
        hit.z0 + (hit.z1 - hit.z0) * t + (math.rand() - 0.5) * 0.05,
        C_YELLOW[0], C_YELLOW[1], C_YELLOW[2], now, 4
      );
    }
  }

  function updateItems(dt) {
    if (seatLockout > 0) seatLockout -= dt;

    // memos auto-read on walk-over
    for (var i = 0; i < memos.length; i++) {
      if (!memos[i].read && near(memos[i].x, memos[i].z, memoRange())) {
        readMemo(i);
      }
    }

    // exit beacon — the only self-refreshing returns in the game (GDD §6.2)
    if (powered) {
      beaconTimer -= dt;
      if (beaconTimer <= 0) {
        beaconTimer = 0.5;
        var X = M.markers.X;
        for (var b = 0; b < 40; b++) {
          R.addPoint(
            X.x + (math.rand() - 0.5) * 2.2,
            math.rand() * 2.8,
            X.z + (math.rand() - 0.5) * 2.2,
            C_WHITE[0], C_WHITE[1], C_WHITE[2], now, BEACON_LIFE
          );
        }
      }
    }

    // interact hints (only when the line is idle)
    if (!curMsg) {
      var hint = '';
      var hintRange = inVR() ? INTERACT_RANGE_VR : INTERACT_RANGE;
      for (i = 0; i < fuses.length; i++) {
        if (!fuses[i].taken && near(fuses[i].x, fuses[i].z, hintRange)) {
          hint = inVR() ? '[A] RECOVER FUSE (AIM CYAN/AMBER)' : '[E] RECOVER FUSE';
        }
      }
      if (near(M.markers.G.x, M.markers.G.z, hintRange + 0.5) && fusesSeated < 3) {
        hint = inVR() ? '[A] SEAT FUSE' : '[E] SEAT FUSE';
      }
      if (near(M.markers.X.x, M.markers.X.z, hintRange + 0.4)) {
        hint = powered
          ? (inVR() ? '[A] OPEN FREIGHT DOOR' : '[E] OPEN FREIGHT DOOR')
          : (inVR() ? '[A] FREIGHT DOOR (DEAD)' : '[E] FREIGHT DOOR (DEAD)');
      }
      for (i = 0; i < memos.length; i++) {
        if (!memos[i].read && near(memos[i].x, memos[i].z, memoRange())) {
          hint = inVR() ? '[A] READ MEMO' : '';
        }
      }
      if (hint) { el.eventline.textContent = hint; el.eventline.className = ''; }
      else if (!msgQueue.length) el.eventline.textContent = '';
    }
  }

  // ------------------------------------------------------------------
  // player movement
  // ------------------------------------------------------------------
  var strideAcc = 0;
  function updatePlayer(dt, vrInput) {
    var crouch = !vrInput && (keys['ControlLeft'] || keys['ControlRight']);
    var sprint = !vrInput && (keys['ShiftLeft'] || keys['ShiftRight']) && !crouch;
    var speed = crouch ? SPEED_CROUCH : (sprint ? SPEED_SPRINT : SPEED_WALK);

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

    var targetEye = crouch ? EYE_CROUCH : EYE_STAND;
    player.eye += (targetEye - player.eye) * Math.min(1, dt * 10);

    if (mx !== 0 || mz !== 0) {
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
      var stride = crouch ? 1.6 : (sprint ? 2.6 : 2.2);
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
    var mm = Math.floor(runTime / 60), ss = Math.floor(runTime % 60);
    el.timer.textContent = 'T+' + pad(mm, 2) + ':' + pad(ss, 2);

    // camcorder wall clock — Halse went down at 05:47
    var wall = 5 * 3600 + 47 * 60 + Math.floor(runTime);
    var wh = Math.floor(wall / 3600), wm = Math.floor((wall % 3600) / 60), ws = wall % 60;
    el.vcrClock.textContent = 'AM ' + wh + ':' + pad(wm, 2) + ':' + pad(ws, 2);
    el.pts.textContent = 'PTS ' + pad(R.pointCount(), 6) + ' / ' + R.CAPACITY;

    var charge = burst.active ? 0 : (1 - Math.max(0, burst.cooldown) / BURST_COOLDOWN);
    var blocks = Math.round(charge * 8);
    var s = '';
    for (var i = 0; i < 8; i++) s += i < blocks ? '\u25AE' : '\u25AF';
    el.chg.textContent = s;

    el.obj.innerHTML = powered
      ? '<span class="energized">EXIT ENERGIZED</span>'
      : 'FUSE ' + fusesCollected + '/3' + (fusesCollected > fusesSeated ? ' (SEAT ' + fusesSeated + '/3)' : '');

    // AUX needle: own emission, decaying over ~1 s
    auxLoud = Math.max(0, auxLoud - dt * 1.1);
    recentLoud = Math.max(0, recentLoud - dt * 14);
    el.auxFill.style.width = Math.min(100, auxLoud * 100) + '%';

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
      updatePlayer(dt, vrInput);

      if (vrInput) {
        trickleOn = vrInput.trickle;
        vrScanDirection = vrInput.aimDirection;
        if (vrInput.aimOrigin) {
          var c = Math.cos(vrInput.bodyYaw), s = Math.sin(vrInput.bodyYaw);
          vrScanOrigin = {
            x: player.x + c * vrInput.aimOrigin.localX - s * vrInput.aimOrigin.localZ,
            y: vrInput.aimOrigin.y,
            z: player.z + s * vrInput.aimOrigin.localX + c * vrInput.aimOrigin.localZ
          };
        } else {
          vrScanOrigin = null;
        }
        if (vrInput.burstPressed) tryBurst();
        if (vrInput.interactPressed) interact();
      } else {
        vrScanOrigin = null;
        vrScanDirection = null;
      }

      updateScanner(dt);
      updateLasers(dt);
      updateItems(dt);
      if (NS.mic) NS.mic.tick(dt, state === 'PLAY', function (loud) { emitNoise(loud); });
      EN.update(dt, player, now, { onKill: onKill, onEnemyClick: onEnemyClick });
      updateHeartbeat(dt);
      updateMsg(dt);
      updateHUD(dt);

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
    fusesCollected: function () { return fusesCollected; },
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
