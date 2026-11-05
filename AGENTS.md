# AGENTS.md

## 專案概況

識字樂學習平台：Node.js 內建 http 伺服器加上純前端工具。

- 入口：`server.js` → `server/index.js`
- 平台大廳：`hub/`
- 工具前端：`tools/<id>/`
- 資料產生腳本：`scripts/dict/`

## 環境

- Node 版本以 `.nvmrc` 為準（24.16.0），套件管理使用 npm。
- 沒有外部執行期依賴，`npm install` 非必要。
- 啟動：`npm start`，預設 http://localhost:3000/

## 跨平台規則

- 文字檔一律 UTF-8（無 BOM）、LF 換行；`.csv` 例外，維持 UTF-8 BOM + CRLF 供 Excel 使用。由 `.gitattributes` 與 `.editorconfig` 統一。
- 路徑一律用 `path.join` 或 `path.resolve`，不要寫死 Windows 或 macOS 的絕對路徑。
- 腳本用 `node scripts/...` 執行，不依賴 bash 專用語法。
- 檔名保持固定大小寫，不靠大小寫區分檔案。
- 執行期資料寫入 `data/`，不進版本庫；`shizi-data.json` 只作首次遷移來源。

## 兩端同步

- 開工前先 `git pull --rebase`，收工前把改動 commit 並 push，不要在兩端保留未提交的改動。
- 切換機器前先確認 `git status` 乾淨，避免把另一邊的改動帶進來。
- `data/` 內的執行期資料不會隨 git 同步，需要時另外備份。

## 常用指令

- `npm start`
- `npm run check`：檢查字典、原子字庫、IDS 結構表是否一致
- `node scripts/dict/dict-transform.js --check`
- `node scripts/dict/dict-atomic.js --check`
- `node scripts/dict/build-ids.js --check`

## 修改規則

- 修改字典後，依 README 的流程記錄到 `tools/shizi/data/dict-changes.csv`。
- `chaizi-ids.js`、`chaizi-atomic.js` 由腳本產生，不手改。
