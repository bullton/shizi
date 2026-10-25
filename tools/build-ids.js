#!/usr/bin/env node
/**
 * 由 Unicode IDS（Ideographic Description Sequence）生成結構表 chaizi-ids.js
 *
 * IDS 係 Unicode 官方嘅字形結構描述，例如：
 *   看 = ⿱龵目   （⿱ = 上下）
 *   語 = ⿰言吾   （⿰ = 左右）
 *   這 = ⿺辶言   （⿺ = 左下包圍）
 *   威 = ⿵戌女   （⿵ = 上包圍）
 *
 * 完全免費、離線、準確，唔使 AI。
 *
 * 用法：
 *   node tools/build-ids.js                  # 用本機 ids.txt 生成
 *   node tools/build-ids.js --download       # 先下載 ids.txt 再生成
 *   node tools/build-ids.js --check          # 檢查 chaizi-ids.js 有冇過時
 *
 * 資料來源：https://github.com/cjkvi/cjkvi-ids （基於 CHISE IDS Database）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IDS_FILE = path.join(ROOT, 'tools', 'ids.txt');
const OUT_FILE = path.join(ROOT, 'chaizi-ids.js');
const DICT_FILE = path.join(ROOT, 'chaizi-unique.js');
const IDS_URL = 'https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt';

const CHECK_ONLY = process.argv.includes('--check');
const DOWNLOAD = process.argv.includes('--download');

// IDS 操作符
const OPS = new Set(['⿰','⿱','⿴','⿵','⿶','⿷','⿸','⿹','⿺','⿻','⿼','⿽','⿾','⿿']);

// 剝走地區標籤，例如 萈[G] → 萈、𢌿[JK] → 𢌿
function stripTag(s) {
  return s.replace(/\[[A-Z]+\]/g, '');
}

// 解析 IDS 字串 → 樹 {op, kids:[...]} 或 {leaf: '字'}
function parseIds(str) {
  let i = 0;
  function parseNode() {
    const ch = str[i];
    if (OPS.has(ch)) {
      i++;
      const n = (ch === '⿻' || ch === '⿼' || ch === '⿽') ? 2 : 2;
      const kids = [];
      // 二元操作符；⿾⿿ 亦係二元
      for (let k = 0; k < n; k++) {
        if (i >= str.length) break;
        kids.push(parseNode());
      }
      return { op: ch, kids };
    }
    // 葉：只讀一個字（連埋後面嘅 [XX] 標籤）
    while (i < str.length && str[i] === '[') {
      while (i < str.length && str[i] !== ']') i++;
      i++;
    }
    if (i >= str.length) return { leaf: '' };
    const leaf = str[i];
    i++;
    while (i < str.length && str[i] === '[') {
      while (i < str.length && str[i] !== ']') i++;
      i++;
    }
    return { leaf };
  }
  const root = parseNode();
  return root;
}

// 把葉節點遞歸展開（例如 林 = ⿰木木、䡛 = ⿰車車）
// 咁樣「森 = ⿱木林」就知道下半係左右並排 → 品字
function expandLeaf(node, idsMap, depth = 0) {
  if (!node || depth > 6) return node;
  if (!node.leaf) return node;
  const raw = idsMap.get(node.leaf);
  if (!raw) return node;
  try {
    const sub = parseIds(stripTag(raw));
    if (sub && sub.op) return sub;
  } catch (e) { /* ignore */ }
  return node;
}

// 由 IDS 樹推導我哋遊戲用嘅 layout
// compCount = 字典拆法嘅部件數
function layoutFromIds(root, compCount, idsMap) {
  if (!root || root.leaf) return null;
  const op = root.op;
  const n = compCount;

  if (op === '⿰') {
    if (n === 2) return 'left-right';
    if (n === 3) return 'left-right-right';
    return 'stack';
  }
  if (op === '⿱') {
    if (n === 2) return 'top-bottom';
    if (n === 3) {
      // 右邊（下半）如果係左右並排 → 品字；否則三疊
      const right = expandLeaf(root.kids[1], idsMap);
      if (right && right.op === '⿰') return 'top-bottom-bottom';
      return 'vertical-3';
    }
    if (n === 4) return 'top-2-bottom';
    return 'stack';
  }
  // 真正嘅包圍框（囗/冂/凵/匚/冖）
  if (op === '⿴' || op === '⿵' || op === '⿶' || op === '⿷') {
    if (n === 2) return 'surround';
    if (n === 3) return 'surround-3';
    return 'stack';
  }
  // 角落包圍（厂/广/尸/戶/疒）——視覺上多數係「上包下」，用上下更自然
  if (op === '⿸' || op === '⿹') {
    if (n === 2) return 'top-bottom';
    if (n === 3) return 'vertical-3';
    return 'stack';
  }
  if (op === '⿺') {
    if (n === 2) return 'half-surround-left';
    if (n === 3) return 'complex-3-left';
    if (n >= 4) return 'complex-4-left';
  }
  if (op === '⿻') {
    if (n === 2) return 'top-bottom';
    return 'stack';
  }
  return null;
}

