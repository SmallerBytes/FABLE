/* HOLLOW — vr.js : Quest/WebXR session, stereo views, controller input. */
(function (NS) {
  'use strict';

  var session = null;
  var referenceSpace = null;
  var supported = false;
  var bodyYaw = 0;
  var snapLatch = false;
  var previousButtons = {};
  var framebufferScale = 0.8;
  // Raise virtual floor slightly so standing/sitting feels less ground-hugging
  var HEIGHT_BOOST = 0.28;
  var currentInput = {
    moveX: 0, moveY: 0, heading: 0,
    bodyYaw: 0,
    trickle: false, burstPressed: false, interactPressed: false,
    sprint: false,
    aimOrigin: null, aimDirection: null,
    wrist: null // left-controller grip pose in XR local space
  };

  function init(button) {
    if (!button) return;
    if (!navigator.xr) {
      button.disabled = true;
      button.textContent = 'WEBXR UNAVAILABLE';
      return;
    }
    navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
      supported = ok;
      button.disabled = !ok;
      button.textContent = ok ? 'ENTER VR (QUEST)' : 'IMMERSIVE VR UNAVAILABLE';
    }).catch(function () {
      button.disabled = true;
      button.textContent = 'WEBXR CHECK FAILED';
    });
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      enter();
    });
  }

  function enter() {
    if (!supported || session) return Promise.resolve(false);
    NS.audio.ensure();
    return NS.render.makeXRCompatible().then(function () {
      return navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor']
      });
    }).then(function (xrSession) {
      session = xrSession;
      var gl = NS.render.getContext();
      session.updateRenderState({
        baseLayer: new XRWebGLLayer(session, gl, {
          alpha: false,
          antialias: false,
          framebufferScaleFactor: framebufferScale
        }),
        depthNear: 0.05,
        depthFar: 220
      });
      return session.requestReferenceSpace('local-floor');
    }).then(function (space) {
      referenceSpace = space;
      bodyYaw = 0;
      previousButtons = {};
      session.addEventListener('end', onEnd);
      NS.audio.startAmbient();
      NS.game.onVRStart();
      session.requestAnimationFrame(onFrame);
      return true;
    }).catch(function (error) {
      console.error('HOLLOW WebXR start failed:', error);
      if (NS.game && NS.game.onVRError) NS.game.onVRError(error);
      session = null;
      referenceSpace = null;
      return false;
    });
  }

  function onEnd() {
    session = null;
    referenceSpace = null;
    currentInput.trickle = false;
    if (NS.game && NS.game.onVREnd) NS.game.onVREnd();
  }

  function onFrame(time, frame) {
    if (!session) return;
    session.requestAnimationFrame(onFrame);
    var pose = frame.getViewerPose(referenceSpace);
    if (!pose) return;
    readInput(frame, pose);
    NS.game.onXRFrame(time, frame, pose, currentInput, bodyYaw);
  }

  function axesFor(gamepad) {
    if (!gamepad || !gamepad.axes || gamepad.axes.length < 2) return [0, 0];
    var a = gamepad.axes;
    var x = a.length >= 4 ? a[a.length - 2] : a[0];
    var y = a.length >= 4 ? a[a.length - 1] : a[1];
    var dead = 0.16;
    return [Math.abs(x) > dead ? x : 0, Math.abs(y) > dead ? y : 0];
  }

  function stickMag(gamepad) {
    var a = axesFor(gamepad);
    return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  }

  function pressed(gamepad, index) {
    if (!gamepad || !gamepad.buttons || !gamepad.buttons[index]) return false;
    var b = gamepad.buttons[index];
    return !!(b.pressed || b.value > 0.45);
  }

  // Quest Browser is inconsistent about thumbstick-click index; also accept
  // left grip and full stick deflection (push to run).
  function leftSprint(gp) {
    if (!gp) return false;
    if (pressed(gp, 1)) return true;          // grip
    if (pressed(gp, 3) || pressed(gp, 2)) return true; // stick click (varies)
    return stickMag(gp) >= 0.88;              // push stick fully
  }

  function interactRising(id, gp, isLeft) {
    // Quest Touch: 4 = A/X, 5 = B/Y. Stick click on RIGHT still interacts.
    var press = rising(id + '-i4', pressed(gp, 4)) || rising(id + '-i5', pressed(gp, 5));
    if (!isLeft) press = press || rising(id + '-i3', pressed(gp, 3)) || rising(id + '-i2', pressed(gp, 2));
    return press;
  }

  function rising(key, value) {
    var was = !!previousButtons[key];
    previousButtons[key] = value;
    return value && !was;
  }

  function rotateVectorByQuaternion(x, y, z, q) {
    var ix = q.w * x + q.y * z - q.z * y;
    var iy = q.w * y + q.z * x - q.x * z;
    var iz = q.w * z + q.x * y - q.y * x;
    var iw = -q.x * x - q.y * y - q.z * z;
    return [
      ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
    ];
  }

  function rotateLocalToWorld(v) {
    var c = Math.cos(bodyYaw), s = Math.sin(bodyYaw);
    return [c * v[0] - s * v[2], v[1], s * v[0] + c * v[2]];
  }

  function readInput(frame, pose) {
    currentInput.moveX = 0;
    currentInput.moveY = 0;
    currentInput.trickle = false;
    currentInput.burstPressed = false;
    currentInput.interactPressed = false;
    currentInput.sprint = false;
    currentInput.aimOrigin = null;
    currentInput.aimDirection = null;
    currentInput.wrist = null;

    var rightSource = null;
    var leftSource = null;
    for (var i = 0; i < session.inputSources.length; i++) {
      var source = session.inputSources[i];
      var gp = source.gamepad;
      var axes = axesFor(gp);
      if (source.handedness === 'left') {
        leftSource = source;
        currentInput.moveX = axes[0];
        currentInput.moveY = -axes[1];
        currentInput.sprint = leftSprint(gp);
      } else if (source.handedness === 'right') {
        rightSource = source;
        if (Math.abs(axes[0]) > 0.75 && !snapLatch) {
          bodyYaw += axes[0] > 0 ? Math.PI / 6 : -Math.PI / 6;
          snapLatch = true;
        } else if (Math.abs(axes[0]) < 0.35) {
          snapLatch = false;
        }
      } else if (!leftSource && !rightSource) {
        // Some browsers report handedness "none" — treat first pad as move+sprint
        leftSource = source;
        currentInput.moveX = axes[0];
        currentInput.moveY = -axes[1];
        currentInput.sprint = leftSprint(gp);
      }

      var id = source.handedness || String(i);
      if (source.handedness === 'right' || source.handedness === 'none') {
        currentInput.trickle = currentInput.trickle || pressed(gp, 0);
        currentInput.burstPressed = currentInput.burstPressed ||
          rising(id + '-burst', pressed(gp, 1));
      }
      currentInput.interactPressed = currentInput.interactPressed ||
        interactRising(id, gp, source.handedness === 'left');
    }

    if (!rightSource && session.inputSources.length) rightSource = session.inputSources[0];
    if (rightSource && rightSource.targetRaySpace) {
      var aimPose = frame.getPose(rightSource.targetRaySpace, referenceSpace);
      if (aimPose) {
        var p = aimPose.transform.position;
        var q = aimPose.transform.orientation;
        var localDir = rotateVectorByQuaternion(0, 0, -1, q);
        currentInput.aimDirection = rotateLocalToWorld(localDir);
        currentInput.aimOrigin = { localX: p.x, y: p.y, localZ: p.z };
      }
    }

    // Wristlink mounts on left grip (fallback: left target ray)
    var wristSpace = leftSource && (leftSource.gripSpace || leftSource.targetRaySpace);
    if (wristSpace) {
      var wristPose = frame.getPose(wristSpace, referenceSpace);
      if (wristPose) {
        var wp = wristPose.transform.position;
        var wq = wristPose.transform.orientation;
        currentInput.wrist = {
          localX: wp.x, y: wp.y, localZ: wp.z,
          qx: wq.x, qy: wq.y, qz: wq.z, qw: wq.w
        };
      }
    }

    var headQ = pose.transform.orientation;
    var headForward = rotateVectorByQuaternion(0, 0, -1, headQ);
    var worldForward = rotateLocalToWorld(headForward);
    currentInput.heading = Math.atan2(worldForward[0], -worldForward[2]);
    currentInput.bodyYaw = bodyYaw;
    if (!currentInput.aimDirection) {
      var headP = pose.transform.position;
      currentInput.aimDirection = worldForward;
      currentInput.aimOrigin = { localX: headP.x, y: headP.y, localZ: headP.z };
    }
  }

  function worldToXRMatrix(player) {
    var c = Math.cos(bodyYaw), s = Math.sin(bodyYaw);
    var m = new Float32Array(16);
    m[0] = c;  m[1] = 0; m[2] = -s; m[3] = 0;
    m[4] = 0;  m[5] = 1; m[6] = 0;  m[7] = 0;
    m[8] = s;  m[9] = 0; m[10] = c; m[11] = 0;
    m[12] = -(c * player.x + s * player.z);
    m[13] = -HEIGHT_BOOST;
    m[14] = s * player.x - c * player.z;
    m[15] = 1;
    return m;
  }

  function viewsForPose(pose, player) {
    var worldToXR = worldToXRMatrix(player);
    return pose.views.map(function (view) {
      var viewport = session.renderState.baseLayer.getViewport(view);
      return {
        projection: view.projectionMatrix,
        view: NS.math.mat4Multiply(view.transform.inverse.matrix, worldToXR),
        viewport: viewport
      };
    });
  }

  function framebuffer() {
    return session && session.renderState.baseLayer.framebuffer;
  }

  function end() {
    return session ? session.end() : Promise.resolve();
  }

  function worldYFromXR(y) {
    return (y || 0) + HEIGHT_BOOST;
  }

  function setFramebufferScale(scale) {
    framebufferScale = Math.max(0.4, Math.min(1.0, scale || 0.8));
    if (!session) return;
    try {
      var gl = NS.render.getContext();
      session.updateRenderState({
        baseLayer: new XRWebGLLayer(session, gl, {
          alpha: false,
          antialias: false,
          framebufferScaleFactor: framebufferScale
        })
      });
    } catch (e) { void e; }
  }

  NS.vr = {
    init: init,
    enter: enter,
    active: function () { return !!session; },
    end: end,
    input: function () { return currentInput; },
    viewsForPose: viewsForPose,
    framebuffer: framebuffer,
    setFramebufferScale: setFramebufferScale,
    worldYFromXR: worldYFromXR
  };
})(typeof window !== 'undefined' ? (window.HOLLOW = window.HOLLOW || {})
                                 : (global.HOLLOW = global.HOLLOW || {}));
