const test = require('node:test');
const assert = require('node:assert/strict');
const { rapidCsvFiles, rapidSecondRows, rapidPressureDatasets, rapidCompleteness } = require('../spp3_BLE/rapid-results.js');

// All fields in these exports are quoted; handle doubled quotes, JSON and CRLF.
function readCsv(text) {
    const rows = []; let row = [], value = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
        } else if (c === ',' && !quoted) { row.push(value); value = ''; }
        else if (c === '\r' && text[i + 1] === '\n' && !quoted) { rows.push([...row, value]); row = []; value = ''; i++; }
        else value += c;
    }
    rows.push([...row, value]);
    const headers = rows.shift();
    return { headers, rows: rows.map(r => { assert.equal(r.length, headers.length); return Object.fromEntries(headers.map((h, i) => [h, r[i]])); }) };
}

function runFixture() {
    const pressure = (t, offset = 0) => ({ type: 'pressure', elapsed_ms: t, received_at: '2026-11-14T12:00:00.000Z',
        monitor_adc: 1800000 + offset, neck_adc: 2000000 + offset, head_adc: 1900000 + offset });
    const classification = (t, seq, history) => ({ type: 'classification', elapsed_ms: t, received_at: '2026-11-14T12:00:01.000Z',
        result: { session: 2, sequence: seq, tickMs: 9000 + seq, sampleSequence: 200 + seq, sampleMs: 8990 + seq,
            adc: [1800011, 2000022, 1900033], staticModel: { status: 'OK', group: 'GROUP1', p1: .8, p2: .2 },
            historyModel: history || { status: 'WARMUP', group: null, p1: null, p2: null }, historyCount: seq - 1, dropped: 0, inferenceUs: 1200 } });
    return { id: 'run-1', dataOrigin: 'SIMULATED', subject: 'S01', pose: '1', head: 8, neck: 11,
        profile: { gender: 'female', age_years: 25, body_height_cm: 170, body_weight_kg: 65 },
        startedAt: '2026-11-14T12:00:00.000Z', status: '20秒結束', duration_ms: 20000, startAckElapsedMs: 60,
        calibration: { '1': { head: 8, neck: 11, pressure: { head_adc: 1900400 } } },
        firmwareCalibration: { BSHS: [1800000, 2000000, 1900000, 8, 11], BLHL: [1900000, 2200000, 2100000, 9, 12] },
        events: [pressure(500), classification(1000, 1), classification(1500, 2), classification(1900, 3), pressure(4500, 100),
            classification(20000, 7, { status: 'OK', group: 'GROUP2', p1: .1, p2: .9 })] };
}

test('20-second CSV round-trip preserves model ADC, metadata, boundaries, gaps and warmup without fake probabilities', () => {
    const run = runFixture(), csv = rapidCsvFiles([run]);
    const seconds = readCsv(csv.seconds), events = readCsv(csv.events);
    assert.equal(seconds.headers.length, 41); assert.equal(events.headers.length, 40);
    assert.equal(seconds.rows.length, 20); assert.equal(events.rows.length, 7);
    const first = seconds.rows[0];
    assert.equal(first.second, '1'); assert.equal(first.sequence, '1');
    assert.equal(first.neck_adc, '2000022'); assert.equal(first.head_adc, '1900033');
    assert.equal(first.static_p_group1, '0.8'); assert.equal(first.history_status, 'WARMUP');
    assert.equal(first.history_group, ''); assert.equal(first.history_p_group1, '');
    assert.deepEqual(JSON.parse(first.calibration_json), run.calibration);
    assert.deepEqual(JSON.parse(first.firmware_calibration_json), run.firmwareCalibration);
    assert.equal(first.data_origin, 'SIMULATED'); assert.equal(first.classification_start_ack_elapsed_ms, '60');
    assert.equal(seconds.rows[1].sequence, '3'); assert.equal(seconds.rows[1].classification_count_in_second, '2');
    assert.equal(seconds.rows[2].static_status, 'MISSING'); assert.equal(seconds.rows[2].static_p_group1, '');
    assert.equal(seconds.rows[19].history_group, 'GROUP2'); assert.equal(seconds.rows[19].history_p_group2, '0.9');
    assert.equal(events.rows[0].event_type, 'run');
    assert.equal(events.rows[1].event_type, 'pressure'); assert.equal(events.rows[1].head_adc, '1900000');
    assert.equal(events.rows[1].static_status, ''); assert.equal(events.rows[1].sequence, '');
    assert.equal(events.rows.filter(r => r.event_type === 'classification').length, 4);
    assert.deepEqual(rapidCompleteness(run), { received: 3, staticValid: 3, historyValid: 1 });
});

test('early stop distinguishes missing recorded seconds from not-recorded time; chart leaves telemetry gaps', () => {
    const run = runFixture(); run.duration_ms = 2500; run.events = run.events.filter(e => e.elapsed_ms <= 2500);
    const rows = rapidSecondRows(run);
    assert.equal(rows[2].status, 'MISSING'); assert.equal(rows[3].status, 'NOT_RECORDED');
    const data = rapidPressureDatasets(runFixture());
    assert.deepEqual(data[1].data, [{ x: .5, y: 2000000 }, { x: 2.5, y: null }, { x: 4.5, y: 2000100 }]);
    assert.equal(data[1].spanGaps, false);
});
