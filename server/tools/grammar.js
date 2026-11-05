const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { NODES, QUESTIONS } = require('./grammar-seed');
const { listUsers, resolveUserIds } = require('../core/delegation');

const HK_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function hkDate(value) {
  return HK_DATE.format(value ? new Date(value) : new Date());
}

function recentSevenDays() {
  const days = new Set();
  for (let i = 0; i < 7; i += 1) {
    days.add(hkDate(Date.now() - i * 24 * 60 * 60 * 1000));
  }
  return days;
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function shuffle(items) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function parseCsv(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);

  const clean = rows.filter(cells => cells.some(cell => String(cell).trim() !== ''));
  if (!clean.length) return [];
  const headers = clean.shift().map(header => header.trim());
  return clean.map(cells => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = cells[index] === undefined ? '' : String(cells[index]).trim();
    });
    return item;
  });
}

function parseImportText(text) {
  const source = String(text || '').trim();
  if (!source) return [];
  try {
    const parsed = JSON.parse(source);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
  } catch (error) {
    // Not JSON: fall through to CSV.
  }
  return parseCsv(source);
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function createGrammarTool({ rootDir, toolDir, db, saveData: storeSave, dataExists, auth }) {
  const saveData = () => storeSave();

  function requireAuth(req, res) {
    const user = auth.requireAuth(req);
    if (!user) {
      jsonResponse(res, 401, { error: '請先登入' });
      return null;
    }
    return user;
  }

  const now = new Date().toISOString();

  if (!db.grammar) {
    db.grammar = {
      seedVersion: 1,
      seededAt: now,
      nodes: NODES.map(node => ({ ...node })),
      questions: QUESTIONS.map(question => ({
        ...question,
        distractors: question.distractors.slice(),
        status: true,
        createdAt: now
      })),
      tasks: [],
      mastery: [],
      attempts: []
    };
    saveData().catch(error => console.warn('[grammar] 初始化儲存失敗：' + error.message));
    console.log('[grammar] 已寫入 15 個語法節點與 60 道起步題');
  } else {
    db.grammar.nodes = db.grammar.nodes || [];
    db.grammar.questions = db.grammar.questions || [];
    db.grammar.tasks = db.grammar.tasks || [];
    db.grammar.mastery = db.grammar.mastery || [];
    db.grammar.attempts = db.grammar.attempts || [];
  }

  const grammar = db.grammar;

  function nodeMap() {
    return new Map(grammar.nodes.map(node => [node.node_id, node]));
  }

  function questionMap() {
    return new Map(grammar.questions.map(question => [question.question_id, question]));
  }

  function findTask(taskId) {
    return grammar.tasks.find(task => String(task.task_id) === String(taskId)) || null;
  }

  function taskGroupId(task) {
    return task.groupId || task.task_id;
  }

  function taskPool(nodes, pinned) {
    const nodeIds = new Set((nodes || []).map(String));
    const pinnedIds = new Set((pinned || []).map(String));
    return grammar.questions.filter(question => {
      if (question.status === false) return false;
      return nodeIds.has(String(question.node_id)) || pinnedIds.has(String(question.question_id));
    });
  }

  function chooseTaskQuestions(pool, pinned, desired, preferred) {
    const byId = new Map(pool.map(question => [String(question.question_id), question]));
    const chosen = [];
    const used = new Set();

    (pinned || []).forEach(id => {
      const key = String(id);
      const question = byId.get(key);
      if (!question || used.has(key)) return;
      used.add(key);
      chosen.push(question);
    });

    if (chosen.length >= desired) return chosen.slice(0, desired);

    const preferredIds = new Set((preferred || []).map(String));
    pool.forEach(question => {
      if (chosen.length >= desired) return;
      const key = String(question.question_id);
      if (used.has(key) || !preferredIds.has(key)) return;
      used.add(key);
      chosen.push(question);
    });

    if (chosen.length >= desired) return chosen;

    const groups = new Map();
    pool.forEach(question => {
      const key = String(question.question_id);
      if (used.has(key)) return;
      const list = groups.get(question.node_id) || [];
      list.push(question);
      groups.set(question.node_id, list);
    });

    const lists = [...groups.values()];
    let cursor = 0;
    while (chosen.length < desired) {
      let took = false;
      lists.forEach(list => {
        if (chosen.length >= desired) return;
        if (cursor < list.length) {
          chosen.push(list[cursor]);
          took = true;
        }
      });
      if (!took) break;
      cursor += 1;
    }
    return chosen;
  }

  function taskQuestions(task) {
    if (task.fixedQuestions) {
      const pinned = new Set((task.question_ids || []).map(String));
      return grammar.questions.filter(question => {
        if (question.status === false) return false;
        return pinned.has(String(question.question_id));
      });
    }
    return taskPool(task.target_nodes || [], task.question_ids || []);
  }

  function migrateLegacyTasks() {
    const groups = new Map();
    grammar.tasks.forEach(task => {
      if (task.fixedQuestions) return;
      const key = String(taskGroupId(task));
      const list = groups.get(key) || [];
      list.push(task);
      groups.set(key, list);
    });
    if (!groups.size) return;

    const nowIso = new Date().toISOString();
    const activeIds = new Set(grammar.questions.filter(question => question.status !== false).map(question => String(question.question_id)));
    let changed = 0;

    groups.forEach(items => {
      const first = items[0];
      const pinned = (first.question_ids || []).map(String).filter(id => activeIds.has(id));
      const pool = taskPool(first.target_nodes || [], pinned);
      const requested = Math.max(1, Math.min(30, parseInt(first.batch_size, 10) || 10));
      const desired = Math.max(pinned.length, Math.min(requested, pool.length));
      const userIds = new Set(items.map(item => String(item.userId)));
      const practiced = new Set();

      grammar.mastery.forEach(record => {
        if (!userIds.has(String(record.userId)) || !(record.total_attempts > 0)) return;
        practiced.add(String(record.question_id));
      });
      grammar.attempts.forEach(attempt => {
        if (userIds.has(String(attempt.userId))) practiced.add(String(attempt.question_id));
      });

      const preferred = pool.filter(question => practiced.has(String(question.question_id))).map(question => String(question.question_id));
      const chosen = chooseTaskQuestions(pool, pinned, desired, preferred);
      const fixedIds = chosen.map(question => question.question_id);
      const batchSize = Math.max(1, Math.min(requested, fixedIds.length || 1));

      items.forEach(task => {
        task.question_ids = fixedIds;
        task.batch_size = batchSize;
        task.fixedQuestions = true;
        task.updatedAt = nowIso;
        changed += 1;
      });
    });

    if (changed) {
      saveData().catch(error => console.warn('[grammar] 固定舊任務題目儲存失敗：' + error.message));
      console.log('[grammar] 已固定 ' + changed + ' 個舊任務的題目數量');
    }
  }

  function findMastery(userId, questionId) {
    return grammar.mastery.find(record => String(record.userId) === String(userId) && String(record.question_id) === String(questionId)) || null;
  }

  function ensureMastery(userId, questionId) {
    let record = findMastery(userId, questionId);
    if (!record) {
      record = {
        userId,
        question_id: questionId,
        box_level: 0,
        consecutive_correct: 0,
        total_attempts: 0,
        total_wrong: 0,
        last_practiced_at: null
      };
      grammar.mastery.push(record);
    }
    return record;
  }

  function userStats(userId) {
    const records = grammar.mastery.filter(record => String(record.userId) === String(userId));
    const attempted = records.filter(record => record.total_attempts > 0).length;
    const mastered = records.filter(record => record.box_level === 3).length;
    const totalAttempts = records.reduce((sum, record) => sum + (record.total_attempts || 0), 0);
    const totalWrong = records.reduce((sum, record) => sum + (record.total_wrong || 0), 0);
    const accuracy = totalAttempts > 0 ? ((totalAttempts - totalWrong) / totalAttempts) * 100 : 0;
    const days = recentSevenDays();
    const recent7 = grammar.attempts.filter(attempt => {
      return String(attempt.userId) === String(userId) && days.has(hkDate(attempt.practicedAt));
    }).length;
    const lastPracticed = records
      .map(record => record.last_practiced_at)
      .filter(Boolean)
      .sort()
      .pop() || null;

    return {
      mastered,
      attempted,
      totalAttempts,
      totalWrong,
      accuracy: Math.round(accuracy * 10) / 10,
      recent7,
      lastPracticed
    };
  }

  function nodesWithStats(userId) {
    const counts = new Map();
    const mastered = new Map();
    grammar.questions.forEach(question => {
      if (question.status === false) return;
      counts.set(question.node_id, (counts.get(question.node_id) || 0) + 1);
      const record = findMastery(userId, question.question_id);
      if (record && record.box_level === 3) {
        mastered.set(question.node_id, (mastered.get(question.node_id) || 0) + 1);
      }
    });

    return grammar.nodes.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(node => {
      const questionCount = counts.get(node.node_id) || 0;
      const masteredCount = mastered.get(node.node_id) || 0;
      return {
        ...node,
        questionCount,
        masteredCount,
        mastery: questionCount ? Math.round((masteredCount / questionCount) * 1000) / 10 : 0
      };
    });
  }

  function buildAdminStats() {
    const questions = grammar.questions.filter(question => question.status !== false);
    const questionById = new Map(questions.map(question => [String(question.question_id), question]));
    const nodes = grammar.nodes.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const nodeById = new Map(nodes.map(node => [node.node_id, node]));
    const nodeTotals = new Map();
    questions.forEach(question => {
      nodeTotals.set(question.node_id, (nodeTotals.get(question.node_id) || 0) + 1);
    });

    const masteryByUser = new Map();
    grammar.mastery.forEach(record => {
      const key = String(record.userId);
      let records = masteryByUser.get(key);
      if (!records) {
        records = new Map();
        masteryByUser.set(key, records);
      }
      records.set(String(record.question_id), record);
    });

    const attemptsByUser = new Map();
    grammar.attempts.forEach(attempt => {
      if (!questionById.has(String(attempt.question_id))) return;
      const key = String(attempt.userId);
      let list = attemptsByUser.get(key);
      if (!list) {
        list = [];
        attemptsByUser.set(key, list);
      }
      list.push(attempt);
    });

    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      days.push(hkDate(Date.now() - i * 24 * 60 * 60 * 1000));
    }

    const users = listUsers(db).map(user => {
      const mastery = masteryByUser.get(String(user.id)) || new Map();
      const rows = nodes.map(node => ({
        node_id: node.node_id,
        title: node.title,
        category: node.category,
        order: node.order || 0,
        total: nodeTotals.get(node.node_id) || 0,
        attempted: 0,
        mastered: 0,
        wrongQuestions: 0,
        totalAttempts: 0,
        totalWrong: 0
      }));
      const rowById = new Map(rows.map(row => [row.node_id, row]));
      let lastPracticed = null;

      questions.forEach(question => {
        const record = mastery.get(String(question.question_id));
        if (!record || !record.total_attempts) return;
        const row = rowById.get(question.node_id);
        if (!row) return;
        row.attempted += 1;
        row.totalAttempts += record.total_attempts || 0;
        row.totalWrong += record.total_wrong || 0;
        if (record.box_level === 3) row.mastered += 1;
        if ((record.total_wrong || 0) > 0 && record.box_level !== 3) row.wrongQuestions += 1;
        if (record.last_practiced_at && (!lastPracticed || String(record.last_practiced_at) > String(lastPracticed))) {
          lastPracticed = record.last_practiced_at;
        }
      });

      let totalAttempts = 0;
      let totalWrong = 0;
      let attempted = 0;
      let mastered = 0;
      let wrongQuestionCount = 0;
      rows.forEach(row => {
        row.coverage = percent(row.attempted, row.total);
        row.mastery = percent(row.mastered, row.total);
        row.accuracy = percent(row.totalAttempts - row.totalWrong, row.totalAttempts);
        totalAttempts += row.totalAttempts;
        totalWrong += row.totalWrong;
        attempted += row.attempted;
        mastered += row.mastered;
        wrongQuestionCount += row.wrongQuestions;
      });

      const weakNodes = rows
        .filter(row => row.total > 0 && row.attempted > 0)
        .sort((a, b) => a.accuracy - b.accuracy || a.coverage - b.coverage || b.wrongQuestions - a.wrongQuestions)
        .slice(0, 5)
        .map(row => ({
          node_id: row.node_id,
          title: row.title,
          category: row.category,
          total: row.total,
          attempted: row.attempted,
          mastered: row.mastered,
          wrongQuestions: row.wrongQuestions,
          totalAttempts: row.totalAttempts,
          totalWrong: row.totalWrong,
          coverage: row.coverage,
          accuracy: row.accuracy
        }));

      const weakQuestions = [];
      mastery.forEach((record, questionId) => {
        const question = questionById.get(questionId);
        if (!question || !(record.total_wrong > 0) || record.box_level === 3) return;
        const node = nodeById.get(question.node_id) || {};
        weakQuestions.push({
          question_id: question.question_id,
          stem: question.stem,
          node_id: question.node_id,
          node_title: node.title || question.node_id,
          total_wrong: record.total_wrong || 0,
          total_attempts: record.total_attempts || 0,
          box_level: record.box_level || 0,
          last_practiced_at: record.last_practiced_at || null
        });
      });
      weakQuestions.sort((a, b) => b.total_wrong - a.total_wrong || b.total_attempts - a.total_attempts);
      const weakQuestionList = weakQuestions.slice(0, 10);

      const attempts = (attemptsByUser.get(String(user.id)) || [])
        .slice()
        .sort((a, b) => String(b.practicedAt).localeCompare(String(a.practicedAt)));
      const recentAttempts = attempts.slice(0, 12).map(attempt => {
        const question = questionById.get(String(attempt.question_id)) || {};
        const node = nodeById.get(question.node_id) || {};
        return {
          id: attempt.id,
          question_id: attempt.question_id,
          stem: question.stem || '（題目已刪除）',
          node_id: question.node_id || '',
          node_title: node.title || question.node_id || '',
          correct: !!attempt.correct,
          practicedAt: attempt.practicedAt
        };
      });

      const dailyMap = new Map(days.map(day => [day, { date: day, attempts: 0, correct: 0 }]));
      attempts.forEach(attempt => {
        const row = dailyMap.get(hkDate(attempt.practicedAt));
        if (!row) return;
        row.attempts += 1;
        if (attempt.correct) row.correct += 1;
      });
      const daily = days.map(day => {
        const row = dailyMap.get(day);
        return {
          date: day,
          attempts: row.attempts,
          correct: row.correct,
          accuracy: percent(row.correct, row.attempts)
        };
      });
      const recent7 = daily.reduce((sum, row) => sum + row.attempts, 0);

      return {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        avatar: user.avatar,
        stats: {
          total: questions.length,
          attempted,
          mastered,
          coverage: percent(attempted, questions.length),
          mastery: percent(mastered, questions.length),
          totalAttempts,
          totalWrong,
          accuracy: percent(totalAttempts - totalWrong, totalAttempts),
          wrongQuestionCount,
          recent7,
          lastPracticed
        },
        nodes: rows,
        weakNodes,
        weakQuestions: weakQuestionList,
        recentAttempts,
        daily
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      meta: {
        users: users.length,
        nodes: nodes.length,
        questions: questions.length
      },
      users
    };
  }

  function taskProgress(task, userId) {
    const questions = taskQuestions(task);
    const attempted = questions.filter(question => {
      const record = findMastery(userId, question.question_id);
      return record && (record.total_attempts || 0) > 0;
    }).length;
    const mastered = questions.filter(question => {
      const record = findMastery(userId, question.question_id);
      return record && record.box_level === 3;
    }).length;
    const wrong = questions.filter(question => {
      const record = findMastery(userId, question.question_id);
      return record && (record.total_wrong || 0) > 0;
    }).length;
    const total = questions.length;
    return {
      total,
      attempted,
      coverage: percent(attempted, total),
      mastered,
      wrong,
      progress: percent(mastered, total)
    };
  }

  function serializeTask(task, userId) {
    const progress = taskProgress(task, userId);
    return {
      task_id: task.task_id,
      task_name: task.task_name,
      target_nodes: task.target_nodes || [],
      question_ids: task.question_ids || [],
      batch_size: task.batch_size,
      pass_streak: task.pass_streak,
      is_archived: !!task.is_archived,
      createdAt: task.createdAt,
      groupId: taskGroupId(task),
      userId: task.userId,
      scope: task.scope || 'selected',
      fixedQuestions: !!task.fixedQuestions,
      total: progress.total,
      attempted: progress.attempted,
      coverage: progress.coverage,
      mastered: progress.mastered,
      wrong: progress.wrong,
      progress: progress.progress
    };
  }

  function taskForUser(userId) {
    return grammar.tasks
      .filter(task => String(task.userId) === String(userId) && !task.is_archived)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(task => serializeTask(task, userId));
  }

  function adminTaskList() {
    const users = new Map((db.users || []).map(user => [String(user.id), user]));
    return grammar.tasks
      .filter(task => !task.is_archived)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(task => {
        const user = users.get(String(task.userId));
        return {
          ...serializeTask(task, task.userId),
          username: user ? (user.nickname || user.username) : '（已刪除用戶）',
          role: user ? (user.role || 'user') : null
        };
      });
  }

  function normalizeQuestion(raw, existingQuestions) {
    const nodes = nodeMap();
    const nodeId = String(raw.node_id || '').trim();
    if (!nodes.has(nodeId)) {
      return { error: '語法節點不存在：' + (nodeId || '空白') };
    }
    const stem = String(raw.stem || '').trim();
    if (!stem) return { error: '缺少題幹' };
    if (stem.indexOf('____') === -1) return { error: '題幹必須用 ____ 標示空格' };
    const correct = String(raw.correct_option || '').trim();
    if (!correct) return { error: '缺少正確選項' };

    let distractors = raw.distractors;
    if (!Array.isArray(distractors)) {
      distractors = [raw.distractor_1, raw.distractor_2, raw.distractor_3];
    }
    distractors = Array.from(new Set(distractors
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .filter(item => item.toLowerCase() !== correct.toLowerCase())));
    if (distractors.length < 2) {
      return { error: '至少需要 2 個不同於正確答案的干擾項' };
    }
    if (distractors.length > 3) distractors = distractors.slice(0, 3);

    const duplicate = (existingQuestions || grammar.questions).find(question => {
      return question.node_id === nodeId && String(question.stem).trim().toLowerCase() === stem.toLowerCase();
    });
    if (duplicate) return { error: '同一語法點已有相同題幹' };

    return {
      value: {
        node_id: nodeId,
        stem,
        highlight_word: String(raw.highlight_word || '').trim(),
        correct_option: correct,
        distractors,
        explanation: String(raw.explanation || '').trim(),
        status: raw.status === false ? false : true
      }
    };
  }

  function createQuestion(value, userId) {
    const question = {
      question_id: 'GQ_' + generateId(new Set(grammar.questions.map(item => item.question_id))),
      ...value,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };
    grammar.questions.push(question);
    return question;
  }

  function exportRows() {
    const nodes = nodeMap();
    return grammar.questions.map(question => {
      const node = nodes.get(question.node_id) || {};
      return {
        node_id: question.node_id,
        node_title: node.title || '',
        node_category: node.category || '',
        stem: question.stem,
        highlight_word: question.highlight_word || '',
        correct_option: question.correct_option,
        distractor_1: (question.distractors || [])[0] || '',
        distractor_2: (question.distractors || [])[1] || '',
        distractor_3: (question.distractors || [])[2] || '',
        explanation: question.explanation || ''
      };
    });
  }

  function exportCsv(rows) {
    const headers = [
      'node_id', 'node_title', 'node_category', 'stem', 'highlight_word',
      'correct_option', 'distractor_1', 'distractor_2', 'distractor_3', 'explanation'
    ];
    const lines = [headers.join(',')];
    rows.forEach(row => {
      lines.push(headers.map(header => csvCell(row[header])).join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function optionPayload(question) {
    const options = shuffle([question.correct_option].concat(question.distractors || []));
    const mapped = options.map((text, index) => ({ id: 'o' + index, text }));
    const answer = mapped.find(option => option.text === question.correct_option);
    return { options: mapped, answerId: answer ? answer.id : mapped[0].id };
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
    const question = questionMap().get(item.question_id);
    if (!question) {
      round.index += 1;
      if (round.index < round.queue.length) return prepareCurrent(round);
      return null;
    }
    const optionData = optionPayload(question);
    round.current = {
      question,
      item,
      options: optionData.options,
      answerId: optionData.answerId
    };
    round.answered = false;
    round.lastAnswer = null;
    return round.current;
  }

  function roundPayload(round) {
    if (!round.current) return null;
    const node = nodeMap().get(round.current.question.node_id) || {};
    return {
      roundId: round.roundId,
      taskId: round.taskId,
      taskName: round.taskName,
      position: round.index + 1,
      total: round.queue.length,
      initialTotal: round.initialTotal,
      combo: round.combo,
      retry: !!round.current.item.retry,
      question: {
        id: round.current.question.question_id,
        node_id: round.current.question.node_id,
        node_title: node.title || round.current.question.node_id,
        stem: round.current.question.stem,
        highlight_word: round.current.question.highlight_word || '',
        options: round.current.options
      }
    };
  }

  function updateMastery(userId, question, correct, passStreak) {
    const record = ensureMastery(userId, question.question_id);
    const previousBox = record.box_level || 0;
    const previousDate = record.last_practiced_at ? hkDate(record.last_practiced_at) : null;
    const today = hkDate();

    record.total_attempts = (record.total_attempts || 0) + 1;

    if (!correct) {
      record.total_wrong = (record.total_wrong || 0) + 1;
      record.consecutive_correct = 0;
      record.box_level = 0;
    } else {
      record.consecutive_correct = (record.consecutive_correct || 0) + 1;
      if (!previousDate) {
        record.box_level = 1;
      } else if (previousDate !== today && record.consecutive_correct >= passStreak) {
        record.box_level = 3;
      } else {
        record.box_level = Math.min(2, Math.max(1, previousBox + 1));
      }
    }

    record.last_practiced_at = new Date().toISOString();
    return {
      box_level: record.box_level,
      previousBox,
      becameMastered: record.box_level === 3 && previousBox !== 3
    };
  }

  function pickQuestions(pool, userId, batchSize) {
    if (!pool.length) return [];
    const records = new Map();
    pool.forEach(question => {
      const record = findMastery(userId, question.question_id);
      if (record) records.set(question.question_id, record);
    });

    const wrong = pool.filter(question => {
      const record = records.get(question.question_id);
      return record && record.box_level === 0 && (record.total_wrong || 0) > 0;
    }).sort((a, b) => {
      const ar = records.get(a.question_id);
      const br = records.get(b.question_id);
      return (br.total_wrong || 0) - (ar.total_wrong || 0);
    });

    const fresh = shuffle(pool.filter(question => {
      const record = records.get(question.question_id);
      return !record || !record.total_attempts;
    }));

    const review = pool.filter(question => {
      const record = records.get(question.question_id);
      return record && record.total_attempts > 0 && (record.box_level === 1 || record.box_level === 2);
    }).sort((a, b) => {
      const ar = records.get(a.question_id);
      const br = records.get(b.question_id);
      return String(ar.last_practiced_at || '').localeCompare(String(br.last_practiced_at || ''));
    });

    const mastered = shuffle(pool.filter(question => {
      const record = records.get(question.question_id);
      return record && record.box_level === 3;
    }));

    const target = Math.max(1, Math.min(batchSize, pool.length));
    const chosen = [];
    const used = new Set();

    function take(list, count) {
      let taken = 0;
      for (const question of list) {
        if (taken >= count || chosen.length >= target) break;
        if (used.has(question.question_id)) continue;
        used.add(question.question_id);
        chosen.push(question);
        taken += 1;
      }
    }

    take(wrong, Math.round(target * 0.4));
    take(fresh, Math.round(target * 0.3));
    take(review, Math.round(target * 0.3));

    if (chosen.length < target) {
      take(wrong, target);
      take(fresh, target);
      take(review, target);
      take(mastered, target);
      take(shuffle(pool), target);
    }

    return chosen;
  }

  function roundSummary(round) {
    const task = findTask(round.taskId);
    const progress = task ? serializeTask(task, round.userId) : null;
    const wrongQuestions = [];
    round.wrong.forEach((count, questionId) => {
      const question = questionMap().get(questionId);
      if (question) {
        wrongQuestions.push({
          question_id: questionId,
          stem: question.stem,
          node_id: question.node_id,
          correct_option: question.correct_option,
          count
        });
      }
    });
    const answered = round.answeredCount || 0;
    return {
      task: progress,
      total: round.initialTotal,
      answered,
      correct: round.correctCount,
      accuracy: answered ? Math.round((round.correctCount / answered) * 1000) / 10 : 0,
      retries: round.retries,
      newlyMastered: round.mastered.size,
      wrongQuestions
    };
  }

  function replaceQuestions(items, userId) {
    const oldByKey = new Map();
    grammar.questions.forEach(question => {
      const key = question.node_id + '|' + String(question.stem).trim().toLowerCase();
      const list = oldByKey.get(key) || [];
      list.push(question);
      oldByKey.set(key, list);
    });

    const errors = [];
    const prepared = [];
    const usedIds = new Set();
    const usedKeys = new Set();
    const nowIso = new Date().toISOString();
    let added = 0;
    let reused = 0;

    items.forEach((raw, index) => {
      const result = normalizeQuestion(raw, []);
      if (result.error) {
        errors.push({ row: index + 1, error: result.error });
        return;
      }
      const value = result.value;
      const key = value.node_id + '|' + value.stem.toLowerCase();
      if (usedKeys.has(key)) {
        errors.push({ row: index + 1, error: '同一語法點已有相同題幹' });
        return;
      }
      usedKeys.add(key);

      let base = null;
      const candidates = oldByKey.get(key) || [];
      if (candidates.length === 1 && !usedIds.has(String(candidates[0].question_id))) {
        base = candidates[0];
      }

      let questionId;
      if (base) {
        questionId = String(base.question_id);
        reused += 1;
      } else {
        do {
          questionId = 'GQ_' + generateId();
        } while (usedIds.has(questionId));
        added += 1;
      }
      usedIds.add(questionId);
      prepared.push({
        question_id: questionId,
        ...value,
        createdBy: base ? base.createdBy : userId,
        createdAt: base ? base.createdAt : nowIso,
        updatedAt: nowIso
      });
    });

    if (errors.length) {
      const head = errors.slice(0, 3).map(item => '第 ' + item.row + ' 行：' + item.error).join('；');
      return {
        error: head + (errors.length > 3 ? '（共 ' + errors.length + ' 個錯誤）' : ''),
        errors
      };
    }

    const newIds = new Set(prepared.map(question => String(question.question_id)));
    const newNodeIds = new Set(prepared.map(question => question.node_id));
    const oldTotal = grammar.questions.length;
    const removed = grammar.questions.filter(question => !newIds.has(String(question.question_id))).length;
    const masteryBefore = grammar.mastery.length;

    grammar.questions = prepared;
    grammar.mastery = grammar.mastery.filter(record => newIds.has(String(record.question_id)));
    const masteryRemoved = masteryBefore - grammar.mastery.length;

    let tasksUpdated = 0;
    let tasksArchived = 0;
    grammar.tasks.forEach(task => {
      const before = Array.isArray(task.question_ids) ? task.question_ids : [];
      const after = before.filter(id => newIds.has(String(id)));
      if (after.length !== before.length) {
        task.question_ids = after;
        task.updatedAt = nowIso;
        tasksUpdated += 1;
      }
      const nodesHaveQuestions = !task.fixedQuestions && (task.target_nodes || []).some(id => newNodeIds.has(id));
      const hasQuestions = after.length > 0 || nodesHaveQuestions;
      if (!hasQuestions && !task.is_archived) {
        task.is_archived = true;
        task.updatedAt = nowIso;
        tasksArchived += 1;
      }
    });

    rounds.clear();

    return {
      mode: 'replace',
      total: prepared.length,
      added,
      reused,
      removed,
      oldTotal,
      masteryRemoved,
      tasksUpdated,
      tasksArchived
    };
  }

  async function handleAPI(req, res, parsedUrl) {
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const user = requireAuth(req, res);
    if (!user) return;
    const userId = user.id;

    if (pathname === '/api/overview' && method === 'GET') {
      jsonResponse(res, 200, {
        nodes: nodesWithStats(userId),
        tasks: taskForUser(userId),
        stats: userStats(userId),
        questionCount: grammar.questions.filter(question => question.status !== false).length
      });
      return;
    }

    if (pathname === '/api/nodes' && method === 'GET') {
      jsonResponse(res, 200, nodesWithStats(userId));
      return;
    }

    if (pathname === '/api/questions' && method === 'GET') {
      const nodeId = parsedUrl.query.node_id || '';
      const list = grammar.questions
        .filter(question => !nodeId || question.node_id === nodeId)
        .map(question => ({ ...question, mastery: findMastery(userId, question.question_id) }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      jsonResponse(res, 200, list);
      return;
    }

    if (pathname === '/api/questions/export' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      const format = String(parsedUrl.query.format || 'json').toLowerCase();
      if (format !== 'json' && format !== 'csv') {
        return jsonResponse(res, 400, { error: '不支援的匯出格式' });
      }
      const rows = exportRows();
      const body = format === 'csv' ? exportCsv(rows) : JSON.stringify(rows, null, 2);
      res.writeHead(200, {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="grammar-questions-' + hkDate() + '.' + format + '"',
        'Cache-Control': 'no-store'
      });
      res.end(body);
      return;
    }

    if (pathname === '/api/questions' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = normalizeQuestion(body);
        if (result.error) return jsonResponse(res, 400, { error: result.error });
        const question = createQuestion(result.value, userId);
        await saveData();
        jsonResponse(res, 201, question);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/questions/') && method === 'PUT') {
      const questionId = pathname.split('/').pop();
      const question = grammar.questions.find(item => String(item.question_id) === String(questionId));
      if (!question) return jsonResponse(res, 404, { error: '題目不存在' });
      try {
        const body = await parseBody(req);
        const result = normalizeQuestion({ ...question, ...body }, grammar.questions.filter(item => item !== question));
        if (result.error) return jsonResponse(res, 400, { error: result.error });
        Object.assign(question, result.value, { updatedAt: new Date().toISOString() });
        await saveData();
        jsonResponse(res, 200, question);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/questions/') && method === 'DELETE') {
      const questionId = pathname.split('/').pop();
      const index = grammar.questions.findIndex(item => String(item.question_id) === String(questionId));
      if (index < 0) return jsonResponse(res, 404, { error: '題目不存在' });
      grammar.questions.splice(index, 1);
      grammar.mastery = grammar.mastery.filter(record => String(record.question_id) !== String(questionId));
      await saveData();
      jsonResponse(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/questions/import' && method === 'POST') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      try {
        const body = await parseBody(req);
        const mode = body.mode === 'replace' ? 'replace' : 'append';
        const items = Array.isArray(body.items) ? body.items : parseImportText(body.text);
        if (!Array.isArray(items) || !items.length) {
          return jsonResponse(res, 400, { error: '找不到可匯入的題目' });
        }
        if (mode === 'replace') {
          if (body.confirm !== true) {
            return jsonResponse(res, 400, { error: '全量覆蓋需要確認' });
          }
          if (items.length > 2000) {
            return jsonResponse(res, 400, { error: '一次最多覆蓋 2000 道題目' });
          }
          const result = replaceQuestions(items, userId);
          if (result.error) {
            return jsonResponse(res, 400, { error: result.error, errors: result.errors });
          }
          await saveData();
          jsonResponse(res, 200, result);
          return;
        }
        if (items.length > 500) {
          return jsonResponse(res, 400, { error: '一次最多匯入 500 道題目' });
        }
        const results = { mode: 'append', added: 0, skipped: 0, errors: [] };
        const seen = new Set(grammar.questions.map(question => question.node_id + '|' + String(question.stem).trim().toLowerCase()));
        items.forEach((raw, index) => {
          const result = normalizeQuestion(raw);
          if (result.error) {
            results.errors.push({ row: index + 1, error: result.error });
            return;
          }
          const key = result.value.node_id + '|' + result.value.stem.toLowerCase();
          if (seen.has(key)) {
            results.skipped += 1;
            return;
          }
          seen.add(key);
          createQuestion(result.value, userId);
          results.added += 1;
        });
        await saveData();
        jsonResponse(res, 200, results);
      } catch (error) {
        jsonResponse(res, 400, { error: '匯入格式不正確' });
      }
      return;
    }

    if (pathname === '/api/import-prompt' && method === 'GET') {
      const nodeId = parsedUrl.query.node_id || (grammar.nodes[0] && grammar.nodes[0].node_id);
      const node = nodeMap().get(nodeId);
      if (!node) return jsonResponse(res, 404, { error: '語法節點不存在' });
      const prompt = [
        '請扮演一位資深少兒英語老師，針對語法節點【' + node.node_id + '（' + node.title + '）】生成 10 道適合小學階段的英文單項選擇題。',
        '請嚴格按 JSON 陣列格式輸出，不要包含任何多餘解釋文字，每個物件包含以下欄位：',
        '- node_id：固定為 "' + node.node_id + '"',
        '- stem：題幹，挖空處用四個下劃線 "____" 表示',
        '- highlight_word：題幹中的破題關鍵詞（如時間狀語或主語）',
        '- correct_option：正確選項',
        '- distractor_1：干擾項 1',
        '- distractor_2：干擾項 2',
        '- distractor_3：干擾項 3',
        '- explanation：面向小朋友的一句話簡短中文解析'
      ].join('\n');
      jsonResponse(res, 200, { node_id: node.node_id, prompt });
      return;
    }

    if (pathname === '/api/admin/tasks' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      jsonResponse(res, 200, adminTaskList());
      return;
    }

    if (pathname === '/api/admin/stats' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      jsonResponse(res, 200, buildAdminStats());
      return;
    }

    if (pathname === '/api/tasks' && method === 'GET') {
      jsonResponse(res, 200, taskForUser(userId));
      return;
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '只有管理員可以建立任務' });
      try {
        const body = await parseBody(req);
        const name = String(body.task_name || '').trim();
        if (!name || name.length > 40) return jsonResponse(res, 400, { error: '任務名稱需為 1-40 字' });
        const nodes = Array.isArray(body.target_nodes) ? body.target_nodes.filter(id => nodeMap().has(id)) : [];
        const pinned = Array.isArray(body.question_ids) ? Array.from(new Set(body.question_ids.filter(id => questionMap().has(id)))) : [];
        if (!nodes.length && !pinned.length) return jsonResponse(res, 400, { error: '請至少選擇一個語法點或指定題目' });
        const hasTargets = body.userIds !== undefined || body.userId !== undefined;
        const resolved = resolveUserIds(db, hasTargets ? (body.userIds !== undefined ? body.userIds : body.userId) : [userId]);
        if (resolved.error) return jsonResponse(res, 400, { error: resolved.error });
        const requested = Math.max(1, Math.min(30, parseInt(body.batch_size, 10) || 10));
        const pool = taskPool(nodes, pinned);
        if (!pool.length) return jsonResponse(res, 400, { error: '所選語法點沒有可用題目' });
        const taskSize = Math.max(pinned.length, Math.min(requested, pool.length));
        const chosen = chooseTaskQuestions(pool, pinned, taskSize);
        const fixedIds = chosen.map(question => question.question_id);
        const batchSize = Math.max(1, Math.min(requested, fixedIds.length || 1));
        const passStreak = Math.max(2, Math.min(6, parseInt(body.pass_streak, 10) || 3));
        const groupId = generateId(new Set(grammar.tasks.map(item => taskGroupId(item))));
        const created = resolved.userIds.map(targetId => {
          const task = {
            task_id: generateId(new Set(grammar.tasks.map(item => item.task_id))),
            groupId,
            userId: targetId,
            scope: resolved.all ? 'all' : 'selected',
            createdBy: userId,
            task_name: name,
            target_nodes: Array.from(new Set(nodes)),
            question_ids: fixedIds,
            fixedQuestions: true,
            batch_size: batchSize,
            pass_streak: passStreak,
            is_archived: false,
            createdAt: new Date().toISOString()
          };
          grammar.tasks.push(task);
          return task;
        });
        await saveData();
        jsonResponse(res, 201, {
          groupId,
          scope: resolved.all ? 'all' : 'selected',
          created: created.length,
          requested,
          total: fixedIds.length,
          tasks: created.map(task => serializeTask(task, task.userId))
        });
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'PUT') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '只有管理員可以修改任務' });
      const taskId = pathname.split('/')[3];
      const task = findTask(taskId);
      if (!task) return jsonResponse(res, 404, { error: '任務不存在' });
      try {
        const body = await parseBody(req);
        const group = grammar.tasks.filter(item => String(taskGroupId(item)) === String(taskGroupId(task)));
        const targets = group.length ? group : [task];
        const name = body.task_name !== undefined ? String(body.task_name).trim() : task.task_name;
        if (!name || name.length > 40) return jsonResponse(res, 400, { error: '任務名稱需為 1-40 字' });
        const nodes = body.target_nodes !== undefined
          ? (Array.isArray(body.target_nodes) ? body.target_nodes.filter(id => nodeMap().has(id)) : [])
          : (task.target_nodes || []);
        const pinned = body.question_ids !== undefined
          ? (Array.isArray(body.question_ids) ? Array.from(new Set(body.question_ids.filter(id => questionMap().has(id)))) : [])
          : (task.question_ids || []);
        if (!nodes.length && !pinned.length) {
          return jsonResponse(res, 400, { error: '請至少保留一個語法點或指定題目' });
        }
        targets.forEach(item => {
          if (body.task_name !== undefined) item.task_name = name;
          if (body.target_nodes !== undefined) item.target_nodes = nodes;
          if (body.question_ids !== undefined) item.question_ids = pinned;
        });
        if (body.batch_size !== undefined) {
          const batchSize = Math.max(1, Math.min(30, parseInt(body.batch_size, 10) || task.batch_size));
          targets.forEach(item => { item.batch_size = batchSize; });
        }
        if (body.pass_streak !== undefined) {
          const passStreak = Math.max(2, Math.min(6, parseInt(body.pass_streak, 10) || task.pass_streak));
          targets.forEach(item => { item.pass_streak = passStreak; });
        }
        if (body.is_archived !== undefined) {
          targets.forEach(item => { item.is_archived = !!body.is_archived; });
        }
        const updatedAt = new Date().toISOString();
        targets.forEach(item => {
          item.fixedQuestions = true;
          const count = (item.question_ids || []).length;
          item.batch_size = Math.max(1, Math.min(item.batch_size || count || 1, count || 1));
          item.updatedAt = updatedAt;
        });
        await saveData();
        jsonResponse(res, 200, {
          updated: targets.length,
          tasks: targets.map(item => serializeTask(item, item.userId))
        });
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/wrong') && method === 'GET') {
      const parts = pathname.split('/');
      const task = findTask(parts[3]);
      if (!task) return jsonResponse(res, 404, { error: '任務不存在' });
      if (user.role !== 'admin' && String(task.userId) !== String(userId)) {
        return jsonResponse(res, 404, { error: '任務不存在' });
      }
      const ownerId = task.userId;
      const list = taskQuestions(task)
        .map(question => {
          const record = findMastery(ownerId, question.question_id);
          return {
            question_id: question.question_id,
            node_id: question.node_id,
            stem: question.stem,
            correct_option: question.correct_option,
            total_wrong: record ? record.total_wrong || 0 : 0,
            total_attempts: record ? record.total_attempts || 0 : 0,
            box_level: record ? record.box_level || 0 : 0
          };
        })
        .filter(item => item.total_wrong > 0)
        .sort((a, b) => b.total_wrong - a.total_wrong || b.total_attempts - a.total_attempts);
      jsonResponse(res, 200, list);
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/start') && method === 'POST') {
      const parts = pathname.split('/');
      const task = findTask(parts[3]);
      if (!task) return jsonResponse(res, 404, { error: '任務不存在' });
      if (String(task.userId) !== String(userId)) {
        return jsonResponse(res, 403, { error: '這個任務不屬於你' });
      }
      if (task.is_archived) return jsonResponse(res, 400, { error: '任務已歸檔' });
      const pool = taskQuestions(task);
      if (!pool.length) return jsonResponse(res, 400, { error: '這個任務還沒有題目' });
      pruneRounds();
      const selected = pickQuestions(pool, userId, task.batch_size || 10);
      roundSeq += 1;
      const round = {
        roundId: 'GR_' + Date.now() + '_' + roundSeq,
        userId,
        taskId: task.task_id,
        taskName: task.task_name,
        passStreak: task.pass_streak || 3,
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
        startedAt: Date.now()
      };
      const current = prepareCurrent(round);
      if (!current) return jsonResponse(res, 400, { error: '無法建立練習' });
      rounds.set(round.roundId, round);
      jsonResponse(res, 200, roundPayload(round));
      return;
    }

    if (pathname.startsWith('/api/rounds/') && pathname.endsWith('/answer') && method === 'POST') {
      const roundId = pathname.split('/')[3];
      const round = rounds.get(roundId);
      if (!round || String(round.userId) !== String(userId)) {
        return jsonResponse(res, 404, { error: '練習已結束，請重新開始' });
      }
      if (round.answered) return jsonResponse(res, 409, { error: '這一題已經作答' });
      try {
        const body = await parseBody(req);
        const optionId = String(body.optionId || '');
        const selected = round.current.options.find(option => option.id === optionId);
        if (!selected) return jsonResponse(res, 400, { error: '請選擇一個選項' });
        const correct = optionId === round.current.answerId;
        const question = round.current.question;
        const mastery = updateMastery(userId, question, correct, round.passStreak);
        if (mastery.becameMastered) round.mastered.add(question.question_id);

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

        round.answered = true;
        round.lastAnswer = { optionId, correct };
        grammar.attempts.push({
          id: generateId(new Set(grammar.attempts.map(item => item.id))),
          userId,
          question_id: question.question_id,
          task_id: round.taskId,
          correct,
          practicedAt: new Date().toISOString()
        });
        await saveData();

        const node = nodeMap().get(question.node_id) || {};
        jsonResponse(res, 200, {
          correct,
          correctOption: question.correct_option,
          explanation: question.explanation || '',
          ruleTip: node.rule_tip || '',
          highlightWord: question.highlight_word || '',
          combo: round.combo,
          position: round.index + 1,
          total: round.queue.length,
          retryAdded,
          becameMastered: mastery.becameMastered,
          boxLevel: mastery.box_level
        });
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/rounds/') && pathname.endsWith('/next') && method === 'POST') {
      const roundId = pathname.split('/')[3];
      const round = rounds.get(roundId);
      if (!round || String(round.userId) !== String(userId)) {
        return jsonResponse(res, 404, { error: '練習已結束，請重新開始' });
      }
      if (!round.answered) return jsonResponse(res, 400, { error: '請先作答' });
      round.index += 1;
      if (round.index >= round.queue.length) {
        const summary = roundSummary(round);
        rounds.delete(roundId);
        jsonResponse(res, 200, { done: true, summary });
        return;
      }
      prepareCurrent(round);
      jsonResponse(res, 200, { done: false, ...roundPayload(round) });
      return;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      jsonResponse(res, 200, userStats(userId));
      return;
    }

    jsonResponse(res, 404, { error: 'API Not Found' });
  }

  function stats() {
    return db.users.map(user => {
      const summary = userStats(user.id);
      return {
        userId: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar || null,
        score: summary.mastered,
        mastered: summary.mastered,
        attempted: summary.attempted,
        attempts: summary.totalAttempts,
        wrong: summary.totalWrong,
        accuracy: summary.accuracy,
        recent7: summary.recent7
      };
    });
  }

  migrateLegacyTasks();

  return { handleAPI, stats };
}

module.exports = { id: 'grammar', create: createGrammarTool };
