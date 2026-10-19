import { parseCSV, analyze, demoCSV } from './energy.mjs';
const $ = id => document.getElementById(id);
let source = { name: 'Synthetic demonstration', kind: 'synthetic', text: demoCSV() }, result;
const number = n => n.toFixed(3), hours = n => n.toFixed(1);
function node(name, attrs = {}, text) { const e = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; return e; }
function chart(r) {
  $('plot').replaceChildren();
  const compact = $('plot').clientWidth < 550, width = compact ? 350 : 1000, height = compact ? 280 : 362, font = compact ? 13 : 16;
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Overnight average power in watts. Before ${number(r.beforeKwh)} kWh, after ${number(r.afterKwh)} kWh across ${hours(r.comparableHours)} matched hours. Gaps are not connected.` });
  const left = compact ? 46 : 70, right = width - (compact ? 12 : 22), top = 28, bottom = height - (compact ? 55 : 70), max = Math.max(200, Math.ceil(Math.max(...r.matched.flatMap(x => [x.beforeWatts, x.afterWatts])) / 50) * 50);
  const x = v => left + v / (r.nightHours * 60) * (right - left), y = w => bottom - w / max * (bottom - top);
  for (let i = 0; i <= 4; i++) { const w = max * i / 4; svg.append(node('line', { x1: left, x2: right, y1: y(w), y2: y(w), stroke: '#dfe7eb' }), node('text', { x: left - 9, y: y(w) + 5, 'text-anchor': 'end', fill: '#526579', 'font-size': font }, String(w))); }
  const ticks = compact ? 4 : 8;
  for (let i = 0; i <= ticks; i++) { const m = r.nightHours * 60 * i / ticks, t = (Number(r.settings.start.slice(0, 2)) * 60 + Number(r.settings.start.slice(3)) + m) % 1440; svg.append(node('line', { x1: x(m), x2: x(m), y1: top, y2: bottom, stroke: '#dfe7eb' }), node('text', { x: x(m), y: bottom + 26, 'text-anchor': i === ticks && compact ? 'end' : 'middle', fill: '#526579', 'font-size': font }, `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`)); }
  svg.append(node('line', { x1: left, x2: right, y1: bottom, y2: bottom, stroke: '#526579' }), node('line', { x1: left, x2: left, y1: top, y2: bottom, stroke: '#526579' }));
  for (const [phase, color] of [['before', '#ef8100'], ['after', '#087568']]) {
    for (const s of r.matched) svg.append(node('line', { x1: x(s.fromMinute), x2: x(s.toMinute), y1: y(s[phase + 'Watts']), y2: y(s[phase + 'Watts']), stroke: color, 'stroke-width': 2.5 }));
    const vals = r.matched.map(s => s[phase + 'Watts']);
    const last = r.matched.at(-1), closeLabels = Math.abs(y(last.beforeWatts) - y(last.afterWatts)) < font * 2;
    const labelCenter = Math.max(top + font + 8, Math.min(bottom - font - 8, (y(last.beforeWatts) + y(last.afterWatts)) / 2));
    const labelY = closeLabels
      ? (phase === 'before' ? labelCenter - font / 2 - 5 : labelCenter + font + 5)
      : y(vals.at(-1)) - 13;
    svg.append(node('text', { x: right - 5, y: labelY, 'text-anchor': 'end', fill: color, 'font-size': font }, `${phase === 'before' ? 'Before' : 'After'}${vals.every(w => w === vals[0]) ? ` (${vals[0]} W)` : ''}`));
  }
  svg.append(node('text', { x: (left + right) / 2, y: height - 5, 'text-anchor': 'middle', fill: '#526579', 'font-size': font }, 'Time'), node('text', { transform: `translate(${compact ? 11 : 14} ${(top + bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle', fill: '#526579', 'font-size': font }, 'Power (W)'));
  $('plot').append(svg);
}
async function recalculate() {
  try {
    result = analyze(parseCSV(source.text), { start: $('start').value, end: $('end').value, maxInterval: Number($('max').value) });
    $('error').hidden = true; $('export').disabled = false;
    $('difference').textContent = number(result.differenceKwh) + ' kWh';
    $('hours').textContent = `Across ${Number(result.comparableHours.toFixed(3))} comparable hours`;
    $('before').textContent = number(result.beforeKwh) + ' kWh'; $('after').textContent = number(result.afterKwh) + ' kWh';
    $('coverage').textContent = `${hours(result.coverageHours.before)} h before / ${hours(result.coverageHours.after)} h after`;
    const missing = result.missingHours.before + result.missingHours.after;
    $('quality').textContent = missing < 1e-9 ? '0' : `${hours(result.missingHours.before)} h missing before / ${hours(result.missingHours.after)} h missing after; excluded`;
    $('interpretation').textContent = result.differenceKwh < 0 ? 'After used more energy in the matched window. Causation not established.' : result.interpretation;
    $('provenance').textContent = source.kind === 'synthetic' ? 'Synthetic demo · not measured savings' : `Imported: ${source.name} · participant data, not independently verified`;
    chart(result);
  } catch (e) {
    result = undefined; $('export').disabled = true; $('error').hidden = false; $('error').textContent = e.message;
    for (const id of ['difference', 'before', 'after', 'coverage', 'hours', 'quality']) $(id).textContent = '—';
    $('interpretation').textContent = 'No valid comparison. Resolve the data issue before interpreting results.';
    $('provenance').textContent = source.kind === 'synthetic' ? 'Synthetic demo · comparison unavailable' : `Imported: ${source.name} · comparison unavailable`;
    const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No valid comparison to plot.'; $('plot').replaceChildren(p);
  }
}
function download(text, name, type) { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('demo').addEventListener('click', () => { source = { name: 'Synthetic demonstration', kind: 'synthetic', text: demoCSV() }; $('file').value = ''; $('start').value = '22:00'; $('end').value = '06:00'; $('max').value = '60'; recalculate(); });
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { source = { name: file.name, kind: 'participant', text: file.size > 1000000 ? ' '.repeat(1000001) : await file.text() }; } catch { source = { name: file.name, kind: 'participant', text: '' }; } recalculate(); });
$('controls').addEventListener('submit', e => { e.preventDefault(); recalculate(); });
$('sample').addEventListener('click', () => download(demoCSV(), 'idleproof-synthetic-demo.csv', 'text/csv'));
$('export').addEventListener('click', async () => {
  if (!result) return;
  const selectedResult = result, selectedSource = source;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(selectedSource.text));
  const evidence = { ...selectedResult, exportedAt: new Date().toISOString(), provenance: { kind: selectedSource.kind, sourceName: selectedSource.name, sourceSha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''), synthetic: selectedSource.kind === 'synthetic', independentVerification: false }, sourceCSV: selectedSource.text };
  download(JSON.stringify(evidence, null, 2), 'idleproof-evidence.json', 'application/json');
});
recalculate();
new ResizeObserver(() => { if (result) chart(result); }).observe($('plot'));
