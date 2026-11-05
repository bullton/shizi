(function () {
  'use strict';

  const state = {
    user: null,
    overview: null,
    ranking: null,
    mode: 'child',
    childView: 'hall',
    parentTab: 'tasks',
    selectedNode: '',
    users: [],
    selectedUsers: new Set(),
    adminTasks: [],
    adminStats: null,
    statsLoading: false,
    statsError: '',
    statsUserId: null,
    allQuestions: [],
    questionsLoaded: false,
    editingQuestion: null,
    importResult: null,
    wrongTaskId: null,
    wrongList: [],
    round: null,
    answer: null,
    feedback: null,
    advancing: false,
    summary: null,
    sound: true,
    audio: null
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const els = {
    locked: $('#locked'),
    childView: $('#child-view'),
    parentView: $('#parent-view'),
    hall: $('#hall-view'),
    roundView: $('#round-view'),
    summaryView: $('#summary-view'),
    helloName: $('#hello-name'),
    heroRank: $('#hero-rank'),
    taskGrid: $('#task-grid'),
    userChip: $('#user-chip'),
    modeSwitch: $('#mode-switch'),
    hallParentBtn: $('#hall-parent-btn'),
    soundBtn: $('#sound-btn'),
    parentStats: $('#parent-stats'),
    tree: $('#grammar-tree'),
    treeCount: $('#tree-question-count'),
    parentTasks: $('#parent-tasks'),
    parentBank: $('#parent-bank'),
    parentAnalytics: $('#parent-analytics'),
    roundProgressText: $('#round-progress-text'),
    roundProgressBar: $('#round-progress-bar'),
    comboPill: $('#combo-pill'),
    questionNode: $('#question-node'),
    questionStem: $('#question-stem'),
    retryNote: $('#retry-note'),
    options: $('#options'),
    feedback: $('#feedback'),
    feedbackIcon: $('#feedback-icon'),
    feedbackTitle: $('#feedback-title'),
    feedbackAnswer: $('#feedback-answer'),
    feedbackTip: $('#feedback-tip'),
    feedbackExplain: $('#feedback-explain'),
    feedbackContinue: $('#feedback-continue'),
    summaryTitle: $('#summary-title'),
    summaryStats: $('#summary-stats'),
    summaryProgress: $('#summary-progress'),
    summaryWrong: $('#summary-wrong'),
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

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 2600);
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
    if (response.status === 401) {
      showLocked();
      const unauthorized = new Error('請先登入學習平台');
      unauthorized.status = 401;
      throw unauthorized;
    }
    if (!response.ok) {
      const failure = new Error((data && data.error) || '請求失敗（' + response.status + '）');
      failure.status = response.status;
      throw failure;
    }
    return data;
  }

  const api = (path, options) => request('/api/grammar' + path, options);

  function showLocked() {
    els.locked.hidden = false;
    els.childView.hidden = true;
    els.parentView.hidden = true;
  }

  function isAdmin() {
    return !!(state.user && state.user.role === 'admin');
  }

  function nodeMap() {
    const map = new Map();
    (state.overview ? state.overview.nodes : []).forEach(node => map.set(node.node_id, node));
    return map;
  }

  function nodeName(id) {
    const node = nodeMap().get(id);
    return node ? node.title : id;
  }

  function myRankingRow() {
    if (!state.user || !Array.isArray(state.ranking)) return null;
    return state.ranking.find(row => String(row.userId) === String(state.user.id)) || null;
  }

  function toolRank(toolId) {
    if (!state.user || !Array.isArray(state.ranking)) return null;
    const rows = state.ranking.slice().sort((a, b) => {
      const at = a.tools && a.tools[toolId] ? Number(a.tools[toolId].score) || 0 : 0;
      const bt = b.tools && b.tools[toolId] ? Number(b.tools[toolId].score) || 0 : 0;
      return bt - at;
    });
    const index = rows.findIndex(row => String(row.userId) === String(state.user.id));
    if (index < 0) return null;
    const detail = rows[index].tools && rows[index].tools[toolId];
    if (!detail || Number(detail.score) <= 0) return null;
    return index + 1;
  }

  function overallRank() {
    if (!state.user || !Array.isArray(state.ranking)) return null;
    const row = state.ranking.find(item => String(item.userId) === String(state.user.id));
    if (!row || !(Number(row.combined) > 0)) return null;
    const index = state.ranking.findIndex(item => String(item.userId) === String(state.user.id));
    return index >= 0 ? index + 1 : null;
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!state.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      state.audio = new AudioContext();
    }
    if (state.audio.state === 'suspended') state.audio.resume();
    return state.audio;
  }

  function playTone(correct) {
    const context = ensureAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = correct ? 660 : 210;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
  }

  async function loadData() {
    const jobs = [api('/overview'), request('/api/platform/ranking')];
    if (isAdmin()) jobs.push(api('/admin/tasks'));
    const [overview, ranking, adminTasks] = await Promise.all(jobs);
    state.overview = overview;
    state.ranking = Array.isArray(ranking) ? ranking : [];
    state.adminTasks = Array.isArray(adminTasks) ? adminTasks : [];
  }

  async function loadUsers() {
    if (!isAdmin()) {
      state.users = [];
      return;
    }
    try {
      const users = await request('/api/platform/users');
      state.users = Array.isArray(users) ? users : [];
    } catch (error) {
      state.users = [];
    }
  }

  async function refreshData() {
    await loadData();
    if (state.mode === 'parent') {
      await loadQuestions();
    }
    renderAll();
  }

  async function loadQuestions() {
    state.allQuestions = await api('/questions');
    state.questionsLoaded = true;
  }

  async function ensureQuestions() {
    if (!state.questionsLoaded) await loadQuestions();
  }

  function setMode(mode) {
    if (mode === 'parent') {
      if (!isAdmin()) {
        toast('只有管理員可以進入管理設定');
        return;
      }
      state.mode = 'parent';
      els.childView.hidden = true;
      els.parentView.hidden = false;
      $$('[data-mode]').forEach(button => {
        const active = button.getAttribute('data-mode') === 'parent';
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      renderParent();
      ensureQuestions().then(renderParent).catch(error => toast(error.message));
      if (state.parentTab === 'stats') loadAdminStats();
      return;
    }
    state.mode = 'child';
    els.parentView.hidden = true;
    els.childView.hidden = false;
    $$('[data-mode]').forEach(button => {
      const active = button.getAttribute('data-mode') === 'child';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderChild();
  }

  function renderAll() {
    if (!state.user) return;
    const admin = isAdmin();
    els.userChip.textContent = (state.user.nickname || state.user.username) + ' · @' + state.user.username;
    els.userChip.hidden = false;
    if (els.modeSwitch) els.modeSwitch.hidden = !admin;
    if (els.hallParentBtn) els.hallParentBtn.hidden = !admin;
    if (!admin && state.mode === 'parent') state.mode = 'child';
    if (state.mode === 'parent') {
      els.childView.hidden = true;
      els.parentView.hidden = false;
      renderParent();
      if (state.parentTab === 'stats') loadAdminStats();
    } else {
      els.parentView.hidden = true;
      els.childView.hidden = false;
      renderChild();
    }
  }

  function renderChild() {
    els.hall.hidden = state.childView !== 'hall';
    els.roundView.hidden = state.childView !== 'round';
    els.summaryView.hidden = state.childView !== 'summary';
    if (state.childView === 'hall') renderHall();
    if (state.childView === 'round') renderRound();
    if (state.childView === 'summary') renderSummary();
  }

  function taskCardHTML(task) {
    const nodes = (task.target_nodes || []).slice(0, 3).map(id => '<span class="node-chip">' + esc(nodeName(id)) + '</span>');
    if ((task.target_nodes || []).length > 3) nodes.push('<span class="node-chip">+' + ((task.target_nodes || []).length - 3) + '</span>');
    if (!nodes.length && (task.question_ids || []).length) nodes.push('<span class="node-chip">指定題目</span>');
    const done = task.total > 0 && task.mastered >= task.total;
    return '<article class="task-card' + (done ? ' is-done' : '') + '">' +
      '<div class="task-card-top">' +
        '<div><h3>' + esc(task.task_name) + '</h3><div class="task-nodes">' + nodes.join('') + '</div></div>' +
        '<span class="task-badge' + (done ? ' is-done' : '') + '">' + (done ? '已掌握' : '進行中') + '</span>' +
      '</div>' +
      '<div class="task-card-foot">' +
        '<span class="progress-ring" title="掌握進度" style="--p:' + Number(task.progress || 0) + '"><strong>' + Math.round(Number(task.progress || 0)) + '%</strong></span>' +
        '<span class="task-meta"><strong>掌握 ' + task.mastered + ' / ' + task.total + ' 題</strong><span>已練 ' + Number(task.attempted || 0) + ' / ' + task.total + ' · ' +
          (Number(task.batch_size || 0) < Number(task.total || 0) ? '每輪 ' + task.batch_size + ' 題 · ' : '') +
          '跨天連對 ' + Number(task.pass_streak || 3) + ' 次算掌握</span></span>' +
        '<button type="button" class="btn btn-primary btn-sm" data-start-task="' + esc(task.task_id) + '">開始</button>' +
      '</div>' +
      '</article>';
  }

  function renderHall() {
    if (!state.overview) return;
    const name = state.user.nickname || state.user.username;
    els.helloName.textContent = name;
    const grammarRank = toolRank('grammar');
    const overall = overallRank();
    if (grammarRank || overall) {
      const parts = [];
      if (overall) parts.push('<span class="rank-chip">綜合第 ' + overall + ' 名</span>');
      if (grammarRank) parts.push('<span class="rank-chip">文法第 ' + grammarRank + ' 名</span>');
      els.heroRank.innerHTML = parts.join('');
      els.heroRank.hidden = false;
    } else {
      els.heroRank.hidden = true;
    }

    const tasks = state.overview.tasks || [];
    if (!tasks.length) {
      els.taskGrid.innerHTML = isAdmin()
        ? '<div class="empty-state"><h3>還沒有任務花圃</h3><p>先到「管理設定」選幾個語法點，建立第一個任務。</p><button type="button" class="btn btn-primary" data-mode="parent">建立任務</button></div>'
        : '<div class="empty-state"><h3>還沒有任務花圃</h3><p>等管理員布置任務後，就可以在這裡開始練習。</p></div>';
      return;
    }
    els.taskGrid.innerHTML = tasks.map(taskCardHTML).join('');
  }

  function formatStem(stem, highlight, showHighlight) {
    let safe = esc(stem);
    if (showHighlight && highlight) {
      const pattern = new RegExp(escapeRegExp(esc(highlight)), 'gi');
      safe = safe.replace(pattern, match => '<mark>' + match + '</mark>');
    }
    return safe.replace(/_{2,}/g, '<span class="blank" aria-label="空格">&nbsp;</span>');
  }

  function renderRound() {
    const round = state.round;
    if (!round) return;
    const question = round.question;
    els.roundProgressText.textContent = round.position + ' / ' + round.total;
    els.roundProgressBar.style.width = Math.min(100, (round.position / round.total) * 100) + '%';
    if (round.combo > 1) {
      els.comboPill.textContent = '連對 ' + round.combo;
      els.comboPill.hidden = false;
    } else {
      els.comboPill.hidden = true;
    }
    els.questionNode.textContent = question.node_title;
    els.questionStem.innerHTML = formatStem(question.stem, question.highlight_word, !!round.retry);
    els.retryNote.hidden = !round.retry;

    const answer = state.answer;
    els.options.innerHTML = question.options.map((option, index) => {
      let className = 'option';
      if (answer) {
        className += ' is-dim';
        if (option.text === answer.feedback.correctOption) className += ' is-correct';
        if (option.id === answer.optionId && !answer.feedback.correct) className += ' is-wrong';
      }
      return '<button type="button" class="' + className + '" data-option="' + esc(option.id) + '"' + (answer ? ' disabled' : '') + '>' +
        '<span class="option-key">' + String.fromCharCode(65 + index) + '</span>' +
        '<span>' + esc(option.text) + '</span>' +
        '</button>';
    }).join('');

    if (answer) {
      const feedback = answer.feedback;
      els.feedback.hidden = false;
      els.feedback.className = 'feedback ' + (feedback.correct ? 'is-correct' : 'is-wrong');
      els.feedbackIcon.textContent = feedback.correct ? '✓' : '!';
      els.feedbackTitle.textContent = feedback.correct ? '答對了' : '再留意一下題眼';
      els.feedbackAnswer.textContent = feedback.correct
        ? '正確答案：' + feedback.correctOption
        : '正確答案：' + feedback.correctOption;
      els.feedbackTip.textContent = feedback.ruleTip ? '口訣：' + feedback.ruleTip : '';
      els.feedbackTip.hidden = !feedback.ruleTip;
      const highlight = feedback.highlightWord ? '題眼：' + feedback.highlightWord + '。' : '';
      els.feedbackExplain.textContent = highlight + (feedback.explanation || '');
      els.feedbackExplain.hidden = !els.feedbackExplain.textContent;
      els.feedbackContinue.hidden = false;
      els.feedbackContinue.textContent = '下一題';
    } else {
      els.feedback.hidden = true;
    }
  }

  async function startTask(taskId) {
    try {
      const round = await api('/tasks/' + encodeURIComponent(taskId) + '/start', { method: 'POST' });
      state.round = round;
      state.answer = null;
      state.feedback = null;
      state.childView = 'round';
      setMode('child');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast(error.message);
    }
  }

  async function answerQuestion(optionId) {
    if (!state.round || state.answer) return;
    try {
      $$('[data-option]').forEach(button => { button.disabled = true; });
      const feedback = await api('/rounds/' + encodeURIComponent(state.round.roundId) + '/answer', {
        method: 'POST',
        body: { optionId }
      });
      state.answer = { optionId, feedback };
      if (feedback.total) state.round.total = feedback.total;
      state.round.combo = feedback.combo;
      renderRound();
      playTone(feedback.correct);
      els.feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      toast(error.message);
      $$('[data-option]').forEach(button => { button.disabled = false; });
    }
  }

  async function advanceRound() {
    if (!state.round || !state.answer || state.advancing) return;
    state.advancing = true;
    try {
      const next = await api('/rounds/' + encodeURIComponent(state.round.roundId) + '/next', { method: 'POST' });
      state.answer = null;
      state.feedback = null;
      if (next.done) {
        state.childView = 'summary';
        state.summary = next.summary;
        renderChild();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        refreshData().catch(error => toast(error.message));
      } else {
        state.round = next;
        renderRound();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      toast(error.message);
    } finally {
      state.advancing = false;
    }
  }

  function renderSummary() {
    const summary = state.summary;
    if (!summary) return;
    els.summaryTitle.textContent = summary.accuracy >= 90 ? '漂亮的一輪！' : summary.accuracy >= 70 ? '穩穩進步' : '再來一輪會更好';
    els.summaryStats.innerHTML = [
      '<div class="summary-stat"><strong>' + summary.accuracy + '%</strong><span>本輪正確率</span></div>',
      '<div class="summary-stat"><strong>' + summary.newlyMastered + '</strong><span>新掌握題數</span></div>',
      '<div class="summary-stat"><strong>' + summary.answered + '</strong><span>作答次數</span></div>'
    ].join('');
    if (summary.task) {
      els.summaryProgress.innerHTML = '<p><span>本輪完成</span><span>' + Number(summary.total || 0) + ' / ' + Number(summary.total || 0) + ' 題</span></p>' +
        '<p><span>任務掌握</span><span>' + summary.task.mastered + ' / ' + summary.task.total + ' 題</span></p>' +
        '<span class="progress-track"><span style="width:' + Number(summary.task.progress || 0) + '%"></span></span>' +
        '<p class="summary-note">掌握需跨天連續答對 ' + Number(summary.task.pass_streak || 3) + ' 次；今天先練熟，下次再答對會繼續累積。</p>';
    } else {
      els.summaryProgress.innerHTML = '';
    }
    if (summary.wrongQuestions && summary.wrongQuestions.length) {
      els.summaryWrong.innerHTML = '<h3>這一輪遇過的錯題</h3><ul>' + summary.wrongQuestions.map(item => {
        return '<li><strong>' + esc(item.stem) + '</strong>正確答案：' + esc(item.correct_option) + ' · 錯了 ' + item.count + ' 次</li>';
      }).join('') + '</ul>';
    } else {
      els.summaryWrong.innerHTML = '<h3>這一輪沒有錯題</h3><p class="muted">保持這個節奏，下一輪繼續。</p>';
    }
  }

  function assignPickerHTML() {
    const users = state.users || [];
    if (!users.length) {
      return '<div class="field field-full"><span class="field-label">指派給</span><p class="assign-hint">尚未載入用戶；不選小孩時會派給所有用戶。</p></div>';
    }
    const chips = users.map(user => {
      const active = state.selectedUsers.has(String(user.id));
      return '<button type="button" class="assign-chip' + (active ? ' is-active' : '') + '" data-assign-user="' + esc(user.id) + '">' +
        (user.role === 'admin' ? '👑 ' : '👦 ') + esc(user.nickname || user.username) +
        '</button>';
    }).join('');
    return '<div class="field field-full"><span class="field-label">指派給</span>' +
      '<div class="assign-picker" id="task-user-picker">' +
        '<button type="button" class="assign-chip assign-special' + (state.selectedUsers.size ? '' : ' is-active') + '" data-assign-all-users>🌐 所有用戶</button>' +
        '<button type="button" class="assign-chip assign-special" data-assign-select-all>全選</button>' +
        chips +
      '</div>' +
      '<p class="assign-hint" id="task-user-hint">' + (state.selectedUsers.size ? '已選 ' + state.selectedUsers.size + ' 個用戶' : '不選小孩＝派給所有用戶') + '</p>' +
      '</div>';
  }

  function syncAssignPicker() {
    const picker = $('#task-user-picker');
    if (!picker) return;
    $$('[data-assign-user]', picker).forEach(button => {
      button.classList.toggle('is-active', state.selectedUsers.has(button.getAttribute('data-assign-user')));
    });
    const all = $('[data-assign-all-users]', picker);
    if (all) all.classList.toggle('is-active', state.selectedUsers.size === 0);
    const hint = $('#task-user-hint');
    if (hint) hint.textContent = state.selectedUsers.size
      ? '已選 ' + state.selectedUsers.size + ' 個用戶'
      : '不選小孩＝派給所有用戶';
  }

  function taskFormHTML() {
    const nodes = state.overview ? state.overview.nodes : [];
    const grouped = {};
    nodes.forEach(node => {
      if (!grouped[node.category]) grouped[node.category] = [];
      grouped[node.category].push(node);
    });
    const nodeOptions = Object.keys(grouped).map(category => {
      return '<div class="field-full"><span class="field-label">' + esc(category) + '</span><div class="node-picker">' +
        grouped[category].map(node => '<label class="check-row"><input type="checkbox" name="node" value="' + esc(node.node_id) + '"><span>' + esc(node.title) + '</span><em>' + node.questionCount + ' 題</em></label>').join('') +
        '</div></div>';
    }).join('');
    const pinned = state.allQuestions.map(question => {
      return '<label class="check-row"><input type="checkbox" name="pinned" value="' + esc(question.question_id) + '"><span>' + esc(question.stem) + '</span><em>' + esc(nodeName(question.node_id)) + '</em></label>';
    }).join('');

    return '<section class="panel-section">' +
      '<h2>建立新任務</h2>' +
      '<p>只有管理員可以建立任務。勾選語法點後，系統會從中抽出指定題數，建立後題目固定；也可以展開進階選項直接指定題目。</p>' +
      '<form id="task-form">' +
        '<div class="form-grid">' +
          '<label class="field field-full"><span class="field-label">任務名稱</span><input class="input" name="task_name" maxlength="40" required placeholder="例如：三單動詞專項突破"></label>' +
          assignPickerHTML() +
          '<label class="field"><span class="field-label">任務題數</span><select class="select" name="batch_size"><option value="5">5 題</option><option value="10" selected>10 題</option><option value="15">15 題</option><option value="20">20 題</option></select></label>' +
          '<label class="field"><span class="field-label">掌握連對次數</span><select class="select" name="pass_streak"><option value="2">2 次</option><option value="3" selected>3 次</option><option value="4">4 次</option></select></label>' +
          nodeOptions +
          '<details class="field field-full"><summary class="text-link">進階：指定題目（可選）</summary>' +
            '<p class="assign-hint">指定題目會全部納入任務；若多於任務題數，任務會以指定題目數為準。</p>' +
            '<div class="node-picker" style="margin-top:8px">' + (pinned || '<p class="muted">題庫載入中…</p>') + '</div></details>' +
        '</div>' +
        '<p class="assign-hint">任務題數建立後固定，之後新增題目不影響這個任務；所選題目不足時以實際題數建立；掌握需跨天連續答對指定次數。</p>' +
        '<button type="submit" class="btn btn-primary">建立任務</button>' +
      '</form>' +
      '</section>';
  }

  function taskAdminHTML(items) {
    const first = items[0];
    const nodes = (first.target_nodes || []).map(id => nodeName(id)).join('、');
    const allScope = first.scope === 'all';
    const own = items.find(task => String(task.userId) === String(state.user.id));
    const rows = items.map(task => {
      const wrongOpen = String(state.wrongTaskId) === String(task.task_id);
      const wrong = wrongOpen
        ? '<div class="wrong-list"><p><strong>頑固錯題</strong></p>' +
          (state.wrongList.length
            ? state.wrongList.slice(0, 6).map(item => '<p><strong>' + esc(item.stem) + '</strong> 錯 ' + item.total_wrong + ' 次</p>').join('')
            : '<p>這個任務還沒有錯題紀錄。</p>') +
          '</div>'
        : '';
      return '<div class="assignee-row">' +
          '<span class="assignee-name">' + (task.role === 'admin' ? '👑 ' : '👦 ') + esc(task.username || '') + '</span>' +
          '<span class="assignee-score">掌握 ' + task.mastered + ' / ' + task.total + ' · 已練 ' + Number(task.attempted || 0) + ' / ' + task.total + '</span>' +
          '<span class="assignee-progress"><span class="progress-track"><span style="width:' + Number(task.progress || 0) + '%"></span></span></span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-wrong-task="' + esc(task.task_id) + '">錯題 ' + Number(task.wrong || 0) + '</button>' +
        '</div>' + wrong;
    }).join('');

    return '<article class="task-admin">' +
      '<div>' +
        '<h3>' + esc(first.task_name) +
          (allScope ? '<span class="assign-scope">🌐 所有用戶</span>' : '') +
        '</h3>' +
        '<div class="task-admin-meta"><span>' + esc(nodes || '指定題目') + '</span><span>任務 ' + Number((first.question_ids || []).length) + ' 題</span>' +
          (Number(first.batch_size || 0) < Number((first.question_ids || []).length) ? '<span>每輪 ' + first.batch_size + ' 題</span>' : '') +
          '<span>跨天連對 ' + Number(first.pass_streak || 3) + ' 次</span><span>👥 ' + items.length + ' 個帳戶</span></div>' +
        '<div class="assignee-list">' + rows + '</div>' +
      '</div>' +
      '<div class="task-admin-actions">' +
        (own ? '<button type="button" class="btn btn-primary btn-sm" data-start-task="' + esc(own.task_id) + '">開始</button>' : '') +
        '<button type="button" class="btn btn-danger btn-sm" data-archive-task="' + esc(first.task_id) + '">歸檔</button>' +
      '</div>' +
      '</article>';
  }

  function renderParentTasks() {
    if (!state.overview) return;
    const groups = new Map();
    (state.adminTasks || []).forEach(task => {
      const key = task.groupId || task.task_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    });
    const cards = [...groups.values()].map(taskAdminHTML).join('');
    els.parentTasks.innerHTML = taskFormHTML() +
      '<section class="panel-section"><h2>任務看板</h2><p>指派後每個小孩有獨立進度；不選小孩時會建立給所有用戶。</p><div class="task-admin-list">' +
      (cards || '<div class="empty-state"><h3>還沒有任務</h3><p>先在上方建立一個任務。</p></div>') +
      '</div></section>';
  }

  function questionRowHTML(question) {
    const mastery = question.mastery;
    const detail = mastery && mastery.total_attempts
      ? '練習 ' + mastery.total_attempts + ' 次 · 錯 ' + (mastery.total_wrong || 0) + ' 次 · 盒子 ' + (mastery.box_level || 0)
      : '尚未練習';
    return '<div class="question-row">' +
      '<div><p>' + esc(question.stem) + '</p><small>' + esc(nodeName(question.node_id)) + ' · 正確答案：' + esc(question.correct_option) + ' · ' + detail + '</small></div>' +
      '<div class="question-row-actions">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-edit-question="' + esc(question.question_id) + '">編輯</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-delete-question="' + esc(question.question_id) + '">刪除</button>' +
      '</div>' +
      '</div>';
  }

  function importResultHTML(result) {
    if (!result) return '';
    if (result.mode === 'replace') {
      return '<div class="import-result">全量覆蓋完成：共 ' + result.total + ' 題（沿用 ' + result.reused + ' 題，新增 ' + result.added + ' 題，移除 ' + result.removed + ' 題）' +
        (result.masteryRemoved ? '；清除 ' + result.masteryRemoved + ' 條熟練度記錄' : '') +
        (result.tasksUpdated ? '；更新 ' + result.tasksUpdated + ' 個任務' : '') +
        (result.tasksArchived ? '；歸檔 ' + result.tasksArchived + ' 個空任務' : '') + '。</div>';
    }
    return '<div class="import-result' + (result.errors && result.errors.length ? ' has-error' : '') + '">已新增 ' + result.added + ' 題，略過 ' + result.skipped + ' 題' +
      (result.errors && result.errors.length ? '；' + result.errors.slice(0, 3).map(item => '第 ' + item.row + ' 行：' + item.error).join('；') : '') + '</div>';
  }

  function renderBank() {
    if (!state.overview) return;
    const nodes = state.overview.nodes || [];
    const filter = state.selectedNode || '';
    const list = state.allQuestions.filter(question => !filter || question.node_id === filter);
    const editing = state.editingQuestion;
    const filterOptions = '<option value="">全部語法點</option>' + nodes.map(node => {
      return '<option value="' + esc(node.node_id) + '"' + (node.node_id === filter ? ' selected' : '') + '>' + esc(node.category) + ' · ' + esc(node.title) + '</option>';
    }).join('');
    const nodeOptions = nodes.map(node => '<option value="' + esc(node.node_id) + '"' + (editing && editing.node_id === node.node_id ? ' selected' : '') + '>' + esc(node.title) + '</option>').join('');
    const result = importResultHTML(state.importResult);

    els.parentBank.innerHTML = '<section class="panel-section">' +
      '<h2>題庫</h2>' +
      '<p>題目按語法點共享；熟練度按目前登入的帳戶分開記錄。</p>' +
      '<div class="question-toolbar"><select class="select" id="bank-node-filter">' + filterOptions + '</select><span class="muted">' + list.length + ' 題</span><button type="button" class="btn btn-soft btn-sm" data-export-bank="json">匯出 JSON</button><button type="button" class="btn btn-soft btn-sm" data-export-bank="csv">匯出 CSV</button><button type="button" class="btn btn-soft btn-sm" data-copy-prompt>複製 AI 出題提示詞</button></div>' +
      '<div class="question-list">' + (list.length ? list.map(questionRowHTML).join('') : '<div class="empty-state"><h3>這個語法點還沒有題目</h3><p>可在下方新增，或使用批量匯入。</p></div>') + '</div>' +
      '</section>' +
      '<section class="panel-section">' +
      '<h2>' + (editing ? '編輯題目' : '新增題目') + '</h2>' +
      '<p>' + (editing ? '修改後會即時套用到所有任務。' : '題幹請用 ____ 表示空格；干擾項至少兩個。') + '</p>' +
      '<form id="question-form">' +
        '<input type="hidden" name="question_id" value="' + esc(editing ? editing.question_id : '') + '">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">語法點</span><select class="select" name="node_id" required>' + nodeOptions + '</select></label>' +
          '<label class="field"><span class="field-label">題眼提示詞</span><input class="input" name="highlight_word" value="' + esc(editing ? editing.highlight_word : '') + '" placeholder="例如 every day"></label>' +
          '<label class="field field-full"><span class="field-label">題幹</span><input class="input" name="stem" required value="' + esc(editing ? editing.stem : '') + '" placeholder="She ____ to school every day."></label>' +
          '<label class="field"><span class="field-label">正確選項</span><input class="input" name="correct_option" required value="' + esc(editing ? editing.correct_option : '') + '"></label>' +
          '<label class="field"><span class="field-label">干擾項 1</span><input class="input" name="distractor_1" required value="' + esc(editing ? (editing.distractors[0] || '') : '') + '"></label>' +
          '<label class="field"><span class="field-label">干擾項 2</span><input class="input" name="distractor_2" required value="' + esc(editing ? (editing.distractors[1] || '') : '') + '"></label>' +
          '<label class="field"><span class="field-label">干擾項 3（可選）</span><input class="input" name="distractor_3" value="' + esc(editing ? (editing.distractors[2] || '') : '') + '"></label>' +
          '<label class="field field-full"><span class="field-label">解析</span><textarea class="textarea" name="explanation" placeholder="面向小朋友的一句話解析">' + esc(editing ? editing.explanation : '') + '</textarea></label>' +
        '</div>' +
        '<div class="import-actions"><button type="submit" class="btn btn-primary">' + (editing ? '更新題目' : '新增題目') + '</button>' + (editing ? '<button type="button" class="btn btn-ghost" data-cancel-edit>取消編輯</button>' : '') + '</div>' +
      '</form>' +
      '</section>' +
      '<section class="panel-section import-box">' +
      '<h2>批量匯入</h2>' +
      '<p>貼上 JSON 陣列或 CSV。欄位：node_id、stem、highlight_word、correct_option、distractor_1、distractor_2、distractor_3、explanation。可先匯出題庫交給 AI，要求避開已存在的 node_id 與題幹。</p>' +
      '<textarea class="textarea code" id="import-text" placeholder=\'[{"node_id":"TENSE_01","stem":"She ____ every day.","correct_option":"goes","distractor_1":"go","distractor_2":"going","explanation":"三單動詞加 -es。"}]\'></textarea>' +
      '<div class="import-actions"><button type="button" class="btn btn-primary" data-import>追加匯入</button><button type="button" class="btn btn-danger" data-import-replace>全量覆蓋題庫</button><button type="button" class="btn btn-ghost" data-copy-prompt>複製 AI 提示詞</button></div>' +
      '<p class="muted">全量覆蓋會用貼上的題庫取代整個題庫；未保留題目的熟練度與錯題記錄會移除，失去題目的任務會歸檔。建議先匯出備份。</p>' +
      result +
      '</section>';
  }

  function renderTree() {
    if (!state.overview) return;
    const nodes = state.overview.nodes || [];
    const groups = {};
    nodes.forEach(node => {
      if (!groups[node.category]) groups[node.category] = [];
      groups[node.category].push(node);
    });
    els.treeCount.textContent = (state.overview.questionCount || 0) + ' 題';
    els.tree.innerHTML = Object.keys(groups).map(category => {
      return '<div class="tree-group"><h3>' + esc(category) + '</h3>' + groups[category].map(node => {
        return '<button type="button" class="tree-node' + (node.node_id === state.selectedNode ? ' is-active' : '') + '" data-node="' + esc(node.node_id) + '">' +
          '<span class="tree-dot"></span><span>' + esc(node.title) + '</span><span class="tree-count">' + node.masteredCount + '/' + node.questionCount + '</span>' +
          '</button>';
      }).join('') + '</div>';
    }).join('');
  }

  function formatStatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('zh-HK', {
      timeZone: 'Asia/Hong_Kong',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function statBar(value) {
    const width = Math.max(0, Math.min(100, Number(value) || 0));
    return '<span class="progress-track"><span style="width:' + width + '%"></span></span>';
  }

  function renderAnalytics() {
    if (!els.parentAnalytics) return;
    if (!state.adminStats) {
      els.parentAnalytics.innerHTML = '<section class="panel-section">' +
        '<div class="stats-head"><div><h2>學習統計</h2><p>按用戶查看覆蓋率、薄弱語法點與最近練習。</p></div>' +
        (state.statsLoading ? '<span class="muted">載入中…</span>' : '<button type="button" class="btn btn-soft btn-sm" data-refresh-stats>重新載入</button>') +
        '</div>' +
        (state.statsError ? '<div class="stats-error">載入失敗：' + esc(state.statsError) + '</div>' : '<div class="stats-empty">統計載入中…</div>') +
        '</section>';
      return;
    }

    const users = state.adminStats.users || [];
    if (!users.length) {
      els.parentAnalytics.innerHTML = '<section class="panel-section"><h2>學習統計</h2><div class="stats-empty">還沒有用戶資料。</div></section>';
      return;
    }

    const preferred = users.find(user => {
      return state.user && String(user.id) === String(state.user.id) && user.stats && user.stats.totalAttempts > 0;
    }) || users.find(user => user.stats && user.stats.totalAttempts > 0) || users[0];
    const selected = users.find(user => String(user.id) === String(state.statsUserId)) || preferred;
    state.statsUserId = selected.id;
    const meta = state.adminStats.meta || {};
    const weakNodeIds = new Set((selected.weakNodes || []).map(node => node.node_id));

    const overview = users.map(user => {
      const stats = user.stats || {};
      const accuracy = Number(stats.totalAttempts || 0) ? Number(stats.accuracy || 0) + '%' : '—';
      return '<tr' + (String(user.id) === String(selected.id) ? ' class="is-active"' : '') + '>' +
        '<td><button type="button" class="stats-user-link" data-stats-user="' + esc(user.id) + '">' + esc(user.nickname || user.username) + '</button>' +
        '<small>@' + esc(user.username) + (user.role === 'admin' ? ' · 管理員' : '') + '</small></td>' +
        '<td class="num">' + Number(stats.attempted || 0) + ' / ' + Number(stats.total || 0) + '<small>' + Number(stats.coverage || 0) + '%</small></td>' +
        '<td class="num">' + Number(stats.mastered || 0) + '<small>' + Number(stats.mastery || 0) + '%</small></td>' +
        '<td class="num">' + accuracy + '</td>' +
        '<td class="num">' + Number(stats.totalAttempts || 0) + '</td>' +
        '<td class="num">' + Number(stats.wrongQuestionCount || 0) + '</td>' +
        '<td class="num">' + Number(stats.recent7 || 0) + '</td>' +
        '<td>' + esc(formatStatDate(stats.lastPracticed)) + '</td>' +
        '</tr>';
    }).join('');

    const matrixNodes = users[0].nodes || [];
    const matrixHead = matrixNodes.map(node => {
      const label = (node.category ? node.category + ' · ' : '') + node.title;
      return '<th class="num" title="' + esc(label) + '">' + esc(node.title) + '</th>';
    }).join('');
    const matrixRows = users.map(user => {
      const byNode = new Map((user.nodes || []).map(node => [node.node_id, node]));
      return '<tr' + (String(user.id) === String(selected.id) ? ' class="is-active"' : '') + '>' +
        '<td><button type="button" class="stats-user-link" data-stats-user="' + esc(user.id) + '">' + esc(user.nickname || user.username) + '</button>' +
        '<small>@' + esc(user.username) + '</small></td>' +
        matrixNodes.map(node => {
          const row = byNode.get(node.node_id) || {};
          const attempted = Number(row.attempted || 0);
          return '<td class="num' + (attempted ? '' : ' is-zero') + '"><strong class="stats-matrix-value">' + Number(row.coverage || 0) + '%</strong><small>' + attempted + '/' + Number(row.total || 0) + '</small></td>';
        }).join('') +
        '</tr>';
    }).join('');

    const nodeRows = (selected.nodes || []).map(node => {
      const weak = weakNodeIds.has(node.node_id);
      const accuracy = Number(node.totalAttempts || 0) ? Number(node.accuracy || 0) + '%' : '—';
      return '<tr>' +
        '<td><strong>' + esc(node.title) + '</strong>' + (weak ? '<span class="stats-tag">薄弱</span>' : '') + '<small>' + esc(node.category) + '</small></td>' +
        '<td class="num"><div class="stats-coverage">' + statBar(node.coverage) + '<em>' + Number(node.attempted || 0) + '/' + Number(node.total || 0) + ' · ' + Number(node.coverage || 0) + '%</em></div></td>' +
        '<td class="num">' + Number(node.mastered || 0) + '<small>' + Number(node.mastery || 0) + '%</small></td>' +
        '<td class="num">' + Number(node.wrongQuestions || 0) + '</td>' +
        '<td class="num">' + Number(node.totalAttempts || 0) + '</td>' +
        '<td class="num">' + accuracy + '</td>' +
        '</tr>';
    }).join('');

    const weakNodes = (selected.weakNodes || []).map(node => {
      return '<li><strong>' + esc(node.title) + '</strong><small>覆蓋 ' + Number(node.attempted || 0) + '/' + Number(node.total || 0) + ' · 正確率 ' + Number(node.accuracy || 0) + '% · 薄弱題 ' + Number(node.wrongQuestions || 0) + '</small></li>';
    }).join('');

    const weakQuestions = (selected.weakQuestions || []).map(question => {
      return '<li><strong>' + esc(question.stem) + '</strong><small>' + esc(question.node_title) + ' · 錯 ' + Number(question.total_wrong || 0) + ' 次 / 練 ' + Number(question.total_attempts || 0) + ' 次 · 盒子 ' + Number(question.box_level || 0) + '</small></li>';
    }).join('');

    const recentAttempts = (selected.recentAttempts || []).map(attempt => {
      return '<li><span class="stats-result ' + (attempt.correct ? 'is-correct' : 'is-wrong') + '">' + (attempt.correct ? '✓' : '✕') + '</span>' +
        '<div><strong>' + esc(attempt.stem) + '</strong><small>' + esc(attempt.node_title) + ' · ' + esc(formatStatDate(attempt.practicedAt)) + '</small></div></li>';
    }).join('');

    const daily = (selected.daily || []).map(day => {
      const dayAccuracy = Number(day.attempts || 0) ? Number(day.accuracy || 0) + '%' : '—';
      return '<div class="stats-day"><span>' + esc(String(day.date || '').slice(5)) + '</span><strong>' + Number(day.attempts || 0) + '</strong><em>' + dayAccuracy + '</em></div>';
    }).join('');

    const stats = selected.stats || {};
    const accuracy = Number(stats.totalAttempts || 0) ? Number(stats.accuracy || 0) + '%' : '—';
    const loading = state.statsLoading ? '<span class="muted">更新中…</span>' : '';
    const error = state.statsError ? '<div class="stats-error">更新失敗：' + esc(state.statsError) + '</div>' : '';

    els.parentAnalytics.innerHTML =
      '<section class="panel-section">' +
        '<div class="stats-head"><div><h2>學習統計</h2><p>共 ' + Number(meta.users || users.length) + ' 位用戶 · ' + Number(meta.questions || 0) + ' 道題 · ' + Number(meta.nodes || 0) + ' 個語法點</p></div>' +
        '<div class="stats-head-actions">' + loading + '<button type="button" class="btn btn-soft btn-sm" data-refresh-stats' + (state.statsLoading ? ' disabled' : '') + '>重新整理</button></div></div>' +
        error +
        '<div class="stats-table-wrap"><table class="stats-table">' +
          '<thead><tr><th>用戶</th><th class="num">覆蓋</th><th class="num">掌握</th><th class="num">正確率</th><th class="num">練習次數</th><th class="num">薄弱題</th><th class="num">近 7 天</th><th>最後練習</th></tr></thead>' +
          '<tbody>' + overview + '</tbody>' +
        '</table></div>' +
        '<p class="muted">點擊用戶名可查看該用戶的每個語法點覆蓋、薄弱點與最近作答。覆蓋 = 練過的題目 / 總題目；薄弱題 = 未掌握且曾答錯的題目。</p>' +
      '</section>' +
      '<section class="panel-section">' +
        '<h2>每人 × 語法點覆蓋</h2><p>每格為覆蓋率，下方小字為已練 / 總題數；可橫向滑動查看全部語法點，點擊用戶名可切換下方詳情。</p>' +
        '<div class="stats-table-wrap"><table class="stats-table stats-matrix">' +
          '<thead><tr><th>用戶</th>' + matrixHead + '</tr></thead>' +
          '<tbody>' + matrixRows + '</tbody>' +
        '</table></div>' +
      '</section>' +
      '<section class="panel-section" id="stats-detail">' +
        '<div class="stats-head"><div><h2>' + esc(selected.nickname || selected.username) + ' 的詳情</h2>' +
          '<p>最後練習：' + esc(formatStatDate(stats.lastPracticed)) + ' · 更新於 ' + esc(formatStatDate(state.adminStats.generatedAt)) + '</p></div></div>' +
        '<div class="stats-summary">' +
          '<div class="stats-stat"><strong>' + Number(stats.attempted || 0) + '/' + Number(stats.total || 0) + '</strong><span>覆蓋題目</span><small>' + Number(stats.coverage || 0) + '%</small></div>' +
          '<div class="stats-stat"><strong>' + Number(stats.mastered || 0) + '</strong><span>已掌握</span><small>' + Number(stats.mastery || 0) + '%</small></div>' +
          '<div class="stats-stat"><strong>' + Number(stats.totalAttempts || 0) + '</strong><span>練習次數</span></div>' +
          '<div class="stats-stat"><strong>' + accuracy + '</strong><span>正確率</span><small>答錯 ' + Number(stats.totalWrong || 0) + ' 次</small></div>' +
          '<div class="stats-stat"><strong>' + Number(stats.wrongQuestionCount || 0) + '</strong><span>薄弱題</span><small>未掌握且曾答錯</small></div>' +
          '<div class="stats-stat"><strong>' + Number(stats.recent7 || 0) + '</strong><span>近 7 天作答</span></div>' +
        '</div>' +
        '<div class="stats-days">' + daily + '</div>' +
      '</section>' +
      '<section class="panel-section">' +
        '<h2>語法點覆蓋</h2><p>按語法點查看覆蓋、掌握、薄弱題與正確率。</p>' +
        '<div class="stats-table-wrap"><table class="stats-table">' +
          '<thead><tr><th>語法點</th><th class="num">覆蓋</th><th class="num">掌握</th><th class="num">薄弱題</th><th class="num">練習次數</th><th class="num">正確率</th></tr></thead>' +
          '<tbody>' + nodeRows + '</tbody>' +
        '</table></div>' +
      '</section>' +
      '<section class="panel-section">' +
        '<div class="stats-columns">' +
          '<div class="stats-card"><h3>薄弱語法點</h3><p>按正確率與覆蓋率排序；只列練過至少一題的語法點。</p>' +
            (weakNodes ? '<ul class="stats-list">' + weakNodes + '</ul>' : '<div class="stats-empty">暫無足夠練習數據。</div>') + '</div>' +
          '<div class="stats-card"><h3>頑固錯題</h3><p>未掌握且曾答錯，按錯誤次數排序，最多顯示 10 題。</p>' +
            (weakQuestions ? '<ul class="stats-list">' + weakQuestions + '</ul>' : '<div class="stats-empty">目前沒有未掌握的錯題。</div>') + '</div>' +
        '</div>' +
      '</section>' +
      '<section class="panel-section">' +
        '<h2>最近練習</h2><p>最近 12 次作答紀錄。</p>' +
        (recentAttempts ? '<ul class="stats-attempts">' + recentAttempts + '</ul>' : '<div class="stats-empty">還沒有作答紀錄。</div>') +
      '</section>';
  }

  async function loadAdminStats() {
    if (!isAdmin() || state.statsLoading) return;
    state.statsLoading = true;
    state.statsError = '';
    if (state.parentTab === 'stats') renderAnalytics();
    try {
      state.adminStats = await api('/admin/stats');
    } catch (error) {
      if (error.status === 401) {
        showLocked();
        return;
      }
      state.statsError = error.message;
    } finally {
      state.statsLoading = false;
      if (state.parentTab === 'stats') renderAnalytics();
    }
  }

  function renderParent() {
    if (!state.overview) return;
    const stats = state.overview.stats || { mastered: 0, totalAttempts: 0, accuracy: 0 };
    const tasks = state.adminTasks || [];
    const taskGroups = new Set(tasks.map(task => task.groupId || task.task_id));
    const wrongTotal = tasks.reduce((sum, task) => sum + (task.wrong || 0), 0);
    els.parentStats.innerHTML = [
      '<div class="parent-stat"><strong>' + (state.overview.questionCount || 0) + '</strong><span>題庫總題數</span></div>',
      '<div class="parent-stat"><strong>' + (stats.mastered || 0) + '</strong><span>我的掌握題數</span></div>',
      '<div class="parent-stat"><strong>' + taskGroups.size + '</strong><span>進行中任務</span></div>',
      '<div class="parent-stat"><strong>' + wrongTotal + '</strong><span>待攻克錯題</span></div>'
    ].join('');
    renderTree();
    renderParentTasks();
    renderBank();
    renderAnalytics();
    syncParentTabs();
  }

  function syncParentTabs() {
    $$('[data-parent-tab]').forEach(button => {
      const active = button.getAttribute('data-parent-tab') === state.parentTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    els.parentTasks.hidden = state.parentTab !== 'tasks';
    els.parentBank.hidden = state.parentTab !== 'bank';
    if (els.parentAnalytics) els.parentAnalytics.hidden = state.parentTab !== 'stats';
  }

  async function createTask(form) {
    const name = form.querySelector('[name="task_name"]').value.trim();
    if (!name) return toast('請填寫任務名稱');
    const nodes = $$('input[name="node"]:checked', form).map(input => input.value);
    const pinned = $$('input[name="pinned"]:checked', form).map(input => input.value);
    if (!nodes.length && !pinned.length) return toast('請至少選擇一個語法點或指定題目');
    try {
      const result = await api('/tasks', {
        method: 'POST',
        body: {
          task_name: name,
          target_nodes: nodes,
          question_ids: pinned,
          userIds: [...state.selectedUsers],
          batch_size: parseInt(form.querySelector('[name="batch_size"]').value, 10),
          pass_streak: parseInt(form.querySelector('[name="pass_streak"]').value, 10)
        }
      });
      let message = '已建立任務';
      if (result && result.created) message += '（' + result.created + ' 個帳戶）';
      if (result && result.total) message += ' · ' + result.total + ' 題';
      if (result && result.requested > result.total) message += '（所選題目不足 ' + result.requested + ' 題）';
      toast(message);
      state.selectedUsers.clear();
      await refreshData();
      state.parentTab = 'tasks';
      renderParent();
    } catch (error) {
      toast(error.message);
    }
  }

  async function saveQuestion(form) {
    const questionId = form.querySelector('[name="question_id"]').value;
    const body = {
      node_id: form.querySelector('[name="node_id"]').value,
      stem: form.querySelector('[name="stem"]').value.trim(),
      highlight_word: form.querySelector('[name="highlight_word"]').value.trim(),
      correct_option: form.querySelector('[name="correct_option"]').value.trim(),
      distractors: [
        form.querySelector('[name="distractor_1"]').value.trim(),
        form.querySelector('[name="distractor_2"]').value.trim(),
        form.querySelector('[name="distractor_3"]').value.trim()
      ].filter(Boolean),
      explanation: form.querySelector('[name="explanation"]').value.trim()
    };
    try {
      if (questionId) {
        await api('/questions/' + encodeURIComponent(questionId), { method: 'PUT', body });
        toast('已更新題目');
      } else {
        await api('/questions', { method: 'POST', body });
        toast('已新增題目');
      }
      state.editingQuestion = null;
      await refreshData();
    } catch (error) {
      toast(error.message);
    }
  }

  async function importQuestions(mode) {
    const textarea = $('#import-text');
    if (!textarea || !textarea.value.trim()) return toast('請先貼上 JSON 或 CSV');
    const replace = mode === 'replace';
    if (replace) {
      const count = state.allQuestions.length;
      const message = '確定用貼上的題庫完全覆蓋現有 ' + count + ' 道題目嗎？\n\n' +
        '未保留題目的熟練度與錯題記錄會一併移除，失去題目的任務會被歸檔。\n\n' +
        '建議先匯出目前題庫備份。';
      if (!window.confirm(message)) return;
    }
    try {
      const result = await api('/questions/import', {
        method: 'POST',
        body: {
          text: textarea.value,
          mode: replace ? 'replace' : 'append',
          confirm: replace ? true : undefined
        }
      });
      state.importResult = result;
      textarea.value = '';
      await refreshData();
      toast(replace ? '已覆蓋題庫，共 ' + result.total + ' 題' : '已追加 ' + result.added + ' 題');
    } catch (error) {
      toast(error.message);
    }
  }

  async function exportBank(format) {
    try {
      const response = await fetch('/api/grammar/questions/export?format=' + encodeURIComponent(format), {
        credentials: 'include'
      });
      if (response.status === 401) {
        showLocked();
        return;
      }
      if (!response.ok) {
        let message = '匯出失敗（' + response.status + '）';
        try {
          const data = await response.json();
          if (data && data.error) message = data.error;
        } catch (error) {
          // Keep the status message.
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : 'grammar-questions.' + format;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('已匯出題庫（' + format.toUpperCase() + '）');
    } catch (error) {
      toast(error.message);
    }
  }

  async function copyPrompt() {
    const nodeId = state.selectedNode || (state.overview && state.overview.nodes[0] && state.overview.nodes[0].node_id);
    if (!nodeId) return;
    try {
      const data = await api('/import-prompt?node_id=' + encodeURIComponent(nodeId));
      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(data.prompt);
          copied = true;
        } catch (error) {
          copied = false;
        }
      }
      if (!copied) {
        const textarea = document.createElement('textarea');
        textarea.value = data.prompt;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast('已複製「' + nodeName(nodeId) + '」的 AI 出題提示詞');
    } catch (error) {
      toast(error.message);
    }
  }

  async function archiveTask(taskId) {
    if (!window.confirm('確定把這個任務歸檔嗎？已完成的熟練度會保留。')) return;
    try {
      await api('/tasks/' + encodeURIComponent(taskId), { method: 'PUT', body: { is_archived: true } });
      state.wrongTaskId = null;
      toast('已歸檔任務');
      await refreshData();
    } catch (error) {
      toast(error.message);
    }
  }

  async function showWrong(taskId) {
    try {
      const list = await api('/tasks/' + encodeURIComponent(taskId) + '/wrong');
      state.wrongTaskId = String(state.wrongTaskId) === String(taskId) ? null : taskId;
      state.wrongList = list;
      renderParentTasks();
    } catch (error) {
      toast(error.message);
    }
  }

  function deleteQuestion(questionId) {
    if (!window.confirm('確定刪除這道題目嗎？相關熟練度也會移除。')) return;
    api('/questions/' + encodeURIComponent(questionId), { method: 'DELETE' })
      .then(async () => {
        state.editingQuestion = null;
        toast('已刪除題目');
        await refreshData();
      })
      .catch(error => toast(error.message));
  }

  async function editQuestion(questionId) {
    const question = state.allQuestions.find(item => String(item.question_id) === String(questionId));
    if (!question) return;
    state.editingQuestion = question;
    state.parentTab = 'bank';
    renderParent();
    const form = $('#question-form');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function switchParentTab(tab) {
    state.parentTab = tab;
    syncParentTabs();
    if (tab === 'stats') {
      renderAnalytics();
      loadAdminStats();
    }
  }

  async function init() {
    try {
      const user = await request('/api/me');
      state.user = user;
      els.userChip.textContent = (user.nickname || user.username) + ' · @' + user.username;
      els.userChip.hidden = false;
      await loadUsers();
      await loadData();
      try {
        await loadQuestions();
      } catch (error) {
        if (error.status === 401) throw error;
      }
      els.locked.hidden = true;
      renderAll();
    } catch (error) {
      if (error.status !== 401) {
        showLocked();
        toast('載入失敗：' + error.message);
      }
    }
  }

  document.addEventListener('click', event => {
    const mode = event.target.closest('[data-mode]');
    if (mode) {
      setMode(mode.getAttribute('data-mode'));
      return;
    }

    const parentTab = event.target.closest('[data-parent-tab]');
    if (parentTab) {
      switchParentTab(parentTab.getAttribute('data-parent-tab'));
      return;
    }

    const statsUser = event.target.closest('[data-stats-user]');
    if (statsUser) {
      state.statsUserId = statsUser.getAttribute('data-stats-user');
      renderAnalytics();
      const detail = $('#stats-detail');
      if (detail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (event.target.closest('[data-refresh-stats]')) {
      loadAdminStats();
      return;
    }

    const assignUser = event.target.closest('[data-assign-user]');
    if (assignUser) {
      const id = assignUser.getAttribute('data-assign-user');
      if (state.selectedUsers.has(id)) state.selectedUsers.delete(id);
      else state.selectedUsers.add(id);
      syncAssignPicker();
      return;
    }

    if (event.target.closest('[data-assign-all-users]')) {
      state.selectedUsers.clear();
      syncAssignPicker();
      return;
    }

    if (event.target.closest('[data-assign-select-all]')) {
      state.users.forEach(user => state.selectedUsers.add(String(user.id)));
      syncAssignPicker();
      return;
    }

    const node = event.target.closest('[data-node]');
    if (node) {
      state.selectedNode = node.getAttribute('data-node');
      state.parentTab = 'bank';
      renderParent();
      return;
    }

    const start = event.target.closest('[data-start-task]');
    if (start) {
      startTask(start.getAttribute('data-start-task'));
      return;
    }

    const option = event.target.closest('[data-option]');
    if (option) {
      answerQuestion(option.getAttribute('data-option'));
      return;
    }

    if (event.target.closest('#feedback-continue')) {
      advanceRound();
      return;
    }

    if (event.target.closest('#quit-round') || event.target.closest('#summary-back')) {
      state.round = null;
      state.answer = null;
      state.summary = null;
      state.childView = 'hall';
      state.mode = 'child';
      renderAll();
      refreshData().catch(error => toast(error.message));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (event.target.closest('#summary-again')) {
      const taskId = state.summary && state.summary.task ? state.summary.task.task_id : null;
      if (taskId) startTask(taskId);
      return;
    }

    if (event.target.closest('#hall-parent-btn') || event.target.closest('#parent-child-btn')) {
      if (event.target.closest('#parent-child-btn')) {
        state.childView = 'hall';
        setMode('child');
      } else {
        setMode('parent');
      }
      return;
    }

    const wrong = event.target.closest('[data-wrong-task]');
    if (wrong) {
      showWrong(wrong.getAttribute('data-wrong-task'));
      return;
    }

    const archive = event.target.closest('[data-archive-task]');
    if (archive) {
      archiveTask(archive.getAttribute('data-archive-task'));
      return;
    }

    const edit = event.target.closest('[data-edit-question]');
    if (edit) {
      editQuestion(edit.getAttribute('data-edit-question'));
      return;
    }

    const remove = event.target.closest('[data-delete-question]');
    if (remove) {
      deleteQuestion(remove.getAttribute('data-delete-question'));
      return;
    }

    if (event.target.closest('[data-cancel-edit]')) {
      state.editingQuestion = null;
      renderParent();
      return;
    }

    const exportButton = event.target.closest('[data-export-bank]');
    if (exportButton) {
      exportBank(exportButton.getAttribute('data-export-bank'));
      return;
    }

    if (event.target.closest('[data-import-replace]')) {
      importQuestions('replace');
      return;
    }

    if (event.target.closest('[data-import]')) {
      importQuestions('append');
      return;
    }

    if (event.target.closest('[data-copy-prompt]')) {
      copyPrompt();
      return;
    }

    if (event.target.closest('#sound-btn')) {
      state.sound = !state.sound;
      els.soundBtn.classList.toggle('is-off', !state.sound);
      els.soundBtn.setAttribute('aria-label', state.sound ? '關閉音效' : '開啟音效');
      if (state.sound) playTone(true);
      toast(state.sound ? '音效已開啟' : '音效已關閉');
    }
  });

  document.addEventListener('change', event => {
    if (event.target.id === 'bank-node-filter') {
      state.selectedNode = event.target.value;
      renderBank();
    }
  });

  document.addEventListener('submit', event => {
    if (event.target.id === 'task-form') {
      event.preventDefault();
      createTask(event.target);
      return;
    }
    if (event.target.id === 'question-form') {
      event.preventDefault();
      saveQuestion(event.target);
    }
  });

  document.addEventListener('keydown', event => {
    if (state.mode !== 'child' || state.childView !== 'round' || !state.round) return;
    if (event.key >= '1' && event.key <= '4') {
      const buttons = $$('[data-option]');
      const button = buttons[parseInt(event.key, 10) - 1];
      if (button && !button.disabled) {
        event.preventDefault();
        answerQuestion(button.getAttribute('data-option'));
      }
    }
  });

  init();
})();
