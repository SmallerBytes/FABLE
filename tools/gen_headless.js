'use strict';
/* Generates tools/headless.html from game/index.html with an error reporter. */
var fs = require('fs');
var html = fs.readFileSync(__dirname + '/../game/index.html', 'utf8');
html = html.replace(/src="src\//g, 'src="../game/src/');
html = html.replace('<script src="../game/src/math.js"></script>',
  '<script>window.__errors=[];window.onerror=function(m,s,l){window.__errors.push(m+" @ "+s+":"+l);};</script>\n' +
  '<script src="../game/src/math.js"></script>');
html = html.replace('</body>', [
  '<script>',
  'setTimeout(function(){',
  '  try {',
  '    var H = window.HOLLOW;',
  '    H.game.debug.start();',
  '    H.game.debug.setTrickle(true);',
  '    H.game.debug.burst();',
  '  } catch(e){ window.__errors.push("DEBUG START: " + e.message); }',
  '}, 1000);',
  'setTimeout(function(){',
  '  var out = [];',
  '  var H = window.HOLLOW || {};',
  '  out.push("errors=" + window.__errors.length);',
  '  window.__errors.forEach(function(e){ out.push("ERR: " + e); });',
  '  try {',
  '    out.push("modules=" + ["math","map","render","audio","enemy","game"].filter(function(k){return !!H[k];}).join(","));',
  '    out.push("gl=" + (document.getElementById("glcanvas").getContext("webgl") ? "yes" : "no"));',
  '    out.push("snapshot=" + JSON.stringify(H.game.debug.snapshot()));',
  '  } catch(e){ out.push("REPORTER ERR: " + e.message); }',
  '  var d = document.createElement("pre");',
  '  d.id = "test-result";',
  '  d.textContent = "HEADLESS RESULT\\n" + out.join("\\n");',
  '  document.body.appendChild(d);',
  '}, 2500);',
  '</script>',
  '</body>'].join('\n'));
fs.writeFileSync(__dirname + '/headless.html', html);
console.log('headless.html generated');
