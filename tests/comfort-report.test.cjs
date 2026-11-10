'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { comfortReport } = require('../spp3_BLE/comfort-experiment.js');

const anchor = {
    head: 8,
    neck: 10.5,
    pressure: { monitor_adc: 1600000, head_adc: 1800000, neck_adc: 2000000 }
};

test('height report labels pressure above and below calibration with direction', () => {
    const report = comfortReport({
        subject: 'S01', pose: '1', method: 'I', anchor,
        plan: { mode: 'HEIGHT', heights: { head: 8, neck: 10.5 }, targets: {} },
        empty: { head_adc: 1818000, neck_adc: 1980000 }, loaded: {}, score: 10
    });
    const [head, neck] = report.sections[0].rows;
    assert.equal(head[1], '高度 8.0 cm');
    assert.equal(head[4], '上升 1.00%');
    assert.equal(neck[4], '下降 1.00%');
    assert.equal(head[5], '—');
});

test('ADC report shows signed difference between actual and target', () => {
    const report = comfortReport({
        subject: 'S01', pose: '1', method: 'M', anchor,
        plan: { mode: 'ADC', heights: {}, targets: { head: { ratio: 0.1, adc: 1620000 }, neck: { ratio: 0.1, adc: 1800000 } } },
        empty: { head_adc: 1630000, neck_adc: 1790000 }, loaded: {}, score: 10
    });
    const [head, neck] = report.sections[0].rows;
    assert.equal(head[1], '下降 10.00%');
    assert.match(head[5], /^\+10,000 ADC/);
    assert.match(neck[5], /^−10,000 ADC/);
});
