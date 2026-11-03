// Synthetic test data only: these values do not represent a real subject or device.
const test = require('node:test');
const assert = require('node:assert/strict');
const createPressureRecorder = require('../spp3_BLE/pressure-recorder.js');

function setup(gapTimeoutMs = 3000) {
    let clock = 5000;
    let wall = '2026-11-03T12:00:00.000Z';
    let sequence = 0;
    const recorder = createPressureRecorder({
        now: () => clock, isoNow: () => wall, createId: () => `synthetic-run-${++sequence}`,
        durationMs: 30000, gapTimeoutMs
    });
    const metadata = {
        subject_id: 'SYNTHETIC', trial_index: 1, condition_id: '01', actual_pose: 'pose1',
        height_condition: 'height1', head_height_cm: 9, neck_height_cm: 11,
        test_condition: 'still', height_source: 'operator', notes: ''
    };
    const at = elapsed => { clock = 5000 + elapsed; };
    function sample(elapsed, values = [100.25, 200.5, 300.75], timestamp = wall) {
        at(elapsed);
        return recorder.receive({ monitor_adc: values[0], neck_adc: values[1], head_adc: values[2],
            receivedMonotonicMs: clock, timestamp_iso: timestamp });
    }
    return { recorder, metadata, at, sample, wall: value => { wall = value; } };
}

test('gap threshold is explicitly required', () => {
    assert.throws(() => createPressureRecorder(), /positive finite/);
    assert.throws(() => createPressureRecorder({ gapTimeoutMs: 0 }), /positive finite/);
});

test('30 seconds is a time window, not a required sample count or endpoint pair', () => {
    const t = setup(); t.recorder.start(t.metadata);
    for (let elapsed = 400; elapsed < 30000; elapsed += 1000) assert.equal(t.sample(elapsed), true);
    t.at(30000); const state = t.recorder.tick();
    assert.equal(state.status, 'completed');
    assert.equal(state.elapsedMs, 30000);
    assert.equal(state.samples.length, 30);
    assert.equal(state.samples[0].elapsed_s, 0.4);
    assert.equal(state.samples.at(-1).elapsed_s, 29.4);
    assert.equal(t.sample(31000), false);
});

test('a valid exact-deadline message is included; repeated values are distinct messages', () => {
    const t = setup(); t.recorder.start(t.metadata);
    for (let i = 0; i <= 30; i++) t.sample(i * 1000);
    const state = t.recorder.getState();
    assert.equal(state.status, 'completed');
    assert.equal(state.samples.length, 31);
    assert.equal(state.samples.at(-1).elapsed_s, 30);
    assert.equal(state.samples.at(-1).sample_index, 31);
});

test('early stop keeps samples and cannot be replaced until export requested', () => {
    const t = setup(); const initial = t.recorder.start(t.metadata);
    t.sample(100); t.sample(1100); t.at(1900);
    assert.equal(t.recorder.endEarly().status, 'ended_early');
    assert.throws(() => t.recorder.start(t.metadata), /Export the previous/);
    const csv = t.recorder.csv();
    assert.match(csv, /ended_early/);
    assert.equal(t.recorder.getState().exportRequested, false);
    t.recorder.acknowledgeExport();
    assert.notEqual(t.recorder.start(t.metadata).runId, initial.runId);
});

test('disconnect interrupts without discarding collected rows', () => {
    const t = setup(); t.recorder.start(t.metadata); t.sample(500); t.at(900);
    const state = t.recorder.disconnect();
    assert.equal(state.status, 'interrupted');
    assert.equal(state.interruptionReason, 'ble_disconnected');
    assert.equal(state.samples.length, 1);
    assert.equal(t.sample(1900), false);
});

test('a disconnect observed before the completion timer cannot become completed', () => {
    const t = setup(); t.recorder.start(t.metadata);
    for (let e = 0; e <= 29000; e += 1000) t.sample(e);
    t.at(30001);
    assert.equal(t.recorder.disconnect().status, 'interrupted');
    assert.equal(t.recorder.tick().status, 'interrupted');
});

test('gap threshold is inclusive and a late returning sample cannot repair it', () => {
    const t = setup(); t.recorder.start(t.metadata); t.sample(200);
    assert.equal(t.sample(3200), false);
    assert.equal(t.recorder.getState().status, 'interrupted');
    assert.equal(t.recorder.getState().interruptionReason, 'pressure_gap');
    assert.equal(t.recorder.getState().samples.length, 1);
});

test('no samples never counts as completed, including gap longer than duration', () => {
    const t = setup(60000); t.recorder.start(t.metadata); t.at(30000);
    assert.equal(t.recorder.tick().status, 'interrupted');
    assert.equal(t.recorder.getState().interruptionReason, 'no_pressure_data');
    assert.throws(() => t.recorder.csv(), /No finished samples/);
});

test('no data reaches the configured gap without any invented sample', () => {
    const t = setup(); t.recorder.start(t.metadata); t.at(3000);
    assert.equal(t.recorder.tick().status, 'interrupted');
    assert.equal(t.recorder.getState().samples.length, 0);
});

