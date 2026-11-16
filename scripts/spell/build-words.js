#!/usr/bin/env node
'use strict';

/*
 * 英文拆拆拆 · 詞庫生成
 *
 * 資料來源（不隨專案提交，放在 SPELL_CACHE 指定的資料夾）：
 *   ecdict.csv           ECDICT（MIT）https://github.com/skywind3000/ECDICT
 *   eng_sentences.tsv    Tatoeba 英文句子（CC BY 2.0 FR）
 *   cmn_sentences.tsv    Tatoeba 中文句子
 *   cmn-eng_links.tsv    英文－中文句子對應
 *   cmudict.dict         CMU Pronouncing Dictionary（BSD-2-Clause），用於檢查音節數
 *   STCharacters.txt     OpenCC 簡→繁單字表（Apache-2.0）
 *   STPhrases.txt        OpenCC 簡→繁詞組表（Apache-2.0）
 *
 * 執行：
 *   SPELL_CACHE=/path/to/cache node scripts/spell/build-words.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = process.env.SPELL_CACHE || path.join(__dirname, '.cache');
const OUT = path.join(ROOT, 'tools', 'spell', 'words.json');
const REPORT = path.join(ROOT, 'tools', 'spell', 'words-report.json');

const { hyphenateSync } = require('./vendor/export-contract.js')(
  require('./vendor/en-us-patterns.js')
);

/* ---------- 簡繁轉換（OpenCC 字典，Apache-2.0） ---------- */
function loadOpenCC() {
  const phraseMap = new Map();
  const charMap = new Map();
  const read = (file) => fs.readFileSync(path.join(__dirname, 'vendor', file), 'utf8').split('\n');
  for (const line of read('STPhrases.txt')) {
    if (!line || line[0] === '#') continue;
    const [from, to] = line.split('\t');
    if (from && to) phraseMap.set(from, to.split(' ')[0]);
  }
  for (const line of read('STCharacters.txt')) {
    if (!line || line[0] === '#') continue;
    const [from, to] = line.split('\t');
    if (from && to) charMap.set(from, to.split(' ')[0]);
  }
  const maxPhrase = Math.max(1, ...[...phraseMap.keys()].map((key) => key.length));
  return function toTraditional(input) {
    const text = String(input || '');
    let out = '';
    for (let i = 0; i < text.length; i++) {
      let matched = false;
      for (let len = Math.min(maxPhrase, text.length - i); len > 1; len--) {
        const chunk = text.slice(i, i + len);
        if (phraseMap.has(chunk)) {
          out += phraseMap.get(chunk);
          i += len - 1;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      const ch = text[i];
      out += charMap.get(ch) || ch;
    }
    return out;
  };
}

/* ---------- 音節切分 ---------- */
const OVERRIDES = {
  ability: 'a·bil·i·ty',
  agency: 'a·gen·cy',
  agreement: 'a·gree·ment',
  analysis: 'a·nal·y·sis',
  available: 'a·vail·a·ble',
  coconut: 'co·co·nut',
  customer: 'cus·tom·er',
  dictionary: 'dic·tion·ar·y',
  granny: 'gran·ny',
  identify: 'i·den·ti·fy',
  medical: 'med·i·cal',
  okay: 'o·kay',
  original: 'o·rig·i·nal',
  society: 'so·ci·e·ty',
  timetable: 'time·ta·ble',
  uniform: 'u·ni·form',
  united: 'u·nit·ed',
  woman: 'wom·an',
  women: 'wom·en',
  city: 'cit·y',
  study: 'stud·y',
  body: 'bod·y',
  baby: 'ba·by',
  movie: 'mov·ie',
  ocean: 'o·cean',
  area: 'ar·e·a',
  idea: 'i·de·a',
  event: 'e·vent',
  union: 'un·ion',
  method: 'meth·od',
  amount: 'a·mount',
  unit: 'u·nit',
  duty: 'du·ty',
  iron: 'i·ron',
  hero: 'he·ro',
  pupil: 'pu·pil',
  colour: 'col·our',
  color: 'col·or',
  minute: 'min·ute',
  project: 'proj·ect',
  record: 'rec·ord',
  present: 'pres·ent',
  evening: 'eve·ning',
  tiny: 'ti·ny',
  busy: 'bus·y',
  ready: 'read·y',
  heavy: 'heav·y',
  lucky: 'luck·y',
  healthy: 'health·y',
  beautiful: 'beau·ti·ful',
  comfortable: 'com·fort·a·ble',
  vegetable: 'veg·e·ta·ble',
  restaurant: 'res·tau·rant',
  chocolate: 'choc·o·late',
  banana: 'ba·na·na',
  elephant: 'el·e·phant',
  umbrella: 'um·brel·la',
  animal: 'an·i·mal',
  yesterday: 'yes·ter·day',
  together: 'to·geth·er',
  important: 'im·por·tant',
  different: 'dif·fer·ent',
  information: 'in·for·ma·tion',
  education: 'ed·u·ca·tion',
  government: 'gov·ern·ment',
  apartment: 'a·part·ment',
  reporter: 're·port·er',
  potato: 'po·ta·to',
  tomato: 'to·ma·to',
  amazing: 'a·maz·ing',
  mystery: 'mys·ter·y',
  library: 'li·brar·y',
  camera: 'cam·er·a',
  radio: 'ra·di·o',
  necessary: 'nec·es·sar·y',
  secretary: 'sec·re·tar·y',
  ordinary: 'or·di·nar·y',
  emergency: 'e·mer·gen·cy',
  electricity: 'e·lec·tric·i·ty',
  university: 'u·ni·ver·si·ty',
  basketball: 'bas·ket·ball',
  baseball: 'base·ball',
  birthday: 'birth·day',
  holiday: 'hol·i·day',
  orange: 'or·ange',
  purple: 'pur·ple',
  yellow: 'yel·low',
  people: 'peo·ple',
  apple: 'ap·ple',
  table: 'ta·ble',
  little: 'lit·tle',
  winter: 'win·ter',
  summer: 'sum·mer',
  autumn: 'au·tumn',
  garden: 'gar·den',
  window: 'win·dow',
  pencil: 'pen·cil',
  science: 'sci·ence',
  forest: 'for·est',
  teacher: 'teach·er',
  kitchen: 'kitch·en',
  flower: 'flow·er',
  picture: 'pic·ture',
  future: 'fu·ture',
  nature: 'na·ture',
  culture: 'cul·ture',
  mixture: 'mix·ture',
  creature: 'crea·ture',
  furniture: 'fur·ni·ture',
  temperature: 'tem·per·a·ture',
  medicine: 'med·i·cine',
  exercise: 'ex·er·cise',
  adventure: 'ad·ven·ture',
  expensive: 'ex·pen·sive',
  attention: 'at·ten·tion',
  direction: 'di·rec·tion',
  decision: 'de·ci·sion',
  discussion: 'dis·cus·sion',
  collection: 'col·lec·tion',
  connection: 'con·nec·tion',
  invention: 'in·ven·tion',
  pollution: 'pol·lu·tion',
  solution: 'so·lu·tion',
  celebration: 'cel·e·bra·tion',
  imagination: 'i·mag·i·na·tion',
  popular: 'pop·u·lar',
  difficult: 'dif·fi·cult',
  dangerous: 'dan·ger·ous',
  delicious: 'de·li·cious',
  famous: 'fa·mous',
  exciting: 'ex·cit·ing',
  interesting: 'in·ter·est·ing',
  wonderful: 'won·der·ful',
  terrible: 'ter·ri·ble',
  remember: 're·mem·ber',
  forget: 'for·get',
  understand: 'un·der·stand',
  introduce: 'in·tro·duce',
  practise: 'prac·tise',
  prepare: 'pre·pare',
  protect: 'pro·tect',
  invite: 'in·vite',
  decide: 'de·cide',
  describe: 'de·scribe',
  discover: 'dis·cov·er',
  discuss: 'dis·cuss',
  compare: 'com·pare',
  collect: 'col·lect',
  arrive: 'ar·rive',
  borrow: 'bor·row',
  carry: 'car·ry',
  hurry: 'hur·ry',
  worry: 'wor·ry',
  follow: 'fol·low',
  happen: 'hap·pen',
  listen: 'lis·ten',
  open: 'o·pen',
  visit: 'vis·it',
  travel: 'trav·el',
  answer: 'an·swer',
  question: 'ques·tion',
  another: 'an·oth·er',
  however: 'how·ev·er',
  everyone: 'ev·ery·one',
  everybody: 'ev·ery·bod·y',
  everything: 'ev·ery·thing',
  something: 'some·thing',
  someone: 'some·one',
  anyone: 'an·y·one',
  anybody: 'an·y·bod·y',
  anywhere: 'an·y·where',
  everywhere: 'ev·ery·where',
  somewhere: 'some·where',
  always: 'al·ways',
  also: 'al·so',
  even: 'e·ven',
  ever: 'ev·er',
  away: 'a·way',
  ago: 'a·go',
  alone: 'a·lone',
  afraid: 'a·fraid',
  aware: 'a·ware',
  ahead: 'a·head',
  apart: 'a·part',
  maybe: 'may·be',
  enough: 'e·nough',
  volcano: 'vol·ca·no',
  galaxy: 'gal·ax·y',
  broccoli: 'broc·co·li',
  skeleton: 'skel·e·ton',
  surgery: 'sur·ger·y',
  teenager: 'teen·ag·er',
  adolescent: 'ad·o·les·cent',
  balcony: 'bal·co·ny',
  television: 'tel·e·vi·sion',
  microwave: 'mi·cro·wave',
  piano: 'pi·an·o',
  creative: 'cre·a·tive',
  reasonable: 'rea·son·a·ble',
  valuable: 'val·u·a·ble',
  media: 'me·di·a',
  anyway: 'an·y·way',
  imagine: 'i·mag·ine',
  medium: 'me·di·um',
  variety: 'va·ri·e·ty',
  enable: 'en·a·ble',
  realise: 're·al·ise',
  considerable: 'con·sid·er·a·ble',
  consumer: 'con·sum·er',
  opinion: 'o·pin·ion',
  recognise: 'rec·og·nise',
  arrangement: 'ar·range·ment',
  equipment: 'e·quip·ment',
  absolutely: 'ab·so·lute·ly',
  nuclear: 'nu·cle·ar',
  studio: 'stu·di·o',
  associate: 'as·so·ci·ate',
  contribute: 'con·trib·ute',
  identity: 'i·den·ti·ty',
  telephone: 'tel·e·phone',
  entirely: 'en·tire·ly',
  demonstrate: 'dem·on·strate',
  acquire: 'ac·quire',
  equally: 'e·qual·ly',
  theatre: 'the·a·tre',
  usual: 'u·su·al',
  unable: 'un·a·ble',
  democracy: 'de·moc·ra·cy',
  initial: 'i·ni·tial',
  suitable: 'suit·a·ble',
  overall: 'o·ver·all',
  criticism: 'crit·i·cism',
  emotional: 'e·mo·tion·al',
  recognition: 'rec·og·ni·tion',
  revenue: 'rev·e·nue',
  initiative: 'i·ni·tia·tive',
  anymore: 'an·y·more',
  curriculum: 'cur·ric·u·lum',
  investor: 'in·ves·tor',
  gallery: 'gal·ler·y',
  opening: 'o·pen·ing',
  variation: 'var·i·a·tion',
  deputy: 'dep·u·ty',
  eliminate: 'e·lim·i·nate',
  creation: 'cre·a·tion',
  variable: 'var·i·a·ble',
  mechanism: 'mech·a·nism',
  championship: 'cham·pi·on·ship',
  origin: 'o·ri·gin',
  rapidly: 'rap·id·ly',
  achievement: 'a·chieve·ment',
  enormous: 'e·nor·mous',
  unusual: 'un·u·su·al',
  physician: 'phy·si·cian',
  boundary: 'bound·a·ry',
  abandon: 'a·ban·don',
  real: 're·al',
  tired: 'tir·ed',
  poem: 'po·em'
};

const LEGAL_ONSETS = new Set([
  'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'pl', 'pr',
  'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw', 'dw',
  'ch', 'sh', 'th', 'ph', 'wh', 'qu', 'kn', 'wr', 'scr', 'spr', 'str',
  'spl', 'thr', 'shr', 'sch', 'squ', 'chr'
]);

function hasVowel(text) {
  return /[aeiouy]/i.test(text);
}

function fixFinalLe(parts) {
  if (parts.length < 2) return parts;
  const last = parts[parts.length - 1];
  if (!/^[a-z]?le$/i.test(last) || hasVowel(last)) return parts;
  const prev = parts[parts.length - 2];
  const match = prev.match(/([bcdfgklmnprstvz])$/i);
  if (match && prev.length > 2) {
    parts[parts.length - 2] = prev.slice(0, -1);
    parts[parts.length - 1] = prev.slice(-1) + last;
  }
  return parts;
}

function fallbackSplit(word) {
  const suffixes = [
    'tion', 'sion', 'ment', 'ness', 'able', 'ible', 'ing', 'est', 'er',
    'or', 'ly', 'ful', 'less', 'ous', 'ive', 'ate', 'age', 'ure', 'al',
    'ic', 'en', 'y'
  ];
  for (const suffix of suffixes) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    if (stem.length < 2 || !hasVowel(stem)) continue;
    return [stem, suffix];
  }
  return null;
}

let cmuCounts = null;

function loadCmuCounts() {
  const map = new Map();
  const file = path.join(CACHE, 'cmudict.dict');
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    if (!line || line.startsWith(';;;')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const word = parts[0].replace(/\(\d+\)$/, '').toLowerCase();
    const count = parts.slice(1).filter(phone => /\d$/.test(phone)).length;
    if (!count) continue;
    const current = map.get(word) || 0;
    if (count > current) map.set(word, count);
  }
  return map;
}

function cmuSyllables(word) {
  if (!cmuCounts) cmuCounts = loadCmuCounts();
  return cmuCounts.get(word) || 0;
}

function splitWord(word) {
  const w = String(word).toLowerCase();
  if (OVERRIDES[w]) return OVERRIDES[w].split('·');
  const known = cmuSyllables(w);
  const pieces = hyphenateSync(w).split('\u00AD').filter(Boolean);
  const finalYSplit = pieces.length >= 2 &&
    pieces[pieces.length - 1].toLowerCase() === 'y' &&
    /[aeiouy]$/i.test(pieces[pieces.length - 2]);
  if (pieces.length >= 2 && pieces.length <= 4 && pieces.every(hasVowel) && !finalYSplit) {
    if (known && pieces.length > known) return null;
    return fixFinalLe(pieces);
  }
  if (pieces.length === 1) {
    const fallback = fallbackSplit(w);
    const fallbackFinalY = fallback && fallback.length >= 2 &&
      fallback[fallback.length - 1].toLowerCase() === 'y' &&
      /[aeiouy]$/i.test(fallback[fallback.length - 2]);
    if (fallback && fallback.every(hasVowel) && !fallbackFinalY) {
      if (known && fallback.length > known) return null;
      return fixFinalLe(fallback);
    }
  }
  return null;
}

/* ---------- 詞性、釋義、詞形 ---------- */
const POS_LABELS = {
  n: '名詞',
  v: '動詞',
  vt: '及物動詞',
  vi: '不及物動詞',
  a: '形容詞',
  ad: '副詞',
  adv: '副詞'
};

function parsePos(raw) {
  const match = String(raw || '').match(/^(n\.|v\.|vt\.|vi\.|a\.|ad\.|adv\.)/);
  if (!match) return { code: '', label: '' };
  const code = match[1].replace('.', '');
  return { code, label: POS_LABELS[code] || '' };
}

function firstLine(text) {
  return String(text || '').split('\\n')[0].trim();
}

function cleanDefinition(raw) {
  let text = firstLine(raw)
    .replace(/^(n|v|a|s|r|j)\.\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 150) text = text.slice(0, 147).trim() + '…';
  return text;
}

function cleanIpa(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  text = text.replace(/^'/, 'ˈ').replace(/ә/g, 'ə').replace(/є/g, 'ɛ');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 40) return '';
  return '/' + text + '/';
}

function parseForms(exchange) {
  const forms = [];
  const seen = new Set();
  const labels = {
    s: '複數',
    p: '過去式',
    d: '過去分詞',
    i: '現在分詞',
    3: '第三人稱單數',
    r: '比較級',
    t: '最高級'
  };
  for (const part of String(exchange || '').split('/')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const key = part.slice(0, at);
    const value = part.slice(at + 1).trim();
    if (!labels[key] || !/^[a-z][a-z'-]*$/i.test(value)) continue;
    if (seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    forms.push({ label: labels[key], word: value });
  }
  return forms.slice(0, 4);
}

const MEANING_BLOCK = /尸体|凶暴|打桩|圈套|卑鄙|笨蛋|顽固|自负|妓|色情|死亡|死|杀|战|枪|毒|赌|烟|酒|宗教|政治|德国港口|眼球|私处|性|承受者/;

function definitionPos(definition) {
  const match = String(definition || '').match(/^\s*(n|v|a|s|r|j)\./i);
  if (!match) return '';
  const code = match[1].toLowerCase();
  if (code === 's' || code === 'j') return 'a';
  if (code === 'r') return 'ad';
  return code;
}

function pickTranslationLine(translation, definition, usagePos) {
  const lines = String(translation || '').split('\\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  const wanted = [usagePos, definitionPos(definition)].filter(Boolean);
  const patterns = {
    n: /^n\./,
    v: /^(v|vt|vi)\./,
    a: /^a\./,
    ad: /^(ad|adv)\./
  };
  for (const code of wanted) {
    const pattern = patterns[code];
    if (!pattern) continue;
    const match = lines.find((line) => pattern.test(line));
    if (match) return match;
  }
  return lines[0];
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectUsagePos(example, word) {
  if (!example || !example.en) return '';
  const form = example.match || word;
  const match = example.en.match(new RegExp('\\b' + escapeRegExp(form) + '\\b', 'i'));
  if (!match) return '';
  const before = example.en.slice(0, match.index).trim().split(/\s+/).filter(Boolean);
  const prev = (before[before.length - 1] || '').toLowerCase();
  if (prev === 'to') return 'v';
  if (/^(i|you|we|they|he|she|it)$/.test(prev)) return 'v';
  if (['must', 'can', 'will', 'would', 'should', 'may', 'might', 'could', 'shall', 'do', 'does', 'did', "don't", "doesn't", "didn't", 'cannot', "let's"].includes(prev)) return 'v';
  if (['a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'these', 'those', 'some', 'any', 'every', 'each', 'no'].includes(prev)) return 'n';
  if (['of', 'in', 'on', 'at', 'with', 'for', 'from', 'by', 'about', 'into', 'over', 'under', 'without'].includes(prev)) return 'n';
  if (['is', 'are', 'was', 'were', 'am', 'be', 'been', 'very', 'so', 'too', 'quite', 'really', 'extremely', 'more', 'most'].includes(prev)) {
    return /(ing|ed)$/.test(form) ? 'v' : 'a';
  }
  return '';
}

function buildMeaning(translation, definition, toTraditional, usagePos) {
  const line = pickTranslationLine(translation, definition, usagePos);
  let text = line.replace(/^(n\.|v\.|vt\.|vi\.|a\.|ad\.|adv\.)\s*/, '');
  const senses = text.split(/[,，;；、]/).map((item) => item.trim());
  const picked = [];
  for (const raw of senses) {
    const clean = raw
      .replace(/^\[[^\]]+\]\s*/, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean || picked.includes(clean) || MEANING_BLOCK.test(clean)) continue;
    picked.push(clean);
    if (picked.length >= 2 || picked.join('；').length >= 18) break;
  }
  return {
    text: toTraditional(picked.join('；')).slice(0, 32),
    pos: parsePos(line)
  };
}

const WORD_FIXES = {
  weekday: { meaning: '工作日；平日', pos: 'n' },
  presentation: {
    meaning: '演講；報告', pos: 'n',
    example: { en: 'Her presentation was excellent.', zh: '她的演講非常出色。' }
  },
  honey: { example: { en: 'I like honey on my bread.', zh: '我喜歡在麵包上抹蜂蜜。' } },
  chicken: { example: { en: 'I like chicken and rice.', zh: '我喜歡雞肉配米飯。' } },
  cover: {
    meaning: '覆蓋；蓋子', pos: 'v',
    example: { en: 'Snow covered the whole garden.', zh: '雪覆蓋了整個花園。' }
  },
  tiger: { example: { en: 'The tiger is sleeping under the tree.', zh: '老虎正在樹下睡覺。' } },
  banana: { example: { en: 'I eat a banana every morning.', zh: '我每天早上吃一根香蕉。' } },
  forest: { example: { en: 'We walked through the green forest.', zh: '我們走過綠色的森林。' } },
  body: { meaning: '身體', pos: 'n' },
  account: { meaning: '帳戶；說明', pos: 'n' },
  assembly: { meaning: '集會；集合', pos: 'n' },
  prosecutor: { meaning: '檢察官', pos: 'n' }
};

/* ---------- 主題與選詞 ---------- */
const THEME_SEEDS = {
  nature: [
    'animal', 'elephant', 'tiger', 'monkey', 'rabbit', 'chicken', 'butterfly',
    'spider', 'dolphin', 'turtle', 'forest', 'mountain', 'river', 'ocean',
    'island', 'garden', 'flower', 'rainbow', 'thunder', 'weather', 'summer',
    'winter', 'autumn', 'season', 'nature', 'plant', 'insect', 'feather',
    'village', 'countryside', 'sunshine', 'sunlight', 'moonlight', 'seaside',
    'beach', 'desert', 'valley', 'waterfall', 'rainforest', 'penguin', 'giraffe',
    'squirrel', 'kangaroo', 'hippo', 'zebra', 'camel', 'donkey', 'puppy',
    'kitten', 'animal', 'wildlife', 'butterfly', 'dragonfly', 'ladybird',
    'crocodile', 'alligator', 'chimpanzee', 'orangutan', 'flamingo', 'peacock',
    'ostrich', 'hedgehog', 'raccoon', 'buffalo', 'antelope', 'leopard',
    'cheetah', 'jaguar', 'panther', 'koala', 'pelican', 'seagull', 'sparrow',
    'pigeon', 'falcon', 'eagle', 'parrot', 'tortoise', 'lizard', 'octopus',
    'jellyfish', 'starfish', 'seahorse', 'coral', 'lagoon', 'glacier',
    'volcano', 'canyon', 'meadow', 'prairie', 'savanna', 'wetland', 'orchard',
    'blossom', 'petal', 'pollen', 'seedling', 'sapling', 'thunderstorm',
    'hurricane', 'tornado', 'blizzard', 'drizzle', 'puddle', 'sunrise',
    'sunset', 'twilight', 'starlight', 'galaxy', 'planet', 'comet', 'meteor',
    'asteroid', 'universe', 'atmosphere', 'temperature', 'climate'
  ],
  food: [
    'apple', 'banana', 'orange', 'lemon', 'grape', 'strawberry', 'cherry',
    'potato', 'tomato', 'carrot', 'onion', 'pepper', 'sugar', 'honey',
    'butter', 'cheese', 'chocolate', 'sandwich', 'hamburger', 'noodle',
    'pasta', 'pizza', 'salad', 'dinner', 'breakfast', 'lunch', 'kitchen',
    'restaurant', 'delicious', 'hungry', 'thirsty', 'vegetable', 'fruit',
    'cookie', 'biscuit', 'pancake', 'yoghurt', 'yogurt', 'porridge',
    'sausage', 'dumpling', 'popcorn', 'pudding', 'cabbage', 'pumpkin',
    'mushroom', 'coconut', 'pineapple', 'watermelon', 'stomach',
    'avocado', 'broccoli', 'cauliflower', 'cucumber', 'lettuce', 'spinach',
    'asparagus', 'blueberry', 'raspberry', 'blackberry', 'grapefruit',
    'mandarin', 'mango', 'papaya', 'apricot', 'cereal', 'omelette',
    'dessert', 'beverage', 'lemonade', 'smoothie', 'barbecue', 'buffet',
    'recipe', 'flavour', 'vitamin'
  ],
  body: [
    'body', 'head', 'face', 'eye', 'nose', 'mouth', 'tooth', 'tongue',
    'shoulder', 'finger', 'stomach', 'heart', 'brain', 'bone', 'skin',
    'hair', 'doctor', 'dentist', 'nurse', 'hospital', 'medicine', 'healthy',
    'illness', 'fever', 'headache', 'exercise', 'sleep', 'tired', 'hungry',
    'thirsty', 'sneeze', 'cough', 'wound', 'injure', 'patient', 'health',
    'muscle', 'elbow', 'knee', 'ankle', 'finger', 'toothache', 'earache',
    'symptom', 'treatment', 'recover', 'forehead', 'eyebrow', 'eyelash',
    'intestine', 'kidney', 'liver', 'skeleton', 'breathing', 'digestion',
    'allergy', 'disease', 'infection', 'injury', 'bandage', 'surgery',
    'vaccine', 'vitamin', 'protein', 'calorie', 'posture', 'fitness',
    'hygiene', 'backache', 'stomachache', 'toothache', 'earache'
  ],
  family: [
    'family', 'mother', 'father', 'parent', 'brother', 'sister', 'grandpa',
    'grandma', 'uncle', 'aunt', 'cousin', 'baby', 'child', 'children',
    'friend', 'neighbour', 'neighbor', 'wedding', 'married', 'husband',
    'wife', 'daughter', 'people', 'person', 'love', 'hug', 'kiss',
    'relative', 'twin', 'boy', 'girl', 'woman', 'husband', 'granny',
    'grandparent', 'housewife', 'friendship', 'friendly', 'polite',
    'grandfather', 'grandmother', 'grandchildren', 'boyfriend', 'girlfriend',
    'marriage', 'parenting', 'childhood', 'sibling', 'toddler', 'teenager',
    'adolescent', 'generation', 'ancestor', 'descendant', 'guardian',
    'orphan', 'nephew', 'niece', 'relationship', 'neighbourhood',
    'community', 'household', 'couple', 'engaged', 'divorce', 'adoption'
  ],
  school: [
    'school', 'student', 'teacher', 'classroom', 'lesson', 'study',
    'learn', 'reading', 'writing', 'spelling', 'English', 'Chinese',
    'maths', 'science', 'history', 'geography', 'library', 'pencil',
    'ruler', 'eraser', 'notebook', 'paper', 'dictionary', 'homework',
    'exam', 'question', 'answer', 'university', 'college', 'knowledge',
    'education', 'subject', 'course', 'language', 'sentence', 'word',
    'story', 'poem', 'drawing', 'painting', 'project', 'presentation',
    'timetable', 'uniform', 'classmate', 'teacher'
  ],
  home: [
    'house', 'home', 'bedroom', 'bathroom', 'kitchen', 'window', 'door',
    'table', 'chair', 'sofa', 'mirror', 'lamp', 'clock', 'towel',
    'soap', 'toothbrush', 'blanket', 'pillow', 'clothes', 'jacket',
    'trousers', 'sweater', 'shoes', 'boots', 'garden', 'clean', 'tidy',
    'wash', 'cook', 'bedroom', 'cupboard', 'curtain', 'carpet', 'shelf',
    'furniture', 'apartment', 'living', 'dining', 'kitchen', 'laundry',
    'rubbish', 'sweeping', 'dustbin', 'balcony', 'basement', 'ceiling',
    'wardrobe', 'drawer', 'cushion', 'armchair', 'bookshelf', 'television',
    'refrigerator', 'microwave', 'vacuum', 'mopping', 'cleaning', 'cooking',
    'laundry', 'decoration', 'comfortable'
  ],
  city: [
    'city', 'street', 'road', 'bridge', 'building', 'station', 'airport',
    'hospital', 'library', 'museum', 'market', 'supermarket', 'restaurant',
    'hotel', 'bank', 'office', 'factory', 'police', 'driver', 'farmer',
    'engineer', 'scientist', 'waiter', 'chef', 'worker', 'manager',
    'travel', 'ticket', 'bicycle', 'traffic', 'journey', 'station',
    'postman', 'fireman', 'builder', 'painter', 'reporter', 'actor',
    'singer', 'dancer', 'writer', 'lawyer', 'business', 'company'
  ],
  sport: [
    'sport', 'football', 'basketball', 'baseball', 'tennis', 'badminton',
    'volleyball', 'swimming', 'running', 'jumping', 'dancing', 'singing',
    'music', 'guitar', 'piano', 'violin', 'picture', 'painting', 'movie',
    'cinema', 'game', 'player', 'team', 'match', 'winner', 'holiday',
    'picnic', 'park', 'fishing', 'skating', 'skiing', 'chess', 'hockey',
    'cycling', 'jogging', 'camping', 'hiking', 'ticket', 'stadium',
    'gymnasium', 'exercise', 'practice', 'competition', 'champion'
  ],
  emotion: [
    'happy', 'unhappy', 'angry', 'afraid', 'scared', 'worried', 'nervous',
    'excited', 'surprised', 'tired', 'bored', 'lonely', 'proud', 'shy',
    'brave', 'kind', 'friendly', 'honest', 'patient', 'clever', 'lazy',
    'funny', 'interesting', 'beautiful', 'lovely', 'wonderful', 'terrible',
    'feeling', 'laugh', 'smile', 'cry', 'shout', 'happiness', 'sadness',
    'anger', 'fear', 'worry', 'excitement', 'surprise', 'proud', 'jealous',
    'helpful', 'careful', 'careless', 'confident', 'cheerful', 'upset'
  ],
  time: [
    'morning', 'evening', 'afternoon', 'tonight', 'yesterday', 'tomorrow',
    'today', 'weekday', 'weekend', 'season', 'summer', 'winter', 'autumn',
    'birthday', 'holiday', 'festival', 'minute', 'hour', 'second',
    'century', 'number', 'hundred', 'thousand', 'million', 'quarter',
    'early', 'late', 'always', 'often', 'sometimes', 'never', 'usually',
    'month', 'week', 'year', 'today', 'tomorrow', 'yesterday', 'daily',
    'weekly', 'monthly', 'yearly', 'midnight', 'noon', 'sunrise', 'sunset'
  ],
  action: [
    'answer', 'arrive', 'borrow', 'bring', 'build', 'carry', 'change',
    'choose', 'climb', 'collect', 'compare', 'cook', 'count', 'cover',
    'decide', 'describe', 'discover', 'discuss', 'draw', 'dream',
    'drink', 'drive', 'explain', 'follow', 'forget', 'gather', 'happen',
    'help', 'hurry', 'invite', 'listen', 'move', 'open', 'paint',
    'practise', 'prepare', 'promise', 'protect', 'pull', 'push',
    'remember', 'repair', 'repeat', 'ride', 'save', 'share', 'shout',
    'travel', 'visit', 'wait', 'watch', 'worry', 'wake', 'cook',
    'clean', 'wash', 'study', 'learn', 'teach', 'write', 'read'
  ],
  describe: [
    'beautiful', 'careful', 'careless', 'clever', 'comfortable',
    'dangerous', 'delicious', 'different', 'difficult', 'easy', 'exciting',
    'famous', 'friendly', 'funny', 'healthy', 'heavy', 'helpful',
    'important', 'interesting', 'kind', 'large', 'lucky', 'modern',
    'noisy', 'polite', 'popular', 'quick', 'quiet', 'ready', 'safe',
    'serious', 'simple', 'slow', 'special', 'strong', 'terrible',
    'tidy', 'tired', 'useful', 'warm', 'weak', 'wide', 'wonderful',
    'young', 'bright', 'busy', 'clean', 'dirty', 'empty', 'full',
    'amazing', 'awful', 'brave', 'cheerful', 'colourful', 'confident',
    'convenient', 'creative', 'crowded', 'curious', 'expensive', 'generous',
    'gentle', 'gorgeous', 'happy', 'honest', 'horrible', 'huge', 'hungry',
    'jealous', 'narrow', 'nervous', 'powerful', 'pretty', 'rapid',
    'reasonable', 'relaxed', 'sleepy', 'strange', 'stupid', 'tasty',
    'thirsty', 'valuable', 'wealthy'
  ]
};

const THEME_LABELS = {
  nature: '動物自然',
  food: '食物飲品',
  body: '身體健康',
  family: '家庭朋友',
  school: '學校學習',
  home: '家居日常',
  city: '城市工作',
  sport: '運動遊戲',
  emotion: '情緒性格',
  time: '時間數量',
  action: '動作變化',
  describe: '描述比較',
  core: '核心詞彙'
};

/* 不適合兒童詞庫的詞 */
const BLOCK_WORDS = new Set(`
abortion abuse addict alcohol army battle bomb cancer communist crime criminal
death dead drug election economy economic financial finance government gun holy
hospital injury jail kill lawyer legal military minister ministry murder
parliament politic politics politician porn pregnant prison religion religious
rifle sex sexual soldier suicide terror violence war weapon wound god jesus
christ devil satan
`.trim().split(/\s+/));

/* 功能詞與過於抽象的高頻詞 */
const STOP_WORDS = new Set(`
the and for that you with have this from they will what would there their them
then than when where which who whom whose why how all any both each few more most
other some such only own same very just because before after again further once
here much many every about above below over under between through during without
within another however really always never often sometimes people person thing
things something anything nothing everything someone anyone everyone somebody
anybody nobody also even rather maybe enough else along away ever ago perhaps
probably actually finally usually already almost quite too still yet twice
forward backward therefore moreover otherwise instead whatever whenever wherever
whoever whether although though unless since until upon into onto toward towards
against across behind below beside beyond inside outside among around during
`.trim().split(/\s+/));

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readEcdict() {
  const text = fs.readFileSync(path.join(CACHE, 'ecdict.csv'), 'utf8');
  const rows = parseCSV(text);
  const header = rows.shift();
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const out = [];
  for (const row of rows) {
    const word = row[index.word];
    if (!/^[a-z]{3,14}$/.test(word)) continue;
    if (BLOCK_WORDS.has(word) || STOP_WORDS.has(word)) continue;
    const translation = row[index.translation] || '';
    const definition = row[index.definition] || '';
    if (!translation.trim()) continue;
    const pos = parsePos(translation);
    if (!pos.code) continue;
    const collins = Number(row[index.collins] || 0);
    const oxford = row[index.oxford] === '1';
    const tags = String(row[index.tag] || '').split(/\s+/);
    if (!(oxford || collins >= 1 || tags.includes('zk') || tags.includes('gk'))) continue;
    const syllables = splitWord(word);
    if (!syllables || syllables.length < 2 || syllables.length > 4) continue;
    if (syllables.join('').toLowerCase() !== word) continue;
    if (syllables.some((piece) => piece.length > 8 || !hasVowel(piece))) continue;
    const rank = Math.min(
      ...[row[index.frq], row[index.bnc]].map((value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : 1e9;
      })
    );
    if (rank > 9000) continue;
    out.push({
      word,
      syllables,
      rank,
      pos,
      translation,
      definition,
      phonetic: row[index.phonetic] || '',
      exchange: row[index.exchange] || '',
      collins,
      oxford
    });
  }
  out.sort((a, b) => a.rank - b.rank || a.word.localeCompare(b.word));
  return out;
}

function selectWords(pool) {
  const byWord = new Map(pool.map((entry) => [entry.word, entry]));
  const picked = new Map();
  const themeCounts = {};
  const themeQuota = {
    nature: 55, food: 55, body: 50, family: 45, school: 60, home: 50,
    city: 55, sport: 50, emotion: 50, time: 50, action: 60, describe: 60
  };

  for (const [theme, seeds] of Object.entries(THEME_SEEDS)) {
    const quota = themeQuota[theme] || 40;
    let count = 0;
    for (const seed of seeds) {
      if (count >= quota) break;
      const entry = byWord.get(seed.toLowerCase());
      if (!entry || picked.has(entry.word)) continue;
      picked.set(entry.word, { ...entry, theme });
      count++;
    }
    themeCounts[theme] = count;
  }

  for (const entry of pool) {
    if (picked.size >= 2000) break;
    if (picked.has(entry.word)) continue;
    if (entry.rank > 6500) continue;
    picked.set(entry.word, { ...entry, theme: 'core' });
  }

  if (picked.size < 2000) {
    for (const entry of pool) {
      if (picked.size >= 2000) break;
      if (picked.has(entry.word)) continue;
      picked.set(entry.word, { ...entry, theme: 'core' });
    }
  }

  const selected = [...picked.values()].slice(0, 2000);
  const difficulty = (entry) => (
    Math.log10(entry.rank + 10) * 1.2 +
    (entry.syllables.length - 2) * 0.85 +
    Math.max(0, entry.word.length - 5) * 0.06
  );
  const byDifficulty = selected.slice().sort((a, b) => difficulty(a) - difficulty(b));
  const levelOne = new Set(byDifficulty.slice(0, 700).map((entry) => entry.word));
  const levelTwo = new Set(byDifficulty.slice(700, 1400).map((entry) => entry.word));

  return selected.map((entry) => ({
    ...entry,
    level: levelOne.has(entry.word) ? 1 : levelTwo.has(entry.word) ? 2 : 3
  })).map((entry, index) => ({ ...entry, order: index + 1 }));
}

/* ---------- Tatoeba 例句 ---------- */
function formsFor(entry) {
  const forms = new Set([entry.word]);
  for (const part of entry.exchange.split('/')) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const key = part.slice(0, at);
    if (!['s', 'p', 'd', 'i', '3', 'r', 't'].includes(key)) continue;
    const value = part.slice(at + 1).trim().toLowerCase();
    if (/^[a-z]{3,}$/.test(value)) forms.add(value);
  }
  return [...forms];
}

function loadTatoeba() {
  const links = new Map();
  const cmn = new Map();
  const linkLines = fs.readFileSync(path.join(CACHE, 'cmn-eng_links.tsv'), 'utf8').split('\n');
  for (const line of linkLines) {
    if (!line) continue;
    const [cmnId, engId] = line.split('\t');
    if (!cmnId || !engId) continue;
    const list = links.get(engId);
    if (list) list.push(cmnId);
    else links.set(engId, [cmnId]);
  }
  const cmnLines = fs.readFileSync(path.join(CACHE, 'cmn_sentences.tsv'), 'utf8').split('\n');
  for (const line of cmnLines) {
    if (!line) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    cmn.set(parts[0], parts.slice(2).join('\t'));
  }
  return { links, cmn };
}

async function collectExamples(entries, toTraditional) {
  const forms = new Map();
  for (const entry of entries) {
    for (const form of formsFor(entry)) {
      if (!forms.has(form)) forms.set(form, new Set());
      forms.get(form).add(entry.word);
    }
  }

  const { links, cmn } = loadTatoeba();
  const best = new Map();
  const bad = /\b(kill|killed|murder|rape|sex|fuck|shit|drug|gun|bomb|war|dead|death|blood|naked|nude|damn|hell|ass|bitch|slave|alcohol|beer|wine|smoke|cigarette|gamble|god|jesus|christ|devil|satan|porn|religion|politic|government|election|president|kill|weapon|prison|jail|abortion)\b/i;
  const names = /\b(Tom|Mary|John|Jack|Jane|Peter|Paul|Susan|Mike|Anna|Bob|Alice|Betty|George|Martha|Donald|Jimmy|Jim|Nancy|Steve|David|Robert|Linda|Karen|Chris|Mom|Dad)\b/;

  const stream = readline.createInterface({
    input: fs.createReadStream(path.join(CACHE, 'eng_sentences.tsv')),
    crlfDelay: Infinity
  });

  for await (const line of stream) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const id = parts[0];
    const text = parts.slice(2).join('\t');
    if (!/^[\x20-\x7E]+$/.test(text)) continue;
    if (!/[.!?]$/.test(text)) continue;
    if (text.length < 8 || text.length > 90) continue;
    if (bad.test(text)) continue;
    const tokens = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    if (tokens.length < 4 || tokens.length > 11) continue;
    const hits = new Set();
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (forms.has(lower)) hits.add(lower);
    }
    if (!hits.size) continue;
    let zh = '';
    for (const cmnId of links.get(id) || []) {
      const translation = cmn.get(cmnId);
      if (!translation) continue;
      if (translation.length > 48) continue;
      if (bad.test(translation)) continue;
      if (!zh || translation.length < zh.length) zh = translation;
    }
    const targetInText = text.match(new RegExp('\\b(' + [...hits].join('|') + ')\\b', 'i'));
    const before = targetInText
      ? text.slice(0, targetInText.index).trim().split(/\s+/).slice(-2).join(' ').toLowerCase()
      : '';
    const determiner = /(^|\s)(a|an|the|my|your|his|her|our|their|this|that|these|those)$/.test(before);
    const starters = new Set(['I', 'The', 'This', 'That', 'These', 'Those', 'My', 'Our', 'Your', 'His', 'Her', 'Their', 'We', 'You', 'He', 'She', 'It', 'They', 'A', 'An', 'There', 'Here', 'Today', 'Tomorrow', 'Yesterday', 'What', 'Where', 'When', 'Why', 'How', 'Do', 'Does', 'Did', 'Can', 'Could', 'Would', 'Should', 'Is', 'Are', 'Was', 'Were', 'Let', 'Please', 'Look', 'Come', 'Go', 'Some', 'Many', 'Most', 'All', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'No', 'Not', 'Never', 'Always', 'Sometimes', 'Usually', 'English', 'Chinese']);
    let capitalPenalty = 0;
    tokens.forEach((token, index) => {
      if (index === 0) {
        if (!starters.has(token) && token !== 'I') capitalPenalty += 300;
        return;
      }
      if (token === 'I') return;
      if (/^[A-Z][a-z]/.test(token)) capitalPenalty += 300;
    });
    const baseScore =
      (zh ? 0 : 1000) +
      Math.abs(text.length - 34) * 0.7 +
      capitalPenalty +
      (/[?!]/.test(text) ? 80 : 0) +
      (/[";:()]/.test(text) ? 40 : 0) +
      (determiner ? -60 : 0) +
      (/(raw|thigh|grave|die|dead|hate|drunk|stupid|idiot|ugly|fat|boyfriend|girlfriend|kiss|fight|blood|gun|war|prison|hell|damn)\b/i.test(text) ? 260 : 0) +
      (/^(I am|I was) a(n)? \w+/i.test(text) ? 220 : 0) +
      (/\b(My brothers|My sisters|My friends) are\b/i.test(text) ? 160 : 0);
    for (const hit of hits) {
      for (const word of forms.get(hit)) {
        const score = baseScore + (hit === word ? -25 : 55);
        const current = best.get(word);
        if (!current || score < current.score) {
          best.set(word, { text, zh, score, match: hit, id });
        }
      }
    }
  }
  for (const entry of entries) {
    const example = best.get(entry.word);
    if (!example) continue;
    entry.example = {
      en: example.text,
      zh: toTraditional(example.zh),
      match: example.match,
      source: 'Tatoeba #' + example.id
    };
  }
}

/* ---------- 主流程 ---------- */
async function main() {
  const toTraditional = loadOpenCC();
  const pool = readEcdict();
  const selected = selectWords(pool);
  await collectExamples(selected, toTraditional);

  for (const entry of selected) {
    const fix = WORD_FIXES[entry.word];
    if (fix && fix.example) {
      entry.example = {
        en: fix.example.en,
        zh: fix.example.zh,
        match: entry.word,
        source: 'custom'
      };
    }
  }

  const words = selected.map((entry) => {
    const fix = WORD_FIXES[entry.word] || {};
    const usagePos = detectUsagePos(entry.example, entry.word);
    const meaning = fix.meaning
      ? { text: fix.meaning, pos: { code: fix.pos || (entry.pos && entry.pos.code) || '', label: POS_LABELS[fix.pos] || (entry.pos && entry.pos.label) || '' } }
      : buildMeaning(entry.translation, entry.definition, toTraditional, usagePos);
    const posCode = meaning.pos.code || entry.pos.code;
    return {
      id: entry.word,
      word: entry.word,
      syllables: entry.syllables,
      ipa: cleanIpa(entry.phonetic),
      pos: posCode,
      posLabel: POS_LABELS[posCode] || meaning.pos.label || entry.pos.label,
      meaning: meaning.text,
      definition: cleanDefinition(entry.definition),
      forms: parseForms(entry.exchange),
      level: entry.level,
      theme: entry.theme,
      themeLabel: THEME_LABELS[entry.theme] || THEME_LABELS.core,
      order: entry.order,
      example: entry.example || null
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    total: words.length,
    levels: words.reduce((acc, word) => {
      acc[word.level] = (acc[word.level] || 0) + 1;
      return acc;
    }, {}),
    themes: words.reduce((acc, word) => {
      acc[word.theme] = (acc[word.theme] || 0) + 1;
      return acc;
    }, {}),
    syllables: words.reduce((acc, word) => {
      acc[word.syllables.length] = (acc[word.syllables.length] || 0) + 1;
      return acc;
    }, {}),
    examples: words.filter((word) => word.example).length,
    translations: words.filter((word) => word.example && word.example.zh).length,
    missingExamples: words.filter((word) => !word.example).map((word) => word.word)
  };

  let version = 1;
  try {
    const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    version = (Number(previous.version) || 1) + 1;
  } catch (error) {
    version = 1;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ version, generatedAt: report.generatedAt, words }, null, 2) + '\n');
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
