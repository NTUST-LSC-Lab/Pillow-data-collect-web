# Pillow Data Collect Web - spp3_BLE_cls_pre_v2

這個 repo 是 iPillow 資料收集與 Web 控制介面，分成 Web Bluetooth 與 Web Serial 兩個版本。`spp3_BLE_cls_pre_v2` 分支的重點是讓 Web BLE 版可以配合新版 ESP32 韌體完成：

- 使用者資料設定
- BSHS / BLHL anchor 校正
- 即時姿勢分類
- PRED 自動高度調整啟動
- 壓力與狀態資料收集匯出

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

## 版本說明

- `spp3_BLE/`：目前主要使用版本，透過 Web Bluetooth 連接 ESP32。
- `spp3/`：舊版 Web Serial 介面，保留做資料收集或測試。
- `chart.umd.min.js`：本地 Chart.js 檔案，供圖表顯示使用。
- `Images/`：仰躺與側躺校正畫面圖片。

## 執行環境

建議使用最新版 Chrome 或 Edge。

Web Bluetooth 需要安全來源，所以不要直接雙擊 `index.html`。請用本地伺服器開啟：

```bash
python -m http.server 8080
```

開啟網址：

- BLE 版：`http://localhost:8080/spp3_BLE/`
- Serial 版：`http://localhost:8080/spp3/`

## ESP32 協定需求

此分支預期 ESP32 韌體支援以下 BLE 指令與回覆：

```text
USER,<gender>,<age>,<height>,<weight>
INIT,NORM,S
INIT,NORM,L
SET,OK
MODE,NORM
ANCHOR,START,BSHS
ANCHOR,START,BLHL
ANCHOR,STATUS
ANCHOR,GET,BSHS
ANCHOR,GET,BLHL
CLASSIFY,START
CLASSIFY,GET
PRED,START
PRED,GET
P
I
DEBUG
```

Web 端會以換行結尾送出指令，ESP32 回覆也需要以換行結尾，前端才會正確切分訊息。

## Web BLE 流程

1. 按下 `Connect BLE` 連線 ESP32。
2. 填入性別、年齡、身高、體重，按下 `設定`。
3. Web 端送出 `USER,...`，ESP32 應回覆 `USER,OK`。
4. 進入微校正，先做仰躺 BSHS。
5. 按下完成校正後，Web 端送出：

```text
SET,OK
ANCHOR,START,BSHS
```

6. Web 端輪詢 `ANCHOR,STATUS` 與 `ANCHOR,GET,BSHS`，直到收到 `ANCHOR,OK,BSHS,...`。
7. 再做側躺 BLHL，流程同上，直到收到 `ANCHOR,OK,BLHL,...`。
8. 兩個 anchor 都完成後，Web 端自動送出：

```text
MODE,NORM
CLASSIFY,START
```

9. 收到 `CLASSIFY,OK,START` 後，Web 端再送出：

```text
PRED,START
```

10. 收到 `PRED,OK,START` 後，代表自動高度調整已確認啟動。

## v2 重點修改

本分支針對 `spp3_BLE/app.js` 做了以下調整：

- 使用者資料指令改為大寫 `USER,...`，與 ESP32 韌體協定一致。
- 兩個 anchor 都完成後，會先送 `MODE,NORM`，再送 `CLASSIFY,START`。
- 收到 `CLASSIFY,OK,START` 後，才送 `PRED,START`。
- `CLASSIFY,START` 與 `PRED,START` 加入最多 3 次 retry。
- 若 ESP32 回覆 `CLASSIFY,ERR,ANCHOR_MISSING` 或 `PRED,ERR,NOT_READY`，Web 端會在訊息紀錄中顯示明確錯誤。
- 重新開始 anchor、清除 anchor、停止分類時，會重置前端自動控制狀態，避免沿用舊狀態。

## 實機驗證標準

燒錄新版 ESP32 後，使用 `spp3_BLE/` 進行校正。訊息紀錄中應依序看到：

```text
USER,OK
ANCHOR,OK,START,BSHS
ANCHOR,OK,BSHS,...
ANCHOR,OK,START,BLHL
ANCHOR,OK,BLHL,...
MODE,OK
CLASSIFY,OK,START
PRED,OK,START
```

後續輪詢 `CLASSIFY,GET` 應看到：

```text
CLASSIFY,OK,<smoothLabel>,<rawLabel>,...
```

輪詢 `PRED,GET` 應看到：

```text
PRED,OK,1,...
```

其中 `PRED,OK,1,...` 代表 PRED 已啟用，Web 端不只是看到姿勢分類，也已確認 ESP32 進入自動高度調整流程。

## 資料收集

Web 端會定期送出：

```text
P
I
```

並將壓力、差值、平均、state、on/off event、姿勢欄位寫入 IndexedDB。按下 `Export Data` 可匯出 CSV/TXT。

## 常見問題

若沒有進入自動調整，請先檢查訊息紀錄是否有：

- `USER,OK`
- `ANCHOR,OK,BSHS,...`
- `ANCHOR,OK,BLHL,...`
- `CLASSIFY,OK,START`
- `PRED,OK,START`

若只有看到 `CLASSIFY,OK,START`，但沒有 `PRED,OK,START`，代表目前只啟動姿勢分類，自動高度調整尚未確認啟動。

若收到 `PRED,ERR,NOT_READY`，通常代表 USER、anchor 或壓力資料尚未完整，請重新確認使用者資料與兩個 anchor 是否都完成。

## 授權

原始程式碼註解標示為 `Apache-2.0`，請以各檔案標頭為準。
