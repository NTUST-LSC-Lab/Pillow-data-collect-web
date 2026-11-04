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
    const userProfile = { age_years: null, body_height_cm: null, body_weight_kg: null };
    const getUserProfile = () => ({ ...userProfile });
    const suggestedPose5 = { profileKey: 'synthetic-profile', head: null, neck: null,
        reason: '請先在上方設定使用者資料，再準備微調。' };
    const getPose5Suggestion = () => ({ ...suggestedPose5 });
    const heightState = { prepared: false, ready: false, busy: false, reason: '尚未準備',
        head: null, neck: null, targetHead: null, targetNeck: null, receivedMonotonicMs: null };
    const heightCalls = [];
    const heightControl = {
        async prepare() {
            heightCalls.push({ action: 'prepare' });
            Object.assign(heightState, { prepared: true, ready: true, busy: false, reason: '',
                head: 7, neck: 10, targetHead: 7, targetNeck: 10, receivedMonotonicMs: clock });
        },
        async adjust(channel, height) {
            heightCalls.push({ action: 'adjust', channel, height });
            const key = String(channel).toUpperCase() === 'HEAD' ? 'head' : 'neck';
            Object.assign(heightState, { [key]: height, [key === 'head' ? 'targetHead' : 'targetNeck']: height,
                ready: true, busy: false, reason: '', receivedMonotonicMs: clock });
        },
        getState: () => ({ ...heightState }),
        tick() {}
    };
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
        checkValidity() {
            if (this.disabled) return true;
            if ('required' in this.attrs && (this.attrs.type === 'checkbox' ? !this.checked : !this.value)) return false;
            if (this.attrs.pattern && this.value && !new RegExp(`^(?:${this.attrs.pattern})$`).test(this.value)) return false;
            if (this.attrs.type === 'number' && this.value) {
                const value = Number(this.value), min = Number(this.attrs.min || 0), step = Number(this.attrs.step || 1);
                if (!Number.isFinite(value) || value < min || (this.attrs.max && value > Number(this.attrs.max))) return false;
                if (Math.abs((value - min) / step - Math.round((value - min) / step)) > 1e-8) return false;
            }
            return true;
        }
        reportValidity() { return this.checkValidity(); }
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
    if (nodes.pressureCalibrationPose) nodes.pressureCalibrationPose.value = 'pose1';
    // A deliberately small validity model using the actual template constraints.
    // This is not a substitute for native HTML constraint-validation/render tests.
    nodes.pressureRunForm.checkValidity = () => {
        if (nodes.pressureRunSettings.disabled) return true;
        const subject = nodes.pressureSubject;
        if (!new RegExp(`^(?:${subject.attrs.pattern})$`).test(subject.value)) return false;
        for (const id of ['pressureHeadHeight', 'pressureNeckHeight']) {
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
            pressureConfig: actualConfig, getSystemState, getUserProfile, getPose5Suggestion, heightControl
        });
        hub.init();
    } else {
        module = context.createPressureCollectionExperiment(pressureRoot, {
            gapTimeoutMs: 3000, conditions: conditions.map(item => ({ ...item })),
            getSystemState, getUserProfile, getPose5Suggestion, heightControl, onChange: state => uiChanges.push({ ...state })
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
    function fill(condition = '01') {
        nodes.pressureSubject.value = 'S01';
        changeCondition(condition);
        nodes.pressureHeadHeight.value = '9.5'; nodes.pressureNeckHeight.value = '11';
        module.refresh(); nodes.pressureSetupConfirmed.checked = true;
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
    async function trigger(id, event = 'click') {
        nodes[id].dispatch(event);
        await new Promise(resolve => setImmediate(resolve));
        module.refresh();
    }
    function begin(condition = '01') {
        fill(condition); prime(); startClock = clock; module.start();
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
        module, hub, actualConfig, pressureRoot, nodes, system, userProfile, suggestedPose5, heightState, heightCalls, heightControl,
        trigger, timers, timeouts, charts, downloads, confirms,
        confirmationAnswers, uiChanges, at, heartbeat, receive, fill, prime, begin, elapsed, exported,
        changeCondition, beforeUnload, setPngFailure: value => { pngFailure = value; },
        clock: () => clock, setStartClock: () => { startClock = clock; }, systemStateReads: () => systemStateReads
    };
}

test('template is a single inert view with explicit ADC, posture and operator-height constraints', () => {
    assert.equal((html.match(/id="pressureExperimentTemplate"/g) || []).length, 1);
    assert.equal((template.match(/<form\b/g) || []).length, 1);
    assert.equal((template.match(/<option value="0[1-4]"/g) || []).length, 4);
    assert.doesNotMatch(template, /id="(?:pressureNotes|pressureTrial|pressureCalibrationUse)"/);
    assert.match(template, /pattern="S\\d\{2\}"/);
    assert.match(template, /id="pressureHeadHeight"[^>]*min="7"[^>]*max="16"[^>]*step="0\.5"/);
    assert.match(template, /id="pressureNeckHeight"[^>]*min="10"[^>]*max="14"[^>]*step="0\.5"/);
    assert.match(template, /不下達高度控制指令/);
    assert.match(template, /不包含翻身或切換睡姿/);
    assert.match(template, /不提供即時分類結果/);
    assert.match(template, /原始 ADC/);
    const recordingForm = template.match(/<form id="pressureRunForm">([\s\S]*?)<\/form>/)?.[1];
    assert.ok(recordingForm);
    assert.doesNotMatch(recordingForm, /pressureCalibration(?:Prepare|Capture)/,
        'independent calibration controls must not participate in recording form validation');
    for (const button of template.matchAll(/<button\b([^>]*)>/g)) assert.match(button[1], /type="button"/);
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
            `S01_${condition.filePose}_${condition.fileHeight}_${condition.test_condition}_synthetic-run-1.csv`);
        const row = exported.rows[0];
        assert.equal(row.condition_id, condition.id);
        assert.equal(row.actual_pose, condition.actual_pose);
        assert.equal(row.height_condition, condition.height_condition);
        assert.equal(row.test_condition, condition.test_condition);
        assert.equal(row.subject_id, 'S01'); assert.equal(row.trial_index, '');
        assert.equal(row.notes, ''); assert.equal(exported.header.length, 26);
        for (const key of ['age_years', 'body_height_cm', 'body_weight_kg']) assert.equal(row[key], '', 'missing profile stays blank');
        assert.equal(row.head_height_cm, '9.5'); assert.equal(row.neck_height_cm, '11');
        assert.equal(row.height_source, 'operator'); assert.equal(row.pressure_unit, 'ADC');
        assert.equal(row.data_timeout_s, '3'); assert.equal(row.gap_timeout_ms, '3000');
        const pressureIndex = exported.header.indexOf('monitor_adc');
        assert.deepEqual(exported.header.slice(pressureIndex, pressureIndex + 3), ['monitor_adc', 'neck_adc', 'head_adc']);
    }
});

test('captured metadata remain immutable after form changes; removed UI fields export empty compatibility columns', async () => {
    const f = fixture(); f.begin('02'); f.elapsed(400, [1, 2, 3]); f.module.endEarly();
    f.fill('02'); f.nodes.pressureSubject.value = 'S99';
    f.nodes.pressureHeadHeight.value = '15';
    f.nodes.pressureNeckHeight.value = '14'; f.module.refresh();
    const first = await f.exported();
    assert.equal(first.rows[0].notes, ''); assert.equal(first.rows[0].trial_index, '');
    assert.equal(first.rows[0].subject_id, 'S01'); assert.equal(first.rows[0].condition_id, '02');
    assert.equal(first.rows[0].head_height_cm, '9.5'); assert.equal(first.rows[0].neck_height_cm, '11');
    assert.match(first.filename, /^S01_pose1_height1_micro_motion_/);
    assert.doesNotMatch(first.filename, /_trial/);
    assert.equal(f.timeouts[0].delay, 10000, 'object URL revocation must be deferred');
    const retained = JSON.stringify(f.charts[0].data.datasets);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
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
    assert.equal(second.rows[0].notes, ''); assert.equal(second.rows[0].trial_index, '');
    assert.equal(second.rows[0].head_height_cm, '15'); assert.equal(second.rows[0].neck_height_cm, '14');
    assert.match(second.filename, /^S99_pose1_height1_micro_motion_/);
    assert.doesNotMatch(second.filename, /_trial/);
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

test('control warning reflects existing system state without automatically sending controls', () => {
    const f = fixture(); f.system.autoHeightPossible = true; f.module.refresh();
    assert.match(f.nodes.pressureControlWarning.textContent, /可能改變高度/);
    assert.match(f.nodes.pressureControlWarning.textContent, /準備微調/);
    assert.equal(f.heightCalls.length, 0);
    f.system.autoHeightPossible = false; f.module.refresh();
    assert.match(f.nodes.pressureControlWarning.textContent, /未回報自動高度調整啟用/);
    assert.match(f.nodes.pressureControlWarning.textContent, /此提醒不會阻止開始記錄/);
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
    assert.match(downloaded.filename, /^S01_pose5_height5_movement_/);
    f.system.autoHeightPossible = true; f.heartbeat();
    assert.match(f.nodes.pressureControlWarning.textContent, /可能改變高度/);
});

// The canvas double serializes draw operations, not PNG pixels; this inspects the
// production export composition and chart snapshot while remaining a non-render test.
function decodedCanvas(download) {
    assert.match(download.href, /^data:image\/png;base64,/);
    return JSON.parse(Buffer.from(download.href.split(',')[1], 'base64').toString('utf8'));
}

test('upper-form profile is reflected through the Hub without control commands and changes require run reconfirmation', () => {
    const f = fixture(true); f.fill(); f.prime();
    assert.match(f.nodes.pressureUserProfile.textContent, /未填／無效/);
    Object.assign(f.userProfile, { age_years: 25, body_height_cm: 170.5, body_weight_kg: 65.5 });
    f.heartbeat();
    assert.match(f.nodes.pressureUserProfile.textContent, /上方目前輸入值/);
    assert.match(f.nodes.pressureUserProfile.textContent, /25 歲.*170\.5 cm.*65\.5 kg/);
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.equal(f.module.getUiState().startDisabled, true);
    assert.equal(f.heightCalls.length, 0);
    assert.equal(f.nodes.pressureHeadHeight.value, '9.5');
    assert.equal(f.nodes.pressureNeckHeight.value, '11');
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, false);
});

test('run CSV, PNG and result summary preserve start-time profile while later conditions use new values', async () => {
    const f = fixture(true);
    Object.assign(f.userProfile, { age_years: 25, body_height_cm: 170.5, body_weight_kg: 65.5 });
    f.begin('01'); f.elapsed(100, [1, 2, 3]);
    Object.assign(f.userProfile, { age_years: 99, body_height_cm: 180.5, body_weight_kg: 75.5 });
    f.heartbeat();
    assert.match(f.nodes.pressureUserProfile.textContent, /本輪開始時資料.*25 歲.*170\.5 cm.*65\.5 kg/);
    assert.doesNotMatch(f.nodes.pressureRunSummary.textContent, /99 歲/);
    f.module.endEarly();
    const first = await f.exported();
    assert.deepEqual(first.header.slice(-3), ['age_years', 'body_height_cm', 'body_weight_kg']);
    assert.equal(first.rows[0].age_years, '25');
    assert.equal(first.rows[0].body_height_cm, '170.5');
    assert.equal(first.rows[0].body_weight_kg, '65.5');
    const pngText = decodedCanvas(first.png).calls.filter(call => call.kind === 'fillText').map(call => call.text).join('');
    assert.match(pngText, /25 歲.*170\.5 cm.*65\.5 kg/);
    assert.doesNotMatch(pngText, /99 歲/);
    f.begin('02'); f.elapsed(100, [4, 5, 6]); f.module.endEarly();
    const second = await f.exported();
    assert.equal(second.rows[0].age_years, '99');
    assert.equal(second.rows[0].body_height_cm, '180.5');
    assert.equal(second.rows[0].body_weight_kg, '75.5');
    f.changeCondition('01');
    assert.match(f.nodes.pressureRunSummary.textContent, /25 歲.*170\.5 cm.*65\.5 kg/);
    assert.equal((await f.exported()).rows[0].age_years, '25');
});

test('saved calibration captures profile values independently from later upper-form edits', async () => {
    const f = fixture();
    Object.assign(f.userProfile, { age_years: 25, body_height_cm: 170.5, body_weight_kg: 65.5 });
    await readyCalibration(f);
    await f.trigger('pressureCalibrationCapture');
    const saved = f.nodes.pressureCalibrationPose1Saved.textContent;
    assert.match(saved, /25 歲.*170\.5 cm.*65\.5 kg/);
    f.userProfile.age_years = 99; f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationPose1Saved.textContent, saved);
});

test('CSV and PNG share a run stem and immutable snapshot; visible PNG header excludes run UUID', async () => {
    const f = fixture(); f.begin('02'); f.elapsed(250, [12.5, 23.5, 34.5]); f.module.endEarly();
    f.nodes.pressureSubject.value = 'S99';
    f.nodes.pressureHeadHeight.value = '15'; f.nodes.pressureNeckHeight.value = '14';
    const result = await f.exported();
    assert.equal(result.filename.replace(/\.csv$/, ''), result.png.filename.replace(/\.png$/, ''));
    assert.match(result.filename, /synthetic-run-1\.csv$/);
    assert.equal(result.rows[0].subject_id, 'S01'); assert.equal(result.rows[0].head_height_cm, '9.5');
    const image = decodedCanvas(result.png);
    const header = image.calls.filter(call => call.kind === 'fillText').map(call => call.text).join('');
    assert.match(header, /固定睡姿下自然呼吸與微動之辨識穩健性測試/);
    assert.match(header, /S01｜條件 02/);
    assert.doesNotMatch(header, /trial/i);
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
    assert.match(drawing.title, /條件 02｜S01/);
    assert.doesNotMatch(drawing.title, /trial/i);
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
        f.begin(condition.id);
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
        assert.equal(row.notes, ''); assert.equal(row.trial_index, '');
        assert.equal(row.monitor_adc, String(index * 100 + 1));
        assert.equal(result.filename.replace(/\.csv$/, ''), result.png.filename.replace(/\.png$/, ''));
        assert.ok(result.filename.startsWith(`S01_${condition.filePose}_${condition.fileHeight}_${condition.test_condition}_`));
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

async function readyCalibration(f, pose = 'pose1', pressure = [101, 202, 303]) {
    f.fill();
    f.nodes.pressureCalibrationPose.value = pose;
    await f.trigger('pressureCalibrationPose', 'change');
    await f.trigger('pressureCalibrationPrepare');
    f.prime();
    f.at(f.clock() + 100); f.receive(pressure);
    f.nodes.pressureCalibrationStable.checked = true;
    await f.trigger('pressureCalibrationStable', 'change');
}

test('independent calibration preparation delegates once and never starts a recording', async () => {
    const f = fixture(true); f.fill();
    await f.trigger('pressureCalibrationPrepare');
    assert.deepEqual(f.heightCalls, [{ action: 'prepare' }]);
    assert.equal(f.module.getUiState().status, 'idle');
    assert.equal(f.nodes.pressureSampleCount.textContent, '0');
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.equal(f.downloads.length, 0);
});

test('pose5 waits for a matching device recommendation and never substitutes 13 cm or current heights', async () => {
    const f = fixture(); f.fill();
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    assert.equal(f.nodes.pressureCalibrationHead.value, '');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '');
    assert.match(f.nodes.pressureCalibrationStatus.textContent, /上方設定/);
    assert.equal(f.heightCalls.length, 0, 'selecting a posture does not operate the device');
    assert.equal(f.nodes.pressureCalibrationBothApply.disabled, true, 'missing suggestions cannot bypass preparation');
    await f.trigger('pressureCalibrationPrepare');
    assert.deepEqual(f.heightCalls, [{ action: 'prepare' }]);
    assert.equal(f.heightState.head, 7, 'target default does not become an actual device height');
    assert.equal(f.heightState.neck, 10);
    assert.equal(f.nodes.pressureCalibrationHead.value, '');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '');
    Object.assign(f.suggestedPose5, { head: 11.5, neck: 12.5, reason: '' });
    f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationHead.value, '11.5');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '12.5');
    assert.deepEqual(f.heightCalls, [{ action: 'prepare' }], 'receiving a suggestion only fills drafts');
    f.prime(); f.nodes.pressureCalibrationStable.checked = true; f.module.refresh();
    assert.equal(f.nodes.pressureCalibrationCapture.disabled, true, 'unapplied defaults cannot be saved as arrived');
    await f.trigger('pressureCalibrationBothApply');
    assert.deepEqual(f.heightCalls.slice(1), [
        { action: 'adjust', channel: 'HEAD', height: 11.5 }, { action: 'adjust', channel: 'NECK', height: 12.5 }
    ]);
    assert.equal(f.nodes.pressureHeadHeight.value, '9.5', 'run metadata remains operator-entered');
});

