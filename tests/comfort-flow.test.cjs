// Synthetic controller/DOM/transport fixture. Exercises production controller and
// SVG serialization, but is not a browser render or a BLE/hardware validation.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { comfortFillTime } = require('../spp3_BLE/comfort-experiment.js');
const read = name => fs.readFileSync(path.join(__dirname, '../spp3_BLE', name), 'utf8');

function fixture() {
    let clock = 1, connected = true, writeFails = false;
    const commands = [], files = new Map(), nodes = {}, groups = {};
    class Element {
        constructor(tag = 'div') {
            this.tag = tag; this.attrs = {}; this.dataset = {}; this.children = []; this.handlers = {};
            this.value = ''; this.checked = false; this.disabled = false; this.open = false; this.hidden = false;
            this.isConnected = true; this.textContent = '';
        }
        get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
        addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
        dispatch(type) { return Promise.all((this.handlers[type] || []).map(fn => fn({ preventDefault() {} }))); }
        click() { return this.dispatch('click'); }
        append(...items) { this.children.push(...items); }
        add(option) { this.append(option); }
        replaceChildren(...items) { this.children = items; }
        setAttribute(key, value) { this.attrs[key] = String(value); }
        createTHead() { const n = new Element('thead'); this.append(n); return n; }
        createTBody() { const n = new Element('tbody'); this.append(n); return n; }
        insertRow() { const n = new Element('tr'); this.append(n); return n; }
        showModal() { this.open = true; }
        close() { this.open = false; }
    }
    const template = read('index.html').match(/<template id="comfortExperimentTemplate">([\s\S]*?)<\/template>/)[1];
    for (const match of template.matchAll(/<(\w+)\b([^>]*\bid="(comfort[^"]+)"[^>]*)>/g)) {
        const node = nodes[match[3]] = new Element(match[1]);
        node.hidden = /\bhidden\b/.test(match[2]);
        node.value = match[2].match(/\bvalue="([^"]*)"/)?.[1] || '';
    }
    for (const match of template.matchAll(/<button\b([^>]*\bdata-comfort-(\w+)="([^"]+)"[^>]*)>/g)) {
        const node = new Element('button'), name = match[2];
        node.dataset['comfort' + name[0].toUpperCase() + name.slice(1)] = match[3];
        const channel = match[1].match(/data-channel="([^"]+)"/);
        if (channel) node.dataset.channel = channel[1];
        (groups[name] ??= []).push(node);
    }
    const root = new Element();
    root.querySelector = selector => nodes[selector.slice(1)];
    root.querySelectorAll = selector => groups[selector.match(/data-comfort-(\w+)/)[1]] || [];
    const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const serialize = el => '<' + el.tag + Object.entries(el.attrs).map(([k, v]) => ' ' + k + '="' + escape(v) + '"').join('') + '>' +
        escape(el.textContent) + el.children.map(serialize).join('') + '</' + el.tag + '>';
    const file = name => ({ createWritable: async () => {
        let data; return { write: async blob => { if (writeFails) throw new Error('synthetic write failure'); data = await blob.text(); },
            close: async () => files.set(name, data), abort: async () => {} };
    } });
    const folder = { name: 'SYNTHETIC_ONLY', queryPermission: async () => 'granted',
        requestPermission: async () => 'granted', getFileHandle: async (name, options) => {
            if (!options?.create && !files.has(name)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
            return file(name);
        } };
    class FakeDate extends Date { static now() { return 1900000000000 + clock; } }
    const context = vm.createContext({ Blob, Date: FakeDate, performance: { now: () => clock },
        setInterval() {}, setTimeout: () => 1, clearTimeout() {},
        Option: class extends Element { constructor(text, value) { super('option'); this.textContent = text; this.value = value; } },
        XMLSerializer: class { serializeToString(el) { return serialize(el); } },
        document: { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag) },
        window: { confirm: () => true, showDirectoryPicker: async () => folder } });
    vm.runInContext(read('comfort-experiment.js'), context);
    const state = { head: 7, neck: 10, ready: true, settledMonotonicMs: 0 };
    let controller;
    controller = context.createComfortExperiment(root, {
        onChange() {},
        heightControl: { prepare: async () => state, getState: () => state, tick() {} },
        getUserProfile: () => ({ gender: 'male', age_years: 25, body_height_cm: 170, body_weight_kg: 65 }),
        getSystemState: () => ({ connected }), sendExperimentCommand: command => {
            commands.push(command);
            if (command.startsWith('EXP02,STOP,')) controller.receiveLine('EXP02,ERR,' + command.split(',')[2] + ',STOPPED');
        }
    });
    const node = id => nodes['comfort' + id];
    const button = (group, value) => groups[group].find(el => Object.values(el.dataset).includes(value));
    const pressure = () => {
        clock += 10;
        controller.receivePressure({ head_adc: 1950000, neck_adc: 2080000, monitor_adc: 1800000,
            receivedMonotonicMs: clock, timestamp_iso: new Date(1900000000000 + clock).toISOString() });
        controller.refresh();
    };
    const start = method => {
        clock += 10; node('EmptyConfirmed').checked = true; controller.refresh();
        assert.equal(button('method', method).disabled, false);
        const done = button('method', method).click();
        const parts = commands.at(-1).split(',');
        assert.equal(parts[1], 'START');
        return { done, parts };
    };
    const acknowledge = (parts, policy = 'ok') => {
        const mode = parts[3];
        controller.receiveLine('EXP02,ACK,' + parts[2] + ',' + (policy === 'wrong-mode' ? 'ADC' : mode));
        if (mode !== 'ADC_TIME' || policy === 'no-time' || policy === 'wrong-mode') return;
        const h = comfortFillTime('head', Number(parts[4])), n = comfortFillTime('neck', Number(parts[5]));
        const time = ['EXP02', 'TIME', parts[2], h.calculatedMs.toFixed(3), n.calculatedMs.toFixed(3),
            h.commandMs, policy === 'bad-time' ? '1' : n.commandMs, Number(h.baselineFallback), Number(n.baselineFallback)];
        controller.receiveLine(time.join(','));
    };
    const finish = parts => controller.receiveLine('EXP02,DONE,' + parts[2] + ',1900000,1950000,' + (parts[3] === 'HEIGHT' ? '7.0,10.0' : 'NA,NA'));
    // Folder/save click handlers intentionally start async work without returning
    // it to the DOM event dispatcher. Let that work finish before assertions.
    const settle = async () => { await new Promise(setImmediate); controller.refresh(); };
    async function setup() {
        node('Subject').value = 'S01'; await node('Subject').dispatch('change');
        for (const pose of ['1', '5']) {
            await button('calibrate', pose).click(); pressure(); node('CalStable').checked = true; controller.refresh();
            assert.equal(node('CalSave').disabled, false); await node('CalSave').click();
        }
        await node('Folder').click(); await settle();
    }
    const capture = async () => { pressure(); assert.equal(node('Capture').disabled, false); await node('Capture').click(); };
    return { setup, settle, node, button, start, acknowledge, finish, capture, commands, files, controller,
        setWriteFailure: value => { writeFails = value; },
        disconnect: () => { connected = false; controller.onDisconnected(); },
        reconnect: () => { connected = true; controller.refresh(); } };
}

