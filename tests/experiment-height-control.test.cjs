'use strict';
// Synthetic protocol replies only; no BLE or hardware is operated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createExperimentHeightControl } = require('../spp3_BLE/experiment-height-control.js');

function fixture() {
    let ms = 100;
    let connected = true;
    let recording = false;
    const sent = [];
    const control = createExperimentHeightControl({
        now: () => ms,
        isConnected: () => connected,
        isRecording: () => recording,
        sendCommand: value => sent.push(value),
        sendQuery: value => sent.push(value),
        stopAutomatic: () => sent.push('STOP_AUTOMATIC')
    });
    const receive = line => control.receiveLine(line, { receivedMonotonicMs: ms });
    function debug(values = {}) {
        const fields = {
            gender: '0', headNumber: '7.0', neckNumber: '10.0', currentHeadNumber: '7.0', currentNeckNumber: '10.0',
            anchor_state: 'IDLE', pre_stage: 'IDLE', ...values, pre_stable_label: 'UNKNOWN'
        };
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined) receive(`${key}=${value}`);
        }
    }
    function idle() { receive('I:0 5 0 0 0 0 0'); }
    function features() { receive('FEATURE,STATUS,LEGACY,0,POSE,1,PRED,0'); }
    async function prepare() {
        const promise = control.prepare();
        ms += 1;
        features(); debug(); idle();
        await promise;
    }
    return { control, sent, receive, debug, idle, features, prepare,
        advance: amount => { ms += amount; },
        setConnected: value => { connected = value; },
        setRecording: value => { recording = value; }
    };
}

test('prepare requires fresh complete DEBUG, I and automatic-off confirmation; no profile commands', async () => {
    const f = fixture();
    f.debug(); f.idle(); f.features();
    assert.equal(f.control.getState().ready, false);
    const promise = f.control.prepare();
    assert.deepEqual(f.sent, ['STOP_AUTOMATIC', 'DEBUG', 'I']);
    f.features();
    f.receive('gender=0'); f.receive('headNumber=7.0'); f.receive('neckNumber=10.0');
    f.receive('currentHeadNumber=7.0'); f.receive('currentNeckNumber=10.0');
    f.receive('N2LP=100'); f.idle();
    assert.equal(f.control.getState().ready, false, 'legacy N2LP end marker cannot complete DEBUG');
    f.receive('anchor_state=IDLE'); f.receive('pre_stage=IDLE'); f.receive('pre_stable_label=UNKNOWN');
    assert.equal((await promise).ready, true);
    assert.equal(f.control.getState().settledMonotonicMs, 100);
});

test('missing/null heights cannot become zero or inherit an earlier complete snapshot', async () => {
    const f = fixture();
    const promise = f.control.prepare();
    const rejected = assert.rejects(promise, /逾時/);
    f.features(); f.debug({ currentHeadNumber: '' }); f.idle();
    assert.equal(f.control.getState().ready, false);
    f.advance(15001); f.control.tick();
    await rejected;
});

test('dual-model DEBUG completes only at its explicit terminator with idle and feature-off readback', async () => {
    const f = fixture(); const promise = f.control.prepare();
    for (const line of ['gender=0','headNumber=8.0','neckNumber=11.0','currentHeadNumber=8.0',
        'currentNeckNumber=11.0','anchor_state=DONE','anchor_target=BLHL']) f.receive(line);
    f.features(); f.idle(); assert.equal(f.control.getState().ready, false);
    f.receive('classifier=OTHER'); assert.equal(f.control.getState().ready, false);
    f.receive('classifier=DUAL_CATBOOST_V1'); assert.equal((await promise).ready, true);
    assert.equal(f.control.getState().debugReceipt.preStage, 'REMOVED');
});

