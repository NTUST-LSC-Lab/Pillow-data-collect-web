// Independent experiment height adjustment. Firmware remains the final safety clamp.
// DEBUG heights are the device's timed-pump estimates, not physical measurements.
function createExperimentHeightControl(options) {
    const now = options.now || (() => performance.now());
    const freshnessMs = 3500;
    const pollMs = 1000;
    let prepared = false;
    let pending = null;
    let debug = null;
    let debugBuffer = null;
    let io = null;
    let features = null;
    let settledMonotonicMs = null;
    let settledHeights = null;
    let reason = '請先準備實驗高度控制';
    let lastPollMs = -Infinity;
    let protectedHeightReply = false;
    let lastOwnedTargets = null;
    let requiredReceiptMs = -Infinity;
    let preparedAtMs = -Infinity;

    const connected = () => Boolean(options.isConnected());
    const recording = () => Boolean(options.isRecording && options.isRecording());
    const equal = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.01;
    function number(value) {
        return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
    }
    function legalHeight(channel, height) {
        const min = channel === 'HEAD' ? 7 : 10;
        const max = channel === 'HEAD' ? 16 : 14;
        return (channel === 'HEAD' || channel === 'NECK') && typeof height === 'number' &&
            Number.isFinite(height) && height >= min && height <= max && Math.abs(height * 2 - Math.round(height * 2)) < 1e-8;
    }
    function clearSettled() {
        settledMonotonicMs = null;
        settledHeights = null;
    }
    function invalidate(message) {
        prepared = false;
        clearSettled();
        reason = message;
        if (pending) {
            const operation = pending;
            pending = null;
            operation.reject(new Error(message));
        }
    }
    function blockedReason() {
        if (!connected()) return 'BLE 未連線，請重新準備';
        if (!features || features.receivedMonotonicMs < preparedAtMs || features.pred !== 0 || features.legacy !== 0) return '等待確認自動控制已停止';
        if (!debug || !io || !debug.preStage?.trim() || debug.startedMonotonicMs < requiredReceiptMs || io.receivedMonotonicMs < requiredReceiptMs) return '等待完整 DEBUG 與 I 回報';
        if (now() - debug.receivedMonotonicMs > freshnessMs || now() - io.receivedMonotonicMs > freshnessMs) return '裝置狀態已過期，等待更新';
        if (io.state === 9) return 'ESP32 處於 MANUAL 模式，請先由既有流程回到一般待機';
        if (io.state !== 5 || io.outputs !== 0) return '等待一般 STANDBY 且所有氣路關閉';
        if (!['IDLE', 'DONE', 'TIMEOUT'].includes(debug.anchorState)) return '校正 anchor 正在採樣，請先完成或取消';
        // Firmware caches pre_stage after PRED is disabled; FEATURE STATUS and I above confirm it is off and idle.
        if (!legalHeight('HEAD', debug.head) || !legalHeight('NECK', debug.neck) ||
            !legalHeight('HEAD', debug.targetHead) || !legalHeight('NECK', debug.targetNeck)) return '裝置高度尚未初始化或回報不完整';
        if (!equal(debug.head, debug.targetHead) || !equal(debug.neck, debug.targetNeck)) return '等待裝置估計高度到達目標';
        if (pending?.type === 'adjust') {
            if (!pending.acknowledged) return '等待高度指令確認';
            if (!equal(debug.targetHead, pending.targetHead) || !equal(debug.targetNeck, pending.targetNeck)) return '高度目標不符，請重新準備';
        }
        return '';
    }
    function evaluate() {
        if (!connected()) {
            if (prepared || pending) invalidate('BLE 已斷線，請重新準備；不會自動重送高度指令');
            return;
        }
        if (pending && now() >= pending.deadlineMs) {
            invalidate('等待裝置確認逾時；高度可能仍在調整，請檢查裝置後重新準備');
            return;
        }
        if (!prepared) return;
        const blocked = blockedReason();
        if (blocked) {
            reason = blocked;
            return;
        }
        if (settledMonotonicMs === null) {
            settledMonotonicMs = now();
            settledHeights = { head: debug.head, neck: debug.neck };
        }
        reason = '已確認高度到位，可微調或保存校正';
        if (pending) {
            const operation = pending;
            pending = null;
            operation.resolve(getState());
        }
    }
    function getState() {
        evaluate();
        const blocked = prepared ? blockedReason() : reason;
        return {
            prepared, ready: prepared && !pending && !blocked, busy: Boolean(pending),
            reason: blocked || reason,
            head: debug?.head ?? null, neck: debug?.neck ?? null,
            targetHead: debug?.targetHead ?? null, targetNeck: debug?.targetNeck ?? null,
            receivedMonotonicMs: debug?.receivedMonotonicMs ?? null,
            settledMonotonicMs,
            debugReceipt: debug ? { ...debug } : null,
            acknowledged: pending?.acknowledged || false
        };
    }
    function poll() {
        if (!connected() || (!prepared && !pending) || now() - lastPollMs < pollMs) return;
        lastPollMs = now();
        options.sendQuery('DEBUG');
        options.sendQuery('I');
    }
    function tick() {
        evaluate();
        poll();
    }
    function operation(type, deadlineMs, extra = {}) {
        return new Promise((resolve, reject) => {
            pending = { type, deadlineMs, resolve, reject, ...extra };
        });
    }
    function prepare() {
        if (pending) return Promise.reject(new Error('高度操作尚未完成'));
        if (!connected()) return Promise.reject(new Error('請先連線 BLE'));
        if (recording()) return Promise.reject(new Error('實驗記錄中，不能準備高度控制'));
        prepared = true;
        clearSettled();
        debug = null;
        io = null;
        features = null;
        debugBuffer = null;
        requiredReceiptMs = now();
        preparedAtMs = requiredReceiptMs;
        const promise = operation('prepare', now() + 15000);
        reason = '停止自動控制並讀取裝置狀態';
        try {
            options.stopAutomatic();
            poll();
        } catch (error) {
            invalidate(`準備失敗：${error.message}`);
        }
        return promise;
    }
    function adjust(channel, height) {
        if (recording()) return Promise.reject(new Error('實驗記錄中，禁止調整高度'));
        if (!legalHeight(channel, height)) return Promise.reject(new Error('高度須為 HEAD 7–16 或 NECK 10–14 cm，步進 0.5 cm'));
        const state = getState();
        if (!state.ready) return Promise.reject(new Error(state.reason));
        const targetHead = channel === 'HEAD' ? height : debug.head;
        const targetNeck = channel === 'NECK' ? height : debug.neck;
        const distance = Math.abs(height - (channel === 'HEAD' ? debug.head : debug.neck));
        clearSettled();
        requiredReceiptMs = now();
        const promise = operation('adjust', now() + distance / (channel === 'HEAD' ? 0.0848 : 0.1) * 1000 + 15000,
            { targetHead, targetNeck, acknowledged: false,
                command: `SET,NORM,EXPERIMENT,S,${channel},${height.toFixed(1)}` });
        lastOwnedTargets = { targetHead, targetNeck };
        reason = '等待高度指令確認及裝置到位';
        try {
            // Firmware ignores condition / S-L here; no USER or anthropometric lookup is used.
            options.sendCommand(pending.command);
        } catch (error) {
            invalidate(`高度指令送出失敗：${error.message}`);
        }
        return promise;
    }
    function receiveLine(line, receipt) {
        protectedHeightReply = false;
        if (!receipt || !Number.isFinite(receipt.receivedMonotonicMs) || !connected()) return;
        const time = receipt.receivedMonotonicMs;
        const parts = line.trim().split(',').map(value => value.trim());
        if (parts[0] === 'FEATURE' && parts[1] === 'STATUS') {
            features = { pred: number(parts[parts.indexOf('PRED') + 1]), legacy: number(parts[parts.indexOf('LEGACY') + 1]), receivedMonotonicMs: time };
            if ((features.pred !== 0 || features.legacy !== 0) && pending?.type !== 'prepare' && prepared) invalidate('自動控制已啟動，請重新準備');
        }
        if (parts[0] === 'PRED' && ((parts[1] === 'OK' && parts[2] === 'START') || (parts[1] === 'OK' && parts[2] === '1'))) {
            if (pending?.type !== 'prepare' && prepared) invalidate('PRED 已啟動，請重新準備');
        }
        if (parts[0] === 'ANCHOR' && ((parts[1] === 'STATUS' && ['WAIT_SETTLE', 'COLLECTING'].includes(parts[2])) ||
            (parts[1] === 'OK' && parts[2] === 'START'))) {
            if (prepared && pending?.type !== 'prepare') invalidate('校正 anchor 開始採樣，請完成後重新準備');
        }
        if (parts[0] === 'HEIGHT_SET' || parts[0] === 'HEIGHT_LIMIT') {
            const head = number(parts[parts.indexOf(parts[0] === 'HEIGHT_SET' ? 'HEAD' : 'HEAD_APPLIED') + 1]);
            const neck = number(parts[parts.indexOf(parts[0] === 'HEIGHT_SET' ? 'NECK' : 'NECK_APPLIED') + 1]);
            protectedHeightReply = Boolean(lastOwnedTargets && equal(head, lastOwnedTargets.targetHead) && equal(neck, lastOwnedTargets.targetNeck));
            if (pending?.type === 'adjust' && parts[0] === 'HEIGHT_SET' && parts[1] === 'SET_NORM') {
                if (equal(head, pending.targetHead) && equal(neck, pending.targetNeck)) {
                    pending.acknowledged = true;
                    requiredReceiptMs = time;
                    // Discard any DEBUG that started before acknowledgement of this SET.
                    debugBuffer = null;
                    debug = null;
                    io = null;
                } else invalidate('裝置回覆了不同高度目標，請重新準備');
            } else if (settledHeights && (!equal(head, settledHeights.head) || !equal(neck, settledHeights.neck))) {
                invalidate('其他操作已變更高度，請重新準備');
            }
        }
        const match = /^I:\s*(-?\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)$/.exec(line.trim());
        if (match) {
            io = { state: Number(match[2]), outputs: Number(match[3]), receivedMonotonicMs: time };
            if (io.state !== 5 || io.outputs !== 0) {
                clearSettled();
                if (prepared && io.state === 9) invalidate('ESP32 處於 MANUAL 模式，請先由既有流程回到一般待機');
                else if (prepared && !pending) invalidate('其他操作已改變裝置狀態，請重新準備');
            }
        }
        const pair = /^(\w+)=(.*)$/.exec(line.trim());
        if (pair) {
            if (pair[1] === 'gender') debugBuffer = { values: {}, startedMonotonicMs: time };
            if (debugBuffer) {
                debugBuffer.values[pair[1]] = pair[2];
                if (pair[1] === 'pre_stable_label') {
                    const values = debugBuffer.values;
                    debug = {
                        head: number(values.currentHeadNumber), neck: number(values.currentNeckNumber),
                        targetHead: number(values.headNumber), targetNeck: number(values.neckNumber),
                        userGender: number(values.gender), userAge: number(values.age),
                        userHeight: number(values.height), userWeight: number(values.weight),
                        pose5HeadCm: number(values.HLF), pose5NeckCm: number(values.N1LF),
                        anchorState: values.anchor_state, preStage: values.pre_stage,
                        startedMonotonicMs: debugBuffer.startedMonotonicMs, receivedMonotonicMs: time
                    };
                    debugBuffer = null;
                    if (settledHeights && (!equal(debug.head, settledHeights.head) || !equal(debug.neck, settledHeights.neck) ||
                        !equal(debug.head, debug.targetHead) || !equal(debug.neck, debug.targetNeck) || !debug.preStage?.trim() ||
                        !['IDLE', 'DONE', 'TIMEOUT'].includes(debug.anchorState))) clearSettled();
                }
            }
        }
        // Disabled feature gates also reject STOP / GET; this reply alone does not establish readiness.
        const disabledFeatureReply = parts.length === 3 && ['PRED', 'CLASSIFY'].includes(parts[0]) &&
            parts[1] === 'ERR' && parts[2] === 'DISABLED';
        if (!disabledFeatureReply && (parts[1] === 'ERR' || (parts[0] === 'MANUAL' && parts[1] === 'IGNORED'))) {
            if (pending && ['SET', 'FEATURE', 'PRED', 'CLASSIFY', 'MANUAL'].includes(parts[0])) invalidate(`裝置拒絕指令：${line}`);
        }
        evaluate();
    }
    // Called at actual queue execution, so an already queued conflicting command is covered.
    function allowCommand(command, owned = false) {
        if (owned) {
            if (!connected() || pending?.type !== 'adjust' || command.trim() !== pending.command) return false;
            // A delayed queue must not use the state that was fresh when the button was clicked.
            if (recording() || !features || features.pred !== 0 || features.legacy !== 0 ||
                !debug || !io || !debug.preStage?.trim() || now() - debug.receivedMonotonicMs > freshnessMs ||
                now() - io.receivedMonotonicMs > freshnessMs || io.state !== 5 || io.outputs !== 0 ||
                !['IDLE', 'DONE', 'TIMEOUT'].includes(debug.anchorState)) {
                invalidate('送出前裝置狀態已改變或過期，高度指令未送出；請重新準備');
                return false;
            }
            return true;
        }
        const commands = String(command).trim().toUpperCase().split(/[\r\n]+/);
        const readOnly = /^(P|I|DEBUG|FEATURE,STATUS|ANCHOR,(STATUS|GET)(,.*)?|CLASSIFY,GET|PRED,GET|SYNCTIME,.*|RGB,.*)$/;
        const stopOnly = /^(PRED,STOP|CLASSIFY,STOP|FEATURE,(PRED|LEGACY),OFF|MANUAL,STOP)$/;
        if (commands.every(value => readOnly.test(value))) return true;
        if (commands.every(value => stopOnly.test(value))) {
            if (commands.includes('MANUAL,STOP') && (prepared || pending)) invalidate('手動停止已送出，請重新準備實驗高度控制');
            return true;
        }
        if (pending) return false;
        if (prepared) invalidate('其他控制指令已送出，請重新準備實驗高度控制');
        lastOwnedTargets = null;
        return true;
    }
    function onDisconnected() {
        invalidate('BLE 已斷線，請重新準備；不會自動重送高度指令');
        debug = null;
        io = null;
        features = null;
        debugBuffer = null;
        lastOwnedTargets = null;
        protectedHeightReply = false;
    }
    function onTransportError(error) {
        if (prepared || pending) invalidate(`BLE 指令失敗：${error.message}；請重新準備`);
    }
    return { prepare, adjust, getState, tick, receiveLine, allowCommand, onDisconnected, onTransportError,
        ownsHeightReply: () => protectedHeightReply };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createExperimentHeightControl };
