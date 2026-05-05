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
					label: 'Detect',
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
			chart.update();
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
						const row = [item.timestamp, ...item.values, commandStr].join(',');
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
						serial_message(line, "green");
					}
				}
			} else {
				// Optional: Timeout to print partial data if no newline comes for a while
				clearTimeout(serial_timer);
				serial_timer = setTimeout(function () {
					if (serial_readSting != "") {
						serial_message(serial_readSting, "green");
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
				} catch (error) {
					serial_message(error.message, "red");
				}
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

					var msg = "USER," + infoString;
					logCommand(msg);
					serial_message(msg, "orange");
					serial_text.value = "";
					queueBleWrite(normalizeCommand(msg));
				} catch (error) {
					serial_message(error.message, "red");
				}
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
		const AUTO_START_MAX_ATTEMPTS = 3;
		const AUTO_START_RETRY_MS = 2500;

		function safeSetText(el, text) {
			if (el) {
				el.textContent = text;
			}
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
			const ids = ['sideHeadInput', 'sideNeckInput', 'sideHeadPlus', 'sideHeadMinus', 'sideNeckPlus', 'sideNeckMinus'];
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
					if (sideHeadInput) sideHeadInput.value = parts[2];
					if (sideNeckInput) sideNeckInput.value = parts[3];
				}
				awaitingInitMode = null;
			}
		}

		function serial_message(msg, colour) {
			const safeMsg = String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;");
			serial_status.insertAdjacentHTML('beforeend', "<font color='" + colour + "'>" + safeMsg + "</font><br>");
			var scrollControl = document.querySelector('input[name="scrollControl"]:checked').value;
			if (scrollControl === "auto") {
				serial_status.scrollTop = serial_status.scrollHeight;
			}



			const dataString = msg.toString().replace('\r\n', '');  // Convert buffer data to string
			// Robust parsing: split by space/comma, remove empty entries
			let dataPoints = dataString.split(/[\s,]+/).filter(Boolean);

			if (colour === "green") {
				debugDataBuffer += `${msg}\n`;
				if (debugDataBuffer.includes('N2LP=')) {
					let cleanedData = debugDataBuffer.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
					const regex = /(\w+)=([^=\s]+)/g;
					let match;
					while ((match = regex.exec(cleanedData)) !== null) {
						parsedData[match[1]] = match[2] || '';
					}
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
						// Update chart data and labels
						var now = new Date();
						if (chart_data_count % 10 == 0) {
							chart.data.labels.push(now.toISOString().slice(-13, -4));  // Add timestamp as label
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
						// Update the chart
						chart.update();
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
									chart3.data.labels.push(now.toISOString().slice(-13, -4));  // Add timestamp as label
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
								chart3.update();
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
									chart2.data.labels.push(now.toISOString().slice(-13, -4));  // Add timestamp as label
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
								chart2.update();
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

			if (colour === "green" && dataString.includes(',')) {
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

			const basicCmd = (func_count++ % 2 === 0) ? "P" : "I";
			sendSilentCommand(basicCmd);

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
		}, 1000);
		let selectedCondition = null;
		const numberInput1 = document.getElementById('numberInput1');
		const numberInput2 = document.getElementById('numberInput2');
		const numberInput3 = document.getElementById('numberInput3');
		const numberInput4 = document.getElementById('numberInput4');

		document.addEventListener('DOMContentLoaded', function () {
			setWorkflowState(WORKFLOW.UNCALIBRATED);
			refreshAnchorBadgeUI();

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
				if (parsedData.HSF) numberInput1.value = parsedData.HSF;
				if (parsedData.N1SF) numberInput2.value = parsedData.N1SF;
			});

			switchScreenBtn2.addEventListener('click', function () {
				sendCommand("INIT,NORM,L");
				setTimeout(() => {

					screen1.style.display = 'none';
					screen2.style.display = 'none';
					screen3.style.display = 'block';
					if (parsedData.HLF) numberInput3.value = parsedData.HLF;
					if (parsedData.N1LF) numberInput4.value = parsedData.N1LF;
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
				modal.style.display = 'none';
				sendCommand("SET,OK");
			});

			increaseBtn1.addEventListener('click', function () {
				if (numberInput1.value < 20) {
					numberInput1.value = parseInt(numberInput1.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,HEAD," + numberInput1.value);
				}
			});

			decreaseBtn1.addEventListener('click', function () {
				if (numberInput1.value > 5) {
					numberInput1.value = parseInt(numberInput1.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,HEAD," + numberInput1.value);
				}
			});

			increaseBtn2.addEventListener('click', function () {
				if (numberInput2.value < 20) {
					numberInput2.value = parseInt(numberInput2.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,NECK," + numberInput2.value);
				}
			});

			decreaseBtn2.addEventListener('click', function () {
				if (numberInput2.value > 5) {
					numberInput2.value = parseInt(numberInput2.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,NECK," + numberInput2.value);
				}
			});

			increaseBtn3.addEventListener('click', function () {
				if (numberInput3.value < 20) {
					numberInput3.value = parseInt(numberInput3.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,HEAD," + numberInput3.value);
				}
			});

			decreaseBtn3.addEventListener('click', function () {
				if (numberInput3.value > 5) {
					numberInput3.value = parseInt(numberInput3.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,HEAD," + numberInput3.value);
				}
			});

			increaseBtn4.addEventListener('click', function () {
				if (numberInput4.value < 20) {
					numberInput4.value = parseInt(numberInput4.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,NECK," + numberInput4.value);
				}
			});

			decreaseBtn4.addEventListener('click', function () {
				if (numberInput4.value > 5) {
					numberInput4.value = parseInt(numberInput4.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,NECK," + numberInput4.value);
				}
			});

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
				if (parsedData.HSF && supineHeadInput) supineHeadInput.value = parsedData.HSF;
				if (parsedData.N1SF && supineNeckInput) supineNeckInput.value = parsedData.N1SF;
				if (parsedData.HLF && sideHeadInput) sideHeadInput.value = parsedData.HLF;
				if (parsedData.N1LF && sideNeckInput) sideNeckInput.value = parsedData.N1LF;
			}

			function makeStepHandler(inputNode, step, mode, channel) {
				return function () {
					if (!inputNode) {
						return;
					}
					const current = Number(inputNode.value);
					const next = Math.max(5, Math.min(20, current + step));
					if (next !== current) {
						inputNode.value = String(next);
						sendCommand(`SET,NORM,${getCalibCondition()},${mode},${channel},${next}`);
					}
				};
			}

			document.getElementById('supineHeadPlus')?.addEventListener('click', makeStepHandler(supineHeadInput, 1, "S", "HEAD"));
			document.getElementById('supineHeadMinus')?.addEventListener('click', makeStepHandler(supineHeadInput, -1, "S", "HEAD"));
			document.getElementById('supineNeckPlus')?.addEventListener('click', makeStepHandler(supineNeckInput, 1, "S", "NECK"));
			document.getElementById('supineNeckMinus')?.addEventListener('click', makeStepHandler(supineNeckInput, -1, "S", "NECK"));
			document.getElementById('sideHeadPlus')?.addEventListener('click', makeStepHandler(sideHeadInput, 1, "L", "HEAD"));
			document.getElementById('sideHeadMinus')?.addEventListener('click', makeStepHandler(sideHeadInput, -1, "L", "HEAD"));
			document.getElementById('sideNeckPlus')?.addEventListener('click', makeStepHandler(sideNeckInput, 1, "L", "NECK"));
			document.getElementById('sideNeckMinus')?.addEventListener('click', makeStepHandler(sideNeckInput, -1, "L", "NECK"));

			openCalibBtn?.addEventListener('click', function () {
				if (!serial_ready) {
					serial_message("請先連線 BLE 後再進行微校正。", "red");
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
				pendingAnchorTarget = "BSHS";
				if (supineCalibHint) {
					supineCalibHint.textContent = "正在擷取 BSHS anchor，請保持姿勢。";
				}
				sendCommand("SET,OK");
				sendCommand("ANCHOR,START,BSHS");
			});

			completeSideCalibBtn?.addEventListener('click', function () {
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
