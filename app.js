/* ===========================================
   識字樂 - 中文拼字遊戲
   =========================================== */

const STORAGE_KEY = 'shizi_chars_v9';

// 查字典工具：每字只有唯一拆法（從 chaizi-unique.js 載入）
function lookupChaizi(char, prefer = 'longest') {
  const dict = window.ChaiziDictUnique || window.ChaiziDict;
  if (!dict || !dict[char]) return null;
  const entry = dict[char];
  // 兼容兩種格式：字串（原始）或陣列（新字典）
  if (Array.isArray(entry)) {
    return entry;
  }
  return entry.split(' ');
}

// ===== 智能佈局檢測（根據部件位置自動判斷）=====
function autoLayout(components) {
  if (!components || components.length === 0) return 'top-bottom';
  if (components.length === 1) return 'top-bottom';

  const first = components[0];

  // 包圍/半包圍結構（第一部件係外框或辶）
  const enclosureRadicals = ['囗', '冖', '冂', '凵', '⺆'];
  if (enclosureRadicals.includes(first)) {
    if (components.length === 2) return 'surround';
    return 'surround-3';
  }

  // 辵/辶（走之底，半包圍）
  if (first === '辵' || first === '辶') {
    if (components.length === 2) return 'half-surround-left';
    if (components.length === 3) return 'complex-3-left';
    if (components.length >= 4) return 'complex-4-left';
  }

  // 木字旁/提手旁等（左右結構）
  const sideRadicals = ['木', '扌', '氵', '亻', '讠', '艹', '钅', '口'];
  if (sideRadicals.includes(first) && components.length === 2) {
    return 'left-right';
  }

  // 根據部件數推斷
  if (components.length === 2) return 'top-bottom';
  if (components.length === 3) return 'vertical-3';
  if (components.length === 4) return 'top-2-bottom';
  if (components.length >= 5) return 'stack';

  return 'top-bottom';
}

// ===== 用戶系統 =====
const User = {
  current: null,
  apiBase: '/api',

  async request(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(this.apiBase + path, options);
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/register')) {
      this.current = null;
      this.updateUI();
      toast('請先登入');
      showView('login');
      throw new Error(data.error || '請先登入');
    }
    if (!res.ok) throw new Error(data.error || '請求失敗');
    return data;
  },

  async checkSession() {
    try {
      this.current = await this.request('/me');
      this.updateUI();
      return true;
    } catch {
      this.current = null;
      this.updateUI();
      return false;
    }
  },

  async login(username, password) {
    this.current = await this.request('/login', 'POST', { username, password });
    this.updateUI();
    return this.current;
  },

  async register(username, password) {
    this.current = await this.request('/register', 'POST', { username, password });
    this.updateUI();
    return this.current;
  },

  async logout() {
    await this.request('/logout', 'POST');
    this.current = null;
    this.updateUI();
  },

  async recordProgress(char, charId, responseTime, correct) {
    if (!this.current) return;
    try {
      await this.request('/progress', 'POST', { char, charId, responseTime, correct });
    } catch (e) {
      console.warn('記錄進度失敗:', e.message);
    }
  },

  async getStats() {
    return this.request('/stats');
  },

  async getProgress() {
    return this.request('/progress');
  },

  updateUI() {
    const userNav = document.getElementById('user-nav');
    const loginNav = document.getElementById('login-nav');
    const userInfo = document.getElementById('user-info');
    const adminBtn = document.getElementById('admin-btn');
    const userStats = document.getElementById('user-stats');
    const tasksNav = document.getElementById('tasks-nav');
    const gameNav = document.getElementById('game-nav');
    const charLibNav = document.getElementById('charlib-nav');

    if (this.current) {
      userNav.classList.remove('hidden');
      loginNav.classList.add('hidden');
      tasksNav?.classList.remove('hidden');
      gameNav?.classList.remove('hidden');
      charLibNav?.classList.toggle('hidden', this.current.role !== 'admin');
      const displayName = this.current.nickname || this.current.username;
      const displayAvatar = this.current.avatar || displayName[0].toUpperCase();
      userInfo.innerHTML = `<span style="font-size:20px">${displayAvatar}</span> ${displayName}`;
      adminBtn.style.display = this.current.role === 'admin' ? 'inline-block' : 'none';
      userStats.classList.remove('hidden');
    } else {
      userNav.classList.add('hidden');
      loginNav.classList.remove('hidden');
      tasksNav?.classList.add('hidden');
      gameNav?.classList.add('hidden');
      charLibNav?.classList.add('hidden');
      userStats.classList.add('hidden');
    }
  }
};

// ===== 我的任務 =====
const Tasks = {
  list: [],

  async refresh() {
    const el = document.getElementById('tasks-list');
    if (!el) return;
    if (!User.current) {
      el.innerHTML = `<div class="task-empty"><p>請先登入睇你嘅任務</p></div>`;
      return;
    }
    try {
      this.list = await User.request('/assignments');
    } catch {
      this.list = [];
    }
    if (this.list.length === 0) {
      el.innerHTML = `<div class="task-empty"><p>暫時冇任務 🎈</p><p style="color:#636e72;font-size:14px;margin-top:8px">可以先玩遊戲，或等老師布置</p></div>`;
      return;
    }
    const undone = this.list.filter(t => !t.allDone);
    const done = this.list.filter(t => t.allDone);
    let html = '';
    if (undone.length) {
      html += `<h3 class="task-section-title">進行中 (${undone.length})</h3>`;
      html += undone.map(t => this._card(t)).join('');
    }
    if (done.length) {
      html += `<h3 class="task-section-title">已完成 (${done.length})</h3>`;
      html += done.map(t => this._card(t)).join('');
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-start-task]').forEach(btn => {
      btn.onclick = async () => {
        const t = this.list.find(x => x.id == btn.dataset.startTask);
        if (!t) return;
        Game._pendingTask = t;
        showView('game');
      };
    });
  },

  _card(t) {
    const pct = t.total ? Math.round((t.completedCount / t.total) * 100) : 0;
    const resume = t.completedCount > 0 && !t.allDone;
    return `<div class="task-card ${t.allDone ? 'done' : ''}">
      <div class="task-card-head">
        <div class="task-card-title">${escapeHtml(t.name)}</div>
        <div class="task-card-status">${t.allDone ? '✅ 完成' : (t.completedCount > 0 ? '📖 進行中' : '🆕 未開始')}</div>
      </div>
      ${t.note ? `<div class="task-card-note">${escapeHtml(t.note)}</div>` : ''}
      <div class="task-card-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span>${t.completedCount} / ${t.total}</span>
      </div>
      <button class="btn btn-primary" data-start-task="${t.id}">${t.allDone ? '🔁 再做一次' : (resume ? '▶️ 繼續做' : '▶️ 開始做')}</button>
    </div>`;
  }
};

// ===== 管理員 API =====
const AdminAPI = {
  apiBase: '/api/admin',

  async request(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(this.apiBase + path, options);
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401) {
      User.current = null;
      User.updateUI();
      toast('請先登入');
      showView('login');
      throw new Error(data.error || '請先登入');
    }
    if (!res.ok) throw new Error(data.error || '請求失敗');
    return data;
  },

  async getUsers() {
    return this.request('/users');
  },

  async getUserDetail(userId) {
    return this.request('/user/' + userId);
  },

  async updateUser(userId, role) {
    return this.request('/user/' + userId, 'PUT', { role });
  },

  async   deleteUser(userId) {
    return this.request('/user/' + userId, 'DELETE');
  },

  clearUserProgress(userId) {
    return this.request('/user/' + userId + '/progress', 'DELETE');
  },

  async getChars() {
    const res = await fetch('/api/chars');
    if (!res.ok) throw new Error('獲取字符失敗');
    return res.json();
  },

  async deleteChar(charId) {
    const res = await fetch('/api/chars/' + charId, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '刪除失敗');
    return data;
  },

  async getCharStats() {
    return this.request('/chars');
  },

  getAssignments() {
    return this.request('/assignments');
  },

  createAssignment(data) {
    return this.request('/assignments', 'POST', data);
  },

  updateAssignment(id, data) {
    return this.request('/assignments/' + id, 'PUT', data);
  },

  deleteAssignment(id) {
    return this.request('/assignments/' + id, 'DELETE');
  }
};

