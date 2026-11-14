// EXP03 records device predictions; it never runs or combines classifiers.
const RAPID_DURATION_MS = 20000;
const RAPID_CHECKPOINTS = [3, 5, 10, 15, 20];

function rapidSecondRows(run) {
    return Array.from({ length: 20 }, (_, i) => {
        const second = i + 1;
        const events = run.events.filter(e => e.type === 'classification' && e.elapsed_ms > i * 1000 && e.elapsed_ms <= second * 1000);
        return { second, event: events.at(-1) || null, count: events.length,
            status: i * 1000 >= (run.duration_ms ?? RAPID_DURATION_MS) ? 'NOT_RECORDED' : 'MISSING' };
    });
}

function rapidModelValues(event, kind, missing = '缺資料') {
    const model = event?.result?.[kind];
    if (!model) return [missing, '—', '—'];
    if (model.status === 'WARMUP') return [`暖機 ${event.result.historyCount + 1}/6`, '—', '—'];
    if (model.status === 'INVALID') return ['讀值無效', '—', '—'];
    return [model.group === 'GROUP1' ? 'Group1' : 'Group2', (model.p1 * 100).toFixed(1) + '%', (model.p2 * 100).toFixed(1) + '%'];
}

function rapidCompleteness(run) {
    const rows = rapidSecondRows(run);
    const count = kind => rows.filter(r => r.event?.result[kind].status === 'OK').length;
    return { received: rows.filter(r => r.event).length, staticValid: count('staticModel'), historyValid: count('historyModel') };
}

const RAPID_BASE_COLUMNS = ['schema_version', 'data_origin', 'run_id', 'subject', 'gender', 'age_years', 'height_cm', 'weight_kg',
    'actual_pose', 'expected_group', 'fixed_head_cm', 'fixed_neck_cm', 'run_started_at', 'run_status', 'run_duration_ms',
    'classification_start_ack_elapsed_ms', 'calibration_json', 'firmware_calibration_json'];
const RAPID_RESULT_COLUMNS = ['elapsed_ms', 'received_at', 'session', 'sequence', 'tick_ms', 'sample_sequence', 'sample_ms',
    'monitor_adc', 'neck_adc', 'head_adc', 'static_status', 'static_group', 'static_p_group1', 'static_p_group2',
    'history_status', 'history_group', 'history_p_group1', 'history_p_group2', 'history_count', 'dropped', 'inference_us'];

function rapidBaseRow(run) {
    return { schema_version: 'EXP03_DUAL_V1', data_origin: run.dataOrigin, run_id: run.id, subject: run.subject,
        gender: run.profile.gender, age_years: run.profile.age_years, height_cm: run.profile.body_height_cm, weight_kg: run.profile.body_weight_kg,
        actual_pose: run.pose, expected_group: run.pose === '1' ? 'GROUP1' : 'GROUP2', fixed_head_cm: run.head, fixed_neck_cm: run.neck,
        run_started_at: run.startedAt, run_status: run.status, run_duration_ms: run.duration_ms,
        classification_start_ack_elapsed_ms: run.startAckElapsedMs,
        calibration_json: JSON.stringify(run.calibration), firmware_calibration_json: JSON.stringify(run.firmwareCalibration) };
}

function rapidEventRow(event) {
    if (!event) return {};
    const row = { elapsed_ms: event.elapsed_ms, received_at: event.received_at };
    if (event.type === 'pressure') return { ...row, monitor_adc: event.monitor_adc, neck_adc: event.neck_adc, head_adc: event.head_adc };
    const r = event.result;
    Object.assign(row, { session: r.session, sequence: r.sequence, tick_ms: r.tickMs, sample_sequence: r.sampleSequence,
        sample_ms: r.sampleMs, monitor_adc: r.adc[0], neck_adc: r.adc[1], head_adc: r.adc[2],
        history_count: r.historyCount, dropped: r.dropped, inference_us: r.inferenceUs });
    for (const [prefix, model] of [['static', r.staticModel], ['history', r.historyModel]]) {
        row[prefix + '_status'] = model.status; row[prefix + '_group'] = model.group;
        row[prefix + '_p_group1'] = model.p1; row[prefix + '_p_group2'] = model.p2;
    }
    return row;
}

