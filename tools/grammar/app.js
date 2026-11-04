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
    allQuestions: [],
    questionsLoaded: false,
    editingQuestion: null,
    importResult: null,
    wrongTaskId: null,
    wrongList: [],
    round: null,
    answer: null,
    feedback: null,
    advanceTimer: null,
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
    soundBtn: $('#sound-btn'),
    parentStats: $('#parent-stats'),
    tree: $('#grammar-tree'),
    treeCount: $('#tree-question-count'),
    parentTasks: $('#parent-tasks'),
    parentBank: $('#parent-bank'),
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
    const [overview, ranking] = await Promise.all([
      api('/overview'),
      request('/api/platform/ranking')
    ]);
    state.overview = overview;
    state.ranking = Array.isArray(ranking) ? ranking : [];
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
    els.userChip.textContent = (state.user.nickname || state.user.username) + ' · @' + state.user.username;
    els.userChip.hidden = false;
    if (state.mode === 'parent') {
      els.childView.hidden = true;
      els.parentView.hidden = false;
      renderParent();
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
        '<span class="progress-ring" style="--p:' + Number(task.progress || 0) + '"><strong>' + Math.round(Number(task.progress || 0)) + '%</strong></span>' +
        '<span class="task-meta"><strong>' + task.mastered + ' / ' + task.total + ' 題</strong><span>每輪 ' + task.batch_size + ' 題 · 連對 ' + task.pass_streak + ' 次通關</span></span>' +
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
      els.taskGrid.innerHTML = '<div class="empty-state"><h3>還沒有任務花圃</h3><p>先到「家長設定」選幾個語法點，建立第一個任務。</p><button type="button" class="btn btn-primary" data-mode="parent">建立任務</button></div>';
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
    return safe.replace(/____/g, '<span class="blank">____</span>');
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
      els.feedbackContinue.textContent = feedback.correct ? '下一題' : '我知道了，繼續';
    } else {
      els.feedback.hidden = true;
    }
  }

  async function startTask(taskId) {
    try {
      window.clearTimeout(state.advanceTimer);
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
      if (feedback.correct) {
        state.advanceTimer = window.setTimeout(advanceRound, 1050);
      } else {
        els.feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (error) {
      toast(error.message);
      $$('[data-option]').forEach(button => { button.disabled = false; });
    }
  }

  async function advanceRound() {
    if (!state.round || !state.answer || state.advancing) return;
    state.advancing = true;
    window.clearTimeout(state.advanceTimer);
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
      els.summaryProgress.innerHTML = '<p><span>任務掌握進度</span><span>' + summary.task.mastered + ' / ' + summary.task.total + ' 題</span></p>' +
        '<span class="progress-track"><span style="width:' + Number(summary.task.progress || 0) + '%"></span></span>';
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
      '<p>勾選語法點，系統會自動把該節點下的題目匯入任務。也可以展開進階選項，直接指定題目。</p>' +
      '<form id="task-form">' +
        '<div class="form-grid">' +
          '<label class="field field-full"><span class="field-label">任務名稱</span><input class="input" name="task_name" maxlength="40" required placeholder="例如：三單動詞專項突破"></label>' +
          '<label class="field"><span class="field-label">每輪題量</span><select class="select" name="batch_size"><option value="5">5 題</option><option value="10" selected>10 題</option><option value="15">15 題</option><option value="20">20 題</option></select></label>' +
          '<label class="field"><span class="field-label">通關連對次數</span><select class="select" name="pass_streak"><option value="2">2 次</option><option value="3" selected>3 次</option><option value="4">4 次</option></select></label>' +
          nodeOptions +
          '<details class="field field-full"><summary class="text-link">進階：指定題目（可選）</summary><div class="node-picker" style="margin-top:8px">' + (pinned || '<p class="muted">題庫載入中…</p>') + '</div></details>' +
        '</div>' +
        '<button type="submit" class="btn btn-primary">建立任務</button>' +
      '</form>' +
      '</section>';
  }

  function taskAdminHTML(task) {
    const nodes = (task.target_nodes || []).map(id => nodeName(id)).join('、');
    const wrongOpen = String(state.wrongTaskId) === String(task.task_id);
    const wrong = wrongOpen && state.wrongList.length
      ? '<div class="wrong-list"><p><strong>頑固錯題</strong></p>' + state.wrongList.slice(0, 6).map(item => '<p><strong>' + esc(item.stem) + '</strong> 錯 ' + item.total_wrong + ' 次</p>').join('') + '</div>'
      : wrongOpen ? '<div class="wrong-list"><p>這個任務還沒有錯題紀錄。</p></div>' : '';
    return '<article class="task-admin">' +
      '<div>' +
        '<h3>' + esc(task.task_name) + '</h3>' +
        '<div class="task-admin-meta"><span>' + esc(nodes || '指定題目') + '</span><span>每輪 ' + task.batch_size + ' 題</span><span>連對 ' + task.pass_streak + ' 次</span><span>掌握 ' + task.mastered + ' / ' + task.total + '</span></div>' +
        '<div class="task-admin-progress"><span class="progress-track"><span style="width:' + Number(task.progress || 0) + '%"></span></span></div>' +
        wrong +
      '</div>' +
      '<div class="task-admin-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-start-task="' + esc(task.task_id) + '">開始</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-wrong-task="' + esc(task.task_id) + '">錯題榜</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-archive-task="' + esc(task.task_id) + '">歸檔</button>' +
      '</div>' +
      '</article>';
  }

  function renderParentTasks() {
    if (!state.overview) return;
    const tasks = state.overview.tasks || [];
    els.parentTasks.innerHTML = taskFormHTML() +
      '<section class="panel-section"><h2>任務看板</h2><p>任務只會出現在自己的帳戶；完成度按已掌握的題目計算。</p><div class="task-admin-list">' +
      (tasks.length ? tasks.map(taskAdminHTML).join('') : '<div class="empty-state"><h3>還沒有任務</h3><p>先在上方建立一個任務。</p></div>') +
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
    const result = state.importResult
      ? '<div class="import-result' + (state.importResult.errors && state.importResult.errors.length ? ' has-error' : '') + '">已新增 ' + state.importResult.added + ' 題，略過 ' + state.importResult.skipped + ' 題' + (state.importResult.errors && state.importResult.errors.length ? '；' + state.importResult.errors.slice(0, 3).map(item => '第 ' + item.row + ' 行：' + item.error).join('；') : '') + '</div>'
      : '';

    els.parentBank.innerHTML = '<section class="panel-section">' +
      '<h2>題庫</h2>' +
      '<p>題目按語法點共享；熟練度按目前登入的帳戶分開記錄。</p>' +
      '<div class="question-toolbar"><select class="select" id="bank-node-filter">' + filterOptions + '</select><span class="muted">' + list.length + ' 題</span><button type="button" class="btn btn-soft btn-sm" data-copy-prompt>複製 AI 出題提示詞</button></div>' +
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
      '<p>貼上 JSON 陣列或 CSV。欄位：node_id、stem、highlight_word、correct_option、distractor_1、distractor_2、distractor_3、explanation。</p>' +
      '<textarea class="textarea code" id="import-text" placeholder=\'[{"node_id":"TENSE_01","stem":"She ____ every day.","correct_option":"goes","distractor_1":"go","distractor_2":"going","explanation":"三單動詞加 -es。"}]\'></textarea>' +
      '<div class="import-actions"><button type="button" class="btn btn-primary" data-import>匯入題目</button><button type="button" class="btn btn-ghost" data-copy-prompt>複製 AI 提示詞</button></div>' +
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

  function renderParent() {
    if (!state.overview) return;
    const stats = state.overview.stats || { mastered: 0, totalAttempts: 0, accuracy: 0 };
    const tasks = state.overview.tasks || [];
    const wrongTotal = tasks.reduce((sum, task) => sum + (task.wrong || 0), 0);
    els.parentStats.innerHTML = [
      '<div class="parent-stat"><strong>' + (state.overview.questionCount || 0) + '</strong><span>題庫總題數</span></div>',
      '<div class="parent-stat"><strong>' + (stats.mastered || 0) + '</strong><span>已掌握題數</span></div>',
      '<div class="parent-stat"><strong>' + tasks.length + '</strong><span>進行中任務</span></div>',
      '<div class="parent-stat"><strong>' + wrongTotal + '</strong><span>待攻克錯題</span></div>'
    ].join('');
    renderTree();
    renderParentTasks();
    renderBank();
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
  }

  async function createTask(form) {
    const name = form.querySelector('[name="task_name"]').value.trim();
    if (!name) return toast('請填寫任務名稱');
    const nodes = $$('input[name="node"]:checked', form).map(input => input.value);
    const pinned = $$('input[name="pinned"]:checked', form).map(input => input.value);
    if (!nodes.length && !pinned.length) return toast('請至少選擇一個語法點或指定題目');
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          task_name: name,
          target_nodes: nodes,
          question_ids: pinned,
          batch_size: parseInt(form.querySelector('[name="batch_size"]').value, 10),
          pass_streak: parseInt(form.querySelector('[name="pass_streak"]').value, 10)
        }
      });
      toast('已建立任務');
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

  async function importQuestions() {
    const textarea = $('#import-text');
    if (!textarea || !textarea.value.trim()) return toast('請先貼上 JSON 或 CSV');
    try {
      const result = await api('/questions/import', { method: 'POST', body: { text: textarea.value } });
      state.importResult = result;
      textarea.value = '';
      await refreshData();
      toast('已匯入 ' + result.added + ' 題');
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
  }

  async function init() {
    try {
      const user = await request('/api/me');
      state.user = user;
      els.userChip.textContent = (user.nickname || user.username) + ' · @' + user.username;
      els.userChip.hidden = false;
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
      window.clearTimeout(state.advanceTimer);
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

    if (event.target.closest('[data-import]')) {
      importQuestions();
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
    if (event.key === 'Enter' && state.answer && !state.answer.feedback.correct) {
      event.preventDefault();
      advanceRound();
    }
  });

  init();
})();
