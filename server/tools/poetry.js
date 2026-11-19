const fs = require('fs');
const path = require('path');
const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');

const STEPS = ['read', 'understand', 'order', 'fill', 'recite', 'dictation'];
const STEP_LABELS = {
  read: '聽讀',
  understand: '懂意',
  order: '排句',
  fill: '補字',
  recite: '背誦',
  dictation: '默寫'
};
const MASTERY_LINE = 80;
const HK_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function hkDate(value) {
  return HK_DATE.format(value ? new Date(value) : new Date());
}

function hanChars(value) {
  return String(value == null ? '' : value).match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || [];
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function createPoetryTool({ rootDir, toolDir, db, saveData: storeSave, auth }) {
  const saveData = () => storeSave();
  const bank = JSON.parse(fs.readFileSync(path.join(toolDir, 'poems.json'), 'utf8'));
  const poems = Array.isArray(bank.poems) ? bank.poems : [];
  const themes = Array.isArray(bank.themes) ? bank.themes : [];
  const poemById = new Map(poems.map(poem => [String(poem.id), poem]));
  const themeById = new Map(themes.map(theme => [String(theme.id), theme]));

  if (!db.poetry || typeof db.poetry !== 'object') db.poetry = {};
  if (!Array.isArray(db.poetry.progress)) db.poetry.progress = [];
  if (!Array.isArray(db.poetry.attempts)) db.poetry.attempts = [];

  function requireAuth(req, res) {
    const user = auth.requireAuth(req);
    if (!user) {
      jsonResponse(res, 401, { error: '請先登入' });
      return null;
    }
    return user;
  }

  function emptySteps() {
    return STEPS.reduce((steps, step) => {
      steps[step] = false;
      return steps;
    }, {});
  }

  function findProgress(userId, poemId) {
    return db.poetry.progress.find(record =>
      String(record.userId) === String(userId) && String(record.poemId) === String(poemId)
    ) || null;
  }

  function ensureProgress(userId, poemId) {
    let record = findProgress(userId, poemId);
    if (!record) {
      record = {
        userId,
        poemId,
        steps: emptySteps(),
        bestDictation: 0,
        dictationAttempts: 0,
        errors: [],
        lastPracticedAt: null,
        masteredAt: null,
        createdAt: new Date().toISOString()
      };
      db.poetry.progress.push(record);
    }
    if (!record.steps || typeof record.steps !== 'object') record.steps = emptySteps();
    STEPS.forEach(step => {
      if (typeof record.steps[step] !== 'boolean') record.steps[step] = false;
    });
    if (!Array.isArray(record.errors)) record.errors = [];
    return record;
  }

  function stepsDone(record) {
    return STEPS.filter(step => record && record.steps && record.steps[step]).length;
  }

  function syncMastery(record) {
    const complete = STEPS.every(step => record.steps[step]);
    if (complete && Number(record.bestDictation) >= MASTERY_LINE) {
      if (!record.masteredAt) record.masteredAt = new Date().toISOString();
    } else {
      record.masteredAt = null;
    }
  }

  function summaryOf(poem, record) {
    const safe = record || { steps: emptySteps(), bestDictation: 0, errors: [] };
    return {
      id: poem.id,
      title: poem.title,
      author: poem.author,
      dynasty: poem.dynasty,
      theme: poem.theme || (themeById.get(poem.themeId) || {}).title || '',
      themeId: poem.themeId || 'all',
      level: poem.level || '',
      tags: Array.isArray(poem.tags) ? poem.tags.slice() : [],
      firstLine: poem.lines && poem.lines[0] ? poem.lines[0].text : '',
      lineCount: Array.isArray(poem.lines) ? poem.lines.length : 0,
      steps: { ...emptySteps(), ...(safe.steps || {}) },
      stepsDone: stepsDone(safe),
      mastered: !!safe.masteredAt,
      bestDictation: Number(safe.bestDictation) || 0,
      dictationAttempts: Number(safe.dictationAttempts) || 0,
      errors: Array.isArray(safe.errors) ? safe.errors.slice(0, 30) : [],
      lastPracticedAt: safe.lastPracticedAt || null,
      masteredAt: safe.masteredAt || null
    };
  }

  function userRecords(userId) {
    const map = new Map();
    db.poetry.progress.forEach(record => {
      if (String(record.userId) === String(userId) && poemById.has(String(record.poemId))) {
        map.set(String(record.poemId), record);
      }
    });
    return map;
  }

  function dailyPoemId() {
    if (!poems.length) return null;
    const date = hkDate();
    let hash = 0;
    for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return poems[hash % poems.length].id;
  }

  function userAttempts(userId) {
    return db.poetry.attempts.filter(attempt => String(attempt.userId) === String(userId));
  }

  function overview(userId) {
    const records = userRecords(userId);
    const summaries = poems.map(poem => summaryOf(poem, records.get(String(poem.id))));
    const attempted = summaries.filter(item => item.stepsDone > 0 || item.dictationAttempts > 0);
    const mastered = summaries.filter(item => item.mastered);
    const learning = attempted.filter(item => !item.mastered);
    const attempts = userAttempts(userId);
    const days = new Set();
    for (let i = 0; i < 7; i += 1) {
      days.add(hkDate(Date.now() - i * 24 * 60 * 60 * 1000));
    }
    const recent7 = attempts.filter(attempt => days.has(hkDate(attempt.practicedAt))).length;
    const totalChars = attempts.reduce((sum, attempt) => sum + (Number(attempt.total) || 0), 0);
    const correctChars = attempts.reduce((sum, attempt) => sum + (Number(attempt.correct) || 0), 0);
    const review = mastered
      .filter(item => {
        if (!item.lastPracticedAt) return false;
        return Date.now() - Date.parse(item.lastPracticedAt) >= 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => String(a.lastPracticedAt).localeCompare(String(b.lastPracticedAt)))
      .slice(0, 4);

    return {
      stats: {
        totalPoems: poems.length,
        mastered: mastered.length,
        learning: learning.length,
        attempted: attempted.length,
        stepsDone: summaries.reduce((sum, item) => sum + item.stepsDone, 0),
        accuracy: totalChars ? round1((correctChars / totalChars) * 100) : 0,
        recent7,
        lastPracticedAt: attempted
          .map(item => item.lastPracticedAt)
          .filter(Boolean)
          .sort()
          .pop() || null
      },
      dailyId: dailyPoemId(),
      review,
      themes: themes.map(theme => ({
        ...theme,
        count: theme.id === 'all' ? poems.length : poems.filter(poem => poem.themeId === theme.id).length
      })),
      poems: summaries,
      stepLabels: STEP_LABELS
    };
  }

  function poemPayload(poem, userId) {
    const record = findProgress(userId, poem.id);
    return {
      ...summaryOf(poem, record),
      lines: poem.lines.map(line => ({
        text: line.text,
        pinyin: line.pinyin || '',
        translation: line.translation || '',
        note: line.note || ''
      })),
      background: poem.background || '',
      appreciation: poem.appreciation || '',
      keyLine: Number.isFinite(Number(poem.keyLine)) ? Number(poem.keyLine) : 0,
      keyLineNote: poem.keyLineNote || ''
    };
  }

  function compareLine(expectedText, givenText) {
    const expected = hanChars(expectedText);
    const given = hanChars(givenText);
    const total = Math.max(expected.length, given.length);
    const cells = [];
    let correct = 0;
    const errors = [];
    for (let i = 0; i < total; i += 1) {
      const want = expected[i] || '';
      const got = given[i] || '';
      const ok = want === got;
      if (ok) correct += 1;
      else if (want) errors.push(want);
      cells.push({ expected: want, given: got, ok });
    }
    return { expected: expectedText, given: String(givenText || ''), cells, correct, total: expected.length, errors };
  }

  async function markStep(user, body) {
    const poem = poemById.get(String(body.poemId || ''));
    const step = String(body.step || '');
    if (!poem) return { status: 404, body: { error: '找不到這首詩' } };
    if (!STEPS.includes(step)) return { status: 400, body: { error: '未知的學習步驟' } };
    const record = ensureProgress(user.id, poem.id);
    record.steps[step] = true;
    record.lastPracticedAt = new Date().toISOString();
    syncMastery(record);
    await saveData();
    return {
      status: 200,
      body: {
        progress: summaryOf(poem, record),
        mastered: !!record.masteredAt
      }
    };
  }

  async function submitDictation(user, body) {
    const poem = poemById.get(String(body.poemId || ''));
    if (!poem) return { status: 404, body: { error: '找不到這首詩' } };
    const givenLines = Array.isArray(body.lines) ? body.lines : [];
    const results = poem.lines.map((line, index) => compareLine(line.text, givenLines[index] || ''));
    const total = results.reduce((sum, item) => sum + item.total, 0);
    const correct = results.reduce((sum, item) => sum + item.correct, 0);
    const accuracy = total ? round1((correct / total) * 100) : 0;
    const errors = Array.from(new Set(results.reduce((list, item) => list.concat(item.errors), []))).slice(0, 30);
    const passed = accuracy >= MASTERY_LINE;
    const attemptedAt = new Date().toISOString();
    const record = ensureProgress(user.id, poem.id);
    record.dictationAttempts = (Number(record.dictationAttempts) || 0) + 1;
    record.bestDictation = Math.max(Number(record.bestDictation) || 0, accuracy);
    record.errors = errors;
    record.lastPracticedAt = attemptedAt;
    if (passed) record.steps.dictation = true;
    syncMastery(record);
    db.poetry.attempts.push({
      id: generateId(new Set(db.poetry.attempts.map(attempt => attempt.id))),
      userId: user.id,
      poemId: poem.id,
      accuracy,
      correct,
      total,
      duration: Math.max(0, Math.min(30 * 60 * 1000, Number(body.duration) || 0)),
      practicedAt: attemptedAt
    });
    await saveData();
    return {
      status: 200,
      body: {
        accuracy,
        correct,
        total,
        passed,
        passLine: MASTERY_LINE,
        lines: results,
        errors,
        progress: summaryOf(poem, record),
        mastered: !!record.masteredAt
      }
    };
  }

  function stats() {
    return (db.users || []).map(user => {
      const data = overview(user.id);
      const attempts = userAttempts(user.id);
      const timed = attempts.filter(attempt => Number(attempt.duration) > 0);
      const avgTime = timed.length
        ? timed.reduce((sum, attempt) => sum + Number(attempt.duration), 0) / timed.length
        : 0;
      return {
        userId: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar || null,
        score: data.stats.mastered * 10 + data.stats.stepsDone,
        mastered: data.stats.mastered,
        totalQuestions: data.stats.totalPoems,
        masteryRate: data.stats.totalPoems
          ? round1((data.stats.mastered / data.stats.totalPoems) * 100)
          : 0,
        attempted: data.stats.attempted,
        attempts: attempts.length,
        accuracy: data.stats.accuracy,
        avgTime,
        recent7: data.stats.recent7
      };
    });
  }

  async function handleAPI(req, res, parsedUrl) {
    const pathname = parsedUrl.pathname;
    const method = req.method;

    if (pathname === '/api/overview' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      jsonResponse(res, 200, overview(user.id));
      return;
    }

    const poemMatch = pathname.match(/^\/api\/poems\/([A-Za-z0-9_-]+)$/);
    if (poemMatch && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      const poem = poemById.get(poemMatch[1]);
      if (!poem) {
        jsonResponse(res, 404, { error: '找不到這首詩' });
        return;
      }
      jsonResponse(res, 200, poemPayload(poem, user.id));
      return;
    }

    if (pathname === '/api/progress' && method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;
      try {
        const result = await markStep(user, await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/dictation' && method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;
      try {
        const result = await submitDictation(user, await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/admin/stats' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') {
        jsonResponse(res, 403, { error: '需要管理員權限' });
        return;
      }
      jsonResponse(res, 200, stats());
      return;
    }

    jsonResponse(res, 404, { error: 'API Not Found' });
  }

  return { id: 'poetry', handleAPI, stats };
}

module.exports = { id: 'poetry', create: createPoetryTool };
