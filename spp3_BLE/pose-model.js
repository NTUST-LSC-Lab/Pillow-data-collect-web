// CLASSIFY,DATA,V1 from spp3_BLE_v4_model. No inference or probability fusion in Web.
function parseDualPoseResult(line) {
    const a = line.split(',').map(v => v.trim());
    if (a.length !== 22 || a.slice(0, 3).join(',') !== 'CLASSIFY,DATA,V1') return null;
    const integer = v => /^\d+$/.test(v) && Number.isSafeInteger(Number(v));
    const numeric = v => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v) && Number.isFinite(Number(v));
    if (![3,4,5,6,7,19,20,21].every(i => integer(a[i]))) return null;
    if (![3,4,5,6,7,20,21].every(i => Number(a[i]) <= 0xffffffff) || Number(a[4]) < 1) return null;
    function model(offset, allowed) {
        const [status, group, p1, p2] = a.slice(offset, offset + 4);
        if (!allowed.includes(status)) return null;
        if (status !== 'OK') return group === 'UNKNOWN' && p1 === 'NA' && p2 === 'NA'
            ? { status, group: null, p1: null, p2: null } : null;
        if (!['GROUP1','GROUP2'].includes(group) || !numeric(p1) || !numeric(p2)) return null;
        const probabilities = [Number(p1), Number(p2)];
        if (probabilities.some(p => p < 0 || p > 1) || Math.abs(probabilities[0] + probabilities[1] - 1) > 1e-7) return null;
        // The device chooses the label before rounding probabilities to eight decimals.
        if ((group === 'GROUP1' && probabilities[1] > .5) || (group === 'GROUP2' && probabilities[1] < .5)) return null;
        return { status, group, p1: probabilities[0], p2: probabilities[1] };
    }
    const staticModel = model(11, ['OK','INVALID']);
    const historyModel = model(15, ['OK','WARMUP','INVALID']);
    if (!staticModel || !historyModel || (staticModel.status === 'INVALID') !== (historyModel.status === 'INVALID')) return null;
    const historyCount = Number(a[19]);
    if (staticModel.status === 'OK' && historyModel.status !== (historyCount < 6 ? 'WARMUP' : 'OK')) return null;
    if (!a.slice(8, 11).every(v => numeric(v) || (staticModel.status === 'INVALID' && /^(nan|inf|-inf)$/i.test(v)))) return null;
    return {
        session: Number(a[3]), sequence: Number(a[4]), tickMs: Number(a[5]),
        sampleSequence: Number(a[6]), sampleMs: Number(a[7]),
        adc: a.slice(8, 11).map(v => numeric(v) ? Number(v) : null),
        staticModel, historyModel, historyCount, dropped: Number(a[20]), inferenceUs: Number(a[21])
    };
}

function createPoseModelPanel(root, now = () => performance.now()) {
    let latest = null, receivedMs = null;
    const set = (name, text) => { const node = root.querySelector(`[data-pose-model="${name}"]`); if (node) node.textContent = text; };
    function blank(status) {
        for (const prefix of ['static','history']) {
            set(`${prefix}-group`, '—'); set(`${prefix}-p1`, '—'); set(`${prefix}-p2`, '—'); set(`${prefix}-status`, status);
        }
    }
    function reset(message = '尚未開始') {
        latest = null; receivedMs = null; blank(message);
        set('updated', '—'); set('count', '—'); set('notice', message);
    }
    function receive(line) {
        const result = parseDualPoseResult(line);
        if (!result) { blank('資料格式不符'); set('notice', '分類資料格式不符，請確認使用 spp3_BLE_v4_model 韌體。'); return false; }
        if (latest) {
            const difference = result.session === latest.session
                ? (result.sequence - latest.sequence) >>> 0 : (result.session - latest.session) >>> 0;
            if (!difference || difference >= 0x80000000) return false;
        }
        latest = result; receivedMs = now();
        for (const [prefix, model] of [['static', result.staticModel], ['history', result.historyModel]]) {
            set(`${prefix}-group`, model.group === 'GROUP1' ? 'Group1' : model.group === 'GROUP2' ? 'Group2' : '—');
            set(`${prefix}-p1`, model.p1 === null ? '—' : `${(model.p1 * 100).toFixed(2)}%`);
            set(`${prefix}-p2`, model.p2 === null ? '—' : `${(model.p2 * 100).toFixed(2)}%`);
            set(`${prefix}-status`, model.status === 'OK' ? '有效結果' : model.status === 'WARMUP'
                ? `暖機中（${result.historyCount + 1}/6）` : '本秒讀值無效');
        }
        set('updated', new Date().toLocaleTimeString());
        set('count', `${result.historyCount + (result.staticModel.status === 'OK' ? 1 : 0)} 筆`);
        set('notice', result.staticModel.status === 'INVALID' ? '本秒未取得有效掃描；保留先前歷史，不沿用上次分類。'
            : result.historyModel.status === 'WARMUP' ? '前 6 筆有效資料供歷史暖機，第 7 筆開始輸出有歷史結果。'
            : '兩模型使用同一筆壓力，分別顯示結果。');
        if (result.dropped) set('notice', `裝置累積未送達 ${result.dropped} 筆結果；目前顯示最新收到的一筆。`);
        return true;
    }
    function tick() {
        if (receivedMs !== null && now() - receivedMs > 3000) {
            blank('等待新資料'); set('notice', '超過 3 秒沒有新分類結果；上次接收時間保留供核對。');
        }
    }
    reset();
    return { receive, reset, tick };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parseDualPoseResult, createPoseModelPanel };
