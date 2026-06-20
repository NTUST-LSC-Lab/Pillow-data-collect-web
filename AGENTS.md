# Repository Overview

本 repo 是 `NTUST-LSC-Lab/Pillow-data-collect-web`，目前是 Web Bluetooth 資料收集、校正、控制與監測介面。

完整共用規範請先讀：

- `NTUST-LSC-Lab/lab-docs/AGENTS.md`
- `NTUST-LSC-Lab/lab-docs/docs/version-matrix.md`

這份文件只補充這個 repo 自己的工作方式。

## Current Working Assumptions

- 主要新版入口目錄是 `spp3_BLE/`。
- `spp3/` 是舊版或相容用途介面，不要把新版改動直接套回舊版而不確認需求。
- `Images/` 與 `chart.umd.min.js` 是畫面與圖表依賴資產。
- repo README 目前以 `spp3_BLE_cls_pre_v3` 脈絡說明 Web 對應流程。

## Version Position

- 目前 lab-level 已確認的主版 Web / firmware 配對是：
  - Web: `Pillow-data-collect-web-spp3_BLE_cls_pre_v3.1/spp3_BLE`
  - ESP32: `ipillow-pose_pre_v3.1/node32_ipillow_3_BLE`
- 若你要改 BLE 協定、欄位順序或 workflow，先假設這條主版配對是要被保護的相容目標。

## Important Repo-Specific Rules

- 主版 Web 是純 HTML / CSS / vanilla JS，沒有 bundler、沒有 framework。
- 實際控制通道是 Web Bluetooth，不是 HTTP API。
- 發送指令時，應沿用既有封裝與 queue 流程，不要直接繞過現有 characteristic write 管線。
- 協定解析通常集中在 parser / serial message 類型函式；新增或變更回覆格式前，先找 parser 再修改。
- 匯出資料時要特別小心欄位順序，不可只憑表頭猜測 `Monitor / Neck / Head` 對應。

## Coding Guidelines

- 優先保留現有 UI 與 workflow 結構，避免大幅重排頁面與狀態機。
- 若修改 BLE protocol message handling，先確認 workflow badge、anchor badge、pose / pred 顯示是否都還能更新。
- 新增 UI 或狀態呈現時，先確認它是新版 `spp3_BLE/` 還是舊版 `spp3/` 才需要同步。

## Testing / Validation

- 建議用支援 Web Bluetooth 的 Chrome 或 Edge。
- 可用本機 HTTP server 啟動，例如：
  - `python -m http.server 8080`
- 至少驗證：
  - BLE connect / disconnect
  - `USER` 設定
  - `INIT,NORM,S/L`
  - `ANCHOR,STATUS` / `ANCHOR,GET`
  - `CLASSIFY,GET`
  - `PRED,GET`
  - `Export Data`
