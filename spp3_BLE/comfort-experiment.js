// Experiment 02 R/M/A use absolute ADC -> fixed fill time; I retains height control.
const COMFORT_CHANNELS = {
    monitor: { label: 'Monitor', slope: 0.000007976305, offset: -12.414949423913 },
    head: { label: 'Head', slope: 0.0000038296, offset: -7.1811602848, adcPerMs: 2.837681, adcAtZeroMs: 1820918, minMs: 30000, maxMs: 136132, minCm: 7, maxCm: 16, cmPerSecond: 0.0848 },
    neck: { label: 'Neck', slope: 0.0000045060, offset: -8.7398532587, adcPerMs: 5.820554, adcAtZeroMs: 1878787, minMs: 10000, maxMs: 50000, minCm: 10, maxCm: 14, cmPerSecond: 0.1 }
};
const COMFORT_METHODS = { R: '論文補償', M: '30 人平均補償', A: '論文與 30 人比例平均', I: '校正控制高度' };
const COMFORT_POSES = {
    '1': { label: '姿勢一', R: { head: 0.0033, neck: 0.1052 }, M: { head: 0.031330964618742496, neck: 0.09390857201420701 } },
    '5': { label: '姿勢五', R: { head: 0.0034, neck: 0.0589 }, M: { head: 0.04907373891777954, neck: 0.08733870877877077 } }
};

function comfortFillTime(channel, targetAdc) {
    const spec = COMFORT_CHANNELS[channel];
    const calculatedMs = (targetAdc - spec.adcAtZeroMs) / spec.adcPerMs;
    const baselineFallback = calculatedMs < 0;
    const limitCapped = calculatedMs > spec.maxMs;
    const commandMs = baselineFallback ? spec.minMs : Math.min(spec.maxMs, Math.round(calculatedMs));
    return { calculatedMs, commandMs, baselineFallback, limitCapped };
}

function comfortPlan(pose, method, anchor) {
    const heights = {};
    const targets = {};
    const times = {};
    const issues = [];
    for (const channel of ['head', 'neck']) {
        const spec = COMFORT_CHANNELS[channel];
        if (method === 'I') {
            heights[channel] = anchor[channel];
            if (!Number.isFinite(heights[channel]) || heights[channel] < spec.minCm ||
                heights[channel] > spec.maxCm || !Number.isInteger(heights[channel] * 2)) {
                issues.push(`${spec.label} 控制高度超出裝置範圍`);
            }
        } else {
            const { R, M } = COMFORT_POSES[pose];
            const ratio = method === 'A' ? (R[channel] + M[channel]) / 2 : COMFORT_POSES[pose][method][channel];
            const adc = anchor.pressure[channel + '_adc'] * (1 - ratio);
            targets[channel] = { ratio, adc: Math.round(adc) };
            times[channel] = comfortFillTime(channel, targets[channel].adc);
            if (!Number.isFinite(adc) || targets[channel].adc < 1000000 || targets[channel].adc > 2550000) {
                issues.push(`${spec.label} 目標 ADC 超出裝置接受範圍`);
            }
        }
    }
    return { mode: method === 'I' ? 'HEIGHT' : 'ADC_TIME', heights, targets, times, issues };
}

function comfortCommand(id, plan) {
    return plan.mode === 'ADC_TIME'
        ? `EXP02,START,${id},ADC_TIME,${plan.targets.head.adc},${plan.targets.neck.adc}`
        : `EXP02,START,${id},HEIGHT,${plan.heights.head.toFixed(1)},${plan.heights.neck.toFixed(1)}`;
}

function comfortDeviceTimes(parts, plan) {
    if (parts.length !== 9 || parts.slice(3, 7).some(v => !/^-?\d+(?:\.\d+)?$/.test(v)) ||
        !['0', '1'].includes(parts[7]) || !['0', '1'].includes(parts[8])) {
        throw new Error('ESP32 充氣時間回覆格式不正確');
    }
    const times = {};
    for (const [index, channel] of ['head', 'neck'].entries()) {
        const expected = plan.times[channel];
        const calculatedMs = Number(parts[3 + index]), commandMs = Number(parts[5 + index]);
        const baselineFallback = parts[7 + index] === '1';
        if (!Number.isFinite(calculatedMs) || !Number.isSafeInteger(commandMs) || commandMs < 0 ||
            Math.abs(calculatedMs - expected.calculatedMs) > 0.001 ||
            commandMs !== expected.commandMs || baselineFallback !== expected.baselineFallback) {
            throw new Error('ESP32 充氣時間、備援或上限截斷政策與目前 Web 不一致，請確認配對韌體版本');
        }
        times[channel] = { calculatedMs, commandMs, baselineFallback, limitCapped: expected.limitCapped };
    }
    return times;
}

