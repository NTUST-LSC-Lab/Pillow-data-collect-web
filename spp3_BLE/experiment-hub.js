// Owns only the experiment panel; BLE, charts and system workflow stay in app.js.
function createExperimentHub(root, options = {}) {
    const selectionStorageKey = 'experimentHub.v4.currentExperiment';
    const pressureConfig = options.pressureConfig;
    const pressureId = pressureConfig?.experimentId;
    const experimentRegistry = Array.from({ length: 9 }, (_, index) => {
        const id = String(index + 1).padStart(2, '0');
        return { id, title: id === pressureId ? pressureConfig.title : `Experiment ${id}` };
    });
    const experimentStates = new Map(experimentRegistry.map(experiment => [
        experiment.id, { status: '尚未開始' }
    ]));
    let currentExperiment = experimentRegistry[0].id;
    let initialized = false;
    let nodes;
    let pressureExperiment = null;
    let pressureView = null;

    function setText(node, text) {
        if (node.textContent !== text) node.textContent = text;
    }

    function updateControls(uiState) {
        const selected = currentExperiment === pressureId && pressureExperiment;
        const state = selected ? uiState || pressureExperiment.getUiState() : null;
        const running = pressureExperiment?.isBusy() || false;
        const index = experimentRegistry.findIndex(experiment => experiment.id === currentExperiment);
        nodes.prev.disabled = running || index === 0;
        nodes.next.disabled = running || index === experimentRegistry.length - 1;
        nodes.select.disabled = running;
        setText(nodes.status, state?.statusText || '尚未開始');
        nodes.status.className = `pill ${state?.status === 'completed' || state?.running ? 'pill-ok' : state?.status === 'interrupted' || state?.status === 'ended_early' ? 'pill-error' : 'pill-pending'}`;
        setText(nodes.start, selected ? '開始記錄' : '開始實驗');
        setText(nodes.finish, selected ? '提前結束' : '結束實驗');
        nodes.start.disabled = !state || state.startDisabled;
        nodes.finish.disabled = !state || state.finishDisabled;
        nodes.export.hidden = !selected;
        nodes.export.disabled = !state || state.exportDisabled;
        setText(nodes.export, '匯出 CSV＋線圖');
        setText(nodes.hint, state?.hint || '實驗流程尚未設定，暫時無法開始或結束實驗。');
    }

    function readSavedSelection() {
        try {
            const saved = localStorage.getItem(selectionStorageKey);
            return experimentRegistry.some(experiment => experiment.id === saved)
                ? saved : experimentRegistry[0].id;
        } catch (error) {
            return experimentRegistry[0].id;
        }
    }

    function saveSelection() {
        try {
            localStorage.setItem(selectionStorageKey, currentExperiment);
        } catch (error) {
            // Selection still works when browser storage is unavailable.
        }
    }

    function renderExperiment() {
        const index = experimentRegistry.findIndex(experiment => experiment.id === currentExperiment);
        const experiment = experimentRegistry[index];
        const state = experimentStates.get(currentExperiment);

        setText(nodes.counter, `實驗 ${experiment.id} / 09`);
        setText(nodes.title, experiment.title);
        nodes.select.value = experiment.id;
        nodes.status.textContent = state.status;
        nodes.prev.disabled = index === 0;
        nodes.next.disabled = index === experimentRegistry.length - 1;

        if (currentExperiment === pressureId && pressureExperiment) {
            // Detach/reattach the same view: drafts, run samples and its Chart survive navigation.
            nodes.view.replaceChildren(pressureView);
            pressureExperiment.refresh();
        } else {
            const placeholder = document.createElement('p');
            placeholder.className = 'experiment-placeholder';
            placeholder.textContent = `${experiment.title} 的操作內容尚未設定。`;
            nodes.view.replaceChildren(placeholder);
        }
        updateControls();
    }

    function selectExperiment(id) {
        if (pressureExperiment?.isBusy()) {
            nodes.select.value = currentExperiment;
            return;
        }
        if (!experimentRegistry.some(experiment => experiment.id === id)) {
            return;
        }
        currentExperiment = id;
        renderExperiment();
        saveSelection();
    }

    function init() {
        if (!root || initialized) {
            return;
        }
        nodes = {
            prev: root.querySelector('#experimentPrev'),
            next: root.querySelector('#experimentNext'),
            counter: root.querySelector('#experimentCounter'),
            title: root.querySelector('#experimentTitle'),
            select: root.querySelector('#experimentSelect'),
            status: root.querySelector('#experimentStatus'),
            view: root.querySelector('#experimentView'),
            hint: root.querySelector('#experimentHint'),
            start: root.querySelector('#experimentStart'),
            finish: root.querySelector('#experimentFinish'),
            export: root.querySelector('#experimentExport')
        };
        if (Object.values(nodes).some(node => !node)) {
            return;
        }

        const experimentOptions = experimentRegistry.map(experiment => {
            const option = document.createElement('option');
            option.value = experiment.id;
            option.textContent = experiment.id === pressureId
                ? `Experiment ${experiment.id}：${experiment.title}` : `${experiment.title}：尚未設定`;
            return option;
        });
        nodes.select.replaceChildren(...experimentOptions);
        nodes.prev.addEventListener('click', () => {
            const index = experimentRegistry.findIndex(experiment => experiment.id === currentExperiment);
            if (index > 0) selectExperiment(experimentRegistry[index - 1].id);
        });
        nodes.next.addEventListener('click', () => {
            const index = experimentRegistry.findIndex(experiment => experiment.id === currentExperiment);
            if (index < experimentRegistry.length - 1) selectExperiment(experimentRegistry[index + 1].id);
        });
        nodes.select.addEventListener('change', () => selectExperiment(nodes.select.value));
        if (pressureConfig && experimentRegistry.some(experiment => experiment.id === pressureId)) {
            const template = document.getElementById('pressureExperimentTemplate');
            pressureView = template.content.firstElementChild.cloneNode(true);
            pressureExperiment = createPressureCollectionExperiment(pressureView, {
                gapTimeoutMs: pressureConfig.gapTimeoutMs, conditions: pressureConfig.conditions,
                getSystemState: options.getSystemState,
                heightControl: options.heightControl,
                onChange: state => { if (currentExperiment === pressureId) updateControls(state); }
            });
        }
        nodes.start.addEventListener('click', () => {
            if (currentExperiment === pressureId) pressureExperiment?.start();
        });
        nodes.finish.addEventListener('click', () => {
            if (currentExperiment === pressureId) pressureExperiment?.endEarly();
        });
        nodes.export.addEventListener('click', () => {
            if (currentExperiment === pressureId) pressureExperiment?.exportCsv();
        });
        window.addEventListener('beforeunload', event => {
            if (pressureExperiment?.needsLeaveProtection()) {
                event.preventDefault();
                event.returnValue = '';
            }
        });

        initialized = true;
        selectExperiment(readSavedSelection());
    }

    return {
        init,
        isRunning: () => pressureExperiment?.isRunning() || false,
        receivePressure: sample => pressureExperiment?.receivePressure(sample),
        onDisconnected: () => pressureExperiment?.onDisconnected()
    };
}
