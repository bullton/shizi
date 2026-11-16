const fs = require('fs');
const path = require('path');
const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { createDrill, shuffle } = require('../core/drill');
const { listUsers, resolveUserIds } = require('../core/delegation');

const SEED_VERSION = 3;
const THEME_ORDER = [
  'nature', 'food', 'body', 'family', 'school', 'home',
  'city', 'sport', 'emotion', 'time', 'action', 'describe', 'core'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createSpellTool({ rootDir, toolDir, db, saveData: storeSave, dataExists, auth }) {
  const saveData = () => storeSave();

  function requireAuth(req, res) {
    const user = auth.requireAuth(req);
    if (!user) {
      jsonResponse(res, 401, { error: '請先登入' });
      return null;
    }
    return user;
  }

  const wordsPath = path.join(toolDir, 'words.json');
  if (!fs.existsSync(wordsPath)) {
    throw new Error('[spell] 找不到 tools/spell/words.json，請先執行 scripts/spell/build-words.js');
  }
  const wordsBundle = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const wordList = Array.isArray(wordsBundle.words) ? wordsBundle.words : [];

  const themeCounts = new Map();
  const themeLabels = new Map();
  wordList.forEach(word => {
    themeCounts.set(word.theme, (themeCounts.get(word.theme) || 0) + 1);
    if (!themeLabels.has(word.theme)) themeLabels.set(word.theme, word.themeLabel || word.theme);
  });

  const nodes = THEME_ORDER
    .filter(theme => themeCounts.has(theme))
    .map((theme, index) => ({
      node_id: theme,
      title: themeLabels.get(theme) || theme,
      category: '主題',
      dimension: theme,
      order: index,
      wordCount: themeCounts.get(theme) || 0
    }));

  function wordToQuestion(word, now) {
    return {
      question_id: word.id,
      node_id: word.theme,
      stem: word.word,
      word: word.word,
      syllables: word.syllables.slice(),
      ipa: word.ipa || '',
      meaning: word.meaning || '',
      pos: word.pos || '',
      posLabel: word.posLabel || '',
      definition: word.definition || '',
      forms: Array.isArray(word.forms) ? word.forms.map(form => ({ ...form })) : [],
      level: word.level,
      themeLabel: word.themeLabel || word.theme,
      order: word.order,
      example: word.example ? { ...word.example } : null,
      status: true,
      createdAt: now
    };
  }

  const drill = createDrill({
    db,
    saveData,
    key: 'spell',
    seed: {
      nodes,
      questions: wordList.map(word => wordToQuestion(word, new Date().toISOString()))
    },
    seedQuestion: (question, now) => ({ ...question, status: true, createdAt: now }),
    seedMessage: '[spell] 已寫入 ' + wordList.length + ' 個英文音節單詞',
    optionPayload: () => ({ options: [], answerId: '' }),
    questionPayload: question => ({
      id: question.question_id,
      meaning: question.meaning,
      posLabel: question.posLabel,
      ipa: question.ipa,
      level: question.level,
      theme: question.node_id,
      themeLabel: question.themeLabel
    }),
    answerPayload: () => ({}),
    summaryQuestion: question => ({
      question_id: question.question_id,
      word: question.word,
      meaning: question.meaning
    }),
    targetLabel: '主題',
    roundPrefix: 'SP_'
  });

  const spell = drill.data;

  function migrateWords() {
    if (spell.seedVersion === SEED_VERSION && spell.wordsVersion === (wordsBundle.version || 1)) return;
    const now = new Date().toISOString();
    const existing = new Map(spell.questions.map(question => [String(question.question_id), question]));
    let added = 0;
    let updated = 0;
    let retired = 0;
    const activeIds = new Set(wordList.map(word => String(word.id)));
    spell.questions.forEach(question => {
      if (!activeIds.has(String(question.question_id)) && question.status !== false) {
        question.status = false;
        retired += 1;
      }
    });
    wordList.forEach(word => {
      const fresh = wordToQuestion(word, now);
      const current = existing.get(String(word.id));
      if (current) {
        const { createdAt } = current;
        Object.assign(current, fresh, {
          status: true,
          createdAt: createdAt || now
        });
        updated += 1;
      } else {
        spell.questions.push(fresh);
        added += 1;
      }
    });
    spell.nodes = nodes.map(node => ({ ...node }));
    spell.seedVersion = SEED_VERSION;
    spell.wordsVersion = wordsBundle.version || 1;
    saveData().catch(error => console.warn('[spell] 詞庫更新儲存失敗：' + error.message));
    console.log('[spell] 詞庫已同步：新增 ' + added + ' 個，更新 ' + updated + ' 個，停用 ' + retired + ' 個');
  }

  migrateWords();

  function activeQuestions() {
    return spell.questions.filter(question => question.status !== false);
  }

  function fullWord(question) {
    return {
      id: question.question_id,
      word: question.word,
      syllables: question.syllables.slice(),
      ipa: question.ipa,
      pos: question.pos,
      posLabel: question.posLabel,
      meaning: question.meaning,
      definition: question.definition,
      forms: question.forms || [],
      level: question.level,
      theme: question.node_id,
      themeLabel: question.themeLabel,
      example: question.example || null
    };
  }

  function scrambledWord(question) {
    const blocks = question.syllables.map((text, index) => ({
      id: 's' + index,
      text
    }));
    let order = shuffle(blocks);
    if (order.length > 1 && order.every((block, index) => block.id === 's' + index)) {
      order = order.slice(1).concat(order[0]);
    }
    return {
      id: question.question_id,
      say: question.word,
      meaning: question.meaning,
      posLabel: question.posLabel,
      ipa: question.ipa,
      level: question.level,
      theme: question.node_id,
      themeLabel: question.themeLabel,
      blocks: order,
      count: question.syllables.length
    };
  }

  function isCorrectOrder(question, order) {
    if (!Array.isArray(order) || order.length !== question.syllables.length) return false;
    return order.every((id, index) => String(id) === 's' + index);
  }

  function applyRecord(record, correct, passStreak) {
    const previousBox = record.box_level || 0;
    record.total_attempts = (record.total_attempts || 0) + 1;
    record.last_practiced_at = new Date().toISOString();
    if (!correct) {
      record.total_wrong = (record.total_wrong || 0) + 1;
      record.consecutive_correct = 0;
      record.box_level = 0;
      record.mastered_at = null;
      return { boxLevel: 0, becameMastered: false };
    }
    record.consecutive_correct = (record.consecutive_correct || 0) + 1;
    if (previousBox === 3) {
      record.box_level = 3;
      if (!record.mastered_at) record.mastered_at = record.last_practiced_at;
    } else if (record.consecutive_correct >= passStreak) {
      record.box_level = 3;
      record.mastered_at = record.last_practiced_at;
    } else {
      record.box_level = Math.min(2, Math.max(1, previousBox + 1));
      record.mastered_at = null;
    }
    return {
      boxLevel: record.box_level,
      becameMastered: record.box_level === 3 && previousBox !== 3
    };
  }

  async function submitAnswer({ user, body }) {
    const wordId = String(body.wordId || '');
    const question = drill.questionMap().get(wordId);
    if (!question || question.status === false) {
      return { status: 404, body: { error: '找不到這個單詞' } };
    }

    const taskId = body.taskId ? String(body.taskId) : '';
    let task = null;
    if (taskId) {
      task = drill.findTask(taskId);
      if (!task || String(task.userId) !== String(user.id)) {
        return { status: 404, body: { error: '任務不存在' } };
      }
      if (task.is_archived) {
        return { status: 400, body: { error: '任務已歸檔' } };
      }
      const inTask = drill.taskQuestions(task).some(item => String(item.question_id) === wordId);
      if (!inTask) {
        return { status: 400, body: { error: '這個單詞不在任務中' } };
      }
    }

    const reveal = body.reveal === true;
    const correct = !reveal && isCorrectOrder(question, body.order);
    const responseTime = clamp(Number(body.responseTime) || 0, 0, 300000);
    const passStreak = task ? clamp(parseInt(task.pass_streak, 10) || 2, 2, 6) : 2;

    const globalRecord = drill.ensureMastery(user.id, question.question_id);
    const globalResult = applyRecord(globalRecord, correct, passStreak);

    let taskResult = null;
    if (task) {
      const taskRecord = drill.ensureTaskMastery(user.id, task.task_id, question.question_id);
      taskResult = applyRecord(taskRecord, correct, passStreak);
    }

    const now = new Date().toISOString();
    spell.attempts.push({
      id: generateId(new Set(spell.attempts.map(item => item.id))),
      userId: user.id,
      question_id: question.question_id,
      task_id: task ? task.task_id : null,
      correct,
      responseTime: responseTime > 0 ? responseTime : null,
      practicedAt: now
    });
    await saveData();

    return {
      status: 200,
      body: {
        correct,
        becameMastered: taskResult ? taskResult.becameMastered : globalResult.becameMastered,
        boxLevel: taskResult ? taskResult.boxLevel : globalResult.boxLevel,
        ...(correct || reveal ? { word: fullWord(question) } : {}),
        ...(reveal ? { revealed: true } : {}),
        taskProgress: task ? drill.taskProgress(task, user.id) : null
      }
    };
  }

  function startTask({ user, taskId }) {
    const task = drill.findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    if (String(task.userId) !== String(user.id)) {
      return { status: 403, body: { error: '這個任務不屬於你' } };
    }
    if (task.is_archived) return { status: 400, body: { error: '任務已歸檔' } };
    const pool = drill.taskQuestions(task);
    if (!pool.length) return { status: 400, body: { error: '這個任務還沒有題目' } };
    const eligible = drill.eligibleTaskQuestions(pool, user.id, task.task_id);
    if (!eligible.length) {
      return { status: 400, body: { error: '這個任務的題目已全部掌握，一週後再回來複習' } };
    }
    const count = clamp(parseInt(task.batch_size, 10) || 10, 1, 30);
    const selected = drill.pickQuestions(eligible, user.id, count, task.task_id);
    if (!selected.length) {
      return { status: 400, body: { error: '這個任務暫時沒有可練習的題目' } };
    }
    return {
      status: 200,
      body: {
        task: drill.serializeTask(task, user.id),
        words: selected.map(scrambledWord),
        total: selected.length
      }
    };
  }

  function startPractice({ user, body }) {
    const theme = String(body.theme || '');
    const level = parseInt(body.level, 10) || 0;
    const count = clamp(parseInt(body.count, 10) || 10, 1, 30);
    let pool = activeQuestions();
    if (theme) pool = pool.filter(question => question.node_id === theme);
    if (level) pool = pool.filter(question => Number(question.level) === level);
    if (!pool.length) {
      return { status: 400, body: { error: '這個範圍暫時沒有可練習的單詞' } };
    }

    const records = new Map(
      spell.mastery
        .filter(record => String(record.userId) === String(user.id))
        .map(record => [String(record.question_id), record])
    );
    const fresh = [];
    const review = [];
    const mastered = [];
    pool.forEach(question => {
      const record = records.get(String(question.question_id));
      if (!record || !record.total_attempts) fresh.push(question);
      else if (record.box_level === 3) mastered.push(question);
      else review.push(question);
    });
    const selected = shuffle(fresh).concat(shuffle(review), shuffle(mastered)).slice(0, count);
    if (!selected.length) {
      return { status: 400, body: { error: '暫時沒有可練習的單詞' } };
    }
    return {
      status: 200,
      body: {
        task: null,
        theme,
        level,
        words: selected.map(scrambledWord),
        total: selected.length
      }
    };
  }

  async function createTasks({ user, body }) {
    if (user.role !== 'admin') {
      return { status: 403, body: { error: '只有管理員可以建立任務' } };
    }
    const name = String(body.task_name || '').trim();
    if (!name || name.length > 40) {
      return { status: 400, body: { error: '任務名稱需為 1-40 字' } };
    }
    const selectedNodes = Array.isArray(body.target_nodes)
      ? body.target_nodes.filter(id => drill.nodeMap().has(id))
      : [];
    const level = parseInt(body.level, 10) || 0;
    if (!selectedNodes.length && !level) {
      return { status: 400, body: { error: '請至少選擇一個主題或等級' } };
    }
    const hasTargets = body.userIds !== undefined || body.userId !== undefined;
    const resolved = resolveUserIds(db, hasTargets ? (body.userIds !== undefined ? body.userIds : body.userId) : [user.id]);
    if (resolved.error) {
      return { status: 400, body: { error: resolved.error } };
    }
    const requested = clamp(parseInt(body.batch_size, 10) || 10, 1, 30);
    const pool = activeQuestions().filter(question => {
      if (selectedNodes.length && !selectedNodes.includes(question.node_id)) return false;
      if (level && Number(question.level) !== level) return false;
      return true;
    });
    if (!pool.length) {
      return { status: 400, body: { error: '所選主題與等級沒有可用單詞' } };
    }
    const passStreak = clamp(parseInt(body.pass_streak, 10) || 2, 2, 6);
    const groupId = generateId(new Set(spell.tasks.map(item => drill.taskGroupId(item))));
    const userMap = new Map(listUsers(db).map(item => [String(item.id), item]));
    const created = [];
    const skipped = [];

    resolved.userIds.forEach(targetId => {
      const inProgress = drill.activeInProgressQuestionIds(targetId);
      const recent = drill.recentlyMasteredQuestionIds(targetId);
      const candidates = pool.filter(question => {
        const key = String(question.question_id);
        return !inProgress.has(key) && !recent.has(key);
      });
      if (!candidates.length) {
        const target = userMap.get(String(targetId)) || {};
        skipped.push({
          userId: targetId,
          username: target.username || '',
          nickname: target.nickname || target.username || '（未知用戶）',
          reason: '沒有可用單詞（進行中或一週內已掌握）'
        });
        return;
      }
      const desired = Math.min(requested, candidates.length);
      const chosen = drill.chooseTaskQuestions(candidates, [], desired);
      if (!chosen.length) {
        const target = userMap.get(String(targetId)) || {};
        skipped.push({
          userId: targetId,
          username: target.username || '',
          nickname: target.nickname || target.username || '（未知用戶）',
          reason: '沒有可用單詞'
        });
        return;
      }
      const task = {
        task_id: generateId(new Set(spell.tasks.map(item => item.task_id))),
        groupId,
        userId: targetId,
        scope: resolved.all ? 'all' : 'selected',
        createdBy: user.id,
        task_name: name,
        target_nodes: Array.from(new Set(selectedNodes)),
        level,
        question_ids: chosen.map(question => question.question_id),
        fixedQuestions: true,
        batch_size: Math.max(1, Math.min(requested, chosen.length)),
        pass_streak: passStreak,
        is_archived: false,
        createdAt: new Date().toISOString()
      };
      spell.tasks.push(task);
      created.push(task);
    });

    if (!created.length) {
      return {
        status: 400,
        body: {
          error: skipped.length
            ? '沒有可用單詞：進行中或一週內已掌握的單詞會被排除'
            : '無法建立任務',
          skipped
        }
      };
    }
    await saveData();
    const totals = created.map(task => (task.question_ids || []).length);
    return {
      status: 201,
      body: {
        groupId,
        scope: resolved.all ? 'all' : 'selected',
        created: created.length,
        skipped,
        requested,
        total: Math.max(...totals),
        minTotal: Math.min(...totals),
        maxTotal: Math.max(...totals),
        tasks: created.map(task => drill.serializeTask(task, task.userId))
      }
    };
  }

  function wrongList({ user, taskId }) {
    const task = drill.findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    if (user.role !== 'admin' && String(task.userId) !== String(user.id)) {
      return { status: 404, body: { error: '任務不存在' } };
    }
    const ownerId = task.userId;
    const attempts = new Map();
    spell.attempts.forEach(attempt => {
      if (String(attempt.task_id) !== String(task.task_id)) return;
      if (String(attempt.userId) !== String(ownerId)) return;
      const row = attempts.get(String(attempt.question_id)) || { total_wrong: 0, total_attempts: 0 };
      row.total_attempts += 1;
      if (!attempt.correct) row.total_wrong += 1;
      attempts.set(String(attempt.question_id), row);
    });
    const list = drill.taskQuestions(task)
      .map(question => {
        const record = drill.findMastery(ownerId, question.question_id);
        const row = attempts.get(String(question.question_id)) || { total_wrong: 0, total_attempts: 0 };
        return {
          word: question.word,
          meaning: question.meaning,
          syllables: question.syllables,
          ipa: question.ipa,
          level: question.level,
          theme: question.node_id,
          themeLabel: question.themeLabel,
          total_wrong: row.total_wrong,
          total_attempts: row.total_attempts,
          box_level: record ? record.box_level || 0 : 0
        };
      })
      .filter(item => item.total_wrong > 0 && item.box_level !== 3)
      .sort((a, b) => b.total_wrong - a.total_wrong || b.total_attempts - a.total_attempts);
    return { status: 200, body: list };
  }

  function wordBank(query) {
    const theme = String(query.theme || '');
    const level = parseInt(query.level, 10) || 0;
    const keyword = String(query.q || '').trim().toLowerCase();
    const offset = Math.max(0, parseInt(query.offset, 10) || 0);
    const limit = clamp(parseInt(query.limit, 10) || 80, 1, 400);
    const filtered = activeQuestions().filter(question => {
      if (theme && question.node_id !== theme) return false;
      if (level && Number(question.level) !== level) return false;
      if (!keyword) return true;
      return String(question.word).includes(keyword) ||
        String(question.meaning).includes(keyword) ||
        String(question.definition || '').toLowerCase().includes(keyword);
    });
    return {
      total: filtered.length,
      offset,
      limit,
      words: filtered.slice(offset, offset + limit).map(fullWord)
    };
  }

  async function handleAPI(req, res, parsedUrl) {
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const user = requireAuth(req, res);
    if (!user) return;
    const userId = user.id;

    if (pathname === '/api/overview' && method === 'GET') {
      const levels = { 1: 0, 2: 0, 3: 0 };
      activeQuestions().forEach(question => {
        levels[question.level] = (levels[question.level] || 0) + 1;
      });
      jsonResponse(res, 200, {
        nodes: drill.nodesWithStats(userId),
        tasks: drill.taskForUser(userId),
        stats: drill.userStats(userId),
        wordCount: activeQuestions().length,
        levels
      });
      return;
    }

    if (pathname === '/api/nodes' && method === 'GET') {
      jsonResponse(res, 200, drill.nodesWithStats(userId));
      return;
    }

    if (pathname === '/api/words' && method === 'GET') {
      jsonResponse(res, 200, wordBank(parsedUrl.query || {}));
      return;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      jsonResponse(res, 200, drill.userStats(userId));
      return;
    }

    if (pathname === '/api/admin/tasks' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      jsonResponse(res, 200, drill.adminTaskList());
      return;
    }

    if (pathname === '/api/admin/stats' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      jsonResponse(res, 200, drill.buildAdminStats());
      return;
    }

    if (pathname === '/api/tasks' && method === 'GET') {
      jsonResponse(res, 200, drill.taskForUser(userId));
      return;
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await createTasks({ user, body });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
      const taskId = pathname.split('/')[3];
      try {
        const result = await drill.deleteTasks({ user, taskId });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '刪除任務失敗' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'PUT') {
      const taskId = pathname.split('/')[3];
      try {
        const body = await parseBody(req);
        const result = await drill.updateTasks({ user, taskId, body, label: '主題' });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/wrong') && method === 'GET') {
      const taskId = pathname.split('/')[3];
      const result = wrongList({ user, taskId });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/start') && method === 'POST') {
      const taskId = pathname.split('/')[3];
      const result = startTask({ user, taskId });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (pathname === '/api/practice/start' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = startPractice({ user, body });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/answer' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await submitAnswer({ user, body });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    jsonResponse(res, 404, { error: 'API Not Found' });
  }

  return { handleAPI, stats: drill.stats };
}

module.exports = { id: 'spell', create: createSpellTool };
