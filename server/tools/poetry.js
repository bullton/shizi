const fs = require('fs');
const path = require('path');
const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { listUsers, resolveUserIds } = require('../core/delegation');
const { parseCsv } = require('../core/csv');

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

function percent(part, total) {
  return total ? Math.round((Number(part || 0) / total) * 1000) / 10 : 0;
}

function createPoetryTool({ rootDir, toolDir, db, saveData: storeSave, auth }) {
  const saveData = () => storeSave();
  const bank = JSON.parse(fs.readFileSync(path.join(toolDir, 'poems.json'), 'utf8'));
  const seedPoems = Array.isArray(bank.poems) ? bank.poems : [];
  const seedThemes = Array.isArray(bank.themes) ? bank.themes : [];
  let poems = [];
  let themes = [];
  let poemById = new Map();
  let themeById = new Map();
  let customIds = new Set();

  if (!db.poetry || typeof db.poetry !== 'object') db.poetry = {};
  if (!Array.isArray(db.poetry.progress)) db.poetry.progress = [];
  if (!Array.isArray(db.poetry.attempts)) db.poetry.attempts = [];
  if (!Array.isArray(db.poetry.customPoems)) db.poetry.customPoems = [];
  if (!Array.isArray(db.poetry.tasks)) db.poetry.tasks = [];

  function rebuildCatalog() {
    const list = seedPoems.map(poem => ({ ...poem }));
    const positions = new Map(list.map((poem, index) => [String(poem.id), index]));
    db.poetry.customPoems.forEach(poem => {
      const key = String(poem.id);
      if (positions.has(key)) list[positions.get(key)] = poem;
      else {
        positions.set(key, list.length);
        list.push(poem);
      }
    });
    poems = list;
    poemById = new Map(poems.map(poem => [String(poem.id), poem]));
    customIds = new Set(db.poetry.customPoems.map(poem => String(poem.id)));
    const themeList = seedThemes.map(theme => ({ ...theme }));
    const seen = new Set(themeList.map(theme => String(theme.id)));
    poems.forEach(poem => {
      const themeId = String(poem.themeId || 'other');
      if (seen.has(themeId)) return;
      seen.add(themeId);
      themeList.push({ id: themeId, title: poem.theme || '其他', desc: '' });
    });
    themes = themeList;
    themeById = new Map(themes.map(theme => [String(theme.id), theme]));
  }

  rebuildCatalog();

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
      theme: poem.theme || (themeById.get(String(poem.themeId || '')) || {}).title || '',
      custom: customIds.has(String(poem.id)),
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

  function errorReview(userId) {
    const items = [];
    db.poetry.progress.forEach(record => {
      if (String(record.userId) !== String(userId)) return;
      const poem = poemById.get(String(record.poemId));
      if (!poem || !Array.isArray(record.errors) || !record.errors.length) return;
      const errorSet = new Set(record.errors);
      const lines = poem.lines.map((line, lineIndex) => {
        const chars = Array.from(line.text);
        const blanks = [];
        chars.forEach((char, charIndex) => {
          if (errorSet.has(char)) blanks.push(charIndex);
        });
        return blanks.length ? { lineIndex, text: line.text, blanks } : null;
      }).filter(Boolean);
      if (!lines.length) return;
      items.push({
        poemId: poem.id,
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        errors: record.errors.slice(0, 12),
        lines,
        lastPracticedAt: record.lastPracticedAt || null
      });
    });
    return items
      .sort((a, b) => String(b.lastPracticedAt || '').localeCompare(String(a.lastPracticedAt || '')))
      .slice(0, 6);
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
      errorReview: errorReview(userId),
      themes: themes.map(theme => ({
        ...theme,
        count: theme.id === 'all' ? poems.length : poems.filter(poem => poem.themeId === theme.id).length
      })),
      poems: summaries,
      tasks: taskForUser(userId),
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

  async function clearErrors(user, body) {
    const poem = poemById.get(String(body.poemId || ''));
    if (!poem) return { status: 404, body: { error: '找不到這首詩' } };
    const chars = new Set((Array.isArray(body.chars) ? body.chars : []).map(String));
    const record = findProgress(user.id, poem.id);
    if (record && chars.size) record.errors = record.errors.filter(char => !chars.has(char));
    await saveData();
    return { status: 200, body: { errors: record ? record.errors : [] } };
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
        learning: data.stats.learning,
        stepsDone: data.stats.stepsDone,
        attempts: attempts.length,
        accuracy: data.stats.accuracy,
        avgTime,
        recent7: data.stats.recent7,
        lastPracticedAt: data.stats.lastPracticedAt
      };
    });
  }


  function taskGroupId(task) {
    return task.groupId || task.task_id;
  }

  function findTask(taskId) {
    const key = String(taskId || '');
    return db.poetry.tasks.find(task => String(task.task_id) === key) ||
      db.poetry.tasks.find(task => String(taskGroupId(task)) === key) ||
      null;
  }

  function taskPoemList(task) {
    return (task.poem_ids || []).map(id => poemById.get(String(id))).filter(Boolean);
  }

  function taskProgress(task, userId) {
    const list = taskPoemList(task);
    let mastered = 0;
    let attempted = 0;
    let steps = 0;
    let dictationSum = 0;
    let lastPracticedAt = null;
    let todayPracticed = 0;
    const passScore = Math.max(60, Math.min(100, Number(task.pass_score) || MASTERY_LINE));
    const today = hkDate();
    list.forEach(poem => {
      const record = findProgress(userId, poem.id);
      if (!record) return;
      const done = stepsDone(record);
      steps += done;
      dictationSum += Number(record.bestDictation) || 0;
      if (done > 0 || Number(record.dictationAttempts) > 0) attempted += 1;
      if (done === STEPS.length && Number(record.bestDictation) >= passScore) mastered += 1;
      if (record.lastPracticedAt && hkDate(record.lastPracticedAt) === today) todayPracticed += 1;
      if (record.lastPracticedAt && (!lastPracticedAt || String(record.lastPracticedAt) > String(lastPracticedAt))) {
        lastPracticedAt = record.lastPracticedAt;
      }
    });
    const total = list.length;
    return {
      total,
      attempted,
      mastered,
      stepsDone: steps,
      progress: percent(mastered, total),
      accuracy: attempted ? round1(dictationSum / attempted) : 0,
      todayPracticed,
      lastPracticedAt
    };
  }

  function serializeTask(task, userId) {
    const progress = taskProgress(task, userId);
    const list = taskPoemList(task);
    const passScore = Math.max(60, Math.min(100, Number(task.pass_score) || MASTERY_LINE));
    const next = list.find(poem => {
      const record = findProgress(userId, poem.id);
      return !record || stepsDone(record) < STEPS.length || Number(record.bestDictation) < passScore;
    });
    return {
      task_id: task.task_id,
      groupId: taskGroupId(task),
      task_name: task.task_name,
      poem_ids: (task.poem_ids || []).slice(),
      poems: list.map(poem => ({ id: poem.id, title: poem.title, author: poem.author, dynasty: poem.dynasty })),
      scope: task.scope || 'selected',
      userId: task.userId,
      is_archived: !!task.is_archived,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt || task.createdAt,
      nextPoemId: next ? next.id : (list[0] ? list[0].id : null),
      passScore,
      dailyGoal: Math.max(1, Math.min(10, Number(task.daily_goal) || 2)),
      ...progress
    };
  }

  function taskForUser(userId) {
    return db.poetry.tasks
      .filter(task => String(task.userId) === String(userId) && !task.is_archived)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(task => serializeTask(task, userId));
  }

  function adminTaskGroups() {
    const users = new Map(listUsers(db).map(user => [String(user.id), user]));
    const groups = new Map();
    db.poetry.tasks
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .forEach(task => {
        const key = String(taskGroupId(task));
        let group = groups.get(key);
        if (!group) {
          group = {
            groupId: key,
            task_name: task.task_name,
            poem_ids: (task.poem_ids || []).slice(),
            pass_score: Math.max(60, Math.min(100, Number(task.pass_score) || MASTERY_LINE)),
            daily_goal: Math.max(1, Math.min(10, Number(task.daily_goal) || 2)),
            scope: task.scope || 'selected',
            is_archived: !!task.is_archived,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt || task.createdAt,
            users: []
          };
          groups.set(key, group);
        }
        const user = users.get(String(task.userId)) || { nickname: '（未知用戶）', username: '' };
        const progress = taskProgress(task, task.userId);
        group.users.push({
          task_id: task.task_id,
          userId: task.userId,
          username: user.username,
          nickname: user.nickname || user.username || '（未知用戶）',
          ...progress
        });
      });
    return Array.from(groups.values()).map(group => {
      const total = group.users.length;
      const mastered = group.users.reduce((sum, user) => sum + user.mastered, 0);
      return {
        ...group,
        total,
        mastered,
        progress: total
          ? round1(group.users.reduce((sum, user) => sum + Number(user.progress || 0), 0) / total)
          : 0
      };
    });
  }

  async function createTasks(user, body) {
    if (user.role !== 'admin') return { status: 403, body: { error: '只有管理員可以建立任務' } };
    const name = String(body.task_name || '').trim();
    if (!name || name.length > 40) return { status: 400, body: { error: '任務名稱需為 1-40 字' } };
    const poemIds = Array.from(new Set((Array.isArray(body.poem_ids) ? body.poem_ids : []).map(String)))
      .filter(id => poemById.has(id));
    if (!poemIds.length) return { status: 400, body: { error: '請至少選擇一首詩' } };
    const rawTargets = body.userIds !== undefined ? body.userIds : body.userId;
    const hasTargets = Array.isArray(rawTargets)
      ? rawTargets.length > 0
      : rawTargets !== undefined && rawTargets !== null && rawTargets !== '';
    let resolved = resolveUserIds(db, hasTargets ? rawTargets : []);
    if (!hasTargets && !resolved.error) {
      const children = listUsers(db).filter(item => item.role !== 'admin');
      if (children.length) resolved = { userIds: children.map(item => item.id), all: true };
    }
    if (resolved.error) return { status: 400, body: { error: resolved.error } };
    const passScore = Math.max(60, Math.min(100, parseInt(body.pass_score, 10) || MASTERY_LINE));
    const dailyGoal = Math.max(1, Math.min(10, parseInt(body.daily_goal, 10) || 2));
    const groupId = 'PT_' + generateId(new Set(db.poetry.tasks.map(task => String(taskGroupId(task)))));
    const created = [];
    const now = new Date().toISOString();
    resolved.userIds.forEach(targetId => {
      const task = {
        task_id: 'P_' + generateId(new Set(db.poetry.tasks.map(item => String(item.task_id)))),
        groupId,
        userId: targetId,
        scope: resolved.all ? 'all' : 'selected',
        createdBy: user.id,
        task_name: name,
        poem_ids: poemIds,
        pass_score: passScore,
        daily_goal: dailyGoal,
        is_archived: false,
        createdAt: now
      };
      db.poetry.tasks.push(task);
      created.push(task);
    });
    await saveData();
    return {
      status: 201,
      body: {
        groupId,
        created: created.length,
        tasks: created.map(task => serializeTask(task, task.userId))
      }
    };
  }

  async function updateTasks(user, taskId, body) {
    if (user.role !== 'admin') return { status: 403, body: { error: '只有管理員可以修改任務' } };
    const task = findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    const groupId = String(taskGroupId(task));
    const targets = db.poetry.tasks.filter(item => String(taskGroupId(item)) === groupId);
    const name = body.task_name !== undefined ? String(body.task_name).trim() : task.task_name;
    if (!name || name.length > 40) return { status: 400, body: { error: '任務名稱需為 1-40 字' } };
    let poemIds = null;
    if (body.poem_ids !== undefined) {
      poemIds = Array.from(new Set((Array.isArray(body.poem_ids) ? body.poem_ids : []).map(String)))
        .filter(id => poemById.has(id));
      if (!poemIds.length) return { status: 400, body: { error: '請至少保留一首詩' } };
    }
    const updatedAt = new Date().toISOString();
    targets.forEach(item => {
      item.task_name = name;
      if (poemIds) item.poem_ids = poemIds;
      if (body.pass_score !== undefined) item.pass_score = Math.max(60, Math.min(100, parseInt(body.pass_score, 10) || item.pass_score || MASTERY_LINE));
      if (body.daily_goal !== undefined) item.daily_goal = Math.max(1, Math.min(10, parseInt(body.daily_goal, 10) || item.daily_goal || 2));
      if (body.is_archived !== undefined) item.is_archived = !!body.is_archived;
      item.updatedAt = updatedAt;
    });
    await saveData();
    return {
      status: 200,
      body: {
        groupId,
        updated: targets.length,
        tasks: targets.map(item => serializeTask(item, item.userId))
      }
    };
  }

  async function deleteTasks(user, taskId) {
    if (user.role !== 'admin') return { status: 403, body: { error: '只有管理員可以刪除任務' } };
    const task = findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    const groupId = String(taskGroupId(task));
    const before = db.poetry.tasks.length;
    db.poetry.tasks = db.poetry.tasks.filter(item => String(taskGroupId(item)) !== groupId);
    await saveData();
    return { status: 200, body: { ok: true, removedTasks: before - db.poetry.tasks.length } };
  }

  function textValue(value) {
    return String(value == null ? '' : value).trim();
  }

  function splitList(value) {
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
    return textValue(value).split(/[|｜,，\n]/).map(textValue).filter(Boolean);
  }

  function splitLines(value) {
    if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
    return textValue(value).split(/[|｜\n]/).map(textValue).filter(Boolean);
  }

  function normalizePoem(raw, rowNumber) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { errors: ['第 ' + rowNumber + ' 首：格式不正確'] };
    }
    const warnings = [];
    const title = textValue(raw.title);
    if (!title) return { errors: ['第 ' + rowNumber + ' 首：缺少 title（詩題）'] };
    const author = textValue(raw.author);
    if (!author) return { errors: ['第 ' + rowNumber + ' 首：缺少 author（作者）'] };
    let lines = [];
    if (Array.isArray(raw.lines)) {
      lines = raw.lines.map(entry => {
        if (typeof entry === 'string') return { text: textValue(entry), pinyin: '', translation: '', note: '' };
        return {
          text: textValue(entry && (entry.text || entry.line)),
          pinyin: textValue(entry && entry.pinyin),
          translation: textValue(entry && entry.translation),
          note: textValue(entry && entry.note)
        };
      }).filter(line => line.text);
    } else if (raw.lines !== undefined) {
      const texts = splitLines(raw.lines);
      const pinyins = splitLines(raw.pinyin);
      const translations = splitLines(raw.translation || raw.translations);
      const notes = splitLines(raw.note || raw.notes);
      lines = texts.map((text, index) => ({
        text,
        pinyin: pinyins[index] || '',
        translation: translations[index] || '',
        note: notes[index] || ''
      }));
    }
    if (!lines.length) return { errors: ['第 ' + rowNumber + ' 首：缺少 lines（詩句）'] };
    lines.forEach((line, index) => {
      if (!line.pinyin) warnings.push('第 ' + rowNumber + ' 首第 ' + (index + 1) + ' 句沒有拼音');
      if (!line.translation) warnings.push('第 ' + rowNumber + ' 首第 ' + (index + 1) + ' 句沒有今譯');
    });
    let themeId = textValue(raw.themeId || raw.theme_id);
    const themeTitle = textValue(raw.theme);
    if (!themeId || !themeById.has(themeId)) {
      const matched = themes.find(theme => theme.title === themeTitle);
      themeId = matched ? matched.id : 'other';
    }
    if (themeId === 'other') warnings.push('第 ' + rowNumber + ' 首：主題未對應現有分類，已歸入「其他」');
    let id = textValue(raw.id || raw.poem_id || raw.poemId);
    if (!id) {
      id = 'p' + generateId(new Set(poems.map(poem => String(poem.id))));
      warnings.push('第 ' + rowNumber + ' 首：沒有 id，已自動生成 ' + id);
    } else if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      id = id.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || ('p' + generateId(new Set(poems.map(poem => String(poem.id)))));
      warnings.push('第 ' + rowNumber + ' 首：id 只保留英數、底線和連字號');
    }
    const keyLine = Math.max(0, Math.min(lines.length - 1, parseInt(raw.keyLine, 10) || 0));
    const level = textValue(raw.level) || '小學';
    return {
      value: {
        id,
        title,
        author,
        dynasty: textValue(raw.dynasty) || '未知',
        themeId,
        theme: themeId === 'other' ? (themeTitle || '其他') : ((themeById.get(themeId) || {}).title || themeTitle || '其他'),
        level,
        tags: splitList(raw.tags),
        lines,
        background: textValue(raw.background),
        appreciation: textValue(raw.appreciation),
        keyLine,
        keyLineNote: textValue(raw.keyLineNote || raw.key_line_note)
      },
      warnings
    };
  }

  function parsePoemImport(text) {
    const source = String(text || '').trim();
    if (!source) return { items: [], errors: ['請先貼上或上傳詩單內容'], warnings: [] };
    let rows = null;
    try {
      const parsed = JSON.parse(source);
      rows = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.poems) ? parsed.poems : null;
      if (!rows) return { items: [], errors: ['JSON 需為詩歌陣列，或包含 poems 陣列'], warnings: [] };
    } catch (error) {
      rows = parseCsv(source);
    }
    if (!Array.isArray(rows) || !rows.length) return { items: [], errors: ['找不到可匯入的詩歌'], warnings: [] };
    const items = [];
    const errors = [];
    const warnings = [];
    const seen = new Set();
    rows.forEach((raw, index) => {
      const result = normalizePoem(raw, index + 1);
      if (result.errors) {
        errors.push(...result.errors);
        return;
      }
      if (seen.has(String(result.value.id))) {
        errors.push('第 ' + (index + 1) + ' 首：id「' + result.value.id + '」重複');
        return;
      }
      seen.add(String(result.value.id));
      items.push(result.value);
      warnings.push(...result.warnings);
    });
    return { items, errors, warnings };
  }

  function importPreview(text) {
    const result = parsePoemImport(text);
    return {
      items: result.items.map(poem => ({
        id: poem.id,
        title: poem.title,
        author: poem.author,
        dynasty: poem.dynasty,
        theme: poem.theme,
        lineCount: poem.lines.length,
        incomplete: poem.lines.filter(line => !line.pinyin || !line.translation).length
      })),
      errors: result.errors,
      warnings: result.warnings
    };
  }

  async function importPoems(text) {
    const result = parsePoemImport(text);
    if (result.errors.length) return { status: 400, body: { error: '詩單有錯誤，請先修正', errors: result.errors } };
    if (!result.items.length) return { status: 400, body: { error: '沒有可匯入的詩歌' } };
    const index = new Map(db.poetry.customPoems.map((poem, position) => [String(poem.id), position]));
    let added = 0;
    let updated = 0;
    result.items.forEach(poem => {
      const key = String(poem.id);
      if (index.has(key)) {
        db.poetry.customPoems[index.get(key)] = poem;
        updated += 1;
      } else {
        index.set(key, db.poetry.customPoems.length);
        db.poetry.customPoems.push(poem);
        added += 1;
      }
    });
    rebuildCatalog();
    await saveData();
    return {
      status: 200,
      body: {
        added,
        updated,
        total: result.items.length,
        warnings: result.warnings,
        poems: result.items.map(poem => ({ id: poem.id, title: poem.title, author: poem.author, theme: poem.theme }))
      }
    };
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

    if (pathname === '/api/tasks' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      jsonResponse(res, 200, taskForUser(user.id));
      return;
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;
      try {
        const result = await createTasks(user, await parseBody(req));
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && (method === 'PUT' || method === 'DELETE')) {
      const user = requireAuth(req, res);
      if (!user) return;
      try {
        const result = method === 'PUT'
          ? await updateTasks(user, taskMatch[1], await parseBody(req))
          : await deleteTasks(user, taskMatch[1]);
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/admin/tasks' && method === 'GET') {
      const user = requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') {
        jsonResponse(res, 403, { error: '需要管理員權限' });
        return;
      }
      jsonResponse(res, 200, adminTaskGroups());
      return;
    }

    if (pathname === '/api/admin/poems/preview' && method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') {
        jsonResponse(res, 403, { error: '需要管理員權限' });
        return;
      }
      try {
        const body = await parseBody(req);
        jsonResponse(res, 200, importPreview(body.text || ''));
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/admin/poems/import' && method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;
      if (user.role !== 'admin') {
        jsonResponse(res, 403, { error: '需要管理員權限' });
        return;
      }
      try {
        const body = await parseBody(req);
        const result = await importPoems(body.text || '');
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/errors/clear' && method === 'POST') {
      const user = requireAuth(req, res);
      if (!user) return;
      try {
        const result = await clearErrors(user, await parseBody(req));
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
