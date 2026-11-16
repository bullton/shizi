const fs = require('fs');
const path = require('path');
const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { createDrill, shuffle } = require('../core/drill');

const SEED_VERSION = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAnswer(value) {
  return String(value == null ? '' : value)
    .replace(/[,，\s]/g, '')
    .trim();
}

function createQuizTool({ rootDir, toolDir, db, saveData: storeSave, dataExists, auth }) {
  const saveData = () => storeSave();

  function requireAuth(req, res) {
    const user = auth.requireAuth(req);
    if (!user) {
      jsonResponse(res, 401, { error: '請先登入' });
      return null;
    }
    return user;
  }

  const bundlePath = path.join(toolDir, 'questions.json');
  if (!fs.existsSync(bundlePath)) {
    throw new Error('[quiz] 找不到 tools/quiz/questions.json，請先執行 scripts/quiz/build-questions.js');
  }
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const questionList = Array.isArray(bundle.questions) ? bundle.questions : [];
  const domainMeta = bundle.domains || {};
  const nodes = (bundle.nodes || []).map(node => ({
    node_id: node.node_id,
    title: node.title,
    category: node.category || (domainMeta[node.domain] && domainMeta[node.domain].title) || '類別',
    dimension: node.dimension || '',
    domain: node.domain,
    order: node.order || 0,
    questionCount: node.questionCount || 0
  }));

  function questionToRecord(question, now) {
    return {
      ...question,
      options: Array.isArray(question.options) ? question.options.slice() : [],
      parts: Array.isArray(question.parts) ? question.parts.slice() : [],
      tags: Array.isArray(question.tags) ? question.tags.slice() : [],
      status: true,
      createdAt: now
    };
  }

  const drill = createDrill({
    db,
    saveData,
    key: 'quiz',
    seed: {
      nodes,
      questions: questionList.map(question => questionToRecord(question, new Date().toISOString()))
    },
    seedQuestion: (question, now) => questionToRecord(question, now),
    seedMessage: '[quiz] 已寫入 ' + questionList.length + ' 道句子、數學與常識題目',
    optionPayload: question => {
      if (question.type !== 'choice') return { options: [], answerId: '' };
      const options = shuffle(question.options.map((text, index) => ({
        id: 'o' + index,
        text
      })));
      const answer = options.find(option => option.text === question.answer);
      return { options, answerId: answer ? answer.id : options[0].id };
    },
    questionPayload: (question, node) => ({
      id: question.question_id,
      node_id: question.node_id,
      node_title: node.title || question.node_id,
      domain: question.domain,
      type: question.type,
      prompt: question.prompt,
      instruction: question.instruction,
      difficulty: question.difficulty
    }),
    answerPayload: ({ question }) => ({
      answer: question.answer,
      explanation: question.explanation
    }),
    summaryQuestion: question => ({
      question_id: question.question_id,
      node_id: question.node_id,
      domain: question.domain,
      stem: question.stem,
      answer: question.answer,
      explanation: question.explanation
    }),
    targetLabel: '類別',
    roundPrefix: 'QZ_'
  });

  const quiz = drill.data;

  function migrateQuestions() {
    if (quiz.seedVersion === SEED_VERSION && quiz.questionsVersion === (bundle.version || 1)) return;
    const now = new Date().toISOString();
    const existing = new Map(quiz.questions.map(question => [String(question.question_id), question]));
    const activeIds = new Set(questionList.map(question => String(question.question_id)));
    let added = 0;
    let updated = 0;
    let retired = 0;
    quiz.questions.forEach(question => {
      if (!activeIds.has(String(question.question_id)) && question.status !== false) {
        question.status = false;
        retired += 1;
      }
    });
    questionList.forEach(question => {
      const fresh = questionToRecord(question, now);
      const current = existing.get(String(question.question_id));
      if (current) {
        const { createdAt } = current;
        Object.assign(current, fresh, { status: true, createdAt: createdAt || now });
        updated += 1;
      } else {
        quiz.questions.push(fresh);
        added += 1;
      }
    });
    quiz.nodes = nodes.map(node => ({ ...node }));
    quiz.seedVersion = SEED_VERSION;
    quiz.questionsVersion = bundle.version || 1;
    saveData().catch(error => console.warn('[quiz] 題庫更新儲存失敗：' + error.message));
    console.log('[quiz] 題庫已同步：新增 ' + added + ' 題，更新 ' + updated + ' 題，停用 ' + retired + ' 題');
  }

  migrateQuestions();

  function activeQuestions() {
    return quiz.questions.filter(question => question.status !== false);
  }

  function nodeFor(question) {
    return drill.nodeMap().get(question.node_id) || {};
  }

  function domainInfo(domain) {
    return domainMeta[domain] || { title: domain, short: domain };
  }

  function tilesFor(question) {
    const tiles = question.parts.map((text, index) => ({
      id: 'p' + index,
      text
    }));
    let ordered = shuffle(tiles);
    if (ordered.length > 1 && ordered.every((tile, index) => tile.id === 'p' + index)) {
      ordered = ordered.slice(1).concat(ordered[0]);
    }
    return ordered;
  }

  function questionPayload(question) {
    const node = nodeFor(question);
    const domain = domainInfo(question.domain);
    const payload = {
      id: question.question_id,
      node_id: question.node_id,
      node_title: node.title || question.node_id,
      dimension: node.dimension || '',
      domain: question.domain,
      domain_title: domain.title || question.domain,
      type: question.type,
      prompt: question.prompt,
      instruction: question.instruction,
      difficulty: question.difficulty,
      tags: (question.tags || []).slice()
    };
    if (question.type === 'order') {
      payload.tiles = tilesFor(question);
      payload.count = question.parts.length;
    } else if (question.type === 'input') {
      payload.expression = question.expression;
    } else if (question.type === 'choice') {
      payload.options = shuffle(question.options.map((text, index) => ({
        id: 'o' + index,
        text
      })));
    }
    return payload;
  }

  function questionFeedback(question) {
    return {
      answer: question.answer,
      explanation: question.explanation || '',
      parts: question.type === 'order' ? question.parts.slice() : null,
      expression: question.type === 'input' ? question.expression : null,
      options: question.type === 'choice' ? question.options.slice() : null
    };
  }

  function isCorrect(question, body) {
    if (question.type === 'order') {
      const order = Array.isArray(body.order) ? body.order : [];
      if (order.length !== question.parts.length) return false;
      return order.every((id, index) => String(id) === 'p' + index);
    }
    if (question.type === 'input') {
      const given = normalizeAnswer(body.value);
      const expected = normalizeAnswer(question.answer);
      if (!given || !expected) return false;
      const givenNumber = Number(given);
      const expectedNumber = Number(expected);
      if (Number.isFinite(givenNumber) && Number.isFinite(expectedNumber)) {
        return givenNumber === expectedNumber;
      }
      return given === expected;
    }
    if (question.type === 'choice') {
      const optionId = String(body.optionId || '');
      const match = optionId.match(/^o(\d+)$/);
      if (!match) return false;
      return question.options[Number(match[1])] === question.answer;
    }
    return false;
  }

  const rounds = new Map();
  let roundSeq = 0;

  function pruneRounds() {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [id, round] of rounds.entries()) {
      if (round.startedAt < cutoff) rounds.delete(id);
    }
  }

  function prepareCurrent(round) {
    const item = round.queue[round.index];
    const question = drill.questionMap().get(item.question_id);
    if (!question || question.status === false) {
      round.index += 1;
      if (round.index < round.queue.length) return prepareCurrent(round);
      return null;
    }
    round.current = { question, item };
    round.answered = false;
    return round.current;
  }

  function roundPayload(round) {
    if (!round.current) return null;
    return {
      roundId: round.roundId,
      taskId: round.taskId,
      taskName: round.taskName,
      position: round.index + 1,
      total: round.queue.length,
      initialTotal: round.initialTotal,
      combo: round.combo,
      retry: !!round.current.item.retry,
      question: questionPayload(round.current.question)
    };
  }

  function createRound({ user, task, selected }) {
    if (!selected.length) {
      return { status: 400, body: { error: '暫時沒有可練習的題目' } };
    }
    pruneRounds();
    roundSeq += 1;
    const round = {
      roundId: 'QZ_' + Date.now() + '_' + roundSeq,
      userId: user.id,
      taskId: task ? task.task_id : null,
      taskName: task ? task.task_name : '自由練習',
      passStreak: task ? clamp(parseInt(task.pass_streak, 10) || 3, 2, 6) : 3,
      queue: selected.map(question => ({ question_id: question.question_id, retry: false })),
      index: 0,
      initialTotal: selected.length,
      combo: 0,
      answeredCount: 0,
      correctCount: 0,
      retries: 0,
      retryCount: new Map(),
      mastered: new Set(),
      wrong: new Map(),
      answered: false,
      startedAt: Date.now()
    };
    const current = prepareCurrent(round);
    if (!current) return { status: 400, body: { error: '無法建立練習' } };
    rounds.set(round.roundId, round);
    return { status: 200, body: roundPayload(round) };
  }

  function pickPractice(pool, userId, count) {
    const records = new Map(
      quiz.mastery
        .filter(record => String(record.userId) === String(userId))
        .map(record => [String(record.question_id), record])
    );
    const wrong = [];
    const fresh = [];
    const review = [];
    const other = [];
    pool.forEach(question => {
      const record = records.get(String(question.question_id));
      if (!record || !record.total_attempts) fresh.push(question);
      else if (record.box_level === 0 && (record.total_wrong || 0) > 0) wrong.push(question);
      else if (record.box_level === 3) other.push(question);
      else review.push(question);
    });
    wrong.sort((a, b) => {
      const ar = records.get(String(a.question_id));
      const br = records.get(String(b.question_id));
      return (br.total_wrong || 0) - (ar.total_wrong || 0);
    });
    review.sort((a, b) => {
      const ar = records.get(String(a.question_id));
      const br = records.get(String(b.question_id));
      return String(ar.last_practiced_at || '').localeCompare(String(br.last_practiced_at || ''));
    });
    const chosen = [];
    const used = new Set();
    function take(list, amount) {
      let taken = 0;
      for (const question of list) {
        if (chosen.length >= count || taken >= amount) break;
        const key = String(question.question_id);
        if (used.has(key)) continue;
        used.add(key);
        chosen.push(question);
        taken += 1;
      }
    }
    take(wrong, Math.round(count * 0.4));
    take(fresh, Math.round(count * 0.3));
    take(review, Math.round(count * 0.3));
    if (chosen.length < count) {
      take(wrong, count);
      take(fresh, count);
      take(review, count);
      take(shuffle(other), count);
      take(shuffle(pool), count);
    }
    return chosen.slice(0, count);
  }

  function resolvePool(body) {
    const nodes = Array.isArray(body.nodes) ? body.nodes.map(String) : [];
    const domains = Array.isArray(body.domains) ? body.domains.map(String) : [];
    return activeQuestions().filter(question => {
      if (nodes.length && !nodes.includes(question.node_id)) return false;
      if (domains.length && !domains.includes(question.domain)) return false;
      return true;
    });
  }

  function startPractice({ user, body }) {
    const count = clamp(parseInt(body.count, 10) || 10, 3, 30);
    const pool = resolvePool(body);
    if (!pool.length) {
      return { status: 400, body: { error: '這個範圍暫時沒有可練習的題目' } };
    }
    const selected = pickPractice(pool, user.id, count);
    return createRound({ user, task: null, selected });
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
    return createRound({ user, task, selected });
  }

  async function submitAnswer({ user, roundId, body }) {
    const round = rounds.get(roundId);
    if (!round || String(round.userId) !== String(user.id)) {
      return { status: 404, body: { error: '練習已結束，請重新開始' } };
    }
    if (round.answered) return { status: 409, body: { error: '這一題已經作答' } };
    const question = round.current.question;
    const correct = isCorrect(question, body);
    const responseTime = clamp(Number(body.responseTime) || 0, 0, 300000);
    const task = round.taskId ? drill.findTask(round.taskId) : null;
    const passStreak = task ? clamp(parseInt(task.pass_streak, 10) || 3, 2, 6) : round.passStreak;
    const practicedAt = new Date().toISOString();

    const globalRecord = drill.ensureMastery(user.id, question.question_id);
    const globalResult = drill.advanceRecord(globalRecord, correct, passStreak, practicedAt);
    let taskResult = null;
    if (task && !task.is_archived) {
      const taskRecord = drill.ensureTaskMastery(user.id, task.task_id, question.question_id);
      taskResult = drill.advanceRecord(taskRecord, correct, passStreak, practicedAt);
      if (taskResult.box_level === 3 && taskResult.becameMastered) {
        round.mastered.add(question.question_id);
      }
    }

    round.answered = true;
    round.answeredCount += 1;
    if (correct) {
      round.correctCount += 1;
      round.combo += 1;
    } else {
      round.combo = 0;
      round.wrong.set(question.question_id, (round.wrong.get(question.question_id) || 0) + 1);
    }

    let retryAdded = false;
    if (!correct) {
      const attempts = round.retryCount.get(question.question_id) || 0;
      if (attempts < 3) {
        round.retryCount.set(question.question_id, attempts + 1);
        round.queue.push({ question_id: question.question_id, retry: true });
        round.retries += 1;
        retryAdded = true;
      }
    }

    quiz.attempts.push({
      id: generateId(new Set(quiz.attempts.map(item => item.id))),
      userId: user.id,
      question_id: question.question_id,
      task_id: task ? task.task_id : null,
      correct,
      responseTime: responseTime > 0 ? responseTime : null,
      practicedAt
    });
    await saveData();

    return {
      status: 200,
      body: {
        correct,
        ...questionFeedback(question),
        combo: round.combo,
        position: round.index + 1,
        total: round.queue.length,
        retryAdded,
        becameMastered: taskResult ? taskResult.becameMastered : globalResult.becameMastered,
        boxLevel: taskResult ? taskResult.box_level : globalResult.box_level,
        taskProgress: task ? drill.taskProgress(task, user.id) : null
      }
    };
  }

  function roundSummary(round) {
    const task = round.taskId ? drill.findTask(round.taskId) : null;
    const wrongQuestions = [];
    round.wrong.forEach((count, questionId) => {
      const question = drill.questionMap().get(questionId);
      if (!question) return;
      wrongQuestions.push({
        question_id: question.question_id,
        node_id: question.node_id,
        node_title: nodeFor(question).title || question.node_id,
        domain: question.domain,
        stem: question.stem,
        answer: question.answer,
        explanation: question.explanation,
        count
      });
    });
    const answered = round.answeredCount || 0;
    return {
      task: task ? drill.serializeTask(task, round.userId) : null,
      total: round.initialTotal,
      answered,
      correct: round.correctCount,
      accuracy: answered ? Math.round((round.correctCount / answered) * 1000) / 10 : 0,
      retries: round.retries,
      newlyMastered: round.mastered.size,
      wrongQuestions
    };
  }

  function nextRound({ user, roundId }) {
    const round = rounds.get(roundId);
    if (!round || String(round.userId) !== String(user.id)) {
      return { status: 404, body: { error: '練習已結束，請重新開始' } };
    }
    if (!round.answered) return { status: 400, body: { error: '請先作答' } };
    round.index += 1;
    if (round.index >= round.queue.length) {
      const summary = roundSummary(round);
      rounds.delete(roundId);
      return { status: 200, body: { done: true, summary } };
    }
    prepareCurrent(round);
    return { status: 200, body: { done: false, ...roundPayload(round) } };
  }

  function overview(userId) {
    const domainCounts = {};
    activeQuestions().forEach(question => {
      domainCounts[question.domain] = (domainCounts[question.domain] || 0) + 1;
    });
    return {
      nodes: drill.nodesWithStats(userId),
      tasks: drill.taskForUser(userId),
      stats: drill.userStats(userId),
      questionCount: activeQuestions().length,
      domains: Object.keys(domainMeta).map(key => ({
        id: key,
        title: domainMeta[key].title,
        short: domainMeta[key].short,
        icon: domainMeta[key].icon,
        color: domainMeta[key].color,
        count: domainCounts[key] || 0
      })).filter(item => item.count > 0)
    };
  }

  function questionBank(user, query) {
    const domain = String(query.domain || '');
    const nodeId = String(query.node_id || '');
    const keyword = String(query.q || '').trim();
    const offset = Math.max(0, parseInt(query.offset, 10) || 0);
    const limit = clamp(parseInt(query.limit, 10) || 50, 1, 200);
    const filtered = activeQuestions().filter(question => {
      if (domain && question.domain !== domain) return false;
      if (nodeId && question.node_id !== nodeId) return false;
      if (!keyword) return true;
      return String(question.stem || '').includes(keyword) ||
        String(question.prompt || '').includes(keyword) ||
        String(question.explanation || '').includes(keyword);
    });
    return {
      total: filtered.length,
      offset,
      limit,
      questions: filtered.slice(offset, offset + limit).map(question => ({
        question_id: question.question_id,
        domain: question.domain,
        domain_title: domainInfo(question.domain).title,
        node_id: question.node_id,
        node_title: nodeFor(question).title || question.node_id,
        type: question.type,
        stem: question.stem,
        answer: user.role === 'admin' ? question.answer : undefined,
        explanation: user.role === 'admin' ? question.explanation : undefined,
        difficulty: question.difficulty,
        mastery: drill.findMastery(user.id, question.question_id)
      }))
    };
  }

  async function handleAPI(req, res, parsedUrl) {
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const user = requireAuth(req, res);
    if (!user) return;
    const userId = user.id;

    if (pathname === '/api/overview' && method === 'GET') {
      jsonResponse(res, 200, overview(userId));
      return;
    }

    if (pathname === '/api/nodes' && method === 'GET') {
      jsonResponse(res, 200, drill.nodesWithStats(userId));
      return;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      jsonResponse(res, 200, drill.userStats(userId));
      return;
    }

    if (pathname === '/api/questions' && method === 'GET') {
      jsonResponse(res, 200, questionBank(user, parsedUrl.query || {}));
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
        const result = await drill.createTasks({ user, body, label: '類別' });
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
        const result = await drill.updateTasks({ user, taskId, body, label: '類別' });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/wrong') && method === 'GET') {
      const taskId = pathname.split('/')[3];
      const result = drill.taskWrongList({ user, taskId });
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

    if (pathname.startsWith('/api/rounds/') && pathname.endsWith('/answer') && method === 'POST') {
      const roundId = pathname.split('/')[3];
      try {
        const body = await parseBody(req);
        const result = await submitAnswer({ user, roundId, body });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/rounds/') && pathname.endsWith('/next') && method === 'POST') {
      const roundId = pathname.split('/')[3];
      const result = nextRound({ user, roundId });
      jsonResponse(res, result.status, result.body);
      return;
    }

    jsonResponse(res, 404, { error: 'API Not Found' });
  }

  drill.migrateLegacyTasks();
  drill.migrateTaskMastery();

  return { handleAPI, stats: drill.stats };
}

module.exports = { id: 'quiz', create: createQuizTool };