test('pose5 manual drafts survive preparation but new subject or profile replaces old recommendations', async () => {
    const f = fixture(); await readyCalibration(f);
    Object.assign(f.suggestedPose5, { head: 11.5, neck: 12.5, reason: '' });
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    f.nodes.pressureCalibrationHead.value = '12.5';
    await f.trigger('pressureCalibrationHead', 'input');
    f.nodes.pressureCalibrationNeck.value = '13.5';
    await f.trigger('pressureCalibrationNeck', 'input');
    const callsBeforeSwitch = f.heightCalls.length;
    f.nodes.pressureCalibrationPose.value = 'pose1';
    await f.trigger('pressureCalibrationPose', 'change');
    assert.equal(f.nodes.pressureCalibrationHead.value, '7');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '10');
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    assert.equal(f.heightCalls.length, callsBeforeSwitch);
    await f.trigger('pressureCalibrationPrepare');
    assert.equal(f.nodes.pressureCalibrationHead.value, '12.5');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '13.5');
    f.nodes.pressureSubject.value = 'S02';
    await f.trigger('pressureSubject', 'input');
    assert.equal(f.nodes.pressureCalibrationHead.value, '11.5');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '12.5');
    Object.assign(f.suggestedPose5, { profileKey: 'new-age-weight-or-gender', head: null, neck: null });
    f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationHead.value, '');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '');
    Object.assign(f.suggestedPose5, { head: 12, neck: 14 });
    f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationHead.value, '12');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '14');
    assert.equal(f.heightCalls.length, callsBeforeSwitch + 1, 'new recommendations do not send height commands');
});

