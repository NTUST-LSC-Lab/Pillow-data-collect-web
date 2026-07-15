# Pillow-data-collect-web agent instructions

適用於 `NTUST-LSC-Lab/Pillow-data-collect-web` 的 `spp3_BLE_cls_pre_v3.1` 線。先讀 organization shared contract `NTUST-LSC-Lab/lab-docs/AGENTS.md` 與 version matrix；本檔只補充 Web repo 的執行細節。回答使用繁體中文。

## Goal and completion bar

以最小 HTML／CSS／vanilla JS 變更完成指定 Web Bluetooth workflow，保留 BLE queue、協定解析、IndexedDB、export、responsive UI 與裝置 states。

完成前確認：

- 只修改明確指定的 `spp3_BLE/`；舊版 `spp3/` 不自動同步。
- 未被要求的 token、欄位順序、workflow、badge、schema 與高度限制不變。
- 已做 render／smoke；可用 target firmware 時完成受影響 BLE workflow。
- 協定變更已查 `pose_pre_v3.1` sender 與 Android parser，或列出 blocker。
- 最終先說結果，再列檔案、原因、驗證、風險與限制。

## Scope and boundaries

- 主介面：`spp3_BLE/index.html`、`styles.css`、`app.js`
- 舊版：`spp3/`
- 其他：`Images/`、vendored `chart.umd.min.js`、`README.md`
- 沒有 backend API、Node server、bundler 或 framework。
- 這條 Web 主線預設搭配 `ipillow` 的 `pose_pre_v3.1`，不得當成 demo client。

回答／診斷只讀；修改／修復可做此 repo 內必要編輯與非破壞性驗證。刪除資料、發布、替換 vendored dependency、改 branch 歷史或擴到其他 repo 前需確認。

## Implementation constraints

- 結構性搜尋先用 code intelligence；token、config、UI text 與 errors 用文字搜尋，空結果需 fallback 查證。
- 維持純 HTML／CSS／vanilla JS，不自行增加 dependency、backend、功能或裝飾性 UI。
- 指令只走 `sendCommand()`／`sendSilentCommand()` queue，不直接寫 characteristic。
- Parser 在 `parseProtocolMessage()`／`serial_message()`。欄位變更需追查 workflow state、badge、chart、IndexedDB 與 exporter。
- Silent polling 包含 `DEBUG`、`ANCHOR,STATUS`、`CLASSIFY,GET`、`PRED,GET`；`MANUAL,IGNORED,DEBUG` 是既有 firmware mode 的預期行為。
- 保留 design tokens、responsive behavior 與 expected states；UI 變更須 render 檢查。
- `chart.umd.min.js` 除非更新版本是任務本身，否則不替換。

## Protocol, data, and privacy

主要 command families：`USER`、`INIT,NORM`、`SET,NORM`、`SET,OK`、`ANCHOR`、`CLASSIFY`、`PRED`、`FEATURE`、`MANUAL`。Height：Head `7.0–16.0 cm`、Neck `10.0–14.0 cm`、step `0.5 cm`；firmware clamp 是最終安全界線。

記憶體與 CSV header／exporter 的 Head／Neck 順序可能不同；資料變更必須驗證實際輸出語意。不得提交 IndexedDB、BLE log、受試者資料、CSV／JSON、截圖或錄影。

## Run, validation, and stop rules

執行 `python -m http.server 8080`：主介面 `http://localhost:8080/spp3_BLE/`，舊版 `http://localhost:8080/spp3/`。

最低檢查頁面載入、console、layout；依變更檢查 BLE connect、`USER`、`INIT,NORM`、anchor、classify、PRED、feature、manual、badges、chart 與 export。無 Web Bluetooth／ESP32 時只回報 static／render，不宣稱實機通過。

核心 Web 請求完成後停止。若同一假設失敗兩次，回頭檢查 queue、chunking、parser branch、polling state 與 firmware mode；若 firmware 版本或實際 reply 缺失會改變結論，只詢問最小缺失資訊。

## Changelog

- 2026-07-15 依 GPT-5.6 guidance 重寫為 goal、completion、scope、constraints、validation 與 stop rules，保留 Web 主線不變式。
