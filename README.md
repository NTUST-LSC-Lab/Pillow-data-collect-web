# Pillow Data Collect Web - spp3_BLE_cls_pre_v3.1

此分支是 iPillow Web BLE 資料收集、校正、控制與監測介面。主要入口是 `spp3_BLE/`，透過 Web Bluetooth 與 ESP32 溝通。

本分支與本 README 基於 ESP32 韌體 `pose_pre_v3.1` 進行修改。Web 端已對應 `pose_pre_v3.1` 的高度上下限、0.5 cm 高度步進、手動/自動分類模式、ESP32 Manual 控制、壓力/高度監測、右側線圖監測與指令合輯。

修改日期時間：`2026-06-07 14:30:00 CST (+0800)`

## 對應版本

- Web repo：`XUE030130/Pillow-data-collect-web`
- Web branch：`spp3_BLE_cls_pre_v3.1`
- ESP32 repo：`XUE030130/ipillow`
- ESP32 branch：`pose_pre_v3.1`
- 主要 Web 目錄：`spp3_BLE/`

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

## 啟動方式

建議使用最新版 Chrome 或 Edge。Web Bluetooth 需要安全來源，請用本機 HTTP server 開啟，不建議直接雙擊 HTML。

在 repo 根目錄執行：

```bash
python -m http.server 8080
```

開啟：

```text
http://localhost:8080/spp3_BLE/
```

舊版 Web Serial 介面保留在：

```text
http://localhost:8080/spp3/
```

## 近期 v3.1 Web 變更摘要

這一版除了原本的 BLE 收數、校正、分類與 PRED 監測外，額外整理了資料收集 UI，重點放在：

- `截圖精靈`：支援固定姿勢最佳高度的重複截圖流程。
- `可拖曳左右欄寬`：左側操作區與右側線圖區之間新增拖曳分隔條。
- `右側線圖監測可收合資訊`：圖表保留顯示，數值資訊與上方控制區可收合或滾動。
- `卡片級響應式調整`：截圖精靈與線圖監測在窄欄寬下會自動重排，避免欄位被吃掉。

## 截圖精靈

`截圖精靈` 是這次新增的主要收數區塊，目標是先完成實驗與截圖，之後再依照圖片內容回填 Excel。

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

### 分數規則

- `LOAD`：固定為 `10`
- `UNLOAD`：留空
- `ACT`：由收資料人員手動選擇 `0~10`

### 截圖命名規則

目前命名格式為：

```text
{subject_id}_APL-{applied_height_pose}_{stage}_R{repeat_id}_{sequence}.png
```

例如：

```text
S01_APL-BSHS_LOAD-BSHS_R1_01.png
S01_APL-BSHS_UNLOAD_R1_02.png
S01_APL-BSHS_ACT-BSHL_R1_03.png
S01_APL-BSHS_ACT-BLHLB_R1_04.png
S01_APL-BSHS_ACT-BLHLC_R1_05.png
S01_APL-BSHS_ACT-BLHL_R1_06.png
S01_APL-BSHS_ACT-BSHS_R2_07.png
```

欄位意義：

- `subject_id`：受試者編號
- `APL-{pose}`：固定姿勢最佳高度來源
- `stage`：`LOAD`、`UNLOAD` 或 `ACT`
- `R{repeat_id}`：第幾輪
- `sequence`：第幾張圖，固定為 `01~26`

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
6. `訊息紀錄`

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
| Neck | 10.0 cm | 16.0 cm | 0.5 cm |

所有高度輸入會：

- 限制在合法上下限內。
- snap 到最接近的 `0.5 cm`。
- `+ / -` 只改 Web UI 暫存值。
- 按「確定調整」後才送出 BLE 指令。

ESP32 端也會再次 clamp / snap，韌體仍是最後安全防線。

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
SET,NORM,1,L,NECK,16.0
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

會。Web 端使用 `0.5 cm` step，ESP32 `pose_pre_v3.1` 端也支援 0.5 cm clamp / snap。

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
- 修改 BLE 指令時，請同步更新：
  - Web 按鈕與 UI 文案
  - `指令合輯`
  - README 指令說明
  - ESP32 parser

## License

原始 Web Serial 範例基於 Apache-2.0。此 repo 依原專案授權與研究用途維護。