function readDict() {
  const content = fs.readFileSync(DICT_FILE, 'utf8');
  const m = content.match(/ChaiziDictUnique = (\{.+\});\s*$/s);
  if (!m) throw new Error('搵唔到 ChaiziDictUnique');
  return JSON.parse(m[1]);
}

async function download() {
  console.log('下載 ids.txt …');
  const res = await fetch(IDS_URL);
  if (!res.ok) throw new Error('下載失敗: ' + res.status);
  const text = await res.text();
  fs.writeFileSync(IDS_FILE, text, 'utf8');
  console.log(`已儲存 ${IDS_FILE}（${(text.length / 1024 / 1024).toFixed(1)} MB）`);
}

function build() {
  const dict = readDict();
  const lines = fs.readFileSync(IDS_FILE, 'utf8').split('\n');
  // char -> 第一條 IDS
  const idsMap = new Map();
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('U+')) {
      if (!line.startsWith('U+')) continue;
    }
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const ch = cols[1].trim();
    if (ch.length !== 1) continue;
    if (!idsMap.has(ch)) idsMap.set(ch, cols[2].trim().split('\t')[0]);
  }
  console.log(`IDS 收錄 ${idsMap.size} 字`);

  const out = {};
  let withIds = 0, noIds = 0;
  for (const [char, comps] of Object.entries(dict)) {
    const ids = idsMap.get(char);
    if (!ids) { noIds++; continue; }
    let layout = null;
    try {
      const tree = parseIds(stripTag(ids));
      layout = layoutFromIds(tree, comps.length, idsMap);
    } catch (e) {
      layout = null;
    }
    if (!layout) { noIds++; continue; }
    out[char] = layout;
    withIds++;
  }
  console.log(`有 IDS 結構：${withIds} 字 | 冇（要用規則回退）：${noIds} 字`);

  const content = `// 由 Unicode IDS 生成嘅結構表（準確、離線、免費）
// 由 tools/build-ids.js 自動生成，唔好手改。
// 資料來源：https://github.com/cjkvi/cjkvi-ids （基於 CHISE IDS Database）
// 重新生成：node tools/build-ids.js --download
// 驗證：  node tools/build-ids.js --check
window.ChaiziIds = globalThis.ChaiziIds = ${JSON.stringify(out)};
`;

  if (CHECK_ONLY) {
    if (!fs.existsSync(OUT_FILE)) {
      console.log('❌ 搵唔到 chaizi-ids.js，請先執行 node tools/build-ids.js');
      process.exitCode = 1;
      return;
    }
    const cur = fs.readFileSync(OUT_FILE, 'utf8');
    const m = cur.match(/ChaiziIds = (\{[\s\S]*\});/);
    const old = m ? JSON.parse(m[1]) : {};
    const diffs = [];
    for (const k of new Set([...Object.keys(old), ...Object.keys(out)])) {
      if (old[k] !== out[k]) diffs.push(`${k}: ${old[k] || '(無)'} → ${out[k] || '(無)'}`);
    }
    if (diffs.length === 0) {
      console.log(`✅ 結構表最新：${Object.keys(out).length} 字`);
    } else {
      console.log(`❌ 結構表過時，${diffs.length} 處差異（前 10）:`);
      diffs.slice(0, 10).forEach(d => console.log('   ' + d));
      process.exitCode = 1;
    }
    return;
  }

  fs.writeFileSync(OUT_FILE, content, 'utf8');
  console.log(`✅ 已生成 chaizi-ids.js：${Object.keys(out).length} 字（${(content.length / 1024).toFixed(0)} KB）`);
}

(async () => {
  try {
    if (DOWNLOAD) await download();
    if (!fs.existsSync(IDS_FILE)) {
      console.log('搵唔到 tools/ids.txt，請加 --download 參數先下載');
      process.exitCode = 1;
      return;
    }
    build();
  } catch (e) {
    console.error('錯誤:', e.message);
    process.exitCode = 1;
  }
})();
