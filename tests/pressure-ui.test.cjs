// Synthetic samples only. This lightweight DOM/Chart fixture exercises production
// UI/controller code; it does not render HTML, validate native browser behavior,
// connect BLE, or establish a device sampling rate or classification accuracy.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, '../spp3_BLE', name), 'utf8');
const html = source('index.html');
const template = html.match(/<template id="pressureExperimentTemplate">([\s\S]*?)<\/template>/)?.[1];
assert.ok(template, 'the production pressure template must exist');

// Independent synthetic metadata, intentionally not a claim about posture mappings.
const conditions = [
    { id: '01', actual_pose: 'synthetic_pose1', height_condition: 'synthetic_height1', test_condition: 'still', poseText: '睡姿一', scenario: '穩定／自然呼吸', filePose: 'pose1', fileHeight: 'height1' },
    { id: '02', actual_pose: 'synthetic_pose1', height_condition: 'synthetic_height1', test_condition: 'micro_motion', poseText: '睡姿一', scenario: '微動／自然呼吸', filePose: 'pose1', fileHeight: 'height1' },
    { id: '03', actual_pose: 'synthetic_pose5', height_condition: 'synthetic_height5', test_condition: 'still', poseText: '睡姿五', scenario: '穩定／自然呼吸', filePose: 'pose5', fileHeight: 'height5' },
    { id: '04', actual_pose: 'synthetic_pose5', height_condition: 'synthetic_height5', test_condition: 'micro_motion', poseText: '睡姿五', scenario: '微動／自然呼吸', filePose: 'pose5', fileHeight: 'height5' }
];

function parseCsv(csv) {
    const rows = []; let row = []; let value = ''; let quoted = false;
    const text = csv.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') { value += '"'; i++; }
            else quoted = !quoted;
        } else if (!quoted && char === ',') { row.push(value); value = ''; }
        else if (!quoted && char === '\r' && text[i + 1] === '\n') {
            row.push(value); rows.push(row); row = []; value = ''; i++;
        } else value += char;
    }
    assert.equal(quoted, false, 'CSV quotes must close');
    const [header, ...data] = rows;
    return { header, rows: data.map(values => Object.fromEntries(header.map((key, i) => [key, values[i]]))) };
}

