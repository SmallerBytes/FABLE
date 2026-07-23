/* HOLLOW — circuit.js : jack-in routing puzzle (Spider-Man control-unit style). */
(function (NS) {
  'use strict';

  // Tile masks: bit0=N bit1=E bit2=S bit3=W
  var STRAIGHT = 5;   // N+S
  var BEND = 3;       // N+E

  var SIZE = 4;
  var TIMEOUT = 75;
  var SCRAMBLE_MIN = 5;
  var SCRAMBLE_MAX = 7;

  var active = false;
  var tiles = [];
  var rot = [];
  var solutionRot = [];
  var pathCells = {};
  var selected = 0;
  var timeLeft = TIMEOUT;
  var onSuccess = null;
  var onTimeout = null;
  var canvas = null, ctx = null;
  var confirmHold = 0;
  var dirty = true;

  function rotateMask(mask, turns) {
    turns = ((turns % 4) + 4) % 4;
    var m = mask;
    for (var i = 0; i < turns; i++) {
      var n = 0;
      if (m & 1) n |= 2;
      if (m & 2) n |= 4;
      if (m & 4) n |= 8;
      if (m & 8) n |= 1;
      m = n;
    }
    return m;
  }

  function idx(c, r) { return r * SIZE + c; }

  function typeForMask(m) {
    return (m === 5 || m === 10) ? STRAIGHT : BEND;
  }

  function rotationForMask(type, target) {
    for (var t = 0; t < 4; t++) {
      if (rotateMask(type, t) === target) return t;
    }
    return 0;
  }

  // Guaranteed-solvable board: carve a random E/S lattice path ENTRY→CORE,
  // place matching tiles, fill distractors, then scramble only a few rotations
  // away from the solution so it stays fair in VR.
  function resetPuzzle() {
    var DIRBIT = { N: 1, E: 2, S: 4, W: 8 };
    var OPP = { N: 'S', E: 'W', S: 'N', W: 'E' };

    var moves = [];
    for (var k = 0; k < SIZE - 1; k++) { moves.push('E'); moves.push('S'); }
    for (k = moves.length - 1; k > 0; k--) {
      var j = Math.floor(Math.random() * (k + 1));
      var tmp = moves[k]; moves[k] = moves[j]; moves[j] = tmp;
    }

    var pathMask = {};
    pathCells = {};
    var c = 0, r = 0, inDir = 'W';
    for (k = 0; k <= moves.length; k++) {
      var outDir = k < moves.length ? moves[k] : 'E';
      var id = idx(c, r);
      pathMask[id] = DIRBIT[inDir] | DIRBIT[outDir];
      pathCells[id] = true;
      if (k < moves.length) {
        if (outDir === 'E') c++; else r++;
        inDir = OPP[outDir];
      }
    }

    tiles = [];
    solutionRot = [];
    for (var i = 0; i < SIZE * SIZE; i++) {
      var m = pathMask[i];
      var type = m ? typeForMask(m) : (Math.random() < 0.55 ? STRAIGHT : BEND);
      tiles.push(type);
      solutionRot.push(m ? rotationForMask(type, m) : Math.floor(Math.random() * 4));
    }

    // Start from the solved board, then misalign a handful of tiles.
    rot = solutionRot.slice();
    var scramble = SCRAMBLE_MIN + Math.floor(Math.random() * (SCRAMBLE_MAX - SCRAMBLE_MIN + 1));
    var touched = {};
    var guard = 0;
    while (scramble > 0 && guard++ < 64) {
      var pi = Math.floor(Math.random() * SIZE * SIZE);
      if (touched[pi]) continue;
      touched[pi] = true;
      var offset = 1 + Math.floor(Math.random() * 3);
      rot[pi] = (solutionRot[pi] + offset) % 4;
      scramble--;
    }
    guard = 0;
    while (connected() && guard++ < 24) {
      pi = Math.floor(Math.random() * SIZE * SIZE);
      rot[pi] = (rot[pi] + 1) % 4;
    }

    selected = 0;
    timeLeft = TIMEOUT;
    confirmHold = 0;
    dirty = true;
  }

  function applySolution() {
    for (var i = 0; i < SIZE * SIZE; i++) rot[i] = solutionRot[i];
  }

  function maskAt(c, r) {
    return rotateMask(tiles[idx(c, r)], rot[idx(c, r)]);
  }

  function connected() {
    return liveSet()[idx(SIZE - 1, SIZE - 1)] === true && !!(maskAt(SIZE - 1, SIZE - 1) & 2);
  }

  // Flood from ENTRY; used for win-check and "powered" tile feedback.
  function liveSet() {
    var live = {};
    if (!(maskAt(0, 0) & 8)) return live;
    var q = [{ c: 0, r: 0 }];
    live[idx(0, 0)] = true;
    var dirs = [
      { b: 1, dc: 0, dr: -1, opp: 4 },
      { b: 2, dc: 1, dr: 0, opp: 8 },
      { b: 4, dc: 0, dr: 1, opp: 1 },
      { b: 8, dc: -1, dr: 0, opp: 2 }
    ];
    while (q.length) {
      var cur = q.shift();
      var m = maskAt(cur.c, cur.r);
      for (var d = 0; d < 4; d++) {
        if (!(m & dirs[d].b)) continue;
        var nc = cur.c + dirs[d].dc, nr = cur.r + dirs[d].dr;
        if (nc < 0 || nr < 0 || nc >= SIZE || nr >= SIZE) continue;
        if (!(maskAt(nc, nr) & dirs[d].opp)) continue;
        var k = idx(nc, nr);
        if (live[k]) continue;
        live[k] = true;
        q.push({ c: nc, r: nr });
      }
    }
    return live;
  }

  function inVR() {
    return !!(NS.vr && NS.vr.active && NS.vr.active());
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'circuit-overlay';
    canvas.width = 420;
    canvas.height = 460;
    canvas.style.cssText = [
      'position:absolute', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
      'z-index:8', 'pointer-events:auto', 'display:none',
      'border:1px solid #7cff9b', 'background:rgba(0,8,4,0.92)',
      'box-shadow:0 0 24px rgba(124,255,155,0.25)'
    ].join(';');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    canvas.addEventListener('mousedown', function (e) {
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (canvas.width / rect.width);
      var y = (e.clientY - rect.top) * (canvas.height / rect.height);
      var pad = 40, cell = 80;
      var c = Math.floor((x - pad) / cell);
      var r = Math.floor((y - pad - 20) / cell);
      if (c >= 0 && r >= 0 && c < SIZE && r < SIZE) {
        selected = idx(c, r);
        rotateSelected();
      }
    });
  }

  function drawPipe(cx, cy, mask, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (mask & 1) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 28); }
    if (mask & 2) { ctx.moveTo(cx, cy); ctx.lineTo(cx + 28, cy); }
    if (mask & 4) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 28); }
    if (mask & 8) { ctx.moveTo(cx, cy); ctx.lineTo(cx - 28, cy); }
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    if (!active || !ctx) return;
    ctx.fillStyle = '#020805';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7cff9b';
    ctx.font = '14px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('JACK-IN ROUTING MATRIX', canvas.width / 2, 22);
    ctx.fillStyle = '#3f8a55';
    ctx.font = '11px Consolas, monospace';
    if (inVR()) {
      ctx.fillText('STICK MOVE · A/X ROTATE · TRIGGER = NEXT TILE', canvas.width / 2, 40);
    } else {
      ctx.fillText('CLICK TILE TO ROTATE — CONNECT ENTRY → CORE', canvas.width / 2, 40);
    }
    ctx.fillStyle = timeLeft < 10 ? '#ff4444' : '#ffb347';
    ctx.fillText('LOCKOUT T-' + Math.ceil(timeLeft) + 's', canvas.width / 2, 56);

    var pad = 40, cell = 80;
    var live = liveSet();
    var ok = connected();

    // ENTRY / CORE stubs so the required openings are obvious
    ctx.strokeStyle = live[idx(0, 0)] ? '#9fffbb' : '#ffb347';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pad - 18, pad + 20 + cell * 0.5);
    ctx.lineTo(pad + 8, pad + 20 + cell * 0.5);
    ctx.stroke();
    ctx.strokeStyle = ok ? '#9fffbb' : '#ffb347';
    ctx.beginPath();
    ctx.moveTo(pad + SIZE * cell - 8, pad + 20 + cell * (SIZE - 0.5));
    ctx.lineTo(pad + SIZE * cell + 18, pad + 20 + cell * (SIZE - 0.5));
    ctx.stroke();

    ctx.fillStyle = '#7cff9b';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('ENTRY', 22, pad + 20 + cell * 0.5 + 16);
    ctx.fillText('CORE', canvas.width - 22, pad + 20 + cell * (SIZE - 0.5) + 16);

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var i = idx(c, r);
        var x = pad + c * cell, y = pad + 20 + r * cell;
        var powered = !!live[i];
        ctx.strokeStyle = i === selected ? '#ffb347' : (powered ? '#7cff9b' : '#3f8a55');
        ctx.lineWidth = i === selected ? 2.5 : 1;
        ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
        var col = ok ? '#9fffbb' : (powered ? '#b8ffd0' : '#4a7a58');
        drawPipe(x + cell / 2, y + cell / 2, maskAt(c, r), col, powered ? 9 : 7);

        // bright joint dots where this tile already mates with a neighbor
        var m = maskAt(c, r);
        if ((m & 2) && c + 1 < SIZE && (maskAt(c + 1, r) & 8)) {
          ctx.fillStyle = '#ffb347';
          ctx.beginPath();
          ctx.arc(x + cell - 2, y + cell / 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        if ((m & 4) && r + 1 < SIZE && (maskAt(c, r + 1) & 1)) {
          ctx.fillStyle = '#ffb347';
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell - 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (ok) {
      ctx.fillStyle = '#ffb347';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText('PATH VALID — HOLDING TO CONFIRM…', canvas.width / 2, canvas.height - 16);
    } else {
      ctx.fillStyle = '#3f8a55';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText('LIT TILES = POWERED FROM ENTRY · JOIN AMBER DOTS TO CORE', canvas.width / 2, canvas.height - 16);
    }
    dirty = true;
  }

  function update(dt) {
    if (!active) return false;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      var cb = onTimeout;
      close();
      if (cb) cb();
      return true;
    }
    if (connected()) {
      confirmHold += dt;
      if (confirmHold > 0.55) {
        var ok = onSuccess;
        close();
        if (ok) ok();
        return true;
      }
    } else {
      confirmHold = 0;
    }
    render();
    return true;
  }

  function rotateSelected() {
    if (!active) return;
    rot[selected] = (rot[selected] + 1) % 4;
    confirmHold = 0;
    render();
  }

  function moveSelection(dc, dr) {
    if (!active) return;
    var c = selected % SIZE;
    var r = Math.floor(selected / SIZE);
    c = Math.max(0, Math.min(SIZE - 1, c + dc));
    r = Math.max(0, Math.min(SIZE - 1, r + dr));
    selected = idx(c, r);
    confirmHold = 0;
    render();
  }

  function nextTile() {
    if (!active) return;
    selected = (selected + 1) % (SIZE * SIZE);
    confirmHold = 0;
    render();
  }

  function open(successCb, timeoutCb) {
    ensureCanvas();
    resetPuzzle();
    onSuccess = successCb;
    onTimeout = timeoutCb;
    active = true;
    // DOM overlay is desktop-only — WebXR cannot see HTML layers
    canvas.style.display = inVR() ? 'none' : 'block';
    render();
  }

  function close() {
    active = false;
    if (canvas) canvas.style.display = 'none';
    onSuccess = null;
    onTimeout = null;
    dirty = true;
  }

  NS.circuit = {
    open: open, close: close, update: update, rotateSelected: rotateSelected,
    moveSelection: moveSelection, nextTile: nextTile,
    isActive: function () { return active; },
    getCanvas: function () { return canvas; },
    consumeDirty: function () {
      var d = dirty;
      dirty = false;
      return d;
    },
    debug: {
      reset: resetPuzzle,
      solve: applySolution,
      connected: connected,
      rot: function () { return rot.slice(); },
      solutionRot: function () { return solutionRot.slice(); }
    }
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
