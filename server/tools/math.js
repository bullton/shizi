const { createDomainQuizTool } = require('../core/quiz-domain');

module.exports = {
  id: 'math',
  create: options => createDomainQuizTool(options, {
    id: 'math',
    domain: 'math',
    title: '數學計算',
    short: '數學',
    icon: 'calc',
    accent: '#1f6f8b',
    targetLabel: '運算',
    roundPrefix: 'MT_',
    seedMessage: '[math] 已寫入數學計算題目'
  })
};
