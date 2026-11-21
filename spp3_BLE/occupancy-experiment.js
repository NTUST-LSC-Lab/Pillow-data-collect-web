// EXP04 owns only Web records; height commands use the existing queue and firmware protocol.
function createOccupancyExperiment(root, options) {
    const now = () => performance.now(), height = options.heightControl;
    const connected = () => Boolean(options.getSystemState().connected);
    let calibration, busy = false, exporting = false, pending = null, armed = null, current = null, latest = null;
    let message = '依序完成姿勢一、姿勢五校正，儲存校正總覽後保留姿勢五高度。';
    let lastPoll = -Infinity, profileSent = '', chart = null, audio = null, viewedId = '';
    const sessions = new Map(), runs = [], events = [];
    const view = document.getElementById('comfortExperimentTemplate').content.firstElementChild.cloneNode(true);
    view.querySelectorAll(':scope > section')[2].hidden = true;
    view.querySelectorAll(':scope > section')[1].append(view.querySelector('#comfortStatus'));
    view.querySelector(':scope > section').classList.add('occupancy-subject');
    const setup = document.createElement('details'); setup.className = 'occupancy-setup'; setup.open = true;
    const setupSummary = document.createElement('summary'); setupSummary.textContent = '受測者與校正';
    setup.append(setupSummary, view);
    const section = document.createElement('section'); section.className = 'comfort-section occupancy-test'; section.setAttribute('aria-label', '實驗04操作');
    const poseNames = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五' };
    section.innerHTML = `
        <div class="occupancy-live">
          <div><p data-occ="active"></p><p data-occ="next" class="pressure-field-hint"></p></div>
          <p class="occupancy-timer"><strong data-occ="elapsed">0.0秒</strong><span data-occ="time-state">／30秒</span></p>
        </div>
        <div class="occupancy-groups">
        ${['5', '1'].map(group => `<section class="occupancy-group" data-occ-group="${group}">
          <div class="occupancy-group-heading"><h4>姿勢${poseNames[group]}校正高度</h4><button type="button" class="primary" data-occ-start="${group}" disabled>開始姿勢${poseNames[group]}高度測試</button></div>
          <p data-occ="height${group}"></p>
          <p data-occ="start-hint${group}" class="pressure-field-hint"></p>
          <p data-occ="progress${group}">0／5完成</p>
          <div class="comfort-buttons" role="group" aria-label="姿勢${poseNames[group]}高度的實際狀態">
            ${['1','2','3','4','5','empty'].map(p => `<button type="button" data-occ-group="${group}" data-occ-state="${p}" aria-pressed="false" disabled>${p === 'empty' ? '離開枕頭' : '姿勢' + poseNames[p]}</button>`).join('')}
          </div>
        </section>`).join('')}
        </div>
        <div class="comfort-buttons occupancy-actions">
          <button type="button" data-occ="finish" disabled>結束本高度測試</button>
          <button type="button" data-occ="abort" disabled>中止</button>
          <button type="button" class="primary" data-occ="export-csv" disabled>匯出目前高度CSV</button>
          <button type="button" data-occ="export" disabled>儲存全部結果</button>
        </div>
        <p data-occ="status" role="status" aria-live="polite"></p>
        <div class="occupancy-height-tools">
          <label class="occupancy-confirm"><input type="checkbox" data-occ="empty"> 高度切換／補測前：已確認頭頸完全離枕</label>
          <div class="comfort-buttons">
            <button type="button" data-occ="switch" disabled>抽乾並設定姿勢一高度</button>
            <button type="button" data-occ="recheck" disabled>重新確認目前高度，準備補測</button>
          </div>
        </div>
        <p data-occ="detectors" class="occupancy-detectors">Monitor：等待資料 · 三顆多數決：等待資料</p>
        <p data-occ="received" class="pressure-field-hint"></p>
        <div class="comfort-trial-table"><table><thead><tr><th>通道</th><th>ADC</th><th>kPa</th><th>校正比例</th><th>門檻</th><th>判定</th></tr></thead><tbody data-occ="channels"></tbody></table></div>
        <p data-occ="quality" class="pressure-field-hint"></p>
        <details data-occ="records" class="occupancy-disclosure"><summary>壓力曲線與分段紀錄</summary>
          <div class="occupancy-detail-body">
            <label class="occupancy-run-picker">查看輪次 <select data-occ="view-run" aria-label="查看高度測試輪次"></select></label>
            <div class="pressure-chart-wrap"><canvas data-occ="chart" aria-label="本高度測試輪次的三通道壓力曲線"></canvas></div>
            <div class="comfort-trial-table"><table><thead><tr><th>段／實際狀態</th><th>順序</th><th>秒數</th><th>30秒完成</th><th>正式有效秒格</th></tr></thead><tbody data-occ="segments"></tbody></table></div>
            <p class="pressure-field-hint">匯出目前高度CSV：分段30秒＋連續紀錄。儲存全部結果：依高度分開CSV、壓力PNG及總覽SVG，包含補測。時間完成不代表有30筆有效資料；離開或重新整理前請先儲存。</p>
          </div>
        </details>
        <details class="occupancy-disclosure"><summary>操作說明與固定偵測規則</summary>
          <div class="occupancy-detail-body">
            <p>校正一 → 校正五 → 姿勢五高度測試 → 抽乾並設定姿勢一高度 → 姿勢一高度測試 → 儲存結果。</p>
            <p>按開始高度測試只啟用按鈕；頭頸開始承載時按「姿勢一」，才開始記錄。完全離枕後按「離開枕頭」，滿30秒再以姿勢二躺下並按對應按鈕，依序至姿勢五。分段CSV每段只收30秒；連續CSV與判定持續到結束。睡姿按鈕提供人工label，不改高度或偵測結果。</p>
            <p data-occ="rule"></p>
            <p>目前kPa ÷ 對應高度的有人校正kPa ≥ 門檻，該通道判有人；三顆至少兩票判有人。兩規則使用同一筆完整有效壓力。</p>
            <p>門檻為全30人refit候選，三顆多數決待實驗驗證；本輪不調參。無效或缺資料不作空枕，正式30秒與延續時間分開保存。</p>
          </div>
        </details>
        <button type="button" data-occ="reset" hidden>重新建立此受測者校正</button>`;
    const records = section.querySelector('[data-occ="records"]');
    records.classList.add('occupancy-records');
    root.append(setup, section, records);
    const n = id => root.querySelector(`[data-occ="${id}"]`);
    const info = () => calibration?.getCalibration();
    const key = () => { const c = info(); return c?.valid ? JSON.stringify([c.subject, c.record.profile, c.record.anchors]) : ''; };
    const session = () => sessions.get(key());
    const recording = () => Boolean(current?.recording);
    const locked = () => busy || exporting || Boolean(armed) || recording();
    const subjectRuns = () => runs.filter(r => r.subject === info()?.subject);
    const groupRuns = group => runs.filter(r => r.sessionId === session()?.id && r.group === group);
    const groupRun = group => groupRuns(group).at(-1);
    const carriedProgress = group => {
        const prev = groupRun(group);
        return prev && prev.status !== 'COMPLETED' && prev.completed.length < 5 ? prev.completed : [];
    };
    const selectedRun = () => subjectRuns().find(r => r.id === viewedId) || subjectRuns().at(-1);
    const groupNow = () => armed?.group || (recording() ? current.group : ['1', 'done'].includes(session()?.phase) ? '1' : '5');
    const fresh = () => connected() && latest && now() >= latest.receivedMonotonicMs && now() - latest.receivedMonotonicMs < 3000;
    const baselineValid = () => info()?.valid && ['1','5'].every(g =>
        OCCUPANCY_CHANNELS.every(ch => occupancyKpa(info().record.anchors[g].pressure[ch + '_adc'], ch) > 0));
    function ready(group) {
        const c = info(), s = session(), state = height.getState();
        return Boolean(baselineValid() && s?.confirmed === group && connected() && !options.getSystemState().autoHeightPossible &&
            state.ready && state.head === c.record.anchors[group].head && state.neck === c.record.anchors[group].neck);
    }
    function log(type, details = {}, s = session()) {
        events.push({ event_type: type, timestamp_iso: new Date().toISOString(), monotonic_ms: now(),
            subject: s?.subject || info()?.subject, session_id: s?.id, data_origin: options.simulated ? 'SIMULATED' : 'DEVICE',
            rule_version: OCCUPANCY_RULE.version, rule_json: JSON.stringify(OCCUPANCY_RULE),
            calibration_json: JSON.stringify(s?.calibration || info()?.record?.anchors), ...details });
    }
    function fail(text) {
        if (!pending) return;
        const p = pending; pending = null; clearTimeout(p.timer); p.reject(new Error(text));
    }
    function request(command, accept, timeout = 15000) {
        if (pending) return Promise.reject(new Error('上一個裝置操作尚未完成'));
        return new Promise((resolve, reject) => {
            const family = command.split(',')[0], id = family === 'EXP02' ? command.split(',')[2] : null;
            const timer = setTimeout(() => {
                if (id) options.sendExperimentCommand(`EXP02,STOP,${id}`);
                fail('等待裝置回覆逾時；本次準備失敗，請確認裝置狀態後重試。');
            }, timeout);
            pending = { accept, resolve, reject, timer, family, id };
            log('command', { command });
            try { (id ? options.sendExperimentCommand : options.sendRapidCommand)(command); }
            catch (e) { fail(e.message); }
        });
    }
    calibration = createComfortExperiment(view, {
        ...options, calibrationOnly: true, experimentId: '04', folderId: 'ipillow-experiment-04', isLocked: locked,
        formatTimestamp: occupancyLocalTime,
        calibrationHint: '儲存校正總覽後保留姿勢五高度，開始第一組測試。',
        canCalibrate: pose => !subjectRuns().length && (pose === '1' ? !info()?.record?.anchors['1'] : Boolean(info()?.record?.anchors['1'])),
        beforeCalibrationPrepare: async cal => {
            const pk = JSON.stringify([cal.subject, cal.profile]);
            if (profileSent === pk) return;
            const p = cal.profile;
            await request(`USER,${p.gender === 'male' ? 1 : 0},${p.age_years},${Math.trunc(p.body_height_cm)},${Math.trunc(p.body_weight_kg)}`, a => a.join(',') === 'USER,OK');
            profileSent = pk;
        },
        onCalibrationChanged: () => { n('empty').checked = false; },
        onCalibrationOverviewSaved: () => {
            if (!baselineValid()) { message = '三通道校正kPa須大於0，請檢查校正壓力。'; return; }
            const c = info(), k = key();
            if (!sessions.has(k)) sessions.set(k, { id: 'E04-' + Date.now(), subject: c.subject,
                calibration: JSON.parse(JSON.stringify(c.record.anchors)), phase: '5', confirmed: '5', switchVerified: false });
            message = '校正總覽已儲存。保留姿勢五高度，按第一組開始按鈕，再以姿勢一躺下並按「姿勢一」記錄。';
            log('calibration_frozen');
        },
        onChange: () => { if (calibration) render(); }
    });
    async function operate(work) {
        busy = true; render();
        try { await work(); }
        catch (e) { if (session()) session().confirmed = null; message = e.message; log('operation_failed', { reason: e.message }); }
        finally { busy = false; calibration.refresh(); }
    }
    function armAudio() {
        try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { audio ||= new Audio(); audio.resume().catch(() => {}); } } catch (_) { /* Visual timing remains available. */ }
    }
    function beep() {
        try {
            if (!audio || audio.state !== 'running') return;
            const oscillator = audio.createOscillator(), gain = audio.createGain();
            oscillator.frequency.value = 880; gain.gain.value = .12;
            oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .18);
        } catch (_) { /* A blocked sound never interrupts recording. */ }
    }
    function tick() {
        if (!armed && !recording()) return;
        const active = armed || current;
        if (!ready(active.group) || active.sessionId !== session()?.id) {
            stop('STATE_CHANGED', '高度、連線或個人資料變更，已保留部分資料並中止；確認後另開補測輪次。'); return;
        }
        if (recording() && occupancyTick(current, now() - current.start)) {
            message = '本段30秒已完成；等待下一個標記，連續紀錄與判定仍持續。';
            beep();
        }
    }
    function stop(status, text) {
        if (!armed && !recording()) return;
        if (armed) log('arming_cancelled', { height_group: armed.group, status });
        armed = null;
        if (recording()) occupancyStop(current, now() - current.start, status);
        if (session()) session().confirmed = null;
        n('empty').checked = false; message = text; render();
    }
    function canStart(group) {
        const s = session();
        const phaseOkay = group === '5' ? ['5','switch'].includes(s?.phase) : ['1','done'].includes(s?.phase) && s?.switchVerified;
        return !locked() && !calibration.isBusy() && phaseOkay && ready(group) && fresh() &&
            occupancyDetect(latest, info().record.anchors[group], group).validity === 'VALID';
    }
    section.querySelectorAll('[data-occ-start]').forEach(button => button.addEventListener('click', () => {
        const group = button.dataset.occStart;
        if (!canStart(group)) return;
        armAudio();
        const s = session();
        armed = { group, sessionId: s.id };
        s.phase = group; n('empty').checked = false;
        setup.open = false;
        log('test_armed', { height_group: group, next_pose: String(carriedProgress(group).length + 1) });
        message = `按鈕已啟用，尚未記錄。請以姿勢${poseNames[String(carriedProgress(group).length + 1)]}躺下，再按對應姿勢按鈕。`;
        calibration.refresh();
    }));
    section.querySelectorAll('[data-occ-state]').forEach(button => button.addEventListener('click', () => {
        tick();
        if (armed && armed.group === button.dataset.occGroup) {
            const group = armed.group, c = info(), s = session(), prev = groupRun(group);
            const startedAt = new Date().toISOString(), completed = carriedProgress(group);
            current = createOccupancyRun({ id: startedAt + '-' + (runs.length + 1), sessionId: s.id, subject: c.subject,
                profile: c.record.profile, calibration: s.calibration, group, head: c.record.anchors[group].head,
                neck: c.record.anchors[group].neck, rule: OCCUPANCY_RULE, dataOrigin: options.simulated ? 'SIMULATED' : 'DEVICE' }, now(), startedAt, completed);
            armed = null; runs.push(current); viewedId = current.id;
            if (prev) occupancyEvent(current, 'new_round', 0, { previous_run_id: prev.id, carried_completed: completed });
        }
        if (!recording() || current.group !== button.dataset.occGroup) return;
        const previous = current.segments.at(-1), reached = previous?.reached;
        occupancyMark(current, button.dataset.occState, previous ? now() - current.start : 0);
        if (previous && !reached && previous.reached) beep();
        const s = current.segments.at(-1);
        message = s.role === 'out_of_order' ? '已照實記錄；操作順序不符，請依下一步提示補測。'
            : s.reached ? '同一狀態已達30秒，計時不重置；連續紀錄持續。' : '已標記實際狀態；請維持至30秒提示。';
        render();
    }));
    n('finish').addEventListener('click', () => {
        tick();
        if (!recording() || current.completed.length !== 5) return;
        occupancyStop(current, now() - current.start, 'COMPLETED');
        session().phase = current.group === '5' ? 'switch' : 'done'; n('empty').checked = false;
        message = current.group === '5' ? '姿勢五高度5／5完成。確認受測者離枕後，抽乾並設定姿勢一高度。' : '兩組高度測試完成，請儲存結果。';
        calibration.refresh();
    });
    n('abort').addEventListener('click', () => {
        if (pending?.id) options.sendExperimentCommand(`EXP02,STOP,${pending.id}`);
        if (busy) { if (session()) session().confirmed = null; fail('操作者中止；重新確認狀態後再準備。'); log('operator_abort'); }
        stop('ABORTED', '已中止並保留部分資料。確認狀態後補測，不自動續接。');
    });
    n('switch').addEventListener('click', () => {
        if (locked() || !connected() || !n('empty').checked || session()?.phase !== 'switch') return;
        const s = session(), k = key(); s.confirmed = null; s.switchVerified = false; n('empty').checked = false;
        operate(async () => {
            const dryId = 'D04' + Date.now().toString(36).toUpperCase(), id = 'F04' + Date.now().toString(36).toUpperCase();
            message = '逐顆吸乾 → 恢復開機基準高度 → 姿勢一校正高度。請全程保持離枕。'; render();
            log('height_switch_start', { from_group: '5', to_group: '1' }, s);
            let ack = false;
            await request(`EXP02,DRAIN,${dryId}`, a => {
                if (a.join(',') === `EXP02,ACK,${dryId},DRAIN`) ack = true;
                return ack && a.join(',') === `EXP02,DRAINED,${dryId}`;
            }, 660000);
            if (!connected() || key() !== k) throw new Error('連線或校正資料變更，請重新抽乾。');
            log('startup_height_restored', { dry_id: dryId }, s);
            const anchor = s.calibration['1']; ack = false;
            await request(`EXP02,START,${id},HEIGHT_DRY,${anchor.head.toFixed(1)},${anchor.neck.toFixed(1)},${dryId}`, a => {
                if (a.join(',') === `EXP02,ACK,${id},HEIGHT_DRY`) ack = true;
                if (!(ack && a[0] === 'EXP02' && a[1] === 'DONE' && a[2] === id && a.length === 7)) return false;
                if (Number(a[5]) !== anchor.head || Number(a[6]) !== anchor.neck) throw new Error('裝置完成高度與姿勢一校正高度不符。');
                return true;
            }, 660000);
            const state = await height.prepare();
            if (!connected() || key() !== k || !state.ready || state.head !== anchor.head || state.neck !== anchor.neck) throw new Error('高度核對失敗，請重新抽乾設定。');
            s.phase = '1'; s.confirmed = '1'; s.switchVerified = true;
            log('height_switch_complete', { head_cm: state.head, neck_cm: state.neck }, s);
            message = '姿勢一高度已核對到位，兩組校正基準保留。按第二組開始，再以姿勢一躺下並按「姿勢一」記錄。';
        });
    });
    n('recheck').addEventListener('click', () => {
        if (locked() || !connected() || !session() || !n('empty').checked) return;
        const s = session(), group = groupNow(), k = key();
        operate(async () => {
            const state = await height.prepare(), anchor = s.calibration[group];
            if (key() !== k || state.head !== anchor.head || state.neck !== anchor.neck || !state.ready) {
                throw new Error(`目前高度不符姿勢${group}；請先由既有高度控制回到 Head ${anchor.head}／Neck ${anchor.neck} cm，再重新確認。`);
            }
            s.confirmed = group; log('state_reconfirmed', { height_group: group }, s);
            message = '目前高度已重新確認。按開始啟用按鈕，再以待補測姿勢躺下並按對應姿勢，新增一輪記錄。';
        });
    });
    n('reset').addEventListener('click', () => {
        if (locked() || subjectRuns().length) return;
        calibration.resetCalibration(); profileSent = ''; message = '請依序重新校正姿勢一、姿勢五。'; render();
    });
    n('empty').addEventListener('change', render);
    n('view-run').addEventListener('change', () => { viewedId = n('view-run').value; render(); });
    n('records').addEventListener('toggle', () => { if (calibration) render(); });
    async function exportResults(includeImages) {
        if (exporting || !info()?.folder || !subjectRuns().length) return;
        tick(); exporting = true; render();
        try {
            const c = info(), snapshotTime = now(), records = subjectRuns().map(r => occupancySnapshot(r, snapshotTime - r.start));
            const groups = (includeImages ? ['5', '1'] : [groupNow()]).filter(g => records.some(r => r.group === g));
            if (!groups.length) { message = '目前高度尚無記錄可匯出。'; return; }
            const batches = groups.map(group => ({ records: records.filter(r => r.group === group),
                name: occupancyFileStem(c.subject, group, options.simulated) }));
            const suffixes = ['_分段30秒.csv', '_連續紀錄.csv', ...(includeImages ? ['_壓力曲線.png', '_結果總覽.svg'] : [])];
            const permission = { mode: 'readwrite' };
            if (await c.folder.queryPermission(permission) !== 'granted' && await c.folder.requestPermission(permission) !== 'granted') {
                throw new Error('未取得寫入權限，請重新選擇儲存資料夾');
            }
            const existing = [];
            for (const batch of batches) for (const suffix of suffixes) {
                const name = batch.name + suffix;
                try { await c.folder.getFileHandle(name); existing.push(name); }
                catch (e) { if (e.name !== 'NotFoundError') throw e; }
            }
            if (existing.length && !window.confirm(`以下同名檔案將更新為本頁目前累積的資料，是否覆蓋？\n${existing.join('\n')}`)) {
                message = '已取消匯出，原檔與本頁資料保留。'; return;
            }
            const files = [];
            for (const batch of batches) {
                const csv = occupancyCsvFiles(batch.records);
                files.push([batch.name + '_分段30秒.csv', csv.segments], [batch.name + '_連續紀錄.csv', csv.continuous]);
                if (includeImages) {
                    files.push([batch.name + '_壓力曲線.png', await occupancyPressurePng(batch.records)],
                        [batch.name + '_結果總覽.svg', await occupancyReportSvg(batch.records, c.subject,
                            events.filter(e => batch.records.some(r => r.sessionId === e.session_id)))]);
                }
            }
            for (const [name, content] of files) await writeRapidFile(c.folder, name, content);
            message = `已儲存${groups.length * 2}份CSV${includeImages ? `、${groups.length}張壓力PNG及${groups.length}份結果總覽SVG` : ''}${recording() ? '；連續記錄繼續' : ''}。`;
        } catch (e) { message = `儲存未完成：${e.message}。資料仍保留，請重試。`; }
        finally { exporting = false; calibration.refresh(); }
    }
    n('export-csv').addEventListener('click', () => exportResults(false));
    n('export').addEventListener('click', () => exportResults(true));
    function render() {
        const c = info(), s = session(), group = groupNow(), selected = selectedRun();
        const activeSegment = recording() ? current.segments.at(-1) : null;
        setupSummary.textContent = `受測者與校正${c?.subject ? ' · ' + c.subject + (c.valid ? ' · 兩組已校正' : ' · 待校正') : ''}`;
        n('rule').textContent = `${OCCUPANCY_RULE.version}｜姿勢一 Monitor/Neck/Head：0.48 / 0.27 / 0.45；姿勢五：0.63 / 0.75 / 0.67。`;
        n('reset').hidden = !c?.record || subjectRuns().length > 0; n('reset').disabled = locked();
        n('empty').disabled = locked() || !s;
        for (const g of ['5','1']) {
            const anchor = c?.record?.anchors[g], run = groupRun(g);
            n('height' + g).textContent = anchor ? `Head ${anchor.head} cm／Neck ${anchor.neck} cm · ${ready(g) ? '已核對到位' : '待準備／確認'}` : '尚未校正';
            section.querySelector(`[data-occ-start="${g}"]`).disabled = !canStart(g);
            n('start-hint' + g).textContent = `先按開始，再按「姿勢${poseNames[String(carriedProgress(g).length + 1)]}」記錄30秒。`;
            n('progress' + g).textContent = `${run?.completed.length || 0}／5完成 · ${['1','2','3','4','5'].map(p => `${run?.completed.includes(p) ? '✓' : '○'}${poseNames[p]}`).join(' ')}`;
            section.querySelector(`section[data-occ-group="${g}"]`).classList.toggle('is-active', (Boolean(armed) || recording()) && group === g);
        }
        section.querySelectorAll('[data-occ-state]').forEach(b => {
            b.disabled = (!armed && !recording()) || b.dataset.occGroup !== group;
            b.setAttribute('aria-pressed', String(!b.disabled && activeSegment?.actual === b.dataset.occState));
        });
        n('finish').disabled = !recording() || current.completed.length < 5;
        n('abort').disabled = !armed && !recording() && !pending?.id;
        n('switch').disabled = locked() || !connected() || s?.phase !== 'switch' || !n('empty').checked;
        n('recheck').disabled = locked() || !connected() || !s || !n('empty').checked || ready(group) || s.phase === 'switch';
        n('status').textContent = message;
        n('active').textContent = recording() ? `姿勢${poseNames[group]}高度 · 實際：${occupancyLabel(activeSegment?.actual || 'unknown')}` : `姿勢${poseNames[group]}高度 · ${armed ? '等待姿勢標記，尚未記錄' : '待測'}`;
        n('elapsed').textContent = `${activeSegment ? (Math.min(OCCUPANCY_SEGMENT_MS, now() - current.start - activeSegment.start_ms) / 1000).toFixed(1) : '0.0'}秒`;
        n('time-state').textContent = activeSegment?.reached ? '本段完成；連續記錄中' : armed ? '等待按姿勢，尚未計時' : '／30秒';
        n('next').textContent = armed ? `請以姿勢${poseNames[String(carriedProgress(group).length + 1)]}躺下，再按對應姿勢開始記錄。` : recording() ? occupancyNext(current) : s?.phase === 'switch' ? '下一步：可匯出目前CSV，再確認離枕，抽乾並設定姿勢一高度。' : s?.phase === 'done' ? '兩組高度完成，請匯出CSV或儲存全部結果。' : '完成校正與高度核對，再按開始啟用睡姿按鈕。';
        const result = fresh() && baselineValid() ? occupancyDetect(latest, c.record.anchors[group], group) : null;
        const decision = v => v === 1 ? '有人' : v === 0 ? '空枕' : '無有效資料';
        n('detectors').textContent = `Monitor單獨：${decision(result?.monitor_result)} · 三顆多數決：${decision(result?.majority_result)}${fresh() ? '' : '（壓力缺資料／過期）'}`;
        n('received').textContent = `最近壓力接收：${occupancyLocalTime(latest?.timestamp_iso) || '等待資料'}（電腦本機時間）`;
        const body = n('channels'); body.replaceChildren();
        for (const ch of OCCUPANCY_CHANNELS) {
            const tr = document.createElement('tr');
            const number = (value, places) => Number.isFinite(value) ? value.toFixed(places) : '—';
            [COMFORT_CHANNELS[ch].label, number(result?.[ch + '_adc'], 0), number(result?.[ch + '_kpa'], 4), number(result?.[ch + '_ratio'], 3), OCCUPANCY_RULE.thresholds[group][ch], decision(result?.[ch + '_vote'])].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.append(td); });
            body.append(tr);
        }
        const records = subjectRuns();
        const picker = n('view-run');
        if (picker.options.length !== records.length) picker.replaceChildren(...records.map((r,i) => new Option(`第${i+1}輪・姿勢${r.group}高度`, r.id)));
        picker.value = selected?.id || ''; picker.disabled = recording();
        const rows = selected ? occupancySecondRows(selected) : [];
        const formal = rows.filter(row => row.window === 'FORMAL');
        n('quality').textContent = `正式秒格：有效 ${formal.filter(r => r.validity === 'VALID').length}／${formal.length} · 缺資料 ${formal.filter(r => r.validity === 'MISSING').length} · 無效 ${formal.filter(r => !['VALID','MISSING'].includes(r.validity)).length}`;
        const segments = n('segments'); segments.replaceChildren();
        for (const segment of selected?.segments || []) {
            const tr = document.createElement('tr');
            [`${segment.id}／${occupancyLabel(segment.actual)}`, segment.role === 'out_of_order' ? '錯序，已保留' : segment.role === 'post_empty' ? '姿勢後空枕' : '待測姿勢',
                (((segment.end_ms ?? selected.duration_ms) - segment.start_ms) / 1000).toFixed(1), segment.reached ? '已達30秒' : '未完成',
                `${rows.filter(r => r.segment_id === segment.id && r.window === 'FORMAL' && r.validity === 'VALID').length}/30`].forEach(v => { const td = document.createElement('td'); td.textContent = v; tr.append(td); });
            segments.append(tr);
        }
        n('export').disabled = exporting || !c?.folder || !records.length;
        n('export-csv').disabled = n('export').disabled || !records.some(r => r.group === group);
        n('export-csv').title = `匯出姿勢${poseNames[group]}高度的兩份CSV，包含本頁補測資料`;
        if (root.isConnected && n('records').open && typeof Chart === 'function') {
            chart ||= new Chart(n('chart'), { type: 'line', data: { datasets: [] }, options: rapidChartOptions() });
            chart.options.scales.x.title.text = '本輪首次標記後經過時間（秒）';
            chart.options.scales.x.max = Math.max(30, (selected?.duration_ms || 0) / 1000);
            chart.data.datasets = occupancyPressureDatasets(selected); chart.update('none');
        }
        options.onChange?.();
    }
    function receiveLine(line) {
        if (!pending) return;
        const a = line.split(',').map(s => s.trim());
        if (a[0] !== pending.family) return;
        log('device_reply', { reply: line });
        if (a[1] === 'ERR' && (!pending.id || a[2] === pending.id || a.length === 3)) { fail(`裝置回覆：${line}；請確認狀態後重試。`); return; }
        try { if (pending.accept(a)) { const p = pending; pending = null; clearTimeout(p.timer); p.resolve(a); } }
        catch (e) { fail(e.message); }
    }
    setInterval(() => {
        if (!root.isConnected) return;
        if (session() || locked()) height.tick();
        if (pending?.id && now() - lastPoll > 1000) { lastPoll = now(); options.sendRapidQuery(`EXP02,STATUS,${pending.id}`); }
        tick(); calibration.refresh();
    }, 250);
    return {
        refresh: () => calibration.refresh(), isRunning: recording, isBusy: () => locked() || calibration.isBusy(),
        getUiState: () => ({ status: recording() || armed ? 'running' : 'idle', statusText: recording() ? '躺枕／離枕測試中' : armed ? '等待姿勢標記' : '實驗04待測',
            hint: '先姿勢五高度，再抽乾設定姿勢一高度。每段30秒；按鈕標記實際狀態，滿時不自動切換。' }),
        receivePressure: sample => {
            if (!Number.isFinite(sample.receivedMonotonicMs) || sample.receivedMonotonicMs < (latest?.receivedMonotonicMs ?? -Infinity)) return;
            latest = sample;
            if (OCCUPANCY_CHANNELS.every(ch => Number.isFinite(sample[ch + '_adc']))) calibration.receivePressure(sample);
            tick(); occupancyRecordPressure(current, sample);
        }, receiveLine,
        onDisconnected: () => {
            for (const s of sessions.values()) s.confirmed = null;
            latest = null; profileSent = ''; fail('BLE已斷線，請重新確認狀態。');
            stop('DISCONNECTED', 'BLE已斷線，部分資料與兩組校正均保留；重連後確認高度，再開始補測。');
            calibration.onDisconnected(); n('empty').checked = false;
        },
        needsLeaveProtection: () => runs.length > 0 || calibration.needsLeaveProtection()
    };
}