// ===== 預設字庫（部件全部取自 kfcd/chaizi 字典）=====
const DEFAULT_CHARS = [
  // 包圍結構（外內）
  { id: 1, char: '回', components: lookupChaizi('回', 'longest'), layout: 'surround', hint: '一個囗包住口，叫做「回」（回來）' },
  { id: 2, char: '困', components: lookupChaizi('困', 'longest'), layout: 'surround', hint: '囗包住「木」，就係「困」喺圍欄裏面' },
  { id: 3, char: '因', components: lookupChaizi('因', 'longest'), layout: 'surround', hint: '方框（囗）內有「大」，就係「因」' },
  { id: 4, char: '國', components: lookupChaizi('國', 'longest'), layout: 'surround', hint: '方框（囗）內有「或」，就係「國家」' },
  { id: 5, char: '固', components: lookupChaizi('固', 'longest'), layout: 'surround', hint: '方框內有「古」，就係「固」定不變' },

  // 半包圍結構（辶包左）
  { id: 6, char: '這', components: lookupChaizi('這', 'longest'), layout: 'half-surround-left', hint: '「辶」包住左邊，「言」在右邊，叫做「這」個' },
  { id: 7, char: '進', components: lookupChaizi('進', 'longest'), layout: 'half-surround-left', hint: '「辶」包左，「隹」在右，叫做「進」步' },

  // 邊（字典末選拆法：辶 + 臱 = 2 部分）
  { id: 8, char: '邊', components: lookupChaizi('邊', 'longest'), layout: 'half-surround-left', hint: '「辶」包住左邊，「臱」在右邊，叫做「旁邊」' },

  // 品字結構
  { id: 9, char: '森', components: lookupChaizi('森', 'longest'), layout: 'top-bottom-bottom', hint: '三棵樹，就係「森林」' },
  { id: 10, char: '晶', components: lookupChaizi('晶', 'longest'), layout: 'top-bottom-bottom', hint: '三個日頭一齊，就係「晶」亮' },

  // 字典拆法
  { id: 11, char: '靈', components: lookupChaizi('靈', 'longest'), layout: 'top-bottom', hint: '「霝」上有「巫」下，就係「靈」驗' },
  { id: 12, char: '響', components: lookupChaizi('響', 'longest'), layout: 'top-bottom', hint: '「鄉」上有「音」下，就係「響」' },
  { id: 13, char: '寶', components: lookupChaizi('寶', 'longest'), layout: 'top-2-bottom', hint: '屋頂「宀」+中間「玉」左「缶」右+底下「貝」，就係「寶」物' },
  { id: 14, char: '鼻', components: lookupChaizi('鼻', 'longest'), layout: 'vertical-3', hint: '「自」+「田」+「廾」三件上下疊，就係「鼻」' },
  { id: 15, char: '攀', components: lookupChaizi('攀', 'longest'), layout: 'stack', hint: '「林」「爻」「大」「手」上下疊，就係「攀」' },
];

// ===== 數據存儲（服務器為主，localStorage 為緩存）=====
const Data = {
  _cache: null,
  _loading: null,
  _isAdmin: false,

  async _fetch() {
    if (this._cache) return this._cache;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const res = await fetch('/api/chars', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          this._cache = Array.isArray(data) ? data : [];
        } else if (res.status === 401) {
          // 未登入：清空 cache，唔好用舊資料
          this._cache = [];
          this._loading = null;
          return this._cache;
        } else {
          this._cache = this._loadLocal();
        }
      } catch {
        this._cache = this._loadLocal();
      }
      // merge with DEFAULT_CHARS to ensure built-ins are always available
      const ids = new Set(this._cache.map(c => c.id));
      for (const dc of DEFAULT_CHARS) {
        if (!ids.has(dc.id)) this._cache.push({ ...dc });
      }
      this._loading = null;
      return this._cache;
    })();
    return this._loading;
  },

  _loadLocal() {
    try {
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(local) ? local : [];
    } catch {
      return [];
    }
  },

  _saveLocal() {
    if (this._cache) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cache));
    }
  },

  async init() {
    await this._fetch();
    this._saveLocal();
  },

  async getAll() {
    return await this._fetch();
  },

  async add(data) {
    try {
      const res = await fetch('/api/chars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const newChar = await res.json();
        this._cache = await this._fetch();
        this._saveLocal();
        return newChar;
      }
    } catch {}
    // fallback: local
    const newChar = { id: Date.now(), ...data };
    this._cache = await this._fetch();
    this._cache.push(newChar);
    this._saveLocal();
    return newChar;
  },

  async update(id, data) {
    try {
      const res = await fetch('/api/chars/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const updated = await res.json();
        this._cache = await this._fetch();
        this._saveLocal();
        return updated;
      }
    } catch {}
    // fallback: local
    this._cache = await this._fetch();
    const i = this._cache.findIndex(c => c.id === id);
    if (i >= 0) {
      this._cache[i] = { ...this._cache[i], ...data, id };
      this._saveLocal();
    }
  },

  async remove(id) {
    try {
      const res = await fetch('/api/chars/' + id, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        this._cache = (this._cache || []).filter(c => c.id !== id);
        this._saveLocal();
        return;
      }
    } catch {}
    // fallback: local
    this._cache = await this._fetch();
    this._cache = this._cache.filter(c => c.id !== id);
    this._saveLocal();
  },

  async reset() {
    // 重置為默認字庫（保留 DEFAULT_CHARS 內容）
    this._cache = DEFAULT_CHARS.map(c => ({ ...c }));
    this._saveLocal();
  }
};

// ===== 遊戲邏輯 =====
function isPositionsNormalized(positions) {
  let maxVal = 0;
  for (const k in positions) {
    const p = positions[k];
    if (!p) continue;
    maxVal = Math.max(maxVal, p.x || 0, p.y || 0, (p.w || 0) + (p.x || 0), (p.h || 0) + (p.y || 0));
    if (maxVal > 1.5) return false;
  }
  return maxVal > 0;
}

