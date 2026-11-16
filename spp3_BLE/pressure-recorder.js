// EXP01 records one pressure/result pair per ESP32 classification second.
// Browser receipt timestamps stay intact; elapsed_s is the session's second index.
function createPressureRecorder(options = {}) {
    const now = options.now || (() => performance.now());
    const isoNow = options.isoNow || (() => new Date().toISOString());
    const createId = options.createId || (() => globalThis.crypto.randomUUID());
    const durationMs = options.durationMs ?? 35000;
    const minimumValidSamples = options.minimumValidSamples ?? 30;
    const gapTimeoutMs = options.gapTimeoutMs;
    const targetSamples = durationMs / 1000;
    if (!Number.isInteger(targetSamples) || targetSamples <= 0 || targetSamples > 35 ||
        !Number.isInteger(minimumValidSamples) || minimumValidSamples <= 0 || minimumValidSamples > targetSamples ||
        !Number.isFinite(gapTimeoutMs) || gapTimeoutMs <= 0) {
        throw new Error('A 1–35 second duration, valid sample minimum and positive recovery timeout are required.');
    }
    const clone = value => JSON.parse(JSON.stringify(value));
    const validIso = value => typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        Number.isFinite(Date.parse(value));
    let run = {
        status: 'idle', runId: null, metadata: null, samples: [], classifications: [], classificationStatus: 'NOT_STARTED', classificationReason: '',
        startMonotonicMs: null, startedTimestampIso: null, elapsedMs: 0,
        interruptionReason: '', exportRequested: false
    };
    function validSampleCount() {
        return run.classifications.filter(event => event.result.staticModel.status === 'OK' &&
            event.result.adc.every(Number.isFinite)).length;
    }
    function getState() { return clone({ ...run, durationMs, gapTimeoutMs, targetSamples, minimumValidSamples,
        validSampleCount: validSampleCount(), missingSampleCount: targetSamples - run.classifications.length }); }
    function progress(at) {
        if (Number.isFinite(at) && run.classificationStatus !== 'STARTING')
            run.elapsedMs = Math.min(durationMs, Math.max(run.elapsedMs, at - run.startMonotonicMs, 0));
    }
    function finish(status, at, reason = '') {
        progress(at); run.status = status; run.interruptionReason = reason;
    }
    function finishCollectionIfReady(at) {
        const elapsed = at - run.startMonotonicMs;
        const allReceived = run.classifications.length === targetSamples;
        if (elapsed < durationMs || (!allReceived && elapsed < durationMs + gapTimeoutMs)) return;
        const complete = validSampleCount() >= minimumValidSamples;
        finish(complete ? 'completed' : 'interrupted', at, complete ? '' :
            allReceived ? 'classification_invalid' : 'classification_missing');
    }
    function start(metadata) {
        if (run.status === 'recording') throw new Error('A recording is already in progress.');
        if (run.samples.length && !run.exportRequested) throw new Error('Export the previous run before starting another.');
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Run metadata is required.');
        const started = now(), startedIso = isoNow(), id = createId();
        if (!Number.isFinite(started) || !validIso(startedIso) || typeof id !== 'string' || !id)
            throw new Error('A valid clock, timezone-aware timestamp and unique run ID are required.');
        run = {
            status: 'recording', runId: id, metadata: clone(metadata), samples: [], classifications: [], classificationStatus: 'STARTING', classificationReason: '',
            startMonotonicMs: started, startedTimestampIso: startedIso, elapsedMs: 0,
            interruptionReason: '', exportRequested: false
        };
        return getState();
    }
    function tick() {
        if (run.status !== 'recording') return getState();
        const at = now(); progress(at);
        if (run.classificationStatus === 'STARTING') {
            if (at - run.startMonotonicMs >= 30000) finish('interrupted', at, 'classification_start_timeout');
        } else finishCollectionIfReady(at);
        return getState();
    }
    // P snapshots still feed live monitoring/calibration, not this synchronized trial.
    function receive() { return false; }
    function classificationState(status, reason = '') {
        if (status === 'RUNNING' && run.classificationStatus === 'STARTING') {
            run.startMonotonicMs = now(); run.startedTimestampIso = isoNow(); run.elapsedMs = 0;
        }
        run.classificationStatus = status; run.classificationReason = reason;
        if (status === 'ERROR' && run.status === 'recording') finish('interrupted', now(), 'classification_error');
    }
    function receiveClassification(result, receipt) {
        if (run.status !== 'recording' || run.classificationStatus !== 'RUNNING' || !result ||
            !validIso(receipt?.timestamp_iso) || !Number.isFinite(receipt?.receivedMonotonicMs) ||
            receipt.receivedMonotonicMs < run.startMonotonicMs || !Number.isInteger(result.sequence) ||
            result.sequence < 1 || result.sequence > targetSamples ||
            !Array.isArray(result.adc) || result.adc.length !== 3 ||
            !['OK', 'INVALID'].includes(result.staticModel?.status)) return false;
        if (receipt.receivedMonotonicMs - run.startMonotonicMs >= durationMs + gapTimeoutMs) { tick(); return false; }
        const previous = run.classifications[0];
        if ((previous && result.session !== previous.result.session) ||
            run.classifications.some(event => event.result.sequence === result.sequence)) return false;
        const elapsed_s = result.sequence - 1;
        run.classifications.push({ timestamp_iso: receipt.timestamp_iso, elapsed_s, result: clone(result) });
        run.classifications.sort((a, b) => a.result.sequence - b.result.sequence);
        run.samples.push({ sample_index: result.sequence, timestamp_iso: receipt.timestamp_iso, elapsed_s,
            monitor_adc: Number.isFinite(result.adc[0]) ? result.adc[0] : null,
            neck_adc: Number.isFinite(result.adc[1]) ? result.adc[1] : null,
            head_adc: Number.isFinite(result.adc[2]) ? result.adc[2] : null });
        run.samples.sort((a, b) => a.sample_index - b.sample_index);
        progress(receipt.receivedMonotonicMs);
        finishCollectionIfReady(receipt.receivedMonotonicMs);
        return true;
    }
    function endEarly() {
        if (run.status === 'recording') finish('ended_early', now());
        return getState();
    }
    function disconnect() {
        if (run.status === 'recording') finish('interrupted', now(), 'ble_disconnected');
        return getState();
    }

    function csv() {
        if (run.status === 'recording' || !run.samples.length) throw new Error('No finished samples are available for export.');
        const columns = [
            'run_id', 'subject_id', 'trial_index', 'condition_id', 'actual_pose',
            'height_condition', 'head_height_cm', 'neck_height_cm', 'test_condition',
            'sample_index', 'timestamp_iso', 'elapsed_s', 'monitor_adc', 'neck_adc',
            'head_adc', 'run_status', 'notes', 'height_source', 'data_timeout_s', 'gap_timeout_ms',
            'interruption_reason', 'time_source', 'pressure_unit',
            'age_years', 'body_height_cm', 'body_weight_kg',
            'event_type', 'classification_run_status', 'classification_run_reason',
            'classification_session', 'classification_sequence', 'classification_tick_ms',
            'classification_sample_sequence', 'classification_sample_ms',
            'classification_monitor_adc', 'classification_neck_adc', 'classification_head_adc',
            'static_status', 'static_group', 'static_p_group1', 'static_p_group2',
            'history_status', 'history_group', 'history_p_group1', 'history_p_group2',
            'history_count', 'classification_dropped', 'classification_inference_us'
        ];
        const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const events = [
            ...run.samples.map(sample => ({ ...sample, event_type: 'pressure' })),
            ...run.classifications.map(event => {
                const r = event.result;
                return {
                    event_type: 'classification', timestamp_iso: event.timestamp_iso, elapsed_s: event.elapsed_s,
                    diagnostic: r.diagnostic || '',
                    classification_session: r.session, classification_sequence: r.sequence,
                    classification_tick_ms: r.tickMs, classification_sample_sequence: r.sampleSequence,
                    classification_sample_ms: r.sampleMs,
                    classification_monitor_adc: r.adc[0], classification_neck_adc: r.adc[1], classification_head_adc: r.adc[2],
                    static_status: r.staticModel.status, static_group: r.staticModel.group,
                    static_p_group1: r.staticModel.p1, static_p_group2: r.staticModel.p2,
                    history_status: r.historyModel.status, history_group: r.historyModel.group,
                    history_p_group1: r.historyModel.p1, history_p_group2: r.historyModel.p2,
                    history_count: r.historyCount, classification_dropped: r.dropped, classification_inference_us: r.inferenceUs
                };
            })
        ].sort((a, b) => a.elapsed_s - b.elapsed_s);
        const rows = events.map(sample => ({
            ...run.metadata, ...sample, run_id: run.runId,
            notes: [run.metadata.notes, `EXP01 ${targetSamples}s; min_valid=${minimumValidSamples}; valid=${validSampleCount()}; invalid=${run.classifications.length - validSampleCount()}; missing=${targetSamples - run.classifications.length}`, sample.diagnostic].filter(Boolean).join(' | '),
            elapsed_s: sample.elapsed_s.toFixed(6), run_status: run.status,
            data_timeout_s: gapTimeoutMs / 1000, gap_timeout_ms: gapTimeoutMs, interruption_reason: run.interruptionReason,
            time_source: 'esp32_session_second_browser_received_timestamp', pressure_unit: 'ADC',
            classification_run_status: run.classificationStatus, classification_run_reason: run.classificationReason
        }));
        return '\uFEFF' + [columns, ...rows.map(row => columns.map(key => row[key]))]
            .map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
    }

    function acknowledgeExport() {
        if (run.status === 'recording' || !run.samples.length) throw new Error('No finished samples are available for export.');
        // This means the browser was asked to download, not proof the file was saved.
        run.exportRequested = true;
        return getState();
    }

    return { start, receive, receiveClassification, classificationState, tick, endEarly, disconnect, getState, csv, acknowledgeExport };
}

if (typeof module !== 'undefined' && module.exports) module.exports = createPressureRecorder;