test('delayed timers check gaps only within the window', () => {
    const t = setup(); t.recorder.start(t.metadata);
    for (let e = 0; e <= 29000; e += 1000) t.sample(e);
    t.at(70000);
    assert.equal(t.recorder.tick().status, 'completed');
    assert.equal(t.recorder.getState().elapsedMs, 30000);
    const u = setup(); u.recorder.start(u.metadata);
    for (let e = 0; e <= 25000; e += 1000) u.sample(e);
    u.at(70000);
    assert.equal(u.recorder.tick().status, 'interrupted');
});

test('late post-window samples are not added, even when timer has not fired', () => {
    const t = setup(); t.recorder.start(t.metadata);
    for (let e = 0; e <= 29000; e += 1000) t.sample(e);
    assert.equal(t.sample(30000.5), false);
    assert.equal(t.recorder.getState().status, 'completed');
    assert.equal(t.recorder.getState().samples.length, 30);
});

test('invalid numbers, pre-start, out-of-order and missing-zone timestamps are rejected', () => {
    const t = setup(); t.recorder.start(t.metadata);
    assert.equal(t.sample(-1), false);
    assert.equal(t.sample(10, [1, NaN, 3]), false);
    assert.equal(t.sample(20, [1, 2, Infinity]), false);
    assert.equal(t.sample(30, [1, 2, 3], '2026-11-03T12:00:00'), false);
    assert.equal(t.sample(40, [1, 2, 3], 'invalidZ'), false);
    assert.equal(t.sample(50, [0, 2, 3]), true);
    assert.equal(t.sample(49), false);
    assert.equal(t.recorder.getState().samples.length, 1);
    assert.equal(t.recorder.getState().elapsedMs, 50);
});

test('metadata and returned state are independent snapshots', () => {
    const t = setup(); t.metadata.extra = { marker: 'original' };
    const state = t.recorder.start(t.metadata);
    t.metadata.condition_id = '04'; t.metadata.extra.marker = 'changed';
    state.metadata.subject_id = 'other';
    t.sample(100);
    const exposed = t.recorder.getState(); exposed.samples[0].head_adc = 99;
    const actual = t.recorder.getState();
    assert.equal(actual.metadata.subject_id, 'SYNTHETIC');
    assert.equal(actual.metadata.condition_id, '01');
    assert.equal(actual.metadata.extra.marker, 'original');
    assert.equal(actual.samples[0].head_adc, 300.75);
});

function parseCsv(csv) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    const text = csv.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
        } else if (!quoted && c === ',') { row.push(cell); cell = ''; }
        else if (!quoted && c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
        else cell += c;
    }
    assert.equal(quoted, false);
    return rows;
}

test('CSV parses back exact real sample rows, channel order, escaping and final status', () => {
    const t = setup(); t.metadata.notes = 'comma, quote " and\r\nnext line';
    t.recorder.start(t.metadata); t.sample(125.5, [101.1234567, 202.2345678, 303.3456789]);
    t.sample(1125.5, [0, 10, 20]); t.recorder.endEarly();
    const rows = parseCsv(t.recorder.csv());
    assert.equal(rows.length, 3);
    const headers = rows[0];
    const read = (row, key) => row[headers.indexOf(key)];
    assert.equal(read(rows[1], 'notes'), t.metadata.notes);
    assert.equal(read(rows[1], 'monitor_adc'), '101.1234567');
    assert.equal(read(rows[1], 'neck_adc'), '202.2345678');
    assert.equal(read(rows[1], 'head_adc'), '303.3456789');
    assert.equal(read(rows[1], 'elapsed_s'), '0.125500');
    assert.equal(read(rows[2], 'sample_index'), '2');
    assert.equal(read(rows[1], 'run_status'), 'ended_early');
    assert.equal(read(rows[2], 'run_status'), 'ended_early');
    assert.equal(read(rows[1], 'data_timeout_s'), '3');
    assert.equal(read(rows[2], 'data_timeout_s'), '3');
    assert.equal(read(rows[1], 'gap_timeout_ms'), '3000');
    assert.equal(read(rows[1], 'pressure_unit'), 'ADC');
    assert.equal(read(rows[1], 'time_source'), 'browser_complete_pressure_message_received');
});

test('absolute timestamps may move backwards while elapsed_s remains monotonic', () => {
    const t = setup(); t.recorder.start(t.metadata);
    t.sample(500, [1, 2, 3], '2026-11-03T12:00:00Z');
    t.sample(1500, [4, 5, 6], '2026-11-03T10:00:00+08:00');
    const rows = t.recorder.getState().samples;
    assert.equal(rows[1].elapsed_s - rows[0].elapsed_s, 1);
    assert.ok(Date.parse(rows[1].timestamp_iso) < Date.parse(rows[0].timestamp_iso));
});

test('export is forbidden while recording and repeated starts are rejected', () => {
    const t = setup(); t.recorder.start(t.metadata); t.sample(100);
    assert.throws(() => t.recorder.csv(), /No finished samples/);
    assert.throws(() => t.recorder.acknowledgeExport(), /No finished samples/);
    assert.throws(() => t.recorder.start(t.metadata), /already in progress/);
});