const Game = {
  chars: [],
  current: null,
  score: 0,
  index: 0,
  taskId: null,
  taskName: null,
  taskDone: new Set(),
  _pendingTask: null,
  _pendingTimers: [],

  _clearTimers() {
    this._pendingTimers.forEach(id => clearTimeout(id));
    this._pendingTimers = [];
  },

  _setTimer(fn, delay) {
    const id = setTimeout(() => {
      this._pendingTimers = this._pendingTimers.filter(t => t !== id);
      fn();
    }, delay);
    this._pendingTimers.push(id);
    return id;
  },

  _setTaskBanner(name) {
    const banner = document.getElementById('task-banner');
    if (name) {
      banner.classList.remove('hidden');
      document.getElementById('task-banner-name').textContent = name;
    } else {
      banner.classList.add('hidden');
    }
  },

  // 從頭開始（無任務模式：所有字）
  async start() {
    this.taskId = null;
    this.taskName = null;
    this.taskDone = new Set();
    this._setTaskBanner(null);
    this.chars = await Data.getAll();
    if (this.chars.length === 0) {
      this._showEmpty();
      return;
    }
    this.score = 0;
    this.index = 0;
    this._updateScore();
    this._updateProgress();
    this.next();
  },

  // 開始任務：只做指定的字，已完成的字排後面（斷點續做）
  async startTask(task) {
    const all = await Data.getAll();
    const byId = new Map(all.map(c => [c.id, c]));
    let ids = task.charIds.filter(id => byId.has(id));

    // 斷點續做：未完成的排前面
    ids.sort((a, b) => (task.completedCharIds.includes(byId.get(a).char) ? 1 : 0)
                      - (task.completedCharIds.includes(byId.get(b).char) ? 1 : 0));

    this.chars = ids.map(id => byId.get(id));
    this.taskId = task.id;
    this.taskName = task.name;
    this.taskDone = new Set();
    this._setTaskBanner(task.name);

    if (this.chars.length === 0) {
      this._showEmpty();
      return;
    }
    this.score = 0;
    this.index = 0;
    this._updateScore();
    this._updateProgress();
    this.next();
  },

  async _markTaskDone() {
    if (!this.taskId || !this.current) return;
    try {
      await User.request('/assignments/' + this.taskId + '/complete', 'POST', {
        charId: this.current.id,
        correct: true
      });
      this.taskDone.add(this.current.char);
      this._updateProgress();
    } catch (e) {
      console.warn('任務進度記錄失敗:', e.message);
    }
  },

  next() {
    if (this.index >= this.chars.length) {
      this._gameOver();
      return;
    }
    this._clearTimers();
    const display = document.getElementById('character-display');
    display.classList.remove('complete-mode');
    document.getElementById('celebration').classList.add('hidden');
    this.current = this.chars[this.index];
    this.startTime = Date.now();
    this._updateProgress();
    this.render();
    this._speak(this.current.char);
  },

  render() {
    const display = document.getElementById('character-display');
    display.innerHTML = '';
    display.classList.remove('complete-mode');

    const hasCustomPositions = this.current.positions &&
      Object.keys(this.current.positions).length === this.current.components.length;

    if (hasCustomPositions) {
      display.className = 'character-display layout-custom';
      const containerW = display.clientWidth || 400;
      const containerH = display.clientHeight || 400;
      const normalized = isPositionsNormalized(this.current.positions);
      this.current.components.forEach((comp, i) => {
        const slot = document.createElement('div');
        slot.className = 'slot slot-custom';
        slot.dataset.index = i;
        slot.dataset.expected = comp;
        const p = this.current.positions[i] || {};
        if (normalized) {
          slot.style.left = ((p.x || 0) * containerW) + 'px';
          slot.style.top = ((p.y || 0) * containerH) + 'px';
          slot.style.width = ((p.w || 0.3) * containerW) + 'px';
          slot.style.height = ((p.h || 0.3) * containerH) + 'px';
        } else {
          slot.style.left = (p.x ?? 0) + 'px';
          slot.style.top = (p.y ?? 0) + 'px';
          slot.style.width = (p.w || 120) + 'px';
          slot.style.height = (p.h || 120) + 'px';
        }
        this._setupSlot(slot);
        display.appendChild(slot);
      });
    } else {
      display.className = 'character-display layout-' + this.current.layout;
      this._renderLayoutSlots(display);
    }

    this._renderPieceTray();

    document.getElementById('hint-content').classList.add('hidden');
    document.getElementById('hint-btn').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('celebration').classList.add('hidden');
  },

  _renderLayoutSlots(display) {
    const layout = this.current.layout;
    const comps = this.current.components;
    const setup = (slot, i) => {
      slot.dataset.index = i;
      slot.dataset.expected = comps[i];
      this._setupSlot(slot);
      display.appendChild(slot);
    };
    if (layout === 'surround') {
      const a = document.createElement('div'); a.className = 'slot slot-outer'; setup(a, 0);
      const b = document.createElement('div'); b.className = 'slot slot-inner'; setup(b, 1);
    } else if (layout === 'half-surround-left') {
      const a = document.createElement('div'); a.className = 'slot slot-outer'; setup(a, 0);
      const b = document.createElement('div'); b.className = 'slot slot-inner'; setup(b, 1);
    } else if (layout === 'complex-3-left') {
      const a = document.createElement('div'); a.className = 'slot slot-outer'; setup(a, 0);
      const b = document.createElement('div'); b.className = 'slot slot-inner-top'; setup(b, 1);
      const c = document.createElement('div'); c.className = 'slot slot-inner-bottom'; setup(c, 2);
    } else if (layout === 'complex-4-left') {
      const a = document.createElement('div'); a.className = 'slot slot-outer'; setup(a, 0);
      const b = document.createElement('div'); b.className = 'slot slot-inner-top'; setup(b, 1);
      const c = document.createElement('div'); c.className = 'slot slot-inner-middle'; setup(c, 2);
      const d = document.createElement('div'); d.className = 'slot slot-inner-bottom'; setup(d, 3);
    } else if (layout === 'surround-3') {
      const a = document.createElement('div'); a.className = 'slot slot-outer'; setup(a, 0);
      const b = document.createElement('div'); b.className = 'slot slot-inner-top'; setup(b, 1);
      const c = document.createElement('div'); c.className = 'slot slot-inner-bottom'; setup(c, 2);
    } else if (layout === 'left-right-right') {
      const a = document.createElement('div'); a.className = 'slot slot-outer'; setup(a, 0);
      const b = document.createElement('div'); b.className = 'slot slot-inner-top'; setup(b, 1);
      const c = document.createElement('div'); c.className = 'slot slot-inner-bottom'; setup(c, 2);
    } else if (layout === 'stack') {
      comps.forEach((comp, i) => {
        const s = document.createElement('div');
        s.className = 'slot slot-stack';
        setup(s, i);
      });
    } else {
      comps.forEach((comp, i) => {
        const s = document.createElement('div');
        s.className = 'slot';
        setup(s, i);
      });
    }
  },

  _renderPieceTray() {
    const tray = document.getElementById('pieces-tray');
    if (!tray) return;
    tray.innerHTML = '';
    const shuffled = this._shuffle([...this.current.components]);
    shuffled.forEach((comp, i) => {
      const piece = document.createElement('div');
      piece.className = 'piece';
      piece.draggable = true;
      piece.textContent = comp;
      piece.dataset.component = comp;
      piece.dataset.id = 'p-' + i;
      this._setupPiece(piece);
      tray.appendChild(piece);
    });
  },


  _updateScore() {
    document.getElementById('score').textContent = this.score;
  },

  _updateProgress() {
    document.getElementById('progress-text').textContent =
      `${Math.min(this.index + 1, this.chars.length)} / ${this.chars.length}`;
    document.getElementById('progress-fill').style.width =
      `${(this.index / this.chars.length) * 100}%`;
  },

  _gameOver() {
    const display = document.getElementById('character-display');
    const isTask = !!this.taskId;
    const allDone = isTask && this.taskDone.size >= this.chars.length;
    const title = allDone ? '🏆 任務完成！' : (isTask ? '🎉 做完晒！' : '🎉 完成晒！');
    const body = allDone
      ? `<p>你做完咗「${escapeHtml(this.taskName)}」全部 ${this.chars.length} 個字，真棒！</p>`
      : `<p>你一共拎到 <strong>${this.score}</strong> 分！</p>`;

    const btns = isTask
      ? `<button class="btn btn-primary" onclick="Game.restart()">🔁 再做多次</button>
         <button class="btn btn-secondary" onclick="Tasks.refresh(); showView('tasks')">📋 返回任務</button>`
      : `<button class="btn btn-primary" onclick="Game.restart()">🔄 再玩一次</button>`;

    display.innerHTML = `
      <div class="game-over">
        <h2>${title}</h2>
        ${body}
        ${btns}
      </div>
    `;
    document.getElementById('pieces-tray').innerHTML = '';
    document.getElementById('next-btn').classList.add('hidden');
    this._playWin();
    if (isTask) Tasks.refresh();
  },

  _showEmpty() {
    document.getElementById('character-display').innerHTML = `
      <div class="game-over">
        <h2>📦 字庫空咗</h2>
        <p>請去「管理字庫」加入字</p>
      </div>
    `;
    document.getElementById('pieces-tray').innerHTML = '';
  },

  async savePositions(id) {
    const chars = await Data.getAll();
    const c = chars.find(x => x.id === id);
    if (!c) return;
    const canvas = document.getElementById('position-canvas');
    const canvasW = canvas.clientWidth || 400;
    const canvasH = canvas.clientHeight || 400;
    const positions = {};
    document.querySelectorAll('.position-box').forEach(box => {
      const idx = box.dataset.index;
      const px = parseFloat(box.style.left) || 0;
      const py = parseFloat(box.style.top) || 0;
      const pw = parseFloat(box.style.width) || 120;
      const ph = parseFloat(box.style.height) || 120;
      positions[idx] = {
        x: px / canvasW,
        y: py / canvasH,
        w: pw / canvasW,
        h: ph / canvasH
      };
    });
    await Data.update(id, { positions });
    toast('位置已保存');
    this.closePositionEditor();
    await this.render();
  },

  closePositionEditor() {
    const modal = document.getElementById('position-editor-modal');
    if (modal) modal.remove();
  },

  async resetData() {
    if (confirm('確定要重置為預設字庫？你之前加嘅全部都會刪除。')) {
      await Data.reset();
      await this.render();
      toast('已重置預設字庫');
    }
  },

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  _setupSlot(slot) {
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const piece = document.querySelector(`.piece[data-id="${id}"]`);
      if (piece) this._tryPlace(piece, slot);
    });
    slot.addEventListener('click', () => {
      const selected = document.querySelector('.piece.selected');
      if (selected) this._tryPlace(selected, slot);
    });
  },

  _setupPiece(piece) {
    piece.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', piece.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      piece.classList.add('dragging');
    });
    piece.addEventListener('dragend', () => piece.classList.remove('dragging'));
    piece.addEventListener('click', () => {
      document.querySelectorAll('.piece.selected').forEach(p => p.classList.remove('selected'));
      piece.classList.add('selected');
    });
  },

  _tryPlace(piece, slot) {
    if (slot.classList.contains('filled')) return;
    const expected = slot.dataset.expected;
    const actual = piece.dataset.component;
    if (expected === actual) {
      slot.textContent = actual;
      slot.classList.add('filled');
      slot.dataset.locked = 'true';
      piece.classList.remove('selected');
      piece.remove();
      this._speak(actual);
      this._playSuccess();
      this._checkComplete();
    } else {
      slot.classList.add('wrong');
      this._playError();
      setTimeout(() => slot.classList.remove('wrong'), 400);
    }
  },

  _checkComplete() {
    const slots = document.querySelectorAll('.slot');
    const allFilled = Array.from(slots).every(s => s.dataset.locked === 'true');
    if (allFilled) this._celebrate();
  },

  _celebrate() {
    this.score += 10;
    this._updateScore();
    const display = document.getElementById('character-display');
    const tray = document.getElementById('pieces-tray');
    const char = this.current.char;
    const hint = this.current.hint;
    const responseTime = Date.now() - this.startTime;
    User.recordProgress(char, this.current.id, responseTime, true);
    this._markTaskDone();
    display.querySelectorAll('.slot').forEach(s => s.classList.add('fade-out'));
    tray.classList.add('fade-out');
    this._setTimer(() => {
      display.innerHTML = `<div class="complete-character">${char}</div>`;
      display.classList.add('complete-mode');
      tray.innerHTML = '';
      tray.classList.remove('fade-out');
      this._playSuccess();
      this._setTimer(() => this._speak(char), 200);
      const hintBtn = document.getElementById('hint-btn');
      const hintContent = document.getElementById('hint-content');
      hintBtn.classList.remove('hidden');
      hintBtn.textContent = '💡 粵語提示';
      if (hint) {
        hintContent.textContent = hint;
        hintContent.classList.remove('hidden');
      }
    }, 400);
    const cel = document.getElementById('celebration');
    this._setTimer(() => {
      cel.classList.remove('hidden');
      this._setTimer(() => cel.classList.add('hidden'), 2200);
    }, 700);
    document.getElementById('next-btn').classList.remove('hidden');
  },

  _speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-HK';
    u.rate = 0.7;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  },

  _playTone(freq, dur, delay = 0) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) {}
  },

  _playSuccess() {
    this._playTone(880, 0.1, 0);
    this._playTone(1320, 0.15, 0.08);
  },

  _playError() {
    this._playTone(200, 0.2, 0);
  },

  _playWin() {
    this._playTone(660, 0.1, 0);
    this._playTone(880, 0.1, 0.1);
    this._playTone(1100, 0.1, 0.2);
    this._playTone(1320, 0.3, 0.3);
  },

  restart() {
    this.index = 0;
    this.score = 0;
    this._clearTimers();
    this._updateScore();
    this._updateProgress();
    this.next();
  }
};

