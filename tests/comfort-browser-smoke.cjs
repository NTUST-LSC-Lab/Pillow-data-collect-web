// Real Chrome, production HTML/CSS/controller/SVG; all pressure and BLE replies
// are synthetic. No real device is contacted. Output is kept outside the repo.
// PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/comfort-browser-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = process.env.COMFORT_SMOKE_OUTPUT || '/private/tmp/ipillow-exp02-adc-time-browser';
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? require(process.env.PLAYWRIGHT_MODULE_PATH) : require('playwright');

const bootstrap = `
document.body.replaceChildren(document.getElementById('comfortExperimentTemplate').content.firstElementChild.cloneNode(true));
const host = document.querySelector('.comfort-experiment');
host.style.maxWidth = '1200px'; host.style.margin = '16px auto';
window.__files = {}; window.__commands = []; window.__connected = true;
window.__pending = null;
const fileHandle = name => ({ createWritable: async () => {
    let content; return { write: async blob => { content = await blob.text(); },
        close: async () => { window.__files[name] = content; }, abort: async () => {} };
} });
window.showDirectoryPicker = async () => ({ name: 'SYNTHETIC_TEST_ONLY',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFileHandle: async (name, options) => {
        if (!options?.create && !(name in window.__files)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
        return fileHandle(name);
    } });
window.confirm = () => true;
const state = { ready: true, head: 7, neck: 10, settledMonotonicMs: 0 };
window.__experiment = createComfortExperiment(host, {
    onChange() {},
    heightControl: { getState: () => state, tick: () => {}, prepare: async () => state },
    getSystemState: () => ({ connected: window.__connected }),
    getUserProfile: () => ({ gender: 'male', age_years: 25, body_height_cm: 170, body_weight_kg: 65 }),
    sendExperimentCommand: command => {
        window.__commands.push(command);
        const p = command.split(',');
        if (p[1] === 'START') window.__pending = p;
        if (p[1] === 'STOP') { window.__pending = null; window.__experiment.receiveLine('EXP02,ERR,' + p[2] + ',STOPPED'); }
    }
});
window.__pressure = () => {
    window.__experiment.receivePressure({ head_adc: 1950000, neck_adc: 2080000, monitor_adc: 1800000,
        receivedMonotonicMs: performance.now(), timestamp_iso: new Date().toISOString() });
    window.__experiment.refresh();
};
window.__ack = (policy = 'ok') => {
    const p = window.__pending, id = p[2], mode = p[3];
    window.__experiment.receiveLine('EXP02,ACK,' + id + ',' + (policy === 'wrong-mode' ? 'ADC' : mode));
    if (!window.__pending || mode !== 'ADC_TIME' || policy === 'no-time') return;
    const h = comfortFillTime('head', Number(p[4])), n = comfortFillTime('neck', Number(p[5]));
    const reply = ['EXP02', 'TIME', id, h.calculatedMs.toFixed(3), n.calculatedMs.toFixed(3),
        h.commandMs, n.commandMs, Number(h.baselineFallback), Number(n.baselineFallback)];
    if (policy === 'bad-time') reply[6] = '1';
    window.__experiment.receiveLine(reply.join(','));
};
window.__finish = () => {
    const p = window.__pending; window.__pending = null;
    window.__experiment.receiveLine('EXP02,DONE,' + p[2] + ',1900000,1950000,' + (p[3] === 'HEIGHT' ? '7.0,10.0' : 'NA,NA'));
};
window.__experiment.refresh();
`;

