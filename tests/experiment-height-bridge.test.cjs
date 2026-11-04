'use strict';
// Exercise the production bridge with synthetic notifications and queued writes only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../spp3_BLE/app.js'), 'utf8');
const heightSource = fs.readFileSync(path.join(__dirname, '../spp3_BLE/experiment-height-control.js'), 'utf8');
function productionSection(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `production seam exists: ${startMarker}`);
    return source.slice(start, end);
}

function fixture() {
    let ms = 100;
    let recording = false;
    let hubOptions;
    let hubInitialized = false;
    const queued = [];
    const written = [];
    const inputWrites = [];
    const monitorUpdates = [];
    const samples = [];
    const timers = new Map();
    let timerId = 0;
    const oldInputIds = ['supineHeadInput', 'sideHeadInput', 'supineNeckInput', 'sideNeckInput'];
    const chart = count => ({ data: { labels: [], datasets: Array.from({ length: count }, () => ({ data: [] })) } });
    const context = vm.createContext({
        TextEncoder, performance: { now: () => ms }, console: { log() {}, error() {} },
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
        clearTimeout: id => timers.delete(id),
        document: { querySelector: () => null, getElementById: id => oldInputIds.includes(id) ? id : null },
        serial_status: { insertAdjacentHTML() {}, innerHTML: '', scrollTop: 0, scrollHeight: 0 },
        serial_ready: true, bluetoothDevice: { gatt: { connected: true } },
        rxCharacteristic: { writeValue: async bytes => { written.push(Buffer.from(bytes).toString()); } },
        bleQueue: { add: task => queued.push(task) },
        serial_readSting: '', serial_timer: null, suppressSilentDebugResponse: false, silentDebugSuppressTimer: null,
        LOG_SUCCESS_GREEN: '#c8ffd7', debugDataBuffer: '', parsedData: {}, commandBuffer: [],
        experimentHeightControl: null, experimentHubModule: null,
        createExperimentHub: (_root, options) => {
            hubOptions = options;
            return { init: () => { hubInitialized = true; }, isRunning: () => recording, receivePressure: value => samples.push(value) };
        },
        CONTROL_MODE: { AUTO: 'AUTO', MANUAL: 'MANUAL' }, controlMode: 'AUTO', requestedControlMode: null,
        setModeUi: value => { context.controlMode = value; }, setModeAck() {}, formatAckTime: () => 'synthetic',
        anchorDone: { BSHS: false, BLHL: false },
        clearClassifyStartRetry() {}, clearPredStartRetry() {},
        classifyStarted: true, classifyStartRequested: true, predEnabled: true, predStartRequested: true,
        classifyStartAttempts: 1, predStartAttempts: 1,
        WORKFLOW: { UNCALIBRATED: 'UNCALIBRATED', CLASSIFYING: 'CLASSIFYING' }, setWorkflowState() {},
        numberInput1: 'one', numberInput2: 'two', numberInput3: 'three', numberInput4: 'four',
        HEIGHT_LIMITS: { HEAD: { min: 7, max: 16 }, NECK: { min: 10, max: 14 } }, HEIGHT_STEP: 0.5,
        setHeightInputValue: (...args) => inputWrites.push(args),
        updateHeightMonitorFromValues: (...args) => monitorUpdates.push(args),
        updateHeightMonitorFromParsed() {}, updateUserDimensionsFromParsed() {}, updatePressureMonitor() {},
        chart: chart(3), chart2: chart(2), chart3: chart(1), chart_data_count: 0,
        updateChartSummary() {}, updateChartIfVisible() {}, formatLocalTimeLabel: () => 'synthetic',
        pressureChartSection: null, diffChartSection: null, averageChartSection: null,
        SystemState: { 5: 'STANDBY' }, espManualStatus: null, sideStandbyWatchActive: false,
        pressure1: 0, pressure2: 0, pressure3: 0,
        DBModule: { save: async () => {} }
    });
    const sections = [
        ['function handleNotifications(', 'var chart_data_count ='],
        ['function sendModeCommands(', 'function safeSetText('],
        ['function requestSilentDebugSnapshot(', 'function setWorkflowState('],
        ['function resetAutoControlStartState(', 'function requestPredStart('],
        ['function parseProtocolMessage(', 'function serial_message('],
        ['function serial_message(', 'var func_count ='],
        ['experimentHeightControl = createExperimentHeightControl({', "const modal = document.getElementById('modal');"]
    ];
    vm.runInContext(heightSource + '\n' + sections.map(args => productionSection(...args)).join('\n'), context);
    function notify(text) {
        const bytes = new TextEncoder().encode(text);
        for (let offset = 0; offset < bytes.length; offset += 20) {
            const chunk = bytes.slice(offset, offset + 20);
            context.handleNotifications({ target: { value: new DataView(chunk.buffer) } });
        }
    }
    function debug(head = '7.0', neck = '10.0') {
        notify(`gender=0\nheadNumber=${head}\nneckNumber=${neck}\ncurrentHeadNumber=${head}\ncurrentNeckNumber=${neck}\nN2LP=100\nanchor_state=IDLE\npre_stage=IDLE\npre_stable_label=UNKNOWN\n`);
    }
    return {
        context, control: context.experimentHeightControl, written, inputWrites, monitorUpdates, samples,
        hubOptions, hubInitialized, notify, debug,
        advance: amount => { ms += amount; }, setRecording: value => { recording = value; },
        flush: async () => { while (queued.length) await queued.shift()(); }
    };
}

