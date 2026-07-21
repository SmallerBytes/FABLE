/* HOLLOW — enemy.js : the Custodian. Blind; hears everything. GDD §5. */
(function (NS) {
  'use strict';

  // Tuning constants (GDD §5 — kept 1:1 with the document)
  var SPEED_PATROL = 2.0;
  var SPEED_INVESTIGATE = 3.4;
  var SPEED_CHASE = 6.0;
  var KILL_RANGE = 1.3;
  var TOUCH_RANGE = 3.5;
  var CHASE_CONF = 0.75;
  var CHASE_LOSE_S = 6.0;
  var AGITATION_DECAY = 1.2;
  var DORMANT_WAKE = 12;
  var BIAS_THRESHOLD = 40;
  var WALL_ATTEN = 0.6;
  var RADIUS = 0.5;

  var M, math;

  var E = {
    x: 0, z: 0,
    state: 'DORMANT',
    agitation: 0,
    agitationFloor: 0
  };

  var path = null, pathIdx = 0;
  var repathTimer = 0;
  var investigateTarget = null, dwellTimer = 0, dwellAngle = 0;
  var lastNoiseFed = -999;
  var lastKnownX = 0, lastKnownZ = 0;
  var mustInvestigateAfterChase = false;
  var clickTimer = 0, stepDist = 0;
  var wakeTimer = 0;            // ambient wake: it always rises eventually
  var waypoints = [];
  var lairX = 0, lairZ = 0;
  // body presentation
  var facing = 0, animT = 0;
  var bodyCache = null;
  var skipX = 0, skipZ = 0, skipTimer = 0;

  function reset() {
    M = NS.map; math = NS.math;
    lairX = M.markers.C.x; lairZ = M.markers.C.z;
    E.x = lairX; E.z = lairZ;
    E.state = 'DORMANT';
    E.agitation = 0;
    E.agitationFloor = 0;
    path = null; pathIdx = 0; repathTimer = 0;
    investigateTarget = null; dwellTimer = 0;
    lastNoiseFed = -999;
    mustInvestigateAfterChase = false;
    clickTimer = 1.5; stepDist = 0; wakeTimer = 0;
    waypoints = M.patrolWaypoints();
    facing = 0; animT = 0; bodyCache = null;
    skipX = 0; skipZ = 0; skipTimer = 0;
  }

  function setPathTo(x, z) {
    path = M.astar(E.x, E.z, x, z);
    pathIdx = 0;
  }

  function distToPlayer(p) {
    var dx = p.x - E.x, dz = p.z - E.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // Perceived loudness model (GDD §3.4 / §5.1)
  function hear(x, z, loud, now, isPlayerNoise) {
    // Player noise from inside a safe harbor is heavily attenuated (EMCON)
    if (isPlayerNoise && M.isSafeAt(x, z)) {
      loud *= 0.15;
    }
    var dx = x - E.x, dz = z - E.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var walls = M.wallsBetween(E.x, E.z, x, z);
    var effective = loud * Math.pow(WALL_ATTEN, walls) - dist;
    if (effective <= 0) return;
    var conf = Math.min(1, effective / Math.max(loud, 0.01) + 0.15);
    E.agitation = Math.min(100, E.agitation + effective * 0.9);

    if (E.state === 'DORMANT') return; // wakes via agitation threshold only

    if (isPlayerNoise) lastNoiseFed = now;

    // Inside sanctuary: never escalate to CHASE from hearing alone
    if (isPlayerNoise && M.isSafeAt(x, z)) {
      if (E.state !== 'CHASE') {
        E.state = 'INVESTIGATE';
        investigateTarget = { x: x, z: z };
        dwellTimer = 0;
        setPathTo(x, z);
      }
      return;
    }

    if (conf >= CHASE_CONF && !mustInvestigateAfterChase && E.state !== 'CHASE') {
      enterChase();
    } else if (E.state !== 'CHASE') {
      E.state = 'INVESTIGATE';
      investigateTarget = { x: x, z: z };
      dwellTimer = 0;
      setPathTo(x, z);
    } else {
      // already chasing: refresh last known contact
      lastKnownX = x; lastKnownZ = z;
    }
  }

  function forceInvestigate(x, z) {
    if (E.state === 'DORMANT') {
      E.state = 'PATROL';
    }
    E.agitation = Math.min(100, E.agitation + 35);
    lastKnownX = x; lastKnownZ = z;
    lastNoiseFed = (typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000);
    mustInvestigateAfterChase = false;
    if (E.agitation >= 55) {
      enterChase();
      setPathTo(x, z);
    } else {
      if (E.state === 'CHASE') NS.audio.sting(false);
      E.state = 'INVESTIGATE';
      investigateTarget = { x: x, z: z };
      dwellTimer = 0;
      setPathTo(x, z);
    }
  }

  function enterChase() {
    E.state = 'CHASE';
    repathTimer = 0;
    NS.audio.sting(true);
  }
  function leaveChase(toInvestigateAt) {
    NS.audio.sting(false);
    mustInvestigateAfterChase = true;
    E.state = 'INVESTIGATE';
    investigateTarget = toInvestigateAt;
    dwellTimer = 0;
    setPathTo(toInvestigateAt.x, toInvestigateAt.z);
  }

  function pickPatrolTarget(p) {
    if (!waypoints.length) return null;
    var pool = waypoints;
    if (E.agitation > BIAS_THRESHOLD) {
      // bias toward the player's half of the map
      var half = waypoints.filter(function (w) {
        return (w.x < M.COLS() * M.CELL / 2) === (p.x < M.COLS() * M.CELL / 2);
      });
      if (half.length > 2) pool = half;
    }
    // exclude spawn-room area until first fuse taken (anti-frustration, GDD §5.5)
    if (NS.game && NS.game.fusesCollected && NS.game.fusesCollected() === 0) {
      var P = M.markers.P;
      var filtered = pool.filter(function (w) {
        var dx = w.x - P.x, dz = w.z - P.z;
        return dx * dx + dz * dz > 12 * 12;
      });
      if (filtered.length > 2) pool = filtered;
    }
    return pool[Math.floor(math.rand() * pool.length)];
  }

  function followPath(dt, speed) {
    if (!path || pathIdx >= path.length) return true; // arrived
    var wp = path[pathIdx];
    var dx = wp.x - E.x, dz = wp.z - E.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.6) { pathIdx++; return pathIdx >= path.length; }
    var step = speed * dt;
    var nx = E.x + dx / d * step, nz = E.z + dz / d * step;
    var moved = M.moveWithCollision(E.x, E.z, nx, nz, RADIUS);
    E.x = moved.x; E.z = moved.z;
    stepDist += step;
    // turn the body toward travel direction (shortest arc)
    var want = Math.atan2(dx, dz);
    var diff = want - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    facing += diff * Math.min(1, dt * 6);
    return false;
  }

  function emitMovementAudio(p, speed, now) {
    void now;
    var dist = distToPlayer(p);
    var walls = M.wallsBetween(E.x, E.z, p.x, p.z);
    var atten = Math.pow(WALL_ATTEN, walls) / (1 + dist * 0.16);
    // pan: project direction-to-enemy on the player's right vector
    var ang = Math.atan2(E.x - p.x, -(E.z - p.z)); // world bearing
    var rel = ang - p.yaw;
    var pan = Math.sin(rel);

    var stride = speed > 5 ? 1.4 : 2.0;
    if (stepDist > stride) {
      stepDist = 0;
      NS.audio.enemyStep(pan, Math.min(0.14, 0.25 * atten));
    }
    return { dist: dist, pan: pan, atten: atten };
  }

  function clickInterval() {
    switch (E.state) {
      case 'DORMANT': return 4.5;
      case 'PATROL': return 2.2;
      case 'INVESTIGATE': return 1.1;
      case 'CHASE': return 0.4;
    }
    return 2.2;
  }

  function update(dt, p, now, game) {
    // agitation decay toward floor
    E.agitation = Math.max(E.agitationFloor, E.agitation - AGITATION_DECAY * dt);
    NS.audio.setAgitation(E.agitation);
    animT += dt;

    var dist = distToPlayer(p);
    var playerSafe = M.isSafeAt(p.x, p.z);

    // touch-range certainty (anti-camping) — suppressed while player is in harbor
    if (dist < TOUCH_RANGE && E.state !== 'DORMANT' && !playerSafe) {
      lastNoiseFed = now;
      lastKnownX = p.x; lastKnownZ = p.z;
      if (E.state !== 'CHASE') {
        mustInvestigateAfterChase = false;
        enterChase();
      }
    }

    // kill check — safe zones block kill (sanctuary)
    if (dist < KILL_RANGE && E.state !== 'DORMANT' && !playerSafe) {
      game.onKill();
      return;
    }

    // If chasing into a harbor, break off at the edge
    if (E.state === 'CHASE' && playerSafe) {
      leaveChase({ x: p.x, z: p.z });
    }

    var speed = 0, arrived;
    switch (E.state) {
      case 'DORMANT':
        wakeTimer += dt;
        if (E.agitation > DORMANT_WAKE || wakeTimer > 120) {
          E.state = 'PATROL';
          path = null;
        }
        break;

      case 'PATROL':
        speed = SPEED_PATROL;
        if (!path || pathIdx >= path.length) {
          var t = pickPatrolTarget(p);
          if (t) setPathTo(t.x, t.z);
        }
        followPath(dt, speed);
        break;

      case 'INVESTIGATE':
        speed = SPEED_INVESTIGATE;
        arrived = followPath(dt, speed);
        if (arrived) {
          dwellTimer += dt;
          dwellAngle += dt * 1.6;
          // tight listening circle
          var cx = E.x + Math.cos(dwellAngle) * 0.5 * dt;
          var cz = E.z + Math.sin(dwellAngle) * 0.5 * dt;
          var mv = M.moveWithCollision(E.x, E.z, cx, cz, RADIUS);
          E.x = mv.x; E.z = mv.z;
          var dwellNeeded = 4 + math.rand() * 4;
          if (dwellTimer > dwellNeeded) {
            mustInvestigateAfterChase = false;
            E.state = 'PATROL';
            path = null;
          }
        }
        break;

      case 'CHASE':
        speed = SPEED_CHASE;
        repathTimer -= dt;
        var fed = (now - lastNoiseFed) < CHASE_LOSE_S;
        if (fed && repathTimer <= 0) {
          lastKnownX = p.x; lastKnownZ = p.z;
          setPathTo(p.x, p.z);
          repathTimer = 0.4;
        }
        followPath(dt, speed);
        if (!fed) {
          leaveChase({ x: lastKnownX, z: lastKnownZ });
        }
        break;
    }

    // ---- audio presence ----
    var au = emitMovementAudio(p, speed, now);
    clickTimer -= dt;
    if (clickTimer <= 0) {
      clickTimer = clickInterval() * (0.85 + math.rand() * 0.3);
      NS.audio.click(au.pan, Math.min(0.16, 0.30 * au.atten + 0.01));
      if (game.onEnemyClick) game.onEnemyClick(au.dist, au.pan);
    }
    NS.audio.setBreath(Math.max(0, (14 - au.dist) / 14) * 0.18 * au.atten * 8, au.pan);

    bodyCache = buildBody(dt);
  }

  // ------------------------------------------------------------------
  // body spheres for the scanner's ray tests (GDD: red returns)
  // A 2.6 m gaunt articulated figure instead of two blobs: hunched spine,
  // long neck, cocked head, arms that hang to the floor, claw fingers.
  // Posture is state-driven; rebuilt once per update and cached.
  // ------------------------------------------------------------------
  function buildBody(dt) {
    var out = [];
    var t = animT;
    var ca = Math.cos(facing), sa = Math.sin(facing);

    // chase: the form intermittently "skips" — renders displaced like a bad tape
    if (E.state === 'CHASE') {
      skipTimer -= dt;
      if (skipTimer <= 0) {
        if (skipX === 0 && skipZ === 0 && math.rand() < 0.35) {
          skipX = (math.rand() - 0.5) * 0.7;
          skipZ = (math.rand() - 0.5) * 0.7;
          skipTimer = 0.06 + math.rand() * 0.08;    // brief ghost offset
        } else {
          skipX = 0; skipZ = 0;
          skipTimer = 0.25 + math.rand() * 0.5;
        }
      }
    } else {
      skipX = 0; skipZ = 0;
    }

    var bx = E.x + skipX, bz = E.z + skipZ;

    // local frame: lx = right, lz = forward (matches facing = atan2(dx,dz))
    function add(lx, y, lz, r) {
      out.push({ x: bx + lx * ca + lz * sa, y: y, z: bz - lx * sa + lz * ca, r: r });
    }

    if (E.state === 'DORMANT') {
      // huddled mass in the lair — barely reads as a creature until it isn't
      var br = Math.sin(t * 0.45) * 0.04;            // slow breathing
      add(0, 0.38 + br, 0, 0.46);
      add(0.18, 0.62 + br, -0.18, 0.34);
      add(-0.2, 0.55 + br, 0.12, 0.3);
      add(0.05, 0.92 + br, 0.3, 0.17);               // tucked head
      add(0.4, 0.18, 0.35, 0.09);                    // one folded claw
      add(0.52, 0.14, 0.42, 0.05);
      return out;
    }

    var chase = E.state === 'CHASE';
    var invest = E.state === 'INVESTIGATE';

    // posture
    var lean = chase ? 0.45 : (invest ? 0.3 : 0.12);  // forward pitch of upper body
    var gait = chase ? 9.0 : (invest ? 0 : 2.6);      // stride frequency
    var bob = gait > 0 ? Math.abs(Math.sin(t * gait)) * (chase ? 0.08 : 0.05) : 0;
    var sway = Math.sin(t * 1.1) * 0.05;              // idle weight shift
    var tw = chase ? 0.04 : 0.012;                    // skeletal twitch amplitude
    function j() { return (math.rand() - 0.5) * 2 * tw; }
    // lean: everything above the pelvis slides forward with height
    function fwd(y) { return Math.max(0, y - 1.0) * lean; }
    // chain of spheres along a segment — keeps limbs reading as one body
    function chain(x0, y0, z0, x1, y1, z1, n, r0, r1) {
      for (var c = 0; c < n; c++) {
        var f = n === 1 ? 0 : c / (n - 1);
        add(x0 + (x1 - x0) * f + j(),
            y0 + (y1 - y0) * f + j(),
            z0 + (z1 - z0) * f + j(),
            r0 + (r1 - r0) * f);
      }
    }

    // spine — pelvis up to a hunched hump between the shoulders
    chain(sway, 1.0 + bob, 0,
          sway * 0.4, 1.92 + bob, fwd(1.92), 6, 0.27, 0.2);

    // shoulders
    add(0.36 + j(), 1.9 + bob + j(), fwd(1.9) + j(), 0.14);
    add(-0.36 + j(), 1.9 + bob + j(), fwd(1.9) + j(), 0.14);

    // head — small, cocked over to one side, listening
    var tilt = invest ? Math.sin(t * 2.2) * 0.3                     // sweeping for sound
             : Math.sin(t * 0.4) * 0.14 + 0.1;                      // slow sickening roll
    var hy = 2.42 + bob + (chase ? Math.sin(t * 13.0) * 0.04 : 0);  // chase: head judder

    // neck — too long, craned forward to the skull
    chain(0, 1.98 + bob, fwd(1.98),
          tilt, hy - 0.06, fwd(hy) + 0.16, 4, 0.11, 0.08);
    add(tilt + j(), hy, fwd(hy) + 0.2 + j(), 0.16);                 // skull
    add(tilt * 1.3 + j(), hy - 0.13, fwd(hy) + 0.33 + j(), 0.08);   // elongated jaw

    // arms — knuckles near the floor; trail behind in a chase
    var armB = chase ? -0.25 : 0.05;                                // hands swept back
    var swing = gait > 0 ? Math.sin(t * gait) * (chase ? 0.25 : 0.12) : Math.sin(t * 0.8) * 0.05;
    var side, sgn;
    for (side = 0; side < 2; side++) {
      sgn = side === 0 ? 1 : -1;
      var sw = swing * sgn;
      chain(sgn * 0.36, 1.9 + bob, fwd(1.9),
            sgn * 0.5, 0.2, armB + 0.12 + sw * 1.3, 7, 0.12, 0.06);
      add(sgn * 0.56 + j(), 0.07, armB + 0.24 + sw * 1.3, 0.035);   // claw
      add(sgn * 0.42 + j(), 0.06, armB + 0.26 + sw * 1.3, 0.035);   // claw
    }

    // legs — thin, wrong
    for (side = 0; side < 2; side++) {
      sgn = side === 0 ? 1 : -1;
      var st = gait > 0 ? Math.sin(t * gait + (side === 0 ? 0 : Math.PI)) * (chase ? 0.35 : 0.18) : 0;
      chain(sgn * 0.13, 0.95 + bob * 0.5, 0,
            sgn * 0.16, 0.07, st * 0.4 + 0.08, 5, 0.12, 0.08);
    }

    return out;
  }

  function spheres() {
    if (!bodyCache) bodyCache = buildBody(0);
    return bodyCache;
  }

  function addAgitationFloor(v) {
    E.agitationFloor = Math.min(80, E.agitationFloor + v);
    E.agitation = Math.max(E.agitation, E.agitationFloor);
  }

  NS.enemy = {
    state: E,
    reset: reset, update: update, hear: hear, spheres: spheres,
    addAgitationFloor: addAgitationFloor,
    forceChase: enterChase,
    forceInvestigate: forceInvestigate
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
