(function () {
  'use strict';

  const FALLBACK_TOOLS = [
    {
      id: 'shizi',
      name: '識字樂',
      short: '識字樂',
      entry: '/tools/shizi/',
      weight: 0.4,
      active: true,
      accent: '#5546b8',
      icon: 'book',
      desc: '拖動部件拼出漢字，保留原本的任務、語音與進度。'
    },
    {
      id: 'grammar',
      name: '文法花園',
      short: '文法',
      entry: '/tools/grammar/',
      weight: 0.4,
      active: true,
      accent: '#2f8f6b',
      icon: 'leaf',
      desc: '由詞法到時態，用自適應練習把英文文法一步一步練成直覺。'
    },
    {
      id: 'idiom',
      name: '成語天地',
      short: '成語',
      entry: '/tools/idiom/',
      weight: 0.25,
      active: true,
      accent: '#a8452f',
      icon: 'spark',
      desc: '按場景練成語，從神態、心情到寫景，把表達詞彙一點一點累積起來。'
    }
  ];

  let TOOLS = FALLBACK_TOOLS.slice();

  const NAV_ITEMS = [
    { id: 'overview', label: '總覽', icon: 'grid' },
    { id: 'ranking', label: '綜合排名', icon: 'trophy' },
    { id: 'profile', label: '學習檔案', icon: 'user' }
  ];

  const ADMIN_NAV = { id: 'admin', label: '用戶管理', icon: 'users' };

  const AVATAR_PICKS = [
    '🐱', '🐶', '🐰', '🦊', '🐼', '🐨',
    '🐯', '🦁', '🐸', '🐵', '🐷', '🐻',
    '🌸', '🍎', '⭐', '🌙', '🎨', '👧',
    '👦', '👩', '👨'
  ];

  const ICONS = {
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"></rect><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"></rect><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"></rect><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"></rect>',
    trophy: '<path d="M8 21h8"></path><path d="M12 17v4"></path><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"></path><path d="M7 6H4v2a3 3 0 0 0 3 3"></path><path d="M17 6h3v2a3 3 0 0 1-3 3"></path>',
    user: '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 20a7 7 0 0 1 14 0"></path>',
    users: '<circle cx="9" cy="8" r="3"></circle><path d="M3 19a6 6 0 0 1 12 0"></path><path d="M16 5.5a3 3 0 0 1 0 5.8"></path><path d="M18 19a5 5 0 0 0-2-4"></path>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z"></path><path d="M4 17.5h16"></path><path d="M8 7h8"></path>',
    spark: '<path d="M12 3v4"></path><path d="M12 17v4"></path><path d="M3 12h4"></path><path d="M17 12h4"></path><path d="M5.6 5.6l2.8 2.8"></path><path d="M15.6 15.6l2.8 2.8"></path><path d="M18.4 5.6l-2.8 2.8"></path><path d="M8.4 15.6l-2.8 2.8"></path>',
    pen: '<path d="M4 20l4-1 10-10a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"></path><path d="M14 6l4 4"></path>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8"></path><path d="M8 11h2"></path><path d="M14 11h2"></path><path d="M8 15h2"></path><path d="M14 15h2"></path><path d="M8 19h2"></path><path d="M14 19h2"></path>',
    leaf: '<path d="M20 4c-7 0-12 4-12 10a5 5 0 0 0 5 5c6 0 7-8 7-15Z"></path><path d="M4 20c2-6 7-9 13-11"></path>',
    arrowRight: '<path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path>',
    arrowLeft: '<path d="M19 12H5"></path><path d="M11 6l-6 6 6 6"></path>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"></path><path d="M20 5v6h-6"></path>',
    external: '<path d="M14 4h6v6"></path><path d="M20 4 10 14"></path><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"></path>',
    search: '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4 4"></path>',
    edit: '<path d="M4 20l4-1 10-10a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"></path><path d="M14 6l4 4"></path>',
    rotate: '<path d="M4 10a8 8 0 1 1 2 7"></path><path d="M4 4v6h6"></path>',
    trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path><path d="M10 11v5"></path><path d="M14 11v5"></path>'
  };

  const state = {
    user: null,
    stats: null,
    ranking: [],
    adminUsers: null,
    view: 'overview',
    rankTab: 'overall',
    authMode: 'login',
    adminQuery: '',
    adminRole: 'all',
    editingUserId: null,
    confirmAction: null,
    collapsed: false
  };

  const els = {
    boot: document.getElementById('boot-screen'),
    authRoot: document.getElementById('auth-root'),
    authForm: document.getElementById('auth-form'),
    authTitle: document.getElementById('auth-title'),
    authSubtitle: document.getElementById('auth-subtitle'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    authError: document.getElementById('auth-error'),
    authSubmit: document.getElementById('auth-submit'),
    authSwitch: document.getElementById('auth-switch'),
    appRoot: document.getElementById('app-root'),
    sidebar: document.getElementById('sidebar'),
    toolNav: document.getElementById('tool-nav'),
    sharedNav: document.getElementById('shared-nav'),
    collapseBtn: document.getElementById('collapse-btn'),
    menuBtn: document.getElementById('menu-btn'),
    drawerClose: document.getElementById('drawer-close'),
    overlay: document.getElementById('nav-overlay'),
    topAvatar: document.getElementById('top-avatar'),
    topName: document.getElementById('top-name'),
    topUsername: document.getElementById('top-username'),
    topRole: document.getElementById('top-role'),
    accountBtn: document.getElementById('account-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    main: document.getElementById('main'),
    userDialog: document.getElementById('user-dialog'),
    userDialogTitle: document.getElementById('user-dialog-title'),
    userDialogSummary: document.getElementById('user-dialog-summary'),
    userForm: document.getElementById('user-form'),
    userNickname: document.getElementById('user-nickname'),
    userNicknameError: document.getElementById('user-nickname-error'),
    userAvatar: document.getElementById('user-avatar'),
    userAvatarPicks: document.getElementById('user-avatar-picks'),
    userAvatarPreview: document.getElementById('user-avatar-preview'),
    userRole: document.getElementById('user-role'),
    userRoleHint: document.getElementById('user-role-hint'),
    userPassword: document.getElementById('user-password'),
    userFormError: document.getElementById('user-form-error'),
    userSave: document.getElementById('user-save'),
    confirmDialog: document.getElementById('confirm-dialog'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmMessage: document.getElementById('confirm-message'),
    confirmError: document.getElementById('confirm-error'),
    confirmAccept: document.getElementById('confirm-accept'),
    toast: document.getElementById('toast'),
    live: document.getElementById('live')
  };

  let toolFrame = null;
  let toastTimer = null;
  let lastSync = 0;

  /* ===== Utilities ===== */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function hexToRgb(hex) {
    let value = String(hex || '').replace('#', '');
    if (value.length === 3) value = value.split('').map(function (part) { return part + part; }).join('');
    if (!/^[0-9a-f]{6}$/i.test(value)) return null;
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ];
  }

  function mixHex(first, second, firstWeight) {
    const a = hexToRgb(first);
    const b = hexToRgb(second);
    if (!a || !b) return first;
    const weight = Math.max(0, Math.min(1, firstWeight));
    return '#' + a.map(function (channel, index) {
      return Math.round(channel * weight + b[index] * (1 - weight)).toString(16).padStart(2, '0');
    }).join('');
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 'rgba(255, 255, 255, ' + alpha + ')';
    return 'rgba(' + rgb.join(', ') + ', ' + alpha + ')';
  }

  function applySidebarTheme(tool) {
    const root = document.documentElement;
    const properties = [
      '--sidebar', '--sidebar-2', '--sidebar-muted', '--sidebar-accent',
      '--sidebar-icon', '--sidebar-brand', '--sidebar-hover', '--sidebar-active'
    ];
    if (!tool || !tool.accent) {
      properties.forEach(function (name) { root.style.removeProperty(name); });
      return;
    }
    const accent = tool.accent;
    root.style.setProperty('--sidebar', mixHex(accent, '#0f171b', 0.30));
    root.style.setProperty('--sidebar-2', mixHex(accent, '#10181c', 0.40));
    root.style.setProperty('--sidebar-muted', mixHex(accent, '#93a5a2', 0.18));
    root.style.setProperty('--sidebar-accent', mixHex(accent, '#ffffff', 0.35));
    root.style.setProperty('--sidebar-icon', mixHex(accent, '#ffffff', 0.55));
    root.style.setProperty('--sidebar-brand', accent);
    root.style.setProperty('--sidebar-hover', rgba(accent, 0.14));
    root.style.setProperty('--sidebar-active', rgba(accent, 0.22));
  }

  function icon(name, size) {
    const body = ICONS[name] || ICONS.grid;
    return '<svg class="od-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="--od-icon-size:' + (size || 18) + 'px">' + body + '</svg>';
  }

  function fmtInt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('zh-HK') : '0';
  }

  function fmtPct(value) {
    const number = Math.round(Number(value) * 10) / 10;
    if (!Number.isFinite(number)) return '0';
    return number.toFixed(1).replace(/\.0$/, '');
  }

  function avgTimeText(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return '—';
    return (value / 1000).toFixed(1) + 's';
  }

  function toolById(id) {
    return TOOLS.find(function (tool) { return tool.id === id; }) || null;
  }

  function toolName(id) {
    const tool = toolById(id);
    return tool ? tool.name : id;
  }

  function hueFrom(seed) {
    const text = String(seed || '?');
    let hue = 0;
    for (let i = 0; i < text.length; i += 1) {
      hue = (hue * 31 + text.charCodeAt(i)) % 360;
    }
    return hue;
  }

  function avatarHTML(user, size) {
    const cls = 'avatar avatar-' + (size || 'md');
    const value = user && user.avatar ? String(user.avatar).trim() : '';
    if (value && /^(https?:\/\/|data:image\/)/i.test(value)) {
      return '<span class="' + cls + '"><img src="' + esc(value) + '" alt=""></span>';
    }
    const name = (user && (user.nickname || user.username)) || '?';
    const chars = Array.from(name);
    let fallback = chars.length ? chars[chars.length - 1] : '?';
    if (/^[A-Za-z0-9]/.test(name)) fallback = name.charAt(0).toUpperCase();
    return '<span class="' + cls + '" style="--avatar-hue:' + hueFrom(user && (user.id || user.username)) + '">' + esc(value || fallback) + '</span>';
  }

  function roleLabel(role) {
    return role === 'admin' ? '管理員' : '學生';
  }

  function weekdayShort(dateText) {
    const date = new Date(dateText + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return '';
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  }

  function todayLabel() {
    try {
      return new Intl.DateTimeFormat('zh-HK', {
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      }).format(new Date());
    } catch (error) {
      return '';
    }
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return '早晨';
    if (hour < 18) return '午安';
    return '晚上好';
  }

  function emptyHTML(title, text) {
    return '<div class="empty"><p class="empty-title">' + esc(title) + '</p><p class="empty-text">' + esc(text) + '</p></div>';
  }

  function loadingHTML(text) {
    return '<div class="loading"><span class="spinner" aria-hidden="true"></span>' + esc(text) + '</div>';
  }

  /* ===== API ===== */
  async function api(path, method, body) {
    const options = {
      method: method || 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch('/api' + path, options);
    } catch (error) {
      const offline = new Error('連不上伺服器，請確認學習平台服務正在運行');
      offline.offline = true;
      throw offline;
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = null;
      }
    }

    if (!response.ok) {
      const failure = new Error((data && data.error) || '請求失敗（' + response.status + '）');
      failure.status = response.status;
      throw failure;
    }
    return data;
  }

  async function loadTools() {
    try {
      const tools = await api('/platform/tools');
      if (Array.isArray(tools) && tools.length) TOOLS = tools;
    } catch (error) {
      TOOLS = FALLBACK_TOOLS.slice();
    }
  }

  async function loadWorkspaceData() {
    const results = await Promise.all([api('/stats'), api('/platform/ranking')]);
    state.stats = results[0] || null;
    state.ranking = Array.isArray(results[1]) ? results[1] : [];
  }

  /* ===== Toast & errors ===== */
  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.remove('is-in');
    void els.toast.offsetWidth;
    els.toast.classList.add('is-in');
    els.live.textContent = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      els.toast.classList.remove('is-in');
      els.toast.hidden = true;
    }, 2600);
  }

  function handleError(error) {
    if (error && error.status === 401) {
      showAuth('登入已過期，請重新登入');
      return;
    }
    toast((error && error.message) || '操作失敗，請再試一次');
  }

  function setAuthError(message) {
    els.authError.textContent = message || '';
    els.authError.hidden = !message;
  }

  function setAuthBusy(busy) {
    els.authSubmit.disabled = busy;
    els.authSubmit.textContent = busy ? '請稍候…' : (state.authMode === 'login' ? '登入' : '註冊');
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.restore = button.textContent;
      button.disabled = true;
      button.textContent = label || '請稍候…';
    } else {
      button.disabled = false;
      button.textContent = label || button.dataset.restore || '確認';
      delete button.dataset.restore;
    }
  }

  /* ===== Auth screen ===== */
  function setAuthMode(mode) {
    state.authMode = mode;
    const isLogin = mode === 'login';
    els.authTitle.textContent = isLogin ? '登入' : '註冊';
    els.authSubtitle.textContent = isLogin
      ? '同一個帳戶，共用識字樂與文法花園的進度與綜合排名。'
      : '建立帳戶後會自動登入；第一次註冊的帳戶會成為管理員。';
    els.authSubmit.textContent = isLogin ? '登入' : '註冊';
    els.authSwitch.textContent = isLogin ? '還沒有帳戶？立即註冊' : '已有帳戶？返回登入';
    els.authPassword.autocomplete = isLogin ? 'current-password' : 'new-password';
    setAuthError('');
  }

  function showAuth(message) {
    [els.userDialog, els.confirmDialog].forEach(closeDialog);
    destroyToolFrame();
    state.user = null;
    state.stats = null;
    state.ranking = [];
    state.adminUsers = null;
    state.view = 'overview';
    state.rankTab = 'overall';
    applySidebarTheme(null);
    els.boot.hidden = true;
    els.appRoot.hidden = true;
    els.authRoot.hidden = false;
    closeDrawer(false);
    setAuthMode('login');
    setAuthError(message || '');
    window.setTimeout(function () {
      if (!els.authUsername.value) els.authUsername.focus();
    }, 40);
  }

  function showApp() {
    els.boot.hidden = true;
    els.authRoot.hidden = true;
    els.appRoot.hidden = false;
    applyCollapsed();
  }

  /* ===== Data helpers ===== */
  function myRankingRow() {
    if (!state.user) return null;
    return state.ranking.find(function (row) {
      return String(row.userId) === String(state.user.id);
    }) || null;
  }

  function myRank() {
    if (!state.user) return null;
    const row = myRankingRow();
    if (!row || !(Number(row.combined) > 0)) return null;
    const index = state.ranking.findIndex(function (item) {
      return String(item.userId) === String(state.user.id);
    });
    return index >= 0 ? index + 1 : null;
  }

  function toolStats(toolId) {
    const row = myRankingRow();
    return row && row.tools ? (row.tools[toolId] || null) : null;
  }

  function toolRank(toolId) {
    if (!state.user) return null;
    const mine = myRankingRow();
    const detail = mine && mine.tools ? mine.tools[toolId] : null;
    if (detail && detail.rank) return detail.rank;
    const rows = state.ranking.slice().sort(function (a, b) {
      const at = a.tools && a.tools[toolId] ? a.tools[toolId] : {};
      const bt = b.tools && b.tools[toolId] ? b.tools[toolId] : {};
      if (toolId === 'grammar') {
        return (Number(bt.masteryRate) || 0) - (Number(at.masteryRate) || 0) ||
          (Number(bt.attempted) || 0) - (Number(at.attempted) || 0) ||
          (Number(bt.accuracy) || 0) - (Number(at.accuracy) || 0) ||
          (Number(at.avgTime) || Infinity) - (Number(bt.avgTime) || Infinity);
      }
      if (toolId === 'idiom') {
        return (Number(bt.score) || 0) - (Number(at.score) || 0) ||
          (Number(bt.attempted) || 0) - (Number(at.attempted) || 0) ||
          (Number(bt.accuracy) || 0) - (Number(at.accuracy) || 0) ||
          (Number(at.avgTime) || Infinity) - (Number(bt.avgTime) || Infinity);
      }
      return (Number(bt.charsKnown) || 0) - (Number(at.charsKnown) || 0) ||
        (Number(bt.accuracy) || 0) - (Number(at.accuracy) || 0) ||
        (Number(at.avgTime) || Infinity) - (Number(bt.avgTime) || Infinity);
    });
    const index = rows.findIndex(function (row) {
      return String(row.userId) === String(state.user.id);
    });
    if (index < 0) return null;
    const fallback = rows[index].tools && rows[index].tools[toolId];
    return fallback && Number(fallback.score) > 0 ? index + 1 : null;
  }

  function recentPracticeCount() {
    const days = state.stats && Array.isArray(state.stats.recentActivity) ? state.stats.recentActivity : [];
    const shiziRecent = days.reduce(function (sum, day) {
      return sum + (Number(day.count) || 0);
    }, 0);
    const grammar = toolStats('grammar');
    const idiom = toolStats('idiom');
    return shiziRecent + (grammar ? Number(grammar.recent7) || 0 : 0) + (idiom ? Number(idiom.recent7) || 0 : 0);
  }

  /* ===== Chrome ===== */
  function navItemHTML(item) {
    const active = state.view === item.id;
    return '<button class="nav-item' + (active ? ' is-active' : '') + '" type="button" data-nav="' + item.id + '"' + (active ? ' aria-current="page"' : '') + '>' +
      '<span class="nav-icon">' + icon(item.icon, 18) + '</span>' +
      '<span class="nav-text">' + esc(item.label) + '</span>' +
      '</button>';
  }

  function renderNav() {
    els.toolNav.innerHTML = TOOLS.map(function (tool) {
      if (!tool.active) {
        return '<button class="nav-item is-soon" type="button" data-soon="' + tool.id + '" title="' + esc(tool.name) + '（待接入）">' +
          '<span class="nav-icon" style="color:' + tool.accent + '">' + icon(tool.icon, 18) + '</span>' +
          '<span class="nav-text">' + esc(tool.name) + '</span>' +
          '<span class="nav-tag">待接入</span>' +
          '</button>';
      }
      const viewId = 'tool/' + tool.id;
      const active = state.view === viewId;
      return '<button class="nav-item' + (active ? ' is-active' : '') + '" type="button" data-nav="' + viewId + '" data-nav-tool="' + tool.id + '"' + (active ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-icon" style="color:' + tool.accent + '">' + icon(tool.icon, 18) + '</span>' +
        '<span class="nav-text">' + esc(tool.name) + '</span>' +
        '</button>';
    }).join('');

    const items = NAV_ITEMS.slice();
    if (state.user && state.user.role === 'admin') items.push(ADMIN_NAV);
    els.sharedNav.innerHTML = items.map(navItemHTML).join('');
  }

  function renderAccount() {
    if (!state.user) return;
    const name = state.user.nickname || state.user.username;
    els.topAvatar.innerHTML = avatarHTML(state.user, 'sm');
    els.topName.textContent = name;
    els.topUsername.textContent = '@' + state.user.username;
    els.topRole.className = 'role-badge role-' + state.user.role;
    els.topRole.textContent = roleLabel(state.user.role);
    els.accountBtn.title = '查看學習檔案：' + name;
  }

  function renderAll() {
    applySidebarTheme(state.user ? currentTool() : null);
    if (!state.user) return;
    renderNav();
    renderAccount();
    renderMain();
  }

  function renderMain() {
    if (!state.user) return;
    const isTool = state.view.indexOf('tool/') === 0;
    els.main.classList.toggle('is-tool', isTool);
    if (isTool) {
      renderToolView();
      return;
    }
    if (state.view === 'ranking') {
      els.main.innerHTML = rankingHTML();
    } else if (state.view === 'profile') {
      els.main.innerHTML = profileHTML();
    } else if (state.view === 'admin') {
      els.main.innerHTML = adminHTML();
    } else {
      els.main.innerHTML = overviewHTML();
    }
  }

  /* ===== Overview ===== */
  function statHTML(value, unit, label, hint) {
    return '<div class="stat">' +
      '<div class="stat-value">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      '<div class="stat-label">' + label + '</div>' +
      (hint ? '<div class="stat-hint">' + hint + '</div>' : '') +
      '</div>';
  }

  function toolCardHTML(tool) {
    if (!tool.active) {
      return '<article class="tool-card is-soon" style="--tool:' + tool.accent + '">' +
        '<div class="tool-card-top"><span class="tool-icon">' + icon(tool.icon, 20) + '</span><span class="tool-badge">待接入</span></div>' +
        '<h3>' + esc(tool.name) + '</h3>' +
        '<p>' + esc(tool.desc) + '</p>' +
        '<div class="tool-card-foot"><span>接入後沿用同一份帳戶</span><span>權重 ' + Math.round(tool.weight * 100) + '%</span></div>' +
        '</article>';
    }
    const detail = toolStats(tool.id) || {};
    const rank = toolRank(tool.id);
    const isMastery = tool.id === 'grammar' || tool.id === 'idiom';
    const value = isMastery ? (detail.masteryRate || 0) : (detail.charsKnown || detail.score || 0);
    const label = isMastery ? '掌握率' : '已學';
    const unit = isMastery ? '%' : '字';
    return '<a class="tool-card" href="#/tool/' + tool.id + '" data-nav="tool/' + tool.id + '" style="--tool:' + tool.accent + '">' +
      '<div class="tool-card-top"><span class="tool-icon">' + icon(tool.icon, 20) + '</span><span class="tool-badge is-live">已接入</span></div>' +
      '<h3>' + esc(tool.name) + '</h3>' +
      '<p>' + esc(tool.desc) + '</p>' +
      '<div class="tool-card-foot"><span>' + label + ' <strong>' + fmtInt(value) + '</strong> ' + unit + '</span><span>' + (rank ? '第 ' + rank + ' 名' : '尚未上榜') + '</span></div>' +
      '</a>';
  }

  function miniRowHTML(row, rank, isMe) {
    return '<li class="mini-row' + (isMe ? ' is-me' : '') + '">' +
      '<span class="mini-no">' + rank + '</span>' +
      avatarHTML(row, 'xs') +
      '<span class="mini-name">' + esc(row.nickname || row.username) + (isMe ? '<span class="you">你</span>' : '') + '</span>' +
      '<span class="mini-score">' + fmtInt(row.combined) + ' 分</span>' +
      '</li>';
  }

  function miniRankHTML() {
    if (!state.ranking.length) {
      return emptyHTML('尚未有排名', '完成一局識字樂或文法花園，就會出現在這裡。');
    }
    const rows = state.ranking.slice(0, 5).map(function (row, index) {
      return miniRowHTML(row, index + 1, String(row.userId) === String(state.user.id));
    });
    const myIndex = state.ranking.findIndex(function (row) {
      return String(row.userId) === String(state.user.id);
    });
    if (myIndex >= 5) {
      rows.push('<li class="mini-sep" aria-hidden="true"></li>');
      rows.push(miniRowHTML(state.ranking[myIndex], myIndex + 1, true));
    }
    return '<ol class="mini-rank">' + rows.join('') + '</ol>';
  }

  function activityHTML() {
    const days = state.stats && Array.isArray(state.stats.recentActivity) ? state.stats.recentActivity : [];
    if (!days.length) {
      return emptyHTML('還沒有練習紀錄', '開始一局識字樂，近七日的活動會顯示在這裡。');
    }
    const max = Math.max.apply(null, [1].concat(days.map(function (day) { return Number(day.count) || 0; })));
    const today = new Date().toISOString().slice(0, 10);
    const total = days.reduce(function (sum, day) { return sum + (Number(day.count) || 0); }, 0);
    const bars = days.map(function (day) {
      const count = Number(day.count) || 0;
      const label = weekdayShort(day.date);
      const height = count ? Math.max(6, Math.round((count / max) * 100)) : 0;
      return '<div class="day" role="img" aria-label="星期' + label + ' ' + count + ' 次練習">' +
        '<span class="day-label">' + label + '</span>' +
        '<span class="day-track"><span class="day-fill' + (day.date === today ? ' is-today' : '') + '" style="height:' + height + '%"></span></span>' +
        '<span class="day-count">' + (count || '—') + '</span>' +
        '</div>';
    }).join('');
    return '<div class="day-grid">' + bars + '</div>' +
      (total ? '' : '<p class="panel-note">這七天還未練習，開始一局就會有紀錄。</p>');
  }

  function overviewHTML() {
    const shizi = toolStats('shizi') || { charsKnown: 0, totalAttempts: 0, avgTime: 0 };
    const grammar = toolStats('grammar') || { mastered: 0, attempts: 0, recent7: 0 };
    const idiom = toolStats('idiom') || { mastered: 0, attempts: 0, recent7: 0 };
    const rank = myRank();
    const recent = recentPracticeCount();
    const shiziTool = toolById('shizi');
    const grammarTool = toolById('grammar');
    const preferGrammar = !(Number(shizi.charsKnown) > 0) && Number(grammar.mastered) > 0 && grammarTool && grammarTool.active;
    const primary = preferGrammar ? grammarTool : (shiziTool && shiziTool.active ? shiziTool : (TOOLS.find(function (tool) { return tool.active; }) || TOOLS[0]));
    const primaryLabel = primary ? primary.name : '識字樂';
    const startLabel = (Number(shizi.charsKnown) > 0 || preferGrammar) ? '繼續' + primaryLabel : '開始' + primaryLabel;
    const activeCount = TOOLS.filter(function (tool) { return tool.active; }).length;
    const totalAttempts = (Number(shizi.totalAttempts) || 0) + (Number(grammar.attempts) || 0) + (Number(idiom.attempts) || 0);
    const shiziRecent = state.stats && Array.isArray(state.stats.recentActivity)
      ? state.stats.recentActivity.reduce(function (sum, day) { return sum + (Number(day.count) || 0); }, 0)
      : 0;
    return '<section class="view">' +
      '<header class="page-head">' +
        '<div>' +
          '<p class="eyebrow">' + esc(todayLabel()) + '</p>' +
          '<h1 class="page-title">' + greeting() + '，' + esc(state.user.nickname || state.user.username) + '</h1>' +
          '<p class="page-sub">識字樂、文法花園與成語天地共用同一份帳戶；工具內各自保留進度，工具台則把各邊的表現折算成綜合排名。</p>' +
        '</div>' +
        '<div class="page-actions"><button class="btn btn-primary" type="button" data-nav="tool/' + (primary ? primary.id : 'shizi') + '">' + startLabel + ' ' + icon('arrowRight', 16) + '</button></div>' +
      '</header>' +
      '<div class="stat-strip">' +
        statHTML(fmtInt(shizi.charsKnown), '字', '識字樂已學', '來自識字樂進度') +
        statHTML(fmtInt(Number(grammar.mastered) + Number(idiom.mastered)), '題', '文法＋成語已掌握', '兩個工具已達到 Level 3 的題目合計') +
        statHTML(rank ? String(rank) : '—', '', '綜合名次', '按工具積分相加') +
        statHTML(fmtInt(recent), '次', '近七日練習', '三個工具的作答合計') +
      '</div>' +
      '<div class="overview-grid">' +
        '<div class="overview-main">' +
          '<div class="section-head"><h2 class="section-title">學習工具</h2><span class="section-sub">目前已接入 ' + activeCount + ' 個，其餘工具會沿用同一份帳戶</span></div>' +
          '<div class="tool-grid">' + TOOLS.map(toolCardHTML).join('') + '</div>' +
        '</div>' +
        '<aside class="overview-rail">' +
          '<section class="panel">' +
            '<div class="panel-head"><h2 class="panel-title">綜合榜</h2><button class="text-link" type="button" data-nav="ranking">完整排名 ' + icon('arrowRight', 14) + '</button></div>' +
            miniRankHTML() +
            '<p class="panel-note">' + (rank ? '你目前綜合第 ' + rank + ' 名。' : '完成一局練習就會上榜。') + ' 總練習 ' + fmtInt(totalAttempts) + ' 次。</p>' +
          '</section>' +
          '<section class="panel">' +
            '<div class="panel-head"><h2 class="panel-title">識字樂近七日</h2><span class="panel-meta">' + shiziRecent + ' 次</span></div>' +
            activityHTML() +
          '</section>' +
        '</aside>' +
      '</div>' +
      '</section>';
  }

  /* ===== Ranking ===== */
  function rankingRowsFor(tab) {
    const rows = state.ranking.slice();
    if (tab === 'overall') return rows;
    return rows.sort(function (a, b) {
      const at = a.tools && a.tools[tab] ? a.tools[tab] : {};
      const bt = b.tools && b.tools[tab] ? b.tools[tab] : {};
      const ar = at.rank ? Number(at.rank) : Infinity;
      const br = bt.rank ? Number(bt.rank) : Infinity;
      if (ar !== br) return ar - br;
      return String(a.username).localeCompare(String(b.username));
    });
  }

  function rankRowHTML(row, index, tab) {
    const total = state.ranking.length;
    const isMe = String(row.userId) === String(state.user.id);
    const isTop = index < 3;
    const overall = tab === 'overall';
    const detail = row.tools && row.tools[tab] ? row.tools[tab] : {};
    const tool = toolById(tab);
    const isMastery = tool && (tool.id === 'grammar' || tool.id === 'idiom');
    const score = overall
      ? Number(row.combined) || 0
      : isMastery
        ? Number(detail.mastered || detail.score) || 0
        : Number(detail.score) || 0;
    const max = Math.max.apply(null, [1].concat(state.ranking.map(function (item) {
      const itemDetail = item.tools && item.tools[tab] ? item.tools[tab] : {};
      if (overall) return Number(item.combined) || 0;
      return isMastery ? Number(itemDetail.mastered || itemDetail.score) || 0 : Number(itemDetail.score) || 0;
    })));
    const width = Math.min(100, (score / max) * 100);
    const shizi = row.tools && row.tools.shizi ? row.tools.shizi : {};
    const grammar = row.tools && row.tools.grammar ? row.tools.grammar : {};
    const idiom = row.tools && row.tools.idiom ? row.tools.idiom : {};
    const sub = overall
      ? '識字樂 ' + fmtInt(shizi.charsKnown) + ' 字 · 文法 ' + fmtInt(grammar.mastered) + ' 題 · 成語 ' + fmtInt(idiom.mastered) + ' 題'
      : isMastery
        ? '掌握 ' + fmtInt(detail.mastered || detail.score) + ' / ' + fmtInt(detail.totalQuestions) + ' 題（' + fmtPct(detail.masteryRate) + '%）· 做過 ' + fmtInt(detail.attempted) + ' 題 · 正確率 ' + fmtPct(detail.accuracy) + '% · 平均 ' + avgTimeText(detail.avgTime)
        : '已學 ' + fmtInt(detail.charsKnown) + ' 字 · 正確率 ' + fmtPct(detail.accuracy) + '% · 平均 ' + avgTimeText(detail.avgTime) + ' · 練習 ' + fmtInt(detail.attempts) + ' 次';
    const unit = overall ? '分' : isMastery ? '題' : '字';
    const displayScore = fmtInt(score);
    return '<li class="rank-row' + (isTop ? ' is-top' : '') + (isMe ? ' is-me' : '') + '">' +
      '<span class="rank-no">' + (index + 1) + '</span>' +
      avatarHTML(row, 'md') +
      '<span class="rank-person">' +
        '<span class="rank-name">' + esc(row.nickname || row.username) + (isMe ? '<span class="you">你</span>' : '') + '</span>' +
        '<span class="rank-sub">' + sub + '</span>' +
        '<span class="rank-bar"><span style="width:' + width + '%"></span></span>' +
      '</span>' +
      '<span class="rank-score"><strong>' + displayScore + '</strong><span>' + unit + '</span></span>' +
      '</li>';
  }

  function pointsPanelHTML() {
    const mine = myRankingRow();
    const total = Number(mine && mine.combined) || 0;
    const rows = TOOLS.map(function (tool) {
      const detail = toolStats(tool.id) || {};
      const mastery = tool.id === 'grammar' || tool.id === 'idiom';
      const value = mastery ? Number(detail.mastered || detail.score) || 0 : Number(detail.charsKnown) || 0;
      const pct = tool.active && total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
      return '<div class="weight-row' + (tool.active ? ' is-active' : ' is-muted') + '">' +
        '<span class="weight-name"><span class="weight-dot" style="background:' + (tool.active ? tool.accent : 'var(--line-strong)') + '"></span>' + esc(tool.short) + '</span>' +
        '<span class="weight-track"><span style="width:' + pct + '%;background:' + (tool.active ? tool.accent : 'var(--line-strong)') + '"></span></span>' +
        '<span class="weight-val">' + (tool.active ? fmtInt(value) + ' 分' : '—') + '</span>' +
        '</div>';
    }).join('');
    return '<section class="panel">' +
      '<div class="panel-head"><h2 class="panel-title">積分來源</h2><span class="panel-meta">目前 ' + fmtInt(total) + ' 分</span></div>' +
      '<div class="weight-list">' + rows + '</div>' +
      '<p class="panel-note">識字樂每學 1 字 = 1 分；文法花園與成語天地每掌握 1 題 = 1 分。綜合積分直接相加。</p>' +
      '</section>';
  }

  function formulaPanelHTML() {
    return '<section class="panel">' +
      '<div class="panel-head"><h2 class="panel-title">積分方式</h2></div>' +
      '<ol class="formula-list">' +
        '<li>識字樂：每學 1 個字 = 1 分。</li>' +
        '<li>文法花園：每掌握 1 道題 = 1 分。</li>' +
        '<li>成語天地：每掌握 1 道題 = 1 分。</li>' +
        '<li>綜合積分 = 各工具積分直接相加，不再換算百分位。</li>' +
      '</ol>' +
      '<p class="panel-note">工具榜仍按各自規則排序：識字樂看字數 → 正確率 → 速度；文法花園看掌握率 → 做題量 → 正確率 → 速度；成語天地看掌握題數 → 做題量 → 正確率 → 速度。速度只影響工具內同分名次。</p>' +
      '</section>';
  }

  function rankingHTML() {
    const active = TOOLS.filter(function (tool) { return tool.active; });
    let tab = state.rankTab;
    if (tab !== 'overall' && !active.some(function (tool) { return tool.id === tab; })) {
      tab = 'overall';
      state.rankTab = tab;
    }
    const rows = rankingRowsFor(tab).map(function (row, index) {
      return rankRowHTML(row, index, tab);
    }).join('');
    const tabs = [
      '<button class="tab' + (tab === 'overall' ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (tab === 'overall') + '" data-rank-tab="overall">綜合</button>'
    ].concat(active.map(function (tool) {
      return '<button class="tab' + (tab === tool.id ? ' is-active' : '') + '" type="button" role="tab" aria-selected="' + (tab === tool.id) + '" data-rank-tab="' + tool.id + '">' + esc(tool.short) + '</button>';
    })).concat(TOOLS.filter(function (tool) { return !tool.active; }).map(function (tool) {
      return '<span class="tab is-disabled" aria-disabled="true" title="待接入">' + esc(tool.short) + '</span>';
    })).join('');

    const note = tab === 'overall'
      ? '綜合積分＝識字樂已學字數＋文法已掌握題數＋成語已掌握題數，直接相加，不再換算百分位。'
      : tab === 'grammar'
        ? '文法花園榜依次比較：題目掌握率 → 做題量 → 正確率 → 平均速度。'
        : tab === 'idiom'
          ? '成語天地榜依次比較：已掌握題數 → 做題量 → 正確率 → 平均速度。'
          : '識字樂榜依次比較：已學字數 → 正確率 → 平均速度；它同時是綜合榜中識字樂的積分來源。';

    return '<section class="view">' +
      '<header class="page-head">' +
        '<div>' +
          '<p class="eyebrow">公用排名</p>' +
          '<h1 class="page-title">綜合排名</h1>' +
          '<p class="page-sub">工具內先各自排名，綜合榜直接累加絕對積分。識字樂、文法花園與成語天地的原始排行榜都保留在工具裡。</p>' +
        '</div>' +
        '<div class="page-actions"><button class="btn btn-ghost" type="button" data-reload>' + icon('refresh', 16) + '更新數據</button></div>' +
      '</header>' +
      '<div class="ranking-layout">' +
        '<section class="panel ranking-panel">' +
          '<div class="tabs" role="tablist" aria-label="排名類型">' + tabs + '</div>' +
          (state.ranking.length
            ? '<ol class="rank-list">' + rows + '</ol>'
            : emptyHTML('尚未有排名', '完成一局識字樂、文法花園或成語天地，就會出現在這裡。')) +
          '<p class="panel-note">' + note + '</p>' +
        '</section>' +
        '<aside class="ranking-rail">' + pointsPanelHTML() + formulaPanelHTML() + '</aside>' +
      '</div>' +
      '</section>';
  }

  /* ===== Profile ===== */
  function avatarPickHTML(value) {
    return '<button class="avatar-pick" type="button" data-avatar="' + esc(value) + '" aria-label="使用頭像 ' + esc(value) + '">' + esc(value) + '</button>';
  }

  function profileHTML() {
    const user = state.user;
    const stats = state.stats || { totalChars: 0, totalAttempts: 0 };
    const grammar = toolStats('grammar') || { mastered: 0, attempts: 0 };
    const rank = myRank();
    const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-HK') : '—';
    return '<section class="view">' +
      '<header class="page-head">' +
        '<div>' +
          '<p class="eyebrow">帳戶</p>' +
          '<h1 class="page-title">學習檔案</h1>' +
          '<p class="page-sub">這份資料由學習平台提供，所有工具共用。修改後會同步到識字樂與文法花園。</p>' +
        '</div>' +
      '</header>' +
      '<div class="profile-grid">' +
        '<section class="panel profile-identity">' +
          '<div class="profile-top">' +
            avatarHTML(user, 'xl') +
            '<div>' +
              '<h2>' + esc(user.nickname || user.username) + '</h2>' +
              '<p>@' + esc(user.username) + '</p>' +
              '<span class="role-badge role-' + esc(user.role) + '">' + roleLabel(user.role) + '</span>' +
            '</div>' +
          '</div>' +
          '<dl class="profile-meta">' +
            '<div><dt>加入日期</dt><dd>' + esc(joined) + '</dd></div>' +
            '<div><dt>識字樂已學</dt><dd>' + fmtInt(stats.totalChars) + ' 字</dd></div>' +
            '<div><dt>文法已掌握</dt><dd>' + fmtInt(grammar.mastered) + ' 題</dd></div>' +
            '<div><dt>綜合名次</dt><dd>' + (rank ? '第 ' + rank + ' 名' : '尚未上榜') + '</dd></div>' +
          '</dl>' +
        '</section>' +
        '<section class="panel">' +
          '<div class="panel-head"><h2 class="panel-title">編輯資料</h2></div>' +
          '<form id="profile-form" novalidate>' +
            '<label class="field"><span class="field-label">暱稱</span><input id="profile-nickname" type="text" maxlength="20" required value="' + esc(user.nickname || '') + '"></label>' +
            '<p class="field-error" id="profile-nickname-error" hidden></p>' +
            '<label class="field"><span class="field-label">頭像（表情符號或圖片網址）</span><input id="profile-avatar" type="text" maxlength="300" value="' + esc(user.avatar || '') + '" placeholder="例如 🐰 或 https://…"></label>' +
            '<div class="avatar-picks">' + AVATAR_PICKS.map(avatarPickHTML).join('') + '</div>' +
            '<div class="profile-preview"><span class="field-label">預覽</span><span id="profile-avatar-preview">' + avatarHTML(user, 'lg') + '</span></div>' +
            '<p class="field-error" id="profile-error" hidden></p>' +
            '<div class="form-actions"><button class="btn btn-primary" type="submit" id="profile-save">保存資料</button></div>' +
          '</form>' +
        '</section>' +
        '<section class="panel">' +
          '<div class="panel-head"><h2 class="panel-title">修改密碼</h2></div>' +
          '<form id="password-form" novalidate>' +
            '<label class="field"><span class="field-label">當前密碼</span><input id="current-password" type="password" autocomplete="current-password"></label>' +
            '<label class="field"><span class="field-label">新密碼（至少 4 個字）</span><input id="new-password" type="password" autocomplete="new-password"></label>' +
            '<label class="field"><span class="field-label">確認新密碼</span><input id="confirm-password" type="password" autocomplete="new-password"></label>' +
            '<p class="field-error" id="password-error" hidden></p>' +
            '<div class="form-actions"><button class="btn btn-primary" type="submit" id="password-save">更新密碼</button></div>' +
          '</form>' +
        '</section>' +
      '</div>' +
      '</section>';
  }

  /* ===== Admin ===== */
  function filteredAdminUsers() {
    const query = state.adminQuery.trim().toLowerCase();
    return (state.adminUsers || []).filter(function (user) {
      if (state.adminRole !== 'all' && user.role !== state.adminRole) return false;
      if (!query) return true;
      const nickname = String(user.nickname || '').toLowerCase();
      const username = String(user.username || '').toLowerCase();
      return nickname.indexOf(query) >= 0 || username.indexOf(query) >= 0;
    });
  }

  function adminUserHTML(user) {
    const isSelf = String(user.id) === String(state.user.id);
    const tasks = fmtInt(user.taskDoneCount || 0) + '/' + fmtInt(user.taskCount || 0);
    return '<article class="admin-user">' +
      '<div class="admin-user-main">' +
        avatarHTML(user, 'md') +
        '<div class="admin-user-text">' +
          '<strong>' + esc(user.nickname || user.username) + (isSelf ? '<span class="you">你</span>' : '') + '</strong>' +
          '<span>@' + esc(user.username) + '</span>' +
        '</div>' +
        '<span class="role-badge role-' + esc(user.role) + '">' + roleLabel(user.role) + '</span>' +
      '</div>' +
      '<div class="admin-user-stats">' +
        '<span><strong>' + fmtInt(user.charsKnown) + '</strong> 已學</span>' +
        '<span><strong>' + fmtInt(user.totalAttempts) + '</strong> 練習</span>' +
        '<span><strong>' + tasks + '</strong> 任務</span>' +
      '</div>' +
      '<div class="admin-user-actions">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-edit-user="' + user.id + '">' + icon('edit', 15) + '編輯</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-reset-user="' + user.id + '">' + icon('rotate', 15) + '清進度</button>' +
        (isSelf ? '' : '<button class="btn btn-ghost btn-sm is-danger" type="button" data-delete-user="' + user.id + '">' + icon('trash', 15) + '刪除</button>') +
      '</div>' +
      '</article>';
  }

  function adminHTML() {
    if (state.user.role !== 'admin') {
      return '<section class="view">' + emptyHTML('沒有權限', '只有管理員可以進入用戶管理。') + '</section>';
    }
    const loading = state.adminUsers === null;
    const users = loading ? [] : filteredAdminUsers();
    const list = loading
      ? loadingHTML('正在讀取用戶…')
      : (users.length ? users.map(adminUserHTML).join('') : emptyHTML('沒有符合條件的用戶', '試試清除搜尋或切換角色篩選。'));
    const roleOptions = [
      ['all', '全部角色'],
      ['admin', '管理員'],
      ['user', '學生']
    ].map(function (option) {
      return '<option value="' + option[0] + '"' + (state.adminRole === option[0] ? ' selected' : '') + '>' + option[1] + '</option>';
    }).join('');

    return '<section class="view">' +
      '<header class="page-head">' +
        '<div>' +
          '<p class="eyebrow">管理員</p>' +
          '<h1 class="page-title">用戶管理</h1>' +
          '<p class="page-sub">管理共用帳戶、角色與練習記錄。新帳戶仍使用原有註冊入口建立。</p>' +
        '</div>' +
      '</header>' +
      '<section class="panel">' +
        '<div class="admin-toolbar">' +
          '<label class="search-field">' + icon('search', 16) + '<span class="sr-only">搜尋用戶</span><input id="admin-search" type="search" placeholder="搜尋用戶名或暱稱" value="' + esc(state.adminQuery) + '"></label>' +
          '<label class="select-field"><span class="sr-only">角色篩選</span><select id="admin-role">' + roleOptions + '</select></label>' +
          '<span class="panel-meta" id="admin-count">' + (loading ? '讀取中' : '共 ' + users.length + ' 人') + '</span>' +
          '<button class="btn btn-ghost btn-sm" type="button" data-reload>' + icon('refresh', 15) + '重新整理</button>' +
        '</div>' +
        '<div class="admin-list" id="admin-list">' + list + '</div>' +
      '</section>' +
      '</section>';
  }

  async function ensureAdminData(force) {
    if (!state.user || state.user.role !== 'admin') return;
    if (state.adminUsers !== null && !force) return;
    try {
      state.adminUsers = await api('/admin/users');
    } catch (error) {
      state.adminUsers = [];
      handleError(error);
    }
    if (state.user && state.view === 'admin') renderMain();
  }

  function updateAdminResults() {
    if (state.adminUsers === null) return;
    const users = filteredAdminUsers();
    const list = $('#admin-list');
    const count = $('#admin-count');
    if (count) count.textContent = '共 ' + users.length + ' 人';
    if (list) {
      list.innerHTML = users.length
        ? users.map(adminUserHTML).join('')
        : emptyHTML('沒有符合條件的用戶', '試試清除搜尋或切換角色篩選。');
    }
  }

  /* ===== Tool view ===== */
  function destroyToolFrame() {
    if (toolFrame && toolFrame.parentNode) toolFrame.parentNode.removeChild(toolFrame);
    toolFrame = null;
  }

  function currentTool() {
    const id = state.view.indexOf('tool/') === 0 ? state.view.slice(5) : '';
    return toolById(id);
  }

  function renderToolView() {
    const tool = currentTool();
    if (!tool) return;
    els.main.innerHTML = '<section class="view tool-view">' +
      '<div class="tool-frame-wrap" id="tool-frame-wrap"></div>' +
      '</section>';

    if (!toolFrame) {
      toolFrame = document.createElement('iframe');
      toolFrame.className = 'tool-frame';
      toolFrame.title = tool.name;
      toolFrame.src = tool.entry;
    } else {
      toolFrame.title = tool.name;
      if (toolFrame.getAttribute('src') !== tool.entry) toolFrame.src = tool.entry;
    }
    const wrap = $('#tool-frame-wrap');
    if (wrap) wrap.appendChild(toolFrame);
  }

  function refreshTool() {
    const tool = currentTool();
    if (!toolFrame || !tool) return;
    toolFrame.src = tool.entry + (tool.entry.indexOf('?') >= 0 ? '&' : '?') + 'refresh=' + Date.now();
    toast('正在重新整理' + tool.name);
  }

  /* ===== Navigation ===== */
  function readHash() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return '';
    if (hash === 'overview' || hash === 'ranking' || hash === 'profile' || hash === 'admin') return hash;
    if (hash.indexOf('tool/') === 0) {
      const id = hash.slice(5);
      const tool = toolById(id);
      if (tool && tool.active) return hash;
    }
    return '';
  }

  function go(view) {
    if (view === 'admin' && (!state.user || state.user.role !== 'admin')) {
      toast('只有管理員可以進入用戶管理');
      return;
    }
    const hash = '#/' + view;
    if (window.location.hash === hash) {
      setView(view);
    } else {
      window.location.hash = hash;
    }
  }

  function setView(view) {
    const previous = state.view;
    if (view === 'admin' && (!state.user || state.user.role !== 'admin')) {
      view = 'overview';
      try { history.replaceState(null, '', '#/overview'); } catch (error) { /* ignore */ }
    }
    state.view = view;
    renderAll();
    window.scrollTo({ top: 0, behavior: 'auto' });
    els.main.focus({ preventScroll: true });
    if (view === 'admin') ensureAdminData();
    if (view.indexOf('tool/') === 0 && previous === view) refreshTool();
    if (previous.indexOf('tool/') === 0 && view !== previous) silentReload();
  }

  async function silentReload() {
    try {
      await loadWorkspaceData();
      if (state.view === 'admin' && state.user.role === 'admin') {
        state.adminUsers = await api('/admin/users');
      }
      renderAll();
    } catch (error) {
      if (error && error.status === 401) handleError(error);
    }
  }

  async function reloadData(showToast) {
    try {
      await loadWorkspaceData();
      if (state.view === 'admin' && state.user.role === 'admin') {
        state.adminUsers = await api('/admin/users');
      }
      renderAll();
      if (showToast) toast('已更新數據');
    } catch (error) {
      handleError(error);
    }
  }

  /* ===== Drawer & collapse ===== */
  function openDrawer() {
    document.body.classList.add('nav-open');
    els.overlay.hidden = false;
    els.menuBtn.setAttribute('aria-expanded', 'true');
    const close = $('#drawer-close');
    if (close) close.focus();
  }

  function closeDrawer(restoreFocus) {
    document.body.classList.remove('nav-open');
    els.overlay.hidden = true;
    els.menuBtn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) els.menuBtn.focus();
  }

  function applyCollapsed() {
    document.body.classList.toggle('nav-collapsed', Boolean(state.collapsed));
    els.collapseBtn.setAttribute('aria-expanded', String(!state.collapsed));
    els.collapseBtn.setAttribute('aria-label', state.collapsed ? '展開側邊欄' : '收起側邊欄');
  }

  function setCollapsed(collapsed) {
    state.collapsed = collapsed;
    try {
      localStorage.setItem('xiaobu.hub.collapsed', collapsed ? '1' : '0');
    } catch (error) { /* ignore */ }
    applyCollapsed();
  }

  /* ===== Dialogs ===== */
  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function askConfirm(config) {
    state.confirmAction = config.action;
    els.confirmTitle.textContent = config.title || '確認操作';
    els.confirmMessage.textContent = config.message || '';
    els.confirmError.hidden = true;
    els.confirmError.textContent = '';
    els.confirmAccept.textContent = config.label || '確認';
    els.confirmAccept.classList.toggle('btn-danger', config.danger !== false);
    els.confirmAccept.classList.toggle('btn-primary', config.danger === false);
    if (!els.confirmDialog.open) els.confirmDialog.showModal();
    window.setTimeout(function () {
      const cancel = $('#confirm-cancel');
      if (cancel) cancel.focus();
    }, 30);
  }

  async function runConfirm() {
    const action = state.confirmAction;
    if (!action) return;
    const label = els.confirmAccept.textContent;
    setButtonBusy(els.confirmAccept, true, '處理中…');
    try {
      await action();
      closeDialog(els.confirmDialog);
    } catch (error) {
      if (error && error.status === 401) {
        closeDialog(els.confirmDialog);
        handleError(error);
      } else {
        els.confirmError.textContent = (error && error.message) || '操作失敗，請再試一次';
        els.confirmError.hidden = false;
      }
    } finally {
      setButtonBusy(els.confirmAccept, false, label);
    }
  }

  function renderUserAvatarPicks() {
    els.userAvatarPicks.innerHTML = AVATAR_PICKS.map(avatarPickHTML).join('');
  }

  function updateUserDialogPreview() {
    if (!els.userAvatarPreview) return;
    const user = (state.adminUsers || []).find(function (item) {
      return String(item.id) === String(state.editingUserId);
    }) || {};
    els.userAvatarPreview.innerHTML = avatarHTML({
      id: user.id,
      username: user.username,
      nickname: els.userNickname.value || user.nickname,
      avatar: els.userAvatar.value.trim()
    }, 'lg');
  }

  function openUserDialog(id) {
    const user = (state.adminUsers || []).find(function (item) {
      return String(item.id) === String(id);
    });
    if (!user) return;
    const isSelf = String(user.id) === String(state.user.id);
    state.editingUserId = user.id;
    els.userDialogTitle.textContent = '編輯：' + (user.nickname || user.username);
    els.userDialogSummary.innerHTML = avatarHTML(user, 'md') +
      '<div><strong>' + esc(user.nickname || user.username) + '</strong>' +
      '<span>@' + esc(user.username) + ' · 已學 ' + fmtInt(user.charsKnown) + ' 字 · 練習 ' + fmtInt(user.totalAttempts) + ' 次</span></div>';
    els.userNickname.value = user.nickname || '';
    els.userAvatar.value = user.avatar || '';
    els.userRole.value = user.role;
    els.userRole.disabled = isSelf;
    els.userRoleHint.hidden = !isSelf;
    els.userPassword.value = '';
    els.userPassword.disabled = isSelf;
    els.userPassword.placeholder = isSelf ? '請用「學習檔案」修改自己的密碼' : '至少 4 字';
    els.userNicknameError.hidden = true;
    els.userFormError.hidden = true;
    renderUserAvatarPicks();
    updateUserDialogPreview();
    if (!els.userDialog.open) els.userDialog.showModal();
    window.setTimeout(function () { els.userNickname.focus(); }, 30);
  }

  function updateProfilePreview() {
    const input = $('#profile-avatar');
    const holder = $('#profile-avatar-preview');
    if (!input || !holder || !state.user) return;
    holder.innerHTML = avatarHTML({
      id: state.user.id,
      username: state.user.username,
      nickname: state.user.nickname,
      avatar: input.value.trim()
    }, 'lg');
  }

  /* ===== Profile actions ===== */
  async function saveProfile() {
    const nicknameInput = $('#profile-nickname');
    const avatarInput = $('#profile-avatar');
    const nicknameError = $('#profile-nickname-error');
    const errorBox = $('#profile-error');
    if (!nicknameInput || !avatarInput) return;
    const nickname = nicknameInput.value.trim();
    const avatar = avatarInput.value.trim();
    errorBox.hidden = true;
    nicknameError.hidden = true;
    nicknameInput.removeAttribute('aria-invalid');

    if (!nickname) {
      nicknameError.textContent = '請填寫暱稱';
      nicknameError.hidden = false;
      nicknameInput.setAttribute('aria-invalid', 'true');
      nicknameInput.focus();
      return;
    }
    if (nickname.length > 20) {
      nicknameError.textContent = '暱稱最多 20 個字';
      nicknameError.hidden = false;
      nicknameInput.setAttribute('aria-invalid', 'true');
      nicknameInput.focus();
      return;
    }

    const button = $('#profile-save');
    setButtonBusy(button, true, '保存中…');
    try {
      const data = await api('/profile', 'PUT', { nickname: nickname, avatar: avatar });
      state.user.nickname = data.nickname || nickname;
      state.user.avatar = data.avatar || null;
      await loadWorkspaceData();
      renderAll();
      toast('已保存個人資料');
    } catch (error) {
      errorBox.textContent = (error && error.message) || '保存失敗';
      errorBox.hidden = false;
    } finally {
      setButtonBusy(button, false, '保存資料');
    }
  }

  async function savePassword() {
    const current = $('#current-password');
    const next = $('#new-password');
    const confirm = $('#confirm-password');
    const errorBox = $('#password-error');
    if (!current || !next || !confirm) return;
    errorBox.hidden = true;

    if (!current.value) {
      errorBox.textContent = '請輸入當前密碼';
      errorBox.hidden = false;
      current.focus();
      return;
    }
    if (next.value.length < 4) {
      errorBox.textContent = '新密碼至少 4 個字';
      errorBox.hidden = false;
      next.focus();
      return;
    }
    if (next.value !== confirm.value) {
      errorBox.textContent = '兩次輸入的新密碼不一致';
      errorBox.hidden = false;
      confirm.focus();
      return;
    }

    const button = $('#password-save');
    setButtonBusy(button, true, '更新中…');
    try {
      await api('/password', 'PUT', {
        currentPassword: current.value,
        newPassword: next.value
      });
      current.value = '';
      next.value = '';
      confirm.value = '';
      toast('密碼已更新');
    } catch (error) {
      errorBox.textContent = (error && error.message) || '更新失敗';
      errorBox.hidden = false;
    } finally {
      setButtonBusy(button, false, '更新密碼');
    }
  }

  /* ===== Admin actions ===== */
  async function saveUser() {
    if (!state.editingUserId) return;
    const nickname = els.userNickname.value.trim();
    const avatar = els.userAvatar.value.trim();
    const role = els.userRole.value;
    const password = els.userPassword.value.trim();
    els.userFormError.hidden = true;
    els.userNicknameError.hidden = true;
    els.userNickname.removeAttribute('aria-invalid');

    if (!nickname) {
      els.userNicknameError.textContent = '請填寫暱稱';
      els.userNicknameError.hidden = false;
      els.userNickname.setAttribute('aria-invalid', 'true');
      els.userNickname.focus();
      return;
    }
    if (password && password.length < 4) {
      els.userFormError.textContent = '密碼至少 4 個字';
      els.userFormError.hidden = false;
      els.userPassword.focus();
      return;
    }

    const payload = { nickname: nickname, avatar: avatar, role: role };
    if (password) payload.password = password;
    const id = state.editingUserId;
    setButtonBusy(els.userSave, true, '保存中…');
    try {
      await api('/admin/user/' + id, 'PUT', payload);
      closeDialog(els.userDialog);
      state.adminUsers = await api('/admin/users');
      await loadWorkspaceData();
      if (String(id) === String(state.user.id)) state.user = await api('/me');
      renderAll();
      toast('已更新用戶資料');
      window.setTimeout(function () {
        const search = $('#admin-search');
        if (search) search.focus();
      }, 40);
    } catch (error) {
      els.userFormError.textContent = (error && error.message) || '保存失敗';
      els.userFormError.hidden = false;
    } finally {
      setButtonBusy(els.userSave, false, '保存');
    }
  }

  function resetProgress(id) {
    const user = (state.adminUsers || []).find(function (item) {
      return String(item.id) === String(id);
    });
    if (!user) return;
    const name = user.nickname || user.username;
    askConfirm({
      title: '清除練習進度？',
      message: '這會刪除「' + name + '」的識字樂練習記錄與作答紀錄，帳戶本身會保留，無法復原。',
      label: '清除進度',
      danger: true,
      action: async function () {
        await api('/admin/user/' + id + '/progress', 'DELETE');
        state.adminUsers = await api('/admin/users');
        await loadWorkspaceData();
        renderAll();
        toast('已清除練習進度');
      }
    });
  }

  function deleteUser(id) {
    const user = (state.adminUsers || []).find(function (item) {
      return String(item.id) === String(id);
    });
    if (!user) return;
    const name = user.nickname || user.username;
    askConfirm({
      title: '刪除用戶？',
      message: '這會永久刪除「' + name + '」的帳戶、練習進度與任務紀錄，無法復原。',
      label: '刪除用戶',
      danger: true,
      action: async function () {
        await api('/admin/user/' + id, 'DELETE');
        state.adminUsers = await api('/admin/users');
        await loadWorkspaceData();
        renderAll();
        toast('已刪除用戶');
      }
    });
  }

  /* ===== Auth actions ===== */
  async function submitAuth(event) {
    event.preventDefault();
    const username = els.authUsername.value.trim();
    const password = els.authPassword.value;
    setAuthError('');

    if (!username || !password) {
      setAuthError('請填寫用戶名和密碼');
      if (!username) els.authUsername.focus();
      else els.authPassword.focus();
      return;
    }
    if (state.authMode === 'register' && password.length < 4) {
      setAuthError('密碼至少 4 個字');
      els.authPassword.focus();
      return;
    }

    const wasRegister = state.authMode === 'register';
    setAuthBusy(true);
    try {
      await api(wasRegister ? '/register' : '/login', 'POST', { username: username, password: password });
      state.user = await api('/me');
      let warning = '';
      try {
        await loadWorkspaceData();
      } catch (error) {
        warning = (error && error.message) || '';
      }
      state.adminUsers = null;
      destroyToolFrame();
      els.authForm.reset();
      setAuthMode('login');
      showApp();
      state.view = readHash() || 'overview';
      if (state.view === 'admin' && state.user.role !== 'admin') state.view = 'overview';
      renderAll();
      if (state.view === 'admin') ensureAdminData();
      toast(wasRegister ? '註冊成功，已自動登入' : '已登入');
      if (warning) toast(warning);
    } catch (error) {
      setAuthError((error && error.message) || '登入失敗');
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    [els.userDialog, els.confirmDialog].forEach(closeDialog);
    try {
      await api('/logout', 'POST');
    } catch (error) {
      /* 即使請求失敗，也回到登入畫面 */
    }
    destroyToolFrame();
    state.user = null;
    state.stats = null;
    state.ranking = [];
    state.adminUsers = null;
    state.view = 'overview';
    state.rankTab = 'overall';
    els.appRoot.hidden = true;
    els.authRoot.hidden = false;
    els.boot.hidden = true;
    closeDrawer(false);
    setAuthMode('login');
    setAuthError('');
    els.authForm.reset();
    toast('已登出');
    window.setTimeout(function () { els.authUsername.focus(); }, 40);
  }

  /* ===== Session sync ===== */
  async function syncSession() {
    if (!state.user) return;
    const now = Date.now();
    if (now - lastSync < 4000) return;
    lastSync = now;
    try {
      const user = await api('/me');
      const changed = String(user.id) !== String(state.user.id) ||
        user.nickname !== state.user.nickname ||
        user.role !== state.user.role ||
        user.avatar !== state.user.avatar;
      state.user = user;
      if (changed) {
        if (state.view === 'admin' && user.role !== 'admin') state.view = 'overview';
        await loadWorkspaceData();
        if (state.view === 'admin' && user.role === 'admin') {
          state.adminUsers = await api('/admin/users');
        }
        if (state.view.indexOf('tool/') === 0) {
          renderNav();
          renderAccount();
        } else {
          renderAll();
        }
        toast('帳戶資料已更新');
      }
    } catch (error) {
      if (error && error.status === 401) {
        showAuth('登入已過期，請重新登入');
      }
    }
  }

  /* ===== Event binding ===== */
  function bindStatic() {
    els.authForm.addEventListener('submit', submitAuth);

    els.authSwitch.addEventListener('click', function () {
      setAuthMode(state.authMode === 'login' ? 'register' : 'login');
      els.authUsername.focus();
    });

    els.logoutBtn.addEventListener('click', logout);

    els.accountBtn.addEventListener('click', function () {
      closeDrawer(false);
      go('profile');
    });

    els.collapseBtn.addEventListener('click', function () {
      setCollapsed(!state.collapsed);
    });

    els.menuBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      if (document.body.classList.contains('nav-open')) closeDrawer(true);
      else openDrawer();
    });

    els.drawerClose.addEventListener('click', function () {
      closeDrawer(true);
    });

    els.overlay.addEventListener('click', function () {
      closeDrawer(true);
    });

    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('submit', handleSubmit);

    $('#user-dialog-close').addEventListener('click', function () { closeDialog(els.userDialog); });
    $('#user-cancel').addEventListener('click', function () { closeDialog(els.userDialog); });
    $('#confirm-close').addEventListener('click', function () { closeDialog(els.confirmDialog); });
    $('#confirm-cancel').addEventListener('click', function () { closeDialog(els.confirmDialog); });
    els.confirmAccept.addEventListener('click', runConfirm);

    [els.userDialog, els.confirmDialog].forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener('cancel', function (event) {
        event.preventDefault();
        closeDialog(dialog);
      });
    });

    els.userDialog.addEventListener('close', function () {
      state.editingUserId = null;
    });

    els.confirmDialog.addEventListener('close', function () {
      state.confirmAction = null;
      els.confirmError.hidden = true;
      els.confirmError.textContent = '';
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && document.body.classList.contains('nav-open')) {
        closeDrawer(true);
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900 && document.body.classList.contains('nav-open')) {
        closeDrawer(false);
      }
    });

    window.addEventListener('hashchange', function () {
      const raw = window.location.hash;
      if (raw && raw.indexOf('#/') !== 0) return;
      const view = readHash() || 'overview';
      if (view !== state.view) setView(view);
    });

    window.addEventListener('focus', syncSession);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncSession();
    });
  }

  function handleClick(event) {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      event.preventDefault();
      if (document.body.classList.contains('nav-open')) closeDrawer(false);
      go(nav.getAttribute('data-nav'));
      return;
    }

    const soon = event.target.closest('[data-soon]');
    if (soon) {
      toast('「' + toolName(soon.getAttribute('data-soon')) + '」尚未接入，接入後會使用同一份帳戶。');
      return;
    }

    const rankTab = event.target.closest('[data-rank-tab]');
    if (rankTab) {
      state.rankTab = rankTab.getAttribute('data-rank-tab');
      renderMain();
      const next = $('[data-rank-tab="' + state.rankTab + '"]');
      if (next) next.focus();
      return;
    }

    if (event.target.closest('[data-reload]')) {
      reloadData(true);
      return;
    }

    const edit = event.target.closest('[data-edit-user]');
    if (edit) {
      openUserDialog(edit.getAttribute('data-edit-user'));
      return;
    }

    const reset = event.target.closest('[data-reset-user]');
    if (reset) {
      resetProgress(reset.getAttribute('data-reset-user'));
      return;
    }

    const remove = event.target.closest('[data-delete-user]');
    if (remove) {
      deleteUser(remove.getAttribute('data-delete-user'));
      return;
    }

    const avatarPick = event.target.closest('[data-avatar]');
    if (avatarPick) {
      const value = avatarPick.getAttribute('data-avatar');
      const dialog = avatarPick.closest('dialog');
      if (dialog && dialog.id === 'user-dialog') {
        els.userAvatar.value = value;
        updateUserDialogPreview();
      } else {
        const input = $('#profile-avatar');
        if (input) {
          input.value = value;
          updateProfilePreview();
        }
      }
      return;
    }

  }

  function handleInput(event) {
    if (event.target.id === 'admin-search') {
      state.adminQuery = event.target.value;
      updateAdminResults();
      return;
    }
    if (event.target.id === 'profile-avatar') {
      updateProfilePreview();
      return;
    }
    if (event.target.id === 'user-avatar' || event.target.id === 'user-nickname') {
      updateUserDialogPreview();
    }
  }

  function handleChange(event) {
    if (event.target.id === 'admin-role') {
      state.adminRole = event.target.value;
      updateAdminResults();
    }
  }

  function handleSubmit(event) {
    if (event.target.id === 'profile-form') {
      event.preventDefault();
      saveProfile();
    } else if (event.target.id === 'password-form') {
      event.preventDefault();
      savePassword();
    } else if (event.target.id === 'user-form') {
      event.preventDefault();
      saveUser();
    }
  }

  /* ===== Boot ===== */
  async function boot() {
    bindStatic();
    try {
      state.collapsed = localStorage.getItem('xiaobu.hub.collapsed') === '1';
    } catch (error) {
      state.collapsed = false;
    }

    await loadTools();

    let authError = null;
    try {
      state.user = await api('/me');
    } catch (error) {
      authError = error;
      state.user = null;
    }

    if (state.user) {
      let warning = '';
      try {
        await loadWorkspaceData();
      } catch (error) {
        warning = (error && error.message) || '';
      }
      els.boot.hidden = true;
      showApp();
      state.view = readHash() || 'overview';
      if (state.view === 'admin' && state.user.role !== 'admin') state.view = 'overview';
      renderAll();
      if (state.view === 'admin') ensureAdminData();
      if (warning) toast(warning);
    } else {
      els.boot.hidden = true;
      showAuth(authError && authError.status !== 401 ? authError.message : '');
    }
  }

  boot();
})();