function fixture(useHub = false) {
    let clock = 0;
    let sequence = 0;
    let startClock = null;
    const epoch = Date.parse('2030-01-02T03:04:05.000Z');
    const system = { connected: true, autoHeightPossible: false };
    const timers = [];
    const timeouts = [];
    const charts = [];
    const downloads = [];
    const urls = new Map();
    const confirms = [];
    const confirmationAnswers = [];
    const uiChanges = [];
    const nodes = {};
    const storage = new Map();
    const windowListeners = new Map();
    let systemStateReads = 0;
    let pngFailure = false;
    class Element {
        constructor(id, attrs = {}) {
            this.id = id; this.value = attrs.value || ''; this.checked = false;
            this.disabled = false; this.textContent = ''; this.isConnected = true;
            this.offsetParent = {}; this.attrs = attrs; this.listeners = new Map();
            this.children = []; this.hidden = false;
            this.width = 640; this.height = 220;
        }
        addEventListener(event, callback) {
            if (!this.listeners.has(event)) this.listeners.set(event, []);
            this.listeners.get(event).push(callback);
        }
        dispatch(event, target = this) {
            for (const listener of this.listeners.get(event) || []) listener({ target, preventDefault() {} });
        }
        getContext() {
            const canvas = this;
            if (!this.drawingContext) this.drawingContext = {
                canvas, calls: [], font: '', fillStyle: '',
                measureText: text => ({ width: Array.from(text).length * 8 }),
                fillRect(...args) { this.calls.push({ kind: 'fillRect', args, fillStyle: this.fillStyle }); },
                fillText(text, x, y) { this.calls.push({ kind: 'fillText', text, x, y, fillStyle: this.fillStyle }); },
                drawImage(source, x, y) {
                    this.calls.push({ kind: 'drawImage', x, y, sourceId: source.id,
                        data: JSON.parse(JSON.stringify(source.chartInstance?.data)),
                        title: source.chartInstance?.options.plugins?.title?.text });
                }
            };
            return this.drawingContext;
        }
        toDataURL(type) {
            assert.equal(type, 'image/png');
            if (pngFailure) throw new Error('Synthetic PNG encoding failure');
            // Encodes draw calls for assertions; these are not real PNG bytes or rendered pixels.
            return `data:image/png;base64,${Buffer.from(JSON.stringify({
                width: this.width, height: this.height, calls: this.drawingContext.calls
            })).toString('base64')}`;
        }
        remove() { this.isConnected = false; }
        replaceChildren(...children) {
            this.children.forEach(child => { child.isConnected = false; });
            this.children = children;
            children.forEach(child => { child.isConnected = true; });
        }
    }
    const pressureRoot = new Element('pressureRoot');
    pressureRoot.querySelector = selector => nodes[selector.slice(1)];
    for (const id of ['experimentPrev', 'experimentNext', 'experimentCounter', 'experimentTitle',
        'experimentSelect', 'experimentStatus', 'experimentView', 'experimentHint', 'experimentStart',
        'experimentFinish', 'experimentExport']) nodes[id] = new Element(id);
    const pressureTemplate = { content: { firstElementChild: { cloneNode(deep) {
        assert.equal(deep, true); return pressureRoot;
    } } } };
    for (const match of template.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const attrs = {};
        for (const attr of match[1].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] ?? '';
        nodes[match[2]] = new Element(match[2], attrs);
    }
    nodes.pressureCondition.value = '01';
    // A deliberately small validity model using the actual template constraints.
    // This is not a substitute for native HTML constraint-validation/render tests.
    nodes.pressureRunForm.checkValidity = () => {
        if (nodes.pressureRunSettings.disabled) return true;
        const subject = nodes.pressureSubject;
        if (!new RegExp(`^(?:${subject.attrs.pattern})$`).test(subject.value)) return false;
        for (const id of ['pressureTrial', 'pressureHeadHeight', 'pressureNeckHeight']) {
            const node = nodes[id]; const value = Number(node.value);
            if (!node.value || !Number.isFinite(value) || value < Number(node.attrs.min) ||
                (node.attrs.max && value > Number(node.attrs.max)) ||
                Math.abs((value - Number(node.attrs.min)) / Number(node.attrs.step) -
                    Math.round((value - Number(node.attrs.min)) / Number(node.attrs.step))) > 1e-8) return false;
        }
        return conditions.some(item => item.id === nodes.pressureCondition.value) && nodes.pressureSetupConfirmed.checked;
    };
    nodes.pressureRunForm.reportValidity = () => nodes.pressureRunForm.checkValidity();
    class SyntheticDate extends Date {
        constructor(...args) { super(...(args.length ? args : [epoch + clock])); }
        static now() { return epoch + clock; }
    }
    class ChartStub {
        constructor(context, config) {
            this.canvas = context.canvas; this.data = config.data; this.options = config.options;
            this.width = this.canvas.width; this.canvas.chartInstance = this;
            this.updates = []; charts.push(this);
        }
        update(mode) { this.updates.push(mode); }
    }
    const context = vm.createContext({
        performance: { now: () => clock }, Date: SyntheticDate,
        crypto: { randomUUID: () => `synthetic-run-${++sequence}` },
        Chart: ChartStub, Blob,
        URL: {
            createObjectURL(blob) { const url = `blob:synthetic-${urls.size + 1}`; urls.set(url, blob); return url; },
            revokeObjectURL(url) { urls.delete(url); }
        },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        window: {
            confirm(message) { confirms.push(message); return confirmationAnswers.shift() ?? false; },
            addEventListener(event, callback) {
                if (!windowListeners.has(event)) windowListeners.set(event, []);
                windowListeners.get(event).push(callback);
            }
        },
        document: {
            body: { appendChild() {} },
            getElementById: id => id === 'pressureExperimentTemplate' ? pressureTemplate : nodes[id],
            createElement(tag) {
                const element = new Element(tag);
                if (tag === 'a') element.click = () => downloads.push({
                    filename: element.download, blob: urls.get(element.href), href: element.href
                });
                return element;
            }
        },
        setInterval(fn, delay) { timers.push({ fn, delay }); return timers.length; },
        setTimeout(fn, delay) { timeouts.push({ fn, delay }); return timeouts.length; },
        console
    });
    vm.runInContext(source('pressure-recorder.js'), context);
    vm.runInContext(source('pressure-experiment.js'), context);
    const getSystemState = () => { systemStateReads++; return { ...system }; };
    let module; let hub; let actualConfig;
    if (useHub) {
        // Execute all three production layers together; the factory wrapper only
        // captures the real controller instance and never substitutes its behavior.
        const configLiteral = source('app.js').match(/pressureConfig:\s*(\{[\s\S]*?\}),\s*getSystemState:\s*\(\)\s*=>/);
        assert.ok(configLiteral, 'the actual app pressure configuration must be extractable');
        actualConfig = vm.runInContext(`(${configLiteral[1]})`, context);
        const realFactory = context.createPressureCollectionExperiment;
        context.createPressureCollectionExperiment = (root, options) => {
            module = realFactory(root, {
                ...options, onChange: state => { uiChanges.push({ ...state }); options.onChange(state); }
            });
            return module;
        };
        vm.runInContext(source('experiment-hub.js'), context);
        hub = context.createExperimentHub({ querySelector: selector => nodes[selector.slice(1)] }, {
            pressureConfig: actualConfig, getSystemState
        });
        hub.init();
    } else {
        module = context.createPressureCollectionExperiment(pressureRoot, {
            gapTimeoutMs: 3000, conditions: conditions.map(item => ({ ...item })),
            getSystemState, onChange: state => uiChanges.push({ ...state })
        });
    }
    function at(ms) { clock = ms; }
    function heartbeat() { timers.forEach(timer => timer.fn()); }
    function receive(values = [101, 202, 303]) {
        const sample = {
            monitor_adc: values[0], neck_adc: values[1], head_adc: values[2],
            receivedMonotonicMs: clock, timestamp_iso: new SyntheticDate().toISOString()
        };
        if (hub) hub.receivePressure(sample); else module.receivePressure(sample);
    }
    function fill(condition = '01', notes = '') {
        nodes.pressureSubject.value = 'S01'; nodes.pressureTrial.value = '2';
        changeCondition(condition);
        nodes.pressureHeadHeight.value = '9.5'; nodes.pressureNeckHeight.value = '11';
        nodes.pressureNotes.value = notes; nodes.pressureSetupConfirmed.checked = true;
    }
    function changeCondition(id, event = 'change') {
        nodes.pressureCondition.value = id;
        if (event === 'input') nodes.pressureRunForm.dispatch('input', nodes.pressureCondition);
        else nodes.pressureCondition.dispatch('change');
    }
    function beforeUnload() {
        const event = { prevented: false, preventDefault() { this.prevented = true; } };
        for (const callback of windowListeners.get('beforeunload') || []) callback(event);
        return event;
    }
    function prime() { receive(); at(clock + 1000); receive(); module.refresh(); }
    function begin(condition = '01', notes = '') {
        fill(condition, notes); prime(); startClock = clock; module.start();
        assert.equal(module.getUiState().status, 'recording');
    }
    function elapsed(ms, values) { at(startClock + ms); if (values) receive(values); heartbeat(); }
    async function exported() {
        const previousDownloads = downloads.length;
        module.exportCsv();
        const batch = downloads.slice(previousDownloads);
        const download = batch.find(item => item.filename.endsWith('.csv'));
        const png = batch.find(item => item.filename.endsWith('.png'));
        assert.ok(download, 'production export must trigger a CSV download');
        assert.ok(png, 'production export must trigger a PNG download');
        return { ...download, png, ...parseCsv(await download.blob.text()) };
    }
    return {
        module, hub, actualConfig, pressureRoot, nodes, system, timers, timeouts, charts, downloads, confirms,
        confirmationAnswers, uiChanges, at, heartbeat, receive, fill, prime, begin, elapsed, exported,
        changeCondition, beforeUnload, setPngFailure: value => { pngFailure = value; },
        clock: () => clock, setStartClock: () => { startClock = clock; }, systemStateReads: () => systemStateReads
    };
}

