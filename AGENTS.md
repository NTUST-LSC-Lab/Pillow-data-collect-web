# AGENTS.md

## Project Overview

這個 branch 是 `NTUST-LSC-Lab/Pillow-data-collect-web` 的 `spp3_BLE_cls_pre_v3.1`。它是智慧枕墊的 Web Bluetooth 前端，用來做 BLE 連線、使用者資料設定、初始校正、anchor/classify/pred 狀態監測、ESP32 manual 控制，以及資料匯出。

## Repository Scope

- 這個 repo 只包含前端靜態檔案。
- 主要工作介面是 `spp3_BLE/`。
- `spp3/` 保留舊版介面，不要在未確認需求下順手同步修改。
- 這個 repo 不包含 ESP32 firmware 原始碼。
- 這個 repo 不包含 Android App 原始碼。
- 這個 repo 沒有後端 API、Node server 或 bundler。

## Project Structure

- `spp3_BLE/index.html`
- `spp3_BLE/styles.css`
- `spp3_BLE/app.js`
- `spp3/index.html`
- `spp3/styles.css`
- `spp3/app.js`
- `Images/`
- `chart.umd.min.js`
- `README.md`

## Setup And Run Commands

- 用本機 HTTP server 啟動：
- `python -m http.server 8080`
- 主要入口：
- `http://localhost:8080/spp3_BLE/`
- 舊版介面：
- `http://localhost:8080/spp3/`

## Test And Validation

- 這個 repo 沒有自動化測試。
- 至少手動驗證：
- 可正常載入 `spp3_BLE/`
- BLE connect / disconnect
- `USER` 設定
- `INIT,NORM,S` 與 `INIT,NORM,L`
- `ANCHOR,STATUS` / `ANCHOR,GET`
- `CLASSIFY,GET`
- `PRED,GET`
- `FEATURE,STATUS`
- `MANUAL,ENTER` / `MANUAL,STARTUP`
- `Export Data`
- 若沒有支援 Web Bluetooth 的瀏覽器或沒有 ESP32，請明講只做靜態檢查，未做裝置驗證。

## Coding Style And Modification Rules

- 維持純 HTML / CSS / vanilla JS 結構，不要未經要求導入 framework 或 bundler。
- 改協定時，優先檢查：
- `sendCommand()`
- `sendSilentCommand()`
- `parseProtocolMessage()`
- `serial_message()`
- 不要繞過既有 write queue 直接操作 characteristic。
- `spp3_BLE/` 與 `spp3/` 是兩套不同介面，先確認目標再改。
- UI 調整優先最小化，不要大幅重排 workflow 與 badge 狀態機。

## Domain-Specific Rules

- 這個 branch 是對應 `ipillow` repo `pose_pre_v3.1` 的主 Web 線。
- 主要工作流依賴下列文字協定：
- `USER,<gender>,<age>,<height>,<weight>`
- `INIT,NORM,S|L`
- `SET,NORM,...`
- `SET,OK`
- `ANCHOR,START,BSHS|BLHL`
- `ANCHOR,STATUS`
- `ANCHOR,GET,...`
- `CLASSIFY,START|STOP|GET`
- `PRED,START|STOP|GET`
- `FEATURE,POSE,ON|OFF`
- `FEATURE,PRED,ON|OFF`
- `FEATURE,STATUS`
- `MANUAL,ENTER`
- `MANUAL,STOP`
- `MANUAL,FILL,...`
- `MANUAL,DRAIN,...`
- `MANUAL,STARTUP,<head_cm>,<neck_cm>`
- `app.js` 會定期送 silent 指令輪詢狀態，包含 `DEBUG`、`ANCHOR,STATUS`、`CLASSIFY,GET`、`PRED,GET`。
- README 已明確說明：ESP32 在 `MANUAL_CONTROL` 中可能回 `MANUAL,IGNORED,DEBUG`，這是預期行為，不要當成 parser bug。
- 高度規則以 head `7.0-16.0 cm`、neck `10.0-14.0 cm`、step `0.5 cm` 為準。
- `chart.umd.min.js` 是 vendored library，除非任務明確要求，不要隨意替換版本。

## Data, Privacy, And Secrets Rules

- IndexedDB 匯出內容可能包含使用者資料、量測紀錄、BLE log 與實驗資料，不要提交這些匯出檔。
- 不要提交含個資或實驗資料的 CSV、JSON、截圖或螢幕錄影。
- 這個 repo 沒有 `.env` 或 API key 流程，但若後續加入任何 token/config，必須排除出版本控制。

## Git Workflow

- repo 的預設穩定分支仍是 `main`，但這份文件是針對 `spp3_BLE_cls_pre_v3.1` branch 撰寫。
- 若需求屬於目前主 Web 線，應在 `spp3_BLE_cls_pre_v3.1` 上處理，不要直接假設 `main` 與本 branch 完全等價。
- 不要刪除、改名或重寫既有 branches，除非使用者明確要求。

## Agent Behavior

- 修改前先讀 `README.md`、`spp3_BLE/index.html`、`spp3_BLE/app.js` 與相關 UI 區塊。
- 優先做最小且可驗證的修改。
- 修改後請列出改動檔案、原因與手動驗證方式。
- 如果沒有做實機 BLE / ESP32 測試，要明確說明。
