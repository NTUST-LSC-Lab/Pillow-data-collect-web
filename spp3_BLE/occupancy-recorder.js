// EXP04: operator labels are ground truth; the two detectors share each complete P receipt.
const OCCUPANCY_SEGMENT_MS = 30000;
const OCCUPANCY_CHANNELS = ['monitor', 'neck', 'head'];
const OCCUPANCY_RULE = Object.freeze({
    version: 'EXP04_LOAD_RATIO_FULL30_20261027_V1',
    source: 'occupancy_two_height_threshold_20261027/runs/full_20261027_01/full30_refit_thresholds.csv',
    source_sha256: '6de172e253053d22cbddae72212eba7c6cea7ec4db9c1a565648b0d5332784bc',
    provenance: 'full30 by_height candidate refit; majority vote is unvalidated prospectively',
    validity: 'complete finite positive ADC triplet; finite kPa; positive finite calibration kPa; no device freshness flags in P protocol',
    comparison: 'current_kpa / calibration_load_kpa >= threshold; majority >= 2 of 3',
    thresholds: Object.freeze({
        '1': Object.freeze({ monitor: .48, neck: .27, head: .45 }),
        '5': Object.freeze({ monitor: .63, neck: .75, head: .67 })
    }),
    conversion: Object.freeze({
        monitor: Object.freeze({ slope: .000007976305, offset: -12.414949423913 }),
        neck: Object.freeze({ slope: .0000045060, offset: -8.7398532587 }),
        head: Object.freeze({ slope: .0000038296, offset: -7.1811602848 })
    })
});

function occupancyKpa(adc, channel, rule = OCCUPANCY_RULE) {
    const c = rule.conversion[channel];
    return Number.isFinite(adc) ? adc * c.slope + c.offset : NaN;
}

function occupancyDetect(sample, anchor, group, rule = OCCUPANCY_RULE) {
    const result = { validity: 'VALID' };
    for (const ch of OCCUPANCY_CHANNELS) {
        const adc = sample?.[ch + '_adc'], kpa = occupancyKpa(adc, ch, rule);
        const baseline = occupancyKpa(anchor?.pressure?.[ch + '_adc'], ch, rule);
        result[ch + '_adc'] = Number.isFinite(adc) ? adc : null;
        result[ch + '_kpa'] = Number.isFinite(kpa) ? kpa : null;
        if (!(baseline > 0) || !Number.isFinite(baseline)) result.validity = 'INVALID_BASELINE';
        else if (!(adc > 0) || !Number.isFinite(kpa)) result.validity = 'INVALID_PRESSURE';
        result[ch + '_ratio'] = baseline > 0 && Number.isFinite(kpa) ? kpa / baseline : null;
    }
    // Both rules abstain together if any channel is invalid; no two-sensor fallback.
    for (const ch of OCCUPANCY_CHANNELS) result[ch + '_vote'] = result.validity === 'VALID'
        ? Number(result[ch + '_ratio'] >= rule.thresholds[group][ch]) : null;
    result.monitor_result = result.validity === 'VALID' ? result.monitor_vote : null;
    result.majority_result = result.validity === 'VALID'
        ? Number(OCCUPANCY_CHANNELS.reduce((n, ch) => n + result[ch + '_vote'], 0) >= 2) : null;
    return result;
}

function occupancyEvent(run, type, elapsed, details = {}) {
    const event = { type, elapsed_ms: elapsed, timestamp_iso: new Date().toISOString(), ...details };
    run.events.push(event);
    return event;
}

function createOccupancyRun(meta, start, startedAt, completed = []) {
    const run = { ...JSON.parse(JSON.stringify(meta)), start, startedAt, recording: true, status: 'RECORDING',
        completed: [...completed], segments: [], samples: [], events: [], duration_ms: 0 };
    occupancyEvent(run, 'run_start', 0, { carried_completed: [...completed] });
    return run;
}

function occupancyTick(run, elapsed) {
    if (!run?.recording) return false;
    run.duration_ms = Math.max(run.duration_ms, elapsed);
    const segment = run.segments.at(-1);
    if (!segment || segment.reached || elapsed - segment.start_ms < OCCUPANCY_SEGMENT_MS) return false;
    segment.reached = true;
    if (segment.role === 'post_empty') run.completed.push(segment.paired_pose);
    occupancyEvent(run, 'segment_30s', segment.start_ms + OCCUPANCY_SEGMENT_MS,
        { segment_id: segment.id, observed_elapsed_ms: elapsed, role: segment.role, completed: [...run.completed] });
    return true;
}

function occupancyCloseSegment(run, elapsed, reason) {
    const s = run.segments.at(-1);
    if (!s || s.end_ms !== undefined) return;
    s.end_ms = elapsed;
    s.duration_ms = elapsed - s.start_ms;
    s.formal_ms = Math.min(s.duration_ms, OCCUPANCY_SEGMENT_MS);
    s.extension_ms = Math.max(0, s.duration_ms - OCCUPANCY_SEGMENT_MS);
    s.end_reason = reason;
    occupancyEvent(run, 'segment_end', elapsed, { ...s });
    if (s.extension_ms > 0) occupancyEvent(run, 'segment_extension', elapsed,
        { segment_id: s.id, extension_start_ms: s.start_ms + OCCUPANCY_SEGMENT_MS, extension_ms: s.extension_ms });
}

