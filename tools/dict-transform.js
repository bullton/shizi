#!/usr/bin/env node
/**
 * 字典變更工具 —— 只操作 chaizi-unique.js（你篩選好嘅權威字典）
 *
 * ⚠️ 本專案唔再用 chaizi-data.js。
 *    chaizi-unique.js 係唯一權威來源，可以直接手改，或者用呢個工具改。
 *
 * 用法：
 *   node tools/dict-transform.js --check            檢查 CSV 記錄同字典是否一致
 *   node tools/dict-transform.js --diff <舊檔>      對比舊快照，自動記錄差異落 CSV
 *   node tools/dict-transform.js --dry              預覽規則會改乜
 *   node tools/dict-transform.js                    套用 rules 並記錄
 *   node tools/dict-transform.js --rule 0           只套用第 0 條規則
 *
 * 規矩：每次改字典（無論手改定用工具）之後，都應該跑一次 --diff 或手動加 CSV，
 *       再用 --check 確認冇漏記。
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

const CHECK_ONLY = has('--check');
const DRY = has('--dry');
const DIFF_FILE = val('--diff');
const RULE_INDEX = val('--rule');

// ===== 讀字典 =====
function readDict() {
  const content = fs.readFileSync(DICT_FILE, 'utf8');
  const m = content.match(/ChaiziDictUnique = (\{.+\});\s*$/s);
  if (!m) throw new Error('搵唔到 ChaiziDictUnique');
  const jsonStart = m.index + m[0].indexOf(m[1]);
  return {
    dict: JSON.parse(m[1]),
    content,
    start: jsonStart,
    end: jsonStart + m[1].length
  };
}

function writeDict(content, start, end, dict) {
  fs.writeFileSync(DICT_FILE, content.slice(0, start) + JSON.stringify(dict) + content.slice(end), 'utf8');
}

// ===== CSV =====
function readCsv() {
  if (!fs.existsSync(CSV_FILE)) return { header: CSV_HEADER, rows: [] };
  const raw = fs.readFileSync(CSV_FILE, 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { header: CSV_HEADER, rows: [] };
  return { header: lines[0], rows: lines.slice(1).map(l => l.split(DELIM)) };
}

function writeCsv(header, rows) {
  fs.writeFileSync(CSV_FILE, '﻿' + [header, ...rows.map(r => r.join(DELIM))].join('\r\n') + '\r\n', 'utf8');
}

function loadRules() {
  if (!fs.existsSync(RULES_FILE)) return [];
  const cfg = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  return cfg.rules || [];
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
      dict[char] = next;
      changes.push({ char, old: comps.join(' '), new: next.join(' ') });
    }
  }
  return changes;
}

// ===== 主流程 =====
function main() {
  const { dict, content, start, end } = readDict();
  const csv = readCsv();

  // --check：CSV 記錄 vs 字典現況
  if (CHECK_ONLY) {
    const lastByChar = new Map();
    for (const row of csv.rows) {
      if (row.length < 3) continue;
      lastByChar.set(row[0], row);
    }
    const problems = [];
    for (const [char, row] of lastByChar) {
      const cur = dict[char];
      if (!cur) { problems.push(`${char}：CSV 有記錄但字典冇呢個字`); continue; }
      const curStr = cur.join(' ');
      if (curStr !== row[2]) {
        problems.push(`${char}：CSV 最後記錄「${row[2]}」，但字典而家係「${curStr}」`);
      }
    }
    console.log(`字典: ${Object.keys(dict).length} 字 | CSV: ${csv.rows.length} 條（涵蓋 ${lastByChar.size} 字）`);
    if (!problems.length) {
      console.log('✅ 一致：所有已記錄嘅變更都反映喺字典；字典冇被改走樣');
    } else {
      console.log(`❌ ${problems.length} 個字同 CSV 記錄唔一致：`);
      problems.slice(0, 20).forEach(p => console.log('   ' + p));
      if (problems.length > 20) console.log(`   …仲有 ${problems.length - 20} 個`);
      process.exitCode = 1;
    }
    return;
  }

  // --diff <舊檔>：對比快照，記錄差異
  if (DIFF_FILE) {
    const oldContent = fs.readFileSync(DIFF_FILE, 'utf8');
    const m = oldContent.match(/ChaiziDictUnique = (\{.+\});\s*$/s);
    if (!m) throw new Error('舊檔搵唔到 ChaiziDictUnique');
    const oldDict = JSON.parse(m[1]);
    const seen = new Set(csv.rows.map(r => r.join(DELIM)));
    let added = 0;
    for (const char of new Set([...Object.keys(oldDict), ...Object.keys(dict)])) {
      const a = (oldDict[char] || []).join(' ');
      const b = (dict[char] || []).join(' ');
      if (a === b) continue;
      const row = [char, a, b];
      const key = row.join(DELIM);
      if (seen.has(key)) continue;
      seen.add(key);
      csv.rows.push(row);
      added++;
    }
    writeCsv(CSV_HEADER, csv.rows);
    console.log(`📝 已記錄 ${added} 條差異到 dict-changes.csv（現共 ${csv.rows.length} 條）`);
    return;
  }

  // 套用規則（改 chaizi-unique.js 本身）
  const rules = loadRules();
  const selected = RULE_INDEX !== null ? [rules[parseInt(RULE_INDEX, 10)]].filter(Boolean) : rules;
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

  writeDict(content, start, end, dict);

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
