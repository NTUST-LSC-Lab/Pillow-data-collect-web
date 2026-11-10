const test = require('node:test');
const assert = require('node:assert/strict');
const { comfortPlan, comfortReport } = require('../spp3_BLE/comfort-experiment.js');

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
            assert.equal(times, undefined);
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
    assert.equal(pressurePlan.mode, 'ADC');
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
    assert.match(report.sections[0].title, /空枕/);
    assert.match(report.sections[1].title, /躺回後/);
    assert.match(report.sections[1].rows.find(row => row[0] === 'Head')[3], /−10,000 ADC/);
});
