function listUsers(db) {
  return (db.users || [])
    .map(user => ({
      id: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar || null,
      role: user.role || 'user'
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return String(a.nickname).localeCompare(String(b.nickname), 'zh-HK');
    });
}

function requestedIds(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw === undefined || raw === null || raw === '') return [];
  return [raw];
}

function resolveUserIds(db, raw) {
  const users = listUsers(db);
  const wanted = requestedIds(raw).map(value => String(value));
  if (!wanted.length) {
    if (!users.length) return { error: '還沒有可指派用戶' };
    return { userIds: users.map(user => user.id), all: true };
  }

  const byId = new Map(users.map(user => [String(user.id), user.id]));
  const userIds = [];
  const seen = new Set();
  wanted.forEach(value => {
    if (!byId.has(value) || seen.has(value)) return;
    seen.add(value);
    userIds.push(byId.get(value));
  });
  if (!userIds.length) return { error: '選擇的用戶不存在' };
  return { userIds, all: false };
}

module.exports = { listUsers, resolveUserIds };