test('pose5 suggestion refresh never overwrites manual drafts for the same profile', async () => {
    const f = fixture(); await readyCalibration(f);
    Object.assign(f.suggestedPose5, { head: 11, neck: 12 });
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    f.nodes.pressureCalibrationHead.value = '11.5';
    await f.trigger('pressureCalibrationHead', 'input');
    Object.assign(f.suggestedPose5, { head: null, neck: null, reason: '等待新回報' });
    f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationHead.value, '11.5');
    Object.assign(f.suggestedPose5, { head: 11, neck: 12 });
    await f.trigger('pressureCalibrationPrepare');
    assert.equal(f.nodes.pressureCalibrationHead.value, '11.5');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '12');
    assert.equal(f.heightCalls.some(call => call.action === 'adjust'), false);
});

test('known device profile mismatch clears pose5 drafts even when the upper form has not changed', async () => {
    const f = fixture(); await readyCalibration(f);
    Object.assign(f.suggestedPose5, { head: 11.5, neck: 12.5 });
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    f.nodes.pressureCalibrationHead.value = '12';
    await f.trigger('pressureCalibrationHead', 'input');
    Object.assign(f.suggestedPose5, { head: null, neck: null, deviceProfileMismatch: true,
        reason: '裝置資料不符，請重新設定' });
    f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationHead.value, '');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '');
    assert.equal(f.nodes.pressureCalibrationBothApply.disabled, true);
    assert.match(f.nodes.pressureCalibrationStatus.textContent, /裝置資料不符/);
    await f.trigger('pressureCalibrationBothApply');
    assert.equal(f.heightCalls.some(call => call.action === 'adjust'), false);
    f.nodes.pressureCalibrationPose.value = 'pose1';
    await f.trigger('pressureCalibrationPose', 'change');
    f.nodes.pressureSetupConfirmed.checked = true;
    f.nodes.pressureCalibrationStable.checked = true;
    f.heartbeat();
    assert.equal(f.nodes.pressureSetupConfirmed.checked, true, 'persistent pose5 mismatch must not keep clearing pose1 confirmation');
    assert.equal(f.nodes.pressureCalibrationStable.checked, true);
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    Object.assign(f.suggestedPose5, { head: 11.5, neck: 12.5, deviceProfileMismatch: false });
    f.heartbeat();
    assert.equal(f.nodes.pressureCalibrationHead.value, '11.5');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '12.5');
});