test('complete DEBUG retains pose5 recommendation and applied profile without mixing earlier fields', () => {
    const f = fixture();
    f.debug({ age: '25', height: '170', weight: '65', HLF: '11.5', N1LF: '12.0' });
    const first = f.control.getState().debugReceipt;
    assert.deepEqual([first.userGender, first.userAge, first.userHeight, first.userWeight,
        first.pose5HeadCm, first.pose5NeckCm], [0, 25, 170, 65, 11.5, 12]);
    f.advance(1);
    f.receive('gender=1'); f.receive('age=26'); f.receive('height=180');
    assert.equal(f.control.getState().debugReceipt.userAge, 25, 'partial reply cannot publish a mixed snapshot');
    f.receive('pre_stable_label=UNKNOWN');
    const incomplete = f.control.getState().debugReceipt;
    assert.equal(incomplete.userAge, 26);
    for (const key of ['userWeight', 'pose5HeadCm', 'pose5NeckCm']) assert.ok(Number.isNaN(incomplete[key]), key);
    f.debug({ age: '', height: '1e2', weight: 'Infinity', HLF: '', N1LF: '13extra' });
    const invalid = f.control.getState().debugReceipt;
    for (const key of ['userAge', 'userHeight', 'userWeight', 'pose5HeadCm', 'pose5NeckCm']) assert.ok(Number.isNaN(invalid[key]), key);
    assert.deepEqual(f.sent, [], 'observing DEBUG is read-only');
    f.control.onDisconnected();
    assert.equal(f.control.getState().debugReceipt, null);
});

test('disabled PRED stop reply does not abort preparation before verified off and idle reports', async () => {
    const f = fixture();
    const outcome = f.control.prepare().then(value => ({ value }), error => ({ error: error.message }));
    f.receive('PRED,ERR,DISABLED');
    assert.equal(f.control.getState().ready, false, 'DISABLED alone cannot establish height readiness');
    f.features(); f.debug(); f.idle();
    const result = await outcome;
    assert.equal(result.error, undefined);
    assert.equal(result.value.ready, true);
});

test('verified feature-off and idle readback allow a cached PRED stage without resetting settled time', async () => {
    const f = fixture();
    const pending = f.control.prepare();
    f.features(); f.debug({ pre_stage: 'WAIT_STABLE' }); f.idle();
    assert.equal(f.control.getState().ready, true);
    await pending;
    const settled = f.control.getState().settledMonotonicMs;
    f.advance(1000); f.debug({ pre_stage: 'WAIT_STABLE' }); f.idle();
    assert.equal(f.control.getState().settledMonotonicMs, settled);
});

test('missing or empty PRED stage remains an incomplete DEBUG even when the feature is off', async () => {
    for (const pre_stage of [undefined, '', '   ']) {
        const f = fixture();
        const outcome = f.control.prepare().catch(error => error);
        f.features(); f.debug({ pre_stage }); f.idle();
        assert.equal(f.control.getState().ready, false);
        f.advance(15001); f.control.tick();
        assert.match((await outcome).message, /逾時/);
    }
});

test('incomplete DEBUG after clicking apply also blocks the delayed owned queue write', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('HEAD', 7.5);
    const rejected = assert.rejects(pending, /送出前/);
    f.debug({ pre_stage: undefined });
    assert.equal(f.control.allowCommand(f.sent.at(-1), true), false);
    await rejected;
    assert.equal(f.control.getState().ready, false);
});

test('DISABLED replies cannot substitute for confirmed off, complete heights or safe IO', async () => {
    for (const blocked of ['missing-feature', 'pred-on', 'legacy-on', 'moving', 'outputs-on', 'target-mismatch', 'anchor-active']) {
        const f = fixture();
        const outcome = f.control.prepare().catch(error => error);
        f.receive('PRED,ERR,DISABLED'); f.receive('CLASSIFY,ERR,DISABLED');
        if (blocked !== 'missing-feature') {
            f.receive(`FEATURE,STATUS,LEGACY,${blocked === 'legacy-on' ? 1 : 0},POSE,1,PRED,${blocked === 'pred-on' ? 1 : 0}`);
        }
        f.debug({ pre_stage: 'WAIT_STABLE', headNumber: blocked === 'target-mismatch' ? '8.0' : '7.0',
            anchor_state: blocked === 'anchor-active' ? 'COLLECTING' : 'IDLE' });
        f.receive(`I:0 ${blocked === 'moving' ? 4 : 5} ${blocked === 'outputs-on' ? 1 : 0} 0 0 0 0`);
        assert.equal(f.control.getState().ready, false, blocked);
        assert.equal(f.control.getState().busy, true, 'must keep waiting for authoritative reports');
        f.advance(15001); f.control.tick();
        assert.match((await outcome).message, /逾時/, blocked);
    }
});

