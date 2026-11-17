(function () {
  'use strict';

  const CONFIG = window.QUIZ_CONFIG || {};
  const API_BASE = CONFIG.apiBase || '/api/quiz';

  const state = {
    user: null,
    overview: null,
    nodes: [],
    tasks: [],
    domains: [],
    mode: 'child',
    view: 'hall',
    count: 10,
    round: null,
    tiles: [],
    order: [],
    answerText: '',
    answer: null,
    summary: null,
    lastStart: null,
    questionShownAt: 0,
    busy: false,
    adminUsers: [],
    adminTasks: [],
    adminStats: null,
    adminStatsLoading: false,
    parentTab: 'tasks',
    treeNode: '',
    adminForm: {
      name: '',
      nodes: new Set(),
      batchSize: 10,
      passStreak: 3,
      assign: 'all',
      users: new Set()
    },
    bank: {
      loaded: false,
      loading: false,
      domain: '',
      nodeId: '',
      q: '',
      offset: 0,
      limit: 50,
      total: 0,
      questions: []
    }
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
    helloName: $('#hello-name'),
    heroStats: $('#hero-stats'),
    taskGrid: $('#task-grid'),
    domainGrid: $('#domain-grid'),
    nodeGroups: $('#node-groups'),
    countFilter: $('#count-filter'),
    practiceAll: $('#practice-all'),
    hallParentBtn: $('#hall-parent-btn'),
    parentChildBtn: $('#parent-child-btn'),
    parentStats: $('#parent-stats'),
    parentTree: $('#parent-tree'),
    treeCount: $('#tree-count'),
    parentTasks: $('#parent-tasks'),
    parentAnalytics: $('#parent-analytics'),
    parentBank: $('#parent-bank'),
    roundProgressText: $('#round-progress-text'),
    roundProgressBar: $('#round-progress-bar'),
    comboPill: $('#combo-pill'),
    qDomain: $('#q-domain'),
    qNode: $('#q-node'),
    qLevel: $('#q-level'),
    qRetry: $('#q-retry'),
    qPrompt: $('#q-prompt'),
    qInstruction: $('#q-instruction'),
    orderArea: $('#order-area'),
    answerSlots: $('#answer-slots'),
    tileBank: $('#tile-bank'),
    clearOrder: $('#clear-order'),
    shuffleOrder: $('#shuffle-order'),
    checkOrder: $('#check-order'),
    inputArea: $('#input-area'),
    mathExpression: $('#math-expression'),
    mathInput: $('#math-input'),
    keypad: $('#keypad'),
    checkInput: $('#check-input'),
    choiceArea: $('#choice-area'),
    choiceOptions: $('#choice-options'),
    feedback: $('#feedback'),
    feedbackIcon: $('#feedback-icon'),
    feedbackTitle: $('#feedback-title'),
    feedbackAnswer: $('#feedback-answer'),
    feedbackExplain: $('#feedback-explain'),
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

  const dock = document.createElement('div');
  dock.id = 'answer-dock';
  dock.className = 'answer-dock';
  dock.hidden = true;
  dock.innerHTML =
    '<span class="answer-dock-icon" id="dock-icon">✓</span>' +
    '<div class="answer-dock-copy" role="status" aria-live="polite"><strong id="dock-title">答對了</strong><span id="dock-mastery"></span></div>' +
    '<button type="button" class="btn btn-primary" id="dock-next">下一題 →</button>';
  els.roundView.appendChild(dock);
  els.dock = dock;
  els.dockIcon = $('#dock-icon');
  els.dockTitle = $('#dock-title');
  els.dockMastery = $('#dock-mastery');
  els.dockNext = $('#dock-next');

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

  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 3200);
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
    return request(API_BASE + path, options);
  }

  function isAdmin() {
    return state.user && state.user.role === 'admin';
  }

  function nodeById(id) {
    return state.nodes.find(node => node.node_id === id) || null;
  }

  function nodeTitle(id) {
    const node = nodeById(id);
    return node ? node.title : id;
  }

  function domainInfo(id) {
    return state.domains.find(domain => domain.id === id) || { id, title: id, short: id, count: 0 };
  }

  function domainForNode(nodeId) {
    const node = nodeById(nodeId);
    return node ? domainInfo(node.domain) : null;
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

  function domainDescription(id) {
    if (CONFIG.domainDescription) return CONFIG.domainDescription;
    if (id === 'sentence') return '把詞語卡排成通順句子，練四素句、特殊句式與各種複句。';
    if (id === 'math') return '加、減、乘、除四則運算，輸入答案即時核對。';
    if (id === 'gk') return '香港、社會、歷史、世界、科學、環境與健康，一題一題累積常識。';
    return '';
  }

  function domainMark(id) {
    if (CONFIG.domainMark) return CONFIG.domainMark;
    if (id === 'sentence') return '句';
    if (id === 'math') return '算';
    if (id === 'gk') return '識';
    return '知';
  }

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

  async function loadOverview() {
    const overview = await api('/overview');
    state.overview = overview;
    state.nodes = overview.nodes || [];
    state.tasks = overview.tasks || [];
    state.domains = overview.domains || [];
  }

  async function refreshData() {
    await loadOverview();
    if (isAdmin()) {
      loadAdminData().catch(error => toast(error.message));
    }
    renderAll();
  }

  async function loadAdminData() {
    if (!isAdmin()) return;
    const results = await Promise.all([
      request('/api/platform/users'),
      api('/admin/tasks'),
      api('/admin/stats')
    ]);
    state.adminUsers = results[0] || [];
    state.adminTasks = results[1] || [];
    state.adminStats = results[2] || null;
    const userIds = new Set(state.adminUsers.map(user => String(user.id)));
    if (state.adminForm.assign === 'all') {
      state.adminForm.users = new Set(userIds);
    } else {
      state.adminForm.users = new Set(Array.from(state.adminForm.users).filter(id => userIds.has(String(id))));
    }
  }

  function showLocked() {
    els.locked.hidden = false;
    els.childView.hidden = true;
    els.parentView.hidden = true;
    els.modeSwitch.hidden = true;
  }

  function showApp() {
    els.locked.hidden = true;
    els.userChip.hidden = false;
    els.userChip.textContent = (state.user.nickname || state.user.username) + (isAdmin() ? ' · 管理員' : '');
    els.modeSwitch.hidden = !isAdmin();
    els.hallParentBtn.hidden = !isAdmin();
  }

  function setMode(mode) {
    if (mode === 'parent' && !isAdmin()) return;
    state.mode = mode;
    if (mode === 'parent') {
      loadAdminData().catch(error => toast(error.message));
    }
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAll() {
    els.modeSwitch.hidden = !isAdmin();
    $$('#mode-switch [data-mode]').forEach(button => {
      const active = button.getAttribute('data-mode') === state.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    els.childView.hidden = state.mode !== 'child';
    els.parentView.hidden = state.mode !== 'parent';
    if (state.mode !== 'child') hideDock();
    if (state.mode === 'child') renderChild();
    else renderParent();
  }

  function renderChild() {
    els.hallView.hidden = state.view !== 'hall';
    els.roundView.hidden = state.view !== 'round';
    els.summaryView.hidden = state.view !== 'summary';
    if (state.view !== 'round' || !state.answer) hideDock();
    if (state.view === 'hall') renderHall();
    if (state.view === 'round') renderRound();
    if (state.view === 'summary') renderSummary();
  }

  function hideDock() {
    els.dock.hidden = true;
    document.body.classList.remove('has-answer-dock');
  }

  function renderHall() {
    const stats = (state.overview && state.overview.stats) || {};
    els.helloName.textContent = state.user && (state.user.nickname || state.user.username) ? (state.user.nickname || state.user.username) : '你好';
    els.heroStats.innerHTML = [
      ['已掌握', fmtInt(stats.mastered) + ' / ' + fmtInt(stats.totalQuestions)],
      ['掌握率', fmtPct(stats.masteryRate) + '%'],
      ['近七日作答', fmtInt(stats.recent7) + ' 題'],
      ['平均用時', avgTimeText(stats.avgTime)]
    ].map(item => '<div class="hero-stat"><strong>' + esc(item[1]) + '</strong><span>' + esc(item[0]) + '</span></div>').join('');

    renderTasks();
    renderDomains();
    renderNodes();

    $$('#count-filter [data-count]').forEach(button => {
      button.classList.toggle('is-active', Number(button.getAttribute('data-count')) === state.count);
    });
  }

  function renderTasks() {
    if (!state.tasks.length) {
      els.taskGrid.innerHTML = '<div class="empty-state">還沒有任務。先從下面的領域或分類開始自由練習吧。</div>';
      return;
    }
    els.taskGrid.innerHTML = state.tasks.map(task => {
      const titles = (task.target_nodes || []).map(nodeTitle).slice(0, 3);
      const extra = (task.target_nodes || []).length - titles.length;
      const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
      const done = task.todayDone || progress >= 100;
      return '<article class="task-card' + (done ? ' is-done' : '') + '">' +
        '<div class="task-head">' +
          '<h3 class="task-name">' + esc(task.task_name) + '</h3>' +
          '<span class="task-state' + (done ? ' done' : '') + '">' + (done ? '今日完成' : '進行中') + '</span>' +
        '</div>' +
        '<div class="task-meta">' +
          titles.map(title => '<span>' + esc(title) + '</span>').join('') +
          (extra > 0 ? '<span>+' + extra + '</span>' : '') +
        '</div>' +
        '<div class="task-progress">' +
          '<div class="task-progress-bar"><span style="width:' + progress + '%"></span></div>' +
          '<div class="task-progress-row"><span>已掌握 ' + fmtInt(task.mastered) + ' / ' + fmtInt(task.total) + '</span><span>' + fmtPct(progress) + '%</span></div>' +
        '</div>' +
        '<button type="button" class="btn ' + (done ? 'btn-ghost' : 'btn-primary') + '" data-start-task="' + esc(task.task_id) + '">' + (task.todayDone ? '再練一次' : '開始任務') + '</button>' +
      '</article>';
    }).join('');
  }

  function renderDomains() {
    els.domainGrid.innerHTML = state.domains.map(domain => {
      const tone = 'var(--accent-soft)';
      const color = 'var(--accent)';
      return '<button type="button" class="domain-card" data-domain="' + esc(domain.id) + '" style="--domain-tint:' + tone + ';--domain-color:' + color + '">' +
        '<span class="domain-mark">' + esc(domainMark(domain.id)) + '</span>' +
        '<strong>' + esc(domain.title) + '</strong>' +
        '<p>' + esc(domainDescription(domain.id)) + '</p>' +
        '<span class="domain-count">共 ' + fmtInt(domain.count) + ' 題 · 開始練習</span>' +
      '</button>';
    }).join('');
  }

  function renderNodes() {
    const domains = state.domains.map(domain => domain.id);
    els.nodeGroups.innerHTML = domains.map(domainId => {
      const info = domainInfo(domainId);
      const nodes = state.nodes.filter(node => node.domain === domainId);
      if (!nodes.length) return '';
      const dimensions = [];
      nodes.forEach(node => {
        if (!dimensions.includes(node.dimension)) dimensions.push(node.dimension);
      });
      const color = 'var(--accent)';
      return '<section class="node-group" style="--group-color:' + color + '">' +
        '<div class="node-group-head"><span></span><h3>' + esc(info.title) + '</h3><em>' + nodes.reduce((sum, node) => sum + (node.questionCount || 0), 0) + ' 題</em></div>' +
        dimensions.map(dimension => {
          const list = nodes.filter(node => node.dimension === dimension);
          return '<div class="node-grid">' + list.map(node => {
            const mastery = Number(node.mastery) || 0;
            return '<button type="button" class="node-card" data-node="' + esc(node.node_id) + '">' +
              '<div class="node-card-top"><strong>' + esc(node.title) + '</strong><small>' + fmtInt(node.questionCount) + ' 題</small></div>' +
              '<div class="node-mastery"><span style="width:' + Math.max(0, Math.min(100, mastery)) + '%"></span></div>' +
              '<small>已掌握 ' + fmtInt(node.masteredCount) + ' · ' + fmtPct(mastery) + '%</small>' +
            '</button>';
          }).join('') + '</div>';
        }).join('') +
      '</section>';
    }).join('');
  }

  function startRoundPayload(payload) {
    state.round = payload;
    state.tiles = payload.question.tiles || [];
    state.order = [];
    state.answerText = '';
    state.answer = null;
    state.summary = null;
    state.view = 'round';
    state.questionShownAt = performance.now();
    renderChild();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function tileById(id) {
    return state.tiles.find(tile => tile.id === id) || null;
  }

  function renderRound() {
    const round = state.round;
    if (!round) return;
    const question = round.question;
    els.roundProgressText.textContent = round.position + ' / ' + round.total;
    els.roundProgressBar.style.width = (round.total ? (round.position / round.total) * 100 : 0) + '%';
    els.comboPill.hidden = !round.combo;
    els.comboPill.textContent = '連對 ' + round.combo;

    els.qDomain.textContent = question.domain_title || '';
    els.qNode.textContent = question.node_title || '';
    els.qLevel.textContent = question.difficulty === 'easy' ? '基礎' : question.difficulty === 'hard' ? '挑戰' : '標準';
    els.qRetry.hidden = !round.retry;
    els.qPrompt.textContent = question.prompt || '';
    els.qInstruction.textContent = question.instruction || '';

    els.orderArea.hidden = question.type !== 'order';
    els.inputArea.hidden = question.type !== 'input';
    els.choiceArea.hidden = question.type !== 'choice';

    if (question.type === 'order') renderOrder(question);
    if (question.type === 'input') renderInput(question);
    if (question.type === 'choice') renderChoice(question);
    renderFeedback();
  }

  function renderOrder(question) {
    const answered = !!state.answer;
    const used = new Set(state.order);
    const slots = [];
    for (let index = 0; index < question.count; index += 1) {
      const tile = tileById(state.order[index]);
      if (tile) {
        slots.push('<button type="button" class="slot is-filled" data-slot-index="' + index + '" data-slot-drag="' + index + '" data-slot-remove="' + index + '" draggable="' + (answered ? 'false' : 'true') + '" title="拖動排序；點擊移走" aria-label="第 ' + (index + 1) + ' 格：' + esc(tile.text) + '，可拖動排序或點擊移走"' + (answered ? ' disabled' : '') + '>' + esc(tile.text) + '</button>');
      } else {
        slots.push('<span class="slot is-empty" data-slot-index="' + index + '">' + (index + 1) + '</span>');
      }
    }
    els.answerSlots.innerHTML = slots.join('');
    els.tileBank.innerHTML = state.tiles.map(tile => {
      const hidden = used.has(tile.id);
      return '<button type="button" class="tile' + (hidden ? ' is-placeholder' : '') + '" draggable="' + (answered ? 'false' : 'true') + '" data-tile="' + esc(tile.id) + '"' + (answered ? ' disabled' : '') + '>' + esc(tile.text) + '</button>';
    }).join('');
    els.checkOrder.disabled = answered || state.order.length !== question.count;
    els.clearOrder.disabled = answered;
    els.shuffleOrder.disabled = answered;
  }

  function renderInput(question) {
    const answered = !!state.answer;
    els.mathExpression.textContent = question.expression || '';
    if (document.activeElement !== els.mathInput) {
      els.mathInput.value = state.answerText;
    }
    els.mathInput.disabled = answered;
    els.checkInput.disabled = answered || !state.answerText.trim();
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'back'];
    els.keypad.innerHTML = keys.map(key => '<button type="button" data-key="' + key + '"' + (answered ? ' disabled' : '') + '>' + (key === 'back' ? '⌫' : key) + '</button>').join('');
  }

  function renderChoice(question) {
    const feedback = state.answer;
    els.choiceOptions.innerHTML = (question.options || []).map((option, index) => {
      let className = 'option';
      if (feedback) {
        className += ' is-dim';
        if (option.text === feedback.answer) className += ' is-correct';
        if (feedback.optionId === option.id && option.text !== feedback.answer) className += ' is-wrong';
      }
      return '<button type="button" class="' + className + '" data-option="' + esc(option.id) + '"' + (feedback ? ' disabled' : '') + '>' +
        '<span class="option-key">' + String.fromCharCode(65 + index) + '</span>' +
        '<span>' + esc(option.text) + '</span>' +
      '</button>';
    }).join('');
  }

  function renderFeedback() {
    const feedback = state.answer;
    if (!feedback) {
      els.feedback.hidden = true;
      hideDock();
      return;
    }
    const question = state.round.question;
    els.feedback.hidden = false;
    els.feedback.className = 'feedback ' + (feedback.correct ? 'is-correct' : 'is-wrong');
    els.feedbackIcon.textContent = feedback.correct ? '✓' : '!';
    els.feedbackTitle.textContent = feedback.correct ? '答對了' : '再留意一下';

    if (question.type === 'order') {
      els.feedbackAnswer.textContent = '完整句子：' + feedback.answer;
    } else {
      els.feedbackAnswer.textContent = '正確答案：' + feedback.answer;
    }
    els.feedbackExplain.textContent = feedback.explanation || '';
    els.feedbackExplain.hidden = !feedback.explanation;

    let mastery = '';
    if (feedback.boxLevel === 3) mastery = '這個類別已掌握';
    else if (feedback.becameMastered) mastery = '剛剛掌握了這道題';
    else if (feedback.taskProgress) mastery = '任務進度 ' + fmtInt(feedback.taskProgress.mastered) + ' / ' + fmtInt(feedback.taskProgress.total);

    els.dock.hidden = false;
    els.dock.className = 'answer-dock ' + (feedback.correct ? 'is-correct' : 'is-wrong');
    els.dockIcon.textContent = feedback.correct ? '✓' : '!';
    els.dockTitle.textContent = feedback.correct ? '答對了' : '再留意一下';
    els.dockMastery.textContent = mastery;
    els.dockNext.textContent = feedback.retryAdded ? '再試一次 →' : '下一題 →';
    document.body.classList.add('has-answer-dock');
  }

  async function submitOrder() {
    if (state.busy || state.answer) return;
    if (state.order.length !== state.round.question.count) {
      toast('請把所有詞語卡排進句子裏');
      return;
    }
    await submitAnswer({ order: state.order.slice() });
  }

  async function submitInput() {
    if (state.busy || state.answer) return;
    const value = state.answerText.trim();
    if (!value) {
      toast('請先輸入答案');
      return;
    }
    await submitAnswer({ value });
  }

  async function submitChoice(optionId) {
    if (state.busy || state.answer) return;
    await submitAnswer({ optionId });
  }

  async function submitAnswer(payload) {
    if (!state.round) return;
    state.busy = true;
    try {
      const responseTime = state.questionShownAt
        ? Math.max(0, Math.round(performance.now() - state.questionShownAt))
        : 0;
      const feedback = await api('/rounds/' + encodeURIComponent(state.round.roundId) + '/answer', {
        method: 'POST',
        body: Object.assign({ responseTime }, payload)
      });
      state.answer = Object.assign({ optionId: payload.optionId || null }, feedback);
      if (feedback.total) state.round.total = feedback.total;
      state.round.combo = feedback.combo;
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      renderRound();
    } catch (error) {
      toast(error.message);
    } finally {
      state.busy = false;
    }
  }

  async function nextQuestion() {
    if (!state.round || !state.answer || state.busy) return;
    state.busy = true;
    try {
      const response = await api('/rounds/' + encodeURIComponent(state.round.roundId) + '/next', { method: 'POST' });
      if (response.done) {
        state.summary = response.summary;
        state.round = null;
        state.answer = null;
        state.view = 'summary';
        renderChild();
        refreshData().catch(error => toast(error.message));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        state.round = response;
        state.answer = null;
        state.answerText = '';
        state.tiles = response.question.tiles || [];
        state.order = [];
        state.questionShownAt = performance.now();
        renderChild();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      toast(error.message);
    } finally {
      state.busy = false;
    }
  }

  function renderSummary() {
    const summary = state.summary;
    if (!summary) return;
    els.summaryTitle.textContent = summary.accuracy >= 80 ? '這一輪很穩' : '這一輪完成了';
    els.summarySub.textContent = summary.task
      ? '任務「' + summary.task.task_name + '」的進度已更新。'
      : '錯題已記錄，下次練習會優先回來。';
    els.summaryStats.innerHTML = [
      ['答對', summary.correct + ' / ' + summary.answered],
      ['正確率', fmtPct(summary.accuracy) + '%'],
      ['新掌握', fmtInt(summary.newlyMastered)],
      ['重試次數', fmtInt(summary.retries)]
    ].map(item => '<div class="summary-stat"><strong>' + esc(item[1]) + '</strong><span>' + esc(item[0]) + '</span></div>').join('');

    if (summary.task) {
      els.summaryProgress.innerHTML = '<div class="task-progress"><div class="task-progress-bar"><span style="width:' + Math.max(0, Math.min(100, Number(summary.task.progress) || 0)) + '%"></span></div>' +
        '<div class="task-progress-row"><span>任務已掌握 ' + fmtInt(summary.task.mastered) + ' / ' + fmtInt(summary.task.total) + '</span><span>' + fmtPct(summary.task.progress) + '%</span></div></div>';
    } else {
      els.summaryProgress.innerHTML = '';
    }

    const wrong = summary.wrongQuestions || [];
    els.summaryWrong.innerHTML = wrong.length
      ? '<h3>這一輪要留意的題目</h3><div class="summary-wrong-list">' + wrong.map(item =>
          '<div class="summary-wrong-item"><strong>' + esc(item.node_title || item.node_id) + ' · ' + esc(domainInfo(item.domain).title || item.domain) + '</strong>' +
          '<span>' + esc(item.stem) + '</span><br><span>答案：' + esc(item.answer) + '</span></div>'
        ).join('') + '</div>'
      : '<div class="empty-state">這一輪沒有錯題，做得很好。</div>';
    els.summaryAgain.textContent = state.lastStart && state.lastStart.taskId ? '再練一次任務' : '再練一輪';
  }

  async function startTask(taskId) {
    if (state.busy) return;
    state.busy = true;
    try {
      const round = await api('/tasks/' + encodeURIComponent(taskId) + '/start', { method: 'POST' });
      state.lastStart = { taskId };
      startRoundPayload(round);
    } catch (error) {
      toast(error.message);
    } finally {
      state.busy = false;
    }
  }

  async function startFree(scope) {
    if (state.busy) return;
    state.busy = true;
    try {
      const body = Object.assign({ count: state.count }, scope || {});
      const round = await api('/practice/start', { method: 'POST', body });
      state.lastStart = Object.assign({ count: state.count }, scope || {});
      startRoundPayload(round);
    } catch (error) {
      toast(error.message);
    } finally {
      state.busy = false;
    }
  }

  function quitRound() {
    state.round = null;
    state.answer = null;
    state.answerText = '';
    state.tiles = [];
    state.order = [];
    state.view = 'hall';
    renderChild();
    refreshData().catch(error => toast(error.message));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderParent() {
    if (!isAdmin()) {
      els.parentView.innerHTML = '<div class="empty-state">需要管理員權限。</div>';
      return;
    }
    const stats = state.adminStats && state.adminStats.meta ? state.adminStats.meta : {};
    const totals = state.overview ? state.overview.stats : {};
    els.parentStats.innerHTML = [
      ['題目總數', fmtInt(stats.questions || (state.overview && state.overview.questionCount))],
      ['分類數', fmtInt(stats.nodes)],
      ['用戶數', fmtInt(stats.users)],
      ['任務數', fmtInt(state.adminTasks.length)],
      ['我的掌握率', fmtPct(totals.masteryRate) + '%']
    ].map(item => '<div class="parent-stat"><strong>' + esc(item[1]) + '</strong><span>' + esc(item[0]) + '</span></div>').join('');

    renderTree();
    $$('.parent-tabs [data-parent-tab]').forEach(button => {
      const active = button.getAttribute('data-parent-tab') === state.parentTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    els.parentTasks.hidden = state.parentTab !== 'tasks';
    els.parentAnalytics.hidden = state.parentTab !== 'stats';
    els.parentBank.hidden = state.parentTab !== 'bank';
    if (state.parentTab === 'tasks') renderAdminTasks();
    if (state.parentTab === 'stats') renderAdminStats();
    if (state.parentTab === 'bank') renderBank();
  }

  function renderTree() {
    els.treeCount.textContent = state.nodes.length + ' 個分類';
    const groups = [];
    state.domains.forEach(domain => {
      const nodes = state.nodes.filter(node => node.domain === domain.id);
      if (!nodes.length) return;
      groups.push('<div class="tree-domain">' + esc(domain.title) + '</div>');
      nodes.forEach(node => {
        groups.push('<button type="button" class="tree-node' + (state.treeNode === node.node_id ? ' is-active' : '') + '" data-tree-node="' + esc(node.node_id) + '">' +
          '<span>' + esc(node.title) + '</span><small>' + fmtInt(node.questionCount) + '</small>' +
        '</button>');
      });
    });
    els.parentTree.innerHTML = groups.join('');
  }

  function renderAdminTasks() {
    const form = state.adminForm;
    const domainOptions = state.domains.map(domain => {
      const nodes = state.nodes.filter(node => node.domain === domain.id);
      if (!nodes.length) return '';
      const dimensions = [];
      nodes.forEach(node => {
        if (!dimensions.includes(node.dimension)) dimensions.push(node.dimension);
      });
      return '<div class="picker-domain">' + esc(domain.title) + '</div>' +
        dimensions.map(dimension => nodes.filter(node => node.dimension === dimension).map(node =>
          '<label class="picker-item"><input type="checkbox" data-form-node="' + esc(node.node_id) + '"' + (form.nodes.has(node.node_id) ? ' checked' : '') + '>' +
          '<span>' + esc(node.title) + '</span><em>' + fmtInt(node.questionCount) + ' 題</em></label>'
        ).join('')).join('');
    }).join('');

    const userRows = state.adminUsers.map(user =>
      '<label class="assign-row"><input type="checkbox" data-assign-user="' + esc(user.id) + '"' + (form.users.has(String(user.id)) ? ' checked' : '') + '>' +
      '<span>' + esc(user.nickname || user.username) + '</span><span style="color:var(--ink-faint);font-size:9px">' + esc(user.role === 'admin' ? '管理員' : '學生') + '</span></label>'
    ).join('');

    const taskRows = state.adminTasks.length
      ? state.adminTasks.map(task => {
          const titles = (task.target_nodes || []).map(nodeTitle).slice(0, 4).join('、');
          return '<div class="admin-task">' +
            '<div class="admin-task-head"><strong>' + esc(task.task_name) + '</strong><span>' + esc(task.username || '') + '</span></div>' +
            '<div class="admin-task-meta"><span>' + esc(titles || '指定題目') + '</span><span>進度 ' + fmtInt(task.mastered) + '/' + fmtInt(task.total) + '</span><span>正確率 ' + fmtPct(task.answerAccuracy) + '%</span><span>' + (task.is_archived ? '已歸檔' : '進行中') + '</span></div>' +
            '<div class="admin-task-actions">' +
              '<button type="button" class="mini-btn danger" data-delete-task="' + esc(task.task_id) + '">刪除</button>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="empty-state">還沒有任務。</div>';

    els.parentTasks.innerHTML = '<div class="panel-grid">' +
      '<div class="form-card">' +
        '<h3>建立任務</h3>' +
        '<div class="field"><label for="task-name">任務名稱</label><input id="task-name" maxlength="40" placeholder="' + esc(CONFIG.taskPlaceholder || '例如：本周分類練習') + '" value="' + esc(form.name) + '"></div>' +
        '<div class="field"><label>分類（可多選）</label><div class="category-picker">' + domainOptions + '</div></div>' +
        '<div class="field-row">' +
          '<div class="field"><label for="task-size">每輪題數</label><input id="task-size" type="number" min="1" max="30" value="' + fmtInt(form.batchSize) + '"></div>' +
          '<div class="field"><label for="task-streak">連續答對天數</label><input id="task-streak" type="number" min="2" max="6" value="' + fmtInt(form.passStreak) + '"></div>' +
        '</div>' +
        '<div class="field"><label for="task-assign">指派對象</label><select id="task-assign"><option value="all"' + (form.assign === 'all' ? ' selected' : '') + '>全部用戶</option><option value="selected"' + (form.assign === 'selected' ? ' selected' : '') + '>指定用戶</option></select></div>' +
        (form.assign === 'selected' ? '<div class="assign-actions"><button type="button" data-assign-all>全選</button><button type="button" data-assign-none>清除</button></div><div class="assign-list">' + userRows + '</div>' : '') +
        '<p class="form-hint">任務會固定抽出所選類別的題目。進行中或一週內已掌握的題目會自動避開。</p>' +
        '<button type="button" class="btn btn-primary" id="create-task-btn">建立任務</button>' +
        '<p class="form-error" id="task-form-error" hidden></p>' +
      '</div>' +
      '<div class="list-card"><h3>任務列表</h3><div class="task-admin-list">' + taskRows + '</div></div>' +
    '</div>';
  }

  function renderAdminStats() {
    if (state.adminStatsLoading) {
      els.parentAnalytics.innerHTML = '<div class="empty-state">正在整理學習統計…</div>';
      return;
    }
    const users = (state.adminStats && state.adminStats.users) || [];
    if (!users.length) {
      els.parentAnalytics.innerHTML = '<div class="empty-state">還沒有學習紀錄。</div>';
      return;
    }
    els.parentAnalytics.innerHTML = '<div class="list-card"><h3>學生學習概況</h3><div class="user-stat-list">' + users.map(user => {
      const stats = user.stats || {};
      const weak = (user.weakNodes || []).slice(0, 3).map(node => node.title + '（' + fmtPct(node.accuracy) + '%）').join('、');
      return '<div class="user-stat-card">' +
        '<div class="user-stat-head"><span>' + esc(user.nickname || user.username) + '</span><span>' + esc(user.role === 'admin' ? '管理員' : '學生') + '</span></div>' +
        '<div class="user-stat-grid">' +
          '<div><strong>' + fmtInt(stats.mastered) + '</strong><span>已掌握</span></div>' +
          '<div><strong>' + fmtPct(stats.mastery) + '%</strong><span>掌握率</span></div>' +
          '<div><strong>' + fmtPct(stats.accuracy) + '%</strong><span>正確率</span></div>' +
          '<div><strong>' + fmtInt(stats.recent7) + '</strong><span>近七日</span></div>' +
        '</div>' +
        (weak ? '<div class="admin-task-meta"><span>待加強：' + esc(weak) + '</span></div>' : '') +
      '</div>';
    }).join('') + '</div></div>';
  }

  function renderBank() {
    const bank = state.bank;
    const domainSelect = '<select data-bank-domain><option value="">全部</option>' + state.domains.map(domain =>
      '<option value="' + esc(domain.id) + '"' + (bank.domain === domain.id ? ' selected' : '') + '>' + esc(domain.title) + '</option>'
    ).join('') + '</select>';
    const nodeSelect = '<select data-bank-node><option value="">全部分類</option>' + state.nodes.filter(node => !bank.domain || node.domain === bank.domain).map(node =>
      '<option value="' + esc(node.node_id) + '"' + (bank.nodeId === node.node_id ? ' selected' : '') + '>' + esc(node.title) + '</option>'
    ).join('') + '</select>';
    const rows = bank.questions.map(question =>
      '<div class="bank-item">' +
        '<div class="bank-item-head"><span>' + esc(question.domain_title) + ' · ' + esc(question.node_title) + '</span><span>' + esc(question.question_id) + '</span></div>' +
        '<strong>' + esc(question.stem) + '</strong>' +
        '<p>答案：' + esc(question.answer) + '</p>' +
        (question.explanation ? '<small>' + esc(question.explanation) + '</small>' : '') +
      '</div>'
    ).join('');
    els.parentBank.innerHTML = '<div class="list-card">' +
      '<h3>題庫（' + fmtInt(bank.total) + ' 題）</h3>' +
      '<div class="bank-toolbar">' +
        '<input data-bank-q placeholder="搜尋題目、答案或解釋" value="' + esc(bank.q) + '">' +
        domainSelect + nodeSelect +
        '<button type="button" class="mini-btn" data-bank-search>搜尋</button>' +
      '</div>' +
      '<div class="bank-list">' + (rows || '<div class="empty-state">沒有符合的題目。</div>') + '</div>' +
      (bank.questions.length < bank.total ? '<div class="bank-more"><button type="button" class="btn btn-ghost" data-bank-more>載入更多</button></div>' : '') +
    '</div>';
  }

  async function loadBank(reset) {
    const bank = state.bank;
    if (bank.loading) return;
    bank.loading = true;
    if (reset) {
      bank.offset = 0;
      bank.questions = [];
    }
    renderBank();
    try {
      const params = new URLSearchParams({
        domain: bank.domain,
        node_id: bank.nodeId,
        q: bank.q,
        offset: String(bank.offset),
        limit: String(bank.limit)
      });
      const data = await api('/questions?' + params.toString());
      bank.total = data.total || 0;
      bank.questions = bank.questions.concat(data.questions || []);
      bank.offset = bank.questions.length;
      bank.loaded = true;
    } catch (error) {
      toast(error.message);
    } finally {
      bank.loading = false;
      if (state.mode === 'parent' && state.parentTab === 'bank') renderBank();
    }
  }

  async function createTask() {
    const form = state.adminForm;
    const errorEl = $('#task-form-error');
    const name = ($('#task-name') && $('#task-name').value || '').trim();
    if (!name) {
      if (errorEl) {
        errorEl.textContent = '請輸入任務名稱';
        errorEl.hidden = false;
      }
      return;
    }
    if (!form.nodes.size) {
      if (errorEl) {
        errorEl.textContent = '請至少選擇一個類別';
        errorEl.hidden = false;
      }
      return;
    }
    if (form.assign === 'selected' && !form.users.size) {
      if (errorEl) {
        errorEl.textContent = '請選擇至少一位用戶';
        errorEl.hidden = false;
      }
      return;
    }
    const body = {
      task_name: name,
      target_nodes: Array.from(form.nodes),
      batch_size: Math.max(1, Math.min(30, parseInt($('#task-size') && $('#task-size').value, 10) || 10)),
      pass_streak: Math.max(2, Math.min(6, parseInt($('#task-streak') && $('#task-streak').value, 10) || 3)),
      userIds: form.assign === 'all' ? [] : Array.from(form.users)
    };
    if (errorEl) errorEl.hidden = true;
    state.busy = true;
    try {
      const result = await api('/tasks', { method: 'POST', body });
      toast('已建立 ' + result.created + ' 個任務' + (result.skipped && result.skipped.length ? '，' + result.skipped.length + ' 位用戶被略過' : ''));
      form.name = '';
      form.nodes.clear();
      await loadAdminData();
      await loadOverview();
      renderAll();
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
      } else {
        toast(error.message);
      }
    } finally {
      state.busy = false;
    }
  }

  async function deleteTask(taskId) {
    if (!window.confirm('刪除這個任務？相關作答紀錄也會一併移除。')) return;
    try {
      await api('/tasks/' + encodeURIComponent(taskId), { method: 'DELETE' });
      toast('任務已刪除');
      await loadAdminData();
      await loadOverview();
      renderAll();
    } catch (error) {
      toast(error.message);
    }
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (suppressClickUntil && performance.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      event.preventDefault();
      return;
    }

    const modeButton = target.closest('[data-mode]');
    if (modeButton) {
      setMode(modeButton.getAttribute('data-mode'));
      return;
    }

    if (target.closest('#hall-parent-btn')) {
      setMode('parent');
      return;
    }

    if (target.closest('#parent-child-btn')) {
      setMode('child');
      return;
    }

    const domainButton = target.closest('[data-domain]');
    if (domainButton) {
      startFree({ domains: [domainButton.getAttribute('data-domain')] });
      return;
    }

    const nodeButton = target.closest('[data-node]');
    if (nodeButton && !target.closest('[data-form-node]')) {
      startFree({ nodes: [nodeButton.getAttribute('data-node')] });
      return;
    }

    if (target.closest('#practice-all')) {
      startFree({});
      return;
    }

    const countButton = target.closest('#count-filter [data-count]');
    if (countButton) {
      state.count = Number(countButton.getAttribute('data-count')) || 10;
      renderHall();
      return;
    }

    const startTaskButton = target.closest('[data-start-task]');
    if (startTaskButton) {
      startTask(startTaskButton.getAttribute('data-start-task'));
      return;
    }

    if (target.closest('#clear-order')) {
      if (!state.answer) {
        state.order = [];
        renderRound();
      }
      return;
    }

    if (target.closest('#shuffle-order')) {
      if (!state.answer) {
        state.order = [];
        state.tiles = shuffle(state.tiles);
        renderRound();
      }
      return;
    }

    if (target.closest('#check-order')) {
      submitOrder();
      return;
    }

    if (target.closest('#check-input')) {
      submitInput();
      return;
    }

    if (target.closest('#dock-next') || target.closest('#feedback-next')) {
      nextQuestion();
      return;
    }

    if (target.closest('#quit-round')) {
      quitRound();
      return;
    }

    if (target.closest('#summary-back')) {
      quitRound();
      return;
    }

    if (target.closest('#summary-again')) {
      if (state.lastStart && state.lastStart.taskId) startTask(state.lastStart.taskId);
      else if (state.lastStart) {
        const scope = {};
        if (state.lastStart.nodes) scope.nodes = state.lastStart.nodes;
        if (state.lastStart.domains) scope.domains = state.lastStart.domains;
        startFree(scope);
      } else {
        startFree({});
      }
      return;
    }

    const tile = target.closest('[data-tile]');
    if (tile && !state.answer && state.order.length < state.round.question.count) {
      const id = tile.getAttribute('data-tile');
      if (!state.order.includes(id)) {
        state.order.push(id);
        renderRound();
      }
      return;
    }

    const slot = target.closest('[data-slot-remove]');
    if (slot && !state.answer) {
      const index = Number(slot.getAttribute('data-slot-remove'));
      if (Number.isInteger(index) && index >= 0) {
        state.order.splice(index, 1);
        renderRound();
      }
      return;
    }

    const key = target.closest('[data-key]');
    if (key && !state.answer) {
      const value = key.getAttribute('data-key');
      if (value === 'C') state.answerText = '';
      else if (value === 'back') state.answerText = state.answerText.slice(0, -1);
      else state.answerText = (state.answerText + value).slice(0, 12);
      renderRound();
      els.mathInput.focus();
      return;
    }

    const option = target.closest('[data-option]');
    if (option && !state.answer) {
      submitChoice(option.getAttribute('data-option'));
      return;
    }

    const tab = target.closest('[data-parent-tab]');
    if (tab) {
      state.parentTab = tab.getAttribute('data-parent-tab');
      renderParent();
      if (state.parentTab === 'bank' && !state.bank.loaded) loadBank(true);
      return;
    }

    const treeNode = target.closest('[data-tree-node]');
    if (treeNode) {
      state.treeNode = treeNode.getAttribute('data-tree-node');
      const node = nodeById(state.treeNode);
      state.bank.nodeId = state.treeNode;
      state.bank.domain = node ? node.domain : '';
      state.parentTab = 'bank';
      loadBank(true);
      renderParent();
      return;
    }

    const deleteButton = target.closest('[data-delete-task]');
    if (deleteButton) {
      deleteTask(deleteButton.getAttribute('data-delete-task'));
      return;
    }

    if (target.closest('#create-task-btn')) {
      createTask();
      return;
    }

    if (target.closest('[data-assign-all]')) {
      state.adminForm.users = new Set(state.adminUsers.map(user => String(user.id)));
      renderAdminTasks();
      return;
    }

    if (target.closest('[data-assign-none]')) {
      state.adminForm.users.clear();
      renderAdminTasks();
      return;
    }

    if (target.closest('[data-bank-search]')) {
      const input = $('[data-bank-q]');
      state.bank.q = input ? input.value.trim() : '';
      loadBank(true);
      return;
    }

    if (target.closest('[data-bank-more]')) {
      loadBank(false);
      return;
    }
  });

  document.addEventListener('change', event => {
    const target = event.target;

    if (target.matches('[data-form-node]')) {
      const nodeId = target.getAttribute('data-form-node');
      if (target.checked) state.adminForm.nodes.add(nodeId);
      else state.adminForm.nodes.delete(nodeId);
      return;
    }

    if (target.matches('[data-assign-user]')) {
      const userId = String(target.getAttribute('data-assign-user'));
      if (target.checked) state.adminForm.users.add(userId);
      else state.adminForm.users.delete(userId);
      return;
    }

    if (target.id === 'task-name') {
      state.adminForm.name = target.value;
      return;
    }

    if (target.id === 'task-size') {
      state.adminForm.batchSize = parseInt(target.value, 10) || 10;
      return;
    }

    if (target.id === 'task-streak') {
      state.adminForm.passStreak = parseInt(target.value, 10) || 3;
      return;
    }

    if (target.id === 'task-assign') {
      state.adminForm.assign = target.value;
      if (target.value === 'all') {
        state.adminForm.users = new Set(state.adminUsers.map(user => String(user.id)));
      }
      renderAdminTasks();
      return;
    }

    if (target.matches('[data-bank-domain]')) {
      state.bank.domain = target.value;
      state.bank.nodeId = '';
      loadBank(true);
      return;
    }

    if (target.matches('[data-bank-node]')) {
      state.bank.nodeId = target.value;
      loadBank(true);
      return;
    }
  });

  document.addEventListener('input', event => {
    if (event.target === els.mathInput) {
      state.answerText = event.target.value.replace(/[^\d.-]/g, '').slice(0, 12);
      els.mathInput.value = state.answerText;
      els.checkInput.disabled = !!state.answer || !state.answerText.trim();
      return;
    }
    if (event.target.id === 'task-name') state.adminForm.name = event.target.value;
    if (event.target.id === 'task-size') state.adminForm.batchSize = parseInt(event.target.value, 10) || 10;
    if (event.target.id === 'task-streak') state.adminForm.passStreak = parseInt(event.target.value, 10) || 3;
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && state.round && state.round.question.type === 'input' && !state.answer) {
      event.preventDefault();
      submitInput();
    }
  });

  let dragSource = null;
  let suppressClickUntil = 0;
  let pointerDrag = null;

  function clearDragStyles() {
    $$('#answer-slots .slot').forEach(slot => slot.classList.remove('is-drop-target', 'is-dragging'));
    if (els.answerSlots) els.answerSlots.classList.remove('is-over');
    $$('.drag-ghost').forEach(ghost => ghost.remove());
  }

  function dropIndexFromPoint(x, y) {
    if (!els.answerSlots) return null;
    const element = document.elementFromPoint(x, y);
    const row = element && element.closest('#answer-slots');
    if (!row) return null;
    const slot = element.closest('[data-slot-index]');
    return slot ? Number(slot.getAttribute('data-slot-index')) : state.order.length;
  }

  function highlightDrop(index) {
    $$('#answer-slots .slot').forEach(slot => slot.classList.remove('is-drop-target'));
    if (index == null) {
      if (els.answerSlots) els.answerSlots.classList.remove('is-over');
      return;
    }
    if (els.answerSlots) els.answerSlots.classList.add('is-over');
    const slot = $('#answer-slots [data-slot-index="' + index + '"]');
    if (slot) slot.classList.add('is-drop-target');
  }

  function applyOrderDrop(source, targetIndex) {
    if (!source || !state.round || state.round.question.type !== 'order' || state.answer) return false;
    const count = state.round.question.count;
    const clamp = value => Math.max(0, Math.min(state.order.length, value));
    if (source.kind === 'slot') {
      const from = Number(source.index);
      if (!Number.isInteger(from) || from < 0 || from >= state.order.length) return false;
      const moved = state.order.splice(from, 1)[0];
      state.order.splice(clamp(targetIndex == null ? state.order.length : targetIndex), 0, moved);
      return true;
    }
    if (source.kind === 'tile') {
      const id = source.id;
      if (!id || state.order.includes(id) || state.order.length >= count) return false;
      state.order.splice(clamp(targetIndex == null ? state.order.length : targetIndex), 0, id);
      return true;
    }
    return false;
  }

  document.addEventListener('dragstart', event => {
    if (state.answer) {
      event.preventDefault();
      return;
    }
    const slot = event.target.closest('[data-slot-drag]');
    if (slot) {
      dragSource = { kind: 'slot', index: Number(slot.getAttribute('data-slot-drag')) };
      event.dataTransfer.setData('text/plain', 'slot:' + dragSource.index);
      event.dataTransfer.effectAllowed = 'move';
      slot.classList.add('is-dragging');
      return;
    }
    const tile = event.target.closest('[data-tile]');
    if (!tile) {
      event.preventDefault();
      return;
    }
    dragSource = { kind: 'tile', id: tile.getAttribute('data-tile') };
    event.dataTransfer.setData('text/plain', 'tile:' + dragSource.id);
    event.dataTransfer.effectAllowed = 'move';
    tile.classList.add('is-dragging');
  });

  document.addEventListener('dragover', event => {
    if (!dragSource || state.answer) return;
    if (!event.target.closest('#answer-slots')) {
      highlightDrop(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    highlightDrop(dropIndexFromPoint(event.clientX, event.clientY));
  });

  document.addEventListener('dragleave', event => {
    const row = event.target.closest('#answer-slots');
    const next = event.relatedTarget;
    if (row && !(next && next.closest && next.closest('#answer-slots'))) highlightDrop(null);
  });

  document.addEventListener('drop', event => {
    if (!dragSource || state.answer) return;
    if (!event.target.closest('#answer-slots')) {
      dragSource = null;
      highlightDrop(null);
      clearDragStyles();
      return;
    }
    event.preventDefault();
    const index = dropIndexFromPoint(event.clientX, event.clientY);
    const source = dragSource;
    dragSource = null;
    highlightDrop(null);
    clearDragStyles();
    if (applyOrderDrop(source, index)) renderRound();
  });

  document.addEventListener('dragend', () => {
    dragSource = null;
    highlightDrop(null);
    clearDragStyles();
  });

  document.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || state.answer) return;
    const slot = event.target.closest('[data-slot-drag]');
    if (!slot) return;
    pointerDrag = {
      pointerId: event.pointerId,
      index: Number(slot.getAttribute('data-slot-drag')),
      text: slot.textContent,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      ghost: null
    };
  });

  document.addEventListener('pointermove', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    if (!pointerDrag.moved) {
      if (Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY) < 8) return;
      pointerDrag.moved = true;
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = pointerDrag.text;
      document.body.appendChild(ghost);
      pointerDrag.ghost = ghost;
      const slot = $('#answer-slots [data-slot-index="' + pointerDrag.index + '"]');
      if (slot) slot.classList.add('is-dragging');
    }
    event.preventDefault();
    if (pointerDrag.ghost) {
      pointerDrag.ghost.style.left = event.clientX + 'px';
      pointerDrag.ghost.style.top = event.clientY + 'px';
    }
    highlightDrop(dropIndexFromPoint(event.clientX, event.clientY));
  });

  document.addEventListener('pointerup', event => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
    const drag = pointerDrag;
    pointerDrag = null;
    clearDragStyles();
    if (!drag.moved) return;
    suppressClickUntil = performance.now() + 300;
    const index = dropIndexFromPoint(event.clientX, event.clientY);
    if (applyOrderDrop({ kind: 'slot', index: drag.index }, index)) renderRound();
  });

  document.addEventListener('pointercancel', () => {
    pointerDrag = null;
    clearDragStyles();
  });

  boot();
})();
