# Pillow-data-collect-web

此專案目前包含兩個版本：

- `spp3_BLE/`：Web Bluetooth 版本
- `spp3/`：Web Serial 版本

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

## 今日更新紀錄

更新時間（Asia/Taipei）：`2026-04-13 11:30:28 +08:00`

本次主要更新 `spp3_BLE` 版本，重點如下：

- 新增並整合「校正與分類狀態」面板資訊：
  - 流程狀態（未校正 / 分類中 / 自動控制）
  - BSHS / BLHL 校正狀態徽章
  - Anchor State / Anchor Target
  - Anchor 數值（BSHS、BLHL）
- 新增即時分類與預測資訊顯示：
  - 即時姿勢（`smoothLabel`、`rawLabel`、更新時間）
  - 分數與預測控制（`scoreE`、`scoreSupine`、`scoreSideMean`、`scorePmRule`、`PRED enabled/stage`、頸/頭部 `ΔADC`）
- 調整版面配置與可讀性：
  - `Anchor 數值` 移到右側區塊
  - `即時姿勢` 與 `展開分數與預測控制` 改為桌面版左右排列、手機版自動改上下排列
  - `Anchor 數值` 與 `展開分數與預測控制` 右欄寬度統一
  - 相關資訊區塊字體放大
  - 修正 100% 縮放下區塊被擠壓問題，優化「訊息紀錄」顯示高度
- BLE 訊息解析與畫面同步：
  - 前端收到 `ANCHOR / CLASSIFY / PRED` 訊息後，會即時更新上述欄位（不需重新整理頁面）

## 授權

原始程式碼註解標示為 `Apache-2.0`（請以原始檔案標頭為準）。