test('calibration snapshot requires subject, current pressure after height feedback, stable confirmation and ready control', async () => {
    const f = fixture();
    await readyCalibration(f);
    assert.equal(f.nodes.pressureCalibrationCapture.disabled, false);
    for (const change of [
        () => { f.nodes.pressureSubject.value = 's01'; },
        () => { f.heightState.ready = false; },
        () => { f.heightState.busy = true; },
        () => { f.nodes.pressureCalibrationStable.checked = false; },
        () => { f.heightState.receivedMonotonicMs = f.clock() + 1; },
        () => { f.nodes.pressureCalibrationHead.value = '9'; }
    ]) {
        f.nodes.pressureSubject.value = 'S01'; f.heightState.ready = true; f.heightState.busy = false;
        f.nodes.pressureCalibrationStable.checked = true; f.heightState.receivedMonotonicMs = 0;
        f.nodes.pressureCalibrationHead.value = '7'; f.nodes.pressureCalibrationNeck.value = '10';
        change(); f.module.refresh();
        assert.equal(f.nodes.pressureCalibrationCapture.disabled, true);
    }
    f.heightState.receivedMonotonicMs = 0; f.nodes.pressureCalibrationStable.checked = true;
    f.at(f.clock() + 3000); f.module.refresh();
    assert.equal(f.nodes.pressureCalibrationCapture.disabled, true, 'stale ADC cannot become calibration');
});

