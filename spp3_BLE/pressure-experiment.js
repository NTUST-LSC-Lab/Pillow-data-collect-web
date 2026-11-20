// Pressure collection observes parsed samples; explicit calibration uses the height adapter.
function createPressureCollectionExperiment(root, options) {
    const { gapTimeoutMs, conditions, getSystemState, onChange } = options;
    const durationMs = 35000, minimumValidSamples = 30;
    // Keep one last run per condition so changing the selector never discards unsaved results.
    const recorders = new Map(conditions.map(condition => [condition.id,
        createPressureRecorder({ durationMs, minimumValidSamples, gapTimeoutMs })
    ]));
    const field = id => root.querySelector(`#${id}`);
    const form = field('pressureRunForm');
    const settings = field('pressureRunSettings');
    const confirmed = field('pressureSetupConfirmed');
    const conditionSelect = field('pressureCondition');
    let selectedConditionId = conditionSelect.value;
    let recorder = recorders.get(selectedConditionId);
    const statusLabels = {
        idle: '尚未開始', recording: '記錄中', completed: '35 秒完成（至少 30 筆有效）',
        ended_early: '提前結束（未完成）', interrupted: '收集中斷'
    };
    const reasonLabels = {
        pressure_gap: '完整壓力訊息接收間隔達到中斷門檻',
        no_pressure_data: '開始後未收到有效壓力訊息', ble_disconnected: 'BLE 斷線',
        classification_missing: '35 秒內有效分類不足 30 筆，仍有缺筆且補取等待已結束；請重測',
        classification_invalid: '已收到 35 秒訊息，但有效分類不足 30 筆；請重測',
        classification_start_timeout: '分類啟動逾時', classification_error: '分類工作異常中止'
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
    let firmwareProfile = '', firmwareAnchors = {}, calibrationRequest = null;
    let classificationArmed = false;
    let heightSwitch = null;
    let pose1HeightKey = '';
    const conditionOrder = ['03', '04', '01', '02'];
    let previousUserProfile = null;
    let pose5SuggestionKey = null;
    const calibrationDialog = field('pressureCalibrationDialog');
    let selectedCalibrationPose = 'pose1';
    let calibrationAfter = Infinity;
    let calibrationProfile = null;
    let calibrationFolder = null;
    let storagePending = false;
    let storageFeedback = '';
    const canPickFolder = typeof window.showDirectoryPicker === 'function';

    const modelPanel = createPoseModelPanel(field('pressurePosePanel'), () => performance.now(), { holdInvalid: true });
    let classificationRequest = null, classificationRun = null, lastModelSession = null;

    const firmwareProfileKey = () => JSON.stringify([subjectId(), readCalibrationProfile()]);
    const calibrationKey = () => JSON.stringify([firmwareProfileKey(), firmwareAnchors.BSHS, firmwareAnchors.BLHL]);
    const anchorTarget = pose => pose === 'pose1' ? 'BSHS' : 'BLHL';
    function invalidateFirmwareCalibration() {
        firmwareProfile = '';
        firmwareAnchors = {};
        classificationArmed = false;
        pose1HeightKey = '';
        modelPanel.reset('請在實驗一重新完成兩姿勢校正');
    }
    function classificationCalibrationIssue() {
        if (firmwareProfile !== firmwareProfileKey()) return '請在實驗一完成目前受測者的姿勢一、姿勢五校正。';
        const missing = ['pose1', 'pose5'].filter(pose => !firmwareAnchors[anchorTarget(pose)]);
        return missing.length ? `請完成${missing.map(pose => pose === 'pose1' ? '姿勢一' : '姿勢五').join('、')}的裝置辨識基準。` : '';
    }
    function failCalibrationRequest(message) {
        if (!calibrationRequest) return;
        const request = calibrationRequest;
        calibrationRequest = null;
        clearTimeout(request.timer);
        clearInterval(request.pollTimer);
        request.reject(new Error(message));
    }
    function requestCalibration(command, accept, timeoutMs = 15000, pollCommand = null) {
        if (calibrationRequest) return Promise.reject(new Error('上一個校正指令尚未完成'));
        return new Promise((resolve, reject) => {
            calibrationRequest = { command, accept, resolve, reject, profileKey: firmwareProfileKey(),
                timer: setTimeout(() => failCalibrationRequest('等待裝置校正回覆逾時，請重新準備後再試。'), timeoutMs),
                pollTimer: pollCommand ? setInterval(() => {
                    try { options.sendCalibrationQuery(pollCommand); }
                    catch (error) { failCalibrationRequest(error.message); }
                }, 1000) : null };
            try { (command.startsWith('EXP02,') ? options.sendExperimentCommand :
                command.startsWith('ANCHOR,GET,') ? options.sendCalibrationQuery : options.sendClassificationCommand)(command); }
            catch (error) { failCalibrationRequest(error.message); }
        });
    }
    async function prepareCalibration() {
        classificationArmed = false;
        pose1HeightKey = '';
        const p = readCalibrationProfile();
        const values = [p.age_years, p.body_height_cm, p.body_weight_kg];
        if (!['male', 'female'].includes(p.gender) || !Number.isInteger(p.age_years) ||
            !values.every(value => Number.isFinite(value) && value >= 0 && value <= 2147483647) ||
            Math.trunc(p.body_height_cm) <= 0 || Math.trunc(p.body_weight_kg) <= 0) {
            throw new Error('請先填妥有效的性別、年齡、身高與體重。');
        }
        options.setClassificationEnabled(false);
        const key = firmwareProfileKey();
        if (firmwareProfile !== key) {
            invalidateFirmwareCalibration();
            await requestCalibration(`USER,${p.gender === 'male' ? 1 : 0},${p.age_years},${Math.trunc(p.body_height_cm)},${Math.trunc(p.body_weight_kg)}`,
                parts => parts[0] === 'USER' && parts[1] === 'OK');
            if (key !== firmwareProfileKey()) throw new Error('受測者資料已變更，請重新開啟校正。');
            firmwareProfile = key;
        }
        await requestCalibration('FEATURE,POSE,ON', parts => parts[0] === 'FEATURE' && parts[1] === 'STATUS' &&
            ['POSE', 'PRED', 'LEGACY'].every((name, i) => parts.indexOf(name) >= 0 && parts[parts.indexOf(name) + 1] === (i === 0 ? '1' : '0')));
        // A disconnect can leave the previous anchor capture running; cancel it without clearing saved anchors.
        await requestCalibration('ANCHOR,CANCEL', parts => parts.join(',') === 'ANCHOR,OK,CANCEL');
        await heightControl.prepare();
    }
    async function captureFirmwareAnchor(pose, height) {
        const target = anchorTarget(pose);
        delete firmwareAnchors[target];
        await requestCalibration('FEATURE,POSE,ON', parts => parts[0] === 'FEATURE' && parts[1] === 'STATUS' &&
            ['POSE', 'PRED', 'LEGACY'].every((name, i) => parts.indexOf(name) >= 0 && parts[parts.indexOf(name) + 1] === (i === 0 ? '1' : '0')));
        let started = false, done = false, quality = null, receivedAt = null, progress = null;
        const progressText = () => progress
            ? `已收到 ${progress.collected}/5 筆有效新讀值；本次已掃描 ${progress.scans} 次，讀取失敗累計：Monitor ${progress.failures[0]}、Neck ${progress.failures[1]}、Head ${progress.failures[2]} 次。`
            : '裝置尚未提供逐通道校正進度；請確認燒錄的是 calibration_v2 配對版。';
        const anchor = await requestCalibration(`ANCHOR,START,${target},5`, (parts, receipt) => {
            if (parts.join(',') === `ANCHOR,OK,START,${target}`) throw new Error('目前韌體不支援五筆校正，請先更新 ESP32 韌體。');
            if (parts.join(',') === `ANCHOR,OK,START,${target},5`) started = true;
            if (started && parts.length === 11 && parts.slice(0,4).join(',') === `ANCHOR,PROGRESS,V1,${target}` &&
                parts[5] === '5' && ['WAIT_SETTLE', 'COLLECTING', 'DONE', 'TIMEOUT'].includes(parts[6]) &&
                [4,7,8,9,10].every(i => /^\d+$/.test(parts[i]) && Number.isSafeInteger(Number(parts[i])))) {
                const collected = Number(parts[4]), scans = Number(parts[7]), failures = parts.slice(8).map(Number);
                if (collected <= 5 && failures.every(count => count <= scans)) {
                    progress = { collected, scans, failures };
                    calibrationFeedback = progressText() + ' 請保持目前姿勢，完成後會自動關閉。';
                    refresh();
                }
            }
            if (started && parts.join(',') === `ANCHOR,STATUS,TIMEOUT,${target}`) {
                throw new Error(`裝置校正逾時（20 秒）。${progressText()} 未保存新的校正基準。`);
            }
            if (started && !done && parts.join(',') === `ANCHOR,STATUS,DONE,${target}`) {
                done = true;
                options.sendCalibrationQuery(`ANCHOR,GET,${target}`);
            }
            if (done && parts[0] === 'ANCHOR' && parts[1] === 'QUALITY' && parts[2] === target) {
                if (parts.length !== 5 || parts[3] !== '5' || !['STABLE', 'HIGH_VARIATION'].includes(parts[4])) {
                    throw new Error('裝置未確認五筆校正資料，請重新校正。');
                }
                quality = parts[4];
            }
            if (!done || parts[0] !== 'ANCHOR' || parts[1] !== 'OK' || parts[2] !== target) return false;
            if (!quality || parts.length !== 8 || !parts.slice(3).every(value => value !== '' && Number.isFinite(Number(value))) ||
                Number(parts[6]) !== height.head || Number(parts[7]) !== height.neck) throw new Error('裝置校正基準的壓力或高度不符，請重新校正。');
            receivedAt = receipt?.timestamp_iso || new Date().toISOString();
            return true;
        }, 90000, 'ANCHOR,STATUS');
        // Anchor sampling invalidates height readiness; refresh device state before accepting this calibration.
        await heightControl.prepare();
        const current = heightState();
        if (!current.ready || current.head !== height.head || current.neck !== height.neck) throw new Error('校正期間裝置高度已變更，請重新校正。');
        return { firmwareAnchor: anchor.slice(3).join(','), quality,
            sample: { monitor_adc: Number(anchor[3]), neck_adc: Number(anchor[4]), head_adc: Number(anchor[5]), timestamp_iso: receivedAt } };
    }

    function cancelClassificationRequest(reason) {
        if (!classificationRequest) return;
        const pending = classificationRequest;
        classificationRequest = null;
        clearTimeout(pending.timer);
        pending.reject(new Error(reason));
    }

    function requestClassification(action) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => cancelClassificationRequest('分類指令回覆逾時'), 8000);
            classificationRequest = { action, resolve, reject, timer };
            try {
                if (!options.sendClassificationCommand) throw new Error('分類控制未載入');
                options.sendClassificationCommand(`CLASSIFY,${action}`);
            } catch (error) { cancelClassificationRequest(error.message); }
        });
    }

    function stopClassification() {
        if (!classificationRun) return;
        classificationRun = null;
        cancelClassificationRequest('本輪已結束');
        if (getSystemState().connected) options.sendClassificationCommand?.('CLASSIFY,STOP');
    }

    async function startClassification() {
        const activeRecorder = recorder;
        const run = classificationRun = { recorder: activeRecorder, started: false, session: null,
            blockedSession: lastModelSession, latestSequence: 0, lastRecoveryAt: 0, diagnostics: new Map() };
        modelPanel.reset('正在啟動本輪分類');
        try {
            await requestClassification('STOP');
            if (classificationRun !== run) return;
            await requestCalibration('FEATURE,POSE,ON', parts => parts[0] === 'FEATURE' && parts[1] === 'STATUS' &&
                ['POSE', 'PRED', 'LEGACY'].every((name, i) => parts.indexOf(name) >= 0 && parts[parts.indexOf(name) + 1] === (i === 0 ? '1' : '0')));
            if (classificationRun !== run) return;
            await requestClassification('START');
            if (classificationRun !== run) return;
        } catch (error) {
            if (classificationRun !== run) return;
            activeRecorder.classificationState('ERROR', error.message);
            modelPanel.reset(`分類未啟動：${error.message}`);
            stopClassification();
        }
        refresh();
    }

    function receiveLine(line, receipt) {
        const parts = line.trim().split(',');
        if (parts[0] === 'CLASSIFY' && parts[1] === 'DIAG') {
            const diagnostic = parseDualPoseDiagnostic(line), run = classificationRun;
            if (diagnostic && run?.started && diagnostic.sequence <= durationMs / 1000 &&
                diagnostic.session !== run.blockedSession && (run.session === null || run.session === diagnostic.session) &&
                run.diagnostics.size < durationMs / 1000) {
                run.diagnostics.set(`${diagnostic.session},${diagnostic.sequence}`, diagnostic.line);
            }
            return;
        }
        const ownUserReply = calibrationRequest?.command.startsWith('USER,') && parts[0] === 'USER' && parts[1] === 'OK';
        if (calibrationRequest) {
            const pending = calibrationRequest;
            try {
                if (pending.profileKey !== firmwareProfileKey()) throw new Error('受測者資料已變更，請重新開啟校正。');
                if (parts[0] === pending.command.split(',')[0] && ['ERR', 'REJECT'].includes(parts[1]) &&
                    (parts[0] !== 'EXP02' || parts.length === 3 || parts[2] === pending.command.split(',')[2])) throw new Error(`裝置操作失敗：${line}`);
                if (pending.accept(parts, receipt)) {
                    calibrationRequest = null;
                    clearTimeout(pending.timer); clearInterval(pending.pollTimer);
                    pending.resolve(parts);
                }
            } catch (error) { failCalibrationRequest(error.message); }
        }
        if ((parts[0] === 'USER' && parts[1] === 'OK' && !ownUserReply) || parts.join(',') === 'ANCHOR,OK,CLEAR') {
            invalidateFirmwareCalibration();
            failCalibrationRequest('裝置受測者或校正基準已變更，請重新校正。');
        }
        if (parts[0] === 'ANCHOR' && parts[1] === 'OK') {
            if (parts[2] === 'START') delete firmwareAnchors[parts[3]];
            else if (firmwareAnchors[parts[2]] && firmwareAnchors[parts[2]] !== parts.slice(3).join(',')) delete firmwareAnchors[parts[2]];
        }
        if (classificationRequest && parts[0] === 'CLASSIFY') {
            if (parts[1] === 'ERR' && !['NOT_READY', 'NOT_RUNNING'].includes(parts[2])) cancelClassificationRequest(line);
            else if (parts.join(',') === `CLASSIFY,OK,${classificationRequest.action}`) {
                const pending = classificationRequest;
                classificationRequest = null;
                clearTimeout(pending.timer);
                if (pending.action === 'START' && classificationRun) {
                    classificationRun.started = true;
                    classificationRun.recorder.classificationState('RUNNING');
                    modelPanel.reset('等待本輪第一秒結果');
                }
                pending.resolve();
            }
        }
        if (parts[0] !== 'CLASSIFY' || parts[1] !== 'DATA') {
            if (!classificationRun && ((parts[0] === 'USER' && parts[1] === 'OK') ||
                (parts[0] === 'ANCHOR' && parts[1] === 'OK' && ['START', 'CLEAR'].includes(parts[2])))) modelPanel.reset('辨識已停止／校正已變更');
            if (classificationRun?.started && (parts.join(',') === 'CLASSIFY,OK,STOP' ||
                (parts[0] === 'CLASSIFY' && parts[1] === 'ERR' && parts[2] !== 'NOT_READY') ||
                (parts[0] === 'USER' && parts[1] === 'OK') ||
                (parts[0] === 'ANCHOR' && parts[1] === 'OK' && ['START', 'CLEAR'].includes(parts[2])))) {
                recorder.classificationState('ERROR', line);
                stopClassification(); modelPanel.reset('分類已中止，本輪資料保留');
            }
            return;
        }
        const result = parseDualPoseResult(line);
        if (!result) { modelPanel.reset('分類資料格式不符'); return; }
        if (!receipt) return;
        const run = classificationRun;
        if (!run) {
            // Remember the session only; waiting between rounds must not display or collect results.
            if (lastModelSession === null || ((result.session - lastModelSession) >>> 0) < 0x80000000) lastModelSession = result.session;
            return;
        }
        if (!run.started || result.session === run.blockedSession) return;
        if (run.session !== null && result.session !== run.session) {
            const difference = (result.session - run.session) >>> 0;
            if (difference && difference < 0x80000000) {
                recorder.classificationState('ERROR', '分類 session 已變更');
                stopClassification(); modelPanel.reset('分類工作變更，本輪資料保留');
            }
            return;
        }
        const diagnosticKey = `${result.session},${result.sequence}`;
        if (result.staticModel.status === 'INVALID') result.diagnostic = run.diagnostics.get(diagnosticKey) || '';
        run.diagnostics.delete(diagnosticKey);
        if (!recorder.receiveClassification(result, receipt)) return;
        run.session = lastModelSession = result.session;
        if (result.sequence > run.latestSequence) {
            run.latestSequence = result.sequence;
            if (result.adc.every(Number.isFinite)) receivePressure({ ...receipt,
                monitor_adc: result.adc[0], neck_adc: result.adc[1], head_adc: result.adc[2] });
            modelPanel.receive(line);
        }
    }

    function recoverMissingResults(state) {
        const run = classificationRun, at = performance.now();
        if (!run?.started || state.status !== 'recording' || at - run.lastRecoveryAt < 500) return;
        const due = Math.min(state.targetSamples, Math.max(run.latestSequence, Math.floor((at - state.startMonotonicMs - 400) / 1000)));
        const received = new Set(state.classifications.map(event => event.result.sequence));
        let missing = 1;
        while (missing <= due && received.has(missing)) missing++;
        if (missing > due) return;
        run.lastRecoveryAt = at;
        options.sendCalibrationQuery(run.session === null ? 'CLASSIFY,GET' : `CLASSIFY,GET,${run.session},${missing}`);
    }

    const subjectId = () => field('pressureSubject').value.trim();
    const calibrationPose = () => selectedCalibrationPose;
    const calibrationRecord = () => calibrations.get(subjectId())?.[calibrationPose()];
    const heightState = () => heightControl?.getState() || { ready: false, busy: false, reason: '高度控制尚未載入。' };
    const calibrationBusy = () => calibrationPending || storagePending || Boolean(heightSwitch) || heightState().busy;
    const validHeight = (channel, value) => value !== '' && Number.isFinite(Number(value)) &&
        Number(value) >= (channel === 'Head' ? 7 : 10) && Number(value) <= (channel === 'Head' ? 16 : 14) &&
        Number.isInteger(Number(value) * 2);

    function setClassificationReady(enabled) {
        if (!getSystemState().connected || recorder.getState().status === 'recording' || calibrationDialog.open || calibrationBusy() ||
            typeof options.setClassificationEnabled !== 'function') return;
        if (enabled && classificationCalibrationIssue()) return;
        classificationArmed = enabled;
        options.setClassificationEnabled(false);
        modelPanel.reset(enabled ? '辨識已準備；按「開始記錄」才顯示與累積結果' : '辨識尚未準備');
        refresh();
    }

    field('pressureClassificationStart').addEventListener('click', () => setClassificationReady(true));
    field('pressureClassificationStop').addEventListener('click', () => setClassificationReady(false));

    function savedCondition(id) {
        const state = recorders.get(id).getState();
        // Recalibration does not invalidate a saved run for the same participant/profile.
        return state.status === 'completed' && state.exportRequested && state.metadata?.profileKey === firmwareProfileKey();
    }

    function unsavedCondition() {
        return conditionOrder.find(id => {
            const state = recorders.get(id).getState();
            return state.samples.length > 0 && !state.exportRequested;
        });
    }

    function workflowIssue() {
        const unsaved = unsavedCondition();
        if (unsaved) return `請先儲存條件 ${unsaved} 的本輪 CSV 與線圖，再進行下一輪。`;
        const previous = conditionOrder.slice(0, conditionOrder.indexOf(selectedConditionId)).find(id => !savedCondition(id));
        if (previous) {
            const prior = recorders.get(previous).getState();
            if (prior.exportRequested && prior.status !== 'completed') return `條件 ${previous} 已儲存，但本輪未完成：有效分類 ${prior.validSampleCount} 筆，至少需 ${prior.minimumValidSamples} 筆且完整記錄 35 秒。請切回條件 ${previous} 重測。`;
            return `請先完成並儲存條件 ${previous}；順序為姿勢五穩定 → 姿勢五微動 → 姿勢一穩定 → 姿勢一微動。`;
        }
        if (['01', '02'].includes(selectedConditionId) && pose1HeightKey !== calibrationKey()) return '請先確認受測者離枕，按「重新執行開機流程並套用姿勢一滿分高度」，等待裝置確認到位。';
        if (!classificationArmed) return '請先按「開始辨識」準備本實驗，再勾選本輪確認並按「開始記錄」。';
        return '';
    }

    function selectCondition(id) {
        conditionSelect.value = id;
        switchCondition();
        updateConditionDescription();
    }

    field('pressureRestorePose1').addEventListener('click', async () => {
        if (field('pressureRestorePose1').disabled) return;
        const operation = heightSwitch = { key: calibrationKey(), id: '', cancelled: false };
        pose1HeightKey = '';
        confirmed.checked = false;
        field('pressureSwitchEmpty').checked = false;
        const assertCurrent = () => {
            if (operation.cancelled || !getSystemState().connected || operation.key !== calibrationKey() || classificationCalibrationIssue()) {
                throw new Error('高度切換已中止或校正狀態已變更，請確認後重新執行開機流程。');
            }
        };
        feedback = '正在重新執行開機流程（逐顆抽氣及充氣），完成後套用姿勢一滿分高度；受測者請全程保持離枕。';
        modelPanel.reset('高度切換中；尚未記錄');
        refresh();
        try {
            await heightControl.prepare();
            assertCurrent();
            const saved = { ...calibrations.get(subjectId()).pose1 };
            operation.id = 'B01' + Date.now().toString(36).toUpperCase();
            const id = operation.id;
            let acknowledged = false;
            await requestCalibration(`EXP02,START,${id},STARTUP_HEIGHT,${saved.head.toFixed(1)},${saved.neck.toFixed(1)}`, parts => {
                if (parts.join(',') === `EXP02,ACK,${id},STARTUP_HEIGHT`) acknowledged = true;
                if (acknowledged && parts[0] === 'EXP02' && parts[1] === 'STATE' && parts[2] === id && ['NECK', 'HEAD', 'SETTLE'].includes(parts[3])) {
                    feedback = '開機流程已完成，正在套用姿勢一滿分高度並確認到位；請保持離枕。';
                    refresh();
                }
                if (!acknowledged || parts[0] !== 'EXP02' || parts[1] !== 'DONE' || parts[2] !== id) return false;
                if (parts.length !== 7 || !parts.slice(3).every(value => value !== '' && Number.isFinite(Number(value))) ||
                    Number(parts[5]) !== saved.head || Number(parts[6]) !== saved.neck) throw new Error('裝置完成高度與姿勢一校正高度不符。');
                return true;
            }, 660000, `EXP02,STATUS,${id}`);
            assertCurrent();
            const height = await heightControl.prepare();
            assertCurrent();
            if (!height.ready || height.head !== saved.head || height.neck !== saved.neck) throw new Error('姿勢一高度核對失敗，請重新執行開機流程。');
            for (const target of ['BSHS', 'BLHL']) {
                const anchor = await requestCalibration(`ANCHOR,GET,${target}`, parts => parts[0] === 'ANCHOR' && parts[1] === 'OK' && parts[2] === target);
                if (anchor.slice(3).join(',') !== firmwareAnchors[target]) throw new Error('高度切換後校正基準不符，請重新校正。');
            }
            assertCurrent();
            pose1HeightKey = operation.key;
            heightSwitch = null;
            selectCondition('01');
            feedback = '姿勢一校正高度已到位，兩組基準保留。請受測者以姿勢一躺回，確認本輪設定後開始記錄。';
        } catch (error) {
            if (operation.id && getSystemState().connected) options.sendExperimentCommand(`EXP02,STOP,${operation.id}`);
            feedback = `${error.message} 尚未開放姿勢一記錄；已取得的結果仍保留。`;
        } finally {
            heightSwitch = null;
            refresh();
        }
    });
    field('pressureSwitchEmpty').addEventListener('change', refresh);
    field('pressureRestoreCancel').addEventListener('click', () => {
        if (!heightSwitch) return;
        heightSwitch.cancelled = true;
        if (heightSwitch.id && getSystemState().connected) options.sendExperimentCommand(`EXP02,STOP,${heightSwitch.id}`);
        failCalibrationRequest('操作者已中止高度切換。');
    });

    function readUserProfile() {
        const profile = options.getUserProfile?.() || {};
        return {
            age_years: profile.age_years ?? null,
            body_height_cm: profile.body_height_cm ?? null,
            body_weight_kg: profile.body_weight_kg ?? null
        };
    }

    function profileText(profile) {
        const value = (number, unit) => Number.isFinite(number) ? `${number} ${unit}` : '未填／無效';
        return `年齡：${value(profile?.age_years, '歲')}｜身高：${value(profile?.body_height_cm, 'cm')}｜體重：${value(profile?.body_weight_kg, 'kg')}`;
    }

    function readCalibrationProfile() {
        return { ...readUserProfile(), gender: options.getCalibrationProfile?.()?.gender ?? null };
    }

    function calibrationProfileText(profile) {
        const gender = profile.gender === 'male' ? '男' : profile.gender === 'female' ? '女' : '未填';
        return `性別 ${gender}　年齡 ${profile.age_years ?? '—'} 歲　身高 ${profile.body_height_cm ?? '—'} cm　體重 ${profile.body_weight_kg ?? '—'} kg`;
    }

    function pose5Suggestion() {
        return options.getPose5Suggestion?.() || {
            profileKey: '', head: null, neck: null,
            reason: '請先在上方設定使用者資料，再按「準備微調」讀取姿勢五建議高度。'
        };
    }

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
        let draft = calibrationDrafts[calibrationPose()];
        if (!draft && calibrationPose() === 'pose5') {
            const suggestion = pose5Suggestion();
            if (validHeight('Head', suggestion.head) && validHeight('Neck', suggestion.neck)) {
                draft = calibrationDrafts.pose5 = { head: String(suggestion.head), neck: String(suggestion.neck) };
            }
        }
        field('pressureCalibrationHead').value = draft?.head ?? '';
        field('pressureCalibrationNeck').value = draft?.neck ?? '';
        resetCalibrationConfirmation();
    }

    function fillRunHeightsFromCalibration() {
        if (recorder.getState().status === 'recording') return;
        const condition = conditions.find(item => item.id === selectedConditionId);
        const saved = calibrations.get(subjectId())?.[condition?.actual_pose];
        ['Head', 'Neck'].forEach(channel => {
            field(`pressure${channel}Height`).value = saved ? saved[channel.toLowerCase()].toFixed(1) : '';
        });
        confirmed.checked = false;
    }

    function canCaptureCalibration(height) {
        return calibrationDialog.open && getSystemState().connected &&
            JSON.stringify(readCalibrationProfile()) === calibrationProfile &&
            /^S\d{2}$/.test(subjectId()) && !calibrationBusy() && height.ready &&
            recorder.getState().status !== 'recording' && freshStream() &&
            latestSample.receivedMonotonicMs >= Math.max(calibrationAfter, height.settledMonotonicMs ?? height.receivedMonotonicMs) &&
            ['monitor_adc', 'neck_adc', 'head_adc'].every(key => Number.isFinite(latestSample[key])) &&
            Number(field('pressureCalibrationHead').value) === height.head &&
            Number(field('pressureCalibrationNeck').value) === height.neck &&
            field('pressureCalibrationStable').checked;
    }

    function calibrationRunIssue() {
        const height = heightState();
        if (storagePending) return '正在處理校正儲存，請稍候再開始記錄。';
        if (calibrationDialog.open) return '請先完成或關閉校正視窗，再開始記錄。';
        if (calibrationBusy()) return '正在準備或調整高度，請等待裝置回報到位後再開始記錄。';
        if (classificationCalibrationIssue()) return classificationCalibrationIssue();
        if (workflowIssue()) return workflowIssue();
        if (!calibrationUsed) return '';
        if (!height.ready) return `高度尚未就緒：${height.reason || '請確認裝置已到位，必要時重新準備微調。'}`;
        const mismatches = ['Head', 'Neck'].flatMap(channel => {
            const raw = field(`pressure${channel}Height`).value.trim();
            const value = Number(raw);
            const current = height[channel.toLowerCase()];
            if (raw && value === current) return [];
            const entered = !raw ? '未填' : Number.isFinite(value) ? `${value.toFixed(1)} cm` : '無效值';
            const actual = Number.isFinite(current) ? `${current.toFixed(1)} cm` : '未取得';
            return [`${channel} 本輪設定 ${entered}，裝置目前 ${actual}`];
        });
        return mismatches.length
            ? `本輪高度與裝置回報不一致：${mismatches.join('；')}。請確認所選條件及對應校正高度；姿勢一請使用「重新執行開機流程並套用姿勢一滿分高度」，不要改填數字代替裝置調整。`
            : '';
    }

    function refreshCalibration(running) {
        if (subjectId() !== calibrationSubject) {
            calibrationSubject = subjectId();
            fillRunHeightsFromCalibration();
            calibrationDrafts = {};
            showCalibrationDraft();
            calibrationFeedback = '';
            storageFeedback = '';
            feedback = '';
        }
        heightControl?.tick();
        const height = heightState();
        const locked = running || calibrationBusy();
        const suggestion = pose5Suggestion();
        if (!locked && (suggestion.profileKey !== pose5SuggestionKey ||
            (suggestion.deviceProfileMismatch && calibrationDrafts.pose5))) {
            pose5SuggestionKey = suggestion.profileKey;
            delete calibrationDrafts.pose5;
            if (calibrationPose() === 'pose5') showCalibrationDraft();
            resetCalibrationConfirmation();
        }
        if (!locked && calibrationPose() === 'pose5' && !calibrationDrafts.pose5 &&
            validHeight('Head', suggestion.head) && validHeight('Neck', suggestion.neck)) showCalibrationDraft();
        field('pressureCalibrationPrepare').disabled = locked || !getSystemState().connected || !/^S\d{2}$/.test(subjectId()) || !heightControl;
        root.querySelectorAll('[data-pressure-calibrate]').forEach(button => {
            button.disabled = locked || calibrationDialog.open || !getSystemState().connected || !/^S\d{2}$/.test(subjectId()) || !heightControl;
        });
        field('pressureCalibrationClose').disabled = calibrationBusy();
        const matchesHeight = Number(field('pressureCalibrationHead').value) === height.head &&
            Number(field('pressureCalibrationNeck').value) === height.neck;
        const matchesProfile = !calibrationDialog.open || JSON.stringify(readCalibrationProfile()) === calibrationProfile;
        field('pressureCalibrationStable').disabled = locked || !height.ready || !matchesHeight || !matchesProfile;
        if (!height.ready) {
            field('pressureCalibrationStable').checked = false;
            if (calibrationUsed && !running) confirmed.checked = false;
        }
        ['Head', 'Neck'].forEach(channel => {
            const input = field(`pressureCalibration${channel}`);
            input.disabled = locked || !height.ready;
            field(`pressureCalibration${channel}Minus`).disabled = input.disabled || !validHeight(channel, input.value) || Number(input.value) <= (channel === 'Head' ? 7 : 10);
            field(`pressureCalibration${channel}Plus`).disabled = input.disabled || !validHeight(channel, input.value) || Number(input.value) >= (channel === 'Head' ? 16 : 14);
            field(`pressureCalibration${channel}Apply`).disabled = locked || !height.ready || !validHeight(channel, input.value);
        });
        field('pressureCalibrationBothApply').disabled = locked || !height.ready ||
            !validHeight('Head', field('pressureCalibrationHead').value) || !validHeight('Neck', field('pressureCalibrationNeck').value);
        field('pressureCalibrationCapture').disabled = !canCaptureCalibration(height);
        const cm = value => Number.isFinite(value) ? value.toFixed(1) : '—';
        const heightText = `裝置估計：Head ${cm(height.head)}／Neck ${cm(height.neck)} cm；目標：Head ${cm(height.targetHead)}／Neck ${cm(height.targetNeck)} cm${height.ready ? '（已回報到位）' : '（尚未確認到位）'}`;
        const suggestionHint = !locked && calibrationPose() === 'pose5' && !calibrationDrafts.pose5 ? suggestion.reason : '';
        const calibrationMessage = !matchesProfile ? '基本資料已變更，請關閉並重新開啟校正。' :
            calibrationFeedback || suggestionHint || height.reason || '請選擇校正姿勢，在視窗中微調高度。';
        setText('pressureCalibrationStatus', storageFeedback);
        field('pressureCalibrationStatus').hidden = !storageFeedback;
        field('pressureFolder').disabled = !canPickFolder || locked || calibrationDialog.open;
        setText('pressureFolderStatus', calibrationFolder ? `儲存位置：${calibrationFolder.name}` : canPickFolder
            ? '尚未選擇儲存資料夾' : '請在 Chrome 或 Edge 開啟網頁，以選擇本機儲存資料夾。');
        const records = calibrations.get(subjectId());
        field('pressureAnchorShot').disabled = !calibrationFolder || !records?.pose1 || !records?.pose5 || locked || calibrationDialog.open;
        setText('pressureCalibrationDialogStatus', calibrationMessage);
        const livePressure = freshStream() && getSystemState().connected
            ? `Monitor ${latestSample.monitor_adc}／Neck ${latestSample.neck_adc}／Head ${latestSample.head_adc} ADC`
            : '等待新壓力讀值';
        setText('pressureCalibrationLive', `${heightText}。${livePressure}`);
        ['pose1', 'pose5'].forEach(pose => {
            const saved = calibrations.get(subjectId())?.[pose];
            setText(`pressureCalibration${pose === 'pose1' ? 'Pose1' : 'Pose5'}Saved`, saved
                ? [...calibrationAnchorText(saved),
                    firmwareProfile === firmwareProfileKey() && firmwareAnchors[anchorTarget(pose)]
                        ? '裝置辨識基準已確認' : '先前基準已保存；裝置辨識基準待重新校正'].join('\n')
                : '尚未校正');
        });
    }

    function calibrationAnchorText(saved) {
        return [
            `控制高度：Head ${saved.head.toFixed(1)} cm / Neck ${saved.neck.toFixed(1)} cm`,
            '模型校正基準：各通道五筆有效新讀值平均（ESP32 讀回）',
            ...Object.keys(COMFORT_CHANNELS).map(channel => {
                const adc = saved.sample[channel + '_adc'], spec = COMFORT_CHANNELS[channel];
                return `${spec.label}：${adc} ADC / ${(spec.slope * adc + spec.offset).toFixed(4)} kPa`;
            }),
            saved.quality === 'HIGH_VARIATION' ? '提示：裝置五筆模型基準波動較大，可確認姿勢後重測。' : '裝置五筆模型基準波動在原穩定範圍內。'
        ];
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
            calibrationAfter = performance.now();
            const height = heightState();
            // Pose5 starts from the device's user-specific recommendation, then keeps operator edits.
            if (height.ready && readCurrentHeights && calibrationPose() !== 'pose5') {
                field('pressureCalibrationHead').value = String(height.head);
                field('pressureCalibrationNeck').value = String(height.neck);
                saveCalibrationDraft();
            }
        } catch (error) { calibrationFeedback = error.message; }
        finally { calibrationPending = false; refresh(); }
    }

    field('pressureCalibrationPrepare').addEventListener('click', () => runCalibrationAction(prepareCalibration, true));
    root.querySelectorAll('[data-pressure-calibrate]').forEach(button => button.addEventListener('click', () => {
        if (button.disabled || calibrationBusy() || calibrationDialog.open || recorder.getState().status === 'recording') return;
        selectedCalibrationPose = button.dataset.pressureCalibrate;
        calibrationProfile = JSON.stringify(readCalibrationProfile());
        calibrationAfter = Infinity;
        showCalibrationDraft();
        setText('pressureCalibrationTitle', selectedCalibrationPose === 'pose1' ? '校正姿勢一 · 仰躺' : '校正姿勢五 · 正側躺');
        calibrationDialog.showModal();
        runCalibrationAction(prepareCalibration, true);
    }));
    function closeCalibration() {
        if (calibrationBusy()) return;
        calibrationDialog.close();
        resetCalibrationConfirmation();
        refresh();
        root.querySelector(`[data-pressure-calibrate="${selectedCalibrationPose}"]`).focus();
    }
    field('pressureCalibrationClose').addEventListener('click', closeCalibration);
    calibrationDialog.addEventListener('cancel', event => { event.preventDefault(); closeCalibration(); });
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
    field('pressureCalibrationBothApply').addEventListener('click', () => {
        const head = field('pressureCalibrationHead').value;
        const neck = field('pressureCalibrationNeck').value;
        if (!validHeight('Head', head) || !validHeight('Neck', neck) || !heightState().ready) return;
        return runCalibrationAction(async () => {
            await heightControl.adjust('HEAD', Number(head));
            await heightControl.adjust('NECK', Number(neck));
        });
    });
    field('pressureCalibrationStable').addEventListener('change', refresh);
    field('pressureCalibrationCapture').addEventListener('click', async () => {
        const height = heightState();
        if (!canCaptureCalibration(height)) return;
        if (calibrationRecord() && !window.confirm('這會取代此受試者、此姿勢先前的校正基準。請先截圖保存，是否繼續？')) return;
        if (!canCaptureCalibration(heightState())) return;
        const pose = calibrationPose(), key = firmwareProfileKey();
        const snapshot = {
            subject: subjectId(), head: height.head, neck: height.neck,
            targetHead: height.targetHead, targetNeck: height.targetNeck,
            profile: readCalibrationProfile()
        };
        calibrationPending = true;
        calibrationFeedback = '正在收取按鈕後五筆有效新讀值並計算平均，請維持目前姿勢並自然呼吸，完成後會自動關閉。';
        refresh();
        try {
            const anchor = await captureFirmwareAnchor(pose, height);
            if (key !== firmwareProfileKey() || firmwareProfile !== key) throw new Error('受測者資料已變更，請重新開啟校正。');
            const records = calibrations.get(subjectId()) || {};
            records[pose] = { ...snapshot, ...anchor };
            calibrations.set(subjectId(), records);
            firmwareAnchors[anchorTarget(pose)] = anchor.firmwareAnchor;
            if (pose === 'pose1' && savedCondition('03') && savedCondition('04') && !classificationCalibrationIssue()) {
                // Capture already verified the new pose1 height against the device.
                pose1HeightKey = calibrationKey();
            }
            if (conditions.find(item => item.id === selectedConditionId)?.actual_pose === pose) fillRunHeightsFromCalibration();
            const hasProgress = conditionOrder.some(savedCondition);
            storageFeedback = classificationCalibrationIssue() || (hasProgress
                ? '校正基準已更新，先前完成並儲存的進度保留。請選擇要繼續或重測的條件，重新準備辨識並確認本輪高度。'
                : '兩姿勢裝置辨識基準已完成。先做姿勢五穩定；按「開始辨識」準備，再按「開始記錄」開始 35 秒。');
            calibrationPending = false;
            closeCalibration();
            if (pose === 'pose5' && !classificationCalibrationIssue() && !hasProgress) selectCondition('03');
        } catch (error) {
            resetCalibrationConfirmation();
            calibrationAfter = Infinity;
            calibrationFeedback = `${error.message} 正在取消本次擷取並重新確認裝置狀態，請稍候。`;
            refresh();
            try {
                if (!getSystemState().connected) throw new Error('BLE 已斷線，請先重新連線。');
                // Await cancellation before preparing; anchor sampling invalidates height readiness.
                await requestCalibration('ANCHOR,CANCEL', parts => parts.join(',') === 'ANCHOR,OK,CANCEL');
                if (key !== firmwareProfileKey() || firmwareProfile !== key) throw new Error('受測者資料已變更，請關閉並重新開啟校正。');
                await heightControl.prepare();
                if (key !== firmwareProfileKey() || firmwareProfile !== key) throw new Error('受測者資料已變更，請關閉並重新開啟校正。');
                calibrationAfter = performance.now();
                calibrationFeedback = `${error.message} 已重新確認裝置狀態；請核對高度、等候新壓力讀值，重新勾選確認後再按「校正完成」。`;
            } catch (recoveryError) {
                calibrationFeedback = `${error.message} 尚未恢復校正：${recoveryError.message} 請確認裝置後按「重新準備校正」；本次未保存。`;
            }
        } finally {
            calibrationPending = false;
            refresh();
        }
    });

    field('pressureFolder').addEventListener('click', async () => {
        if (field('pressureFolder').disabled) return;
        storagePending = true;
        storageFeedback = '';
        refresh();
        try {
            calibrationFolder = await window.showDirectoryPicker({ mode: 'readwrite', id: 'ipillow-experiment-01' });
        } catch (error) {
            if (error.name !== 'AbortError') storageFeedback = `選擇資料夾失敗：${error.message}`;
        } finally { storagePending = false; refresh(); }
    });

    field('pressureAnchorShot').addEventListener('click', async () => {
        if (field('pressureAnchorShot').disabled) return;
        const records = calibrations.get(subjectId());
        const name = `${subjectId()}_01_00_校正總覽.svg`;
        const report = {
            title: `${subjectId()}｜實驗 01 校正總覽`,
            details: ['以下壓力為 ESP32 實際保存並供模型使用的各通道五筆有效新讀值平均。',
                ...['pose1', 'pose5'].flatMap(pose => {
                    const saved = records[pose];
                    return [pose === 'pose1' ? '姿勢一 · 仰躺' : '姿勢五 · 正側躺',
                        calibrationProfileText(saved.profile), `壓力讀值時間：${saved.sample.timestamp_iso}`,
                        `目標高度：Head ${saved.targetHead.toFixed(1)} cm / Neck ${saved.targetNeck.toFixed(1)} cm`,
                        ...calibrationAnchorText(saved)];
                })], sections: []
        };
        storagePending = true;
        storageFeedback = '正在儲存校正總覽…';
        refresh();
        try {
            const saved = await saveComfortImage(calibrationFolder, name, report);
            storageFeedback = saved ? `已儲存 ${name}` : '已取消覆蓋，原檔保留。';
        } catch (error) { storageFeedback = `儲存校正總覽失敗：${error.message}`; }
        finally { storagePending = false; refresh(); }
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
                        x: { type: 'linear', min: 0, max: durationMs / 1000, title: { display: true, text: 'elapsed_s（秒）' } },
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

    function eligibilityHint(state, system, calibrationIssue) {
        if (state.status === 'recording') return '本輪設定已鎖定；收合介面不會停止記錄。';
        if (state.samples.length && !state.exportRequested) return '請先匯出此條件上一輪的 CSV 與線圖，再重測，以免遺失資料。';
        if (!system.connected) return '請先連接 ESP32，並確認持續收到有效的三通道壓力資料。';
        if (!freshStream()) return '請確認持續收到至少兩筆完整壓力訊息，且最後接收間隔未超過門檻。';
        if (calibrationIssue) return calibrationIssue;
        if (!form.checkValidity()) return '請填妥受試者、設定高度，並確認本輪姿勢與高度。';
        if (typeof Chart !== 'function') return '圖表元件尚未載入，請確認 Chart.js 可用。';
        return state.exportRequested ? '上一輪已要求下載；重測前仍需確認 CSV 與 PNG 線圖都已保存。' : '設定完成後按「開始記錄」；收到裝置啟動確認後開始本輪 35 秒。';
    }

    function refresh() {
        const state = recorder.tick();
        recoverMissingResults(state);
        const system = getSystemState();
        if (calibrationRequest && calibrationRequest.profileKey !== firmwareProfileKey()) failCalibrationRequest('受測者資料已變更，請重新開啟校正。');
        if (firmwareProfile && firmwareProfile !== firmwareProfileKey()) {
            invalidateFirmwareCalibration();
            if (system.connected) options.setClassificationEnabled(false);
        }
        if (state.status !== 'recording' && classificationRun) {
            if (state.classificationStatus === 'RUNNING') recorder.classificationState('FINISHED');
            else if (state.classificationStatus === 'STARTING') recorder.classificationState('ERROR', '記錄結束前分類尚未啟動');
            stopClassification();
        }
        if (state.status === 'recording') modelPanel.tick();
        const classification = recorder.getState();
        setText('pressureClassificationStatus', !state.runId ? '尚未記錄：按「開始記錄」才顯示、累積並保存本輪 35 秒資料。' : `本輪收到 ${classification.classifications.length} 筆分類訊息。${classification.classificationReason ||
            (classification.classificationStatus === 'STARTING' ? '正在等待分類啟動確認；正式 35 秒尚未開始。' :
             classification.classificationStatus === 'ERROR' ? '分類異常，請檢查本實驗的校正基準。' :
             classification.classifications.length ? `已收 ${classification.classifications.length}/35 秒；無歷史有效 ${classification.validSampleCount} 筆（至少需 30 筆），無效 ${classification.classifications.length - classification.validSampleCount} 筆。暖機／無效狀態照實保存。` : '尚無本輪分類資料；缺值不沿用上輪結果。')}`);
        const running = state.status === 'recording';
        const profile = readUserProfile();
        if (!running && previousUserProfile && Object.keys(profile).some(key => profile[key] !== previousUserProfile[key])) confirmed.checked = false;
        previousUserProfile = profile;
        setText('pressureUserProfile', running ? `本輪開始時資料｜${profileText(state.metadata)}` : calibrationProfileText(readCalibrationProfile()));
        refreshCalibration(running);
        const classificationControlsDisabled = !system.connected || running || calibrationDialog.open || calibrationBusy() ||
            typeof options.setClassificationEnabled !== 'function';
        field('pressureClassificationStart').disabled = classificationControlsDisabled || classificationArmed || Boolean(classificationCalibrationIssue());
        field('pressureClassificationStop').disabled = classificationControlsDisabled || !classificationArmed;
        setText('pressureClassificationControlStatus', running
            ? '35 秒記錄中，辨識由本輪控制；如需中止，請按「提前結束」。'
            : !system.connected ? '請先連接 ESP32，再開始辨識。'
            : storagePending ? '正在處理校正儲存，請稍候再開始辨識。'
            : calibrationDialog.open ? '請先完成或關閉校正視窗，再開始辨識。'
            : calibrationBusy() ? '正在準備或調整高度，請等待到位後再開始辨識。'
            : classificationCalibrationIssue() ? classificationCalibrationIssue()
            : classificationArmed ? '辨識已準備；等待「開始記錄」，目前不顯示結果、不累積分類歷史。'
            : '校正完成。請按「開始辨識」準備，再按「開始記錄」啟動本輪。');
        settings.disabled = running || calibrationDialog.open || calibrationBusy();
        field('pressureSubject').disabled = settings.disabled;
        const switchAvailable = !settings.disabled && system.connected && !classificationCalibrationIssue() &&
            savedCondition('03') && savedCondition('04') && !unsavedCondition();
        field('pressureSwitchEmpty').disabled = !switchAvailable;
        field('pressureRestorePose1').disabled = !switchAvailable || !field('pressureSwitchEmpty').checked;
        field('pressureRestoreCancel').disabled = !heightSwitch || heightSwitch.cancelled;
        const completed = conditionOrder.filter(savedCondition).length;
        setText('pressureWorkflowStatus', `完成並儲存 ${completed} / 4。` + (heightSwitch ? '正在切換高度，請保持離枕。'
            : completed === 4 ? '四個條件皆已完成並儲存。'
            : savedCondition('03') && savedCondition('04') && pose1HeightKey !== calibrationKey()
                ? '下一步：離枕，重新執行開機流程並套用姿勢一滿分高度。'
                : '每輪記錄完整 35 秒，至少 30 筆有效分類；儲存本輪後再進行下一條件。'));
        if (priorStatus === 'recording' && !running) confirmed.checked = false;
        priorStatus = state.status;
        setText('pressureBleStatus', system.connected ? '已連線' : '未連線');
        setText('pressureRunStatus', statusLabels[state.status]);
        setText('pressureElapsed', `${(state.elapsedMs / 1000).toFixed(1)} / ${(state.durationMs / 1000).toFixed(1)}`);
        setText('pressureSampleCount', String(state.samples.length));
        const ageMs = latestSample ? Math.max(0, performance.now() - latestSample.receivedMonotonicMs) : null;
        setText('pressureLastReceived', latestSample
            ? `${latestSample.timestamp_iso}（${(ageMs / 1000).toFixed(1)} 秒前${ageMs >= gapTimeoutMs ? '，已過期' : ''}）` : '尚無有效完整訊息');
        ['Monitor', 'Neck', 'Head'].forEach(channel => {
            const value = (running ? latestSample : state.samples.at(-1))?.[`${channel.toLowerCase()}_adc`];
            setText(`pressureLive${channel}`, !Number.isFinite(value) ? '-' : `${value} ADC${running && ageMs >= gapTimeoutMs ? '（過期）' : ''}`);
        });
        setText('pressureObservedInterval', recentIntervals.length
            ? `最近 ${recentIntervals.at(-1).toFixed(1)}；範圍 ${Math.min(...recentIntervals).toFixed(1)}–${Math.max(...recentIntervals).toFixed(1)}（最近 ${recentIntervals.length} 個間隔）`
            : '等待實際接收間隔；正式記錄使用每秒分類封包');
        setText('pressureGapPolicy', `分類啟動確認後完整記錄 35 秒，至少 30 筆有效無歷史結果才算完成。每秒壓力與分類來自同一封包；缺筆最多額外等待 ${(gapTimeoutMs / 1000).toFixed(1)} 秒補取。無效與缺筆照實保留；有歷史前 6 筆有效樣本仍需暖機。`);
        setText('pressureControlWarning', system.autoHeightPossible
            ? '目前為自動模式或 PRED 已啟用／請求啟動，可能改變高度。可在本區按「準備微調」停止自動調整，再確認固定高度條件。'
            : '控制提醒：目前 Web 未回報自動高度調整啟用，請由操作者確認高度固定；收數不會自行調整高度。此提醒不會阻止開始記錄，若按鈕無法使用，請查看按鈕上方的原因。');
        field('pressureControlWarning').className = system.autoHeightPossible ? 'pressure-warning' : 'pressure-field-hint';
        if (state.runId) {
            const m = state.metadata;
            const suffix = state.status === 'completed'
                ? `35 秒記錄完成；無歷史有效 ${state.validSampleCount} 筆、無效 ${state.classifications.length - state.validSampleCount} 筆、缺 ${state.missingSampleCount} 筆。`
                : state.status === 'interrupted' ? reasonLabels[state.interruptionReason] || state.interruptionReason
                : state.status === 'ended_early' ? '已有樣本保留，本輪未完成 35 秒。' : '正在收集原始 ADC。';
            setText('pressureRunSummary', `本輪紀錄｜${m.subject_id}／條件 ${m.condition_id}／${m.actual_pose}／${m.height_condition}／${m.test_condition}／Head ${m.head_height_cm} cm、Neck ${m.neck_height_cm} cm｜${profileText(m)}｜${state.samples.length} 筆。${suffix}`);
        } else {
            setText('pressureRunSummary', `條件 ${selectedConditionId} 尚無本輪收集結果；開始記錄後才會繪製本條件曲線。`);
        }
        ensureChart(state);
        const pending = conditions.filter(condition => {
            const saved = recorders.get(condition.id).getState();
            return condition.id !== selectedConditionId && saved.samples.length > 0 && !saved.exportRequested;
        }).map(condition => condition.id);
        const pendingHint = pending.length ? ` 條件 ${pending.join('、')} 尚有未匯出的結果，已暫存於本頁，可切回匯出。` : '';
        const calibrationIssue = calibrationRunIssue();
        const hint = (feedback || eligibilityHint(state, system, calibrationIssue)) + pendingHint;
        lastUiState = {
            status: state.status, statusText: statusLabels[state.status],
            running, hint,
            startDisabled: running || Boolean(calibrationIssue) || !system.connected || !freshStream() || !form.checkValidity() ||
                (state.samples.length > 0 && !state.exportRequested) || typeof Chart !== 'function',
            retryDisabled: running || calibrationBusy() || calibrationDialog.open || !state.runId ||
                (state.samples.length > 0 && !state.exportRequested),
            finishDisabled: !running, exportDisabled: running || calibrationBusy() || calibrationDialog.open || state.samples.length === 0
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
                ...readUserProfile(),
                trial_index: '', condition_id: condition.id,
                actual_pose: condition.actual_pose, height_condition: condition.height_condition,
                head_height_cm: Number(field('pressureHeadHeight').value),
                neck_height_cm: Number(field('pressureNeckHeight').value),
                test_condition: condition.test_condition, height_source: 'operator',
                profileKey: firmwareProfileKey(),
                notes: 'EXP01 calibration=' + JSON.stringify({
                    profile: readCalibrationProfile(),
                    BSHS: firmwareAnchors.BSHS, BLHL: firmwareAnchors.BLHL,
                    pose1CapturedAt: calibrations.get(subjectId())?.pose1?.sample.timestamp_iso,
                    pose5CapturedAt: calibrations.get(subjectId())?.pose5?.sample.timestamp_iso
                })
            });
            startClassification();
        } catch (error) { feedback = error.message; }
        refresh();
    }

    function endEarly() {
        feedback = '';
        recorder.endEarly();
        refresh();
    }

    function retryCurrent() {
        if (refresh().retryDisabled) return;
        if (!window.confirm(`重新測試條件 ${selectedConditionId}：請確認原本的 CSV 與 PNG 已保存。本頁只會清空此條件的結果與完成狀態，其他條件保留。是否繼續？`)) return;
        if (refresh().retryDisabled) return;
        recorder = createPressureRecorder({ durationMs, minimumValidSamples, gapTimeoutMs });
        recorders.set(selectedConditionId, recorder);
        fillRunHeightsFromCalibration();
        modelPanel.reset('已準備重測；按「開始記錄」後才開始新一輪');
        feedback = '';
        refresh();
    }

    async function exportCsv() {
        const state = recorder.getState();
        if (state.status === 'recording' || !state.samples.length || calibrationBusy() || calibrationDialog.open) return;
        const activeRecorder = recorder;
        storagePending = true;
        try {
            const m = state.metadata;
            const condition = conditions.find(item => item.id === m.condition_id);
            const runId = state.runId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const stem = `${m.subject_id}_${condition.filePose}_${condition.fileHeight}_${m.test_condition}_${runId}`;
            // Build both files first; never acknowledge a partial/failed preparation.
            const png = createChartImage(state);
            const csv = new Blob([recorder.csv()], { type: 'text/csv;charset=utf-8;' });
            refresh();
            if (calibrationFolder) {
                const image = await (await fetch(png)).blob();
                await writeRapidFile(calibrationFolder, `${stem}.csv`, csv);
                await writeRapidFile(calibrationFolder, `${stem}.png`, image);
                feedback = `條件 ${m.condition_id} 的 CSV 與 PNG 已儲存至 ${calibrationFolder.name}。`;
            } else {
                const url = URL.createObjectURL(csv);
                try {
                    download(url, `${stem}.csv`);
                    download(png, `${stem}.png`);
                } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
                feedback = `已要求下載條件 ${m.condition_id} 的 CSV 與 PNG；請確認兩檔都已保存，必要時允許瀏覽器下載多個檔案。`;
            }
            activeRecorder.acknowledgeExport();
            if (state.status !== 'completed') feedback += ` 本輪未完成（有效 ${state.validSampleCount} 筆，至少需 30 筆且完整記錄 35 秒）；請重測本條件。`;
            storagePending = false;
            const next = { '03': '04', '01': '02' }[m.condition_id];
            if (next && savedCondition(m.condition_id) && !savedCondition(next)) selectCondition(next);
            if (m.condition_id === '04' && savedCondition('04')) feedback += ' 請先離枕，再重新執行開機流程並套用姿勢一滿分高度。';
        } catch (error) { feedback = `匯出失敗，原資料仍保留：${error.message}`; }
        finally { storagePending = false; }
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
            profileText(m),
            `Head ${m.head_height_cm} cm｜Neck ${m.neck_height_cm} cm｜${state.samples.length} 筆｜有效 ${state.validSampleCount}、無效 ${state.classifications.length - state.validSampleCount}、缺 ${state.missingSampleCount}｜${statusLabels[state.status]}`
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
        // P updates live monitoring; synchronized trial rows come from CLASSIFY data.
        recorder.receive(sample);
    }

    function onDisconnected() {
        failCalibrationRequest('BLE 已斷線，請重新連線後完成兩姿勢校正。');
        invalidateFirmwareCalibration();
        if (heightSwitch) heightSwitch.cancelled = true;
        recorders.forEach(saved => saved.disconnect());
        if (classificationRun) recorder.classificationState('ERROR', 'BLE 斷線');
        stopClassification();
        lastModelSession = null;
        modelPanel.reset('BLE 未連線');
        latestSample = null;
        previousSample = null;
        recentIntervals = [];
        refresh();
    }

    function switchCondition() {
        if (conditionSelect.value === selectedConditionId) return true;
        if (recorder.getState().status === 'recording' || calibrationDialog.open || calibrationBusy() || !recorders.has(conditionSelect.value)) {
            conditionSelect.value = selectedConditionId;
            return false;
        }
        selectedConditionId = conditionSelect.value;
        recorder = recorders.get(selectedConditionId);
        priorStatus = recorder.getState().status;
        fillRunHeightsFromCalibration();
        modelPanel.reset('按「開始記錄」後顯示本輪結果；已取得的資料保留於各條件。');
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
        start, retryCurrent, endEarly, exportCsv, receivePressure, receiveLine, onDisconnected, refresh,
        isRunning: () => recorder.getState().status === 'recording',
        isHeightSwitching: () => Boolean(heightSwitch),
        isBusy: () => recorder.getState().status === 'recording' || calibrationDialog.open || calibrationBusy(),
        needsLeaveProtection: () => {
            return calibrations.size > 0 || calibrationBusy() || [...recorders.values()].some(saved => {
                const state = saved.getState();
                return state.status === 'recording' || (state.samples.length > 0 && !state.exportRequested);
            });
        },
        getUiState: () => lastUiState
    };
}