function comfortPressure(channel, adc) {
    if (!Number.isFinite(adc)) return '—';
    const spec = COMFORT_CHANNELS[channel];
    return `${Math.round(adc).toLocaleString('en-US')} ADC / ${(spec.slope * adc + spec.offset).toFixed(4)} kPa`;
}

function comfortProfileText(profile) {
    if (!profile) return '請先在上方「使用者資料」填寫性別、年齡、身高與體重。';
    return `性別 ${profile.gender === 'female' ? '女' : '男'}　年齡 ${profile.age_years} 歲　身高 ${profile.body_height_cm} cm　體重 ${profile.body_weight_kg} kg`;
}

function comfortAnchorText(anchor) {
    return anchor ? [
        `控制高度：Head ${anchor.head.toFixed(1)} cm / Neck ${anchor.neck.toFixed(1)} cm`,
        ...Object.keys(COMFORT_CHANNELS).map(ch => `${COMFORT_CHANNELS[ch].label}：${comfortPressure(ch, anchor.pressure[ch + '_adc'])}`)
    ] : ['尚未校正'];
}

function comfortReport(trial) {
    const { anchor, plan, method, empty, loaded } = trial;
    const percent = ratio => `${(ratio * 100).toFixed(2)}%`;
    const difference = (channel, reading, reference) => {
        if (!Number.isFinite(reading) || !Number.isFinite(reference)) return '—';
        const adc = reading - reference;
        return `${adc >= 0 ? '+' : '−'}${Math.abs(adc).toLocaleString('en-US')} ADC / ${adc >= 0 ? '+' : '−'}${(Math.abs(adc) * COMFORT_CHANNELS[channel].slope).toFixed(4)} kPa`;
    };
    const relativeChange = (channel, reading) => {
        const baseline = anchor.pressure[channel + '_adc'];
        if (!Number.isFinite(reading) || !Number.isFinite(baseline) || baseline === 0) return '—';
        const ratio = (reading - baseline) / baseline;
        if (ratio === 0) return '持平 0.00%';
        return `${ratio > 0 ? '上升' : '下降'} ${percent(Math.abs(ratio))}`;
    };
    const emptyRows = ['head', 'neck'].map(channel => {
        const actual = empty?.[channel + '_adc'];
        const target = plan.targets[channel];
        return [
            COMFORT_CHANNELS[channel].label,
            target ? `下降 ${percent(target.ratio)}` : `高度 ${anchor[channel].toFixed(1)} cm`,
            target ? comfortPressure(channel, target.adc) : '—',
            comfortPressure(channel, actual),
            relativeChange(channel, actual),
            target ? difference(channel, actual, target.adc) : '—'
        ];
    });
    const loadedRows = Object.keys(COMFORT_CHANNELS).map(channel => [
        COMFORT_CHANNELS[channel].label, comfortPressure(channel, anchor.pressure[channel + '_adc']),
        comfortPressure(channel, loaded?.[channel + '_adc']),
        difference(channel, loaded?.[channel + '_adc'], anchor.pressure[channel + '_adc'])
    ]);
    const timeRows = plan.mode === 'ADC_TIME' ? ['head', 'neck'].map(channel => {
        const spec = COMFORT_CHANNELS[channel], predicted = plan.times[channel];
        const confirmed = trial.deviceTimes?.[channel];
        return [spec.label, (predicted.calculatedMs / 1000).toFixed(3) + ' s',
            (predicted.commandMs / 1000).toFixed(3) + ' s',
            confirmed ? (confirmed.commandMs / 1000).toFixed(3) + ' s' : '待裝置確認',
            predicted.baselineFallback ? '開機基準備援（負時間）' :
                predicted.limitCapped ? '安全上限截斷' :
                predicted.calculatedMs < spec.minMs ? '公式時間（低於開機基準）' : '公式時間'];
    }) : [];
    return {
        title: `${trial.subject}｜${COMFORT_POSES[trial.pose].label}｜${method} · ${COMFORT_METHODS[method]}`,
        details: [
            `校正控制高度：Head ${anchor.head.toFixed(1)} cm / Neck ${anchor.neck.toFixed(1)} cm`,
            plan.mode === 'ADC_TIME' ? '充氣設定：Monitor 14.5 s；Head／Neck 依 ADC 換算固定時間' :
                plan.mode === 'ADC' ? '充氣設定：Monitor 14.5 s；Head／Neck 依空枕目標 ADC 控制' :
                `充氣設定：Monitor 14.5 s；Head ${plan.heights.head.toFixed(1)} cm / Neck ${plan.heights.neck.toFixed(1)} cm`,
            ...(plan.mode === 'ADC_TIME' ? [
                't < 0：Head 30 s／Neck 10 s 備援；超上限：Head 136.132 s／Neck 50 s 截斷。',
                '固定時間不保證命中目標；備援及上限截斷結果須另行標記分析。',
                `裝置完成回報（各通道最近成功讀值）：Head ${comfortPressure('head', trial.deviceEmpty?.head_adc)}；Neck ${comfortPressure('neck', trial.deviceEmpty?.neck_adc)}`,
                '完成回報允許 Head／Neck 不同輪讀取，各自不超過 6 秒；正式空枕快照仍請待穩定後記錄。'
            ] : []),
            `空枕快照：${empty?.timestamp_iso || '待記錄'}　Monitor：${comfortPressure('monitor', empty?.monitor_adc)}`,
            `躺回快照：${loaded?.timestamp_iso || '待記錄'}`,
            `滿意度：${trial.score === undefined ? '待填' : trial.score + '／10'}`,
            '操作者確認穩定後擷取單筆。百分比以 ADC 計算。'
        ],
        sections: [
            ...(timeRows.length ? [{ title: '固定充氣時間與備援紀錄',
                headers: ['氣囊', '理論時間', '預計指令時間', '裝置確認時間', '控制標記'],
                rows: timeRows, widths: [85, 170, 180, 220, 645] }] : []),
            { title: '躺回前｜空枕設定與實測', headers: ['氣囊', '控制設定', '壓力目標', '空枕實測', '相對 10 分基準', '實測 − 目標'], rows: emptyRows, widths: [85, 150, 290, 290, 200, 285] },
            { title: '躺回後｜與同姿勢有人校正基準比較', headers: ['氣囊', '10 分校正基準', '本次躺回後', '躺回後 − 校正基準'], rows: loadedRows, widths: [125, 340, 340, 495] }
        ]
    };
}

