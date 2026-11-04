// Real-browser / real-Chart.js regression. Synthetic S00 samples only; no BLE/device data.
// Run separately from node --test: node tests/chart-browser-smoke.cjs
// Optional environment:
//   PLAYWRIGHT_MODULE_PATH=/absolute/path/to/playwright
//   CHROME_EXECUTABLE_PATH=/absolute/path/to/chrome
//   CHART_JS_PATH=/absolute/path/to/chart.umd.js  (offline, unmodified library)
//   EXPECTED_CHART_VERSION=4.6.1                 (default: reported failing version)
// This harness loads the production HTML/template/CSS and Hub/controller/recorder.
// It replaces app.js with synthetic system/sample/control providers, not a mock Chart.
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
    window.__smokeSystem = { connected: true, autoHeightPossible: false };
    window.__smokeHeight = { prepared: false, ready: false, busy: false, reason: '尚未準備',
        head: null, neck: null, targetHead: null, targetNeck: null, receivedMonotonicMs: null };
    window.__smokeHeightCalls = [];
    const heightControl = {
        async prepare() {
            window.__smokeHeightCalls.push({ action: 'prepare' });
            Object.assign(window.__smokeHeight, { prepared: true, ready: true, busy: false, reason: '',
                head: 7, neck: 10, targetHead: 7, targetNeck: 10, receivedMonotonicMs: window.__smokeClock });
        },
        async adjust(channel, height) {
            window.__smokeHeightCalls.push({ action: 'adjust', channel, height });
            const key = String(channel).toUpperCase() === 'HEAD' ? 'head' : 'neck';
            Object.assign(window.__smokeHeight, { [key]: height,
                [key === 'head' ? 'targetHead' : 'targetNeck']: height,
                ready: true, busy: false, reason: '', receivedMonotonicMs: window.__smokeClock });
        },
        getState: () => ({ ...window.__smokeHeight }), tick() {}
    };
    window.__smokeHub = createExperimentHub(document.getElementById('experimentHub'), {
        pressureConfig: ${JSON.stringify(config)}, getSystemState: () => ({ ...window.__smokeSystem }), heightControl
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

        await page.locator('#pressureSubject').fill('S00');
        await page.locator('#pressureHeadHeight').fill('8');
        await page.locator('#pressureNeckHeight').fill('11');
        await page.locator('#pressureSetupConfirmed').check();
        await page.evaluate(() => {
            window.__smokeAdvance(1000, [100, 200, 300]);
            window.__smokeAdvance(2000, [101, 201, 301]);
        });
        await page.locator('#pressureCalibrationPrepare').click();
        await page.locator('#pressureCalibrationHead').fill('8');
        await page.locator('#pressureCalibrationHeadApply').click();
        await page.locator('#pressureCalibrationNeck').fill('11');
        await page.locator('#pressureCalibrationNeckApply').click();
        await page.evaluate(() => window.__smokeAdvance(2000, [111, 222, 333]));
        await page.locator('#pressureCalibrationStable').check();
        await page.locator('#pressureCalibrationCapture').click();
        const pose1Capture = await page.locator('#pressureCalibrationPose1Saved').textContent();
        assert.match(pose1Capture, /S00/); assert.match(pose1Capture, /111/);
        await page.locator('#pressureCalibrationPose').selectOption('pose5');
        await page.locator('#pressureCalibrationHead').fill('12');
        await page.locator('#pressureCalibrationHeadApply').click();
        await page.locator('#pressureCalibrationNeck').fill('13');
        await page.locator('#pressureCalibrationNeckApply').click();
        await page.evaluate(() => window.__smokeAdvance(2000, [444, 555, 666]));
        await page.locator('#pressureCalibrationStable').check();
        await page.locator('#pressureCalibrationCapture').click();
        assert.equal(await page.locator('#pressureCalibrationPose1Saved').textContent(), pose1Capture);
        assert.match(await page.locator('#pressureCalibrationPose5Saved').textContent(), /444/);
        assert.equal(await page.locator('#pressureHeadHeight').inputValue(), '8');
        assert.equal(await page.locator('#pressureNeckHeight').inputValue(), '11',
            'preparing, adjusting and capturing either pose must not fill run heights');
        const heightCalls = await page.evaluate(() => window.__smokeHeightCalls);
        assert.equal(heightCalls.filter(call => call.action === 'prepare').length, 1);
        assert.equal(heightCalls.filter(call => call.action === 'adjust').length, 4);
        assert.equal(await page.locator('#pressureRunStatus').textContent(), '尚未開始');
        fs.mkdirSync(output, { recursive: true });
        await page.locator('#pressureCalibrationPose1Saved').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, 'SYNTHETIC_calibration-desktop.png'), fullPage: true });
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
        await page.locator('#pressureCalibrationHeadApply').click();
        await page.locator('#pressureCalibrationNeck').fill('11');
        await page.locator('#pressureCalibrationNeckApply').click();
        await page.evaluate(() => window.__smokeAdvance(2000, [111, 222, 333]));
        await page.locator('#pressureSetupConfirmed').check();
        assert.equal(await page.locator('#experimentStart').isEnabled(), true, 'A live valid setup must enable Start');
        await page.locator('#experimentStart').click();
        await page.evaluate(() => {
            for (let i = 0; i < 30; i++) window.__smokeAdvance(2400 + i * 1000, [1000 + i, 2000 + i, 3000 + i]);
            window.__smokeAdvance(32000);
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

        await page.locator('#experimentExport').click();
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
        assert.equal(csvHeader.length, 23);
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
        const blank = await page.evaluate(() => Chart.getChart(document.getElementById('pressureRunChart')).data.datasets[0].data.length);
        assert.equal(blank, 0);
        await page.locator('#pressureCondition').selectOption('01');
        assert.equal(await page.locator('#pressureSampleCount').textContent(), '30');
        const restored = await page.evaluate(() => Chart.getChart(document.getElementById('pressureRunChart')).data.datasets[0].data.length);
        assert.equal(restored, 30, 'Switching back restores the actual rendered condition curve');

        await page.locator('#pressureCondition').selectOption('02');
        await page.locator('#pressureSetupConfirmed').check();
        await page.locator('#experimentStart').click();
        await page.locator('#experimentAccordionToggle').click();
        await page.evaluate(() => window.__smokeAdvance(32200, [7, 8, 9]));
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
