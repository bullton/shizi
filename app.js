/* ===========================================
   識字樂 - 中文拼字遊戲
   =========================================== */

const STORAGE_KEY = 'shizi_chars_v7';

// ===== 查字典工具（kfcd/chaizi）=====
function lookupChaizi(char, prefer = 'last') {
  if (!window.ChaiziDict || !window.ChaiziDict[char]) return null;
  const alts = window.ChaiziDict[char];
  if (alts.length === 0) return null;
  const idx = prefer === 'first' ? 0 : alts.length - 1;
  return alts[idx].split(' ');
}

// ===== 自動選擇佈局（根據部件數）=====
function autoLayout(components) {
  const n = components.length;
  if (n === 2) return 'top-bottom';
  if (n === 3) return 'top-bottom-bottom';
  if (n === 4) return 'top-bottom-bottom-bottom';
  return 'left-right';
}

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

  // 邊（字典首選拆法：辵 + 自 + 穴 + 方）
  { id: 8, char: '邊', components: lookupChaizi('邊', 'first'), layout: 'complex-4-left', hint: '「辵」喺左，「自」「穴」「方」喺右邊上下疊加，叫做「旁邊」' },

  // 品字結構
  { id: 9, char: '森', components: lookupChaizi('森', 'first'), layout: 'top-bottom-bottom', hint: '三棵樹，就係「森林」' },
  { id: 10, char: '晶', components: lookupChaizi('晶', 'first'), layout: 'top-bottom-bottom', hint: '三個日頭一齊，就係「晶」亮' },

  // 字典拆法
  { id: 11, char: '靈', components: lookupChaizi('靈', 'first'), layout: 'top-bottom', hint: '「霝」上有「巫」下，就係「靈」驗' },
  { id: 12, char: '響', components: lookupChaizi('響', 'first'), layout: 'top-bottom', hint: '「鄉」上有「音」下，就係「響」' },
  { id: 13, char: '寶', components: lookupChaizi('寶', 'last'), layout: 'top-bottom-bottom-bottom', hint: '屋頂「宀」+「玉」+「缶」+底下「貝」，就係「寶」物' },
  { id: 14, char: '鼻', components: lookupChaizi('鼻', 'first'), layout: 'top-bottom-bottom', hint: '「自」上有「田」中有「廾」下，就係「鼻」' },
  { id: 15, char: '攀', components: lookupChaizi('攀', 'first'), layout: 'top-bottom-bottom', hint: '「棥」+「大」+「手」，就係「攀」登' },
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
        // 顯示所有拆法讓用戶選擇
        const first = alts[0].split(' ');
        document.getElementById('form-components').value = first.join(',');
        // 自動建議佈局
        const layoutSelect = document.getElementById('form-layout');
        const n = first.length;
        if (n === 2) layoutSelect.value = 'top-bottom';
        else if (n === 3) layoutSelect.value = 'top-bottom-bottom';
        else if (n === 4) layoutSelect.value = 'top-bottom-bottom-bottom';
        toast(`字典找到 ${alts.length} 種拆法（已填首選）`);
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
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  if (location.hash === '#admin') showView('admin');
});