test('two poses retain independent immutable pressure snapshots and changed subject cannot reuse them', async () => {
    const f = fixture(true);
    await readyCalibration(f, 'pose1', [111, 222, 333]);
    await f.trigger('pressureCalibrationCapture');
    const first = f.nodes.pressureCalibrationPose1Saved.textContent;
    assert.match(first, /S01/); assert.match(first, /111/); assert.match(first, /222/); assert.match(first, /333/);
    f.nodes.pressureCalibrationPose.value = 'pose5';
    await f.trigger('pressureCalibrationPose', 'change');
    f.nodes.pressureCalibrationHead.value = '12';
    await f.trigger('pressureCalibrationHead', 'input');
    await f.trigger('pressureCalibrationHeadApply');
    f.nodes.pressureCalibrationNeck.value = '13';
    await f.trigger('pressureCalibrationNeck', 'input');
    await f.trigger('pressureCalibrationNeckApply');
    f.at(f.clock() + 100); f.receive([444, 555, 666]);
    f.nodes.pressureCalibrationStable.checked = true;
    await f.trigger('pressureCalibrationStable', 'change');
    await f.trigger('pressureCalibrationCapture');
    const second = f.nodes.pressureCalibrationPose5Saved.textContent;
    assert.match(second, /444/); assert.match(second, /555/); assert.match(second, /666/);
    assert.equal(f.nodes.pressureCalibrationPose1Saved.textContent, first);
    f.at(f.clock() + 100); f.receive([777, 888, 999]); f.module.refresh();
    assert.equal(f.nodes.pressureCalibrationPose5Saved.textContent, second, 'saved capture must not follow live pressure');
    f.nodes.pressureSubject.value = 'S02';
    f.nodes.pressureSubject.dispatch('input');
    assert.doesNotMatch(f.nodes.pressureCalibrationPose1Saved.textContent, /111/);
    assert.doesNotMatch(f.nodes.pressureCalibrationPose5Saved.textContent, /444/);
});

