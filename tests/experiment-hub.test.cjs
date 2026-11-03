// Synthetic Hub wiring tests with a small DOM and pressure-controller stub.
// The real pressure controller/recorder are exercised by pressure-ui.test.cjs.
// These tests do not render a browser or assert BLE/device behavior.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../spp3_BLE', name), 'utf8');
const appSource = source('app.js');
const configLiteral = appSource.match(/pressureConfig:\s*(\{[\s\S]*?\}),\s*getSystemState:\s*\(\)\s*=>/);
assert.ok(configLiteral, 'extract the actual app configuration rather than duplicate its labels');
const pressureConfig = vm.runInNewContext(`(${configLiteral[1]})`);

function fixture(savedSelection = null) {
    const nodes = {};
    const pressureInstances = [];
    const windowListeners = new Map();
    const storage = new Map(savedSelection ? [['experimentHub.v4.currentExperiment', savedSelection]] : []);
    const system = { connected: true, autoHeightPossible: false };
    let viewClones = 0;
    class Element {
        constructor(id = '') {
            this.id = id; this.value = ''; this.textContent = ''; this.disabled = false;
            this.hidden = false; this.children = []; this.listeners = new Map(); this.isConnected = true;
        }
        addEventListener(type, callback) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(callback);
        }
        dispatch(type) {
            for (const callback of this.listeners.get(type) || []) callback({ target: this });
        }
        replaceChildren(...children) {
            this.children.forEach(child => { child.isConnected = false; });
            this.children = children;
            children.forEach(child => { child.isConnected = true; });
        }
    }
    for (const id of ['experimentPrev', 'experimentNext', 'experimentCounter', 'experimentTitle',
        'experimentSelect', 'experimentStatus', 'experimentView', 'experimentHint', 'experimentStart',
        'experimentFinish', 'experimentExport']) nodes[id] = new Element(id);
    const template = {
        content: { firstElementChild: { cloneNode(deep) {
            assert.equal(deep, true); viewClones++;
            const view = new Element('cloned-pressure-view');
            view.isConnected = false; view.draft = { notes: '' }; return view;
        } } }
    };
    const createPressureCollectionExperiment = (view, options) => {
        // A contract double tests Hub ownership/delegation only, not pressure logic.
        assert.equal(typeof options.getSystemState, 'function', 'Hub must forward the system-state getter, not the dropdown DOM options');
        assert.deepEqual(options.getSystemState(), system);
        let status = 'idle'; let exported = false;
        const samples = [];
        const chart = { marker: 'retained-chart', data: [] };
        const calls = { start: 0, finish: 0, export: 0, refresh: 0, disconnect: 0 };
        const statusText = () => ({ idle: '尚未開始', recording: '記錄中', ended_early: '提前結束（未完成）', interrupted: '收集中斷' })[status];
        const getUiState = () => ({ status, statusText: statusText(), running: status === 'recording',
            hint: 'synthetic controller status', startDisabled: status === 'recording' || (samples.length > 0 && !exported),
            finishDisabled: status !== 'recording', exportDisabled: status === 'recording' || !samples.length });
        const refresh = () => { calls.refresh++; const ui = getUiState(); options.onChange(ui); return ui; };
        const module = {
            start() { calls.start++; status = 'recording'; refresh(); },
            endEarly() { calls.finish++; status = 'ended_early'; refresh(); },
            exportCsv() { calls.export++; if (status !== 'recording' && samples.length) exported = true; refresh(); },
            receivePressure(sample) { if (status === 'recording') { samples.push({ ...sample }); chart.data.push(sample.monitor_adc); } },
            onDisconnected() { calls.disconnect++; if (status === 'recording') status = 'interrupted'; refresh(); },
            refresh, getUiState, isRunning: () => status === 'recording',
            needsLeaveProtection: () => status === 'recording' || (samples.length > 0 && !exported)
        };
        pressureInstances.push({ view, options, module, samples, chart, calls });
        return module;
    };
    const context = vm.createContext({
        document: { createElement: () => new Element(), getElementById: id => id === 'pressureExperimentTemplate' ? template : nodes[id] },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        window: { addEventListener(type, callback) {
            if (!windowListeners.has(type)) windowListeners.set(type, []);
            windowListeners.get(type).push(callback);
        } },
        createPressureCollectionExperiment
    });
    vm.runInContext(source('experiment-hub.js'), context);
    const hub = context.createExperimentHub({ querySelector: selector => nodes[selector.slice(1)] }, {
        pressureConfig, getSystemState: () => ({ ...system })
    });
    hub.init();
    function choose(id) { nodes.experimentSelect.value = id; nodes.experimentSelect.dispatch('change'); }
    function beforeUnload() {
        const event = { prevented: false, preventDefault() { this.prevented = true; } };
        for (const callback of windowListeners.get('beforeunload') || []) callback(event);
        return event;
    }
    return { hub, nodes, pressureInstances, windowListeners, storage, system, choose, beforeUnload, viewClones: () => viewClones };
}

