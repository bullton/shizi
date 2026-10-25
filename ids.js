/**
 * IDS（Ideographic Description Sequence）解析工具
 * 供 server.js 同 tools/ 共用
 *
 * Unicode IDS 用操作符描述字形結構，例如：
 *   看 = ⿱龵目   （⿱ = 上下）
 *   語 = ⿰言吾   （⿰ = 左右）
 *   堅 = ⿱臤土   （⿱ = 上下），而 臤 = ⿰臣又
 *
 * 呢個模組可以：
 *   - 解析 IDS 字串成樹
 *   - 展開樹葉（例如 臤 → ⿰臣又）得到最深層部件
 *   - 由樹計算每個部件嘅歸一化位置（x/y/w/h）
 */

const fs = require('fs');

// 二元 + 三元操作符
const OPS = new Set([
  '⿰', '⿱', '⿲', '⿳', '⿴', '⿵', '⿶', '⿷',
  '⿸', '⿹', '⿺', '⿻', '⿼', '⿽', '⿾', '⿿'
]);
const TERNARY = new Set(['⿲', '⿳']);

// 剝走地區標籤：萈[G] → 萈、𢌿[JK] → 𢌿
function stripTag(s) {
  return s.replace(/\[[A-Z]+\]/g, '');
}

/**
 * 解析 IDS 字串 → 樹
 * 節點：{ op, kids: [...] } 或 { leaf: '字' }
 */
function parseIds(raw) {
  // 用 code point 陣列，避免 BMP 以外漢字（代理對）被切開
  const str = [...stripTag(raw || '')];
  let i = 0;

  function parseNode() {
    // 跳過多餘標籤
    while (i < str.length && str[i] === '[') {
      while (i < str.length && str[i] !== ']') i++;
      i++;
    }
    if (i >= str.length) return null;

    const ch = str[i];
    if (OPS.has(ch)) {
      i++;
      const n = TERNARY.has(ch) ? 3 : 2;
      const kids = [];
      for (let k = 0; k < n; k++) {
        const kid = parseNode();
        if (kid) kids.push(kid);
      }
      return { op: ch, kids };
    }

    // 葉：一個字（連埋後面嘅 [XX] 標籤）
    const leaf = ch;
    i++;
    while (i < str.length && str[i] === '[') {
      while (i < str.length && str[i] !== ']') i++;
      i++;
    }
    return { leaf };
  }

  const root = parseNode();
  return root && root.op ? root : null;
}

/** 讀 ids.txt → Map<char, idsString>（每字取第一條） */
function loadIdsMap(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    if (!line || line[0] === '#') continue;
    const cols = line.split('\t');
    if (cols.length < 3) continue;
    const ch = cols[1].trim();
    if (ch.length !== 1) continue;
    if (!map.has(ch)) map.set(ch, cols[2].trim().split('\t')[0]);
  }
  return map;
}

/** 若節點係葉而且該字有自己嘅 IDS，就展開一層 */
function expandLeaf(node, idsMap, depth = 0) {
  if (!node || depth > 12) return node;
  if (!node.leaf) return node;
  const raw = idsMap.get(node.leaf);
  if (!raw) return node;
  const sub = parseIds(raw);
  return sub || node;
}

// IDS 入面嘅佔位符（①-⑳ 代表「同上筆畫」之類），唔係真部件
const PLACEHOLDER = /[\u2460-\u2473\u3251-\u325F]/;

/**
 * 取得最深層部件（遞歸展開所有有 IDS 嘅葉）
 * 回傳：{ chars: [...], boxes: [{x,y,w,h}...] }
 */