// ===== 管理後台 =====
const Admin = {
  editingId: null,
  positionEditorChar: null,

  init() {
    this.render();
    document.getElementById('save-btn').onclick = () => this.save();
    document.getElementById('cancel-btn').onclick = () => this.cancel();
    document.getElementById('reset-data-btn').onclick = () => this.resetData();
    document.getElementById('clear-positions-btn')?.addEventListener('click', () => this.clearAllPositions());

    document.getElementById('form-char').addEventListener('input', (e) => {
      const ch = e.target.value.trim();
      if (ch.length === 1 && window.ChaiziDict && window.ChaiziDict[ch]) {
        const alts = window.ChaiziDict[ch];
        const first = alts[0].split(' ');
        document.getElementById('form-components').value = first.join(',');
        const suggestedLayout = autoLayout(first);
        document.getElementById('form-layout').value = suggestedLayout;
        const altOptions = alts.map((a, i) => `[${i+1}] ${a}`).join(' | ');
        toast(`字典 ${alts.length} 種拆法（已選首選，建議 ${suggestedLayout}）\n${altOptions}`);
      }
    });
  },

  async render() {
    const chars = await Data.getAll();
    document.getElementById('char-count').textContent = chars.length;
    const container = document.getElementById('char-list');
    container.innerHTML = '';

    if (chars.length === 0) {
      container.innerHTML = '<p style="color:#b2bec3; text-align:center; padding:20px;">字庫空咗，新增字啦～</p>';
      return;
    }

    chars.forEach(c => {
      const item = document.createElement('div');
      item.className = 'char-item';
      const layoutLabel = { 'left-right': '左右', 'top-bottom': '上下', 'top-bottom-bottom': '品字' }[c.layout] || c.layout;
      item.innerHTML = `
        <div class="char-display-mini">
          <span class="big-char">${c.char}</span>
          <span class="arrow">=</span>
          <span class="components">${c.components.join(' + ')}</span>
        </div>
        <div class="char-meta">${layoutLabel}結構 · ${c.components.length}部件${c.positions ? ' · ✏️ 自定義' : ''}</div>
        <div class="char-hint-mini">${escapeHtml(c.hint || '(無口訣)')}</div>
        <div class="char-actions">
          <button class="btn-edit" data-id="${c.id}">✏️ 編輯</button>
          <button class="btn-position" data-id="${c.id}">📐 調整結構</button>
          <button class="btn-delete" data-id="${c.id}">🗑️ 刪除</button>
        </div>
      `;
      item.querySelector('.btn-edit').onclick = () => this.edit(c.id);
      item.querySelector('.btn-delete').onclick = () => this.deleteChar(c.id);
      item.querySelector('.btn-position').onclick = () => this.openPositionEditor(c.id);
      container.appendChild(item);
    });
  },

  async edit(id) {
    const chars = await Data.getAll();
    const c = chars.find(x => x.id === id);
    if (!c) return;
    this.editingId = id;
    document.getElementById('form-title').textContent = '編輯字';
    document.getElementById('form-char').value = c.char;
    document.getElementById('form-components').value = c.components.join(',');
    document.getElementById('form-layout').value = c.layout;
    document.getElementById('form-hint').value = c.hint || '';
    document.getElementById('save-btn').textContent = '💾 更新';
  },

  cancel() {
    this.editingId = null;
    document.getElementById('form-title').textContent = '新增字';
    document.getElementById('form-char').value = '';
    document.getElementById('form-components').value = '';
    document.getElementById('form-layout').value = 'left-right';
    document.getElementById('form-hint').value = '';
    document.getElementById('save-btn').textContent = '💾 保存';
  },

  save() {
    return this._save();
  },

  async _save() {
    const char = document.getElementById('form-char').value.trim();
    const componentsRaw = document.getElementById('form-components').value;
    const components = componentsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const layout = document.getElementById('form-layout').value;
    const hint = document.getElementById('form-hint').value.trim();

    if (!char) return toast('請填寫字');
    if (components.length < 1) return toast('請填寫部件');
    if (!hint) return toast('請填寫口訣');

    if (this.editingId) {
      const chars = await Data.getAll();
      const old = chars.find(x => x.id === this.editingId);
      const updates = { char, components, layout, hint };
      if (old && old.layout !== layout) {
        updates.positions = null;
      } else if (old && old.positions) {
        updates.positions = old.positions;
      }
      await Data.update(this.editingId, updates);
      toast('已更新');
    } else {
      await Data.add({ char, components, layout, hint });
      toast('已新增');
    }
    this.cancel();
    await this.render();
  },

  async deleteChar(id) {
    if (!confirm('確定要刪除呢個字？')) return;
    await Data.deleteChar(id);
    toast('已刪除');
    await this.render();
  },

  async openPositionEditor(id) {
    const chars = await Data.getAll();
    const c = chars.find(x => x.id === id);
    if (!c) return;
    this.positionEditorChar = c;
    const existing = c.positions || {};

    let modal = document.getElementById('position-editor-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'position-editor-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>📐 調整「${c.char}」嘅部件位置</h3>
          <button class="modal-close" id="position-editor-close">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:#636e72;font-size:13px;margin-bottom:8px">用鼠標拖動部件到目標位置（部件數量嚴格等於分塊數量：${c.components.length}）</p>
          <div class="position-canvas" id="position-canvas">
            <div class="position-grid"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" id="position-save">💾 保存位置</button>
          <button class="btn btn-secondary" id="position-reset">🔄 重置為自動布局</button>
          <button class="btn btn-secondary" id="position-cancel">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const canvas = document.getElementById('position-canvas');
    const components = c.components;
    const canvasW = canvas.clientWidth || 400;
    const canvasH = canvas.clientHeight || 400;
    const normalized = isPositionsNormalized(existing);

    components.forEach((comp, i) => {
      const box = document.createElement('div');
      box.className = 'position-box';
      box.textContent = comp;
      box.dataset.index = i;
      box.dataset.component = comp;

      const layoutPositions = this._getDefaultPositions(c.layout, components.length);
      const defaultPos = layoutPositions[i] || { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
      let nx, ny, nw, nh;
      if (existing[i]) {
        if (normalized) {
          nx = existing[i].x ?? defaultPos.x;
          ny = existing[i].y ?? defaultPos.y;
          nw = existing[i].w ?? defaultPos.w;
          nh = existing[i].h ?? defaultPos.h;
        } else {
          nx = (existing[i].x || 0) / canvasW;
          ny = (existing[i].y || 0) / canvasH;
          nw = (existing[i].w || 120) / canvasW;
          nh = (existing[i].h || 120) / canvasH;
        }
      } else {
        nx = defaultPos.x;
        ny = defaultPos.y;
        nw = defaultPos.w;
        nh = defaultPos.h;
      }
      box.style.left = (nx * canvasW) + 'px';
      box.style.top = (ny * canvasH) + 'px';
      box.style.width = (nw * canvasW) + 'px';
      box.style.height = (nh * canvasH) + 'px';
      this._setupDrag(box, canvas);
      canvas.appendChild(box);
    });

    document.getElementById('position-editor-close').onclick = () => Admin.closePositionEditor();
    document.getElementById('position-cancel').onclick = () => Admin.closePositionEditor();
    document.getElementById('position-reset').onclick = () => {
      const positions = Admin._getDefaultPositions(c.layout, components.length);
      document.querySelectorAll('.position-box').forEach((box, i) => {
        const p = positions[i] || { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
        box.style.left = (p.x * canvasW) + 'px';
        box.style.top = (p.y * canvasH) + 'px';
        box.style.width = (p.w * canvasW) + 'px';
        box.style.height = (p.h * canvasH) + 'px';
      });
    };
    document.getElementById('position-save').onclick = () => Admin.savePositions(id);
  },

  _getDefaultPositions(layout, count) {
    const positions = [];
    const padding = 0.05;
    const gap = 0.03;
    let cols = 1, rows = 1;
    if (layout === 'left-right') { cols = count; rows = 1; }
    else if (layout === 'top-bottom') { cols = 1; rows = count; }
    else if (layout === 'vertical-3' || layout === 'top-bottom-bottom') { cols = 1; rows = count; }
    else if (layout === 'bottom-top-top') { cols = 2; rows = 2; }
    else { cols = Math.ceil(Math.sqrt(count)); rows = Math.ceil(count / cols); }
    const boxW = (1 - padding * 2 - gap * (cols - 1)) / cols;
    const boxH = (1 - padding * 2 - gap * (rows - 1)) / rows;
    const totalW = cols * boxW + (cols - 1) * gap;
    const totalH = rows * boxH + (rows - 1) * gap;
    const startX = (1 - totalW) / 2;
    const startY = (1 - totalH) / 2;
    for (let i = 0; i < count; i++) {
      let c, r;
      if (layout === 'bottom-top-top') {
        if (i < count - 1) { c = i; r = 0; }
        else {
          positions.push({ x: startX, y: startY + (boxH + gap), w: totalW, h: boxH });
          continue;
        }
      } else {
        c = i % cols;
        r = Math.floor(i / cols);
      }
      positions.push({ x: startX + c * (boxW + gap), y: startY + r * (boxH + gap), w: boxW, h: boxH });
    }
    return positions;
  },

  _setupDrag(box, canvas) {
    const handleBR = document.createElement('div');
    handleBR.className = 'resize-handle br';
    box.appendChild(handleBR);

    let dragging = false, resizing = false;
    let startX, startY, origX, origY, origW, origH;
    const SNAP_THRESHOLD = 8;
    const allBoxes = () => Array.from(canvas.querySelectorAll('.position-box')).filter(b => b !== box);

    const getOrCreateGuides = () => {
      let guides = canvas.querySelector('.align-guides');
      if (!guides) {
        guides = document.createElement('div');
        guides.className = 'align-guides';
        canvas.appendChild(guides);
      }
      return guides;
    };
    const clearGuides = () => {
      const guides = canvas.querySelector('.align-guides');
      if (guides) guides.innerHTML = '';
    };

    const showAlignGuides = (bx, by, bw, bh) => {
      const guides = getOrCreateGuides();
      guides.innerHTML = '';
      const others = allBoxes();
      const threshold = SNAP_THRESHOLD;
      for (const other of others) {
        const ox = parseFloat(other.style.left) || 0;
        const ow = parseFloat(other.style.width) || 0;
        const oy = parseFloat(other.style.top) || 0;
        const oh = parseFloat(other.style.height) || 0;
        const oRight = ox + ow, oCenter = ox + ow / 2;
        const oBottom = oy + oh, oMidY = oy + oh / 2;
        const bRight = bx + bw, bCenter = bx + bw / 2;
        const bBottom = by + bh, bMidY = by + bh / 2;
        for (const [myVal, otherVal] of [[bx, ox], [bCenter, oCenter], [bRight, oRight]]) {
          if (Math.abs(myVal - otherVal) < threshold) {
            const guide = document.createElement('div');
            guide.className = 'align-guide vertical';
            guide.style.left = otherVal + 'px';
            guides.appendChild(guide);
          }
        }
        for (const [myVal, otherVal] of [[by, oy], [bMidY, oMidY], [bBottom, oBottom]]) {
          if (Math.abs(myVal - otherVal) < threshold) {
            const guide = document.createElement('div');
            guide.className = 'align-guide horizontal';
            guide.style.top = otherVal + 'px';
            guides.appendChild(guide);
          }
        }
      }
    };

    const startDrag = (e) => {
      e.preventDefault();
      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      origX = parseFloat(box.style.left) || 0;
      origY = parseFloat(box.style.top) || 0;
      origW = parseFloat(box.style.width) || 120;
      origH = parseFloat(box.style.height) || 120;
      dragging = true;
    };
    const startResize = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      origW = parseFloat(box.style.width) || 120;
      origH = parseFloat(box.style.height) || 120;
      resizing = true;
    };
    const onMove = (e) => {
      if (!dragging && !resizing) return;
      e.preventDefault();
      const point = e.touches ? e.touches[0] : e;
      const dx = point.clientX - startX;
      const dy = point.clientY - startY;
      if (dragging) {
        let nx = origX + dx;
        let ny = origY + dy;
        const others = allBoxes();
        const threshold = SNAP_THRESHOLD;
        for (const other of others) {
          const ox = parseFloat(other.style.left) || 0;
          const ow = parseFloat(other.style.width) || 0;
          const oRight = ox + ow, oCenter = ox + ow / 2;
          const bRight = nx + origW, bCenter = nx + origW / 2;
          for (const [myVal, otherVal, prop] of [[nx, ox, 'nx'], [bCenter, oCenter, 'nx'], [bRight, oRight, 'nx']]) {
            if (Math.abs(myVal - otherVal) < threshold) {
              if (prop === 'nx') nx = otherVal + (myVal === bCenter ? -origW/2 : (myVal === bRight ? -origW : 0));
            }
          }
        }
        nx = Math.max(0, Math.min(canvas.clientWidth - origW, nx));
        ny = Math.max(0, Math.min(canvas.clientHeight - origH, ny));
        box.style.left = nx + 'px';
        box.style.top = ny + 'px';
        showAlignGuides(nx, ny, origW, origH);
      } else if (resizing) {
        const nw = Math.max(30, origW + dx);
        const nh = Math.max(30, origH + dy);
        box.style.width = nw + 'px';
        box.style.height = nh + 'px';
        const bx = parseFloat(box.style.left) || 0;
        const by = parseFloat(box.style.top) || 0;
        showAlignGuides(bx, by, nw, nh);
      }
    };
    const onUp = () => {
      dragging = false;
      resizing = false;
      clearGuides();
    };

    box.addEventListener('mousedown', startDrag);
    box.addEventListener('touchstart', startDrag, { passive: false });
    handleBR.addEventListener('mousedown', startResize);
    handleBR.addEventListener('touchstart', startResize, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
  },

  async savePositions(id) {
    const chars = await Data.getAll();
    const c = chars.find(x => x.id === id);
    if (!c) return;
    const canvas = document.getElementById('position-canvas');
    const canvasW = canvas.clientWidth || 400;
    const canvasH = canvas.clientHeight || 400;
    const positions = {};
    document.querySelectorAll('.position-box').forEach(box => {
      const idx = box.dataset.index;
      const px = parseFloat(box.style.left) || 0;
      const py = parseFloat(box.style.top) || 0;
      const pw = parseFloat(box.style.width) || 120;
      const ph = parseFloat(box.style.height) || 120;
      positions[idx] = { x: px / canvasW, y: py / canvasH, w: pw / canvasW, h: ph / canvasH };
    });
    await Data.update(id, { positions });
    toast('位置已保存');
    this.closePositionEditor();
    await this.render();
  },

  closePositionEditor() {
    const modal = document.getElementById('position-editor-modal');
    if (modal) modal.remove();
  },

  async resetData() {
    if (confirm('確定要重置為預設字庫？你之前加嘅全部都會刪除。')) {
      await Data.reset();
      await this.render();
      toast('已重置預設字庫');
    }
  },

  async clearAllPositions() {
    if (!confirm('確定要清除所有自定義位置？所有字會恢復為默認布局。')) return;
    const chars = await Data.getAll();
    for (const c of chars) {
      if (c.positions) {
        await Data.update(c.id, { positions: null });
      }
    }
    toast('已清除所有自定義位置');
    await this.render();
  }
};

// ===== 通用 UI =====
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2000);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== 視圖切換 =====
const PROTECTED_VIEWS = ['game', 'tasks', 'dashboard', 'admin', 'admin-panel'];
function showView(name) {
  // 未登入唔可以進入受保護頁面
  if (PROTECTED_VIEWS.includes(name) && !User.current) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-login').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    return;
  }
  // 非管理員唔可以進入管理頁面
  if ((name === 'admin' || name === 'admin-panel') && User.current?.role !== 'admin') {
    return;
  }
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'game') {
    if (Game._pendingTask) {
      const t = Game._pendingTask;
      Game._pendingTask = null;
      Game.startTask(t);
    } else {
      Game.start();
    }
  }
  if (name === 'admin') Admin.init();
  if (name === 'dashboard') loadDashboard();
  if (name === 'admin-panel') loadAdminPanel();
  if (name === 'tasks') Tasks.refresh();
}

