// Real-browser / real-Chart.js regression. Synthetic S00 samples only; no BLE/device data.
// Run separately from node --test: node tests/chart-browser-smoke.cjs
// Optional environment:
//   PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright
//   CHROME_EXECUTABLE_PATH=/absolute/path/to/chrome
//   CHART_JS_PATH=/absolute/path/to/chart.umd.js  (offline, unmodified library)
//   EXPECTED_CHART_VERSION=4.6.1                 (default: reported failing version)
// This harness loads production HTML/CSS, Hub/controller/recorder and height control.
// It replaces app.js with synthetic system/sample/firmware providers, not a mock Chart.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, '.artifacts', 'chart-browser');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const app = read('spp3_BLE/app.js');
const matchedConfig = app.match(/pressureConfig:\s*(\{[\s\S]*?\}),\s*getSystemState:\s*\(\)\s*=>/);
assert.ok(matchedConfig, 'Production pressureConfig must be present');
const config = vm.runInNewContext(`(${matchedConfig[1]})`);
const profileStart = app.indexOf('function getExperimentUserProfile(');
const profileEnd = app.indexOf('function setSyncTimeAck(', profileStart);
assert.ok(profileStart >= 0 && profileEnd > profileStart, 'Production profile getter seam must exist');
const profileGetters = app.slice(profileStart, profileEnd);
assert.ok(profileGetters.includes('function getExperimentPose5Suggestion('), 'Production pose5 suggestion getter must exist');

function resolvePlaywright() {
    if (process.env.PLAYWRIGHT_MODULE_PATH) return require(process.env.PLAYWRIGHT_MODULE_PATH);
    try { return require(require.resolve('playwright', { paths: [root, path.dirname(root), path.resolve(root, '../..')] })); }
    catch { throw new Error('Playwright is unavailable. Set PLAYWRIGHT_MODULE_PATH to an already-installed module; this test does not install dependencies.'); }
}

