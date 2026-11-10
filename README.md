# Pillow Data Collect Web - spp3_BLE_v4.1

台科大智慧枕墊資料收集系統（iPillow Web）。主要入口是 `spp3_BLE/`，以純 HTML／CSS／JavaScript 透過 Web Bluetooth 與 ESP32 溝通，提供資料收集、校正、控制與監測介面。

v4.1 在既有 Experiment 01 壓力資料收集之外，新增 [Experiment 02 壓力補償與高度控制之舒適度比較](#experiment-02-壓力補償與高度控制之舒適度比較)。實驗 02 提供兩姿勢校正、R／M／A／I 四種支撐設定、空枕與躺回壓力快照、0～10 分評分，以及 SVG 儲存至指定資料夾。Experiment 01 仍提供 30 秒記錄和 CSV＋PNG 匯出。

更新日期 **2026-11-10**（Asia/Taipei）。

v4.1 已通過 **116 項 Node 回歸測試**。測試涵蓋既有 Experiment 01、Experiment 02 下降比例、整數 ADC 目標、結果格式、校正、0 分及 10 分、SVG 資料夾寫入、同名檔確認與寫入失敗後重試。ESP32 編譯已通過；完整八條件實機量測仍須依本文件逐項驗證。

## 對應版本

- Web repo：[`NTUST-LSC-Lab/Pillow-data-collect-web`](https://github.com/NTUST-LSC-Lab/Pillow-data-collect-web)
- Web branch：[`spp3_BLE_v4.1`](https://github.com/NTUST-LSC-Lab/Pillow-data-collect-web/tree/spp3_BLE_v4.1)，基於 `spp3_BLE_v4`。本節描述本機 v4.1 工作副本中的實作。
- Experiment 02 方法測試對應本機 `Pillow_esp32/ipillow-spp3_BLE_v4_experiment_02` 的 `EXP02` 指令。其他既有網頁操作仍使用原指令；韌體與網頁的新指令尚待實機配對驗證。
- 主要 Web 目錄：`spp3_BLE/`；舊版 Web Serial 介面保留在 `spp3/`。

## 目錄結構

```text
Pillow-data-collect-web/
├─ spp3_BLE/
│  ├─ index.html                 # 主頁、Experiment Hub 與實驗表單 template
│  ├─ styles.css                 # 雙欄、七張左欄 Card 與實驗響應式樣式
│  ├─ app.js                     # 既有 BLE／控制流程及已解析壓力樣本的橋接
│  ├─ experiment-hub.js          # 九實驗選擇、共用控制及離頁保護
│  ├─ experiment-height-control.js # 校正微調、定時啟動、裝置到位與逾時保護
│  ├─ comfort-experiment.js      # Experiment 02 校正、方法測試、評分與 SVG 存檔
│  ├─ pressure-experiment.js     # Experiment 01 表單、曲線、條件暫存及雙檔下載
│  └─ pressure-recorder.js       # 30 秒記錄器、時間／中斷狀態及 CSV
├─ tests/
│  ├─ pressure-recorder.test.cjs
│  ├─ pressure-bridge.test.cjs
│  ├─ experiment-hub.test.cjs
│  ├─ pressure-ui.test.cjs
│  ├─ chart-options.test.cjs
│  ├─ experiment-height-control.test.cjs
│  ├─ experiment-height-bridge.test.cjs
│  ├─ comfort-experiment.test.cjs
│  ├─ comfort-report.test.cjs
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

## Experiment 02 壓力補償與高度控制之舒適度比較

### 本版修改摘要

| 修改範圍 | 目前行為 |
| --- | --- |
| 校正流程 | 姿勢一與姿勢五均由受測者直接躺在枕頭上校正；開啟校正視窗後讀取目前控制高度，直接微調，不要求離枕，也不執行空枕初始化。 |
| 方法按鈕 | R／M／A 直接傳送 Head、Neck 目標 ADC；I 傳送同姿勢的 Head、Neck 校正控制高度。 |
| 實驗控制 | 只在按下 R／M／A／I 時傳送 `EXP02,START`；切換姿勢、開啟實驗或保存校正不會啟動實驗控制。 |
| 跨端等待 | Web 只接受同一輪 ID 的 `EXP02,ACK`、`STATE`、`DONE`、`ERR`；收到 `DONE` 後才能記錄空枕。 |
| 結果顯示 | 空枕壓力以 10 分校正基準顯示「上升／下降／持平」；R／M／A 另顯示實測與目標的正負 ADC／kPa 差值。 |
| 儲存 | 每位受測者保存 1 張兩姿勢校正總覽與 8 張方法結果 SVG，直接寫入操作者選定的資料夾。 |
| 進階控制 | Neck 充氣新增毫秒欄位，送出 `MANUAL,FILL,NECK,<ms>`；ESP32 保留最終時間與氣量安全檢查。 |

### 介面與新增功能

- **受測者**。沿用頁面上方「使用者資料」的性別、年齡、身高與體重。在實驗 02 以選單選擇 S01～S10，並指定本次 SVG 的儲存資料夾。
- **兩姿勢校正**。姿勢一為仰躺，姿勢五為正側躺。受測者維持指定姿勢，操作者在校正小視窗直接微調高度；滿意度 10 分且壓力穩定後，保存三顆氣囊 ADC、Head／Neck 控制高度與擷取時間。兩組基準合成一張校正總覽。
- **方法測試**。切換姿勢一或姿勢五後選 R／M／A／I。每組獨立記錄空枕與躺回壓力，並選 **0～10 分**。按截圖儲存後，畫面更新各姿勢的完成進度。

### 四個方法與下降百分比

| 按鈕 | 方法 | 姿勢一 Head | 姿勢一 Neck | 姿勢五 Head | 姿勢五 Neck |
| --- | --- | ---: | ---: | ---: | ---: |
| **R** | 論文補償。採用《人工智慧枕墊之機構改良、睡姿壓力分析與法規導入》圖 4-10。 | 0.3300% | 10.5200% | 0.3400% | 5.8900% |
| **M** | 30 人平均補償。採用本研究 30 人於相同姿勢的有人校正與離枕壓力資料（2026-08-26 版本）。 | 3.1331% | 9.3909% | 4.9074% | 8.7339% |
| **A** | 取同姿勢、同氣囊的 R 與 M 百分比平均。 | 1.7315% | 9.9554% | 2.6237% | 7.3119% |
| **I** | 使用本人同姿勢的 Head／Neck 校正控制高度。 | — | — | — | — |

表格列的是**設定下降百分比**，計算使用原始 ADC。表格取到小數第 4 位，程式使用 [原始比例](spp3_BLE/comfort-experiment.js) 計算，結果圖顯示到小數第 2 位。Monitor 四種方法皆固定充氣 **14.5 秒**，表中的比例只用於 Head 與 Neck。

- R／M／A 的空枕目標 ADC 為 `同姿勢有人校正 ADC × (1 − 設定下降比例)`。
- 空枕實測以 10 分校正 ADC 為基準：低於基準顯示「下降 X%」，高於基準顯示「上升 X%」，相同則顯示「持平 0.00%」。R／M／A 另列出 `空枕實測 − 目標 ADC` 的正負差值及 kPa；I 沒有壓力目標，顯示控制高度、空枕實測與相對校正變化。
- 躺回後另比較 `躺回實測 ADC − 同姿勢有人校正 ADC`。畫面與 SVG 同時顯示 ADC 與換算的 kPa，比例的分母維持為 ADC。

### Web 傳送內容

| 按鈕 | 傳送內容 | ESP32 控制方式 |
| --- | --- | --- |
| R／M／A | `EXP02,START,<id>,ADC,<head_target_adc>,<neck_target_adc>` | 依空枕目標 ADC 控制 Head、Neck。 |
| I | `EXP02,START,<id>,HEIGHT,<head_cm>,<neck_cm>` | 依同姿勢校正控制高度換算 Head、Neck 充氣時間。 |

`id` 由 Web 每輪產生。R／M／A 目標先保留程式中的原始比例精度，再以 `Math.round()` 取整數 ADC 後送出。I 不使用下降百分比。

### 操作順序

1. 用 Chrome 或 Edge 開啟主頁，連接 ESP32 並等待一般待命。填寫上方「使用者資料」，再到「實驗專區」選 **Experiment 02**，選擇受測者編號並按「選擇儲存資料夾」。若要使用裝置提供的姿勢五建議起始高度，先在上方完成使用者資料的「設定」。
2. 受測者以指定姿勢躺在枕頭上，再按「校正姿勢一」或「校正姿勢五」。視需要以 **0.5 cm** 微調 Head 與 Neck，按「套用高度」。Head 可設 **7–16 cm**，Neck 可設 **10–14 cm**。姿勢五若有裝置建議起始值，會帶入欄位供套用。校正階段不要求受測者離枕，也不重新執行空枕初始化。
3. 等裝置到位、姿勢及壓力穩定、受測者確認滿意度 **10 分**後，勾選確認並按「校正完成」。請受測者換成另一個校正姿勢，再用同樣流程完成姿勢五校正。兩姿勢都保存後，按「截圖並儲存校正總覽」。
4. 在「方法測試」選姿勢一或姿勢五。受測者離枕後勾選確認，按 R／M／A／I 其中一個。每次方法測試都會重新吸乾與充氣。充氣完成後維持空枕，等讀值穩定再按「記錄空枕壓力」。
5. 請受測者**以本輪同一姿勢躺回**。待壓力穩定後按「記錄躺回壓力」，依受測者回覆選 **0～10 分**，再按「截圖並儲存本次結果」。
6. 重複步驟 4–5，完成姿勢一四種與姿勢五四種方法。每位受測者共 **1 張校正總覽＋8 張方法結果圖**。已存的條件可再點方法按鈕檢視及重新存圖。

### 存檔與目前的控制限制

- 兩種截圖都採用與截圖精靈相同的 **SVG** 格式。例如 `S01_00_校正總覽.svg`、`S01_姿勢一_M.svg`、`S01_姿勢五_I.svg`。按截圖後直接存入選定資料夾，同名檔會先詢問是否覆蓋。寫入成功才會更新方法完成進度。重新整理後需再選資料夾，頁面內暫存的校正及進度也會清除，已存的 SVG 保留。
- 操作者確認穩定後擷取當時的一筆有效壓力回報。BLE `P:` 順序為 **Monitor、Neck、Head**。校正總覽包含基本資料與兩個基準。方法結果包含方法、姿勢、校正控制高度、各氣囊充氣設定、空枕與躺回時間、壓力差值及滿意度。
- **方法測試使用實驗 02 專用流程**。R／M／A 將目標 ADC 傳給 ESP32，由韌體依有效壓力讀值停泵；I 傳送同姿勢的校正控制高度，由韌體換算充氣時間。每次均先吸乾，再固定為 Monitor 14.5 秒，最後處理 Head 與 Neck。網頁等待相同實驗 ID 的 `EXP02,ACK` 與 `EXP02,DONE` 才允許記錄空枕；逾時或裝置回報 `ERR` 會停止該次測試。空枕是否達到目標，仍由操作者待穩定後記錄實測值比較。校正小視窗沿用既有高度微調流程。
- 新增進階文字指令 `MANUAL,FILL,NECK,<ms>`，僅供定時頸部測試；韌體仍執行時間與安全額度檢查。目前已完成部分實機流程檢查，仍需完成R／M／A／I、失敗處理與斷線行為的整套驗收。

### 結果表判讀

空枕結果固定使用以下欄位：

| 欄位 | 說明 |
| --- | --- |
| 控制設定 | R／M／A 顯示設定下降百分比；I 顯示控制高度。 |
| 壓力目標 | R／M／A 顯示目標 ADC／kPa；I 沒有壓力目標，顯示 `—`。 |
| 空枕實測 | 操作者確認穩定後保存的單筆 ADC／kPa。 |
| 相對 10 分基準 | 實測低於校正基準顯示「下降 X%」，高於基準顯示「上升 X%」，相同顯示「持平 0.00%」。 |
| 實測 − 目標 | 僅 R／M／A 使用；正值表示高於目標，負值表示低於目標。 |

躺回結果以 `本次躺回 ADC − 同姿勢 10 分校正 ADC` 顯示正負 ADC／kPa。結果是單筆穩定快照，不是期間平均值。

### 常見狀況

| 畫面訊息或現象 | 處理方式 |
| --- | --- |
| 8 秒內沒有 `EXP02,ACK` | 確認 ESP32 已燒錄 `ipillow-spp3_BLE_v4_experiment_02`，舊韌體不支援四個方法按鈕。 |
| `BUSY` | 等待其他高度、Manual 或實驗控制完成，確認輸出關閉後重新開始。 |
| `SENSOR_TIMEOUT` | 檢查三通道是否持續收到有效壓力樣本。 |
| `TARGET_BELOW_DRY`／`TARGET_OVERSHOOT`／`TARGET_UNREACHABLE`／`TARGET_MISMATCH` | 記錄目標與當時 ADC，不保存本輪空枕結果；檢查百分比、氣路及感測器後重做。 |
| RGB 不依狀態更新 | 在進階文字指令送出 `RGB,AUTO`，退出先前的 RGB 手動模式。 |
| 重新整理頁面後校正消失 | 校正與進度只暫存在頁面記憶體；以已儲存的 SVG 為正式紀錄。 |

## 2026-11-04 Experiment 01 獨立校正

在 Experiment 01 內容最上方顯示姿勢一／姿勢五的 Head、Neck 高度微調與並列校正紀錄，先校正，再往下填寫本輪設定。姿勢五先帶入 ESP32 依已設定的性別、年齡、身高與體重推估的起始高度，再由操作者微調。實驗區不自動傳送 `USER`、`INIT,NORM,L`、`ANCHOR,START/CLEAR` 或 `MANUAL,ENTER`；原 firmware 與已完成 anchors 不變。

介面已移除備註、試次編號及「將此姿勢已存高度帶入本輪」功能。本輪 Head／Neck 高度由操作者填寫；保存校正快照不會回填本輪欄位。CSV 的 `notes` 與 `trial_index` 保留為空值；原 23 欄順序不變，末尾新增 3 個受試者欄位，共 26 欄，檔名與圖表不再顯示試次，重測以唯一 `run_id` 區分。

上方「使用者資料」目前輸入的年齡、身高與體重會自動顯示在實驗區受試者編號下方。此處讀取的是表單目前輸入值，不代表 ESP32 已確認；不需為帶入資料按上方「設定」，也不會重送 `USER` 或清除 anchors；姿勢五建議高度則另須上方資料已設定到裝置，且收到相符回覆。開始前修改資料會取消本輪確認，請核對受試者編號及資料後重新勾選。

按「開始記錄」時保存三個值，本輪結果摘要、CSV 與線圖 PNG 都使用這份快照。記錄中修改上方欄位不改寫本輪；完成後可看到下一輪使用的新輸入，切回舊條件仍保留舊結果。保存校正快照時，也會記下當下年齡／身高／體重並顯示於各姿勢紀錄，供截圖使用。年齡須為非負整數，身高／體重須為大於零的有限數字並保留小數；空白或無效值顯示「未填／無效」、CSV 留空，不自動填零，也不新增必填限制。

操作順序：

1. 連接 ESP32，等待一般待命狀態，在頂端校正區填受試者編號（例如 `S01`）。此編號也共用於下方本輪設定。
2. 選「目前校正姿勢」，讓受試者擺好該姿勢；按「準備微調」，停止自動調整並讀取裝置當下高度。此動作切換 Web 控制模式，並不進入 ESP32 的 `MANUAL_CONTROL`。 姿勢五已移除固定 **13 cm** 預設：請先在上方填妥性別、年齡、身高、體重並按「設定」，再準備微調，取得該使用者的裝置建議值。準備微調不以裝置當下高度覆蓋建議或人工草稿；按「套用」才會移動裝置。相同使用者資料下，手動微調後切換姿勢再切回會保留草稿；變更資料或性別時清除姿勢五舊草稿，等待新的相符建議。姿勢一原有讀取高度行為不變。
3. 設定 Head／Neck 待套用值，或用 ± 每次調整 0.5 cm；可按單獨通道的「套用」，或按「同步套用 Head／Neck」一次套用兩個設定。Head 限 7–16 cm、Neck 限 10–14 cm。同步套用會先確認兩欄有效並保存本次設定，依序等待 Head 到位後自動套用 Neck，無須再按第二次；不是兩顆氣囊同時充放氣。沿用 `SET,NORM,EXPERIMENT,S,HEAD|NECK,<高度>` 與原到位確認，不重跑啟動充氣，也不因選擇姿勢而移動。
4. 待受試者自然呼吸且姿勢穩定，勾選確認，按「保存此姿勢校正快照」。必須有到位後的新鮮完整 P 訊息，待套用值也必須與裝置高度一致。
5. 對另一姿勢重複步驟 2–4。兩組紀錄並列顯示受試者、目標高度、裝置估計高度、三顆氣囊 ADC 與壓力接收時間；需要保留時，由操作者手動截圖。
6. 選擇對應的實驗條件，手動填寫本輪 Head／Neck 設定高度。若目前裝置位於另一姿勢高度，需先單獨或同步套用正確高度並確認穩定，再勾選本輪確認、開始記錄。

姿勢五讀取同一份完整 DEBUG 的最終 `HLF`（Head）／`N1LF`（Neck），不使用 `HLF_raw`／`N1LF_raw` 或舊式混合快取，也不在 JavaScript 重寫人體公式。裝置依性別與年齡組別估算體寬，再推估側躺高度；final 值已包含 0.5 cm 步進、安全範圍及初始 Head 不高於 Neck 的策略。Web 核對目前表單與裝置 profile、連線及 3.5 秒回覆新鮮度；缺漏、不符或過期時不產生新預設值，也不退回固定 13 cm。

若新鮮完整回覆確認裝置已換成另一組使用者資料，即使上方表單未變，也會清除舊姿勢五草稿並取消確認。暫時過期、斷線或準備時尚未收到完整資料不會清除同一使用者的手動值；是否允許套用仍由既有連線、到位及新鮮度檢查決定。

裝置 `USER` 以整數處理身高／體重；例如輸入 170.5 cm、65.5 kg，裝置以 170 cm、65 kg 推估，實驗 CSV 仍保留原小數。建議高度橋接只接受一般十進位數字，避免科學記號在 Web 與 firmware 解析不同。上方既有「設定」會送 USER、停止 PRED，且使用者資料變更時會清除舊 anchors；新的實驗帶入功能本身不重送 USER、不自動套用高度，也不更動 firmware。

同步套用全程鎖定重複操作、姿勢／受試者切換及開始記錄。Head 階段若失敗、逾時或斷線，就不送 Neck；已完成的調整不自動復原，需由操作者確認裝置現況。兩個高度都到位後，才可確認穩定並保存快照。

校正快照是**按下保存時最新的一筆完整 P 訊息，不是平均值或模型訓練校正**。「保存此姿勢校正快照」只把資料暫存於本頁記憶體並顯示在畫面，**不會產生或下載圖片**；請使用操作者的截圖工具手動保存畫面。高度是 firmware 依充放氣時間估計，並非高度感測器實測。

快照按受試者編號及姿勢分開暫存，換人不會沿用另一人的快照，切回同一編號可查看其已存紀錄；重存前會要求確認替換。離開／重新整理會遺失記憶體資料，沒有自動存檔或跨重新整理恢復。校正時的壓力／高度快照不併入每輪 CSV，也不會出現在每輪壓力曲線 PNG 中；每輪受試者資料另取開始記錄時的值。

`HEIGHT_SET` 僅視為目標 ACK；到位須確認本次命令後完整 DEBUG 的 target/current 及一般待命、氣路關閉的 I 回報。微調等待中禁止重複調整及切換實驗；斷線、逾時、裝置仍在動作、舊 anchor 正在採樣或回報過期時不允許保存。已啟用本區校正的收數流程還會檢查本輪高度與裝置回報一致。

若已校正卻不能開始，請看「開始記錄」上方的具體原因。本輪高度是獨立的人工記錄欄位：例如裝置已到位 Head 9 cm／Neck 11 cm，但本輪 Head 仍填 8 cm，會顯示不符通道及兩個數值；請將本輪記錄改為目前高度並重新勾選確認，不需為修正記錄再次調整枕頭。空白欄位顯示「未填」，高度未就緒則顯示裝置狀態原因。

「Web 未回報自動高度調整啟用」是控制提醒，本身不阻擋開始；未啟用時以一般提示顯示，自動模式或 PRED 啟用時保留警示。BLE、有效壓力訊息、高度一致、表單確認及未匯出保護仍依原條件檢查，未自動回填本輪高度或改動硬體控制。

### 準備微調的停用回覆修正（2026-11-04）

ESP32 在 PRED／POSE 功能已停用時，連 `PRED,STOP`／`CLASSIFY,STOP` 或 GET 都可能回 `ERR,DISABLED`。本版不再把精確的 `PRED,ERR,DISABLED`、`CLASSIFY,ERR,DISABLED` 當成高度操作失敗；其他錯誤仍中止操作。停用回覆本身不代表已準備完成，仍須取得本次準備後的 `FEATURE,STATUS`，確認 PRED／LEGACY 關閉，以及新鮮完整 DEBUG／I、一般待命、氣路全關、無 anchor 採樣及 current＝target。

此 firmware 停用 PRED 後，DEBUG 的 `pre_stage` 可能保留停用前的快取值。仍要求該欄位存在且非空，並保留於診斷資料；其快取值不再單獨阻擋已確認關閉且待命的微調。SET 送出前再檢查功能旗標及裝置狀態；送出後仍須 ACK 與新 DEBUG／I 才確認到位，保留高度上下限、單通道操作、斷線與逾時保護。本次沒有更動 firmware 或協定。

程式驗證使用合成資料，不會連接 BLE 或操控硬體。桌面與 320 px 截圖位於 `tests/.artifacts/chart-browser/SYNTHETIC_calibration-desktop.png`、`SYNTHETIC_calibration-320.png`，只供本機驗證，不提交。

## Experiment 01 壓力資料收集

實驗專區位於左欄「高度與壓力監測」與「訊息紀錄」之間，九個實驗共用同一個 Hub。首次預設收合。v4.1 提供 Experiment 01 和 Experiment 02，Experiment 03–09 為未設定插槽。Experiment 01 的四種條件在該實驗內選擇。

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
2. 展開「實驗專區」，選擇 Experiment 01，在校正區填受試者代號（例如 S01，不填姓名）。不需填試次編號，每輪自動產生唯一 `run_id`。
3. 選一個條件，依畫面安排睡姿與對應高度，人工確認並填入 Head／Neck 本輪設定高度。Head 為 7–16 cm，Neck 為 10–14 cm，步進 0.5 cm。這些數值是操作者紀錄，不是自動量測，也不下達控制命令。
4. 檢查控制狀態提醒。既有自動模式／PRED 可能改變高度；可使用上方新增的獨立校正流程，明確按「準備微調」停止自動控制，再單獨或同步套用高度。單純開始收數不會送高度命令、重送 USER 或清除 anchors。
5. 自行等待受試者穩定，勾選本輪設定確認，再按「開始記錄」。不另加等待秒數或自動判穩門檻。本輪設定與實驗切換在記錄期間鎖定；仍可收合 Hub，收集不會停止。
6. 30 秒到時自動結束。若按「提前結束」，保留已有樣本並標示未完成。檢查本輪曲線、樣本數、狀態及條件快照。
7. 按「匯出 CSV＋線圖」，確認同名前綴的 CSV 與 PNG 都已保存，再選下一條件。同一條件未要求匯出的樣本會阻擋重測；重測前仍會詢問是否已保存兩個檔案。瀏覽器若詢問多檔下載，需允許此網站；程式只能確認已要求下載，不能證明檔案已保存。

四個條件各自在本頁暫存最後一輪資料與曲線。切到尚未記錄的條件顯示空圖及該條件標題；切回已有紀錄的條件會恢復原曲線與結果快照，並可匯出該輪的 CSV／PNG。輸入表單本身仍共用，每次開始前須重新確認本輪設定。其他條件尚未匯出的結果會顯示提醒，且仍受離頁保護；切換不會丟棄它們。每個條件仍只保留最後一輪，不依受試者保存完整歷史；同條件重測前需先匯出，並確認替換。

明確 BLE 斷線立即標記 `interrupted`；連續 **3 秒**沒有有效完整 P 訊息也中止本輪，不補造資料、不自動續接。這是基於現有每秒 P 查詢的初始門檻，**尚未實機驗證**；請利用顯示的實際接收間隔評估。`data_timeout_s=3` 與 `gap_timeout_ms=3000` 保存於 CSV。

### 訊息、時間與圖表

- 收集入口沿用既有通知分行與 P parser：`P:<pm> <pn> <ph>`，固定對應 Monitor、Neck、Head。只有已換行、恰好三個完整且有限數值的 BLE 回覆成為樣本；不收指令 echo、I／DEBUG 或 100 ms timeout 的未完成片段。網頁保存 P 訊息中的 ADC 數值，不另套校正公式或轉成 kPa。
- 資料域說明：此處保存的是 firmware 處理／濾波後對外回傳的 ADC（filtered ADC），不是感測器未濾波的原始讀值。介面部分沿用的 `raw ADC`／「原始 ADC」指 Web 原樣保存收到的 ADC 數值，不能解讀成未濾波訊號。本次沒有修改 firmware 的讀取、濾波或 ADC→kPa 公式。
- 每列代表一筆完整有效訊息；相同數值的不同訊息仍分別保存。不新增 BLE 連線或通知 listener，P 查詢仍為每秒一次。獨立校正啟用後另以最多每秒一組 DEBUG／I 查詢確認高度及狀態；額外通訊對實際 P 接收間隔的影響需實機驗證，每秒查詢不等於實測取樣率。
- `timestamp_iso` 是**網頁處理收到完整訊息時**產生的 UTC ISO 時間（Z），不是感測器量測時間。`elapsed_s` 是此接收時刻相對按下開始的 `performance.now()` 差值，範圍 0–30 秒；不強迫樣本落在兩端、不補點或插值。
- 圖表 X 軸固定 0–30 秒，Y 軸標示「壓力（ADC）」；Monitor／Neck／Head 分別沿用紅／綠／藍配色。UI／繪圖以 250 ms 週期刷新，每筆有效訊息則立即保存，不因繪圖節流漏存。這個刷新週期不是感測器或 BLE 的取樣率；右欄既有圖表不變。
- `completed` 僅表示走完 30 秒窗口且沒有已知的上述中斷，不保證取樣數／取樣率，更不代表已驗證辨識穩健性。`ended_early` 是操作者提前結束；`interrupted` 是已知斷線或資料中斷。零樣本不能正常完成或匯出資料列。

### 每輪 CSV

共 **26 欄**，原 23 欄順序不變，最後新增 `age_years`、`body_height_cm`、`body_weight_kg`。已移除的試次與備註欄位留空，不更動全站 Export Data 格式；下游若固定要求 23 欄，需相應更新。

主要欄位（含保留欄位）：`run_id, subject_id, trial_index, condition_id, actual_pose, height_condition, head_height_cm, neck_height_cm, test_condition, sample_index, timestamp_iso, elapsed_s, monitor_adc, neck_adc, head_adc, run_status`。

補充欄位：`notes, height_source, data_timeout_s, gap_timeout_ms, interruption_reason, time_source, pressure_unit`。`height_source=operator`，`pressure_unit=ADC`；`time_source=browser_complete_pressure_message_received`。樣本編號從 1 起算，每列使用結束後的最終 `run_status`。條件及設定高度在開始時建立快照，之後改表單不會改寫既有資料。

| 欄位 | 定義 |
| --- | --- |
| `run_id` | 每輪唯一 UUID；畫面摘要省略，但 CSV 與檔名保留。 |
| `subject_id` | 操作者填寫的受試者代號，不使用姓名。 |
| `trial_index` | 相容欄位；試次功能已移除，新紀錄固定留空。使用 `run_id` 區分每輪。 |
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
| `notes` | 相容欄位；備註功能已移除，新紀錄固定留空。 |
| `height_source` | `operator`，人工紀錄，非實測高度時間線。 |
| `data_timeout_s` | 有效完整訊息的中斷門檻，現為 `3` 秒。 |
| `gap_timeout_ms` | 同一門檻的毫秒值，現為 `3000`。 |
| `interruption_reason` | 程式記錄的中斷原因；無中斷則留空。 |
| `time_source` | `browser_complete_pressure_message_received`。 |
| `pressure_unit` | `ADC`。 |
| `age_years` | 本輪開始時上方表單的年齡，歲；空白／無效時留空。 |
| `body_height_cm` | 本輪開始時上方表單的身高，cm；保留小數，空白／無效時留空，與枕高欄位分開。 |
| `body_weight_kg` | 本輪開始時上方表單的體重，kg；保留小數，空白／無效時留空。 |

CSV 使用 UTF-8 BOM、CRLF，每個欄位均正確引用並將引號加倍。檔名例如 `S01_pose1_height1_still_<唯一run_id>.csv`，其他三條件使用對應姿勢、高度及情境；每輪以新 UUID 避免重測混淆。

同次操作也下載 `S01_pose1_height1_still_<唯一run_id>.png`。PNG 僅包含所選條件該輪的三通道壓力曲線、白色背景與本輪快照標題（受試者、年齡／身高／體重、條件、姿勢、枕高、情境、筆數及狀態）；圖上不顯示 UUID。兩份內容先產生成功再要求下載，影像產生失敗時保留資料及未匯出保護。匯出需先展開並顯示該條件的曲線，避免輸出隱藏或上一條件的畫面。右欄既有圖表不受影響。

四個條件的結果都只在本頁記憶體，**沒有持久化**，也未改動 IndexedDB schema 或全站 Export Data。任一條件仍在記錄或尚未要求匯出時有離頁警告；選擇離開／重新整理仍會遺失資料。要求下載不代表瀏覽器已保存，操作者務必自行確認 CSV 與 PNG。真實受試者資料與匯出不得提交版本控制。

### 驗證紀錄與重跑方式

以下表格為 `2026-11-04`（Asia/Taipei）的自動化驗證結果；使用合成資料，不操作實體 BLE 裝置。另一次實機按鈕測試的部分結果列於表格及重跑說明之後。

| 驗證項目 | 實際結果 | 範圍 |
| --- | --- | --- |
| Node 回歸 | **111／111 通過，退出碼 0** | Recorder 18、BLE parser bridge 8、Hub 10、UI／controller 37、Chart options 3、height control 28、height bridge 7。 |
| 獨立校正 | 合成協定與 UI 測試通過 | 姿勢五使用者匹配的裝置建議、固定預設移除與草稿保留、同步套用順序／全程鎖定／雙欄驗證／首步失敗中止、兩姿勢／受試者資料隔離、單筆 ADC 快照、待套用值、到位回報、freshness、高度界線、斷線／逾時、queue、延遲 retry 與記錄中鎖定。 |
| 正式 app 橋接 | 合成整合測試通過 | 直接串接正式初始化、height adapter、指令 queue、20-byte 分段 BLE 通知與 parser；確認停止序列、SET ownership、完整 DEBUG／I／FEATURE STATUS 與 P 樣本傳遞。 |
| 記錄與 CSV | 合成資料測試通過 | 30 秒窗口、提前結束、3 秒中斷、四條件快照、CSV 引用、重測保護、26 欄、受試者資料快照及空白 `notes`／`trial_index`。 |
| Chart options | 本機 **Chart.js 4.4.1** 的 3 項測試通過 | 真正 constructor／options resolver 與模擬 Canvas API；負向測試可重現舊的 Proxy 循環指定錯誤。 |
| 真實 Chrome／Chart.js | **Chrome 156.0.8078.80／Chart.js 4.6.1：PASS** | 真實 HTML／CSS、Hub／實驗模組；使用正式 height control、合成 S00／system／firmware 回覆及可控時鐘；驗證受試者資料即時預覽／開始快照／CSV 與 PNG 文字、姿勢五裝置建議、資料／性別變更後清除與更新、單獨／同步套用 Head／Neck，無 `pageerror`。 |
| 瀏覽器操作與版面 | **桌面 1280×1000、320 px 寬度通過** | 兩姿勢校正資料並列、三個移除控制項不存在、手動高度與到位一致性、30 秒收集、曲線切換／恢復、收合後持續收集、提前結束。 |
| 實際下載產物 | **30 筆、26 欄 CSV＋有效 PNG**，同檔名前綴 | `notes`／`trial_index` 皆空，檔名及圖表無 trial；PNG 是該輪三通道曲線，不是校正區截圖。 |

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
PLAYWRIGHT_MODULE_PATH="<已安裝 Playwright 模組位置>" node tests/chart-browser-smoke.cjs
```

上述模組位置是佔位範例，需換成執行環境已安裝的 Playwright 位置。可用 `CHROME_EXECUTABLE_PATH` 指定既有 Chrome；預設尋找 macOS 的 Google Chrome 應用程式。

本次瀏覽器測試回報：

```text
Real browser: 156.0.8078.80; real Chart.js: 4.6.1; synthetic S00 data only.
PASS: real Chart.js 4.6.1; two independent synthetic calibrations; desktop/320px captures; start/30 s collection; CSV+PNG; condition restore; collapse; no page errors.
```

腳本預設載入主頁相同的 Chart.js CDN，並嚴格確認版本為 `4.6.1`。離線測試可指定 `CHART_JS_PATH` 載入未修改的函式庫，以 `EXPECTED_CHART_VERSION` 明確指定預期版本；不可把測試 4.4.1 的結果當成 4.6.1 已通過。瀏覽器啟動失敗、CDN 未載入或版本不符都會回報失敗。

測試產物位於 `tests/.artifacts/chart-browser/`，檔名標記 `SYNTHETIC` 並使用合成受試者 `S00`，不是人體／裝置量測。測試時鐘固定以 `2030-01-01` 為基準，因此合成 CSV 內的時間戳不代表實際執行日期。產物留在本機供檢查，不提交到 GitHub。

### 實機按鈕測試（2026-11-04，部分完成）

在 Edge 已連接 ESP32 的頁面進行操作；這次檢查按鈕與裝置回報流程，未驗證人體實驗結果。

- Head／Neck 的四個 `+`／`−` 按鈕可修改待套用值，並已還原測試前的目標值；此步未觀察到裝置高度改變。
- 「準備微調」曾逾時，重試後顯示就緒。
- 單獨套用與當時高度相同的 Head 目標後，最後可讀取的畫面停在「等待高度指令確認」。隨後電腦操作工具讀取 Edge 連續逾時，無法確認後續 ACK、到位或最終錯誤狀態；目前沒有足夠證據判定根因。
- 本次未完成單獨 Neck、同步套用、校正快照、開始／結束記錄與匯出的實機驗收。不得將上方合成測試通過視為這些實機項目已通過。

### 尚未驗證與使用限制

- 瀏覽器 smoke 以合成 bootstrap 取代正式 `app.js` 的啟動流程，並控制 `Date`、`performance.now()` 與 UI refresh。它驗證 **30 秒計時邏輯**，未等待實際 30 秒。另有 Node height bridge 測試串接正式 app 函式，但仍使用假的 BLE；兩者都不能取代完整 BLE app、背景分頁計時或硬體控制的實機驗收。
- Chrome smoke 已檢查 `1280×1000` 與 320 px 寬的新增校正介面；尚需人工確認實際裝置上的拖曳欄寬與完整 Tab／Enter 操作，不能由此次 PASS 推論全部無障礙驗證通過。
- 真實瀏覽器測試完整收集／匯出條件 01，並測條件 02 提前結束；四條件的欄位對應由 Node UI 測試覆蓋，尚未以 ESP32 四條件各做一輪。
- 正式收數前，接目標 ESP32 驗證停止自動控制、兩姿勢逐通道微調、ACK／到位／freshness、持續收數、四條件各 30 秒、提前結束、斷線立即中止、3 秒未收有效訊息中止及匯出檔案。中斷測試需確認資料保留且不自動續接；不得把計時完成當成資料必定完整。
- Web 現有每秒查詢一次 P 不保證恰好 1 Hz 或恰好 30 筆。若實際接收約 1 Hz，可能漏掉較短暫的微動波動；分類結論只能反映實際收集資料的時間解析度。
- 固定高度仍由操作者安排與確認；CSV 高度是設定紀錄，網頁不保證既有自動控制在記錄期間不改變高度。
- CSV＋PNG 綁定匯出；PNG 產生失敗時 CSV 也不會下載，但資料會保留。瀏覽器可能阻擋第二個下載，務必確認兩個檔案都已保存。
- 各條件只暫存最後一輪，沒有跨重新整理的持久化。資料收集完成不表示已完成離線分類或辨識穩健性驗證。

### 本次累計提交範圍（2026-11-04，13 檔）

以遠端 `spp3_BLE_v4` 的 `fdc39c26044a949ffdae465aaa2e560e90132b10` 為基底，本次累計提交停用回覆處理、同步套用、受試者資料帶入、姿勢五建議高度及開始記錄提示的變更：

| 類型 | 檔案 |
| --- | --- |
| 文件（1） | `README.md` |
| Web runtime（6） | `spp3_BLE/app.js`、`spp3_BLE/experiment-height-control.js`、`spp3_BLE/experiment-hub.js`、`spp3_BLE/index.html`、`spp3_BLE/pressure-experiment.js`、`spp3_BLE/pressure-recorder.js` |
| 測試（6） | `tests/chart-browser-smoke.cjs`、`tests/experiment-height-bridge.test.cjs`、`tests/experiment-height-control.test.cjs`、`tests/experiment-hub.test.cjs`、`tests/pressure-recorder.test.cjs`、`tests/pressure-ui.test.cjs` |

僅提交上述原始碼與文件；排除實驗資料、截圖、BLE log、`tests/.artifacts/`、`AGENTS.md`、本機依賴與機密。不修改 firmware、其他版本、default branch 或 Git 歷史；提交不代表實機驗收完成或網站已部署。

以下依功能保留各次修改範圍，檔案可能重複，不能相加作為本次提交檔數。

### 開始記錄提示修正（2026-11-04，5 檔）

- `spp3_BLE/pressure-experiment.js`：提示及開始按鈕共用高度阻擋原因，列出不符數值、未填或裝置未就緒；將未啟用自動調整的提醒改為一般提示。
- `spp3_BLE/index.html`：說明本輪高度須與裝置目前高度一致，修改後重新確認。
- `tests/pressure-ui.test.cjs`：重現高度不符，驗證修正後可收數、CSV 高度及不下達調整指令。
- `tests/chart-browser-smoke.cjs`：驗證真實瀏覽器的錯誤提示、重新確認、控制提示樣式及無高度操作。
- `README.md`：記錄原因、操作及驗證。未改 firmware、高度控制 adapter、CSV schema 或 CSS。

### 姿勢五建議高度範圍（2026-11-04，11 檔）

- `spp3_BLE/app.js`、`spp3_BLE/experiment-hub.js`：只讀、驗證並轉交目前使用者對應的裝置建議。
- `spp3_BLE/experiment-height-control.js`：完整 DEBUG 另保存六個 profile／建議欄位，原高度控制檢查不變。
- `spp3_BLE/pressure-experiment.js`、`spp3_BLE/index.html`：移除 13 cm 預設、帶入建議、保留手動草稿及顯示等待提示。
- `tests/experiment-hub.test.cjs`、`tests/experiment-height-control.test.cjs`、`tests/experiment-height-bridge.test.cjs`：缺漏／不符／過期、整數解析、合法高度與正式初始化的驗證。
- `tests/pressure-ui.test.cjs`、`tests/chart-browser-smoke.cjs`：草稿、資料／性別更新、不自動移動、真實頁面與後續收數／匯出驗證。
- `README.md`：來源、流程及限制。未改 firmware、CSV schema、CSS 或實際實驗資料。

### 受試者資料帶入範圍（2026-11-04，11 檔）

- `spp3_BLE/app.js`、`spp3_BLE/experiment-hub.js`：只讀上方數值並傳入實驗，不觸發裝置控制。
- `spp3_BLE/index.html`：加入資料顯示及確認文字。
- `spp3_BLE/pressure-experiment.js`：即時預覽、開始／校正快照、結果摘要及 PNG。
- `spp3_BLE/pressure-recorder.js`：CSV 尾端新增三欄，原欄位順序保留。
- `tests/experiment-hub.test.cjs`、`tests/experiment-height-bridge.test.cjs`：getter／Hub 驗證及初始化 fixture 接線。
- `tests/pressure-ui.test.cjs`、`tests/pressure-recorder.test.cjs`、`tests/chart-browser-smoke.cjs`：快照隔離、CSV 空值／小數、實際 PNG 文字與版面驗證。
- `README.md`：操作與 26 欄 CSV 定義、測試結果。未更動 firmware、高度控制 adapter 或 CSS。

### 同步套用功能範圍（2026-11-04，5 檔）

- `spp3_BLE/index.html`：新增同步套用按鈕，沿用既有按鈕與響應式版面。
- `spp3_BLE/pressure-experiment.js`：雙欄驗證、凍結本次設定、依序套用與全程鎖定；保留原單通道按鈕。
- `tests/pressure-ui.test.cjs`：同步套用順序、鎖定與錯誤情境測試。
- `tests/chart-browser-smoke.cjs`：真實瀏覽器驗證同步套用、校正快照及後續收集／匯出。
- `README.md`：更新操作方式與驗證紀錄。高度 adapter、firmware、協定及 CSS 均不因新增按鈕而改動。

### 停用回覆修正範圍（2026-11-04，5 檔）

- `spp3_BLE/experiment-height-control.js`：修正停用回覆與快取 PRED 階段造成的誤鎖定，仍以完整安全回報及 SET 確認判斷可操作／到位。
- `tests/experiment-height-control.test.cjs`：補上停用回覆、快取階段、晚到回覆、DEBUG 缺欄位／空白、欠缺安全證據與其他錯誤的回歸。
- `tests/experiment-height-bridge.test.cjs`：串接正式 app／BLE queue／parser，驗證上述回覆後可完成 Head／Neck 微調。
- `tests/chart-browser-smoke.cjs`：改用正式 height control 與合成 firmware，重現錯誤並驗證按鈕、校正、收數與匯出。
- `README.md`：記錄原因、修正範圍、87 項測試及實機驗證限制。

### 獨立校正功能的前次提交範圍（2026-11-04，12 檔）

目標分支為 `spp3_BLE_v4`。前次功能提交範圍共 **12 個原始碼／文件檔案**：

| 類型 | 檔案 |
| --- | --- |
| 文件（1） | `README.md` |
| Web runtime（6） | `spp3_BLE/index.html`、`spp3_BLE/styles.css`、`spp3_BLE/app.js`、`spp3_BLE/experiment-hub.js`、`spp3_BLE/pressure-experiment.js`、`spp3_BLE/experiment-height-control.js` |
| 測試（5） | `tests/chart-browser-smoke.cjs`、`tests/experiment-hub.test.cjs`、`tests/pressure-ui.test.cjs`、`tests/experiment-height-control.test.cjs`、`tests/experiment-height-bridge.test.cjs` |

該次提交未變更 `pressure-recorder.js`、firmware、舊版 Web 或原始受試者資料。該次發布僅使用這份檔案範圍，排除 `.DS_Store`、`tests/.artifacts/`、實驗 CSV／PNG、BLE log、個資、憑證與本機依賴；不使用 force push，也不變更 default branch。Git 分支、版本差異與發布結果應以實際 checkout／遠端紀錄核對；提交不等同完成 ESP32 實機驗收或網站部署。

## 歷史更新紀錄

### 2026-11-03 v4 實驗功能與修正（歷史）

功能整理與文件更新時間：`2026-11-03 21:42:11 CST (+0800)`。以下保留當日新增／修正紀錄，非目前介面的完整規格；其中備註與試次功能已於 2026-11-04 移除。

| 項目 | 新增或修正內容 |
| --- | --- |
| 共用 Experiment Hub | 新增左欄第六張 Card，位於監測與訊息紀錄之間；九實驗共用外框、上一個／下一個箭頭及 Dropdown，每次只顯示一個內容。首次收合，之後保留展開偏好；切換不 reload。 |
| Experiment 01 | 實作固定睡姿、對應高度下的自然呼吸與微動資料收集；四條件各 30 秒。當時 Experiment 02–09 尚未設定；目前版本已另完成 Experiment 02，Experiment 03–09 仍為未設定插槽。 |
| 記錄與狀態 | 新增受試者代號、試次、條件、高度、備註及人工確認；開始時建立快照，進行中鎖定切換，支援自動結束、提前結束、斷線／資料逾時中斷。 |
| 實驗線圖 | 三通道共用 0–30 秒／ADC 圖表，沿用紅／綠／藍配色；四條件各保存最後一輪結果與曲線，切回可恢復。 |
| CSV＋PNG | 每輪輸出 23 欄 CSV 與同名前綴線圖 PNG；畫面摘要及 PNG 不顯示 UUID，CSV 與檔名保留唯一 run_id。 |
| 資料保護 | 同條件重測前須先要求匯出並確認替換；任一條件記錄中或有未匯出樣本時提供離頁提醒。資料仍僅存於記憶體。 |
| 初始化修正 | 修正 Hub Dropdown 的區域變數遮蔽初始化 options，確保實驗模組取得 `getSystemState` 並正確更新開始按鈕。 |
| Chart.js 修正 | 避免將已解析的 `chart.options.plugins` Proxy 指定回自身；在普通設定物件初始化 title，更新時只改 title.text，修正 `Maximum call stack size exceeded`。 |
| 左欄排列 | 原六張 Card 調整為七張；實驗與訊息紀錄使用對應 grid area，避免新增 Card 後訊息紀錄的排列／高度失效。 |
| 回歸驗證 | 新增記錄器、BLE parser bridge、Hub、UI／匯出、真實 Chart options resolver 與 Chrome smoke 測試；當日結果為 50／50，與上方本次 111／111 分開記錄。 |

### 2026-11-03 驗證紀錄（歷史）

當日 Node 為 **50／50 通過**：Recorder 16、BLE parser bridge 8、Hub 6、UI／controller 17、Chart options 3。Chrome 156.0.8078.80＋Chart.js 4.6.1 的 PASS 來自使用者一般 Mac Terminal；合成產物為 30 筆、23 欄 CSV 與 588×290 PNG，產物時間為 `2026-11-03 21:33:58 CST (+0800)`。這是歷史執行／產物紀錄，不是本次介面的圖片尺寸或感測器量測時間。

當時受限制的工作階段在 Chrome 啟動階段發生 `SIGABRT`，尚未載入網頁；2026-11-04 已於目前環境成功重跑含獨立校正介面的瀏覽器測試。環境啟動問題與網頁錯誤分開記錄。

### 2026-11-03 的 13 檔範圍（歷史）

當日比較基準為 `207cdc1e4176fd6b4e7930d6ecb80d5b606d1bb5`，以下 **13 檔**只保留為歷史變更範圍，**不是 2026-11-04 的提交清單**，也不包含後來新增的高度控制模組及其測試。

| 類型 | 檔案 |
| --- | --- |
| 修改 | `README.md`、`spp3_BLE/index.html`、`spp3_BLE/styles.css`、`spp3_BLE/app.js` |
| 新增實驗模組 | `spp3_BLE/experiment-hub.js`、`spp3_BLE/pressure-experiment.js`、`spp3_BLE/pressure-recorder.js` |
| 新增測試 | `tests/pressure-recorder.test.cjs`、`tests/pressure-bridge.test.cjs`、`tests/experiment-hub.test.cjs`、`tests/pressure-ui.test.cjs`、`tests/chart-options.test.cjs`、`tests/chart-browser-smoke.cjs` |

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
6. `實驗專區`（可收合，Experiment 01 收集壓力，Experiment 02 比較舒適度，03–09 待設定）
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

Experiment 01「本輪設定」的 Head／Neck 欄位只做紀錄，按「開始記錄」不送高度命令。新增的「獨立校正」區塊使用同一安全範圍，明確按各通道的「套用」才會控制高度。

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

既有校正／高度控制與 Experiment 01 新增的獨立校正，按確認／套用後會送出；Web 與 ESP32 `pose_pre_v3.1` 均支援 0.5 cm 步進。「本輪設定」欄位仍只做紀錄。

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
- `spp3_BLE/pressure-experiment.js`：兩姿勢校正快照、手動本輪設定、四條件最後一輪暫存、獨立 Chart instance、CSV＋PNG 下載。
- `spp3_BLE/experiment-height-control.js`：獨立高度控制 adapter、停止自動控制、SET ownership、完整回覆與到位／逾時／斷線保護；所有指令沿用 app queue。
- `spp3_BLE/pressure-recorder.js`：不依賴 DOM／BLE 的記錄器，負責 metadata 快照、樣本、計時、中斷狀態與 CSV 序列化。
- `tests/`：合成資料回歸與獨立 Chrome smoke 腳本，不是正式頁面啟動依賴。
- 修改 BLE 指令時，請同步更新：
  - Web 按鈕與 UI 文案
  - `指令合輯`
  - README 指令說明
  - ESP32 parser

本次實驗資料流沿用 `app.js` 的 `handleNotifications()` 完整分行與 `serial_message()` 解析，將有效 P 樣本及接收時間交給 Hub 的 `receivePressure()`，再由實驗模組交給本輪 recorder。實驗圖表讀取 recorder 樣本，匯出使用開始時的快照；沒有第二套 BLE 通知監聽，P 輪詢沿用原流程。獨立校正啟用後的 DEBUG／I 狀態查詢也走原 BLE queue。開始／結束只控制記錄器，不送硬體命令、不重設 BLE queue、不重建右欄 Chart、不清空監測紀錄，也不重新初始化整個 app。

## License

原始 Web Serial 範例基於 Apache-2.0。此 repo 依原專案授權與研究用途維護。