// ===== 啟動 =====
async function init() {
  await Data.init();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => showView(btn.dataset.view);
  });

  document.getElementById('hint-btn').onclick = () => {
    if (!Game.current) return;
    const hc = document.getElementById('hint-content');
    hc.textContent = Game.current.hint;
    hc.classList.toggle('hidden');
  };

  document.getElementById('reset-btn').onclick = () => Game.render();

  document.getElementById('skip-btn').onclick = () => {
    Game.index++;
    Game.next();
  };

  document.getElementById('next-btn').onclick = () => {
    Game.index++;
    Game.next();
  };

  document.getElementById('task-back-btn').onclick = () => {
    Game._clearTimers();
    showView('tasks');
  };

  // Click outside to deselect piece
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('piece') &&
        !e.target.classList.contains('slot')) {
      document.querySelectorAll('.piece.selected').forEach(p =>
        p.classList.remove('selected'));
    }
  });

  // 必須先登入先可以開始玩
  const loggedIn = await User.checkSession();
  if (loggedIn) {
    await Data.init();
    showView('game');
  } else {
    showView('login');
  }
}

// ===== 認證表單 =====
let isRegister = false;

document.getElementById('auth-submit').onclick = async () => {
  console.log('[shizi] auth-submit clicked, isRegister=', isRegister);
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');

  if (!username || !password) {
    errorEl.textContent = '請填寫用戶名和密碼';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    if (isRegister) {
      await User.request('/register', 'POST', { username, password });
      toast('註冊成功！已自動登入');
      isRegister = false;
      document.getElementById('auth-title').textContent = '登入';
      document.getElementById('auth-submit').textContent = '登入';
      document.getElementById('auth-password').value = '';
      document.getElementById('auth-error').classList.add('hidden');
      await Data.init();
      showView('game');
    } else {
      await User.login(username, password);
      toast('登入成功！');
      await Data.init();
      showView('game');
      errorEl.classList.add('hidden');
      document.getElementById('auth-username').value = '';
      document.getElementById('auth-password').value = '';
    }
  } catch (e) {
    console.error('[shizi] login error:', e);
    errorEl.textContent = e.message;
    errorEl.classList.remove('hidden');
  }
};

document.getElementById('auth-switch-link').onclick = (e) => {
  e.preventDefault();
  isRegister = !isRegister;
  document.getElementById('auth-title').textContent = isRegister ? '註冊' : '登入';
  document.getElementById('auth-submit').textContent = isRegister ? '註冊' : '登入';
  document.getElementById('auth-error').classList.add('hidden');
};

document.getElementById('logout-btn').onclick = async () => {
  try {
    await User.logout();
    toast('已登出');
    Game.taskId = null;
    Game.taskName = null;
    Game._setTaskBanner(null);
    showView('login');
  } catch (e) {
    toast('登出失敗: ' + e.message);
  }
};

