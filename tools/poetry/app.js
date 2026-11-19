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
    hallView: $('#hall-view'),
    learnView: $('#learn-view'),
    userChip: $('#user-chip'),
    helloName: $('#hello-name'),
    heroStats: $('#hero-stats'),
    todayCard: $('#today-card'),
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
    dictationStart: 0,
    voiceWarned: false
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
      els.userChip.hidden = false;
      els.userChip.textContent = me.nickname || me.username;
      els.helloName.textContent = me.nickname || me.username;
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

  function onDocumentClick(event) {
    const target = event.target;
    const open = target.closest('[data-open]');
    if (open) {
      openPoem(open.getAttribute('data-open'));
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
    if (target.closest('[data-action="dictation-again"]')) {
      setStep('dictation');
      return;
    }
  }

  function onDocumentInput(event) {
    const fill = event.target.closest('[data-fill-key]');
    if (fill) {
      state.fillAnswers[fill.getAttribute('data-fill-key')] = fill.value;
      return;
    }
    const dictation = event.target.closest('[data-dictation]');
    if (dictation) {
      state.dictationDraft[Number(dictation.getAttribute('data-dictation'))] = dictation.value;
    }
  }

  document.addEventListener('click', onDocumentClick);
  document.addEventListener('input', onDocumentInput);
  if ('speechSynthesis' in window) {
    window.speechSynthesis.addEventListener('voiceschanged', () => window.speechSynthesis.getVoices());
  }

  boot();
})();
