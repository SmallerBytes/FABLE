/* HOLLOW — circuit.js : jack-in routing puzzle (Spider-Man control-unit style). */
(function (NS) {
  'use strict';

  // Tile masks: bit0=N bit1=E bit2=S bit3=W
  var STRAIGHT = 5;   // N+S
  var BEND = 3;       // N+E

  var SIZE = 4;
  var TIMEOUT = 45;

  var active = false;
  var tiles = [];
  var rot = [];
  var selected = 0;
  var timeLeft = TIMEOUT;
  var onSuccess = null;
  var onTimeout = null;
  var canvas = null, ctx = null;
  var confirmHold = 0;

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

  function resetPuzzle() {
    tiles = [
      BEND, STRAIGHT, BEND, BEND,
      STRAIGHT, BEND, STRAIGHT, BEND,
      BEND, STRAIGHT, BEND, STRAIGHT,
      BEND, BEND, STRAIGHT, BEND
    ];
    rot = [];
    for (var i = 0; i < SIZE * SIZE; i++) rot.push(Math.floor(Math.random() * 4));
    rot[0] = 1;
    rot[SIZE * SIZE - 1] = 3;
    selected = 0;
    timeLeft = TIMEOUT;
    confirmHold = 0;
  }

  function maskAt(c, r) {
    return rotateMask(tiles[idx(c, r)], rot[idx(c, r)]);
  }

  function connected() {
    if (!(maskAt(0, 0) & 8)) return false;
    var seen = {}, q = [{ c: 0, r: 0 }];
    seen[idx(0, 0)] = true;
    var dirs = [
      { b: 1, dc: 0, dr: -1, opp: 4 },
      { b: 2, dc: 1, dr: 0, opp: 8 },
      { b: 4, dc: 0, dr: 1, opp: 1 },
      { b: 8, dc: -1, dr: 0, opp: 2 }
    ];
    while (q.length) {
      var cur = q.shift();
      if (cur.c === SIZE - 1 && cur.r === SIZE - 1) {
        return !!(maskAt(cur.c, cur.r) & 2);
      }
      var m = maskAt(cur.c, cur.r);
      for (var d = 0; d < 4; d++) {
        if (!(m & dirs[d].b)) continue;
        var nc = cur.c + dirs[d].dc, nr = cur.r + dirs[d].dr;
        if (nc < 0 || nr < 0 || nc >= SIZE || nr >= SIZE) continue;
        if (!(maskAt(nc, nr) & dirs[d].opp)) continue;
        var k = idx(nc, nr);
        if (seen[k]) continue;
        seen[k] = true;
        q.push({ c: nc, r: nr });
      }
    }
    return false;
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

  function drawPipe(cx, cy, mask, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
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
    ctx.fillText('CLICK / A / E ROTATE TILE — CONNECT ENTRY TO CORE', canvas.width / 2, 40);
    ctx.fillStyle = timeLeft < 10 ? '#ff4444' : '#ffb347';
    ctx.fillText('LOCKOUT T-' + Math.ceil(timeLeft) + 's', canvas.width / 2, 56);

    var pad = 40, cell = 80;
    ctx.fillStyle = '#7cff9b';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('ENTRY', 28, pad + 20 + cell * 0.5);
    ctx.fillText('CORE', canvas.width - 28, pad + 20 + cell * (SIZE - 0.5));

    var ok = connected();
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var i = idx(c, r);
        var x = pad + c * cell, y = pad + 20 + r * cell;
        ctx.strokeStyle = i === selected ? '#ffb347' : '#3f8a55';
        ctx.lineWidth = i === selected ? 2 : 1;
        ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
        drawPipe(x + cell / 2, y + cell / 2, maskAt(c, r), ok ? '#9fffbb' : '#7cff9b');
      }
    }
    if (ok) {
      ctx.fillStyle = '#ffb347';
      ctx.font = '13px Consolas, monospace';
      ctx.fillText('PATH VALID — HOLDING TO CONFIRM…', canvas.width / 2, canvas.height - 16);
    }
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

  function open(successCb, timeoutCb) {
    ensureCanvas();
    resetPuzzle();
    onSuccess = successCb;
    onTimeout = timeoutCb;
    active = true;
    canvas.style.display = 'block';
    render();
  }

  function close() {
    active = false;
    if (canvas) canvas.style.display = 'none';
    onSuccess = null;
    onTimeout = null;
  }

  NS.circuit = {
    open: open, close: close, update: update, rotateSelected: rotateSelected,
    isActive: function () { return active; }
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