// ===== Dashboard =====
async function loadDashboard() {
  if (!User.current) return;
  try {
    const stats = await User.getStats();
    document.getElementById('stat-chars').textContent = stats.totalChars;
    document.getElementById('stat-attempts').textContent = stats.totalAttempts;
    document.getElementById('stat-avg-time').textContent =
      stats.avgTime > 0 ? (stats.avgTime / 1000).toFixed(1) + 's' : '-';
    document.getElementById('chars-learned').textContent = stats.totalChars;

    const progress = await User.getProgress();
    const list = document.getElementById('progress-list');
    list.innerHTML = progress.slice(0, 20).map(p => `
      <div class="progress-item">
        <span class="progress-char">${p.char}</span>
        <span class="progress-stats">次數: ${p.attempts} | 平均: ${p.avgTime ? (p.avgTime/1000).toFixed(1) + 's' : '-'} | 最佳: ${p.bestTime ? (p.bestTime/1000).toFixed(1) + 's' : '-'}</span>
        <span class="progress-date">${p.lastPracticed ? new Date(p.lastPracticed).toLocaleDateString() : '-'}</span>
      </div>
    `).join('') || '<p>暫無記錄</p>';

    const leaderboard = await User.request('/leaderboard');
    const lbList = document.getElementById('leaderboard-list');
    lbList.innerHTML = leaderboard.map((u, i) => `
      <div class="leaderboard-item">
        <span class="leaderboard-rank ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}">${i + 1}</span>
        <span class="leaderboard-avatar">${u.avatar || u.nickname?.[0]?.toUpperCase() || '?'}</span>
        <span class="leaderboard-name">${u.nickname || u.username}${u.userId === User.current?.id ? ' (我)' : ''}</span>
        <span class="leaderboard-stats">已學: ${u.charsKnown} 字 | 平均: ${u.avgTime ? (u.avgTime/1000).toFixed(1) + 's' : '-'}</span>
        <span class="leaderboard-badge">${u.charsKnown >= 10 ? '🌟' : ''}</span>
      </div>
    `).join('') || '<p>暫無數據</p>';
  } catch (e) {
    console.warn('載入進度失敗:', e);
  }
}

// ===== Profile =====
const AVATARS = [
  '🐱', '🐶', '🐰', '🦊', '🐼', '🐨',
  '🐯', '🦁', '🐸', '🐵', '🐷', '🐻',
  '🌸', '💐', '🌺', '🌻', '🍎', '🍓',
  '👧', '👦', '👩', '👨', '👵', '👴',
  '🎀', '🎈', '⭐', '🌙', '☀️', '🎨'
];

let selectedAvatar = null;

async function loadProfile() {
  if (!User.current) return;
  document.getElementById('profile-username').value = User.current.username || '';
  document.getElementById('profile-nickname').value = User.current.nickname || User.current.username || '';
  document.getElementById('profile-avatar').value = User.current.avatar || '';
  selectedAvatar = User.current.avatar || '';
  updateAvatarPreview();
  renderAvatarGrid();
}

function renderAvatarGrid() {
  const grid = document.getElementById('avatar-grid');
  if (!grid) return;
  grid.innerHTML = AVATARS.map(avatar => `
    <div class="avatar-option ${selectedAvatar === avatar ? 'selected' : ''}" data-avatar="${avatar}">
      ${avatar}
    </div>
  `).join('');

  grid.querySelectorAll('.avatar-option').forEach(option => {
    option.onclick = () => {
      grid.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      selectedAvatar = option.dataset.avatar;
      document.getElementById('profile-avatar').value = selectedAvatar;
      updateAvatarPreview();
    };
  });
}

function updateAvatarPreview() {
  const avatar = document.getElementById('profile-avatar')?.value || selectedAvatar;
  const preview = document.getElementById('avatar-preview');
  if (!preview) return;
  if (avatar && avatar.trim() && !avatar.startsWith('http')) {
    preview.innerHTML = `<span style="font-size:48px">${avatar}</span>`;
  } else if (avatar && avatar.trim()) {
    preview.innerHTML = `<img src="${avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentElement.innerHTML='<span style=\\'font-size:48px\\'>${(User.current?.nickname || User.current?.username || '?')[0].toUpperCase()}</span>'">`;
  } else {
    const name = User.current?.nickname || User.current?.username || '?';
    preview.innerHTML = `<span style="font-size:48px">${name[0].toUpperCase()}</span>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('profile-avatar')?.addEventListener('input', () => {
    selectedAvatar = document.getElementById('profile-avatar').value;
    updateAvatarPreview();
    const grid = document.getElementById('avatar-grid');
    grid?.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    if (selectedAvatar && AVATARS.includes(selectedAvatar)) {
      grid?.querySelector(`[data-avatar="${selectedAvatar}"]`)?.classList.add('selected');
    }
  });

  document.getElementById('save-profile-btn')?.addEventListener('click', async () => {
    const nickname = document.getElementById('profile-nickname').value.trim();
    const avatar = document.getElementById('profile-avatar').value.trim();
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, avatar })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失敗');
      User.current.nickname = data.nickname;
      User.current.avatar = data.avatar;
      User.updateUI();
      document.getElementById('user-info').textContent = `👤 ${data.nickname}`;
      toast('資料已保存');
    } catch (e) {
      toast('保存失敗: ' + e.message);
    }
  });

  document.getElementById('save-password-btn')?.addEventListener('click', async () => {
    const currentPassword = document.getElementById('profile-current-password').value;
    const newPassword = document.getElementById('profile-new-password').value;
    if (!currentPassword || !newPassword) {
      toast('請填寫所有欄位');
      return;
    }
    try {
      const res = await fetch('/api/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失敗');
      toast('密碼已更新');
      document.getElementById('profile-current-password').value = '';
      document.getElementById('profile-new-password').value = '';
    } catch (e) {
      toast('更新失敗: ' + e.message);
    }
  });
});

// ===== Admin Panel =====
async function loadAdminPanel() {
  if (!User.current || User.current.role !== 'admin') return;
  try {
    AdminAssignments.load();
  } catch (e) {
    console.warn('載入任務數據失敗:', e);
  }
  try {
    const users = await AdminAPI.getUsers();
    document.getElementById('admin-users').textContent = users.length;

    const charStats = await AdminAPI.getCharStats();
    document.getElementById('admin-chars').textContent = charStats.length;

    document.getElementById('admin-user-list').innerHTML = users.map(u => `
      <div class="user-item" data-id="${u.id}">
        <span class="user-name">${u.nickname || u.username} <span class="role-badge ${u.role}">${u.role === 'admin' ? '👑 管理員' : '🧒 學生'}</span></span>
        <span class="user-stats">
          已學: ${u.charsKnown} 字 | 練習: ${u.totalAttempts || 0} 次
          ${u.taskCount ? ` | 任務: ${u.taskDoneCount}/${u.taskCount} 個完成（共 ${u.taskCharCount} 字）` : ' | 未布置任務'}
        </span>
        <div class="user-actions">
          <button class="btn-small btn-view" data-id="${u.id}">查看</button>
          <button class="btn-small btn-toggle-role" data-id="${u.id}" data-role="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? '降級' : '升級'}</button>
          <button class="btn-small btn-danger btn-delete" data-id="${u.id}">刪除</button>
        </div>
      </div>
    `).join('') || '<p>暫無用戶</p>';

    // Bind events
    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.onclick = () => showUserDetail(btn.dataset.id);
    });
    document.querySelectorAll('.btn-toggle-role').forEach(btn => {
      btn.onclick = () => toggleUserRole(btn.dataset.id, btn.dataset.role);
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.onclick = () => deleteUser(btn.dataset.id);
    });

    document.getElementById('char-stats-list').innerHTML = charStats.slice(0, 50).map(c => `
      <div class="char-stat-item">
        <span class="char-stat-char">${c.char}</span>
        <span class="char-stat-info">練習人數: ${c.usersPracticed || 0} | 總次數: ${c.totalAttempts || 0} | 平均時間: ${c.avgTime ? (c.avgTime/1000).toFixed(1) + 's' : '-'}</span>
      </div>
    `).join('') || '<p>暫無數據</p>';

    // Load char lib
    const chars = await AdminAPI.getChars();
    document.getElementById('char-lib-count').textContent = chars.length;
    document.getElementById('char-lib-list').innerHTML = chars.map(c => `
      <div class="char-lib-item">
        <span class="char-lib-char">${c.char}</span>
        <div class="char-lib-info">
          <div class="char-lib-components">${c.components?.join(' + ') || ''}</div>
          <div class="char-lib-layout">${c.layout}</div>
        </div>
        <div class="char-lib-actions">
          <button class="btn-small btn-danger btn-char-delete" data-id="${c.id}">刪除</button>
        </div>
      </div>
    `).join('') || '<p>暫無字符</p>';

    document.querySelectorAll('.btn-char-delete').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('確定刪除？')) return;
        try {
          await AdminAPI.deleteChar(btn.dataset.id);
          loadAdminPanel();
        } catch (e) {
          toast('刪除失敗: ' + e.message);
        }
      };
    });
  } catch (e) {
    console.warn('載入管理員數據失敗:', e);
  }
}

// ===== 布置任務（管理員）=====
const AdminAssignments = {
  selected: new Set(),
  chars: [],
  users: [],

  async load() {
    await Promise.all([this._loadUsers(), this._loadChars()]);
    this.renderCharPicker();
    await this.renderList();
    this._bindOnce();
  },

  async _loadUsers() {
    try {
      const users = await AdminAPI.getUsers();
      this.users = users.filter(u => u.role !== 'admin');
      const sel = document.getElementById('assign-user');
      sel.innerHTML = this.users.map(u =>
        `<option value="${u.id}">${escapeHtml(u.nickname || u.username)}</option>`
      ).join('') || '<option value="">（冇小孩帳號）</option>';
    } catch (e) {
      console.warn('載入用戶失敗:', e.message);
    }
  },

  async _loadChars() {
    try {
      this.chars = await AdminAPI.getChars();
    } catch {
      this.chars = [];
    }
  },

  renderCharPicker() {
    const el = document.getElementById('assign-chars-picker');
    if (!el) return;
    if (this.chars.length === 0) {
      el.innerHTML = '<p style="color:#636e72">字庫係空嘅</p>';
      return;
    }
    el.innerHTML = this.chars.map(c => `
      <button class="char-chip ${this.selected.has(c.id) ? 'selected' : ''}" data-char-id="${c.id}">${c.char}</button>
    `).join('');
    el.querySelectorAll('.char-chip').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.dataset.charId);
        if (this.selected.has(id)) {
          this.selected.delete(id);
        } else {
          this.selected.add(id);
        }
        btn.classList.toggle('selected');
        this._updateSummary();
      };
    });
    this._updateSummary();
  },

  _updateSummary() {
    const s = document.getElementById('assign-summary');
    if (!s) return;
    const chars = this.chars.filter(c => this.selected.has(c.id)).map(c => c.char);
    s.innerHTML = chars.length
      ? `已選 ${chars.length} 個字：${chars.join(' ')}`
      : '未揀任何字';
  },

  _bindOnce() {
    if (this._bound) return;
    this._bound = true;

    document.getElementById('assign-add-btn').onclick = async () => {
      const input = document.getElementById('assign-search');
      const text = input.value.trim();
      if (!text) return;
      if (this.chars.length === 0) await this._loadChars();
      const wanted = [...new Set(text.split(/[\s,，、]+/).filter(Boolean))];
      let added = 0, missing = [];
      wanted.forEach(ch => {
        const found = this.chars.find(c => c.char === ch);
        if (found) {
          this.selected.add(found.id);
          added++;
        } else {
          missing.push(ch);
        }
      });
      input.value = '';
      this.renderCharPicker();
      toast(missing.length
        ? `已加入 ${added} 個字${missing.length ? `，字庫冇：${missing.join('')}` : ''}`
        : `已加入 ${added} 個字`);
    };

    document.getElementById('assign-clear-btn').onclick = () => {
      this.selected.clear();
      this.renderCharPicker();
    };

    document.getElementById('assign-save-btn').onclick = () => this.create();
  },

  async create() {
    const userId = document.getElementById('assign-user').value;
    const name = document.getElementById('assign-name').value.trim();
    const note = document.getElementById('assign-note').value.trim();
    if (!userId) return toast('請先選擇小孩');
    if (this.selected.size === 0) return toast('請至少揀一個字');

    try {
      await AdminAPI.createAssignment({
        userId: parseInt(userId),
        name,
        note,
        charIds: [...this.selected]
      });
      toast('✅ 任務已建立');
      document.getElementById('assign-name').value = '';
      document.getElementById('assign-note').value = '';
      this.selected.clear();
      this.renderCharPicker();
      await this.renderList();
    } catch (e) {
      toast('建立失敗: ' + e.message);
    }
  },

  async renderList() {
    const el = document.getElementById('assignment-list');
    if (!el) return;
    let list = [];
    try {
      list = await AdminAPI.getAssignments();
    } catch (e) {
      el.innerHTML = `<p style="color:#c0392b">載入失敗: ${escapeHtml(e.message)}</p>`;
      return;
    }
    if (list.length === 0) {
      el.innerHTML = '<p style="color:#636e72">仲未有任務</p>';
      return;
    }
    el.innerHTML = list.map(a => {
      const pct = a.total ? Math.round((a.completedCount / a.total) * 100) : 0;
      const chars = this.chars.filter(c => a.charIds.includes(c.id)).map(c => c.char).join(' ');
      const date = new Date(a.createdAt).toLocaleDateString('zh-HK');
      return `<div class="assignment-item ${a.allDone ? 'done' : ''}">
        <div class="assignment-head">
          <div>
            <span class="assignment-name">${escapeHtml(a.name)}</span>
            <span class="assignment-user">👦 ${escapeHtml(a.username)}</span>
            ${a.allDone ? '<span class="assignment-badge">✅ 已完成</span>' : ''}
          </div>
          <div class="assignment-date">${date}</div>
        </div>
        ${a.note ? `<div class="assignment-note">${escapeHtml(a.note)}</div>` : ''}
        <div class="assignment-chars">${chars}</div>
        <div class="assignment-progress">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span>${a.completedCount} / ${a.total}</span>
        </div>
        <div class="assignment-actions">
          <button class="btn-small btn-reset" data-id="${a.id}">🔄 重設進度</button>
          <button class="btn-small btn-danger btn-del-assign" data-id="${a.id}">🗑 刪除</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.btn-del-assign').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('確定刪除呢個任務？')) return;
        try {
          await AdminAPI.deleteAssignment(btn.dataset.id);
          toast('已刪除');
          this.renderList();
        } catch (e) {
          toast('刪除失敗: ' + e.message);
        }
      };
    });
    el.querySelectorAll('.btn-reset').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('重設進度？小朋友要由頭再做一次')) return;
        try {
          await AdminAPI.updateAssignment(btn.dataset.id, { resetDone: true });
          toast('已重設');
          this.renderList();
        } catch (e) {
          toast('重設失敗: ' + e.message);
        }
      };
    });
  }
};