function occupancyMark(run, actual, elapsed, source = 'state_button') {
    if (!run?.recording || !['empty', '1', '2', '3', '4', '5'].includes(actual)) return false;
    occupancyTick(run, elapsed);
    const previous = run.segments.at(-1);
    const button = occupancyEvent(run, 'button', elapsed, { actual, source, repeated: previous?.actual === actual });
    if (previous?.actual === actual) return false;
    occupancyCloseSegment(run, elapsed, 'state_changed');
    const expected = String(run.completed.length + 1);
    let role = 'out_of_order', paired_pose = null;
    if (actual === expected) role = 'pose';
    else if (actual === 'empty' && previous?.role === 'pose' && previous.reached && previous.actual === expected) {
        role = 'post_empty'; paired_pose = previous.actual;
    }
    const segment = { id: run.segments.length + 1, actual, role, paired_pose, start_ms: elapsed, marked_at: button.timestamp_iso, reached: false };
    const retest = run.segments.some(s => s.actual === actual && actual !== 'empty');
    run.segments.push(segment);
    occupancyEvent(run, 'segment_start', elapsed, { ...segment });
    if (role === 'out_of_order') occupancyEvent(run, 'out_of_order', elapsed, { actual, expected });
    if (retest) occupancyEvent(run, 'retest', elapsed, { actual, segment_id: segment.id });
    return true;
}

function occupancyStop(run, elapsed, status) {
    if (!run?.recording) return;
    occupancyTick(run, elapsed);
    occupancyCloseSegment(run, elapsed, status);
    run.duration_ms = elapsed; run.recording = false; run.status = status;
    occupancyEvent(run, 'run_end', elapsed, { status, completed: [...run.completed] });
}

function occupancyRecordPressure(run, sample) {
    if (!run?.recording) return;
    const elapsed = sample.receivedMonotonicMs - run.start;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed <= (run.samples.at(-1)?.elapsed_ms ?? -Infinity)) return;
    const s = run.segments.at(-1);
    const result = occupancyDetect(sample, run.calibration[run.group], run.group, run.rule);
    run.samples.push({ ...result, elapsed_ms: elapsed, received_at: sample.timestamp_iso, raw_line: sample.raw_line,
        segment_id: s?.id ?? '', actual: s?.actual ?? 'unknown',
        window: !s ? 'UNLABELLED' : elapsed - s.start_ms < OCCUPANCY_SEGMENT_MS ? 'FORMAL' : 'EXTENSION' });
}

function occupancyNext(run) {
    if (!run) return '先按開始高度測試，再以姿勢一躺下並按「姿勢一」記錄30秒。';
    if (run.completed.length === 5) return '5／5完成，請按「結束本高度測試」。';
    const s = run.segments.at(-1);
    if (s?.role === 'pose') return s.reached ? '已達30秒；完全離枕時按「離開枕頭」。' : `維持姿勢${s.actual}，滿30秒後離枕。`;
    if (s?.role === 'post_empty' && !s.reached) return '保持離枕滿30秒，才計入本姿勢完成。';
    return `下一個：姿勢${run.completed.length + 1}躺枕30秒，再離枕30秒。`;
}

// Bins start at each operator label, never reuse an earlier receipt, and split at 30s.
function occupancySecondRows(run) {
    const rows = [];
    const ranges = run.segments.map(s => ({ ...s, end_ms: s.end_ms ?? run.duration_ms }));
    const first = ranges[0]?.start_ms ?? run.duration_ms;
    if (first > 0) ranges.unshift({ id: '', actual: 'unknown', role: 'unlabelled', start_ms: 0, end_ms: first });
    let cursor = 0;
    for (const s of ranges) {
        for (let t = s.start_ms, second = 1; t < s.end_ms; t += 1000, second++) {
            const end = Math.min(t + 1000, s.end_ms), samples = [];
            while (cursor < run.samples.length && run.samples[cursor].elapsed_ms < t) cursor++;
            while (cursor < run.samples.length && run.samples[cursor].elapsed_ms < end) samples.push(run.samples[cursor++]);
            const last = samples.at(-1);
            rows.push({ segment_id: s.id, actual: s.actual, role: s.role, segment_second: second,
                interval_start_ms: t, interval_end_ms: end, interval_duration_ms: end - t,
                window: !s.id ? 'UNLABELLED' : second <= 30 ? 'FORMAL' : 'EXTENSION',
                segment_time_complete: Boolean(s.reached), sample_count: samples.length,
                valid_sample_count: samples.filter(e => e.validity === 'VALID').length,
                validity: 'MISSING', ...last,
                segment_elapsed_s: ((last?.elapsed_ms ?? t) - s.start_ms) / 1000 });
        }
    }
    return rows;
}

function occupancySnapshot(run, elapsed) {
    const copy = JSON.parse(JSON.stringify(run));
    if (copy.recording) occupancyStop(copy, elapsed, 'PARTIAL_SNAPSHOT');
    return copy;
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
    OCCUPANCY_RULE, occupancyKpa, occupancyDetect, createOccupancyRun, occupancyTick, occupancyMark,
    occupancyStop, occupancyRecordPressure, occupancyNext, occupancySecondRows, occupancySnapshot
};