test('template is a single inert view with explicit ADC, posture and operator-height constraints', () => {
    assert.equal((html.match(/id="pressureExperimentTemplate"/g) || []).length, 1);
    assert.equal((template.match(/<form\b/g) || []).length, 1);
    assert.equal((template.match(/<option value="0[1-4]"/g) || []).length, 4);
    assert.match(template, /pattern="S\\d\{2\}"/);
    assert.match(template, /id="pressureHeadHeight"[^>]*min="7"[^>]*max="16"[^>]*step="0\.5"/);
    assert.match(template, /id="pressureNeckHeight"[^>]*min="10"[^>]*max="14"[^>]*step="0\.5"/);
    assert.match(template, /不下達高度控制指令/);
    assert.match(template, /不包含翻身或切換睡姿/);
    assert.match(template, /不提供即時分類結果/);
    assert.match(template, /原始 ADC/);
    assert.doesNotMatch(template, /<button\b/);
});

test('start requires live complete messages and valid confirmed settings; form edits clear confirmation', () => {
    const f = fixture();
    assert.equal(f.module.getUiState().startDisabled, true);
    assert.equal(f.module.getUiState().finishDisabled, true);
    assert.equal(f.module.getUiState().exportDisabled, true);
    f.fill(); f.module.start();
    assert.equal(f.module.getUiState().status, 'idle');
    f.prime(); f.nodes.pressureSubject.value = 'name'; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
    f.nodes.pressureSubject.value = 'S01'; f.nodes.pressureHeadHeight.value = '16.5'; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
    f.nodes.pressureHeadHeight.value = '9.5';
    f.nodes.pressureRunForm.dispatch('input', f.nodes.pressureHeadHeight);
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, false);
    f.nodes.pressureCondition.value = '04'; f.nodes.pressureCondition.dispatch('change');
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.match(f.nodes.pressureConditionDescription.textContent, /synthetic_pose5/);
    f.nodes.pressureSetupConfirmed.checked = true; f.system.connected = false; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
});