const bootstrap = `
    // Synthetic browser smoke data only. No live BLE connection or control commands.
    window.__smokeClock = 0;
    const NativeDate = Date;
    window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [1893456000000 + window.__smokeClock])); }
        static now() { return 1893456000000 + window.__smokeClock; }
    };
    const refreshCallbacks = [];
    const realSetInterval = window.setInterval.bind(window);
    window.setInterval = (callback, delay, ...args) => {
        if (delay === 250) { refreshCallbacks.push(() => callback(...args)); return -refreshCallbacks.length; }
        return realSetInterval(callback, delay, ...args);
    };
    Object.defineProperty(performance, 'now', { configurable: true, value: () => window.__smokeClock });
    const serial_ready = true;
    const bluetoothDevice = { gatt: { connected: true } };
    const HEIGHT_LIMITS = { HEAD: { min: 7, max: 16 }, NECK: { min: 10, max: 14 } };
    const HEIGHT_STEP = 0.5;
    ${profileGetters}
    window.__smokePngText = [];
    window.__smokeCapturePng = false;
    const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (window.__smokeCapturePng && !this.canvas.id) window.__smokePngText.push(String(text));
        return nativeFillText.call(this, text, ...args);
    };
    window.__smokeSystem = { connected: true, autoHeightPossible: false };
    window.__smokeDevice = { head: 7, neck: 10 };
    // Synthetic final firmware suggestions; these numbers do not validate an anthropometric formula.
    window.__smokeConfiguredUser = { gender: 1, age: 25, height: 170, weight: 65, HLF: 12, N1LF: 12.5 };
    window.__smokeHeightCalls = [];
    window.__smokeCommands = [];
    window.__smokeDisabledReplies = [];
    const receive = line => heightControl.receiveLine(line, {
        receivedMonotonicMs: window.__smokeClock, timestamp_iso: new Date().toISOString()
    });
    function debugReply() {
        const device = window.__smokeDevice;
        const user = window.__smokeConfiguredUser;
        ['gender=' + user.gender, 'age=' + user.age, 'height=' + user.height, 'weight=' + user.weight,
            'HLF=' + user.HLF.toFixed(1), 'N1LF=' + user.N1LF.toFixed(1),
            'headNumber=' + device.head.toFixed(1), 'neckNumber=' + device.neck.toFixed(1),
            'currentHeadNumber=' + device.head.toFixed(1), 'currentNeckNumber=' + device.neck.toFixed(1),
            'N2LP=100', 'anchor_state=IDLE', 'pre_stage=WAIT_STABLE', 'pre_stable_label=UNKNOWN'].forEach(receive);
    }
    function syntheticFirmware(command, owned = false) {
        if (!heightControl.allowCommand(command, owned)) return;
        window.__smokeCommands.push(command);
        if (command === 'PRED,STOP' || command === 'CLASSIFY,STOP') {
            const reply = command.split(',')[0] + ',ERR,DISABLED';
            receive(reply);
            window.__smokeDisabledReplies.push({ reply, ready: heightControl.getState().ready });
        } else if (command === 'FEATURE,STATUS') receive('FEATURE,STATUS,LEGACY,0,POSE,0,PRED,0');
        else if (command === 'FEATURE,PRED,OFF' || command === 'FEATURE,LEGACY,OFF') return;
        else if (command === 'DEBUG') debugReply();
        else if (command === 'I') receive('I:0 5 0 0 0 0 0');
        else if (command.startsWith('SET,NORM,EXPERIMENT,S,')) {
            const parts = command.split(',');
            const channel = parts[4], height = Number(parts[5]);
            window.__smokeHeightCalls.push({ action: 'adjust', channel, height });
            window.__smokeDevice[channel === 'HEAD' ? 'head' : 'neck'] = height;
            receive('HEIGHT_SET,SET_NORM,HEAD,' + window.__smokeDevice.head.toFixed(1) +
                ',NECK,' + window.__smokeDevice.neck.toFixed(1));
            debugReply();
            receive('I:0 5 0 0 0 0 0');
        } else throw new Error('Unexpected synthetic command: ' + command);
    }
    const heightControl = createExperimentHeightControl({
        isConnected: () => window.__smokeSystem.connected,
        isRecording: () => Boolean(window.__smokeHub?.isRunning()),
        sendCommand: command => syntheticFirmware(command, true),
        sendQuery: command => syntheticFirmware(command),
        stopAutomatic: () => {
            window.__smokeHeightCalls.push({ action: 'prepare' });
            ['PRED,STOP', 'CLASSIFY,STOP', 'FEATURE,PRED,OFF', 'FEATURE,STATUS',
                'FEATURE,LEGACY,OFF', 'FEATURE,STATUS'].forEach(command => syntheticFirmware(command));
        }
    });
    const experimentHeightControl = heightControl;
    window.__smokeHeightControl = heightControl;
    window.__smokeDebug = debugReply;
    window.__smokeHub = createExperimentHub(document.getElementById('experimentHub'), {
        pressureConfig: ${JSON.stringify(config)}, getSystemState: () => ({ ...window.__smokeSystem }), heightControl,
        getUserProfile: getExperimentUserProfile, getPose5Suggestion: getExperimentPose5Suggestion
    });
    window.__smokeHub.init();
    const toggle = document.getElementById('experimentAccordionToggle');
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') !== 'true';
        document.getElementById('experimentAccordionBody').classList.toggle('is-collapsed', !expanded);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.textContent = expanded ? '收合' : '展開';
    });
    window.__smokePulse = () => refreshCallbacks.forEach(callback => callback());
    window.__smokeAdvance = (at, values) => {
        window.__smokeClock = at;
        if (values) window.__smokeHub.receivePressure({
            monitor_adc: values[0], neck_adc: values[1], head_adc: values[2],
            receivedMonotonicMs: at, timestamp_iso: new Date(1893456000000 + at).toISOString()
        });
        window.__smokePulse();
    };
`;

function assertProfile(text, age) {
    assert.match(text, new RegExp(`年齡[^0-9]*${age}(?:[^0-9]|$)`));
    assert.match(text, /身高[^0-9]*170\.5/);
    assert.match(text, /體重[^0-9]*65\.5/);
}

