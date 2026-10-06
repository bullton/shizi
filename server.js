const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const BASE_DIR = __dirname;
const DATA_FILE = path.join(BASE_DIR, 'shizi-data.json');

// ===== 數據存儲 =====
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}
  return { users: [], progress: [], attempts: [] };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const db = {
  users: [],
  progress: [],
  attempts: [],
  chars: [],
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
db.config = savedData.config || { aiToken: '' };

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
        id: Date.now(),
        username,
        password: hashPassword(password),
        role: isFirstUser ? 'admin' : 'user',
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      saveData(db);
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

  // Public leaderboard (no auth required)
  if (pathname === '/api/leaderboard' && method === 'GET') {
    const userStats = {};
    db.progress.forEach(p => {
      if (!userStats[p.userId]) {
        const u = db.users.find(x => x.id === p.userId);
        userStats[p.userId] = {
          userId: p.userId,
          username: u ? u.username : '未知',
          nickname: u ? (u.nickname || u.username) : '未知',
          avatar: u ? (u.avatar || null) : null,
          charsKnown: 0,
          totalAttempts: 0,
          avgTime: 0
        };
      }
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

  // Admin-only char routes
  const adminUser = requireAuth(req, res);
  if (!adminUser) return jsonResponse(res, 401, { error: '請先登入' });
  if (adminUser.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });

  if (pathname === '/api/chars' && method === 'POST') {
    try {
      const { char, components, layout, hint } = await parseBody(req);
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
        createdAt: new Date().toISOString()
      };
      db.chars.push(newChar);
      saveData(db);
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
        const { char, components, layout, hint } = item;
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
          createdAt: new Date().toISOString()
        });
        results.added++;
      }
      saveData(db);
      jsonResponse(res, 200, results);
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
    saveData(db);
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
        'surround-3', 'left-right-right'
      ];
      const layoutDescs = {
        'left-right': '左右結構（左部 + 右部）',
        'top-bottom': '上下結構（上 + 下）',
        'top-bottom-bottom': '品字結構（頂部1個 + 底部2個並排）',
        'vertical-3': '三疊結構（3個上下堆疊）',
        'top-bottom-bottom-bottom': '四疊結構（4個上下堆疊）',
        'top-2-bottom': '上中下結構（頂部1個 + 中間2個並排 + 底部1個）',
        'surround': '包圍結構（外框包住內部）',
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

## 必須使用的 layout 值（只選一個）：
  ${layoutList}

## 要求：
1. 從拆字選項中選擇視覺上最準確的一個
2. 如果某個選項的部件可以正確組合成該字符的視覺結構，就選它
3. layout 值必須嚴格使用上面列表中的一個英文值
4. 如果字符部件多於4個，優先選擇最接近視覺結構的 layout

回复格式（嚴格只用JSON，無多餘文字）：
{
  "recommended": 選擇的序號(整數, 從1開始),
  "layout": "上方的layout英文值",
  "reason": "簡短中文解釋為何選擇此拆分和結構"
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
          max_tokens: 1024,
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
        // Fallback: try to guess from decomposition
        const chosenDecomp = decompositions[(result.recommended || 1) - 1];
        if (chosenDecomp) {
          result.layout = 'top-bottom'; // safe fallback
        } else {
          return jsonResponse(res, 500, { error: 'AI 返回了無效的 layout: ' + result.layout });
        }
      }

      // Validate recommended index
      const recIdx = (result.recommended || 1) - 1;
      if (recIdx < 0 || recIdx >= decompositions.length) {
        result.recommended = 1;
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

  if (pathname === '/api/progress' && method === 'GET') {
    const progress = db.progress.filter(p => p.userId === user.id)
      .sort((a, b) => new Date(b.lastPracticed) - new Date(a.lastPracticed));
    jsonResponse(res, 200, progress);
    return;
  }

  if (pathname === '/api/progress' && method === 'POST') {
    try {
      const { char, charId, responseTime, correct } = await parseBody(req);
      if (!char) return jsonResponse(res, 400, { error: '缺少字符' });

      const now = new Date().toISOString();

      // Insert attempt
      db.attempts.push({
        id: Date.now(),
        userId: user.id,
        char,
        charId: charId || null,
        responseTime: responseTime || 0,
        correct: correct ? 1 : 0,
        practicedAt: now
      });

      // Update or create progress
      const existingIdx = db.progress.findIndex(p => p.userId === user.id && p.char === char);
      if (existingIdx >= 0) {
        const p = db.progress[existingIdx];
        p.attempts = (p.attempts || 0) + 1;
        p.totalTime = (p.totalTime || 0) + (responseTime || 0);
        p.avgTime = p.totalTime / p.attempts;
        p.bestTime = p.bestTime ? Math.min(p.bestTime, responseTime || 0) : (responseTime || 0);
        p.lastPracticed = now;
      } else {
        db.progress.push({
          id: Date.now(),
          userId: user.id,
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
    const userProgress = db.progress.filter(p => p.userId === user.id);
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
        a.userId === user.id && a.practicedAt && a.practicedAt.startsWith(dateStr)
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

  // Admin routes
  if (pathname.startsWith('/api/admin/') && user.role !== 'admin') {
    return jsonResponse(res, 403, { error: '需要管理員權限' });
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    const users = db.users.map(u => {
      const userProgress = db.progress.filter(p => p.userId === u.id);
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
          : 0
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
    jsonResponse(res, 200, {
      user: { id: targetUser.id, username: targetUser.username, nickname: targetUser.nickname || targetUser.username, role: targetUser.role, createdAt: targetUser.createdAt },
      progress,
      attempts
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
