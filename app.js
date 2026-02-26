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
					var msg = "synctime," + utcString + serial_newline.value;
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

		serial_userSet.addEventListener('click', async () => {
			const now = Math.floor(Date.now() / 1000); // 生成UNIX時間戳
			const utcString = now;//now.toISOString(); // 生成UTC時間字串
			if (rxCharacteristic) {
				try {
					let gender = document.querySelector('input[name="gender"]:checked').value === 'female' ? '0' : '1';
					let age = document.getElementById('age').value;
					let height = document.getElementById('height').value;
					let weight = document.getElementById('weight').value;
					let infoString = `${gender},${age},${height},${weight}`;

					var msg = "user," + infoString;
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

		function serial_message(msg, colour) {
			// 使用 insertAdjacentHTML 而不是 innerHTML
			serial_status.insertAdjacentHTML('beforeend', "<font color='" + colour + "'>" + msg + "</font><br>");
			var scrollControl = document.querySelector('input[name="scrollControl"]:checked').value;
			if (scrollControl === "auto") {
				serial_status.scrollTop = serial_status.scrollHeight;
			}



			const dataString = msg.toString().replace('\r\n', '');  // Convert buffer data to string
			// Robust parsing: split by space/comma, remove empty entries
			let dataPoints = dataString.split(/[\s,]+/).filter(Boolean);

			// Append the new message to the buffer
			debugDataBuffer += msg;

			// Check if the buffer contains the end marker 'N2LP='
			if (debugDataBuffer.includes('N2LP=')) {
				// Clean up the buffer by removing line breaks and extra whitespace
				let cleanedData = debugDataBuffer.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();

				// Parse the data using regex
				const regex = /(\w+)=([^=\s]+)/g;
				let match;

				while ((match = regex.exec(cleanedData)) !== null) {
					parsedData[match[1]] = match[2] || '';
				}

				// Log the parsed data
				console.log(parsedData);

				// Clear the buffer after parsing
				debugDataBuffer = "";
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

		var func_count = 0;
		setInterval(async function () {
			if (rxCharacteristic && serial_ready) {

				var pString = "";
				if (func_count++ % 2 == 0) {
					pString = "p" + "\n"; //serial_newline.value;
				} else {
					pString = "i" + "\n";
				}
				try {
					var msg = pString;
					//serial_message(msg,"orange");
					//serial_text.value = "";

					let encoder = new TextEncoder();
					bleQueue.add(async () => {
						await rxCharacteristic.writeValue(encoder.encode(msg));
					});
				} catch (error) {
					serial_message(error.message, "red");
				}
			}
		}, 1000);

		async function sendCommand(cmdStr) {
			if (rxCharacteristic) {
				try {
					var msg = cmdStr;
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
		}
		let selectedCondition = null;
		const numberInput1 = document.getElementById('numberInput1');
		const numberInput2 = document.getElementById('numberInput2');
		const numberInput3 = document.getElementById('numberInput3');
		const numberInput4 = document.getElementById('numberInput4');

		document.addEventListener('DOMContentLoaded', function () {
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
				sendCommand("DEBUG,");
			});

			switchScreenBtn1.addEventListener('click', function () {
				selectedCondition = radioForm.querySelector('input[name="condition"]:checked')?.value;
				console.log("selectedCondition:" + selectedCondition);
				screen1.style.display = 'none';
				screen2.style.display = 'block';
				screen3.style.display = 'none';
				sendCommand("INIT,NORM,S,");
				if (parsedData.HSF) numberInput1.value = parsedData.HSF;
				if (parsedData.N1SF) numberInput2.value = parsedData.N1SF;
			});

			switchScreenBtn2.addEventListener('click', function () {
				sendCommand("INIT,NORM,L,");
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
				sendCommand("SET,OK,");
			});

			increaseBtn1.addEventListener('click', function () {
				if (numberInput1.value < 20) {
					numberInput1.value = parseInt(numberInput1.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,HEAD," + numberInput1.value + ",");
				}
			});

			decreaseBtn1.addEventListener('click', function () {
				if (numberInput1.value > 5) {
					numberInput1.value = parseInt(numberInput1.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,HEAD," + numberInput1.value + ",");
				}
			});

			increaseBtn2.addEventListener('click', function () {
				if (numberInput2.value < 20) {
					numberInput2.value = parseInt(numberInput2.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,NECK," + numberInput2.value + ",");
				}
			});

			decreaseBtn2.addEventListener('click', function () {
				if (numberInput2.value > 5) {
					numberInput2.value = parseInt(numberInput2.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",S,NECK," + numberInput2.value + ",");
				}
			});

			increaseBtn3.addEventListener('click', function () {
				if (numberInput3.value < 20) {
					numberInput3.value = parseInt(numberInput3.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,HEAD," + numberInput3.value + ",");
				}
			});

			decreaseBtn3.addEventListener('click', function () {
				if (numberInput3.value > 5) {
					numberInput3.value = parseInt(numberInput3.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,HEAD," + numberInput3.value + ",");
				}
			});

			increaseBtn4.addEventListener('click', function () {
				if (numberInput4.value < 20) {
					numberInput4.value = parseInt(numberInput4.value) + 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,NECK," + numberInput4.value + ",");
				}
			});

			decreaseBtn4.addEventListener('click', function () {
				if (numberInput4.value > 5) {
					numberInput4.value = parseInt(numberInput4.value) - 1;
					sendCommand("SET,NORM," + selectedCondition + ",L,NECK," + numberInput4.value + ",");
				}
			});

			window.addEventListener('click', function (event) {
				if (event.target === modal) {
					modal.style.display = 'none';
				}
			});
		});

