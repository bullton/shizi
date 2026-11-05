const path = require('path');
const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { resolveUserIds } = require('../core/delegation');

function createShiziTool({ rootDir, toolDir, db, saveData: storeSave, dataExists, auth }) {
  const saveData = () => storeSave();
  const requireAuth = (req) => auth.requireAuth(req);
  const hashPassword = auth.hashPassword;
  const verifyPassword = auth.verifyPassword;
  const sessions = auth.sessions;

  // Load ChaiziDictUnique (new dict: each char has exactly 1 decomp)
  // + ChaiziAtomic (拆開只剩筆畫嘅字，唔會出現喺練習字庫／布置任務)
  const libDir = path.join(toolDir, 'lib');
  globalThis.window = globalThis;
  require(path.join(libDir, 'chaizi-unique.js'));
  require(path.join(libDir, 'chaizi-atomic.js'));
  require(path.join(libDir, 'chaizi-ids.js'));
  const ChaiziDictUnique = globalThis.ChaiziDictUnique;  // 每字唯一拆法（權威，唔用 chaizi-data.js）
  const ChaiziAtomic = new Set(globalThis.ChaiziAtomic || []);  // 原子字庫
  const ChaiziIds = globalThis.ChaiziIds || {};  // Unicode IDS 結構表
  const idsLib = require(path.join(libDir, 'ids.js'));
  const idsMap = idsLib.loadIdsMap(path.join(rootDir, 'scripts', 'dict', 'ids.txt'));

// 用 IDS 樹逐層深拆，搵出同目標部件數吻合嘅一層 → 有位置
function positionsForCount(char, count) {
  for (let level = 0; level <= 8; level++) {
    const r = idsLib.deepSplit(char, idsMap, level);
    if (!r) break;
    if (r.components.length === count && !r.hasPlaceholder) return r.positions;
    if (r.components.length > count) break;
  }
  return null;
}

// 常用部件（同 app.js 的 LEFT_RADICALS 保持一致）——呢啲唔會當「生僻」展開
const COMMON_PARTS = new Set((
  '木 扌 氵 亻 讠 钅 口 女 言 金 心 火 山 足 目 馬 禾 車 魚 米 手 肉 玉 犬 ' +
  '巾 貝 舟 止 片 牛 弓 方 絲 衣 毛 鬼 鬥 舌 土 石 人 虫 尸 戶 支 少 父 井 ' +
  '甘 戈 斤 元 冫 爻 豸 豕 攸 爿 卩 斥 免 兌 匕 隹 日 白 甫 疋 無 ' +
  '蟲 阜 食 酉 革 彳 骨 歹 耳 鹿 角 耒 羽 風 身 冰 示 齒 黑 鳥 走 髟 病 ' +
  '缶 矢 皮 巳 辛 甾 鹵 鬲 彡 田 羊 音 其 豆 豈 束 者 奇 良 咅 是 咢 共 ' +
  '弗 耑 臣 奚 黹 曾 堯 巫 真 肖 尗 兔'
).split(/\s+/).filter(Boolean));

// 基本筆畫（用於提示「拆得太細」）
const STROKE_SET = new Set('一 丨 丿 丶 乀 乁 乚 乛 亅 乙 ㇆ ㇉ 丩 𠄌 𠃊 ㇀ ㇁ ㇂ ㇃ ㇄ ㇅ ㇇ ㇈ ㇊ ㇋ ㇌ ㇍ ㇎ ㇏'.split(' '));

// 部件係唔係「仲可以再拆」（有字典拆法、而且唔係筆畫/常用部件）
function isCompoundPart(part) {
  if (ChaiziAtomic.has(part)) return false;
  if (COMMON_PARTS.has(part)) return false;
  const d = ChaiziDictUnique?.[part];
  return Array.isArray(d) && d.length >= 2;
}

// 用 Unicode IDS 判斷結構（免費、離線、準確）；冇 IDS 就回退去規則
function idsLayoutFor(char, components) {
  const layout = ChaiziIds[char];
  if (!layout) return null;
  const dictComps = ChaiziDictUnique?.[char];
  if (Array.isArray(dictComps) && Array.isArray(components) &&
      dictComps.length !== components.length) return null;
  return layout;
}

// 原子字：拆開只剩筆畫，冇練習價值
function isAtomicChar(char) {
  return ChaiziAtomic.has(char);
}

// 查字典（使用新字典：每字唯一）
function longestDecomp(char) {
  const entry = ChaiziDictUnique?.[char];
  if (!entry) return [];
  return Array.isArray(entry) ? [...entry] : entry.split(' ');
}

const DEFAULT_CHARS = [
  { id: 1,  char: '回', layout: 'surround',          hint: '一個囗包住口，叫做「回」（回來）' },
  { id: 2,  char: '困', layout: 'surround',          hint: '囗包住「木」，就係「困」喺圍欄裏面' },
  { id: 3,  char: '因', layout: 'surround',          hint: '方框（囗）內有「大」，就係「因」' },
  { id: 4,  char: '國', layout: 'surround',          hint: '方框（囗）內有「或」，就係「國家」' },
  { id: 5,  char: '固', layout: 'surround',          hint: '方框內有「古」，就係「固」定不變' },
  { id: 6,  char: '這', layout: 'half-surround-left', hint: '「辶」包住左邊，「言」在右邊，叫做「這」個' },
  { id: 7,  char: '進', layout: 'half-surround-left', hint: '「辶」包左，「隹」在右，叫做「進」步' },
  { id: 8,  char: '邊', layout: 'half-surround-left', hint: '「辶」包住左邊，「臱」在右邊，叫做「旁邊」' },
  { id: 9,  char: '森', layout: 'top-bottom-bottom', hint: '三棵樹，就係「森林」' },
  { id: 10, char: '晶', layout: 'top-bottom-bottom', hint: '三個日頭一齊，就係「晶」亮' },
  { id: 11, char: '靈', layout: 'top-bottom',         hint: '「霝」上有「巫」下，就係「靈」驗' },
  { id: 12, char: '響', layout: 'top-bottom',         hint: '「鄉」上有「音」下，就係「響」' },
  { id: 13, char: '寶', layout: 'top-2-bottom',       hint: '屋頂「宀」+中間「玉」左「缶」右+底下「貝」，就係「寶」物' },
  { id: 14, char: '鼻', layout: 'vertical-3',         hint: '「自」+「田」+「廾」三件上下疊，就係「鼻」' },
  { id: 15, char: '攀', layout: 'stack',              hint: '「林」「爻」「大」「手」上下疊，就係「攀」' },
].map(c => ({ ...c, components: longestDecomp(c.char) })).filter(c => c.components.length > 0);

// ===== 數據初始化 =====
db.users = db.users || [];
db.progress = db.progress || [];
db.attempts = db.attempts || [];
db.chars = db.chars || [];
db.assignments = db.assignments || [];
db.config = db.config || { aiToken: '' };

// 資料完整性檢查：用戶 id 撞會令兩個帳號共用進度，即刻修正
(async () => {
  let fixed = 0;
  const seen = new Set();
  for (const u of db.users) {
    if (seen.has(u.id)) {
      u.id = generateId(new Set(db.users.map(x => x.id)));
      fixed++;
      console.warn(`[shizi] 修正重複用戶 id: ${u.username} -> ${u.id}`);
    }
    seen.add(u.id);
  }
  if (fixed > 0) {
    await saveData();
    console.log(`[shizi] 已修正 ${fixed} 個重複用戶 id`);
  }
})();

// 首次運行自動 seed DEFAULT_CHARS（僅當數據文件不存在時）
// 如果數據文件存在但 chars 為空，說明是被手動清空，不自動補充（避免誤刪自定義數據）
(async () => {
  if (!dataExists && DEFAULT_CHARS.length > 0) {
    const now = new Date().toISOString();
    db.chars = DEFAULT_CHARS.map(c => ({ ...c, createdAt: now }));
    await saveData();
    console.log(`[shizi] 已自動 seed ${db.chars.length} 個預設字到 server`);
  }
})();

// ===== 平台排名用統計 =====
const SHIZI_HK_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
function shiziDay(value) {
  return SHIZI_HK_DATE.format(value ? new Date(value) : new Date());
}

function shiziRanks() {
  const stats = db.users.map(user => ({
    userId: user.id,
    username: user.username,
    nickname: user.nickname || user.username,
    avatar: user.avatar || null,
    charsKnown: 0,
    totalAttempts: 0,
    avgTimeSum: 0,
    attemptCount: 0,
    correctAttempts: 0,
    timedAttempts: 0,
    totalResponseTime: 0,
    recent7: 0
  }));
  const byId = new Map(stats.map(row => [String(row.userId), row]));
  db.progress.forEach(progress => {
    const row = byId.get(String(progress.userId));
    if (!row) return;
    row.charsKnown += 1;
    row.totalAttempts += progress.attempts || 0;
    row.avgTimeSum += progress.avgTime || 0;
  });
  const days = new Set();
  for (let i = 0; i < 7; i++) days.add(shiziDay(Date.now() - i * 24 * 60 * 60 * 1000));
  db.attempts.forEach(attempt => {
    const row = byId.get(String(attempt.userId));
    if (!row) return;
    row.attemptCount += 1;
    if (attempt.correct) row.correctAttempts += 1;
    const responseTime = Number(attempt.responseTime);
    if (Number.isFinite(responseTime) && responseTime > 0) {
      row.timedAttempts += 1;
      row.totalResponseTime += responseTime;
    }
    if (attempt.practicedAt && days.has(shiziDay(attempt.practicedAt))) row.recent7 += 1;
  });
  return stats
    .map(row => {
      const attempts = row.totalAttempts || row.attemptCount;
      const fallbackTime = row.charsKnown > 0 ? row.avgTimeSum / row.charsKnown : 0;
      return {
        userId: row.userId,
        username: row.username,
        nickname: row.nickname,
        avatar: row.avatar,
        charsKnown: row.charsKnown,
        score: row.charsKnown,
        attempts,
        accuracy: row.attemptCount > 0
          ? Math.round((row.correctAttempts / row.attemptCount) * 1000) / 10
          : 0,
        avgTime: row.timedAttempts > 0 ? row.totalResponseTime / row.timedAttempts : fallbackTime,
        recent7: row.recent7
      };
    })
    .sort((a, b) =>
      b.charsKnown - a.charsKnown ||
      b.accuracy - a.accuracy ||
      (a.avgTime || Infinity) - (b.avgTime || Infinity) ||
      b.attempts - a.attempts ||
      String(a.username).localeCompare(String(b.username))
    );
}


// ===== AI 呼叫防護（只限手動單字，嚴禁批量）=====
const AI_COOLDOWN_MS = 8000;
let aiLastCallAt = 0;
function aiGuard() {
  const now = Date.now();
  if (now - aiLastCallAt < AI_COOLDOWN_MS) {
    return { ok: false, error: `請等 ${Math.ceil((AI_COOLDOWN_MS - (now - aiLastCallAt)) / 1000)} 秒後再試（AI 唔可以連續調用）` };
  }
  aiLastCallAt = now;
  return { ok: true };
}

// ===== 任務輔助 =====
function decorateAssignment(a, chars) {
  const done = a.done || {};
  const total = (a.charIds || []).length;
  const completedCount = (a.charIds || []).filter(id => done[String(id)]).length;
  const completedCharIds = (a.charIds || [])
    .filter(id => done[String(id)])
    .map(id => chars.find(c => c.id === id)?.char)
    .filter(Boolean);
  // 逐字詳情（管理員用：睇到每個字做咗幾多次、答啱幾多次）
  const charDetails = (a.charIds || []).map(id => {
    const c = chars.find(x => x.id === id);
    const rec = done[String(id)];
    return {
      charId: id,
      char: c ? c.char : '?',
      components: c ? (c.components || []) : [],
      done: !!rec,
      attempts: rec ? (rec.attempts || 0) : 0,
      correctCount: rec ? (rec.correctCount || 0) : 0,
      lastAt: rec ? (rec.lastAt || null) : null
    };
  });
  return {
    id: a.id,
    groupId: a.groupId || a.id,
    userId: a.userId,
    scope: a.scope || 'selected',
    name: a.name,
    note: a.note || '',
    charIds: a.charIds || [],
    words: a.words || [],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt || null,
    total,
    completedCount,
    remainingCount: total - completedCount,
    completedCharIds,
    charDetails,
    attemptsTotal: charDetails.reduce((s, d) => s + d.attempts, 0),
    correctTotal: charDetails.reduce((s, d) => s + d.correctCount, 0),
    allDone: total > 0 && completedCount >= total,
    lastPracticed: Object.values(done)
      .map(d => d.lastAt)
      .filter(Boolean)
      .sort()
      .pop() || null
  };
}

// ===== 詞語輔助 =====
function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const seen = new Set();
  const out = [];
  for (const w of words) {
    const t = typeof w === 'string' ? w.trim() : '';
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// ===== 部件位置 → 結構 =====
// AI 只負責講部件位置（top/bottom/left/right/...），由代碼推導 layout。
// 咁樣可以避免 AI 套用「言字旁一定喺左」呢類先驗而判錯。
const TOP_POS = new Set(['top', 'top-left', 'top-right']);
const BOTTOM_POS = new Set(['bottom', 'bottom-left', 'bottom-right']);
const LEFT_POS = new Set(['left', 'top-left', 'bottom-left']);
const RIGHT_POS = new Set(['right', 'top-right', 'bottom-right']);

function layoutFromParts(parts, components) {
  const n = parts.length;
  if (n < 2) return 'top-bottom';

  // 包圍類部件
  const first = components[0];
  if (['囗', '冖', '冂', '凵', '⺆', '門'].includes(first)) {
    return n === 2 ? 'surround' : 'surround-3';
  }
  if (first === '辶' || first === '辵') {
    if (n === 2) return 'half-surround-left';
    if (n === 3) return 'complex-3-left';
    if (n >= 4) return 'complex-4-left';
  }

  const tops = parts.filter(p => p === 'top').length;
  const bottoms = parts.filter(p => p === 'bottom').length;
  const lefts = parts.filter(p => p === 'left').length;
  const rights = parts.filter(p => p === 'right').length;
  const bl = parts.filter(p => p === 'bottom-left').length;
  const br = parts.filter(p => p === 'bottom-right').length;
  const tl = parts.filter(p => p === 'top-left').length;
  const tr = parts.filter(p => p === 'top-right').length;
  const centers = parts.filter(p => p === 'center').length;

  // 2 部件
  if (n === 2) {
    const [a, b] = parts;
    const horizontal = (LEFT_POS.has(a) && RIGHT_POS.has(b)) ||
                       (LEFT_POS.has(b) && RIGHT_POS.has(a));
    const vertical = (TOP_POS.has(a) && BOTTOM_POS.has(b)) ||
                     (TOP_POS.has(b) && BOTTOM_POS.has(a));
    if (horizontal && !vertical) return 'left-right';
    if (vertical && !horizontal) return 'top-bottom';
    // 斜角：左上+右下 → 視為左右；右上+左下 → 同樣
    if (tl || tr) return 'left-right';
    return 'top-bottom';
  }

  // 3 部件
  if (n === 3) {
    // 上中下
    if (tops === 1 && bottoms === 2) return 'top-2-bottom';
    // 左 + 上下右（complex-3-left）
    if (lefts === 1 && (tops === 1 || bottoms === 1) &&
        !parts.includes('top-left') && !parts.includes('bottom-left')) return 'complex-3-left';
    // 左 + 右 + 右（left-right-right）
    if (lefts === 1 && rights === 2) return 'left-right-right';
    // 左 + 中 + 下 → 左邊一個，右邊上下（left-right-right）
    if (lefts === 1 && centers === 1 && bottoms === 1) return 'left-right-right';
    // 上 + 左右（bottom-left / bottom-right）
    if (tops === 1 && bl === 1 && br === 1) return 'top-bottom-bottom';  // 品字
    if (tops === 1 && (bl === 1 || br === 1)) return 'top-2-bottom';
    // 上 + 下 + 中
    if (tops === 1 && bottoms === 1) return 'vertical-3';
    // 品字：上 1 + 下 2 並排
    if (bl === 1 && br === 1) return 'top-bottom-bottom';
    // 左上 + 左下 + 右 → 左右右
    if (tl === 1 && bl === 1 && rights === 1) return 'left-right-right';
    return 'vertical-3';
  }

  // 4 部件
  if (n === 4) {
    if (tops === 1 && (bl === 1 || br === 1)) return 'top-2-bottom';
    if (tops === 1 && bottoms === 1) return 'top-bottom-bottom';
    if (lefts === 1 && rights === 1) return 'complex-4-left';
    if (bl === 2 && br === 2) return 'top-bottom-bottom-bottom';
    return 'stack';
  }

  return 'stack';
}

// 由部件位置推算每個部件嘅歸一化座標（0-1）
function positionsFromParts(parts) {
  const box = {
    'top': { x: 0.30, y: 0.04, w: 0.40, h: 0.30 },
    'bottom': { x: 0.30, y: 0.66, w: 0.40, h: 0.30 },
    'left': { x: 0.04, y: 0.22, w: 0.26, h: 0.60 },
    'right': { x: 0.68, y: 0.22, w: 0.28, h: 0.60 },
    'top-left': { x: 0.06, y: 0.08, w: 0.34, h: 0.40 },
    'top-right': { x: 0.60, y: 0.08, w: 0.34, h: 0.40 },
    'bottom-left': { x: 0.06, y: 0.54, w: 0.42, h: 0.40 },
    'bottom-right': { x: 0.52, y: 0.54, w: 0.42, h: 0.40 },
    'center': { x: 0.34, y: 0.34, w: 0.32, h: 0.32 }
  };
  return parts.map(p => {
    const b = box[p] || box.center;
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  });
}

// ===== API Routes =====
async function handleAPI(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ===== 全域登入閘門（platform / auth 已喺 index 處理）=====
  const authUser = requireAuth(req);
  if (!authUser) return jsonResponse(res, 401, { error: '請先登入' });

  if (pathname === '/api/profile' && method === 'PUT') {
    const user = requireAuth(req, res);
    if (!user) return jsonResponse(res, 401, { error: '未登入' });
    try {
      const { nickname, avatar } = await parseBody(req);
      const userIdx = db.users.findIndex(u => u.id === user.id);
      if (userIdx < 0) return jsonResponse(res, 404, { error: '用戶不存在' });
      if (nickname && nickname.length >= 1 && nickname.length <= 20) {
        if (db.users.find(u => u.nickname === nickname && u.id !== user.id)) {
          return jsonResponse(res, 400, { error: '昵稱已被使用' });
        }
        db.users[userIdx].nickname = nickname;
      }
      if (avatar !== undefined) {
        db.users[userIdx].avatar = avatar;
      }
      saveData(db);
      sessions.forEach((s, sid) => {
        if (s.user.id === user.id) {
          s.user.nickname = db.users[userIdx].nickname;
        }
      });
      jsonResponse(res, 200, { success: true, nickname: db.users[userIdx].nickname, avatar: db.users[userIdx].avatar || null });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  if (pathname === '/api/password' && method === 'PUT') {
    const user = requireAuth(req, res);
    if (!user) return jsonResponse(res, 401, { error: '未登入' });
    try {
      const { currentPassword, newPassword } = await parseBody(req);
      const userIdx = db.users.findIndex(u => u.id === user.id);
      if (userIdx < 0) return jsonResponse(res, 404, { error: '用戶不存在' });
      if (!verifyPassword(currentPassword, db.users[userIdx].password)) {
        return jsonResponse(res, 400, { error: '當前密碼錯誤' });
      }
      if (!newPassword || newPassword.length < 4) {
        return jsonResponse(res, 400, { error: '新密碼長度至少 4 字' });
      }
      db.users[userIdx].password = hashPassword(newPassword);
      saveData(db);
      jsonResponse(res, 200, { success: true });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  // 排行榜（公開：全體用戶都上榜，只係統計數字，唔涉及個人練習記錄）
  if (pathname === '/api/leaderboard' && method === 'GET') {
    jsonResponse(res, 200, shiziRanks().slice(0, 50));
    return;
  }

  // Char routes (public read, admin write)
  if (pathname === '/api/chars' && method === 'GET') {
    // ?scope=practice → 唔含原子字（練習／布置任務用）
    const scope = parsedUrl.query.scope;
    const chars = scope === 'practice'
      ? db.chars.filter(c => !isAtomicChar(c.char))
      : db.chars;
    jsonResponse(res, 200, chars.map(c => ({ ...c, atomic: isAtomicChar(c.char) })));
    return;
  }

  // 原子字庫（拆開只剩筆畫嘅字）
  if (pathname === '/api/chars/atomic' && method === 'GET') {
    jsonResponse(res, 200, { chars: [...ChaiziAtomic] });
    return;
  }

  // 由字庫移除所有原子字（管理員）
  if (pathname === '/api/chars/atomic' && method === 'DELETE') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    const before = db.chars.length;
    db.chars = db.chars.filter(c => !isAtomicChar(c.char));
    const removed = before - db.chars.length;
    await saveData(db);
    jsonResponse(res, 200, { removed, remaining: db.chars.length });
    return;
  }

  // ===== 任務（小孩用，非管理員）=====
  // 小孩查看自己的任務
  if (pathname === '/api/assignments' && method === 'GET') {
    const u = requireAuth(req, res);
    if (!u) return jsonResponse(res, 401, { error: '請先登入' });
    const mine = db.assignments
      .filter(a => a.userId === u.id)
      .map(a => decorateAssignment(a, db.chars));
    jsonResponse(res, 200, mine);
    return;
  }

  // 記錄任務內某個字已完成
  if (pathname.startsWith('/api/assignments/') && pathname.endsWith('/complete') && method === 'POST') {
    const u = requireAuth(req, res);
    if (!u) return jsonResponse(res, 401, { error: '請先登入' });
    const id = parseInt(pathname.split('/')[3]);
    const a = db.assignments.find(x => x.id === id && x.userId === u.id);
    if (!a) return jsonResponse(res, 404, { error: '任務不存在' });
    try {
      const { charId, correct } = await parseBody(req);
      if (!a.done) a.done = {};
      const key = String(charId);
      const prev = a.done[key] || { attempts: 0, correctCount: 0 };
      a.done[key] = {
        attempts: prev.attempts + 1,
        correctCount: prev.correctCount + (correct ? 1 : 0),
        lastAt: new Date().toISOString()
      };
      await saveData(db);
      jsonResponse(res, 200, decorateAssignment(a, db.chars));
    } catch (e) {
      jsonResponse(res, 400, { error: '請求失敗' });
    }
    return;
  }

  // ===== 學習進度（任何登入用戶）=====
  if (pathname === '/api/progress' && method === 'GET') {
    const u = requireAuth(req, res);
    if (!u) return jsonResponse(res, 401, { error: '請先登入' });
    const progress = db.progress.filter(p => p.userId === u.id)
      .sort((a, b) => new Date(b.lastPracticed) - new Date(a.lastPracticed));
    jsonResponse(res, 200, progress);
    return;
  }

  if (pathname === '/api/progress' && method === 'POST') {
    const u = requireAuth(req, res);
    if (!u) return jsonResponse(res, 401, { error: '請先登入' });
    try {
      const { char, charId, responseTime, correct } = await parseBody(req);
      if (!char) return jsonResponse(res, 400, { error: '缺少字符' });

      const now = new Date().toISOString();

      // Insert attempt
      db.attempts.push({
        id: generateId(new Set(db.attempts.map(a => a.id))),
        userId: u.id,
        char,
        charId: charId || null,
        responseTime: responseTime || 0,
        correct: correct ? 1 : 0,
        practicedAt: now
      });

      // Update or create progress
      const existingIdx = db.progress.findIndex(p => p.userId === u.id && p.char === char);
      if (existingIdx >= 0) {
        const p = db.progress[existingIdx];
        p.attempts = (p.attempts || 0) + 1;
        p.totalTime = (p.totalTime || 0) + (responseTime || 0);
        p.avgTime = p.totalTime / p.attempts;
        p.bestTime = p.bestTime ? Math.min(p.bestTime, responseTime || 0) : (responseTime || 0);
        p.lastPracticed = now;
      } else {
        db.progress.push({
          id: generateId(new Set(db.progress.map(p => p.id))),
          userId: u.id,
          char,
          charId: charId || null,
          attempts: 1,
          totalTime: responseTime || 0,
          avgTime: responseTime || 0,
          bestTime: responseTime || 0,
          lastPracticed: now
        });
      }

      saveData(db);
      jsonResponse(res, 200, { success: true });
    } catch (e) {
      jsonResponse(res, 500, { error: '記錄失敗' });
    }
    return;
  }

  if (pathname === '/api/stats' && method === 'GET') {
    const u = requireAuth(req, res);
    if (!u) return jsonResponse(res, 401, { error: '請先登入' });
    const userProgress = db.progress.filter(p => p.userId === u.id);
    const totalChars = userProgress.length;
    const totalAttempts = userProgress.reduce((sum, p) => sum + (p.attempts || 0), 0);
    const avgTime = userProgress.length > 0
      ? userProgress.reduce((sum, p) => sum + (p.avgTime || 0), 0) / userProgress.length
      : 0;

    // Recent activity (last 7 days)
    const recentActivity = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const count = db.attempts.filter(a =>
        a.userId === u.id && a.practicedAt && a.practicedAt.startsWith(dateStr)
      ).length;
      recentActivity.push({ date: dateStr, count });
    }

    jsonResponse(res, 200, {
      totalChars,
      totalAttempts,
      avgTime,
      recentActivity: recentActivity.reverse()
    });
    return;
  }


  // Admin-only char routes
  const adminUser = requireAuth(req, res);
  if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
  if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });

  if (pathname === '/api/chars' && method === 'POST') {
    try {
      const { char, components, layout, hint, positions, words } = await parseBody(req);
      if (!char || !components) return jsonResponse(res, 400, { error: '缺少必要欄位' });
      if (db.chars.find(c => c.char === char)) {
        return jsonResponse(res, 400, { error: '該字已存在' });
      }
      const newChar = {
        id: generateId(new Set(db.chars.map(x => x.id))),
        char,
        components,
        layout: layout || 'left-right',
        hint: hint || '',
        positions: positions || null,
        words: normalizeWords(words),
        createdAt: new Date().toISOString()
      };
      db.chars.push(newChar);
      await saveData(db);
      jsonResponse(res, 201, newChar);
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  // 詞語批量導入：新增字 + 把詞語掛到每個字上
  if (pathname === '/api/chars/words' && method === 'POST') {
    try {
      const { words, newChars } = await parseBody(req);
      if (!Array.isArray(words) || words.length === 0) {
        return jsonResponse(res, 400, { error: '缺少詞語' });
      }
      const cleanWords = normalizeWords(words);
      // 每個字出現喺邊啲詞語入面（原子字唔會入字庫，但詞語可以掛喺其他字上）
      const charWords = {};
      for (const w of cleanWords) {
        for (const ch of new Set(w.replace(/\s/g, ''))) {
          if (isAtomicChar(ch)) continue;
          if (!charWords[ch]) charWords[ch] = [];
          charWords[ch].push(w);
        }
      }

      const results = { added: 0, updated: 0, skipped: 0, errors: [] };

      // 1. 新增字
      if (Array.isArray(newChars)) {
        for (const item of newChars) {
          const { char, components, layout, hint, positions } = item;
          if (!char || !components) {
            results.errors.push({ char: char || '?', error: '缺少必要欄位' });
            results.skipped++;
            continue;
          }
          if (db.chars.find(c => c.char === char)) {
            results.skipped++;
            continue;
          }
          if (isAtomicChar(char)) {
            results.skipped++;
            continue;
          }
          db.chars.push({
            id: generateId(new Set(db.chars.map(x => x.id))),
            char,
            components,
            layout: layout || 'left-right',
            hint: hint || '',
            positions: positions || null,
            words: normalizeWords(charWords[char] || []),
            createdAt: new Date().toISOString()
          });
          results.added++;
        }
      }

      // 2. 已存在嘅字：合併詞語
      for (const ch of Object.keys(charWords)) {
        const exist = db.chars.find(c => c.char === ch);
        if (!exist) continue;
        exist.words = normalizeWords([...(exist.words || []), ...charWords[ch]]);
        results.updated++;
      }

      await saveData(db);
      jsonResponse(res, 200, { ...results, wordCount: cleanWords.length });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  if (pathname === '/api/chars/import' && method === 'POST') {
    try {
      const { chars } = await parseBody(req);
      if (!Array.isArray(chars)) return jsonResponse(res, 400, { error: 'chars 必須是陣列' });
      const results = { added: 0, skipped: 0, errors: [] };
      for (const item of chars) {
        const { char, components, layout, hint, positions } = item;
        if (!char || !components) {
          results.errors.push({ char: char || '?', error: '缺少必要欄位' });
          results.skipped++;
          continue;
        }
        if (db.chars.find(c => c.char === char)) {
          results.skipped++;
          continue;
        }
        db.chars.push({
          id: Date.now() + Math.random(),
          char,
          components,
          layout: layout || 'left-right',
          hint: hint || '',
          positions: positions || null,
          createdAt: new Date().toISOString()
        });
        results.added++;
      }
      await saveData(db);
      jsonResponse(res, 200, results);
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  if (pathname.startsWith('/api/chars/') && method === 'PUT') {
    const charId = parseFloat(pathname.split('/').pop());
    const idx = db.chars.findIndex(c => c.id === charId);
    if (idx < 0) return jsonResponse(res, 404, { error: '字符不存在' });
    try {
      const updates = await parseBody(req);
      // 只允許更新特定字段，避免 id/createdAt 被改
      const allowed = ['char', 'components', 'layout', 'hint', 'positions'];
      if ('words' in updates) db.chars[idx].words = normalizeWords(updates.words);
      for (const k of allowed) {
        if (k in updates) db.chars[idx][k] = updates[k];
      }
      db.chars[idx].updatedAt = new Date().toISOString();
      await saveData(db);
      jsonResponse(res, 200, db.chars[idx]);
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  if (pathname.startsWith('/api/chars/') && method === 'DELETE') {
    const charId = parseFloat(pathname.split('/').pop());
    const idx = db.chars.findIndex(c => c.id === charId);
    if (idx < 0) return jsonResponse(res, 404, { error: '字符不存在' });
    db.chars.splice(idx, 1);
    await saveData(db);
    jsonResponse(res, 200, { success: true });
    return;
  }


  // AI Token 設定（只用於手動「AI 建議」）
  if (pathname === '/api/config' && method === 'GET') {
    jsonResponse(res, 200, { aiToken: db.config.aiToken || '' });
    return;
  }
  if (pathname === '/api/config' && method === 'PUT') {
    try {
      const { aiToken } = await parseBody(req);
      db.config.aiToken = aiToken || '';
      await saveData(db);
      jsonResponse(res, 200, { success: true });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  // ===== 深拆方案（多方案，手動選擇）=====
  // 回傳：字典原拆法 / 字典深拆 / IDS 深拆 / IDS 最深，每項標明來源
  if (pathname.startsWith('/api/admin/chars/') && pathname.endsWith('/decompositions') && method === 'POST') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    const charId = parseInt(pathname.split('/')[4]);
    const target = db.chars.find(x => x.id === charId);
    if (!target) return jsonResponse(res, 404, { error: '字唔存在' });
    const ch = target.char;

    const seen = new Set();
    const candidates = [];
    const push = (cand) => {
      const key = cand.components.join('+');
      if (seen.has(key)) return;
      seen.add(key);
      const compound = cand.components.filter(isCompoundPart);
      const strokes = cand.components.filter(x => STROKE_SET.has(x));
      const weird = cand.components.filter(x => x.length > 1 || idsLib.PLACEHOLDER.test(x));
      const notes = [];
      if (weird.length) notes.push(`⚠️ 含罕見字符：${weird.join('')}`);
      if (strokes.length) notes.push(`⚠️ 含 ${strokes.length} 個筆畫：${strokes.join('')}`);
      if (compound.length) notes.push(`含 ${compound.length} 個可再展開部件：${compound.join('')}`);
      if (!notes.length) notes.push('全部部件都係最底層部件');
      cand.note = notes.join('　');
      cand.positions = cand.positions || positionsForCount(ch, cand.components.length);
      candidates.push(cand);
    };

    // ① 目前字典拆法（chaizi-unique.js，你篩選好嘅唯一拆法）
    const base = longestDecomp(ch);
    if (base.length >= 1) {
      push({ source: 'dict', label: '目前字典拆法', components: base });
    }

    // ② 字典深拆（逐個部件用字典再拆一層）
    if (base.length >= 2) {
      const expanded = [];
      for (const part of base) {
        const d = ChaiziDictUnique?.[part];
        if (isCompoundPart(part) && Array.isArray(d)) expanded.push(...d);
        else expanded.push(part);
      }
      if (expanded.join('+') !== base.join('+')) {
        push({ source: 'dict-deep', label: '字典深拆（生僻部件展開）', components: expanded });
      }
    }

    // ③ IDS 深拆一層 / 最深
    const ids1 = idsLib.deepSplit(ch, idsMap, 1);
    if (ids1 && ids1.components.join('+') !== base.join('+')) {
      push({ source: 'ids-1', label: 'IDS 字形樹（一層）', components: ids1.components, positions: ids1.positions });
    }
    const idsAll = idsLib.deepSplit(ch, idsMap);
    if (idsAll) {
      push({
        source: 'ids-deep',
        label: `IDS 字形樹（最深${idsAll.hasPlaceholder ? '，含佔位符' : ''}）`,
        components: idsAll.components,
        positions: idsAll.positions
      });
    }

    jsonResponse(res, 200, {
      char: ch,
      current: { components: target.components, layout: target.layout, positions: target.positions || null },
      candidates
    });
    return;
  }

  // ===== AI 建議拆法（單字、手動、有冷卻，禁止批量）=====
  if (pathname.startsWith('/api/admin/chars/') && pathname.endsWith('/ai-suggest') && method === 'POST') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    if (!db.config.aiToken) return jsonResponse(res, 400, { error: '未設定 AI Token' });
    const g = aiGuard();
    if (!g.ok) return jsonResponse(res, 429, { error: g.error });
    const charId = parseInt(pathname.split('/')[4]);
    const target = db.chars.find(x => x.id === charId);
    if (!target) return jsonResponse(res, 404, { error: '字唔存在' });
    const ch = target.char;
    try {
      const decompStr = (longestDecomp(ch) || []).join(' ') || '（無）';
      const prompt = `你是繁體中文字形結構專家。請為「${ch}」提出一個最適合小朋友認字嘅拆法。

字典現有拆法：${decompStr}
目前採用：${(target.components || []).join(' + ')}

## 要求
1. 部件要用小朋友認識嘅常用字／偏旁（避免生僻字，例如「臤」「霝」「龠」）
2. 部件數 2-4 個為佳
3. 給出每個部件喺字中嘅實際位置（top/bottom/left/right/top-left/top-right/bottom-left/bottom-right/center）

## 回覆格式（嚴格 JSON）
{"components": ["臣", "又", "土"], "parts": ["top-left","top-right","bottom"], "reason": "簡短解釋"}`;

      const aiRes = await fetch('https://api.minimax.cn/anthropic/v1/messages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${db.config.aiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'MiniMax-M3', output_config: { effort: 'max' }, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
      });
      if (!aiRes.ok) {
        const err = await aiRes.text();
        return jsonResponse(res, 502, { error: 'AI API 錯誤: ' + err.slice(0, 200) });
      }
      const aiData = await aiRes.json();
      const content = aiData.content?.[0]?.text || '';
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return jsonResponse(res, 500, { error: '無法解析 AI 回覆' });
      const parsed = JSON.parse(m[0]);
      const comps = (parsed.components || []).filter(Boolean);
      if (comps.length < 1) return jsonResponse(res, 500, { error: 'AI 冇提出拆法' });
      jsonResponse(res, 200, {
        source: 'ai',
        label: 'AI 建議',
        components: comps,
        parts: parsed.parts || [],
        note: parsed.reason || '',
        positions: positionsForCount(ch, comps.length)
      });
    } catch (e) {
      jsonResponse(res, 500, { error: 'AI 分析失敗: ' + e.message });
    }
    return;
  }

  // ===== 重新分析字庫結構（用 Unicode IDS，免費離線，唔使 AI）=====
  if (pathname === '/api/admin/reanalyze-layouts' && method === 'POST') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    try {
      const { ids } = await parseBody(req);
      let targets = db.chars.filter(c => !isAtomicChar(c.char));
      if (Array.isArray(ids) && ids.length) {
        const set = new Set(ids.map(Number));
        targets = targets.filter(c => set.has(c.id));
      }
      if (targets.length === 0) return jsonResponse(res, 400, { error: '冇字可以分析' });

      const results = [];
      const skipped = [];
      for (const t of targets) {
        const layout = idsLayoutFor(t.char, t.components);
        if (!layout) { skipped.push(t.char); continue; }
        const changed = t.layout !== layout;
        t.layout = layout;
        t.updatedAt = new Date().toISOString();
        results.push({ char: t.char, layout, changed });
      }
      await saveData(db);
      jsonResponse(res, 200, {
        analyzed: results.length,
        changed: results.filter(r => r.changed).length,
        skipped,
        results
      });
    } catch (e) {
      jsonResponse(res, 500, { error: '重新分析失敗: ' + e.message });
    }
    return;
  }



  // Progress routes (require auth)
  const user = requireAuth(req, res);
  if (!user) return jsonResponse(res, 401, { error: '請先登入' });

  // Admin routes
  if (pathname.startsWith('/api/admin/') && user.role !== 'admin') {
    return jsonResponse(res, 403, { error: '需要管理員權限' });
  }

  // 管理員：任務列表
  if (pathname === '/api/admin/assignments' && method === 'GET') {
    const list = db.assignments.map(a => {
      const u = db.users.find(x => x.id === a.userId);
      return {
        ...decorateAssignment(a, db.chars),
        username: u ? (u.nickname || u.username) : '（已刪除用戶）'
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    jsonResponse(res, 200, list);
    return;
  }

  // 管理員：建立任務（可以一次過派畀多個小孩）
  if (pathname === '/api/admin/assignments' && method === 'POST') {
    try {
      const { userId, userIds, name, charIds, note, words } = await parseBody(req);
      // 支援 userIds（多選）同 userId（單選，向後兼容）；兩者都空＝派給所有用戶
      const resolved = resolveUserIds(db, userIds !== undefined ? userIds : userId);
      if (resolved.error) return jsonResponse(res, 400, { error: resolved.error });
      const targets = resolved.userIds;
      if (!Array.isArray(charIds) || charIds.length === 0) {
        return jsonResponse(res, 400, { error: '請至少選一個字' });
      }
      const validIds = new Set(db.chars.filter(c => !isAtomicChar(c.char)).map(c => c.id));
      const cleanIds = charIds.filter(id => validIds.has(id));
      if (cleanIds.length === 0) return jsonResponse(res, 400, { error: '選中的字不存在或屬原子字（唔可練習）' });

      // 每個小孩一個任務記錄（各自有獨立進度），但用 groupId 綁埋一組
      const groupId = generateId(new Set(db.assignments.map(a => a.id)));
      const taskName = (name && name.trim()) || `${new Date().toISOString().slice(0, 10)} 的功課`;
      const created = [];
      for (const uid of targets) {
        const assignment = {
          id: generateId(new Set(db.assignments.map(a => a.id))),
          groupId,
          userId: uid,
          scope: resolved.all ? 'all' : 'selected',
          name: taskName,
          charIds: cleanIds,
          words: normalizeWords(words),     // 任務自帶嘅詞語（可以同字嘅詞語唔一樣）
          note: (note && note.trim()) || '',
          done: {},
          createdAt: new Date().toISOString()
        };
        db.assignments.push(assignment);
        created.push(assignment);
      }
      await saveData(db);
      jsonResponse(res, 200, {
        groupId,
        scope: resolved.all ? 'all' : 'selected',
        created: created.length,
        assignments: created.map(a => decorateAssignment(a, db.chars))
      });
    } catch (e) {
      jsonResponse(res, 400, { error: '請求失敗' });
    }
    return;
  }

  // 管理員：更新任務（同一組全部一齊更新）
  if (pathname.startsWith('/api/admin/assignments/') && method === 'PUT') {
    const id = parseInt(pathname.split('/').pop());
    const a = db.assignments.find(x => x.id === id);
    if (!a) return jsonResponse(res, 404, { error: '任務不存在' });
    try {
      const { name, charIds, note, resetDone, userId, words } = await parseBody(req);
      // 同一組（groupId）嘅任務一齊處理
      const group = a.groupId ? db.assignments.filter(x => x.groupId === a.groupId) : [a];
      const targets = group.length ? group : [a];
      for (const t of targets) {
        if (name !== undefined) t.name = name.trim() || t.name;
        if (note !== undefined) t.note = note.trim();
        if (words !== undefined) t.words = normalizeWords(words);
        if (userId !== undefined) t.userId = parseInt(userId);
        if (Array.isArray(charIds)) {
          const validIds = new Set(db.chars.filter(c => !isAtomicChar(c.char)).map(c => c.id));
          const cleanIds = charIds.filter(x => validIds.has(x));
          if (cleanIds.length > 0) t.charIds = cleanIds;
        }
        if (resetDone) t.done = {};
        t.updatedAt = new Date().toISOString();
      }
      await saveData(db);
      jsonResponse(res, 200, {
        success: true,
        updated: targets.length,
        assignments: targets.map(t => decorateAssignment(t, db.chars))
      });
    } catch (e) {
      jsonResponse(res, 400, { error: '請求失敗' });
    }
    return;
  }

  // 管理員：刪除任務（同一組全部一齊刪）
  if (pathname.startsWith('/api/admin/assignments/') && method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop());
    const a = db.assignments.find(x => x.id === id);
    if (!a) return jsonResponse(res, 404, { error: '任務不存在' });
    const group = a.groupId ? db.assignments.filter(x => x.groupId === a.groupId) : [a];
    const ids = new Set(group.map(x => x.id));
    db.assignments = db.assignments.filter(x => !ids.has(x.id));
    await saveData(db);
    jsonResponse(res, 200, { ok: true, removed: ids.size });
    return;
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    const users = db.users.map(u => {
      const userProgress = db.progress.filter(p => p.userId === u.id);
      const userAssignments = db.assignments.filter(a => a.userId === u.id);
      return {
        id: u.id,
        username: u.username,
        nickname: u.nickname || u.username,
        avatar: u.avatar || null,
        role: u.role,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin || null,
        updatedAt: u.updatedAt || null,
        passwordChangedAt: u.passwordChangedAt || null,
        charsKnown: userProgress.length,
        totalAttempts: userProgress.reduce((sum, p) => sum + (p.attempts || 0), 0),
        avgResponseTime: userProgress.length > 0
          ? userProgress.reduce((sum, p) => sum + (p.avgTime || 0), 0) / userProgress.length
          : 0,
        taskCount: userAssignments.length,
        taskDoneCount: userAssignments.filter(a => {
          const done = a.done || {};
          return (a.charIds || []).length > 0 &&
                 (a.charIds || []).every(id => done[String(id)]);
        }).length,
        taskCharCount: userAssignments.reduce((sum, a) => sum + (a.charIds || []).length, 0)
      };
    }).sort((a, b) => b.charsKnown - a.charsKnown);
    jsonResponse(res, 200, users);
    return;
  }

  if (pathname.startsWith('/api/admin/user/') && method === 'GET') {
    const userId = parseInt(pathname.split('/').pop());
    const targetUser = db.users.find(u => u.id === userId);
    if (!targetUser) return jsonResponse(res, 404, { error: '用戶不存在' });
    const progress = db.progress.filter(p => p.userId === userId);
    const attempts = db.attempts.filter(a => a.userId === userId).slice(-100);
    const assignments = db.assignments
      .filter(a => a.userId === userId)
      .map(a => decorateAssignment(a, db.chars))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    jsonResponse(res, 200, {
      user: { id: targetUser.id, username: targetUser.username, nickname: targetUser.nickname || targetUser.username, role: targetUser.role, createdAt: targetUser.createdAt },
      progress,
      attempts,
      assignments
    });
    return;
  }

  if (pathname.startsWith('/api/admin/user/') && method === 'PUT') {
    const userId = parseInt(pathname.split('/').pop());
    try {
      const { role, nickname, avatar, password } = await parseBody(req);
      const userIdx = db.users.findIndex(u => u.id === userId);
      if (userIdx < 0) return jsonResponse(res, 404, { error: '用戶不存在' });
      const target = db.users[userIdx];

      if (role !== undefined && role !== null) {
        if (role !== 'admin' && role !== 'user') return jsonResponse(res, 400, { error: '無效的角色' });
        if (userId === user.id && role !== 'admin') {
          return jsonResponse(res, 400, { error: '唔可以將自己降級，以免鎖死管理功能' });
        }
        target.role = role;
      }

      if (nickname !== undefined) {
        const n = (nickname || '').trim();
        if (n.length > 20) return jsonResponse(res, 400, { error: '暱稱最多 20 字' });
        // 同「顯示名稱」對齊（有暱稱用暱稱，冇就用用戶名）
        const displayName = (u) => (u.nickname || u.username || '');
        if (n && db.users.some(u => u.id !== userId && displayName(u) === n)) {
          return jsonResponse(res, 400, { error: '暱稱已經俾其他人用咗' });
        }
        target.nickname = n;
      }

      if (avatar !== undefined) {
        target.avatar = (avatar || '').trim().slice(0, 300);
      }

      if (password) {
        if (String(password).length < 4) return jsonResponse(res, 400, { error: '密碼至少 4 字' });
        if (userId === user.id) {
          return jsonResponse(res, 400, { error: '請用自己嘅「🔒 修改密碼」功能改密碼' });
        }
        target.password = hashPassword(String(password));
        target.passwordChangedAt = new Date().toISOString();
      }

      target.updatedAt = new Date().toISOString();
      await saveData(db);

      // 即時同步該用戶嘅 session（改咗暱稱／角色／頭像即刻生效）
      for (const [sid, s] of sessions) {
        if (s.user.id === userId) {
          sessions.set(sid, {
            ...s,
            user: {
              ...s.user,
              nickname: target.nickname,
              role: target.role,
              avatar: target.avatar || null
            }
          });
        }
      }

      const safe = { ...target };
      delete safe.password;
      jsonResponse(res, 200, { success: true, user: safe });
    } catch (e) {
      jsonResponse(res, 400, { error: '請求無效' });
    }
    return;
  }

  if (pathname.startsWith('/api/admin/user/') && pathname.endsWith('/progress') && method === 'DELETE') {
    const userId = parseInt(pathname.split('/')[4]);
    if (!db.users.find(u => u.id === userId)) return jsonResponse(res, 404, { error: '用戶不存在' });
    db.progress = db.progress.filter(p => p.userId !== userId);
    db.attempts = db.attempts.filter(a => a.userId !== userId);
    // 清埋呢個用戶自己任務嘅進度
    db.assignments.forEach(a => {
      if (a.userId === userId && a.done) a.done = {};
    });
    await saveData(db);
    jsonResponse(res, 200, { success: true });
    return;
  }

  if (pathname.startsWith('/api/admin/user/') && method === 'DELETE') {
    const userId = parseInt(pathname.split('/').pop());
    if (userId === user.id) return jsonResponse(res, 400, { error: '不能刪除自己' });
    const userIdx = db.users.findIndex(u => u.id === userId);
    if (userIdx < 0) return jsonResponse(res, 404, { error: '用戶不存在' });
    db.users.splice(userIdx, 1);
    db.progress = db.progress.filter(p => p.userId !== userId);
    db.attempts = db.attempts.filter(a => a.userId !== userId);
    saveData(db);
    jsonResponse(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/admin/chars' && method === 'GET') {
    const charMap = {};
    db.progress.forEach(p => {
      if (!charMap[p.char]) {
        charMap[p.char] = { char: p.char, usersPracticed: 0, totalAttempts: 0, avgTime: 0 };
      }
      charMap[p.char].usersPracticed++;
      charMap[p.char].totalAttempts += p.attempts || 0;
      charMap[p.char].avgTime = (charMap[p.char].avgTime * (charMap[p.char].usersPracticed - 1) + (p.avgTime || 0)) / charMap[p.char].usersPracticed;
    });
    const charStats = Object.values(charMap).sort((a, b) => b.usersPracticed - a.usersPracticed);
    jsonResponse(res, 200, charStats);
    return;
  }

  // 404
  jsonResponse(res, 404, { error: 'API Not Found' });
}

  return { handleAPI, stats: shiziRanks };
}

module.exports = { id: 'shizi', create: createShiziTool };