test('normal 30-second reception locks settings, completes by monotonic clock, and preserves ADC chart', async () => {
    const f = fixture(); f.begin();
    assert.equal(f.nodes.pressureRunSettings.disabled, true);
    assert.equal(f.module.getUiState().startDisabled, true);
    assert.equal(f.module.getUiState().finishDisabled, false);
    assert.equal(f.module.getUiState().exportDisabled, true);
    f.module.exportCsv(); assert.equal(f.downloads.length, 0);
    assert.equal(f.timers.length, 1);
    assert.equal(f.timers[0].delay, 250);
    for (let sec = 0; sec <= 30; sec++) f.elapsed(sec * 1000, [1000 + sec, 2000 + sec, 3000 + sec]);
    assert.equal(f.module.getUiState().status, 'completed');
    assert.equal(f.nodes.pressureElapsed.textContent, '30.0 / 30.0');
    assert.equal(f.nodes.pressureSampleCount.textContent, '31');
    assert.equal(f.nodes.pressureRunSettings.disabled, false);
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.equal(f.module.getUiState().finishDisabled, true);
    assert.equal(f.module.getUiState().exportDisabled, false);
    assert.equal(f.module.getUiState().startDisabled, true, 'unexported run must remain protected');
    assert.equal(f.charts.length, 1);
    const chart = f.charts[0];
    assert.equal(chart.options.scales.x.min, 0); assert.equal(chart.options.scales.x.max, 30);
    assert.match(chart.options.scales.y.title.text, /ADC/);
    assert.deepEqual(Array.from(chart.data.datasets, item => item.label), ['Monitor', 'Neck', 'Head']);
    assert.deepEqual(Array.from(chart.data.datasets, item => item.borderColor), [
        'rgb(175, 71, 71)', 'rgb(5, 192, 2)', 'rgb(5, 2, 192)'
    ]);
    for (let index = 0; index < 3; index++) {
        const points = chart.data.datasets[index].data;
        assert.equal(points.length, 31); assert.equal(points.at(-1).x, 30);
        assert.equal(points.at(-1).y, (index + 1) * 1000 + 30);
    }
    const firstDownload = await f.exported();
    assert.equal(firstDownload.rows.length, 31);
    assert.equal(firstDownload.rows[0].monitor_adc, '1000');
    assert.equal(firstDownload.rows[0].neck_adc, '2000');
    assert.equal(firstDownload.rows[0].head_adc, '3000');
    assert.ok(firstDownload.rows.every(row => row.run_status === 'completed'));
    const retained = JSON.stringify(chart.data.datasets);
    f.elapsed(31000, [999, 998, 997]);
    assert.equal(f.nodes.pressureSampleCount.textContent, '31');
    assert.equal(JSON.stringify(chart.data.datasets), retained);
});

test('early stop retains actual rows and forbids overwriting before CSV export', async () => {
    const f = fixture(); f.begin();
    f.elapsed(100, [11, 22, 33]); f.elapsed(1100, [44, 55, 66]); f.elapsed(1500);
    f.module.endEarly();
    assert.equal(f.module.getUiState().status, 'ended_early');
    assert.equal(f.module.getUiState().exportDisabled, false);
    assert.equal(f.nodes.pressureRunSettings.disabled, false);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.start();
    assert.equal(f.module.getUiState().status, 'ended_early');
    assert.equal(f.confirms.length, 0, 'no replacement confirmation before export');
    assert.equal(f.nodes.pressureSampleCount.textContent, '2');
    const exported = await f.exported();
    assert.equal(exported.rows.length, 2);
    assert.ok(exported.rows.every(row => row.run_status === 'ended_early'));
    assert.equal(exported.rows[1].elapsed_s, '1.100000');
});