function buildComfortImage(report) {
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const width = 1350;
    const height = 110 + report.details.length * 29 + report.sections.reduce((n, section) => n + 76 + section.rows.length * 40, 0);
    const image = document.createElementNS(svgNamespace, 'svg');
    image.setAttribute('width', width);
    image.setAttribute('height', height);
    image.setAttribute('viewBox', `0 0 ${width} ${height}`);
    image.setAttribute('font-family', '-apple-system, "PingFang TC", sans-serif');
    const append = (tag, attributes) => {
        const element = document.createElementNS(svgNamespace, tag);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
        image.append(element);
        return element;
    };
    append('rect', { width, height, fill: '#fff' });
    const write = (text, x, y, size, bold = false) => {
        append('text', { x, y, fill: '#183560', 'font-size': size, 'font-weight': bold ? 700 : 400 }).textContent = text;
    };
    write(report.title, 24, 42, 26, true);
    let y = 75;
    for (const detail of report.details) {
        write(detail, 24, y, 18);
        y += 29;
    }
    for (const section of report.sections) {
        y += 12;
        write(section.title, 24, y + 21, 21, true);
        y += 34;
        [section.headers, ...section.rows].forEach((row, index) => {
            const fill = index === 0 ? '#eaf2fc' : index % 2 === 0 ? '#f6f8fb' : '#ffffff';
            append('rect', { x: 24, y, width: width - 48, height: 40, fill });
            let x = 32;
            row.forEach((cell, col) => {
                write(String(cell), x, y + 26, 17, index === 0);
                x += section.widths[col];
            });
            y += 40;
        });
    }
    const svg = new XMLSerializer().serializeToString(image);
    return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

async function saveComfortImage(folder, name, report) {
    const permission = { mode: 'readwrite' };
    if (await folder.queryPermission(permission) !== 'granted' &&
        await folder.requestPermission(permission) !== 'granted') {
        throw new Error('未取得寫入權限，請重新選擇儲存資料夾。');
    }
    let file;
    try {
        file = await folder.getFileHandle(name);
    } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
    }
    if (file && !window.confirm(`資料夾內已有同名檔案，是否覆蓋？\n${name}`)) return false;
    const image = buildComfortImage(report);
    file ??= await folder.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    try {
        await writable.write(image);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
    }
    return true;
}

