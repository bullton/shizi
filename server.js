const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || process.argv[2] || 3000;
const BASE_DIR = __dirname;
const DATA_FILE = path.join(BASE_DIR, 'shizi-data.json');

// Load ChaiziDictUnique (new dict: each char has exactly 1 decomp)
// + ChaiziAtomic (拆開只剩筆畫嘅字，唔會出現喺練習字庫／布置任務)
globalThis.window = globalThis;
require(path.join(BASE_DIR, 'chaizi-data.js'));
require(path.join(BASE_DIR, 'chaizi-unique.js'));
require(path.join(BASE_DIR, 'chaizi-atomic.js'));
require(path.join(BASE_DIR, 'chaizi-ids.js'));
const ChaiziDict = globalThis.ChaiziDict;          // 原始字典（保留）
const ChaiziDictUnique = globalThis.ChaiziDictUnique;  // 每字唯一拆法
const ChaiziAtomic = new Set(globalThis.ChaiziAtomic || []);  // 原子字庫
const ChaiziIds = globalThis.ChaiziIds || {};  // Unicode IDS 結構表

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
  if (ChaiziDictUnique && ChaiziDictUnique[char]) {
    const entry = ChaiziDictUnique[char];
    return Array.isArray(entry) ? entry : entry.split(' ');
  }
  // fallback: 從原字典取最長
  if (!ChaiziDict || !ChaiziDict[char]) return [];
  const alts = ChaiziDict[char];
  if (alts.length === 0) return [];
  let best = alts[0];
  for (const a of alts) if (a.split(' ').length > best.split(' ').length) best = a;
  return best.split(' ');
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

// ===== 數據存儲 =====
const DATA_FILE_EXISTS = fs.existsSync(DATA_FILE);

function loadData() {
  try {
    if (DATA_FILE_EXISTS) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { users: [], progress: [], attempts: [], chars: [], assignments: [] };
}

// 簡單異步互斥鎖：避免並發寫丟失
let writeLock = Promise.resolve();
function withWriteLock(fn) {
  const next = writeLock.then(fn, fn);
  writeLock = next.catch(() => {}); // 即使失敗也釋放鎖
  return next;
}

// 原子寫：先寫臨時文件再重命名，避免寫到一半損壞
function saveData(data) {
  return withWriteLock(async () => {
    const tmp = DATA_FILE + '.tmp.' + process.pid;
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.promises.rename(tmp, DATA_FILE);
  });
}

const db = {
  users: [],
  progress: [],
  attempts: [],
  chars: [],
  assignments: [],
};

// Load on startup
const savedData = loadData();
db.users = savedData.users || [];
db.progress = savedData.progress || [];
db.attempts = savedData.attempts || [];
db.chars = savedData.chars || [];
db.assignments = savedData.assignments || [];

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
    await saveData(db);
    console.log(`[shizi] 已修正 ${fixed} 個重複用戶 id`);
  }
})();

// 首次運行自動 seed DEFAULT_CHARS（僅當數據文件不存在時）
// 如果數據文件存在但 chars 為空，說明是被手動清空，不自動補充（避免誤刪自定義數據）
(async () => {
  if (!DATA_FILE_EXISTS && DEFAULT_CHARS.length > 0) {
    const now = new Date().toISOString();
    db.chars = DEFAULT_CHARS.map(c => ({ ...c, createdAt: now }));
    await saveData(db);
    console.log(`[shizi] 已自動 seed ${db.chars.length} 個預設字到 server`);
  }
})();

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
    name: a.name,
    note: a.note || '',
    charIds: a.charIds || [],
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

// ===== 唯一 ID 生成 =====
// 用戶 id 絕對不能撞，否則兩個帳號會共用同一份進度（進度串號）
// Date.now() * 1000 + seq ≈ 1.8e15，仍在 Number.MAX_SAFE_INTEGER (9e15) 之內
let idSeq = 0;
function generateId(existingIds) {
  const used = existingIds || new Set();
  let id;
  do {
    idSeq = (idSeq + 1) % 1000;
    id = Date.now() * 1000 + idSeq;
  } while (used.has(id));
  return id;
}

// ===== Password hashing =====
const crypto = require('crypto');
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ===== Session Management =====
const sessions = new Map();
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}
function getUserFromSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session.user;
}

// ===== MIME Types =====
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ===== Request Helpers =====
function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    cookies[name.trim()] = rest.join('=').trim();
  });
  return cookies;
}

function requireAuth(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies['session'];
  if (!sessionId) return null;
  return getUserFromSession(sessionId);
}

