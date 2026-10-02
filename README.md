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
├── index.html      # 主頁面（遊戲 + 管理）
├── style.css       # 樣式
├── app.js          # 所有邏輯（數據 + 遊戲 + 管理）
└── README.md       # 本文件
```

## 技術棧

- 純 HTML / CSS / JavaScript，無框架
- Web Speech API（粵語發音）
- HTML5 Drag and Drop API
- localStorage（字庫持久化）