test('capturing never fills run heights; manually entered heights must match the ready device before recording', async () => {
    const f = fixture();
    await readyCalibration(f);
    f.nodes.pressureCalibrationHead.value = '8.5';
    await f.trigger('pressureCalibrationHead', 'input');
    await f.trigger('pressureCalibrationHeadApply');
    f.nodes.pressureCalibrationNeck.value = '11.5';
    await f.trigger('pressureCalibrationNeck', 'input');
    await f.trigger('pressureCalibrationNeckApply');
    f.at(f.clock() + 100); f.receive();
    f.nodes.pressureCalibrationStable.checked = true;
    await f.trigger('pressureCalibrationStable', 'change');
    await f.trigger('pressureCalibrationCapture');
    assert.equal(f.nodes.pressureHeadHeight.value, '9.5', 'calibration must not automatically fill run Head height');
    assert.equal(f.nodes.pressureNeckHeight.value, '11', 'calibration must not automatically fill run Neck height');
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true, 'a confirmed but mismatched run must remain blocked');
    const callsBefore = f.heightCalls.length;
    f.nodes.pressureHeadHeight.value = '8.5';
    f.nodes.pressureRunForm.dispatch('input', f.nodes.pressureHeadHeight);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true, 'matching one channel is insufficient');
    f.nodes.pressureNeckHeight.value = '11.5';
    f.nodes.pressureRunForm.dispatch('input', f.nodes.pressureNeckHeight);
    assert.equal(f.heightCalls.length, callsBefore);
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, false);
    f.heightState.ready = false; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true, 'manual run heights must not bypass lost height readiness');
    f.heightState.ready = true; f.heightState.busy = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
});

test('mismatched run heights explain the entered and arrived values before confirmation permits recording', async () => {
    const f = fixture(); await readyCalibration(f);
    Object.assign(f.heightState, { head: 9, neck: 11, targetHead: 9, targetNeck: 11 });
    f.nodes.pressureHeadHeight.value = '8'; f.nodes.pressureNeckHeight.value = '11';
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
    assert.match(f.module.getUiState().hint, /Head/);
    assert.match(f.module.getUiState().hint, /8\.0/);
    assert.match(f.module.getUiState().hint, /9\.0/);
    assert.equal(f.nodes.pressureHeadHeight.value, '8', 'diagnosis must not silently change operator metadata');
    assert.equal(f.heightCalls.some(call => call.action === 'adjust'), false);
    f.nodes.pressureHeadHeight.value = '9';
    f.nodes.pressureRunForm.dispatch('input', f.nodes.pressureHeadHeight);
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.equal(f.module.getUiState().startDisabled, true, 'corrected metadata still requires confirmation');
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, false);
    f.setStartClock(); f.module.start();
    assert.equal(f.module.getUiState().status, 'recording');
    f.elapsed(100, [11, 22, 33]); f.module.endEarly();
    const exported = await f.exported();
    assert.equal(exported.rows[0].head_height_cm, '9');
    assert.equal(exported.rows[0].neck_height_cm, '11');
    assert.equal(f.heightCalls.some(call => call.action === 'adjust'), false, 'fixing run metadata must not move the device');
});

