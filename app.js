/* ===========================================
   識字樂 - 中文拼字遊戲
   =========================================== */

const STORAGE_KEY = 'shizi_chars_v9';

// ===== 查字典工具（kfcd/chaizi）=====
function lookupChaizi(char, prefer = 'last') {
  if (!window.ChaiziDict || !window.ChaiziDict[char]) return null;
  const alts = window.ChaiziDict[char];
  if (alts.length === 0) return null;
  const idx = prefer === 'first' ? 0 : alts.length - 1;
  return alts[idx].split(' ');
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

  return 'top-bottom';
}

// ===== 用戶系統 =====
const User = {
  current: null,
  apiBase: '/api',

  async request(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(this.apiBase + path, options);
    const data = await res.json();
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

    if (this.current) {
      userNav.classList.remove('hidden');
      loginNav.classList.add('hidden');
      const displayName = this.current.nickname || this.current.username;
      const displayAvatar = this.current.avatar || displayName[0].toUpperCase();
      userInfo.innerHTML = `<span style="font-size:20px">${displayAvatar}</span> ${displayName}`;
      adminBtn.style.display = this.current.role === 'admin' ? 'inline-block' : 'none';
      userStats.classList.remove('hidden');
    } else {
      userNav.classList.add('hidden');
      loginNav.classList.remove('hidden');
      userStats.classList.add('hidden');
    }
  }
};

// ===== 管理員 API =====
const AdminAPI = {
  apiBase: '/api/admin',

  async request(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(this.apiBase + path, options);
    const data = await res.json();
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

  async deleteUser(userId) {
    return this.request('/user/' + userId, 'DELETE');
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
  }
};

// ===== 預設字庫（部件全部取自 kfcd/chaizi 字典）=====
const DEFAULT_CHARS = [
  // 包圍結構（外內）
  { id: 1, char: '回', components: lookupChaizi('回', 'first'), layout: 'surround', hint: '一個囗包住口，叫做「回」（回來）' },
  { id: 2, char: '困', components: lookupChaizi('困', 'first'), layout: 'surround', hint: '囗包住「木」，就係「困」喺圍欄裏面' },
  { id: 3, char: '因', components: lookupChaizi('因', 'first'), layout: 'surround', hint: '方框（囗）內有「大」，就係「因」' },
  { id: 4, char: '國', components: lookupChaizi('國', 'first'), layout: 'surround', hint: '方框（囗）內有「或」，就係「國家」' },
  { id: 5, char: '固', components: lookupChaizi('固', 'first'), layout: 'surround', hint: '方框內有「古」，就係「固」定不變' },

  // 半包圍結構（辶包左）
  { id: 6, char: '這', components: lookupChaizi('這', 'last'), layout: 'half-surround-left', hint: '「辶」包住左邊，「言」在右邊，叫做「這」個' },
  { id: 7, char: '進', components: lookupChaizi('進', 'last'), layout: 'half-surround-left', hint: '「辶」包左，「隹」在右，叫做「進」步' },

  // 邊（字典末選拆法：辶 + 臱 = 2 部分）
  { id: 8, char: '邊', components: lookupChaizi('邊', 'last'), layout: 'half-surround-left', hint: '「辶」包住左邊，「臱」在右邊，叫做「旁邊」' },

  // 品字結構
  { id: 9, char: '森', components: lookupChaizi('森', 'first'), layout: 'top-bottom-bottom', hint: '三棵樹，就係「森林」' },
  { id: 10, char: '晶', components: lookupChaizi('晶', 'first'), layout: 'top-bottom-bottom', hint: '三個日頭一齊，就係「晶」亮' },

  // 字典拆法
  { id: 11, char: '靈', components: lookupChaizi('靈', 'first'), layout: 'top-bottom', hint: '「霝」上有「巫」下，就係「靈」驗' },
  { id: 12, char: '響', components: lookupChaizi('響', 'first'), layout: 'top-bottom', hint: '「鄉」上有「音」下，就係「響」' },
  { id: 13, char: '寶', components: lookupChaizi('寶', 'last'), layout: 'top-2-bottom', hint: '屋頂「宀」+中間「玉」左「缶」右+底下「貝」，就係「寶」物' },
  { id: 14, char: '鼻', components: lookupChaizi('鼻', 'first'), layout: 'vertical-3', hint: '「自」+「田」+「廾」三件上下疊，就係「鼻」' },
  { id: 15, char: '攀', components: ['林', '爻', '大', '手'], layout: 'vertical-3', hint: '「林」「爻」「大」「手」上下疊，就係「攀」' },
];

// ===== 數據存儲 =====
const Data = {
  init() {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CHARS));
    }
  },

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  },

  save(chars) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chars));
  },

  add(data) {
    const chars = this.getAll();
    const newChar = { id: Date.now(), ...data };
    chars.push(newChar);
    this.save(chars);
    return newChar;
  },

  update(id, data) {
    const chars = this.getAll();
    const i = chars.findIndex(c => c.id === id);
    if (i >= 0) {
      chars[i] = { ...chars[i], ...data, id };
      this.save(chars);
    }
  },

  remove(id) {
    const chars = this.getAll().filter(c => c.id !== id);
    this.save(chars);
  },

  reset() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CHARS));
  }
};

