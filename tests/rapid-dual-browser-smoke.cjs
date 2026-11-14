// Offline browser workflow. Synthetic pressures/predictions are NOT a model accuracy test.
// PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/rapid-dual-browser-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.RAPID_TEST_OUTPUT || '/private/tmp/ipillow-exp03-dual-preview';

(async () => {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true,
        executablePath: process.env.CHROME_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
    const downloads = [], errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
        page.on('pageerror', e => errors.push(e.message));
        page.on('download', d => downloads.push(d.saveAs(path.join(output, d.suggestedFilename()))));
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            const relative = url.hostname === 'cdn.jsdelivr.net' ? 'chart.umd.min.js'
                : url.hostname === 'ipillow.test' ? decodeURIComponent(url.pathname).slice(1) : null;
            if (!relative) return route.abort();
            const file = path.resolve(root, relative);
            if (!file.startsWith(root + path.sep)) return route.abort();
            try { await route.fulfill({ path: file }); } catch { await route.fulfill({ status: 404, body: '' }); }
        });
        await page.goto('http://ipillow.test/spp3_BLE/preview.html');
        const rapid = id => `[data-rapid="${id}"]`;
        const enabled = selector => page.waitForFunction(s => !document.querySelector(s).disabled, selector);
        await page.selectOption('#comfortSubject', 'S01');
        await page.click('#comfortFolder');
        for (const pose of ['1', '5']) {
            await page.click(`[data-comfort-calibrate="${pose}"]`);
            // Keep each target at the existing height so this tests save/capture, not height suggestions.
            await page.waitForFunction(() => !document.querySelector('#comfortCalHead').disabled);
            await page.fill('#comfortCalHead', '7'); await page.fill('#comfortCalNeck', '10');
            await enabled('#comfortCalStable'); await page.check('#comfortCalStable');
            await enabled('#comfortCalSave'); await page.click('#comfortCalSave');
            await page.waitForFunction(() => !document.querySelector('#comfortCalibration').open);
        }
        await page.click('#comfortAnchorShot');
        await enabled(rapid('drain')); await page.click(rapid('drain'));
        await enabled(rapid('prepare')); await page.click(rapid('prepare'));
        await enabled(rapid('empty')); await page.check(rapid('empty'));
        await page.click('#demoContact');
        assert.equal(await page.textContent('#demoContactState'), '目前模擬有人躺下的壓力');
        assert.equal(await page.locator(`${rapid('seconds')} tr`).count(), 0, 'contact does not auto-start');
        await enabled(rapid('start')); await page.click(rapid('start'));
        await page.waitForFunction(() => document.querySelector('[data-rapid="seconds"]').textContent.includes('暖機'));
        assert.equal(await page.locator(`${rapid('seconds')} tr`).count(), 20);
        assert.ok(await page.locator(rapid('stop')).isVisible());
        await page.waitForFunction(() => document.querySelector('[data-rapid="finish"]').hidden === false, null, { timeout: 25000 });
        assert.match(await page.textContent(rapid('status')), /20秒計時結束/);
        assert.match(await page.textContent(rapid('model-live')), /無歷史：Group1；有歷史：Group1/);
        await page.click(rapid('finish'));
        for (const width of [1440, 768, 390, 320, 1440]) {
            await page.setViewportSize({ width, height: 1100 }); await page.waitForTimeout(150);
            const fits = await page.locator('.rapid-test').evaluate(c => c.scrollWidth <= c.clientWidth + 1);
            assert.ok(fits, `completed round fits ${width}px`);
            if ([1440, 390].includes(width)) await page.locator('.rapid-test').screenshot({ path: path.join(output, `exp03-${width}.png`) });
        }
        // Second round must have a new device session and fresh history warmup.
        await page.click('#demoContact'); await page.click('[data-rapid-pose="5"]');
        await page.check(rapid('empty')); await page.click('#demoContact'); await page.click(rapid('start'));
        await page.waitForFunction(() => document.querySelector('[data-rapid="seconds"]').textContent.includes('暖機 1/6'));
        await page.waitForFunction(() => document.querySelector('[data-rapid="finish"]').hidden === false, null, { timeout: 25000 });
        assert.match(await page.textContent(rapid('model-live')), /無歷史：Group2；有歷史：Group2/);
        await page.click(rapid('finish')); await page.click(rapid('export'));
        await page.waitForFunction(() => document.querySelector('[data-rapid="status"]').textContent.includes('2張壓力曲線PNG'));
        const files = await page.evaluate(async () => Promise.all([...demoFiles].map(async ([name, blob]) =>
            ({ name, size: blob.size, text: name.endsWith('.csv') ? await blob.text() : null }))));
        const seconds = files.find(f => f.name.endsWith('_逐秒分類.csv'));
        const events = files.find(f => f.name.endsWith('_壓力與分類事件.csv'));
        const parse = text => {
            const rows = text.replace(/^\uFEFF/, '').split('\r\n').map(line => line.match(/"(?:[^"]|"")*"/g).map(v => v.slice(1,-1).replaceAll('""','"')));
            const headers = rows.shift(); rows.forEach(row => assert.equal(row.length, headers.length));
            return { headers, rows: rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
        };
        const s = parse(seconds.text), e = parse(events.text);
        assert.equal(s.headers.length, 41); assert.equal(e.headers.length, 40);
        assert.equal(s.rows.length, 40); assert.ok(s.rows.every(r => r.data_origin === 'SIMULATED'));
        assert.deepEqual([...new Set(s.rows.map(r => r.actual_pose))], ['1', '5']);
        const classified = e.rows.filter(r => r.event_type === 'classification');
        assert.equal(new Set(classified.map(r => `${r.run_id}/${r.session}/${r.sequence}`)).size, classified.length);
        assert.equal(new Set(classified.map(r => r.session)).size, 2);
        assert.ok(classified.every(r => +r.elapsed_ms > 0 && +r.elapsed_ms <= 20000));
        for (const pose of ['1', '5']) {
            const rows = classified.filter(r => r.actual_pose === pose);
            assert.equal(rows.filter(r => r.history_status === 'WARMUP').length, 6);
            assert.ok(rows.filter(r => r.history_status === 'OK').length >= 12);
            assert.ok(rows.filter(r => r.history_status === 'WARMUP').every(r => r.history_p_group1 === ''));
            assert.ok(e.rows.filter(r => r.event_type === 'pressure' && r.actual_pose === pose).length >= 38);
        }
        assert.equal(files.filter(f => f.name.endsWith('_壓力曲線.png') && f.size > 10000).length, 2);
        assert.ok(files.some(f => f.name.endsWith('_結果總覽.svg')));
        await Promise.all(downloads);
        assert.equal(downloads.length, 6, 'calibration overview + two CSVs + two PNGs + summary');
        assert.deepEqual(errors, []);
        console.log(`PASS offline two full 20-second rounds: ${classified.length} unique model packets, 40 CSV seconds, 6 downloads, 320–1440px; ${output}`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
