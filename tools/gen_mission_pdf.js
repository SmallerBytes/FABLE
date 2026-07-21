'use strict';
var fs = require('fs');
require('../game/src/math.js');
require('../game/src/map.js');
var M = global.HOLLOW.map;

var rows = M.asciiRows().map(function (line, r) {
  var out = '';
  for (var c = 0; c < line.length; c++) {
    if (M.isSafeCell(c, r) && (line[c] === '.' || line[c] === 'S')) out += 'S';
    else out += line[c];
  }
  return out;
});

var body = [
  'HOLLOW — ENEMY C2 NODE — MISSION MAP',
  'SOS Cyber Raid Exercise',
  '',
  'INTENT: Keys → blast doors → jack-in → LZ extract before chopper departs.',
  'Minimize emissions. Faraday harbors (S) dampen signature.',
  '',
  'LEGEND: # wall  . floor  S harbor  P infil  1-3 keys  G jack-in  X LZ  m intel  C security',
  'DOORS: D1 D2 D3 (locked until keyed) · TRIPWIRES: ' + M.markers.lasers.map(function (l) { return l.id; }).join(', '),
  ''
].concat(rows).concat([
  '',
  'Operator=VR. Mission Director=this map + voice.',
  'After uplink: inbound then on-station window. Miss LZ = left behind.',
  'Diagram: open game/map-print.html → Print → Save as PDF.'
]);

function pdfEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

var fontSize = 6;
var content = ['BT', '/F1 ' + fontSize + ' Tf', '36 780 Td', '7 TL'];
body.forEach(function (line, i) {
  var cmd = (i === 0 ? '' : 'T* ') + '(' + pdfEscape(line) + ') Tj';
  content.push(cmd);
});
content.push('ET');
var stream = content.join('\n');

var objs = [];
objs.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
objs.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
objs.push('3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n');
objs.push('4 0 obj<< /Length ' + Buffer.byteLength(stream, 'utf8') + ' >>stream\n' + stream + '\nendstream\nendobj\n');
objs.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>endobj\n');

var pdf = '%PDF-1.4\n';
var offsets = [0];
objs.forEach(function (o) {
  offsets.push(Buffer.byteLength(pdf, 'utf8'));
  pdf += o;
});
var xrefStart = Buffer.byteLength(pdf, 'utf8');
pdf += 'xref\n0 ' + (objs.length + 1) + '\n';
pdf += '0000000000 65535 f \n';
for (var i = 1; i < offsets.length; i++) {
  pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
}
pdf += 'trailer<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

var out = __dirname + '/../game/assets/HOLLOW_Mission_Map.pdf';
fs.mkdirSync(__dirname + '/../game/assets', { recursive: true });
fs.writeFileSync(out, pdf);
console.log('Wrote', out);
console.log('safes=', M.markers.safes.length, 'lasers=', M.markers.lasers.length);
