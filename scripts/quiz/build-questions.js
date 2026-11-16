#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const sourcePath = process.argv[2] || process.env.ARENA_SOURCE || path.join(os.tmpdir(), 'arena-source.json');

if (!fs.existsSync(sourcePath)) {
  console.error('找不到題目來源：' + sourcePath);
  console.error('用法：node scripts/quiz/build-questions.js <arena-source.json>');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

const SENTENCE_NODES = [
  { node_id: 'basic', title: '四素句／基本句型', dimension: '基本句式', order: 1 },
  { node_id: 'expand', title: '擴寫與修飾', dimension: '基本句式', order: 2 },
  { node_id: 'ba', title: '把字句', dimension: '特殊句式', order: 3 },
  { node_id: 'bei', title: '被字句', dimension: '特殊句式', order: 4 },
  { node_id: 'lian', title: '連動句', dimension: '特殊句式', order: 5 },
  { node_id: 'jian', title: '兼語句', dimension: '特殊句式', order: 6 },
  { node_id: 'cun', title: '存現句', dimension: '特殊句式', order: 7 },
  { node_id: 'bi', title: '比喻句', dimension: '特殊句式', order: 8 },
  { node_id: 'zhuanzhe', title: '複句－轉折', dimension: '複句關係', order: 9 },
  { node_id: 'dijin', title: '複句－遞進', dimension: '複句關係', order: 10 },
  { node_id: 'yinguo', title: '複句－因果', dimension: '複句關係', order: 11 },
  { node_id: 'jiashe', title: '複句－假設', dimension: '複句關係', order: 12 },
  { node_id: 'tiaojian', title: '複句－條件', dimension: '複句關係', order: 13 },
  { node_id: 'binglie', title: '複句－並列', dimension: '複句關係', order: 14 },
  { node_id: 'xuanze', title: '複句－選擇', dimension: '複句關係', order: 15 }
];

const MATH_NODES = [
  { node_id: 'add', title: '加法', dimension: '四則運算', order: 1 },
  { node_id: 'sub', title: '減法', dimension: '四則運算', order: 2 },
  { node_id: 'mul', title: '乘法', dimension: '四則運算', order: 3 },
  { node_id: 'div', title: '除法', dimension: '四則運算', order: 4 }
];

const GK_NODES = [
  { node_id: 'hk', title: '香港與國家', dimension: '社會常識', order: 1 },
  { node_id: 'society', title: '社會與公民', dimension: '社會常識', order: 2 },
  { node_id: 'history', title: '歷史與文化', dimension: '人文世界', order: 3 },
  { node_id: 'world', title: '世界與旅遊', dimension: '人文世界', order: 4 },
  { node_id: 'science', title: '科學與自然', dimension: '自然科學', order: 5 },
  { node_id: 'env', title: '環境與資源', dimension: '自然科學', order: 6 },
  { node_id: 'health', title: '健康與安全', dimension: '生活健康', order: 7 }
];

function clampText(value) {
  return String(value == null ? '' : value).trim();
}

function classifySentence(question) {
  const tags = (question.knowledgeTags || []).join(' ');
  const explanation = question.explanation || '';
  const parts = (question.sentenceParts || []).join(' ');
  const text = tags + ' ' + explanation + ' ' + parts;

  if (/把字句/.test(text)) return 'ba';
  if (/被字句/.test(text)) return 'bei';
  if (/兼語/.test(text)) return 'jian';
  if (/連動/.test(text)) return 'lian';
  if (/存現/.test(text)) return 'cun';
  if (/比喻/.test(text)) return 'bi';
  if (/四素句|基本句型/.test(tags + ' ' + explanation)) return 'basic';
  if (/雙賓語|程度補語|擴寫句子|修飾語|狀語|擴寫/.test(tags + ' ' + explanation)) return 'expand';
  if (/轉折複句|轉折關係/.test(tags) || /轉折複句/.test(explanation) || /雖然|但是|然而|不過|卻/.test(explanation + ' ' + parts)) return 'zhuanzhe';
  if (/遞進複句|遞進關係/.test(tags) || /遞進複句/.test(explanation) || /不但|不僅|而且|並且/.test(explanation + ' ' + parts)) return 'dijin';
  if (/因果複句|因果關係/.test(tags) || /因果複句/.test(explanation) || /因為|由於|因此|所以/.test(explanation + ' ' + parts)) return 'yinguo';
  if (/假設複句|假設關係/.test(tags) || /假設複句/.test(explanation) || /如果|假如|要是|倘若|即使/.test(explanation + ' ' + parts)) return 'jiashe';
  if (/條件複句|條件關係/.test(tags) || /條件複句/.test(explanation) || /只要|只有|除非/.test(explanation + ' ' + parts)) return 'tiaojian';
  if (/並列複句|並列關係/.test(tags) || /並列複句/.test(explanation) || /一邊|一方面/.test(explanation + ' ' + parts)) return 'binglie';
  if (/選擇複句|選擇關係/.test(tags) || /選擇複句/.test(explanation) || /或者|還是|寧願|與其/.test(explanation + ' ' + parts)) return 'xuanze';
  return 'basic';
}

function classifyMath(question) {
  const tags = (question.knowledgeTags || []).join(' ');
  if (/加法/.test(tags)) return 'add';
  if (/減法/.test(tags)) return 'sub';
  if (/乘法/.test(tags)) return 'mul';
  if (/除法/.test(tags)) return 'div';
  const expression = String(question.paragraph || '');
  if (/\+/.test(expression)) return 'add';
  if (/-/.test(expression)) return 'sub';
  if (/[×x*]/.test(expression)) return 'mul';
  if (/[÷/]/.test(expression)) return 'div';
  return 'add';
}

function classifyGk(question) {
  const tags = (question.knowledgeTags || []).join(' ');
  const text = tags + ' ' + (question.choiceItems && question.choiceItems[0] && question.choiceItems[0].prompt || '') + ' ' + (question.explanation || '');

  if (/健康生活|個人衞生|營養|運動安全|作息|急救|預防疾病|均衡飲食|牙齒|口腔|睡眠/.test(text)) return 'health';
  if (/交通與安全|道路安全|乘車安全|道路標誌|交通工具|緊急求助|個人安全/.test(text)) return 'health';
  if (/減少廢物|珍惜資源|能源|環境與生活|居住好環境|氣候變化|清潔能源|廢物回收|源頭減廢|節約|愛護環境|保護環境|空氣污染/.test(text)) return 'env';
  if (/科學與探究|科學與自然|科學常識|物質|電學|天氣與四季|工程設計|植物|動物|磁鐵|指南針|溶解|影子|聲音|呼吸作用|浮沉|水的狀態|物料特性|光/.test(text)) return 'science';
  if (/環遊大世界|旅遊風俗|世界|國家公園|著名景點|地標/.test(text)) return 'world';
  if (/歷史與文化|歷史人物|中華文化|國家歷史|國家象徵|中國歷史|傳統節日|傳統美德|文化/.test(text)) return 'history';
  if (/香港歷史|特區成立|香港概況|住在香港|基本法|法律知識|香港認識|香港|國家認識/.test(text)) return 'hk';
  if (/社區與服務|社會與公民|公共設施|政府部門|學校規則|誠實|品德|人際|互助|尊重|公共秩序|愛護公物|社會/.test(text)) return 'society';
  return 'hk';
}

function sentenceQuestions() {
  return (source.sentence || [])
    .slice()
    .sort((a, b) => String(a._id).localeCompare(String(b._id)))
    .map((question, index) => {
      const originalParts = (question.sentenceParts || []).map(clampText);
      const order = question.correctOrder || [];
      const valid = originalParts.length > 1 &&
        order.length === originalParts.length &&
        new Set(order).size === originalParts.length &&
        order.every(value => Number.isInteger(value) && value >= 0 && value < originalParts.length) &&
        originalParts.every(Boolean);
      if (!valid) return null;
      const parts = order.map(value => originalParts[value]);
      const answer = parts.join('');
      return {
        question_id: 'S' + String(index + 1).padStart(3, '0'),
        node_id: classifySentence(question),
        domain: 'sentence',
        type: 'order',
        prompt: clampText(question.prompt) || '請把下列詞語重組成通順的句子。',
        instruction: '點擊或拖動詞語卡，排成通順的句子。',
        stem: answer,
        parts,
        answer,
        explanation: clampText(question.explanation),
        difficulty: clampText(question.difficulty) || 'normal',
        tags: (question.knowledgeTags || []).map(clampText).filter(Boolean),
        source: 'sentence-battle:' + question._id
      };
    })
    .filter(Boolean);
}

function mathQuestions() {
  return (source.math || [])
    .slice()
    .sort((a, b) => String(a._id).localeCompare(String(b._id)))
    .map((question, index) => {
      const expression = clampText(question.paragraph);
      const answer = clampText(question.correctAnswer);
      if (!expression || !/^-?\d+(?:\.\d+)?$/.test(answer)) return null;
      return {
        question_id: 'M' + String(index + 1).padStart(3, '0'),
        node_id: classifyMath(question),
        domain: 'math',
        type: 'input',
        prompt: clampText(question.prompt) || '請直接輸入計算結果。',
        instruction: '輸入計算結果，再按「檢查」。',
        stem: expression,
        expression,
        answer,
        explanation: clampText(question.explanation),
        difficulty: clampText(question.difficulty) || 'normal',
        tags: (question.knowledgeTags || []).map(clampText).filter(Boolean),
        source: 'sentence-battle:' + question._id
      };
    })
    .filter(Boolean);
}

function gkQuestions() {
  return (source.gk || [])
    .slice()
    .sort((a, b) => String(a._id).localeCompare(String(b._id)))
    .map((question, index) => {
      const item = (question.choiceItems || [])[0];
      if (!item) return null;
      const prompt = clampText(item.prompt);
      const options = (item.options || []).map(clampText).filter(Boolean);
      const answer = clampText(item.correctAnswer);
      if (!prompt || options.length !== 4 || !options.includes(answer)) return null;
      return {
        question_id: 'K' + String(index + 1).padStart(3, '0'),
        node_id: classifyGk(question),
        domain: 'gk',
        type: 'choice',
        prompt,
        instruction: '選出最合適的答案。',
        stem: prompt,
        options,
        answer,
        explanation: clampText(question.explanation),
        difficulty: clampText(question.difficulty) || 'normal',
        tags: (question.knowledgeTags || []).map(clampText).filter(Boolean),
        source: 'sentence-battle:' + question._id
      };
    })
    .filter(Boolean);
}

const questions = sentenceQuestions().concat(mathQuestions(), gkQuestions());
const domainMeta = {
  sentence: { title: '中文句子', short: '句子', icon: 'pen', color: '#7a4ab8' },
  math: { title: '數學計算', short: '數學', icon: 'calc', color: '#1f6f8b' },
  gk: { title: '常識問答', short: '常識', icon: 'spark', color: '#2f8f6b' }
};
const nodeGroups = {
  sentence: SENTENCE_NODES,
  math: MATH_NODES,
  gk: GK_NODES
};
const counts = new Map();
questions.forEach(question => {
  counts.set(question.node_id, (counts.get(question.node_id) || 0) + 1);
});
const nodes = [];
Object.keys(nodeGroups).forEach(domain => {
  nodeGroups[domain].forEach(node => {
    const questionCount = counts.get(node.node_id) || 0;
    if (!questionCount) return;
    nodes.push({
      ...node,
      domain,
      category: domainMeta[domain].title,
      questionCount
    });
  });
});

const byDomain = {};
questions.forEach(question => {
  byDomain[question.domain] = (byDomain[question.domain] || 0) + 1;
});

Object.keys(domainMeta).forEach(domain => {
  const domainQuestions = questions.filter(question => question.domain === domain);
  const domainNodes = nodes.filter(node => node.domain === domain);
  const bundle = {
    version: 1,
    source: 'sentence-battle',
    domain,
    domains: { [domain]: domainMeta[domain] },
    nodes: domainNodes,
    questions: domainQuestions
  };
  const outputPath = path.join(rootDir, 'tools', domain, 'questions.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bundle, null, 2) + '\n');
  console.log('[quiz] 已寫入 ' + outputPath + '：' + domainQuestions.length + ' 題、' + domainNodes.length + ' 個分類');
});

console.log('[quiz] 題目：' + JSON.stringify(byDomain) + '，共 ' + questions.length + ' 題');
console.log('[quiz] 節點：' + nodes.length + ' 個');
nodes.forEach(node => {
  console.log('  ' + node.domain + '/' + node.node_id + ' ' + node.title + '：' + node.questionCount);
});
