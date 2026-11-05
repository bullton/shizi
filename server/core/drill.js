const { generateId } = require('./ids');
const { listUsers, resolveUserIds } = require('./delegation');

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

function createDrill({
  db,
  saveData,
  key,
  seed,
  seedQuestion,
  seedMessage,
  optionPayload,
  questionPayload,
  answerPayload,
  summaryQuestion,
  targetLabel = '項目',
  roundPrefix = 'R_'
}) {
  const now = new Date().toISOString();

  if (!db[key]) {
    db[key] = {
      seedVersion: 1,
      seededAt: now,
      nodes: (seed.nodes || []).map(node => ({ ...node })),
      questions: (seed.questions || []).map(question => {
        if (seedQuestion) return seedQuestion(question, now);
        return { ...question, status: question.status !== false, createdAt: now };
      }),
      tasks: [],
      mastery: [],
      taskMastery: [],
      attempts: []
    };
    saveData().catch(error => console.warn('[' + key + '] 初始化儲存失敗：' + error.message));
    if (seedMessage) console.log(seedMessage);
  } else {
    db[key].nodes = db[key].nodes || [];
    db[key].questions = db[key].questions || [];
    db[key].tasks = db[key].tasks || [];
    db[key].mastery = db[key].mastery || [];
    db[key].attempts = db[key].attempts || [];
  }

  const needsTaskMasteryMigration = !Array.isArray(db[key].taskMastery);
  db[key].taskMastery = Array.isArray(db[key].taskMastery) ? db[key].taskMastery : [];
  const data = db[key];

  function nodeMap() {
    return new Map(data.nodes.map(node => [node.node_id, node]));
  }

  function questionMap() {
    return new Map(data.questions.map(question => [question.question_id, question]));
  }

  function findTask(taskId) {
    return data.tasks.find(task => String(task.task_id) === String(taskId)) || null;
  }

  function taskGroupId(task) {
    return task.groupId || task.task_id;
  }

  function taskPool(nodes, pinned) {
    const nodeIds = new Set((nodes || []).map(String));
    const pinnedIds = new Set((pinned || []).map(String));
    return data.questions.filter(question => {
      if (question.status === false) return false;
      return nodeIds.has(String(question.node_id)) || pinnedIds.has(String(question.question_id));
    });
  }

  function chooseTaskQuestions(pool, pinned, desired, preferred) {
    const byId = new Map(pool.map(question => [String(question.question_id), question]));
    const chosen = [];
    const used = new Set();

    (pinned || []).forEach(id => {
      const questionKey = String(id);
      const question = byId.get(questionKey);
      if (!question || used.has(questionKey)) return;
      used.add(questionKey);
      chosen.push(question);
    });

    if (chosen.length >= desired) return chosen.slice(0, desired);

    const preferredIds = new Set((preferred || []).map(String));
    pool.forEach(question => {
      if (chosen.length >= desired) return;
      const questionKey = String(question.question_id);
      if (used.has(questionKey) || !preferredIds.has(questionKey)) return;
      used.add(questionKey);
      chosen.push(question);
    });

    if (chosen.length >= desired) return chosen;

    const groups = new Map();
    pool.forEach(question => {
      const questionKey = String(question.question_id);
      if (used.has(questionKey)) return;
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
      return data.questions.filter(question => {
        if (question.status === false) return false;
        return pinned.has(String(question.question_id));
      });
    }
    return taskPool(task.target_nodes || [], task.question_ids || []);
  }

  function migrateLegacyTasks() {
    const groups = new Map();
    data.tasks.forEach(task => {
      if (task.fixedQuestions) return;
      const groupKey = String(taskGroupId(task));
      const list = groups.get(groupKey) || [];
      list.push(task);
      groups.set(groupKey, list);
    });
    if (!groups.size) return;

    const nowIso = new Date().toISOString();
    const activeIds = new Set(data.questions.filter(question => question.status !== false).map(question => String(question.question_id)));
    let changed = 0;

    groups.forEach(items => {
      const first = items[0];
      const pinned = (first.question_ids || []).map(String).filter(id => activeIds.has(id));
      const pool = taskPool(first.target_nodes || [], pinned);
      const requested = Math.max(1, Math.min(30, parseInt(first.batch_size, 10) || 10));
      const desired = Math.max(pinned.length, Math.min(requested, pool.length));
      const userIds = new Set(items.map(item => String(item.userId)));
      const practiced = new Set();

      data.mastery.forEach(record => {
        if (!userIds.has(String(record.userId)) || !(record.total_attempts > 0)) return;
        practiced.add(String(record.question_id));
      });
      data.attempts.forEach(attempt => {
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
      saveData().catch(error => console.warn('[' + key + '] 固定舊任務題目儲存失敗：' + error.message));
      console.log('[' + key + '] 已固定 ' + changed + ' 個舊任務的題目數量');
    }
  }

  function migrateTaskMastery() {
    let changed = false;
    data.mastery.forEach(record => {
      if (record.box_level === 3) {
        if (!record.mastered_at) {
          record.mastered_at = record.last_practiced_at || new Date().toISOString();
          changed = true;
        }
      } else if (record.mastered_at) {
        record.mastered_at = null;
        changed = true;
      }
    });

    if (!needsTaskMasteryMigration) {
      if (changed) saveData().catch(error => console.warn('[' + key + '] 熟練度時間儲存失敗：' + error.message));
      return;
    }

    const taskById = new Map(data.tasks.map(task => [String(task.task_id), task]));
    const questionIds = new Set(data.questions.map(question => String(question.question_id)));
    const attempts = data.attempts
      .filter(attempt => taskById.has(String(attempt.task_id)) && questionIds.has(String(attempt.question_id)))
      .slice()
      .sort((a, b) => String(a.practicedAt || '').localeCompare(String(b.practicedAt || '')));

    attempts.forEach(attempt => {
      const task = taskById.get(String(attempt.task_id));
      const practicedAt = attempt.practicedAt || task.createdAt || new Date().toISOString();
      const record = ensureTaskMastery(attempt.userId, task.task_id, attempt.question_id);
      advanceRecord(record, !!attempt.correct, task.pass_streak || 3, practicedAt);
    });

    saveData().catch(error => console.warn('[' + key + '] 任務熟練度遷移儲存失敗：' + error.message));
    console.log('[' + key + '] 已由作答紀錄建立 ' + data.taskMastery.length + ' 筆任務熟練度');
  }

  function findMastery(userId, questionId) {
    return data.mastery.find(record => String(record.userId) === String(userId) && String(record.question_id) === String(questionId)) || null;
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
        last_practiced_at: null,
        mastered_at: null
      };
      data.mastery.push(record);
    }
    return record;
  }

  function findTaskMastery(userId, taskId, questionId) {
    return data.taskMastery.find(record =>
      String(record.userId) === String(userId) &&
      String(record.task_id) === String(taskId) &&
      String(record.question_id) === String(questionId)
    ) || null;
  }

  function ensureTaskMastery(userId, taskId, questionId) {
    let record = findTaskMastery(userId, taskId, questionId);
    if (!record) {
      record = {
        userId,
        task_id: taskId,
        question_id: questionId,
        box_level: 0,
        consecutive_correct: 0,
        total_attempts: 0,
        total_wrong: 0,
        last_practiced_at: null,
        mastered_at: null
      };
      data.taskMastery.push(record);
    }
    return record;
  }

  function advanceRecord(record, correct, passStreak, practicedAt) {
    const previousBox = record.box_level || 0;
    const previousDate = record.last_practiced_at ? hkDate(record.last_practiced_at) : null;
    const attemptDate = hkDate(practicedAt);

    record.total_attempts = (record.total_attempts || 0) + 1;

    if (!correct) {
      record.total_wrong = (record.total_wrong || 0) + 1;
      record.consecutive_correct = 0;
      record.box_level = 0;
      record.mastered_at = null;
    } else {
      record.consecutive_correct = (record.consecutive_correct || 0) + 1;
      if (!previousDate) {
        record.box_level = 1;
      } else if (previousDate !== attemptDate && record.consecutive_correct >= passStreak) {
        record.box_level = 3;
      } else {
        record.box_level = Math.min(2, Math.max(1, previousBox + 1));
      }
      if (record.box_level === 3) {
        if (previousBox !== 3 || !record.mastered_at) record.mastered_at = practicedAt;
      } else {
        record.mastered_at = null;
      }
    }

    record.last_practiced_at = practicedAt;
    return {
      box_level: record.box_level,
      previousBox,
      becameMastered: record.box_level === 3 && previousBox !== 3
    };
  }

  function userStats(userId) {
    const records = data.mastery.filter(record => String(record.userId) === String(userId));
    const attempted = records.filter(record => record.total_attempts > 0).length;
    const mastered = records.filter(record => record.box_level === 3).length;
    const totalQuestions = data.questions.filter(question => question.status !== false).length;
    const totalAttempts = records.reduce((sum, record) => sum + (record.total_attempts || 0), 0);
    const totalWrong = records.reduce((sum, record) => sum + (record.total_wrong || 0), 0);
    const accuracy = totalAttempts > 0 ? ((totalAttempts - totalWrong) / totalAttempts) * 100 : 0;
    const userAttempts = data.attempts.filter(attempt => String(attempt.userId) === String(userId));
    const timedAttempts = userAttempts.filter(attempt => {
      const responseTime = Number(attempt.responseTime);
      return Number.isFinite(responseTime) && responseTime > 0;
    });
    const avgTime = timedAttempts.length > 0
      ? timedAttempts.reduce((sum, attempt) => sum + Number(attempt.responseTime), 0) / timedAttempts.length
      : 0;
    const days = recentSevenDays();
    const recent7 = userAttempts.filter(attempt => days.has(hkDate(attempt.practicedAt))).length;
    const lastPracticed = records
      .map(record => record.last_practiced_at)
      .filter(Boolean)
      .sort()
      .pop() || null;

    return {
      mastered,
      attempted,
      totalQuestions,
      masteryRate: percent(mastered, totalQuestions),
      totalAttempts,
      totalWrong,
      accuracy: Math.round(accuracy * 10) / 10,
      avgTime,
      timedAttempts: timedAttempts.length,
      recent7,
      lastPracticed
    };
  }

  function nodesWithStats(userId) {
    const counts = new Map();
    const mastered = new Map();
    data.questions.forEach(question => {
      if (question.status === false) return;
      counts.set(question.node_id, (counts.get(question.node_id) || 0) + 1);
      const record = findMastery(userId, question.question_id);
      if (record && record.box_level === 3) {
        mastered.set(question.node_id, (mastered.get(question.node_id) || 0) + 1);
      }
    });

    return data.nodes.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(node => {
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
    const questions = data.questions.filter(question => question.status !== false);
    const questionById = new Map(questions.map(question => [String(question.question_id), question]));
    const nodes = data.nodes.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const nodeById = new Map(nodes.map(node => [node.node_id, node]));
    const nodeTotals = new Map();
    questions.forEach(question => {
      nodeTotals.set(question.node_id, (nodeTotals.get(question.node_id) || 0) + 1);
    });

    const masteryByUser = new Map();
    data.mastery.forEach(record => {
      const userKey = String(record.userId);
      let records = masteryByUser.get(userKey);
      if (!records) {
        records = new Map();
        masteryByUser.set(userKey, records);
      }
      records.set(String(record.question_id), record);
    });

    const attemptsByUser = new Map();
    data.attempts.forEach(attempt => {
      if (!questionById.has(String(attempt.question_id))) return;
      const userKey = String(attempt.userId);
      let list = attemptsByUser.get(userKey);
      if (!list) {
        list = [];
        attemptsByUser.set(userKey, list);
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
    const records = questions.map(question => findTaskMastery(userId, task.task_id, question.question_id));
    const attempted = records.filter(record => record && (record.total_attempts || 0) > 0).length;
    const mastered = records.filter(record => record && record.box_level === 3).length;
    const wrong = records.filter(record => record && (record.total_wrong || 0) > 0).length;
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

  function taskAnswerStats() {
    const stats = new Map();
    data.attempts.forEach(attempt => {
      const statsKey = String(attempt.task_id || '');
      if (!statsKey) return;
      let row = stats.get(statsKey);
      if (!row) {
        row = { answerCount: 0, correctCount: 0, timedCount: 0, timeSum: 0, lastPracticed: null };
        stats.set(statsKey, row);
      }
      row.answerCount += 1;
      if (attempt.correct) row.correctCount += 1;
      const responseTime = Number(attempt.responseTime);
      if (responseTime > 0) {
        row.timedCount += 1;
        row.timeSum += responseTime;
      }
      if (attempt.practicedAt && (!row.lastPracticed || String(attempt.practicedAt) > String(row.lastPracticed))) {
        row.lastPracticed = attempt.practicedAt;
      }
    });
    return stats;
  }

  function taskForUser(userId) {
    const answerStats = taskAnswerStats();
    const today = hkDate();
    const todayByTask = new Map();
    data.attempts.forEach(attempt => {
      if (String(attempt.userId) !== String(userId)) return;
      if (!attempt.task_id) return;
      if (hkDate(attempt.practicedAt) !== today) return;
      const taskKey = String(attempt.task_id);
      let questionIds = todayByTask.get(taskKey);
      if (!questionIds) {
        questionIds = new Set();
        todayByTask.set(taskKey, questionIds);
      }
      questionIds.add(String(attempt.question_id));
    });
    return data.tasks
      .filter(task => String(task.userId) === String(userId) && !task.is_archived)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(task => {
        const stats = answerStats.get(String(task.task_id)) || {
          answerCount: 0,
          correctCount: 0,
          timedCount: 0,
          timeSum: 0,
          lastPracticed: null
        };
        const serialized = serializeTask(task, userId);
        const taskQuestionIds = new Set(taskQuestions(task).map(question => String(question.question_id)));
        const todayQuestionIds = todayByTask.get(String(task.task_id)) || new Set();
        let todayAttempted = 0;
        todayQuestionIds.forEach(questionId => {
          if (taskQuestionIds.has(questionId)) todayAttempted += 1;
        });
        const todayDone = serialized.total > 0 && todayAttempted >= serialized.total;
        return {
          ...serialized,
          answerCount: stats.answerCount,
          correctCount: stats.correctCount,
          accuracy: percent(stats.correctCount, stats.answerCount),
          errorRate: percent(stats.answerCount - stats.correctCount, stats.answerCount),
          avgTime: stats.timedCount ? stats.timeSum / stats.timedCount : 0,
          lastPracticed: stats.lastPracticed,
          todayAttempted,
          todayDone,
          todayPartial: todayAttempted > 0 && !todayDone
        };
      });
  }

  function activeInProgressQuestionIds(userId) {
    const ids = new Set();
    data.tasks
      .filter(task => String(task.userId) === String(userId) && !task.is_archived)
      .forEach(task => {
        (task.question_ids || []).forEach(questionId => {
          const record = findTaskMastery(userId, task.task_id, questionId);
          if (!record || record.box_level !== 3) ids.add(String(questionId));
        });
      });
    return ids;
  }

  function recentlyMasteredQuestionIds(userId) {
    const ids = new Set();
    data.mastery.forEach(record => {
      if (String(record.userId) !== String(userId)) return;
      if (recentlyMastered(record)) ids.add(String(record.question_id));
    });
    return ids;
  }

  function adminTaskList() {
    const users = new Map((db.users || []).map(user => [String(user.id), user]));
    const answerStats = taskAnswerStats();
    return data.tasks
      .slice()
      .sort((a, b) => Number(!!a.is_archived) - Number(!!b.is_archived) || String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(task => {
        const user = users.get(String(task.userId));
        const stats = answerStats.get(String(task.task_id)) || {
          answerCount: 0,
          correctCount: 0,
          timedCount: 0,
          timeSum: 0,
          lastPracticed: null
        };
        return {
          ...serializeTask(task, task.userId),
          username: user ? (user.nickname || user.username) : '（已刪除用戶）',
          role: user ? (user.role || 'user') : null,
          answerCount: stats.answerCount,
          correctCount: stats.correctCount,
          answerAccuracy: percent(stats.correctCount, stats.answerCount),
          timedCount: stats.timedCount,
          avgTime: stats.timedCount ? Math.round(stats.timeSum / stats.timedCount) : 0,
          lastPracticed: stats.lastPracticed
        };
      });
  }

  function recentlyMastered(record) {
    if (!record || record.box_level !== 3) return false;
    const masteredAt = Date.parse(record.mastered_at || record.last_practiced_at || '');
    if (!Number.isFinite(masteredAt)) return true;
    return masteredAt >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }

  function eligibleTaskQuestions(pool, userId, taskId) {
    return pool.filter(question => {
      const record = findTaskMastery(userId, taskId, question.question_id);
      return !recentlyMastered(record);
    });
  }

  function pickQuestions(pool, userId, batchSize, taskId) {
    if (!pool.length) return [];
    const records = new Map();
    pool.forEach(question => {
      const record = findTaskMastery(userId, taskId, question.question_id);
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
        ...questionPayload(round.current.question, node, round),
        options: round.current.options
      }
    };
  }

  function updateMastery(userId, question, correct, passStreak, practicedAt) {
    const record = ensureMastery(userId, question.question_id);
    return advanceRecord(record, correct, passStreak, practicedAt || new Date().toISOString());
  }

  function updateTaskMastery(userId, taskId, question, correct, passStreak, practicedAt) {
    const record = ensureTaskMastery(userId, taskId, question.question_id);
    return advanceRecord(record, correct, passStreak, practicedAt || new Date().toISOString());
  }

  function startRound(userId, task, selected) {
    if (!selected.length) {
      return { status: 400, body: { error: '這個任務暫時沒有可練習的題目' } };
    }
    roundSeq += 1;
    const round = {
      roundId: roundPrefix + Date.now() + '_' + roundSeq,
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
    if (!current) return { status: 400, body: { error: '無法建立練習' } };
    rounds.set(round.roundId, round);
    return { status: 200, body: roundPayload(round) };
  }

  async function answerRound({ userId, roundId, optionId, responseTime }) {
    const round = rounds.get(roundId);
    if (!round || String(round.userId) !== String(userId)) {
      return { status: 404, body: { error: '練習已結束，請重新開始' } };
    }
    if (round.answered) return { status: 409, body: { error: '這一題已經作答' } };
    const selected = round.current.options.find(option => option.id === optionId);
    if (!selected) return { status: 400, body: { error: '請選擇一個選項' } };
    const correct = optionId === round.current.answerId;
    const question = round.current.question;
    const task = findTask(round.taskId);
    const passStreak = task ? (task.pass_streak || 3) : (round.passStreak || 3);
    const practicedAt = new Date().toISOString();
    updateMastery(userId, question, correct, passStreak, practicedAt);
    const taskMastery = updateTaskMastery(userId, round.taskId, question, correct, passStreak, practicedAt);
    if (taskMastery.becameMastered) round.mastered.add(question.question_id);

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
    data.attempts.push({
      id: generateId(new Set(data.attempts.map(item => item.id))),
      userId,
      question_id: question.question_id,
      task_id: round.taskId,
      correct,
      responseTime: responseTime > 0 ? responseTime : null,
      practicedAt
    });
    await saveData();

    const node = nodeMap().get(question.node_id) || {};
    const extra = answerPayload ? answerPayload({
      question,
      node,
      correct,
      selected,
      round,
      task,
      taskMastery,
      retryAdded,
      practicedAt,
      responseTime
    }) : {};
    return {
      status: 200,
      body: {
        correct,
        ...extra,
        combo: round.combo,
        position: round.index + 1,
        total: round.queue.length,
        retryAdded,
        becameMastered: taskMastery.becameMastered,
        boxLevel: taskMastery.box_level
      }
    };
  }

  function roundSummary(round) {
    const task = findTask(round.taskId);
    const progress = task ? serializeTask(task, round.userId) : null;
    const wrongQuestions = [];
    round.wrong.forEach((count, questionId) => {
      const question = questionMap().get(questionId);
      if (question) {
        wrongQuestions.push({
          ...(summaryQuestion ? summaryQuestion(question) : { question_id: questionId }),
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

  function nextRound({ userId, roundId }) {
    const round = rounds.get(roundId);
    if (!round || String(round.userId) !== String(userId)) {
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

  function clearRounds() {
    rounds.clear();
  }

  async function createTasks({ user, body, label = targetLabel }) {
    if (user.role !== 'admin') return { status: 403, body: { error: '只有管理員可以建立任務' } };
    const name = String(body.task_name || '').trim();
    if (!name || name.length > 40) return { status: 400, body: { error: '任務名稱需為 1-40 字' } };
    const nodes = Array.isArray(body.target_nodes) ? body.target_nodes.filter(id => nodeMap().has(id)) : [];
    const pinned = Array.isArray(body.question_ids) ? Array.from(new Set(body.question_ids.filter(id => questionMap().has(id)))) : [];
    if (!nodes.length && !pinned.length) return { status: 400, body: { error: '請至少選擇一個' + label + '或指定題目' } };
    const hasTargets = body.userIds !== undefined || body.userId !== undefined;
    const resolved = resolveUserIds(db, hasTargets ? (body.userIds !== undefined ? body.userIds : body.userId) : [user.id]);
    if (resolved.error) return { status: 400, body: { error: resolved.error } };
    const requested = Math.max(1, Math.min(30, parseInt(body.batch_size, 10) || 10));
    const pool = taskPool(nodes, pinned);
    if (!pool.length) return { status: 400, body: { error: '所選' + label + '沒有可用題目' } };
    const passStreak = Math.max(2, Math.min(6, parseInt(body.pass_streak, 10) || 3));
    const groupId = generateId(new Set(data.tasks.map(item => taskGroupId(item))));
    const userMap = new Map(listUsers(db).map(item => [String(item.id), item]));
    const created = [];
    const skipped = [];

    resolved.userIds.forEach(targetId => {
      const inProgress = activeInProgressQuestionIds(targetId);
      const recent = recentlyMasteredQuestionIds(targetId);
      const candidates = pool.filter(question => {
        const questionKey = String(question.question_id);
        return !inProgress.has(questionKey) && !recent.has(questionKey);
      });
      if (!candidates.length) {
        const target = userMap.get(String(targetId)) || {};
        skipped.push({
          userId: targetId,
          username: target.username || '',
          nickname: target.nickname || target.username || '（未知用戶）',
          reason: '沒有可用題目（進行中或一週內已掌握）'
        });
        return;
      }
      const candidateIds = new Set(candidates.map(question => String(question.question_id)));
      const userPinned = pinned.filter(id => candidateIds.has(String(id)));
      const desired = Math.max(userPinned.length, Math.min(requested, candidates.length));
      const chosen = chooseTaskQuestions(candidates, userPinned, desired);
      if (!chosen.length) {
        const target = userMap.get(String(targetId)) || {};
        skipped.push({
          userId: targetId,
          username: target.username || '',
          nickname: target.nickname || target.username || '（未知用戶）',
          reason: '沒有可用題目（進行中或一週內已掌握）'
        });
        return;
      }
      const fixedIds = chosen.map(question => question.question_id);
      const task = {
        task_id: generateId(new Set(data.tasks.map(item => item.task_id))),
        groupId,
        userId: targetId,
        scope: resolved.all ? 'all' : 'selected',
        createdBy: user.id,
        task_name: name,
        target_nodes: Array.from(new Set(nodes)),
        question_ids: fixedIds,
        fixedQuestions: true,
        batch_size: Math.max(1, Math.min(requested, fixedIds.length || 1)),
        pass_streak: passStreak,
        is_archived: false,
        createdAt: new Date().toISOString()
      };
      data.tasks.push(task);
      created.push(task);
    });

    if (!created.length) {
      return {
        status: 400,
        body: {
          error: skipped.length
            ? '沒有可用題目：進行中或一週內已掌握的題目會被排除'
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
        tasks: created.map(task => serializeTask(task, task.userId))
      }
    };
  }

  async function updateTasks({ user, taskId, body, label = targetLabel }) {
    if (user.role !== 'admin') return { status: 403, body: { error: '只有管理員可以修改任務' } };
    const task = findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    const group = data.tasks.filter(item => String(taskGroupId(item)) === String(taskGroupId(task)));
    const targets = group.length ? group : [task];
    const name = body.task_name !== undefined ? String(body.task_name).trim() : task.task_name;
    if (!name || name.length > 40) return { status: 400, body: { error: '任務名稱需為 1-40 字' } };
    const nodes = body.target_nodes !== undefined
      ? (Array.isArray(body.target_nodes) ? body.target_nodes.filter(id => nodeMap().has(id)) : [])
      : null;
    const pinned = body.question_ids !== undefined
      ? (Array.isArray(body.question_ids) ? Array.from(new Set(body.question_ids.filter(id => questionMap().has(id)))) : [])
      : null;
    targets.forEach(item => {
      if (body.task_name !== undefined) item.task_name = name;
      if (nodes !== null) item.target_nodes = nodes;
      if (pinned !== null) item.question_ids = pinned;
    });
    if (targets.some(item => !(item.target_nodes || []).length && !(item.question_ids || []).length)) {
      return { status: 400, body: { error: '請至少保留一個' + label + '或指定題目' } };
    }
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
    const allowedByTask = new Map(targets.map(item => [
      String(item.task_id),
      new Set((item.question_ids || []).map(String))
    ]));
    data.taskMastery = data.taskMastery.filter(record => {
      const allowed = allowedByTask.get(String(record.task_id));
      if (!allowed) return true;
      return allowed.has(String(record.question_id));
    });
    await saveData();
    return {
      status: 200,
      body: {
        updated: targets.length,
        tasks: targets.map(item => serializeTask(item, item.userId))
      }
    };
  }

  async function deleteTasks({ user, taskId }) {
    if (user.role !== 'admin') return { status: 403, body: { error: '只有管理員可以刪除任務' } };
    const task = findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    const group = data.tasks.filter(item => String(taskGroupId(item)) === String(taskGroupId(task)));
    const targets = group.length ? group : [task];
    const taskIds = new Set(targets.map(item => String(item.task_id)));
    const affectedAttempts = data.attempts.filter(attempt => taskIds.has(String(attempt.task_id)));
    const pairs = new Set();
    targets.forEach(item => {
      (item.question_ids || []).forEach(questionId => {
        pairs.add(String(item.userId) + '|' + String(questionId));
      });
    });
    affectedAttempts.forEach(attempt => {
      pairs.add(String(attempt.userId) + '|' + String(attempt.question_id));
    });

    data.tasks = data.tasks.filter(item => !taskIds.has(String(item.task_id)));
    const taskMasteryBefore = data.taskMastery.length;
    data.taskMastery = data.taskMastery.filter(record => !taskIds.has(String(record.task_id)));
    const attemptsBefore = data.attempts.length;
    data.attempts = data.attempts.filter(attempt => !taskIds.has(String(attempt.task_id)));
    const masteryBefore = data.mastery.length;
    data.mastery = data.mastery.filter(record => !pairs.has(String(record.userId) + '|' + String(record.question_id)));

    for (const [roundId, round] of rounds.entries()) {
      if (taskIds.has(String(round.taskId))) rounds.delete(roundId);
    }

    await saveData();
    return {
      status: 200,
      body: {
        ok: true,
        removedTasks: targets.length,
        removedTaskMastery: taskMasteryBefore - data.taskMastery.length,
        removedAttempts: attemptsBefore - data.attempts.length,
        clearedMastery: masteryBefore - data.mastery.length
      }
    };
  }

  function taskWrongList({ user, taskId }) {
    const task = findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    if (user.role !== 'admin' && String(task.userId) !== String(user.id)) {
      return { status: 404, body: { error: '任務不存在' } };
    }
    const ownerId = task.userId;
    const taskAttempts = new Map();
    data.attempts.forEach(attempt => {
      if (String(attempt.task_id) !== String(task.task_id)) return;
      if (String(attempt.userId) !== String(ownerId)) return;
      const questionKey = String(attempt.question_id);
      const row = taskAttempts.get(questionKey) || { total_wrong: 0, total_attempts: 0 };
      row.total_attempts += 1;
      if (!attempt.correct) row.total_wrong += 1;
      taskAttempts.set(questionKey, row);
    });
    const list = taskQuestions(task)
      .map(question => {
        const record = findMastery(ownerId, question.question_id);
        const row = taskAttempts.get(String(question.question_id)) || { total_wrong: 0, total_attempts: 0 };
        return {
          question_id: question.question_id,
          node_id: question.node_id,
          stem: question.stem,
          correct_option: question.correct_option,
          total_wrong: row.total_wrong,
          total_attempts: row.total_attempts,
          box_level: record ? record.box_level || 0 : 0
        };
      })
      .filter(item => item.total_wrong > 0)
      .sort((a, b) => b.total_wrong - a.total_wrong || b.total_attempts - a.total_attempts);
    return { status: 200, body: list };
  }

  function startTask({ user, taskId }) {
    const task = findTask(taskId);
    if (!task) return { status: 404, body: { error: '任務不存在' } };
    if (String(task.userId) !== String(user.id)) {
      return { status: 403, body: { error: '這個任務不屬於你' } };
    }
    if (task.is_archived) return { status: 400, body: { error: '任務已歸檔' } };
    const pool = taskQuestions(task);
    if (!pool.length) return { status: 400, body: { error: '這個任務還沒有題目' } };
    const eligible = eligibleTaskQuestions(pool, user.id, task.task_id);
    if (!eligible.length) {
      return { status: 400, body: { error: '這個任務的題目已全部掌握，一週後再回來複習' } };
    }
    pruneRounds();
    const selected = pickQuestions(eligible, user.id, task.batch_size || 10, task.task_id);
    return startRound(user.id, task, selected);
  }

  function stats() {
    return (db.users || []).map(user => {
      const summary = userStats(user.id);
      return {
        userId: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar || null,
        score: summary.mastered,
        masteryRate: summary.masteryRate,
        mastered: summary.mastered,
        totalQuestions: summary.totalQuestions,
        attempted: summary.attempted,
        attempts: summary.totalAttempts,
        wrong: summary.totalWrong,
        accuracy: summary.accuracy,
        avgTime: summary.avgTime,
        timedAttempts: summary.timedAttempts,
        recent7: summary.recent7
      };
    });
  }

  return {
    data,
    hkDate,
    recentSevenDays,
    percent,
    shuffle,
    nodeMap,
    questionMap,
    findTask,
    taskGroupId,
    taskPool,
    chooseTaskQuestions,
    taskQuestions,
    migrateLegacyTasks,
    migrateTaskMastery,
    findMastery,
    ensureMastery,
    findTaskMastery,
    ensureTaskMastery,
    advanceRecord,
    userStats,
    nodesWithStats,
    buildAdminStats,
    taskProgress,
    serializeTask,
    taskForUser,
    activeInProgressQuestionIds,
    recentlyMasteredQuestionIds,
    taskAnswerStats,
    adminTaskList,
    recentlyMastered,
    eligibleTaskQuestions,
    pickQuestions,
    pruneRounds,
    prepareCurrent,
    roundPayload,
    updateMastery,
    updateTaskMastery,
    startRound,
    answerRound,
    roundSummary,
    nextRound,
    clearRounds,
    createTasks,
    updateTasks,
    deleteTasks,
    taskWrongList,
    startTask,
    stats
  };
}

module.exports = {
  createDrill,
  hkDate,
  recentSevenDays,
  percent,
  shuffle
};