test('disconnect and inclusive 3-second gap keep partial samples as interrupted runs', async () => {
    for (const reason of ['ble_disconnected', 'pressure_gap']) {
        const f = fixture(); f.begin(); f.elapsed(200, [7, 8, 9]);
        if (reason === 'ble_disconnected') {
            f.elapsed(500); f.system.connected = false; f.module.onDisconnected();
        } else f.elapsed(3200);
        assert.equal(f.module.getUiState().status, 'interrupted');
        assert.equal(f.module.getUiState().finishDisabled, true);
        assert.equal(f.module.getUiState().exportDisabled, false);
        const exported = await f.exported();
        assert.equal(exported.rows.length, 1);
        assert.equal(exported.rows[0].interruption_reason, reason);
        assert.equal(exported.rows[0].run_status, 'interrupted');
        f.elapsed(4200, [700, 800, 900]);
        assert.equal(f.nodes.pressureSampleCount.textContent, '1');
    }
});

test('a run receiving no new messages cannot become a completed or exportable run', () => {
    const f = fixture(); f.begin(); f.elapsed(3000);
    assert.equal(f.module.getUiState().status, 'interrupted');
    assert.equal(f.nodes.pressureSampleCount.textContent, '0');
    assert.equal(f.module.getUiState().exportDisabled, true);
    f.module.exportCsv(); assert.equal(f.downloads.length, 0);
    f.elapsed(30000);
    assert.equal(f.module.getUiState().status, 'interrupted');
    assert.match(f.nodes.pressureRunSummary.textContent, /未收到有效壓力訊息/);
});

test('all four condition metadata and filename segments survive actual Blob CSV download', async () => {
    for (const condition of conditions) {
        const f = fixture(); f.begin(condition.id); f.elapsed(250, [101.25, 202.5, 303.75]);
        f.module.endEarly();
        const exported = await f.exported();
        assert.equal(exported.filename,
            `S01_${condition.filePose}_${condition.fileHeight}_${condition.test_condition}_trial02_synthetic-run-1.csv`);
        const row = exported.rows[0];
        assert.equal(row.condition_id, condition.id);
        assert.equal(row.actual_pose, condition.actual_pose);
        assert.equal(row.height_condition, condition.height_condition);
        assert.equal(row.test_condition, condition.test_condition);
        assert.equal(row.subject_id, 'S01'); assert.equal(row.trial_index, '2');
        assert.equal(row.head_height_cm, '9.5'); assert.equal(row.neck_height_cm, '11');
        assert.equal(row.height_source, 'operator'); assert.equal(row.pressure_unit, 'ADC');
        assert.equal(row.data_timeout_s, '3'); assert.equal(row.gap_timeout_ms, '3000');
        const pressureIndex = exported.header.indexOf('monitor_adc');
        assert.deepEqual(exported.header.slice(pressureIndex, pressureIndex + 3), ['monitor_adc', 'neck_adc', 'head_adc']);
    }
});

test('quoted notes and captured metadata remain immutable despite later form changes', async () => {
    const notes = 'Synthetic note, with "quotes"\r\nand a second line';
    const f = fixture(); f.begin('02', notes); f.elapsed(400, [1, 2, 3]); f.module.endEarly();
    f.fill('02', 'replacement'); f.nodes.pressureSubject.value = 'S99';
    f.nodes.pressureTrial.value = '8'; f.nodes.pressureHeadHeight.value = '15';
    f.nodes.pressureNeckHeight.value = '14'; f.module.refresh();
    const first = await f.exported();
    assert.equal(first.rows[0].notes, notes);
    assert.equal(first.rows[0].subject_id, 'S01'); assert.equal(first.rows[0].condition_id, '02');
    assert.equal(first.rows[0].head_height_cm, '9.5'); assert.equal(first.rows[0].trial_index, '2');
    assert.match(first.filename, /^S01_pose1_height1_micro_motion_trial02_/);
    assert.equal(f.timeouts[0].delay, 10000, 'object URL revocation must be deferred');
    const retained = JSON.stringify(f.charts[0].data.datasets);
    f.confirmationAnswers.push(false); f.module.start();
    assert.equal(f.confirms.length, 1);
    assert.equal(f.module.getUiState().status, 'ended_early');
    assert.equal(JSON.stringify(f.charts[0].data.datasets), retained);
    const canceled = await f.exported();
    assert.equal(canceled.rows[0].run_id, first.rows[0].run_id);
    f.confirmationAnswers.push(true); f.setStartClock(); f.module.start();
    assert.equal(f.confirms.length, 2);
    assert.equal(f.module.getUiState().status, 'recording');
    assert.equal(f.nodes.pressureSampleCount.textContent, '0');
    f.elapsed(300, [9, 8, 7]); f.module.endEarly();
    const second = await f.exported();
    assert.notEqual(second.rows[0].run_id, first.rows[0].run_id);
    assert.equal(second.rows[0].subject_id, 'S99'); assert.equal(second.rows[0].condition_id, '02');
    assert.equal(second.rows[0].notes, 'replacement');
    assert.match(second.filename, /^S99_pose1_height1_micro_motion_trial08_/);
});

