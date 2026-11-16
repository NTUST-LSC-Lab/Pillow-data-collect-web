# Pillow-data-collect-web agent instructions

2026-11-16 最新使用者授權（優先於下方校正不變／八筆／單筆規則）：EXP01 明確送 `ANCHOR,START,target,5`，收指令後五筆有效新掃描平均，波動超原範圍只提示；保留有效性、去重、高度穩定保護與 20 秒逾時，不補舊值。新增五筆 ACK 及 QUALITY 五欄回覆，GET 仍八欄但五筆 ADC 無損讀回。Web 卡片與校正 SVG 使用裝置保存的同一組平均，ADC 保留小數、kPa 顯示四位。舊三欄 START 仍八筆穩定平均；EXP02／EXP03、HX710、模型係數、氣路及 35 秒至少 30 筆規則不變。實作、測試、相容性與未燒錄限制見 README 頂端。

2026-11-16 目前 EXP01 規則：使用者已確認完整記錄 35 秒、至少 30 筆有效無歷史分類即可完成，取代下方 30 秒全有效規則。提早達 30 筆不提前停止；只收 sequence 1～35，最多另等 3 秒補取，缺筆／INVALID 照實保留。實際斷線／提前結束仍中斷。完整 CSV 為 48 欄、70 列，elapsed_s=sequence−1（0～34）；notes 保留操作者備註並加有效／無效／缺筆數。新 CLASSIFY,DIAG,V1 原因配對到同 session／sequence 的無效分類列 notes，不改 DATA22 欄或模型。40 筆韌體快取覆蓋新時長。不能將完成狀態解讀為 35 秒全有效；未完成但已儲存須明示筆數及重測。HX710／模型／校正／氣路與其他實驗流程不變。

2026-11-16 逐秒完整性修正（優先於下方歷史記錄規則）：EXP01 等 CLASSIFY,OK,START 才計時，依 session／sequence 1～30 保存同一分類封包的 ADC 與結果，CSV 仍 48 欄、完整 30 pressure＋30 classification 列。elapsed_s 為 sequence−1；電腦真實接收時間及裝置 tick/sample ms 都保留，不把補取改成新的推論。每 500 ms 至多補取一筆 CLASSIFY,GET,session,sequence，30 秒後最多等 3 秒；須收齊 30 筆有效無歷史結果才完成，有歷史前 6 筆 WARMUP 保留。缺筆／INVALID／斷線只存部分結果且不推進條件。配對同目錄系統的 spp3_BLE_v4_model_m-fix 本次新增 32 筆原結果快取；舊韌體不支援指定秒數補取。BLE 不再用 100 ms 把未結束行截開，斷線清空查詢／控制佇列。不得補零、沿用舊結果或修改模型／HX710 來湊滿。實驗二～四模組及氣路規則未變。

2026-11-16 校正恢復修正：實驗一擷取失敗後須等待 ANCHOR,CANCEL 確認，再讀取新高度狀態，恢復後要求新壓力與重新勾選；取消／準備失敗不開放保存。保留草稿及舊快照，但不把舊快照當成有效裝置基準；自動恢復不重送 USER 或調整高度。「重新準備校正」常駐校正視窗。此修正只處理 Web 恢復流程，不能宣稱已排除 ESP32 TIMEOUT 原因。

2026-11-16：此本機目錄目前為 `web_pose_model_dual_exp1-fix`。實驗一校正同步取得 BSHS／BLHL 裝置基準，第二姿勢不重送同人的 USER。四條件順序為 03 姿勢五穩定 → 04 姿勢五微動 → 抽乾並設定姿勢一高度 → 01 姿勢一穩定 → 02 姿勢一微動；保留原 condition_id。開始辨識只準備，不顯示／累積；按開始記錄才啟動新 session、30 秒資料與結果顯示，每輪單獨儲存 CSV＋PNG 後再前進。CSV 維持 48 欄；提前結束／中斷可存部分結果但不算完成。高度切換沿用 EXP02,DRAIN → HEIGHT_DRY，核對 ACK、完成回覆、實際估計高度及兩組基準，不重送 USER 或 ANCHOR,START。失敗／中止／斷線不自動續接，保留原資料；基準失敗／斷線／換人不可沿用舊快照當裝置成功。配對 `spp3_BLE_v4_model_m-fix` 的 FEATURE,POSE,ON、CLASSIFY,START、MODE,NORM 不控制氣囊；高度、操作中、狀態過期等互鎖保留。完整流程與本次驗證見 README 頂端；下方 EXP3／EXP4 是繼承範圍。

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

- 2026-11-16：使用者授權實驗一雙模型顯示與48欄事件CSV，配對 `spp3_BLE_v4_model_m-fix` 現有分類協定。壓力與分類事件分列、時間與ADC分開；每輪確認STOP→START、去重且不混session，暖機／無效／缺資料不補值。保留30秒計時、壓力中斷規則與其他實驗；操作／新增欄位見README頂端。
