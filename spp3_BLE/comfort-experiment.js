// Experiment 02: compare R/M/A pressure targets with I height control.
// BLE transport stays in app.js; this module owns only its panel and round state.
function createComfortEvaluationExperiment(root, options = {}) {
    const POSES = [
        { id: 'pose1', label: '睡姿一' },
        { id: 'pose5', label: '睡姿五' }
    ];
    const METHODS = [
        { id: 'R', label: 'R｜論文下降比例', mode: 'ADC' },
        { id: 'M', label: 'M｜30 人資料下降比例', mode: 'ADC' },
        { id: 'A', label: 'A｜R、M 平均比例', mode: 'ADC' },
        { id: 'I', label: 'I｜原系統高度法', mode: 'HEIGHT' }
    ];
    const ADC_LIMITS = { head: [1850000, 2550000], neck: [2000000, 2550000] };
    const nodes = {};
    let initialized = false;
    let status = 'idle';
    let rounds = [];
    let roundIndex = 0;
    let latestPressure = null;
    let pressureSequence = 0;
    let awaitingRoundId = '';
    let donePressureSequence = -1;
    let lastMessage = '請先填入正式比例與兩種姿勢的校正資料。';

    function bindNodes() {
        [
            'comfortSubject', 'comfortPose1HeadAdc', 'comfortPose1NeckAdc',
            'comfortPose1HeadCm', 'comfortPose1NeckCm', 'comfortPose5HeadAdc',
            'comfortPose5NeckAdc', 'comfortPose5HeadCm', 'comfortPose5NeckCm',
            'comfortPose1RHeadRatio', 'comfortPose1RNeckRatio',
            'comfortPose1MHeadRatio', 'comfortPose1MNeckRatio',
            'comfortPose5RHeadRatio', 'comfortPose5RNeckRatio',
            'comfortPose5MHeadRatio', 'comfortPose5MNeckRatio',
            'comfortCapturePose1', 'comfortCapturePose5', 'comfortProgress',
            'comfortCurrentRound', 'comfortTarget', 'comfortFirmwareState',
            'comfortScore', 'comfortRunRound', 'comfortCaptureUnload',
            'comfortMessage', 'comfortResults'
        ].forEach(id => { nodes[id] = root.querySelector(`#${id}`); });
    }

    function numberValue(id) {
        const value = Number(nodes[id]?.value);
        return Number.isFinite(value) ? value : NaN;
    }

    function valueFor(poseId, suffix) {
        const prefix = poseId === 'pose1' ? 'comfortPose1' : 'comfortPose5';
        return numberValue(`${prefix}${suffix}`);
    }

    function ratioFor(poseId, method, channel) {
        const prefix = poseId === 'pose1' ? 'comfortPose1' : 'comfortPose5';
        const suffix = `${method}${channel === 'head' ? 'Head' : 'Neck'}Ratio`;
        const direct = numberValue(`${prefix}${suffix}`);
        if (method !== 'A') return direct;
        const r = ratioFor(poseId, 'R', channel);
        const m = ratioFor(poseId, 'M', channel);
        return (r + m) / 2;
    }

    function currentRound() {
        return rounds[roundIndex] || null;
    }

    function makeRoundId(index, poseId, method) {
        return `E02-${String(index + 1).padStart(2, '0')}-${poseId.toUpperCase()}-${method}`;
    }

    function validateSetup() {
        const subject = nodes.comfortSubject?.value.trim() || '';
        if (!/^[A-Za-z0-9_-]{1,24}$/.test(subject)) return '受試者編號限 1–24 位英數、底線或連字號。';
        for (const pose of POSES) {
            const headAdc = valueFor(pose.id, 'HeadAdc');
            const neckAdc = valueFor(pose.id, 'NeckAdc');
            const headCm = valueFor(pose.id, 'HeadCm');
            const neckCm = valueFor(pose.id, 'NeckCm');
            if (!Number.isFinite(headAdc) || !Number.isFinite(neckAdc)) return `${pose.label} 尚未填入占用時 ADC。`;
            if (headAdc < ADC_LIMITS.head[0] || headAdc > ADC_LIMITS.head[1] ||
                neckAdc < ADC_LIMITS.neck[0] || neckAdc > ADC_LIMITS.neck[1]) {
                return `${pose.label} ADC 超出韌體安全範圍。`;
            }
            if (headCm < 7 || headCm > 16 || neckCm < 10 || neckCm > 14 ||
                Math.abs(headCm * 2 - Math.round(headCm * 2)) > 0.001 ||
                Math.abs(neckCm * 2 - Math.round(neckCm * 2)) > 0.001) {
                return `${pose.label} 高度須在 Head 7–16、Neck 10–14 cm，且以 0.5 cm 遞增。`;
            }
            for (const method of ['R', 'M']) {
                for (const channel of ['head', 'neck']) {
                    const ratio = ratioFor(pose.id, method, channel);
                    if (!Number.isFinite(ratio) || ratio < 0 || ratio >= 1) {
                        return `${pose.label} ${method} 的 ${channel} 下降比例須介於 0（含）到 1（不含）。`;
                    }
                }
            }
        }
        return '';
    }

    function buildRounds() {
        const subject = nodes.comfortSubject.value.trim();
        const built = [];
        POSES.forEach(pose => METHODS.forEach(method => {
            const round = {
                subject, pose: pose.id, poseLabel: pose.label, method: method.id,
                methodLabel: method.label, mode: method.mode, status: 'pending', score: '',
                occupiedHeadAdc: valueFor(pose.id, 'HeadAdc'),
                occupiedNeckAdc: valueFor(pose.id, 'NeckAdc'),
                targetHeadCm: valueFor(pose.id, 'HeadCm'),
                targetNeckCm: valueFor(pose.id, 'NeckCm')
            };
            if (method.mode === 'ADC') {
                round.headRatio = ratioFor(pose.id, method.id, 'head');
                round.neckRatio = ratioFor(pose.id, method.id, 'neck');
                round.targetHeadAdc = Math.round(round.occupiedHeadAdc * (1 - round.headRatio));
                round.targetNeckAdc = Math.round(round.occupiedNeckAdc * (1 - round.neckRatio));
            }
            round.id = makeRoundId(built.length, pose.id, method.id);
            built.push(round);
        }));
        return built;
    }

    function validateTargets(built) {
        const invalid = built.find(round => round.mode === 'ADC' &&
            (round.targetHeadAdc < ADC_LIMITS.head[0] || round.targetHeadAdc > ADC_LIMITS.head[1] ||
             round.targetNeckAdc < ADC_LIMITS.neck[0] || round.targetNeckAdc > ADC_LIMITS.neck[1]));
        return invalid ? `${invalid.poseLabel} ${invalid.method} 算出的 ADC 目標超出韌體安全範圍，請確認校正值與下降比例。` : '';
    }

    function setMessage(message) {
        lastMessage = message;
        if (nodes.comfortMessage) nodes.comfortMessage.textContent = message;
    }

    function renderResults() {
        if (!nodes.comfortResults) return;
        nodes.comfortResults.replaceChildren(...rounds.map(round => {
            const row = document.createElement('tr');
            const values = [round.poseLabel, round.method, round.status,
                round.score === '' ? '-' : round.score,
                round.emptyHeadAdc ?? '-', round.emptyNeckAdc ?? '-'];
            values.forEach(value => {
                const cell = document.createElement('td');
                cell.textContent = String(value);
                row.appendChild(cell);
            });
            return row;
        }));
    }

    function refresh() {
        const round = currentRound();
        if (nodes.comfortProgress) nodes.comfortProgress.textContent = `${Math.min(roundIndex, 8)} / 8`;
        if (nodes.comfortCurrentRound) {
            nodes.comfortCurrentRound.textContent = round ? `${roundIndex + 1}/8｜${round.poseLabel}｜${round.methodLabel}` : '-';
        }
        if (nodes.comfortTarget) {
            nodes.comfortTarget.textContent = !round ? '-' : round.mode === 'ADC'
                ? `Head ${round.targetHeadAdc} / Neck ${round.targetNeckAdc} ADC`
                : `Head ${round.targetHeadCm.toFixed(1)} / Neck ${round.targetNeckCm.toFixed(1)} cm`;
        }
        if (nodes.comfortFirmwareState) nodes.comfortFirmwareState.textContent = round?.status || '尚未開始';
        const readyToRun = status === 'running' && round && round.status === 'pending' && !awaitingRoundId;
        const readyToCapture = status === 'running' && round && round.status === 'done' &&
            pressureSequence > donePressureSequence && nodes.comfortScore?.value !== '';
        if (nodes.comfortRunRound) nodes.comfortRunRound.disabled = !readyToRun;
        if (nodes.comfortCaptureUnload) nodes.comfortCaptureUnload.disabled = !readyToCapture;
        if (nodes.comfortMessage) nodes.comfortMessage.textContent = lastMessage;
        renderResults();
        options.onChange?.(getUiState());
    }

    function captureOccupied(poseId) {
        if (!latestPressure) {
            setMessage('尚未收到完整的 P: Monitor Neck Head 壓力資料。');
            refresh();
            return;
        }
        const prefix = poseId === 'pose1' ? 'comfortPose1' : 'comfortPose5';
        nodes[`${prefix}HeadAdc`].value = Math.round(latestPressure.head_adc);
        nodes[`${prefix}NeckAdc`].value = Math.round(latestPressure.neck_adc);
        setMessage(`已擷取${poseId === 'pose1' ? '睡姿一' : '睡姿五'}占用時最新 ADC。`);
        refresh();
    }

    function start() {
        if (!options.getSystemState?.().connected) {
            setMessage('請先連線 BLE。');
            refresh();
            return;
        }
        const setupError = validateSetup();
        if (setupError) {
            setMessage(setupError);
            refresh();
            return;
        }
        const built = buildRounds();
        const targetError = validateTargets(built);
        if (targetError) {
            setMessage(targetError);
            refresh();
            return;
        }
        rounds = built;
        roundIndex = 0;
        awaitingRoundId = '';
        status = 'running';
        setMessage('8 輪流程已建立。請確認目前姿勢後按「送出本輪」。');
        refresh();
    }

    function runCurrentRound() {
        const round = currentRound();
        if (!round || status !== 'running' || round.status !== 'pending' || awaitingRoundId) return;
        if (!options.getSystemState?.().connected) {
            setMessage('BLE 已斷線，未送出指令。');
            return refresh();
        }
        const command = round.mode === 'ADC'
            ? `EXP02,START,${round.id},ADC,${round.targetHeadAdc},${round.targetNeckAdc}`
            : `EXP02,START,${round.id},HEIGHT,${round.targetHeadCm.toFixed(1)},${round.targetNeckCm.toFixed(1)}`;
        awaitingRoundId = round.id;
        round.status = '等待 ACK';
        options.sendCommand?.(command);
        setMessage(`已送出 ${round.id}；等待排空、Monitor 充氣及控制完成。`);
        refresh();
    }

    function receiveProtocolLine(line) {
        const parts = String(line).split(',').map(value => value.trim());
        if (parts[0] !== 'EXP02') return;
        const round = currentRound();
        const replyRoundId = parts[2] || '';
        if (!round || replyRoundId !== round.id) return;
        if (parts[1] === 'ACK') {
            round.status = '已 ACK';
            setMessage(`${round.id} 已由 ESP32 接收。`);
        } else if (parts[1] === 'STATE') {
            round.status = parts[3] || '控制中';
            setMessage(`${round.id}：${round.status}`);
        } else if (parts[1] === 'DONE') {
            round.status = 'done';
            round.actualHeadAdc = Number(parts[4]);
            round.actualNeckAdc = Number(parts[5]);
            awaitingRoundId = '';
            donePressureSequence = pressureSequence;
            setMessage('控制完成且輸出已關閉。請移開頭部，等下一筆 P 資料後評分並擷取空枕值。');
        } else if (parts[1] === 'ERR') {
            round.status = `錯誤：${parts[3] || 'UNKNOWN'}`;
            awaitingRoundId = '';
            status = 'interrupted';
            setMessage(`${round.id} 失敗：${parts[3] || 'UNKNOWN'}`);
        } else if (parts[1] === 'STOPPED') {
            round.status = '已停止';
            awaitingRoundId = '';
            status = 'interrupted';
            setMessage(`${round.id} 已停止。`);
        }
        refresh();
    }

    function captureUnload() {
        const round = currentRound();
        if (!round || round.status !== 'done') return;
        if (!latestPressure || pressureSequence <= donePressureSequence) {
            setMessage('請等待 DONE 之後的新一筆 P 資料，避免保存到控制前舊值。');
            return refresh();
        }
        if (nodes.comfortScore.value === '') {
            setMessage('請先選擇舒適度 0–10 分。');
            return refresh();
        }
        round.score = Number(nodes.comfortScore.value);
        round.emptyMonitorAdc = latestPressure.monitor_adc;
        round.emptyNeckAdc = latestPressure.neck_adc;
        round.emptyHeadAdc = latestPressure.head_adc;
        round.status = '完成';
        nodes.comfortScore.value = '';
        roundIndex += 1;
        if (roundIndex >= rounds.length) {
            status = 'completed';
            setMessage('8 輪皆已完成，可以匯出 CSV 與 SVG 摘要。');
        } else {
            setMessage('本輪已保存。請依畫面切換姿勢／方法，再送出下一輪。');
        }
        refresh();
    }

    function endEarly() {
        const round = currentRound();
        if (awaitingRoundId && round) options.sendCommand?.(`EXP02,STOP,${round.id}`);
        awaitingRoundId = '';
        status = 'interrupted';
        if (round && round.status !== '完成') round.status = '提前結束';
        setMessage('實驗已提前結束；ESP32 輸出停止指令已送出。');
        refresh();
    }

    function csvEscape(value) {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function download(name, blob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    function exportCsv() {
        if (!rounds.some(round => round.status === '完成')) return;
        const headers = ['subject','round_id','pose','method','mode','head_ratio','neck_ratio',
            'occupied_head_adc','occupied_neck_adc','target_head_adc','target_neck_adc',
            'target_head_cm','target_neck_cm','actual_head_adc','actual_neck_adc',
            'empty_monitor_adc','empty_neck_adc','empty_head_adc','comfort_score','status'];
        const lines = [headers.join(',')].concat(rounds.map(round => headers.map(key => csvEscape({
            subject: round.subject, round_id: round.id, pose: round.pose, method: round.method,
            mode: round.mode, head_ratio: round.headRatio, neck_ratio: round.neckRatio,
            occupied_head_adc: round.occupiedHeadAdc, occupied_neck_adc: round.occupiedNeckAdc,
            target_head_adc: round.targetHeadAdc, target_neck_adc: round.targetNeckAdc,
            target_head_cm: round.targetHeadCm, target_neck_cm: round.targetNeckCm,
            actual_head_adc: round.actualHeadAdc, actual_neck_adc: round.actualNeckAdc,
            empty_monitor_adc: round.emptyMonitorAdc, empty_neck_adc: round.emptyNeckAdc,
            empty_head_adc: round.emptyHeadAdc, comfort_score: round.score, status: round.status
        }[key])).join(',')));
        const subject = rounds[0]?.subject || 'unknown';
        download(`${subject}_experiment02.csv`, new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
        const bars = rounds.filter(round => round.status === '完成').map((round, index) => {
            const height = Number(round.score) * 14;
            const x = 70 + index * 82;
            return `<rect x="${x}" y="${180 - height}" width="52" height="${height}" fill="#4f7cff"/><text x="${x + 26}" y="200" text-anchor="middle" font-size="12">${round.pose}-${round.method}</text><text x="${x + 26}" y="${170 - height}" text-anchor="middle" font-size="12">${round.score}</text>`;
        }).join('');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="240" viewBox="0 0 760 240"><rect width="100%" height="100%" fill="white"/><text x="24" y="28" font-size="18">Experiment 02 comfort score</text><line x1="50" y1="180" x2="735" y2="180" stroke="#333"/>${bars}</svg>`;
        download(`${subject}_experiment02.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    }

    function receivePressure(sample) {
        if (![sample.monitor_adc, sample.neck_adc, sample.head_adc].every(Number.isFinite)) return;
        latestPressure = { ...sample };
        pressureSequence += 1;
        refresh();
    }

    function onDisconnected() {
        if (status === 'running') {
            status = 'interrupted';
            awaitingRoundId = '';
            const round = currentRound();
            if (round && round.status !== '完成') round.status = 'BLE 斷線';
            setMessage('BLE 已斷線；本輪中止，ESP32 端會執行斷線安全停機。');
            refresh();
        }
    }

    function getUiState() {
        const connected = Boolean(options.getSystemState?.().connected);
        return {
            status,
            statusText: status === 'completed' ? '已完成' : status === 'running' ? '進行中' :
                status === 'interrupted' ? '已中止' : '尚未開始',
            running: status === 'running',
            startDisabled: status === 'running' || !connected,
            finishDisabled: status !== 'running',
            exportDisabled: !rounds.some(round => round.status === '完成'),
            hint: lastMessage
        };
    }

    function init() {
        if (initialized || !root) return;
        bindNodes();
        nodes.comfortCapturePose1?.addEventListener('click', () => captureOccupied('pose1'));
        nodes.comfortCapturePose5?.addEventListener('click', () => captureOccupied('pose5'));
        nodes.comfortRunRound?.addEventListener('click', runCurrentRound);
        nodes.comfortCaptureUnload?.addEventListener('click', captureUnload);
        nodes.comfortScore?.addEventListener('change', refresh);
        initialized = true;
        refresh();
    }

    init();
    return {
        start, endEarly, exportCsv, refresh, receivePressure, receiveProtocolLine,
        onDisconnected, getUiState,
        isRunning: () => status === 'running',
        isBusy: () => status === 'running',
        needsLeaveProtection: () => status === 'running'
    };
}