// ===== 遊戲邏輯 =====
const Game = {
  chars: [],
  current: null,
  score: 0,
  index: 0,

  start() {
    this.chars = Data.getAll();
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

  next() {
    if (this.index >= this.chars.length) {
      this._gameOver();
      return;
    }
    this.current = this.chars[this.index];
    this.startTime = Date.now();
    this._updateProgress();
    this.render();
    this._speak(this.current.char);
  },

  render() {
    const display = document.getElementById('character-display');
    display.className = 'character-display layout-' + this.current.layout;
    display.innerHTML = '';

    if (this.current.layout === 'surround') {
      // Outer (slot 0) and inner (slot 1) - inner on top, centered
      const outerSlot = document.createElement('div');
      outerSlot.className = 'slot slot-outer';
      outerSlot.dataset.index = 0;
      outerSlot.dataset.expected = this.current.components[0];
      this._setupSlot(outerSlot);
      display.appendChild(outerSlot);

      const innerSlot = document.createElement('div');
      innerSlot.className = 'slot slot-inner';
      innerSlot.dataset.index = 1;
      innerSlot.dataset.expected = this.current.components[1];
      this._setupSlot(innerSlot);
      display.appendChild(innerSlot);
    } else if (this.current.layout === 'half-surround-left') {
      // 辶 on left, inner on right
      const outerSlot = document.createElement('div');
      outerSlot.className = 'slot slot-outer';
      outerSlot.dataset.index = 0;
      outerSlot.dataset.expected = this.current.components[0];
      this._setupSlot(outerSlot);
      display.appendChild(outerSlot);

      const innerSlot = document.createElement('div');
      innerSlot.className = 'slot slot-inner';
      innerSlot.dataset.index = 1;
      innerSlot.dataset.expected = this.current.components[1];
      this._setupSlot(innerSlot);
      display.appendChild(innerSlot);
    } else if (this.current.layout === 'complex-3-left') {
      // 辶 on left (full height), 2 stacked on right
      const outerSlot = document.createElement('div');
      outerSlot.className = 'slot slot-outer';
      outerSlot.dataset.index = 0;
      outerSlot.dataset.expected = this.current.components[0];
      this._setupSlot(outerSlot);
      display.appendChild(outerSlot);

      const topSlot = document.createElement('div');
      topSlot.className = 'slot slot-inner-top';
      topSlot.dataset.index = 1;
      topSlot.dataset.expected = this.current.components[1];
      this._setupSlot(topSlot);
      display.appendChild(topSlot);

      const bottomSlot = document.createElement('div');
      bottomSlot.className = 'slot slot-inner-bottom';
      bottomSlot.dataset.index = 2;
      bottomSlot.dataset.expected = this.current.components[2];
      this._setupSlot(bottomSlot);
      display.appendChild(bottomSlot);
    } else if (this.current.layout === 'complex-4-left') {
      const outerSlot = document.createElement('div');
      outerSlot.className = 'slot slot-outer';
      outerSlot.dataset.index = 0;
      outerSlot.dataset.expected = this.current.components[0];
      this._setupSlot(outerSlot);
      display.appendChild(outerSlot);

      const topSlot = document.createElement('div');
      topSlot.className = 'slot slot-inner-top';
      topSlot.dataset.index = 1;
      topSlot.dataset.expected = this.current.components[1];
      this._setupSlot(topSlot);
      display.appendChild(topSlot);

      const middleSlot = document.createElement('div');
      middleSlot.className = 'slot slot-inner-middle';
      middleSlot.dataset.index = 2;
      middleSlot.dataset.expected = this.current.components[2];
      this._setupSlot(middleSlot);
      display.appendChild(middleSlot);

      const bottomSlot = document.createElement('div');
      bottomSlot.className = 'slot slot-inner-bottom';
      bottomSlot.dataset.index = 3;
      bottomSlot.dataset.expected = this.current.components[3];
      this._setupSlot(bottomSlot);
      display.appendChild(bottomSlot);
    } else if (this.current.layout === 'surround-3') {
      const outerSlot = document.createElement('div');
      outerSlot.className = 'slot slot-outer';
      outerSlot.dataset.index = 0;
      outerSlot.dataset.expected = this.current.components[0];
      this._setupSlot(outerSlot);
      display.appendChild(outerSlot);

      const topSlot = document.createElement('div');
      topSlot.className = 'slot slot-inner-top';
      topSlot.dataset.index = 1;
      topSlot.dataset.expected = this.current.components[1];
      this._setupSlot(topSlot);
      display.appendChild(topSlot);

      const bottomSlot = document.createElement('div');
      bottomSlot.className = 'slot slot-inner-bottom';
      bottomSlot.dataset.index = 2;
      bottomSlot.dataset.expected = this.current.components[2];
      this._setupSlot(bottomSlot);
      display.appendChild(bottomSlot);
    } else if (this.current.layout === 'left-right-right') {
      const leftSlot = document.createElement('div');
      leftSlot.className = 'slot slot-outer';
      leftSlot.dataset.index = 0;
      leftSlot.dataset.expected = this.current.components[0];
      this._setupSlot(leftSlot);
      display.appendChild(leftSlot);

      const topSlot = document.createElement('div');
      topSlot.className = 'slot slot-inner-top';
      topSlot.dataset.index = 1;
      topSlot.dataset.expected = this.current.components[1];
      this._setupSlot(topSlot);
      display.appendChild(topSlot);

      const bottomSlot = document.createElement('div');
      bottomSlot.className = 'slot slot-inner-bottom';
      bottomSlot.dataset.index = 2;
      bottomSlot.dataset.expected = this.current.components[2];
      this._setupSlot(bottomSlot);
      display.appendChild(bottomSlot);
    } else {
      this.current.components.forEach((comp, i) => {
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.index = i;
        slot.dataset.expected = comp;
        this._setupSlot(slot);
        display.appendChild(slot);
      });
    }

    const tray = document.getElementById('pieces-tray');
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

    document.getElementById('hint-content').classList.add('hidden');
    document.getElementById('hint-btn').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('celebration').classList.add('hidden');
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

    // Touch / click support: if a piece is selected, place on tap
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

    // Touch / click: tap to select
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
    if (allFilled) {
      this._celebrate();
    }
  },

  _celebrate() {
    this.score += 10;
    this._updateScore();

    const display = document.getElementById('character-display');
    const tray = document.getElementById('pieces-tray');
    const char = this.current.char;
    const hint = this.current.hint;
    const responseTime = Date.now() - this.startTime;

    // Record progress to API
    User.recordProgress(char, this.current.id, responseTime, true);

    // Fade out slots and tray
    display.querySelectorAll('.slot').forEach(s => s.classList.add('fade-out'));
    tray.classList.add('fade-out');

    // After fade, show complete character with pop-in
    setTimeout(() => {
      display.innerHTML = `<div class="complete-character">${char}</div>`;
      display.classList.add('complete-mode');
      tray.innerHTML = '';
      tray.classList.remove('fade-out');
      this._playSuccess();
      setTimeout(() => this._speak(char), 200);

      // Show hint after answering
      const hintBtn = document.getElementById('hint-btn');
      const hintContent = document.getElementById('hint-content');
      hintBtn.classList.remove('hidden');
      hintBtn.textContent = '💡 粵語提示';
      if (hint) {
        hintContent.textContent = hint;
        hintContent.classList.remove('hidden');
      }
    }, 400);

    // Celebration popup
    const cel = document.getElementById('celebration');
    setTimeout(() => {
      cel.classList.remove('hidden');
      setTimeout(() => cel.classList.add('hidden'), 2200);
    }, 700);

    document.getElementById('next-btn').classList.remove('hidden');
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
    document.getElementById('character-display').innerHTML = `
      <div class="game-over">
        <h2>🎉 完成晒！</h2>
        <p>你一共拎到 <strong>${this.score}</strong> 分！</p>
        <button class="btn btn-primary" onclick="Game.restart()">🔄 再玩一次</button>
      </div>
    `;
    document.getElementById('pieces-tray').innerHTML = '';
    document.getElementById('next-btn').classList.add('hidden');
    this._playWin();
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

  restart() {
    this.start();
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
      osc.frequency.value = freq;
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    } catch (e) { /* ignore */ }
  },

  _playSuccess() {
    this._playTone(523.25, 0.12);
    this._playTone(659.25, 0.12, 0.1);
    this._playTone(783.99, 0.18, 0.2);
  },

  _playError() {
    this._playTone(220, 0.2);
  },

  _playWin() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._playTone(f, 0.18, i * 0.15));
  }
};

