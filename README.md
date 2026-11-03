# Pillow Data Collect Web - spp3_BLE_v4

台科大智慧枕墊資料收集系統（iPillow Web）。主要入口是 `spp3_BLE/`，以純 HTML／CSS／JavaScript 透過 Web Bluetooth 與 ESP32 溝通，提供資料收集、校正、控制與監測介面。

本版以 `spp3_BLE_cls_pre_v3.1` 為基礎，新增可收合的「實驗專區」及 Experiment 01 的 30 秒壓力資料收集、條件曲線保存、CSV＋PNG 匯出。保留既有雙欄介面、截圖精靈、BLE queue、IndexedDB、全站 Export Data、校正、分類、PRED 與 Manual 控制。

修改日期時間：`2026-11-03 21:42:11 CST (+0800)`（Asia/Taipei；本次功能整理與 README 更新時間）

目前驗證狀態：**50 項 Node 回歸測試通過；使用者在 Mac Terminal 執行 Chrome 156.0.8078.80＋Chart.js 4.6.1 的合成資料瀏覽器測試通過。可提交此 Web 功能版本供實機驗證；尚未完成 ESP32 實機驗收，也不表示辨識穩健性已獲驗證。**

## 對應版本

- Web repo：[`NTUST-LSC-Lab/Pillow-data-collect-web`](https://github.com/NTUST-LSC-Lab/Pillow-data-collect-web)
- Web branch／本次提交目標：[`spp3_BLE_v4`](https://github.com/NTUST-LSC-Lab/Pillow-data-collect-web/tree/spp3_BLE_v4)
- Web 基底：`spp3_BLE_cls_pre_v3.1`
- ESP32 repo：`XUE030130/ipillow`
- ESP32 branch：`pose_pre_v3.1`；沿用基底版本的協定與預期配對，本次未更新 firmware 或重新驗證整套硬體相容性。
- 主要 Web 目錄：`spp3_BLE/`；舊版 Web Serial 介面保留在 `spp3/`。

本次已查證遠端 `spp3_BLE_v4` 分支存在。本機工作資料夾沒有 `.git`，不能把資料夾名稱當成已 checkout 的分支，也不能在此資料夾判定 Git 工作區乾淨；本文件更新不表示已 commit、push 或部署。

## 目錄結構

```text
Pillow-data-collect-web/
├─ spp3_BLE/
│  ├─ index.html                 # 主頁、Experiment Hub 與實驗表單 template
│  ├─ styles.css                 # 雙欄、七張左欄 Card 與實驗響應式樣式
│  ├─ app.js                     # 既有 BLE／控制流程及已解析壓力樣本的橋接
│  ├─ experiment-hub.js          # 九實驗選擇、共用控制及離頁保護
│  ├─ pressure-experiment.js     # Experiment 01 表單、曲線、條件暫存及雙檔下載
│  └─ pressure-recorder.js       # 30 秒記錄器、時間／中斷狀態及 CSV
├─ tests/
│  ├─ pressure-recorder.test.cjs
│  ├─ pressure-bridge.test.cjs
│  ├─ experiment-hub.test.cjs
│  ├─ pressure-ui.test.cjs
│  ├─ chart-options.test.cjs
│  └─ chart-browser-smoke.cjs
├─ spp3/                        # 保留原 Web Serial 版本
├─ Images/
│  ├─ s.png
│  └─ l.png
├─ chart.umd.min.js              # 既有本機 Chart.js 4.4.1，未替換
├─ AGENTS.md
└─ README.md
```

## 啟動方式

使用支援 Web Bluetooth 的 Chrome 或 Edge。Web Bluetooth 需要安全來源；本機開發可使用 `localhost`，部署時使用 HTTPS。不建議直接雙擊 HTML。

在 repo 根目錄執行：

```bash
python3 -m http.server 8080
```

開啟 `http://localhost:8080/spp3_BLE/`。舊版 Web Serial 入口為 `http://localhost:8080/spp3/`。

主頁沿用 `https://cdn.jsdelivr.net/npm/chart.js` 載入 Chart.js，未鎖定 CDN 版本；本次瀏覽器實際載入的是 **4.6.1**。根目錄的 `chart.umd.min.js` 是 **4.4.1**，供既有用途及 options resolver 回歸測試使用，不代表主頁也載入 4.4.1。CDN 後續版本不同時需重新測試，不能沿用本次版本的通過結論。

## 2026-11-03 v4 實驗功能與修正

功能整理與文件更新時間：`2026-11-03 21:42:11 CST (+0800)`。下列為本日新增／修正內容，非各項功能的獨立完成時間。

| 項目 | 新增或修正內容 |
| --- | --- |
| 共用 Experiment Hub | 新增左欄第六張 Card，位於監測與訊息紀錄之間；九實驗共用外框、上一個／下一個箭頭及 Dropdown，每次只顯示一個內容。首次收合，之後保留展開偏好；切換不 reload。 |
| Experiment 01 | 實作固定睡姿、對應高度下的自然呼吸與微動資料收集；四條件各 30 秒。Experiment 02–09 保留未設定插槽，不提供虛構流程。 |
| 記錄與狀態 | 新增受試者代號、試次、條件、高度、備註及人工確認；開始時建立快照，進行中鎖定切換，支援自動結束、提前結束、斷線／資料逾時中斷。 |
| 實驗線圖 | 三通道共用 0–30 秒／ADC 圖表，沿用紅／綠／藍配色；四條件各保存最後一輪結果與曲線，切回可恢復。 |
| CSV＋PNG | 每輪輸出 23 欄 CSV 與同名前綴線圖 PNG；畫面摘要及 PNG 不顯示 UUID，CSV 與檔名保留唯一 run_id。 |
| 資料保護 | 同條件重測前須先要求匯出並確認替換；任一條件記錄中或有未匯出樣本時提供離頁提醒。資料仍僅存於記憶體。 |
| 初始化修正 | 修正 Hub Dropdown 的區域變數遮蔽初始化 options，確保實驗模組取得 `getSystemState` 並正確更新開始按鈕。 |
| Chart.js 修正 | 避免將已解析的 `chart.options.plugins` Proxy 指定回自身；在普通設定物件初始化 title，更新時只改 title.text，修正 `Maximum call stack size exceeded`。 |
| 左欄排列 | 原六張 Card 調整為七張；實驗與訊息紀錄使用對應 grid area，避免新增 Card 後訊息紀錄的排列／高度失效。 |
| 回歸驗證 | 新增記錄器、BLE parser bridge、Hub、UI／匯出、真實 Chart options resolver 與 Chrome smoke 測試；驗證範圍及結果詳見下方。 |

## Experiment 01 壓力資料收集

實驗專區位於左欄「高度與壓力監測」與「訊息紀錄」之間，九個實驗共用同一個 Hub。首次預設收合，收合僅隱藏介面；Experiment 02–09 仍為未設定插槽。「九個實驗的切換」與「Experiment 01 的四種條件」是兩個不同層級。

### 目的與條件

Experiment 01：**固定睡姿下自然呼吸與微動之辨識穩健性測試**。本階段只收集 ESP32 `P:` 訊息回傳的三通道 ADC，匯出 CSV 與 PNG；分類及穩健性評估在之後離線進行，網頁沒有即時準確率或分類結論，也未將研究分類模型加入 ESP32。

| condition_id | actual_pose | height_condition | test_condition | 操作情境 |
| --- | --- | --- | --- | --- |
| 01 | pose1 | height1 | still | 睡姿一／對應高度／穩定不動、自然呼吸 |
| 02 | pose1 | height1 | movement | 睡姿一／對應高度／微微作動、自然呼吸 |
| 03 | pose5 | height5 | still | 睡姿五／對應高度／穩定不動、自然呼吸 |
| 04 | pose5 | height5 | movement | 睡姿五／對應高度／微微作動、自然呼吸 |

數字姿勢 ID 暫不映射 BSHS／BLHL。每條件各收集一輪 30 秒，四輪合計 120 秒記錄窗口；不含調整姿勢／高度、等待穩定及匯出。自然呼吸不憋氣；微動是同一睡姿的小幅調整，不另制定頻率、幅度或動作腳本。本實驗沒有高度錯配條件。

### 操作者流程

1. 用支援 Web Bluetooth 的瀏覽器開啟 `spp3_BLE/`，連接 ESP32。確認持續收到有效三通道資料；實驗顯示最新接收時間、ADC 與觀察間隔。開始前須已收到至少兩筆完整訊息且資料未過期，這不是自動判定受試者穩定。
2. 展開「實驗專區」，選擇 Experiment 01，填受試者代號（例如 S01，不填姓名）及正整數試次編號。試次是同一受試者、同一條件的第幾次重測；四個條件的第一輪都可填 `1`，同條件再測時由操作者改為 `2`，不會自動遞增。
3. 選一個條件，依畫面安排睡姿與對應高度，人工確認並填入 Head／Neck 本輪設定高度與可選備註。Head 為 7–16 cm，Neck 為 10–14 cm，步進 0.5 cm。這些數值是操作者紀錄，不是自動量測，也不下達控制命令。
4. 檢查控制狀態提醒。既有自動模式／PRED 可能改變高度，與固定高度條件不符；由操作者確認及處理既有控制狀態，本實驗不會自行停止 PRED、切換模式、重送 USER、清除 anchors 或控制充放氣。
5. 自行等待受試者穩定，勾選本輪設定確認，再按「開始記錄」。不另加等待秒數或自動判穩門檻。本輪設定與實驗切換在記錄期間鎖定；仍可收合 Hub，收集不會停止。
6. 30 秒到時自動結束。若按「提前結束」，保留已有樣本並標示未完成。檢查本輪曲線、樣本數、狀態及條件快照。
7. 按「匯出 CSV＋線圖」，確認同名前綴的 CSV 與 PNG 都已保存，再選下一條件。同一條件未要求匯出的樣本會阻擋重測；重測前仍會詢問是否已保存兩個檔案。瀏覽器若詢問多檔下載，需允許此網站；程式只能確認已要求下載，不能證明檔案已保存。

四個條件各自在本頁暫存最後一輪資料與曲線。切到尚未記錄的條件顯示空圖及該條件標題；切回已有紀錄的條件會恢復原曲線與結果快照，並可匯出該輪的 CSV／PNG。輸入表單本身仍共用，每次開始前須重新確認本輪設定。其他條件尚未匯出的結果會顯示提醒，且仍受離頁保護；切換不會丟棄它們。每個條件仍只保留最後一輪，不依受試者或試次保存完整歷史；同條件重測前需先匯出，並確認替換。

明確 BLE 斷線立即標記 `interrupted`；連續 **3 秒**沒有有效完整 P 訊息也中止本輪，不補造資料、不自動續接。這是基於現有每秒 P 查詢的初始門檻，**尚未實機驗證**；請利用顯示的實際接收間隔評估。`data_timeout_s=3` 與 `gap_timeout_ms=3000` 保存於 CSV。

### 訊息、時間與圖表

- 收集入口沿用既有通知分行與 P parser：`P:<pm> <pn> <ph>`，固定對應 Monitor、Neck、Head。只有已換行、恰好三個完整且有限數值的 BLE 回覆成為樣本；不收指令 echo、I／DEBUG 或 100 ms timeout 的未完成片段。網頁保存 P 訊息中的 ADC 數值，不另套校正公式或轉成 kPa。
- 資料域說明：此處的 ADC 是 firmware 對外回傳的數值，不能等同感測器未濾波的原始讀值；既有 firmware 會先處理感測資料。介面部分沿用的 `raw ADC`／「原始 ADC」字樣應依此理解。本次沒有修改 firmware 的讀取或濾波行為。
- 每列代表一筆完整有效訊息；相同數值的不同訊息仍分別保存。不新增 BLE 連線、通知 listener 或高頻輪詢；現有每秒查詢一次不等於實測取樣率。
- `timestamp_iso` 是**網頁處理收到完整訊息時**產生的 UTC ISO 時間（Z），不是感測器量測時間。`elapsed_s` 是此接收時刻相對按下開始的 `performance.now()` 差值，範圍 0–30 秒；不強迫樣本落在兩端、不補點或插值。
- 圖表 X 軸固定 0–30 秒，Y 軸標示「壓力（ADC）」；Monitor／Neck／Head 分別沿用紅／綠／藍配色。UI／繪圖以 250 ms 週期刷新，每筆有效訊息則立即保存，不因繪圖節流漏存。這個刷新週期不是感測器或 BLE 的取樣率；右欄既有圖表不變。
- `completed` 僅表示走完 30 秒窗口且沒有已知的上述中斷，不保證取樣數／取樣率，更不代表已驗證辨識穩健性。`ended_early` 是操作者提前結束；`interrupted` 是已知斷線或資料中斷。零樣本不能正常完成或匯出資料列。

### 每輪 CSV

共 **23 欄**，依下列必要欄位與補充欄位順序輸出，不更動全站 Export Data 格式。

必要欄位：`run_id, subject_id, trial_index, condition_id, actual_pose, height_condition, head_height_cm, neck_height_cm, test_condition, sample_index, timestamp_iso, elapsed_s, monitor_adc, neck_adc, head_adc, run_status`。

補充欄位：`notes, height_source, data_timeout_s, gap_timeout_ms, interruption_reason, time_source, pressure_unit`。`height_source=operator`，`pressure_unit=ADC`；`time_source=browser_complete_pressure_message_received`。樣本編號從 1 起算，每列使用結束後的最終 `run_status`。條件、設定高度及備註在開始時建立快照，之後改表單不會改寫既有資料。

| 欄位 | 定義 |
| --- | --- |
| `run_id` | 每輪唯一 UUID；畫面摘要省略，但 CSV 與檔名保留。 |
| `subject_id` | 操作者填寫的受試者代號，不使用姓名。 |
| `trial_index` | 同一受試者、同一條件的重測編號，正整數。 |
| `condition_id` | `01`–`04`，對照上方條件表；不是九實驗的編號。 |
| `actual_pose` | `pose1` 或 `pose5`，暫不映射其他姿勢 label。 |
| `height_condition` | `height1` 或 `height5`，表示對應姿勢的高度條件。 |
| `head_height_cm` | 本輪人工確認的 Head 設定高度，cm。 |
| `neck_height_cm` | 本輪人工確認的 Neck 設定高度，cm。 |
| `test_condition` | `still` 或 `movement`；兩者均自然呼吸。 |
| `sample_index` | 本輪完整有效壓力訊息序號，從 1 開始。 |
| `timestamp_iso` | 網頁處理完整訊息的 UTC ISO 接收時間，含 `Z`。 |
| `elapsed_s` | 接收時刻與開始記錄的單調時鐘差，秒；輸出六位小數。 |
| `monitor_adc` | P 訊息第一值，Monitor ADC。 |
| `neck_adc` | P 訊息第二值，Neck ADC。 |
| `head_adc` | P 訊息第三值，Head ADC。 |
| `run_status` | 本輪最終狀態：`completed`、`ended_early` 或 `interrupted`。 |
| `notes` | 操作者選填的本輪備註。 |
| `height_source` | `operator`，人工紀錄，非實測高度時間線。 |
| `data_timeout_s` | 有效完整訊息的中斷門檻，現為 `3` 秒。 |
| `gap_timeout_ms` | 同一門檻的毫秒值，現為 `3000`。 |
| `interruption_reason` | 程式記錄的中斷原因；無中斷則留空。 |
| `time_source` | `browser_complete_pressure_message_received`。 |
| `pressure_unit` | `ADC`。 |

CSV 使用 UTF-8 BOM、CRLF，每個欄位均正確引用並將引號加倍，備註中的逗號、引號與換行會保留。檔名例如 `S01_pose1_height1_still_trial01_<唯一run_id>.csv`，其他三條件使用對應姿勢、高度及情境；每輪以新 UUID 避免重測混淆。

同次操作也下載 `S01_pose1_height1_still_trial01_<唯一run_id>.png`。PNG 使用本條件專用曲線、白色背景與本輪快照標題（受試者、試次、條件、姿勢、高度、情境、筆數及狀態）；圖上不顯示 UUID。兩份內容先產生成功再要求下載，影像產生失敗時保留資料及未匯出保護。匯出需先展開並顯示該條件的曲線，避免輸出隱藏或上一條件的畫面。右欄既有圖表不受影響。

四個條件的結果都只在本頁記憶體，**沒有持久化**，也未改動 IndexedDB schema 或全站 Export Data。任一條件仍在記錄或尚未要求匯出時有離頁警告；選擇離開／重新整理仍會遺失資料。要求下載不代表瀏覽器已保存，操作者務必自行確認 CSV 與 PNG。真實受試者資料與匯出不得提交版本控制。

### 驗證紀錄與重跑方式

驗證日期：`2026-11-03`（Asia/Taipei）。本次瀏覽器測試的最新 CSV／PNG 產物時間為 `2026-11-03 21:33:58 CST (+0800)`；這是檔案產生時間，不是感測器量測時間或測試開始時間。

| 驗證項目 | 實際結果 | 範圍 |
| --- | --- | --- |
| Node 回歸 | **50／50 通過，退出碼 0** | Recorder 16、BLE parser bridge 8、Hub 6、UI／controller 17、Chart options 3。 |
| 記錄與 CSV | 合成資料測試通過 | 30 秒時間窗、提前結束、3 秒中斷、斷線中斷、單調時間、三通道順序、四條件快照、CSV 引用及重測保護。 |
| Chart options | 本機 **Chart.js 4.4.1** 的 3 項測試通過 | 使用真正 constructor／options resolver 與模擬 Canvas API；負向測試可重現舊的 Proxy 循環指定錯誤。 |
| 真實 Chrome／Chart.js | 使用者於一般 Mac Terminal 執行，**Chrome 156.0.8078.80／Chart.js 4.6.1：PASS** | 真實瀏覽器、Chart.js、HTML／CSS、Hub／實驗模組；使用合成 S00 資料與可控時鐘。 |
| 瀏覽器操作 | 通過，未捕捉到 `pageerror` | 展開、開始、30 秒記錄邏輯、條件曲線切換／恢復、收合後繼續記錄、提前結束。 |
| 實際下載產物 | CSV **30 筆、23 欄**；PNG **588×290**，同檔名前綴 | 條件 01、S00、Head 8／Neck 11 cm、`completed`、`data_timeout_s=3`；已核對 CSV 三通道序列及 PNG 圖表。 |

在專案根目錄重跑 Node 測試：

```bash
node --test --test-reporter=dot tests/*.test.cjs
```

Node 測試多數使用 fake clock、輕量 DOM／Chart stub；Chart options 測試才使用本機真實 Chart.js 4.4.1。兩者都不能取代 Chrome／CDN 版本的實際 render 或 ESP32 驗證。

在能正常啟動 Chrome 的終端機重跑瀏覽器測試：

```bash
node tests/chart-browser-smoke.cjs
```

需先有可用的 Node.js、Playwright 與 Chrome；測試腳本不會自動安裝依賴。若 Playwright 不在 Node 的模組搜尋路徑中，指定已安裝模組的位置：

```bash
PLAYWRIGHT_MODULE_PATH="/absolute/path/to/node_modules/playwright" node tests/chart-browser-smoke.cjs
```

上述絕對路徑是佔位範例，需換成執行環境的實際路徑。可用 `CHROME_EXECUTABLE_PATH` 指定既有 Chrome；預設為 macOS 的 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。

本次使用者 Terminal 回報：

```text
Real browser: 156.0.8078.80; real Chart.js: 4.6.1; synthetic S00 data only.
PASS: real Chart.js 4.6.1; expand/start/30 s collection; CSV+PNG; condition restore; collapse; no page errors.
```

腳本預設載入主頁相同的 Chart.js CDN，並嚴格確認版本為 `4.6.1`。離線測試可指定 `CHART_JS_PATH` 載入未修改的函式庫，以 `EXPECTED_CHART_VERSION` 明確指定預期版本；不可把測試 4.4.1 的結果當成 4.6.1 已通過。瀏覽器啟動失敗、CDN 未載入或版本不符都會回報失敗。

測試產物位於 `tests/.artifacts/chart-browser/`，檔名標記 `SYNTHETIC`，CSV 備註也明示非人體／裝置量測。測試時鐘固定以 `2030-01-01` 為基準，因此合成 CSV 內的時間戳不代表實際執行日期。產物留在本機供檢查，不提交到 GitHub。

本次 Codex 受限制的工作階段無法啟動 Chrome（啟動階段 `SIGABRT`）；上方瀏覽器 PASS 來自使用者在一般 Mac Terminal 的執行及其產物。環境啟動失敗與網頁的 Chart.js 錯誤分開記錄。

### 尚未驗證與使用限制

- 瀏覽器 smoke 以合成 bootstrap 取代正式 `app.js` 的啟動流程，並控制 `Date`、`performance.now()` 與 UI refresh。它驗證 **30 秒計時邏輯**，未等待實際 30 秒，也未涵蓋完整 BLE app、背景分頁計時或所有既有硬體控制。
- 本次 Chrome smoke 的 viewport 為 `1280×1000`。尚需對最終版本人工確認拖窄左欄、手機版面、Tab／Enter 鍵盤操作；不能由此次 PASS 推論全部響應式與無障礙驗證通過。
- 真實瀏覽器測試完整收集／匯出條件 01，並測條件 02 提前結束；四條件的欄位對應由 Node UI 測試覆蓋，尚未以 ESP32 四條件各做一輪。
- 正式收數前，接目標 ESP32 驗證持續收數、四條件各 30 秒、提前結束、斷線立即中止、3 秒未收有效訊息中止及匯出檔案。中斷測試需確認資料保留且不自動續接；不得把計時完成當成資料必定完整。
- Web 現有每秒查詢一次 P 不保證恰好 1 Hz 或恰好 30 筆。若實際接收約 1 Hz，可能漏掉較短暫的微動波動；分類結論只能反映實際收集資料的時間解析度。
- 固定高度仍由操作者安排與確認；CSV 高度是設定紀錄，網頁不保證既有自動控制在記錄期間不改變高度。
- CSV＋PNG 綁定匯出；PNG 產生失敗時 CSV 也不會下載，但資料會保留。瀏覽器可能阻擋第二個下載，務必確認兩個檔案都已保存。
- 各條件只暫存最後一輪，沒有跨重新整理的持久化。資料收集完成不表示已完成離線分類或辨識穩健性驗證。

### 提交範圍

本次於 `2026-11-03` 查核遠端 `spp3_BLE_v4`，基準 commit 為 `207cdc1e4176fd6b4e7930d6ecb80d5b606d1bb5`。相對該基準，應提交下列 **13 個原始碼／文件檔案**，保留原路徑：

| 類型 | 檔案 |
| --- | --- |
| 修改 | `README.md`、`spp3_BLE/index.html`、`spp3_BLE/styles.css`、`spp3_BLE/app.js` |
| 新增實驗模組 | `spp3_BLE/experiment-hub.js`、`spp3_BLE/pressure-experiment.js`、`spp3_BLE/pressure-recorder.js` |
| 新增測試 | `tests/pressure-recorder.test.cjs`、`tests/pressure-bridge.test.cjs`、`tests/experiment-hub.test.cjs`、`tests/pressure-ui.test.cjs`、`tests/chart-options.test.cjs`、`tests/chart-browser-smoke.cjs` |

不要整包上傳工作資料夾：排除 `.DS_Store`、`tests/.artifacts/`、真實受試者資料、實驗 CSV／PNG、BLE log、憑證與本機依賴。測試原始碼可提交，執行產物不在本次提交清單內。

本機沒有 `.git`，若透過 Git 提交，需先在真正追蹤 `spp3_BLE_v4` 的 checkout 中核對遠端最新狀態與 diff，再套用上述檔案；不要用資料夾名稱推定分支，也不要覆蓋遠端之後新增的修改。提交到此功能分支不表示已通過實機驗收或已更新部署網站。

## 沿用的 v3.1 Web 功能

基底 README 修改日期時間：`2026-07-16 13:06:26 CST (+0800)`。下列既有功能與原歷史日期保留；本次 v4 未重新設計這些操作流程：

- `截圖精靈`：支援固定姿勢最佳高度的重複截圖流程。
- `可拖曳左右欄寬`：左側操作區與右側線圖區之間新增拖曳分隔條。
- `右側線圖監測可收合資訊`：圖表保留顯示，數值資訊與上方控制區可收合或滾動。
- `卡片級響應式調整`：截圖精靈與線圖監測在窄欄寬下會自動重排，避免欄位被吃掉。

## 截圖精靈

`截圖精靈` 是 v3.1 已有的收數區塊，目標是先完成實驗與截圖，之後再依照圖片內容回填 Excel；與本版新增的 Experiment 01 CSV／PNG 收集流程分開使用。

### 截圖精靈操作方式

1. 選擇受試者編號。
2. 選擇固定姿勢最佳高度。
3. 按 `選擇資料夾`，指定本輪截圖儲存位置。
4. 按 `開始` 建立本輪截圖流程。
5. 依照畫面提示切換姿勢與輸入分數。
6. 每一步按 `立即截圖`，系統會自動命名並存檔。

開始後，設定列會收合成：

- `本輪設定已鎖定`
- `資料夾名稱`
- `修改`

使用者若要更換受試者、姿勢或資料夾，可按 `修改` 回到設定狀態。

### 26 張截圖流程

每一個固定姿勢最佳高度，現在固定產生 `26` 張圖。

- `R1`
  - `LOAD-{固定姿勢}`
  - `UNLOAD`
  - 其餘 `4` 個姿勢的 `ACT`
- `R2` 到 `R5`
  - 每一輪各 `5` 張 `ACT`

例如固定姿勢為 `BSHS`：

- `R1 LOAD-BSHS`
- `R1 UNLOAD`
- `R1 ACT-BSHL`
- `R1 ACT-BLHLB`
- `R1 ACT-BLHLC`
- `R1 ACT-BLHL`
- `R2 ACT-BSHS`
- `R2 ACT-BSHL`
- ...
- `R5 ACT-BLHL`

也就是：

- `R1 = 6 張`
- `R2~R5 = 20 張`
- `總共 = 26 張 / 固定姿勢`

### 完整受測者資料與自動整理

一位受測者需要依序完成 `BSHS`、`BSHL`、`BLHLB`、`BLHLC`、`BLHL` 五個固定姿勢最佳高度。每個姿勢會產生 26 張 SVG，完整收集共 130 張，建議整理成以下結構：

```text
Sxx/
├── BSHS/    # 26 SVG
├── BSHL/    # 26 SVG
├── BLHLB/   # 26 SVG
├── BLHLC/   # 26 SVG
└── BLHL/    # 26 SVG
```

收集完成後，可使用 [`NTUST-LSC-Lab/ipillow-data-records-automation`](https://github.com/NTUST-LSC-Lab/ipillow-data-records-automation) 驗證 130 張 SVG，並在保留每次執行前備份的前提下，自動更新 `5pose_calibration`、`Basic_Info` 與 `pose_matrix_5x5` 三份 Excel。

### 分數規則

- `LOAD`：固定為 `10`
- `UNLOAD`：留空
- `ACT`：由收資料人員手動選擇 `0~10`

### 截圖命名規則

目前命名格式為：

```text
{subject_id}_APL-{applied_height_pose}_{stage}_R{repeat_id}_{sequence}.svg
```

例如：

```text
S01_APL-BSHS_LOAD-BSHS_R1_01.svg
S01_APL-BSHS_UNLOAD_R1_02.svg
S01_APL-BSHS_ACT-BSHL_R1_03.svg
S01_APL-BSHS_ACT-BLHLB_R1_04.svg
S01_APL-BSHS_ACT-BLHLC_R1_05.svg
S01_APL-BSHS_ACT-BLHL_R1_06.svg
S01_APL-BSHS_ACT-BSHS_R2_07.svg
```

欄位意義：

- `subject_id`：受試者編號
- `APL-{pose}`：固定姿勢最佳高度來源
- `stage`：`LOAD`、`UNLOAD` 或 `ACT`
- `R{repeat_id}`：第幾輪
- `sequence`：第幾張圖，固定為 `01~26`

## 2026-06-08 截圖修正

時間：`2026-06-08 17:55:26 CST (+0800)`

- 修正 `截圖精靈` 在 Chrome / Edge 下因 `canvas.toBlob()` 與外部字型造成的 `Tainted canvases may not be exported` 錯誤。
- `spp3_BLE/app.js` 的截圖匯出流程改為直接生成 `SVG Blob` 並寫入使用者選定的資料夾，不再經過 canvas 轉 PNG。
- 截圖檔案副檔名由 `.png` 改為 `.svg`，原有的資料夾權限、覆蓋確認、步驟推進與重拍流程維持不變。
- 匯出時強制使用本機字型 stack，避免將 Google Fonts 之類的外部字型依賴帶入匯出流程後再次污染畫布。

## 2026-06-29 高度限制修正

時間：`2026-06-29 15:56:41 CST (+0800)`

- 將 Web 端頸部高度上限對齊 `pose_pre_v3.1` firmware：Head `7.0-16.0 cm`、Neck `10.0-14.0 cm`、step `0.5 cm`。
- 修正微調、初始校正與 ESP32 Manual 啟動欄位的 Neck `max`，避免 Web 端允許輸入 firmware 會 clamp 掉的 `16.0 cm`。
- 將側躺頸部離線預設值由 `16.0 cm` 改為 `14.0 cm`，避免未連線時第三畫面顯示與實際硬體上限不一致。

## 2026-07-07 Reset 基準流程按鈕

時間：`2026-07-07 16:49:57 CST (+0800)`

- 在 `生物力學調整模式` 的仰躺高度微調與側躺高度微調畫面各新增一個 `Reset` 按鈕。
- 按 `Reset` 只會暫存本次需要重跑開機基準流程，不會立即送出硬體指令；按「確定調整仰躺高度」或「確定調整側躺高度」後才會送出。
- 有暫存 `Reset` 時，確認按鈕會先送 `MANUAL,STARTUP,7.0,10.0`，讓 ESP32 先 `DRAIN_ALL` 吸乾並回到 Head `7.0 cm` / Neck `10.0 cm` 開機基準，再自動送出目前姿勢的 `SET,NORM` 目標高度。
- 仰躺畫面的 `Reset` 會把仰躺高度欄位設為 Head `7.0 cm` / Neck `10.0 cm`，讓使用者從開機基準開始微調。
- 側躺畫面的 `Reset` 會把側躺高度欄位設為依使用者性別、年齡、身高、體重計算出的側躺目標高度；按「確定調整側躺高度」後會自動接著套用該側躺目標高度。
- 後續單純微調時，不需要按 `Reset`；直接調整 Head / Neck 數值後按確認，只會送出目前姿勢的 `SET,NORM` 目標高度。
- `Reset` 不會清除 IndexedDB，也不會重新計算既有匯出資料；後續壓力、姿勢與指令紀錄會繼續累計到同一份 export 資料中。

### 截圖精靈畫面內容

預覽區會保留：

- 目前截取畫面為
- `R1~R5`
- `第幾張 / 共 26 張`
- `舒適度評分`
- `Monitor / Neck / Head`
- `更新時間`
- `Head` 目標 / 目前
- `Neck` 目標 / 目前
- `受試者`
- `固定姿勢最佳高度`
- `最近截圖`

### Excel 對應邏輯

目前流程預設：

- `LOAD`、`UNLOAD`
  - 回填到校正表
- `ACT`
  - 回填到 `pose_matrix_5x5`

其中 `pose_matrix_5x5` 已加上 `repeat_id` 欄位，可用來區分 `R1~R5`。

### 響應式調整

截圖精靈卡片本身有自己的 container query。當左欄被拖窄時：

- 受試者 / 姿勢 / 資料夾 / 開始按鈕會自動換行
- `目前截取畫面為 + 評分 + 立即截圖` 會改成上下排列
- 監測摘要會從 4 欄改成 2 欄或 1 欄
- Head / Neck 高度資訊改成直向排列
- 底部 metadata 會自動堆疊
- `最近截圖` 允許換行，不會因檔名太長被切掉

## 左右欄位拖曳

主畫面左側操作欄與右側線圖監測欄之間，新增可拖曳分隔條。

行為如下：

- 可直接拖曳改變左右欄寬。
- 重新整理後會保留上次欄寬。
- 窄欄時，左側截圖精靈與右側線圖監測都會依照各自卡片寬度進行響應式重排。

## 線圖監測近期調整

右側 `線圖監測` 在這版做了幾項與可用性有關的調整。

### 資訊區與圖表區分離

- 上方數值資訊可透過 `收合資訊` 控制。
- 收合資訊時，下方圖表仍維持顯示。
- 不需要為了看圖表而完全失去控制區。

### 線圖監測區塊捲動

- 整個右側 `線圖監測` 卡片本身有獨立捲軸。
- 上方數值資訊區也有自己的捲軸。
- 因此在右欄被拖窄或高度不夠時，按鈕與數值不會直接消失。

### 四個模式按鈕

保留四個模式按鈕：

- `只看壓力`
- `完整線圖`
- `只看摘要`
- `收合線圖`

按鈕位置維持在數值資訊區下方，不改變原本操作順序。

### 窄欄時的響應式

線圖監測卡片本身也有 container query。當右欄變窄時：

- `Y軸最大值 / Y軸最小值 / 更新圖表` 會自動換行
- 即時摘要格會由多欄改成 3 欄、2 欄或 1 欄
- 模式按鈕會改成較適合窄欄的排列方式
- 圖表高度會一起調整，避免把上方控制區擠掉

## 介面總覽

新版畫面分為左側操作欄與右側線圖監測欄。

左側操作欄：

1. `裝置連線、指令與狀態`
2. `使用者資料`
3. `校正與分類狀態`
4. `截圖精靈`
5. `高度與壓力監測`
6. `實驗專區`（可收合；Experiment 01 收集資料，02–09 待設定）
7. `訊息紀錄`

右側線圖監測欄：

1. Y 軸設定
2. 即時摘要
3. 線圖模式切換
4. 壓力線圖
5. 平均值線圖
6. 差值線圖

右側整欄具有獨立滾輪。使用 `完整線圖` 時，三張圖會盡量完整展開並往下排列，不會硬塞在同一個可視高度中。

## 裝置連線、指令與狀態

此區塊是連線與底層控制入口。

常駐顯示：

- `Connect BLE`：連接 ESP32 BLE。
- `Disconnect`：中斷 BLE。
- `State`：顯示 ESP32 目前 state 名稱。
- `S1` 到 `S6`：顯示馬達/閥門輸出狀態。
- `Sync UTC Time`：同步目前 UNIX time 到 ESP32。
- `Export Data`：匯出 IndexedDB 收集資料與訊息紀錄。

### 進階文字指令

`進階文字指令` 預設收合。需要直接送 BLE 指令時展開。

欄位：

- 文字指令輸入框
- newline 選單
- `Send Text`
- Uint8Array 輸入框
- `Send Uint8Array`
- `指令合輯`

newline 可留空。若留空，Web 端會自動補 `\n`，ESP32 才能切分完整指令。

### 指令合輯

按 `指令合輯` 會開啟 BLE 指令說明視窗。內容包含：

- 開機時間設定
- 舊式 `set/reset` 指令
- 使用者資料
- 初始校正
- 高度設定
- 手動/自動模式
- 分類與 PRED
- 壓力與狀態查詢
- ESP32 Manual 控制

### ESP32 Manual 控制

`ESP32 Manual 控制` 預設收合，避免大量控制按鈕佔用第一屏。

展開後可操作：

- 進入 ESP32 Manual
- 停止
- Monitor / Neck / Head 單獨充氣
- Monitor / Neck / Head 單獨吸氣
- 全部同時洩氣
- 設定 Head / Neck 目標
- 離開 ESP32 Manual 並回開機流程

注意：這裡的 ESP32 Manual 是韌體層級的 `MANUAL_CONTROL`，不同於 Web 端的 `手動模式 / 自動模式`。

## 使用者資料

設定使用者基本資料：

- 生理性別
- 年齡
- 身高
- 體重

按 `設定` 後 Web 會送：

```text
USER,<gender>,<age>,<height>,<weight>
```

ESP32 正常回覆：

```text
USER,OK
```

使用者資料會影響韌體計算 Head / Neck 初始高度。

## 校正與分類狀態

此區塊可收合。主要顯示校正流程、anchor、分類與 PRED 狀態。

### Web 手動模式

Web 手動模式表示：

- 不自動啟動姿勢分類。
- 不自動啟動 PRED 自動調整。
- 仍可做初始校正。
- 仍可手動調整高度。

切到手動模式時會送出或維持：

```text
PRED,STOP
CLASSIFY,STOP
FEATURE,PRED,OFF
FEATURE,STATUS
```

### Web 自動模式

Web 自動模式表示：

- 完成 BSHS 與 BLHL anchor 後，自動啟動分類。
- 若 PRED 功能開啟，會自動啟動高度自動調整。

切到自動模式會送：

```text
FEATURE,POSE,ON
FEATURE,PRED,ON
FEATURE,STATUS
```

兩個 anchor 都完成後會送：

```text
MODE,NORM
CLASSIFY,START
PRED,START
```

## 初始校正

按 `初始校正` 進入校正 modal。

流程：

1. 選擇頸椎狀態。
2. 進入仰躺校正或側躺校正。
3. 使用 `+ / -` 修改 Head / Neck 高度。
4. 按「確定調整」送出高度。
5. 按「完成校正」擷取 anchor。

### 仰躺 BSHS

進入仰躺校正時會送：

```text
INIT,NORM,S
DEBUG
```

`DEBUG` 用途：讀回 ESP32 當下的高度/人體測量學與姿勢流程狀態，供 Web 預填校正欄位與同步監測資訊。

按「確定調整仰躺高度」會送：

```text
SET,NORM,<condition>,S,HEAD,<height_cm>
SET,NORM,<condition>,S,NECK,<height_cm>
```

按「完成校正」會送：

```text
SET,OK
ANCHOR,START,BSHS
```

### 側躺 BLHL

進入側躺校正時會送：

```text
INIT,NORM,L
DEBUG
```

Web 在連線期間也會每 `10 秒` 背景送一次 `DEBUG` 做同步。若 ESP32 當下在 `MANUAL_CONTROL`，常見回覆是：

```text
MANUAL,IGNORED,DEBUG
```

這代表「manual 模式不處理 DEBUG」，是預期行為。

Web 會等待 ESP32 進入 `STANDBY` 後開放側躺微調。若等待逾時，會開放人工微調。

按「確定調整側躺高度」會送：

```text
SET,NORM,<condition>,L,HEAD,<height_cm>
SET,NORM,<condition>,L,NECK,<height_cm>
```

按「完成校正」會送：

```text
SET,OK
ANCHOR,START,BLHL
```

## 高度上下限與 0.5 cm 步進

Web 端與 `pose_pre_v3.1` 韌體共同限制高度：

| 通道 | 最小值 | 最大值 | 步進 |
|---|---:|---:|---:|
| Head | 7.0 cm | 16.0 cm | 0.5 cm |
| Neck | 10.0 cm | 14.0 cm | 0.5 cm |

既有校正／高度控制欄位會：

- 限制在合法上下限內。
- snap 到最接近的 `0.5 cm`。
- `+ / -` 只改 Web UI 暫存值。
- 按「確定調整」後才送出 BLE 指令。

ESP32 端也會再次 clamp / snap，韌體仍是最後安全防線。

Experiment 01 的 Head／Neck 欄位沿用相同上下限與 0.5 cm 步進，但只驗證並紀錄操作者輸入；按「開始記錄」不會送出高度調整指令。

## 高度與壓力監測

此區塊顯示：

- Monitor 壓力
- Neck 壓力
- Head 壓力
- Head 目標高度 / 目前高度
- Neck 目標高度 / 目前高度
- 更新時間

下方監測紀錄支援：

- 自動滾動
- 固定滾動
- 清空監測紀錄

監測更新來源和訊息紀錄一致，主要由 ESP32 BLE notification 觸發。

## 線圖監測

右側線圖監測包含 Y 軸設定、即時摘要與三張線圖。

### Y 軸設定

可設定壓力線圖：

- Y 軸最大值
- Y 軸最小值

按 `更新圖表` 後套用到壓力線圖。

### 即時摘要

摘要顯示：

- Monitor
- Neck
- Head
- last5
- prev5
- Diff
- 更新時間

### 線圖模式

- `只看壓力`：只展開 Monitor / Neck / Head 壓力線圖。
- `完整線圖`：壓力線圖、平均值線圖、差值線圖全部展開。
- `只看摘要`：只保留摘要，不顯示圖表。
- `收合線圖`：把右側圖表收成摘要狀態。

右側欄位有獨立滾輪。`完整線圖` 不會壓縮三張圖，而是讓圖表自然往下展開。

## 訊息紀錄

顯示 Web 送出的指令與 ESP32 回傳訊息。

支援：

- 自動滾動
- 固定滾動
- Clear Text

若要確認指令是否成功，優先看訊息紀錄中的 ESP32 回覆，例如：

```text
MCU,OK
MANUAL,OK,ENTER
MANUAL,IGNORED,DEBUG
PRED,OK,START
CLASSIFY,OK,START
```

## 指令說明與範例

### 開機時間設定

這些是舊式指令，仍可用於設定開機固定充氣時間。

| 指令 | 用途 | 範例 |
|---|---|---|
| `SET,MONITOR,<ms>` | 設定 Monitor 開機充氣時間 | `set,monitor,15000,` |
| `SET,NECK,<ms>` | 設定 Neck 開機充氣時間（建議 `>10000 ms`） | `set,neck,12000,` |
| `SET,HEAD,<ms>` | 設定 Head 開機充氣時間（建議 `>30000 ms`） | `set,head,32000,` |
| `RESET` | 非 Manual 狀態下回到 `DRAIN_ALL`，重新跑開機流程 | `reset,` |

常用組合：

```text
set,monitor,15000,
set,neck,12000,
set,head,32000,
reset,
```

前三行送出後會立刻更新 ESP32 變數，但不會立刻重跑流程。`reset,` 會讓流程回到 `DRAIN_ALL`，下一輪才會套用新的開機充氣時間。
建議值：`set,neck,<ms>` 大於 `10000`（10 秒），`set,head,<ms>` 大於 `30000`（30 秒）。

注意：若 ESP32 已在 `MANUAL_CONTROL`，新版 `reset,` 只會停止輸出並停留在 Manual。要離開 Manual 並回開機流程，請使用：

```text
MANUAL,STARTUP,7.0,10.0
```

### 使用者資料

```text
USER,<gender>,<age>,<height>,<weight>
```

範例：

```text
USER,1,25,170,65
```

### 初始高度與校正

```text
INIT,NORM,S
INIT,NORM,L
SET,OK
ANCHOR,START,BSHS
ANCHOR,START,BLHL
ANCHOR,STATUS
ANCHOR,GET,BSHS
ANCHOR,GET,BLHL
```

### 高度設定

```text
SET,NORM,<condition>,<S|L>,HEAD,<height_cm>
SET,NORM,<condition>,<S|L>,NECK,<height_cm>
```

範例：

```text
SET,NORM,1,S,HEAD,7.5
SET,NORM,1,S,NECK,10.5
SET,NORM,1,L,HEAD,14.0
SET,NORM,1,L,NECK,14.0
```

### 功能開關

```text
FEATURE,POSE,ON
FEATURE,POSE,OFF
FEATURE,PRED,ON
FEATURE,PRED,OFF
FEATURE,STATUS
```

### 分類與 PRED

```text
CLASSIFY,START
CLASSIFY,STOP
CLASSIFY,GET
PRED,START
PRED,STOP
PRED,GET
```

### 壓力與狀態查詢

```text
P
I
DEBUG
GET,INFT,ALL
```

`DEBUG` 建議在非 `MANUAL_CONTROL` 時使用；manual 期間可能收到 `MANUAL,IGNORED,DEBUG`。

### ESP32 Manual 控制

```text
MANUAL,ENTER
MANUAL,STOP
MANUAL,FILL,MONITOR
MANUAL,DRAIN,MONITOR
MANUAL,FILL,NECK
MANUAL,DRAIN,NECK
MANUAL,FILL,HEAD
MANUAL,DRAIN,HEAD
MANUAL,DRAIN,ALL
MANUAL,STARTUP,<head_cm>,<neck_cm>
```

範例：

```text
MANUAL,ENTER
MANUAL,FILL,HEAD
MANUAL,DRAIN,ALL
MANUAL,STARTUP,7.0,10.0
```

### Manual 低階輸出

ESP32 在 `MANUAL_CONTROL` 中仍支援低階輸出：

```text
S,<index>,<0|1>
RESET
MOTORPWM,<value>
```

範例：

```text
S,1,1
S,1,0
MOTORPWM,128
```

## 匯出資料

本節說明既有全站 `Export Data`；Experiment 01 另外使用「匯出 CSV＋線圖」，兩者資料來源與欄位格式不同。

按 `Export Data` 會匯出：

- CSV：壓力、差值、last5、prev5、state、onoff、predict pose、pose 等資料。
- TXT：訊息紀錄。

CSV 的 `timestamp` 預設為 ISO-8601 UTC（尾碼 `Z`），例如 `2026-05-13T02:21:45.714Z`。在台灣時區（UTC+8）閱讀時，請加 8 小時對照本機時間。

資料來源為瀏覽器 IndexedDB。重新整理頁面或重新開始實驗前，請先匯出需要保存的資料。

## 常見問題

### 按下 Send Text 沒反應

先確認：

- 已按 `Connect BLE`。
- 訊息紀錄有顯示 `Connected!`。
- 指令最後有換行。newline 留空時 Web 會自動補 `\n`。
- ESP32 是否仍在 `MANUAL_CONTROL`，Manual 中部分一般指令會被忽略。

### `set,monitor,...` 是否還能用

可以。它會立即更新 `MonitorInitialFillTime`。但若要重新套用到開機流程，通常需要再送 `reset,`。

### `reset,` 是否等於回開機流程

非 Manual 狀態下，是。
Manual 狀態下，不是。Manual 狀態下要回開機流程請用：

```text
MANUAL,STARTUP,<head_cm>,<neck_cm>
```

### 0.5 cm 高度是否會送到 ESP32

既有校正／高度控制介面按下確認後會送出，Web 與 ESP32 `pose_pre_v3.1` 均支援 0.5 cm 步進。Experiment 01 的高度欄位只做本輪紀錄，即使填入 0.5 cm 刻度也不會下達高度命令。

### `ESP32 Manual 狀態：ESP32 Manual 忽略指令：DEBUG` 是不是壞掉

不是。Web 會定期送 `DEBUG` 同步資料；但 ESP32 在 `MANUAL_CONTROL` 只接受部分指令，`DEBUG` 會回 `MANUAL,IGNORED,DEBUG`。若要停止這類訊息，請先離開 manual（例如送 `MANUAL,STARTUP,<head_cm>,<neck_cm>`）。

### 如何確認模式切換成功

看「訊息紀錄」中的回覆：

```text
FEATURE,STATUS,...
CLASSIFY,OK,START
PRED,OK,START
PRED,OK,STOP
```

### 如何確認 Manual 指令成功

看「訊息紀錄」或 `ESP32 Manual 狀態`：

```text
MANUAL,OK,ENTER
MANUAL,OK,STOP
MANUAL,OK,FILL,HEAD
MANUAL,OK,DRAIN,ALL
MANUAL,OK,STARTUP,7.0,10.0
```

## 開發注意事項

- `spp3_BLE/index.html`：主要 DOM 結構。
- `spp3_BLE/styles.css`：整體版面、卡片、accordion、線圖與 modal 樣式。
- `spp3_BLE/app.js`：BLE 連線、指令送出、資料解析、圖表更新、校正流程與 UI 狀態。
- `spp3_BLE/experiment-hub.js`：實驗清單與單一內容容器、共用開始／結束／匯出控制、切換鎖定及離頁保護。
- `spp3_BLE/pressure-experiment.js`：四條件表單、各條件最後一輪暫存、獨立 Chart instance、CSV＋PNG 下載。
- `spp3_BLE/pressure-recorder.js`：不依賴 DOM／BLE 的記錄器，負責 metadata 快照、樣本、計時、中斷狀態與 CSV 序列化。
- `tests/`：合成資料回歸與獨立 Chrome smoke 腳本，不是正式頁面啟動依賴。
- 修改 BLE 指令時，請同步更新：
  - Web 按鈕與 UI 文案
  - `指令合輯`
  - README 指令說明
  - ESP32 parser

本次實驗資料流沿用 `app.js` 的 `handleNotifications()` 完整分行與 `serial_message()` 解析，將有效 P 樣本及接收時間交給 Hub 的 `receivePressure()`，再由實驗模組交給本輪 recorder。實驗圖表讀取 recorder 樣本，匯出使用開始時的快照；沒有第二套 BLE 通知監聽或輪詢。開始／結束只控制記錄器，不送硬體命令、不重設 BLE queue、不重建右欄 Chart、不清空監測紀錄，也不重新初始化整個 app。

## License

原始 Web Serial 範例基於 Apache-2.0。此 repo 依原專案授權與研究用途維護。
