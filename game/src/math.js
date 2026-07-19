/* HOLLOW — math.js : vectors, matrices, seeded RNG */
(function (NS) {
  'use strict';

  // ---- Seeded LCG (deterministic runs; see GDD §10.2.5) ----
  var _seed = 0x1988;
  function srand(s) { _seed = s >>> 0; }
  function rand() {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 4294967296;
  }
  function randRange(a, b) { return a + (b - a) * rand(); }

  // ---- vec3 helpers (plain arrays / objects kept minimal) ----
  function vlen(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
  function vnorm(v) {
    var l = vlen(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function vcross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // ---- mat4 (column-major, WebGL convention) ----
  function mat4Perspective(fovYRad, aspect, near, far) {
    var f = 1 / Math.tan(fovYRad / 2);
    var nf = 1 / (near - far);
    var m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  }

  function mat4LookAt(eye, center, up) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var zl = vlen(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy,
        xy = up[2] * zx - up[0] * zz,
        xz = up[0] * zy - up[1] * zx;
    var xl = vlen(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy,
        yy = zz * xx - zx * xz,
        yz = zx * xy - zy * xx;
    var m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  }

  function mat4Multiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  // Forward vector from yaw/pitch. yaw 0 => looking -Z, positive yaw turns right.
  function dirFromYawPitch(yaw, pitch) {
    var cp = Math.cos(pitch);
    return [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  NS.math = {
    srand: srand, rand: rand, randRange: randRange,
    vlen: vlen, vnorm: vnorm, vcross: vcross, vdot: vdot,
    mat4Perspective: mat4Perspective, mat4LookAt: mat4LookAt, mat4Multiply: mat4Multiply,
    dirFromYawPitch: dirFromYawPitch,
    clamp: clamp, lerp: lerp
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