test('actual app config selects Experiment 01 and keeps confirmed numerical posture metadata', () => {
    assert.equal(pressureConfig.experimentId, '01');
    assert.equal(pressureConfig.title, '固定睡姿下自然呼吸與微動之辨識穩健性測試');
    assert.equal(pressureConfig.gapTimeoutMs, 3000);
    assert.deepEqual(Array.from(pressureConfig.conditions, c => [c.id, c.actual_pose, c.height_condition, c.test_condition]), [
        ['01', 'pose1', 'height1', 'still'], ['02', 'pose1', 'height1', 'movement'],
        ['03', 'pose5', 'height5', 'still'], ['04', 'pose5', 'height5', 'movement']
    ]);
    const f = fixture();
    assert.equal(f.nodes.experimentTitle.textContent, pressureConfig.title);
    assert.equal(f.nodes.experimentView.children[0], f.pressureInstances[0].view);
    assert.equal(f.nodes.experimentStart.textContent, '開始記錄');
    assert.equal(f.nodes.experimentFinish.textContent, '提前結束');
    assert.equal(f.nodes.experimentExport.hidden, false);
    assert.equal(f.pressureInstances[0].options.gapTimeoutMs, 3000);
    assert.equal(f.pressureInstances[0].options.conditions, pressureConfig.conditions);
    assert.equal(f.beforeUnload().prevented, false);
});

test('nine-item dropdown and previous/next share one selection; eight placeholders cannot run', () => {
    const f = fixture();
    assert.equal(f.nodes.experimentSelect.children.length, 9);
    assert.equal(f.nodes.experimentPrev.disabled, true);
    assert.equal(f.nodes.experimentNext.disabled, false);
    for (let i = 2; i <= 9; i++) {
        f.nodes.experimentNext.dispatch('click');
        const id = String(i).padStart(2, '0');
        assert.equal(f.nodes.experimentCounter.textContent, `實驗 ${id} / 09`);
        assert.equal(f.nodes.experimentSelect.value, id);
        assert.equal(f.nodes.experimentTitle.textContent, `Experiment ${id}`);
        assert.equal(f.nodes.experimentStart.disabled, true); assert.equal(f.nodes.experimentFinish.disabled, true);
        assert.equal(f.nodes.experimentExport.hidden, true);
        assert.match(f.nodes.experimentView.children[0].textContent, /尚未設定/);
    }
    assert.equal(f.nodes.experimentNext.disabled, true);
    f.nodes.experimentNext.dispatch('click'); assert.equal(f.nodes.experimentSelect.value, '09');
    f.nodes.experimentPrev.dispatch('click'); assert.equal(f.nodes.experimentSelect.value, '08');
    f.choose('03'); assert.equal(f.nodes.experimentCounter.textContent, '實驗 03 / 09');
    assert.equal(f.storage.get('experimentHub.v4.currentExperiment'), '03');
    f.choose('01'); assert.equal(f.nodes.experimentTitle.textContent, pressureConfig.title);
});

