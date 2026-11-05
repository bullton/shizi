const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { NODES, IDIOMS, QUESTIONS } = require('./idiom-seed');
const { createDrill, hkDate, shuffle } = require('../core/drill');
const { parseImportText, csvCell } = require('../core/csv');

function createIdiomTool({ rootDir, toolDir, db, saveData: storeSave, dataExists, auth }) {
  const saveData = () => storeSave();

  function requireAuth(req, res) {
    const user = auth.requireAuth(req);
    if (!user) {
      jsonResponse(res, 401, { error: '請先登入' });
      return null;
    }
    return user;
  }

  const drill = createDrill({
    db,
    saveData,
    key: 'idiom',
    seed: { nodes: NODES, questions: QUESTIONS },
    seedQuestion: (question, now) => ({
      ...question,
      highlight_word: question.highlight_clue || question.highlight_word || '',
      correct_option: question.correct_word || question.correct_option,
      distractors: (question.distractor_words || question.distractors || []).slice(),
      explanation: question.context_guide || question.explanation || '',
      status: true,
      createdAt: now
    }),
    seedMessage: '[idiom] 已寫入 18 個成語場景與 4 道起步題',
    optionPayload: question => {
      const details = idiomMap();
      const words = Array.from(new Set([question.correct_option].concat(question.distractors || [])));
      const options = shuffle(words).map((word, index) => ({
        id: 'o' + index,
        text: word,
        word,
        details: details.get(word) || null
      }));
      const answer = options.find(option => option.word === question.correct_option);
      return { options, answerId: answer ? answer.id : options[0].id };
    },
    questionPayload: (question, node) => ({
      node_id: question.node_id,
      node_title: node.title || question.node_id,
      dimension: node.dimension || node.category || '',
      stem: question.stem,
      highlight_word: question.highlight_clue || '',
      highlight_clue: question.highlight_clue || '',
      question_type: question.question_type || 'INTENT'
    }),
    answerPayload: ({ question, node }) => {
      const details = idiomMap();
      const words = [question.correct_option].concat(question.distractors || []);
      return {
        correctOption: question.correct_option,
        correctWord: question.correct_option,
        explanation: question.explanation || '',
        contextGuide: question.explanation || '',
        ruleTip: node.usage_tip || '',
        highlightWord: question.highlight_clue || '',
        highlightClue: question.highlight_clue || '',
        dictionary: words.map(word => details.get(word) || null).filter(Boolean)
      };
    },
    summaryQuestion: question => ({
      question_id: question.question_id,
      stem: question.stem,
      node_id: question.node_id,
      correct_option: question.correct_option,
      correct_word: question.correct_option
    }),
    targetLabel: '場景',
    roundPrefix: 'IR_'
  });

  const idiom = drill.data;

  if (!Array.isArray(idiom.idioms)) {
    idiom.idioms = IDIOMS.map(item => ({ ...item }));
    saveData().catch(error => console.warn('[idiom] 成語字典初始化儲存失敗：' + error.message));
    console.log('[idiom] 已寫入 ' + idiom.idioms.length + ' 個成語詞條');
  } else {
    let changed = 0;
    const existing = new Set(idiom.idioms.map(item => item.word));
    IDIOMS.forEach(item => {
      if (existing.has(item.word)) return;
      idiom.idioms.push({ ...item });
      changed += 1;
    });
    if (changed) {
      saveData().catch(error => console.warn('[idiom] 成語字典補充儲存失敗：' + error.message));
      console.log('[idiom] 已補充 ' + changed + ' 個成語詞條');
    }
  }

  function idiomMap() {
    return new Map((idiom.idioms || []).map(item => [item.word, item]));
  }

  function normalizeIdiom(raw) {
    const word = String(raw.word || '').trim();
    if (!word) return { error: '缺少成語詞頭' };
    const sentiment = String(raw.sentiment || '中性').trim();
    return {
      value: {
        word,
        pinyin: String(raw.pinyin || '').trim(),
        meaning: String(raw.meaning || '').trim(),
        key_char_note: String(raw.key_char_note || '').trim(),
        sentiment: ['褒義', '貶義', '中性'].includes(sentiment) ? sentiment : '中性',
        target_object: String(raw.target_object || '').trim(),
        example: String(raw.example || '').trim(),
        needs_review: raw.needs_review === true
      }
    };
  }

  function upsertIdiom(value) {
    const nowIso = new Date().toISOString();
    const existing = idiom.idioms.find(item => item.word === value.word);
    if (existing) {
      Object.assign(existing, value, { updatedAt: nowIso });
      return 'updated';
    }
    idiom.idioms.push({ ...value, createdAt: nowIso, updatedAt: nowIso });
    return 'added';
  }

  function ensureIdioms(words, provided, strict) {
    const known = idiomMap();
    const missing = [];
    words.forEach(word => {
      if (provided.has(word)) return;
      if (!known.has(word)) missing.push(word);
    });
    if (strict && missing.length) {
      return { error: '成語字典缺少：' + Array.from(new Set(missing)).join('、') };
    }
    let added = 0;
    let updated = 0;
    provided.forEach(value => {
      if (upsertIdiom(value) === 'added') added += 1;
      else updated += 1;
    });
    if (!strict) {
      Array.from(new Set(missing)).forEach(word => {
        upsertIdiom({
          word,
          pinyin: '',
          meaning: '（待補充釋義）',
          key_char_note: '',
          sentiment: '中性',
          target_object: '',
          example: '',
          needs_review: true
        });
        added += 1;
      });
    }
    return { added, updated };
  }

  function normalizeQuestion(raw, existingQuestions) {
    const nodes = drill.nodeMap();
    const nodeId = String(raw.node_id || '').trim();
    if (!nodes.has(nodeId)) {
      return { error: '成語場景不存在：' + (nodeId || '空白') };
    }
    const stem = String(raw.stem || '').trim();
    if (!stem) return { error: '缺少題幹' };
    const correct = String(raw.correct_word || raw.correct_option || '').trim();
    if (!correct) return { error: '缺少正確成語' };

    let distractors = raw.distractor_words || raw.distractors;
    if (!Array.isArray(distractors)) {
      distractors = [raw.distractor_1, raw.distractor_2, raw.distractor_3];
    }
    distractors = Array.from(new Set(distractors
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .filter(item => item !== correct)));
    if (distractors.length < 3) {
      return { error: '需要 3 個不同於正確答案的干擾成語（四選項）' };
    }
    if (distractors.length > 3) distractors = distractors.slice(0, 3);

    const duplicate = (existingQuestions || idiom.questions).find(question => {
      return question.node_id === nodeId && String(question.stem).trim().toLowerCase() === stem.toLowerCase();
    });
    if (duplicate) return { error: '同一場景已有相同題幹' };

    const type = String(raw.question_type || 'INTENT').toUpperCase();
    const questionType = ['INTENT', 'FILL', 'JUDGE'].includes(type) ? type : 'INTENT';
    const clue = String(raw.highlight_clue || raw.highlight_word || '').trim();
    const guide = String(raw.context_guide || raw.explanation || '').trim();

    return {
      value: {
        node_id: nodeId,
        question_type: questionType,
        stem,
        highlight_clue: clue,
        highlight_word: clue,
        correct_option: correct,
        correct_word: correct,
        distractors,
        distractor_words: distractors,
        explanation: guide,
        context_guide: guide,
        status: raw.status === false || raw.status === 0 || raw.status === '0' ? false : true
      }
    };
  }

  function createQuestion(value, userId) {
    const question = {
      question_id: 'IQ_' + generateId(new Set(idiom.questions.map(item => item.question_id))),
      ...value,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };
    idiom.questions.push(question);
    return question;
  }

  function exportQuestions() {
    const nodes = drill.nodeMap();
    return idiom.questions.map(question => {
      const node = nodes.get(question.node_id) || {};
      return {
        node_id: question.node_id,
        node_title: node.title || '',
        question_type: question.question_type || 'INTENT',
        stem: question.stem,
        highlight_clue: question.highlight_clue || question.highlight_word || '',
        correct_word: question.correct_option,
        distractor_1: (question.distractors || [])[0] || '',
        distractor_2: (question.distractors || [])[1] || '',
        distractor_3: (question.distractors || [])[2] || '',
        context_guide: question.context_guide || question.explanation || ''
      };
    });
  }

  function exportCsv(rows) {
    const headers = [
      'node_id', 'node_title', 'question_type', 'stem', 'highlight_clue',
      'correct_word', 'distractor_1', 'distractor_2', 'distractor_3', 'context_guide'
    ];
    const lines = [headers.join(',')];
    rows.forEach(row => {
      lines.push(headers.map(header => csvCell(row[header])).join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function replaceQuestions(items, userId) {
    const oldByKey = new Map();
    idiom.questions.forEach(question => {
      const itemKey = question.node_id + '|' + String(question.stem).trim().toLowerCase();
      const list = oldByKey.get(itemKey) || [];
      list.push(question);
      oldByKey.set(itemKey, list);
    });

    const errors = [];
    const prepared = [];
    const usedIds = new Set();
    const usedKeys = new Set();
    const nowIso = new Date().toISOString();
    let added = 0;
    let reused = 0;

    items.forEach((raw, index) => {
      const result = normalizeQuestion(raw, []);
      if (result.error) {
        errors.push({ row: index + 1, error: result.error });
        return;
      }
      const value = result.value;
      const itemKey = value.node_id + '|' + value.stem.toLowerCase();
      if (usedKeys.has(itemKey)) {
        errors.push({ row: index + 1, error: '同一場景已有相同題幹' });
        return;
      }
      usedKeys.add(itemKey);

      let base = null;
      const candidates = oldByKey.get(itemKey) || [];
      if (candidates.length === 1 && !usedIds.has(String(candidates[0].question_id))) {
        base = candidates[0];
      }

      let questionId;
      if (base) {
        questionId = String(base.question_id);
        reused += 1;
      } else {
        do {
          questionId = 'IQ_' + generateId();
        } while (usedIds.has(questionId));
        added += 1;
      }
      usedIds.add(questionId);
      prepared.push({
        question_id: questionId,
        ...value,
        createdBy: base ? base.createdBy : userId,
        createdAt: base ? base.createdAt : nowIso,
        updatedAt: nowIso
      });
    });

    if (errors.length) {
      const head = errors.slice(0, 3).map(item => '第 ' + item.row + ' 行：' + item.error).join('；');
      return {
        error: head + (errors.length > 3 ? '（共 ' + errors.length + ' 個錯誤）' : ''),
        errors
      };
    }

    const newIds = new Set(prepared.map(question => String(question.question_id)));
    const newNodeIds = new Set(prepared.map(question => question.node_id));
    const oldTotal = idiom.questions.length;
    const removed = idiom.questions.filter(question => !newIds.has(String(question.question_id))).length;
    const masteryBefore = idiom.mastery.length;

    idiom.questions = prepared;
    idiom.mastery = idiom.mastery.filter(record => newIds.has(String(record.question_id)));
    idiom.taskMastery = idiom.taskMastery.filter(record => newIds.has(String(record.question_id)));
    const masteryRemoved = masteryBefore - idiom.mastery.length;

    let tasksUpdated = 0;
    let tasksArchived = 0;
    idiom.tasks.forEach(task => {
      const before = Array.isArray(task.question_ids) ? task.question_ids : [];
      const after = before.filter(id => newIds.has(String(id)));
      if (after.length !== before.length) {
        task.question_ids = after;
        task.updatedAt = nowIso;
        tasksUpdated += 1;
      }
      const nodesHaveQuestions = !task.fixedQuestions && (task.target_nodes || []).some(id => newNodeIds.has(id));
      const hasQuestions = after.length > 0 || nodesHaveQuestions;
      if (!hasQuestions && !task.is_archived) {
        task.is_archived = true;
        task.updatedAt = nowIso;
        tasksArchived += 1;
      }
    });

    drill.clearRounds();

    return {
      mode: 'replace',
      total: prepared.length,
      added,
      reused,
      removed,
      oldTotal,
      masteryRemoved,
      tasksUpdated,
      tasksArchived
    };
  }

  async function importBundle(body, user) {
    if (user.role !== 'admin') return { status: 403, body: { error: '需要管理員權限' } };
    const parsed = body.text ? parseImportText(body.text) : body;
    const dictionary = Array.isArray(parsed)
      ? []
      : (Array.isArray(parsed.idiom_dictionary) ? parsed.idiom_dictionary : (Array.isArray(parsed.idioms) ? parsed.idioms : []));
    const questions = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed.questions) ? parsed.questions : []);
    if (!questions.length) {
      return { status: 400, body: { error: '找不到可匯入的題目' } };
    }
    const mode = body.mode === 'replace' ? 'replace' : 'append';
    if (mode === 'replace' && body.confirm !== true) {
      return { status: 400, body: { error: '全量覆蓋需要確認' } };
    }
    if (mode === 'replace' && questions.length > 2000) {
      return { status: 400, body: { error: '一次最多覆蓋 2000 道題目' } };
    }
    if (mode === 'append' && questions.length > 500) {
      return { status: 400, body: { error: '一次最多匯入 500 道題目' } };
    }

    const errors = [];
    const provided = new Map();
    dictionary.forEach((raw, index) => {
      const result = normalizeIdiom(raw);
      if (result.error) {
        errors.push({ row: index + 1, error: '成語詞條：' + result.error });
        return;
      }
      provided.set(result.value.word, result.value);
    });

    const available = new Set([...idiomMap().keys(), ...provided.keys()]);
    questions.forEach((raw, index) => {
      const result = normalizeQuestion(raw, []);
      if (result.error) {
        errors.push({ row: index + 1, error: result.error });
        return;
      }
      const words = [result.value.correct_option].concat(result.value.distractors);
      const missing = words.filter(word => !available.has(word));
      if (missing.length) {
        errors.push({ row: index + 1, error: '成語字典缺少：' + missing.join('、') });
      }
    });

    if (errors.length) {
      const head = errors.slice(0, 3).map(item => '第 ' + item.row + ' 行：' + item.error).join('；');
      return {
        status: 400,
        body: {
          error: head + (errors.length > 3 ? '（共 ' + errors.length + ' 個錯誤）' : ''),
          errors
        }
      };
    }

    const idiomResult = ensureIdioms([], provided, true);
    if (idiomResult.error) return { status: 400, body: { error: idiomResult.error } };

    if (mode === 'replace') {
      const result = replaceQuestions(questions, user.id);
      if (result.error) return { status: 400, body: { error: result.error, errors: result.errors } };
      await saveData();
      return {
        status: 200,
        body: {
          ...result,
          idioms: { added: idiomResult.added, updated: idiomResult.updated }
        }
      };
    }

    const results = { mode: 'append', added: 0, skipped: 0, errors: [], idioms: { added: idiomResult.added, updated: idiomResult.updated } };
    const seen = new Set(idiom.questions.map(question => question.node_id + '|' + String(question.stem).trim().toLowerCase()));
    questions.forEach((raw, index) => {
      const result = normalizeQuestion(raw);
      if (result.error) {
        results.errors.push({ row: index + 1, error: result.error });
        return;
      }
      const itemKey = result.value.node_id + '|' + result.value.stem.toLowerCase();
      if (seen.has(itemKey)) {
        results.skipped += 1;
        return;
      }
      seen.add(itemKey);
      createQuestion(result.value, user.id);
      results.added += 1;
    });
    await saveData();
    return { status: 200, body: results };
  }

  async function handleAPI(req, res, parsedUrl) {
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const user = requireAuth(req, res);
    if (!user) return;
    const userId = user.id;

    if (pathname === '/api/overview' && method === 'GET') {
      jsonResponse(res, 200, {
        nodes: drill.nodesWithStats(userId),
        tasks: drill.taskForUser(userId),
        stats: drill.userStats(userId),
        questionCount: idiom.questions.filter(question => question.status !== false).length,
        idiomCount: idiom.idioms.length
      });
      return;
    }

    if (pathname === '/api/nodes' && method === 'GET') {
      jsonResponse(res, 200, drill.nodesWithStats(userId));
      return;
    }

    if (pathname === '/api/idioms' && method === 'GET') {
      const sentiment = String(parsedUrl.query.sentiment || '');
      const keyword = String(parsedUrl.query.q || '').trim();
      const list = idiom.idioms
        .filter(item => !sentiment || item.sentiment === sentiment)
        .filter(item => !keyword || item.word.includes(keyword) || String(item.meaning || '').includes(keyword))
        .slice()
        .sort((a, b) => a.word.localeCompare(b.word, 'zh-HK'));
      jsonResponse(res, 200, list);
      return;
    }

    if (pathname.startsWith('/api/idioms/') && method === 'PUT') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      const word = decodeURIComponent(pathname.split('/')[3] || '');
      const existing = idiom.idioms.find(item => item.word === word);
      if (!existing) return jsonResponse(res, 404, { error: '成語不存在' });
      try {
        const body = await parseBody(req);
        const result = normalizeIdiom({ ...existing, ...body, word });
        if (result.error) return jsonResponse(res, 400, { error: result.error });
        Object.assign(existing, result.value, { updatedAt: new Date().toISOString() });
        await saveData();
        jsonResponse(res, 200, existing);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname === '/api/questions' && method === 'GET') {
      const nodeId = parsedUrl.query.node_id || '';
      const list = idiom.questions
        .filter(question => !nodeId || question.node_id === nodeId)
        .map(question => ({ ...question, mastery: drill.findMastery(userId, question.question_id) }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      jsonResponse(res, 200, list);
      return;
    }

    if (pathname === '/api/questions/export' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      const format = String(parsedUrl.query.format || 'json').toLowerCase();
      if (format !== 'json' && format !== 'csv') {
        return jsonResponse(res, 400, { error: '不支援的匯出格式' });
      }
      const rows = exportQuestions();
      const body = format === 'csv'
        ? exportCsv(rows)
        : JSON.stringify({ idiom_dictionary: idiom.idioms, questions: rows }, null, 2);
      res.writeHead(200, {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="idiom-questions-' + hkDate() + '.' + format + '"',
        'Cache-Control': 'no-store'
      });
      res.end(body);
      return;
    }

    if (pathname === '/api/questions' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = normalizeQuestion(body);
        if (result.error) return jsonResponse(res, 400, { error: result.error });
        ensureIdioms([result.value.correct_option].concat(result.value.distractors), new Map(), false);
        const question = createQuestion(result.value, userId);
        await saveData();
        jsonResponse(res, 201, question);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/questions/') && method === 'PUT') {
      const questionId = pathname.split('/').pop();
      const question = idiom.questions.find(item => String(item.question_id) === String(questionId));
      if (!question) return jsonResponse(res, 404, { error: '題目不存在' });
      try {
        const body = await parseBody(req);
        const result = normalizeQuestion({ ...question, ...body }, idiom.questions.filter(item => item !== question));
        if (result.error) return jsonResponse(res, 400, { error: result.error });
        ensureIdioms([result.value.correct_option].concat(result.value.distractors), new Map(), false);
        Object.assign(question, result.value, { updatedAt: new Date().toISOString() });
        await saveData();
        jsonResponse(res, 200, question);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/questions/') && method === 'DELETE') {
      const questionId = pathname.split('/').pop();
      const index = idiom.questions.findIndex(item => String(item.question_id) === String(questionId));
      if (index < 0) return jsonResponse(res, 404, { error: '題目不存在' });
      idiom.questions.splice(index, 1);
      idiom.mastery = idiom.mastery.filter(record => String(record.question_id) !== String(questionId));
      idiom.taskMastery = idiom.taskMastery.filter(record => String(record.question_id) !== String(questionId));
      await saveData();
      jsonResponse(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/questions/import' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await importBundle(body, user);
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '匯入格式不正確' });
      }
      return;
    }

    if (pathname === '/api/import-prompt' && method === 'GET') {
      const nodeId = parsedUrl.query.node_id || (idiom.nodes[0] && idiom.nodes[0].node_id);
      const node = drill.nodeMap().get(nodeId);
      if (!node) return jsonResponse(res, 404, { error: '成語場景不存在' });
      const count = Math.max(1, Math.min(50, parseInt(parsedUrl.query.count, 10) || 10));
      const prompt = [
        '請圍繞場景節點【' + node.node_id + ' - ' + node.title + '】，為我生成 ' + count + ' 道少兒成語單項選擇題。',
        '',
        '出題要求：',
        '1. 題幹設計：以「以下哪個成語可以用來表達/描寫【……具體生動的兒童生活畫面或情境……】？」為主，也可穿插生活化句子選詞填空。',
        '2. 選項設計：每道題包含 1 個正確答案（correct_word）和 3 個干擾項（distractor_words）。干擾項必須是常見成語，盡量屬於相近維度但語義、感情色彩或適用對象不同。',
        '3. 字典全覆蓋（關鍵）：所有在題目中出現過的成語（包括每一個正確答案和每一個干擾項），都必須在頂層的 idiom_dictionary 陣列中提供完整的詞典解釋卡片數據，確保前端答完題後點擊任意選項都能展示該成語的釋義、拼音、易錯字點睛、褒貶色彩與造句。',
        '4. 嚴格輸出純 JSON 格式，字段結構遵循以下規範：',
        JSON.stringify({
          idiom_dictionary: [{
            word: '四字成語',
            pinyin: '帶聲調拼音',
            meaning: '兒童易懂的白話解釋',
            key_char_note: '核心字或易錯字的古義/本義點撥',
            sentiment: '褒義 | 貶義 | 中性',
            target_object: '適用描寫對象（如：人物神態、建築、天氣等）',
            example: '貼近兒童日常生活的造句'
          }],
          questions: [{
            node_id: node.node_id,
            question_type: 'INTENT',
            stem: '題幹文本',
            highlight_clue: '題幹中最核心的語境提示短語（需與stem中的文字完全一致，用於前端高亮）',
            correct_word: '正確成語',
            distractor_words: ['干擾成語1', '干擾成語2', '干擾成語3'],
            context_guide: '簡短說明為什麼本題選該成語，以及與其他干擾項的區別'
          }]
        }, null, 2)
      ].join('\n');
      jsonResponse(res, 200, { node_id: node.node_id, count, prompt });
      return;
    }

    if (pathname === '/api/admin/tasks' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      jsonResponse(res, 200, drill.adminTaskList());
      return;
    }

    if (pathname === '/api/admin/stats' && method === 'GET') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      jsonResponse(res, 200, drill.buildAdminStats());
      return;
    }

    if (pathname === '/api/tasks' && method === 'GET') {
      jsonResponse(res, 200, drill.taskForUser(userId));
      return;
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      try {
        const body = await parseBody(req);
        const result = await drill.createTasks({ user, body, label: '場景' });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
      const taskId = pathname.split('/')[3];
      try {
        const result = await drill.deleteTasks({ user, taskId });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '刪除任務失敗' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && method === 'PUT') {
      const taskId = pathname.split('/')[3];
      try {
        const body = await parseBody(req);
        const result = await drill.updateTasks({ user, taskId, body, label: '場景' });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/wrong') && method === 'GET') {
      const parts = pathname.split('/');
      const result = drill.taskWrongList({ user, taskId: parts[3] });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (pathname.startsWith('/api/tasks/') && pathname.endsWith('/start') && method === 'POST') {
      const parts = pathname.split('/');
      const result = drill.startTask({ user, taskId: parts[3] });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (pathname.startsWith('/api/rounds/') && pathname.endsWith('/answer') && method === 'POST') {
      const roundId = pathname.split('/')[3];
      try {
        const body = await parseBody(req);
        const result = await drill.answerRound({
          userId,
          roundId,
          optionId: String(body.optionId || ''),
          responseTime: Math.max(0, Math.min(300000, Number(body.responseTime) || 0))
        });
        jsonResponse(res, result.status, result.body);
      } catch (error) {
        jsonResponse(res, 400, { error: '無效的請求' });
      }
      return;
    }

    if (pathname.startsWith('/api/rounds/') && pathname.endsWith('/next') && method === 'POST') {
      const roundId = pathname.split('/')[3];
      const result = drill.nextRound({ userId, roundId });
      jsonResponse(res, result.status, result.body);
      return;
    }

    if (pathname === '/api/stats' && method === 'GET') {
      jsonResponse(res, 200, drill.userStats(userId));
      return;
    }

    jsonResponse(res, 404, { error: 'API Not Found' });
  }

  drill.migrateLegacyTasks();
  drill.migrateTaskMastery();

  return { handleAPI, stats: drill.stats };
}

module.exports = { id: 'idiom', create: createIdiomTool };
