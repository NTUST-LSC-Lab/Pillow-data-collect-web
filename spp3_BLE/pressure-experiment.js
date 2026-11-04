// Pressure collection observes parsed samples; explicit calibration uses the height adapter.
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
    const heightControl = options.heightControl;
    const calibrations = new Map();
    let calibrationSubject = '';
    let calibrationDrafts = {};
    let calibrationFeedback = '';
    let calibrationPending = false;
    let calibrationUsed = false;

    const subjectId = () => field('pressureSubject').value.trim();
    const calibrationPose = () => field('pressureCalibrationPose').value;
    const calibrationRecord = () => calibrations.get(subjectId())?.[calibrationPose()];
    const heightState = () => heightControl?.getState() || { ready: false, busy: false, reason: '高度控制尚未載入。' };
    const calibrationBusy = () => calibrationPending || heightState().busy;
    const validHeight = (channel, value) => value !== '' && Number.isFinite(Number(value)) &&
        Number(value) >= (channel === 'Head' ? 7 : 10) && Number(value) <= (channel === 'Head' ? 16 : 14) &&
        Number.isInteger(Number(value) * 2);

    function resetCalibrationConfirmation() {
        confirmed.checked = false;
        field('pressureCalibrationStable').checked = false;
    }

    function saveCalibrationDraft() {
        calibrationDrafts[calibrationPose()] = {
            head: field('pressureCalibrationHead').value, neck: field('pressureCalibrationNeck').value
        };
        resetCalibrationConfirmation();
        calibrationFeedback = '';
    }

    function showCalibrationDraft() {
        const draft = calibrationDrafts[calibrationPose()];
        field('pressureCalibrationHead').value = draft?.head ?? '';
        field('pressureCalibrationNeck').value = draft?.neck ?? '';
        resetCalibrationConfirmation();
    }

    function canCaptureCalibration(height) {
        return /^S\d{2}$/.test(subjectId()) && !calibrationBusy() && height.ready &&
            recorder.getState().status !== 'recording' && freshStream() &&
            latestSample.receivedMonotonicMs >= (height.settledMonotonicMs ?? height.receivedMonotonicMs) &&
            ['monitor_adc', 'neck_adc', 'head_adc'].every(key => Number.isFinite(latestSample[key])) &&
            Number(field('pressureCalibrationHead').value) === height.head &&
            Number(field('pressureCalibrationNeck').value) === height.neck &&
            field('pressureCalibrationStable').checked;
    }

    function calibrationRunBlocked() {
        const height = heightState();
        return calibrationBusy() || (calibrationUsed && (!height.ready ||
            Number(field('pressureHeadHeight').value) !== height.head ||
            Number(field('pressureNeckHeight').value) !== height.neck));
    }

    function refreshCalibration(running) {
        if (subjectId() !== calibrationSubject) {
            calibrationSubject = subjectId();
            calibrationDrafts = {};
            showCalibrationDraft();
            calibrationFeedback = '';
            feedback = '';
        }
        heightControl?.tick();
        const height = heightState();
        const locked = running || calibrationBusy();
        field('pressureCalibrationPrepare').disabled = locked || !getSystemState().connected || !/^S\d{2}$/.test(subjectId()) || !heightControl;
        field('pressureCalibrationPose').disabled = locked;
        field('pressureCalibrationStable').disabled = locked || !height.ready;
        if (!height.ready) {
            field('pressureCalibrationStable').checked = false;
            if (calibrationUsed && !running) confirmed.checked = false;
        }
        ['Head', 'Neck'].forEach(channel => {
            const input = field(`pressureCalibration${channel}`);
            input.disabled = locked;
            field(`pressureCalibration${channel}Minus`).disabled = locked || !validHeight(channel, input.value) || Number(input.value) <= (channel === 'Head' ? 7 : 10);
            field(`pressureCalibration${channel}Plus`).disabled = locked || !validHeight(channel, input.value) || Number(input.value) >= (channel === 'Head' ? 16 : 14);
            field(`pressureCalibration${channel}Apply`).disabled = locked || !height.ready || !validHeight(channel, input.value);
        });
        field('pressureCalibrationCapture').disabled = !canCaptureCalibration(height);
        const cm = value => Number.isFinite(value) ? value.toFixed(1) : '—';
        setText('pressureCalibrationCurrent', `裝置估計：Head ${cm(height.head)}／Neck ${cm(height.neck)} cm；目標：Head ${cm(height.targetHead)}／Neck ${cm(height.targetNeck)} cm${height.ready ? '（已回報到位）' : '（尚未確認到位）'}`);
        setText('pressureCalibrationStatus', calibrationFeedback || height.reason || '請先準備微調；切換姿勢只切換本區待套用值，不會自動移動裝置。');
        ['pose1', 'pose5'].forEach(pose => {
            const saved = calibrations.get(subjectId())?.[pose];
            setText(`pressureCalibration${pose === 'pose1' ? 'Pose1' : 'Pose5'}Saved`, saved
                ? `受試者：${saved.subject}\n目標高度：Head ${saved.targetHead.toFixed(1)}／Neck ${saved.targetNeck.toFixed(1)} cm\n估計高度：Head ${saved.head.toFixed(1)}／Neck ${saved.neck.toFixed(1)} cm\nMonitor：${saved.sample.monitor_adc} ADC\nNeck：${saved.sample.neck_adc} ADC\nHead：${saved.sample.head_adc} ADC\n壓力接收：${saved.sample.timestamp_iso}\n單筆快照，非平均值；已存紀錄不代表目前高度`
                : `${subjectId() || '目前受試者'}：尚未保存`);
        });
    }

    async function runCalibrationAction(action, readCurrentHeights = false) {
        if (!heightControl || calibrationBusy() || recorder.getState().status === 'recording' || !/^S\d{2}$/.test(subjectId())) return;
        resetCalibrationConfirmation();
        calibrationUsed = true;
        calibrationPending = true;
        calibrationFeedback = '';
        refresh();
        try {
            await action();
            const height = heightState();
            if (height.ready && readCurrentHeights) {
                field('pressureCalibrationHead').value = String(height.head);
                field('pressureCalibrationNeck').value = String(height.neck);
                saveCalibrationDraft();
            }
        } catch (error) { calibrationFeedback = error.message; }
        finally { calibrationPending = false; refresh(); }
    }

    field('pressureCalibrationPrepare').addEventListener('click', () => runCalibrationAction(() => heightControl.prepare(), true));
    field('pressureCalibrationPose').addEventListener('change', () => { showCalibrationDraft(); calibrationFeedback = ''; refresh(); });
    ['Head', 'Neck'].forEach(channel => {
        const input = field(`pressureCalibration${channel}`);
        input.addEventListener('input', () => { saveCalibrationDraft(); refresh(); });
        [['Minus', -0.5], ['Plus', 0.5]].forEach(([suffix, step]) => {
            field(`pressureCalibration${channel}${suffix}`).addEventListener('click', () => {
                if (calibrationBusy() || recorder.getState().status === 'recording' || !validHeight(channel, input.value) || !validHeight(channel, Number(input.value) + step)) return;
                input.value = String(Number(input.value) + step);
                saveCalibrationDraft(); refresh();
            });
        });
        field(`pressureCalibration${channel}Apply`).addEventListener('click', () => {
            if (!validHeight(channel, input.value) || !heightState().ready) return;
            return runCalibrationAction(() => heightControl.adjust(channel.toUpperCase(), Number(input.value)));
        });
    });
    field('pressureCalibrationStable').addEventListener('change', refresh);
    field('pressureCalibrationCapture').addEventListener('click', () => {
        const height = heightState();
        if (!canCaptureCalibration(height)) return;
        if (calibrationRecord() && !window.confirm('這會取代此受試者、此姿勢先前的校正快照。請先截圖保存，是否繼續？')) return;
        if (!canCaptureCalibration(heightState())) return;
        const records = calibrations.get(subjectId()) || {};
        records[calibrationPose()] = {
            subject: subjectId(), head: height.head, neck: height.neck,
            targetHead: height.targetHead, targetNeck: height.targetNeck, sample: { ...latestSample }
        };
        calibrations.set(subjectId(), records);
        calibrationFeedback = '已保存單筆校正快照；兩姿勢的紀錄會並列顯示，可截圖保存。';
        refresh();
    });

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
            ? `條件 ${state.metadata.condition_id}｜${state.metadata.subject_id}｜${state.metadata.actual_pose}／${state.metadata.test_condition}`
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
        if (calibrationRunBlocked()) return '請等待微調到位，並確認本輪 Head／Neck 高度與裝置回報一致；必要時重新準備微調。';
        if (!form.checkValidity()) return '請填妥受試者、設定高度，並確認本輪姿勢與高度。';
        if (typeof Chart !== 'function') return '圖表元件尚未載入，請確認 Chart.js 可用。';
        return state.exportRequested ? '上一輪已要求下載；重測前仍需確認 CSV 與 PNG 線圖都已保存。' : '設定完成後，由操作者按「開始記錄」，不另加等待秒數。';
    }

    function refresh() {
        const state = recorder.tick();
        const system = getSystemState();
        const running = state.status === 'recording';
        refreshCalibration(running);
        settings.disabled = running || calibrationBusy();
        field('pressureSubject').disabled = settings.disabled;
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
        setText('pressureGapPolicy', `資料中斷門檻：連續 ${(gapTimeoutMs / 1000).toFixed(1)} 秒未收到有效完整壓力訊息。壓力仍沿用每秒 P 查詢；獨立校正啟用後會另外讀取高度與狀態，實際接收間隔仍需實機驗證。`);
        setText('pressureControlWarning', system.autoHeightPossible
            ? '目前為自動模式或 PRED 已啟用／請求啟動，可能改變高度。可在本區按「準備微調」停止自動調整，再確認固定高度條件。'
            : '目前 Web 未回報自動高度調整啟用；請確認高度固定。只有按「準備微調」或「套用」才會送出相應控制指令，收數不會自行調整高度。');
        if (state.runId) {
            const m = state.metadata;
            const suffix = state.status === 'completed'
                ? '30 秒資料收集計時完成，不代表辨識穩健性已驗證。'
                : state.status === 'interrupted' ? reasonLabels[state.interruptionReason] || state.interruptionReason
                : state.status === 'ended_early' ? '已有樣本保留，本輪未完成 30 秒。' : '正在收集原始 ADC。';
            setText('pressureRunSummary', `本輪紀錄｜${m.subject_id}／條件 ${m.condition_id}／${m.actual_pose}／${m.height_condition}／${m.test_condition}／Head ${m.head_height_cm} cm、Neck ${m.neck_height_cm} cm｜${state.samples.length} 筆。${suffix}`);
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
            startDisabled: running || calibrationRunBlocked() || !system.connected || !freshStream() || !form.checkValidity() ||
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
                trial_index: '', condition_id: condition.id,
                actual_pose: condition.actual_pose, height_condition: condition.height_condition,
                head_height_cm: Number(field('pressureHeadHeight').value),
                neck_height_cm: Number(field('pressureNeckHeight').value),
                test_condition: condition.test_condition, height_source: 'operator',
                notes: '' // Retain the existing CSV schema without collecting removed fields.
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
            const runId = state.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const stem = `${m.subject_id}_${condition.filePose}_${condition.fileHeight}_${m.test_condition}_${runId}`;
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
            `${m.subject_id}｜條件 ${m.condition_id}｜${m.actual_pose}／${m.height_condition}／${m.test_condition}`,
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
        if (recorder.getState().status === 'recording' || calibrationBusy() || !recorders.has(conditionSelect.value)) {
            conditionSelect.value = selectedConditionId;
            return false;
        }
        selectedConditionId = conditionSelect.value;
        recorder = recorders.get(selectedConditionId);
        priorStatus = recorder.getState().status;
        return true;
    }

    form.addEventListener('submit', event => { event.preventDefault(); start(); });
    field('pressureSubject').addEventListener('input', refresh);
    form.addEventListener('input', event => {
        if (event.target === conditionSelect && !switchCondition()) return;
        if (event.target !== confirmed) confirmed.checked = false;
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
        isBusy: () => recorder.getState().status === 'recording' || calibrationBusy(),
        needsLeaveProtection: () => {
            return calibrations.size > 0 || calibrationBusy() || [...recorders.values()].some(saved => {
                const state = saved.getState();
                return state.status === 'recording' || (state.samples.length > 0 && !state.exportRequested);
            });
        },
        getUiState: () => lastUiState
    };
}
