(function () {
  'use strict';

  const STEPS = ['read', 'understand', 'order', 'fill', 'recite', 'dictation'];
  const STEP_LABELS = {
    read: '聽讀',
    understand: '懂意',
    order: '排句',
    fill: '補字',
    recite: '背誦',
    dictation: '默寫'
  };
  const STEP_TITLES = {
    read: '先聽一遍，再讀出聲',
    understand: '知道這首詩在說甚麼',
    order: '把詩句排回原來的次序',
    fill: '補回詩句缺少的字',
    recite: '合上提示，把詩背出來',
    dictation: '不看原文，把詩默寫一次'
  };
  const NEXT_LABEL = {
    read: '下一步：懂意',
    understand: '下一步：排句',
    order: '下一步：補字',
    fill: '下一步：背誦',
    recite: '下一步：默寫',
    dictation: '看看學習記錄'
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const els = {
    locked: $('#locked'),
    childView: $('#child-view'),
    parentView: $('#parent-view'),
    hallView: $('#hall-view'),
    learnView: $('#learn-view'),
    userChip: $('#user-chip'),
    modeSwitch: $('#mode-switch'),
    helloName: $('#hello-name'),
    heroStats: $('#hero-stats'),
    todayCard: $('#today-card'),
    taskSection: $('#task-section'),
    taskList: $('#task-list'),
    parentTasks: $('#parent-tasks'),
    parentStats: $('#parent-stats'),
    parentPoems: $('#parent-poems'),
    errorSection: $('#error-section'),
    errorReviewList: $('#error-review-list'),
    reviewSection: $('#review-section'),
    reviewList: $('#review-list'),
    poemCountText: $('#poem-count-text'),
    themeFilter: $('#theme-filter'),
    poemGrid: $('#poem-grid'),
    learnBack: $('#learn-back'),
    learnTitle: $('#learn-title'),
    learnAuthor: $('#learn-author'),
    langToggle: $('#lang-toggle'),
    pinyinToggle: $('#pinyin-toggle'),
    translationToggle: $('#translation-toggle'),
    progressRing: $('#learn-progress-ring'),
    progressTitle: $('#learn-progress-title'),
    progressText: $('#learn-progress-text'),
    masterySeal: $('#mastery-seal'),
    poemPaper: $('#poem-paper'),
    stepNav: $('#step-nav'),
    stepBody: $('#step-body'),
    toast: $('#toast')
  };

  const state = {
    user: null,
    overview: null,
    poems: [],
    themes: [],
    poem: null,
    step: 'read',
    theme: 'all',
    pinyin: false,
    translation: false,
    lang: localStorage.getItem('poetry-lang') === 'zh-HK' ? 'zh-HK' : 'zh-CN',
    preferredVoice: '',
    busy: false,
    blind: false,
    orderBank: [],
    orderPicked: [],
    orderResult: null,
    fillBlanks: [],
    fillAnswers: {},
    fillResult: null,
    reciteMode: 'first',
    dictationDraft: [],
    dictationResult: null,
    errorDrill: null,
    errorDrillResult: null,
    dictationStart: 0,
    voiceWarned: false,
    isAdmin: false,
    mode: 'child',
    parentTab: 'tasks',
    adminTasks: [],
    adminStats: [],
    adminLoading: false,
    importPreview: null,
    importText: '',
    importBusy: false,
    editingTask: null,
    editPicked: [],
    editAssignees: []
  };

  let toastTimer = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtInt(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.add('is-in');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove('is-in');
      window.setTimeout(() => { els.toast.hidden = true; }, 220);
    }, 2600);
  }

  async function request(path, options) {
    const config = Object.assign({ credentials: 'include' }, options || {});
    if (config.body && !config.headers) config.headers = { 'Content-Type': 'application/json' };
    const response = await fetch(path, config);
    let data = null;
    try { data = await response.json(); } catch (error) { data = null; }
    if (!response.ok) {
      const failure = new Error((data && data.error) || '請求失敗（' + response.status + '）');
      failure.status = response.status;
      throw failure;
    }
    return data;
  }

  function hanChars(value) {
    return String(value == null ? '' : value).match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || [];
  }

  function isHan(char) {
    return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(char);
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function stepsDone(poem) {
    return STEPS.filter(step => poem && poem.steps && poem.steps[step]).length;
  }

  function firstIncomplete(poem) {
    if (poem.mastered) return 'recite';
    const step = STEPS.find(item => !poem.steps || !poem.steps[item]);
    return step || 'read';
  }

  async function boot() {
    try {
      const me = await request('/api/me');
      state.user = me;
      state.preferredVoice = me.voiceZh || '';
      state.isAdmin = me.role === 'admin';
      els.userChip.hidden = false;
      els.userChip.textContent = me.nickname || me.username;
      els.helloName.textContent = me.nickname || me.username;
      els.modeSwitch.hidden = !state.isAdmin;
      await loadOverview();
      els.childView.hidden = false;
      renderHall();
      if (state.poems.length) {
        const last = state.overview.poems
          .filter(item => item.stepsDone > 0 && !item.mastered)
          .sort((a, b) => String(b.lastPracticedAt || '').localeCompare(String(a.lastPracticedAt || '')))[0];
        if (last) els.progressText.textContent = '上次讀到《' + last.title + '》，可以繼續。';
      }
    } catch (error) {
      if (error.status === 401) {
        els.locked.hidden = false;
        return;
      }
      els.locked.hidden = false;
      toast(error.message || '載入失敗，請重新整理');
    }
  }

  async function loadOverview() {
    const overview = await request('/api/poetry/overview');
    state.overview = overview;
    state.poems = overview.poems || [];
    state.themes = overview.themes || [];
  }

  function renderHall() {
    const stats = (state.overview && state.overview.stats) || {};
    els.heroStats.innerHTML = [
      ['已掌握', fmtInt(stats.mastered) + ' / ' + fmtInt(stats.totalPoems) + ' 首'],
      ['學習中', fmtInt(stats.learning) + ' 首'],
      ['默寫正確率', fmtInt(stats.accuracy) + '%'],
      ['近七日', fmtInt(stats.recent7) + ' 次']
    ].map(item => '<div class="hero-stat"><strong>' + esc(item[1]) + '</strong><span>' + esc(item[0]) + '</span></div>').join('');
    els.poemCountText.textContent = state.poems.length + ' 首小詩，按心情和季節慢慢讀。';

    const daily = state.poems.find(poem => poem.id === state.overview.dailyId) || state.poems[0];
    els.todayCard.innerHTML = daily ? dailyCardHTML(daily) : '<div class="empty-state">詩園裏還沒有詩。</div>';

    const tasks = state.overview.tasks || [];
    els.taskSection.hidden = tasks.length === 0;
    els.taskList.innerHTML = tasks.map(taskCardHTML).join('');

    const errorReview = state.overview.errorReview || [];
    els.errorSection.hidden = errorReview.length === 0;
    els.errorReviewList.innerHTML = errorReview.map(item =>
      '<button type="button" class="review-item is-error" data-error-review="' + esc(item.poemId) + '">' +
        '<span><strong>' + esc(item.title) + '</strong><span>易錯字：' + esc(item.errors.join('、')) + '</span></span>' +
        '<i>回練</i>' +
      '</button>'
    ).join('');

    const review = state.overview.review || [];
    els.reviewSection.hidden = review.length === 0;
    els.reviewList.innerHTML = review.map(poem =>
      '<button type="button" class="review-item" data-review="' + esc(poem.id) + '">' +
        '<span><strong>' + esc(poem.title) + '</strong><span>' + esc(poem.dynasty) + ' · ' + esc(poem.author) + ' · 上次 ' + esc((poem.lastPracticedAt || '').slice(0, 10)) + '</span></span>' +
        '<i>再背一次</i>' +
      '</button>'
    ).join('');

    els.themeFilter.innerHTML = state.themes.map(theme =>
      '<button type="button" class="theme-chip' + (state.theme === theme.id ? ' is-active' : '') + '" data-theme="' + esc(theme.id) + '">' +
        esc(theme.title) + '<small>' + fmtInt(theme.count) + '</small>' +
      '</button>'
    ).join('');

    const filtered = state.theme === 'all'
      ? state.poems
      : state.poems.filter(poem => poem.themeId === state.theme);
    els.poemGrid.innerHTML = filtered.length
      ? filtered.map(poemCardHTML).join('')
      : '<div class="empty-state">這個主題還沒有詩。</div>';
  }

  function dailyCardHTML(poem) {
    const done = stepsDone(poem);
    return '<div class="today-kicker"><span>今日一首 · TODAY</span><span class="seal-mini">' + (poem.mastered ? '印' : '詩') + '</span></div>' +
      '<h2 class="today-title">' + esc(poem.title) + '</h2>' +
      '<p class="today-author">' + esc(poem.dynasty) + ' · ' + esc(poem.author) + ' · ' + esc(poem.theme) + '</p>' +
      '<p class="today-line">' + esc(poem.firstLine) + '……</p>' +
      '<div class="today-foot">' +
        '<div class="today-progress">' + STEPS.map((step, index) => '<i class="' + (index < done ? 'is-on' : '') + '"></i>').join('') + '</div>' +
        '<button type="button" class="btn" data-open="' + esc(poem.id) + '">' + (poem.mastered ? '再讀一次' : done ? '繼續讀' : '開始讀詩') + '</button>' +
      '</div>';
  }

  function taskCardHTML(task) {
    const poems = task.poems || [];
    const next = poems.find(poem => poem.id === task.nextPoemId) || poems[0];
    const done = Number(task.total) > 0 && Number(task.mastered) >= Number(task.total);
    const nextId = next ? next.id : '';
    return '<button type="button" class="task-card' + (done ? ' is-done' : '') + '" data-open="' + esc(nextId) + '"' + (nextId ? '' : ' disabled') + '>' +
      '<div class="task-card-head"><span class="task-kicker">家長任務</span><span class="task-state">' + (done ? '已完成' : '進行中') + '</span></div>' +
      '<h3>' + esc(task.task_name) + '</h3>' +
      '<p class="task-card-line">' + (done
        ? '這份任務的詩都掌握了。'
        : next ? '下一首：' + esc(next.title) + ' · ' + esc(next.dynasty) + ' · ' + esc(next.author) : '準備開始。') + '</p>' +
      '<div class="task-bar"><span style="width:' + Math.max(0, Math.min(100, Number(task.progress) || 0)) + '%"></span></div>' +
      '<div class="task-card-foot"><span>已通關 ' + Number(task.mastered || 0) + ' / ' + Number(task.total || 0) + ' 首 · 今日 ' + Number(task.todayPracticed || 0) + ' / ' + Number(task.dailyGoal || 2) + ' 首</span><strong>' + (done ? '再讀一次' : '繼續') + '</strong></div>' +
      '<small class="task-card-note">默寫通關線 ' + Number(task.passScore || 80) + '%</small>' +
    '</button>';
  }

  function poemCardHTML(poem) {
    const done = stepsDone(poem);
    const classNames = ['poem-card'];
    if (poem.mastered) classNames.push('is-mastered');
    else if (done > 0) classNames.push('is-started');
    return '<button type="button" class="' + classNames.join(' ') + '" data-open="' + esc(poem.id) + '">' +
      '<div class="poem-card-top">' +
        '<div><h3>' + esc(poem.title) + '</h3><p class="poem-card-meta">' + esc(poem.dynasty) + ' · ' + esc(poem.author) + '</p></div>' +
        '<span class="card-seal">' + (poem.mastered ? '印' : '詩') + '</span>' +
      '</div>' +
      '<p class="poem-card-line">' + esc(poem.firstLine) + '……</p>' +
      '<div class="poem-card-foot">' +
        '<div class="step-dots">' + STEPS.map((step, index) =>
          '<i class="' + (index < done ? (step === 'dictation' ? 'is-dictation' : 'is-on') : '') + '"></i>'
        ).join('') + '</div>' +
        '<span class="poem-tag">' + esc(poem.theme) + ' · ' + esc(poem.level) + '</span>' +
      '</div>' +
    '</button>';
  }

  function setMode(mode) {
    if (mode === 'parent' && !state.isAdmin) return;
    state.mode = mode;
    const parent = mode === 'parent';
    els.childView.hidden = parent;
    els.parentView.hidden = !parent;
    $$('[data-mode]').forEach(button => {
      const active = button.getAttribute('data-mode') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    if (parent) {
      if (state.adminTasks.length || state.adminStats.length) renderParent();
      loadAdminData();
    } else {
      renderHall();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadAdminData() {
    if (state.adminLoading) return;
    state.adminLoading = true;
    try {
      const [tasks, stats] = await Promise.all([
        request('/api/poetry/admin/tasks'),
        request('/api/poetry/admin/stats')
      ]);
      state.adminTasks = tasks || [];
      state.adminStats = stats || [];
      state.adminLoading = false;
      if (state.mode === 'parent') renderParent();
    } catch (error) {
      toast(error.message || '載入管理資料失敗');
    } finally {
      state.adminLoading = false;
    }
  }

  function renderParent() {
    const tabs = {
      tasks: els.parentTasks,
      stats: els.parentStats,
      poems: els.parentPoems
    };
    Object.keys(tabs).forEach(key => {
      const active = state.parentTab === key;
      tabs[key].hidden = !active;
      const button = $('[data-parent-tab="' + key + '"]');
      if (button) {
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      }
    });
    if (state.parentTab === 'tasks') renderParentTasks();
    else if (state.parentTab === 'stats') renderParentStats();
    else renderParentPoems();
  }

  function assigneeHTML() {
    const users = state.adminStats.slice();
    const items = users.map(user =>
      '<label class="assign-item"><input type="checkbox" data-assignee="' + esc(user.userId) + '">' +
        '<span>' + esc(user.nickname || user.username) + '</span>' +
        (user.role === 'admin' ? '<small>家長</small>' : '') +
      '</label>'
    ).join('');
    return '<label class="assign-item is-all"><input type="checkbox" data-assignee="all" checked><span>全部孩子</span></label>' +
      (items || '<span class="muted">還沒有其他用戶</span>');
  }

  function editAssigneeHTML(group) {
    const selected = new Set((state.editAssignees || []).map(String));
    const items = state.adminStats.map(user =>
      '<label class="assign-item"><input type="checkbox" data-edit-assignee="' + esc(user.userId) + '"' +
        (selected.has(String(user.userId)) ? ' checked' : '') + '>' +
        '<span>' + esc(user.nickname || user.username) + '</span>' +
      '</label>'
    ).join('');
    return items || '<span class="muted">還沒有其他用戶</span>';
  }

  function updateEditAssigneeCount() {
    const count = $$('[data-edit-assignee]:checked').length;
    const label = $('#edit-assignee-count');
    if (label) label.textContent = count;
  }

  function poemPickerHTML() {
    return state.overview.poems.map(poem =>
      '<label class="picker-item' + (poem.mastered ? ' is-mastered' : '') + '">' +
        '<input type="checkbox" data-pick-poem="' + esc(poem.id) + '">' +
        '<span><strong>' + esc(poem.title) + '</strong><small>' + esc(poem.dynasty) + ' · ' + esc(poem.author) + ' · ' + esc(poem.theme) + '</small></span>' +
      '</label>'
    ).join('');
  }

  function taskEditHTML(group) {
    const picked = new Set((state.editPicked || []).map(String));
    const picker = state.overview.poems.map(poem =>
      '<label class="picker-item' + (poem.mastered ? ' is-mastered' : '') + '">' +
        '<input type="checkbox" data-edit-pick="' + esc(poem.id) + '"' + (picked.has(String(poem.id)) ? ' checked' : '') + '>' +
        '<span><strong>' + esc(poem.title) + '</strong><small>' + esc(poem.dynasty) + ' · ' + esc(poem.author) + ' · ' + esc(poem.theme) + '</small></span>' +
      '</label>'
    ).join('');
    return '<section class="admin-card is-editing">' +
      '<div class="admin-card-head"><div><h2>編輯任務</h2><p>' + esc(group.task_name) + ' · 修改名稱、指派孩子、每日目標、通關線或詩單。</p></div></div>' +
      '<form id="task-edit-form" data-group-id="' + esc(group.groupId) + '">' +
        '<label class="field"><span class="field-label">任務名稱</span><input class="input" name="task_name" maxlength="40" required value="' + esc(group.task_name) + '"></label>' +
        '<div class="field-row">' +
          '<label class="field"><span class="field-label">每日目標</span><select class="input" name="daily_goal">' +
            [1, 2, 3, 5].map(value => '<option value="' + value + '"' + (Number(group.daily_goal || 2) === value ? ' selected' : '') + '>' + value + ' 首</option>').join('') +
          '</select></label>' +
          '<label class="field"><span class="field-label">默寫通關線</span><select class="input" name="pass_score">' +
            [60, 70, 80, 90, 100].map(value => '<option value="' + value + '"' + (Number(group.pass_score || 80) === value ? ' selected' : '') + '>' + value + '%</option>').join('') +
          '</select></label>' +
        '</div>' +
        '<div class="field"><div class="picker-head"><span class="field-label">指派給 <b id="edit-assignee-count">' + (state.editAssignees || []).length + '</b> 位</span><span class="picker-actions"><button type="button" class="text-btn" data-edit-assignee-all>全選</button><button type="button" class="text-btn" data-edit-assignee-none>清除</button></span></div>' +
          '<div class="assign-list" id="edit-assign-list">' + editAssigneeHTML(group) + '</div></div>' +
        '<div class="field"><div class="picker-head"><span class="field-label">詩單 <b id="edit-pick-count">' + picked.size + '</b> 首</span><span class="picker-actions"><button type="button" class="text-btn" data-edit-pick-all>全選</button><button type="button" class="text-btn" data-edit-pick-none>清除</button></span></div>' +
          '<div class="poem-picker">' + picker + '</div></div>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">保存修改</button><button type="button" class="btn btn-ghost" data-cancel-task-edit>取消</button></div>' +
      '</form>' +
    '</section>';
  }

  function adminTaskHTML(group) {
    const poemNames = (group.poem_ids || []).map(id => {
      const poem = state.overview.poems.find(item => item.id === id);
      return poem ? poem.title : id;
    });
    const users = (group.users || []).map(user =>
      '<div class="admin-task-user">' +
        '<div class="admin-user-line"><strong>' + esc(user.nickname) + '</strong><span>通關 ' + Number(user.mastered || 0) + ' / ' + Number(user.total || 0) + ' 首 · 今日 ' + Number(user.todayPracticed || 0) + ' / ' + Number(group.daily_goal || 2) + ' 首</span></div>' +
        '<div class="task-bar"><span style="width:' + Math.max(0, Math.min(100, Number(user.progress) || 0)) + '%"></span></div>' +
        '<small>默寫平均 ' + Number(user.accuracy || 0) + '%' + (user.lastPracticedAt ? ' · 最近 ' + esc(String(user.lastPracticedAt).slice(0, 10)) : ' · 尚未開始') + '</small>' +
      '</div>'
    ).join('');
    return '<article class="admin-task">' +
      '<div class="admin-task-head"><div><h3>' + esc(group.task_name) + '</h3>' +
        '<p>' + Number(group.poem_ids ? group.poem_ids.length : 0) + ' 首詩 · 每日 ' + Number(group.daily_goal || 2) + ' 首 · 通關 ' + Number(group.pass_score || 80) + '% · ' + Number(group.total || 0) + ' 位孩子 · ' + esc(String(group.createdAt || '').slice(0, 10)) + '</p></div>' +
        '<div class="admin-task-actions"><button type="button" class="btn btn-ghost btn-small" data-edit-task="' + esc(group.groupId) + '">編輯</button><button type="button" class="btn btn-ghost btn-small" data-delete-task="' + esc(group.groupId) + '">刪除</button></div></div>' +
      '<div class="admin-task-poems">' + poemNames.slice(0, 5).map(title => '<span>' + esc(title) + '</span>').join('') + (poemNames.length > 5 ? '<span>+' + (poemNames.length - 5) + '</span>' : '') + '</div>' +
      '<div class="admin-task-users">' + users + '</div>' +
    '</article>';
  }

  function renderParentTasks() {
    if (state.adminLoading && !state.adminTasks.length) {
      els.parentTasks.innerHTML = '<div class="admin-card"><p class="muted">正在載入任務…</p></div>';
      return;
    }
    const form = '<section class="admin-card">' +
      '<div class="admin-card-head"><div><h2>建立古詩任務</h2><p>選詩、選孩子，建立後孩子會在詩園看到任務。</p></div></div>' +
      '<form id="poem-task-form">' +
        '<label class="field"><span class="field-label">任務名稱</span><input class="input" name="task_name" maxlength="40" required placeholder="例如：本週讀三首唐詩"></label>' +
        '<div class="field-row">' +
          '<label class="field"><span class="field-label">每日目標</span><select class="input" name="daily_goal"><option value="1">1 首</option><option value="2" selected>2 首</option><option value="3">3 首</option><option value="5">5 首</option></select></label>' +
          '<label class="field"><span class="field-label">默寫通關線</span><select class="input" name="pass_score"><option value="60">60%</option><option value="70">70%</option><option value="80" selected>80%</option><option value="90">90%</option><option value="100">100%</option></select></label>' +
        '</div>' +
        '<div class="field"><span class="field-label">指派給</span><div class="assign-list" id="assign-list">' + assigneeHTML() + '</div></div>' +
        '<div class="field"><div class="picker-head"><span class="field-label">選詩 <b id="pick-count">0</b> 首</span><span class="picker-actions"><button type="button" class="text-btn" data-pick-all>全選</button><button type="button" class="text-btn" data-pick-none>清除</button></span></div>' +
          '<div class="poem-picker" id="poem-picker">' + poemPickerHTML() + '</div></div>' +
        '<div class="form-actions"><button type="submit" class="btn btn-primary">建立任務</button></div>' +
      '</form>' +
    '</section>';
    const list = state.adminTasks.length
      ? state.adminTasks.map(adminTaskHTML).join('')
      : '<div class="empty-state"><h3>還沒有古詩任務</h3><p>建立第一個任務，孩子下次打開詩園就會看到。</p></div>';
    els.parentTasks.innerHTML = (state.editingTask ? taskEditHTML(state.editingTask) : form) +
      '<section class="admin-card"><div class="admin-card-head"><div><h2>現有任務</h2><p>任務完成後會保留記錄，可以隨時編輯或刪除。</p></div></div>' +
      '<div class="admin-task-list">' + list + '</div></section>';
    updatePickCount();
  }

  function renderParentStats() {
    if (state.adminLoading && !state.adminStats.length) {
      els.parentStats.innerHTML = '<div class="admin-card"><p class="muted">正在載入學習統計…</p></div>';
      return;
    }
    if (!state.adminStats.length) {
      els.parentStats.innerHTML = '<div class="empty-state"><h3>還沒有學習記錄</h3><p>孩子開始讀詩後，這裡會顯示進度和默寫正確率。</p></div>';
      return;
    }
    const totalMastered = state.adminStats.reduce((sum, row) => sum + Number(row.mastered || 0), 0);
    const totalAttempts = state.adminStats.reduce((sum, row) => sum + Number(row.attempts || 0), 0);
    const rows = state.adminStats.map(row =>
      '<div class="stat-row">' +
        '<div class="stat-name"><strong>' + esc(row.nickname || row.username) + '</strong><small>' + (row.lastPracticedAt ? '最近 ' + esc(String(row.lastPracticedAt).slice(0, 10)) : '尚未開始') + '</small></div>' +
        '<div class="stat-cell"><strong>' + Number(row.mastered || 0) + ' / ' + Number(row.totalQuestions || 0) + '</strong><span>已掌握</span></div>' +
        '<div class="stat-cell"><strong>' + Number(row.stepsDone || 0) + '</strong><span>完成步驟</span></div>' +
        '<div class="stat-cell"><strong>' + Number(row.attempts || 0) + '</strong><span>默寫次數</span></div>' +
        '<div class="stat-cell"><strong>' + Number(row.accuracy || 0) + '%</strong><span>默寫平均</span></div>' +
        '<div class="stat-cell"><strong>' + Number(row.recent7 || 0) + '</strong><span>近七日</span></div>' +
      '</div>'
    ).join('');
    els.parentStats.innerHTML = '<section class="admin-card">' +
      '<div class="admin-card-head"><div><h2>學習統計</h2><p>所有孩子的古詩進度。</p></div></div>' +
      '<div class="stat-summary"><div><strong>' + totalMastered + '</strong><span>累計掌握詩</span></div><div><strong>' + totalAttempts + '</strong><span>累計默寫</span></div><div><strong>' + state.adminStats.length + '</strong><span>帳戶</span></div></div>' +
      '<div class="stat-table">' + rows + '</div>' +
    '</section>';
  }

  function customPoems() {
    return state.overview.poems.filter(poem => poem.custom);
  }

  function renderImportResult() {
    const box = $('#poem-import-result');
    if (!box) return;
    const preview = state.importPreview;
    if (!preview) {
      box.innerHTML = '';
      const importBtn = $('[data-poem-import]');
      if (importBtn) importBtn.disabled = true;
      return;
    }
    const errors = preview.errors || [];
    const warnings = preview.warnings || [];
    const items = preview.items || [];
    box.innerHTML =
      (errors.length ? '<div class="import-errors"><strong>需要修正</strong>' + errors.map(error => '<p>' + esc(error) + '</p>').join('') + '</div>' : '') +
      (items.length ? '<div class="import-preview"><strong>可匯入 ' + items.length + ' 首</strong>' +
        items.map(item => '<div class="preview-row"><span><b>' + esc(item.title) + '</b> · ' + esc(item.author) + ' · ' + esc(item.theme) + '</span><small>' + item.lineCount + ' 句' + (item.incomplete ? ' · ' + item.incomplete + ' 句缺拼音或今譯' : '') + '</small></div>').join('') +
      '</div>' : '') +
      (warnings.length ? '<details class="import-warnings"><summary>提示 ' + warnings.length + ' 條</summary>' + warnings.map(warning => '<p>' + esc(warning) + '</p>').join('') + '</details>' : '');
    const importBtn = $('[data-poem-import]');
    if (importBtn) importBtn.disabled = !items.length || errors.length > 0 || state.importBusy;
  }

  function renderParentPoems() {
    const custom = customPoems();
    const sample = JSON.stringify({
      poems: [{
        id: 'my-poem',
        title: '我的小詩',
        author: '無名',
        dynasty: '今',
        themeId: 'family',
        theme: '親情',
        level: '小學',
        tags: ['自訂'],
        lines: [
          { text: '第一句詩', pinyin: 'dì yī jù shī', translation: '第一句的意思' },
          { text: '第二句詩', pinyin: 'dì èr jù shī', translation: '第二句的意思' }
        ],
        background: '這首詩的背景。',
        appreciation: '這首詩的妙處。',
        keyLine: 0,
        keyLineNote: '詩眼說明。'
      }]
    }, null, 2);
    els.parentPoems.innerHTML = '<section class="admin-card">' +
      '<div class="admin-card-head"><div><h2>詩庫</h2><p>目前共有 ' + state.overview.stats.totalPoems + ' 首詩，其中 ' + custom.length + ' 首是自訂或匯入的。</p></div></div>' +
      (custom.length ? '<div class="custom-poems">' + custom.map(poem => '<span class="custom-poem">' + esc(poem.title) + '<small>' + esc(poem.theme) + '</small></span>').join('') + '</div>' : '<p class="muted">還沒有自訂詩。可以在下面貼上 JSON 或 CSV 匯入。</p>') +
    '</section>' +
    '<section class="admin-card">' +
      '<div class="admin-card-head"><div><h2>匯入詩單</h2><p>支援 JSON 或 CSV。匯入前會先預覽，不會直接改動現有詩。</p></div></div>' +
      '<div class="import-tools"><input type="file" id="poem-import-file" accept=".json,.csv,application/json,text/csv"><button type="button" class="btn btn-ghost btn-small" id="poem-sample-btn">填入範例</button></div>' +
      '<textarea id="poem-import-text" class="import-text" rows="10" placeholder="貼上 JSON 或 CSV…"></textarea>' +
      '<details class="import-help"><summary>格式說明</summary><p>JSON：<code>{"poems":[{ "id":"...", "title":"...", "author":"...", "dynasty":"...", "themeId":"home", "lines":[{ "text":"...", "pinyin":"...", "translation":"..." }] }]}</code></p><p>CSV 欄位：<code>id,title,author,dynasty,themeId,theme,level,tags,lines,pinyin,translation,background,appreciation,keyLine,keyLineNote</code>；多句用 <code>|</code> 分隔。</p></details>' +
      '<div class="form-actions"><button type="button" class="btn btn-soft" data-poem-preview>預覽</button><button type="button" class="btn btn-primary" data-poem-import disabled>匯入</button></div>' +
      '<div id="poem-import-result"></div>' +
    '</section>';
    const textarea = $('#poem-import-text');
    if (textarea && state.importText) textarea.value = state.importText;
    const sampleBtn = $('#poem-sample-btn');
    if (sampleBtn) sampleBtn.dataset.sample = sample;
    renderImportResult();
  }

  function updatePickCount() {
    const count = $$('[data-pick-poem]:checked').length;
    const label = $('#pick-count');
    if (label) label.textContent = String(count);
  }

  function updateEditPickCount() {
    const count = $$('[data-edit-pick]:checked').length;
    const label = $('#edit-pick-count');
    if (label) label.textContent = String(count);
  }

  async function openErrorReview(poemId) {
    const item = (state.overview.errorReview || []).find(entry => String(entry.poemId) === String(poemId));
    if (!item) return;
    await openPoem(item.poemId, 'dictation');
    if (!state.poem) return;
    const lines = item.lines.map(line => {
      const blanks = new Set(line.blanks || []);
      return {
        lineIndex: line.lineIndex,
        cells: Array.from(line.text).map((char, charIndex) => ({
          expected: char,
          given: blanks.has(charIndex) ? '' : char,
          ok: !blanks.has(charIndex)
        }))
      };
    });
    state.errorDrill = { lines, answers: {}, poemId: item.poemId, title: item.title };
    state.errorDrillResult = null;
    renderStepBody();
  }

  async function openPoem(id, wantedStep) {
    if (state.busy) return;
    state.busy = true;
    try {
      const poem = await request('/api/poetry/poems/' + encodeURIComponent(id));
      state.poem = poem;
      state.blind = false;
      state.pinyin = false;
      state.translation = false;
      state.orderResult = null;
      state.fillResult = null;
      state.dictationResult = null;
      state.errorDrill = null;
      state.errorDrillResult = null;
      els.hallView.hidden = true;
      els.learnView.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setStep(wantedStep || firstIncomplete(poem));
    } catch (error) {
      toast(error.message || '載入詩歌失敗');
    } finally {
      state.busy = false;
    }
  }

  function setStep(step) {
    state.step = step;
    state.errorDrill = null;
    state.errorDrillResult = null;
    if (step === 'order') {
      state.orderResult = null;
      state.orderPicked = [];
      state.orderBank = shuffled(state.poem.lines.map((line, index) => ({ index, text: line.text })));
      if (state.orderBank.length > 1 && state.orderBank.every((item, index) => item.index === index)) {
        state.orderBank.reverse();
      }
    } else if (step === 'fill') {
      state.fillResult = null;
      state.fillAnswers = {};
      state.fillBlanks = buildBlanks(state.poem);
    } else if (step === 'dictation') {
      state.dictationResult = null;
      state.dictationDraft = state.poem.lines.map(() => '');
      state.dictationStart = Date.now();
      state.blind = true;
    } else if (step === 'recite') {
      state.reciteMode = 'first';
    }
    renderLearn();
  }

  function buildBlanks(poem) {
    const blanks = [];
    poem.lines.forEach((line, lineIndex) => {
      const positions = [];
      Array.from(line.text).forEach((char, charIndex) => {
        if (isHan(char)) positions.push(charIndex);
      });
      positions.slice(-2).forEach(charIndex => {
        blanks.push({
          lineIndex,
          charIndex,
          answer: Array.from(line.text)[charIndex]
        });
      });
    });
    return blanks;
  }

  function applyProgress(progress) {
    if (!state.poem || !progress) return;
    Object.assign(state.poem, {
      steps: progress.steps,
      stepsDone: progress.stepsDone,
      mastered: progress.mastered,
      masteredAt: progress.masteredAt,
      bestDictation: progress.bestDictation,
      errors: progress.errors,
      lastPracticedAt: progress.lastPracticedAt,
      dictationAttempts: progress.dictationAttempts
    });
  }

  function renderLearn() {
    const poem = state.poem;
    if (!poem) return;
    const done = stepsDone(poem);
    els.learnTitle.textContent = poem.title;
    els.learnAuthor.textContent = poem.dynasty + ' · ' + poem.author;
    els.langToggle.textContent = state.lang === 'zh-HK' ? '粵語' : '普通話';
    els.pinyinToggle.classList.toggle('is-active', state.pinyin);
    els.pinyinToggle.setAttribute('aria-pressed', String(state.pinyin));
    els.translationToggle.classList.toggle('is-active', state.translation);
    els.translationToggle.setAttribute('aria-pressed', String(state.translation));

    els.progressRing.style.setProperty('--value', String(Math.round((done / STEPS.length) * 100)));
    els.progressRing.querySelector('span').textContent = String(done);
    els.progressTitle.textContent = poem.mastered ? '這首詩已掌握' : done ? '已完成 ' + done + ' / 6 步' : '開始今天的學習';
    els.progressText.textContent = poem.mastered
      ? '可以隨時回來再讀、再背、再默一次。'
      : done ? '下一站：' + STEP_LABELS[firstIncomplete(poem)] + '。' : '先聽一遍，再一句一句讀。';
    els.masterySeal.hidden = !poem.mastered;

    renderPaper();
    renderStepNav();
    renderStepBody();
  }

  function renderPaper() {
    const poem = state.poem;
    const hidden = state.step === 'dictation' && state.blind && !state.dictationResult;
    els.poemPaper.className = 'poem-paper'
      + (state.pinyin ? ' show-pinyin' : '')
      + (state.translation ? ' show-translation' : '')
      + (hidden ? ' is-blind' : '');
    els.poemPaper.innerHTML =
      '<div class="paper-head"><h2>' + esc(poem.title) + '</h2><span>' + esc(poem.dynasty) + ' · ' + esc(poem.author) + '</span></div>' +
      '<div class="paper-lines">' + poem.lines.map((line, index) =>
        '<div class="poem-line" data-line="' + index + '">' +
          '<span class="line-no">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<span class="line-main">' +
            '<span class="pinyin">' + esc(line.pinyin) + '</span>' +
            '<span class="line-text">' + esc(line.text) + '</span>' +
            '<span class="translation">' + esc(line.translation) + '</span>' +
            (line.note ? '<span class="line-note">' + esc(line.note) + '</span>' : '') +
          '</span>' +
          '<button type="button" class="speak-line" data-speak="' + index + '" aria-label="朗讀這一句" title="朗讀這一句">讀</button>' +
        '</div>'
      ).join('') + '</div>' +
      '<div class="paper-foot">' +
        '<p>' + (state.step === 'dictation' ? '默寫時原文會收起來，需要時可以偷看。' : '點詩句可以聽發音；開拼音和今譯會看得更明白。') + '</p>' +
        '<div>' +
          (state.step === 'dictation' && state.blind && !state.dictationResult
            ? '<button type="button" class="btn btn-ghost btn-small" data-action="toggle-blind">偷看原文</button>'
            : '<button type="button" class="btn btn-ghost btn-small" data-action="speak-all">朗讀全詩</button>') +
        '</div>' +
      '</div>';
  }

  function renderStepNav() {
    els.stepNav.innerHTML = STEPS.map((step, index) => {
      const done = !!(state.poem.steps && state.poem.steps[step]);
      const classes = ['step-tab'];
      if (step === state.step) classes.push('is-active');
      if (done) classes.push('is-done');
      return '<button type="button" class="' + classes.join(' ') + '" data-step-tab="' + step + '">' +
        '<b>' + (done ? '✓' : index + 1) + '</b>' +
        '<span>' + STEP_LABELS[step] + '</span>' +
      '</button>';
    }).join('');
  }

  function stepHead() {
    const index = STEPS.indexOf(state.step);
    return '<p class="step-kicker">STEP ' + String(index + 1).padStart(2, '0') + ' · ' + STEP_LABELS[state.step] + '</p>' +
      '<h2 class="step-title">' + STEP_TITLES[state.step] + '</h2>';
  }

  function completionActions(step) {
    const done = !!(state.poem.steps && state.poem.steps[step]);
    const next = STEPS[STEPS.indexOf(step) + 1];
    return '<div class="step-actions">' +
      (done
        ? '<button type="button" class="btn btn-ghost" data-action="redo-step">再練一次</button>' +
          (next ? '<button type="button" class="btn btn-primary" data-next-step="' + next + '">' + NEXT_LABEL[step] + '</button>' : '')
        : '<button type="button" class="btn btn-primary" data-complete="' + step + '">完成這一步</button>') +
    '</div>';
  }

  function renderStepBody() {
    const poem = state.poem;
    let html = '';
    if (state.step === 'read') {
      html = stepHead() +
        '<p class="step-desc">先聽一次全詩，再跟着一句一句讀。讀出聲，會更容易記住節奏。</p>' +
        '<div class="audio-row"><button type="button" class="audio-btn" data-action="speak-all">聽全詩</button><span class="audio-meta">' + (state.lang === 'zh-HK' ? '粵語朗讀' : '普通話朗讀') + '</span></div>' +
        '<div class="info-card"><h4>讀詩小提示</h4><p>' + esc(poem.appreciation) + '</p></div>' +
        '<div class="info-card"><h4>這首詩的背景</h4><p>' + esc(poem.background) + '</p></div>' +
        completionActions('read');
    } else if (state.step === 'understand') {
      const keyLine = poem.lines[poem.keyLine] || poem.lines[0];
      html = stepHead() +
        '<p class="step-desc">先知道詩人在說甚麼，再記詩句，會容易很多。</p>' +
        '<div class="info-card"><h4>詩意</h4><p>' + esc(poem.background) + '</p></div>' +
        '<div class="info-card"><h4>詩眼</h4><p class="key-line">' + esc(keyLine.text) + '</p><p class="key-note">' + esc(poem.keyLineNote) + '</p></div>' +
        '<div class="info-card"><h4>寫作妙處</h4><p>' + esc(poem.appreciation) + '</p></div>' +
        '<div class="step-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="speak-all">聽一次</button>' +
        '</div>' +
        completionActions('understand');
    } else if (state.step === 'order') {
      html = stepHead() +
        '<p class="step-desc">點下面的詩句，按你記得的次序放進格子；點格子可以拿回。排好後按「檢查次序」。</p>' +
        '<div class="order-bank">' + state.orderBank.filter(item => !state.orderPicked.includes(item.index)).map(item =>
          '<button type="button" class="line-chip" data-order-add="' + item.index + '">' + esc(item.text) + '</button>'
        ).join('') + '</div>' +
        '<div class="order-slots">' + poem.lines.map((line, slot) => {
          const picked = state.orderPicked[slot];
          const item = picked === undefined ? null : state.orderBank.find(entry => entry.index === picked);
          const classes = ['order-slot'];
          if (item) classes.push('is-filled');
          if (state.orderResult && item) classes.push(item.index === slot ? 'is-good' : 'is-bad');
          return '<button type="button" class="' + classes.join(' ') + '" data-order-remove="' + slot + '">' +
            '<span class="slot-no">' + (slot + 1) + '</span>' +
            '<span>' + (item ? esc(item.text) : '點詩句放進來') + '</span>' +
          '</button>';
        }).join('') + '</div>' +
        '<div class="step-actions">' +
          '<button type="button" class="btn btn-primary" data-action="order-check"' + (state.orderPicked.filter(item => item !== undefined).length < poem.lines.length ? ' disabled' : '') + '>檢查次序</button>' +
          '<button type="button" class="btn btn-ghost" data-action="order-reset">重新排</button>' +
        '</div>' +
        (state.orderResult
          ? '<p class="step-hint ' + (state.orderResult.ok ? 'result-pass' : 'result-fail') + '">' + (state.orderResult.ok ? '次序完全正確，這首詩的骨架記住了。' : '還有詩句不在原來的位置，紅色的格子再想一想。') + '</p>'
          : '') +
        (state.orderResult && state.orderResult.ok ? '<div class="step-actions"><button type="button" class="btn btn-primary" data-next-step="fill">下一步：補字</button></div>' : '');
    } else if (state.step === 'fill') {
      const blankMap = new Map(state.fillBlanks.map(blank => [blank.lineIndex + ':' + blank.charIndex, blank]));
      html = stepHead() +
        '<p class="step-desc">詩句少了幾個字。把字填進空格，按「檢查補字」。按「提示一個字」可以幫你一把。</p>' +
        '<div class="fill-lines">' + poem.lines.map((line, lineIndex) => {
          const chars = Array.from(line.text);
          return '<div class="fill-line">' + chars.map((char, charIndex) => {
            const blank = blankMap.get(lineIndex + ':' + charIndex);
            if (!blank) return '<span class="' + (isHan(char) ? 'fill-char' : 'punct') + '">' + esc(char) + '</span>';
            const key = lineIndex + ':' + charIndex;
            const status = state.fillResult && state.fillResult.keys ? state.fillResult.keys[key] : '';
            return '<input type="text" maxlength="1" inputmode="text" autocomplete="off" aria-label="第 ' + (lineIndex + 1) + ' 句第 ' + (charIndex + 1) + ' 個字" data-fill-key="' + key + '" class="' + (status === false ? 'is-bad' : status === true ? 'is-good' : '') + '" value="' + esc(state.fillAnswers[key] || '') + '">';
          }).join('') + '</div>';
        }).join('') + '</div>' +
        '<div class="step-actions">' +
          '<button type="button" class="btn btn-primary" data-action="fill-check">檢查補字</button>' +
          '<button type="button" class="btn btn-ghost" data-action="fill-hint">提示一個字</button>' +
          '<button type="button" class="btn btn-ghost" data-action="fill-reset">重新填</button>' +
        '</div>' +
        (state.fillResult
          ? '<p class="step-hint ' + (state.fillResult.ok ? 'result-pass' : 'result-fail') + '">' + (state.fillResult.ok ? '全部補對了，這幾句已經很熟。' : '還有 ' + state.fillResult.wrong + ' 個字不對，紅色的空格再試一次。') + '</p>'
          : '') +
        (state.fillResult && state.fillResult.ok ? '<div class="step-actions"><button type="button" class="btn btn-primary" data-next-step="recite">下一步：背誦</button></div>' : '');
    } else if (state.step === 'recite') {
      const mode = state.reciteMode;
      html = stepHead() +
        '<p class="step-desc">先看首字提示，把整首詩背出來；如果能全部背出，就試試全隱藏。背的時候可以按「聽一次」跟讀。</p>' +
        '<div class="recite-tools">' +
          '<button type="button" class="chip-btn' + (mode === 'first' ? ' is-active' : '') + '" data-recite-mode="first">看首字</button>' +
          '<button type="button" class="chip-btn' + (mode === 'none' ? ' is-active' : '') + '" data-recite-mode="none">全隱藏</button>' +
          '<button type="button" class="chip-btn' + (mode === 'full' ? ' is-active' : '') + '" data-recite-mode="full">顯示原文</button>' +
        '</div>' +
        '<div class="recite-paper">' + poem.lines.map(line => {
          const chars = Array.from(line.text);
          const first = chars.find(char => isHan(char)) || '';
          const text = mode === 'full' ? line.text : mode === 'first' ? first + '……' : '……';
          return '<div class="recite-line' + (mode === 'full' ? '' : ' is-hidden') + (mode === 'first' ? ' is-first' : '') + '">' + esc(text) + '</div>';
        }).join('') + '</div>' +
        '<div class="step-actions">' +
          '<button type="button" class="btn btn-ghost" data-action="speak-all">聽一次</button>' +
          '<button type="button" class="btn btn-primary" data-complete="recite">我背完了</button>' +
        '</div>' +
        '<p class="step-hint">背誦是對自己負責的一步：真的出聲背一次，再按完成。</p>' +
        (state.poem.steps && state.poem.steps.recite ? '<div class="step-actions"><button type="button" class="btn btn-primary" data-next-step="dictation">下一步：默寫</button></div>' : '');
    } else {
      html = renderDictationStep();
    }
    els.stepBody.innerHTML = html;
  }

  function renderDictationStep() {
    const poem = state.poem;
    if (state.errorDrill) return renderErrorDrill();
    if (state.dictationResult) {
      const result = state.dictationResult;
      const pass = result.passed;
      return stepHead() +
        '<p class="step-desc">' + (pass ? '默寫通過了。錯字可以再看一眼，然後把整首詩收進詩集。' : '還沒到 80% 也不要緊，看看紅色的字，再默一次就會更熟。') + '</p>' +
        '<div class="result-box">' +
          '<div class="result-head"><strong class="' + (pass ? 'result-pass' : 'result-fail') + '">' + result.accuracy + '%</strong><span>默寫正確率 · 通關線 ' + result.passLine + '%</span></div>' +
          result.lines.map((line, index) =>
            '<div class="result-line">' +
              '<p class="result-expected">' + (index + 1) + '. ' + esc(line.expected) + '</p>' +
              '<div class="result-cells">' + line.cells.map(cell =>
                '<span class="result-cell' + (cell.ok ? '' : ' is-bad') + '">' + esc(cell.expected || '·') +
                  (cell.ok ? '' : '<small>' + esc(cell.given || '缺') + '</small>') +
                '</span>'
              ).join('') + '</div>' +
            '</div>'
          ).join('') +
          (result.errors.length
            ? '<div class="step-hint">易錯字：' + result.errors.map(char => '<span class="error-word">' + esc(char) + '</span>').join('') + '</div>'
            : '<p class="step-hint result-pass">這次沒有錯字，很好。</p>') +
        '</div>' +
        '<div class="step-actions">' +
          (result.lines.some(line => line.cells.some(cell => !cell.ok && cell.expected))
            ? '<button type="button" class="btn btn-soft" data-action="error-drill">只練錯字</button>'
            : '') +
          '<button type="button" class="btn btn-primary" data-action="dictation-again">再默一次</button>' +
          '<button type="button" class="btn btn-ghost" data-paper-toggle="1">對照原文</button>' +
          '<button type="button" class="btn btn-ghost" data-action="back-hall">返回詩園</button>' +
        '</div>' +
        (poem.mastered ? '<p class="step-hint result-pass">這首詩已達到「已掌握」，可以去詩園看看其他詩了。</p>' : '');
    }
    return stepHead() +
      '<p class="step-desc">原文已經收起來。憑記憶把每一句寫下來，標點可以不寫。按「提交默寫」看看自己記得多少。</p>' +
      '<div class="dictation-lines">' + poem.lines.map((line, index) =>
        '<label class="dictation-line">' +
          '<span>' + (index + 1) + '</span>' +
          '<input type="text" autocomplete="off" data-dictation="' + index + '" value="' + esc(state.dictationDraft[index] || '') + '" aria-label="默寫第 ' + (index + 1) + ' 句">' +
        '</label>'
      ).join('') + '</div>' +
      '<div class="step-actions">' +
        '<button type="button" class="btn btn-primary" data-action="dictation-submit">提交默寫</button>' +
        '<button type="button" class="btn btn-ghost" data-action="toggle-blind">' + (state.blind ? '偷看原文' : '收起原文') + '</button>' +
      '</div>' +
      '<p class="step-hint">默寫只計算中文字，標點和空格不影響成績。通關線是 80%。</p>';
  }

  function startErrorDrill() {
    if (!state.dictationResult) return;
    const lines = state.dictationResult.lines
      .map((line, lineIndex) => ({ ...line, lineIndex }))
      .filter(line => line.cells.some(cell => !cell.ok && cell.expected));
    if (!lines.length) {
      toast('這次沒有錯字');
      return;
    }
    state.errorDrill = { lines, answers: {}, poemId: state.poem.id, title: state.poem.title };
    state.errorDrillResult = null;
    renderStepBody();
    const panel = $('.error-drill');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderErrorDrill() {
    const drill = state.errorDrill;
    const result = state.errorDrillResult;
    const html = '<p class="step-kicker">錯字回練 · RETRY</p>' +
      '<h2 class="step-title">把錯字放回句子</h2>' +
      '<p class="step-desc">只練剛才寫錯的字。看着前後的詩句，把缺的字補回去。</p>' +
      '<div class="error-drill">' + drill.lines.map(line => {
        const cells = line.cells.map((cell, cellIndex) => {
          if (cell.ok || !cell.expected) return '<span class="error-char">' + esc(cell.expected || '') + '</span>';
          const key = line.lineIndex + ':' + cellIndex;
          const status = result && result.keys ? result.keys[key] : '';
          return '<input type="text" maxlength="1" autocomplete="off" inputmode="text" data-error-key="' + key + '" class="error-input' +
            (status === false ? ' is-bad' : status === true ? ' is-good' : '') + '" value="' + esc(drill.answers[key] || '') + '" aria-label="第 ' + (line.lineIndex + 1) + ' 句錯字">';
        }).join('');
        return '<div class="error-line"><span class="error-line-no">' + (line.lineIndex + 1) + '</span><div class="error-cells">' + cells + '</div></div>';
      }).join('') + '</div>' +
      '<div class="step-actions">' +
        '<button type="button" class="btn btn-primary" data-action="error-check">檢查錯字</button>' +
        '<button type="button" class="btn btn-ghost" data-action="error-again">重新默寫</button>' +
        '<button type="button" class="btn btn-ghost" data-action="back-hall">返回詩園</button>' +
      '</div>' +
      (result
        ? '<p class="step-hint ' + (result.wrong === 0 ? 'result-pass' : 'result-fail') + '">' + (result.wrong === 0 ? '錯字都補對了，再默一次會更穩。' : '還有 ' + result.wrong + ' 個字不對，紅色的格子再想想。') + '</p>'
        : '');
    return html;
  }

  async function clearReviewedErrors() {
    if (!state.errorDrill || !state.errorDrill.poemId) return;
    const chars = new Set();
    state.errorDrill.lines.forEach(line => {
      line.cells.forEach(cell => {
        if (!cell.ok && cell.expected) chars.add(cell.expected);
      });
    });
    if (!chars.size) return;
    try {
      await request('/api/poetry/errors/clear', {
        method: 'POST',
        body: JSON.stringify({ poemId: state.errorDrill.poemId, chars: Array.from(chars) })
      });
      await loadOverview();
    } catch (error) {
      // Keep the local drill usable even if the cleanup call fails.
    }
  }

  function checkErrorDrill() {
    if (!state.errorDrill) return;
    const inputs = $$('[data-error-key]', els.stepBody);
    let wrong = 0;
    const keys = {};
    inputs.forEach(input => {
      const key = input.getAttribute('data-error-key');
      const [lineIndex, cellIndex] = key.split(':').map(Number);
      const line = state.errorDrill.lines.find(item => Number(item.lineIndex) === lineIndex);
      const expected = line && line.cells[cellIndex] ? line.cells[cellIndex].expected : '';
      const value = String(input.value || '').trim();
      state.errorDrill.answers[key] = value;
      const ok = value === expected;
      keys[key] = ok;
      if (!ok) wrong += 1;
    });
    state.errorDrillResult = { wrong, keys };
    renderStepBody();
    if (wrong === 0) {
      toast('錯字回練完成');
      clearReviewedErrors();
    }
  }

  async function markStep(step) {
    if (!state.poem) return;
    try {
      const result = await request('/api/poetry/progress', {
        method: 'POST',
        body: JSON.stringify({ poemId: state.poem.id, step })
      });
      const wasMastered = state.poem.mastered;
      applyProgress(result.progress);
      await loadOverview();
      renderLearn();
      if (result.mastered && !wasMastered) toast('《' + state.poem.title + '》已掌握，得一枚詩印。');
      else toast('已完成「' + STEP_LABELS[step] + '」');
    } catch (error) {
      toast(error.message || '未能保存進度');
    }
  }

  async function submitDictation() {
    const inputs = $$('[data-dictation]', els.stepBody);
    const lines = state.poem.lines.map((line, index) => {
      const input = inputs.find(item => Number(item.getAttribute('data-dictation')) === index);
      return input ? input.value : (state.dictationDraft[index] || '');
    });
    try {
      const result = await request('/api/poetry/dictation', {
        method: 'POST',
        body: JSON.stringify({
          poemId: state.poem.id,
          lines,
          duration: Math.max(0, Date.now() - state.dictationStart)
        })
      });
      state.dictationResult = result;
      state.dictationDraft = lines;
      state.blind = false;
      const wasMastered = state.poem.mastered;
      applyProgress(result.progress);
      await loadOverview();
      renderLearn();
      if (result.passed) toast(result.mastered && !wasMastered ? '默寫通過，這首詩已掌握。' : '默寫通過，正確率 ' + result.accuracy + '%。');
      else toast('默寫正確率 ' + result.accuracy + '%，再試一次。');
    } catch (error) {
      toast(error.message || '未能提交默寫');
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      toast('這個瀏覽器不支援朗讀');
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = state.lang;
    utterance.rate = 0.78;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = state.lang === 'zh-HK' && state.preferredVoice
      ? voices.find(voice => voice.name === state.preferredVoice)
      : null;
    const exact = voices.find(voice => voice.lang === state.lang);
    const fallback = voices.find(voice => voice.lang && voice.lang.toLowerCase().indexOf(state.lang.slice(0, 2)) === 0);
    if (preferred) utterance.voice = preferred;
    else if (exact) utterance.voice = exact;
    else if (fallback) utterance.voice = fallback;
    window.speechSynthesis.speak(utterance);
  }

  function speakLine(index) {
    const line = state.poem && state.poem.lines[index];
    if (line) speak(line.text);
  }

  function speakAll() {
    if (!state.poem) return;
    speak(state.poem.lines.map(line => line.text).join('，'));
  }

  function nextStep(step) {
    if (!STEPS.includes(step)) return;
    setStep(step);
  }

  function toggleBlind() {
    state.blind = !state.blind;
    renderPaper();
    renderStepBody();
  }

  async function previewPoems() {
    const textarea = $('#poem-import-text');
    const text = textarea ? textarea.value : '';
    if (!text.trim()) {
      toast('請先貼上或上傳詩單');
      return;
    }
    state.importText = text;
    state.importPreview = null;
    try {
      const preview = await request('/api/poetry/admin/poems/preview', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      state.importPreview = preview;
      renderImportResult();
    } catch (error) {
      toast(error.message || '預覽失敗');
    }
  }

  async function importPoemText() {
    const textarea = $('#poem-import-text');
    const text = textarea ? textarea.value : state.importText;
    if (!text.trim()) {
      toast('請先貼上或上傳詩單');
      return;
    }
    if (state.importBusy) return;
    state.importBusy = true;
    renderImportResult();
    try {
      const result = await request('/api/poetry/admin/poems/import', {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      state.importBusy = false;
      state.importPreview = null;
      state.importText = '';
      await loadOverview();
      await loadAdminData();
      renderHall();
      renderParent();
      toast('已匯入 ' + result.total + ' 首詩（新增 ' + result.added + '、更新 ' + result.updated + '）');
    } catch (error) {
      state.importBusy = false;
      toast(error.message || '匯入失敗');
      renderImportResult();
    }
  }

  async function updatePoemTask(form) {
    const groupId = form.getAttribute('data-group-id');
    const name = String(form.querySelector('[name="task_name"]').value || '').trim();
    const poemIds = $$('[data-edit-pick]:checked', form).map(input => input.getAttribute('data-edit-pick'));
    const assignees = $$('[data-edit-assignee]:checked', form).map(input => input.getAttribute('data-edit-assignee'));
    if (!name) {
      toast('請填任務名稱');
      return;
    }
    if (!poemIds.length) {
      toast('請至少保留一首詩');
      return;
    }
    if (!assignees.length) {
      toast('請至少保留一位孩子');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = '保存中…'; }
    try {
      await request('/api/poetry/tasks/' + encodeURIComponent(groupId), {
        method: 'PUT',
        body: JSON.stringify({
          task_name: name,
          poem_ids: poemIds,
          daily_goal: form.querySelector('[name="daily_goal"]').value,
          pass_score: form.querySelector('[name="pass_score"]').value,
          userIds: assignees
        })
      });
      state.editingTask = null;
      state.editPicked = [];
      state.editAssignees = [];
      await loadAdminData();
      renderParent();
      toast('任務已更新');
    } catch (error) {
      toast(error.message || '更新失敗');
    } finally {
      if (button) { button.disabled = false; button.textContent = '保存修改'; }
    }
  }

  async function deletePoemTask(groupId) {
    if (!window.confirm('刪除這個任務？孩子已學的詩和進度會保留。')) return;
    try {
      await request('/api/poetry/tasks/' + encodeURIComponent(groupId), { method: 'DELETE' });
      await loadOverview();
      await loadAdminData();
      renderHall();
      renderParentTasks();
      toast('任務已刪除');
    } catch (error) {
      toast(error.message || '刪除失敗');
    }
  }

  async function createPoemTask(form) {
    const name = String(form.querySelector('[name="task_name"]').value || '').trim();
    const poemIds = $$('[data-pick-poem]:checked', form).map(input => input.getAttribute('data-pick-poem'));
    const assignees = $$('[data-assignee]:checked', form).map(input => input.getAttribute('data-assignee'));
    if (!name) {
      toast('請填任務名稱');
      return;
    }
    if (!poemIds.length) {
      toast('請至少選一首詩');
      return;
    }
    if (!assignees.length) {
      toast('請選擇指派對象');
      return;
    }
    const payload = {
      task_name: name,
      poem_ids: poemIds,
      daily_goal: form.querySelector('[name="daily_goal"]').value,
      pass_score: form.querySelector('[name="pass_score"]').value,
      userIds: assignees.includes('all') ? [] : assignees
    };
    const button = form.querySelector('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = '建立中…'; }
    try {
      await request('/api/poetry/tasks', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      await loadOverview();
      await loadAdminData();
      renderHall();
      renderParent();
      toast('任務已建立');
    } catch (error) {
      toast(error.message || '建立失敗');
    } finally {
      if (button) { button.disabled = false; button.textContent = '建立任務'; }
    }
  }

  function onDocumentClick(event) {
    const target = event.target;
    const mode = target.closest('[data-mode]');
    if (mode) {
      setMode(mode.getAttribute('data-mode'));
      return;
    }
    if (target.closest('#parent-child-btn')) {
      setMode('child');
      return;
    }
    const parentTab = target.closest('[data-parent-tab]');
    if (parentTab) {
      state.parentTab = parentTab.getAttribute('data-parent-tab');
      renderParent();
      return;
    }
    if (target.closest('[data-pick-all]')) {
      $$('[data-pick-poem]').forEach(input => { input.checked = true; });
      updatePickCount();
      return;
    }
    if (target.closest('[data-pick-none]')) {
      $$('[data-pick-poem]').forEach(input => { input.checked = false; });
      updatePickCount();
      return;
    }
    const editTask = target.closest('[data-edit-task]');
    if (editTask) {
      const group = state.adminTasks.find(item => String(item.groupId) === String(editTask.getAttribute('data-edit-task')));
      if (group) {
        state.editingTask = group;
        state.editPicked = (group.poem_ids || []).slice();
        state.editAssignees = (group.users || []).map(user => String(user.userId));
        renderParentTasks();
        const editor = $('#task-edit-form');
        if (editor) editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    if (target.closest('[data-cancel-task-edit]')) {
      state.editingTask = null;
      state.editPicked = [];
      state.editAssignees = [];
      renderParentTasks();
      return;
    }
    if (target.closest('[data-edit-pick-all]')) {
      $$('[data-edit-pick]').forEach(input => { input.checked = true; });
      state.editPicked = $$('[data-edit-pick]').map(input => input.getAttribute('data-edit-pick'));
      updateEditPickCount();
      return;
    }
    if (target.closest('[data-edit-pick-none]')) {
      $$('[data-edit-pick]').forEach(input => { input.checked = false; });
      state.editPicked = [];
      updateEditPickCount();
      return;
    }
    if (target.closest('[data-edit-assignee-all]')) {
      $$('[data-edit-assignee]').forEach(input => { input.checked = true; });
      state.editAssignees = $$('[data-edit-assignee]').map(input => input.getAttribute('data-edit-assignee'));
      updateEditAssigneeCount();
      return;
    }
    if (target.closest('[data-edit-assignee-none]')) {
      $$('[data-edit-assignee]').forEach(input => { input.checked = false; });
      state.editAssignees = [];
      updateEditAssigneeCount();
      return;
    }
    const deleteTask = target.closest('[data-delete-task]');
    if (deleteTask) {
      deletePoemTask(deleteTask.getAttribute('data-delete-task'));
      return;
    }
    if (target.closest('[data-poem-preview]')) {
      previewPoems();
      return;
    }
    if (target.closest('[data-poem-import]')) {
      importPoemText();
      return;
    }
    if (target.closest('#poem-sample-btn')) {
      const button = target.closest('#poem-sample-btn');
      const textarea = $('#poem-import-text');
      if (textarea) {
        textarea.value = button.dataset.sample || '';
        state.importText = textarea.value;
        state.importPreview = null;
        renderImportResult();
      }
      return;
    }
    const open = target.closest('[data-open]');
    if (open) {
      openPoem(open.getAttribute('data-open'));
      return;
    }
    const errorReview = target.closest('[data-error-review]');
    if (errorReview) {
      openErrorReview(errorReview.getAttribute('data-error-review'));
      return;
    }
    const review = target.closest('[data-review]');
    if (review) {
      openPoem(review.getAttribute('data-review'), 'recite');
      return;
    }
    const theme = target.closest('[data-theme]');
    if (theme) {
      state.theme = theme.getAttribute('data-theme');
      renderHall();
      return;
    }
    if (target.closest('#learn-back') || target.closest('[data-action="back-hall"]')) {
      els.learnView.hidden = true;
      els.hallView.hidden = false;
      state.poem = null;
      renderHall();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (target.closest('#lang-toggle')) {
      state.lang = state.lang === 'zh-CN' ? 'zh-HK' : 'zh-CN';
      localStorage.setItem('poetry-lang', state.lang);
      renderLearn();
      return;
    }
    if (target.closest('#pinyin-toggle')) {
      state.pinyin = !state.pinyin;
      renderPaper();
      els.pinyinToggle.classList.toggle('is-active', state.pinyin);
      return;
    }
    if (target.closest('#translation-toggle')) {
      state.translation = !state.translation;
      renderPaper();
      els.translationToggle.classList.toggle('is-active', state.translation);
      return;
    }
    const stepTab = target.closest('[data-step-tab]');
    if (stepTab) {
      setStep(stepTab.getAttribute('data-step-tab'));
      return;
    }
    const nextButton = target.closest('[data-next-step]');
    if (nextButton) {
      nextStep(nextButton.getAttribute('data-next-step'));
      return;
    }
    const complete = target.closest('[data-complete]');
    if (complete) {
      markStep(complete.getAttribute('data-complete'));
      return;
    }
    if (target.closest('[data-action="redo-step"]')) {
      setStep(state.step);
      return;
    }
    const speakButton = target.closest('[data-speak]');
    if (speakButton) {
      speakLine(Number(speakButton.getAttribute('data-speak')));
      return;
    }
    if (target.closest('[data-action="speak-all"]')) {
      speakAll();
      return;
    }
    const orderAdd = target.closest('[data-order-add]');
    if (orderAdd) {
      const index = Number(orderAdd.getAttribute('data-order-add'));
      if (!state.orderPicked.includes(index)) {
        state.orderPicked.push(index);
        state.orderResult = null;
        renderStepBody();
      }
      return;
    }
    const orderRemove = target.closest('[data-order-remove]');
    if (orderRemove) {
      const slot = Number(orderRemove.getAttribute('data-order-remove'));
      if (state.orderPicked[slot] !== undefined) {
        state.orderPicked.splice(slot, 1);
        state.orderResult = null;
        renderStepBody();
      }
      return;
    }
    if (target.closest('[data-action="order-reset"]')) {
      setStep('order');
      return;
    }
    if (target.closest('[data-action="order-check"]')) {
      const picked = state.orderPicked.slice();
      const ok = picked.length === state.poem.lines.length && picked.every((value, index) => value === index);
      state.orderResult = { ok };
      renderStepBody();
      if (ok) markStep('order');
      return;
    }
    if (target.closest('[data-action="fill-hint"]')) {
      const empty = Array.from(els.stepBody.querySelectorAll('[data-fill-key]')).find(input => !input.value);
      if (!empty) {
        toast('空格都填滿了');
        return;
      }
      const blank = state.fillBlanks.find(item => item.lineIndex + ':' + item.charIndex === empty.getAttribute('data-fill-key'));
      if (blank) {
        empty.value = blank.answer;
        state.fillAnswers[empty.getAttribute('data-fill-key')] = blank.answer;
        empty.classList.add('is-good');
      }
      return;
    }
    if (target.closest('[data-action="fill-check"]')) {
      const inputs = $$('[data-fill-key]', els.stepBody);
      let wrong = 0;
      const keys = {};
      inputs.forEach(input => {
        const key = input.getAttribute('data-fill-key');
        const blank = state.fillBlanks.find(item => item.lineIndex + ':' + item.charIndex === key);
        const value = String(input.value || '').trim();
        state.fillAnswers[key] = value;
        const ok = !!blank && value === blank.answer;
        keys[key] = ok;
        if (!ok) wrong += 1;
      });
      state.fillResult = { ok: wrong === 0, wrong, keys };
      renderStepBody();
      if (wrong === 0) markStep('fill');
      return;
    }
    if (target.closest('[data-action="fill-reset"]')) {
      setStep('fill');
      return;
    }
    const reciteMode = target.closest('[data-recite-mode]');
    if (reciteMode) {
      state.reciteMode = reciteMode.getAttribute('data-recite-mode');
      renderStepBody();
      return;
    }
    if (target.closest('[data-action="toggle-blind"]')) {
      toggleBlind();
      return;
    }
    if (target.closest('[data-action="dictation-submit"]')) {
      submitDictation();
      return;
    }
    if (target.closest('[data-action="error-drill"]')) {
      startErrorDrill();
      return;
    }
    if (target.closest('[data-action="error-check"]')) {
      checkErrorDrill();
      return;
    }
    if (target.closest('[data-action="error-again"]')) {
      setStep('dictation');
      return;
    }
    if (target.closest('[data-action="dictation-again"]')) {
      setStep('dictation');
      return;
    }
  }

  function onDocumentSubmit(event) {
    const createForm = event.target.closest('#poem-task-form');
    if (createForm) {
      event.preventDefault();
      createPoemTask(createForm);
      return;
    }
    const editForm = event.target.closest('#task-edit-form');
    if (editForm) {
      event.preventDefault();
      updatePoemTask(editForm);
    }
  }

  function onDocumentChange(event) {
    const pick = event.target.closest('[data-pick-poem]');
    if (pick) {
      updatePickCount();
      return;
    }
    const editPick = event.target.closest('[data-edit-pick]');
    if (editPick) {
      state.editPicked = $$('[data-edit-pick]:checked').map(input => input.getAttribute('data-edit-pick'));
      updateEditPickCount();
      return;
    }
    const editAssignee = event.target.closest('[data-edit-assignee]');
    if (editAssignee) {
      state.editAssignees = $$('[data-edit-assignee]:checked').map(input => input.getAttribute('data-edit-assignee'));
      updateEditAssigneeCount();
      return;
    }
    const all = event.target.closest('[data-assignee="all"]');
    if (all) {
      $$('[data-assignee]:not([data-assignee="all"])').forEach(input => {
        input.checked = false;
        input.disabled = all.checked;
      });
      return;
    }
    const assignee = event.target.closest('[data-assignee]');
    if (assignee) {
      const allBox = $('[data-assignee="all"]');
      if (allBox && allBox.checked) allBox.checked = false;
      $$('[data-assignee]:not([data-assignee="all"])').forEach(input => { input.disabled = false; });
      return;
    }
    const file = event.target.closest('#poem-import-file');
    if (file && file.files && file.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        const textarea = $('#poem-import-text');
        if (textarea) textarea.value = String(reader.result || '');
        state.importText = String(reader.result || '');
        state.importPreview = null;
        renderImportResult();
      };
      reader.readAsText(file.files[0]);
    }
  }

  function onDocumentInput(event) {
    if (event.target.id === 'poem-import-text') {
      state.importText = event.target.value;
      if (state.importPreview) {
        state.importPreview = null;
        renderImportResult();
      }
      return;
    }
    const fill = event.target.closest('[data-fill-key]');
    if (fill) {
      state.fillAnswers[fill.getAttribute('data-fill-key')] = fill.value;
      return;
    }
    const dictation = event.target.closest('[data-dictation]');
    if (dictation) {
      state.dictationDraft[Number(dictation.getAttribute('data-dictation'))] = dictation.value;
      return;
    }
    const errorInput = event.target.closest('[data-error-key]');
    if (errorInput && state.errorDrill) {
      state.errorDrill.answers[errorInput.getAttribute('data-error-key')] = errorInput.value;
    }
  }

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('submit', onDocumentSubmit);
  document.addEventListener('change', onDocumentChange);
  document.addEventListener('input', onDocumentInput);
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', () => window.speechSynthesis.getVoices());
  }

  boot();
})();
