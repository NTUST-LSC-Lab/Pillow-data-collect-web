# Pillow-data-collect-web agent instructions

適用於 `NTUST-LSC-Lab/Pillow-data-collect-web` 的 `web_pose_model_dual_exp4`，基於 `web_pose_model_dual_exp3` commit `6832264`。先讀 organization shared contract `NTUST-LSC-Lab/lab-docs/AGENTS.md` 與 version matrix；本檔補充本分支差異。回答使用繁體中文。本分支以實驗四兩高度躺枕／離枕偵測為主，保留實驗三20秒雙模型顯示與CSV／壓力曲線匯出，配對 ESP32 `spp3_BLE_v4_model`；不得恢復舊五姿勢規則分數或PRED自動調整。提交前核對目前Git分支與遠端，不能只由資料夾名稱推定。

實驗04新增 `occupancy-recorder.js`、`occupancy-experiment.js`、`occupancy-results.js`：固定先姿勢五高度再姿勢一高度，操作者標記五睡姿／離枕。按開始只啟用按鈕，按姿勢才開始計時，不設初始空枕段。分段CSV每段只取30秒；連續CSV保留等待時間及持續判定。每高度分開12／13欄CSV、PNG及SVG，檔名不放時間；接收時間轉電腦本機格式，計時用單調時鐘，規則／校正／精確按鈕時間保留在SVG metadata；兩組固定停留共10分鐘。門檻為有來源的全30人refit候選，按高度選LOAD基準並轉kPa；不得用本輪空枕調參或改寫校正。只修改本Web，保留實驗三及既有韌體協定。操作入口見 `實驗四使用說明.txt`，完整規格見README上方實驗04章節。

實驗03緊湊版面僅重排 `rapid-experiment.js` 的呈現模板與實驗03專屬CSS：受測者／校正可手動收合，操作與即時資料常駐，曲線／逐秒表／比較表及說明可展開。不得因版面任務改動校正、事件處理、BLE、20秒計時、分類或匯出；應以修改前後控制項與匯出內容對照驗證。

## Goal and completion bar

以最小 HTML／CSS／vanilla JS 變更完成指定 Web Bluetooth workflow，保留 BLE queue、協定解析、IndexedDB、export、responsive UI 與裝置 states。

完成前確認：

- 主程式範圍為 `spp3_BLE/`；本分支已依使用者要求移除 `spp3/` 與 `tests/`，不要自行恢復。
- 未被要求的 token、欄位順序、workflow、badge、schema 與高度限制不變。
- 已做 render／smoke；可用 target firmware 時完成受影響 BLE workflow。
- 協定變更已查 `pose_pre_v3.1` sender 與 Android parser，或列出 blocker。
- 最終先說結果，再列檔案、原因、驗證、風險與限制。

## Scope and boundaries

- 主介面：`spp3_BLE/index.html`、`styles.css`、`app.js`
- 已移除：舊版 `spp3/` 與測試腳本 `tests/`；如需查閱請看清理前commit `645ec40`。
- 其他：`Images/`、vendored `chart.umd.min.js`、`README.md`
- 沒有 backend API、Node server、bundler 或 framework。
- 此分支分類區搭配 `ipillow/spp3_BLE_v4_model`，22欄 `CLASSIFY,DATA,V1` 詳見README；舊五姿勢payload不可直接映射Group。
- `pose-model.js` 只解析／顯示裝置結果，不在Web重新分類或融合模型。完整BLE行、缺值狀態、session/sequence去重與過期顯示必須保留。
- `rapid-experiment.js` 記錄從按開始起20秒；`rapid-results.js` 管理逐秒、事件CSV與每輪PNG。起點不是自動偵測接觸，也不因等待分類而延長20秒。暖機／無效／缺資料不得補上舊結果或0機率。
- 實驗三透過已確認STOP→START建立新分類工作；既有抽乾、恢復開機高度及HEIGHT_DRY流程保持獨立。壓力事件與分類使用ADC有各自時間，不得拿P快照替代分類ADC。

