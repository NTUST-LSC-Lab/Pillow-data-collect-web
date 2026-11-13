// Full production page with synthetic BLE writes/20-byte notifications. No hardware.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            const relative = url.hostname === 'cdn.jsdelivr.net' ? 'chart.umd.min.js'
                : url.hostname === 'ipillow.test' ? decodeURIComponent(url.pathname).slice(1) : null;
            if (!relative) return route.abort();
            const file = path.resolve(root, relative);
            if (!file.startsWith(root + path.sep)) return route.abort();
            try { await route.fulfill({ path: file }); }
            catch { await route.fulfill({ status: 404, body: '' }); }
        });
        await page.goto('http://ipillow.test/spp3_BLE/index.html');
        await page.evaluate(() => {
            window.__commands = []; window.__anchors = {};
            window.__notify = text => {
                const bytes = new TextEncoder().encode(text + '\n');
                for (let i = 0; i < bytes.length; i += 20) {
                    const chunk = bytes.slice(i, i + 20);
                    handleNotifications({ target: { value: new DataView(chunk.buffer) } });
                }
            };
            serial_ready = true; bluetoothDevice = { name: 'Synthetic fixture', gatt: { connected: true } };
            rxCharacteristic = { writeValue: async bytes => {
                const command = new TextDecoder().decode(bytes).trim(); window.__commands.push(command);
                if (command.startsWith('FEATURE,')) __notify('FEATURE,STATUS,LEGACY,0,POSE,1,PRED,0');
                else if (command.startsWith('USER,')) __notify('USER,OK');
                else if (command === 'CLASSIFY,START') __notify('CLASSIFY,OK,START');
                else if (command === 'CLASSIFY,STOP') __notify('CLASSIFY,OK,STOP');
                else if (command === 'CLASSIFY,GET' && window.__lastFrame) __notify(window.__lastFrame);
                else if (command.startsWith('ANCHOR,START,')) {
                    const target = command.split(',')[2];
                    __notify(`ANCHOR,OK,START,${target}`);
                    __anchors[target] = `ANCHOR,OK,${target},1900000.0,2200000.0,2100000.0,8.0,11.0`;
                    __notify(`ANCHOR,STATUS,DONE,${target}`); __notify(__anchors[target]);
                } else if (command.startsWith('ANCHOR,GET,')) __notify(__anchors[command.split(',')[2]] || 'ANCHOR,ERR,NOT_READY');
                else if (command.startsWith('INIT,')) {
                    __notify('INIT,OK,8.0,11.0'); __notify('I:0 5 0 0 0 0 0'); __notify('I:0 5 0 0 0 0 0');
                } else if (command === 'DEBUG') __notify('gender=0\nage=25\nheight=170\nweight=65\nHLF=8.0\nN1LF=11.0\nheadNumber=8.0\nneckNumber=11.0\ncurrentHeadNumber=8.0\ncurrentNeckNumber=11.0\nN2LP=1900000\nanchor_state=IDLE\nanchor_target=NONE\nclassifier=DUAL_CATBOOST_V1');
            } };
        });
        await page.check('#female'); await page.fill('#age','25'); await page.fill('#height','170'); await page.fill('#weight','65');
        await page.click('#userSet');
        assert.match(await page.textContent('#anchorBshsValue'), /尚未取得/);
        await page.click('#openCalibBtn');
        assert.match(await page.textContent('#anchorBshsValue'), /尚未取得/, 'opening initial calibration is not capture');
        await page.click('#startSupineCalibBtn'); await page.click('#completeSupineCalibBtn');
        await page.waitForFunction(() => document.getElementById('anchorBshsStatus').textContent === '完成');
        assert.match(await page.textContent('#anchorBshsValue'), /Monitor 1,900,000 ADC/);
        await page.click('#startSideCalibBtn'); await page.click('#completeSideCalibBtn');
        await page.waitForFunction(() => document.getElementById('anchorBlhlStatus').textContent === '完成');
        await page.click('#closeCalibModalBtn');
        await page.click('#autoModeBtn');
        await page.waitForFunction(() => window.__commands.includes('CLASSIFY,START'));
        // The PRED=0 status must not silently switch classification back to stopped.
        assert.equal(await page.textContent('#controlModeBadge'), '辨識中');
        const selector = name => `[data-pose-model="${name}"]`;
        const frame = (sequence, history, count) => `CLASSIFY,DATA,V1,1,${sequence},9000,24,8990,1700000,2000000,2100000,OK,GROUP1,0.8,0.2,${history},${count},0,1200`;
        const inject = line => page.evaluate(line => { window.__lastFrame = line; __notify(line); }, line);
        await inject(frame(1, 'WARMUP,UNKNOWN,NA,NA', 0));
        assert.equal(await page.textContent(selector('static-group')), 'Group1');
        assert.equal(await page.textContent(selector('history-status')), '暖機中（1/6）');
        await inject(frame(7, 'OK,GROUP2,0.2,0.8', 6));
        assert.equal(await page.textContent(selector('history-group')), 'Group2');
        assert.equal(await page.textContent(selector('static-p1')), '80.00%');
        // Partial transport fallback must not publish a numerically valid truncated last field.
        await page.evaluate(line => serial_message(line, LOG_SUCCESS_GREEN, false), frame(8, 'OK,GROUP1,0.8,0.2', 7));
        assert.equal(await page.textContent(selector('history-group')), 'Group2');
        for (const width of [1440,1024,768,390,320,1440]) {
            await page.setViewportSize({ width, height: 1000 });
            await inject(frame(10 + width, 'OK,GROUP2,0.2,0.8', 6));
            await page.waitForTimeout(100);
            const fits = await page.locator('#poseModelPanel').evaluate(card => {
                const r = card.getBoundingClientRect();
                return card.scrollWidth <= card.clientWidth + 1 && Array.from(card.querySelectorAll('.info-block,.mode-control-block,.pose-model-meta'))
                    .every(node => { const b = node.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right + 1; });
            });
            assert.ok(fits, `status card fits at ${width}px`);
        }
        // Use increasing sequence after the viewport checks, and save only synthetic previews outside repo.
        await inject(frame(2000, 'OK,GROUP2,0.2,0.8', 6));
        await page.locator('#poseModelPanel').screenshot({ path: '/private/tmp/ipillow-pose-model-desktop.png' });
        await page.setViewportSize({ width: 390, height: 1800 });
        await page.locator('#poseModelPanel').screenshot({ path: '/private/tmp/ipillow-pose-model-mobile.png' });
        await page.waitForTimeout(4200);
        assert.equal(await page.textContent(selector('static-status')), '等待新資料', 'duplicate GET replies do not extend freshness');
        await inject('CLASSIFY,DATA,V1,1,2001,10000,25,9990,1700000,2000000,2100000,INVALID,UNKNOWN,NA,NA,INVALID,UNKNOWN,NA,NA,7,0,0');
        assert.equal(await page.textContent(selector('static-status')), '本秒讀值無效');
        await page.click('#manualModeBtn');
        assert.equal(await page.textContent(selector('static-group')), '—');
        assert.equal(await page.textContent('#controlModeBadge'), '已停止');
        const commands = await page.evaluate(() => window.__commands);
        assert.ok(commands.includes('ANCHOR,START,BSHS') && commands.includes('ANCHOR,START,BLHL'));
        assert.ok(!commands.some(c => /^(PRED,START|PRED,GET|FEATURE,PRED,ON)$/.test(c)));
        await page.evaluate(() => onDisconnected({ target: bluetoothDevice }));
        assert.match(await page.textContent(selector('notice')), /BLE 已斷線/);
        assert.equal(await page.textContent('#anchorBshsValue'), '尚未取得');
        assert.deepEqual(errors, [], 'No page exceptions');
        console.log('PASS browser: initial-calibration buttons → anchors; start/stop, independent models, 20-byte BLE chunks, partial rejection, warmup/invalid/stale/disconnect, no PRED enable, responsive 320–1440px');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