test('late disabled replies preserve HEAD and NECK adjustments but still require ACK and fresh arrival', async () => {
    const f = fixture(); await f.prepare();
    let head = 7;
    let neck = 10;
    for (const [channel, height] of [['HEAD', 7.5], ['NECK', 10.5]]) {
        f.debug({ headNumber: String(head), currentHeadNumber: String(head), neckNumber: String(neck), currentNeckNumber: String(neck), pre_stage: 'WAIT_STABLE' });
        const pending = f.control.adjust(channel, height);
        const outcome = pending.then(value => ({ value }), error => ({ error }));
        assert.equal(f.control.allowCommand(f.sent.at(-1), true), true);
        f.receive('PRED,ERR,DISABLED'); f.receive('CLASSIFY,ERR,DISABLED');
        assert.equal(f.control.getState().busy, true);
        assert.equal(f.control.getState().ready, false);
        if (channel === 'HEAD') head = height; else neck = height;
        f.advance(1);
        f.receive(`HEIGHT_SET,SET_NORM,HEAD,${head},NECK,${neck}`);
        assert.equal(f.control.getState().ready, false);
        f.advance(6000);
        f.debug({ headNumber: String(head), currentHeadNumber: String(head), neckNumber: String(neck), currentNeckNumber: String(neck), pre_stage: 'WAIT_STABLE' });
        f.idle();
        const result = await outcome;
        assert.equal(result.error, undefined);
        assert.equal(result.value.ready, true);
    }
});

test('other errors and malformed disabled replies still reject a pending operation', async () => {
    for (const reply of ['SET,ERR,DISABLED', 'FEATURE,ERR,DISABLED', 'PRED,ERR,NOT_READY',
        'CLASSIFY,ERR,BAD_COMMAND', 'PRED,ERR,DISABLED,EXTRA', 'CLASSIFY,ERR,DISABLED,EXTRA', 'MANUAL,IGNORED']) {
        const f = fixture();
        const pending = f.control.prepare();
        const rejected = assert.rejects(pending, /裝置拒絕指令/);
        f.receive(reply);
        await rejected;
        assert.equal(f.control.getState().ready, false, reply);
    }
});

test('one channel SET waits for acknowledgement and new DEBUG plus I to arrive', async () => {
    const f = fixture(); await f.prepare();
    const promise = f.control.adjust('HEAD', 7.5);
    assert.equal(f.sent.at(-1), 'SET,NORM,EXPERIMENT,S,HEAD,7.5');
    assert.equal(f.control.getState().busy, true);
    assert.equal(f.control.getState().settledMonotonicMs, null);
    await assert.rejects(f.control.adjust('NECK', 10.5), /等待|未完成/);
    f.debug({ headNumber: '7.5', currentHeadNumber: '7.5' }); f.idle();
    assert.equal(f.control.getState().busy, true, 'arrival before SET acknowledgement is insufficient');
    f.advance(1);
    f.receive('HEIGHT_SET,SET_NORM,HEAD,7.5,NECK,10.0,HEAD_MIN,7.0,HEAD_MAX,16.0,NECK_MIN,10.0,NECK_MAX,14.0,STEP,0.5');
    assert.equal(f.control.ownsHeightReply(), true);
    assert.equal(f.control.getState().ready, false);
    f.idle();
    assert.equal(f.control.getState().busy, true);
    f.advance(6000); f.debug({ headNumber: '7.5', currentHeadNumber: '7.5' }); f.idle();
    assert.equal((await promise).head, 7.5);
    assert.equal(f.control.getState().ready, true);
});

test('invalid channel, range, null, numeric strings and non-half-step values never send SET', async () => {
    const f = fixture(); await f.prepare();
    const count = f.sent.length;
    for (const [channel, height] of [['HEAD', 6.5], ['HEAD', 16.5], ['NECK', 9.5], ['NECK', 14.5], ['HEAD', 7.25], ['HEAD', null], ['HEAD', '7.5'], ['MONITOR', 10]]) {
        await assert.rejects(f.control.adjust(channel, height), /高度須/);
    }
    assert.equal(f.sent.length, count);
});

