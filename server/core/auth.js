const crypto = require('crypto');
const { parseBody, jsonResponse, parseCookies, setSessionCookie } = require('./http');
const { generateId } = require('./ids');

const PUBLIC_API = new Set([
  '/api/register',
  '/api/login',
  '/api/logout',
  '/api/me',
  '/api/platform/tools'
]);

function createAuth({ db, saveData }) {
  const sessions = new Map();

  function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  function verifyPassword(password, hash) {
    return hashPassword(password) === hash;
  }

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

  function requireAuth(req) {
    const cookies = parseCookies(req);
    const sessionId = cookies['session'];
    if (!sessionId) return null;
    return getUserFromSession(sessionId);
  }

  async function handleAuthAPI(req, res, pathname, method) {
    if (pathname === '/api/register' && method === 'POST') {
      try {
        const { username, password } = await parseBody(req);
        if (!username || !password) {
          jsonResponse(res, 400, { error: '請填寫用戶名和密碼' });
          return true;
        }
        if (username.length < 2 || username.length > 20) {
          jsonResponse(res, 400, { error: '用戶名長度應為 2-20 字' });
          return true;
        }
        if (password.length < 4) {
          jsonResponse(res, 400, { error: '密碼長度至少 4 字' });
          return true;
        }
        if (db.users.find(u => u.username === username)) {
          jsonResponse(res, 400, { error: '用戶名已存在' });
          return true;
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
        await saveData();
        const sessionId = generateSessionId();
        const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
        sessions.set(sessionId, {
          user: { id: user.id, username: user.username, role: user.role },
          expires
        });
        setSessionCookie(res, sessionId, expires);
        jsonResponse(res, 201, { id: user.id, username: user.username, role: user.role });
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return true;
    }

    if (pathname === '/api/login' && method === 'POST') {
      try {
        const { username, password } = await parseBody(req);
        if (!username || !password) {
          jsonResponse(res, 400, { error: '請填寫用戶名和密碼' });
          return true;
        }
        const user = db.users.find(u => u.username === username);
        if (!user || !verifyPassword(password, user.password)) {
          jsonResponse(res, 401, { error: '用戶名或密碼錯誤' });
          return true;
        }
        user.lastLogin = new Date().toISOString();
        await saveData();
        const sessionId = generateSessionId();
        const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
        sessions.set(sessionId, {
          user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role, avatar: user.avatar || null },
          expires
        });
        setSessionCookie(res, sessionId, expires);
        jsonResponse(res, 200, { id: user.id, username: user.username, nickname: user.nickname, role: user.role, avatar: user.avatar || null });
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return true;
    }

    if (pathname === '/api/logout' && method === 'POST') {
      const cookies = parseCookies(req);
      const sessionId = cookies['session'];
      if (sessionId) sessions.delete(sessionId);
      res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
      jsonResponse(res, 200, { success: true });
      return true;
    }

    if (pathname === '/api/me' && method === 'GET') {
      const user = requireAuth(req);
      if (!user) {
        jsonResponse(res, 401, { error: '未登入' });
        return true;
      }
      const fullUser = db.users.find(u => u.id === user.id);
      if (!fullUser) {
        jsonResponse(res, 404, { error: '用戶不存在' });
        return true;
      }
      jsonResponse(res, 200, {
        id: fullUser.id,
        username: fullUser.username,
        nickname: fullUser.nickname || fullUser.username,
        role: fullUser.role,
        avatar: fullUser.avatar || null,
        createdAt: fullUser.createdAt || null
      });
      return true;
    }

    return false;
  }

  return {
    sessions,
    hashPassword,
    verifyPassword,
    generateSessionId,
    getUserFromSession,
    requireAuth,
    handleAuthAPI
  };
}

module.exports = { createAuth, PUBLIC_API };