async function main() {
    const { chromium } = resolvePlaywright();
    const executablePath = process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (!fs.existsSync(executablePath)) throw new Error('Chrome executable not found. Set CHROME_EXECUTABLE_PATH to an existing browser.');
    const browser = await chromium.launch({ headless: true, executablePath });
    try {
        const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
        const page = await context.newPage();
        const errors = [];
        const downloads = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('download', download => downloads.push(download));
        await page.route('https://ipillow.test/**', async route => {
            const url = new URL(route.request().url());
            const relative = decodeURIComponent(url.pathname).replace(/^\//, '') || 'spp3_BLE/index.html';
            const filename = path.resolve(root, relative.endsWith('/') ? `${relative}index.html` : relative);
            if (!filename.startsWith(`${root}${path.sep}`)) return route.fulfill({ status: 403, body: 'Forbidden' });
            if (filename.endsWith('/spp3_BLE/index.html')) {
                const html = read('spp3_BLE/index.html').replace(/<script src="\.\/app\.js"><\/script>/, '')
                    .replace('</body>', `<script>${bootstrap}</script></body>`);
                return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
            }
            if (!fs.existsSync(filename)) return route.fulfill({ status: 404, body: 'Not found' });
            const contentType = filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'application/octet-stream';
            return route.fulfill({ contentType, body: fs.readFileSync(filename) });
        });
        // Typeface network access is unrelated to the Chart resolver regression.
        await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
        await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ status: 204, body: '' }));
        if (process.env.CHART_JS_PATH) {
            const library = fs.readFileSync(path.resolve(process.env.CHART_JS_PATH));
            await page.route('https://cdn.jsdelivr.net/npm/chart.js', route => route.fulfill({ contentType: 'application/javascript', body: library }));
        }
        await page.goto('https://ipillow.test/spp3_BLE/', { waitUntil: 'load', timeout: 30000 });
        const version = await page.evaluate(() => typeof Chart === 'function' ? Chart.version : null);
        assert.ok(version, 'Real Chart.js failed to load. For offline testing supply CHART_JS_PATH.');
        console.log(`Real browser: ${browser.version()}; real Chart.js: ${version}; synthetic S00 data only.`);
        assert.equal(version, process.env.EXPECTED_CHART_VERSION || '4.6.1', 'The test must identify the actual loaded library version; the bundled 4.4.1 is not 4.6.1.');
        await page.locator('#experimentAccordionToggle').click();
        await page.evaluate(() => window.__smokePulse());
        await page.locator('#pressureRunForm').waitFor({ state: 'visible' });
        assert.deepEqual(errors, [], 'Expanding the Hub must not cause Chart resolver errors');
        assert.equal(await page.locator('#pressureNotes, #pressureTrial, #pressureCalibrationUse').count(), 0,
            'removed operator controls must not remain in the rendered template');

        await page.locator('#male').check();
        await page.locator('#age').fill('25');
        await page.locator('#height').fill('170.5');
        await page.locator('#weight').fill('65.5');
        await page.evaluate(() => window.__smokePulse());
        assertProfile(await page.locator('#pressureUserProfile').textContent(), 25);
        await page.locator('#age').fill('26');
        await page.evaluate(() => window.__smokePulse());
        assertProfile(await page.locator('#pressureUserProfile').textContent(), 26);
        await page.locator('#age').fill('25');
        await page.evaluate(() => window.__smokePulse());
        await page.locator('#pressureSubject').fill('S00');
        await page.locator('#pressureHeadHeight').fill('8');
        await page.locator('#pressureNeckHeight').fill('11');
        await page.locator('#pressureSetupConfirmed').check();
        await page.evaluate(() => {
            window.__smokeAdvance(1000, [100, 200, 300]);
            window.__smokeAdvance(2000, [101, 201, 301]);
        });
        await page.locator('#pressureCalibrationPrepare').click();
        const prepared = await page.evaluate(() => window.__smokeHeightControl.getState());
        assert.equal(prepared.ready, true, prepared.reason);
        assert.equal(prepared.debugReceipt.preStage, 'WAIT_STABLE', 'disabled firmware can retain a cached PRED stage');
        assert.deepEqual(await page.evaluate(() => window.__smokeDisabledReplies), [
            { reply: 'PRED,ERR,DISABLED', ready: false }, { reply: 'CLASSIFY,ERR,DISABLED', ready: false }
        ], 'DISABLED replies alone cannot make the real height adapter ready');
        assert.equal(await page.locator('#pressureCalibrationHeadApply').isEnabled(), true);
        assert.equal(await page.locator('#pressureCalibrationNeckApply').isEnabled(), true);
        await page.locator('#pressureCalibrationHead').fill('8');
        await page.locator('#pressureCalibrationNeck').fill('11');
        await page.locator('#pressureCalibrationBothApply').click();
        assert.deepEqual(await page.evaluate(() => window.__smokeHeightCalls.filter(call => call.action === 'adjust')), [
            { action: 'adjust', channel: 'HEAD', height: 8 }, { action: 'adjust', channel: 'NECK', height: 11 }
        ], 'one combined click settles Head then Neck through the production height adapter');
        await page.evaluate(() => window.__smokeAdvance(2000, [111, 222, 333]));
        await page.locator('#pressureCalibrationStable').check();
        await page.locator('#pressureCalibrationCapture').click();
        const pose1Capture = await page.locator('#pressureCalibrationPose1Saved').textContent();
        assert.match(pose1Capture, /S00/); assert.match(pose1Capture, /111/);
        assertProfile(pose1Capture, 25);
        const commandsBeforePose5 = await page.evaluate(() => window.__smokeCommands.length);
        await page.locator('#pressureCalibrationPose').selectOption('pose5');
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '12');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '12.5');
        assert.equal(await page.evaluate(() => window.__smokeCommands.length), commandsBeforePose5,
            'selecting pose5 only fills its draft; it must not send control commands');
        await page.locator('#pressureCalibrationPrepare').click();
        await page.evaluate(() => window.__smokeAdvance(window.__smokeClock + 1000, [111, 222, 333]));
        assert.equal(await page.evaluate(() => window.__smokeHeightControl.getState().ready), true);
        assert.deepEqual(await page.evaluate(() => window.__smokeDevice), { head: 8, neck: 11 });
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '12');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '12.5',
            'preparation must retain matching device suggestions instead of using current heights');
        assert.equal(await page.evaluate(() => window.__smokeCommands.filter(command => command.startsWith('SET,')).length), 2,
            'preparation does not apply the suggested height');
        fs.mkdirSync(output, { recursive: true });
        await page.locator('#pressureCalibrationBothApply').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_pose5-recommendation-desktop.png') });
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => window.__smokePulse());
        await page.locator('#pressureCalibrationBothApply').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_pose5-recommendation-320.png') });
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.locator('#pressureCalibrationHead').fill('12');
        await page.locator('#pressureCalibrationHeadApply').click();
        await page.locator('#pressureCalibrationNeck').fill('13');
        await page.locator('#pressureCalibrationNeckApply').click();
        await page.evaluate(() => window.__smokeAdvance(window.__smokeClock, [444, 555, 666]));
        await page.locator('#pressureCalibrationStable').check();
        await page.locator('#pressureCalibrationCapture').click();
        assert.equal(await page.locator('#pressureCalibrationPose1Saved').textContent(), pose1Capture);
        assert.match(await page.locator('#pressureCalibrationPose5Saved').textContent(), /444/);
        const commandsBeforeDraftRestore = await page.evaluate(() => window.__smokeCommands.length);
        await page.locator('#pressureCalibrationPose').selectOption('pose1');
        await page.locator('#pressureCalibrationPose').selectOption('pose5');
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '12');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '13',
            'returning to pose5 preserves the operator draft instead of restoring suggestions');
        assert.equal(await page.evaluate(() => window.__smokeCommands.length), commandsBeforeDraftRestore);
        const controlsBeforeProfileChanges = await page.evaluate(() => window.__smokeHeightCalls.length);
        await page.locator('#age').fill('26');
        await page.evaluate(() => window.__smokePulse());
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '', 'profile edits clear the prior pose5 draft');
        await page.evaluate(() => {
            Object.assign(window.__smokeConfiguredUser, { age: 26, HLF: 11.5, N1LF: 12 });
            window.__smokePulse();
        });
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '', 'a simulated device change without fresh DEBUG is insufficient');
        await page.evaluate(() => { window.__smokeClock += 1; window.__smokeDebug(); window.__smokePulse(); });
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '11.5');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '12');
        await page.locator('#female').check();
        await page.evaluate(() => window.__smokePulse());
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '', 'gender edits also invalidate the prior suggestion');
        await page.evaluate(() => {
            Object.assign(window.__smokeConfiguredUser, { gender: 0, HLF: 10, N1LF: 11.5 });
            window.__smokeClock += 1; window.__smokeDebug(); window.__smokePulse();
        });
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '10');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '11.5');
        await page.locator('#age').fill('25');
        await page.locator('#male').check();
        await page.evaluate(() => window.__smokePulse());
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '');
        await page.evaluate(() => {
            Object.assign(window.__smokeConfiguredUser, { gender: 1, age: 25, HLF: 12, N1LF: 12.5 });
            window.__smokeClock += 1; window.__smokeDebug(); window.__smokePulse();
        });
        assert.equal(await page.locator('#pressureCalibrationHead').inputValue(), '12');
        assert.equal(await page.locator('#pressureCalibrationNeck').inputValue(), '12.5');
        await page.locator('#pressureCalibrationNeck').fill('13');
        assert.equal(await page.evaluate(() => window.__smokeHeightCalls.length), controlsBeforeProfileChanges,
            'reading or refreshing suggestions must not send USER or height controls');
        assert.equal(await page.locator('#pressureHeadHeight').inputValue(), '8');
        assert.equal(await page.locator('#pressureNeckHeight').inputValue(), '11',
            'preparing, adjusting and capturing either pose must not fill run heights');
        const heightCalls = await page.evaluate(() => window.__smokeHeightCalls);
        assert.equal(heightCalls.filter(call => call.action === 'prepare').length, 2);
        assert.equal(heightCalls.filter(call => call.action === 'adjust').length, 4);
        assert.equal(await page.locator('#pressureRunStatus').textContent(), '尚未開始');
        fs.mkdirSync(output, { recursive: true });
        await page.locator('#pressureCalibrationPose1Saved').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_calibration-desktop.png'), fullPage: true });
        await page.locator('#pressureUserProfile').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_profile-desktop.png') });
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => window.__smokePulse());
        const calibrationLayout = await page.locator('#pressureCalibrationPose1Saved').evaluate(node => {
            const panel = node.closest('.pressure-experiment');
            return { width: panel.clientWidth, scrollWidth: panel.scrollWidth };
        });
        assert.ok(calibrationLayout.scrollWidth <= calibrationLayout.width + 1,
            `320px calibration panel overflows: ${JSON.stringify(calibrationLayout)}`);
        await page.locator('#pressureCalibrationPose5Saved').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_calibration-320.png') });
        await page.locator('#pressureCalibrationBothApply').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_height-both-320.png') });
        await page.locator('#pressureUserProfile').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_profile-320.png') });
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.locator('#pressureCalibrationPose').selectOption('pose1');
        const callsBeforeManualEntry = await page.evaluate(() => window.__smokeHeightCalls.length);
        await page.locator('#pressureHeadHeight').fill('9');
        await page.locator('#pressureNeckHeight').fill('12');
        await page.locator('#pressureSetupConfirmed').check();
        assert.equal(await page.locator('#experimentStart').isEnabled(), false,
            'confirmed run heights must match the device before recording');
        await page.locator('#pressureHeadHeight').fill('8');
        await page.locator('#pressureNeckHeight').fill('11');
        assert.equal(Number(await page.locator('#pressureHeadHeight').inputValue()), 8);
        assert.equal(Number(await page.locator('#pressureNeckHeight').inputValue()), 11);
        assert.equal(await page.evaluate(() => window.__smokeHeightCalls.length), callsBeforeManualEntry,
            'manual run height entry must not send hardware commands');
        await page.locator('#pressureSetupConfirmed').check();
        assert.equal(await page.locator('#experimentStart').isEnabled(), false,
            'pose1 run heights cannot start while the device remains at pose5 heights');
        await page.locator('#pressureCalibrationHead').fill('9');
        await page.locator('#pressureCalibrationHeadApply').click();
        await page.locator('#pressureCalibrationNeck').fill('11');
        await page.locator('#pressureCalibrationNeckApply').click();
        await page.evaluate(() => window.__smokeAdvance(window.__smokeClock, [111, 222, 333]));
        assert.match(await page.locator('#pressureControlWarning').textContent(), /此提醒不會阻止開始記錄/);
        assert.match(await page.locator('#pressureControlWarning').getAttribute('class'), /pressure-field-hint/);
        assert.doesNotMatch(await page.locator('#pressureControlWarning').getAttribute('class'), /pressure-warning/);
        await page.evaluate(() => { window.__smokeSystem.autoHeightPossible = true; window.__smokePulse(); });
        assert.match(await page.locator('#pressureControlWarning').getAttribute('class'), /pressure-warning/);
        await page.evaluate(() => { window.__smokeSystem.autoHeightPossible = false; window.__smokePulse(); });
        const callsBeforeHeightCorrection = await page.evaluate(() => window.__smokeHeightCalls.length);
        await page.locator('#pressureSetupConfirmed').check();
        assert.equal(await page.locator('#experimentStart').isEnabled(), false,
            'ready Head 9 / Neck 11 cannot start with recorded Head 8 / Neck 11');
        const mismatchHint = await page.locator('#experimentHint').textContent();
        assert.match(mismatchHint, /Head/);
        assert.match(mismatchHint, /8\.0/);
        assert.match(mismatchHint, /9\.0/);
        await page.locator('#experimentHint').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_start-height-mismatch.png') });
        await page.locator('#pressureHeadHeight').fill('9');
        assert.equal(await page.locator('#pressureSetupConfirmed').isChecked(), false,
            'correcting the recorded height requires fresh operator confirmation');
        assert.equal(await page.locator('#experimentStart').isEnabled(), false);
        await page.locator('#pressureSetupConfirmed').check();
        assert.equal(await page.locator('#experimentStart').isEnabled(), true, 'A live valid setup must enable Start');
        await page.locator('#experimentStart').click();
        assert.equal(await page.evaluate(() => window.__smokeHeightCalls.length), callsBeforeHeightCorrection,
            'correcting run metadata and starting collection must not issue height commands');
        await page.locator('#age').fill('99');
        await page.evaluate(() => window.__smokePulse());
        assertProfile(await page.locator('#pressureUserProfile').textContent(), 25);
        assertProfile(await page.locator('#pressureRunSummary').textContent(), 25);
        assert.equal(await page.locator('#pressureCalibrationPose1Saved').textContent(), pose1Capture,
            'later profile edits cannot rewrite a saved calibration snapshot');
        await page.evaluate(() => {
            const startedAt = window.__smokeClock;
            for (let i = 0; i < 30; i++) window.__smokeAdvance(startedAt + 400 + i * 1000, [1000 + i, 2000 + i, 3000 + i]);
            window.__smokeAdvance(startedAt + 30000);
        });
        assert.equal(await page.locator('#pressureRunStatus').textContent(), '計時完成');
        assert.equal(await page.locator('#pressureSampleCount').textContent(), '30');
        const graph = await page.evaluate(() => {
            const chart = Chart.getChart(document.getElementById('pressureRunChart'));
            return { count: chart.data.datasets[0].data.length, title: chart.options.plugins.title.text,
                min: chart.options.scales.x.min, max: chart.options.scales.x.max };
        });
        assert.equal(graph.count, 30); assert.match(graph.title, /條件 01/);
        assert.doesNotMatch(graph.title, /trial/i);
        assert.equal(graph.min, 0); assert.equal(graph.max, 30);
        assert.deepEqual(errors, [], 'Collection and refresh must remain free of page errors');

        await page.evaluate(() => { window.__smokePngText = []; window.__smokeCapturePng = true; });
        await page.locator('#experimentExport').click();
        const pngText = await page.evaluate(() => { window.__smokeCapturePng = false; return window.__smokePngText.join(' '); });
        assertProfile(pngText, 25);
        assert.doesNotMatch(pngText, /年齡[^0-9]*99(?:[^0-9]|$)/);
        const deadline = Date.now() + 10000;
        while (downloads.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(downloads.length, 2, 'CSV and PNG must both trigger actual browser download events');
        const csvDownload = downloads.find(download => download.suggestedFilename().endsWith('.csv'));
        const pngDownload = downloads.find(download => download.suggestedFilename().endsWith('.png'));
        assert.ok(csvDownload && pngDownload);
        assert.equal(csvDownload.suggestedFilename().slice(0, -4), pngDownload.suggestedFilename().slice(0, -4));
        assert.doesNotMatch(csvDownload.suggestedFilename(), /_trial/);
        fs.mkdirSync(output, { recursive: true });
        const csvPath = path.join(output, `SYNTHETIC_${csvDownload.suggestedFilename()}`);
        const pngPath = path.join(output, `SYNTHETIC_${pngDownload.suggestedFilename()}`);
        await csvDownload.saveAs(csvPath); await pngDownload.saveAs(pngPath);
        const csv = fs.readFileSync(csvPath, 'utf8');
        const csvLines = csv.trim().split(/\r?\n/);
        assert.equal(csvLines.length, 31, 'One header and thirty synthetic sample rows');
        // Synthetic values contain no commas/newlines; general CSV escaping is tested in the recorder suite.
        const csvHeader = csvLines[0].split(',');
        assert.equal(csvHeader.length, 26);
        assert.deepEqual(csvHeader.slice(-3), ['"age_years"', '"body_height_cm"', '"body_weight_kg"']);
        for (const [key, value] of [['age_years', '25'], ['body_height_cm', '170.5'], ['body_weight_kg', '65.5']]) {
            const index = csvHeader.indexOf(`"${key}"`);
            for (const line of csvLines.slice(1)) assert.equal(line.split(',')[index], `"${value}"`, `${key} retains the run snapshot`);
        }
        for (const key of ['notes', 'trial_index']) {
            const index = csvHeader.indexOf(`"${key}"`);
            assert.ok(index >= 0, `${key} remains a compatibility column`);
            for (const line of csvLines.slice(1)) assert.equal(line.split(',')[index], '""', `${key} is empty`);
        }
        assert.match(csv, /"completed"/); assert.match(csv, /"data_timeout_s"/);
        const png = fs.readFileSync(pngPath);
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, 'Exported PNG has real dimensions');

        await page.locator('#pressureCondition').selectOption('02');
        assert.equal(await page.locator('#pressureSampleCount').textContent(), '0');
        assertProfile(await page.locator('#pressureUserProfile').textContent(), 99);
        const blank = await page.evaluate(() => Chart.getChart(document.getElementById('pressureRunChart')).data.datasets[0].data.length);
        assert.equal(blank, 0);
        await page.locator('#pressureCondition').selectOption('01');
        assert.equal(await page.locator('#pressureSampleCount').textContent(), '30');
        assertProfile(await page.locator('#pressureUserProfile').textContent(), 99);
        assertProfile(await page.locator('#pressureRunSummary').textContent(), 25);
        const restored = await page.evaluate(() => Chart.getChart(document.getElementById('pressureRunChart')).data.datasets[0].data.length);
        assert.equal(restored, 30, 'Switching back restores the actual rendered condition curve');

        await page.locator('#pressureCondition').selectOption('02');
        await page.locator('#pressureSetupConfirmed').check();
        await page.locator('#experimentStart').click();
        assertProfile(await page.locator('#pressureUserProfile').textContent(), 99);
        assertProfile(await page.locator('#pressureRunSummary').textContent(), 99);
        await page.locator('#experimentAccordionToggle').click();
        await page.evaluate(() => window.__smokeAdvance(window.__smokeClock + 200, [7, 8, 9]));
        assert.equal(await page.locator('#pressureSampleCount').textContent(), '1', 'Collapsed view continues collecting');
        assert.equal(await page.locator('#pressureRunStatus').textContent(), '記錄中');
        await page.locator('#experimentAccordionToggle').click();
        await page.evaluate(() => window.__smokePulse());
        await page.locator('#experimentFinish').click();
        assert.equal(await page.locator('#pressureRunStatus').textContent(), '提前結束（未完成）');
        assert.deepEqual(errors, [], 'All real-Chart refresh/collapse/condition actions must remain free of page errors');
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_chart-smoke.png') });
        console.log(`PASS: real Chart.js ${version}; two independent synthetic calibrations; desktop/320px captures; start/30 s collection; CSV+PNG; condition restore; collapse; no page errors.`);
        console.log(`Synthetic artifacts: ${output}`);
        await context.close();
    } finally { await browser.close(); }
}

main().catch(error => {
    console.error(`Real-browser smoke did not pass: ${error.stack || error.message}`);
    console.error('No browser verification is claimed. Do not disable the host sandbox or silently replace the requested Chart.js version.');
    process.exitCode = 1;
});
