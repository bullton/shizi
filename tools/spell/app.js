(function () {
  'use strict';

  const state = {
    user: null,
    overview: null,
    nodes: [],
    tasks: [],
    levelFilter: 0,
    mode: 'child',
    view: 'hall',
    round: null,
    summary: null,
    lastRound: null,
    sound: true,
    hasInteracted: false,
    parentTab: 'tasks',
    adminTasks: [],
    adminUsers: [],
    adminStats: null,
    adminStatsLoading: false,
    statsUserId: null,
    adminForm: {
      name: '',
      themes: new Set(),
      level: 0,
      batchSize: 8,
      assign: 'all',
      users: new Set()
    },
    bank: {
      loaded: false,
      loading: false,
      theme: '',
      level: 0,
      q: '',
      offset: 0,
      limit: 40,
      total: 0,
      words: []
    },
    busy: false
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const els = {
    locked: $('#locked'),
    childView: $('#child-view'),
    parentView: $('#parent-view'),
    hallView: $('#hall-view'),
    roundView: $('#round-view'),
    summaryView: $('#summary-view'),
    modeSwitch: $('#mode-switch'),
    userChip: $('#user-chip'),
    soundBtn: $('#sound-btn'),
    helloName: $('#hello-name'),
    heroStats: $('#hero-stats'),
    taskGrid: $('#task-grid'),
    themeGrid: $('#theme-grid'),
    levelFilter: $('#level-filter'),
    hallParentBtn: $('#hall-parent-btn'),
    parentChildBtn: $('#parent-child-btn'),
    parentStats: $('#parent-stats'),
    themeTree: $('#theme-tree'),
    treeCount: $('#tree-count'),
    parentTasks: $('#parent-tasks'),
    parentAnalytics: $('#parent-analytics'),
    parentBank: $('#parent-bank'),
    roundProgressText: $('#round-progress-text'),
    roundProgressBar: $('#round-progress-bar'),
    comboPill: $('#combo-pill'),
    wordTheme: $('#word-theme'),
    wordLevel: $('#word-level'),
    wordMeaning: $('#word-meaning'),
    wordPos: $('#word-pos'),
    wordIpa: $('#word-ipa'),
    playWord: $('#play-word'),
    slotRow: $('#slot-row'),
    tray: $('#tray'),
    shuffleBlocks: $('#shuffle-blocks'),
    checkAnswer: $('#check-answer'),
    revealAnswer: $('#reveal-answer'),
    roundHint: $('#round-hint'),
    wordCardBackdrop: $('#word-card-backdrop'),
    wordCard: $('#word-card'),
    cardRibbon: $('#card-ribbon'),
    cardEyebrow: $('#card-eyebrow'),
    cardWord: $('#card-word'),
    cardSound: $('#card-sound'),
    cardSyllables: $('#card-syllables'),
    cardPos: $('#card-pos'),
    cardMeaning: $('#card-meaning'),
    cardIpa: $('#card-ipa'),
    cardForms: $('#card-forms'),
    cardExample: $('#card-example'),
    cardMastery: $('#card-mastery'),
    cardNext: $('#card-next'),
    summaryTitle: $('#summary-title'),
    summarySub: $('#summary-sub'),
    summaryStats: $('#summary-stats'),
    summaryProgress: $('#summary-progress'),
    summaryWrong: $('#summary-wrong'),
    summaryAgain: $('#summary-again'),
    summaryBack: $('#summary-back'),
    toast: $('#toast')
  };

  let toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function fmtInt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(Math.round(number)) : '0';
  }

  function fmtPct(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return String(Math.round(number * 10) / 10).replace(/\.0$/, '');
  }

  function avgTimeText(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '—';
    if (number < 1000) return Math.round(number) + ' ms';
    return (Math.round(number / 100) / 10).toFixed(1) + ' 秒';
  }

  function dateText(value) {
    if (!value) return '還沒開始';
    try {
      return new Date(value).toLocaleDateString('zh-HK', { month: 'numeric', day: 'numeric' });
    } catch (error) {
      return '';
    }
  }

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 3000);
  }

  async function request(url, options) {
    const config = Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, options || {});
    if (config.body && typeof config.body !== 'string') config.body = JSON.stringify(config.body);
    const response = await fetch(url, config);
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (error) { data = null; }
    }
    if (!response.ok) {
      const error = new Error((data && data.error) || '請求失敗');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function api(path, options) {
    return request('/api/spell' + path, options);
  }

  function isAdmin() {
    return state.user && state.user.role === 'admin';
  }

  function nodeTitle(id) {
    const node = state.nodes.find(item => item.node_id === id);
    return node ? node.title : id;
  }

  function nodeById(id) {
    return state.nodes.find(item => item.node_id === id) || null;
  }

  /* ===== Sound ===== */
  function speak(text, rate) {
    if (!state.sound || !text || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = 'en-US';
      utterance.rate = rate || 0.86;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      /* ignore */
    }
  }

  function speakCurrent() {
    if (!state.round || !state.round.current) return;
    speak(state.round.current.say || '', 0.86);
  }

  function speakSyllable(text) {
    if (!text || String(text).length < 2) return;
    speak(text, 0.8);
  }

  /* ===== Boot ===== */
  async function boot() {
    try {
      const me = await request('/api/me');
      state.user = me;
      await loadOverview();
      if (isAdmin()) await loadAdminData();
      showApp();
      renderAll();
    } catch (error) {
      if (error.status === 401) {
        showLocked();
        return;
      }
      showApp();
      renderAll();
      toast(error.message || '載入失敗，請重新整理');
    }
  }

  function showLocked() {
    els.locked.hidden = false;
    els.childView.hidden = true;
    els.parentView.hidden = true;
    els.modeSwitch.hidden = true;
    els.userChip.hidden = true;
  }

  function showApp() {
    els.locked.hidden = true;
    els.childView.hidden = false;
    els.modeSwitch.hidden = !isAdmin();
    els.hallParentBtn.hidden = !isAdmin();
    els.userChip.hidden = false;
    els.userChip.textContent = (state.user.avatar || '🐚') + ' ' + (state.user.nickname || state.user.username);
  }

  async function loadOverview() {
    const overview = await api('/overview');
    state.overview = overview;
    state.nodes = Array.isArray(overview.nodes) ? overview.nodes : [];
    state.tasks = Array.isArray(overview.tasks) ? overview.tasks : [];
  }

  async function refreshOverview() {
    try {
      await loadOverview();
      renderAll();
    } catch (error) {
      toast(error.message || '更新進度失敗');
    }
  }

  async function loadAdminData() {
    if (!isAdmin()) return;
    try {
      const [tasks, users] = await Promise.all([
        api('/admin/tasks'),
        request('/api/platform/users')
      ]);
      state.adminTasks = Array.isArray(tasks) ? tasks : [];
      state.adminUsers = Array.isArray(users) ? users : [];
    } catch (error) {
      state.adminTasks = [];
      state.adminUsers = [];
      toast(error.message || '載入管理資料失敗');
    }
  }

  /* ===== Render ===== */
  function renderAll() {
    if (!state.user) return;
    els.soundBtn.classList.toggle('is-off', !state.sound);
    els.soundBtn.textContent = state.sound ? '♪' : '♪';
    if (state.mode === 'parent') {
      els.childView.hidden = true;
      els.parentView.hidden = false;
      renderParent();
    } else {
      els.parentView.hidden = true;
      els.childView.hidden = false;
      if (state.view === 'round') {
        els.hallView.hidden = true;
        els.roundView.hidden = false;
        els.summaryView.hidden = true;
        renderRound();
      } else if (state.view === 'summary') {
        els.hallView.hidden = true;
        els.roundView.hidden = true;
        els.summaryView.hidden = false;
        renderSummary();
      } else {
        els.hallView.hidden = false;
        els.roundView.hidden = true;
        els.summaryView.hidden = true;
        renderHall();
      }
    }
  }

  function heroStat(value, unit, label) {
    return '<div class="hero-stat"><strong>' + esc(value) + (unit ? '<small>' + esc(unit) + '</small>' : '') +
      '</strong><span>' + esc(label) + '</span></div>';
  }

  function renderHall() {
    const stats = (state.overview && state.overview.stats) || {};
    els.helloName.textContent = state.user.nickname || state.user.username;
    els.heroStats.innerHTML = [
      heroStat(fmtInt(stats.mastered), ' 詞', '已掌握'),
      heroStat(fmtInt(stats.attempted), ' 詞', '做過'),
      heroStat(fmtPct(stats.accuracy) + '%', '', '正確率'),
      heroStat(fmtInt(stats.recent7), ' 次', '近七日')
    ].join('');

    renderTasks();
    renderThemes();
    $$('#level-filter button').forEach(button => {
      button.classList.toggle('is-active', Number(button.dataset.level) === state.levelFilter);
    });
  }

  function renderTasks() {
    if (!state.tasks.length) {
      els.taskGrid.innerHTML = '<div class="empty"><strong>還沒有任務</strong>管理員還沒有布置任務。先用下面的自由練習熱熱身吧。</div>';
      return;
    }
    els.taskGrid.innerHTML = state.tasks.map(task => {
      const themes = (task.target_nodes || []).map(nodeTitle).join('、') || '自選單詞';
      const level = task.level ? ' · L' + task.level : '';
      const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
      const done = !!task.todayDone;
      const started = Number(task.attempted) > 0;
      const badge = done ? '今日完成' : started ? '進行中' : '新任務';
      const action = task.mastered >= task.total ? '複習' : started ? '繼續' : '開始';
      return '<article class="task-card' + (done ? ' is-done' : '') + '">' +
        '<div class="task-card-head">' +
          '<h3>' + esc(task.task_name) + '</h3>' +
          '<span class="task-badge' + (done ? ' is-done' : '') + '">' + badge + '</span>' +
        '</div>' +
        '<div class="task-meta">' +
          '<span>' + esc(themes) + esc(level) + '</span>' +
          '<span>' + fmtInt(task.total) + ' 詞</span>' +
          '<span>每輪 ' + fmtInt(task.batch_size) + ' 詞</span>' +
        '</div>' +
        '<div class="task-progress">' +
          '<div class="progress-line"><span>已掌握 <strong>' + fmtInt(task.mastered) + '</strong> / ' + fmtInt(task.total) + '</span><span>' + fmtPct(progress) + '%</span></div>' +
          '<span class="progress-track"><span style="width:' + progress + '%"></span></span>' +
        '</div>' +
        '<div class="task-actions">' +
          '<span class="task-foot-note">' + (task.lastPracticed ? '上次 ' + esc(dateText(task.lastPracticed)) : '還沒開始') + '</span>' +
          '<button type="button" class="btn btn-primary" data-start-task="' + esc(task.task_id) + '">' + action + ' →</button>' +
        '</div>' +
        '</article>';
    }).join('');
  }

  function renderThemes() {
    if (!state.nodes.length) {
      els.themeGrid.innerHTML = '<div class="empty"><strong>詞庫還沒載入</strong>請重新整理頁面。</div>';
      return;
    }
    els.themeGrid.innerHTML = state.nodes.map(node => {
      const mastery = Math.max(0, Math.min(100, Number(node.mastery) || 0));
      return '<button type="button" class="theme-card' + (node.node_id === 'core' ? ' is-core' : '') + '" data-theme-start="' + esc(node.node_id) + '">' +
        '<h3>' + esc(node.title) + '</h3>' +
        '<p>' + fmtInt(node.questionCount) + ' 個詞 · 已掌握 ' + fmtInt(node.masteredCount) + '</p>' +
        '<div class="theme-ring"><strong>' + fmtPct(mastery) + '%</strong><span class="mini-track"><span style="width:' + mastery + '%"></span></span></div>' +
        '</button>';
    }).join('');
  }

  /* ===== Round ===== */
  function startRoundSession(payload, meta) {
    const words = Array.isArray(payload.words) ? payload.words.slice() : [];
    if (!words.length) {
      toast('這個範圍暫時沒有可練習的單詞');
      return;
    }
    state.lastRound = null;
    state.round = {
      taskId: meta.taskId || null,
      taskName: meta.taskName || '自由練習',
      task: payload.task || null,
      practice: meta.practice || null,
      queue: words,
      index: 0,
      total: words.length,
      correctAttempts: 0,
      wrongAttemptsTotal: 0,
      mastered: 0,
      combo: 0,
      startedAt: Date.now(),
      wrongWords: [],
      current: null,
      slots: [],
      tray: [],
      wrongAttempts: 0,
      wordShownAt: 0,
      answered: false,
      revealed: false,
      hint: '',
      lastResult: null,
      taskProgress: null
    };
    state.view = 'round';
    loadCurrentWord();
    renderAll();
  }

  function loadCurrentWord() {
    const round = state.round;
    if (!round) return;
    const word = round.queue[round.index];
    if (!word) return;
    round.current = word;
    round.slots = new Array(word.count).fill(null);
    round.tray = (word.blocks || []).slice();
    round.wrongAttempts = 0;
    round.answered = false;
    round.revealed = false;
    round.hint = '';
    round.lastResult = null;
    round.wordShownAt = Date.now();
    renderRound();
    if (state.hasInteracted && state.sound) {
      window.setTimeout(() => {
        if (state.round && state.round.current && state.round.current.id === word.id && !state.round.answered) {
          speakCurrent();
        }
      }, 550);
    }
  }

  function renderRound() {
    const round = state.round;
    if (!round || !round.current) return;
    const word = round.current;
    els.wordTheme.textContent = word.themeLabel || nodeTitle(word.theme);
    els.wordLevel.textContent = 'L' + word.level;
    els.wordMeaning.textContent = word.meaning;
    els.wordPos.textContent = word.posLabel || '';
    els.wordIpa.textContent = word.ipa || '';

    els.slotRow.innerHTML = round.slots.map((slot, index) => {
      if (slot) {
        return '<div class="slot is-filled" data-slot="' + index + '">' + blockHTML(slot, true) + '</div>';
      }
      return '<div class="slot" data-slot="' + index + '" data-index="' + (index + 1) + '"></div>';
    }).join('');

    els.tray.innerHTML = round.tray.map(block => blockHTML(block, false)).join('');
    els.tray.classList.toggle('is-empty', round.tray.length === 0);

    const filled = round.slots.every(Boolean);
    els.checkAnswer.disabled = !filled || round.answered;
    els.revealAnswer.hidden = !(round.wrongAttempts >= 2 && !round.answered);
    els.shuffleBlocks.disabled = round.answered;

    els.roundProgressText.textContent = (round.index + 1) + ' / ' + round.total;
    const pct = round.total ? (round.index / round.total) * 100 : 0;
    els.roundProgressBar.style.width = Math.min(100, pct) + '%';
    els.comboPill.hidden = !(round.combo > 1);
    els.comboPill.textContent = '連對 ' + round.combo;

    if (round.hint) {
      els.roundHint.hidden = false;
      els.roundHint.textContent = round.hint;
      els.roundHint.classList.toggle('is-good', !!round.lastResult && round.lastResult.correct);
    } else {
      els.roundHint.hidden = true;
      els.roundHint.textContent = '';
    }
  }

  function blockHTML(block, placed) {
    return '<button type="button" class="block' + (placed ? ' is-placed' : '') + '" draggable="true" data-block="' + esc(block.id) + '">' + esc(block.text) + '</button>';
  }

  function findTrayBlock(id) {
    const round = state.round;
    return round ? round.tray.find(block => block.id === id) || null : null;
  }

  function findSlotBlock(id) {
    const round = state.round;
    if (!round) return -1;
    return round.slots.findIndex(block => block && block.id === id);
  }

  function placeBlock(id, slotIndex) {
    const round = state.round;
    if (!round || round.answered) return;
    const fromSlot = findSlotBlock(id);
    let target = Number.isFinite(slotIndex) ? slotIndex : -1;
    if (target < 0 || target >= round.slots.length) {
      target = round.slots.findIndex(block => !block);
    }
    if (target < 0) return;

    if (fromSlot >= 0) {
      if (fromSlot === target) return;
      const other = round.slots[target];
      round.slots[target] = round.slots[fromSlot];
      round.slots[fromSlot] = other || null;
      renderRound();
      return;
    }

    const block = round.tray.find(item => item.id === id);
    if (!block) return;
    if (round.slots[target]) {
      round.tray.push(round.slots[target]);
    }
    round.tray = round.tray.filter(item => item.id !== id);
    round.slots[target] = block;
    speakSyllable(block.text);
    renderRound();
  }

  function removeBlock(id) {
    const round = state.round;
    if (!round || round.answered) return;
    const index = findSlotBlock(id);
    if (index < 0) return;
    const block = round.slots[index];
    round.slots[index] = null;
    round.tray.push(block);
    renderRound();
  }

  function shuffleTray() {
    const round = state.round;
    if (!round || round.answered) return;
    for (let i = round.tray.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = round.tray[i];
      round.tray[i] = round.tray[j];
      round.tray[j] = temp;
    }
    renderRound();
  }

  async function checkAnswer() {
    const round = state.round;
    if (!round || round.answered || state.busy) return;
    if (round.slots.some(block => !block)) return;
    state.busy = true;
    els.checkAnswer.disabled = true;
    const order = round.slots.map(block => block.id);
    const responseTime = Date.now() - round.wordShownAt;
    try {
      const result = await api('/answer', {
        method: 'POST',
        body: {
          taskId: round.taskId,
          wordId: round.current.id,
          order,
          responseTime
        }
      });
      if (result.correct) {
        round.correctAttempts += 1;
        round.combo += 1;
        round.answered = true;
        round.lastResult = result;
        round.mastered += result.becameMastered ? 1 : 0;
        if (result.taskProgress) round.taskProgress = result.taskProgress;
        renderRound();
        speak(result.word && result.word.word ? result.word.word : round.current.say);
        showWordCard(result.word, false, result);
      } else {
        round.wrongAttempts += 1;
        round.wrongAttemptsTotal += 1;
        round.combo = 0;
        round.wrongWords.push({
          word: {
            id: round.current.id,
            word: round.current.say,
            meaning: round.current.meaning
          },
          count: 1
        });
        round.hint = round.wrongAttempts >= 2
          ? '順序還是不對。可以按「顯示答案」看看，也可以繼續試。'
          : '順序不對，再想想哪個音節先讀。';
        shakeStage();
        renderRound();
        speak(round.current.say);
      }
    } catch (error) {
      toast(error.message || '送出答案失敗');
    } finally {
      state.busy = false;
      if (state.round) renderRound();
    }
  }

  async function revealAnswer() {
    const round = state.round;
    if (!round || round.answered || state.busy) return;
    state.busy = true;
    try {
      const result = await api('/answer', {
        method: 'POST',
        body: {
          taskId: round.taskId,
          wordId: round.current.id,
          reveal: true,
          order: round.slots.map(block => block && block.id).filter(Boolean),
          responseTime: Date.now() - round.wordShownAt
        }
      });
      round.answered = true;
      round.revealed = true;
      round.combo = 0;
      round.wrongAttempts += 1;
      round.wrongAttemptsTotal += 1;
      round.lastResult = result;
      round.wrongWords.push({ word: result.word, count: 1 });
      if (result.taskProgress) round.taskProgress = result.taskProgress;
      renderRound();
      showWordCard(result.word, true, result);
    } catch (error) {
      toast(error.message || '顯示答案失敗');
    } finally {
      state.busy = false;
    }
  }

  function shakeStage() {
    const stage = $('.word-stage');
    if (!stage) return;
    stage.classList.remove('is-shaking');
    window.requestAnimationFrame(() => stage.classList.add('is-shaking'));
    window.setTimeout(() => stage.classList.remove('is-shaking'), 420);
  }

  function showWordCard(word, revealed, result) {
    if (!word) return;
    const round = state.round;
    els.wordCard.classList.toggle('is-revealed', !!revealed);
    els.cardRibbon.textContent = revealed ? '看答案' : '拼對了';
    els.cardEyebrow.textContent = revealed ? 'Answer Revealed' : 'Syllable Complete';
    els.cardWord.textContent = word.word;
    els.cardSyllables.innerHTML = (word.syllables || []).map(piece => '<span class="card-syllable">' + esc(piece) + '</span>').join('');
    els.cardPos.textContent = word.posLabel || '';
    els.cardMeaning.textContent = word.meaning || '';
    els.cardIpa.textContent = word.ipa || '';
    els.cardForms.innerHTML = (word.forms || []).map(form => '<span class="form-chip"><span>' + esc(form.label) + '</span>' + esc(form.word) + '</span>').join('');
    if (word.example && word.example.en) {
      els.cardExample.innerHTML = '<p class="en">' + esc(word.example.en) + '</p>' +
        (word.example.zh ? '<p class="zh">' + esc(word.example.zh) + '</p>' : '');
    } else {
      els.cardExample.innerHTML = '';
    }
    if (revealed) {
      els.cardMastery.textContent = '先看答案，下一次再自己拼。';
    } else if (result && result.becameMastered) {
      els.cardMastery.textContent = '已掌握！連續兩次拼對。';
    } else if (result && result.boxLevel === 3) {
      els.cardMastery.textContent = '已掌握，繼續保持。';
    } else {
      els.cardMastery.textContent = '拼對了！再拼對一次就會掌握。';
    }
    const isLast = round && round.index + 1 >= round.queue.length;
    els.cardNext.textContent = isLast ? '完成這一輪 →' : '下一個 →';
    els.wordCardBackdrop.hidden = false;
    els.cardNext.focus({ preventScroll: true });
  }

  function hideWordCard() {
    els.wordCardBackdrop.hidden = true;
  }

  function nextWord() {
    const round = state.round;
    if (!round) return;
    hideWordCard();
    if (round.index + 1 >= round.queue.length) {
      finishRound();
      return;
    }
    round.index += 1;
    loadCurrentWord();
    renderRound();
  }

  function finishRound() {
    const round = state.round;
    if (!round) return;
    const wrongMap = new Map();
    round.wrongWords.forEach(item => {
      if (!item.word) return;
      const key = item.word.id || item.word.word;
      const current = wrongMap.get(key);
      if (current) current.count += item.count || 1;
      else wrongMap.set(key, { word: item.word, count: item.count || 1 });
    });
    const attempts = round.correctAttempts + round.wrongAttemptsTotal;
    state.lastRound = round;
    state.summary = {
      title: round.taskId ? '任務完成了' : '這一輪完成了',
      sub: round.taskName,
      total: round.total,
      correct: round.correctAttempts,
      wrong: round.wrongAttemptsTotal,
      accuracy: attempts ? (round.correctAttempts / attempts) * 100 : 0,
      mastered: round.mastered,
      taskProgress: round.taskProgress,
      wrongWords: Array.from(wrongMap.values()),
      mode: round.practice ? 'practice' : 'task',
      taskId: round.taskId,
      practice: round.practice
    };
    state.round = null;
    state.view = 'summary';
    renderAll();
    refreshOverview();
  }

  function renderSummary() {
    const summary = state.summary;
    if (!summary) return;
    els.summaryTitle.textContent = summary.title;
    els.summarySub.textContent = summary.sub ? '任務：' + summary.sub : '';
    els.summaryStats.innerHTML = [
      ['完成', summary.total, '詞'],
      ['拼對', summary.correct, '次'],
      ['正確率', fmtPct(summary.accuracy), '%'],
      ['新掌握', summary.mastered, '詞']
    ].map(item => '<div class="summary-stat"><strong>' + esc(item[1]) + '</strong><span>' + esc(item[0]) + (item[2] ? ' · ' + esc(item[2]) : '') + '</span></div>').join('');

    if (summary.taskProgress) {
      const progress = Math.max(0, Math.min(100, Number(summary.taskProgress.progress) || 0));
      els.summaryProgress.innerHTML = '<div class="progress-line"><span>任務掌握 <strong>' + fmtInt(summary.taskProgress.mastered) + '</strong> / ' + fmtInt(summary.taskProgress.total) + '</span><span>' + fmtPct(progress) + '%</span></div>' +
        '<span class="progress-track is-honey"><span style="width:' + progress + '%"></span></span>';
    } else {
      els.summaryProgress.innerHTML = '<p class="task-foot-note">自由練習不計入任務進度。已掌握 ' + fmtInt(summary.mastered) + ' 個詞。</p>';
    }

    if (summary.wrongWords.length) {
      els.summaryWrong.innerHTML = '<h3>這一輪需要再看一眼</h3>' + summary.wrongWords.map(item =>
        '<span class="wrong-chip"><strong>' + esc(item.word.word) + '</strong><span>' + esc(item.word.meaning) + '</span><em>×' + fmtInt(item.count) + '</em></span>'
      ).join('');
    } else {
      els.summaryWrong.innerHTML = '<h3>這一輪沒有錯詞</h3><p class="task-foot-note">全部拼對，很不錯。</p>';
    }
  }

  /* ===== Round lifecycle ===== */
  async function startTask(taskId) {
    if (state.busy) return;
    state.busy = true;
    try {
      const payload = await api('/tasks/' + encodeURIComponent(taskId) + '/start', { method: 'POST' });
      startRoundSession(payload, {
        taskId,
        taskName: payload.task ? payload.task.task_name : '任務'
      });
    } catch (error) {
      toast(error.message || '無法開始任務');
    } finally {
      state.busy = false;
    }
  }

  async function startPractice(theme) {
    if (state.busy) return;
    state.busy = true;
    try {
      const payload = await api('/practice/start', {
        method: 'POST',
        body: {
          theme,
          level: state.levelFilter,
          count: 10
        }
      });
      startRoundSession(payload, {
        taskId: null,
        taskName: '自由練習',
        practice: { theme, level: state.levelFilter }
      });
    } catch (error) {
      toast(error.message || '無法開始自由練習');
    } finally {
      state.busy = false;
    }
  }

  function quitRound() {
    if (state.round && (state.round.correctAttempts > 0 || state.round.wrongAttemptsTotal > 0)) {
      if (!window.confirm('離開這一輪？已作答的進度會保留。')) return;
    }
    state.round = null;
    state.view = 'hall';
    hideWordCard();
    renderAll();
    refreshOverview();
  }

  /* ===== Parent ===== */
  function renderParent() {
    if (!isAdmin()) {
      setMode('child');
      return;
    }
    renderParentStats();
    renderThemeTree();
    $$('[data-parent-tab]').forEach(button => {
      const active = button.dataset.parentTab === state.parentTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    els.parentTasks.hidden = state.parentTab !== 'tasks';
    els.parentAnalytics.hidden = state.parentTab !== 'stats';
    els.parentBank.hidden = state.parentTab !== 'bank';
    if (state.parentTab === 'tasks') renderAdminTasks();
    if (state.parentTab === 'stats') {
      if (!state.adminStats && !state.adminStatsLoading) loadAdminStats();
      renderAdminStats();
    }
    if (state.parentTab === 'bank') {
      if (!state.bank.loaded && !state.bank.loading) loadBank();
      renderBank();
    }
  }

  function renderParentStats() {
    const nodes = state.nodes;
    const mastered = nodes.reduce((sum, node) => sum + (Number(node.masteredCount) || 0), 0);
    const questions = nodes.reduce((sum, node) => sum + (Number(node.questionCount) || 0), 0);
    els.parentStats.innerHTML = [
      ['任務', state.adminTasks.length],
      ['用戶', state.adminUsers.length],
      ['單詞', questions || (state.overview ? state.overview.wordCount : 0)],
      ['已掌握', mastered]
    ].map(item => '<div class="parent-stat"><strong>' + fmtInt(item[1]) + '</strong><span>' + esc(item[0]) + '</span></div>').join('');
  }

  function renderThemeTree() {
    const all = '<button type="button" class="tree-node' + (!state.bank.theme ? ' is-active' : '') + '" data-tree-theme=""><span>全部主題</span><em>' + fmtInt(state.nodes.reduce((sum, node) => sum + (Number(node.questionCount) || 0), 0)) + '</em></button>';
    els.treeCount.textContent = state.nodes.length + ' 個';
    els.themeTree.innerHTML = all + state.nodes.map(node => {
      const active = state.bank.theme === node.node_id ? ' is-active' : '';
      return '<button type="button" class="tree-node' + active + '" data-tree-theme="' + esc(node.node_id) + '"><span>' + esc(node.title) + '</span><em>' + fmtInt(node.masteredCount) + '/' + fmtInt(node.questionCount) + '</em></button>';
    }).join('');
  }

  function renderAdminTasks() {
    const form = state.adminForm;
    const themeBoxes = state.nodes.map(node => {
      const checked = form.themes.has(node.node_id) ? ' checked' : '';
      return '<label><input type="checkbox" data-admin-theme value="' + esc(node.node_id) + '"' + checked + '> ' + esc(node.title) + ' <em>(' + fmtInt(node.questionCount) + ')</em></label>';
    }).join('');
    const userBoxes = state.adminUsers.map(user => {
      const checked = form.users.has(String(user.id)) ? ' checked' : '';
      return '<label><input type="checkbox" data-admin-user value="' + esc(user.id) + '"' + checked + '> ' + esc(user.nickname || user.username) + ' <em>@' + esc(user.username) + '</em></label>';
    }).join('');
    const taskList = state.adminTasks.length
      ? state.adminTasks.map(task => {
        const themes = (task.target_nodes || []).map(nodeTitle).join('、') || '指定單詞';
        const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
        return '<div class="admin-task-row' + (task.is_archived ? ' is-archived' : '') + '">' +
          '<div>' +
            '<h4>' + esc(task.task_name) + (task.is_archived ? ' <span class="task-badge">已歸檔</span>' : '') + '</h4>' +
            '<p>' + esc(task.username || '') + ' · ' + esc(themes) + (task.level ? ' · L' + task.level : '') + ' · ' + fmtInt(task.total) + ' 詞 · 每輪 ' + fmtInt(task.batch_size) + '</p>' +
          '</div>' +
          '<div class="task-progress">' +
            '<div class="progress-line"><span>掌握 <strong>' + fmtInt(task.mastered) + '</strong>/' + fmtInt(task.total) + '</span><span>' + fmtPct(progress) + '%</span></div>' +
            '<span class="progress-track"><span style="width:' + progress + '%"></span></span>' +
            '<p class="task-foot-note">正確率 ' + fmtPct(task.answerAccuracy) + '% · 上次 ' + esc(dateText(task.lastPracticed)) + '</p>' +
          '</div>' +
          '<div class="admin-task-actions">' +
            (task.is_archived
              ? '<button type="button" class="mini-btn" data-admin-archive="' + esc(task.task_id) + '" data-next="0">取消歸檔</button>'
              : '<button type="button" class="mini-btn" data-admin-archive="' + esc(task.task_id) + '" data-next="1">歸檔</button>') +
            '<button type="button" class="mini-btn" data-admin-wrong="' + esc(task.task_id) + '">錯詞</button>' +
            '<button type="button" class="mini-btn is-danger" data-admin-delete="' + esc(task.task_id) + '">刪除</button>' +
          '</div>' +
          '</div>';
      }).join('')
      : '<div class="empty"><strong>還沒有任務</strong>用上面的表單建立第一個任務，指派給小朋友。</div>';

    els.parentTasks.innerHTML =
      '<form class="admin-form" id="admin-task-form" novalidate>' +
        '<h3>建立任務</h3>' +
        '<p>選擇主題或等級，系統會按每個人的進度挑選未掌握、且不在一週內剛掌握過的單詞。</p>' +
        '<div class="form-row">' +
          '<label class="field">任務名稱<input type="text" id="admin-task-name" maxlength="40" value="' + esc(form.name) + '" placeholder="例如：動物自然 L2"></label>' +
          '<label class="field">難度<select id="admin-task-level"><option value="0"' + (Number(form.level) === 0 ? ' selected' : '') + '>全部</option><option value="1"' + (Number(form.level) === 1 ? ' selected' : '') + '>Level 1</option><option value="2"' + (Number(form.level) === 2 ? ' selected' : '') + '>Level 2</option><option value="3"' + (Number(form.level) === 3 ? ' selected' : '') + '>Level 3</option></select></label>' +
          '<label class="field">每輪單詞數<input type="number" id="admin-task-batch" min="1" max="30" value="' + esc(form.batchSize) + '"></label>' +
        '</div>' +
        '<div class="checkbox-grid">' + themeBoxes + '</div>' +
        '<div class="inline-options">' +
          '<label><input type="radio" name="admin-assign" value="all" data-admin-assign' + (form.assign === 'all' ? ' checked' : '') + '> 指派給全部用戶</label>' +
          '<label><input type="radio" name="admin-assign" value="selected" data-admin-assign' + (form.assign === 'selected' ? ' checked' : '') + '> 只指派給選中的用戶</label>' +
        '</div>' +
        '<div class="user-picker"' + (form.assign === 'all' ? ' hidden' : '') + ' id="admin-user-picker">' + (userBoxes || '<span class="task-foot-note">還沒有其他用戶</span>') + '</div>' +
        '<div class="admin-actions"><button type="submit" class="btn btn-primary">建立任務</button><span class="task-foot-note">歸檔、刪除會套用到同一批任務的所有用戶。</span></div>' +
      '</form>' +
      '<div class="admin-task-list">' + taskList + '</div>';
  }

  async function loadAdminStats() {
    if (!isAdmin() || state.adminStatsLoading) return;
    state.adminStatsLoading = true;
    if (state.parentTab === 'stats') renderAdminStats();
    try {
      const stats = await api('/admin/stats');
      state.adminStats = stats;
      if (!state.statsUserId && stats.users && stats.users.length) {
        state.statsUserId = stats.users[0].id;
      }
    } catch (error) {
      state.adminStats = { error: error.message || '載入統計失敗', users: [] };
    } finally {
      state.adminStatsLoading = false;
      if (state.mode === 'parent' && state.parentTab === 'stats') renderAdminStats();
    }
  }

  function renderAdminStats() {
    if (state.adminStatsLoading) {
      els.parentAnalytics.innerHTML = '<div class="empty"><strong>正在載入統計</strong>請稍等。</div>';
      return;
    }
    if (!state.adminStats) {
      els.parentAnalytics.innerHTML = '<div class="empty"><strong>還沒有統計</strong>按「學習統計」載入。</div>';
      return;
    }
    if (state.adminStats.error) {
      els.parentAnalytics.innerHTML = '<div class="empty"><strong>載入失敗</strong>' + esc(state.adminStats.error) + '</div>';
      return;
    }
    const users = state.adminStats.users || [];
    if (!users.length) {
      els.parentAnalytics.innerHTML = '<div class="empty"><strong>還沒有練習紀錄</strong>建立任務並開始練習後，這裡會出現統計。</div>';
      return;
    }
    const current = users.find(user => String(user.id) === String(state.statsUserId)) || users[0];
    state.statsUserId = current.id;
    const options = users.map(user => '<option value="' + esc(user.id) + '"' + (String(user.id) === String(current.id) ? ' selected' : '') + '>' + esc(user.nickname || user.username) + '</option>').join('');
    const nodeRows = (current.nodes || []).map(node => {
      return '<tr><td>' + esc(node.title) + '</td><td>' + fmtInt(node.total) + '</td><td>' + fmtInt(node.attempted) + '</td><td>' + fmtInt(node.mastered) + '</td><td>' + fmtPct(node.accuracy) + '%</td><td>' + fmtPct(node.coverage) + '%</td></tr>';
    }).join('');
    const weakRows = (current.weakQuestions || []).slice(0, 12).map(item => {
      return '<tr><td><strong>' + esc(item.stem) + '</strong></td><td>' + esc(item.node_title || item.node_id) + '</td><td>' + fmtInt(item.total_wrong) + '</td><td>L' + fmtInt(item.box_level) + '</td></tr>';
    }).join('');
    const recentRows = (current.recentAttempts || []).slice(0, 12).map(item => {
      return '<tr><td>' + esc(item.stem) + '</td><td>' + esc(item.node_title || item.node_id) + '</td><td>' + (item.correct ? '✓' : '×') + '</td><td>' + esc(dateText(item.practicedAt)) + '</td></tr>';
    }).join('');
    const stats = current.stats || {};
    els.parentAnalytics.innerHTML =
      '<div class="form-row" style="grid-template-columns:minmax(160px,240px) 1fr;">' +
        '<label class="field">查看用戶<select id="admin-stats-user">' + options + '</select></label>' +
      '</div>' +
      '<div class="parent-stats" style="margin-top:12px;">' +
        '<div class="parent-stat"><strong>' + fmtInt(stats.mastered) + '</strong><span>已掌握詞 · 共 ' + fmtInt(stats.total) + '</span></div>' +
        '<div class="parent-stat"><strong>' + fmtInt(stats.attempted) + '</strong><span>做過詞 · 覆蓋 ' + fmtPct(stats.coverage) + '%</span></div>' +
        '<div class="parent-stat"><strong>' + fmtPct(stats.accuracy) + '%</strong><span>正確率 · ' + fmtInt(stats.totalAttempts) + ' 次作答</span></div>' +
        '<div class="parent-stat"><strong>' + fmtInt(stats.recent7) + '</strong><span>近七日作答</span></div>' +
      '</div>' +
      '<h3 style="margin:18px 0 8px;font-size:14px;">主題掌握</h3>' +
      '<table class="analytics-table"><thead><tr><th>主題</th><th>總數</th><th>做過</th><th>掌握</th><th>正確率</th><th>覆蓋率</th></tr></thead><tbody>' + nodeRows + '</tbody></table>' +
      (weakRows ? '<h3 style="margin:18px 0 8px;font-size:14px;">需要複習的詞</h3><table class="analytics-table"><thead><tr><th>單詞</th><th>主題</th><th>答錯</th><th>Level</th></tr></thead><tbody>' + weakRows + '</tbody></table>' : '') +
      (recentRows ? '<h3 style="margin:18px 0 8px;font-size:14px;">最近作答</h3><table class="analytics-table"><thead><tr><th>單詞</th><th>主題</th><th>結果</th><th>日期</th></tr></thead><tbody>' + recentRows + '</tbody></table>' : '');
  }

  async function loadBank() {
    if (!isAdmin() || state.bank.loading) return;
    state.bank.loading = true;
    if (state.parentTab === 'bank') renderBank();
    try {
      const params = new URLSearchParams();
      if (state.bank.theme) params.set('theme', state.bank.theme);
      if (state.bank.level) params.set('level', String(state.bank.level));
      if (state.bank.q) params.set('q', state.bank.q);
      params.set('offset', String(state.bank.offset));
      params.set('limit', String(state.bank.limit));
      const data = await api('/words?' + params.toString());
      state.bank.total = Number(data.total) || 0;
      state.bank.words = Array.isArray(data.words) ? data.words : [];
      state.bank.offset = Number(data.offset) || 0;
      state.bank.loaded = true;
    } catch (error) {
      state.bank.words = [];
      toast(error.message || '載入詞庫失敗');
    } finally {
      state.bank.loading = false;
      if (state.mode === 'parent' && state.parentTab === 'bank') renderBank();
    }
  }

  function renderBank() {
    if (!isAdmin()) return;
    const themeOptions = '<option value="">全部主題</option>' + state.nodes.map(node =>
      '<option value="' + esc(node.node_id) + '"' + (state.bank.theme === node.node_id ? ' selected' : '') + '>' + esc(node.title) + '</option>'
    ).join('');
    const levelOptions = [0, 1, 2, 3].map(level =>
      '<option value="' + level + '"' + (Number(state.bank.level) === level ? ' selected' : '') + '>' + (level ? 'Level ' + level : '全部難度') + '</option>'
    ).join('');
    const rows = state.bank.words.map(word => {
      const example = word.example && word.example.en ? word.example.en : '—';
      return '<tr><td><strong>' + esc(word.word) + '</strong></td><td>' + esc((word.syllables || []).join('·')) + '</td><td>' + esc(word.meaning) + '</td><td>L' + fmtInt(word.level) + '</td><td>' + esc(example) + '</td></tr>';
    }).join('');
    const start = state.bank.total ? state.bank.offset + 1 : 0;
    const end = Math.min(state.bank.total, state.bank.offset + state.bank.words.length);
    els.parentBank.innerHTML =
      '<form class="bank-toolbar" id="bank-form">' +
        '<label class="field">主題<select id="bank-theme">' + themeOptions + '</select></label>' +
        '<label class="field">難度<select id="bank-level">' + levelOptions + '</select></label>' +
        '<label class="field is-grow">搜尋<input type="search" id="bank-q" value="' + esc(state.bank.q) + '" placeholder="英文、中文或釋義"></label>' +
        '<button type="submit" class="btn btn-soft">查詢</button>' +
      '</form>' +
      (state.bank.loading
        ? '<div class="empty"><strong>正在載入詞庫</strong>請稍等。</div>'
        : rows
          ? '<table class="bank-table"><thead><tr><th>單詞</th><th>音節</th><th>中文</th><th>等級</th><th>例句</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<div class="bank-pager"><span>顯示 ' + start + '–' + end + ' / ' + fmtInt(state.bank.total) + '</span><span><button type="button" class="mini-btn" data-bank-prev' + (state.bank.offset <= 0 ? ' disabled' : '') + '>上一頁</button> <button type="button" class="mini-btn" data-bank-next' + (end >= state.bank.total ? ' disabled' : '') + '>下一頁</button></span></div>'
          : '<div class="empty"><strong>沒有符合的單詞</strong>換個主題、難度或關鍵字試試。</div>');
  }

  function setMode(mode) {
    if (mode === 'parent' && !isAdmin()) {
      toast('只有管理員可以進入管理設定');
      return;
    }
    state.mode = mode;
    $$('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (mode === 'parent') {
      state.adminStats = null;
      loadAdminData().then(() => {
        if (state.mode === 'parent') renderAll();
      });
    }
    renderAll();
  }

  /* ===== Events ===== */
  document.addEventListener('pointerdown', () => { state.hasInteracted = true; }, { once: true });

  document.addEventListener('click', event => {
    const target = event.target.closest('button, [data-mode]');
    if (!target) return;

    if (target.matches('[data-mode]')) {
      setMode(target.dataset.mode);
      return;
    }

    if (target.id === 'sound-btn') {
      state.sound = !state.sound;
      if (!state.sound && 'speechSynthesis' in window) window.speechSynthesis.cancel();
      renderAll();
      return;
    }

    if (target.id === 'hall-parent-btn') {
      setMode('parent');
      return;
    }

    if (target.id === 'parent-child-btn') {
      setMode('child');
      return;
    }

    if (target.matches('[data-level]')) {
      state.levelFilter = Number(target.dataset.level) || 0;
      $$('#level-filter button').forEach(button => button.classList.toggle('is-active', button === target));
      return;
    }

    if (target.matches('[data-theme-start]')) {
      startPractice(target.dataset.themeStart);
      return;
    }

    if (target.matches('[data-start-task]')) {
      startTask(target.dataset.startTask);
      return;
    }

    if (target.id === 'play-word') {
      speakCurrent();
      return;
    }

    if (target.id === 'shuffle-blocks') {
      shuffleTray();
      return;
    }

    if (target.id === 'check-answer') {
      checkAnswer();
      return;
    }

    if (target.id === 'reveal-answer') {
      revealAnswer();
      return;
    }

    if (target.id === 'quit-round') {
      quitRound();
      return;
    }

    if (target.id === 'card-sound') {
      const word = state.round && state.round.lastResult && state.round.lastResult.word;
      if (word) speak(word.word, 0.86);
      return;
    }

    if (target.id === 'card-next') {
      nextWord();
      return;
    }

    if (target.id === 'summary-again') {
      const summary = state.summary;
      if (!summary) return;
      if (summary.mode === 'task' && summary.taskId) startTask(summary.taskId);
      else if (summary.practice) startPractice(summary.practice.theme);
      return;
    }

    if (target.id === 'summary-back') {
      state.view = 'hall';
      state.summary = null;
      renderAll();
      refreshOverview();
      return;
    }

    if (target.matches('[data-parent-tab]')) {
      state.parentTab = target.dataset.parentTab;
      renderParent();
      return;
    }

    if (target.matches('[data-tree-theme]')) {
      state.bank.theme = target.dataset.treeTheme || '';
      state.bank.offset = 0;
      state.parentTab = 'bank';
      state.bank.loaded = false;
      renderParent();
      loadBank();
      return;
    }

    if (target.matches('[data-admin-archive]')) {
      archiveTask(target.dataset.adminArchive, target.dataset.next === '1');
      return;
    }

    if (target.matches('[data-admin-delete]')) {
      deleteTask(target.dataset.adminDelete);
      return;
    }

    if (target.matches('[data-admin-wrong]')) {
      showWrongWords(target.dataset.adminWrong);
      return;
    }

    if (target.matches('[data-bank-prev]')) {
      state.bank.offset = Math.max(0, state.bank.offset - state.bank.limit);
      state.bank.loaded = false;
      loadBank();
      return;
    }

    if (target.matches('[data-bank-next]')) {
      state.bank.offset += state.bank.limit;
      state.bank.loaded = false;
      loadBank();
      return;
    }
  });

  document.addEventListener('click', event => {
    const block = event.target.closest('.block');
    if (block && state.round && !state.round.answered) {
      const inSlot = block.closest('.slot');
      if (inSlot) removeBlock(block.dataset.block);
      else placeBlock(block.dataset.block);
    }
  });

  document.addEventListener('dragstart', event => {
    const block = event.target.closest('.block');
    if (!block || !state.round || state.round.answered) {
      if (block) event.preventDefault();
      return;
    }
    event.dataTransfer.setData('text/plain', block.dataset.block);
    event.dataTransfer.effectAllowed = 'move';
    block.classList.add('is-dragging');
  });

  document.addEventListener('dragend', event => {
    const block = event.target.closest('.block');
    if (block) block.classList.remove('is-dragging');
    $$('.slot.is-target').forEach(slot => slot.classList.remove('is-target'));
  });

  document.addEventListener('dragover', event => {
    const slot = event.target.closest('.slot');
    if (slot && state.round && !state.round.answered) {
      event.preventDefault();
      slot.classList.add('is-target');
    }
  });

  document.addEventListener('dragleave', event => {
    const slot = event.target.closest('.slot');
    if (slot) slot.classList.remove('is-target');
  });

  document.addEventListener('drop', event => {
    if (!state.round || state.round.answered) return;
    const slot = event.target.closest('.slot');
    const tray = event.target.closest('#tray');
    if (slot) {
      event.preventDefault();
      slot.classList.remove('is-target');
      const id = event.dataTransfer.getData('text/plain');
      if (id) placeBlock(id, Number(slot.dataset.slot));
      return;
    }
    if (tray) {
      event.preventDefault();
      const id = event.dataTransfer.getData('text/plain');
      if (id) removeBlock(id);
    }
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (target.matches('[data-admin-theme]')) {
      if (target.checked) state.adminForm.themes.add(target.value);
      else state.adminForm.themes.delete(target.value);
      return;
    }
    if (target.matches('[data-admin-user]')) {
      const id = String(target.value);
      if (target.checked) state.adminForm.users.add(id);
      else state.adminForm.users.delete(id);
      return;
    }
    if (target.matches('[data-admin-assign]')) {
      state.adminForm.assign = target.value;
      const picker = $('#admin-user-picker');
      if (picker) picker.hidden = target.value === 'all';
      return;
    }
    if (target.id === 'admin-task-level') {
      state.adminForm.level = Number(target.value) || 0;
      return;
    }
    if (target.id === 'admin-task-batch') {
      state.adminForm.batchSize = Math.max(1, Math.min(30, Number(target.value) || 8));
      return;
    }
    if (target.id === 'admin-stats-user') {
      state.statsUserId = target.value;
      renderAdminStats();
      return;
    }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'admin-task-name') {
      state.adminForm.name = event.target.value;
    }
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'admin-task-form') {
      event.preventDefault();
      submitAdminTask(event.target);
      return;
    }
    if (event.target.id === 'bank-form') {
      event.preventDefault();
      state.bank.theme = $('#bank-theme') ? $('#bank-theme').value : '';
      state.bank.level = $('#bank-level') ? Number($('#bank-level').value) || 0 : 0;
      state.bank.q = $('#bank-q') ? $('#bank-q').value.trim() : '';
      state.bank.offset = 0;
      state.bank.loaded = false;
      loadBank();
    }
  });

  async function submitAdminTask(form) {
    if (state.busy) return;
    const name = ($('#admin-task-name') && $('#admin-task-name').value || '').trim();
    const themes = $$('[data-admin-theme]:checked').map(input => input.value);
    const level = Number($('#admin-task-level') ? $('#admin-task-level').value : 0) || 0;
    const batchSize = Number($('#admin-task-batch') ? $('#admin-task-batch').value : 8) || 8;
    const assign = ($('[data-admin-assign]:checked') && $('[data-admin-assign]:checked').value) || 'all';
    const users = assign === 'all' ? [] : $$('[data-admin-user]:checked').map(input => input.value);
    if (!name) {
      toast('請填寫任務名稱');
      return;
    }
    if (!themes.length && !level) {
      toast('請至少選擇一個主題或難度');
      return;
    }
    if (assign === 'selected' && !users.length) {
      toast('請至少選擇一個用戶');
      return;
    }
    state.busy = true;
    try {
      const result = await api('/tasks', {
        method: 'POST',
        body: {
          task_name: name,
          target_nodes: themes,
          level,
          batch_size: batchSize,
          pass_streak: 2,
          userIds: users
        }
      });
      const skipped = Array.isArray(result.skipped) ? result.skipped.length : 0;
      toast('已建立 ' + fmtInt(result.created) + ' 個任務' + (skipped ? '，' + skipped + ' 個用戶沒有可用單詞' : ''));
      state.adminForm.name = '';
      state.adminForm.themes.clear();
      state.adminForm.users.clear();
      await Promise.all([loadAdminData(), loadOverview()]);
      renderParent();
    } catch (error) {
      toast(error.message || '建立任務失敗');
    } finally {
      state.busy = false;
    }
  }

  async function archiveTask(taskId, archived) {
    if (!taskId) return;
    if (!window.confirm(archived ? '歸檔這批任務？' : '取消歸檔這批任務？')) return;
    try {
      await api('/tasks/' + encodeURIComponent(taskId), {
        method: 'PUT',
        body: { is_archived: archived }
      });
      await Promise.all([loadAdminData(), loadOverview()]);
      renderParent();
      toast(archived ? '已歸檔' : '已取消歸檔');
    } catch (error) {
      toast(error.message || '更新任務失敗');
    }
  }

  async function deleteTask(taskId) {
    if (!taskId) return;
    if (!window.confirm('刪除這批任務？相關的作答與掌握記錄會一併清除，這個動作不能復原。')) return;
    try {
      await api('/tasks/' + encodeURIComponent(taskId), { method: 'DELETE' });
      await Promise.all([loadAdminData(), loadOverview()]);
      renderParent();
      toast('已刪除任務');
    } catch (error) {
      toast(error.message || '刪除任務失敗');
    }
  }

  async function showWrongWords(taskId) {
    try {
      const list = await api('/tasks/' + encodeURIComponent(taskId) + '/wrong');
      const items = Array.isArray(list) ? list : [];
      const backdrop = document.createElement('div');
      backdrop.className = 'word-card-backdrop';
      backdrop.innerHTML = '<article class="word-card" role="dialog" aria-modal="true">' +
        '<div class="card-ribbon">錯詞複習</div>' +
        '<h2 style="margin:0 0 4px;font-size:24px;">需要再看的詞</h2>' +
        '<p class="task-foot-note" style="margin:0 0 16px;">共 ' + items.length + ' 個詞；按答錯次數排序。</p>' +
        (items.length
          ? '<div>' + items.map(item => '<span class="wrong-chip"><strong>' + esc(item.word) + '</strong><span>' + esc(item.meaning) + '</span><em>×' + fmtInt(item.total_wrong) + '</em></span>').join('') + '</div>'
          : '<div class="empty"><strong>沒有未掌握的錯詞</strong>這批任務看起來很穩。</div>') +
        '<div class="card-foot" style="justify-content:flex-end;"><button type="button" class="btn btn-primary" data-close-modal>關閉</button></div>' +
        '</article>';
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop || event.target.closest('[data-close-modal]')) backdrop.remove();
      });
    } catch (error) {
      toast(error.message || '載入錯詞失敗');
    }
  }

  boot();
})();
