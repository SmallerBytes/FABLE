/* Validates the HOLLOW map: row lengths, markers, reachability, A* sanity. */
'use strict';
require('../game/src/math.js');
require('../game/src/map.js');
var M = global.HOLLOW.map;

var errors = [];
var mk = M.markers;
if (!mk.P) errors.push('missing P');
if (!mk.C) errors.push('missing C');
if (!mk.G) errors.push('missing G');
if (!mk.X) errors.push('missing X');
if (mk.fuses.filter(Boolean).length !== 3) errors.push('fuses found: ' + mk.fuses.filter(Boolean).length);
if (mk.memos.length !== 4) errors.push('memos found: ' + mk.memos.length);

// flood fill from P
var ROWS = M.ROWS(), COLS = M.COLS(), CELL = M.CELL;
var seen = {};
if (mk.P) {
  var q = [[Math.floor(mk.P.x / CELL), Math.floor(mk.P.z / CELL)]];
  seen[q[0][1] * COLS + q[0][0]] = true;
  while (q.length) {
    var cur = q.pop();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
      var c = cur[0] + d[0], r = cur[1] + d[1];
      var k = r * COLS + c;
      if (!seen[k] && !M.isSolidCell(c, r)) { seen[k] = true; q.push([c, r]); }
    });
  }
  function reach(name, p) {
    if (!p) return;
    var k = Math.floor(p.z / CELL) * COLS + Math.floor(p.x / CELL);
    if (!seen[k]) errors.push('unreachable: ' + name + ' @ cell ' + Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL));
  }
  reach('C', mk.C); reach('G', mk.G); reach('X', mk.X);
  mk.fuses.forEach(function (f, i) { reach('fuse' + (i + 1), f); });
  mk.memos.forEach(function (m, i) { reach('memo' + (i + 1), m); });

  var reachable = Object.keys(seen).length;
  console.log('reachable floor cells: ' + reachable);
  if (reachable < 300) errors.push('map too small/disconnected: ' + reachable + ' cells');

  if (mk.C) {
    var path = M.astar(mk.C.x, mk.C.z, mk.P.x, mk.P.z);
    if (!path) errors.push('A* lair->spawn failed');
    else console.log('A* lair->spawn: ' + path.length + ' waypoints');
  }
}

var wps = M.patrolWaypoints();
console.log('patrol waypoints: ' + wps.length);
if (wps.length < 12) errors.push('too few patrol waypoints: ' + wps.length);

// raycast sanity from spawn
if (mk.P) {
  var hit = M.raycast(mk.P.x, 1.6, mk.P.z, 0, -0.3, -0.95, 100);
  if (!hit) errors.push('raycast from spawn hit nothing');
  else console.log('raycast spawn fwd/down: type=' + hit.type + ' t=' + hit.t.toFixed(2));
}

if (errors.length) {
  console.error('MAP INVALID:');
  errors.forEach(function (e) { console.error('  - ' + e); });
  process.exit(1);
}
console.log('MAP OK (' + COLS + 'x' + ROWS + ')');
