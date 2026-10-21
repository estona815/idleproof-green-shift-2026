export const schema = 'idleproof/evidence/v1';
const minute = 60000;
function demand(ok, message) { if (!ok) throw new Error(message); }
export function csvRows(text) {
  demand(text.length <= 1000000, 'CSV exceeds the 1 MB limit.');
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') { demand(cell === '' && !closed, 'Invalid CSV quoting.'); quoted = true; }
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') { if (row.some(x => x.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else { demand(!closed, 'Unexpected text after a quoted CSV field.'); cell += c; }
    demand(rows.length <= 10001, 'At most 10,000 intervals plus the header are supported.');
  }
  demand(!quoted, 'Unclosed CSV quote.');
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  demand(rows.length <= 10001, 'At most 10,000 intervals plus the header are supported.');
  return rows;
}
function stamp(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00(Z|[+-]\d{2}:\d{2})$/.exec(value);
  demand(m, 'Use minute-aligned ISO timestamps with an explicit offset, e.g. 2026-10-20T22:00:00+09:00.');
  const [, y, mo, d, h, mi, zone] = m;
  demand(+y >= 2000 && +y <= 2100 && +mo >= 1 && +mo <= 12 && +h < 24 && +mi < 60, 'Timestamp outside supported calendar range.');
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  demand(new Date(wall).getUTCDate() === +d && new Date(wall).getUTCMonth() === +mo - 1, 'Invalid calendar date.');
  demand(zone === 'Z' || (+zone.slice(1, 3) <= 14 && +zone.slice(4) < 60 && (+zone.slice(1, 3) < 14 || +zone.slice(4) === 0)), 'Invalid timezone offset.');
  return { wall, zone: zone === '+00:00' ? 'Z' : zone };
}
export function parseCSV(text) {
  const [header, ...data] = csvRows(text);
  demand(header && header.join(',') === 'start,end,watts,phase', 'CSV header must be start,end,watts,phase.');
  demand(data.length > 0 && data.length <= 10000, 'Provide 1–10,000 intervals.');
  let zone;
  return data.map((r, i) => {
    demand(r.length === 4, `Row ${i + 2}: expected four fields.`);
    const [a, b, w, phase] = r.map(x => x.trim());
    demand(phase === 'before' || phase === 'after', `Row ${i + 2}: phase must be before or after.`);
    demand(/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(w), `Row ${i + 2}: watts must be a nonnegative number.`);
    const watts = Number(w); demand(Number.isFinite(watts) && watts <= 1000000000, 'Watts outside supported range.');
    const start = stamp(a), end = stamp(b);
    zone ??= start.zone;
    demand(start.zone === zone && end.zone === zone, 'Use one fixed timezone offset. DST or mixed-offset data must be split first.');
    demand(end.wall > start.wall && end.wall - start.wall <= 24 * 60 * minute, 'Intervals must be positive and at most 24 hours.');
    return { start: start.wall, end: end.wall, watts, phase, row: i + 2, zone };
  });
}
function clock(value) {
  demand(/^\d{2}:\d{2}$/.test(value), 'Night time must be HH:MM.');
  const [h, m] = value.split(':').map(Number); demand(h < 24 && m < 60, 'Invalid night time.');
  return h * 60 + m;
}
export function analyze(rows, { start = '22:00', end = '06:00', maxInterval = 60 } = {}) {
  const from = clock(start), until = clock(end), span = (until - from + 1440) % 1440;
  demand(span > 0, 'Night start and end must differ.');
  demand(Number.isFinite(maxInterval) && maxInterval >= 1 && maxInterval <= 1440, 'Max interval must be between 1 and 1440 minutes.');
  demand(rows.length > 0, 'Load a CSV first.');
  const parts = {};
  for (const phase of ['before', 'after']) {
    const raw = rows.filter(r => r.phase === phase).sort((a, b) => a.start - b.start);
    demand(raw.length, `No ${phase} intervals.`);
    demand(raw.at(-1).end - raw[0].start <= 48 * 60 * minute, `Use one overnight experiment per phase; ${phase} spans over 48 hours.`);
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      demand(r.end - r.start <= maxInterval * minute, `${phase} row ${r.row}: interval exceeds the chosen maximum. No interpolation performed.`);
      demand(!i || raw[i - 1].end <= r.start, `Overlapping or duplicate ${phase} intervals. Resolve them before comparison.`);
    }
    const nights = new Map();
    for (const r of raw) {
      const day = Math.floor(r.start / (1440 * minute)) * 1440 * minute;
      for (let anchor = day - 1440 * minute + from * minute; anchor < r.end; anchor += 1440 * minute) {
        const a = Math.max(r.start, anchor), b = Math.min(r.end, anchor + span * minute);
        if (b > a) { const list = nights.get(anchor) ?? []; list.push({ a: (a - anchor) / minute, b: (b - anchor) / minute, watts: r.watts }); nights.set(anchor, list); }
      }
    }
    demand(nights.size === 1, `Expected exactly one night of ${phase} data in this time window; found ${nights.size}.`);
    const [anchor, intervals] = [...nights][0];
    intervals.sort((a, b) => a.a - b.a);
    parts[phase] = { anchor, intervals, hours: intervals.reduce((n, p) => n + (p.b - p.a) / 60, 0) };
  }
  const before = parts.before.intervals, after = parts.after.intervals;
  let i = 0, j = 0, hours = 0, beforeKwh = 0, afterKwh = 0;
  const matched = [];
  while (i < before.length && j < after.length) {
    const a = before[i], b = after[j], lo = Math.max(a.a, b.a), hi = Math.min(a.b, b.b);
    if (hi > lo) { const h = (hi - lo) / 60; hours += h; beforeKwh += a.watts * h / 1000; afterKwh += b.watts * h / 1000; matched.push({ fromMinute: lo, toMinute: hi, beforeWatts: a.watts, afterWatts: b.watts }); }
    if (a.b <= b.b) i++; else j++;
  }
  demand(hours > 0, 'No common night coverage. No difference can be calculated.');
  return { schema, settings: { start, end, maxInterval }, timezone: rows[0].zone, beforeNight: new Date(parts.before.anchor).toISOString().slice(0, 10), afterNight: new Date(parts.after.anchor).toISOString().slice(0, 10), nightHours: span / 60, comparableHours: hours, coverageHours: { before: parts.before.hours, after: parts.after.hours }, missingHours: { before: span / 60 - parts.before.hours, after: span / 60 - parts.after.hours }, beforeKwh, afterKwh, differenceKwh: beforeKwh - afterKwh, matched, parts, interpretation: 'Difference observed, causation not established.', method: 'Interval-average watts integrated only over common local-time coverage. Gaps excluded; no imputation. Different nights may have different conditions. No claim that baseline use is waste or safe to switch off.', environmentalBenefit: 'Supports a participant-run shutdown experiment. Environmental savings have not been measured or validated.', exclusions: ['No annual extrapolation', 'No price or carbon estimate', 'No causal savings claim', 'Never disconnect refrigeration, medical, safety or essential equipment based on this tool'] };
}
export function demoCSV() {
  const out = ['start,end,watts,phase'];
  for (const phase of ['before', 'after']) for (let i = 0; i < 8; i++) {
    const day = phase === 'before' ? 20 : 22;
    const date = hour => `2026-10-${day + Math.floor(hour / 24)}T${String(hour % 24).padStart(2, '0')}:00:00+09:00`;
    out.push(`${date(22 + i)},${date(23 + i)},${phase === 'before' ? 120 : 45},${phase}`);
  }
  return out.join('\n') + '\n';
}