function rapidCsv(columns, rows) {
    const escape = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    return '\uFEFF' + [columns.map(escape).join(','), ...rows.map(r => columns.map(c => escape(r[c])).join(','))].join('\r\n');
}

function rapidCsvFiles(runs) {
    const seconds = [], events = [];
    for (const run of runs) {
        const base = rapidBaseRow(run);
        for (const row of rapidSecondRows(run)) seconds.push({ ...base, second: row.second, classification_count_in_second: row.count,
            static_status: row.status, history_status: row.status, ...rapidEventRow(row.event) });
        events.push({ ...base, event_type: 'run' });
        for (const event of run.events) events.push({ ...base, event_type: event.type, ...rapidEventRow(event) });
    }
    return {
        seconds: rapidCsv([...RAPID_BASE_COLUMNS, 'second', 'classification_count_in_second', ...RAPID_RESULT_COLUMNS], seconds),
        events: rapidCsv([...RAPID_BASE_COLUMNS, 'event_type', ...RAPID_RESULT_COLUMNS], events)
    };
}

function rapidPressureDatasets(run) {
    return ['monitor', 'neck', 'head'].map((ch, i) => {
        const data = []; let lastMs = null;
        for (const event of run?.events || []) {
            if (event.type !== 'pressure') continue;
            if (lastMs !== null && event.elapsed_ms - lastMs > 3000) data.push({ x: (lastMs + event.elapsed_ms) / 2000, y: null });
            data.push({ x: event.elapsed_ms / 1000, y: event[ch + '_adc'] }); lastMs = event.elapsed_ms;
        }
        return { label: ['Monitor', 'Neck', 'Head'][i], data, borderColor: ['#6b8e23', '#3b82f6', '#ef8354'][i],
            pointRadius: 2, borderWidth: 2, spanGaps: false };
    });
}

function rapidChartOptions() {
    return { animation: false, responsive: true, maintainAspectRatio: false, parsing: false,
        scales: { x: { type: 'linear', min: 0, max: 20, title: { display: true, text: '按開始後經過時間（秒）' } },
            y: { title: { display: true, text: 'ADC' } } } };
}

async function rapidPressurePng(run, index) {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 800;
    const options = rapidChartOptions(); options.responsive = false;
    options.plugins = { title: { display: true, font: { size: 23 }, text: `${run.dataOrigin === 'SIMULATED' ? '模擬資料｜' : ''}${run.subject}｜姿勢${run.pose}｜第${index + 1}輪｜20秒壓力曲線` },
        subtitle: { display: true, text: `${run.startedAt}｜${run.status}｜Head ${run.head} cm / Neck ${run.neck} cm｜P訊息接收時間；超過3秒缺口不連線`, font: { size: 16 } } };
    const chart = new Chart(canvas, { type: 'line', data: { datasets: rapidPressureDatasets(run) }, options,
        plugins: [{ id: 'whiteBackground', beforeDraw(c) { const ctx = c.ctx; ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); } }] });
    try {
        return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('壓力曲線圖片產生失敗')), 'image/png'));
    } finally { chart.destroy(); }
}

async function writeRapidFile(folder, name, content) {
    const handle = await folder.getFileHandle(name, { create: true });
    const writer = await handle.createWritable();
    try { await writer.write(content); await writer.close(); }
    catch (error) { await writer.abort().catch(() => {}); throw error; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = {
    RAPID_DURATION_MS, RAPID_CHECKPOINTS, RAPID_BASE_COLUMNS, RAPID_RESULT_COLUMNS,
    rapidSecondRows, rapidModelValues, rapidCompleteness, rapidCsvFiles, rapidPressureDatasets, writeRapidFile
};