test('production Experiment 02 completes eight conditions, preserves next-run ownership, and serializes fixed-time fallback SVG', async () => {
    const f = fixture(); await f.setup();
    for (const pose of ['1', '5']) {
        await f.button('pose', pose).click();
        for (const method of ['R', 'M', 'A', 'I']) {
            const run = f.start(method);
            assert.equal(run.parts[3], method === 'I' ? 'HEIGHT' : 'ADC_TIME');
            f.controller.receiveLine('EXP02,DONE,OTHER,1,2,NA,NA');
            assert.equal(f.node('Capture').hidden, true);
            f.acknowledge(run.parts); f.finish(run.parts); await run.done;
            await f.capture(); await f.capture();
            f.node('Score').value = method === 'R' ? '0' : '10'; f.controller.refresh();
            assert.equal(f.node('ResultShot').disabled, false); await f.node('ResultShot').click(); await f.settle();
            assert.match(f.node('Status').textContent, /已儲存/);
            const svg = [...f.files.values()].at(-1);
            assert.match(svg, /空枕設定與實測/); assert.match(svg, /躺回後/);
            if (method !== 'I') {
                assert.match(svg, /理論時間/); assert.match(svg, /裝置確認時間/);
                assert.ok(!svg.includes('待裝置確認'));
            }
            if (pose === '1' && method === 'R') {
                assert.match(svg, /開機基準備援（負時間）/); assert.match(svg, /10\.000 s/);
                assert.match(svg, /滿意度：0／10/);
            }
        }
    }
    assert.equal(f.files.size, 8);
    assert.match(f.node('Progress').textContent, /姿勢一 4／4.*姿勢五 4／4/);
});

test('production controller rejects wrong mode, bad/missing TIME and disconnect, and can start again after STOP', async () => {
    const f = fixture(); await f.setup();
    let run = f.start('R'); await f.node('Cancel').click(); await run.done;
    assert.match(f.node('Status').textContent, /STOPPED/);
    for (const policy of ['wrong-mode', 'bad-time', 'no-time']) {
        run = f.start('R'); f.acknowledge(run.parts, policy);
        if (policy === 'no-time') f.finish(run.parts);
        await run.done;
        assert.equal(f.commands.at(-1), 'EXP02,STOP,' + run.parts[2]);
        assert.match(f.node('Status').textContent, /不一致|缺少/);
        assert.equal(f.node('Capture').hidden, true);
    }
    run = f.start('M'); f.disconnect(); await run.done;
    assert.match(f.node('Status').textContent, /斷線/);
    f.reconnect(); run = f.start('I'); f.acknowledge(run.parts); f.finish(run.parts); await run.done;
    assert.match(f.node('Status').textContent, /充氣已完成/);
});

test('failed SVG write keeps occupied reading and score for retry without marking the method complete', async () => {
    const f = fixture(); await f.setup();
    const run = f.start('R'); f.acknowledge(run.parts); f.finish(run.parts); await run.done;
    await f.capture(); await f.capture(); f.node('Score').value = '10'; f.controller.refresh();
    f.setWriteFailure(true); await f.node('ResultShot').click(); await f.settle();
    assert.equal(f.files.size, 0); assert.match(f.node('Progress').textContent, /姿勢一 0／4/);
    assert.match(f.node('Status').textContent, /儲存失敗/);
    assert.equal(f.node('ResultShot').disabled, false);
    f.setWriteFailure(false); await f.node('ResultShot').click(); await f.settle();
    assert.equal(f.files.size, 1); assert.match(f.node('Progress').textContent, /姿勢一 1／4/);
    assert.match([...f.files.values()][0], /滿意度：10／10/);
});
