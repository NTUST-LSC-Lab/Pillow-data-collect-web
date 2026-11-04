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
    const profileInputs = { age: { value: '25' }, height: { value: '170' }, weight: { value: '65' } };
    let gender = { value: 'female' };
    const chart = count => ({ data: { labels: [], datasets: Array.from({ length: count }, () => ({ data: [] })) } });
    const context = vm.createContext({
        TextEncoder, performance: { now: () => ms }, console: { log() {}, error() {} },
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
        clearTimeout: id => timers.delete(id),
        document: {
            querySelector: selector => selector === 'input[name="gender"]:checked' ? gender : null,
            getElementById: id => profileInputs[id] || (oldInputIds.includes(id) ? id : null)
        },
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
        ['function getExperimentUserProfile(', 'function setSyncTimeAck('],
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
    function debug(head = '7.0', neck = '10.0', preStage = 'IDLE') {
        notify(`gender=0\nheadNumber=${head}\nneckNumber=${neck}\ncurrentHeadNumber=${head}\ncurrentNeckNumber=${neck}\nN2LP=100\nanchor_state=IDLE\npre_stage=${preStage}\npre_stable_label=UNKNOWN\n`);
    }
    return {
        context, control: context.experimentHeightControl, written, inputWrites, monitorUpdates, samples,
        hubOptions, hubInitialized, notify, debug, profileInputs,
        setGender: value => { gender = value === null ? null : { value }; },
        advance: amount => { ms += amount; }, setRecording: value => { recording = value; },
        flush: async () => { while (queued.length) await queued.shift()(); }
    };
}

function suggestionDebug(f, values = {}) {
    const fields = { gender: '0', age: '25', height: '170', weight: '65',
        HLF_raw: '11.3', HLF: '11.5', N1LF_raw: '12.1', N1LF: '12.0',
        headNumber: '7.0', neckNumber: '10.0', currentHeadNumber: '7.0', currentNeckNumber: '10.0',
        N2LP: '100', anchor_state: 'IDLE', pre_stage: 'IDLE', ...values, pre_stable_label: 'UNKNOWN' };
    f.notify(Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${value}\n`).join(''));
}

test('pose5 getter uses the matched complete final recommendation without BLE writes or profile mutation', async () => {
    const f = fixture();
    const getSuggestion = f.hubOptions.getPose5Suggestion;
    assert.equal(typeof getSuggestion, 'function');
    assert.equal(getSuggestion, f.context.getExperimentPose5Suggestion);
    assert.equal(getSuggestion().head, null, 'no fabricated default before a complete device reply');
    assert.equal(getSuggestion().deviceProfileMismatch, false, 'missing data is not evidence that the device user changed');
    suggestionDebug(f);
    const suggestion = getSuggestion();
    assert.equal(suggestion.head, 11.5, 'use final HLF, not raw recommendation or current height');
    assert.equal(suggestion.neck, 12);
    assert.equal(suggestion.deviceProfileMismatch, false);
    assert.equal(f.control.getState().ready, false, 'recommendation is not proof that the height is applied');
    f.profileInputs.height.value = '170.75'; f.profileInputs.weight.value = '65.25';
    const decimal = getSuggestion();
    assert.equal(decimal.head, 11.5, 'ordinary decimal inputs match the integer values actually used by firmware');
    assert.notEqual(decimal.profileKey, suggestion.profileKey);
    assert.deepEqual({ ...f.hubOptions.getUserProfile() }, { age_years: 25, body_height_cm: 170.75, body_weight_kg: 65.25 });
    assert.match(decimal.reason, /整數/);
    await f.flush();
    assert.deepEqual(f.written, [], 'getter must not send USER, INIT, DEBUG or any height command');
    assert.deepEqual(f.inputWrites, [], 'old calibration inputs remain untouched');
});

test('pose5 suggestion rejects missing, stale, future and disconnected readbacks including firmware defaults', () => {
    for (const variant of ['missing', 'blank', 'default', 'stale', 'future', 'disconnected', 'not-ready']) {
        const f = fixture();
        suggestionDebug(f, variant === 'missing' ? { weight: undefined } : variant === 'blank' ? { age: '' } :
            variant === 'default' ? { age: '0', height: '0', weight: '0', HLF: '13.0', N1LF: '14.0' } : {});
        if (variant === 'stale') f.advance(3501);
        if (variant === 'future') f.advance(-1);
        if (variant === 'disconnected') f.context.bluetoothDevice.gatt.connected = false;
        if (variant === 'not-ready') f.context.serial_ready = false;
        const result = f.hubOptions.getPose5Suggestion();
        assert.equal(result.head, null, variant); assert.equal(result.neck, null, variant);
        assert.equal(result.deviceProfileMismatch, variant === 'default', variant);
        assert.match(result.reason, /設定|準備|連線/, variant);
    }
    const f = fixture(); suggestionDebug(f);
    f.control.onDisconnected();
    assert.equal(f.hubOptions.getPose5Suggestion().head, null, 'reconnection cannot reuse a previous connection snapshot');
    assert.equal(f.hubOptions.getPose5Suggestion().deviceProfileMismatch, false);
});

test('pose5 suggestion matches gender and all applied integers, with a key for every valid or invalid draft', () => {
    for (const [field, value] of [['age', '26'], ['height', '171'], ['weight', '66']]) {
        const f = fixture(); suggestionDebug(f);
        const before = f.hubOptions.getPose5Suggestion();
        f.profileInputs[field].value = value;
        const after = f.hubOptions.getPose5Suggestion();
        assert.notEqual(after.profileKey, before.profileKey, field);
        assert.equal(after.head, null, field);
        assert.equal(after.deviceProfileMismatch, true, field);
    }
    const f = fixture(); suggestionDebug(f);
    const initialKey = f.hubOptions.getPose5Suggestion().profileKey;
    f.setGender('male');
    assert.notEqual(f.hubOptions.getPose5Suggestion().profileKey, initialKey);
    assert.equal(f.hubOptions.getPose5Suggestion().head, null);
    assert.equal(f.hubOptions.getPose5Suggestion().deviceProfileMismatch, true);
    suggestionDebug(f, { gender: '1' });
    assert.equal(f.hubOptions.getPose5Suggestion().head, 11.5);
    f.setGender(null);
    assert.equal(f.hubOptions.getPose5Suggestion().head, null);
    assert.equal(f.hubOptions.getPose5Suggestion().deviceProfileMismatch, false);
    f.profileInputs.weight.value = '';
    const blankKey = f.hubOptions.getPose5Suggestion().profileKey;
    f.profileInputs.weight.value = 'invalid';
    assert.notEqual(f.hubOptions.getPose5Suggestion().profileKey, blankKey);
});

test('same-form pose5 mismatch flag requires a fresh identifiable device profile, not a partial or expired one', () => {
    const f = fixture(); suggestionDebug(f);
    const initialKey = f.hubOptions.getPose5Suggestion().profileKey;
    for (const values of [{ gender: '1' }, { age: '26' }, { height: '171' }, { weight: '66' },
        { height: '0' }, { weight: '0' }]) {
        suggestionDebug(f, values);
        const result = f.hubOptions.getPose5Suggestion();
        assert.equal(result.profileKey, initialKey);
        assert.equal(result.deviceProfileMismatch, true, JSON.stringify(values));
        assert.equal(result.head, null);
    }
    for (const values of [{ gender: '1', age: undefined }, { gender: '1', weight: '' }, { gender: '2' }]) {
        suggestionDebug(f, values);
        assert.equal(f.hubOptions.getPose5Suggestion().deviceProfileMismatch, false, JSON.stringify(values));
    }
    suggestionDebug(f, { gender: '1' }); f.advance(3501);
    assert.equal(f.hubOptions.getPose5Suggestion().deviceProfileMismatch, false, 'expired mismatch cannot clear an operator draft');
});

test('pose5 suggestion rejects nondecimal syntax, invalid integer range and non-half-centimeter heights', () => {
    for (const [field, value] of [['height', '1.70e2'], ['weight', '6.5E1'], ['age', '2.5e1'],
        ['height', '0xAA'], ['weight', 'Infinity'], ['age', '25.5'], ['age', '-1'],
        ['height', '0.5'], ['weight', '0'], ['height', '2147483648'], ['weight', '2147483648'], ['age', '2147483648']]) {
        const f = fixture(); suggestionDebug(f); f.profileInputs[field].value = value;
        assert.equal(f.hubOptions.getPose5Suggestion().head, null, `${field}=${value}`);
    }
    for (const values of [{ HLF: '6.5' }, { HLF: '16.5' }, { N1LF: '9.5' }, { N1LF: '14.5' },
        { HLF: '11.2' }, { N1LF: '12.1' }, { HLF: '' }, { N1LF: undefined }, { gender: '2' }]) {
        const f = fixture(); suggestionDebug(f, values);
        assert.equal(f.hubOptions.getPose5Suggestion().head, null, JSON.stringify(values));
    }
});

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

test('disabled stop replies and cached PRED stage still require complete safe readback before preparation and single-channel SET', async () => {
    const f = fixture();
    const preparing = f.control.prepare();
    await f.flush();
    assert.deepEqual(f.written.slice(0, 3), ['PRED,STOP\n', 'CLASSIFY,STOP\n', 'FEATURE,PRED,OFF\n']);
    f.advance(1);
    f.notify('PRED,ERR,DISABLED\nCLASSIFY,ERR,DISABLED\n');
    assert.equal(f.control.getState().ready, false, 'disabled replies alone do not prove safe readiness');
    f.notify('FEATURE,STATUS,LEGACY,0,POSE,0,PRED,0\n');
    f.debug('7.0', '10.0', 'WAIT_STABLE');
    assert.equal(f.control.getState().ready, false, 'complete DEBUG also needs fresh idle I');
    f.notify('I:0 5 0 0 0 0 0\n');
    assert.equal((await preparing).ready, true);
    assert.equal(f.control.getState().debugReceipt.preStage, 'WAIT_STABLE', 'cached stage is retained as diagnostic data');

    for (const [channel, value, head, neck] of [['HEAD', 7.5, '7.5', '10.0'], ['NECK', 10.5, '7.5', '10.5']]) {
        const adjusting = f.control.adjust(channel, value);
        await f.flush();
        assert.equal(f.written.at(-1), `SET,NORM,EXPERIMENT,S,${channel},${value.toFixed(1)}\n`);
        f.advance(1);
        f.notify(`HEIGHT_SET,SET_NORM,HEAD,${head},NECK,${neck}\n`);
        assert.equal(f.control.getState().ready, false, 'ACK is not an arrival report');
        f.debug(head, neck, 'WAIT_STABLE');
        assert.equal(f.control.getState().busy, true);
        f.notify('I:0 5 0 0 0 0 0\n');
        assert.equal((await adjusting).ready, true);
        assert.equal(f.control.getState().head, Number(head));
        assert.equal(f.control.getState().neck, Number(neck));
    }
    assert.equal(f.written.filter(command => command.startsWith('SET,')).length, 2);
    assert.equal(f.inputWrites.length, 0, 'both experiment-owned acknowledgements protect old calibration inputs');
    f.advance(1000);
    f.debug('7.5', '10.5', 'WAIT_STABLE');
    f.notify('I:0 5 0 0 0 0 0\n');
    assert.equal(f.control.getState().ready, true, 'continued cached stage replies do not invalidate safe settled heights');
});
