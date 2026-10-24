#!/usr/bin/env node
/**
 * 原子字庫生成器 —— 產生 chaizi-atomic.js
 *
 * 「原子字」= 拆開之後只剩筆畫嘅字。
 * 呢啲字放入練習冇意義：筆畫係變形嘅部件（例如 水 = 乛+亅+丿+乀），
 * 小朋友拎唔到、砌唔返。所以唔會出現喺練習字庫，亦唔會喺布置任務時出現。
 *
 * 用法：
 *   node tools/dict-atomic.js          # 生成 chaizi-atomic.js
 *   node tools/dict-atomic.js --check  # 檢查有冇過時（字典改咗但冇重生成）
 *
 * 判定規則：所有部件都係「筆畫字」→ 原子字
 * 注意：呢個係由字典推導出嚟嘅衍生檔案，唔使記錄落 dict-changes.csv
 *      （CSV 記錄嘅係「拆法改動」，呢度冇改過任何拆法）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DICT_FILE = path.join(ROOT, 'chaizi-unique.js');
const OUT_FILE = path.join(ROOT, 'chaizi-atomic.js');

const CHECK_ONLY = process.argv.includes('--check');

// ===== 筆畫字（單筆嘅字形）=====
const STROKES = [
  // 基本 9 筆
  '一', '丨', '丿', '丶', '乀', '乁', '乚', '乛', '亅',
  // 複合筆畫
  '㇀', '㇁', '㇂', '㇃', '㇄', '㇅', '㇆', '㇇', '㇈', '㇉',
  '㇊', '㇋', '㇌', '㇍', '㇎', '㇏', '㇐', '㇑', '㇒', '㇓',
  '㇔', '㇕', '㇖', '㇗', '㇘', '㇙',
  // 字典入面用到的變體
  '乙', '丩', '𠄌', '𠃊', '𠃑', '𠂤', '𤇾', '㠯', '龷', '丏', '丱'
];
const STROKE_SET = new Set(STROKES);

function readDict() {
  const content = fs.readFileSync(DICT_FILE, 'utf8');
  const m = content.match(/ChaiziDictUnique = (\{.+\});\s*$/s);
  if (!m) throw new Error('搵唔到 ChaiziDictUnique');
  return JSON.parse(m[1]);
}

function main() {
  const dict = readDict();
  const atomic = [];
  for (const [char, comps] of Object.entries(dict)) {
    if (!Array.isArray(comps) || comps.length < 2) continue;
    if (comps.every(c => STROKE_SET.has(c))) atomic.push(char);
  }
  atomic.sort();

  const content = `// 原子字庫（拆開只剩筆畫嘅字，唔會出現喺練習字庫／布置任務）
// 由 tools/dict-atomic.js 根據 chaizi-unique.js 自動生成，唔好手改。
// 重新生成：node tools/dict-atomic.js
// 驗證：  node tools/dict-atomic.js --check
window.ChaiziAtomic = globalThis.ChaiziAtomic = ${JSON.stringify(atomic)};
`;

  if (CHECK_ONLY) {
    if (!fs.existsSync(OUT_FILE)) {
      console.log('❌ 搵唔到 chaizi-atomic.js，請先執行 node tools/dict-atomic.js');
      process.exitCode = 1;
      return;
    }
    const cur = fs.readFileSync(OUT_FILE, 'utf8');
    const m = cur.match(/ChaiziAtomic = (\[[\s\S]*?\]);/);
    const curList = m ? JSON.parse(m[1]) : [];
    const a = new Set(curList), b = new Set(atomic);
    const missing = atomic.filter(x => !a.has(x));
    const extra = curList.filter(x => !b.has(x));
    if (missing.length === 0 && extra.length === 0) {
      console.log(`✅ 原子字庫最新：${atomic.length} 字`);
    } else {
      console.log(`❌ 原子字庫過時：`);
      if (missing.length) console.log(`   缺少: ${missing.join('')}`);
      if (extra.length) console.log(`   多餘: ${extra.join('')}`);
      console.log('   請執行 node tools/dict-atomic.js 重新生成');
      process.exitCode = 1;
    }
    return;
  }

  fs.writeFileSync(OUT_FILE, content, 'utf8');
  console.log(`✅ 已生成 chaizi-atomic.js：${atomic.length} 個原子字`);
  console.log(`   ${atomic.join('')}`);
}

main();