test('running locks all navigation and routes common controls to one retained pressure instance', () => {
    const f = fixture(); const pressure = f.pressureInstances[0];
    pressure.view.draft.notes = 'synthetic retained draft';
    f.nodes.experimentStart.dispatch('click');
    assert.equal(pressure.calls.start, 1);
    assert.equal(f.nodes.experimentPrev.disabled, true); assert.equal(f.nodes.experimentNext.disabled, true);
    assert.equal(f.nodes.experimentSelect.disabled, true);
    assert.equal(f.nodes.experimentFinish.disabled, false); assert.equal(f.nodes.experimentExport.disabled, true);
    f.nodes.experimentNext.dispatch('click'); f.choose('09');
    assert.equal(f.nodes.experimentSelect.value, '01');
    assert.equal(f.nodes.experimentView.children[0], pressure.view);
    f.hub.receivePressure({ monitor_adc: 101, neck_adc: 202, head_adc: 303 });
    assert.equal(pressure.samples.length, 1);
    const event = f.beforeUnload(); assert.equal(event.prevented, true); assert.equal(event.returnValue, '');
    f.nodes.experimentFinish.dispatch('click');
    assert.equal(pressure.calls.finish, 1); assert.equal(f.nodes.experimentSelect.disabled, false);
    assert.equal(f.nodes.experimentStatus.textContent, '提前結束（未完成）');
    assert.equal(f.nodes.experimentExport.disabled, false);
    assert.equal(f.beforeUnload().prevented, true, 'unexported rows still need leave protection');
    const view = pressure.view; const chart = pressure.chart;
    f.choose('04'); assert.equal(view.isConnected, false);
    f.choose('01'); assert.equal(view.isConnected, true);
    assert.equal(f.nodes.experimentView.children[0], view);
    assert.equal(view.draft.notes, 'synthetic retained draft');
    assert.equal(pressure.chart, chart); assert.deepEqual(chart.data, [101]);
    assert.equal(pressure.samples.length, 1); assert.equal(f.pressureInstances.length, 1);
    f.nodes.experimentExport.dispatch('click');
    assert.equal(pressure.calls.export, 1); assert.equal(f.beforeUnload().prevented, false);
});

test('disconnect is delegated and unsaved interrupted samples keep beforeunload protection', () => {
    const f = fixture(); f.nodes.experimentStart.dispatch('click');
    f.hub.receivePressure({ monitor_adc: 1, neck_adc: 2, head_adc: 3 });
    f.hub.onDisconnected();
    assert.equal(f.pressureInstances[0].calls.disconnect, 1);
    assert.equal(f.nodes.experimentStatus.textContent, '收集中斷');
    assert.equal(f.beforeUnload().prevented, true);
});

test('initialization is idempotent and restored selection never recreates pressure view', () => {
    const f = fixture('06'); f.hub.init();
    assert.equal(f.nodes.experimentSelect.value, '06');
    assert.equal(f.pressureInstances.length, 1); assert.equal(f.viewClones(), 1);
    for (const id of ['experimentPrev', 'experimentNext', 'experimentStart', 'experimentFinish', 'experimentExport']) {
        assert.equal(f.nodes[id].listeners.get('click').length, 1);
    }
    assert.equal(f.nodes.experimentSelect.listeners.get('change').length, 1);
    assert.equal(f.windowListeners.get('beforeunload').length, 1);
    f.nodes.experimentNext.dispatch('click'); assert.equal(f.nodes.experimentSelect.value, '07');
    f.choose('01'); assert.equal(f.pressureInstances.length, 1);
    const invalid = fixture('invalid'); assert.equal(invalid.nodes.experimentSelect.value, '01');
});

test('production accordion helper only changes display/ARIA/storage, without stopping a run', () => {
    const helper = appSource.match(/function setAccordionExpanded\([^)]*\)\s*\{[\s\S]*?\n\s*\}\n\s*const savedUserAccordionState/);
    assert.ok(helper);
    assert.doesNotMatch(helper[0], /endEarly|disconnect|sendCommand|stop|finishExperiment/);
    assert.match(helper[0], /classList\.toggle\('is-collapsed'/);
    assert.match(helper[0], /aria-expanded/);
    assert.match(appSource, /setAccordionExpanded\(experimentAccordionToggle, experimentAccordionBody, experimentAccordionKey, !expanded\)/);
});
