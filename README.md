# Pillow Data Collect Web - spp3_BLE_cls_pre_v3

此分支是 iPillow Web BLE 資料收集與控制介面，主要使用 `spp3_BLE/` 透過 Web Bluetooth 連接 ESP32。

本檔案與本分支修改基於 ESP32 韌體 `pose_pre_v3.1` 進行調整。Web 端功能會對應 `pose_pre_v3.1` 新增的高度上下限、0.5 cm 高度步進、Web 手動/自動模式、ESP32 Manual 高階控制指令、壓力與高度監測，以及分類/預測控制流程。

修改日期時間：`2026-05-10 17:20:40 CST (+0800)`

## 目錄結構

```text
Pillow-data-collect-web/
├─ spp3_BLE/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ spp3/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ Images/
│  ├─ s.png
│  └─ l.png
├─ chart.umd.min.js
└─ README.md
```

## 主要新增功能

- 支援 ESP32 `pose_pre_v3.1` 的 Head / Neck 高度上下限與 `0.5 cm` 步進。
- 初始校正與微調的 `+ / -` 只改前端暫存值，需按「確定調整」才送出高度調整指令。
- 新增 Web 端「手動模式 / 自動模式」：
  - 手動模式：不自動啟動分類與預測調整。
  - 自動模式：兩個 anchor 完成後自動啟動分類與 PRED 自動調整。
- 新增「校正與分類狀態」accordion，可收合狀態區塊。
- 新增「高度與壓力監測」區塊：
  - Monitor / Neck / Head 三顆氣囊壓力。
  - Head / Neck 目標高度與目前高度。
  - 監測紀錄、自動滾動、固定滾動、清空。
- 壓力圖表標籤改為 `Monitor / Neck / Head`。
- 新增 `ESP32 Manual 控制` 可收合區塊：
  - 進入 ESP32 Manual
  - Monitor / Neck / Head 單獨充氣
  - Monitor / Neck / Head 單獨吸氣
  - 全部同時洩氣
  - 停止
  - 離開 ESP32 Manual 並回開機流程
- README 更新為完整操作說明，並標明此版本基於 `pose_pre_v3.1`。

## 執行環境

建議使用最新版 Chrome 或 Edge。Web Bluetooth 需要安全來源，請使用本機 HTTP server 開啟，不建議直接雙擊 HTML。

在 repo 根目錄執行：

```bash
python -m http.server 8080
```

開啟：

```text
http://localhost:8080/spp3_BLE/
```

舊版 Web Serial 介面仍保留於：

```text
http://localhost:8080/spp3/
```

## 對應 ESP32 韌體

此 Web 分支預期搭配：

```text
XUE030130/ipillow branch: pose_pre_v3.1
```

必要 ESP32 BLE 指令包含：

```text
USER,<gender>,<age>,<height>,<weight>
INIT,NORM,S
INIT,NORM,L
SET,NORM,<condition>,<S|L>,<HEAD|NECK>,<height_cm>
SET,OK
MODE,NORM
ANCHOR,START,BSHS
ANCHOR,START,BLHL
ANCHOR,STATUS
ANCHOR,GET,BSHS
ANCHOR,GET,BLHL
CLASSIFY,START
CLASSIFY,STOP
CLASSIFY,GET
PRED,START
PRED,STOP
PRED,GET
FEATURE,STATUS
FEATURE,POSE,<ON|OFF>
FEATURE,PRED,<ON|OFF>
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
P
I
DEBUG
```

ESP32 回覆需要以換行結尾，Web 端才會正確切分 BLE notification。

## 快速使用流程

1. 開啟 `spp3_BLE/`。
2. 按 `Connect BLE` 連接 ESP32。
3. 填入使用者資料：
   - 生理性別
   - 年齡
   - 身高
   - 體重
4. 按 `設定`，確認訊息紀錄出現 `USER,OK`。
5. 在「校正與分類狀態」選擇：
   - 手動模式：校正後不自動分類與自動調整。
   - 自動模式：校正後自動啟動分類與 PRED 自動調整。
6. 按 `初始校正`，依序完成仰躺 BSHS 與側躺 BLHL。
7. 如需人工調高度，使用 `+ / -` 修改數值，再按「確定調整」。
8. 完成兩個 anchor 後：
   - 自動模式會啟動 `CLASSIFY,START` 與 `PRED,START`。
   - 手動模式只保留校正結果，不啟動自動分類與自動調整。
9. 使用「高度與壓力監測」確認壓力與高度狀態。
10. 使用 `Export Data` 匯出資料。

## Web 手動模式與自動模式

Web 端「手動模式 / 自動模式」是分類與預測控制層級，不等於 ESP32 `MANUAL_CONTROL`。

### 手動模式

手動模式會送出或維持：

