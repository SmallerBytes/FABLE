/* HOLLOW — map.js : Site C sublevel 2. ASCII grid, DDA raycast, A*, occlusion. */
(function (NS) {
  'use strict';

  var CELL = 3;      // metres per cell
  var WALL_H = 4;    // ceiling height, metres

  // Legend: '#'/' ' solid · '.' floor · S safe/harbor · P spawn · C lair
  //         1 2 3 fuses · G generator · X exit · m memo
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

  // grid[row][col] => true if solid; safe[row][col] => acoustic harbor
  var grid = [];
  var safe = [];
  var ROWS = 0, COLS = 0;
  var markers = { fuses: [], memos: [], P: null, C: null, G: null, X: null, safes: [], lasers: [] };

  function parse() {
    var rows = ASCII.concat(ASCII2);
    ROWS = rows.length;
    COLS = rows[0].length;
    grid = [];
    safe = [];
    for (var r = 0; r < ROWS; r++) {
      var line = rows[r];
      if (line.length !== COLS) {
        throw new Error('HOLLOW map: row ' + r + ' length ' + line.length + ' != ' + COLS);
      }
      var row = [], srow = [];
      for (var c = 0; c < COLS; c++) {
        var ch = line[c];
        row.push(ch === '#' || ch === ' ');
        srow.push(false);
        var wx = (c + 0.5) * CELL, wz = (r + 0.5) * CELL;
        if (ch === 'P') markers.P = { x: wx, z: wz };
        else if (ch === 'C') markers.C = { x: wx, z: wz };
        else if (ch === 'G') markers.G = { x: wx, z: wz };
        else if (ch === 'X') markers.X = { x: wx, z: wz };
        else if (ch === '1' || ch === '2' || ch === '3') markers.fuses[+ch - 1] = { x: wx, z: wz };
        else if (ch === 'm') markers.memos.push({ x: wx, z: wz });
        else if (ch === 'S') {
          srow[c] = true;
          markers.safes.push({ x: wx, z: wz, c: c, r: r });
        }
      }
      grid.push(row);
      safe.push(srow);
    }
    // Place acoustic harbors by cell (floor remains walkable)
    placeSafe(7, 23);   // atrium west of spawn
    placeSafe(6, 23);
    placeSafe(4, 13);   // storage near fuse 1
    placeSafe(5, 13);
    placeSafe(22, 13);  // mid corridor / memo area
    placeSafe(23, 13);
    placeSafe(38, 22);  // generator approach
    placeSafe(39, 22);
    placeSafe(3, 33);   // pre-exit corridor
    placeSafe(4, 33);

    // Yellow laser alarm beams across key corridors (world metres)
    // {x0,z0,x1,z1, y0,y1} — thin vertical sheet; player circle crossing triggers
    markers.lasers = [
      { x0: 8 * CELL, z0: 13.5 * CELL, x1: 8 * CELL, z1: 14.5 * CELL, y0: 0.4, y1: 2.6, id: 'L-STORAGE' },
      { x0: 18 * CELL, z0: 6.5 * CELL, x1: 19 * CELL, z1: 6.5 * CELL, y0: 0.4, y1: 2.6, id: 'L-LAB' },
      { x0: 28 * CELL, z0: 12.5 * CELL, x1: 29.5 * CELL, z1: 12.5 * CELL, y0: 0.5, y1: 2.4, id: 'L-MID' },
      { x0: 36 * CELL, z0: 22.5 * CELL, x1: 36 * CELL, z1: 24.5 * CELL, y0: 0.4, y1: 2.6, id: 'L-GEN' },
      { x0: 6 * CELL, z0: 31.5 * CELL, x1: 8 * CELL, z1: 31.5 * CELL, y0: 0.4, y1: 2.6, id: 'L-EXIT' }
    ];
  }

  function placeSafe(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
    if (grid[r][c]) return;
    if (!safe[r][c]) {
      safe[r][c] = true;
      markers.safes.push({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL, c: c, r: r });
    }
  }
  parse();

  function isSafeCell(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    return !!safe[r][c];
  }
  function isSafeAt(x, z) {
    return isSafeCell(Math.floor(x / CELL), Math.floor(z / CELL));
  }

  function asciiRows() {
    return ASCII.concat(ASCII2);
  }

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

  // Ray–laser: return t if ray hits a laser segment AABB-ish vertical sheet, else -1
  function rayLaser(ox, oy, oz, dx, dy, dz, maxDist) {
    var best = -1;
    for (var i = 0; i < markers.lasers.length; i++) {
      var L = markers.lasers[i];
      var lx0 = Math.min(L.x0, L.x1), lx1 = Math.max(L.x0, L.x1);
      var lz0 = Math.min(L.z0, L.z1), lz1 = Math.max(L.z0, L.z1);
      // expand thin axis so a ray can hit a sheet
      if (lx1 - lx0 < 0.15) { lx0 -= 0.08; lx1 += 0.08; }
      if (lz1 - lz0 < 0.15) { lz0 -= 0.08; lz1 += 0.08; }
      // slab intersection on Y then XZ box
      var t0 = 0, t1 = maxDist;
      if (Math.abs(dy) > 1e-8) {
        var ty0 = (L.y0 - oy) / dy, ty1 = (L.y1 - oy) / dy;
        if (ty0 > ty1) { var tmp = ty0; ty0 = ty1; ty1 = tmp; }
        t0 = Math.max(t0, ty0); t1 = Math.min(t1, ty1);
      } else if (oy < L.y0 || oy > L.y1) continue;
      if (t0 >= t1) continue;
      // sample mid-t against XZ box of the sheet
      var tm = (t0 + t1) * 0.5;
      if (tm <= 0 || tm > maxDist) continue;
      var px = ox + dx * tm, pz = oz + dz * tm;
      if (px >= lx0 && px <= lx1 && pz >= lz0 && pz <= lz1) {
        if (best < 0 || tm < best) best = tm;
      }
    }
    return best;
  }

  // Distance from point to laser segment in XZ; used for player crossing
  function laserHitPlayer(px, pz, rad) {
    for (var i = 0; i < markers.lasers.length; i++) {
      var L = markers.lasers[i];
      var ax = L.x0, az = L.z0, bx = L.x1, bz = L.z1;
      var abx = bx - ax, abz = bz - az;
      var len2 = abx * abx + abz * abz || 1e-6;
      var t = ((px - ax) * abx + (pz - az) * abz) / len2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var cx = ax + abx * t, cz = az + abz * t;
      var dx = px - cx, dz = pz - cz;
      if (dx * dx + dz * dz <= rad * rad) return L;
    }
    return null;
  }

  NS.map = {
    CELL: CELL, WALL_H: WALL_H, ROWS: function () { return ROWS; }, COLS: function () { return COLS; },
    markers: markers,
    isSolidCell: isSolidCell, isSolidAt: isSolidAt,
    isSafeCell: isSafeCell, isSafeAt: isSafeAt,
    raycast: raycast, wallsBetween: wallsBetween, astar: astar,
    moveWithCollision: moveWithCollision, patrolWaypoints: patrolWaypoints,
    rayLaser: rayLaser, laserHitPlayer: laserHitPlayer, asciiRows: asciiRows
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