function setSessionCookie(res, sessionId, expires) {
  res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax${expires ? '; Expires=' + new Date(expires).toUTCString() : ''}`);
}

// ===== API Routes =====
async function handleAPI(req, res) {
  const parsedUrl = url.parse(req.url, true);
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

  // Auth routes (no session required)
  if (pathname === '/api/register' && method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) {
        return jsonResponse(res, 400, { error: '請填寫用戶名和密碼' });
      }
      if (username.length < 2 || username.length > 20) {
        return jsonResponse(res, 400, { error: '用戶名長度應為 2-20 字' });
      }
      if (password.length < 4) {
        return jsonResponse(res, 400, { error: '密碼長度至少 4 字' });
      }
      if (db.users.find(u => u.username === username)) {
        return jsonResponse(res, 400, { error: '用戶名已存在' });
      }
      const isFirstUser = db.users.length === 0;
      const user = {
        id: generateId(new Set(db.users.map(u => u.id))),
        username,
        password: hashPassword(password),
        role: isFirstUser ? 'admin' : 'user',
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      await saveData(db);
      // 註冊後自動登入
      const sessionId = generateSessionId();
      sessions.set(sessionId, {
        user: { id: user.id, username: user.username, role: user.role },
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000
      });
      setSessionCookie(res, sessionId, Date.now() + 30 * 24 * 60 * 60 * 1000);
      jsonResponse(res, 201, { id: user.id, username: user.username, role: user.role });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  if (pathname === '/api/login' && method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) {
        return jsonResponse(res, 400, { error: '請填寫用戶名和密碼' });
      }
      const user = db.users.find(u => u.username === username);
      if (!user || !verifyPassword(password, user.password)) {
        return jsonResponse(res, 401, { error: '用戶名或密碼錯誤' });
      }
      const sessionId = generateSessionId();
      sessions.set(sessionId, {
        user: { id: user.id, username: user.username, role: user.role },
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000
      });
      setSessionCookie(res, sessionId, Date.now() + 30 * 24 * 60 * 60 * 1000);
      jsonResponse(res, 200, { id: user.id, username: user.username, role: user.role });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const cookies = parseCookies(req);
    const sessionId = cookies['session'];
    if (sessionId) sessions.delete(sessionId);
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
    jsonResponse(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/me' && method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return jsonResponse(res, 401, { error: '未登入' });
    const fullUser = db.users.find(u => u.id === user.id);
    if (!fullUser) return jsonResponse(res, 404, { error: '用戶不存在' });
    jsonResponse(res, 200, { id: fullUser.id, username: fullUser.username, nickname: fullUser.nickname || fullUser.username, role: fullUser.role, avatar: fullUser.avatar || null });
    return;
  }

  // ===== 全域登入閘門 =====
  // 除咗 register / login / logout / me 之外，所有 API 都必須登入
  const PUBLIC_API = ['/api/register', '/api/login', '/api/logout', '/api/me'];
  if (!PUBLIC_API.includes(pathname)) {
    const authUser = requireAuth(req, res);
    if (!authUser) return jsonResponse(res, 401, { error: '請先登入' });
  }

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
    const userStats = {};
    // 先放晒所有用戶（未練習都上榜，排最後）
    db.users.forEach(u => {
      userStats[u.id] = {
        userId: u.id,
        username: u.username,
        nickname: u.nickname || u.username,
        avatar: u.avatar || null,
        charsKnown: 0,
        totalAttempts: 0,
        avgTime: 0
      };
    });
    // 再累計進度
    db.progress.forEach(p => {
      if (!userStats[p.userId]) return;
      userStats[p.userId].charsKnown++;
      userStats[p.userId].totalAttempts += p.attempts || 0;
      userStats[p.userId].avgTime += p.avgTime || 0;
    });
    const leaderboard = Object.values(userStats)
      .map(u => ({
        ...u,
        avgTime: u.charsKnown > 0 ? u.avgTime / u.charsKnown : 0
      }))
      .sort((a, b) => b.charsKnown - a.charsKnown || a.avgTime - b.avgTime)
      .slice(0, 50);
    jsonResponse(res, 200, leaderboard);
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
      const { userId, userIds, name, charIds, note } = await parseBody(req);
      // 支援 userIds（多選）同 userId（單選，向後兼容）
      let targets = Array.isArray(userIds) ? userIds : (userId ? [userId] : []);
      targets = [...new Set(targets.map(x => parseInt(x)).filter(x => !isNaN(x)))];
      if (targets.length === 0) return jsonResponse(res, 400, { error: '請至少選擇一個小孩' });
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
          name: taskName,
          charIds: cleanIds,
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
      const { name, charIds, note, resetDone, userId } = await parseBody(req);
      // 同一組（groupId）嘅任務一齊處理
      const group = a.groupId ? db.assignments.filter(x => x.groupId === a.groupId) : [a];
      const targets = group.length ? group : [a];
      for (const t of targets) {
        if (name !== undefined) t.name = name.trim() || t.name;
        if (note !== undefined) t.note = note.trim();
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
        role: u.role,
        createdAt: u.createdAt,
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
      const { role } = await parseBody(req);
      const userIdx = db.users.findIndex(u => u.id === userId);
      if (userIdx < 0) return jsonResponse(res, 404, { error: '用戶不存在' });
      if (role !== 'admin' && role !== 'user') return jsonResponse(res, 400, { error: '無效的角色' });
      db.users[userIdx].role = role;
      saveData(db);
      jsonResponse(res, 200, { success: true });
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

// ===== Static File Server =====
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API routes
  if (pathname.startsWith('/api/')) {
    handleAPI(req, res);
    return;
  }

  // Serve static files
  let filePath = path.join(BASE_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  sendFile(res, filePath, contentType);
});

server.listen(PORT, () => {
  console.log(`識字樂服務器運行在 http://localhost:${PORT}/`);
});
