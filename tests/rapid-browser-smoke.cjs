// Real browser resize regression; synthetic chart/table data only, no BLE.
// PLAYWRIGHT_MODULE_PATH=/path/to/playwright node tests/rapid-browser-smoke.cjs
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
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        // Keep synthetic results in place while Chart.js still handles real resizes.
        await page.addInitScript(() => {
            const interval = window.setInterval.bind(window);
            window.setInterval = (callback, delay, ...args) => interval(() => {
                if (!window.__layoutFixtureFrozen) callback(...args);
            }, delay);
        });
        // Use the repository's real Chart.js without relying on the CDN or fonts.
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            const relative = url.hostname === 'cdn.jsdelivr.net' ? 'chart.umd.min.js'
                : url.hostname === 'ipillow.test' ? decodeURIComponent(url.pathname).slice(1) : null;
            if (!relative) return route.abort();
            const file = path.resolve(root, relative);
            if (!file.startsWith(root + path.sep)) return route.abort();
            try { await fs.access(file); await route.fulfill({ path: file }); }
            catch { await route.fulfill({ status: 404, body: '' }); }
        });
        for (const entry of ['index.html', 'preview.html']) {
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.goto(`http://ipillow.test/spp3_BLE/${entry}`);
            if (entry === 'index.html') {
                await page.click('#experimentAccordionToggle');
                await page.selectOption('#experimentSelect', '03');
            }
            for (const populated of [false, true]) {
                if (populated) await page.evaluate(() => {
                    window.__layoutFixtureFrozen = true;
                    const chart = Chart.getChart(document.querySelector('[data-rapid="chart"]'));
                    chart.data.datasets.forEach((dataset, i) => {
                        dataset.data = Array.from({ length: 16 }, (_, x) => ({ x, y: 1800000 + i * 100000 + x * 1000 }));
                    });
                    chart.update('none');
                    document.querySelector('[data-rapid="results"]').innerHTML = '<tr><td>姿勢五 · 第 10 輪</td>'
                        + '<td>BLHL-2（BLHL-1）</td>'.repeat(4) + '<td>已完成</td></tr>';
                });
                for (const width of [1440, 1024, 768, 390, 320, 1440]) {
                    await page.setViewportSize({ width, height: 1000 });
                    await page.waitForTimeout(300);
                    const bounds = await page.locator('.rapid-test').evaluate(card => {
                        const rect = card.getBoundingClientRect();
                        const canvas = card.querySelector('canvas').getBoundingClientRect();
                        const table = card.querySelector('.comfort-trial-table');
                        table.scrollLeft = table.scrollWidth;
                        return { client: card.clientWidth, scroll: card.scrollWidth,
                            chartFits: canvas.width > 0 && canvas.left >= rect.left && canvas.right <= rect.right,
                            tableScrollable: table.scrollWidth <= table.clientWidth || table.scrollLeft > 0 };
                    });
                    const context = `${entry}, populated=${populated}, viewport=${width}: ${JSON.stringify(bounds)}`;
                    assert.ok(bounds.scroll <= bounds.client + 1, context);
                    assert.ok(bounds.chartFits, context);
                    assert.ok(bounds.tableScrollable, context);
                    if (populated) assert.equal(await page.locator('[data-rapid="results"] tr').count(), 1);
                }
            }
            console.log(`PASS ${entry}: empty/populated, shrink and expand 320–1440px`);
        }
        assert.deepEqual(errors, [], 'No browser JavaScript errors');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