test('collapsed or detached view continues collecting; reopening redraws all stored samples', async () => {
    const f = fixture(); f.begin();
    const canvas = f.nodes.pressureRunChart;
    canvas.offsetParent = null;
    const initialUpdates = f.charts[0].updates.length;
    for (let sec = 0; sec <= 10; sec++) f.elapsed(sec * 1000, [sec, 100 + sec, 200 + sec]);
    assert.equal(f.charts[0].updates.length, initialUpdates);
    assert.equal(f.nodes.pressureSampleCount.textContent, '11');
    assert.equal(f.module.isRunning(), true);
    canvas.isConnected = false;
    for (let sec = 11; sec <= 30; sec++) f.elapsed(sec * 1000, [sec, 100 + sec, 200 + sec]);
    assert.equal(f.module.getUiState().status, 'completed');
    assert.equal(f.nodes.pressureSampleCount.textContent, '31');
    assert.equal(f.charts[0].updates.length, initialUpdates);
    canvas.isConnected = true; canvas.offsetParent = {}; f.module.refresh();
    assert.equal(f.charts.length, 1);
    assert.equal(f.charts[0].data.datasets[0].data.length, 31);
    assert.equal(f.charts[0].data.datasets[2].data.at(-1).y, 230);
    const exported = await f.exported(); assert.equal(exported.rows.length, 31);
});

test('control warning reflects existing system state without sending or inventing controls', () => {
    const f = fixture(); f.system.autoHeightPossible = true; f.module.refresh();
    assert.match(f.nodes.pressureControlWarning.textContent, /可能改變高度/);
    assert.match(f.nodes.pressureControlWarning.textContent, /不會停止 PRED/);
    f.system.autoHeightPossible = false; f.module.refresh();
    assert.match(f.nodes.pressureControlWarning.textContent, /未回報自動高度調整啟用/);
    assert.match(f.nodes.pressureGapPolicy.textContent, /3\.0 秒/);
    assert.match(f.nodes.pressureGapPolicy.textContent, /仍需實機驗證/);
});

test('real Hub initializes the real pressure controller and recorder with the app system getter', async () => {
    let f;
    assert.doesNotThrow(() => { f = fixture(true); }, 'Hub options must reach the real controller during its first refresh');
    assert.ok(f.systemStateReads() > 0, 'the caller system getter is invoked during initialization');
    assert.equal(f.nodes.experimentTitle.textContent, f.actualConfig.title);
    assert.equal(f.actualConfig.experimentId, '01');
    assert.equal(f.nodes.experimentSelect.children.length, 9);
    assert.equal(f.nodes.experimentView.children[0], f.pressureRoot, 'the actual pressure template view is mounted');
    assert.equal(f.nodes.pressureBleStatus.textContent, '已連線');
    assert.equal(f.nodes.experimentStart.textContent, '開始記錄');
    assert.equal(f.nodes.experimentFinish.textContent, '提前結束');
    assert.equal(f.nodes.experimentExport.hidden, false);
    assert.equal(f.nodes.experimentStart.disabled, true);
    assert.equal(f.nodes.experimentFinish.disabled, true);
    assert.equal(f.nodes.experimentExport.disabled, true);
    f.fill('04'); f.prime(); f.setStartClock();
    assert.equal(f.nodes.experimentStart.disabled, false);
    f.nodes.experimentStart.dispatch('click');
    assert.equal(f.module.getUiState().status, 'recording');
    assert.equal(f.nodes.pressureRunSettings.disabled, true);
    assert.equal(f.nodes.experimentSelect.disabled, true);
    assert.equal(f.nodes.experimentFinish.disabled, false);
    f.elapsed(500, [101.25, 202.5, 303.75]);
    assert.equal(f.nodes.pressureSampleCount.textContent, '1');
    f.nodes.experimentFinish.dispatch('click');
    assert.equal(f.module.getUiState().status, 'ended_early');
    assert.equal(f.nodes.experimentFinish.disabled, true);
    assert.equal(f.nodes.experimentExport.disabled, false);
    f.nodes.experimentExport.dispatch('click');
    assert.equal(f.downloads.length, 2, 'the shared export button downloads CSV and PNG');
    const downloaded = f.downloads.find(item => item.filename.endsWith('.csv'));
    const parsed = parseCsv(await downloaded.blob.text());
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].actual_pose, 'pose5');
    assert.equal(parsed.rows[0].height_condition, 'height5');
    assert.equal(parsed.rows[0].test_condition, 'movement');
    assert.equal(parsed.rows[0].data_timeout_s, '3');
    assert.equal(parsed.rows[0].monitor_adc, '101.25');
    assert.match(downloaded.filename, /^S01_pose5_height5_movement_trial02_/);
    f.system.autoHeightPossible = true; f.heartbeat();
    assert.match(f.nodes.pressureControlWarning.textContent, /可能改變高度/);
});

