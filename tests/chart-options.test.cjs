// Synthetic data only. Uses the unchanged, real vendored Chart.js 4.4.1
// constructor, option proxies, resolvers and update pipeline. Canvas drawing
// calls are stubs: this is not a Chrome/Chart.js 4.6.1 or pixel-render test.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Chart = require('../chart.umd.min.js');

function canvasFixture() {
    const noop = () => {};
    const canvas = { width: 640, height: 240, isConnected: true, offsetParent: {} };
    const context = new Proxy({
        canvas,
        measureText: value => ({ width: String(value ?? '').length * 6 }),
        getLineDash: () => [],
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop })
    }, {
        get: (target, key) => key === 'length' ? undefined : key in target ? target[key] : noop,
        set: (target, key, value) => { target[key] = value; return true; }
    });
    canvas.getContext = () => context;
    return canvas;
}

function productionChartFixture() {
    const source = fs.readFileSync(path.join(__dirname, '../spp3_BLE/pressure-experiment.js'), 'utf8');
    const start = source.indexOf('    function ensureChart(state) {');
    const end = source.indexOf('    function eligibilityHint(', start);
    assert.ok(start >= 0 && end > start, 'execute the production chart function');
    const ensureChart = source.slice(start, end);
    const canvas = canvasFixture();
    const conditions = ['01', '02', '03', '04'].map(id => ({
        id, poseText: `synthetic pose ${id}`, scenario: 'synthetic condition'
    }));
    const create = new Function('Chart', 'canvas', 'conditions', `
        let chart = null;
        let plottedRunId = null;
        let plottedCount = -1;
        let plottedConditionId = null;
        let selectedConditionId = '01';
        const field = () => canvas;
        ${ensureChart}
        return {
            draw: ensureChart,
            select: id => { selectedConditionId = id; },
            instance: () => chart
        };
    `);
    return { canvas, ...create(Chart, canvas, conditions) };
}

test('real Chart.js reproduces the previous self-assignment stack overflow', () => {
    const canvas = canvasFixture();
    const chart = new Chart(canvas, {
        type: 'line', data: { datasets: [] },
        options: {
            responsive: false, animation: false,
            plugins: { title: { display: true, text: '' } },
            scales: { x: { type: 'linear', min: 0, max: 30 }, y: {} }
        }
    });
    try {
        assert.equal(Chart.version, '4.4.1', 'state precisely which real library this fixture exercises');
        assert.throws(() => {
            // Negative control: the production bug reported by the user.
            chart.options.plugins = chart.options.plugins || {};
            chart.options.plugins.title = { display: true, text: 'synthetic next condition' };
            chart.update('none');
        }, error => error instanceof RangeError && /Maximum call stack size exceeded/.test(error.message));
    } finally {
        // Restore a plain raw configuration, rather than reassign a resolved proxy.
        chart.config.options.plugins = { title: { display: true, text: '' } };
        chart.update('none');
        chart.destroy();
    }
});

test('production chart initialization and four-condition updates use real option resolvers without recursion', () => {
    const fixture = productionChartFixture();
    try {
        for (const id of ['01', '02', '03', '04']) {
            fixture.select(id);
            assert.doesNotThrow(() => fixture.draw({ runId: null, metadata: null, samples: [] }));
            const chart = fixture.instance();
            assert.ok(chart instanceof Chart);
            assert.match(chart.options.plugins.title.text, new RegExp(`條件 ${id}`));
            assert.equal(chart.data.datasets[0].data.length, 0);
            const state = {
                runId: `synthetic-run-${id}`,
                metadata: { condition_id: id, subject_id: 'SYNTHETIC', trial_index: 1,
                    actual_pose: `synthetic_pose_${id}`, test_condition: 'synthetic' },
                samples: [{ elapsed_s: 0.4, monitor_adc: 101, neck_adc: 202, head_adc: 303 }]
            };
            assert.doesNotThrow(() => fixture.draw(state));
            assert.match(chart.options.plugins.title.text, /SYNTHETIC/);
            assert.deepEqual(chart.data.datasets.map(dataset => dataset.data[0].y), [101, 202, 303]);
            assert.equal(chart.options.scales.x.min, 0);
            assert.equal(chart.options.scales.x.max, 30);
            assert.match(chart.options.scales.y.title.text, /ADC/);
            assert.doesNotThrow(() => chart.update('none'), 'repeated native Chart updates remain valid');
        }
    } finally {
        fixture.instance()?.destroy();
    }
});

test('a hidden production chart can reappear and update through the real Chart.js pipeline', () => {
    const fixture = productionChartFixture();
    try {
        fixture.canvas.offsetParent = null;
        assert.equal(fixture.draw({ runId: null, metadata: null, samples: [] }), false);
        assert.equal(fixture.instance(), null);
        fixture.canvas.offsetParent = {};
        assert.equal(fixture.draw({ runId: null, metadata: null, samples: [] }), true);
        fixture.canvas.offsetParent = null;
        fixture.select('04');
        assert.equal(fixture.draw({ runId: null, metadata: null, samples: [] }), false);
        fixture.canvas.offsetParent = {};
        assert.doesNotThrow(() => fixture.draw({ runId: null, metadata: null, samples: [] }));
        assert.match(fixture.instance().options.plugins.title.text, /條件 04/);
    } finally {
        fixture.instance()?.destroy();
    }
});
