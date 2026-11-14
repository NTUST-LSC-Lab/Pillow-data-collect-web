// EXP03 uses the existing calibration view and queued firmware protocol.
// Pressure and classification receipts retain separate timestamps; missing seconds stay missing.
function createRapidExperiment(root, options) {
    const now = () => performance.now();
    const height = options.heightControl;
    const send = options.sendRapidCommand;
    const query = options.sendRapidQuery;
    let calibration, pending = null, busy = false, preparedKey = '', overviewKey = '';
    let drained = null;
    let firmwareProfile = '', firmwareAnchors = {}, pose = '1', current = null;
    let latest = null, message = '請先完成兩姿勢校正，並截圖儲存校正總覽。';
    let chart = null, lastPoll = -Infinity, lastModelSession = null, viewedRunId = '';
    const runs = [];
    const connected = () => Boolean(options.getSystemState().connected);
    const view = document.getElementById('comfortExperimentTemplate').content.firstElementChild.cloneNode(true);
    // Keep the calibration DOM, fields, suggestion and adjustments identical to EXP02.
    view.querySelectorAll(':scope > section')[2].hidden = true;
    view.querySelectorAll(':scope > section')[1].append(view.querySelector('#comfortStatus'));
    view.classList.add('rapid-calibration');
    view.querySelector(':scope > section').classList.add('rapid-subject');
    const setup = document.createElement('details'); setup.className = 'rapid-setup'; setup.open = true;
    const setupSummary = document.createElement('summary'); setupSummary.textContent = '受測者與校正';
    setup.append(setupSummary, view);
    const section = document.createElement('section'); section.className = 'comfort-section rapid-test';
    section.innerHTML = `
        <div class="rapid-heading">
          <div><h4>20 秒雙模型姿勢辨識</h4><p data-rapid="fixed" class="pressure-run-summary">固定高度：尚未準備</p></div>
          <div class="rapid-clock"><strong data-rapid="elapsed">00.0</strong><span>／20 秒</span></div>
        </div>
        <div class="comfort-buttons rapid-height-actions">
          <button type="button" data-rapid="reset" hidden>重新建立此受試者校正</button>
          <button type="button" class="primary" data-rapid="drain" disabled>受試者已離枕，抽乾並恢復開機高度</button>
          <button type="button" data-rapid="abort" hidden>停止抽乾／充氣</button>
          <button type="button" class="primary" data-rapid="prepare" disabled>套用姿勢一高度，準備測試</button>
        </div>
        <div class="rapid-pose-row">
          <div class="comfort-buttons" role="group" aria-label="本輪睡姿">
            <button type="button" data-rapid-pose="1" aria-pressed="true">姿勢一 · 仰躺</button>
            <button type="button" data-rapid-pose="5" aria-pressed="false">姿勢五 · 正側躺</button>
          </div>
          <p data-rapid="progress">姿勢一：未完成 · 姿勢五：未完成</p>
        </div>
        <label><input type="checkbox" data-rapid="empty"> 已確認受試者離枕，準備以選定姿勢重新躺下</label>
        <p class="pressure-field-hint">先確認即時壓力持續更新。頭部接觸枕頭時按開始，記錄20秒；不以壓力門檻自動判斷躺下。請維持指定姿勢並自然呼吸。</p>
        <div class="comfort-buttons rapid-actions">
          <button type="button" class="primary" data-rapid="start" disabled>開始記錄 20 秒</button>
          <button type="button" data-rapid="stop" hidden>提前結束</button>
          <button type="button" class="primary" data-rapid="finish" hidden>完成本輪</button>
          <button type="button" data-rapid="export" disabled>儲存CSV、結果總覽與壓力曲線</button>
        </div>
        <p data-rapid="status" role="status" aria-live="polite"></p>
        <div class="rapid-timing"><div class="rapid-checkpoints" data-rapid="checkpoints"></div></div>
        <p data-rapid="live" class="pressure-field-hint">等待壓力與分類資料</p>
        <p data-rapid="model-live" class="pressure-field-hint">等待模型結果</p>
        <p data-rapid="quality" class="pressure-field-hint"></p>
        <details class="rapid-disclosure" data-rapid-disclosure="records"><summary>壓力曲線、逐秒結果與各輪比較</summary>
          <div class="rapid-detail-body">
            <label class="rapid-run-picker">查看輪次 <select data-rapid="view-run" aria-label="查看記錄輪次"></select></label>
            <div class="pressure-chart-wrap"><canvas data-rapid="chart" aria-label="20 秒 Monitor、Neck、Head ADC 曲線"></canvas></div>
            <h4>第1～20秒分類結果</h4>
            <div class="comfort-trial-table"><table><thead><tr><th>秒</th><th>無歷史</th><th>Group1機率</th><th>Group2機率</th><th>有歷史</th><th>Group1機率</th><th>Group2機率</th></tr></thead><tbody data-rapid="seconds"></tbody></table></div>
            <p class="pressure-field-hint">Group1＝姿勢1、2；Group2＝姿勢3、4、5。每秒採該接收區間最後一筆新序號結果；歷史前6筆有效資料暖機，缺資料不補值。實際睡姿由操作者選擇，模型不細分五種姿勢。</p>
            <h4>各輪第3、5、10、15、20秒比較</h4>
            <div class="comfort-trial-table"><table><thead><tr><th>實際睡姿／輪次／模型</th><th>3 秒</th><th>5 秒</th><th>10 秒</th><th>15 秒</th><th>20 秒</th><th>狀態</th></tr></thead><tbody data-rapid="results"></tbody></table></div>
          </div>
        </details>
        <details class="rapid-disclosure"><summary>操作與儲存說明</summary>
          <div class="rapid-detail-body">
            <p class="pressure-field-hint"><strong>開始前必須完成同一位受測者的姿勢一、姿勢五校正，並等待裝置確認兩組分類校正基準。</strong>無歷史與有歷史模型都需要這兩組基準；缺少任一組時無法開始測試。換人須重新校正。</p>
            <p class="pressure-field-hint">兩種睡姿皆固定使用姿勢一校正高度。先儲存校正總覽，再請受試者離枕。裝置會逐顆抽乾氣囊，再充氣恢復開機高度；完成後才能套用姿勢一高度。全程請保持離枕。</p>
            <p class="pressure-field-hint">儲存逐秒分類CSV、壓力與分類事件CSV、結果總覽SVG及每輪壓力曲線PNG。壓力與分類保留各自時間；兩模型使用的ADC保存在分類列。重測新增輪次，離開或重新整理前請先儲存。</p>
          </div>
        </details>`;
    root.append(setup, section);
    const n = id => section.querySelector(`[data-rapid="${id}"]`);
    const info = () => calibration?.getCalibration();
    const key = () => { const c = info(); return c?.valid ? JSON.stringify([c.subject, c.record.profile, c.record.anchors]) : ''; };
    const profileKey = c => JSON.stringify([c.subject, c.record?.profile || options.getUserProfile()]);
    const active = () => Boolean(current?.recording || current?.awaitingConfirmation);
    const locked = () => busy || active();
    const cell = (run, second, kind) => rapidModelValues(rapidSecondRows(run)[second - 1].event, kind)[0];
    const pressureFresh = () => latest && Number.isFinite(latest.receivedMonotonicMs) && now() >= latest.receivedMonotonicMs && now() - latest.receivedMonotonicMs < 3000;
    const viewedRun = () => subjectRuns().find(r => r.id === viewedRunId) || subjectRuns().at(-1);
    function request(command, accept, timeout = 15000, poll) {
        if (pending) return Promise.reject(new Error('上一個裝置操作尚未完成'));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (pending?.id) options.sendExperimentCommand(`EXP02,STOP,${pending.id}`);
                drained = null;
                fail('等待裝置回覆逾時，已送出停止指令；請確認裝置狀態後重新抽乾。');
            }, timeout);
            pending = { accept, resolve, reject, timer, poll, family: command.split(',')[0], id: command.startsWith('EXP02,') ? command.split(',')[2] : null };
            try { if (command.startsWith('EXP02,')) options.sendExperimentCommand(command); else if (/^ANCHOR,GET,/.test(command)) query(command); else send(command); } catch (e) { fail(e.message); }
        });
    }
    function fail(text) {
        if (!pending) return;
        const p = pending; pending = null; clearTimeout(p.timer); p.reject(new Error(text));
    }
    async function syncFirmwareProfile(cal) {
        const p = options.getUserProfile();
        const pk = JSON.stringify([cal.subject, p]);
        if (firmwareProfile !== pk) {
            await request(`USER,${p.gender === 'male' ? 1 : 0},${p.age_years},${Math.trunc(p.body_height_cm)},${Math.trunc(p.body_weight_kg)}`, a => a[0] === 'USER' && a[1] === 'OK');
            firmwareProfile = pk; firmwareAnchors = {};
        }
    }
    async function captureFirmwareAnchor(cal) {
        preparedKey = overviewKey = '';
        await syncFirmwareProfile(cal);
        const target = cal.pose === '1' ? 'BSHS' : 'BLHL';
        // POSE enable does not enable PRED. prepare() already disabled PRED/legacy.
        await request('FEATURE,POSE,ON', a => a[0] === 'FEATURE' && a[1] === 'STATUS' && a[a.indexOf('POSE') + 1] === '1' && a[a.indexOf('PRED') + 1] === '0' && a[a.indexOf('LEGACY') + 1] === '0');
        let started = false, done = false;
        let anchor;
        try { anchor = await request(`ANCHOR,START,${target}`, a => {
            if (a.join(',') === `ANCHOR,OK,START,${target}`) started = true;
            if (started && a.join(',') === `ANCHOR,STATUS,DONE,${target}`) { done = true; query(`ANCHOR,GET,${target}`); }
            return done && a[0] === 'ANCHOR' && a[1] === 'OK' && a[2] === target && a.length === 8;
        }, 90000, () => query('ANCHOR,STATUS'));
        } catch (error) { send('ANCHOR,CANCEL'); throw error; }
        firmwareAnchors[target] = anchor.slice(3).join(',');
        await height.prepare();
    }
    calibration = createComfortExperiment(view, {
        ...options, calibrationOnly: true, experimentId: '03', folderId: 'ipillow-experiment-03',
        isLocked: locked, beforeCalibrationPrepare: syncFirmwareProfile, beforeCalibrationSave: captureFirmwareAnchor,
        onCalibrationChanged: () => { overviewKey = preparedKey = ''; drained = null; n('empty').checked = false; },
        onCalibrationOverviewSaved: () => { overviewKey = key(); preparedKey = ''; drained = null; n('empty').checked = false; message = '校正總覽已儲存。請受試者離枕，再按「受試者已離枕，抽乾並恢復開機高度」。'; },
        onChange: () => { if (calibration) render(); }
    });
    async function operate(work) {
        busy = true; render();
        try { await work(); }
        catch (e) { preparedKey = ''; message = e.message; }
        finally { busy = false; calibration.refresh(); }
    }
    const fixedReady = () => {
        const c = info(), state = height.getState();
        return Boolean(preparedKey && preparedKey === key() && c?.valid && connected() && !options.getSystemState().autoHeightPossible && state.ready &&
            state.head === c.record.anchors['1'].head && state.neck === c.record.anchors['1'].neck);
    };
    n('reset').addEventListener('click', () => {
        if (locked()) return;
        drained = null; preparedKey = overviewKey = firmwareProfile = ''; firmwareAnchors = {};
        calibration.resetCalibration(); message = '請以更新後的個人資料重新完成兩姿勢校正。'; render();
    });
    n('drain').addEventListener('click', () => {
        if (locked() || !connected() || !key() || overviewKey !== key()) return;
        operate(async () => {
            const k = key(), id = 'D03' + Date.now().toString(36).toUpperCase();
            drained = null; preparedKey = ''; n('empty').checked = false;
            message = '正在逐顆抽乾氣囊並充氣恢復開機高度，請受試者保持離枕；等待裝置完成回報。';
            render();
            let ack = false;
            await request(`EXP02,DRAIN,${id}`, a => {
                if (a.join(',') === `EXP02,ACK,${id},DRAIN`) ack = true;
                return ack && a.join(',') === `EXP02,DRAINED,${id}`;
            }, 660000, () => query(`EXP02,STATUS,${id}`));
            if (key() !== k || !connected()) throw new Error('受試者或校正資料已變更，請重新儲存總覽並抽乾。');
            drained = { key: k, id };
            message = '已恢復開機高度。請保持離枕，可以按「套用姿勢一高度，準備測試」。';
        });
    });
    n('abort').addEventListener('click', () => {
        if (pending?.family === 'EXP02' && pending.id) options.sendExperimentCommand(`EXP02,STOP,${pending.id}`);
    });
    n('prepare').addEventListener('click', () => {
        if (locked() || !key() || overviewKey !== key() || drained?.key !== key()) return;
        operate(async () => {
            const c = info(), k = key();
            if (firmwareProfile !== profileKey(c) || !firmwareAnchors.BSHS || !firmwareAnchors.BLHL) throw new Error('分類校正不屬於目前受試者，請重新校正兩個姿勢。');
            message = '確認分類基準，套用姿勢一高度，等待裝置到位…';
            for (const target of ['BSHS', 'BLHL']) {
                const a = await request(`ANCHOR,GET,${target}`, a => a[0] === 'ANCHOR' && a[1] === 'OK' && a[2] === target && a.length === 8);
                if (a.slice(3).join(',') !== firmwareAnchors[target]) throw new Error('韌體校正基準已變更，請重新校正。');
            }
            const anchor = c.record.anchors['1'], dryId = drained.id;
            drained = null; // A failed/interrupted fill must start with a new drain.
            const id = 'F03' + Date.now().toString(36).toUpperCase();
            let ack = false;
            await request(`EXP02,START,${id},HEIGHT_DRY,${anchor.head.toFixed(1)},${anchor.neck.toFixed(1)},${dryId}`, a => {
                if (a.join(',') === `EXP02,ACK,${id},HEIGHT_DRY`) ack = true;
                if (!(ack && a[0] === 'EXP02' && a[1] === 'DONE' && a[2] === id && a.length === 7)) return false;
                if (Number(a[5]) !== anchor.head || Number(a[6]) !== anchor.neck) throw new Error('裝置完成高度與姿勢一校正高度不符');
                return true;
            }, 660000, () => query(`EXP02,STATUS,${id}`));
            await height.prepare();
            if (key() !== k) throw new Error('受試者或校正資料已改變，請重新儲存校正總覽');
            preparedKey = k; n('empty').checked = false;
            message = '姿勢一高度已到位。請選睡姿並勾選離枕確認，再請受試者躺下，操作者按開始記錄。';
        });
    });
    section.querySelectorAll('[data-rapid-pose]').forEach(button => button.addEventListener('click', () => {
        if (locked()) return;
        pose = button.dataset.rapidPose; current = null; n('empty').checked = false; render();
    }));
    n('empty').addEventListener('change', render);
    n('view-run').addEventListener('change', () => { viewedRunId = n('view-run').value; render(); });
    n('start').addEventListener('click', async () => {
        if (locked() || !fixedReady() || !n('empty').checked) return;
        if (!pressureFresh()) { message = '尚未收到近期壓力，請確認三顆ADC持續更新後再開始。'; render(); return; }
        const c = info(), startedAt = new Date().toISOString();
        const run = current = { subject: c.subject, profile: { ...c.record.profile }, calibration: JSON.parse(JSON.stringify(c.record.anchors)),
            firmwareCalibration: Object.fromEntries(Object.entries(firmwareAnchors).map(([name, value]) => [name, value.split(',').map(Number)])),
            dataOrigin: options.simulated ? 'SIMULATED' : 'DEVICE', pose, head: height.getState().head, neck: height.getState().neck,
            id: startedAt + '-' + (runs.length + 1), startedAt, start: now(), recording: true, awaitingConfirmation: false,
            events: [], status: '記錄中', classificationStarted: false, session: null, lastSequence: null, blockedSession: lastModelSession };
        runs.push(run); viewedRunId = run.id; n('empty').checked = false;
        message = '20秒記錄中，正在啟動新的分類工作。'; render();
        try {
            // STOP is acknowledged before START so an already-running session cannot leak its history into this round.
            await request('CLASSIFY,STOP', a => a.join(',') === 'CLASSIFY,OK,STOP');
            if (!run.recording) return;
            await request('CLASSIFY,START', a => a.join(',') === 'CLASSIFY,OK,START');
            if (!run.recording) return;
            run.classificationStarted = true; run.startAckElapsedMs = now() - run.start;
            query('CLASSIFY,GET'); message = '記錄中，請維持指定睡姿並自然呼吸。'; render();
        } catch (e) {
            if (run.recording) { message = e.message; stop('分類啟動失敗'); }
        }
    });
    function stop(status) {
        if (!current?.recording) return;
        current.duration_ms = Math.min(RAPID_DURATION_MS, now() - current.start);
        current.recording = false; current.awaitingConfirmation = true; current.status = status;
        fail('本輪已停止'); send('CLASSIFY,STOP'); render();
    }
    n('stop').addEventListener('click', () => { message = '已保留部分資料，本輪未滿20秒。'; stop('提前結束'); });
    n('finish').addEventListener('click', () => {
        if (!current?.awaitingConfirmation) return;
        current.awaitingConfirmation = false;
        message = '本輪已確認。請先離枕，再選另一個姿勢或重新測試。'; calibration.refresh();
    });
    const comparison = () => ({ title: `${options.simulated ? '模擬資料｜' : ''}${info().subject}｜實驗03雙模型20秒結果`,
        details: [comfortProfileText(info().record?.profile), '起點：頭部接觸枕頭時按開始；秒數按Web接收時間分組。',
            'Group1＝姿勢1、2；Group2＝姿勢3、4、5。暖機／無效／缺資料皆不填入舊結果。',
            '20秒結束不代表分類完整；完整逐秒結果、機率與裝置序號請查看CSV。'],
        sections: [{ title: '所有測試輪次', headers: ['姿勢／輪次／模型', '3 秒', '5 秒', '10 秒', '15 秒', '20 秒', '狀態'], widths: [185, 130, 130, 130, 130, 130, 180],
            rows: subjectRuns().flatMap((r, i) => ['staticModel', 'historyModel'].map(kind => [`姿勢${r.pose}／${i + 1}／${kind === 'staticModel' ? '無歷史' : '有歷史'}`,
                ...RAPID_CHECKPOINTS.map(second => cell(r, second, kind)), r.status])) }] });
    function subjectRuns() { return runs.filter(r => r.subject === info()?.subject); }
    n('export').addEventListener('click', async () => {
        if (locked() || !info()?.folder) return;
        busy = true; render();
        try {
            const c = info(), name = `${c.subject}_03_${Date.now()}`, records = subjectRuns(), csv = rapidCsvFiles(records);
            await writeRapidFile(c.folder, name + '_逐秒分類.csv', csv.seconds);
            await writeRapidFile(c.folder, name + '_壓力與分類事件.csv', csv.events);
            for (let i = 0; i < records.length; i++) {
                await writeRapidFile(c.folder, `${name}_輪次${String(i + 1).padStart(2, '0')}_壓力曲線.png`, await rapidPressurePng(records[i], i));
            }
            if (!(await saveComfortImage(c.folder, name + '_結果總覽.svg', comparison()))) throw new Error('結果總覽未儲存');
            message = `已儲存2份CSV、結果總覽SVG及${records.length}張壓力曲線PNG。`;
        } catch (e) { message = `儲存未完成：${e.message}。本頁資料仍保留，可重試；請勿只依部分檔案判定已全部儲存。`; }
        finally { busy = false; render(); }
    });
    function render() {
        const c = info(), ready = fixedReady(), k = key();
        n('reset').hidden = !c?.record || c.valid; n('reset').disabled = locked();
        n('drain').disabled = locked() || !connected() || !k || overviewKey !== k;
        n('prepare').disabled = locked() || !connected() || !k || overviewKey !== k || drained?.key !== k;
        n('abort').hidden = !busy || pending?.family !== 'EXP02';
        n('fixed').textContent = c?.valid ? `固定高度：姿勢一　Head ${c.record.anchors['1'].head} cm／Neck ${c.record.anchors['1'].neck} cm · ${ready ? '已到位' : '尚未準備或待確認'}` : '固定高度：尚未準備';
        n('start').disabled = locked() || !ready || !n('empty').checked || !pressureFresh();
        n('empty').disabled = locked() || !ready;
        section.querySelectorAll('[data-rapid-pose]').forEach(b => { b.disabled = locked(); b.setAttribute('aria-pressed', String(b.dataset.rapidPose === pose)); });
        n('stop').hidden = !current?.recording;
        n('finish').hidden = !current?.awaitingConfirmation;
        n('export').disabled = locked() || !c?.folder || !subjectRuns().length;
        n('status').textContent = message;
        const elapsed = current ? (current.recording ? Math.min(RAPID_DURATION_MS, now() - current.start) : current.duration_ms || 0) / 1000 : 0;
        n('elapsed').textContent = elapsed.toFixed(1).padStart(4, '0');
        n('checkpoints').replaceChildren(...RAPID_CHECKPOINTS.map(s => { const span = document.createElement('span'); span.textContent = `第 ${s} 秒 ${elapsed >= s ? '✓' : '○'}`; return span; }));
        n('progress').textContent = ['1','5'].map(p => `姿勢${p}：${subjectRuns().filter(r => r.pose === p && r.status === '20秒結束' && !r.awaitingConfirmation).length} 輪完成`).join(' · ');
        const body = n('results'); body.replaceChildren();
        subjectRuns().forEach((r, i) => ['staticModel', 'historyModel'].forEach(kind => {
            const tr = document.createElement('tr');
            [`姿勢${r.pose}／${i + 1}／${kind === 'staticModel' ? '無歷史' : '有歷史'}`, ...RAPID_CHECKPOINTS.map(second => cell(r, second, kind)), r.status]
                .forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); }); body.append(tr);
        }));
        const viewing = viewedRun();
        n('view-run').replaceChildren(...subjectRuns().map((r, i) => { const option = document.createElement('option'); option.value = r.id; option.textContent = `第${i + 1}輪・姿勢${r.pose}・${r.status}`; return option; }));
        n('view-run').value = viewing?.id || ''; n('view-run').disabled = active() || busy;
        n('live').textContent = pressureFresh() ? `Monitor ${latest.monitor_adc}　Neck ${latest.neck_adc}　Head ${latest.head_adc} ADC` : '等待新的壓力資料';
        const secondsBody = n('seconds'); secondsBody.replaceChildren();
        if (viewing) {
            const passed = viewing.recording ? now() - viewing.start : viewing.duration_ms;
            for (const row of rapidSecondRows(viewing)) {
                const missing = viewing.recording && passed < row.second * 1000 ? '等待中' : row.status === 'NOT_RECORDED' ? '未記錄' : '缺資料';
                const tr = document.createElement('tr'); tr.dataset.second = String(row.second);
                [row.second, ...rapidModelValues(row.event, 'staticModel', missing), ...rapidModelValues(row.event, 'historyModel', missing)]
                    .forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.append(td); }); secondsBody.append(tr);
            }
            const q = rapidCompleteness(viewing);
            n('quality').textContent = `20秒中已有分類資料 ${q.received} 秒；無歷史有效 ${q.staticValid} 秒，有歷史有效 ${q.historyValid} 秒。暖機與讀值無效不計入有效分類。`;
            const last = viewing.events.filter(e => e.type === 'classification').at(-1);
            const fresh = last && (!viewing.recording || now() - viewing.start - last.elapsed_ms < 3000);
            n('model-live').textContent = fresh ? `最近結果｜無歷史：${rapidModelValues(last, 'staticModel')[0]}；有歷史：${rapidModelValues(last, 'historyModel')[0]}` : '等待新的模型結果';
        } else { n('quality').textContent = ''; n('model-live').textContent = '等待模型結果'; }
        if (root.isConnected && typeof Chart === 'function') {
            chart ||= new Chart(n('chart'), { type: 'line', data: { datasets: [] }, options: rapidChartOptions() });
            chart.data.datasets = rapidPressureDatasets(viewing); chart.update('none');
        }
        options.onChange?.();
    }
    function receiveLine(line, receipt = null) {
        const a = line.split(',').map(s => s.trim());
        if (pending) {
            if (a[1] === 'ERR' && a[0] === pending.family && (!pending.id || a[2] === pending.id || a.length === 3)) fail(a[0] === 'EXP02' && a[2] === 'BAD_COMMAND' ? '目前韌體不支援分段抽乾流程，請使用 spp3_BLE_v4_model 配對韌體；準備測試仍保持停用。' : `裝置回覆：${line}`);
            else {
                try { if (pending.accept(a)) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(a); } }
                catch (e) { fail(e.message); }
            }
        }
        if (a[0] !== 'CLASSIFY' || a[1] !== 'DATA' || !receipt || !Number.isFinite(receipt.receivedMonotonicMs)) return;
        const result = parseDualPoseResult(line);
        if (!result) return;
        if (!current?.recording) { lastModelSession = result.session; return; }
        if (!current.classificationStarted || result.session === current.blockedSession) return;
        const elapsed_ms = receipt.receivedMonotonicMs - current.start;
        if (elapsed_ms <= 0 || elapsed_ms > RAPID_DURATION_MS) return;
        if (current.session !== null && result.session !== current.session) {
            const difference = (result.session - current.session) >>> 0;
            if (difference > 0 && difference < 0x80000000) { message = '分類工作已變更，本輪停止，請重新開始。'; stop('分類工作變更'); }
            return;
        }
        if (current.lastSequence !== null) {
            const difference = (result.sequence - current.lastSequence) >>> 0;
            if (difference === 0 || difference >= 0x80000000) return;
        }
        current.session = lastModelSession = result.session; current.lastSequence = result.sequence;
        current.events.push({ type: 'classification', elapsed_ms, received_at: receipt.timestamp_iso, result });
        render();
    }

    setInterval(() => {
        if (!root.isConnected) return;
        if (locked() || preparedKey) height.tick();
        if (pending?.poll && now() - lastPoll > 1000) { lastPoll = now(); pending.poll(); }
        if (current?.recording) {
            if (!fixedReady()) { message = '裝置高度、控制狀態或受試者資料變更，本輪已中止。'; stop('狀態變更中止'); }
            else if (now() - current.start >= RAPID_DURATION_MS) { message = '20秒計時結束，請查看逐秒資料完整性，再按「完成本輪」。'; stop('20秒結束'); }
        }
        calibration.refresh();
    }, 250);
    return {
        refresh: () => calibration.refresh(), isBusy: () => locked() || calibration.isBusy(), isRunning: () => Boolean(current?.recording),
        ownsClassification: () => locked() || calibration.isBusy(),
        getUiState: () => ({ status: current?.recording ? 'running' : 'idle', statusText: current?.recording ? '20 秒記錄中' : preparedKey ? '已準備測試' : '待準備', hint: '校正 → 儲存總覽 → 離枕、抽乾並恢復開機高度 → 套用姿勢一高度 → 勾選確認 → 躺下記錄20秒。' }),
        receivePressure: sample => {
            if (![sample.monitor_adc, sample.neck_adc, sample.head_adc, sample.receivedMonotonicMs].every(Number.isFinite)) return;
            calibration.receivePressure(sample); latest = sample;
            if (current?.recording) { const t = sample.receivedMonotonicMs - current.start; if (t >= 0 && t <= RAPID_DURATION_MS) current.events.push({ ...sample, type: 'pressure', elapsed_ms: t, received_at: sample.timestamp_iso }); }
        }, receiveLine,
        onDisconnected: () => { drained = null; preparedKey = ''; firmwareProfile = ''; firmwareAnchors = {}; fail('BLE 已斷線'); if (current?.recording) stop('BLE 斷線中止'); calibration.onDisconnected(); message = 'BLE 已斷線。重新連線後請重新校正，再儲存校正總覽。'; },
        needsLeaveProtection: () => runs.length > 0 || calibration.needsLeaveProtection()
    };
}
