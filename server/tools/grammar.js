const { jsonResponse, parseBody } = require('../core/http');
const { generateId } = require('../core/ids');
const { NODES, QUESTIONS } = require('./grammar-seed');
const { createDrill, hkDate, shuffle } = require('../core/drill');
const { parseCsv, parseImportText, csvCell } = require('../core/csv');

function createGrammarTool({ rootDir, toolDir, db, saveData: storeSave, dataExists, auth }) {
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
    key: 'grammar',
    seed: { nodes: NODES, questions: QUESTIONS },
    seedQuestion: (question, now) => ({
      ...question,
      distractors: question.distractors.slice(),
      status: true,
      createdAt: now
    }),
    seedMessage: '[grammar] 已寫入 15 個語法節點與 60 道起步題',
    optionPayload: question => {
      const options = shuffle([question.correct_option].concat(question.distractors || []));
      const mapped = options.map((text, index) => ({ id: 'o' + index, text }));
      const answer = mapped.find(option => option.text === question.correct_option);
      return { options: mapped, answerId: answer ? answer.id : mapped[0].id };
    },
    questionPayload: (question, node) => ({
      node_id: question.node_id,
      node_title: node.title || question.node_id,
      stem: question.stem,
      highlight_word: question.highlight_word || ''
    }),
    answerPayload: ({ question, node }) => ({
      correctOption: question.correct_option,
      explanation: question.explanation || '',
      ruleTip: node.rule_tip || '',
      highlightWord: question.highlight_word || ''
    }),
    summaryQuestion: question => ({
      question_id: question.question_id,
      stem: question.stem,
      node_id: question.node_id,
      correct_option: question.correct_option
    }),
    targetLabel: '語法點',
    roundPrefix: 'GR_'
  });

  const grammar = drill.data;

  function normalizeQuestion(raw, existingQuestions) {
    const nodes = drill.nodeMap();
    const nodeId = String(raw.node_id || '').trim();
    if (!nodes.has(nodeId)) {
      return { error: '語法節點不存在：' + (nodeId || '空白') };
    }
    const stem = String(raw.stem || '').trim();
    if (!stem) return { error: '缺少題幹' };
    if (stem.indexOf('____') === -1) return { error: '題幹必須用 ____ 標示空格' };
    const correct = String(raw.correct_option || '').trim();
    if (!correct) return { error: '缺少正確選項' };

    let distractors = raw.distractors;
    if (!Array.isArray(distractors)) {
      distractors = [raw.distractor_1, raw.distractor_2, raw.distractor_3];
    }
    distractors = Array.from(new Set(distractors
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .filter(item => item.toLowerCase() !== correct.toLowerCase())));
    if (distractors.length < 2) {
      return { error: '至少需要 2 個不同於正確答案的干擾項' };
    }
    if (distractors.length > 3) distractors = distractors.slice(0, 3);

    const duplicate = (existingQuestions || grammar.questions).find(question => {
      return question.node_id === nodeId && String(question.stem).trim().toLowerCase() === stem.toLowerCase();
    });
    if (duplicate) return { error: '同一語法點已有相同題幹' };

    return {
      value: {
        node_id: nodeId,
        stem,
        highlight_word: String(raw.highlight_word || '').trim(),
        correct_option: correct,
        distractors,
        explanation: String(raw.explanation || '').trim(),
        status: raw.status === false ? false : true
      }
    };
  }

  function createQuestion(value, userId) {
    const question = {
      question_id: 'GQ_' + generateId(new Set(grammar.questions.map(item => item.question_id))),
      ...value,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };
    grammar.questions.push(question);
    return question;
  }

  function exportRows() {
    const nodes = drill.nodeMap();
    return grammar.questions.map(question => {
      const node = nodes.get(question.node_id) || {};
      return {
        node_id: question.node_id,
        node_title: node.title || '',
        node_category: node.category || '',
        stem: question.stem,
        highlight_word: question.highlight_word || '',
        correct_option: question.correct_option,
        distractor_1: (question.distractors || [])[0] || '',
        distractor_2: (question.distractors || [])[1] || '',
        distractor_3: (question.distractors || [])[2] || '',
        explanation: question.explanation || ''
      };
    });
  }

  function exportCsv(rows) {
    const headers = [
      'node_id', 'node_title', 'node_category', 'stem', 'highlight_word',
      'correct_option', 'distractor_1', 'distractor_2', 'distractor_3', 'explanation'
    ];
    const lines = [headers.join(',')];
    rows.forEach(row => {
      lines.push(headers.map(header => csvCell(row[header])).join(','));
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function replaceQuestions(items, userId) {
    const oldByKey = new Map();
    grammar.questions.forEach(question => {
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
        errors.push({ row: index + 1, error: '同一語法點已有相同題幹' });
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
          questionId = 'GQ_' + generateId();
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
    const oldTotal = grammar.questions.length;
    const removed = grammar.questions.filter(question => !newIds.has(String(question.question_id))).length;
    const masteryBefore = grammar.mastery.length;

    grammar.questions = prepared;
    grammar.mastery = grammar.mastery.filter(record => newIds.has(String(record.question_id)));
    grammar.taskMastery = grammar.taskMastery.filter(record => newIds.has(String(record.question_id)));
    const masteryRemoved = masteryBefore - grammar.mastery.length;

    let tasksUpdated = 0;
    let tasksArchived = 0;
    grammar.tasks.forEach(task => {
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
        questionCount: grammar.questions.filter(question => question.status !== false).length
      });
      return;
    }

    if (pathname === '/api/nodes' && method === 'GET') {
      jsonResponse(res, 200, drill.nodesWithStats(userId));
      return;
    }

    if (pathname === '/api/questions' && method === 'GET') {
      const nodeId = parsedUrl.query.node_id || '';
      const list = grammar.questions
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
      const rows = exportRows();
      const body = format === 'csv' ? exportCsv(rows) : JSON.stringify(rows, null, 2);
      res.writeHead(200, {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="grammar-questions-' + hkDate() + '.' + format + '"',
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
      const question = grammar.questions.find(item => String(item.question_id) === String(questionId));
      if (!question) return jsonResponse(res, 404, { error: '題目不存在' });
      try {
        const body = await parseBody(req);
        const result = normalizeQuestion({ ...question, ...body }, grammar.questions.filter(item => item !== question));
        if (result.error) return jsonResponse(res, 400, { error: result.error });
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
      const index = grammar.questions.findIndex(item => String(item.question_id) === String(questionId));
      if (index < 0) return jsonResponse(res, 404, { error: '題目不存在' });
      grammar.questions.splice(index, 1);
      grammar.mastery = grammar.mastery.filter(record => String(record.question_id) !== String(questionId));
      grammar.taskMastery = grammar.taskMastery.filter(record => String(record.question_id) !== String(questionId));
      await saveData();
      jsonResponse(res, 200, { success: true });
      return;
    }

    if (pathname === '/api/questions/import' && method === 'POST') {
      if (user.role !== 'admin') return jsonResponse(res, 403, { error: '需要管理員權限' });
      try {
        const body = await parseBody(req);
        const mode = body.mode === 'replace' ? 'replace' : 'append';
        const items = Array.isArray(body.items) ? body.items : parseImportText(body.text);
        if (!Array.isArray(items) || !items.length) {
          return jsonResponse(res, 400, { error: '找不到可匯入的題目' });
        }
        if (mode === 'replace') {
          if (body.confirm !== true) {
            return jsonResponse(res, 400, { error: '全量覆蓋需要確認' });
          }
          if (items.length > 2000) {
            return jsonResponse(res, 400, { error: '一次最多覆蓋 2000 道題目' });
          }
          const result = replaceQuestions(items, userId);
          if (result.error) {
            return jsonResponse(res, 400, { error: result.error, errors: result.errors });
          }
          await saveData();
          jsonResponse(res, 200, result);
          return;
        }
        if (items.length > 500) {
          return jsonResponse(res, 400, { error: '一次最多匯入 500 道題目' });
        }
        const results = { mode: 'append', added: 0, skipped: 0, errors: [] };
        const seen = new Set(grammar.questions.map(question => question.node_id + '|' + String(question.stem).trim().toLowerCase()));
        items.forEach((raw, index) => {
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
          createQuestion(result.value, userId);
          results.added += 1;
        });
        await saveData();
        jsonResponse(res, 200, results);
      } catch (error) {
        jsonResponse(res, 400, { error: '匯入格式不正確' });
      }
      return;
    }

    if (pathname === '/api/import-prompt' && method === 'GET') {
      const nodeId = parsedUrl.query.node_id || (grammar.nodes[0] && grammar.nodes[0].node_id);
      const node = drill.nodeMap().get(nodeId);
      if (!node) return jsonResponse(res, 404, { error: '語法節點不存在' });
      const prompt = [
        '請扮演一位資深少兒英語老師，針對語法節點【' + node.node_id + '（' + node.title + '）】生成 10 道適合小學階段的英文單項選擇題。',
        '請嚴格按 JSON 陣列格式輸出，不要包含任何多餘解釋文字，每個物件包含以下欄位：',
        '- node_id：固定為 "' + node.node_id + '"',
        '- stem：題幹，挖空處用四個下劃線 "____" 表示',
        '- highlight_word：題幹中的破題關鍵詞（如時間狀語或主語）',
        '- correct_option：正確選項',
        '- distractor_1：干擾項 1',
        '- distractor_2：干擾項 2',
        '- distractor_3：干擾項 3',
        '- explanation：面向小朋友的一句話簡短中文解析'
      ].join('\n');
      jsonResponse(res, 200, { node_id: node.node_id, prompt });
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
        const result = await drill.createTasks({ user, body, label: '語法點' });
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
        const result = await drill.updateTasks({ user, taskId, body, label: '語法點' });
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

module.exports = { id: 'grammar', create: createGrammarTool };
