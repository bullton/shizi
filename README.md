# 識字樂 - 中文拼字遊戲

幫助香港小朋友認字記字的拖拽拼字遊戲，把漢字拆解成部件，拖入正確位置組成完整漢字。

## 功能

- **35+ 預設字庫**：常用字、複雜字（包圍、半包圍、品字結構）
- **拖拽 + 點選雙模式**：電腦用鼠標拖拽，平板 / 手機用手指點擊
- **粵語發音**：拼對部件自動朗讀（Web Speech API zh-HK）
- **口訣提示**：每個字都有粵語口訣幫助記憶
- **進度 / 得分系統**：拼對 +10 分，完成全部顯示結算
- **後台管理**：可新增 / 編輯 / 刪除字庫
- **localStorage 持久化**：字庫儲存在瀏覽器本地

## 字庫結構

每個字記錄以下資料：

```js
{
  char: '國',               // 字
  components: ['囗', '玉'], // 部件（按字拆解）
  layout: 'surround',       // 結構類型
  hint: '方框內有玉...'      // 粵語口訣
}
```

支援的布局：
- `left-right`：左右結構
- `top-bottom`：上下結構
- `top-bottom-bottom`：品字結構（三部分）
- `surround`：包圍結構（外內）
- `half-surround-left`：半包圍（辶包左）
- `complex-3-left`：三方結構（辶左 + 上下右）

## 開始使用

```bash
# 任選一個本地 HTTP server，例如：
python -m http.server 8080

# 然後打開
http://localhost:8080/
```

## 文件結構

```
識字樂/
├── index.html            # 主頁面（遊戲 + 管理）
├── style.css             # 樣式
├── app.js                # 所有邏輯（數據 + 遊戲 + 管理）
├── server.js             # 後端 API（登入、字庫、任務、進度）
├── chaizi-data.js        # 原始拆字字典（kfcd/chaizi，CC BY 3.0）
├── chaizi-unique.js      # 每字唯一拆法字典（由原始字典 + 規則生成）
├── dict-changes.csv      # ⚠️ 字典變更記錄（文字；原拆分；新拆分）
├── tools/
│   ├── dict-transform.js # 字典變更工具（套用規則 + 自動記錄）
│   └── dict-rules.json   # 變更規則 + 基準算法定義
├── shizi-data.json       # 運行時數據（用戶、字庫、任務、進度）
└── README.md             # 本文件
```

## ⚠️ 修改字典的規矩（重要）

**所有字典修改必須經 `tools/dict-transform.js`，唔可以手改 `chaizi-unique.js`。**
每次改動都會自動記錄到 `dict-changes.csv`，方便檢查同訂正。

### 步驟

```bash
# 1. 去 tools/dict-rules.json 加一條新規則
#    {
#      "name": "規則名",
#      "from": "水", "to": "氵",
#      "position": "first",        // first | last | any
#      "exclude": ["求","淼","沝"],  // 例外，不改
#      "date": "2026-10-24",
#      "note": "點解咁改"
#    }

# 2. 預覽會改咗乜（唔會寫檔）
node tools/dict-transform.js --dry

# 3. 套用 + 自動寫入 dict-changes.csv
node tools/dict-transform.js

# 4. 驗證：字典 = 基準 + 所有規則，冇未記錄嘅改動
node tools/dict-transform.js --check
```

### `dict-changes.csv` 格式

UTF-8 with BOM，`；` 分隔，Excel 直接開得：

```csv
文字；原拆分；新拆分
呇；水 口；氵 口
塗；水 余 土；氵 余 土
泄；水 世；氵 世
```

### 其他指令

```bash
node tools/dict-transform.js --rule 0   # 只套用第 0 條規則
node tools/dict-transform.js --baseline # 用原始字典重建基準（會還原所有規則，慎用）
```

`--check` 會用「原始字典 + 全部規則」重算一次，同 `chaizi-unique.js` 比對。
如果有出入就會列出係邊啲字、期望值同實際值，並以 exit code 1 結束 —— 即係有人手改咗字典但冇記錄。

### 已有規則記錄

| 日期 | 規則 | 影響 |
|------|------|------|
| 2026-10-24 | 左邊三點水：首部件 `水` → `氵` | 916 字（例外：求、淼、沝 保留「水」） |

## 技術棧

- 純 HTML / CSS / JavaScript，無框架
- Web Speech API（粵語發音）
- HTML5 Drag and Drop API
- localStorage（字庫持久化）
## 自動判斷結構（上下／左右）

`app.js` 的 `autoLayout()` 會用左偏旁表判斷 2 部件字係左右定上下：

- `LEFT_RADICALS`：127 個左偏旁（木、扌、氵、女、言、金、心、火、日、蟲、食、阜、彳…）
- `LEFT_RADICAL_EXCEPTIONS`：120 個例外字（真係上下結構，例如 `泵`=石+水、`杏`=木+口、`旦`=日+一）

呢個表係用 AI 批量驗證出嚟嘅：每個偏旁全量查過 2 部件字（合共 12,000+ 字），
判斷同時用 AI 嘅 layout 標籤同部件座標交叉核對（坐標 100% 吻合）。

**規則只適用於 2 部件字**，3 部件以上唔可以套用（實測多數係 stack／vertical-3）。

