function toolComparator(tool) {
  if (tool.id === 'shizi') {
    return (a, b) => b.score - a.score || (a.avgTime || 0) - (b.avgTime || 0);
  }
  return (a, b) => b.score - a.score || (b.accuracy || 0) - (a.accuracy || 0) || (b.attempts || 0) - (a.attempts || 0);
}

function percentileMap(rows, tool) {
  const map = new Map();
  const positive = rows
    .filter(row => Number(row.score) > 0)
    .sort(toolComparator(tool));
  const total = positive.length;
  let index = 0;
  while (index < total) {
    let end = index;
    while (end + 1 < total && Number(positive[end + 1].score) === Number(positive[index].score)) {
      end += 1;
    }
    const averageRank = (index + end) / 2;
    const percentile = ((total - averageRank) / total) * 100;
    for (let cursor = index; cursor <= end; cursor += 1) {
      map.set(String(positive[cursor].userId), Math.round(percentile * 10) / 10);
    }
    index = end + 1;
  }
  return map;
}

function buildRanking({ db, tools, modules }) {
  const active = tools.filter(tool => {
    if (!tool.active) return false;
    const module = modules.get(tool.id);
    return module && typeof module.stats === 'function';
  });
  const weightSum = active.reduce((sum, tool) => sum + (Number(tool.weight) || 0), 0) || 1;

  const perTool = new Map();
  active.forEach(tool => {
    const rows = modules.get(tool.id).stats() || [];
    const byUser = new Map(rows.map(row => [String(row.userId), row]));
    const normalized = (db.users || []).map(user => {
      const row = byUser.get(String(user.id)) || { userId: user.id, score: 0 };
      return {
        ...row,
        userId: user.id,
        score: Number(row.score) || 0
      };
    });
    perTool.set(tool.id, {
      tool,
      rows: new Map(normalized.map(row => [String(row.userId), row])),
      percentiles: percentileMap(normalized, tool)
    });
  });

  const ranking = (db.users || []).map(user => {
    const toolDetails = {};
    let combined = 0;
    active.forEach(tool => {
      const entry = perTool.get(tool.id);
      const row = entry.rows.get(String(user.id)) || { score: 0 };
      const percentile = entry.percentiles.get(String(user.id)) || 0;
      combined += percentile * (Number(tool.weight) || 0);
      toolDetails[tool.id] = {
        ...row,
        percentile
      };
    });
    return {
      userId: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar || null,
      combined: Math.round((combined / weightSum) * 10) / 10,
      tools: toolDetails
    };
  });

  return ranking
    .sort((a, b) => b.combined - a.combined || String(a.username).localeCompare(String(b.username)))
    .slice(0, 100);
}

module.exports = { buildRanking };