test('freshness expires readiness without changing first-settled time on unchanged polls', async () => {
    const f = fixture(); await f.prepare();
    const first = f.control.getState().settledMonotonicMs;
    f.advance(1000); f.debug(); f.idle();
    assert.equal(f.control.getState().settledMonotonicMs, first);
    f.advance(3501);
    assert.equal(f.control.getState().ready, false);
    await assert.rejects(f.control.adjust('HEAD', 7.5), /過期/);
    f.debug(); f.idle();
    assert.equal(f.control.getState().ready, true);
    assert.equal(f.control.getState().settledMonotonicMs, first);
});

test('recording, anchor capture, nonidle outputs, manual state and enabled PRED block adjustment', async () => {
    const recording = fixture(); await recording.prepare(); recording.setRecording(true);
    assert.equal(recording.control.getState().ready, true, 'recording does not invalidate a fresh settled height');
    await assert.rejects(recording.control.prepare(), /記錄中/);
    await assert.rejects(recording.control.adjust('HEAD', 7.5), /記錄中/);
    for (const change of [
        f => f.receive('ANCHOR,STATUS,COLLECTING,BSHS'),
        f => f.receive('I:0 5 1 0 0 0 0'),
        f => f.receive('I:0 9 0 0 0 0 0'),
        f => f.receive('FEATURE,STATUS,LEGACY,0,POSE,1,PRED,1'),
        f => f.receive('PRED,OK,START')
    ]) {
        const f = fixture(); await f.prepare(); change(f);
        assert.equal(f.control.getState().ready, false);
        assert.equal(f.control.getState().settledMonotonicMs, null);
        await assert.rejects(f.control.adjust('HEAD', 7.5));
    }
});

test('DEBUG with active anchor or target mismatch cannot prepare', async () => {
    for (const values of [{ anchor_state: 'WAIT_SETTLE' }, { headNumber: '8.0' }]) {
        const f = fixture();
        const pending = f.control.prepare();
        const rejected = assert.rejects(pending, /斷線/);
        f.features(); f.debug(values); f.idle();
        assert.equal(f.control.getState().ready, false);
        f.control.onDisconnected(); await rejected;
    }
});

test('queries rate limited to once per second and SET is never automatically resent', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('HEAD', 7.5);
    const rejected = assert.rejects(pending, /逾時/);
    for (let i = 0; i < 12; i++) { f.control.tick(); f.advance(250); }
    assert.equal(f.sent.filter(value => value === 'DEBUG').length, 3);
    assert.equal(f.sent.filter(value => value.startsWith('SET,')).length, 1);
    f.advance(30000); f.control.tick(); await rejected;
    assert.equal(f.control.getState().ready, false);
    assert.equal(f.sent.filter(value => value.startsWith('SET,')).length, 1);
});

test('disconnect invalidates all readiness, rejects pending, and rejects queued owned SET on reconnect', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('NECK', 10.5);
    const rejected = assert.rejects(pending, /斷線/);
    const command = f.sent.at(-1);
    f.setConnected(false); f.control.onDisconnected(); await rejected;
    assert.equal(f.control.getState().head, null);
    f.setConnected(true);
    assert.equal(f.control.allowCommand(command, true), false);
    f.debug(); f.features(); f.idle();
    assert.equal(f.control.getState().ready, false);
});

test('conflicting queue controls blocked while busy, stopping/read requests preserved, later controls invalidate', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('HEAD', 7.5);
    const rejected = assert.rejects(pending, /指令失敗/);
    for (const command of ['SET,NORM,OLD,S,HEAD,8', 'PRED,START', 'FEATURE,PRED,ON', 'USER,0,20,170,60', 'MANUAL,ENTER', 'RESET', 'P\nSET,NORM,OLD,S,HEAD,8']) {
        assert.equal(f.control.allowCommand(command), false, command);
    }
    for (const command of ['P', 'DEBUG', 'I', 'FEATURE,STATUS', 'PRED,STOP']) assert.equal(f.control.allowCommand(command), true);
    f.control.onTransportError(new Error('synthetic')); await rejected;
    await f.prepare();
    assert.equal(f.control.allowCommand('PRED,START'), true);
    assert.equal(f.control.getState().ready, false);
});

