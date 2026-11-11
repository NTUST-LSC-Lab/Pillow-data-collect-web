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
    let chart = null, lastPoll = -Infinity;
    const runs = [];
    const connected = () => Boolean(options.getSystemState().connected);
    const view = document.getElementById('comfortExperimentTemplate').content.firstElementChild.cloneNode(true);
    // Keep the calibration DOM, fields, suggestion and adjustments identical to EXP02.
    view.querySelectorAll(':scope > section')[2].hidden = true;
    view.querySelectorAll(':scope > section')[1].append(view.querySelector('#comfortStatus'));
    const section = document.createElement('section'); section.className = 'comfort-section rapid-test';
    section.innerHTML = `
        <h4>15 秒快速姿勢辨識</h4>
        <p class="pressure-field-hint">兩種睡姿皆固定使用姿勢一校正高度。先儲存校正總覽，再請受試者離枕並開始抽乾。抽乾完成後才能套用高度。</p>
        <button type="button" data-rapid="reset" hidden>重新建立此受試者校正</button>
        <button type="button" class="primary" data-rapid="drain" disabled>受試者已離枕，開始抽乾</button>
        <button type="button" data-rapid="abort" hidden>停止抽乾／充氣</button>
        <button type="button" class="primary" data-rapid="prepare" disabled>套用姿勢一高度，準備測試</button>
        <p data-rapid="fixed" class="pressure-run-summary">固定高度：尚未準備</p>
        <div class="comfort-buttons" role="group" aria-label="本輪睡姿">
          <button type="button" data-rapid-pose="1" aria-pressed="true">姿勢一 · 仰躺</button>
          <button type="button" data-rapid-pose="5" aria-pressed="false">姿勢五 · 正側躺</button>
        </div>
        <p data-rapid="progress">姿勢一：未完成 · 姿勢五：未完成</p>
        <label><input type="checkbox" data-rapid="empty"> 已確認受試者離枕，準備以選定姿勢重新躺下</label>
        <p class="pressure-field-hint">頭部接觸枕頭時立即按開始；本輪起點為按鍵時間，不需等待壓力穩定。維持指定姿勢並自然呼吸。</p>
        <div class="comfort-buttons">
          <button type="button" class="primary" data-rapid="start" disabled>開始記錄 15 秒</button>
          <button type="button" data-rapid="stop" hidden>提前結束</button>
          <button type="button" class="primary" data-rapid="finish" hidden>完成本輪</button>
        </div>
        <p data-rapid="status" role="status" aria-live="polite"></p>
        <div class="rapid-clock"><strong data-rapid="elapsed">00.0</strong><span>／15 秒</span></div>
        <div class="rapid-checkpoints" data-rapid="checkpoints"></div>
        <p data-rapid="live" class="pressure-field-hint">等待壓力與分類資料</p>
        <div class="pressure-chart-wrap"><canvas data-rapid="chart" aria-label="15 秒 Monitor、Neck、Head 原始 ADC 曲線"></canvas></div>
        <h4>第 3、5、10、15 秒比較</h4>
        <div class="comfort-trial-table"><table><thead><tr><th>實際睡姿／輪次</th><th>3 秒</th><th>5 秒</th><th>10 秒</th><th>15 秒</th><th>狀態</th></tr></thead><tbody data-rapid="results"></tbody></table></div>
        <p class="pressure-field-hint">顯示該秒內最後收到的平滑分類，括號為原始分類；缺資料不沿用前秒。不自動推定數字姿勢與韌體標籤的對應正誤。</p>
        <button type="button" data-rapid="export" disabled>儲存結果總覽＋CSV</button>
        <p class="pressure-field-hint">CSV 保留每筆壓力、分類、實際接收時間、基本資料與固定高度。重測新增輪次；離開或重新整理前請先儲存。</p>`;
    root.append(view, section);
    const n = id => section.querySelector(`[data-rapid="${id}"]`);
    const info = () => calibration?.getCalibration();
    const key = () => { const c = info(); return c?.valid ? JSON.stringify([c.subject, c.record.profile, c.record.anchors]) : ''; };
    const profileKey = c => JSON.stringify([c.subject, c.record?.profile || options.getUserProfile()]);
    const active = () => Boolean(current?.recording || current?.awaitingConfirmation);
    const locked = () => busy || active();
    const cell = (run, second) => {
        const values = run.events.filter(e => e.type === 'classification' && e.elapsed_ms > (second - 1) * 1000 && e.elapsed_ms <= second * 1000);
        const e = values.at(-1);
        return e ? `${e.smooth}（${e.raw}）` : '缺資料';
    };
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
        onCalibrationOverviewSaved: () => { overviewKey = key(); preparedKey = ''; drained = null; n('empty').checked = false; message = '校正總覽已儲存。請受試者離枕，再按「受試者已離枕，開始抽乾」。'; },
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
            message = '正在抽乾氣囊，請受試者保持離枕；等待裝置完成回報。';
            render();
            let ack = false;
            await request(`EXP02,DRAIN,${id}`, a => {
                if (a.join(',') === `EXP02,ACK,${id},DRAIN`) ack = true;
                return ack && a.join(',') === `EXP02,DRAINED,${id}`;
            }, 480000, () => query(`EXP02,STATUS,${id}`));
            if (key() !== k || !connected()) throw new Error('受試者或校正資料已變更，請重新儲存總覽並抽乾。');
            drained = { key: k, id };
            message = '氣囊已抽乾。可以按「套用姿勢一高度，準備測試」。';
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
                if (a.slice(3).join(',') !== firmwareAnchors[target]) throw new Error('韌體 anchor 已變更，請重新校正。');
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
    n('start').addEventListener('click', () => {
        if (locked() || !fixedReady() || !n('empty').checked) return;
        const c = info();
        current = { subject: c.subject, profile: { ...c.record.profile }, calibration: JSON.parse(JSON.stringify(c.record.anchors)),
            pose, head: height.getState().head, neck: height.getState().neck, id: new Date().toISOString(),
            start: now(), recording: true, awaitingConfirmation: false, events: [], status: '記錄中', classificationStarted: false };
        runs.push(current); n('empty').checked = false;
        message = '記錄中，請維持指定睡姿並自然呼吸。';
        // Firmware START clears its smoothing history each run, without enabling PRED.
        request('CLASSIFY,START', a => a.join(',') === 'CLASSIFY,OK,START').then(() => {
            if (current?.recording) { current.classificationStarted = true; query('CLASSIFY,GET'); }
        }).catch(e => { message = e.message; stop('分類啟動失敗'); });
        render();
    });
    function stop(status) {
        if (!current?.recording) return;
        current.duration_ms = Math.min(15000, now() - current.start);
        current.recording = false; current.awaitingConfirmation = true; current.status = status;
        fail('本輪已停止'); send('CLASSIFY,STOP'); render();
    }
    n('stop').addEventListener('click', () => { stop('提前結束'); message = '已保留部分資料，本輪未滿 15 秒。'; });
    n('finish').addEventListener('click', () => {
        if (!current?.awaitingConfirmation) return;
        current.awaitingConfirmation = false;
        message = '本輪已確認。請先離枕，再選另一個姿勢或重新測試。'; calibration.refresh();
    });
    const comparison = () => ({ title: `${info().subject}｜實驗 03 快速姿勢辨識`,
        details: [comfortProfileText(info().record?.profile), '起點：操作者於頭部接觸枕頭時按開始。分類為韌體 CLASSIFY 回覆。', '每格顯示該秒內最後收到的平滑分類（原始分類）；缺資料不補值。'],
        sections: [{ title: '所有測試輪次', headers: ['姿勢／輪次', '3 秒', '5 秒', '10 秒', '15 秒', '狀態'], widths: [160, 170, 170, 170, 170, 160],
            rows: subjectRuns().map((r, i) => [`姿勢${r.pose}／${i + 1}`, ...[3, 5, 10, 15].map(s => cell(r, s)), r.status]) }] });
    function subjectRuns() { return runs.filter(r => r.subject === info()?.subject); }
    n('export').addEventListener('click', () => {
        if (locked() || !info()?.folder) return;
        operate(async () => {
            const c = info(), name = `${c.subject}_03_${Date.now()}`;
            const columns = ['run_id','subject','gender','age_years','height_cm','weight_kg','pose','head_cm','neck_cm','run_status','event_type','elapsed_ms','received_at','monitor_adc','neck_adc','head_adc','smooth','raw','score_e','score_supine','score_side_mean','score_pm_rule','calibration_json'];
            const rows = subjectRuns().flatMap(r => [
                [r.id,r.subject,r.profile.gender,r.profile.age_years,r.profile.body_height_cm,r.profile.body_weight_kg,r.pose,r.head,r.neck,r.status,'run',0,r.id,'','','','','','','','','',JSON.stringify(r.calibration)],
                ...r.events.map(e => [r.id,r.subject,r.profile.gender,r.profile.age_years,r.profile.body_height_cm,r.profile.body_weight_kg,r.pose,r.head,r.neck,r.status,e.type,e.elapsed_ms,e.received_at,e.monitor_adc,e.neck_adc,e.head_adc,e.smooth,e.raw,...(e.scores || ['','','','']),''])
            ]);
            const csv = '\uFEFF' + [columns,...rows].map(row => row.map(v => '"' + String(v ?? '').replaceAll('"','""') + '"').join(',')).join('\r\n');
            const handle = await c.folder.getFileHandle(name + '.csv', { create: true });
            const writer = await handle.createWritable();
            try { await writer.write(csv); await writer.close(); } catch (e) { await writer.abort().catch(() => {}); throw e; }
            if (await saveComfortImage(c.folder, name + '.svg', comparison())) message = `已儲存 ${name}.csv 與結果總覽.svg`;
            else message = 'CSV 已儲存，結果總覽未儲存，請重試。';
        });
    });
    function render() {
        const c = info(), ready = fixedReady(), k = key();
        n('reset').hidden = !c?.record || c.valid; n('reset').disabled = locked();
        n('drain').disabled = locked() || !connected() || !k || overviewKey !== k;
        n('prepare').disabled = locked() || !connected() || !k || overviewKey !== k || drained?.key !== k;
        n('abort').hidden = !busy || pending?.family !== 'EXP02';
        n('fixed').textContent = c?.valid ? `固定高度：姿勢一　Head ${c.record.anchors['1'].head} cm／Neck ${c.record.anchors['1'].neck} cm · ${ready ? '已到位' : '尚未準備或待確認'}` : '固定高度：尚未準備';
        n('start').disabled = locked() || !ready || !n('empty').checked;
        n('empty').disabled = locked() || !ready;
        section.querySelectorAll('[data-rapid-pose]').forEach(b => { b.disabled = locked(); b.setAttribute('aria-pressed', String(b.dataset.rapidPose === pose)); });
        n('stop').hidden = !current?.recording;
        n('finish').hidden = !current?.awaitingConfirmation;
        n('export').disabled = locked() || !c?.folder || !subjectRuns().length;
        n('status').textContent = message;
        const elapsed = current ? (current.recording ? Math.min(15000, now() - current.start) : current.duration_ms || 0) / 1000 : 0;
        n('elapsed').textContent = elapsed.toFixed(1).padStart(4, '0');
        n('checkpoints').replaceChildren(...[3,5,10,15].map(s => { const span = document.createElement('span'); span.textContent = `第 ${s} 秒 ${elapsed >= s ? '✓' : '○'}`; return span; }));
        n('progress').textContent = ['1','5'].map(p => `姿勢${p}：${subjectRuns().filter(r => r.pose === p && r.status === '完整記錄' && !r.awaitingConfirmation).length} 輪完成`).join(' · ');
        const body = n('results'); body.replaceChildren();
        subjectRuns().forEach((r, i) => { const tr = document.createElement('tr'); [`姿勢${r.pose}／${i+1}`,...[3,5,10,15].map(s => cell(r,s)),r.status].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.append(td); }); body.append(tr); });
        n('live').textContent = latest && now() - latest.receivedMonotonicMs < 3000 ? `Monitor ${latest.monitor_adc}　Neck ${latest.neck_adc}　Head ${latest.head_adc} ADC` : '等待新的壓力資料';
        if (root.isConnected && typeof Chart === 'function') {
            chart ||= new Chart(n('chart'), { type: 'line', data: { datasets: ['monitor','neck','head'].map((ch,i) => ({ label: ch, data: [], borderColor: ['#6b8e23','#3b82f6','#ef8354'][i], pointRadius: 2, borderWidth: 2 })) }, options: { animation: false, responsive: true, maintainAspectRatio: false, parsing: false, scales: { x: { type: 'linear', min: 0, max: 15, title: { display: true, text: '秒' } }, y: { title: { display: true, text: '原始 ADC' } } } } });
            ['monitor','neck','head'].forEach((ch,i) => { chart.data.datasets[i].data = (current?.events || []).filter(e => e.type === 'pressure').map(e => ({x: e.elapsed_ms/1000,y:e[ch+'_adc']})); }); chart.update('none');
        }
        options.onChange?.();
    }
    function receiveLine(line) {
        const a = line.split(',').map(s => s.trim());
        if (pending) {
            if (a[1] === 'ERR' && a[0] === pending.family && (!pending.id || a[2] === pending.id || a.length === 3)) fail(a[0] === 'EXP02' && a[2] === 'BAD_COMMAND' ? '目前韌體不支援分段抽乾流程，請使用 ipillow-experiment03 配對韌體；準備測試仍保持停用。' : `裝置回覆：${line}`);
            else {
                try { if (pending.accept(a)) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(a); } }
                catch (e) { fail(e.message); }
            }
        }
        if (current?.recording && current.classificationStarted && a[0] === 'CLASSIFY' && a[1] === 'OK' && a.length === 8 && a.slice(4).every(v => Number.isFinite(Number(v)))) {
            const t = now() - current.start;
            if (t <= 15000) current.events.push({ type: 'classification', elapsed_ms: t, received_at: new Date().toISOString(), smooth: a[2], raw: a[3], scores: a.slice(4) });
        }
    }
    setInterval(() => {
        if (!root.isConnected) return;
        if (locked() || preparedKey) height.tick();
        if (pending?.poll && now() - lastPoll > 1000) { lastPoll = now(); pending.poll(); }
        if (current?.recording) {
            if (!fixedReady()) { message = '裝置高度、控制狀態或受試者資料變更，本輪已中止。'; stop('狀態變更中止'); }
            else if (now() - current.start >= 15000) { stop('完整記錄'); message = '15 秒記錄完成，請按「完成本輪」。缺資料的秒數已標記。'; }
        }
        calibration.refresh();
    }, 250);
    return {
        refresh: () => calibration.refresh(), isBusy: () => locked() || calibration.isBusy(), isRunning: () => Boolean(current?.recording),
        ownsClassification: () => locked() || calibration.isBusy(),
        getUiState: () => ({ status: current?.recording ? 'running' : 'idle', statusText: current?.recording ? '15 秒記錄中' : preparedKey ? '已準備測試' : '待準備', hint: '校正 → 儲存總覽 → 離枕並抽乾 → 套用姿勢一高度 → 勾選確認 → 躺下記錄。' }),
        receivePressure: sample => {
            calibration.receivePressure(sample); latest = sample;
            if (current?.recording) { const t = sample.receivedMonotonicMs - current.start; if (t >= 0 && t <= 15000) current.events.push({ ...sample, type: 'pressure', elapsed_ms: t, received_at: sample.timestamp_iso }); }
        }, receiveLine,
        onDisconnected: () => { drained = null; preparedKey = ''; firmwareProfile = ''; firmwareAnchors = {}; fail('BLE 已斷線'); if (current?.recording) stop('BLE 斷線中止'); calibration.onDisconnected(); message = 'BLE 已斷線。重新連線後請重新校正，再儲存校正總覽。'; },
        needsLeaveProtection: () => runs.length > 0 || calibration.needsLeaveProtection()
    };
}