async function main() {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 1360, height: 1100 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
        await page.route('https://ipillow-exp02.test/**', async route => {
            const relative = new URL(route.request().url()).pathname.slice(1);
            const filename = path.resolve(root, relative || 'spp3_BLE/index.html');
            if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return route.fulfill({ status: 404, body: '' });
            let body = fs.readFileSync(filename);
            if (filename.endsWith('index.html')) body = body.toString().replace(/<script src="\.\/app\.js"><\/script>/, '')
                .replace('</body>', '<script>' + bootstrap + '</script></body>');
            return route.fulfill({ contentType: filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : 'application/javascript', body });
        });
        const pressure = () => page.evaluate(() => window.__pressure());
        const waitIdle = () => page.waitForFunction(() => !window.__experiment.isBusy());
        async function setup() {
            await page.goto('https://ipillow-exp02.test/spp3_BLE/index.html');
            await page.locator('#comfortSubject').selectOption('S01');
            for (const pose of ['1', '5']) {
                await page.locator('[data-comfort-calibrate="' + pose + '"]').click();
                await page.waitForFunction(() => !document.querySelector('#comfortCalStable').disabled);
                await pressure();
                await page.locator('#comfortCalStable').check();
                await page.locator('#comfortCalSave').click();
            }
            await waitIdle();
            await page.locator('#comfortFolder').click();
            await page.waitForFunction(() => document.querySelector('#comfortFolderStatus').textContent.includes('SYNTHETIC_TEST_ONLY'));
            await waitIdle();
        }
        async function start(method) {
            await page.locator('#comfortEmptyConfirmed').check();
            await page.locator('[data-comfort-method="' + method + '"]').click();
            await page.waitForFunction(() => Boolean(window.__pending));
        }
        await setup();
        fs.mkdirSync(output, { recursive: true });
        // Eight complete conditions exercise next-run ownership and both modes.
        for (const pose of ['1', '5']) {
            await page.locator('[data-comfort-pose="' + pose + '"]').click();
            for (const method of ['R', 'M', 'A', 'I']) {
                await start(method);
                assert.equal(await page.locator('#comfortCapture').isVisible(), false);
                const parts = await page.evaluate(() => [...window.__pending]);
                assert.equal(parts[3], method === 'I' ? 'HEIGHT' : 'ADC_TIME');
                // Replies from a different run must never unlock capture.
                await page.evaluate(() => window.__experiment.receiveLine('EXP02,DONE,OTHER,1,2,NA,NA'));
                assert.equal(await page.locator('#comfortCapture').isVisible(), false);
                await page.evaluate(() => { window.__ack(); window.__finish(); });
                await page.waitForFunction(() => document.querySelector('#comfortStatus').textContent.includes('充氣已完成'));
                await pressure();
                await page.locator('#comfortCapture').click();
                await pressure();
                await page.locator('#comfortCapture').click();
                await page.locator('#comfortScore').selectOption(method === 'R' ? '0' : '10');
                await page.locator('#comfortResultShot').click();
                await page.waitForFunction(() => document.querySelector('#comfortStatus').textContent.includes('已儲存'));
                const svg = await page.evaluate(({ pose, method }) => window.__files['S01_姿勢' + (pose === '1' ? '一' : '五') + '_' + method + '.svg'], { pose, method });
                assert.ok(svg.includes('空枕設定與實測') && svg.includes('躺回後') && svg.includes('滿意度'));
                if (method !== 'I') {
                    assert.ok(svg.includes('理論時間') && svg.includes('裝置確認時間'));
                    assert.ok(!svg.includes('待裝置確認'));
                }
                if (pose === '1' && method === 'R') {
                    assert.ok(svg.includes('開機基準備援（負時間）') && svg.includes('10.000 s'));
                    fs.writeFileSync(path.join(output, 'SYNTHETIC_fallback.svg'), svg);
                    await page.screenshot({ path: path.join(output, 'SYNTHETIC_desktop.png'), fullPage: true });
                    await page.setViewportSize({ width: 375, height: 1000 });
                    const layout = await page.locator('.comfort-experiment').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
                    assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
                    await page.screenshot({ path: path.join(output, 'SYNTHETIC_mobile.png'), fullPage: true });
                    await page.setViewportSize({ width: 1360, height: 1100 });
                }
            }
        }
        assert.match(await page.locator('#comfortProgress').textContent(), /姿勢一 4／4.*姿勢五 4／4/);
        assert.equal(await page.evaluate(() => Object.keys(window.__files).length), 8);

        // A saved SVG must have visible table cells inside the image/column bounds.
        const overflow = await page.evaluate(() => {
            const mount = document.createElement('div'); mount.innerHTML = window.__files['S01_姿勢一_R.svg']; document.body.append(mount);
            const svg = mount.firstElementChild, texts = [...svg.querySelectorAll('text')];
            const bad = texts.filter(t => t.getBBox().x + t.getBBox().width > Number(svg.getAttribute('width')) - 8).map(t => t.textContent);
            mount.remove(); return bad;
        });
        assert.deepEqual(overflow, []);

        await setup();
        await start('R');
        await page.locator('#comfortCancel').click();
        await waitIdle();
        assert.match(await page.locator('#comfortStatus').textContent(), /STOPPED/);
        await start('A');
        await page.evaluate(() => window.__ack('bad-time'));
        await waitIdle();
        assert.match(await page.locator('#comfortStatus').textContent(), /不一致/);
        assert.ok(await page.evaluate(() => window.__commands.at(-1).startsWith('EXP02,STOP,')));
        await start('M');
        await page.evaluate(() => { window.__ack('no-time'); window.__finish(); });
        await waitIdle();
        assert.match(await page.locator('#comfortStatus').textContent(), /缺少/);
        await start('R');
        await page.evaluate(() => { window.__connected = false; window.__experiment.onDisconnected(); });
        await waitIdle();
        assert.match(await page.locator('#comfortStatus').textContent(), /斷線/);
        await page.evaluate(() => { window.__connected = true; window.__experiment.refresh(); });
        await start('R');
        await page.evaluate(() => { window.__ack('wrong-mode'); });
        await waitIdle();
        assert.match(await page.locator('#comfortStatus').textContent(), /模式回覆不一致/);
        assert.deepEqual(errors, []);
        console.log('PASS: real Chrome, eight R/M/A/I conditions, SVG, negative fallback, wrong ID/mode/TIME, STOP, disconnect/reconnect, responsive layout, no page errors.');
        console.log('Synthetic artifacts:', output);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
