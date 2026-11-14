// EXP04 exports one pair per height; both CSVs use the very same second rows.
const OCCUPANCY_CSV_COLUMNS = ['timestamp', 'actual_state', 'segment_second',
    'monitor_kpa', 'neck_kpa', 'head_kpa', 'monitor_ratio', 'neck_ratio', 'head_ratio',
    'monitor_result', 'majority_result', 'data_status'];

function occupancyLocalTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    const pad = (n, width = 2) => String(n).padStart(width, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}-${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function occupancyFileStem(subject, group, simulated = false) {
    return `${simulated ? 'SIMULATED_' : ''}${subject}_EXP04_姿勢${group === '5' ? '五' : '一'}高度`;
}

function occupancyCsvFiles(runs) {
    const continuous = [], segments = [];
    const decision = value => value === 1 ? '有人' : value === 0 ? '空枕' : '';
    for (const run of runs) {
        for (const row of occupancySecondRows(run)) {
            const output = { timestamp: occupancyLocalTime(row.received_at), actual_state: occupancyLabel(row.actual),
                segment_second: row.segment_elapsed_s.toFixed(3),
                monitor_result: decision(row.monitor_result), majority_result: decision(row.majority_result),
                data_status: row.validity === 'VALID' ? '有效' : row.validity === 'MISSING' ? '缺資料' : '無效',
                record_phase: row.window === 'FORMAL' ? '本段30秒內' : '30秒後等待' };
            for (const ch of OCCUPANCY_CHANNELS) {
                output[ch + '_kpa'] = row[ch + '_kpa'];
                output[ch + '_ratio'] = row[ch + '_ratio'];
            }
            continuous.push(output);
            if (row.window === 'FORMAL') segments.push(output);
        }
    }
    return { segments: rapidCsv(OCCUPANCY_CSV_COLUMNS, segments),
        continuous: rapidCsv([...OCCUPANCY_CSV_COLUMNS, 'record_phase'], continuous) };
}

const occupancyLabel = actual => actual === 'empty' ? '離開枕頭' : actual === 'unknown' ? '尚未標記' : `姿勢${['', '一', '二', '三', '四', '五'][Number(actual)] || actual}`;
function occupancyReport(runs, subject) {
    return { title: `${runs.some(r => r.dataOrigin === 'SIMULATED') ? '模擬資料｜' : ''}${subject}｜實驗04姿勢${runs[0]?.group === '5' ? '五' : '一'}高度躺枕／離枕`,
        details: ['按開始啟用按鈕，再按姿勢開始記錄；無初始空枕段。分段CSV每段30秒，連續CSV包含等待。',
            `規則：${OCCUPANCY_RULE.version}；全30人refit候選，三顆多數決待驗證。`,
            '姿勢一 M/N/H：0.48 / 0.27 / 0.45；姿勢五：0.63 / 0.75 / 0.67。',
            '比值＝目前kPa／個人對應高度LOAD kPa；>=門檻判有人，至少2/3判多數有人。',
            'CSV時間為電腦本機接收時間；缺資料時間留空，不作空枕。完整標記時間與校正規則隨本圖保存。',
            '正確/有效以各段前30秒的最後一筆新資料逐秒計數；等待與缺資料不進分母。'],
        sections: runs.map((r, i) => {
            const rows = occupancySecondRows(r);
            return { title: `第${i + 1}輪｜姿勢${r.group}高度 H ${r.head} / N ${r.neck} cm｜${r.status}｜${r.completed.length}/5｜${occupancyLocalTime(r.startedAt)}`,
                headers: ['段／實際狀態', '角色', '總秒數', '額外秒數', '滿30秒', '有效秒格', 'Monitor正確/有效', '多數決正確/有效'],
                widths: [160, 165, 100, 100, 100, 120, 180, 180],
                rows: r.segments.map(s => [`${s.id}／${occupancyLabel(s.actual)}`, s.role,
                    ((s.end_ms - s.start_ms) / 1000).toFixed(1), (s.extension_ms / 1000).toFixed(1), s.reached ? '是' : '否',
                    `${rows.filter(row => row.segment_id === s.id && row.window === 'FORMAL' && row.validity === 'VALID').length}/30`,
                    ...['monitor_result', 'majority_result'].map(kind => {
                        const valid = rows.filter(row => row.segment_id === s.id && row.window === 'FORMAL' && row.validity === 'VALID');
                        return `${valid.filter(row => row[kind] === (s.actual === 'empty' ? 0 : 1)).length}/${valid.length}`;
                    })]) };
        }) };
}

async function occupancyReportSvg(runs, subject, events) {
    const image = await buildComfortImage(occupancyReport(runs, subject)).text();
    const doc = new DOMParser().parseFromString(image, 'image/svg+xml');
    const metadata = doc.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    metadata.setAttribute('id', 'exp04-records');
    metadata.textContent = JSON.stringify({ schema: 'EXP04_OCCUPANCY_V3',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        runs: runs.map(({ samples, ...record }) => record), events });
    doc.documentElement.append(metadata);
    return new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml;charset=utf-8' });
}

function occupancyPressureDatasets(run) {
    return rapidPressureDatasets({ events: (run?.samples || []).map(s => ({ ...s, type: 'pressure' })) });
}

async function occupancyPressurePng(runs) {
    const first = runs[0];
    const run = { ...first, samples: [], segments: [], duration_ms: 0 };
    for (const r of runs) {
        const offset = r.start - first.start;
        if (run.samples.length) run.samples.push({ elapsed_ms: offset, monitor_adc: null, neck_adc: null, head_adc: null });
        run.samples.push(...r.samples.map(s => ({ ...s, elapsed_ms: s.elapsed_ms + offset })));
        run.segments.push(...r.segments.map(s => ({ ...s, start_ms: s.start_ms + offset, end_ms: s.end_ms + offset })));
        run.duration_ms = Math.max(run.duration_ms, offset + r.duration_ms);
    }
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 850;
    const options = rapidChartOptions(); options.responsive = false;
    options.scales.x.max = Math.max(1, run.duration_ms / 1000);
    options.scales.x.title.text = '本高度首次記錄後經過時間（秒；含中斷間隔）';
    options.plugins = {
        title: { display: true, font: { size: 22 }, text: `${run.dataOrigin === 'SIMULATED' ? '模擬資料｜' : ''}${run.subject}｜實驗04｜姿勢${run.group}高度｜共${runs.length}輪 H ${run.head} / N ${run.neck} cm` },
        subtitle: { display: true, font: { size: 15 }, text: `${occupancyLocalTime(run.startedAt)}｜${runs.at(-1).status}｜底色：躺枕／空枕；灰色：30秒後等待；中斷或缺口>3秒不連線` }
    };
    const chart = new Chart(canvas, { type: 'line', data: { datasets: occupancyPressureDatasets(run) }, options,
        plugins: [{ id: 'occupancyWindows', beforeDraw(c) {
            const ctx = c.ctx; ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            const { top, bottom } = c.chartArea;
            for (const s of run.segments) {
                const start = c.scales.x.getPixelForValue(s.start_ms / 1000), end = c.scales.x.getPixelForValue(s.end_ms / 1000);
                const formal = c.scales.x.getPixelForValue(Math.min(s.end_ms, s.start_ms + OCCUPANCY_SEGMENT_MS) / 1000);
                ctx.fillStyle = s.actual === 'empty' ? '#edf2f8' : '#e8f4eb'; ctx.fillRect(start, top, formal - start, bottom - top);
                ctx.fillStyle = '#dedede'; ctx.fillRect(formal, top, end - formal, bottom - top);
                ctx.fillStyle = '#24364b'; ctx.font = '12px sans-serif'; ctx.fillText(s.actual === 'empty' ? '空枕' : `姿勢${s.actual}`, start + 2, top + 15 + (s.id % 2) * 15);
            }
            ctx.restore();
        } }] });
    try { return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('壓力曲線產生失敗')), 'image/png')); }
    finally { chart.destroy(); }
}