```text
PRED,STOP
CLASSIFY,STOP
FEATURE,PRED,OFF
FEATURE,STATUS
```

效果：

- 不自動啟動姿勢分類。
- 不自動啟動 PRED 預測調整。
- 仍可做初始校正、微調高度、壓力監測、資料收集。
- 仍可手動使用 `SET,NORM,...` 調整 Head / Neck 目標高度。

### 自動模式

自動模式會送：

```text
FEATURE,POSE,ON
FEATURE,PRED,ON
FEATURE,STATUS
```

當 BSHS 與 BLHL 都完成後，Web 端會自動送：

```text
MODE,NORM
CLASSIFY,START
PRED,START
```

收到 `PRED,OK,START` 後，代表 ESP32 已確認進入 PRED 自動高度調整流程。

## 高度上下限與 0.5 cm 調整

Web 端對應 `pose_pre_v3.1` 的韌體限制：

| 通道 | 最小值 | 最大值 | 步進 |
|---|---:|---:|---:|
| Head | 7.0 cm | 16.0 cm | 0.5 cm |
| Neck | 10.0 cm | 16.0 cm | 0.5 cm |

所有初始校正與微調高度輸入都會：

- clamp 到合法上下限。
- snap 到最接近的 `0.5 cm`。
- 按 `+ / -` 時只暫存在 Web UI。
- 按「確定調整」後才送出：

```text
SET,NORM,<condition>,<S|L>,<HEAD|NECK>,<height_cm>
```

ESP32 端仍會再次 clamp / snap，韌體是最後安全防線。

## 初始校正

按 `初始校正` 後會進入校正 modal。

### 仰躺 BSHS

1. 選擇頸椎狀態。
2. 按 `仰躺校正`。
3. Web 送：

```text
INIT,NORM,S
DEBUG
```

4. 使用 `+ / -` 調整 Head / Neck 高度。
5. 按「確定調整仰躺高度」才送 `SET,NORM,...`。
6. 按 `完成校正` 後送：

```text
SET,OK
ANCHOR,START,BSHS
```

7. Web 輪詢：

```text
ANCHOR,STATUS
ANCHOR,GET,BSHS
```

直到收到：

```text
ANCHOR,OK,BSHS,...
```

### 側躺 BLHL

1. 按 `側躺校正`。
2. Web 送：

```text
INIT,NORM,L
DEBUG
```

3. Web 會等待 `state == STANDBY` 連續 2 筆後開放側躺微調。
4. 若超過 8 秒未等到 STANDBY，會開放人工微調。
5. 按「確定調整側躺高度」後才送 `SET,NORM,...`。
6. 按 `完成校正` 後送：

```text
SET,OK
ANCHOR,START,BLHL
```

7. Web 輪詢：

```text
ANCHOR,STATUS
ANCHOR,GET,BLHL
```

直到收到：

```text
ANCHOR,OK,BLHL,...
```

## 微調

按 `微調` 會進入生物力學調整模式。

流程：

1. 選擇頸椎狀態。
2. 進入仰躺高度微調。
3. 用 `+ / -` 修改 Head / Neck。
4. 按「確定調整仰躺高度」送出。
5. 切換到側躺高度微調。
6. 用 `+ / -` 修改 Head / Neck。
7. 按「確定調整側躺高度」送出。
8. 按 `結束` 送 `SET,OK`。

若高度有暫存但尚未按「確定調整」，Web 會阻擋切換或完成，避免 ESP32 實際高度與 anchor 記錄不一致。

## 校正與分類狀態 accordion

「校正與分類狀態」支援收合：

- 按 `收合` 隱藏狀態內容。
- 按 `展開` 顯示狀態內容。
- 收合狀態會記錄在瀏覽器 `localStorage`。
- 若 `localStorage` 被瀏覽器阻擋，收合功能仍可正常使用，只是不保留狀態。

區塊內顯示：

- 目前 Web 模式
- 模式指令是否收到 ESP32 確認
- 流程狀態
- BSHS / BLHL 完成狀態
- Anchor state / target
- Anchor 數值
- 即時姿勢
- 分數與 PRED 控制狀態

## 高度與壓力監測

「高度與壓力監測」區塊顯示：

| 欄位 | 來源 |
|---|---|
| Monitor 壓力 | `P:` 第一個值 |
| Neck 壓力 | `P:` 第二個值 |
| Head 壓力 | `P:` 第三個值 |
| Head 高度 | `DEBUG` / `HEIGHT_SET` / `INIT` |
| Neck 高度 | `DEBUG` / `HEIGHT_SET` / `INIT` |

壓力輪詢：

```text
P
```

目前每 1 秒送一次，所以壓力圖表與監測區塊約每秒更新一次。

狀態輪詢：

```text
I
```

目前每 2 秒送一次，用於 state / onoff / diff / avg 等資料。

