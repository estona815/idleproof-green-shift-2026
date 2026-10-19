# IdleProof

An offline-first overnight electricity comparison tool for a participant-run shutdown experiment. Built for Green Shift Hacks (Devpost 31797). **Prepared locally; not registered or submitted.**

## Run

No dependencies or build step. From this folder:

```sh
python3 -m http.server 8874 --bind 127.0.0.1
```

Open http://127.0.0.1:8874 . ES modules require a local HTTP server; opening index.html directly as a file is unsupported. No data are posted to the server; it only serves static files. The Content Security Policy disables network connections from the app. There is no analytics, remote API, storage service, model API or persistent local storage. A reload resets the synthetic demonstration.

## Walkthrough

1. The initial, explicitly labelled synthetic demo contains eight hourly before readings at120W and eight after readings at45W. It produces0.960kWh before,0.360kWh after and a0.600kWh difference across eight common hours. These are generated examples, not field savings.
2. Change night starts to23:00 and night ends to05:00, then Recalculate. Common coverage becomes six hours and difference0.450kWh.
3. Set maximum interval to30minutes while demo intervals are60minutes. Numerical results disappear and Export evidence disables: no interpolation fills the gap.
4. Load demo resets the settings. Download synthetic CSV under the format guide to inspect the input schema, or Import CSV containing your own interval-average readings.
5. Export evidence downloads JSON containing the exact analysis settings, matched intervals, limitations, source CSV and its SHA-256. This is a reproducibility bundle, not an independent audit or proof of causation.

## Input and method

CSV header: `start,end,watts,phase`. Timestamps must be minute-aligned ISO8601 with seconds00 and an explicit fixed timezone offset. `watts` is the **average real power over the entire interval**, not a point reading or cumulative meter counter. `phase` is `before` or `after`. Each phase must contribute exactly one overnight window. Files limited to1MB and10,000rows. Example:

```csv
start,end,watts,phase
2026-10-20T22:00:00+09:00,2026-10-20T23:00:00+09:00,120,before
2026-10-22T22:00:00+09:00,2026-10-22T23:00:00+09:00,45,after
```

Intervals are clipped to the selected local-time window and aligned by elapsed local clock time from its start. A two-pointer intersection calculates energy **only on common coverage** as average watts × hours /1000. Missing hours are separately disclosed; no imputation, baseline extrapolation, annual multiplication or carbon conversion occurs. Different valid subdivisions produce the same energy for the same constant power. Invalid timestamps, mixed offsets/DST, overlapping or duplicate readings, negative/nonfinite values, long spans and missing common coverage fail closed. Changing weather, occupancy or equipment can confound a before/after comparison. The tool does not establish that a decrease was caused by a shutdown, that baseline consumption is waste, or that equipment is safe to disconnect.

Leave refrigeration, medical, safety and essential equipment alone. Meter accuracy, sensor calibration, participant permission and experiment comparability remain outside this prototype. Imported data are participant supplied and unverified; import does not establish measured origin. The demonstration has no measured environmental result, user study, certified savings, independent review or awards.

## Files and tests

- `energy.mjs`: pure CSV parser, fixed-offset calendar validation, interval intersection/integration and synthetic fixture.
- `app.mjs`: accessible DOM/SVG presentation, local import and JSON export.
- `style.css`, `index.html`: responsive static interface and content-security policy.
- `energy.test.mjs`:18 numeric and invalid-data tests.

```sh
node --test energy.test.mjs
```

Tests cover missing intervals, clipping, equivalent subdivisions, negative differences, duplicates, long intervals, multi-night spans, disjoint coverage, CSV quoting/BOM/CRLF, malformed values/dates/offsets, DST, empty windows and zero power. Native IAB also verified demo, actual file import, overlap rejection, narrower-window recalculation and actual downloaded JSON/source hash. Desktop1265px and390px iframe rendering were visually checked; no physical-phone/device claim. Native design reference1536×1024 could not be selected with the exposed viewport controls; current viewport and the390px wrapper were used. Mobile chart typography was corrected after the first screenshot.

## Attribution and disclosure

Prepared under participant kwonj0815's instructions. OpenAI Codex assisted with concept, code, synthetic example, documentation and producer review. A built-in image-generation tool created a design reference retained in the separate review folder; no generated bitmap is shipped as functional UI. Interface text, controls and chart are real HTML/CSS/DOM/SVG. No prior project code, stock models, datasets, external fonts, photos, third-party libraries or paid APIs are incorporated. Short Green Shift rules do not explicitly address AI assistance; organizer approval is not claimed. Registration/final legal acceptance and actual platform receipt remain separate from this local package.
