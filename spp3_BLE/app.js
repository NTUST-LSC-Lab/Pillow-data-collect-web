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
			let userForm = document.getElementById('userForm');
			let userSetAck = document.getElementById('userSetAck');
			let userDimensionSummary = document.getElementById('userDimensionSummary');
			let syncTimeAck = document.getElementById('syncTimeAck');
			let espManualStatus = document.getElementById('espManualStatus');
			let espManualAck = document.getElementById('espManualAck');
		let manualStartupHead = document.getElementById('manualStartupHead');
		let manualStartupNeck = document.getElementById('manualStartupNeck');
		let appLayout = document.getElementById('appLayout');
		let chartPanelBody = document.getElementById('chartPanelBody');
		let chartPanelToggle = document.getElementById('chartPanelToggle');
		let chartPanelStateBadge = document.getElementById('chartPanelStateBadge');
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

		chartModePressure?.addEventListener('click', () => setChartMode("pressure"));
		chartModeAll?.addEventListener('click', () => setChartMode("all"));
		chartModeSummary?.addEventListener('click', () => setChartMode("summary"));

		[pressureChartSection, averageChartSection, diffChartSection].forEach(section => {
			section?.addEventListener('toggle', refreshVisibleCharts);
		});

		const savedChartMode = getSavedChartSetting('chartMode');
		const savedChartExpanded = getSavedChartSetting('chartPanelExpanded');
		setChartMode(savedChartMode === "all" || savedChartMode === "summary" ? savedChartMode : "pressure", false);
		if (savedChartExpanded === '0') {
			setChartMode("summary", false);
		}

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
						if (userForm && typeof userForm.reportValidity === "function" && !userForm.reportValidity()) {
							return;
						}
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
		let pendingMicroClose = false;

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
		const ACTIVE_AIRFLOW_STATES = new Set([
			"DRAIN_ALL",
			"FILL_MONITOR",
			"FILL_NECK",
			"FILL_HEAD",
			"ADJUSTING_HEIGHT",
			"RESET_MONITOR",
			"REFILL_MONITOR"
		]);

		function getSystemStateName(rawState) {
			const index = Number(rawState);
			if (!Number.isFinite(index)) {
				return "";
			}
			return SystemState[index] || "";
		}

		function flushPendingMicroCloseIfSafe(stateName) {
			if (!pendingMicroClose) {
				return;
			}
			const currentStateName = stateName || getSystemStateName(state);
			if (ACTIVE_AIRFLOW_STATES.has(currentStateName)) {
				return;
			}
			pendingMicroClose = false;
			sendCommand("SET,OK");
			serial_message("已完成目前動作，送出 SET,OK。", "blue");
		}

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
			NECK: { min: 10, max: 14 }
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
			const ids = [
				'sideHeadInput',
				'sideNeckInput',
				'sideHeadPlus',
				'sideHeadMinus',
				'sideNeckPlus',
				'sideNeckMinus',
				'confirmSideHeadAdjustBtn',
				'confirmSideNeckAdjustBtn'
			];
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
				`${new Date().toLocaleTimeString()} 壓力 Monitor=${formatPressureValue(values[0])} Head=${formatPressureValue(values[2])} Neck=${formatPressureValue(values[1])}`
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

		function formatSerialDisplayMessage(msg) {
			const rawText = String(msg).replace(/\r?\n/g, '').trim();
			const dataPoints = rawText.split(/[\s,]+/).filter(Boolean);
			if (!dataPoints.length || !dataPoints[0].startsWith("P:")) {
				return rawText;
			}

			let monitorValue = "";
			let neckValue = "";
			let headValue = "";
			if (dataPoints[0] === "P:") {
				[monitorValue = "", neckValue = "", headValue = ""] = dataPoints.slice(1, 4);
			} else {
				monitorValue = dataPoints[0].substring(2);
				[neckValue = "", headValue = ""] = dataPoints.slice(1, 3);
			}

			if (!monitorValue || !neckValue || !headValue) {
				return rawText;
			}
			return `P:${monitorValue} ${headValue} ${neckValue}`;
		}

			function updateHeightMonitorFromParsed(source) {
				updateHeightMonitorFromValues(
					source,
					parsedData.headNumber,
					parsedData.neckNumber,
					parsedData.currentHeadNumber,
					parsedData.currentNeckNumber
				);
				updateUserDimensionsFromParsed();
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
							updateCalibAnchorButtonState(target === "BSHS" ? "S" : "L");
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
					const timeoutMode = pendingAnchorTarget === "BSHS" ? "S" : "L";
					const hint = document.getElementById(pendingAnchorTarget === "BSHS" ? 'supineCalibHint' : 'sideCalibHint');
					if (hint) {
						hint.textContent = "校正逾時，請重試。";
					}
					if (pendingAnchorTarget === "BLHL") {
						stopSideStandbyWatch();
						enableSideCalibrationControls(true);
					}
					pendingAnchorTarget = null;
					updateCalibAnchorButtonState(timeoutMode);
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
					}
					awaitingInitMode = null;
				}
		}

		function serial_message(msg, colour, show = true) {
			const displayMsg = formatSerialDisplayMessage(msg);
			const safeMsg = displayMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
								const stateName = getSystemStateName(state) || "UNKNOWN (" + state + ")";
								const stateDisplay = document.getElementById('systemStateDisplay');
								if (stateDisplay) stateDisplay.value = stateName;
								if (stateName === "MANUAL_CONTROL") {
									setEspManualUi(true);
								} else if (espManualStatus?.textContent === "ESP32 Manual") {
									setEspManualUi(false);
								}
								flushPendingMicroCloseIfSafe(stateName);

								if (sideStandbyWatchActive) {
									if (Number(state) === 5) {
										sideStandbyConsecutive += 1;
										if (sideStandbyConsecutive >= 2) {
											stopSideStandbyWatch();
											enableSideCalibrationControls(true);
											const sideHint = document.getElementById('sideCalibHint');
											if (sideHint) {
												sideHint.textContent = "已進入 STANDBY，現在可微調，請分別確認頭部與頸部高度。";
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
				setWorkflowState(WORKFLOW.UNCALIBRATED);
				refreshAnchorBadgeUI();

				const statusAccordionToggle = document.getElementById('statusAccordionToggle');
				const statusAccordionBody = document.getElementById('statusAccordionBody');
				const userAccordionToggle = document.getElementById('userAccordionToggle');
				const userAccordionBody = document.getElementById('userAccordionBody');
				const monitorAccordionToggle = document.getElementById('monitorAccordionToggle');
				const monitorAccordionBody = document.getElementById('monitorAccordionBody');
				const serialAccordionToggle = document.getElementById('serialAccordionToggle');
				const serialAccordionBody = document.getElementById('serialAccordionBody');

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

				const savedAccordionState = getSavedAccordionState('statusAccordionExpanded');
				setAccordionExpanded(statusAccordionToggle, statusAccordionBody, 'statusAccordionExpanded', savedAccordionState !== '0');
				statusAccordionToggle?.addEventListener('click', function () {
					const expanded = statusAccordionToggle.getAttribute('aria-expanded') === 'true';
					setAccordionExpanded(statusAccordionToggle, statusAccordionBody, 'statusAccordionExpanded', !expanded);
				});

				const savedUserAccordionState = getSavedAccordionState('userAccordionExpanded');
				setAccordionExpanded(userAccordionToggle, userAccordionBody, 'userAccordionExpanded', savedUserAccordionState !== '0');
				userAccordionToggle?.addEventListener('click', function () {
					const expanded = userAccordionToggle.getAttribute('aria-expanded') === 'true';
					setAccordionExpanded(userAccordionToggle, userAccordionBody, 'userAccordionExpanded', !expanded);
				});

				const savedMonitorAccordionState = getSavedAccordionState('monitorAccordionExpanded');
				setAccordionExpanded(monitorAccordionToggle, monitorAccordionBody, 'monitorAccordionExpanded', savedMonitorAccordionState !== '0');
				monitorAccordionToggle?.addEventListener('click', function () {
					const expanded = monitorAccordionToggle.getAttribute('aria-expanded') === 'true';
					setAccordionExpanded(monitorAccordionToggle, monitorAccordionBody, 'monitorAccordionExpanded', !expanded);
				});

				const savedSerialAccordionState = getSavedAccordionState('serialAccordionExpanded');
				setAccordionExpanded(serialAccordionToggle, serialAccordionBody, 'serialAccordionExpanded', savedSerialAccordionState !== '0');
				serialAccordionToggle?.addEventListener('click', function () {
					const expanded = serialAccordionToggle.getAttribute('aria-expanded') === 'true';
					setAccordionExpanded(serialAccordionToggle, serialAccordionBody, 'serialAccordionExpanded', !expanded);
				});

				const modal = document.getElementById('modal');
				const openModalBtn = document.getElementById('openModalBtn');
				const switchScreenBtn1 = document.getElementById('switchScreenBtn1');
				const backBtn1 = document.getElementById('backBtn1');
				const closeBtn = document.getElementById('closeBtn');
				const screen1 = document.getElementById('screen1');
				const screen2 = document.getElementById('screen2');
				const radioForm = document.getElementById('radioForm');

				const increaseBtn1 = document.getElementById('increaseBtn1');
				const decreaseBtn1 = document.getElementById('decreaseBtn1');
				const increaseBtn2 = document.getElementById('increaseBtn2');
				const decreaseBtn2 = document.getElementById('decreaseBtn2');
				const confirmHeadAdjustBtn = document.getElementById('confirmHeadAdjustBtn');
				const confirmNeckAdjustBtn = document.getElementById('confirmNeckAdjustBtn');
				const microSupineHint = document.getElementById('microSupineHint');

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

				const microDirty = { HEAD: false, NECK: false };
				const microConfirmed = { HEAD: false, NECK: false };

				function updateMicroHint() {
					if (!microSupineHint) {
						return;
					}
					const hasDirty = microDirty.HEAD || microDirty.NECK;
					microSupineHint.textContent = hasDirty ? "高度已暫存，請分別按確認送出到 ESP32。" : "高度已送出。";
				}

				function markMicroDirty(channel, dirty = true) {
					if (!Object.prototype.hasOwnProperty.call(microDirty, channel)) {
						return;
					}
					microDirty[channel] = dirty;
					if (dirty && Object.prototype.hasOwnProperty.call(microConfirmed, channel)) {
						microConfirmed[channel] = false;
					}
					updateMicroHint();
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

				function sendSingleHeight(condition, mode, channel, inputNode, markClean) {
					const normalizedChannel = channel === "NECK" ? "NECK" : "HEAD";
					const value = setHeightInputValue(inputNode, inputNode?.value, normalizedChannel);
					if (!value) {
						return false;
					}
					sendCommand(`SET,NORM,${condition},${mode},${normalizedChannel},${value}`);
					if (markClean) {
						markClean();
					}
					return true;
				}

				openModalBtn?.addEventListener('click', function () {
					modal.style.display = 'block';
					screen1.style.display = 'block';
					screen2.style.display = 'none';
					sendCommand("DEBUG");
				});

				switchScreenBtn1?.addEventListener('click', function () {
					selectedCondition = radioForm.querySelector('input[name="condition"]:checked')?.value;
					console.log("selectedCondition:" + selectedCondition);
					screen1.style.display = 'none';
					screen2.style.display = 'block';
					sendCommand("INIT,NORM,S");
					if (parsedData.HSF) setHeightInputValue(numberInput1, parsedData.HSF, "HEAD");
					if (parsedData.N1SF) setHeightInputValue(numberInput2, parsedData.N1SF, "NECK");
					markMicroDirty("HEAD", false);
					markMicroDirty("NECK", false);
					microConfirmed.HEAD = false;
					microConfirmed.NECK = false;
					if (microSupineHint) {
						microSupineHint.textContent = "請先分別按確認，才會送出高度到 ESP32。";
					}
				});

				backBtn1?.addEventListener('click', function () {
					screen1.style.display = 'block';
					screen2.style.display = 'none';
				});

				closeBtn?.addEventListener('click', function () {
					const hasPendingMicroAdjust = microDirty.HEAD || microDirty.NECK || !microConfirmed.HEAD || !microConfirmed.NECK;
					modal.style.display = 'none';

					if (!rxCharacteristic || !serial_ready) {
						pendingMicroClose = false;
						if (hasPendingMicroAdjust) {
							serial_message("已關閉微調畫面（目前未連線，未送出 SET,OK）。", "orange");
						}
						return;
					}

					pendingMicroClose = true;
					const stateName = getSystemStateName(state);
					if (ACTIVE_AIRFLOW_STATES.has(stateName)) {
						serial_message("已接收結束，正在抽/吸氣中；動作完成後會自動送出 SET,OK。", "orange");
						return;
					}
					flushPendingMicroCloseIfSafe(stateName);
				});

				increaseBtn1?.addEventListener('click', function () {
					stepHeightInput(numberInput1, HEIGHT_STEP, "HEAD", () => markMicroDirty("HEAD"));
				});

				decreaseBtn1?.addEventListener('click', function () {
					stepHeightInput(numberInput1, -HEIGHT_STEP, "HEAD", () => markMicroDirty("HEAD"));
				});

				increaseBtn2?.addEventListener('click', function () {
					stepHeightInput(numberInput2, HEIGHT_STEP, "NECK", () => markMicroDirty("NECK"));
				});

				decreaseBtn2?.addEventListener('click', function () {
					stepHeightInput(numberInput2, -HEIGHT_STEP, "NECK", () => markMicroDirty("NECK"));
				});

				confirmHeadAdjustBtn?.addEventListener('click', function () {
					if (sendSingleHeight(selectedCondition || "1", "S", "HEAD", numberInput1, () => markMicroDirty("HEAD", false))) {
						microConfirmed.HEAD = true;
						updateMicroHint();
					}
				});

				confirmNeckAdjustBtn?.addEventListener('click', function () {
					if (sendSingleHeight(selectedCondition || "1", "S", "NECK", numberInput2, () => markMicroDirty("NECK", false))) {
						microConfirmed.NECK = true;
						updateMicroHint();
					}
				});

				numberInput1?.addEventListener('input', () => markMicroDirty("HEAD"));
				numberInput2?.addEventListener('input', () => markMicroDirty("NECK"));

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
			const confirmSupineHeadAdjustBtn = document.getElementById('confirmSupineHeadAdjustBtn');
			const confirmSupineNeckAdjustBtn = document.getElementById('confirmSupineNeckAdjustBtn');
			const confirmSideHeadAdjustBtn = document.getElementById('confirmSideHeadAdjustBtn');
			const confirmSideNeckAdjustBtn = document.getElementById('confirmSideNeckAdjustBtn');

			configureHeightInput(supineHeadInput, "HEAD");
			configureHeightInput(supineNeckInput, "NECK");
			configureHeightInput(sideHeadInput, "HEAD");
			configureHeightInput(sideNeckInput, "NECK");

			const calibDirty = {
				S: { HEAD: false, NECK: false },
				L: { HEAD: false, NECK: false }
			};
			const calibConfirmed = {
				S: { HEAD: false, NECK: false },
				L: { HEAD: false, NECK: false }
			};

			function getCalibHintNode(mode) {
				return mode === "S" ? supineCalibHint : sideCalibHint;
			}

			function getCalibAnchorName(mode) {
				return mode === "S" ? "BSHS" : "BLHL";
			}

			function getCalibAnchorButton(mode) {
				return mode === "S" ? completeSupineCalibBtn : completeSideCalibBtn;
			}

			function getCalibChannelLabel(channel) {
				return channel === "NECK" ? "頸部" : "頭部";
			}

			function isCalibReadyForAnchor(mode) {
				return !calibDirty[mode].HEAD &&
					!calibDirty[mode].NECK &&
					calibConfirmed[mode].HEAD &&
					calibConfirmed[mode].NECK;
			}

			function updateCalibAnchorButtonState(mode) {
				const button = getCalibAnchorButton(mode);
				if (!button) {
					return;
				}
				const anchorName = getCalibAnchorName(mode);
				button.disabled = !isCalibReadyForAnchor(mode) || pendingAnchorTarget === anchorName;
			}

			function resetCalibState(mode) {
				calibDirty[mode].HEAD = false;
				calibDirty[mode].NECK = false;
				calibConfirmed[mode].HEAD = false;
				calibConfirmed[mode].NECK = false;
				updateCalibAnchorButtonState(mode);
			}

			function buildCalibAnchorBlockedHint(mode) {
				const dirtyChannels = ["HEAD", "NECK"].filter(channel => calibDirty[mode][channel]);
				if (dirtyChannels.length) {
					return `尚未送出${dirtyChannels.map(getCalibChannelLabel).join("與")}高度，請先按右側「確認」。`;
				}
				const pendingChannels = ["HEAD", "NECK"].filter(channel => !calibConfirmed[mode][channel]);
				if (pendingChannels.length) {
					return `請先確認${pendingChannels.map(getCalibChannelLabel).join("與")}高度，再送出 ${getCalibAnchorName(mode)} anchor。`;
				}
				return `${mode === "S" ? "仰躺" : "側躺"}頭/頸高度已送出，可按「確認送出 ${getCalibAnchorName(mode)} anchor」。`;
			}

			function updateCalibHint(mode, overrideText) {
				const hint = getCalibHintNode(mode);
				updateCalibAnchorButtonState(mode);
				if (!hint) {
					return;
				}
				if (typeof overrideText === "string") {
					hint.textContent = overrideText;
					return;
				}
				hint.textContent = buildCalibAnchorBlockedHint(mode);
			}

			function markCalibDirty(mode, channel, dirty = true) {
				if (!calibDirty[mode] || !Object.prototype.hasOwnProperty.call(calibDirty[mode], channel)) {
					return;
				}
				calibDirty[mode][channel] = dirty;
				if (dirty) {
					calibConfirmed[mode][channel] = false;
				}
				updateCalibHint(mode);
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
					stepHeightInput(inputNode, step, channel, () => markCalibDirty(mode, channel));
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

			supineHeadInput?.addEventListener('input', () => markCalibDirty("S", "HEAD"));
			supineNeckInput?.addEventListener('input', () => markCalibDirty("S", "NECK"));
			sideHeadInput?.addEventListener('input', () => markCalibDirty("L", "HEAD"));
			sideNeckInput?.addEventListener('input', () => markCalibDirty("L", "NECK"));

			confirmSupineHeadAdjustBtn?.addEventListener('click', function () {
				if (sendSingleHeight(getCalibCondition(), "S", "HEAD", supineHeadInput, () => markCalibDirty("S", "HEAD", false))) {
					calibConfirmed.S.HEAD = true;
					updateCalibHint("S");
				}
			});

			confirmSupineNeckAdjustBtn?.addEventListener('click', function () {
				if (sendSingleHeight(getCalibCondition(), "S", "NECK", supineNeckInput, () => markCalibDirty("S", "NECK", false))) {
					calibConfirmed.S.NECK = true;
					updateCalibHint("S");
				}
			});

			confirmSideHeadAdjustBtn?.addEventListener('click', function () {
				if (sendSingleHeight(getCalibCondition(), "L", "HEAD", sideHeadInput, () => markCalibDirty("L", "HEAD", false))) {
					calibConfirmed.L.HEAD = true;
					updateCalibHint("L");
				}
			});

			confirmSideNeckAdjustBtn?.addEventListener('click', function () {
				if (sendSingleHeight(getCalibCondition(), "L", "NECK", sideNeckInput, () => markCalibDirty("L", "NECK", false))) {
					calibConfirmed.L.NECK = true;
					updateCalibHint("L");
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
				resetCalibState("S");
				updateCalibHint("S");
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
				resetCalibState("L");
				updateCalibHint("L", "等待 state==STANDBY 連續 2 筆後開放微調，之後請分別確認頭部與頸部高度。");
				if (sideStandbyTimer) {
					clearTimeout(sideStandbyTimer);
				}
				sideStandbyTimer = setTimeout(() => {
					if (sideStandbyWatchActive) {
						stopSideStandbyWatch();
						enableSideCalibrationControls(true);
						if (sideCalibHint) {
							sideCalibHint.textContent = "超過 8 秒仍未到位，已開放人工微調，請分別確認頭部與頸部高度。";
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
				if (!isCalibReadyForAnchor("S")) {
					serial_message("請先分別確認仰躺頭部與頸部高度，再送出 BSHS anchor。", "orange");
					updateCalibHint("S", buildCalibAnchorBlockedHint("S"));
					return;
				}
				pendingAnchorTarget = "BSHS";
				updateCalibAnchorButtonState("S");
				if (supineCalibHint) {
					supineCalibHint.textContent = "正在擷取 BSHS anchor，請保持姿勢。";
				}
				sendCommand("SET,OK");
				sendCommand("ANCHOR,START,BSHS");
			});

			completeSideCalibBtn?.addEventListener('click', function () {
				if (!isCalibReadyForAnchor("L")) {
					serial_message("請先分別確認側躺頭部與頸部高度，再送出 BLHL anchor。", "orange");
					updateCalibHint("L", buildCalibAnchorBlockedHint("L"));
					return;
				}
				pendingAnchorTarget = "BLHL";
				updateCalibAnchorButtonState("L");
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