test('unexpected SET targets fail the adjustment, complete old DEBUG cannot satisfy new acknowledgement', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('HEAD', 7.5);
    const rejected = assert.rejects(pending, /不同高度/);
    f.receive('HEIGHT_SET,SET_NORM,HEAD,8.0,NECK,10.0');
    await rejected;
    assert.equal(f.control.getState().ready, false);
});

const source = fs.readFileSync(path.join(__dirname, '../spp3_BLE/app.js'), 'utf8');
function productionFunction(name, endMarker) {
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start);
    return source.slice(start, end);
}

test('production HEIGHT_SET bridge preserves old calibration inputs only for experiment-owned response', () => {
    let owned = true;
    const writes = [];
    const monitors = [];
    const context = vm.createContext({
        experimentHeightControl: { ownsHeightReply: () => owned },
        numberInput1: 'one', numberInput2: 'two', numberInput3: 'three', numberInput4: 'four',
        document: { getElementById: id => id },
        setHeightInputValue: (...args) => writes.push(args),
        updateHeightMonitorFromValues: (...args) => monitors.push(args), serial_message() {},
        HEIGHT_LIMITS: { HEAD: { min: 7, max: 16 }, NECK: { min: 10, max: 14 } }, HEIGHT_STEP: 0.5
    });
    vm.runInContext(productionFunction('parseProtocolMessage', 'function serial_message('), context);
    context.parseProtocolMessage('HEIGHT_SET,SET_NORM,HEAD,7.5,NECK,10.0');
    assert.equal(writes.length, 0);
    assert.equal(monitors.length, 1);
    assert.equal(monitors[0][1], '7.5');
    owned = false;
    context.parseProtocolMessage('HEIGHT_SET,SET_NORM,HEAD,8.0,NECK,10.5');
    assert.equal(writes.length, 8);
});

test('production monitor retains estimates when target-only response supplies null current heights', () => {
    const context = vm.createContext({
        monitorState: { height: { targetHead: 7, targetNeck: 10, currentHead: 7, currentNeck: 10 } },
        updateMonitorDisplay() {}, appendMonitorLog() {}, formatHeightMonitorValue: () => ''
    });
    vm.runInContext(productionFunction('updateHeightMonitorFromValues', 'function createCaptureWizardModule('), context);
    context.updateHeightMonitorFromValues('HEIGHT_SET', '7.5', '10.5', null, null);
    assert.equal(context.monitorState.height.currentHead, 7);
    assert.equal(context.monitorState.height.currentNeck, 10);
    assert.equal(context.monitorState.height.targetHead, 7.5);
});

test('prepare in firmware MANUAL fails promptly and sends no startup or mode-changing motion', async () => {
    const f = fixture();
    const pending = f.control.prepare();
    const rejected = assert.rejects(pending, /MANUAL 模式/);
    f.features(); f.receive('I:0 9 0 0 0 0 0');
    await rejected;
    assert.equal(f.control.getState().busy, false);
    assert.deepEqual(f.sent, ['STOP_AUTOMATIC', 'DEBUG', 'I']);
});

test('production prepare adapter sends only stop/feature flags and no USER/INIT/ANCHOR/MANUAL/RESET', async () => {
    const sent = [];
    let control;
    let resetCalls = 0;
    const context = vm.createContext({
        experimentHeightControl: null,
        createExperimentHeightControl: options => (control = createExperimentHeightControl({ ...options, now: () => 100 })),
        serial_ready: true, bluetoothDevice: { gatt: { connected: true } },
        experimentHubModule: { isRunning: () => false },
        sendCommand: value => sent.push(value), sendSilentCommand: value => sent.push(value),
        requestSilentDebugSnapshot: () => sent.push('DEBUG'),
        resetAutoControlStartState: () => { resetCalls++; },
        CONTROL_MODE: { AUTO: 'AUTO', MANUAL: 'MANUAL' },
        requestedControlMode: null, rxCharacteristic: {},
        setModeUi() {}, setModeAck() {}, anchorDone: { BSHS: false, BLHL: false }
    });
    vm.runInContext(productionFunction('sendModeCommands', 'function safeSetText('), context);
    const start = source.indexOf('experimentHeightControl = createExperimentHeightControl({');
    const end = source.indexOf('experimentHubModule = createExperimentHub(', start);
    vm.runInContext(source.slice(start, end), context);
    const pending = control.prepare();
    const rejected = assert.rejects(pending, /斷線/);
    assert.deepEqual(sent, ['PRED,STOP', 'CLASSIFY,STOP', 'FEATURE,PRED,OFF', 'FEATURE,STATUS', 'FEATURE,LEGACY,OFF', 'FEATURE,STATUS', 'DEBUG', 'I']);
    assert.equal(resetCalls, 2, 'existing retry timers are cleared before and by mode helper');
    assert.equal(sent.some(value => /^(USER|INIT|ANCHOR|MANUAL|RESET)(,|$)/.test(value)), false);
    control.onDisconnected(); await rejected;
});