function deepLeaves(root, idsMap, maxLevels = Infinity) {
  const out = [];
  function walk(node, box, depth) {
    if (!node) return;
    const canExpand = node.leaf
      ? (depth < maxLevels && idsMap.has(node.leaf) && parseIds(idsMap.get(node.leaf)))
      : true;
    if (!canExpand || depth > 12) {
      out.push({ char: node.leaf || '', box });
      return;
    }
    if (node.leaf) {
      // 展開葉
      const sub = parseIds(idsMap.get(node.leaf));
      walk(sub, box, depth + 1);
      return;
    }
    const sub = subBoxes(node.op, box, node.kids.length);
    node.kids.forEach((kid, i) => walk(kid, sub[i] || box, depth + 1));
  }
  walk(root, { x: 0, y: 0, w: 1, h: 1 }, 0);
  return out;
}

/** 根據操作符，將一個 box 分割成 N 個子 box */
function subBoxes(op, box, count) {
  const { x, y, w, h } = box;
  const pad = 0.02;   // 內縮少少，避免貼邊

  const half = (a, b) => [a, b];
  const splitV = (n) => {
    const bw = w / n;
    return Array.from({ length: n }, (_, i) => ({ x: x + i * bw, y, w: bw, h }));
  };
  const splitH = (n) => {
    const bh = h / n;
    return Array.from({ length: n }, (_, i) => ({ x, y: y + i * bh, w, h: bh }));
  };

  switch (op) {
    case '⿰': return [{ x, y, w: w / 2, h }, { x: x + w / 2, y, w: w / 2, h }];
    case '⿱': return [{ x, y, w, h: h / 2 }, { x, y: y + h / 2, w, h: h / 2 }];
    case '⿲': return splitV(3);
    case '⿳': return splitH(3);
    case '⿴': return [                         // 全包圍：外框 + 內縮
      { x, y, w, h },
      { x: x + w * 0.22, y: y + h * 0.22, w: w * 0.56, h: h * 0.56 }
    ];
    case '⿵': return [                         // 上包圍（外在上）
      { x, y, w, h },
      { x: x + w * 0.12, y: y + h * 0.34, w: w * 0.76, h: h * 0.60 }
    ];
    case '⿶': return [                         // 下包圍
      { x, y, w, h },
      { x: x + w * 0.12, y: y + h * 0.06, w: w * 0.76, h: h * 0.60 }
    ];
    case '⿷': return [                         // 左包圍
      { x, y, w, h },
      { x: x + w * 0.34, y: y + h * 0.10, w: w * 0.60, h: h * 0.80 }
    ];
    case '⿸': return [                         // 左上包圍（厂/广）
      { x, y, w, h },
      { x: x + w * 0.28, y: y + h * 0.34, w: w * 0.68, h: h * 0.62 }
    ];
    case '⿹': return [                         // 右上包圍
      { x, y, w, h },
      { x: x + w * 0.04, y: y + h * 0.34, w: w * 0.68, h: h * 0.62 }
    ];
    case '⿺': return [                         // 左下包圍（辶）
      { x, y, w, h },
      { x: x + w * 0.10, y: y + h * 0.04, w: w * 0.82, h: h * 0.66 }
    ];
    case '⿻': return [                         // 重疊
      { x, y, w, h }, { x, y, w, h }
    ];
    default:
      return splitV(Math.max(1, count));
  }
}

/** 由 IDS 字串直接取最深層部件 + 位置 */
function deepSplit(char, idsMap, levels = Infinity) {
  const raw = idsMap.get(char);
  if (!raw) return null;
  const tree = parseIds(raw);
  if (!tree) return null;
  const leaves = deepLeaves(tree, idsMap, levels).filter(l => l.char);
  if (leaves.length < 2) return null;
  const hasPlaceholder = leaves.some(l => PLACEHOLDER.test(l.char));
  return {
    components: leaves.map(l => l.char),
    positions: leaves.map(l => {
      const b = l.box;
      return { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
    }),
    hasPlaceholder
  };
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

module.exports = {
  OPS, TERNARY, PLACEHOLDER, stripTag, parseIds, loadIdsMap,
  expandLeaf, deepLeaves, subBoxes, deepSplit
};
