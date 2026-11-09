const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const controller = fs.readFileSync(path.join(root, 'spp3_BLE/comfort-experiment.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'spp3_BLE/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'spp3_BLE/index.html'), 'utf8');

test('Experiment 02 uses round-scoped START/STOP and receives complete protocol lines', () => {
    assert.match(controller, /EXP02,START,\$\{round\.id\},ADC,/);
    assert.match(controller, /EXP02,START,\$\{round\.id\},HEIGHT,/);
    assert.match(controller, /EXP02,STOP,\$\{round\.id\}/);
    assert.match(controller, /replyRoundId !== round\.id/);
    assert.match(app, /experimentHubModule\.receiveProtocolLine\(dataString\.trim\(\), completeBleReceipt\)/);
});

test('R and M are explicit operator inputs while A and ADC targets are calculated', () => {
    assert.match(html, /id="comfortPose1RHeadRatio"[^>]*placeholder="0–1"/);
    assert.match(html, /id="comfortPose5MNeckRatio"[^>]*placeholder="0–1"/);
    assert.match(controller, /return \(r \+ m\) \/ 2/);
    assert.match(controller, /Math\.round\(round\.occupiedHeadAdc \* \(1 - round\.headRatio\)\)/);
    assert.match(controller, /Math\.round\(round\.occupiedNeckAdc \* \(1 - round\.neckRatio\)\)/);
});

test('empty-pillow capture requires DONE and a newer complete pressure sample', () => {
    assert.match(controller, /donePressureSequence = pressureSequence/);
    assert.match(controller, /pressureSequence > donePressureSequence/);
    assert.match(controller, /pressureSequence <= donePressureSequence/);
    assert.match(controller, /round\.status !== 'done'/);
});