以下偏旁**唔會**判成左右（因為實際係頂部／包圍）：`艹/草`、`竹`、`辶`（走之底另設 `half-surround-left`）、
`宀`、`雨`、`冖`、`門`（另設 `surround`）、`立`、`大`、`氣`、`厂`/`广`（半包圍）。

> AI 對呢啲族群嘅 layout 標籤本身唔準確（例：把 `芥`=艹+介 標成左右），
> 所以呢度以中文教學慣例為準，唔跟 AI 標籤。

## 原子字庫（拆開只剩筆畫嘅字）

`chaizi-atomic.js` 列出所有「拆開之後只剩筆畫」嘅字（78 個），例如：

```
水 = 乛 + 亅 + 丿 + 乀      口 = 丨 + 乛 + 一      人 = 丿 + 乀
心 = 丿 + 乚 + 丶 + 丶      王 = 一 + 一 + 丨 + 一   十 = 一 + 丨
```

呢啲字**唔會**出現喺：
- 練習字庫（`/api/chars?scope=practice`、前端 `Data.getPractice()`）
- 布置任務時揀字（前端已過濾，後端 `POST /api/admin/assignments` 亦會拒收）
- 詞語批量導入（會標示為「🔒 原子字」並略過）

原因：筆畫係變形嘅部件（例如「乛」），小朋友拎唔到、砌唔返，做練習冇意義。

管理端字庫仍然會顯示呢啲字（附 🔒 提示），可以按「🔒 移除原子字」一鍵清走。

### 重新生成／驗證

```bash
node tools/dict-atomic.js          # 由 chaizi-unique.js 重新生成
node tools/dict-atomic.js --check  # 檢查有冇過時
```

呢個係**衍生檔案**（由字典推導出嚟），唔使記錄落 `dict-changes.csv`——CSV 記錄嘅係「拆法改動」，呢度冇改過任何拆法。

## 任務可以派畀多個小孩

布置任務時可以一次揀多個小孩（chip 多選，另有「全選」快捷鍵）：

- 每個小孩會有一份**獨立**的任務記錄（各自嘅進度、答對次數完全分開）
- 但用 `groupId` 綁埋一組，管理端會合併顯示成一個任務卡片，附「👥 N 個小孩」標記
- 「🔄 重設進度」同「🗑 刪除」作用於**整組**
- 每個小孩喺自己嘅「📋 我的任務」只會見到自己嗰份

## 結構判斷：Unicode IDS（主要）＋ 偏旁表（回退）

**結構由 Unicode 官方 IDS（表意文字描述序列）決定，唔使 AI、唔使錢、離線可用。**

```
看 = ⿱龵目  （⿱ = 上下）  → top-bottom
語 = ⿰言吾  （⿰ = 左右）  → left-right
這 = ⿺辶言  （⿺ = 左下包圍）→ half-surround-left
威 = ⿵戌女  （⿵ = 上包圍）  → surround-3
```

### 生成／驗證

```bash
node tools/build-ids.js --download   # 下載 ids.txt 並生成 chaizi-ids.js
node tools/build-ids.js              # 用本機 tools/ids.txt 重新生成
node tools/build-ids.js --check      # 檢查有冇過時
```

- 覆蓋率：**17,366 / 17,936 字（96.8%）**，其餘 570 字回退到偏旁表
- 操作符映射：
  - `⿰` → left-right（3 部件 → left-right-right）
  - `⿱` → top-bottom（下半左右並排 → top-bottom-bottom；3 疊 → vertical-3；4 → top-2-bottom）
  - `⿴⿵⿶⿷` → surround / surround-3
  - `⿸⿹`（厂/广/尸 等角落包圍）→ top-bottom / vertical-3
  - `⿺`（辶/廴）→ half-surround-left / complex-3-left / complex-4-left
- 罕見字會**遞歸展開**（森 = ⿱木林，林 = ⿰木木 → 品字）

### 為咩唔用 AI 判斷結構
- AI 會套用「言字旁一定喺左」呢類先驗，把 `看 = 手+目` 判成左右（實際上下）
- 要花錢、有額度限制、會失敗
- IDS 係 Unicode 官方資料，權威且免費

### 保險機制
`fitLayout()` 會檢查佈局固定槽數同部件數是否一致，唔一致就自動改用通用佈局，
避免出現「有部件但冇槽放」嘅無解題目。

### 字庫修正
管理字庫 → 「🤖 重新分析結構」會用 IDS 重算所有字嘅結構（免費、即時）。

## ⛔ AI 使用政策（極重要）

**本專案嚴禁批量／連續調用 AI。**

- 結構判斷**完全唔用 AI**，改用 Unicode IDS（見上一節），免費、離線、無限額
- AI **只保留一個用途**：為單個字生成粵語口訣（管理字庫 → 新增字 → 「🤖 AI 生成口訣」）
- 伺服器有硬性防護（`aiGuard()`）：
  - 兩次調用之間**最少間隔 8 秒**
  - 每小時**最多 30 次**
  - 超出即回 `429`，並提示剩餘秒數
- 已移除嘅 AI 功能（**唔准再加返**）：
  - `/api/analyze-chars`（批量分析）
  - 批量導入預覽嘅逐項「🤖 AI 分析」按鈕
  - 詞語導入時自動叫 AI 判斷結構

如果你要加任何會短時間內多次調用 AI 嘅功能，**請先改用 IDS／本地規則**。