test('production initialization, BLE queue and complete replies prepare and settle an owned height change', async () => {
    const f = fixture();
    assert.equal(f.hubInitialized, true);
    assert.equal(f.hubOptions.heightControl, f.control, 'the Hub receives the real initialized adapter');
    assert.equal(f.written.length, 0);

    const preparing = f.control.prepare();
    assert.equal(f.control.getState().busy, true);
    await f.flush();
    assert.deepEqual(f.written, [
        'PRED,STOP\n', 'CLASSIFY,STOP\n', 'FEATURE,PRED,OFF\n', 'FEATURE,STATUS\n',
        'FEATURE,LEGACY,OFF\n', 'FEATURE,STATUS\n', 'DEBUG\n', 'I\n'
    ], 'all preparation commands survive the actual queue gate');
    assert.equal(f.context.predEnabled, false);
    assert.equal(f.context.classifyStarted, false);
    assert.equal(f.context.requestedControlMode, 'MANUAL');
    f.advance(1);
    f.notify('PRED,OK,STOP\nCLASSIFY,OK,STOP\nFEATURE,STATUS,LEGACY,0,POSE,1,PRED,0\nI:0 5 0 0 0 0 0\n');
    f.notify('gender=0\nheadNumber=7.0\nneckNumber=10.0\ncurrentHeadNumber=7.0\ncurrentNeckNumber=10.0\nN2LP=100\n');
    assert.equal(f.control.getState().ready, false, 'legacy N2LP marker is insufficient');
    f.notify('anchor_state=IDLE\npre_stage=IDLE\npre_stable_label=UNKNOWN');
    assert.equal(f.control.getState().busy, true, 'incomplete final BLE line cannot resolve preparation');
    f.notify('\n');
    assert.equal((await preparing).ready, true);
    assert.equal(f.control.getState().head, 7);
    assert.equal(f.control.getState().neck, 10);
    assert.equal(f.context.suppressSilentDebugResponse, false);

    const adjusting = f.control.adjust('HEAD', 7.5);
    f.context.sendCommand('SET,NORM,OLD,S,HEAD,8.0');
    f.context.sendSilentCommand('P');
    await f.flush();
    assert.deepEqual(f.written.slice(8), ['SET,NORM,EXPERIMENT,S,HEAD,7.5\n', 'P\n'],
        'owned SET and pressure polling pass; an ordinary conflicting SET is blocked');
    f.advance(1);
    f.notify('HEIGHT_SET,SET_NORM,HEAD,7.5,NECK,10.0\n');
    assert.equal(f.inputWrites.length, 0, 'ownership reaches the old parser without overwriting its calibration inputs');
    assert.equal(f.monitorUpdates.length, 1);
    assert.equal(f.monitorUpdates[0][1], '7.5');
    assert.equal(f.control.getState().ready, false, 'SET acknowledgement is not arrival');
    f.advance(6000);
    f.debug('7.5');
    assert.equal(f.control.getState().busy, true, 'post-SET DEBUG also requires a fresh idle I reply');
    f.notify('I:0 5 0 0 0 0 0\n');
    assert.equal((await adjusting).ready, true);
    assert.equal(f.control.getState().head, 7.5);
    f.notify('P:2000000 2100000 2200000\n');
    assert.equal(f.samples.length, 1);
    assert.equal(f.samples[0].monitor_adc, 2000000);
    assert.equal(f.samples[0].neck_adc, 2100000);
    assert.equal(f.samples[0].head_adc, 2200000);
    assert.ok(f.samples[0].receivedMonotonicMs >= f.control.getState().settledMonotonicMs);

    f.setRecording(true);
    assert.equal(f.control.getState().ready, true, 'starting the Hub recording does not invalidate settled height');
    await assert.rejects(f.control.adjust('NECK', 10.5), /記錄中/);
    f.setRecording(false);
    f.notify('HEIGHT_SET,SET_NORM,HEAD,8.0,NECK,10.5\n');
    assert.equal(f.inputWrites.length, 8, 'an unrelated reply retains the old calibration input behavior');
    assert.equal(f.control.getState().ready, false);
});