// ===== Char Import =====
let importPreviewData = [];

function generateHint(char, components, layout) {
  const c = components;
  const layoutDescs = {
    'surround': () => {
      if (c.includes('囗') && c.includes('口')) return '囗包住口，就是「回」（來回）';
      if (c.includes('囗') && c.includes('戈')) return '囗包住戈，叫做「國」（國家）';
      if (c.includes('冂')) return `冂包住${c.filter(x=>x!=='冂').join('、')}`;
      if (c.includes('匚')) return `匚包住${c.filter(x=>x!=='匚').join('、')}`;
      return `外框包住「${c.filter(x=>x!==c[0]).join('、')}」`;
    },
    'half-surround-left': () => {
      const inner = c.filter(x => !['辶','辵','⺍'].includes(x));
      return `走之旁（辶）包住「${inner.join('、')}」`;
    },
    'top-bottom': () => {
      return `上是「${c[0]}」，下是「${c.slice(1).join('、')}」`;
    },
    'left-right': () => {
      return `左是「${c[0]}」，右是「${c.slice(1).join('、')}」`;
    },
    'surround-3': () => {
      return `冖包住上方，「${c.filter(x=>!['冖'].includes(x)).join('、')}」在下`;
    }
  };

  if (layoutDescs[layout]) {
    return layoutDescs[layout]();
  }
  return `由「${c.join('」、「')}」組成`;
}

function processCharForImport(char) {
  const decompositions = window.ChaiziDict?.[char];
  if (!decompositions) return null;
  const allDecomps = decompositions.map(d => d.split(' '));
  const defaultComponents = allDecomps[0];
  const defaultLayout = autoLayout(defaultComponents);
  const defaultHint = generateHint(char, defaultComponents, defaultLayout);
  return {
    char,
    decompositions: allDecomps,
    components: defaultComponents,
    layout: defaultLayout,
    hint: defaultHint
  };
}

