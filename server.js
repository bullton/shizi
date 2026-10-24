const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || process.argv[2] || 3000;
const BASE_DIR = __dirname;
const DATA_FILE = path.join(BASE_DIR, 'shizi-data.json');

// Load ChaiziDictUnique (new dict: each char has exactly 1 decomp)
globalThis.window = globalThis;
require(path.join(BASE_DIR, 'chaizi-data.js'));
require(path.join(BASE_DIR, 'chaizi-unique.js'));
const ChaiziDict = globalThis.ChaiziDict;          // 原始字典（保留）
const ChaiziDictUnique = globalThis.ChaiziDictUnique;  // 每字唯一拆法

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
  config: {
    aiToken: ''
  }
};

// Load on startup
const savedData = loadData();
db.users = savedData.users || [];
db.progress = savedData.progress || [];
db.attempts = savedData.attempts || [];
db.chars = savedData.chars || [];
db.assignments = savedData.assignments || [];
db.config = savedData.config || { aiToken: '' };

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
    jsonResponse(res, 200, db.chars);
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
      const { char, components, layout, hint, positions } = await parseBody(req);
      if (!char || !components) return jsonResponse(res, 400, { error: '缺少必要欄位' });
      if (db.chars.find(c => c.char === char)) {
        return jsonResponse(res, 400, { error: '該字已存在' });
      }
      const newChar = {
        id: Date.now(),
        char,
        components,
        layout: layout || 'left-right',
        hint: hint || '',
        positions: positions || null,
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

  // Config routes (admin only)
  if (pathname === '/api/config' && method === 'GET') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    jsonResponse(res, 200, { aiToken: db.config.aiToken || '' });
    return;
  }

  if (pathname === '/api/config' && method === 'PUT') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    try {
      const { aiToken } = await parseBody(req);
      db.config.aiToken = aiToken || '';
      saveData(db);
      jsonResponse(res, 200, { success: true });
    } catch (e) {
      jsonResponse(res, 400, { error: '無效的請求' });
    }
    return;
  }

  // AI analyze char (admin only)
  if (pathname === '/api/analyze-char' && method === 'POST') {
    const adminUser = requireAuth(req, res);
    if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
    if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
    try {
      const { char, decompositions } = await parseBody(req);
      if (!char) return jsonResponse(res, 400, { error: '缺少字符' });

      // If no AI token, return error
      if (!db.config.aiToken) {
        return jsonResponse(res, 400, { error: '請先配置 AI Token' });
      }

      const decompsStr = decompositions.map((d, i) => `${i + 1}. [${d.join(' ')}]`).join('\n');
      const validLayouts = [
        'left-right', 'top-bottom', 'top-bottom-bottom', 'vertical-3',
        'top-bottom-bottom-bottom', 'top-2-bottom', 'surround',
        'half-surround-left', 'complex-3-left', 'complex-4-left',
        'surround-3', 'left-right-right', 'stack'
      ];
      const layoutDescs = {
        'left-right': '左右結構（左部 + 右部）',
        'top-bottom': '上下結構（上 + 下）',
        'top-bottom-bottom': '品字結構（頂部1個 + 底部2個並排）',
        'vertical-3': '三疊結構（3個上下堆疊）',
        'top-bottom-bottom-bottom': '四疊結構（4個上下堆疊）',
        'top-2-bottom': '上中下結構（頂部1個 + 中間2個並排 + 底部1個）',
        'surround': '包圍結構（外框包住內部）',
        'stack': '通用堆疊（5+部件上下堆疊）',
        'half-surround-left': '半包圍結構（走之旁辶包左邊）',
        'complex-3-left': '三方結構（辶左 + 上下右）',
        'complex-4-left': '四方結構（辶左 + 自穴方右）',
        'surround-3': '包圍結構（冖包住上下部分）',
        'left-right-right': '左右右結構（左1 + 中右2個並排）'
      };
      const layoutList = validLayouts.map(l => `- ${l} = ${layoutDescs[l]}`).join('\n  ');

      const prompt = `你是繁體中文字形結構專家。請分析字符「${char}」的視覺結構。

現有以下拆字選項（每個選項是一個部件數組）：
${decompsStr}

## 必須使用的 layout 值（只選一個，每個 layout 期望的部件數已列出）：
  ${layoutList}

## 要求：
1. 從拆字選項中選擇視覺上最準確的一個
2. **layout 的部件數必須等於所選拆字選項的部件數**
3. 如果選項的部件數是 5+，必須使用 stack 布局
4. 如果某個 layout 的部件數與所選拆字不符，自動改用 stack
5. **給出每個部件在目標字中的視覺位置**（用 0-1 歸一化坐標系，x/y/w/h 都在 0-1 之間，部件頂部接近 0、底部接近 1，左側接近 0、右側接近 1）

回复格式（嚴格只用JSON，無多餘文字）：
{
  "recommended": 選擇的序號(整數, 從1開始),
  "layout": "上方的layout英文值",
  "positions": [
    { "x": 部件1左邊緣(0-1), "y": 部件1頂部(0-1), "w": 部件1寬度(0-1), "h": 部件1高度(0-1) },
    { "x": ..., "y": ..., "w": ..., "h": ... }
  ],
  "reason": "簡短中文解釋為何選擇此拆分和結構"
}

## 位置示例（繁字: 糹+毎+攵）：
{
  "recommended": 1,
  "layout": "bottom-top-top",
  "positions": [
    { "x": 0.1, "y": 0.05, "w": 0.4, "h": 0.45 },
    { "x": 0.5, "y": 0.05, "w": 0.4, "h": 0.45 },
    { "x": 0.0, "y": 0.55, "w": 1.0, "h": 0.4 }
  ]
}`;

      const aiRes = await fetch('https://api.minimax.cn/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${db.config.aiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'MiniMax-M3',
          output_config: { effort: 'max' },
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        return jsonResponse(res, 502, { error: 'AI API 錯誤: ' + err });
      }

      const aiData = await aiRes.json();
      const content = aiData.content?.[0]?.text || '';

      // Parse JSON from response
      let result;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          return jsonResponse(res, 500, { error: '無法解析 AI 回覆' });
        }
      } catch (e) {
        return jsonResponse(res, 500, { error: '解析 AI 回覆失敗: ' + content.substring(0, 100) });
      }

      // Validate layout
      if (!validLayouts.includes(result.layout)) {
        // Fallback: choose based on component count
        const chosenDecomp = decompositions[(result.recommended || 1) - 1];
        if (chosenDecomp) {
          result.layout = chosenDecomp.length >= 5 ? 'stack' : 'top-bottom';
        } else {
          return jsonResponse(res, 500, { error: 'AI 返回了無效的 layout: ' + result.layout });
        }
      }

      // Validate layout matches component count
      const chosenDecomp2 = decompositions[(result.recommended || 1) - 1];
      if (chosenDecomp2) {
        const counts = {
          'left-right': 2, 'top-bottom': 2, 'top-bottom-bottom': 3, 'vertical-3': 3,
          'top-bottom-bottom-bottom': 4, 'top-2-bottom': 4, 'surround': 2,
          'half-surround-left': 2, 'complex-3-left': 3, 'complex-4-left': 4,
          'surround-3': 3, 'left-right-right': 3
        };
        const expected = counts[result.layout];
        if (expected && chosenDecomp2.length !== expected) {
          result.layout = chosenDecomp2.length >= 5 ? 'stack' : 'top-bottom';
        }
      }

      // Validate recommended index
      const recIdx = (result.recommended || 1) - 1;
      if (recIdx < 0 || recIdx >= decompositions.length) {
        result.recommended = 1;
      }

      // Validate positions: must be array with correct length, each item has x/y/w/h
      const chosenDecomp3 = decompositions[(result.recommended || 1) - 1] || [];
      if (Array.isArray(result.positions) && result.positions.length === chosenDecomp3.length) {
        const cleaned = result.positions.map(p => ({
          x: Math.max(0, Math.min(1, parseFloat(p.x) || 0)),
          y: Math.max(0, Math.min(1, parseFloat(p.y) || 0)),
          w: Math.max(0.05, Math.min(1, parseFloat(p.w) || 0.3)),
          h: Math.max(0.05, Math.min(1, parseFloat(p.h) || 0.3))
        }));
        result.positions = cleaned;
      } else {
        result.positions = null;
      }

      jsonResponse(res, 200, result);
    } catch (e) {
      jsonResponse(res, 500, { error: '分析失敗: ' + e.message });
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

  // 管理員：建立任務
  if (pathname === '/api/admin/assignments' && method === 'POST') {
    try {
      const { userId, name, charIds, note } = await parseBody(req);
      if (!userId) return jsonResponse(res, 400, { error: '請選擇小孩' });
      if (!Array.isArray(charIds) || charIds.length === 0) {
        return jsonResponse(res, 400, { error: '請至少選一個字' });
      }
      const validIds = new Set(db.chars.map(c => c.id));
      const cleanIds = charIds.filter(id => validIds.has(id));
      if (cleanIds.length === 0) return jsonResponse(res, 400, { error: '選中的字不存在' });

      const assignment = {
        id: generateId(new Set(db.assignments.map(a => a.id))),
        userId: parseInt(userId),
        name: (name && name.trim()) || `${new Date().toISOString().slice(0, 10)} 的功課`,
        charIds: cleanIds,
        note: (note && note.trim()) || '',
        done: {},
        createdAt: new Date().toISOString()
      };
      db.assignments.push(assignment);
      await saveData(db);
      jsonResponse(res, 200, decorateAssignment(assignment, db.chars));
    } catch (e) {
      jsonResponse(res, 400, { error: '請求失敗' });
    }
    return;
  }

  // 管理員：更新任務
  if (pathname.startsWith('/api/admin/assignments/') && method === 'PUT') {
    const id = parseInt(pathname.split('/').pop());
    const a = db.assignments.find(x => x.id === id);
    if (!a) return jsonResponse(res, 404, { error: '任務不存在' });
    try {
      const { name, charIds, note, resetDone, userId } = await parseBody(req);
      if (name !== undefined) a.name = name.trim() || a.name;
      if (note !== undefined) a.note = note.trim();
      if (userId !== undefined) a.userId = parseInt(userId);
      if (Array.isArray(charIds)) {
        const validIds = new Set(db.chars.map(c => c.id));
        const cleanIds = charIds.filter(x => validIds.has(x));
        if (cleanIds.length > 0) a.charIds = cleanIds;
      }
      if (resetDone) a.done = {};
      a.updatedAt = new Date().toISOString();
      await saveData(db);
      jsonResponse(res, 200, decorateAssignment(a, db.chars));
    } catch (e) {
      jsonResponse(res, 400, { error: '請求失敗' });
    }
    return;
  }

  // 管理員：刪除任務
  if (pathname.startsWith('/api/admin/assignments/') && method === 'DELETE') {
    const id = parseInt(pathname.split('/').pop());
    const idx = db.assignments.findIndex(x => x.id === id);
    if (idx < 0) return jsonResponse(res, 404, { error: '任務不存在' });
    db.assignments.splice(idx, 1);
    await saveData(db);
    jsonResponse(res, 200, { ok: true });
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
