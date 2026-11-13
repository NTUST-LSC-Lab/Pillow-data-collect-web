'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDualPoseResult, createPoseModelPanel } = require('../spp3_BLE/pose-model.js');

function packet(changes = {}) {
    const a = ['CLASSIFY','DATA','V1','1','7','9000','24','8990','1700000','2000000','2100000',
        'OK','GROUP1','0.8','0.2','OK','GROUP2','0.2','0.8','6','0','1200'];
    for (const [key, value] of Object.entries(changes)) a[key] = String(value);
    return a.join(',');
}
function fixture() {
    let ms = 100;
    const nodes = new Map();
    const root = { querySelector(selector) {
        const key = /"([^"]+)"/.exec(selector)[1];
        if (!nodes.has(key)) nodes.set(key, { textContent: '' });
        return nodes.get(key);
    } };
    return { panel: createPoseModelPanel(root, () => ms), text: key => nodes.get(key)?.textContent,
        advance: value => { ms += value; } };
}

test('firmware V1 channel order and two independent probabilities remain distinct', () => {
    const r = parseDualPoseResult(packet());
    assert.deepEqual(r.adc, [1700000, 2000000, 2100000]);
    assert.deepEqual(r.staticModel, { status: 'OK', group: 'GROUP1', p1: .8, p2: .2 });
    assert.deepEqual(r.historyModel, { status: 'OK', group: 'GROUP2', p1: .2, p2: .8 });
    const f = fixture(); f.panel.receive(packet());
    assert.equal(f.text('static-group'), 'Group1'); assert.equal(f.text('history-group'), 'Group2');
    assert.equal(f.text('static-p1'), '80.00%'); assert.equal(f.text('history-p1'), '20.00%');
    assert.equal(f.text('count'), '7 筆');
});
test('six valid warmup rows have no history probability; seventh becomes available', () => {
    const f = fixture();
    for (let i = 0; i < 6; i++) {
        assert.equal(f.panel.receive(packet({4:i+1,15:'WARMUP',16:'UNKNOWN',17:'NA',18:'NA',19:i})), true);
        assert.equal(f.text('history-group'), '—'); assert.equal(f.text('history-p1'), '—');
        assert.equal(f.text('history-status'), `暖機中（${i+1}/6）`);
    }
    f.panel.receive(packet()); assert.equal(f.text('history-status'), '有效結果');
});
test('INVALID clears previous predictions without fabricating probabilities or history', () => {
    const f = fixture(); f.panel.receive(packet());
    f.panel.receive(packet({4:8,8:'nan',11:'INVALID',12:'UNKNOWN',13:'NA',14:'NA',15:'INVALID',16:'UNKNOWN',17:'NA',18:'NA',19:7}));
    assert.equal(f.text('static-group'), '—'); assert.equal(f.text('history-p2'), '—');
    assert.equal(f.text('count'), '7 筆'); assert.match(f.text('notice'), /保留先前歷史/);
});
test('malformed, partial, unsupported and contradictory frames are rejected', () => {
    for (const changes of [{2:'V2'},{4:''},{4:0},{4:'7junk'},{5:4294967296},{19:'Infinity'},
        {12:'BSHS'},{12:'GROUP2'},{13:-.1},{13:'NaN'},{13:0},{13:''},{15:'WARMUP'},
        {19:0},{8:''},{8:'nan'},{11:'BAD'},{20:-1}]) assert.equal(parseDualPoseResult(packet(changes)), null, JSON.stringify(changes));
    assert.equal(parseDualPoseResult(packet()+',EXTRA'), null);
    assert.equal(parseDualPoseResult(packet().split(',').slice(0,-1).join(',')), null);
    assert.equal(parseDualPoseResult('CLASSIFY,OK,BSHS,BSHS,1,2,3,4'), null);
    // Rounded 0.5 need not equal the pre-rounding probability used for the label.
    assert.ok(parseDualPoseResult(packet({13:.5,14:.5})));
    assert.ok(parseDualPoseResult(packet({12:'GROUP2',13:.5,14:.5})));
});
test('GET duplicates and out-of-order rows neither overwrite nor extend freshness', () => {
    const f = fixture(); f.panel.receive(packet());
    f.advance(3001); assert.equal(f.panel.receive(packet()), false); f.panel.tick();
    assert.equal(f.text('static-group'), '—'); assert.equal(f.text('static-status'), '等待新資料');
    assert.equal(f.panel.receive(packet({4:6})), false);
    assert.equal(f.panel.receive(packet({4:8})), true); assert.equal(f.text('static-group'), 'Group1');
    assert.equal(f.panel.receive(packet({3:2,4:1,15:'WARMUP',16:'UNKNOWN',17:'NA',18:'NA',19:0})), true);
    assert.equal(f.panel.receive(packet({3:1,4:99})), false);
});
test('stop/disconnect reset hides old values; dropped-frame diagnostics remain visible', () => {
    const f = fixture(); f.panel.receive(packet({20:4})); assert.match(f.text('notice'), /4 筆/);
    f.panel.reset('BLE 已斷線'); assert.equal(f.text('static-group'), '—'); assert.equal(f.text('count'), '—');
    assert.equal(f.text('notice'), 'BLE 已斷線');
    assert.equal(f.panel.receive(packet()), true, 'reconnected device may restart its sequence');
});
