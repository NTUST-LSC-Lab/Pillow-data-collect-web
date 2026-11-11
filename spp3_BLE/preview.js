// Explicitly simulated transport for local review. Never included by index.html.
const demoProfile = () => ({ gender: document.getElementById('demoGender').value,
    age_years: Number(document.getElementById('demoAge').value), body_height_cm: Number(document.getElementById('demoHeight').value), body_weight_kg: Number(document.getElementById('demoWeight').value) });
const demoOperations = new Map();
let demoTarget = 'BSHS';
const demoState = { ready: true, head: 7, neck: 10, settledMonotonicMs: 0 };
const demoFiles = new Map();
window.showDirectoryPicker = async () => ({ name: '模擬預覽下載', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getFileHandle: async (name, opts) => {
        if (!opts?.create && !demoFiles.has(name)) throw Object.assign(new Error('missing'), { name: 'NotFoundError' });
        return { createWritable: async () => { let data; return { write: async value => { data = value; }, close: async () => {
            const blob = data instanceof Blob ? data : new Blob([data]); demoFiles.set(name, blob);
            const a = document.createElement('a'), url = URL.createObjectURL(blob); a.href = url; a.download = 'DEMO_' + name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
        }, abort: async () => {} }; } };
    } });
function demoReply(command) {
    const p = command.split(',');
    let response;
    if (p[0] === 'EXP02') {
        if (p[1] === 'DRAIN') {
            response = `EXP02,ACK,${p[2]},DRAIN`;
            demoOperations.set(p[2], setTimeout(() => { demoOperations.delete(p[2]); window.demoExperiment.receiveLine(`EXP02,DRAINED,${p[2]}`); }, 1800));
        } else if (p[1] === 'START') {
            response = `EXP02,ACK,${p[2]},HEIGHT_DRY`;
            demoOperations.set(p[2], setTimeout(() => {
                demoOperations.delete(p[2]);
                demoState.head = Number(p[4]); demoState.neck = Number(p[5]);
                window.demoExperiment.receiveLine(`EXP02,DONE,${p[2]},1900000,2000000,${p[4]},${p[5]}`);
            }, 1800));
        } else if (p[1] === 'STOP') { clearTimeout(demoOperations.get(p[2])); demoOperations.delete(p[2]); response = `EXP02,ERR,${p[2]},STOPPED`; }
    }
    if (p[0] === 'USER') response = 'USER,OK';
    if (p[0] === 'FEATURE') response = 'FEATURE,STATUS,LEGACY,0,POSE,1,PRED,0';
    if (p[0] === 'ANCHOR') {
        if (p[1] === 'START') { demoTarget = p[2]; response = `ANCHOR,OK,START,${demoTarget}`; }
        if (p[1] === 'STATUS') response = `ANCHOR,STATUS,DONE,${demoTarget}`;
        if (p[1] === 'GET') response = `ANCHOR,OK,${p[2]},1800000.0,2000000.0,1900000.0,7.0,10.0`;
    }
    if (p[0] === 'CLASSIFY') response = p[1] === 'GET' ? `CLASSIFY,OK,${demoPoseLabel()},${demoPoseLabel()},0.9,0.8,0.7,0.6` : `CLASSIFY,OK,${p[1]}`;
    if (response) setTimeout(() => window.demoExperiment.receiveLine(response), 30);
}
function demoPoseLabel() { return document.querySelector('[data-rapid-pose="5"]').getAttribute('aria-pressed') === 'true' ? 'BLHL' : 'BSHS'; }
window.demoExperiment = createRapidExperiment(document.getElementById('previewHost'), {
    getSystemState: () => ({ connected: true, autoHeightPossible: false }), getUserProfile: demoProfile,
    getPose5Suggestion: () => { const p = demoProfile(); return { head: Math.max(7,Math.min(14,Math.round((p.body_height_cm / 20 + p.body_weight_kg / 60 + (p.gender === 'male' ? .5 : 0)) * 2)/2)), neck: Math.max(10,Math.min(14,Math.round((p.body_height_cm/18 + p.body_weight_kg/60)*2)/2)) }; },
    heightControl: { getState: () => demoState, tick() {}, prepare: async () => { demoState.ready = true; demoState.settledMonotonicMs = performance.now(); return demoState; }, adjust: async (ch,value) => { demoState[ch === 'HEAD' ? 'head' : 'neck'] = value; demoState.settledMonotonicMs = performance.now(); } },
    sendExperimentCommand: demoReply, sendRapidCommand: demoReply, sendRapidQuery: demoReply, onChange() {}
});
setInterval(() => {
    window.demoExperiment.receivePressure({ monitor_adc: Math.round(1800000 + Math.sin(performance.now()/700)*18000), neck_adc: Math.round(2000000 + Math.sin(performance.now()/900)*13000), head_adc: Math.round(1900000 + Math.sin(performance.now()/1100)*15000), receivedMonotonicMs: performance.now(), timestamp_iso: new Date().toISOString() });
    if (window.demoExperiment.isRunning()) demoReply('CLASSIFY,GET');
}, 1000);
window.demoExperiment.refresh();