// ===== 管理介面 =====
const Admin = {
  editingId: null,

  init() {
    this.render();
    document.getElementById('save-btn').onclick = () => this.save();
    document.getElementById('cancel-btn').onclick = () => this.cancel();
    document.getElementById('reset-data-btn').onclick = () => this.resetData();

    // 自動查字典
    document.getElementById('form-char').addEventListener('input', (e) => {
      const ch = e.target.value.trim();
      if (ch.length === 1 && window.ChaiziDict && window.ChaiziDict[ch]) {
        const alts = window.ChaiziDict[ch];
        const first = alts[0].split(' ');
        document.getElementById('form-components').value = first.join(',');
        // 智能佈局檢測
        const suggestedLayout = autoLayout(first);
        document.getElementById('form-layout').value = suggestedLayout;
        // 顯示備選拆法讓用戶選擇
        const altOptions = alts.map((a, i) => `[${i+1}] ${a}`).join(' | ');
        toast(`字典 ${alts.length} 種拆法（已選首選，建議 ${suggestedLayout}）\n${altOptions}`);
      }
    });
  },

  render() {
    const chars = Data.getAll();
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
        <div class="char-meta">${layoutLabel}結構 · ${c.components.length}部件</div>
        <div class="char-hint-mini">${escapeHtml(c.hint || '(無口訣)')}</div>
        <div class="char-actions">
          <button class="btn-edit" data-id="${c.id}">✏️ 編輯</button>
          <button class="btn-delete" data-id="${c.id}">🗑️ 刪除</button>
        </div>
      `;
      item.querySelector('.btn-edit').onclick = () => this.edit(c.id);
      item.querySelector('.btn-delete').onclick = () => this.deleteChar(c.id);
      container.appendChild(item);
    });
  },

  edit(id) {
    const c = Data.getAll().find(x => x.id === id);
    if (!c) return;
    this.editingId = id;
    document.getElementById('form-title').textContent = '編輯字';
    document.getElementById('form-char').value = c.char;
    document.getElementById('form-components').value = c.components.join(',');
    document.getElementById('form-layout').value = c.layout;
    document.getElementById('form-hint').value = c.hint || '';
    document.getElementById('save-btn').textContent = '💾 更新';
  },

  save() {
    const char = document.getElementById('form-char').value.trim();
    const componentsRaw = document.getElementById('form-components').value;
    const components = componentsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const layout = document.getElementById('form-layout').value;
    const hint = document.getElementById('form-hint').value.trim();

    if (!char) return toast('請填寫字');
    if (components.length < 1) return toast('請填寫部件');
    if (!hint) return toast('請填寫口訣');

    if (this.editingId) {
      Data.update(this.editingId, { char, components, layout, hint });
      toast('已更新');
    } else {
      Data.add({ char, components, layout, hint });
      toast('已新增');
    }
    this.cancel();
    this.render();
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

  deleteChar(id) {
    if (confirm('確定要刪除呢個字？')) {
      Data.remove(id);
      this.render();
      toast('已刪除');
    }
  },

  resetData() {
    if (confirm('確定要重置為預設字庫？你之前加嘅全部都會刪除。')) {
      Data.reset();
      this.render();
      toast('已重置預設字庫');
    }
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
function showView(name) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v =>
    v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'game') Game.start();
  if (name === 'admin') Admin.init();
  if (name === 'dashboard') loadDashboard();
  if (name === 'admin-panel') loadAdminPanel();
}

// ===== 啟動 =====
function init() {
  Data.init();

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

  // Click outside to deselect piece
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('piece') &&
        !e.target.classList.contains('slot')) {
      document.querySelectorAll('.piece.selected').forEach(p =>
        p.classList.remove('selected'));
    }
  });

  Game.start();
  User.checkSession();
}

// ===== 認證表單 =====
let isRegister = false;

document.getElementById('auth-submit').onclick = async () => {
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
      toast('註冊成功！請登入');
      isRegister = false;
      document.getElementById('auth-title').textContent = '登入';
      document.getElementById('auth-submit').textContent = '登入';
      document.getElementById('auth-username').value = username;
      document.getElementById('auth-password').value = '';
      document.getElementById('auth-error').classList.add('hidden');
    } else {
      await User.login(username, password);
      toast('登入成功！');
      showView('dashboard');
      errorEl.classList.add('hidden');
      document.getElementById('auth-username').value = '';
      document.getElementById('auth-password').value = '';
    }
  } catch (e) {
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
    showView('game');
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
    const users = await AdminAPI.getUsers();
    document.getElementById('admin-users').textContent = users.length;

    const charStats = await AdminAPI.getCharStats();
    document.getElementById('admin-chars').textContent = charStats.length;

    document.getElementById('admin-user-list').innerHTML = users.map(u => `
      <div class="user-item" data-id="${u.id}">
        <span class="user-name">${u.nickname || u.username} ${u.role === 'admin' ? '👑' : ''}</span>
        <span class="user-stats">已學: ${u.charsKnown} 字 | 練習: ${u.totalAttempts || 0} 次</span>
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
          p.hint = `${p.components.join(' + ')}，${data.reason}`;
          // Re-render
          toast(`分析完成：${data.layout} - ${data.reason}`);
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
      const existingChars = JSON.parse(localStorage.getItem('shizi_chars_v9') || '[]');
      let added = 0, skipped = 0;
      for (const item of importPreviewData) {
        if (existingChars.find(c => c.char === item.char)) {
          skipped++;
          continue;
        }
        existingChars.push({
          id: Date.now() + Math.random(),
          char: item.char,
          components: item.components,
          layout: item.layout,
          hint: item.hint
        });
        added++;
      }
      localStorage.setItem('shizi_chars_v9', JSON.stringify(existingChars));
      Data.chars = existingChars;
      toast(`導入成功：新增 ${added} 個，跳過 ${skipped} 個`);
      document.getElementById('import-preview').style.display = 'none';
      document.getElementById('import-chars').value = '';
      Admin.init();
    } catch (e) {
      toast('導入失敗: ' + e.message);
    }
  });

  document.getElementById('cancel-import-btn')?.addEventListener('click', () => {
    document.getElementById('import-preview').style.display = 'none';
    importPreviewData = [];
  });

  document.getElementById('sync-btn')?.addEventListener('click', async () => {
    const localChars = JSON.parse(localStorage.getItem('shizi_chars_v9') || '[]');
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
          updated++;
        }
      }
    }
    localStorage.setItem('shizi_chars_v9', JSON.stringify(localChars));
    Data.chars = localChars;
    toast(`同步完成：更新了 ${updated} 個字的提示`);
    Admin.init();
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
        `).join('') || '<p暫無記錄</p>'}
      </div>
    `;
    document.getElementById('user-detail-panel').style.display = 'block';
    document.getElementById('user-detail-panel').scrollIntoView();
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

document.addEventListener('DOMContentLoaded', () => {
  init();
  if (location.hash === '#admin') showView('admin');
});