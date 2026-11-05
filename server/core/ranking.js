function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function speed(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Infinity;
}

function text(value) {
  return String(value == null ? '' : value);
}

function makeComparator(toolId) {
  if (toolId === 'shizi') {
    return (a, b) =>
      number(b.charsKnown) - number(a.charsKnown) ||
      number(b.accuracy) - number(a.accuracy) ||
      speed(a.avgTime) - speed(b.avgTime) ||
      number(b.attempts) - number(a.attempts) ||
      text(a.username).localeCompare(text(b.username));
  }
  if (toolId === 'grammar') {
    return (a, b) =>
      number(b.masteryRate) - number(a.masteryRate) ||
      number(b.attempted) - number(a.attempted) ||
      number(b.accuracy) - number(a.accuracy) ||
      speed(a.avgTime) - speed(b.avgTime) ||
      number(b.attempts) - number(a.attempts) ||
      text(a.username).localeCompare(text(b.username));
  }
  if (toolId === 'idiom') {
    return (a, b) =>
      number(b.score) - number(a.score) ||
      number(b.attempted) - number(a.attempted) ||
      number(b.accuracy) - number(a.accuracy) ||
      speed(a.avgTime) - speed(b.avgTime) ||
      number(b.attempts) - number(a.attempts) ||
      text(a.username).localeCompare(text(b.username));
  }
  return (a, b) =>
    number(b.score) - number(a.score) ||
    number(b.accuracy) - number(a.accuracy) ||
    number(b.attempts) - number(a.attempts) ||
    text(a.username).localeCompare(text(b.username));
}

function defaultRow(toolId, userId) {
  if (toolId === 'shizi') {
    return {
      userId,
      score: 0,
      charsKnown: 0,
      attempts: 0,
      accuracy: 0,
      avgTime: 0
    };
  }
  if (toolId === 'grammar') {
    return {
      userId,
      score: 0,
      masteryRate: 0,
      mastered: 0,
      totalQuestions: 0,
      attempted: 0,
      attempts: 0,
      accuracy: 0,
      avgTime: 0
    };
  }
  if (toolId === 'idiom') {
    return {
      userId,
      score: 0,
      masteryRate: 0,
      mastered: 0,
      totalQuestions: 0,
      attempted: 0,
      attempts: 0,
      accuracy: 0,
      avgTime: 0
    };
  }
  return { userId, score: 0, accuracy: 0, attempts: 0 };
}

function hasActivity(toolId, row) {
  if (toolId === 'shizi') {
    return number(row.charsKnown) > 0 || number(row.attempts) > 0;
  }
  if (toolId === 'grammar') {
    return number(row.attempted) > 0 || number(row.attempts) > 0;
  }
  if (toolId === 'idiom') {
    return number(row.score) > 0 || number(row.attempted) > 0 || number(row.attempts) > 0;
  }
  return number(row.score) > 0;
}

function rankRows(toolId, rows) {
  const comparator = makeComparator(toolId);
  const ranked = rows
    .filter(row => hasActivity(toolId, row))
    .sort(comparator);
  const total = ranked.length;
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  rows.forEach(row => {
    if (!row.rank) row.rank = null;
  });
  return rows;
}

function buildRanking({ db, tools, modules }) {
  const active = tools.filter(tool => {
    if (!tool.active) return false;
    const module = modules.get(tool.id);
    return module && typeof module.stats === 'function';
  });
  const perTool = new Map();
  active.forEach(tool => {
    const rows = modules.get(tool.id).stats() || [];
    const byUser = new Map(rows.map(row => [String(row.userId), row]));
    const normalized = rankRows(tool.id, (db.users || []).map(user => {
      const row = byUser.get(String(user.id)) || {};
      return {
        ...defaultRow(tool.id, user.id),
        ...row,
        userId: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar || null,
        score: number(row.score)
      };
    }));
    perTool.set(tool.id, {
      tool,
      rows: new Map(normalized.map(row => [String(row.userId), row]))
    });
  });

  const ranking = (db.users || []).map(user => {
    const toolDetails = {};
    let combined = 0;
    let totalAttempts = 0;
    let totalCorrect = 0;
    let totalTime = 0;
    let timedAttempts = 0;
    active.forEach(tool => {
      const entry = perTool.get(tool.id);
      const row = entry.rows.get(String(user.id)) || defaultRow(tool.id, user.id);
      combined += number(row.score);
      const attempts = number(row.attempts);
      totalAttempts += attempts;
      totalCorrect += (number(row.accuracy) / 100) * attempts;
      const avgTime = number(row.avgTime);
      if (attempts > 0 && avgTime > 0) {
        totalTime += avgTime * attempts;
        timedAttempts += attempts;
      }
      toolDetails[tool.id] = { ...row };
    });
    return {
      userId: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar || null,
      combined: Math.round(combined * 10) / 10,
      accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 1000) / 10 : 0,
      avgTime: timedAttempts > 0 ? totalTime / timedAttempts : 0,
      tools: toolDetails
    };
  });

  return ranking
    .sort((a, b) =>
      b.combined - a.combined ||
      b.accuracy - a.accuracy ||
      (a.avgTime || Infinity) - (b.avgTime || Infinity) ||
      String(a.username).localeCompare(String(b.username))
    )
    .slice(0, 100);
}

module.exports = { buildRanking };