回答／診斷只讀；修改／修復可做此 repo 內必要編輯與非破壞性驗證。刪除資料、發布、替換 vendored dependency、改 branch 歷史或擴到其他 repo 前需確認。

## Implementation constraints

- 結構性搜尋先用 code intelligence；token、config、UI text 與 errors 用文字搜尋，空結果需 fallback 查證。
- 維持純 HTML／CSS／vanilla JS，不自行增加 dependency、backend、功能或裝飾性 UI。
- 指令只走 `sendCommand()`／`sendSilentCommand()` queue，不直接寫 characteristic。
- Parser 在 `parseProtocolMessage()`／`serial_message()`。欄位變更需追查 workflow state、badge、chart、IndexedDB 與 exporter。
- Silent polling 包含 `DEBUG`、`ANCHOR,STATUS`、`CLASSIFY,GET`；不送 `PRED,GET`、`PRED,START` 或 `FEATURE,PRED,ON`。STOP/OFF仍用於安全關閉。`MANUAL,IGNORED,DEBUG` 是既有 firmware mode 的預期行為。
- 保留 design tokens、responsive behavior 與 expected states；UI 變更須 render 檢查。
- `chart.umd.min.js` 除非更新版本是任務本身，否則不替換。

## Protocol, data, and privacy

主要 command families：`USER`、`INIT,NORM`、`SET,NORM`、`SET,OK`、`ANCHOR`、`CLASSIFY`、`PRED`、`FEATURE`、`MANUAL`。Height：Head `7.0–16.0 cm`、Neck `10.0–14.0 cm`、step `0.5 cm`；firmware clamp 是最終安全界線。

記憶體與 CSV header／exporter 的 Head／Neck 順序可能不同；資料變更必須驗證實際輸出語意。不得提交 IndexedDB、BLE log、受試者資料、CSV／JSON、截圖或錄影。

## Run, validation, and stop rules

執行 `python3 -m http.server 8080`：主介面 `http://localhost:8080/spp3_BLE/`，離線預覽 `http://localhost:8080/spp3_BLE/preview.html`。`/spp3/` 已移除，勿再作為操作入口。

目前不附 `tests/`；必要的臨時驗證可放在repo外，或在獨立checkout查閱歷史測試，不能宣稱目前仍可直接執行已移除的測試指令。

最低檢查頁面載入、console、layout；依變更檢查 BLE connect、`USER`、`INIT,NORM`、anchor、classify、PRED、feature、manual、badges、chart 與 export。無 Web Bluetooth／ESP32 時只回報 static／render，不宣稱實機通過。

核心 Web 請求完成後停止。若同一假設失敗兩次，回頭檢查 queue、chunking、parser branch、polling state 與 firmware mode；若 firmware 版本或實際 reply 缺失會改變結論，只詢問最小缺失資訊。

## Changelog

- 2026-11-14 依使用者指示移除 `tests/`（18檔）與 `spp3/`（3檔）；保留 `spp3_BLE/`、圖表函式庫與預覽入口，README區分目前目錄及歷史測試紀錄。
- 2026-11-13 使用者授權雙模型分類狀態區。Anchor擷取操作保留並說明來源；原實驗三15秒表格及CSV/SVG尚未遷移，不能宣稱雙模型已納入匯出。本輪不改ESP32／Android或其他Web版本。
- 2026-11-14 實驗三已遷移為20秒雙模型：逐秒CSV41欄、事件CSV40欄、每輪PNG與結果SVG，取代前述尚未匯出的限制。預覽標記SIMULATED，正式DEVICE；一般CSV與IndexedDB不變。驗證須涵蓋CSV回讀、離線20秒全流程、下載圖檔與窄視窗；未接ESP32不得宣稱實機通過。
- 2026-07-15 依 GPT-5.6 guidance 重寫為 goal、completion、scope、constraints、validation 與 stop rules，保留 Web 主線不變式。