function createComfortExperiment(root, options) {
    const node = id => root.querySelector('#comfort' + id);
    const buttons = name => [...root.querySelectorAll(`[data-comfort-${name}]`)];
    const height = options.heightControl;
    const records = new Map();
    const dialog = node('Calibration');
    const canPickFolder = typeof window.showDirectoryPicker === 'function';
    let folder = null;
    let pose = '1', calibration = null, trial = null, latest = null, busy = false;
    let pendingRun = null;
    let lastCompletedRunId = null, rerecordBackup = null;
    let status = '', calStatus = '', rendered = '';
    const selection = () => records.get(node('Subject').value);
    const connected = () => Boolean(options.getSystemState().connected);
    const canRerecord = () => !busy && !pendingRun && !dialog.open && connected() && sameProfile() &&
        trial?.subject === node('Subject').value && trial?.pose === pose &&
        Boolean(trial?.runId && trial.runId === lastCompletedRunId) &&
        ['loaded', 'score'].includes(trial.stage);
    const active = () => Boolean(trial && !trial.saved && trial.stage !== 'blocked');
    const isHolding = () => dialog.open || active();
    const isBusy = () => busy || isHolding() || Boolean(options.isLocked?.());
    const stableReading = (after, state, methodReading = false) => connected() && (methodReading || state.ready) && latest &&
        performance.now() - latest.receivedMonotonicMs < 3000 && latest.receivedMonotonicMs > after &&
        (methodReading || latest.receivedMonotonicMs >= state.settledMonotonicMs) &&
        Object.keys(COMFORT_CHANNELS).every(ch => Number.isFinite(latest[ch + '_adc']) && latest[ch + '_adc'] > 0);

    function runMethod(plan) {
        const id = 'E02' + Date.now().toString(36).toUpperCase();
        const command = comfortCommand(id, plan);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (pendingRun?.id !== id) return;
                options.sendExperimentCommand(`EXP02,STOP,${id}`);
                pendingRun = null;
                reject(new Error('實驗 02 等待裝置回報逾時；已送出停止指令，請確認裝置輸出已關閉。'));
            }, 11 * 60 * 1000);
            const ackTimer = setTimeout(() => {
                if (pendingRun?.id !== id || pendingRun.acknowledged) return;
                options.sendExperimentCommand(`EXP02,STOP,${id}`);
                clearTimeout(timer);
                pendingRun = null;
                reject(new Error('ESP32 未回覆 EXP02,ACK；目前韌體可能不支援實驗 02 控制。'));
            }, 8000);
            pendingRun = { id, plan, deviceTimes: null, resolve, reject, timer, ackTimer, acknowledged: false };
            try { options.sendExperimentCommand(command); }
            catch (error) {
                clearTimeout(timer); clearTimeout(ackTimer); pendingRun = null; reject(error);
            }
        });
    }

    function receiveLine(line) {
        if (!line.startsWith('EXP02,') || !pendingRun) return;
        const parts = line.split(',');
        if (parts[2] !== pendingRun.id) return;
        const failReply = message => {
            const run = pendingRun; pendingRun = null;
            clearTimeout(run.timer); clearTimeout(run.ackTimer);
            options.sendExperimentCommand(`EXP02,STOP,${run.id}`);
            run.reject(new Error(message));
        };
        if (parts[1] === 'ACK') {
            if (parts.length !== 4 || parts[3] !== pendingRun.plan.mode) {
                failReply('ESP32 實驗模式回覆不一致，已送出停止指令');
                return;
            }
            pendingRun.acknowledged = true;
            clearTimeout(pendingRun.ackTimer);
        } else if (parts[1] === 'TIME' && pendingRun.plan.mode === 'ADC_TIME') {
            try {
                pendingRun.deviceTimes = comfortDeviceTimes(parts, pendingRun.plan);
                trial.deviceTimes = pendingRun.deviceTimes;
            } catch (error) { failReply(error.message); }
        } else if (parts[1] === 'STATE') {
            if (parts.length === 4 && ['DRAIN', 'MONITOR', 'NECK', 'HEAD', 'SETTLE'].includes(parts[3])) {
                pendingRun.phase = parts[3];
            }
            status = `裝置執行中：${parts[3] || '等待回報'}`;
        } else if (parts[1] === 'DONE' || parts[1] === 'ERR') {
            if (parts[1] === 'DONE' && (!pendingRun.acknowledged ||
                (pendingRun.plan.mode === 'ADC_TIME' && !pendingRun.deviceTimes) ||
                parts.length !== 7 || parts.slice(3, 5).some(v => !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))))) {
                failReply('ESP32 完成回覆缺少本輪模式、充氣時間或有效壓力資料');
                return;
            }
            const run = pendingRun;
            pendingRun = null;
            clearTimeout(run.timer);
            clearTimeout(run.ackTimer);
            if (parts[1] === 'DONE' && parts.length >= 7) run.resolve(parts);
            else run.reject(new Error(parts[1] === 'ERR'
                ? `ESP32 中止實驗 02：${parts[3] || '未知原因'}${parts[3] === 'SENSOR_TIMEOUT' && run.phase ? '（階段：' + run.phase + '）' : ''}`
                : 'ESP32 實驗回覆欄位不完整'));
        }
        if (root.isConnected) refresh();
    }

    function profile() {
        const p = options.getUserProfile();
        return p && ['female', 'male'].includes(p.gender) && Number.isInteger(p.age_years) &&
            p.age_years > 0 && p.body_height_cm > 0 && p.body_weight_kg > 0 ? p : null;
    }
    const sameProfile = () => !selection() || JSON.stringify(profile()) === JSON.stringify(selection().profile);
    const bothAnchors = () => Boolean(selection()?.anchors['1'] && selection()?.anchors['5']);
    const numeric = (input, channel) => {
        const n = input.valueAsNumber, spec = COMFORT_CHANNELS[channel];
        return n >= spec.minCm && n <= spec.maxCm && Number.isInteger(n * 2) ? n : null;
    };
    const head = node('CalHead'), neck = node('CalNeck');
    const targetHeights = () => [numeric(head, 'head'), numeric(neck, 'neck')];
    function renderTrial() {
        if (!trial) { node('Trial').hidden = true; rendered = ''; return; }
        const report = comfortReport(trial);
        const signature = JSON.stringify(report);
        if (signature === rendered) return;
        rendered = signature;
        node('ScoreLabel').textContent = `${COMFORT_POSES[trial.pose].label} · ${trial.method} 的滿意度（0–10 分）`;
        const elements = [];
        const text = (tag, value) => {
            const el = document.createElement(tag); el.textContent = value; return el;
        };
        elements.push(text('h4', report.title));
        for (const line of report.details) elements.push(text('p', line));
        for (const section of report.sections) {
            const wrap = document.createElement('div');
            wrap.className = 'comfort-trial-table';
            const table = document.createElement('table');
            const header = table.createTHead().insertRow();
            for (const value of section.headers) {
                const cell = text('th', value); cell.scope = 'col'; header.append(cell);
            }
            const body = table.createTBody();
            for (const row of section.rows) {
                const tr = body.insertRow();
                row.forEach(value => tr.append(text('td', value)));
            }
            wrap.append(table);
            elements.push(text('h4', section.title), wrap);
        }
        node('Trial').replaceChildren(...elements);
        node('Trial').hidden = false;
    }

    function refresh() {
        if (root.isConnected && isBusy()) height.tick();
        const state = height.getState();
        const rec = selection();
        node('Profile').textContent = comfortProfileText(rec?.profile || profile()) +
            (sameProfile() ? '' : '　上方資料與此編號的已儲存資料不同，請先對齊。');
        node('Subject').disabled = isBusy();
        node('Folder').disabled = !canPickFolder || busy || dialog.open || (active() && !trial.loaded);
        for (const p of ['1', '5']) node('Anchor' + p).textContent = comfortAnchorText(rec?.anchors[p]).join('\n');
        const count = p => Object.keys(rec?.trials || {}).filter(k => k.startsWith(p)).length;
        node('Progress').textContent = `姿勢一 ${count('1')}／4 · 姿勢五 ${count('5')}／4`;
        buttons('calibrate').forEach(button => {
            button.disabled = isBusy() || !node('Subject').value || !profile() || !sameProfile() || !connected() || count('1') + count('5') > 0;
        });
        node('AnchorShot').disabled = !folder || !bothAnchors() || isBusy();
        buttons('pose').forEach(button => {
            button.disabled = isBusy();
            button.setAttribute('aria-pressed', String(button.dataset.comfortPose === pose));
        });
        node('EmptyConfirmed').disabled = !bothAnchors() || !sameProfile() || !connected() || isBusy();
        buttons('method').forEach(button => {
            const m = button.dataset.comfortMethod, done = Boolean(rec?.trials[pose + m]);
            button.textContent = `${done ? '✓ ' : ''}${m} · ${COMFORT_METHODS[m]}`;
            button.disabled = isBusy() || (!done && (!bothAnchors() || !sameProfile() || !connected() || !node('EmptyConfirmed').checked));
            button.setAttribute('aria-pressed', String(trial?.method === m && trial.pose === pose));
        });
        node('Status').textContent = busy ? [status, pendingRun ? '' : state.reason].filter(Boolean).join(' · ') : status ||
            (bothAnchors() ? (options.calibrationOnly ? '請儲存校正總覽，再請受試者離枕，抽乾並恢復開機高度。' : '選擇姿勢、確認離枕，再按方法。') : '先完成兩個姿勢的校正。');
        const live = latest && performance.now() - latest.receivedMonotonicMs < 3000 && connected()
            ? Object.keys(COMFORT_CHANNELS).map(ch => `${COMFORT_CHANNELS[ch].label} ${comfortPressure(ch, latest[ch + '_adc'])}`).join('　')
            : '等待新壓力讀值';
        node('Live').textContent = live;
        node('Capture').hidden = !['empty', 'loaded'].includes(trial?.stage);
        node('Capture').textContent = trial?.stage === 'loaded' ? '記錄躺回壓力' : '記錄空枕壓力';
        node('Capture').disabled = busy || !stableReading(trial?.after ?? Infinity, state, true);
        node('RerecordEmpty').hidden = !trial?.empty;
        node('RerecordLoaded').hidden = !trial?.loaded;
        node('RerecordEmpty').disabled = !canRerecord() || !trial?.empty;
        node('RerecordLoaded').disabled = !canRerecord() || !trial?.loaded;
        node('RerecordHint').hidden = !trial?.empty && !trial?.loaded && !rerecordBackup;
        node('RerecordHint').textContent = trial?.runId && trial.runId !== lastCompletedRunId
            ? '此結果不是目前可確認的最近一次支撐設定，僅供檢視與存圖，不能重新取樣。'
            : '重新記錄不重新打氣。重記空枕後需再記躺回並重新評分；已存的 SVG 需再次儲存才會更新。';
        node('Cancel').hidden = !active();
        node('Cancel').textContent = rerecordBackup ? '取消重新記錄' : '取消本次測試';
        node('ScoreGroup').hidden = !trial || trial.stage === 'blocked';
        node('Score').disabled = busy || !trial?.loaded || Boolean(trial?.saved);
        node('ResultShot').disabled = busy || !folder || !trial?.loaded || node('Score').value === '';
        node('ResultShot').textContent = trial?.saved ? '重新儲存結果圖' : '截圖並儲存本次結果';
        renderTrial();
        if (dialog.open) {
            const ready = state.ready && connected() && !busy;
            const [h, n] = targetHeights();
            const match = h === state.head && n === state.neck;
            node('CalStatus').textContent = busy ? [calStatus, state.reason].filter(Boolean).join(' · ') : calStatus;
            node('CalLive').textContent = `裝置回報：Head ${state.head ?? '—'} cm / Neck ${state.neck ?? '—'} cm。 ${live}`;
            node('CalClose').disabled = busy;
            head.disabled = neck.disabled = !ready;
            buttons('step').forEach(button => { button.disabled = !ready; });
            node('CalApply').disabled = !ready || h === null || n === null || match;
            node('CalStable').disabled = !ready || !match;
            node('CalSave').disabled = !ready || !match || !node('CalStable').checked ||
                !sameProfile() || !stableReading(calibration.after, state);
        }
        options.onChange();
    }

    async function operate(work, reportError) {
        busy = true;
        refresh();
        try { await work(); }
        catch (error) { reportError(error.message, error); }
        finally { busy = false; refresh(); }
    }
    function openCalibration(p) {
        lastCompletedRunId = null;
        calibration = { pose: p, subject: node('Subject').value, profile: profile(), after: Infinity };
        node('CalTitle').textContent = `校正${COMFORT_POSES[p].label}`;
        node('CalStable').checked = false;
        head.value = '7';
        neck.value = '10';
        calStatus = '正在讀取目前高度，請受測者維持指定姿勢。';
        dialog.showModal();
        return operate(async () => {
            await options.beforeCalibrationPrepare?.(calibration);
            const state = await height.prepare();
            const suggestion = p === '5' ? options.getPose5Suggestion?.() : null;
            head.value = suggestion?.head ?? state.head;
            neck.value = suggestion?.neck ?? state.neck;
            calibration.after = performance.now();
            calStatus = '請依受測者感受微調頭頸高度。';
        }, message => { calStatus = message; });
    }
    function closeCalibration() {
        if (busy) return;
        dialog.close();
        calibration = null;
        refresh();
    }
    async function startMethod(method) {
        if (isBusy()) return;
        const rec = selection();
        const saved = rec?.trials[pose + method];
        if (saved) {
            trial = saved;
            node('Score').value = String(trial.score);
            status = '已完成，可重新儲存本次結果圖。';
            refresh();
            return;
        }
        if (isBusy() || !bothAnchors() || !sameProfile() || !connected() || !node('EmptyConfirmed').checked) return;
        const anchor = rec.anchors[pose];
        const plan = comfortPlan(pose, method, anchor);
        trial = { subject: node('Subject').value, pose, method, anchor, plan, stage: 'blocked' };
        node('Score').value = '';
        if (plan.issues.length) {
            status = plan.issues.join('。') + '。本次未送出充氣指令。';
            refresh();
            return;
        }
        trial.stage = 'filling';
        lastCompletedRunId = null;
        rerecordBackup = null;
        node('EmptyConfirmed').checked = false;
        status = '準備實驗 02 控制，等待 ESP32 吸乾與充氣。';
        await operate(async () => {
            const done = await runMethod(plan);
            trial.deviceEmpty = { head_adc: Number(done[3]), neck_adc: Number(done[4]) };
            trial.runId = done[2];
            lastCompletedRunId = done[2];
            trial.after = performance.now();
            trial.stage = 'empty';
            status = '充氣已完成。保持空枕，待穩定後按「記錄空枕壓力」。';
        }, message => { trial = null; status = message; });
    }
    function capturePressure() {
        if (!stableReading(trial?.after ?? Infinity, height.getState(), true)) return;
        if (trial.stage === 'empty') {
            trial.empty = { ...latest };
            trial.after = latest.receivedMonotonicMs;
            trial.stage = 'loaded';
            status = `空枕壓力已保存。請以${COMFORT_POSES[trial.pose].label}躺回，穩定後記錄。`;
        } else if (trial.stage === 'loaded') {
            trial.loaded = { ...latest };
            trial.stage = 'score';
            status = '躺回壓力已保存。請詢問本次支撐的滿意度，選擇 0–10 分後儲存並截圖。';
        }
        refresh();
    }

    function restartCapture(kind) {
        if (!canRerecord() || !trial.empty || (kind === 'loaded' && !trial.loaded)) return;
        if (!['empty', 'loaded'].includes(kind)) return;
        if (trial.saved && !window.confirm('重新記錄不會重新打氣。請確認目前仍維持本輪方法的支撐設定；若已調整高度或氣囊，請取消。原 SVG 會保留，直到你再次儲存。')) return;
        // Edit a separate working copy. Saved results/files stay intact until a
        // successful save; Cancel can also restore an unsaved original snapshot.
        rerecordBackup ??= { trial, score: node('Score').value };
        trial = { ...trial, saved: false, stage: kind, after: performance.now() };
        if (kind === 'empty') delete trial.empty;
        delete trial.loaded;
        delete trial.score;
        node('Score').value = '';
        status = kind === 'empty'
            ? '重新記錄空枕：請受測者離枕，待壓力穩定後按「記錄空枕壓力」，再重新記錄躺回與評分。'
            : '重新記錄躺回：保留空枕紀錄，請以本輪姿勢躺回，待穩定後按「記錄躺回壓力」，再重新評分。';
        refresh();
    }

    function restoreRerecord(message) {
        if (!rerecordBackup) return false;
        trial = rerecordBackup.trial;
        node('Score').value = rerecordBackup.score;
        rerecordBackup = null;
        status = message;
        return true;
    }

    for (let n = 1; n <= 10; n++) {
        const id = 'S' + String(n).padStart(2, '0');
        node('Subject').add(new Option(id, id));
    }
    for (let n = 0; n <= 10; n++) node('Score').add(new Option(String(n), String(n)));
    node('Subject').addEventListener('change', () => {
        lastCompletedRunId = null; rerecordBackup = null;
        pose = '1'; trial = null; status = ''; node('EmptyConfirmed').checked = false; refresh();
    });
    buttons('pose').forEach(button => button.addEventListener('click', () => {
        pose = button.dataset.comfortPose; trial = null; status = ''; node('EmptyConfirmed').checked = false; refresh();
    }));
    buttons('method').forEach(button => button.addEventListener('click', () => startMethod(button.dataset.comfortMethod)));
    buttons('calibrate').forEach(button => button.addEventListener('click', () => openCalibration(button.dataset.comfortCalibrate)));
    node('CalClose').addEventListener('click', closeCalibration);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeCalibration(); });
    buttons('step').forEach(button => button.addEventListener('click', () => {
        const [channel, delta] = button.dataset.comfortStep.split(':');
        const input = channel === 'head' ? head : neck, spec = COMFORT_CHANNELS[channel];
        const value = numeric(input, channel) ?? spec.minCm;
        input.value = Math.min(spec.maxCm, Math.max(spec.minCm, value + Number(delta)));
        node('CalStable').checked = false;
        refresh();
    }));
    for (const input of [head, neck]) input.addEventListener('input', () => { node('CalStable').checked = false; refresh(); });
    node('CalApply').addEventListener('click', () => {
        const [h, n] = targetHeights();
        if (h === null || n === null || !height.getState().ready) return;
        node('CalStable').checked = false;
        calStatus = '等待裝置到位。';
        return operate(async () => {
            if (height.getState().head !== h) await height.adjust('HEAD', h);
            if (height.getState().neck !== n) await height.adjust('NECK', n);
            calibration.after = performance.now();
            calStatus = '高度到位，請確認姿勢、穩定度與滿意度。';
        }, message => { calStatus = message; });
    });
    node('CalSave').addEventListener('click', async () => {
        if (node('CalSave').disabled || JSON.stringify(profile()) !== JSON.stringify(calibration.profile)) {
            calStatus = '基本資料已變更，請關閉並重新開啟校正。'; refresh(); return;
        }
        if (options.beforeCalibrationSave) {
            let captured = false;
            calStatus = '正在同步分類校正基準，請維持目前姿勢並自然呼吸…';
            await operate(async () => {
                await options.beforeCalibrationSave(calibration);
                captured = true;
            }, message => { calStatus = message; });
            if (!captured || !sameProfile()) return;
        }
        const state = height.getState();
        const rec = selection() || { anchors: {}, trials: {}, profile: calibration.profile };
        rec.anchors[calibration.pose] = { head: state.head, neck: state.neck, pressure: { ...latest } };
        records.set(calibration.subject, rec);
        options.onCalibrationChanged?.();
        status = bothAnchors() ? (options.calibrationOnly ? '兩個基準已保存，請截圖並儲存校正總覽。' : '兩個基準已保存。選好儲存資料夾後即可截圖，並可開始方法測試。') : '基準已保存，請完成另一個姿勢。';
        closeCalibration();
    });
    if (!canPickFolder) node('FolderStatus').textContent = '請在 Chrome 或 Edge 開啟網頁，以選擇本機儲存資料夾。';
    node('Folder').addEventListener('click', () => {
        if (node('Folder').disabled) return;
        operate(async () => {
            folder = await window.showDirectoryPicker({ mode: 'readwrite', id: options.folderId || 'ipillow-experiment-02' });
            node('FolderStatus').textContent = `儲存位置：${folder.name}`;
        }, (message, error) => {
            if (error.name !== 'AbortError') status = `選擇資料夾失敗：${message}`;
        });
    });
    node('AnchorShot').addEventListener('click', () => {
        if (node('AnchorShot').disabled) return;
        const rec = selection(), id = node('Subject').value;
        const name = options.experimentId ? `${id}_${options.experimentId}_00_校正總覽.svg` : `${id}_00_校正總覽.svg`;
        operate(async () => {
            const saved = await saveComfortImage(folder, name, {
                title: `${id}｜實驗 ${options.experimentId || '02'} 校正總覽`,
                details: [comfortProfileText(rec.profile), 'Monitor 固定 14.5 秒。校正值為滿意度 10 分時的單筆快照。',
                    ...['1', '5'].flatMap(p => [`${COMFORT_POSES[p].label}｜${rec.anchors[p].pressure.timestamp_iso}`, ...comfortAnchorText(rec.anchors[p])])],
                sections: []
            });
            if (saved) options.onCalibrationOverviewSaved?.();
            status = saved ? `已儲存 ${name}` : '已取消覆蓋，原檔保留。';
        }, message => { status = `截圖儲存失敗：${message}`; });
    });
    for (const id of ['EmptyConfirmed', 'CalStable', 'Score']) node(id).addEventListener('change', refresh);
    node('Capture').addEventListener('click', capturePressure);
    node('RerecordEmpty').addEventListener('click', () => restartCapture('empty'));
    node('RerecordLoaded').addEventListener('click', () => restartCapture('loaded'));
    node('Cancel').addEventListener('click', () => {
        if (pendingRun) options.sendExperimentCommand(`EXP02,STOP,${pendingRun.id}`);
        else if (!busy) {
            if (!restoreRerecord('已取消重新記錄，原壓力紀錄與評分已恢復。')) {
                trial = null; status = '已取消本次測試，請重新確認離枕再選方法。';
            }
            refresh();
        }
    });
    node('ResultShot').addEventListener('click', () => {
        if (node('ResultShot').disabled) return;
        const result = { ...trial, score: Number(node('Score').value), saved: true };
        const name = `${result.subject}_${COMFORT_POSES[result.pose].label}_${result.method}.svg`;
        operate(async () => {
            if (!(await saveComfortImage(folder, name, comfortReport(result)))) {
                status = '已取消覆蓋，原檔保留。';
                return;
            }
            selection().trials[result.pose + result.method] = result;
            trial = result;
            rerecordBackup = null;
            status = `已儲存 ${name}`;
        }, message => { status = `截圖儲存失敗：${message}`; });
    });
    setInterval(() => { if (root.isConnected) refresh(); }, 250);
    return {
        resetCalibration: () => {
            if (isBusy()) return;
            records.delete(node('Subject').value); trial = null; calibration = null;
            status = '請重新完成兩姿勢校正。'; options.onCalibrationChanged?.(); refresh();
        },
        getCalibration: () => ({ subject: node('Subject').value, record: selection(), folder, valid: bothAnchors() && sameProfile() }),
        refresh, isBusy, isHolding, receiveLine, needsLeaveProtection: () => records.size > 0 || isBusy(),
        getUiState: () => ({
            status: bothAnchors() ? 'completed' : 'idle',
            statusText: busy ? '裝置設定中' : bothAnchors() ? '兩姿勢已校正' : '待完成校正',
            hint: '校正與測試快照暫存在本頁。請在離開前確認所有 SVG 均已存入選定的資料夾。'
        }),
        receivePressure: sample => { if (!latest || sample.receivedMonotonicMs >= latest.receivedMonotonicMs) latest = { ...sample }; },
        onDisconnected: () => {
            lastCompletedRunId = null;
            if (pendingRun) {
                const run = pendingRun; pendingRun = null;
                clearTimeout(run.timer); clearTimeout(run.ackTimer);
                run.reject(new Error('BLE 已斷線；ESP32 已停止本輪輸出。'));
            }
            latest = null;
            node('EmptyConfirmed').checked = false;
            if (calibration) {
                node('CalStable').checked = false;
                calStatus = 'BLE 已斷線；重新連線後請關閉並重新開啟校正。';
            }
            if (!busy && restoreRerecord('BLE 已斷線，已取消重新記錄並保留原紀錄與評分。')) {
                // Restored snapshots remain viewable, but cannot be sampled
                // again until a newly completed run establishes the support.
            } else if (active() && !trial.loaded && !busy) { trial = null; status = 'BLE 已斷線，本次量測中止。'; }
            if (root.isConnected) refresh();
        }
    };
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
    comfortPlan, comfortReport, comfortFillTime, comfortCommand, comfortDeviceTimes
};