// The canvas double serializes draw operations, not PNG pixels; this inspects the
// production export composition and chart snapshot while remaining a non-render test.
function decodedCanvas(download) {
    assert.match(download.href, /^data:image\/png;base64,/);
    return JSON.parse(Buffer.from(download.href.split(',')[1], 'base64').toString('utf8'));
}

test('CSV and PNG share a run stem and immutable snapshot; visible PNG header excludes run UUID', async () => {
    const f = fixture(); f.begin('02'); f.elapsed(250, [12.5, 23.5, 34.5]); f.module.endEarly();
    f.nodes.pressureSubject.value = 'S99'; f.nodes.pressureTrial.value = '9';
    f.nodes.pressureHeadHeight.value = '15'; f.nodes.pressureNeckHeight.value = '14';
    const result = await f.exported();
    assert.equal(result.filename.replace(/\.csv$/, ''), result.png.filename.replace(/\.png$/, ''));
    assert.match(result.filename, /synthetic-run-1\.csv$/);
    assert.equal(result.rows[0].subject_id, 'S01'); assert.equal(result.rows[0].head_height_cm, '9.5');
    const image = decodedCanvas(result.png);
    const header = image.calls.filter(call => call.kind === 'fillText').map(call => call.text).join('');
    assert.match(header, /固定睡姿下自然呼吸與微動之辨識穩健性測試/);
    assert.match(header, /S01｜trial 2｜條件 02/);
    assert.match(header, /synthetic_pose1／synthetic_height1／micro_motion/);
    assert.match(header, /Head 9\.5 cm｜Neck 11 cm｜1 筆/);
    assert.doesNotMatch(header, /synthetic-run|S99|Head 15/);
    const background = image.calls.find(call => call.kind === 'fillRect');
    assert.equal(background.fillStyle, '#ffffff');
    assert.deepEqual(background.args, [0, 0, image.width, image.height]);
    const drawing = image.calls.find(call => call.kind === 'drawImage');
    assert.equal(drawing.sourceId, 'pressureRunChart'); assert.ok(drawing.y > 0);
    assert.ok(image.height > f.nodes.pressureRunChart.height);
    assert.equal(drawing.data.datasets[0].data[0].y, 12.5);
    assert.equal(drawing.data.datasets[1].data[0].y, 23.5);
    assert.equal(drawing.data.datasets[2].data[0].y, 34.5);
    assert.match(drawing.title, /條件 02｜S01／trial 2/);
});

test('condition change starts with an empty view and switching back restores its unexported run and chart', () => {
    const f = fixture(); f.begin('01'); f.elapsed(500, [11, 22, 33]); f.module.endEarly();
    const originalGraph = JSON.stringify(f.charts[0].data.datasets);
    f.changeCondition('02', 'input');
    assert.equal(f.nodes.pressureCondition.value, '02');
    assert.equal(f.module.getUiState().status, 'idle');
    assert.equal(f.nodes.pressureSampleCount.textContent, '0');
    assert.equal(f.nodes.pressureElapsed.textContent, '0.0 / 30.0');
    assert.ok(f.charts[0].data.datasets.every(dataset => dataset.data.length === 0));
    assert.match(f.charts[0].options.plugins.title.text, /條件 02/);
    assert.match(f.nodes.pressureRunSummary.textContent, /條件 02 尚無/);
    assert.match(f.module.getUiState().hint, /條件 01 尚有未匯出的結果/);
    assert.equal(f.module.getUiState().exportDisabled, true);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, false, 'a different empty bank may start without discarding bank 01');
    f.changeCondition('01');
    assert.equal(f.module.getUiState().status, 'ended_early');
    assert.equal(f.nodes.pressureSampleCount.textContent, '1');
    assert.equal(JSON.stringify(f.charts[0].data.datasets), originalGraph);
    assert.match(f.charts[0].options.plugins.title.text, /條件 01/);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true, 'the original bank still requires export');
    assert.equal(f.module.getUiState().exportDisabled, false);
});

