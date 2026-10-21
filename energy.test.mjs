import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, analyze, demoCSV, csvRows } from './energy.mjs';
const demo = () => parseCSV(demoCSV());
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('eight-hour constant experiment integrates watts to kWh', () => { const r = analyze(demo()); near(r.beforeKwh, .960); near(r.afterKwh, .360); near(r.differenceKwh, .600); near(r.comparableHours, 8); });
test('asymmetric missing interval removes both sides of comparison', () => { const r = analyze(demo().filter(r => !(r.phase === 'after' && r.row === 11))); near(r.comparableHours, 7); near(r.differenceKwh, .525); near(r.coverageHours.before, 8); near(r.missingHours.after, 1); });
test('half-hour clipping uses exact overlap, not sample count', () => { const r = analyze(demo(), { start: '22:30', end: '05:30', maxInterval: 60 }); near(r.comparableHours, 7); near(r.beforeKwh, .84); });
test('different subdivisions produce identical matched energy', () => { const data = demo(); const r = data.find(x => x.phase === 'after'); const midpoint = (r.start + r.end) / 2; data.splice(data.indexOf(r), 1, { ...r, end: midpoint }, { ...r, start: midpoint }); const x = analyze(data); near(x.differenceKwh, .6); near(x.comparableHours, 8); });
test('negative change is retained as increased consumption', () => { const r = analyze(demo().map(x => ({ ...x, watts: x.phase === 'after' ? 200 : x.watts }))); near(r.differenceKwh, -.64); });
test('duplicate and overlapping observations rejected', () => { const rows = demo(); assert.throws(() => analyze([...rows, rows[0]]), /Overlapping/); });
test('overlong interval cannot create implied savings', () => assert.throws(() => analyze(demo(), { maxInterval: 30 }), /exceeds/));
test('two nights in one phase rejected', () => { const rows = demo(); rows.push({ ...rows[0], start: rows[0].start + 86400000, end: rows[0].end + 86400000 }); assert.throws(() => analyze(rows), /exactly one night/); });
test('nonoverlapping clock coverage rejected', () => { const rows = demo().filter(x => x.phase === 'before' ? x.row < 6 : x.row > 13); assert.throws(() => analyze(rows), /No common/); });
test('CSV quoting, BOM, CRLF and trailing blank lines', () => { const text = '\uFEFF' + demoCSV().replace('120,before', '"120","before"').replaceAll('\n', '\r\n') + '\r\n'; near(analyze(parseCSV(text)).differenceKwh, .6); assert.deepEqual(csvRows('a,"b,b"\n'), [['a', 'b,b']]); });
test('malformed CSV quote rejected', () => assert.throws(() => csvRows('a,"unclosed'), /Unclosed/));
test('nonfinite, negative, empty and formula values rejected', () => { for (const v of ['NaN', 'Infinity', '-1', '', '=1+1']) assert.throws(() => parseCSV(demoCSV().replace('120,before', `${v},before`)), /watts/); });
test('invalid calendar date and timezone offset rejected', () => { assert.throws(() => parseCSV(demoCSV().replace('2026-10-20', '2026-02-30')), /calendar/); assert.throws(() => parseCSV(demoCSV().replaceAll('+09:00', '+14:30')), /offset/); });
test('mixed offset / DST transitions rejected', () => assert.throws(() => parseCSV(demoCSV().replace('+09:00', '+08:00')), /fixed timezone/));
test('empty and equal night windows rejected', () => { assert.throws(() => analyze([]), /CSV/); assert.throws(() => analyze(demo(), { start: '06:00', end: '06:00' }), /differ/); });
test('zero watts are valid, missing measurements are not zero', () => { const rows = demo().map(r => ({ ...r, watts: 0 })); const r = analyze(rows); near(r.differenceKwh, 0); near(r.comparableHours, 8); });
test('data before night start excluded without adding duration', () => { const rows = demo(); rows.unshift({ ...rows[0], start: rows[0].start - 3600000, end: rows[0].start, watts: 999 }); near(analyze(rows).beforeKwh, .96); });
test('multi-day span fails closed', () => { const rows = demo(); rows[7].end += 86400000 * 3; assert.throws(() => analyze(rows), /48 hours/); });

test('10,000 CSV intervals accepted with or without a final newline', () => {
  const header = 'start,end,watts,phase\n';
  const row = '2026-10-20T22:00:00+09:00,2026-10-20T23:00:00+09:00,120,before';
  for (const ending of ['', '\n', '\r\n']) {
    const text = header + Array(10000).fill(row).join('\n') + ending;
    assert.ok(new TextEncoder().encode(text).byteLength < 1000000);
    assert.equal(parseCSV(text).length, 10000);
  }
});
test('10,001 CSV intervals rejected regardless of final newline', () => {
  const row = '2026-10-20T22:00:00+09:00,2026-10-20T23:00:00+09:00,120,before';
  for (const ending of ['', '\n', '\r\n']) {
    assert.throws(() => parseCSV('start,end,watts,phase\n' + Array(10001).fill(row).join('\n') + ending), /10,000/);
  }
});