document.addEventListener('DOMContentLoaded', () => {
  // Save AI token
  document.getElementById('save-ai-token-btn')?.addEventListener('click', async () => {
    const token = document.getElementById('ai-token').value.trim();
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiToken: token })
      });
      if (!res.ok) throw new Error('保存失敗');
      toast('AI 配置已保存');
    } catch (e) {
      toast('保存失敗: ' + e.message);
    }
  });

  // Load AI token
  (async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        document.getElementById('ai-token').value = data.aiToken || '';
      }
    } catch (e) {}
  })();

  // Analyze single character
  document.getElementById('analyze-single-btn')?.addEventListener('click', async () => {
    const char = document.getElementById('form-char').value.trim();
    if (!char) {
      toast('請輸入字符');
      return;
    }
    const decompositions = window.ChaiziDict?.[char];
    if (!decompositions) {
      toast('字符不在字典中');
      return;
    }
    const allDecomps = decompositions.map(d => d.split(' '));
    const btn = document.getElementById('analyze-single-btn');
    btn.textContent = '分析中...';
    btn.disabled = true;
    try {
      const res = await fetch('/api/analyze-char', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ char, decompositions: allDecomps })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '分析失敗');
      // Fill form
      document.getElementById('form-components').value = data.recommended ? allDecomps[data.recommended - 1].join(',') : allDecomps[0].join(',');
      document.getElementById('form-layout').value = data.layout;
      document.getElementById('form-hint').value = data.reason;
      toast(`分析完成：${data.layout}`);
    } catch (e) {
      toast('分析失敗: ' + e.message);
    } finally {
      btn.textContent = '🤖 AI 分析';
      btn.disabled = false;
    }
  });

  document.getElementById('import-btn')?.addEventListener('click', () => {
    const input = document.getElementById('import-chars').value.trim();
    if (!input) {
      toast('請輸入字符');
      return;
    }
    const chars = [...new Set(input.split('').filter(c => c.trim() && /\S/.test(c)))];
    importPreviewData = [];
    for (const char of chars) {
      const processed = processCharForImport(char);
      if (processed) {
        importPreviewData.push(processed);
      }
    }
    if (importPreviewData.length === 0) {
      toast('沒有找到可導入的字符（確保字符在字典中存在）');
      return;
    }
    document.getElementById('import-preview-list').innerHTML = importPreviewData.map((p, idx) => `
      <div class="import-preview-item" data-idx="${idx}">
        <span class="import-preview-char">${p.char}</span>
        <div class="import-preview-info">
          <div class="decomp-options">
            ${p.decompositions.map((d, i) => `
              <label class="decomp-option ${i === 0 ? 'selected' : ''}">
                <input type="radio" name="decomp-${idx}" value="${i}" ${i === 0 ? 'checked' : ''}>
                ${d.join(' + ')}
              </label>
            `).join('')}
          </div>
          <div class="layout-select">
            <label>結構：</label>
            <select class="layout-selector" data-idx="${idx}">
              <option value="left-right" ${p.layout === 'left-right' ? 'selected' : ''}>左右結構</option>
              <option value="top-bottom" ${p.layout === 'top-bottom' ? 'selected' : ''}>上下結構</option>
              <option value="top-bottom-bottom" ${p.layout === 'top-bottom-bottom' ? 'selected' : ''}>品字結構</option>
              <option value="vertical-3" ${p.layout === 'vertical-3' ? 'selected' : ''}>三疊結構</option>
              <option value="top-bottom-bottom-bottom" ${p.layout === 'top-bottom-bottom-bottom' ? 'selected' : ''}>四疊結構</option>
              <option value="top-2-bottom" ${p.layout === 'top-2-bottom' ? 'selected' : ''}>上中下結構</option>
              <option value="surround" ${p.layout === 'surround' ? 'selected' : ''}>包圍結構</option>
              <option value="half-surround-left" ${p.layout === 'half-surround-left' ? 'selected' : ''}>半包圍（左）</option>
              <option value="complex-3-left" ${p.layout === 'complex-3-left' ? 'selected' : ''}>三方結構</option>
              <option value="complex-4-left" ${p.layout === 'complex-4-left' ? 'selected' : ''}>四方結構</option>
              <option value="surround-3" ${p.layout === 'surround-3' ? 'selected' : ''}>包圍-3</option>
              <option value="left-right-right" ${p.layout === 'left-right-right' ? 'selected' : ''}>左中右結構</option>
              <option value="stack" ${p.layout === 'stack' ? 'selected' : ''}>通用堆疊（5+部件）</option>
            </select>
          </div>
          <div class="import-preview-hint">提示：${p.hint}</div>
          <button class="btn btn-secondary btn-sm ai-analyze-btn" data-idx="${idx}">🤖 AI 分析</button>
        </div>
      </div>
    `).join('');

    // Bind events for decomp selection
    document.querySelectorAll('.decomp-option input').forEach(input => {
      input.addEventListener('change', (e) => {
        const item = e.target.closest('.import-preview-item');
        const idx = parseInt(item.dataset.idx);
        const decompIdx = parseInt(e.target.value);
        const p = importPreviewData[idx];
        p.components = p.decompositions[decompIdx];
        p.layout = autoLayout(p.components);
        p.hint = generateHint(p.char, p.components, p.layout);
        // Re-render just this item
        item.querySelector('.import-preview-components')?.remove();
        item.querySelector('.decomp-options')?.remove();
        item.querySelector('.layout-select')?.remove();
        item.querySelector('.import-preview-hint')?.remove();
        const info = item.querySelector('.import-preview-info');
        info.insertAdjacentHTML('afterbegin', `<div class="import-preview-components">${p.components.join(' + ')}</div>`);
        info.insertAdjacentHTML('afterbegin', `<div class="decomp-options">${p.decompositions.map((d, i) => `<label class="decomp-option ${i === decompIdx ? 'selected' : ''}"><input type="radio" name="decomp-${idx}" value="${i}" ${i === decompIdx ? 'checked' : ''}>${d.join(' + ')}</label>`).join('')}</div>`);
      });
    });

    // Bind layout selector
    document.querySelectorAll('.layout-selector').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx);
        importPreviewData[idx].layout = e.target.value;
      });
    });

    // Bind AI analyze
    document.querySelectorAll('.ai-analyze-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.target.dataset.idx);
        const p = importPreviewData[idx];
        e.target.textContent = '分析中...';
        e.target.disabled = true;
        try {
          const res = await fetch('/api/analyze-char', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ char: p.char, decompositions: p.decompositions })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '分析失敗');
          // Apply result with validation
          const decompIdx = Math.max(0, Math.min((data.recommended || 1) - 1, p.decompositions.length - 1));
          p.components = p.decompositions[decompIdx];
          p.layout = data.layout;
          p.positions = data.positions || null;
          p.hint = `${p.components.join(' + ')}，${data.reason}`;
          // Re-render
          const posInfo = p.positions ? ` (含 ${p.positions.length} 個部件位置)` : '';
          toast(`分析完成：${data.layout} - ${data.reason}${posInfo}`);
          document.getElementById('import-btn').click(); // Re-render preview
        } catch (err) {
          toast(err.message);
        } finally {
          e.target.textContent = '🤖 AI 分析';
          e.target.disabled = false;
        }
      });
    });

    document.getElementById('import-preview').style.display = 'block';
  });

  document.getElementById('confirm-import-btn')?.addEventListener('click', async () => {
    try {
      let added = 0, skipped = 0, failed = 0;
      for (const item of importPreviewData) {
        const exists = (await Data.getAll()).find(c => c.char === item.char);
        if (exists) { skipped++; continue; }
        const result = await Data.add({
          char: item.char,
          components: item.components,
          layout: item.layout,
          hint: item.hint,
          positions: item.positions || null
        });
        if (result) added++;
        else failed++;
      }
      toast(`導入完成：新增 ${added} 個，跳過 ${skipped} 個${failed ? '，失敗 ' + failed : ''}`);
      document.getElementById('import-preview').style.display = 'none';
      document.getElementById('import-chars').value = '';
      await Admin.init();
    } catch (e) {
      toast('導入失敗: ' + e.message);
    }
  });

  document.getElementById('cancel-import-btn')?.addEventListener('click', () => {
    document.getElementById('import-preview').style.display = 'none';
    importPreviewData = [];
  });

  document.getElementById('sync-btn')?.addEventListener('click', async () => {
    const localChars = await Data.getAll();
    if (localChars.length === 0) {
      toast('本地沒有字符');
      return;
    }
    let updated = 0;
    for (const c of localChars) {
      if (!c.char) continue;
      if (!c.hint) {
        const decompositions = window.ChaiziDict?.[c.char];
        if (decompositions) {
          c.components = decompositions[0].split(' ');
          c.layout = autoLayout(c.components);
          c.hint = generateHint(c.char, c.components, c.layout);
          await Data.update(c.id, c);
          updated++;
        }
      }
    }
    toast(`同步完成：更新了 ${updated} 個字的提示`);
    await Admin.init();
  });
});

async function showUserDetail(userId) {
  try {
    const data = await AdminAPI.getUserDetail(userId);
    document.getElementById('user-detail-title').textContent = `用戶：${data.user.nickname || data.user.username}`;
    document.getElementById('user-detail-stats').innerHTML = `
      <div class="user-detail-stats">
        <div class="stat-mini">
          <span class="stat-mini-val">${data.progress.length}</span>
          <span class="stat-mini-label">已學字</span>
        </div>
        <div class="stat-mini">
          <span class="stat-mini-val">${data.progress.reduce((s, p) => s + (p.attempts || 0), 0)}</span>
          <span class="stat-mini-label">總練習</span>
        </div>
        <div class="stat-mini">
          <span class="stat-mini-val">${data.user.role}</span>
          <span class="stat-mini-label">角色</span>
        </div>
      </div>
    `;
    document.getElementById('user-detail-records').innerHTML = `
      <h4>練習記錄（最近50條）</h4>
      <div class="records-list">
        ${data.progress.slice(0, 20).map(p => `
          <div class="record-item">
            <span class="record-char">${p.char}</span>
            <span class="record-stats">次: ${p.attempts} | 平均: ${p.avgTime ? (p.avgTime/1000).toFixed(1) + 's' : '-'} | 最佳: ${p.bestTime ? (p.bestTime/1000).toFixed(1) + 's' : '-'}</span>
            <span class="record-date">${p.lastPracticed ? new Date(p.lastPracticed).toLocaleDateString() : '-'}</span>
          </div>
        `).join('') || '<p>暫無記錄</p>'}
      </div>
      <div class="form-actions" style="margin-top:14px">
        <button class="btn btn-secondary" id="clear-user-progress-btn">🧹 清除此用戶進度</button>
      </div>
    `;
    document.getElementById('user-detail-panel').style.display = 'block';
    document.getElementById('user-detail-panel').scrollIntoView();
    document.getElementById('clear-user-progress-btn').onclick = async () => {
      if (!confirm(`確定清除「${data.user.nickname || data.user.username}」嘅所有學習進度？`)) return;
      try {
        await AdminAPI.clearUserProgress(userId);
        toast('已清除進度');
        showUserDetail(userId);
        loadAdminPanel();
      } catch (e) {
        toast('清除失敗: ' + e.message);
      }
    };
  } catch (e) {
    toast('載入用戶詳情失敗: ' + e.message);
  }
}

async function toggleUserRole(userId, newRole) {
  if (!confirm(`確定要將此用戶${newRole === 'admin' ? '升級為管理員' : '降級為普通用戶'}嗎？`)) return;
  try {
    await AdminAPI.updateUser(userId, newRole);
    toast('更新成功');
    loadAdminPanel();
  } catch (e) {
    toast('更新失敗: ' + e.message);
  }
}

async function deleteUser(userId) {
  if (!confirm('確定要刪除此用戶嗎？此操作不可撤銷！')) return;
  try {
    await AdminAPI.deleteUser(userId);
    toast('刪除成功');
    loadAdminPanel();
  } catch (e) {
    toast('刪除失敗: ' + e.message);
  }
}

// Tab switching
document.addEventListener('DOMContentLoaded', () => {
  // Dashboard tabs
  document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(btn => {
    btn.onclick = async () => {
      document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'profile') {
        await User.checkSession();
        loadProfile();
      }
    };
  });

  // Admin tabs
  document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
    btn.onclick = async () => {
      document.querySelectorAll('.admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'profile') {
        await User.checkSession();
        loadProfile();
      }
      if (btn.dataset.tab === 'assignments') {
        AdminAssignments.load();
      }
    };
  });

  document.getElementById('close-user-detail')?.addEventListener('click', () => {
    document.getElementById('user-detail-panel').style.display = 'none';
  });
});

document.addEventListener('DOMContentLoaded', () => {
  init();
  if (location.hash === '#admin') showView('admin');
});