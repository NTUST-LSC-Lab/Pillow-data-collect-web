const test = require('node:test');
const assert = require('node:assert/strict');
const { comfortPlan, comfortReport, comfortFillTime, comfortCommand, comfortDeviceTimes } = require('../spp3_BLE/comfort-experiment.js');

const anchor = {
    head: 9,
    neck: 12,
    pressure: { head_adc: 2045000, neck_adc: 2200000, monitor_adc: 1950000 }
};

test('Experiment 02 uses the configured R and M ratios and averages them per pose and channel', () => {
    const expected = {
        '1': { R: [0.33, 10.52], M: [3.1331, 9.3909], A: [1.7315, 9.9554] },
        '5': { R: [0.34, 5.89], M: [4.9074, 8.7339], A: [2.6237, 7.3119] }
    };

    for (const [pose, methods] of Object.entries(expected)) {
        for (const [method, percentages] of Object.entries(methods)) {
            const { targets, times } = comfortPlan(pose, method, anchor);
            for (const [index, channel] of ['head', 'neck'].entries()) {
                assert.equal(Number((targets[channel].ratio * 100).toFixed(4)), percentages[index]);
                assert.equal(targets[channel].adc, Math.round(anchor.pressure[channel + '_adc'] * (1 - targets[channel].ratio)));
            }
            assert.ok(Number.isFinite(times.head.calculatedMs));
            assert.ok(Number.isFinite(times.neck.calculatedMs));
        }
    }
});

test('height control preserves calibration heights and ADC plans expose integer pressure targets', () => {
    const heightPlan = comfortPlan('5', 'I', anchor);
    assert.equal(heightPlan.mode, 'HEIGHT');
    assert.deepEqual(heightPlan.heights, { head: 9, neck: 12 });
    assert.deepEqual(heightPlan.targets, {});
    assert.deepEqual(heightPlan.issues, []);

    const lowPressure = { ...anchor, pressure: { ...anchor.pressure, head_adc: 1800000 } };
    const pressurePlan = comfortPlan('1', 'M', lowPressure);
    assert.equal(pressurePlan.mode, 'ADC_TIME');
    assert.equal(pressurePlan.targets.head.adc, Math.round(1800000 * (1 - 0.031331)));
    assert.deepEqual(pressurePlan.issues, []);
});

test('the saved report keeps a zero score and separates empty and occupied pressure checks', () => {
    const report = comfortReport({
        subject: 'S01',
        pose: '1',
        method: 'R',
        anchor,
        plan: comfortPlan('1', 'R', anchor),
        empty: { head_adc: 1980000, neck_adc: 1930000, monitor_adc: 1770000 },
        loaded: { head_adc: 2035000, neck_adc: 2121000, monitor_adc: 1950000 },
        score: 0
    });
    assert.ok(report.details.includes('滿意度：0／10'));
    assert.match(report.sections[0].title, /固定充氣時間/);
    assert.match(report.sections[1].title, /空枕/);
    assert.match(report.sections[2].title, /躺回後/);
    assert.match(report.sections[2].rows.find(row => row[0] === 'Head')[3], /−10,000 ADC/);
});

test('absolute regression retains zero and short positive times, only signed negatives use baseline', () => {
    for (const [channel, intercept, baseline] of [['head', 1820918, 30000], ['neck', 1878787, 10000]]) {
        assert.deepEqual(comfortFillTime(channel, intercept), { calculatedMs: 0, commandMs: 0, baselineFallback: false });
        const short = comfortFillTime(channel, intercept + 1);
        assert.ok(short.calculatedMs > 0 && short.calculatedMs < 1);
        assert.equal(short.commandMs, 0);
        assert.equal(short.baselineFallback, false);
        const negative = comfortFillTime(channel, intercept - 1);
        assert.ok(negative.calculatedMs < 0);
        assert.equal(negative.commandMs, baseline);
        assert.equal(negative.baselineFallback, true);
    }
    assert.equal(comfortFillTime('head', 1881864).commandMs, 21477);
    assert.equal(comfortFillTime('neck', 1936448).commandMs, 9906);
});

test('negative Neck falls back alone; positive Head and original targets are preserved', () => {
    const plan = comfortPlan('1', 'R', { ...anchor, pressure: { ...anchor.pressure, neck_adc: 2080000 } });
    assert.equal(plan.times.neck.baselineFallback, true);
    assert.equal(plan.times.neck.commandMs, 10000);
    assert.equal(plan.times.head.baselineFallback, false);
    assert.notEqual(plan.times.head.commandMs, 30000);
    assert.equal(plan.targets.neck.adc, Math.round(2080000 * (1 - 0.1052)));
    assert.match(comfortCommand('RUN1', plan), /^EXP02,START,RUN1,ADC_TIME,\d+,\d+$/);
    assert.equal(comfortCommand('RUN2', comfortPlan('1', 'I', anchor)), 'EXP02,START,RUN2,HEIGHT,9.0,12.0');
});

test('long fill is rejected before a command; targets and theoretical time are not silently capped', () => {
    const plan = comfortPlan('1', 'M', { ...anchor, pressure: { ...anchor.pressure, neck_adc: 2410000 } });
    assert.ok(plan.times.neck.commandMs > 50000);
    assert.ok(plan.issues.some(s => /Neck.*安全上限/.test(s)));
    const headPlan = comfortPlan('5', 'R', { ...anchor, pressure: { ...anchor.pressure, head_adc: 2400000 } });
    assert.ok(headPlan.issues.some(s => /Head.*安全上限/.test(s)));
});

test('firmware TIME is authoritative only when formula, applied milliseconds and channel fallback agree', () => {
    const plan = comfortPlan('1', 'R', { ...anchor, pressure: { ...anchor.pressure, neck_adc: 2080000 } });
    const line = ['EXP02', 'TIME', 'RUN1', plan.times.head.calculatedMs.toFixed(3),
        plan.times.neck.calculatedMs.toFixed(3), String(plan.times.head.commandMs), '10000', '0', '1'];
    const times = comfortDeviceTimes(line, plan);
    assert.equal(times.neck.baselineFallback, true);
    assert.equal(times.head.commandMs, plan.times.head.commandMs);
    for (const [index, value] of [[3, 'NaN'], [4, ''], [5, '30000'], [6, '-1'], [7, '1'], [8, '0']]) {
        const bad = [...line]; bad[index] = value;
        assert.throws(() => comfortDeviceTimes(bad, plan));
    }
    assert.throws(() => comfortDeviceTimes(line.slice(0, 8), plan));
});

test('screen and SVG report distinguish theoretical negative time, baseline fallback and measured pressure', () => {
    const plan = comfortPlan('1', 'R', { ...anchor, pressure: { ...anchor.pressure, neck_adc: 2080000 } });
    const report = comfortReport({ subject: 'S00', pose: '1', method: 'R', anchor, plan,
        deviceTimes: plan.times, deviceEmpty: { head_adc: 1900000, neck_adc: 1950000 },
        empty: { head_adc: 1901000, neck_adc: 1951000 }, loaded: { ...anchor.pressure }, score: 10 });
    const neck = report.sections[0].rows[1];
    assert.match(neck[1], /^-/);
    assert.equal(neck[2], '10.000 s');
    assert.equal(neck[3], '10.000 s');
    assert.match(neck[4], /開機基準備援/);
    assert.ok(report.details.some(s => s.includes('1,950,000 ADC')));
    assert.ok(report.details.includes('滿意度：10／10'));
    assert.match(report.sections[1].rows[1][3], /1,951,000 ADC/);
});