test('run readiness explains a missing run height and propagates unavailable height feedback', async () => {
    const f = fixture(); await readyCalibration(f);
    Object.assign(f.heightState, { head: 9, neck: 11, targetHead: 9, targetNeck: 11 });
    f.nodes.pressureHeadHeight.value = ''; f.nodes.pressureNeckHeight.value = '11';
    f.nodes.pressureSetupConfirmed.checked = true; f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
    assert.match(f.module.getUiState().hint, /Head/);
    assert.match(f.module.getUiState().hint, /未填/);
    f.nodes.pressureHeadHeight.value = '9';
    f.heightState.ready = false; f.heightState.reason = '裝置狀態已過期，等待更新';
    f.module.refresh();
    assert.equal(f.module.getUiState().startDisabled, true);
    assert.match(f.module.getUiState().hint, /裝置狀態已過期，等待更新/);
    assert.equal(f.heightCalls.some(call => call.action === 'adjust'), false);
});

test('calibration height edits cancel confirmations and validated apply delegates the requested channel only', async () => {
    const f = fixture(); await readyCalibration(f);
    f.nodes.pressureSetupConfirmed.checked = true;
    f.nodes.pressureCalibrationHead.value = '9.5';
    await f.trigger('pressureCalibrationHead', 'input');
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.equal(f.nodes.pressureCalibrationStable.checked, false);
    await f.trigger('pressureCalibrationHeadApply');
    const applied = f.heightCalls.at(-1);
    assert.equal(applied.action, 'adjust'); assert.equal(String(applied.channel).toUpperCase(), 'HEAD');
    assert.equal(Number(applied.height), 9.5);
    const count = f.heightCalls.length;
    for (const invalid of ['16.5', '6.5', '9.25', '']) {
        f.nodes.pressureCalibrationHead.value = invalid;
        await f.trigger('pressureCalibrationHead', 'input');
        await f.trigger('pressureCalibrationHeadApply');
        assert.equal(f.heightCalls.length, count, `invalid Head height ${invalid} must not be sent`);
    }
});

test('one combined apply snapshots both values and locks the UI until Head then Neck have settled', async () => {
    const f = fixture(true); await readyCalibration(f);
    f.nodes.pressureCalibrationHead.value = '8';
    f.nodes.pressureCalibrationNeck.value = '11';
    f.nodes.pressureSetupConfirmed.checked = true;
    const requests = [];
    const complete = [];
    const adjust = f.heightControl.adjust;
    f.heightControl.adjust = (channel, height) => {
        requests.push({ channel, height });
        return new Promise(resolve => complete.push(async () => { await adjust(channel, height); resolve(); }));
    };
    await f.trigger('pressureCalibrationBothApply');
    assert.deepEqual(requests, [{ channel: 'HEAD', height: 8 }]);
    assert.equal(f.module.isBusy(), true);
    for (const id of ['pressureCalibrationBothApply', 'pressureCalibrationHeadApply', 'pressureCalibrationNeckApply',
        'pressureCalibrationHead', 'pressureCalibrationNeck', 'pressureCalibrationPose', 'pressureSubject', 'experimentSelect']) {
        assert.equal(f.nodes[id].disabled, true, `${id} remains locked during combined apply`);
    }
    assert.equal(f.nodes.pressureSetupConfirmed.checked, false);
    assert.equal(f.nodes.pressureCalibrationStable.checked, false);
    f.nodes.pressureCalibrationNeck.value = '14'; // Programmatic mutation cannot change the captured request.
    await f.trigger('pressureCalibrationBothApply');
    assert.equal(requests.length, 1, 'a repeated click cannot queue another operation');
    await complete[0](); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, [{ channel: 'HEAD', height: 8 }, { channel: 'NECK', height: 11 }]);
    assert.equal(f.module.isBusy(), true);
    assert.equal(f.nodes.pressureCalibrationBothApply.disabled, true, 'Head completion does not unlock the second step');
    await complete[1](); await new Promise(resolve => setImmediate(resolve)); f.module.refresh();
    assert.equal(f.module.isBusy(), false);
    assert.equal(f.heightState.head, 8); assert.equal(f.heightState.neck, 11);
    assert.equal(f.nodes.pressureCalibrationBothApply.disabled, false);
    assert.equal(f.nodes.pressureHeadHeight.value, '9.5', 'combined apply does not fill run metadata');
});

