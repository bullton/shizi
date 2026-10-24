#!/usr/bin/env node
/**
 * 字典變更工具 —— 套用變更規則到 chaizi-unique.js，並自動記錄到 dict-changes.csv
 *
 * 用法：
 *   node tools/dict-transform.js              # 套用所有規則
 *   node tools/dict-transform.js --dry        # 只預覽會改咗乜，唔會寫檔
 *   node tools/dict-transform.js --rule 0     # 只套用第 0 條規則
 *   node tools/dict-transform.js --check      # 檢查字典有冇未記錄嘅改動
 *   node tools/dict-transform.js --baseline   # 用原始字典重建基準字典（覆蓋 chaizi-unique.js）
 *
 * ⚠️ 規矩：每次改字典都必須經呢個工具，唔可以手改 chaizi-unique.js。
 *    步驟：
 *      1. 去 tools/dict-rules.json 加一條新規則
 *      2. node tools/dict-transform.js --dry    （預覽）
 *      3. node tools/dict-transform.js          （套用 + 自動寫入 dict-changes.csv）
 *      4. node tools/dict-transform.js --check  （驗證）
 *      5. 部署 + 提交
 *
 * CSV 格式（每行一條變更）：
 *   文字；原拆分；新拆分
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DICT_FILE = path.join(ROOT, 'chaizi-unique.js');
const RULES_FILE = path.join(ROOT, 'tools', 'dict-rules.json');
const CSV_FILE = path.join(ROOT, 'dict-changes.csv');
const CSV_HEADER = '文字；原拆分；新拆分';
const DELIM = '；';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : null;
};

const DRY = has('--dry');
const CHECK_ONLY = has('--check');
const BASELINE = has('--baseline');
const RULE_INDEX = val('--rule');

// ===== 讀字典 =====
function readDictFile(file, globalName) {
  const content = fs.readFileSync(file, 'utf8');
  const re = new RegExp(globalName + ' = (\\{.+\\});\\s*$', 's');
  const m = content.match(re);
  if (!m) throw new Error(`搵唔到 ${globalName} （${file}）`);
  // 只定位 JSON 物件本身，唔好郁個 variable 名
  const jsonStart = m.index + m[0].indexOf(m[1]);
  return {
    dict: JSON.parse(m[1]),
    content,
    start: jsonStart,
    end: jsonStart + m[1].length
  };
}

function writeDictFile(content, start, end, dict) {
  const out = content.slice(0, start) + JSON.stringify(dict) + content.slice(end);
  fs.writeFileSync(DICT_FILE, out, 'utf8');
}

// ===== 基準字典：由原始字典生成 =====
function buildBaseline(cfg) {
  const src = readDictFile(path.join(ROOT, cfg.source || 'chaizi-data.js'), 'ChaiziDict');
  const simplify = cfg.simplify || {};
  const out = {};
  for (const [char, decomps] of Object.entries(src.dict)) {
    const seen = new Set();
    const uniq = [];
    for (const d of decomps) {
      let comps = d.split(' ').map(c => simplify[c] || c);
      if (cfg.filterEmpty) comps = comps.filter(c => c);
      if (!comps.length) continue;
      const key = comps.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(comps);
    }
    if (!uniq.length) continue;
    if (cfg.pick === 'longest') uniq.sort((a, b) => b.length - a.length); // 穩定排序 → 同原字典次序一致
    out[char] = uniq[0];
  }
  return out;
}

// ===== 讀寫 CSV =====
function readCsv() {
  if (!fs.existsSync(CSV_FILE)) return { header: CSV_HEADER, rows: [] };
  const raw = fs.readFileSync(CSV_FILE, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { header: CSV_HEADER, rows: [] };
  return { header: lines[0], rows: lines.slice(1).map(l => l.split(DELIM)) };
}

function writeCsv(header, rows) {
  const body = [header, ...rows.map(r => r.join(DELIM))].join('\r\n') + '\r\n';
  fs.writeFileSync(CSV_FILE, '﻿' + body, 'utf8');
}

// ===== 規則 =====
function loadConfig() {
  if (!fs.existsSync(RULES_FILE)) return { baseline: {}, rules: [] };
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
}

function applyRule(dict, rule) {
  const { from, to, position = 'any', exclude = [] } = rule;
  const changes = [];
  for (const [char, comps] of Object.entries(dict)) {
    if (!Array.isArray(comps)) continue;
    if (exclude.includes(char)) continue;
    const next = [...comps];
    let hit = false;
    if (position === 'first') {
      if (next[0] === from) { next[0] = to; hit = true; }
    } else if (position === 'last') {
      if (next.length && next[next.length - 1] === from) { next[next.length - 1] = to; hit = true; }
    } else {
      const idx = next.indexOf(from);
      if (idx >= 0) { next[idx] = to; hit = true; }
    }
    if (hit) {
      dict[char] = next;   // 直接改字典
      changes.push({ char, old: comps.join(' '), new: next.join(' ') });
    }
  }
  return changes;
}

// ===== 主流程 =====
function main() {
  const cfg = loadConfig();
  const rules = cfg.rules || [];

  // --baseline：重建基準字典
  if (BASELINE) {
    const baseline = buildBaseline(cfg.baseline || {});
    const { content, start, end } = readDictFile(DICT_FILE, 'ChaiziDictUnique');
    writeDictFile(content, start, end, baseline);
    console.log(`✅ 已用原始字典重建基準：${Object.keys(baseline).length} 字`);
    console.log('   （注意：呢個會還原所有規則，記得跟住重新套用）');
    return;
  }

  // --check：驗證字典 = 基準 + 全部規則
  if (CHECK_ONLY) {
    const expected = buildBaseline(cfg.baseline || {});
    for (const rule of rules) applyRule(expected, rule);

    const actual = readDictFile(DICT_FILE, 'ChaiziDictUnique').dict;
    const csv = readCsv();

    const drift = [];
    for (const char of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const e = expected[char] ? expected[char].join(' ') : '(無)';
      const a = actual[char] ? actual[char].join(' ') : '(無)';
      if (e !== a) drift.push({ char, expected: e, actual: a });
    }

    console.log(`基準 + ${rules.length} 條規則  =  ${Object.keys(expected).length} 字`);
    console.log(`實際 chaizi-unique.js      =  ${Object.keys(actual).length} 字`);
    console.log(`dict-changes.csv 記錄      =  ${csv.rows.length} 條`);
    console.log('');
    if (drift.length === 0) {
      console.log('✅ 一致：所有改動都有記錄，冇手改過字典');
    } else {
      console.log(`❌ 有 ${drift.length} 個字未經規則/未記錄：`);
      drift.slice(0, 20).forEach(d => console.log(`     ${d.char}：期望「${d.expected}」實際「${d.actual}」`));
      if (drift.length > 20) console.log(`     ... 仲有 ${drift.length - 20} 個`);
      console.log('\n   → 請用工具改字典（唔好手改），然後 node tools/dict-transform.js --check');
      process.exitCode = 1;
    }
    return;
  }

  // 套用規則
  const { dict, content, start, end } = readDictFile(DICT_FILE, 'ChaiziDictUnique');
  const csv = readCsv();

  const selected = RULE_INDEX !== null
    ? [rules[parseInt(RULE_INDEX, 10)]].filter(Boolean)
    : rules;

  if (!selected.length) {
    console.log('冇規則可以套用');
    return;
  }

  let allChanges = [];
  for (const rule of selected) {
    const changes = applyRule(dict, rule);
    if (!changes.length) {
      console.log(`⏭  規則「${rule.name}」冇匹配到任何字（可能已套用過）`);
      continue;
    }
    console.log(`🔧 規則「${rule.name}」：${changes.length} 個字`);
    changes.slice(0, 8).forEach(c => console.log(`     ${c.char}：${c.old} → ${c.new}`));
    if (changes.length > 8) console.log(`     ... 仲有 ${changes.length - 8} 個`);
    allChanges = allChanges.concat(changes);
  }

  if (!allChanges.length) return;
  if (DRY) {
    console.log('\n(dry-run，冇寫任何檔)');
    return;
  }

  writeDictFile(content, start, end, dict);

  const seen = new Set(csv.rows.map(r => r.join(DELIM)));
  let added = 0;
  for (const c of allChanges) {
    const row = [c.char, c.old, c.new];
    const key = row.join(DELIM);
    if (seen.has(key)) continue;
    seen.add(key);
    csv.rows.push(row);
    added++;
  }
  writeCsv(CSV_HEADER, csv.rows);

  console.log(`\n✅ 已更新字典：${allChanges.length} 個字`);
  console.log(`📝 已記錄到 dict-changes.csv：新增 ${added} 條（現共 ${csv.rows.length} 條）`);
}

main();
