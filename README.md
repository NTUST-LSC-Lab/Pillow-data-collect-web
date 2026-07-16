# Pillow-data-collect-web

此專案目前包含兩個版本：

- `spp3_BLE/`：Web Bluetooth 版本
- `spp3/`：Web Serial 版本

目前 GitHub Pages 對外網址：

- `https://ntust-lsc-lab.github.io/Pillow-data-collect-web/spp3_BLE/`

修改日期時間：`2026-07-16 12:56:21 CST (+0800)`

其中 `spp3_BLE/` 現在對應 `pose_pre_v3.1` 版本，包含：

- 截圖精靈與每個 applied height pose 26 張的固定姿勢收數流程
- `R1~R5` 截圖命名規則
- 可拖曳左右欄寬
- 響應式截圖精靈卡片
- 可收合 / 可滾動的右側線圖監測區
- 生物力學微調畫面的 `Reset` 基準流程按鈕

兩個版本共用：

- `chart.umd.min.js`（Chart.js）
- `Images/`（`s.png`、`l.png`）

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

## 環境需求

- 建議使用最新版 Chrome / Edge
- 必須在安全來源執行：`https://` 或 `http://localhost`
- 不建議直接雙擊 `index.html`

版本需求差異：

- `spp3_BLE` 需要瀏覽器支援 Web Bluetooth
- `spp3` 需要瀏覽器支援 Web Serial

## 快速開始

1. 在專案根目錄啟動本地伺服器
2. 用 Chrome / Edge 開啟對應版本網址

```bash
python -m http.server 8080
```

開啟網址：

- BLE 版：`http://localhost:8080/spp3_BLE/`
- Serial 版：`http://localhost:8080/spp3/`

## 功能摘要

- 連線／斷線
- 發送文字或 `Uint8Array` 指令
- 即時圖表更新（壓力、差值、平均）
- 系統狀態與 S1~S6 指示燈
- IndexedDB 儲存
- 匯出 CSV/TXT

## 截圖精靈

`spp3_BLE/` 內含 `截圖精靈`，可建立固定姿勢最佳高度的 26 張截圖流程，並依照步驟自動命名與存檔。

### 分數規則

- `LOAD`：固定為 `10`
- `UNLOAD`：留空
- `ACT`：由收資料人員手動選擇 `0~10`

### 截圖命名規則

```text
{subject_id}_APL-{applied_height_pose}_{stage}_R{repeat_id}_{sequence}.svg
```

例如：

```text
S01_APL-BSHS_LOAD-BSHS_R1_01.svg
S01_APL-BSHS_UNLOAD_R1_02.svg
S01_APL-BSHS_ACT-BSHL_R1_03.svg
```

### 完整資料量與後續整理

一位受測者需要依序完成 `BSHS`、`BSHL`、`BLHLB`、`BLHLC`、`BLHL` 五個 applied height pose。每個 pose 會產生 26 張 SVG，完整收集共 130 張，建議整理成以下結構：

```text
Sxx/
├── BSHS/    # 26 SVG
├── BSHL/    # 26 SVG
├── BLHLB/   # 26 SVG
├── BLHLC/   # 26 SVG
└── BLHL/    # 26 SVG
```

收集完成後，可使用 [`NTUST-LSC-Lab/ipillow-data-records-automation`](https://github.com/NTUST-LSC-Lab/ipillow-data-records-automation) 驗證 130 張 SVG，並在保留每次執行前備份的前提下，自動更新 `5pose_calibration`、`Basic_Info` 與 `pose_matrix_5x5` 三份 Excel。

## 2026-06-08 截圖修正

時間：`2026-06-08 17:55:26 CST (+0800)`

- 修正 `截圖精靈` 在 Chrome / Edge 下因 `canvas.toBlob()` 與外部字型造成的 `Tainted canvases may not be exported` 錯誤。
- `spp3_BLE/app.js` 的截圖匯出流程改為直接生成 `SVG Blob` 並寫入使用者選定的資料夾，不再經過 canvas 轉 PNG。
- 截圖檔案副檔名由 `.png` 改為 `.svg`，原有的資料夾權限、覆蓋確認、步驟推進與重拍流程維持不變。
- 匯出時強制使用本機字型 stack，避免將 Google Fonts 之類的外部字型依賴帶入匯出流程後再次污染畫布。

## 2026-07-07 Reset 基準流程按鈕

時間：`2026-07-07 16:08:44 CST (+0800)`

- 在 `生物力學調整模式` 的仰躺高度微調與側躺高度微調畫面各新增一個 `Reset` 按鈕。
- 按 `Reset` 會送出 `MANUAL,STARTUP,7.0,10.0`，讓 ESP32 離開 manual 控制並回到開機流程：先 `DRAIN_ALL` 吸乾，再依序 `FILL_MONITOR`、`FILL_NECK`、`FILL_HEAD` 回到 Head `7.0 cm` / Neck `10.0 cm` 基準。
- `Reset` 不會清除 IndexedDB，也不會重新計算既有匯出資料；後續壓力、姿勢與指令紀錄會繼續累計到同一份 export 資料中。

## 注意事項

- 若裝置掃描不到，先確認裝置可被偵測且連線模式正確（BLE 或 Serial）
- 若按鈕無反應，先確認連線是否成功
- 若文字顯示亂碼，請確認檔案編碼為 UTF-8

## 授權

原始程式碼註解標示為 `Apache-2.0`（請以原始檔案標頭為準）。
