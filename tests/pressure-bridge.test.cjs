// Synthetic protocol data only. No BLE device, application server or real subject data.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '../spp3_BLE/app.js'), 'utf8');

// Execute the production functions, not a second implementation of their parser.
function productionFunction(name, followingMarker) {
    const start = appSource.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} must remain present in app.js`);
    const end = appSource.indexOf(followingMarker, start);
    assert.notEqual(end, -1, `end marker for ${name} must remain present`);
    return appSource.slice(start, end).trim();
}

const notificationSource = productionFunction('handleNotifications', 'var chart_data_count =');
const messageSource = productionFunction('serial_message', 'function logCommand(');
const disconnectedSource = productionFunction('onDisconnected', "serial_buttonClose.addEventListener(");

function fixture() {
    let nowMs = 0;
    let nextTimer = 0;
    let disconnects = 0;
    const epoch = Date.parse('2030-01-02T03:04:05.000Z');
    const timers = new Map();
    const samples = [];
    const monitorUpdates = [];
    const protocolMessages = [];
    const chart = {
        data: { labels: [], datasets: [0, 1, 2].map(() => ({ data: [] })) }
    };
    class SyntheticDate extends Date {
        constructor(...args) { super(...(args.length ? args : [epoch + nowMs])); }
        static now() { return epoch + nowMs; }
    }
    const context = vm.createContext({
        console: { log() {} },
        performance: { now: () => nowMs },
        Date: SyntheticDate,
        setTimeout(callback, delay) {
            const id = ++nextTimer;
            timers.set(id, { at: nowMs + delay, callback });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        serial_readSting: '',
        serial_timer: null,
        serial_ready: true,
        suppressSilentDebugResponse: false,
        silentDebugSuppressTimer: null,
        LOG_SUCCESS_GREEN: '#c8ffd7',
        debugDataBuffer: '',
        parsedData: {},
        chart_data_count: 0,
        pressure1: null,
        pressure2: null,
        pressure3: null,
        document: { querySelector: () => ({ value: 'auto' }) },
        serial_status: { insertAdjacentHTML() {}, scrollTop: 0, scrollHeight: 0 },
        chart,
        pressureChartSection: {},
        formatLocalTimeLabel: date => date.toISOString(),
        updatePressureMonitor: values => monitorUpdates.push(Array.from(values)),
        updateChartSummary() {},
        updateChartIfVisible() {},
        updateHeightMonitorFromParsed() {},
        updateUserDimensionsFromParsed() {},
        setSyncTimeAck() {},
        formatAckTime: () => 'synthetic time',
        parseProtocolMessage: line => protocolMessages.push(line),
        experimentHubModule: {
            receivePressure: sample => samples.push({ ...sample }),
            onDisconnected: () => { disconnects += 1; }
        }
    });
    vm.runInContext(`${notificationSource}\n${messageSource}\n${disconnectedSource}`, context);

    function advance(ms) {
        const target = nowMs + ms;
        while (true) {
            const due = [...timers.entries()].filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            timers.delete(due[0]);
            nowMs = due[1].at;
            due[1].callback();
        }
        nowMs = target;
    }
    function notify(text) {
        const bytes = Uint8Array.from(Buffer.from(text, 'utf8'));
        context.handleNotifications({ target: { value: new DataView(bytes.buffer) } });
    }
    return {
        context, samples, monitorUpdates, protocolMessages, chart, advance, notify,
        disconnects: () => disconnects
    };
}

test('fragmented BLE notifications yield one complete ADC sample with receipt time', () => {
    const f = fixture();
    f.notify('P: 101');
    assert.equal(f.samples.length, 0);
    f.advance(40);
    f.notify(' 202');
    f.advance(40);
    f.notify(' 303\r\n');
    assert.deepEqual(f.samples, [{
        monitor_adc: 101,
        neck_adc: 202,
        head_adc: 303,
        receivedMonotonicMs: 80,
        timestamp_iso: '2030-01-02T03:04:05.080Z'
    }]);
    f.advance(200);
    assert.equal(f.samples.length, 1, 'cancelled fallback must not duplicate the sample');
    assert.deepEqual(f.monitorUpdates, [[101, 202, 303]]);
    assert.deepEqual(f.chart.data.datasets.map(dataset => dataset.data), [[101], [202], [303]]);
});

test('attached prefix, whitespace, commas and multiple complete lines retain all samples in channel order', () => {
    const f = fixture();
    f.notify('P:11 22 33\n\n   P:  44\t55 66  \r\nP:77,88,99\n');
    assert.deepEqual(f.samples.map(({ monitor_adc, neck_adc, head_adc }) => [monitor_adc, neck_adc, head_adc]), [
        [11, 22, 33], [44, 55, 66], [77, 88, 99]
    ]);
    assert.equal(f.protocolMessages.length, 1, 'existing comma protocol path is still called');
    assert.deepEqual(f.chart.data.datasets.map(dataset => dataset.data), [[11, 44, 77], [22, 55, 88], [33, 66, 99]]);
});

test('a full-looking P message without newline is logged but never collected as a complete sample', () => {
    const f = fixture();
    f.notify('P: 100 200 300');
    f.advance(100);
    assert.equal(f.samples.length, 0);
    assert.deepEqual(f.monitorUpdates, [[100, 200, 300]], 'legacy partial fallback behavior is preserved');
    f.notify('\n');
    assert.equal(f.samples.length, 0, 'a later standalone newline cannot revive a flushed partial');
    f.notify('P: 101 201 301\n');
    assert.equal(f.samples.length, 1);
});

test('fragment delays beyond the existing 100 ms fallback do not create malformed or stale samples', () => {
    const f = fixture();
    f.notify('P: 100 200');
    f.advance(120);
    f.notify(' 300\n');
    assert.equal(f.samples.length, 0);
    f.notify('P: 400 500 600\n');
    assert.deepEqual(f.samples.map(sample => [sample.monitor_adc, sample.neck_adc, sample.head_adc]), [[400, 500, 600]]);
});

test('invalid or incomplete triples cannot enter the experiment collector', () => {
    const f = fixture();
    for (const message of [
        'P: 123bad 2 3', 'P:123bad 2 3', 'P: NaN 2 3', 'P: Infinity 2 3',
        'P: 1e999 2 3', 'P: 1 2 3 4', 'P: 1 2', 'P:', 'P: 0x10 2 3'
    ]) f.notify(`${message}\n`);
    assert.equal(f.samples.length, 0);
    f.notify('P: 123 456 789\n');
    assert.equal(f.samples.length, 1, 'invalid data must not poison following messages');
});

test('command echo and legacy serial_message callers without complete BLE receipt never collect', () => {
    const f = fixture();
    f.context.serial_message('P: 1 2 3', 'orange');
    f.context.serial_message('P: 4 5 6', '#c8ffd7');
    f.context.serial_message('P:7 8 9', 'green', false);
    assert.equal(f.samples.length, 0);
    f.notify('P: 10 20 30\n');
    assert.equal(f.samples.length, 1);
});

test('disconnected state blocks samples and onDisconnected forwards interruption without control commands', () => {
    const f = fixture();
    f.context.onDisconnected({ target: { name: 'SYNTHETIC TEST DEVICE' } });
    assert.equal(f.context.serial_ready, false);
    assert.equal(f.disconnects(), 1);
    f.notify('P: 1 2 3\n');
    assert.equal(f.samples.length, 0);
    f.context.serial_ready = true;
    f.notify('P: 4 5 6\n');
    assert.equal(f.samples.length, 1);
    assert.doesNotMatch(disconnectedSource, /sendCommand|sendSilentCommand|writeValue|PRED,|CLASSIFY,|ANCHOR,/);
});

test('the experiment bridge adds no BLE polling, notification listener or hardware commands', () => {
    const pollingStart = appSource.indexOf('setInterval(function ()');
    const pollingEnd = appSource.indexOf('}, 1000);', pollingStart);
    assert.ok(pollingStart >= 0 && pollingEnd > pollingStart);
    const pollingSource = appSource.slice(pollingStart, pollingEnd);
    assert.equal((pollingSource.match(/sendSilentCommand\("P"\)/g) || []).length, 1);
    assert.doesNotMatch(pollingSource, /experimentHubModule/);
    assert.equal((appSource.match(/addEventListener\('characteristicvaluechanged', handleNotifications\)/g) || []).length, 1);
    const bridgeStart = messageSource.indexOf('// Only newline-terminated BLE replies');
    const bridgeEnd = messageSource.indexOf('if (values.length >= 3)', bridgeStart);
    assert.ok(bridgeStart >= 0 && bridgeEnd > bridgeStart);
    assert.doesNotMatch(messageSource.slice(bridgeStart, bridgeEnd), /sendCommand|sendSilentCommand|writeValue|setInterval/);
});
