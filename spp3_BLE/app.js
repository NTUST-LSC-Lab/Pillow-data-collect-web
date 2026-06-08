let serial_baud = ""; // Not used in BLE
		let serial_text = document.getElementById('serial_text');
		let serial_uint8 = document.getElementById('serial_uint8');
		let serial_status = document.getElementById('serial_status');
		let serial_buttonRequest = document.getElementById('serial_request_port');
		let serial_buttonClose = document.getElementById('serial_close_port');
		let serial_sendText = document.getElementById('serial_sendText');
		let serial_sendUint8 = document.getElementById('serial_sendUint8');
		let serial_clearText = document.getElementById('serial_clearText');
		let serial_newline = document.getElementById('serial_newline');
			let serial_syncTime = document.getElementById('syncTime');
			let db_exportData = document.getElementById('exportData');
			let serial_userSet = document.getElementById('userSet');
			let userSetAck = document.getElementById('userSetAck');
			let userDimensionSummary = document.getElementById('userDimensionSummary');
			let syncTimeAck = document.getElementById('syncTimeAck');
			let espManualStatus = document.getElementById('espManualStatus');
			let espManualAck = document.getElementById('espManualAck');
		let manualStartupHead = document.getElementById('manualStartupHead');
		let manualStartupNeck = document.getElementById('manualStartupNeck');
		let appLayout = document.getElementById('appLayout');
		let appLayoutSplitter = document.getElementById('appLayoutSplitter');
		let chartPanelBody = document.getElementById('chartPanelBody');
		let chartPanelToggle = document.getElementById('chartPanelToggle');
		let chartPanelStateBadge = document.getElementById('chartPanelStateBadge');
		let chartPanelInfo = document.getElementById('chartPanelInfo');
		let chartPanelInfoToggle = document.getElementById('chartPanelInfoToggle');
		let chartModePressure = document.getElementById('chartModePressure');
		let chartModeAll = document.getElementById('chartModeAll');
		let chartModeSummary = document.getElementById('chartModeSummary');
		let pressureChartSection = document.getElementById('pressureChartSection');
		let averageChartSection = document.getElementById('averageChartSection');
		let diffChartSection = document.getElementById('diffChartSection');
		let chartSummaryMonitor = document.getElementById('chartSummaryMonitor');
		let chartSummaryNeck = document.getElementById('chartSummaryNeck');
		let chartSummaryHead = document.getElementById('chartSummaryHead');
		let chartSummaryLast5 = document.getElementById('chartSummaryLast5');
		let chartSummaryPrev5 = document.getElementById('chartSummaryPrev5');
		let chartSummaryDiff = document.getElementById('chartSummaryDiff');
		let chartSummaryTime = document.getElementById('chartSummaryTime');
		let commandGuideBtn = document.getElementById('commandGuideBtn');
		let commandGuideDialog = document.getElementById('commandGuideDialog');
		let commandGuideClose = document.getElementById('commandGuideClose');
		const APP_LAYOUT_WIDTH_KEY = 'appLayoutLeftWidthPx';
		const APP_LAYOUT_SPLITTER_WIDTH = 12;

		// BLE Variables
		let bluetoothDevice;
		let bluetoothServer;
		let nusService;
		let rxCharacteristic; // Write
		let txCharacteristic; // Notify

		const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
		const BLE_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
		const BLE_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

		let serial_readSting = "";
		let serial_keepReading = true;
		let suppressSilentDebugResponse = false;
		let silentDebugSuppressTimer = null;

		let serial_timer;

		let serial_ready = false;
		let commandBuffer = [];

		// BLE Queue to handle sequential operations
		const bleQueue = {
			queue: [],
			isProcessing: false,
			add: function (fn) {
				this.queue.push(fn);
				this.process();
			},
			process: async function () {
				if (this.isProcessing || this.queue.length === 0) return;

				this.isProcessing = true;
				const task = this.queue.shift();

				try {
					await task();
				} catch (error) {
					console.error("BLE Queue Error:", error);
					serial_message("Queue Error: " + error.message, "red");
				} finally {
					this.isProcessing = false;
					if (this.queue.length > 0) {
						this.process();
					}
				}
			}
		};



		// Initialize the chart
		const ctx = document.getElementById('pressureChart').getContext('2d');
		const chart = new Chart(ctx, {
			type: 'line',  // Chart type (line, bar, etc.)
			data: {
				labels: [],  // Array for x-axis labels (timestamps, etc.)
				datasets: [{
					label: 'Monitor',
					data: [],  // Array for data points (sensor values)
					fill: false,
					borderColor: 'rgb(175, 71, 71)',
					borderWidth: 1,
					pointRadius: 1
				}, {
					label: 'Neck',
					data: [],
					fill: false,
					borderColor: 'rgb(5, 192, 2)',
					borderWidth: 1,
					pointRadius: 1
				}, {
					label: 'Head',
					data: [],
					fill: false,
					borderColor: 'rgb(5, 2, 192)',
					borderWidth: 1,
					pointRadius: 1
				}]
			},
			options: {
				maintainAspectRatio: false,
				scales: {
					y: {
						max: 9000000,
						min: 80000,
					},
					yAxes: [{
						ticks: {
							beginAtZero: true
						}
					}],
					x: {
						ticks: {
							font: {
								size: 8, // 設定 x 軸標籤的字體大小
							},
							autoSkip: false,
						}
					},
					xAxes: [{
						ticks: {
							fontSize: 1,
						},
						type: 'string',

						display: true,
						scaleLabel: {
							display: true,
							labelString: 'value'
						}

					}]
				}
			}
		});
		// Function to update chart scales
		document.getElementById('updateChart').addEventListener('click', () => {
			const yAxisMax = document.getElementById('yAxisMax').value;
			const yAxisMin = document.getElementById('yAxisMin').value;

			chart.options.scales.y.max = yAxisMax ? parseFloat(yAxisMax) : chart.options.scales.y.max;
			chart.options.scales.y.min = yAxisMin ? parseFloat(yAxisMin) : chart.options.scales.y.min;
			updateChartIfVisible(chart, pressureChartSection);
		});

		const ctx2 = document.getElementById('averChart').getContext('2d');
		const chart2 = new Chart(ctx2, {
			type: 'line',  // Chart type (line, bar, etc.)
			data: {
				labels: [],  // Array for x-axis labels (timestamps, etc.)
				datasets: [{

					label: 'last5',
					data: [],  // Array for data points (sensor values)
					fill: false,
					borderColor: 'rgb(175, 71, 71)',
					borderWidth: 1,
					pointRadius: 1
				}, {

					label: 'prev5',
					data: [],  // Array for data points (sensor values)
					fill: false,
					borderColor: 'rgb(175, 71, 171)',
					borderWidth: 1,
					pointRadius: 1
				}]
			},
			options: {
				maintainAspectRatio: false,
				scales: {
					y: {
						max: 1500,
						min: 500,
					},
					yAxes: [{
						ticks: {
							beginAtZero: true,
						}
					}],
					x: {
						ticks: {
							font: {
								size: 8, // 設定 x 軸標籤的字體大小
							},
							autoSkip: false,
						}
					},
					xAxes: [{
						type: 'string',

						display: true,
						scaleLabel: {
							display: true,
							labelString: 'value'
						}

					}]
				}
			}
		});

		const ctx3 = document.getElementById('diffChart').getContext('2d');
		const chart3 = new Chart(ctx3, {
			type: 'line',  // Chart type (line, bar, etc.)
			data: {
				labels: [],  // Array for x-axis labels (timestamps, etc.)
				datasets: [{
					label: 'Diff',
					data: [],  // Array for data points (sensor values)
					fill: false,
					borderColor: 'rgb(75, 71, 171)',
					borderWidth: 1,
					pointRadius: 1
				}]
			},
			options: {
				maintainAspectRatio: false,
				scales: {
					yAxes: [{
						ticks: {
							beginAtZero: true,
						}
					}],
					x: {
						ticks: {
							font: {
								size: 8, // 設定 x 軸標籤的字體大小
							},
							autoSkip: false,
						}
					},
					xAxes: [{
						type: 'string',

						display: true,
						scaleLabel: {
							display: true,
							labelString: 'value'
						}

					}]
				}
			}
		});

		let chartPanelExpanded = true;
		let activeChartMode = "pressure";

		function setNodeText(node, text) {
			if (node) {
				node.textContent = text;
			}
		}

		function getSavedChartSetting(key) {
			try {
				return localStorage.getItem(key);
			} catch (error) {
				return null;
			}
		}

		function saveChartSetting(key, value) {
			try {
				localStorage.setItem(key, value);
			} catch (error) {
				// Some file/browser contexts block localStorage; chart controls should still work.
			}
		}

		function setChartInfoExpanded(expanded, persist = true) {
			chartPanelInfo?.classList.toggle('is-collapsed', !expanded);
			if (chartPanelInfoToggle) {
				chartPanelInfoToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
				chartPanelInfoToggle.textContent = expanded ? "收合資訊" : "展開資訊";
			}
			if (persist) {
				saveChartSetting('chartPanelInfoExpanded', expanded ? '1' : '0');
			}
		}

		function isDesktopTwoPanelLayout() {
			return window.innerWidth > 960;
		}

		function getAppLayoutMinLeft() {
			return window.innerWidth > 1400 ? 460 : 380;
		}

		function getAppLayoutMinRight() {
			return chartPanelExpanded ? 360 : 300;
		}

		function clearAppLayoutCustomWidth() {
			if (!appLayout) {
				return;
			}
			appLayout.style.gridTemplateColumns = '';
		}

		function getSavedAppLayoutWidth() {
			const raw = getSavedChartSetting(APP_LAYOUT_WIDTH_KEY);
			const value = Number(raw);
			return Number.isFinite(value) ? value : null;
		}

		function saveAppLayoutWidth(value) {
			saveChartSetting(APP_LAYOUT_WIDTH_KEY, String(Math.round(value)));
		}

		function applyAppLayoutWidth(leftWidth, persist = true) {
			if (!appLayout || !isDesktopTwoPanelLayout()) {
				clearAppLayoutCustomWidth();
				return;
			}
			const totalWidth = appLayout.getBoundingClientRect().width;
			if (!Number.isFinite(totalWidth) || totalWidth <= 0) {
				return;
			}
			const minLeft = getAppLayoutMinLeft();
			const minRight = getAppLayoutMinRight();
			const maxLeft = Math.max(minLeft, totalWidth - APP_LAYOUT_SPLITTER_WIDTH - minRight);
			const safeLeft = Math.min(Math.max(leftWidth, minLeft), maxLeft);
			appLayout.style.gridTemplateColumns = `${safeLeft}px ${APP_LAYOUT_SPLITTER_WIDTH}px minmax(${minRight}px, 1fr)`;
			if (persist) {
				saveAppLayoutWidth(safeLeft);
			}
		}

		function syncAppLayoutWidth() {
			if (!appLayout) {
				return;
			}
			if (!isDesktopTwoPanelLayout()) {
				clearAppLayoutCustomWidth();
				return;
			}
			const savedWidth = getSavedAppLayoutWidth();
			if (savedWidth) {
				applyAppLayoutWidth(savedWidth, false);
				return;
			}
			const totalWidth = appLayout.getBoundingClientRect().width;
			if (!Number.isFinite(totalWidth) || totalWidth <= 0) {
				return;
			}
			const preferredRatio = chartPanelExpanded ? 0.5 : 0.58;
			applyAppLayoutWidth(totalWidth * preferredRatio, false);
		}

		function setupAppLayoutResizer() {
			if (!appLayout || !appLayoutSplitter) {
				return;
			}

			let isDragging = false;

			const stopDragging = () => {
				if (!isDragging) {
					return;
				}
				isDragging = false;
				appLayout.classList.remove('is-resizing');
				document.body.classList.remove('is-resizing');
			};

			const updateWidthFromClientX = (clientX) => {
				const rect = appLayout.getBoundingClientRect();
				const desiredLeft = clientX - rect.left - APP_LAYOUT_SPLITTER_WIDTH / 2;
				applyAppLayoutWidth(desiredLeft);
				refreshVisibleCharts();
			};

			appLayoutSplitter.addEventListener('pointerdown', (event) => {
				if (!isDesktopTwoPanelLayout()) {
					return;
				}
				isDragging = true;
				appLayout.classList.add('is-resizing');
				document.body.classList.add('is-resizing');
				appLayoutSplitter.setPointerCapture?.(event.pointerId);
				event.preventDefault();
			});

			appLayoutSplitter.addEventListener('pointermove', (event) => {
				if (!isDragging) {
					return;
				}
				updateWidthFromClientX(event.clientX);
			});

			appLayoutSplitter.addEventListener('pointerup', stopDragging);
			appLayoutSplitter.addEventListener('pointercancel', stopDragging);
			window.addEventListener('pointerup', stopDragging);
			window.addEventListener('resize', () => {
				syncAppLayoutWidth();
				refreshVisibleCharts();
			});
		}

		function updateChartModeButtons() {
			chartModePressure?.classList.toggle('primary', activeChartMode === "pressure");
			chartModeAll?.classList.toggle('primary', activeChartMode === "all");
			chartModeSummary?.classList.toggle('primary', activeChartMode === "summary");
		}

		function isChartSectionVisible(section) {
			return chartPanelExpanded && Boolean(section?.open);
		}

		function updateChartIfVisible(chartInstance, section) {
			if (isChartSectionVisible(section)) {
				chartInstance.update('none');
			}
		}

		function refreshVisibleCharts() {
			requestAnimationFrame(() => {
				[
					{ instance: chart, section: pressureChartSection },
					{ instance: chart2, section: averageChartSection },
					{ instance: chart3, section: diffChartSection }
				].forEach(({ instance, section }) => {
					if (isChartSectionVisible(section)) {
						instance.resize();
						instance.update('none');
					}
				});
			});
		}

		function setChartPanelExpanded(expanded, persist = true) {
			chartPanelExpanded = expanded;
			chartPanelBody?.classList.toggle('is-collapsed', !expanded);
			appLayout?.classList.toggle('charts-collapsed', !expanded);
			if (chartPanelToggle) {
				chartPanelToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
				chartPanelToggle.textContent = expanded ? "收合線圖" : "展開線圖";
			}
			if (chartPanelStateBadge) {
				chartPanelStateBadge.textContent = expanded ? "展開中" : "摘要";
				chartPanelStateBadge.classList.toggle('pill-ok', expanded);
				chartPanelStateBadge.classList.toggle('pill-pending', !expanded);
			}
			if (persist) {
				saveChartSetting('chartPanelExpanded', expanded ? '1' : '0');
			}
			syncAppLayoutWidth();
			if (expanded) {
				refreshVisibleCharts();
			}
		}

		function applyChartBodyMode(mode) {
			if (!chartPanelBody) {
				return;
			}
			chartPanelBody.classList.remove('mode-pressure', 'mode-all', 'mode-summary');
			chartPanelBody.classList.add(`mode-${mode}`);
		}

		function setChartMode(mode, persist = true) {
			activeChartMode = mode;
			if (mode === "all") {
				applyChartBodyMode("all");
				setChartPanelExpanded(true, persist);
				if (pressureChartSection) pressureChartSection.open = true;
				if (averageChartSection) averageChartSection.open = true;
				if (diffChartSection) diffChartSection.open = true;
			} else if (mode === "summary") {
				applyChartBodyMode("summary");
				setChartPanelExpanded(false, persist);
			} else {
				activeChartMode = "pressure";
				applyChartBodyMode("pressure");
				setChartPanelExpanded(true, persist);
				if (pressureChartSection) pressureChartSection.open = true;
				if (averageChartSection) averageChartSection.open = false;
				if (diffChartSection) diffChartSection.open = false;
			}
			updateChartModeButtons();
			if (persist) {
				saveChartSetting('chartMode', activeChartMode);
			}
			refreshVisibleCharts();
		}

		function formatChartSummaryValue(value, digits = 2) {
			if (value === null || value === undefined || value === "") {
				return "-";
			}
			const numericValue = Number(value);
			return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : "-";
		}

		function updateChartSummary() {
			const summaryValues = [
				monitorState?.pressure.monitor,
				monitorState?.pressure.neck,
				monitorState?.pressure.head,
				last5pointAvg,
				prev5pointAvg,
				differential
			];
			const hasData = summaryValues.some(value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
			setNodeText(chartSummaryMonitor, formatChartSummaryValue(monitorState?.pressure.monitor));
			setNodeText(chartSummaryNeck, formatChartSummaryValue(monitorState?.pressure.neck));
			setNodeText(chartSummaryHead, formatChartSummaryValue(monitorState?.pressure.head));
			setNodeText(chartSummaryLast5, formatChartSummaryValue(last5pointAvg));
			setNodeText(chartSummaryPrev5, formatChartSummaryValue(prev5pointAvg));
			setNodeText(chartSummaryDiff, formatChartSummaryValue(differential));
			setNodeText(chartSummaryTime, hasData ? new Date().toLocaleTimeString() : "-");
		}

		chartPanelToggle?.addEventListener('click', function () {
			if (chartPanelExpanded) {
				setChartMode("summary");
				return;
			}
			const restoreMode = activeChartMode === "summary" ? "pressure" : activeChartMode;
			setChartMode(restoreMode);
		});

		chartPanelInfoToggle?.addEventListener('click', function () {
			const expanded = chartPanelInfoToggle.getAttribute('aria-expanded') !== 'true';
			setChartInfoExpanded(expanded);
		});

		chartModePressure?.addEventListener('click', () => setChartMode("pressure"));
		chartModeAll?.addEventListener('click', () => setChartMode("all"));
		chartModeSummary?.addEventListener('click', () => setChartMode("summary"));

		[pressureChartSection, averageChartSection, diffChartSection].forEach(section => {
			section?.addEventListener('toggle', refreshVisibleCharts);
		});

		const savedChartMode = getSavedChartSetting('chartMode');
		const savedChartExpanded = getSavedChartSetting('chartPanelExpanded');
		const savedChartInfoExpanded = getSavedChartSetting('chartPanelInfoExpanded');
		setChartMode(savedChartMode === "all" || savedChartMode === "summary" ? savedChartMode : "pressure", false);
		if (savedChartExpanded === '0') {
			setChartMode("summary", false);
		}
		setChartInfoExpanded(savedChartInfoExpanded !== '0', false);

		// indexeddb
		// indexedDB操作模組
		const DBModule = (function () {
			let dbName;
			const storeName = 'dataStore';
			let db;

			function initDB(timestamp) {
				dbName = `MyDataDB_${timestamp}`;
				return openDB();
			}

			function openDB() {
				return new Promise((resolve, reject) => {
					const request = indexedDB.open(dbName, 1);

					request.onerror = event => reject(`Database error: ${event.target.error}`);

					request.onsuccess = event => {
						db = event.target.result;
						resolve(db);
					};

					request.onupgradeneeded = event => {
						const db = event.target.result;
						db.createObjectStore(storeName, { keyPath: 'timestamp' });
					};
				});
			}

			function saveData(data, command) {
				return new Promise((resolve, reject) => {
					if (!db) {
						reject('Database not initialized');
						return;
					}

					const transaction = db.transaction([storeName], 'readwrite');
					const store = transaction.objectStore(storeName);

					const timestamp = new Date().toISOString();
					const dataWithTimestamp = { timestamp, values: data, command: command };

					const request = store.add(dataWithTimestamp);

					request.onerror = event => reject(`Error saving data: ${event.target.error}`);
					request.onsuccess = event => resolve(event.target.result);
				});
			}

			function getAllData() {
				return new Promise((resolve, reject) => {
					if (!db) {
						reject('Database not initialized');
						return;
					}

					const transaction = db.transaction([storeName], 'readonly');
					const store = transaction.objectStore(storeName);
					const request = store.getAll();

					request.onerror = event => reject(`Error getting data: ${event.target.error}`);
					request.onsuccess = event => resolve(event.target.result);
				});
			}

			function exportToCSV() {
				return getAllData().then(data => {
					let csvContent = 'timestamp,pressure1,pressure2,pressure3,differential,last5pointAvg,prev5pointAvg,state,onoff_event,predict_Pose,Pose_event,command\n';

						data.forEach(item => {
							const commandStr = item.command ? `"${item.command.replace(/"/g, '""')}"` : "";
							const row = [formatLocalTimestamp(item.timestamp), ...item.values, commandStr].join(',');
							csvContent += row + '\n';
						});

					// const txtContent = serial_status.innerHTML.replace(/<[^>]*>/g, ''); // Remove HTML tags
					const txtContent = serial_status.innerHTML
						.replace(/<br\s*\/?>/gi, '\n') // 將 <br> 和 <br/> 轉換成換行符號
						.replace(/<[^>]*>/g, ''); // 移除剩餘的 HTML 標籤

					const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
					const txtBlob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });

					const url = URL.createObjectURL(blob);
					const txtUrl = URL.createObjectURL(txtBlob);

					const link = document.createElement('a');
					link.setAttribute('href', url);
					link.setAttribute('download', `data_export_${dbName}.csv`);
					link.style.visibility = 'hidden';

					const txtLink = document.createElement('a');
					txtLink.setAttribute('href', txtUrl);
					txtLink.setAttribute('download', `data_export_${dbName}.txt`);
					txtLink.style.visibility = 'hidden';

					document.body.appendChild(link);
					document.body.appendChild(txtLink);
					link.click();
					txtLink.click();
					document.body.removeChild(link);
					document.body.removeChild(txtLink);
				});
			}

			return {
				init: initDB,
				save: saveData,
				getAll: getAllData,
				exportCSV: exportToCSV
			};
		})();

		const startTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
		DBModule.init(startTimestamp).then(() => {
			console.log('Database ready');
		}).catch(error => {
			console.error('Database initialization error:', error);
		});

		const LOG_SUCCESS_GREEN = "#c8ffd7";

		// BLE Notifications Handle
		function handleNotifications(event) {
			let value = event.target.value;
			let a = [];
			for (let i = 0; i < value.byteLength; i++) {
				a.push(String.fromCharCode(value.getUint8(i)));
			}
			let str = a.join("");

			// Accumulate string to handle fragmented packets
			serial_readSting += str;

			if (serial_readSting.includes("\n")) {
				// Process complete lines
				let lines = serial_readSting.split("\n");
				// The last part might be incomplete, save it for next time
				serial_readSting = lines.pop();

				for (let line of lines) {
						line = line.trim();
						if (line) {
							clearTimeout(serial_timer);
							console.log(line);
							const ackLine = line.toLowerCase();
							if (ackLine.startsWith("synctime")) {
								setSyncTimeAck(`已同步 (${formatAckTime()})`, "ok");
							}
							const hideLine = suppressSilentDebugResponse;
							serial_message(line, LOG_SUCCESS_GREEN, !hideLine);
							if (hideLine && line.includes("pre_stable_label=")) {
							suppressSilentDebugResponse = false;
							if (silentDebugSuppressTimer) {
								clearTimeout(silentDebugSuppressTimer);
								silentDebugSuppressTimer = null;
							}
						}
					}
				}
			} else {
				// Optional: Timeout to print partial data if no newline comes for a while
				clearTimeout(serial_timer);
				serial_timer = setTimeout(function () {
					if (serial_readSting != "") {
						serial_message(serial_readSting, LOG_SUCCESS_GREEN, !suppressSilentDebugResponse);
						serial_readSting = "";
					}
				}, 100);
			}
		}

		var chart_data_count = 0;
		function fillChartArray() {

			for (var i = 0; i < 50; i++) {
				chart.data.labels.push("");
				chart.data.datasets[0].data.push(0);
				chart.data.datasets[1].data.push(0);
				chart.data.datasets[2].data.push(0);
				chart2.data.labels.push("");
				chart2.data.datasets[0].data.push(0);
				chart2.data.datasets[1].data.push(0);
				chart3.data.labels.push("");
				chart3.data.datasets[0].data.push(0);
			}
			chart_data_count = 50;
		}

		serial_buttonRequest.addEventListener('click', async () => {
			try {
				if (!navigator.bluetooth) {
					serial_message("Web Bluetooth is not available in this browser.", "red");
					return;
				}

				serial_message("Requesting Bluetooth Device...", "orange");
				bluetoothDevice = await navigator.bluetooth.requestDevice({
					filters: [{ services: [BLE_SERVICE_UUID] }]
				});

				bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

				serial_message("Connecting to GATT Server...", "orange");
				bluetoothServer = await bluetoothDevice.gatt.connect();

				serial_message("Getting Service...", "orange");
				nusService = await bluetoothServer.getPrimaryService(BLE_SERVICE_UUID);

				serial_message("Getting Characteristics...", "orange");
				rxCharacteristic = await nusService.getCharacteristic(BLE_RX_UUID);
				txCharacteristic = await nusService.getCharacteristic(BLE_TX_UUID);

				serial_message("Starting Notifications...", "orange");
				await txCharacteristic.startNotifications();
				txCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

				serial_message("Connected!", "blue");

				// Initialize logic
				sendCommand("EXPERIMENT,ON\n");
				serial_ready = true;
				sendModeCommands(controlMode);
				fillChartArray();

			} catch (error) {
				console.log('Argh! ' + error);
				serial_message("Error: " + error, "red");
			}
		});

		function onDisconnected(event) {
			const device = event.target;
			serial_message(`Device ${device.name} is disconnected.`, "red");
			serial_ready = false;
		}

		serial_buttonClose.addEventListener('click', async () => {
			if (bluetoothDevice && bluetoothDevice.gatt.connected) {
				bluetoothDevice.gatt.disconnect();
				serial_message("Disconnecting...", "orange");
			} else {
				serial_message("Not connected", "red");
			}
		});

		serial_sendText.addEventListener('click', async () => {
			serial_sendUint8.disabled = true;
			if (rxCharacteristic) {
				try {
					serial_newline.value = serial_newline.value.replace(/\\n/g, "\n");
					serial_newline.value = serial_newline.value.replace(/\\r/g, "\r");
					var msg = serial_text.value + serial_newline.value;
					if (!serial_newline.value) {
						msg += "\n";
					}
					logCommand(msg);
					serial_message(msg, "orange");
					serial_text.value = "";

					let encoder = new TextEncoder();
					bleQueue.add(async () => {
						await rxCharacteristic.writeValue(encoder.encode(msg));
					});
				} catch (error) {
					serial_message(error.message, "red");
				}
			}
		});

		serial_sendUint8.addEventListener('click', async () => {
			serial_sendText.disabled = true;
			if (rxCharacteristic) {
				try {
					serial_message(serial_uint8.value, "orange");
					var intArray = serial_uint8.value.split(",");
					// msg = String.fromCharCode.apply(null, intArray); // msg not really used here except log
					logCommand("Uint8: " + serial_uint8.value);
					serial_uint8.value = "";

					const data = new Uint8Array(intArray);
					bleQueue.add(async () => {
						await rxCharacteristic.writeValue(data);
					});
				} catch (error) {
					serial_message(error.message, "red");
				}
			}
		});

		serial_clearText.addEventListener('click', async () => {
			serial_status.innerHTML = "";
		});

		commandGuideBtn?.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			if (!commandGuideDialog) {
				return;
			}
			if (typeof commandGuideDialog.showModal === "function") {
				commandGuideDialog.showModal();
			} else {
				commandGuideDialog.setAttribute('open', '');
			}
		});

		commandGuideClose?.addEventListener('click', function () {
			if (!commandGuideDialog) {
				return;
			}
			if (typeof commandGuideDialog.close === "function") {
				commandGuideDialog.close();
			} else {
				commandGuideDialog.removeAttribute('open');
			}
		});

		commandGuideDialog?.addEventListener('click', function (event) {
			if (event.target === commandGuideDialog) {
				commandGuideDialog.close();
			}
		});

			serial_syncTime.addEventListener('click', async () => {
				const now = Math.floor(Date.now() / 1000); // 生成UNIX時間戳
				const utcString = now;//now.toISOString(); // 生成UTC時間字串
				if (rxCharacteristic) {
					try {
						var msg = "synctime," + utcString;
						logCommand(msg);
						serial_message(msg, "orange");
						serial_text.value = "";
						queueBleWrite(normalizeCommand(msg));
						setSyncTimeAck("同步指令已送出，等待 ESP32 回覆", "pending");
					} catch (error) {
						setSyncTimeAck(`送出失敗：${error.message}`, "error");
						serial_message(error.message, "red");
					}
				} else {
					setSyncTimeAck("尚未連線 BLE，指令未送出", "error");
				}
			});

		serial_userSet.addEventListener('click', async () => {
			if (rxCharacteristic) {
				try {
					let gender = document.querySelector('input[name="gender"]:checked').value === 'female' ? '0' : '1';
					let age = document.getElementById('age').value;
					let height = document.getElementById('height').value;
					let weight = document.getElementById('weight').value;
					let infoString = `${gender},${age},${height},${weight}`;
					setUserDimensionSummaryPending();

						var msg = "USER," + infoString;
						logCommand(msg);
						serial_message(msg, "orange");
						serial_text.value = "";
						queueBleWrite(normalizeCommand(msg));
						setUserSetAck("設定指令已送出，等待 ESP32 回覆", "pending");
					} catch (error) {
						setUserSetAck(`送出失敗：${error.message}`, "error");
						serial_message(error.message, "red");
					}
				} else {
					setUserSetAck("尚未連線 BLE，指令未送出", "error");
				}
			});

		db_exportData.addEventListener('click', async () => {
			DBModule.exportCSV().then(() => {
				console.log('CSV exported');
			}).catch(error => {
				console.error('Export error:', error);
			});
		});

		function isValidFloatString3(inputString) {
			// Regular expression to match a valid floating-point number
			const floatRegex = /^-?\d+\.?\d*$/;

			// Split the input string into an array of strings by spaces or commas, filter out empty strings
			const dataPoints = inputString.split(/[\s,]+/).filter(Boolean);

			// Check if the number of data points is exactly 3
			if (dataPoints.length !== 3) {
				return false;
			}

			// Check if each data point is a valid floating-point number
			return dataPoints.every(dataPoint => floatRegex.test(dataPoint));
		}

		function isValidData7(inputString) {
			// Split by spaces or commas, filter empty strings
			const dataPoints = inputString.split(/[\s,]+/).filter(Boolean);

			if (dataPoints.length !== 7) {
				return false;
			}

			// Validate all are numbers
			return dataPoints.every(point => !isNaN(parseFloat(point)));
		}

		// P指令回傳: 三組壓力值的浮點數 分別代表: 監測 頸部 頭部
		// I指令回傳: 七組內部變數值 分別代表:
		//         differential, state, onoff_event, last5pointAvg, prev5pointAvg, predict_Pose, Pose_event
		// 資料庫欄位:
		//         pressure1, pressure2, pressure3, differential, last5pointAvg, prev5pointAvg, state, onoff_event, predict_Pose, Pose_event
		let pressure1, pressure2, pressure3, differential, state, onoff_event, last5pointAvg, prev5pointAvg, predict_Pose, Pose_event;

		const SystemState = [
			"INIT",
			"DRAIN_ALL",
			"FILL_MONITOR",
			"FILL_NECK",
			"FILL_HEAD",
			"STANDBY",
			"ADJUSTING_HEIGHT",
			"RESET_MONITOR",
			"REFILL_MONITOR",
			"MANUAL_CONTROL"
		];

		let debugDataBuffer = ""; // Static variable to hold incomplete debug data
		let parsedData = {};
		const WORKFLOW = {
			UNCALIBRATED: "未校正",
			SUPINE: "仰躺校正中",
			SIDE: "側躺校正中",
			CLASSIFYING: "分類中",
			AUTOCONTROL: "自動控制中"
		};

		const workflowStateBadge = document.getElementById('workflowStateBadge');
		const anchorBshsStatus = document.getElementById('anchorBshsStatus');
		const anchorBlhlStatus = document.getElementById('anchorBlhlStatus');
		const anchorStateValue = document.getElementById('anchorStateValue');
		const anchorTargetValue = document.getElementById('anchorTargetValue');
		const anchorBshsValue = document.getElementById('anchorBshsValue');
		const anchorBlhlValue = document.getElementById('anchorBlhlValue');
		const poseSmoothLabel = document.getElementById('poseSmoothLabel');
		const poseRawLabel = document.getElementById('poseRawLabel');
		const poseUpdateTime = document.getElementById('poseUpdateTime');
		const scoreEValue = document.getElementById('scoreEValue');
		const scoreSupineValue = document.getElementById('scoreSupineValue');
		const scoreSideMeanValue = document.getElementById('scoreSideMeanValue');
		const scorePmRuleValue = document.getElementById('scorePmRuleValue');
		const predStageValue = document.getElementById('predStageValue');
		const predNeckDelta = document.getElementById('predNeckDelta');
		const predHeadDelta = document.getElementById('predHeadDelta');
		const monitorPressureValue = document.getElementById('monitorPressureValue');
		const neckPressureValue = document.getElementById('neckPressureValue');
		const headPressureValue = document.getElementById('headPressureValue');
		const headHeightValue = document.getElementById('headHeightValue');
		const neckHeightValue = document.getElementById('neckHeightValue');
		const monitorUpdateTime = document.getElementById('monitorUpdateTime');
		const heightPressureLog = document.getElementById('heightPressureLog');
		const monitorClearLog = document.getElementById('monitorClearLog');
		let captureWizardModule = null;

		let workflowState = WORKFLOW.UNCALIBRATED;
		let anchorDone = { BSHS: false, BLHL: false };
		let anchorDataByTarget = { BSHS: null, BLHL: null };
		let anchorPollingTarget = "NONE";
		let pendingAnchorTarget = null;
		let classifyStarted = false;
		let classifyStartRequested = false;
		let predEnabled = false;
		let predStartRequested = false;
		let classifyStartAttempts = 0;
		let predStartAttempts = 0;
		let classifyStartRetryTimer = null;
		let predStartRetryTimer = null;
		let sideStandbyWatchActive = false;
		let sideStandbyConsecutive = 0;
		let sideStandbyTimer = null;
		let awaitingInitMode = null;
		let lastHeightDebugPollMs = 0;
		const HEIGHT_DEBUG_POLL_MS = 10000;
		const AUTO_START_MAX_ATTEMPTS = 3;
		const AUTO_START_RETRY_MS = 2500;
		const CONTROL_MODE = {
			MANUAL: "manual",
			AUTO: "auto"
		};
		const HEIGHT_LIMITS = {
			HEAD: { min: 7, max: 16 },
			NECK: { min: 10, max: 16 }
		};
		const HEIGHT_STEP = 0.5;
		let controlMode = CONTROL_MODE.MANUAL;
		let requestedControlMode = CONTROL_MODE.MANUAL;

		const controlModeBadge = document.getElementById('controlModeBadge');
		const controlModeHint = document.getElementById('controlModeHint');
		const controlModeAck = document.getElementById('controlModeAck');
		const manualModeBtn = document.getElementById('manualModeBtn');
		const autoModeBtn = document.getElementById('autoModeBtn');

		function getHeightLimits(channel) {
			return HEIGHT_LIMITS[channel] || HEIGHT_LIMITS.HEAD;
		}

		function snapHeightValue(value) {
			return Math.round(Number(value) / HEIGHT_STEP) * HEIGHT_STEP;
		}

		function clampHeightValue(value, channel) {
			const limits = getHeightLimits(channel);
			const numericValue = Number(value);
			const fallback = limits.min;
			const snapped = snapHeightValue(Number.isFinite(numericValue) ? numericValue : fallback);
			return Math.max(limits.min, Math.min(limits.max, snapped));
		}

		function formatHeightValue(value) {
			return Number(value).toFixed(1);
		}

		function setHeightInputValue(inputNode, value, channel) {
			if (!inputNode) {
				return "";
			}
			const next = formatHeightValue(clampHeightValue(value, channel));
			inputNode.value = next;
			return next;
		}

		function configureHeightInput(inputNode, channel) {
			if (!inputNode) {
				return;
			}
			const limits = getHeightLimits(channel);
			inputNode.min = String(limits.min);
			inputNode.max = String(limits.max);
			inputNode.step = String(HEIGHT_STEP);
			setHeightInputValue(inputNode, inputNode.value, channel);
			inputNode.addEventListener('change', () => {
				setHeightInputValue(inputNode, inputNode.value, channel);
			});
		}

		function setModeUi(nextMode) {
			controlMode = nextMode;
			const isAuto = controlMode === CONTROL_MODE.AUTO;
			if (controlModeBadge) {
				controlModeBadge.textContent = isAuto ? "自動模式" : "手動模式";
				controlModeBadge.classList.toggle('pill-ok', isAuto);
				controlModeBadge.classList.toggle('pill-pending', !isAuto);
			}
			if (manualModeBtn) {
				manualModeBtn.classList.toggle('primary', !isAuto);
				manualModeBtn.classList.toggle('mode-active', !isAuto);
			}
			if (autoModeBtn) {
				autoModeBtn.classList.toggle('primary', isAuto);
				autoModeBtn.classList.toggle('mode-active', isAuto);
			}
			safeSetText(
				controlModeHint,
				isAuto ? "自動模式會在 BSHS 與 BLHL 校正完成後啟動分類與高度自動調整。" : "手動模式不會自動啟動分類與高度自動調整。"
			);
		}

		function setModeAck(message, status = "") {
			if (!controlModeAck) {
				return;
			}
			controlModeAck.textContent = `模式指令狀態：${message}`;
			controlModeAck.classList.remove('pending', 'ok', 'error');
			if (status) {
				controlModeAck.classList.add(status);
			}
		}

		function setUserSetAck(message, status = "") {
			if (!userSetAck) {
				return;
			}
			userSetAck.textContent = `使用者資料狀態：${message}`;
			userSetAck.classList.remove('pending', 'ok', 'error');
			if (status) {
				userSetAck.classList.add(status);
			}
		}

		function setSyncTimeAck(message, status = "") {
			if (!syncTimeAck) {
				return;
			}
			syncTimeAck.textContent = `時間同步狀態：${message}`;
			syncTimeAck.classList.remove('pending', 'ok', 'error');
			if (status) {
				syncTimeAck.classList.add(status);
			}
		}

		function setEspManualUi(active, message, status = "") {
			if (espManualStatus) {
				espManualStatus.textContent = active ? "ESP32 Manual" : "一般流程";
				espManualStatus.classList.toggle('pill-ok', active);
				espManualStatus.classList.toggle('pill-pending', !active);
			}
			if (espManualAck && message) {
				espManualAck.textContent = `ESP32 Manual 狀態：${message}`;
				espManualAck.classList.remove('pending', 'ok', 'error');
				if (status) {
					espManualAck.classList.add(status);
				}
			}
		}

		function sendEspManualCommand(command, pendingMessage) {
			if (!rxCharacteristic || !serial_ready) {
				setEspManualUi(false, "尚未連線 BLE，指令未送出", "error");
				return;
			}
			setEspManualUi(!command.startsWith("MANUAL,STARTUP"), pendingMessage || "指令已送出，等待 ESP32 回覆", "pending");
			sendCommand(command);
		}

		function formatAckTime() {
			return new Date().toLocaleTimeString();
		}

		function toValidDate(input) {
			if (input instanceof Date) {
				return Number.isNaN(input.getTime()) ? null : input;
			}
			const parsed = new Date(input);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		function formatLocalTimeLabel(input) {
			const date = toValidDate(input);
			if (!date) return "";
			return date.getHours().toString().padStart(2, '0') + ':' +
				date.getMinutes().toString().padStart(2, '0') + ':' +
				date.getSeconds().toString().padStart(2, '0');
		}

		function formatLocalTimestamp(input) {
			const date = toValidDate(input);
			if (!date) return input ?? "";
			return date.getFullYear().toString().padStart(4, '0') + '-' +
				(date.getMonth() + 1).toString().padStart(2, '0') + '-' +
				date.getDate().toString().padStart(2, '0') + 'T' +
				date.getHours().toString().padStart(2, '0') + ':' +
				date.getMinutes().toString().padStart(2, '0') + ':' +
				date.getSeconds().toString().padStart(2, '0') + '.' +
				date.getMilliseconds().toString().padStart(3, '0');
		}

		function sendModeCommands(nextMode) {
			requestedControlMode = nextMode;
			setModeUi(nextMode);
			if (!rxCharacteristic || !serial_ready) {
				setModeAck("尚未連線 BLE，指令未送出", "error");
				return;
			}
			setModeAck(`${nextMode === CONTROL_MODE.AUTO ? "自動模式" : "手動模式"}指令已送出，等待 ESP32 回覆`, "pending");
			if (nextMode === CONTROL_MODE.AUTO) {
				sendCommand("FEATURE,POSE,ON");
				sendCommand("FEATURE,PRED,ON");
				sendCommand("FEATURE,STATUS");
				maybeStartClassification();
				return;
			}
			sendCommand("PRED,STOP");
			sendCommand("CLASSIFY,STOP");
			sendCommand("FEATURE,PRED,OFF");
			sendCommand("FEATURE,STATUS");
			resetAutoControlStartState();
			if (anchorDone.BSHS && anchorDone.BLHL) {
				setWorkflowState(WORKFLOW.UNCALIBRATED);
			}
		}

		function safeSetText(el, text) {
			if (el) {
				el.textContent = text;
			}
		}

		function formatWidthMm(value) {
			const numericValue = Number(value);
			return Number.isFinite(numericValue) ? `${Math.trunc(numericValue)} mm` : "- mm";
		}

		function setUserDimensionSummaryPending() {
			safeSetText(userDimensionSummary, "目前估算尺寸：讀取 ESP32 中...");
		}

		function renderUserDimensionSummary(headWidth, neckWidth, shoulderWidth) {
			safeSetText(
				userDimensionSummary,
				`目前估算尺寸：頭寬 ${formatWidthMm(headWidth)} ｜ 頸寬 ${formatWidthMm(neckWidth)} ｜ 肩寬 ${formatWidthMm(shoulderWidth)}`
			);
		}

		function updateUserDimensionsFromParsed() {
			const headWidth = Number(parsedData.head_width);
			const neckWidth = Number(parsedData.neck_width);
			const shoulderWidth = Number(parsedData.shoulder_width);
			if (!Number.isFinite(headWidth) || !Number.isFinite(neckWidth) || !Number.isFinite(shoulderWidth)) {
				return;
			}
			if (headWidth <= 0 || neckWidth <= 0 || shoulderWidth <= 0) {
				return;
			}
			renderUserDimensionSummary(headWidth, neckWidth, shoulderWidth);
		}

		function requestSilentDebugSnapshot() {
			suppressSilentDebugResponse = true;
			if (silentDebugSuppressTimer) {
				clearTimeout(silentDebugSuppressTimer);
			}
			silentDebugSuppressTimer = setTimeout(() => {
				suppressSilentDebugResponse = false;
				silentDebugSuppressTimer = null;
			}, 3500);
			sendSilentCommand("DEBUG");
		}

		function setWorkflowState(nextState) {
			workflowState = nextState;
			safeSetText(workflowStateBadge, nextState);
		}

		function applyAnchorBadge(el, done) {
			if (!el) {
				return;
			}
			el.classList.remove('pill-ok', 'pill-pending');
			el.classList.add(done ? 'pill-ok' : 'pill-pending');
			el.textContent = done ? "完成" : "未完成";
		}

		function refreshAnchorBadgeUI() {
			applyAnchorBadge(anchorBshsStatus, anchorDone.BSHS);
			applyAnchorBadge(anchorBlhlStatus, anchorDone.BLHL);
		}

		function renderAnchorValue(target) {
			const data = anchorDataByTarget[target];
			if (!data) {
				return;
			}
			const text = `pm:${data.pm} pn:${data.pn} ph:${data.ph} head:${data.head} neck:${data.neck}`;
			if (target === "BSHS") {
				safeSetText(anchorBshsValue, text);
			}
			if (target === "BLHL") {
				safeSetText(anchorBlhlValue, text);
			}
		}

		function enableSideCalibrationControls(enabled) {
			const ids = ['sideHeadInput', 'sideNeckInput', 'sideHeadPlus', 'sideHeadMinus', 'sideNeckPlus', 'sideNeckMinus', 'confirmSideCalibAdjustBtn'];
			ids.forEach(id => {
				const node = document.getElementById(id);
				if (node) {
					node.disabled = !enabled;
				}
			});
		}

		function stopSideStandbyWatch() {
			sideStandbyWatchActive = false;
			sideStandbyConsecutive = 0;
			if (sideStandbyTimer) {
				clearTimeout(sideStandbyTimer);
				sideStandbyTimer = null;
			}
		}

		function formatDelta(currentValue, targetValue) {
			const current = Number(currentValue);
			const target = Number(targetValue);
			if (!isFinite(current) || !isFinite(target)) {
				return "-";
			}
			const diff = target - current;
			const sign = diff > 0 ? "+" : "";
			return `${sign}${diff.toFixed(1)}`;
		}

		const monitorState = {
			pressure: { monitor: null, neck: null, head: null },
			height: { targetHead: null, targetNeck: null, currentHead: null, currentNeck: null }
		};
		updateChartSummary();

		function formatPressureValue(value) {
			const numericValue = Number(value);
			return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "-";
		}

		function formatHeightMonitorValue(target, current) {
			const targetText = Number.isFinite(Number(target)) ? `${Number(target).toFixed(1)} cm` : "-";
			const currentText = Number.isFinite(Number(current)) ? `${Number(current).toFixed(1)} cm` : "-";
			return `目標 ${targetText} / 目前 ${currentText}`;
		}

		function updateMonitorDisplay() {
			safeSetText(monitorPressureValue, formatPressureValue(monitorState.pressure.monitor));
			safeSetText(neckPressureValue, formatPressureValue(monitorState.pressure.neck));
			safeSetText(headPressureValue, formatPressureValue(monitorState.pressure.head));
			safeSetText(headHeightValue, formatHeightMonitorValue(monitorState.height.targetHead, monitorState.height.currentHead));
			safeSetText(neckHeightValue, formatHeightMonitorValue(monitorState.height.targetNeck, monitorState.height.currentNeck));
			safeSetText(monitorUpdateTime, new Date().toLocaleTimeString());
			if (captureWizardModule) {
				captureWizardModule.refreshLiveMetrics();
			}
		}

		function appendMonitorLog(message) {
			if (!heightPressureLog) {
				return;
			}
			const safeMsg = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
			heightPressureLog.insertAdjacentHTML('beforeend', `${safeMsg}<br>`);
			const scrollControl = document.querySelector('input[name="monitorScrollControl"]:checked')?.value || "auto";
			if (scrollControl === "auto") {
				heightPressureLog.scrollTop = heightPressureLog.scrollHeight;
			}
		}

		function updatePressureMonitor(values) {
			monitorState.pressure.monitor = values[0];
			monitorState.pressure.neck = values[1];
			monitorState.pressure.head = values[2];
			updateMonitorDisplay();
			appendMonitorLog(
				`${new Date().toLocaleTimeString()} 壓力 Monitor=${formatPressureValue(values[0])} Neck=${formatPressureValue(values[1])} Head=${formatPressureValue(values[2])}`
			);
		}

		function updateHeightMonitorFromValues(source, targetHead, targetNeck, currentHead, currentNeck) {
			if (Number.isFinite(Number(targetHead))) {
				monitorState.height.targetHead = Number(targetHead);
			}
			if (Number.isFinite(Number(targetNeck))) {
				monitorState.height.targetNeck = Number(targetNeck);
			}
			if (Number.isFinite(Number(currentHead))) {
				monitorState.height.currentHead = Number(currentHead);
			}
			if (Number.isFinite(Number(currentNeck))) {
				monitorState.height.currentNeck = Number(currentNeck);
			}
			updateMonitorDisplay();
			appendMonitorLog(
				`${new Date().toLocaleTimeString()} 高度 ${source} Head=${formatHeightMonitorValue(monitorState.height.targetHead, monitorState.height.currentHead)} Neck=${formatHeightMonitorValue(monitorState.height.targetNeck, monitorState.height.currentNeck)}`
			);
		}

		function createCaptureWizardModule() {
			const POSE_ORDER = ["BSHS", "BSHL", "BLHLB", "BLHLC", "BLHL"];
			const TOTAL_REPEATS = 5;
			const DEFAULT_CAPTURE_TOTAL = 26;
			const CAPTURE_FILE_EXTENSION = "svg";
			const CAPTURE_SAFE_FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif';
			const state = {
				folderHandle: null,
				folderDisplayPath: "",
				subjectId: "",
				aplPose: "",
				steps: [],
				currentStepIndex: 0,
				lastCompletedStepIndex: -1,
				lastSavedFileName: "",
				retakeStepIndex: null,
				configCollapsed: false
			};
			const dom = {};
			const supportsFileSystemAccess = typeof window.showDirectoryPicker === "function";

			function cacheDom() {
				dom.subjectSelect = document.getElementById('captureSubjectSelect');
				dom.aplSelect = document.getElementById('captureAplSelect');
				dom.folderBtn = document.getElementById('captureFolderBtn');
				dom.folderPath = document.getElementById('captureFolderPath');
				dom.configBody = document.getElementById('captureConfigBody');
				dom.configSummary = document.getElementById('captureConfigSummary');
				dom.configEditBtn = document.getElementById('captureConfigEditBtn');
				dom.summarySubject = document.getElementById('captureSummarySubject');
				dom.summaryApl = document.getElementById('captureSummaryApl');
				dom.summaryFolder = document.getElementById('captureSummaryFolder');
				dom.statusBanner = document.getElementById('captureStatusBanner');
				dom.statusBannerText = document.getElementById('captureStatusBannerText');
				dom.buildRunBtn = document.getElementById('captureBuildRunBtn');
				dom.shotBtn = document.getElementById('captureShotBtn');
				dom.progress = document.getElementById('captureProgress');
				dom.progressBarFill = document.getElementById('captureProgressBarFill');
				dom.currentLabel = document.getElementById('captureCurrentLabel');
				dom.scoreSelect = document.getElementById('captureScoreSelect');
				dom.stepButtons = document.getElementById('captureStepButtons');
				dom.retakeBtn = document.getElementById('captureRetakeBtn');
				dom.lastFile = document.getElementById('captureLastFile');
				dom.ack = document.getElementById('captureAck');
				dom.preview = document.getElementById('capturePreview');
				dom.previewSubject = document.getElementById('capturePreviewSubject');
				dom.previewApl = document.getElementById('capturePreviewApl');
				dom.previewShotPose = document.getElementById('capturePreviewShotPose');
				dom.previewScore = document.getElementById('capturePreviewScore');
				dom.previewMonitorPressure = document.getElementById('capturePreviewMonitorPressure');
				dom.previewNeckPressure = document.getElementById('capturePreviewNeckPressure');
				dom.previewHeadPressure = document.getElementById('capturePreviewHeadPressure');
				dom.previewHeadTarget = document.getElementById('capturePreviewHeadTarget');
				dom.previewHeadCurrent = document.getElementById('capturePreviewHeadCurrent');
				dom.previewNeckTarget = document.getElementById('capturePreviewNeckTarget');
				dom.previewNeckCurrent = document.getElementById('capturePreviewNeckCurrent');
				dom.previewUpdateTime = document.getElementById('capturePreviewUpdateTime');
			}

			function setAck(message, status = "") {
				if (!dom.ack) {
					return;
				}
				dom.ack.textContent = `操作狀態：${message}`;
				dom.ack.classList.remove('pending', 'ok', 'error');
				if (status) {
					dom.ack.classList.add(status);
				}
			}

			function setNodeText(node, text) {
				if (node) {
					node.textContent = text;
				}
			}

			function populateSelects() {
				if (dom.subjectSelect && dom.subjectSelect.options.length <= 1) {
					for (let index = 1; index <= 500; index += 1) {
						const option = document.createElement('option');
						option.value = `S${String(index).padStart(2, '0')}`;
						option.textContent = option.value;
						dom.subjectSelect.appendChild(option);
					}
				}

				if (dom.scoreSelect && dom.scoreSelect.options.length <= 1) {
					for (let score = 0; score <= 10; score += 1) {
						const option = document.createElement('option');
						option.value = String(score);
						option.textContent = String(score);
						dom.scoreSelect.appendChild(option);
					}
				}
			}

			function getCompletedCount() {
				return Math.max(0, state.lastCompletedStepIndex + 1);
			}

			function getInteractiveStep() {
				if (Number.isInteger(state.retakeStepIndex)) {
					return state.steps[state.retakeStepIndex] || null;
				}
				if (state.currentStepIndex >= 0 && state.currentStepIndex < state.steps.length) {
					return state.steps[state.currentStepIndex];
				}
				return null;
			}

			function getCurrentLabelText() {
				const step = getInteractiveStep();
				const totalSteps = state.steps.length || DEFAULT_CAPTURE_TOTAL;
				if (step) {
					if (Number.isInteger(state.retakeStepIndex)) {
						return `重拍 R${step.repeatId} · 第 ${step.index} 張 / 共 ${totalSteps} 張`;
					}
					return `R${step.repeatId} · 第 ${step.index} 張 / 共 ${totalSteps} 張`;
				}
				if (state.steps.length && getCompletedCount() === state.steps.length) {
					return `R${state.steps[state.steps.length - 1]?.repeatId || TOTAL_REPEATS} · 第 ${state.steps.length} 張 / 共 ${state.steps.length} 張`;
				}
				return "尚未建立截圖流程";
			}

			function getStepScoreText(step) {
				if (!step) {
					return "-";
				}
				if (step.scoreMode === "fixed10") {
					return "10";
				}
				if (step.scoreMode === "blank") {
					return "";
				}
				return step.score || "-";
			}

			function getStepDisplayName(step) {
				if (!step) {
					return "-";
				}
				if (step.kind === "UNLOAD") {
					return "UNLOAD";
				}
				return `${step.kind}-${step.actualPose || "-"}`;
			}

			function getStepTitleText(step) {
				if (!step) {
					return "-";
				}
				return `R${step.repeatId} ${getStepDisplayName(step)}`;
			}

			function getStepDetailText(step) {
				if (!step) {
					return "尚未建立截圖流程";
				}
				const totalSteps = state.steps.length || DEFAULT_CAPTURE_TOTAL;
				return `第 ${step.index} 張 / 共 ${totalSteps} 張`;
			}

			function parseHeightDisplay(text) {
				const source = typeof text === "string" ? text.trim() : "";
				const match = source.match(/目標\s*([^/]+?)\s*\/\s*目前\s*(.+)$/);
				if (!match) {
					return { target: "-", current: source || "-" };
				}
				return {
					target: match[1].trim() || "-",
					current: match[2].trim() || "-"
				};
			}

			function isStepReadyToCapture(step) {
				if (!step) {
					return false;
				}
				if (step.scoreMode !== "manual") {
					return true;
				}
				return step.score !== "";
			}

			function updateFolderUi() {
				const folderName = state.folderDisplayPath || "選擇資料夾";
				setNodeText(dom.folderPath, `📁 ${folderName}`);
				setNodeText(dom.summaryFolder, state.folderDisplayPath || "-");
				if (dom.folderBtn) {
					dom.folderBtn.disabled = !supportsFileSystemAccess;
					dom.folderBtn.title = state.folderDisplayPath || "選擇資料夾";
				}
			}

			function updateConfigUi() {
				setNodeText(dom.summarySubject, state.subjectId || "-");
				setNodeText(dom.summaryApl, state.aplPose || "-");
				if (dom.configBody) {
					dom.configBody.classList.toggle('is-collapsed', state.configCollapsed);
				}
				if (dom.configSummary) {
					dom.configSummary.classList.toggle('is-collapsed', !state.configCollapsed);
				}
			}

			function updateProgressUi() {
				const completedCount = getCompletedCount();
				const totalSteps = state.steps.length || DEFAULT_CAPTURE_TOTAL;
				const progressRatio = totalSteps ? Math.min(1, completedCount / totalSteps) : 0;
				setNodeText(dom.progress, `${completedCount} / ${totalSteps}`);
				setNodeText(dom.currentLabel, getCurrentLabelText());
				setNodeText(dom.lastFile, state.lastSavedFileName || "-");
				if (dom.progressBarFill) {
					dom.progressBarFill.style.width = `${progressRatio * 100}%`;
				}
			}

			function updateScoreUi() {
				const step = getInteractiveStep();
				if (!dom.scoreSelect) {
					return;
				}
				if (!step) {
					dom.scoreSelect.value = "";
					dom.scoreSelect.disabled = true;
					return;
				}
				if (step.scoreMode === "fixed10") {
					dom.scoreSelect.value = "10";
					dom.scoreSelect.disabled = true;
					return;
				}
				if (step.scoreMode === "blank") {
					dom.scoreSelect.value = "";
					dom.scoreSelect.disabled = true;
					return;
				}
				dom.scoreSelect.disabled = false;
				dom.scoreSelect.value = step.score || "";
			}

			function refreshLiveMetrics() {
				const headHeight = parseHeightDisplay(headHeightValue?.textContent || "-");
				const neckHeight = parseHeightDisplay(neckHeightValue?.textContent || "-");
				setNodeText(dom.previewMonitorPressure, monitorPressureValue?.textContent || "-");
				setNodeText(dom.previewNeckPressure, neckPressureValue?.textContent || "-");
				setNodeText(dom.previewHeadPressure, headPressureValue?.textContent || "-");
				setNodeText(dom.previewHeadTarget, headHeight.target);
				setNodeText(dom.previewHeadCurrent, headHeight.current);
				setNodeText(dom.previewNeckTarget, neckHeight.target);
				setNodeText(dom.previewNeckCurrent, neckHeight.current);
				setNodeText(dom.previewUpdateTime, monitorUpdateTime?.textContent || "-");
			}

			function updatePreviewMeta() {
				const step = getInteractiveStep();
				setNodeText(dom.previewSubject, state.subjectId || "-");
				setNodeText(dom.previewApl, state.aplPose || "-");
				if (state.steps.length && getCompletedCount() === state.steps.length) {
					setNodeText(dom.previewShotPose, "完成");
				} else {
					setNodeText(dom.previewShotPose, state.steps.length ? getStepDisplayName(step) : "-");
				}
				setNodeText(dom.previewScore, getStepScoreText(step));
				setNodeText(dom.currentLabel, getCurrentLabelText());
			}

			function updateStatusBanner() {
				if (!dom.statusBanner || !dom.statusBannerText) {
					return;
				}

				let className = "pending";
				let message = "⚠ 請先選擇資料夾";

				if (!supportsFileSystemAccess) {
					className = "error";
					message = "⚠ 目前瀏覽器不支援資料夾寫入功能，請改用 Chromium 系瀏覽器";
				} else if (!state.folderHandle) {
					className = "pending";
					message = "⚠ 請先選擇資料夾";
				} else if (!state.subjectId) {
					className = "info";
					message = "✓ 請選擇受試者";
				} else if (!state.aplPose) {
					className = "info";
					message = "✓ 請選擇姿勢";
				} else if (!state.steps.length) {
					className = "info";
					message = "✓ 請按「開始」";
				} else if (getInteractiveStep()?.scoreMode === "manual" && !getInteractiveStep()?.score) {
					className = "info";
					message = "✓ 請先選舒適度評分，再按立即截圖";
				} else if (getCompletedCount() >= state.steps.length) {
					className = "ok";
					message = "✓ 本輪截圖已完成";
				} else {
					className = "ok";
					message = "✓ 請依照系統提示完成拍攝";
				}

				dom.statusBanner.classList.remove('pending', 'info', 'ok', 'error');
				dom.statusBanner.classList.add(className);
				setNodeText(dom.statusBannerText, message);
			}

			function updateBuildButtonState() {
				if (!dom.buildRunBtn) {
					return;
				}
				dom.buildRunBtn.disabled = !supportsFileSystemAccess || !state.folderHandle || !state.subjectId || !state.aplPose;
			}

			function updateShotButtonState() {
				if (!dom.shotBtn) {
					return;
				}
				const step = getInteractiveStep();
				const hasRunnableStep = !!step && !!state.folderHandle && state.steps.length > 0;
				dom.shotBtn.disabled = !hasRunnableStep || !isStepReadyToCapture(step);
				dom.shotBtn.textContent = Number.isInteger(state.retakeStepIndex) ? "重拍這一張" : "立即截圖";
			}

			function updateRetakeButtonState() {
				if (!dom.retakeBtn) {
					return;
				}
				const canRetake = !!state.steps.length && state.lastCompletedStepIndex >= 0;
				dom.retakeBtn.hidden = !canRetake;
				dom.retakeBtn.disabled = !canRetake;
				dom.retakeBtn.textContent = Number.isInteger(state.retakeStepIndex) ? "取消重拍上一張" : "重拍上一張";
			}

			function resetRunState(message = "", status = "") {
				state.steps = [];
				state.currentStepIndex = 0;
				state.lastCompletedStepIndex = -1;
				state.lastSavedFileName = "";
				state.retakeStepIndex = null;
				state.configCollapsed = false;
				if (message) {
					setAck(message, status);
				}
				updateUi();
			}

			function buildSteps() {
				const steps = [];
				const appendStep = (kind, actualPose, scoreMode, repeatId) => {
					const index = steps.length + 1;
					const displayIndex = String(index).padStart(2, '0');
					const actionLabel = kind === "UNLOAD" ? "UNLOAD" : `${kind}-${actualPose}`;
					steps.push({
						index,
						repeatId,
						label: `${displayIndex} ${actionLabel}`,
						kind,
						actualPose,
						fileName: `${state.subjectId}_APL-${state.aplPose}_${actionLabel}_R${repeatId}_${displayIndex}.${CAPTURE_FILE_EXTENSION}`,
						scoreMode,
						score: scoreMode === "fixed10" ? "10" : ""
					});
				};

				appendStep("LOAD", state.aplPose, "fixed10", 1);
				appendStep("UNLOAD", null, "blank", 1);
				POSE_ORDER.filter(pose => pose !== state.aplPose).forEach(pose => appendStep("ACT", pose, "manual", 1));

				for (let repeatId = 2; repeatId <= TOTAL_REPEATS; repeatId += 1) {
					POSE_ORDER.forEach(pose => appendStep("ACT", pose, "manual", repeatId));
				}

				return steps;
			}

			function renderStepButtons() {
				if (!dom.stepButtons) {
					return;
				}
				dom.stepButtons.innerHTML = "";
				if (!state.steps.length) {
					return;
				}

				const activeIndex = Number.isInteger(state.retakeStepIndex) ? state.retakeStepIndex : state.currentStepIndex;
				const hasActiveStep = Number.isInteger(state.retakeStepIndex) || state.currentStepIndex < state.steps.length;

				state.steps.forEach((step, index) => {
					const button = document.createElement('div');
					button.className = 'capture-step-btn';
					const stepTitle = getStepTitleText(step);
					const stepDetail = getStepDetailText(step);

					const isDone = index < state.currentStepIndex;
					const isActive = hasActiveStep && index === activeIndex;
					const mark = isDone ? "☑" : "☐";

					button.innerHTML = `
						<span class="capture-step-mark">${mark}</span>
						<span class="capture-step-copy">
							<strong>${stepTitle}</strong>
							<small>${stepDetail}</small>
						</span>
					`;

					button.classList.add(isActive ? 'capture-step-active' : isDone ? 'capture-step-done' : 'capture-step-disabled');
					dom.stepButtons.appendChild(button);
				});

				if (hasActiveStep) {
					const activeStepNode = dom.stepButtons.querySelector('.capture-step-active');
					activeStepNode?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
			}

			function triggerActiveCapture() {
				const activeIndex = Number.isInteger(state.retakeStepIndex) ? state.retakeStepIndex : state.currentStepIndex;
				if (!Number.isInteger(activeIndex) || activeIndex < 0 || activeIndex >= state.steps.length) {
					setAck("目前沒有可截圖的步驟", "pending");
					return;
				}
				captureStep(activeIndex, { retake: Number.isInteger(state.retakeStepIndex) });
			}

			function updateUi() {
				updateConfigUi();
				updateFolderUi();
				updateStatusBanner();
				updateBuildButtonState();
				updateShotButtonState();
				updateScoreUi();
				updateProgressUi();
				updateRetakeButtonState();
				renderStepButtons();
				updatePreviewMeta();
				refreshLiveMetrics();
			}

			function syncSelectionState() {
				const nextSubjectId = dom.subjectSelect?.value || "";
				const nextAplPose = dom.aplSelect?.value || "";
				const runChanged = state.steps.length > 0 && (state.subjectId !== nextSubjectId || state.aplPose !== nextAplPose);
				state.subjectId = nextSubjectId;
				state.aplPose = nextAplPose;
				if (runChanged) {
					resetRunState("受試者編號或實驗姿勢已變更，目前資料夾會繼續沿用，請重新開始本輪截圖", "pending");
					return;
				}
				updateUi();
			}

			async function selectFolder() {
				if (!supportsFileSystemAccess) {
					setAck("瀏覽器不支援 File System Access API，請改用 Chromium 系瀏覽器", "error");
					return;
				}
				try {
					const handle = await window.showDirectoryPicker();
					state.folderHandle = handle;
					state.folderDisplayPath = handle?.name || "已選擇資料夾";
					setAck(`已選好儲存資料夾：${state.folderDisplayPath}，後續每一輪都會沿用這個位置`, "ok");
					updateUi();
				} catch (error) {
					if (error?.name === "AbortError") {
						if (state.folderHandle) {
							setAck(`取消重新選擇，沿用目前儲存位置：${state.folderDisplayPath}`, "pending");
						} else {
							setAck("已取消資料夾選擇，尚未設定儲存位置", "pending");
						}
						return;
					}
					setAck(`資料夾選擇失敗：${error.message}`, "error");
				}
			}

			function buildRun() {
				if (!supportsFileSystemAccess) {
					setAck("瀏覽器不支援 File System Access API，請改用 Chromium 系瀏覽器", "error");
					return;
				}
				if (!state.subjectId || !state.aplPose) {
					setAck("請先選擇受試者編號與實驗姿勢", "error");
					return;
				}
				if (!state.folderHandle) {
					setAck("請先選擇儲存資料夾後再建立流程", "error");
					return;
				}

				state.steps = buildSteps();
				state.currentStepIndex = 0;
				state.lastCompletedStepIndex = -1;
				state.lastSavedFileName = "";
				state.retakeStepIndex = null;
				state.configCollapsed = true;
				setAck(`已開始 ${state.subjectId} / ${state.aplPose} 的本輪截圖，共 ${state.steps.length} 張，請依照右側提示拍攝`, "ok");
				updateUi();
			}

			function handleScoreChange() {
				const step = getInteractiveStep();
				if (step && step.scoreMode === "manual") {
					step.score = dom.scoreSelect?.value || "";
					if (!step.score) {
						setAck("ACT 步驟需要先選舒適度評分 0 到 10 才能截圖", "pending");
					}
				}
				updateUi();
			}

			function toggleRetakeMode() {
				if (!state.steps.length || state.lastCompletedStepIndex < 0) {
					setAck("目前沒有可重拍的上一張", "pending");
					return;
				}
				if (Number.isInteger(state.retakeStepIndex)) {
					state.retakeStepIndex = null;
					setAck("已取消重拍模式", "pending");
					updateUi();
					return;
				}
				state.retakeStepIndex = state.lastCompletedStepIndex;
				setAck(`重拍模式：${state.steps[state.retakeStepIndex].label}，存檔時會覆蓋上一張同名檔案`, "pending");
				updateUi();
			}

			async function ensureFolderPermission() {
				if (!state.folderHandle) {
					return false;
				}
				const options = { mode: 'readwrite' };
				if (typeof state.folderHandle.queryPermission !== "function" || typeof state.folderHandle.requestPermission !== "function") {
					return true;
				}
				const currentPermission = await state.folderHandle.queryPermission(options);
				if (currentPermission === 'granted') {
					return true;
				}
				return (await state.folderHandle.requestPermission(options)) === 'granted';
			}

			async function fileExists(fileName) {
				try {
					await state.folderHandle.getFileHandle(fileName);
					return true;
				} catch (error) {
					if (error?.name === 'NotFoundError') {
						return false;
					}
					throw error;
				}
			}

			function inlineComputedStyles(sourceNode, targetNode) {
				if (!(sourceNode instanceof Element) || !(targetNode instanceof Element)) {
					return;
				}
				const computedStyle = window.getComputedStyle(sourceNode);
				const cssPairs = Array.from(computedStyle).map(name => {
					if (name === 'font-family') {
						return `${name}:${CAPTURE_SAFE_FONT_STACK};`;
					}
					if (name === 'text-shadow' || name === 'filter' || name === 'backdrop-filter') {
						return `${name}:none;`;
					}
					return `${name}:${computedStyle.getPropertyValue(name)};`;
				});
				cssPairs.push(`font-family:${CAPTURE_SAFE_FONT_STACK};`);
				targetNode.setAttribute('style', cssPairs.join(''));

				const sourceChildren = Array.from(sourceNode.children);
				const targetChildren = Array.from(targetNode.children);
				sourceChildren.forEach((child, index) => {
					inlineComputedStyles(child, targetChildren[index]);
				});
			}

			function waitForNextFrame() {
				return new Promise(resolve => {
					requestAnimationFrame(() => resolve());
				});
			}

			function buildPreviewSvgBlob() {
				if (!dom.preview) {
					throw new Error("找不到截圖預覽框");
				}
				const rect = dom.preview.getBoundingClientRect();
				const width = Math.max(1, Math.ceil(rect.width));
				const height = Math.max(1, Math.ceil(rect.height));
				const clone = dom.preview.cloneNode(true);
				inlineComputedStyles(dom.preview, clone);
				clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');

				const serialized = new XMLSerializer().serializeToString(clone);
				const svg = `
					<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
						<foreignObject width="100%" height="100%">${serialized}</foreignObject>
					</svg>
				`;
				return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
			}

			async function capturePreviewAsBlob() {
				return buildPreviewSvgBlob();
			}

			async function saveStepFile(step) {
				if (!(await ensureFolderPermission())) {
					throw new Error("尚未取得資料夾寫入權限");
				}
				const exists = await fileExists(step.fileName);
				if (exists && !window.confirm(`檔名已存在，是否覆蓋？\n${step.fileName}`)) {
					return { cancelled: true };
				}

				await waitForNextFrame();
				const captureBlob = await capturePreviewAsBlob();
				const fileHandle = await state.folderHandle.getFileHandle(step.fileName, { create: true });
				const writable = await fileHandle.createWritable();
				await writable.write(captureBlob);
				await writable.close();
				return { cancelled: false };
			}

			async function captureStep(stepIndex, { retake = false } = {}) {
				const step = state.steps[stepIndex];
				if (!step) {
					setAck("找不到目前要拍的步驟，請重新建立流程", "error");
					return;
				}
				if (!state.folderHandle) {
					setAck("請先選擇儲存資料夾", "error");
					return;
				}
				if (retake) {
					if (state.retakeStepIndex !== stepIndex) {
						setAck("目前只允許重拍上一張", "error");
						return;
					}
				} else if (stepIndex !== state.currentStepIndex) {
					setAck("目前只能拍下一張應拍的步驟", "error");
					return;
				}
				if (step.scoreMode === "manual") {
					step.score = dom.scoreSelect?.value || "";
					if (!step.score) {
						setAck("ACT 步驟需要先選舒適度評分 0 到 10 才能截圖", "error");
						updateUi();
						return;
					}
				}

				try {
					setAck(`正在儲存圖片：${step.fileName}`, "pending");
					const result = await saveStepFile(step);
					if (result.cancelled) {
						setAck("已取消覆蓋，步驟維持不變", "pending");
						return;
					}

					state.lastSavedFileName = step.fileName;
					if (retake) {
						state.retakeStepIndex = null;
						setAck(`已覆蓋上一張：${step.fileName}`, "ok");
					} else {
						state.lastCompletedStepIndex = stepIndex;
						state.currentStepIndex = Math.min(stepIndex + 1, state.steps.length);
						if (state.currentStepIndex >= state.steps.length) {
							setAck(`本輪 ${state.steps.length} 張已完成：${step.fileName}`, "ok");
						} else if (state.steps[state.currentStepIndex]?.scoreMode === "manual" && !state.steps[state.currentStepIndex]?.score) {
							setAck(`已儲存 ${step.fileName}，請先選舒適度評分，再拍下一張`, "pending");
						} else {
							setAck(`已儲存 ${step.fileName}，請繼續下一張`, "ok");
						}
					}
				} catch (error) {
					setAck(`截圖失敗：${error.message}`, "error");
				}
				updateUi();
			}

			function init() {
				cacheDom();
				populateSelects();

				dom.subjectSelect?.addEventListener('change', syncSelectionState);
				dom.aplSelect?.addEventListener('change', syncSelectionState);
				dom.folderBtn?.addEventListener('click', selectFolder);
				dom.buildRunBtn?.addEventListener('click', buildRun);
				dom.shotBtn?.addEventListener('click', triggerActiveCapture);
				dom.scoreSelect?.addEventListener('change', handleScoreChange);
				dom.retakeBtn?.addEventListener('click', toggleRetakeMode);
				dom.configEditBtn?.addEventListener('click', function () {
					state.configCollapsed = false;
					updateUi();
				});

				if (!supportsFileSystemAccess) {
					setAck("瀏覽器不支援 File System Access API，請改用 Chromium 系瀏覽器", "error");
				} else {
					setAck("請先選擇儲存資料夾。選好一次後會沿用目前位置，再設定受試者編號與實驗姿勢。", "pending");
				}

				syncSelectionState();
				updateUi();
			}

			return {
				init,
				refreshLiveMetrics
			};
		}

		function updateHeightMonitorFromParsed(source) {
			updateHeightMonitorFromValues(
				source,
				parsedData.headNumber,
				parsedData.neckNumber,
				parsedData.currentHeadNumber,
				parsedData.currentNeckNumber
			);
		}

		function clearClassifyStartRetry() {
			if (classifyStartRetryTimer) {
				clearTimeout(classifyStartRetryTimer);
				classifyStartRetryTimer = null;
			}
		}

		function clearPredStartRetry() {
			if (predStartRetryTimer) {
				clearTimeout(predStartRetryTimer);
				predStartRetryTimer = null;
			}
		}

		function resetAutoControlStartState() {
			clearClassifyStartRetry();
			clearPredStartRetry();
			classifyStarted = false;
			classifyStartRequested = false;
			predEnabled = false;
			predStartRequested = false;
			classifyStartAttempts = 0;
			predStartAttempts = 0;
		}

		function requestPredStart() {
			if (!classifyStarted || predEnabled || predStartRequested) {
				return;
			}
			if (predStartAttempts >= AUTO_START_MAX_ATTEMPTS) {
				serial_message("PRED,START 啟動失敗，請確認 USER、anchor 與壓力資料是否完整。", "red");
				return;
			}

			predStartRequested = true;
			predStartAttempts += 1;
			sendCommand("PRED,START");
			clearPredStartRetry();
			predStartRetryTimer = setTimeout(() => {
				if (!predEnabled && predStartRequested) {
					predStartRequested = false;
					if (predStartAttempts < AUTO_START_MAX_ATTEMPTS) {
						serial_message(`PRED,START 未收到 OK，重試 ${predStartAttempts + 1}/${AUTO_START_MAX_ATTEMPTS}。`, "orange");
						requestPredStart();
					} else {
						serial_message("PRED,START 未收到 OK，自動高度調整未確認啟動。", "red");
					}
				}
			}, AUTO_START_RETRY_MS);
		}

		function requestClassifyStart() {
			if (!anchorDone.BSHS || !anchorDone.BLHL || classifyStarted || classifyStartRequested) {
				return;
			}
			if (classifyStartAttempts >= AUTO_START_MAX_ATTEMPTS) {
				serial_message("CLASSIFY,START 啟動失敗，請確認 BSHS 與 BLHL anchor 是否都存在。", "red");
				return;
			}

			classifyStartRequested = true;
			classifyStartAttempts += 1;
			if (classifyStartAttempts === 1) {
				sendCommand("MODE,NORM");
			}
			sendCommand("CLASSIFY,START");
			clearClassifyStartRetry();
			classifyStartRetryTimer = setTimeout(() => {
				if (!classifyStarted && classifyStartRequested) {
					classifyStartRequested = false;
					if (classifyStartAttempts < AUTO_START_MAX_ATTEMPTS) {
						serial_message(`CLASSIFY,START 未收到 OK，重試 ${classifyStartAttempts + 1}/${AUTO_START_MAX_ATTEMPTS}。`, "orange");
						requestClassifyStart();
					} else {
						serial_message("CLASSIFY,START 未收到 OK，姿勢辨識未確認啟動。", "red");
					}
				}
			}, AUTO_START_RETRY_MS);
		}

		function maybeStartClassification() {
			if (controlMode !== CONTROL_MODE.AUTO) {
				serial_message("目前為手動模式：校正完成後不自動啟動分類與高度調整。", "orange");
				return;
			}
			if (!anchorDone.BSHS || !anchorDone.BLHL) {
				return;
			}
			requestClassifyStart();
		}

			function parseProtocolMessage(dataString) {
				const parts = dataString.split(',').map(v => v.trim());
				if (parts.length < 2) {
					return;
				}

				if (parts[0] === "USER") {
					if (parts[1] === "OK") {
						setUserSetAck(`已設定 (${formatAckTime()})`, "ok");
						requestSilentDebugSnapshot();
					} else if (parts[1] === "ERR") {
						setUserSetAck(`ESP32 回覆失敗：${parts.slice(2).join(',') || "BAD_COMMAND"}`, "error");
					}
					return;
				}

			if (parts[0] === "FEATURE") {
				if (parts[1] === "STATUS") {
					const predIndex = parts.indexOf("PRED");
					if (predIndex !== -1 && parts[predIndex + 1] === "1") {
						setModeUi(CONTROL_MODE.AUTO);
						if (requestedControlMode === CONTROL_MODE.AUTO) {
							setModeAck(`ESP32 已確認自動模式 (${formatAckTime()})`, "ok");
						} else {
							setModeAck(`ESP32 回覆目前為自動模式 (${formatAckTime()})`, "ok");
						}
					} else if (predIndex !== -1 && parts[predIndex + 1] === "0") {
						setModeUi(CONTROL_MODE.MANUAL);
						if (requestedControlMode === CONTROL_MODE.MANUAL) {
							setModeAck(`ESP32 已確認手動模式 (${formatAckTime()})`, "ok");
						} else {
							setModeAck(`ESP32 回覆目前為手動模式 (${formatAckTime()})`, "ok");
						}
					}
				}
				if (parts[1] === "ERR") {
					setModeAck(`ESP32 回覆失敗：${parts.slice(2).join(',') || 'BAD_COMMAND'}`, "error");
				}
				return;
			}

			if (parts[0] === "HEIGHT_SET" || parts[0] === "HEIGHT_LIMIT") {
				const headIndex = parts.indexOf(parts[0] === "HEIGHT_SET" ? "HEAD" : "HEAD_APPLIED");
				const neckIndex = parts.indexOf(parts[0] === "HEIGHT_SET" ? "NECK" : "NECK_APPLIED");
				let targetHead = null;
				let targetNeck = null;
				if (headIndex !== -1 && parts[headIndex + 1]) {
					targetHead = parts[headIndex + 1];
					[numberInput1, numberInput3].forEach(input => setHeightInputValue(input, parts[headIndex + 1], "HEAD"));
					['supineHeadInput', 'sideHeadInput'].forEach(id => setHeightInputValue(document.getElementById(id), parts[headIndex + 1], "HEAD"));
				}
				if (neckIndex !== -1 && parts[neckIndex + 1]) {
					targetNeck = parts[neckIndex + 1];
					[numberInput2, numberInput4].forEach(input => setHeightInputValue(input, parts[neckIndex + 1], "NECK"));
					['supineNeckInput', 'sideNeckInput'].forEach(id => setHeightInputValue(document.getElementById(id), parts[neckIndex + 1], "NECK"));
				}
				updateHeightMonitorFromValues(parts[0], targetHead, targetNeck, null, null);
				serial_message(`高度限制：頭部 ${HEIGHT_LIMITS.HEAD.min.toFixed(1)}-${HEIGHT_LIMITS.HEAD.max.toFixed(1)} cm，頸部 ${HEIGHT_LIMITS.NECK.min.toFixed(1)}-${HEIGHT_LIMITS.NECK.max.toFixed(1)} cm，步進 ${HEIGHT_STEP.toFixed(1)} cm。`, "blue");
				return;
			}

			if (parts[0] === "MANUAL") {
				if (parts[1] === "OK") {
					const action = parts[2] || "";
					if (action === "STARTUP") {
						setEspManualUi(false, `已回開機流程 Head=${parts[3] || "-"} Neck=${parts[4] || "-"} (${formatAckTime()})`, "ok");
						if (parts[3] && parts[4]) {
							updateHeightMonitorFromValues("MANUAL_STARTUP", parts[3], parts[4], null, null);
						}
					} else {
						const label = parts.slice(2).join(",") || "ENTER";
						setEspManualUi(true, `ESP32 已確認 ${label} (${formatAckTime()})`, "ok");
					}
				} else if (parts[1] === "ERR") {
					setEspManualUi(true, `ESP32 回覆失敗：${parts.slice(2).join(",") || "BAD_COMMAND"}`, "error");
				} else if (parts[1] === "IGNORED") {
					setEspManualUi(true, `ESP32 Manual 忽略指令：${parts.slice(2).join(",")}`, "error");
				}
				return;
			}

			if (parts[0] === "ANCHOR") {
				if (parts[1] === "STATUS" && parts.length >= 4) {
					safeSetText(anchorStateValue, parts[2]);
					safeSetText(anchorTargetValue, parts[3]);
					return;
				}

				if (parts[1] === "OK") {
					if (parts[2] === "START" && parts.length >= 4) {
						anchorPollingTarget = parts[3];
						if (parts[3] === "BSHS" || parts[3] === "BLHL") {
							resetAutoControlStartState();
							anchorDone[parts[3]] = false;
							anchorDataByTarget[parts[3]] = null;
							refreshAnchorBadgeUI();
						}
						return;
					}
					if ((parts[2] === "BSHS" || parts[2] === "BLHL") && parts.length >= 8) {
						const target = parts[2];
						anchorDone[target] = true;
						anchorDataByTarget[target] = {
							pm: parts[3],
							pn: parts[4],
							ph: parts[5],
							head: parts[6],
							neck: parts[7]
						};
						renderAnchorValue(target);
						refreshAnchorBadgeUI();

						if (pendingAnchorTarget === target) {
							pendingAnchorTarget = null;
							const hint = document.getElementById(target === "BSHS" ? 'supineCalibHint' : 'sideCalibHint');
							if (hint) {
								hint.textContent = `${target} 校正成功。`;
							}
							if (target === "BLHL") {
								stopSideStandbyWatch();
								enableSideCalibrationControls(true);
							}
							const menu = document.getElementById('calibMenuScreen');
							const supine = document.getElementById('supineCalibScreen');
							const side = document.getElementById('sideCalibScreen');
							if (menu && supine && side) {
								menu.style.display = 'block';
								supine.style.display = 'none';
								side.style.display = 'none';
							}
						}

						maybeStartClassification();
						if (!(anchorDone.BSHS && anchorDone.BLHL)) {
							setWorkflowState(WORKFLOW.UNCALIBRATED);
						}
						return;
					}
					if (parts[2] === "CLEAR") {
						anchorDone = { BSHS: false, BLHL: false };
						anchorDataByTarget = { BSHS: null, BLHL: null };
						resetAutoControlStartState();
						refreshAnchorBadgeUI();
						safeSetText(anchorBshsValue, "pm:- pn:- ph:- head:- neck:-");
						safeSetText(anchorBlhlValue, "pm:- pn:- ph:- head:- neck:-");
						setWorkflowState(WORKFLOW.UNCALIBRATED);
					}
					return;
				}

				if (parts[1] === "ERR" && parts[2] === "TIMEOUT" && pendingAnchorTarget) {
					const hint = document.getElementById(pendingAnchorTarget === "BSHS" ? 'supineCalibHint' : 'sideCalibHint');
					if (hint) {
						hint.textContent = "校正逾時，請重試。";
					}
					if (pendingAnchorTarget === "BLHL") {
						stopSideStandbyWatch();
						enableSideCalibrationControls(true);
					}
					pendingAnchorTarget = null;
				}
				return;
			}

			if (parts[0] === "CLASSIFY") {
				if (parts[1] === "OK") {
					if (parts[2] === "START") {
						classifyStarted = true;
						classifyStartRequested = false;
						classifyStartAttempts = 0;
						clearClassifyStartRetry();
						setWorkflowState(WORKFLOW.CLASSIFYING);
						requestPredStart();
						return;
					}
					if (parts[2] === "STOP") {
						resetAutoControlStartState();
						setWorkflowState(WORKFLOW.UNCALIBRATED);
						return;
					}
					if (parts.length >= 8) {
						safeSetText(poseSmoothLabel, parts[2]);
						safeSetText(poseRawLabel, parts[3]);
						safeSetText(scoreEValue, parts[4]);
						safeSetText(scoreSupineValue, parts[5]);
						safeSetText(scoreSideMeanValue, parts[6]);
						safeSetText(scorePmRuleValue, parts[7]);
						safeSetText(poseUpdateTime, new Date().toLocaleTimeString());
					}
				}
				if (parts[1] === "ERR") {
					if (classifyStartRequested) {
						clearClassifyStartRetry();
						classifyStartRequested = false;
						if (parts[2] === "ANCHOR_MISSING") {
							classifyStartAttempts = AUTO_START_MAX_ATTEMPTS;
							serial_message("CLASSIFY,START 失敗：ESP32 表示 anchor 不完整，請重新確認 BSHS/BLHL。", "red");
						} else if (classifyStartAttempts < AUTO_START_MAX_ATTEMPTS) {
							setTimeout(requestClassifyStart, 1000);
						} else {
							serial_message("CLASSIFY,START 失敗，請查看 ESP32 回覆。", "red");
						}
					}
				}
				return;
			}

			if (parts[0] === "PRED") {
				if (parts[1] === "OK" && parts[2] === "START") {
					predStartRequested = false;
					predStartAttempts = 0;
					predEnabled = true;
					clearPredStartRetry();
					setWorkflowState(WORKFLOW.AUTOCONTROL);
					return;
				}
				if (parts[1] === "OK" && parts[2] === "STOP") {
					predStartRequested = false;
					predEnabled = false;
					clearPredStartRetry();
					setWorkflowState(classifyStarted ? WORKFLOW.CLASSIFYING : WORKFLOW.UNCALIBRATED);
					return;
				}
				if (parts[1] === "OK") {
					if (parts.length >= 11) {
						predEnabled = parts[2] === "1";
						if (predEnabled) {
							predStartRequested = false;
							predStartAttempts = 0;
							clearPredStartRetry();
						}
						safeSetText(predStageValue, `${parts[2]}/${parts[3]}`);
						safeSetText(predNeckDelta, formatDelta(parts[7], parts[8]));
						safeSetText(predHeadDelta, formatDelta(parts[9], parts[10]));
						if (predEnabled) {
							setWorkflowState(WORKFLOW.AUTOCONTROL);
						} else if (classifyStarted) {
							setWorkflowState(WORKFLOW.CLASSIFYING);
						}
					}
					return;
				}
				if (parts[1] === "ERR" && predStartRequested) {
					clearPredStartRetry();
					predStartRequested = false;
					if (parts[2] === "NOT_READY") {
						serial_message("PRED,START 尚未就緒，確認 USER/anchor/壓力資料後重試。", "orange");
					}
					if (predStartAttempts < AUTO_START_MAX_ATTEMPTS) {
						setTimeout(requestPredStart, 1000);
					} else {
						serial_message("PRED,START 失敗，自動高度調整未啟動。", "red");
					}
				}
				return;
			}

			if (parts[0] === "INIT" && parts[1] === "OK") {
				if (awaitingInitMode === "L" && parts.length >= 4) {
					const sideHeadInput = document.getElementById('sideHeadInput');
					const sideNeckInput = document.getElementById('sideNeckInput');
					if (sideHeadInput) setHeightInputValue(sideHeadInput, parts[2], "HEAD");
					if (sideNeckInput) setHeightInputValue(sideNeckInput, parts[3], "NECK");
					if (numberInput3) setHeightInputValue(numberInput3, parts[2], "HEAD");
					if (numberInput4) setHeightInputValue(numberInput4, parts[3], "NECK");
					updateHeightMonitorFromValues("INIT", parts[2], parts[3], null, null);
				}
				awaitingInitMode = null;
			}
		}

		function serial_message(msg, colour, show = true) {
			const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
			var scrollControl = document.querySelector('input[name="scrollControl"]:checked')?.value || "auto";
			if (show) {
				serial_status.insertAdjacentHTML('beforeend', "<font color='" + colour + "'>" + safeMsg + "</font><br>");
			}
			if (show && scrollControl === "auto") {
				serial_status.scrollTop = serial_status.scrollHeight;
			}



			const dataString = msg.toString().replace('\r\n', '');  // Convert buffer data to string
			// Robust parsing: split by space/comma, remove empty entries
			let dataPoints = dataString.split(/[\s,]+/).filter(Boolean);

			if (colour === "green" || colour === LOG_SUCCESS_GREEN) {
				debugDataBuffer += `${msg}\n`;
				if (debugDataBuffer.includes('N2LP=')) {
					let cleanedData = debugDataBuffer.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
					const regex = /(\w+)=([^=\s]+)/g;
					let match;
					while ((match = regex.exec(cleanedData)) !== null) {
						parsedData[match[1]] = match[2] || '';
					}
					updateHeightMonitorFromParsed("DEBUG");
					updateUserDimensionsFromParsed();
					debugDataBuffer = "";
				}
			}


			if (dataPoints.length > 0) {
				const prefix = dataPoints[0];

				if (prefix.startsWith("P:")) {
					// Handle Pressure Data (P: val1 val2 val3)
					// Remove prefix part "P:" from first element if it's attached, or shift if separated space
					let values = [];
					if (prefix === "P:") {
						values = dataPoints.slice(1).map(parseFloat);
					} else {
						// P:123
						let firstVal = prefix.substring(2);
						values = [parseFloat(firstVal), ...dataPoints.slice(1).map(parseFloat)];
					}

					if (values.length >= 3) {
						updatePressureMonitor(values);
							// Update chart data and labels
							var now = new Date();
							if (chart_data_count % 10 == 0) {
								chart.data.labels.push(formatLocalTimeLabel(now));  // Add timestamp as label
							} else {
								chart.data.labels.push("");  // Add timestamp as label
							}
						if (chart_data_count > 50) {
							chart.data.labels.shift();
						}

						values.forEach((value, index) => {
							if (index < 3) { // Only take first 3
								chart.data.datasets[index].data.push(value);
								if (chart_data_count > 50) {
									chart.data.datasets[index].data.shift();
								}
								if (index == 0) pressure1 = value;
								if (index == 1) pressure2 = value;
								if (index == 2) pressure3 = value;
							}
						});
						updateChartSummary();
						updateChartIfVisible(chart, pressureChartSection);
					}
				}
				else if (prefix.startsWith("I:")) {
					// Handle Info Data (I: val1 val2 ... val7)
					let values = [];
					if (prefix === "I:") {
						values = dataPoints.slice(1).map(parseFloat);
					} else {
						let firstVal = prefix.substring(2);
						values = [parseFloat(firstVal), ...dataPoints.slice(1).map(parseFloat)];
					}

					if (values.length >= 7) {
						values.forEach((value, index) => {
							if (index == 0) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "diff: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								// Update chart data and labels
								var now = new Date();
								if (chart_data_count % 10 == 0) {
									chart3.data.labels.push(formatLocalTimeLabel(now));  // Add timestamp as label
								} else {
									chart3.data.labels.push("");  // Add timestamp as label
								}
								if (chart_data_count > 50) {
									chart3.data.labels.shift();
								}
								chart3.data.datasets[0].data.push(value);
								if (chart_data_count > 50) {
									chart3.data.datasets[0].data.shift();
								}
								differential = value;
								updateChartSummary();
								updateChartIfVisible(chart3, diffChartSection);
							}

							if (index == 1) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "state: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								state = value;
								const stateName = SystemState[state] || "UNKNOWN (" + state + ")";
								const stateDisplay = document.getElementById('systemStateDisplay');
								if (stateDisplay) stateDisplay.value = stateName;
								if (stateName === "MANUAL_CONTROL") {
									setEspManualUi(true);
								} else if (espManualStatus?.textContent === "ESP32 Manual") {
									setEspManualUi(false);
								}

								if (sideStandbyWatchActive) {
									if (Number(state) === 5) {
										sideStandbyConsecutive += 1;
										if (sideStandbyConsecutive >= 2) {
											stopSideStandbyWatch();
											enableSideCalibrationControls(true);
											const sideHint = document.getElementById('sideCalibHint');
											if (sideHint) {
												sideHint.textContent = "已進入 STANDBY，現在可微調。";
											}
										}
									} else {
										sideStandbyConsecutive = 0;
									}
								}
							}
							if (index == 2) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "onoff: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								onoff_event = value;
								for (let i = 1; i <= 6; i++) {
									const isOn = (onoff_event >> (i - 1)) & 1;
									const led = document.getElementById('led_s' + i);
									if (led) {
										if (isOn) {
											led.classList.add('on');
										} else {
											led.classList.remove('on');
										}
									}
								}
							}
							if (index == 3) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "last5: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								// Update chart data and labels
								var now = new Date();
								if (chart_data_count % 10 == 0) {
									chart2.data.labels.push(formatLocalTimeLabel(now));  // Add timestamp as label
								} else {
									chart2.data.labels.push("");  // Add timestamp as label
								}
								if (chart_data_count > 50) {
									chart2.data.labels.shift();
								}
								chart2.data.datasets[0].data.push(value);
								if (chart_data_count > 50) {
									chart2.data.datasets[0].data.shift();
								}
								last5pointAvg = value;
							}
							if (index == 4) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "prev5: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								// Update chart data and labels
								chart2.data.datasets[1].data.push(value);
								if (chart_data_count > 50) {
									chart2.data.datasets[1].data.shift();
								}
								prev5pointAvg = value;
								updateChartSummary();
								updateChartIfVisible(chart2, averageChartSection);
							}
							if (index == 5) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "predict_pose: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								predict_Pose = value;
							}
							if (index == 6) {
								serial_status.innerHTML += "<font color='" + colour + "'>" + "pose: " + value + "</font><br>";
								if (scrollControl === "auto") {
									serial_status.scrollTop = serial_status.scrollHeight;
								}
								Pose_event = value;
							}
						});
						console.log(chart_data_count);
						chart_data_count++;

						// store to db
						const dataToSave = [pressure1, pressure2, pressure3, differential, last5pointAvg, prev5pointAvg, state, onoff_event, predict_Pose, Pose_event];

						let combinedCommands = commandBuffer.join('; ');
						DBModule.save(dataToSave, combinedCommands).then(() => {
							console.log('Data saved');
							commandBuffer = []; // Clear buffer after saving
						}).catch(error => {
							console.error('Save error:', error);
						});
					}
				}
			}

			if ((colour === "green" || colour === LOG_SUCCESS_GREEN) && dataString.includes(',')) {
				parseProtocolMessage(dataString.trim());
			}
		}

		function logCommand(command) {
			const now = new Date();
			const timeString = now.getHours().toString().padStart(2, '0') + ':' +
				now.getMinutes().toString().padStart(2, '0') + ':' +
				now.getSeconds().toString().padStart(2, '0') + '.' +
				now.getMilliseconds().toString().padStart(3, '0');

			commandBuffer.push(`${command} @${timeString}`);
			console.log('Command buffered: ' + command);
		}

		function queueBleWrite(message) {
			if (!rxCharacteristic) {
				return;
			}
			const encoder = new TextEncoder();
			bleQueue.add(async () => {
				await rxCharacteristic.writeValue(encoder.encode(message));
			});
		}

		function normalizeCommand(command) {
			return command.endsWith("\n") ? command : `${command}\n`;
		}

		function sendCommand(cmdStr, options = {}) {
			const { track = true, show = true } = options;
			if (!rxCharacteristic) {
				return;
			}
			const msg = normalizeCommand(cmdStr);
			const logText = msg.replace(/[\r\n]+$/, '');
			if (track) {
				logCommand(logText);
			}
			if (show) {
				serial_message(logText, "orange");
			}
			queueBleWrite(msg);
		}

		function sendSilentCommand(cmdStr) {
			if (!rxCharacteristic || !serial_ready) {
				return;
			}
			sendCommand(cmdStr, { track: false, show: false });
		}

		var func_count = 0;
		setInterval(function () {
			if (!rxCharacteristic || !serial_ready) {
				return;
			}

			sendSilentCommand("P");
			if (func_count++ % 2 === 0) {
				sendSilentCommand("I");
			}

			if (workflowState === WORKFLOW.SUPINE || workflowState === WORKFLOW.SIDE || pendingAnchorTarget) {
				sendSilentCommand("ANCHOR,STATUS");
				if (anchorPollingTarget === "BSHS" || anchorPollingTarget === "BLHL") {
					sendSilentCommand(`ANCHOR,GET,${anchorPollingTarget}`);
				}
			}

			if (classifyStarted) {
				sendSilentCommand("CLASSIFY,GET");
				sendSilentCommand("PRED,GET");
			}

			const nowMs = Date.now();
			if (nowMs - lastHeightDebugPollMs >= HEIGHT_DEBUG_POLL_MS) {
				lastHeightDebugPollMs = nowMs;
				requestSilentDebugSnapshot();
			}
		}, 1000);
		let selectedCondition = null;
		const numberInput1 = document.getElementById('numberInput1');
		const numberInput2 = document.getElementById('numberInput2');
		const numberInput3 = document.getElementById('numberInput3');
		const numberInput4 = document.getElementById('numberInput4');

		document.addEventListener('DOMContentLoaded', function () {
			setupAppLayoutResizer();
			syncAppLayoutWidth();
			setWorkflowState(WORKFLOW.UNCALIBRATED);
			refreshAnchorBadgeUI();
			captureWizardModule = createCaptureWizardModule();
			captureWizardModule.init();

			const userAccordionToggle = document.getElementById('userAccordionToggle');
			const userAccordionBody = document.getElementById('userAccordionBody');
			const statusAccordionToggle = document.getElementById('statusAccordionToggle');
			const statusAccordionBody = document.getElementById('statusAccordionBody');
			const captureAccordionToggle = document.getElementById('captureAccordionToggle');
			const captureAccordionBody = document.getElementById('captureAccordionBody');

			function getSavedAccordionState(key) {
				try {
					return localStorage.getItem(key);
				} catch (error) {
					return null;
				}
			}

			function saveAccordionState(key, expanded) {
				try {
					localStorage.setItem(key, expanded ? '1' : '0');
				} catch (error) {
					// Some file/browser contexts block localStorage; the accordion should still work.
				}
			}

			function setAccordionExpanded(toggleNode, bodyNode, storageKey, expanded) {
				if (!toggleNode || !bodyNode) {
					return;
				}
				bodyNode.classList.toggle('is-collapsed', !expanded);
				toggleNode.setAttribute('aria-expanded', expanded ? 'true' : 'false');
				toggleNode.textContent = expanded ? '收合' : '展開';
				saveAccordionState(storageKey, expanded);
			}

			const savedUserAccordionState = getSavedAccordionState('userAccordionExpanded');
			setAccordionExpanded(userAccordionToggle, userAccordionBody, 'userAccordionExpanded', savedUserAccordionState !== '0');
			userAccordionToggle?.addEventListener('click', function () {
				const expanded = userAccordionToggle.getAttribute('aria-expanded') === 'true';
				setAccordionExpanded(userAccordionToggle, userAccordionBody, 'userAccordionExpanded', !expanded);
			});

			const savedStatusAccordionState = getSavedAccordionState('statusAccordionExpanded');
			setAccordionExpanded(statusAccordionToggle, statusAccordionBody, 'statusAccordionExpanded', savedStatusAccordionState !== '0');
			statusAccordionToggle?.addEventListener('click', function () {
				const expanded = statusAccordionToggle.getAttribute('aria-expanded') === 'true';
				setAccordionExpanded(statusAccordionToggle, statusAccordionBody, 'statusAccordionExpanded', !expanded);
			});

			const savedCaptureAccordionState = getSavedAccordionState('captureAccordionExpanded');
			setAccordionExpanded(captureAccordionToggle, captureAccordionBody, 'captureAccordionExpanded', savedCaptureAccordionState !== '0');
			captureAccordionToggle?.addEventListener('click', function () {
				const expanded = captureAccordionToggle.getAttribute('aria-expanded') === 'true';
				setAccordionExpanded(captureAccordionToggle, captureAccordionBody, 'captureAccordionExpanded', !expanded);
			});

			const modal = document.getElementById('modal');
			const openModalBtn = document.getElementById('openModalBtn');
			const switchScreenBtn1 = document.getElementById('switchScreenBtn1');
			const switchScreenBtn2 = document.getElementById('switchScreenBtn2');
			const backBtn1 = document.getElementById('backBtn1');
			const backBtn2 = document.getElementById('backBtn2');
			const closeBtn = document.getElementById('closeBtn');
			const screen1 = document.getElementById('screen1');
			const screen2 = document.getElementById('screen2');
			const screen3 = document.getElementById('screen3');
			const radioForm = document.getElementById('radioForm');

			const increaseBtn1 = document.getElementById('increaseBtn1');
			const decreaseBtn1 = document.getElementById('decreaseBtn1');
			const increaseBtn2 = document.getElementById('increaseBtn2');
			const decreaseBtn2 = document.getElementById('decreaseBtn2');
			const increaseBtn3 = document.getElementById('increaseBtn3');
			const decreaseBtn3 = document.getElementById('decreaseBtn3');
			const increaseBtn4 = document.getElementById('increaseBtn4');
			const decreaseBtn4 = document.getElementById('decreaseBtn4');
			const confirmSupineAdjustBtn = document.getElementById('confirmSupineAdjustBtn');
			const confirmSideAdjustBtn = document.getElementById('confirmSideAdjustBtn');
			const microSupineHint = document.getElementById('microSupineHint');
			const microSideHint = document.getElementById('microSideHint');

			monitorClearLog?.addEventListener('click', function () {
				if (heightPressureLog) {
					heightPressureLog.innerHTML = "";
				}
			});

			setModeUi(controlMode);
			manualModeBtn?.addEventListener('click', () => sendModeCommands(CONTROL_MODE.MANUAL));
			autoModeBtn?.addEventListener('click', () => sendModeCommands(CONTROL_MODE.AUTO));

			configureHeightInput(numberInput1, "HEAD");
			configureHeightInput(numberInput2, "NECK");
			configureHeightInput(numberInput3, "HEAD");
			configureHeightInput(numberInput4, "NECK");
			configureHeightInput(manualStartupHead, "HEAD");
			configureHeightInput(manualStartupNeck, "NECK");

			document.getElementById('espManualEnterBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,ENTER", "進入 ESP32 Manual 指令已送出");
			});
			document.getElementById('espManualStopBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,STOP", "停止輸出指令已送出");
			});
			document.getElementById('monitorFillBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,FILL,MONITOR", "Monitor 充氣指令已送出");
			});
			document.getElementById('monitorDrainBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,DRAIN,MONITOR", "Monitor 吸氣指令已送出");
			});
			document.getElementById('neckFillBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,FILL,NECK", "Neck 充氣指令已送出");
			});
			document.getElementById('neckDrainBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,DRAIN,NECK", "Neck 吸氣指令已送出");
			});
			document.getElementById('headFillBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,FILL,HEAD", "Head 充氣指令已送出");
			});
			document.getElementById('headDrainBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,DRAIN,HEAD", "Head 吸氣指令已送出");
			});
			document.getElementById('allDrainBtn')?.addEventListener('click', function () {
				sendEspManualCommand("MANUAL,DRAIN,ALL", "全部同時洩氣指令已送出");
			});
			document.getElementById('manualStartupBtn')?.addEventListener('click', function () {
				const head = setHeightInputValue(manualStartupHead, manualStartupHead?.value, "HEAD");
				const neck = setHeightInputValue(manualStartupNeck, manualStartupNeck?.value, "NECK");
				resetAutoControlStartState();
				sendEspManualCommand(`MANUAL,STARTUP,${head},${neck}`, "回開機流程指令已送出");
			});

			const microDirty = { S: false, L: false };

			function markMicroDirty(mode, dirty = true) {
				microDirty[mode] = dirty;
				const hint = mode === "S" ? microSupineHint : microSideHint;
				if (hint) {
					hint.textContent = dirty ? "高度已暫存，按「確定調整」後才會送到 ESP32。" : "高度已送出。";
				}
			}

			function stepHeightInput(inputNode, delta, channel, markDirty) {
				if (!inputNode) {
					return;
				}
				const next = clampHeightValue(Number(inputNode.value) + delta, channel);
				setHeightInputValue(inputNode, next, channel);
				if (markDirty) {
					markDirty();
				}
			}

			function sendHeightPair(condition, mode, headInput, neckInput, markClean) {
				const head = setHeightInputValue(headInput, headInput?.value, "HEAD");
				const neck = setHeightInputValue(neckInput, neckInput?.value, "NECK");
				if (!head || !neck) {
					return false;
				}
				sendCommand(`SET,NORM,${condition},${mode},HEAD,${head}`);
				sendCommand(`SET,NORM,${condition},${mode},NECK,${neck}`);
				if (markClean) {
					markClean();
				}
				return true;
			}

			openModalBtn.addEventListener('click', function () {
				modal.style.display = 'block';
				screen1.style.display = 'block';
				screen2.style.display = 'none';
				screen3.style.display = 'none';
				sendCommand("DEBUG");
			});

			switchScreenBtn1.addEventListener('click', function () {
				selectedCondition = radioForm.querySelector('input[name="condition"]:checked')?.value;
				console.log("selectedCondition:" + selectedCondition);
				screen1.style.display = 'none';
				screen2.style.display = 'block';
				screen3.style.display = 'none';
				sendCommand("INIT,NORM,S");
				if (parsedData.HSF) setHeightInputValue(numberInput1, parsedData.HSF, "HEAD");
				if (parsedData.N1SF) setHeightInputValue(numberInput2, parsedData.N1SF, "NECK");
				markMicroDirty("S", false);
			});

			switchScreenBtn2.addEventListener('click', function () {
				if (microDirty.S) {
					serial_message("請先按「確定調整仰躺高度」再切換到側躺畫面。", "orange");
					return;
				}
				sendCommand("INIT,NORM,L");
				setTimeout(() => {

					screen1.style.display = 'none';
					screen2.style.display = 'none';
					screen3.style.display = 'block';
					if (parsedData.HLF) setHeightInputValue(numberInput3, parsedData.HLF, "HEAD");
					if (parsedData.N1LF) setHeightInputValue(numberInput4, parsedData.N1LF, "NECK");
					markMicroDirty("L", false);
				}, 1000); // 等待1秒钟

			});

			backBtn1.addEventListener('click', function () {
				screen1.style.display = 'block';
				screen2.style.display = 'none';
				screen3.style.display = 'none';
			});

			backBtn2.addEventListener('click', function () {
				screen1.style.display = 'none';
				screen2.style.display = 'block';
				screen3.style.display = 'none';
			});

			closeBtn.addEventListener('click', function () {
				if (microDirty.L) {
					serial_message("請先按「確定調整側躺高度」再結束。", "orange");
					return;
				}
				modal.style.display = 'none';
				sendCommand("SET,OK");
			});

			increaseBtn1.addEventListener('click', function () {
				stepHeightInput(numberInput1, HEIGHT_STEP, "HEAD", () => markMicroDirty("S"));
			});

			decreaseBtn1.addEventListener('click', function () {
				stepHeightInput(numberInput1, -HEIGHT_STEP, "HEAD", () => markMicroDirty("S"));
			});

			increaseBtn2.addEventListener('click', function () {
				stepHeightInput(numberInput2, HEIGHT_STEP, "NECK", () => markMicroDirty("S"));
			});

			decreaseBtn2.addEventListener('click', function () {
				stepHeightInput(numberInput2, -HEIGHT_STEP, "NECK", () => markMicroDirty("S"));
			});

			increaseBtn3.addEventListener('click', function () {
				stepHeightInput(numberInput3, HEIGHT_STEP, "HEAD", () => markMicroDirty("L"));
			});

			decreaseBtn3.addEventListener('click', function () {
				stepHeightInput(numberInput3, -HEIGHT_STEP, "HEAD", () => markMicroDirty("L"));
			});

			increaseBtn4.addEventListener('click', function () {
				stepHeightInput(numberInput4, HEIGHT_STEP, "NECK", () => markMicroDirty("L"));
			});

			decreaseBtn4.addEventListener('click', function () {
				stepHeightInput(numberInput4, -HEIGHT_STEP, "NECK", () => markMicroDirty("L"));
			});

			confirmSupineAdjustBtn?.addEventListener('click', function () {
				sendHeightPair(selectedCondition || "1", "S", numberInput1, numberInput2, () => markMicroDirty("S", false));
			});

			confirmSideAdjustBtn?.addEventListener('click', function () {
				sendHeightPair(selectedCondition || "1", "L", numberInput3, numberInput4, () => markMicroDirty("L", false));
			});

			[numberInput1, numberInput2].forEach(input => input?.addEventListener('input', () => markMicroDirty("S")));
			[numberInput3, numberInput4].forEach(input => input?.addEventListener('input', () => markMicroDirty("L")));

			const calibModal = document.getElementById('calibModal');
			const openCalibBtn = document.getElementById('openCalibBtn');
			const closeCalibModalBtn = document.getElementById('closeCalibModalBtn');
			const calibMenuScreen = document.getElementById('calibMenuScreen');
			const supineCalibScreen = document.getElementById('supineCalibScreen');
			const sideCalibScreen = document.getElementById('sideCalibScreen');
			const calibConditionForm = document.getElementById('calibConditionForm');
			const startSupineCalibBtn = document.getElementById('startSupineCalibBtn');
			const startSideCalibBtn = document.getElementById('startSideCalibBtn');
			const backSupineCalibBtn = document.getElementById('backSupineCalibBtn');
			const backSideCalibBtn = document.getElementById('backSideCalibBtn');
			const completeSupineCalibBtn = document.getElementById('completeSupineCalibBtn');
			const completeSideCalibBtn = document.getElementById('completeSideCalibBtn');
			const supineHeadInput = document.getElementById('supineHeadInput');
			const supineNeckInput = document.getElementById('supineNeckInput');
			const sideHeadInput = document.getElementById('sideHeadInput');
			const sideNeckInput = document.getElementById('sideNeckInput');
			const supineCalibHint = document.getElementById('supineCalibHint');
			const sideCalibHint = document.getElementById('sideCalibHint');
			const confirmSupineCalibAdjustBtn = document.getElementById('confirmSupineCalibAdjustBtn');
			const confirmSideCalibAdjustBtn = document.getElementById('confirmSideCalibAdjustBtn');

			configureHeightInput(supineHeadInput, "HEAD");
			configureHeightInput(supineNeckInput, "NECK");
			configureHeightInput(sideHeadInput, "HEAD");
			configureHeightInput(sideNeckInput, "NECK");

			const calibDirty = { S: false, L: false };

			function markCalibDirty(mode, dirty = true) {
				calibDirty[mode] = dirty;
				const hint = mode === "S" ? supineCalibHint : sideCalibHint;
				if (hint && dirty) {
					hint.textContent = "高度已暫存，按「確定調整」後才會送到 ESP32。";
				}
			}

			function showCalibScreen(name) {
				if (!calibMenuScreen || !supineCalibScreen || !sideCalibScreen) {
					return;
				}
				calibMenuScreen.style.display = (name === 'menu') ? 'block' : 'none';
				supineCalibScreen.style.display = (name === 'supine') ? 'block' : 'none';
				sideCalibScreen.style.display = (name === 'side') ? 'block' : 'none';
			}

			function getCalibCondition() {
				return calibConditionForm?.querySelector('input[name="calibCondition"]:checked')?.value || "1";
			}

			function applyParsedDataToCalib() {
				if (parsedData.HSF && supineHeadInput) setHeightInputValue(supineHeadInput, parsedData.HSF, "HEAD");
				if (parsedData.N1SF && supineNeckInput) setHeightInputValue(supineNeckInput, parsedData.N1SF, "NECK");
				if (parsedData.HLF && sideHeadInput) setHeightInputValue(sideHeadInput, parsedData.HLF, "HEAD");
				if (parsedData.N1LF && sideNeckInput) setHeightInputValue(sideNeckInput, parsedData.N1LF, "NECK");
			}

			function makeStepHandler(inputNode, step, mode, channel) {
				return function () {
					stepHeightInput(inputNode, step, channel, () => markCalibDirty(mode));
				};
			}

			document.getElementById('supineHeadPlus')?.addEventListener('click', makeStepHandler(supineHeadInput, HEIGHT_STEP, "S", "HEAD"));
			document.getElementById('supineHeadMinus')?.addEventListener('click', makeStepHandler(supineHeadInput, -HEIGHT_STEP, "S", "HEAD"));
			document.getElementById('supineNeckPlus')?.addEventListener('click', makeStepHandler(supineNeckInput, HEIGHT_STEP, "S", "NECK"));
			document.getElementById('supineNeckMinus')?.addEventListener('click', makeStepHandler(supineNeckInput, -HEIGHT_STEP, "S", "NECK"));
			document.getElementById('sideHeadPlus')?.addEventListener('click', makeStepHandler(sideHeadInput, HEIGHT_STEP, "L", "HEAD"));
			document.getElementById('sideHeadMinus')?.addEventListener('click', makeStepHandler(sideHeadInput, -HEIGHT_STEP, "L", "HEAD"));
			document.getElementById('sideNeckPlus')?.addEventListener('click', makeStepHandler(sideNeckInput, HEIGHT_STEP, "L", "NECK"));
			document.getElementById('sideNeckMinus')?.addEventListener('click', makeStepHandler(sideNeckInput, -HEIGHT_STEP, "L", "NECK"));

			[supineHeadInput, supineNeckInput].forEach(input => input?.addEventListener('input', () => markCalibDirty("S")));
			[sideHeadInput, sideNeckInput].forEach(input => input?.addEventListener('input', () => markCalibDirty("L")));

			confirmSupineCalibAdjustBtn?.addEventListener('click', function () {
				if (sendHeightPair(getCalibCondition(), "S", supineHeadInput, supineNeckInput, () => {
					calibDirty.S = false;
				}) && supineCalibHint) {
					supineCalibHint.textContent = "仰躺高度已送出，可按完成校正擷取 BSHS。";
				}
			});

			confirmSideCalibAdjustBtn?.addEventListener('click', function () {
				if (sendHeightPair(getCalibCondition(), "L", sideHeadInput, sideNeckInput, () => {
					calibDirty.L = false;
				}) && sideCalibHint) {
					sideCalibHint.textContent = "側躺高度已送出，可按完成校正擷取 BLHL。";
				}
			});

			openCalibBtn?.addEventListener('click', function () {
				if (!serial_ready) {
					serial_message("請先連線 BLE 後再進行初始校正。", "red");
					return;
				}
				calibModal.style.display = 'block';
				showCalibScreen('menu');
				sendCommand("DEBUG");
				applyParsedDataToCalib();
			});

			closeCalibModalBtn?.addEventListener('click', function () {
				if (pendingAnchorTarget) {
					serial_message("校正進行中，請等待 ANCHOR 完成。", "orange");
					return;
				}
				stopSideStandbyWatch();
				calibModal.style.display = 'none';
			});

			startSupineCalibBtn?.addEventListener('click', function () {
				setWorkflowState(WORKFLOW.SUPINE);
				anchorPollingTarget = "BSHS";
				awaitingInitMode = "S";
				showCalibScreen('supine');
				if (supineCalibHint) {
					supineCalibHint.textContent = "完成校正會送出 ANCHOR,START,BSHS。";
				}
				calibDirty.S = false;
				sendCommand("INIT,NORM,S");
				sendCommand("DEBUG");
				applyParsedDataToCalib();
			});

			startSideCalibBtn?.addEventListener('click', function () {
				setWorkflowState(WORKFLOW.SIDE);
				anchorPollingTarget = "BLHL";
				awaitingInitMode = "L";
				showCalibScreen('side');
				enableSideCalibrationControls(false);
				sideStandbyWatchActive = true;
				sideStandbyConsecutive = 0;
				if (sideCalibHint) {
					sideCalibHint.textContent = "等待 state==STANDBY 連續 2 筆後開放微調。";
				}
				calibDirty.L = false;
				if (sideStandbyTimer) {
					clearTimeout(sideStandbyTimer);
				}
				sideStandbyTimer = setTimeout(() => {
					if (sideStandbyWatchActive) {
						stopSideStandbyWatch();
						enableSideCalibrationControls(true);
						if (sideCalibHint) {
							sideCalibHint.textContent = "超過 8 秒仍未到位，已開放人工微調。";
						}
						serial_message("側躺等待逾時，改為人工微調。", "orange");
					}
				}, 8000);

				sendCommand("INIT,NORM,L");
				sendCommand("DEBUG");
				applyParsedDataToCalib();
			});

			backSupineCalibBtn?.addEventListener('click', function () {
				if (pendingAnchorTarget === "BSHS") {
					serial_message("BSHS 校正中，請先等待結果。", "orange");
					return;
				}
				showCalibScreen('menu');
			});

			backSideCalibBtn?.addEventListener('click', function () {
				if (pendingAnchorTarget === "BLHL") {
					serial_message("BLHL 校正中，請先等待結果。", "orange");
					return;
				}
				stopSideStandbyWatch();
				showCalibScreen('menu');
			});

			completeSupineCalibBtn?.addEventListener('click', function () {
				if (calibDirty.S) {
					serial_message("請先按「確定調整仰躺高度」再完成校正。", "orange");
					if (supineCalibHint) {
						supineCalibHint.textContent = "高度尚未送出，請先按確定調整。";
					}
					return;
				}
				pendingAnchorTarget = "BSHS";
				if (supineCalibHint) {
					supineCalibHint.textContent = "正在擷取 BSHS anchor，請保持姿勢。";
				}
				sendCommand("SET,OK");
				sendCommand("ANCHOR,START,BSHS");
			});

			completeSideCalibBtn?.addEventListener('click', function () {
				if (calibDirty.L) {
					serial_message("請先按「確定調整側躺高度」再完成校正。", "orange");
					if (sideCalibHint) {
						sideCalibHint.textContent = "高度尚未送出，請先按確定調整。";
					}
					return;
				}
				pendingAnchorTarget = "BLHL";
				if (sideCalibHint) {
					sideCalibHint.textContent = "正在擷取 BLHL anchor，請保持姿勢。";
				}
				sendCommand("SET,OK");
				sendCommand("ANCHOR,START,BLHL");
			});

			window.addEventListener('click', function (event) {
				if (event.target === modal) {
					modal.style.display = 'none';
				}
				if (event.target === calibModal) {
					if (pendingAnchorTarget) {
						serial_message("校正進行中，請等待 ANCHOR 完成。", "orange");
						return;
					}
					stopSideStandbyWatch();
					calibModal.style.display = 'none';
				}
			});
		});