高度補值：

```text
DEBUG
```

目前每 10 秒 silent 送一次，用來補 `headNumber / neckNumber / currentHeadNumber / currentNeckNumber`。這些 silent DEBUG 回覆不會塞滿主訊息紀錄。

監測紀錄支援：

- 自動滾動
- 固定滾動
- 清空監測紀錄

## ESP32 Manual 控制

`ESP32 Manual 控制` 位於「裝置連線與指令」區塊內，預設可收合。這是 ESP32 底層 `MANUAL_CONTROL`，不同於 Web 端「手動模式」。

可用按鈕與指令：

| 按鈕 | 指令 |
|---|---|
| 進入 ESP32 Manual | `MANUAL,ENTER` |
| 停止 | `MANUAL,STOP` |
| Monitor 充氣 | `MANUAL,FILL,MONITOR` |
| Monitor 吸氣 | `MANUAL,DRAIN,MONITOR` |
| Neck 充氣 | `MANUAL,FILL,NECK` |
| Neck 吸氣 | `MANUAL,DRAIN,NECK` |
| Head 充氣 | `MANUAL,FILL,HEAD` |
| Head 吸氣 | `MANUAL,DRAIN,HEAD` |
| 全部同時洩氣 | `MANUAL,DRAIN,ALL` |
| 離開 ESP32 Manual 並回開機流程 | `MANUAL,STARTUP,<head_cm>,<neck_cm>` |

使用注意：

- 進入 ESP32 Manual 後，Web 端仍會顯示壓力與 state。
- 單顆充氣/吸氣會先停止目前輸出，再啟動指定氣囊動作。
- `全部同時洩氣` 只支援 DRAIN，不支援全部同時充氣。
- `停止` 會關閉馬達與所有閥，但留在 ESP32 manual。
- `離開 ESP32 Manual 並回開機流程` 會讓 ESP32 回到：

```text
DRAIN_ALL -> FILL_MONITOR -> FILL_NECK -> FILL_HEAD -> STANDBY
```

並依輸入的 Head / Neck 目標高度，在固定充氣後補到指定高度。

## 訊息紀錄

主訊息紀錄顯示：

- 使用者手動送出的指令
- Web 自動送出的重要流程指令
- ESP32 BLE 回覆
- 錯誤訊息

支援：

- 自動滾動
- 固定滾動
- Clear Text

## 資料收集與匯出

Web 端會將下列資料寫入 IndexedDB：

- Monitor / Neck / Head pressure
- differential
- last5pointAvg
- prev5pointAvg
- state
- onoff event
- predict pose
- pose event
- 指令時間紀錄

按 `Export Data` 會匯出 CSV / TXT。

## 實機驗證標準

基本連線與使用者資料：

```text
EXPERIMENT,ON
USER,OK
```

校正：

```text
ANCHOR,OK,START,BSHS
ANCHOR,OK,BSHS,...
ANCHOR,OK,START,BLHL
ANCHOR,OK,BLHL,...
```

自動模式：

```text
FEATURE,STATUS,LEGACY,0,POSE,1,PRED,1
MODE,OK
CLASSIFY,OK,START
PRED,OK,START
```

手動模式：

```text
FEATURE,STATUS,LEGACY,0,POSE,1,PRED,0
```

ESP32 Manual：

```text
MANUAL,OK,ENTER
MANUAL,OK,FILL,HEAD
MANUAL,OK,DRAIN,ALL
MANUAL,OK,STOP
MANUAL,OK,STARTUP,<head_cm>,<neck_cm>
```

## 常見問題

### 只有分類，沒有自動調整

請檢查：

- 目前 Web 模式是否為自動模式。
- ESP32 是否回覆 `FEATURE,STATUS,...,PRED,1`。
- 是否有 `PRED,OK,START`。

若只有：

```text
CLASSIFY,OK,START
```

但沒有：

```text
PRED,OK,START
```

代表目前只有姿勢分類，自動高度調整尚未確認啟動。

### PRED,ERR,NOT_READY

通常代表 USER、anchor 或壓力資料尚未完整。請重新確認：

- 使用者資料已設定。
- BSHS anchor 完成。
- BLHL anchor 完成。
- 壓力資料正在更新。

### 高度顯示不是每秒更新

壓力每秒更新，高度主要來自 `DEBUG / HEIGHT_SET / INIT`。目前 Web 每 10 秒 silent 送一次 `DEBUG` 補高度狀態。

### Web 手動模式與 ESP32 Manual 有什麼不同

- Web 手動模式：關閉自動分類與自動調整，但保留一般高度調整流程。
- ESP32 Manual：進入底層輸出控制，可直接控制氣囊充氣/吸氣/洩氣。

## 授權

原始程式碼註解標示為 `Apache-2.0`，請以各檔案標頭為準。
