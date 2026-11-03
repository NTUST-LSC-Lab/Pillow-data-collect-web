// One pressure-collection experiment. It observes parsed samples and never sends commands.
function createPressureCollectionExperiment(root, options) {
    const { gapTimeoutMs, conditions, getSystemState, onChange } = options;
    // Keep one last run per condition so changing the selector never discards unsaved results.
    const recorders = new Map(conditions.map(condition => [condition.id,
        createPressureRecorder({ durationMs: 30000, gapTimeoutMs })
    ]));
    const field = id => root.querySelector(`#${id}`);
    const form = field('pressureRunForm');
    const settings = field('pressureRunSettings');
    const confirmed = field('pressureSetupConfirmed');
    const conditionSelect = field('pressureCondition');
    let selectedConditionId = conditionSelect.value;
    let recorder = recorders.get(selectedConditionId);
    const statusLabels = {
        idle: '尚未開始', recording: '記錄中', completed: '計時完成',
        ended_early: '提前結束（未完成）', interrupted: '收集中斷'
    };
    const reasonLabels = {
        pressure_gap: '完整壓力訊息接收間隔達到中斷門檻',
        no_pressure_data: '開始後未收到有效壓力訊息', ble_disconnected: 'BLE 斷線'
    };
    let latestSample = null;
    let previousSample = null;
    let recentIntervals = [];
    let chart = null;
    let plottedRunId = null;
    let plottedCount = -1;
    let plottedConditionId = null;
    let priorStatus = 'idle';
    let feedback = '';
    let lastUiState = null;

    function freshStream() {
        return latestSample && recentIntervals.length > 0 &&
            performance.now() - latestSample.receivedMonotonicMs < gapTimeoutMs &&
            recentIntervals.at(-1) < gapTimeoutMs;
    }

    function setText(id, text) {
        const node = field(id);
        if (node.textContent !== text) node.textContent = text;
    }

    function updateConditionDescription() {
        const condition = conditions.find(item => item.id === conditionSelect.value);
        setText('pressureConditionDescription', condition
            ? `實際睡姿：${condition.poseText}（${condition.actual_pose}）｜高度條件：${condition.height_condition}（該睡姿對應高度）｜${condition.scenario}`
            : '請選擇一個有效條件。');
    }

    function ensureChart(state) {
        const canvas = field('pressureRunChart');
        // A collapsed/detached view keeps its data; create/redraw only when visible.
        if (!canvas.isConnected || canvas.offsetParent === null || typeof Chart !== 'function') return false;
        if (!chart) {
            chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { datasets: [
                    { label: 'Monitor', borderColor: 'rgb(175, 71, 71)' },
                    { label: 'Neck', borderColor: 'rgb(5, 192, 2)' },
                    { label: 'Head', borderColor: 'rgb(5, 2, 192)' }
                ].map(dataset => ({ ...dataset, data: [], borderWidth: 1, pointRadius: 1, fill: false })) },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    plugins: { title: { display: true, text: '' } },
                    scales: {
                        x: { type: 'linear', min: 0, max: 30, title: { display: true, text: 'elapsed_s（秒）' } },
                        y: { title: { display: true, text: '壓力（ADC）' } }
                    }
                }
            });
        }
        if (plottedConditionId === selectedConditionId && plottedRunId === state.runId && plottedCount === state.samples.length) return true;
        const condition = conditions.find(item => item.id === selectedConditionId);
        // Chart.js exposes resolved options as Proxies. Never write that Proxy
        // back into its own config; update the initialized title's leaf value.
        chart.options.plugins.title.text = state.metadata
            ? `條件 ${state.metadata.condition_id}｜${state.metadata.subject_id}／trial ${state.metadata.trial_index}｜${state.metadata.actual_pose}／${state.metadata.test_condition}`
            : `條件 ${condition.id}｜${condition.poseText}／${condition.scenario}｜尚未開始`;
        ['monitor_adc', 'neck_adc', 'head_adc'].forEach((key, index) => {
            chart.data.datasets[index].data = state.samples.map(sample => ({ x: sample.elapsed_s, y: sample[key] }));
        });
        chart.update('none');
        plottedRunId = state.runId;
        plottedCount = state.samples.length;
        plottedConditionId = selectedConditionId;
        return true;
    }

    function eligibilityHint(state, system) {
        if (state.status === 'recording') return '本輪設定已鎖定；收合介面不會停止記錄。';
        if (state.samples.length && !state.exportRequested) return '請先匯出此條件上一輪的 CSV 與線圖，再重測，以免遺失資料。';
        if (!system.connected) return '請先連接 ESP32，並確認持續收到有效的三通道壓力資料。';
        if (!freshStream()) return '請確認持續收到至少兩筆完整壓力訊息，且最後接收間隔未超過門檻。';
        if (!Number.isSafeInteger(Number(field('pressureTrial').value))) return '試次編號必須是有效的正整數。';
        if (!form.checkValidity()) return '請填妥受試者、試次、設定高度，並確認本輪姿勢與高度。';
        if (typeof Chart !== 'function') return '圖表元件尚未載入，請確認 Chart.js 可用。';
        return state.exportRequested ? '上一輪已要求下載；重測前仍需確認 CSV 與 PNG 線圖都已保存。' : '設定完成後，由操作者按「開始記錄」，不另加等待秒數。';
    }

    function refresh() {
        const state = recorder.tick();
        const system = getSystemState();
        const running = state.status === 'recording';
        settings.disabled = running;
        if (priorStatus === 'recording' && !running) confirmed.checked = false;
        priorStatus = state.status;
        setText('pressureBleStatus', system.connected ? '已連線' : '未連線');
        setText('pressureRunStatus', statusLabels[state.status]);
        setText('pressureElapsed', `${(state.elapsedMs / 1000).toFixed(1)} / 30.0`);
        setText('pressureSampleCount', String(state.samples.length));
        const ageMs = latestSample ? Math.max(0, performance.now() - latestSample.receivedMonotonicMs) : null;
        setText('pressureLastReceived', latestSample
            ? `${latestSample.timestamp_iso}（${(ageMs / 1000).toFixed(1)} 秒前${ageMs >= gapTimeoutMs ? '，已過期' : ''}）` : '尚無有效完整訊息');
        ['Monitor', 'Neck', 'Head'].forEach(channel => {
            const value = latestSample?.[`${channel.toLowerCase()}_adc`];
            setText(`pressureLive${channel}`, value === undefined ? '-' : `${value} ADC${ageMs >= gapTimeoutMs ? '（過期）' : ''}`);
        });
        setText('pressureObservedInterval', recentIntervals.length
            ? `最近 ${recentIntervals.at(-1).toFixed(1)}；範圍 ${Math.min(...recentIntervals).toFixed(1)}–${Math.max(...recentIntervals).toFixed(1)}（最近 ${recentIntervals.length} 個間隔）`
            : '等待實際接收間隔；每秒 P 查詢不等於取樣率');
        setText('pressureGapPolicy', `資料中斷門檻：連續 ${(gapTimeoutMs / 1000).toFixed(1)} 秒未收到有效完整壓力訊息。本設定依每秒 P 查詢節奏訂定，仍需實機驗證；不另增加 BLE 查詢。`);
        setText('pressureControlWarning', system.autoHeightPossible
            ? '目前為自動模式或 PRED 已啟用／請求啟動，可能改變高度，與固定高度條件不符。請操作者先確認控制狀態；本區不會停止 PRED、切換模式或控制充放氣。'
            : '目前 Web 未回報自動高度調整啟用；仍請操作者確認高度固定，避免其他控制改變本輪條件。本區不下達高度命令。');
        if (state.runId) {
            const m = state.metadata;
            const suffix = state.status === 'completed'
                ? '30 秒資料收集計時完成，不代表辨識穩健性已驗證。'
                : state.status === 'interrupted' ? reasonLabels[state.interruptionReason] || state.interruptionReason
                : state.status === 'ended_early' ? '已有樣本保留，本輪未完成 30 秒。' : '正在收集原始 ADC。';
            setText('pressureRunSummary', `本輪紀錄｜${m.subject_id}／trial ${m.trial_index}／條件 ${m.condition_id}／${m.actual_pose}／${m.height_condition}／${m.test_condition}／Head ${m.head_height_cm} cm、Neck ${m.neck_height_cm} cm｜${state.samples.length} 筆。${suffix}`);
        } else {
            setText('pressureRunSummary', `條件 ${selectedConditionId} 尚無本輪收集結果；開始記錄後才會繪製本條件曲線。`);
        }
        ensureChart(state);
        const pending = conditions.filter(condition => {
            const saved = recorders.get(condition.id).getState();
            return condition.id !== selectedConditionId && saved.samples.length > 0 && !saved.exportRequested;
        }).map(condition => condition.id);
        const pendingHint = pending.length ? ` 條件 ${pending.join('、')} 尚有未匯出的結果，已暫存於本頁，可切回匯出。` : '';
        const hint = (feedback || eligibilityHint(state, system)) + pendingHint;
        lastUiState = {
            status: state.status, statusText: statusLabels[state.status],
            running, hint,
            startDisabled: running || !system.connected || !freshStream() || !form.checkValidity() ||
                !Number.isSafeInteger(Number(field('pressureTrial').value)) ||
                (state.samples.length > 0 && !state.exportRequested) || typeof Chart !== 'function',
            finishDisabled: !running, exportDisabled: running || state.samples.length === 0
        };
        onChange(lastUiState);
        return lastUiState;
    }

    function start() {
        feedback = '';
        if (recorder.getState().status === 'recording' || !switchCondition()) return;
        const state = recorder.getState();
        if (!form.reportValidity()) { refresh(); return; }
        if (refresh().startDisabled) return;
        if (state.samples.length && !window.confirm('請先確認此條件上一輪的 CSV 與 PNG 線圖都已下載並保存。重測會取代本頁保留的此條件上一輪資料與曲線，是否繼續？')) return;
        // The confirmation dialog can pause the page; recheck freshness after it closes.
        if (refresh().startDisabled) return;
        const condition = conditions.find(item => item.id === conditionSelect.value);
        if (!condition) return;
        try {
            recorder.start({
                subject_id: field('pressureSubject').value.trim(),
                trial_index: Number(field('pressureTrial').value), condition_id: condition.id,
                actual_pose: condition.actual_pose, height_condition: condition.height_condition,
                head_height_cm: Number(field('pressureHeadHeight').value),
                neck_height_cm: Number(field('pressureNeckHeight').value),
                test_condition: condition.test_condition, height_source: 'operator',
                notes: field('pressureNotes').value
            });
        } catch (error) { feedback = error.message; }
        refresh();
    }

    function endEarly() {
        feedback = '';
        recorder.endEarly();
        refresh();
    }

    function exportCsv() {
        const state = recorder.getState();
        if (state.status === 'recording' || !state.samples.length) return;
        try {
            const m = state.metadata;
            const condition = conditions.find(item => item.id === m.condition_id);
            const trial = String(m.trial_index).padStart(2, '0');
            const runId = state.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const stem = `${m.subject_id}_${condition.filePose}_${condition.fileHeight}_${m.test_condition}_trial${trial}_${runId}`;
            // Build both files first; never acknowledge a partial/failed preparation.
            const png = createChartImage(state);
            const csv = new Blob([recorder.csv()], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(csv);
            try {
                download(url, `${stem}.csv`);
                download(png, `${stem}.png`);
            } finally {
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
            recorder.acknowledgeExport();
            feedback = '已要求下載 CSV 與 PNG 線圖，請確認兩個檔案都已保存；若瀏覽器阻擋第二個檔案，請允許此網站下載多個檔案後重試。';
        } catch (error) { feedback = `匯出失敗，原資料仍保留：${error.message}`; }
        refresh();
    }

    function download(url, filename) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }

    function createChartImage(state) {
        if (!ensureChart(state) || !chart || !chart.canvas.width || !chart.canvas.height) {
            throw new Error('請先展開並顯示本條件線圖，再匯出 CSV 與線圖。');
        }
        const image = document.createElement('canvas');
        const scale = chart.canvas.width / (chart.width || chart.canvas.width);
        image.width = chart.canvas.width;
        const context = image.getContext('2d');
        if (!context) throw new Error('無法產生線圖影像。');
        const font = `${Math.round(13 * scale)}px "Noto Sans TC", sans-serif`;
        context.font = font;
        const padding = Math.round(12 * scale);
        const lineHeight = Math.round(20 * scale);
        const m = state.metadata;
        const labels = [
            '固定睡姿下自然呼吸與微動之辨識穩健性測試',
            `${m.subject_id}｜trial ${m.trial_index}｜條件 ${m.condition_id}｜${m.actual_pose}／${m.height_condition}／${m.test_condition}`,
            `Head ${m.head_height_cm} cm｜Neck ${m.neck_height_cm} cm｜${state.samples.length} 筆｜${statusLabels[state.status]}`
        ];
        const lines = [];
        labels.forEach(label => {
            let line = '';
            for (const char of label) {
                if (line && context.measureText(line + char).width > image.width - padding * 2) {
                    lines.push(line);
                    line = '';
                }
                line += char;
            }
            if (line) lines.push(line);
        });
        const headerHeight = padding * 2 + lines.length * lineHeight;
        image.height = chart.canvas.height + headerHeight;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, image.width, image.height);
        context.font = font;
        context.fillStyle = '#143265';
        context.textBaseline = 'top';
        lines.forEach((line, index) => context.fillText(line, padding, padding + index * lineHeight));
        context.drawImage(chart.canvas, 0, headerHeight);
        const png = image.toDataURL('image/png');
        if (!png.startsWith('data:image/png')) throw new Error('線圖轉換失敗，未要求下載。');
        return png;
    }

    function receivePressure(sample) {
        const previous = latestSample;
        if (previous && sample.receivedMonotonicMs < previous.receivedMonotonicMs) return;
        latestSample = { ...sample };
        if (previousSample) {
            recentIntervals.push(sample.receivedMonotonicMs - previousSample.receivedMonotonicMs);
            recentIntervals = recentIntervals.slice(-10);
        }
        previousSample = { ...sample };
        // Every valid message is stored now; only display/Chart updates are throttled.
        recorder.receive(sample);
    }

    function onDisconnected() {
        recorders.forEach(saved => saved.disconnect());
        latestSample = null;
        previousSample = null;
        recentIntervals = [];
        refresh();
    }

    function switchCondition() {
        if (conditionSelect.value === selectedConditionId) return true;
        if (recorder.getState().status === 'recording' || !recorders.has(conditionSelect.value)) {
            conditionSelect.value = selectedConditionId;
            return false;
        }
        selectedConditionId = conditionSelect.value;
        recorder = recorders.get(selectedConditionId);
        priorStatus = recorder.getState().status;
        return true;
    }

    form.addEventListener('submit', event => { event.preventDefault(); start(); });
    form.addEventListener('input', event => {
        if (event.target === conditionSelect && !switchCondition()) return;
        if (event.target !== confirmed && event.target.id !== 'pressureNotes') confirmed.checked = false;
        feedback = '';
        updateConditionDescription();
        refresh();
    });
    conditionSelect.addEventListener('change', () => {
        if (!switchCondition()) return;
        confirmed.checked = false;
        feedback = '';
        updateConditionDescription();
        refresh();
    });
    // UI heartbeat only. It neither requests pressure nor records cached/stale values.
    setInterval(refresh, 250);
    updateConditionDescription();
    refresh();

    return {
        start, endEarly, exportCsv, receivePressure, onDisconnected, refresh,
        isRunning: () => recorder.getState().status === 'recording',
        needsLeaveProtection: () => {
            return [...recorders.values()].some(saved => {
                const state = saved.getState();
                return state.status === 'recording' || (state.samples.length > 0 && !state.exportRequested);
            });
        },
        getUiState: () => lastUiState
    };
}
