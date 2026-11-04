// Records already-parsed, complete pressure messages. No BLE, DOM or control commands.
function createPressureRecorder(options = {}) {
    const now = options.now || (() => performance.now());
    const isoNow = options.isoNow || (() => new Date().toISOString());
    const createId = options.createId || (() => globalThis.crypto.randomUUID());
    const durationMs = options.durationMs ?? 30000;
    const gapTimeoutMs = options.gapTimeoutMs;
    if (!Number.isFinite(durationMs) || durationMs <= 0 ||
        !Number.isFinite(gapTimeoutMs) || gapTimeoutMs <= 0) {
        throw new Error('durationMs and gapTimeoutMs must be positive finite numbers.');
    }

    const clone = value => JSON.parse(JSON.stringify(value));
    function freeze(value) {
        if (value && typeof value === 'object') {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    }
    const validIso = value => typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        Number.isFinite(Date.parse(value));
    let lastSampleMonotonicMs = null;
    let run = {
        status: 'idle', runId: null, metadata: null, samples: [],
        startMonotonicMs: null, startedTimestampIso: null, elapsedMs: 0,
        interruptionReason: '', exportRequested: false
    };

    function getState() {
        return clone({ ...run, durationMs, gapTimeoutMs });
    }

    function progress(at) {
        if (Number.isFinite(at)) {
            run.elapsedMs = Math.min(durationMs, Math.max(run.elapsedMs, at - run.startMonotonicMs, 0));
        }
    }

    function finish(status, at, reason = '') {
        progress(at);
        run.status = status;
        run.interruptionReason = reason;
    }

    // At >= the configured gap, no new sample can make the missing interval valid again.
    // Clamp the check at the recording deadline, so a delayed UI timer cannot invent
    // an interruption that happened only after the requested 30-second window.
    function checkGap(at) {
        const effective = Math.min(at, run.startMonotonicMs + durationMs);
        const previous = lastSampleMonotonicMs ?? run.startMonotonicMs;
        if (effective - previous >= gapTimeoutMs) {
            finish('interrupted', effective, run.samples.length ? 'pressure_gap' : 'no_pressure_data');
            return true;
        }
        return false;
    }

    function start(metadata) {
        if (run.status === 'recording') throw new Error('A recording is already in progress.');
        if (run.samples.length && !run.exportRequested) throw new Error('Export the previous run before starting another.');
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Run metadata is required.');
        const started = now();
        const startedIso = isoNow();
        const id = createId();
        if (!Number.isFinite(started) || !validIso(startedIso) || typeof id !== 'string' || !id) {
            throw new Error('A valid clock, timezone-aware timestamp and unique run ID are required.');
        }
        const snapshot = freeze(clone(metadata));
        run = {
            status: 'recording', runId: id, metadata: snapshot, samples: [],
            startMonotonicMs: started, startedTimestampIso: startedIso, elapsedMs: 0,
            interruptionReason: '', exportRequested: false
        };
        lastSampleMonotonicMs = null;
        return getState();
    }

    function tick() {
        if (run.status === 'recording') {
            const at = now();
            progress(at);
            if (Number.isFinite(at) && !checkGap(at) && at - run.startMonotonicMs >= durationMs) {
                finish(run.samples.length ? 'completed' : 'interrupted', at,
                    run.samples.length ? '' : 'no_pressure_data');
            }
        }
        return getState();
    }

    function receive(sample) {
        if (run.status !== 'recording') return false;
        if (!sample || !['monitor_adc', 'neck_adc', 'head_adc'].every(key =>
            typeof sample[key] === 'number' && Number.isFinite(sample[key])) ||
            !Number.isFinite(sample.receivedMonotonicMs) || !validIso(sample.timestamp_iso)) {
            tick();
            return false;
        }
        const at = sample.receivedMonotonicMs;
        const elapsedMs = at - run.startMonotonicMs;
        if (elapsedMs < run.elapsedMs || elapsedMs < 0) return false;
        if (elapsedMs > durationMs) {
            progress(at);
            if (!checkGap(at)) finish(run.samples.length ? 'completed' : 'interrupted', at,
                run.samples.length ? '' : 'no_pressure_data');
            return false;
        }
        if (checkGap(at)) return false;
        run.samples.push({
            sample_index: run.samples.length + 1,
            timestamp_iso: sample.timestamp_iso,
            elapsed_s: elapsedMs / 1000,
            monitor_adc: sample.monitor_adc,
            neck_adc: sample.neck_adc,
            head_adc: sample.head_adc
        });
        lastSampleMonotonicMs = at;
        progress(at);
        if (elapsedMs === durationMs) finish('completed', at);
        return true;
    }

    function endEarly() {
        tick();
        if (run.status === 'recording') finish('ended_early', now());
        return getState();
    }

    function disconnect() {
        // A disconnect observed while still recording must not be hidden by timer order.
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
            'age_years', 'body_height_cm', 'body_weight_kg'
        ];
        const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = run.samples.map(sample => ({
            ...run.metadata, ...sample, run_id: run.runId,
            elapsed_s: sample.elapsed_s.toFixed(6), run_status: run.status,
            data_timeout_s: gapTimeoutMs / 1000, gap_timeout_ms: gapTimeoutMs, interruption_reason: run.interruptionReason,
            time_source: 'browser_complete_pressure_message_received', pressure_unit: 'ADC'
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

    return { start, receive, tick, endEarly, disconnect, getState, csv, acknowledgeExport };
}

if (typeof module !== 'undefined' && module.exports) module.exports = createPressureRecorder;
