/* HOLLOW — map.js : Site C sublevel 2. ASCII grid, DDA raycast, A*, occlusion. */
(function (NS) {
  'use strict';

  var CELL = 3;      // metres per cell
  var WALL_H = 4;    // ceiling height, metres

  // Legend: '#'/' ' solid · '.' floor · P player spawn · C custodian lair
  //         1 2 3 fuses · G generator · X exit door · m memo (x4)
  var ASCII = [
    "################################################",
    "#......#..........#...........#......#.........#",
    "#......#..........#.....2.....#......#....3....#",
    "#..m...#..........#...........#..##..#.........#",
    "#......#..#####...#..##...##..#..##..#..####...#",
    "#...#..#..#...#...#..##...##..#......#..#..#...#",
    "#...#.....#...#......##...##.....##.....#..#...#",
    "#...#..#..#####...#...........#..##..#..#..#...#",
    "#...#..#..........#...........#......#..#..#...#",
    "#...#..#..........#...........#......#..#..#...#",
    "###.#############.#####...########.######.####.#",
    "#......#...........#.........#.................#",
    "#......#...........#.........#..##..##..##.....#",
    "#..1...#..##..##............m...##..##..##..#..#",
    "#......#..##..##....#.........#..............#.#"
  ];
  // (rows continue below — split to keep authoring sane, joined at parse time)
  var ASCII2 = [
    "#...#..#............#.........#..##..##..##..#.#",
    "#...#..#..##..##....#.........#..##..##..##....#",
    "#...#......##..##...#....#######...............#",
    "#...#..#............#....#.....#..############.#",
    "#...#..#############.....#.....#...............#",
    "#......#............#....#.....#..#########....#",
    "#......#............#....#.....#..#.......#....#",
    "#..##..#............#....#.....#..#.......#....#",
    "#..##.....P.........#....#..............G.#....#",
    "#......#............#....#.....#..#.......#....#",
    "#......#............#....#.....#..#########....#",
    "######.##....########....##..###...............#",
    "#....#.......#..........................####...#",
    "#....#..######..######....######..#####....#...#",
    "#....#..#.....................m#..#...#....#...#",
    "#.X..#..#..######..######..#...#..#...#....#...#",
    "#....#..#..#....#..#....#..#...#......#.C..#...#",
    "#....#..#..#....#..#....#..#...#..#...#....#...#",
    "#....#......m...........#..#......#...#....#...#",
    "#......................................####....#",
    "################################################"
  ];

  // grid[row][col] => true if solid
  var grid = [];
  var ROWS = 0, COLS = 0;
  var markers = { fuses: [], memos: [], P: null, C: null, G: null, X: null };

  function parse() {
    var rows = ASCII.concat(ASCII2);
    ROWS = rows.length;
    COLS = rows[0].length;
    grid = [];
    for (var r = 0; r < ROWS; r++) {
      var line = rows[r];
      if (line.length !== COLS) {
        throw new Error('HOLLOW map: row ' + r + ' length ' + line.length + ' != ' + COLS);
      }
      var row = [];
      for (var c = 0; c < COLS; c++) {
        var ch = line[c];
        row.push(ch === '#' || ch === ' ');
        var wx = (c + 0.5) * CELL, wz = (r + 0.5) * CELL;
        if (ch === 'P') markers.P = { x: wx, z: wz };
        else if (ch === 'C') markers.C = { x: wx, z: wz };
        else if (ch === 'G') markers.G = { x: wx, z: wz };
        else if (ch === 'X') markers.X = { x: wx, z: wz };
        else if (ch === '1' || ch === '2' || ch === '3') markers.fuses[+ch - 1] = { x: wx, z: wz };
        else if (ch === 'm') markers.memos.push({ x: wx, z: wz });
      }
      grid.push(row);
    }
  }
  parse();

  function isSolidCell(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    return grid[r][c];
  }
  function isSolidAt(x, z) {
    return isSolidCell(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  // ---------------------------------------------------------------
  // Raycast: analytic floor/ceiling planes + 2D DDA through wall cells.
  // Returns { t, x, y, z, type } with type in 'wall' | 'floor' | 'ceil',
  // or null if nothing within maxDist.
  // ---------------------------------------------------------------
  function raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    var best = maxDist, type = null;

    if (dy < -1e-6) {                       // floor y=0
      var tf = -oy / dy;
      if (tf > 0 && tf < best) { best = tf; type = 'floor'; }
    } else if (dy > 1e-6) {                 // ceiling y=WALL_H
      var tc = (WALL_H - oy) / dy;
      if (tc > 0 && tc < best) { best = tc; type = 'ceil'; }
    }

    // 2D DDA over (x,z)
    var cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    if (isSolidCell(cx, cz)) {
      return { t: 0, x: ox, y: oy, z: oz, type: 'wall' };
    }
    var adx = Math.abs(dx), adz = Math.abs(dz);
    if (adx > 1e-9 || adz > 1e-9) {
      var stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
      var tDeltaX = adx > 1e-9 ? CELL / adx : Infinity;
      var tDeltaZ = adz > 1e-9 ? CELL / adz : Infinity;
      var nextVX = (cx + (dx > 0 ? 1 : 0)) * CELL;
      var nextVZ = (cz + (dz > 0 ? 1 : 0)) * CELL;
      var tMaxX = adx > 1e-9 ? (nextVX - ox) / dx : Infinity;
      var tMaxZ = adz > 1e-9 ? (nextVZ - oz) / dz : Infinity;
      var t = 0;
      for (var i = 0; i < 256; i++) {
        if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; }
        else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
        if (t >= best) break;
        if (isSolidCell(cx, cz)) {
          best = t; type = 'wall';
          break;
        }
      }
    }

    if (type === null) return null;
    return { t: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, type: type };
  }

  // ---------------------------------------------------------------
  // Walls crossed on the straight line between two world points
  // (Bresenham on cells) — hearing attenuation, GDD §3.4.
  // ---------------------------------------------------------------
  function wallsBetween(ax, az, bx, bz) {
    var x0 = Math.floor(ax / CELL), y0 = Math.floor(az / CELL);
    var x1 = Math.floor(bx / CELL), y1 = Math.floor(bz / CELL);
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, count = 0, guard = 0;
    while (guard++ < 256) {
      if (isSolidCell(x0, y0)) count++;
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return count;
  }

  // ---------------------------------------------------------------
  // A* over walkable cells, 4-connected. Returns array of world-space
  // waypoints [{x,z}...] (excluding start cell), or null.
  // ---------------------------------------------------------------
  function astar(ax, az, bx, bz) {
    var sc = Math.floor(ax / CELL), sr = Math.floor(az / CELL);
    var gc = Math.floor(bx / CELL), gr = Math.floor(bz / CELL);
    if (isSolidCell(gc, gr) || isSolidCell(sc, sr)) return null;
    var W = COLS, key = function (c, r) { return r * W + c; };
    var open = [{ c: sc, r: sr, g: 0, f: 0 }];
    var came = {}, gScore = {};
    gScore[key(sc, sr)] = 0;
    var closed = {};
    var h = function (c, r) { return Math.abs(c - gc) + Math.abs(r - gr); };
    open[0].f = h(sc, sr);

    while (open.length) {
      // small open sets here; linear extract-min is fine
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      var ck = key(cur.c, cur.r);
      if (closed[ck]) continue;
      closed[ck] = true;
      if (cur.c === gc && cur.r === gr) {
        var path = [];
        var k = ck;
        while (came[k] !== undefined) {
          var c = k % W, r = (k - c) / W;
          path.push({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL });
          k = came[k];
        }
        path.reverse();
        return path;
      }
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var n = 0; n < 4; n++) {
        var nc = cur.c + nb[n][0], nr = cur.r + nb[n][1];
        if (isSolidCell(nc, nr)) continue;
        var nk = key(nc, nr);
        var ng = cur.g + 1;
        if (gScore[nk] === undefined || ng < gScore[nk]) {
          gScore[nk] = ng;
          came[nk] = ck;
          open.push({ c: nc, r: nr, g: ng, f: ng + h(nc, nr) });
        }
      }
    }
    return null;
  }

  // Collision: slide a circle of radius rad against solid cells.
  function moveWithCollision(x, z, nx, nz, rad) {
    function blocked(px, pz) {
      // sample the circle against the four nearest cell edges
      return isSolidAt(px - rad, pz) || isSolidAt(px + rad, pz) ||
             isSolidAt(px, pz - rad) || isSolidAt(px, pz + rad) ||
             isSolidAt(px - rad * 0.707, pz - rad * 0.707) ||
             isSolidAt(px + rad * 0.707, pz - rad * 0.707) ||
             isSolidAt(px - rad * 0.707, pz + rad * 0.707) ||
             isSolidAt(px + rad * 0.707, pz + rad * 0.707);
    }
    var rx = x, rz = z;
    if (!blocked(nx, rz)) rx = nx;
    if (!blocked(rx, nz)) rz = nz;
    return { x: rx, z: rz };
  }

  // Room-centre waypoints for patrol (walkable cells with open space around)
  function patrolWaypoints() {
    var pts = [];
    for (var r = 2; r < ROWS - 2; r += 4) {
      for (var c = 2; c < COLS - 2; c += 4) {
        if (!isSolidCell(c, r) && !isSolidCell(c + 1, r) &&
            !isSolidCell(c, r + 1) && !isSolidCell(c - 1, r) && !isSolidCell(c, r - 1)) {
          pts.push({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL });
        }
      }
    }
    return pts;
  }

  NS.map = {
    CELL: CELL, WALL_H: WALL_H, ROWS: function () { return ROWS; }, COLS: function () { return COLS; },
    markers: markers,
    isSolidCell: isSolidCell, isSolidAt: isSolidAt,
    raycast: raycast, wallsBetween: wallsBetween, astar: astar,
    moveWithCollision: moveWithCollision, patrolWaypoints: patrolWaypoints
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