test('all four banks preserve independently exportable CSV/PNG metadata and correct curve pairs', async () => {
    const f = fixture(true); const ids = [];
    for (const [index, condition] of f.actualConfig.conditions.entries()) {
        f.begin(condition.id, `synthetic bank ${condition.id}`);
        f.elapsed(200, [index * 100 + 1, index * 100 + 2, index * 100 + 3]); f.module.endEarly();
    }
    for (const [index, condition] of f.actualConfig.conditions.entries()) {
        f.changeCondition(condition.id);
        assert.equal(f.module.getUiState().status, 'ended_early');
        assert.equal(f.nodes.pressureSampleCount.textContent, '1');
        const result = await f.exported();
        const row = result.rows[0]; ids.push(row.run_id);
        assert.equal(row.condition_id, condition.id); assert.equal(row.actual_pose, condition.actual_pose);
        assert.equal(row.height_condition, condition.height_condition); assert.equal(row.test_condition, condition.test_condition);
        assert.equal(row.notes, `synthetic bank ${condition.id}`);
        assert.equal(row.monitor_adc, String(index * 100 + 1));
        assert.equal(result.filename.replace(/\.csv$/, ''), result.png.filename.replace(/\.png$/, ''));
        assert.ok(result.filename.startsWith(`S01_${condition.filePose}_${condition.fileHeight}_${condition.test_condition}_trial02_`));
        const drawing = decodedCanvas(result.png).calls.find(call => call.kind === 'drawImage');
        assert.match(drawing.title, new RegExp(`條件 ${condition.id}｜`));
        assert.equal(drawing.data.datasets[0].data[0].y, index * 100 + 1);
        assert.equal(drawing.data.datasets[2].data[0].y, index * 100 + 3);
    }
    assert.equal(new Set(ids).size, 4);
    assert.equal(f.module.needsLeaveProtection(), false);
    assert.equal(f.beforeUnload().prevented, false);
});

test('unexported results in any nonselected bank still prevent unload while the selected bank is blank', async () => {
    const f = fixture(true); f.begin('01'); f.elapsed(250, [101, 202, 303]); f.module.endEarly();
    f.changeCondition('02');
    assert.equal(f.module.getUiState().status, 'idle');
    assert.equal(f.nodes.pressureSampleCount.textContent, '0');
    assert.equal(f.nodes.experimentExport.disabled, true);
    assert.equal(f.module.needsLeaveProtection(), true);
    assert.equal(f.beforeUnload().prevented, true);
    f.module.exportCsv(); assert.equal(f.downloads.length, 0, 'an empty selected bank cannot export another bank');
    f.changeCondition('01'); await f.exported(); f.changeCondition('02');
    assert.equal(f.module.needsLeaveProtection(), false);
    assert.equal(f.beforeUnload().prevented, false);
});

test('synthetic condition input/change during recording is rejected without redirecting received samples', async () => {
    const f = fixture(); f.begin('01'); f.elapsed(100, [1, 2, 3]);
    f.changeCondition('02', 'input'); assert.equal(f.nodes.pressureCondition.value, '01');
    f.changeCondition('04', 'change'); assert.equal(f.nodes.pressureCondition.value, '01');
    assert.equal(f.module.getUiState().status, 'recording');
    assert.equal(f.nodes.pressureRunSettings.disabled, true);
    f.elapsed(1100, [4, 5, 6]); f.module.endEarly();
    const result = await f.exported();
    assert.equal(result.rows.length, 2);
    assert.ok(result.rows.every(row => row.condition_id === '01'));
    f.changeCondition('02'); assert.equal(f.nodes.pressureSampleCount.textContent, '0');
    assert.equal(f.module.getUiState().status, 'idle');
});

test('PNG encoding failure or a hidden chart downloads nothing and never acknowledges the run', async () => {
    for (const reason of ['encoding', 'hidden']) {
        const f = fixture(true); f.begin('01'); f.elapsed(500, [5, 6, 7]); f.module.endEarly();
        if (reason === 'encoding') f.setPngFailure(true);
        else f.nodes.pressureRunChart.offsetParent = null;
        f.module.exportCsv();
        assert.equal(f.downloads.length, 0);
        assert.match(f.module.getUiState().hint, /匯出失敗/);
        assert.equal(f.module.needsLeaveProtection(), true);
        assert.equal(f.beforeUnload().prevented, true);
        f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
        assert.equal(f.module.getUiState().startDisabled, true, 'failed preparation must not unlock overwriting');
        assert.equal(f.nodes.pressureSampleCount.textContent, '1');
        f.setPngFailure(false); f.nodes.pressureRunChart.offsetParent = {};
        const result = await f.exported();
        assert.equal(result.rows.length, 1);
        assert.equal(f.downloads.length, 2);
        assert.equal(f.module.needsLeaveProtection(), false);
    }
});
