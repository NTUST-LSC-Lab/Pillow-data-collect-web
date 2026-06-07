# Pillow-data-collect-web

此專案目前包含兩個版本：

- `spp3_BLE/`：Web Bluetooth 版本
- `spp3/`：Web Serial 版本

目前 GitHub Pages 對外網址：

- `https://xue030130.github.io/Pillow-data-collect-web/spp3_BLE/`

其中 `spp3_BLE/` 現在對應 `pose_pre_v3.1` 版本，包含：

- 截圖精靈與 26 張固定姿勢收數流程
- `R1~R5` 截圖命名規則
- 可拖曳左右欄寬
- 響應式截圖精靈卡片
- 可收合 / 可滾動的右側線圖監測區

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

## 注意事項

- 若裝置掃描不到，先確認裝置可被偵測且連線模式正確（BLE 或 Serial）
- 若按鈕無反應，先確認連線是否成功
- 若文字顯示亂碼，請確認檔案編碼為 UTF-8

## 授權

原始程式碼註解標示為 `Apache-2.0`（請以原始檔案標頭為準）。