test('combined apply validates both channel values before sending either adjustment', async () => {
    const f = fixture(); await readyCalibration(f);
    const count = f.heightCalls.length;
    for (const [head, neck] of [['', '11'], ['8', ''], ['16.5', '11'], ['8', '14.5'], ['8', '10.25']]) {
        f.nodes.pressureCalibrationHead.value = head; f.nodes.pressureCalibrationNeck.value = neck;
        f.module.refresh();
        assert.equal(f.nodes.pressureCalibrationBothApply.disabled, true);
        await f.trigger('pressureCalibrationBothApply');
        assert.equal(f.heightCalls.length, count, `neither channel moves for Head=${head}, Neck=${neck}`);
    }
    f.nodes.pressureCalibrationHead.value = '8'; f.nodes.pressureCalibrationNeck.value = '11';
    f.heightState.ready = false; f.module.refresh();
    await f.trigger('pressureCalibrationBothApply');
    assert.equal(f.heightCalls.length, count, 'valid inputs cannot bypass device readiness');
});

test('failed Head adjustment stops combined apply without sending Neck', async () => {
    const f = fixture(); await readyCalibration(f);
    f.nodes.pressureCalibrationHead.value = '8'; f.nodes.pressureCalibrationNeck.value = '11';
    const requests = [];
    f.heightControl.adjust = async (channel, height) => {
        requests.push({ channel, height });
        f.heightState.ready = false;
        throw new Error('Synthetic Head acknowledgement timeout');
    };
    await f.trigger('pressureCalibrationBothApply');
    assert.deepEqual(requests, [{ channel: 'HEAD', height: 8 }]);
    assert.equal(f.module.isBusy(), false);
    assert.equal(f.nodes.pressureCalibrationBothApply.disabled, true);
    assert.match(f.nodes.pressureCalibrationStatus.textContent, /Synthetic Head acknowledgement timeout/);
});

test('recording and height operation locks prevent new calibration or Hub navigation', async () => {
    const f = fixture(true); f.begin();
    f.heightState.ready = true;
    f.nodes.pressureCalibrationHead.value = '8'; f.nodes.pressureCalibrationNeck.value = '11';
    f.module.refresh();
    for (const id of ['pressureCalibrationPrepare', 'pressureCalibrationHeadApply',
        'pressureCalibrationNeckApply', 'pressureCalibrationBothApply', 'pressureCalibrationCapture']) {
        assert.equal(f.nodes[id].disabled, true, `${id} must be locked while recording`);
    }
    await f.trigger('pressureCalibrationBothApply');
    assert.equal(f.heightCalls.length, 0, 'combined apply cannot run during recording');
    f.module.endEarly();
    f.heightState.busy = true; f.module.refresh();
    assert.equal(f.nodes.experimentSelect.disabled, true);
    assert.equal(f.nodes.experimentNext.disabled, true);
    f.nodes.experimentSelect.value = '02'; f.nodes.experimentSelect.dispatch('change');
    assert.equal(f.nodes.experimentSelect.value, '01');
    f.heightState.busy = false; f.module.refresh();
    assert.equal(f.nodes.experimentSelect.disabled, false);
});

test('applying one channel preserves the other channel draft until explicitly applied', async () => {
    const f = fixture(); await readyCalibration(f);
    f.nodes.pressureCalibrationNeck.value = '13';
    await f.trigger('pressureCalibrationNeck', 'input');
    f.nodes.pressureCalibrationHead.value = '9.5';
    await f.trigger('pressureCalibrationHead', 'input');
    await f.trigger('pressureCalibrationHeadApply');
    assert.equal(f.nodes.pressureCalibrationNeck.value, '13');
    assert.notEqual(f.heightState.neck, 13, 'editing the other draft must not move that channel');
    f.nodes.pressureCalibrationStable.checked = true; f.module.refresh();
    assert.equal(f.nodes.pressureCalibrationCapture.disabled, true, 'both channel drafts must be applied before capture');
});

test('replacing a saved calibration requires confirmation and switching subjects preserves each record', async () => {
    const f = fixture(); await readyCalibration(f, 'pose1', [111, 222, 333]);
    await f.trigger('pressureCalibrationCapture');
    const original = f.nodes.pressureCalibrationPose1Saved.textContent;
    f.at(f.clock() + 100); f.receive([444, 555, 666]);
    f.confirmationAnswers.push(false);
    await f.trigger('pressureCalibrationCapture');
    assert.equal(f.nodes.pressureCalibrationPose1Saved.textContent, original);
    f.nodes.pressureSubject.value = 'S02'; f.module.refresh();
    assert.doesNotMatch(f.nodes.pressureCalibrationPose1Saved.textContent, /111/);
    f.nodes.pressureSubject.value = 'S01'; f.module.refresh();
    assert.equal(f.nodes.pressureCalibrationPose1Saved.textContent, original);
});