test('production queue gates at execution time and preserves owned option through sendCommand', async () => {
    const queued = [];
    const written = [];
    const gates = [];
    let allowed = true;
    const context = vm.createContext({
        TextEncoder,
        rxCharacteristic: { writeValue: bytes => { written.push(Buffer.from(bytes).toString()); } },
        experimentHeightControl: {
            allowCommand: (message, owned) => { gates.push([message, owned]); return allowed; },
            onTransportError() {}
        },
        bleQueue: { add: fn => queued.push(fn) }, serial_message() {}, logCommand() {}
    });
    vm.runInContext(productionFunction('allowExperimentHeightCommand', 'function sendSilentCommand('), context);
    context.sendCommand('SET,NORM,EXPERIMENT,S,HEAD,7.5', { experimentHeight: true });
    assert.equal(written.length, 0);
    allowed = false; await queued.shift()();
    assert.equal(written.length, 0, 'disconnect/cancel before execution blocks a previously queued SET');
    assert.equal(gates[0][1], true);
    context.sendCommand('P'); allowed = true; await queued.shift()();
    assert.deepEqual(written, ['P\n']);
});


test('manual stop remains available while busy and immediately invalidates pending operation', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('HEAD', 7.5);
    const rejected = assert.rejects(pending, /手動停止/);
    assert.equal(f.control.allowCommand('MANUAL,STOP'), true);
    await rejected;
    assert.equal(f.control.getState().ready, false);
    assert.equal(f.control.getState().settledMonotonicMs, null);
});


test('delayed owned queue write is rejected if the previously fresh readback expires', async () => {
    const f = fixture(); await f.prepare();
    const pending = f.control.adjust('HEAD', 7.5);
    const rejected = assert.rejects(pending, /送出前/);
    const command = f.sent.at(-1);
    f.advance(3501);
    assert.equal(f.control.allowCommand(command, true), false);
    await rejected;
    assert.equal(f.control.getState().ready, false);
});


test('production AUTO helper refuses busy height operation before changing mode or scheduling retries', () => {
    const sent = [];
    const changed = [];
    const context = vm.createContext({
        CONTROL_MODE: { AUTO: 'AUTO', MANUAL: 'MANUAL' },
        experimentHeightControl: { getState: () => ({ busy: true }) },
        requestedControlMode: 'MANUAL',
        setModeAck: (...args) => changed.push(args),
        setModeUi: () => { throw new Error('must not change mode'); },
        sendCommand: command => sent.push(command),
        maybeStartClassification: () => { throw new Error('must not schedule retry'); }
    });
    vm.runInContext(productionFunction('sendModeCommands', 'function safeSetText('), context);
    context.sendModeCommands('AUTO');
    assert.equal(sent.length, 0);
    assert.equal(context.requestedControlMode, 'MANUAL');
    assert.match(changed[0][0], /操作尚未完成/);
});


test('late classifier retry callbacks cannot restart AUTO in manual mode or during height operation', () => {
    for (const state of [{ mode: 'MANUAL', busy: false }, { mode: 'AUTO', busy: true }]) {
        const context = vm.createContext({
            CONTROL_MODE: { AUTO: 'AUTO', MANUAL: 'MANUAL' }, controlMode: state.mode,
            experimentHeightControl: { getState: () => ({ busy: state.busy }) },
            sendCommand: () => { throw new Error('retry must not send'); },
            setTimeout: () => { throw new Error('retry must not reschedule'); }
        });
        vm.runInContext(productionFunction('requestClassifyStart', 'function maybeStartClassification('), context);
        context.requestClassifyStart();
    }
});
